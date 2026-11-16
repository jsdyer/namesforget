"""Download and package source data without HTTP dependencies or a build framework."""
import datetime as dt
import gzip
import hashlib
import json
from email.utils import parsedate_to_datetime
from pathlib import Path
import re
import shutil
import time
import unicodedata
from urllib.parse import urlparse
from urllib.request import Request, urlopen

CHUNK = 30000


def normalize(*parts):
    text = " ".join(str(part) for part in parts).lower()
    text = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^\w]+|_", " ", text).split())


def clean(value):
    return " ".join((value or "").split())


def day(value):
    try:
        return dt.date.fromisoformat(value[:10]).isoformat()
    except (TypeError, ValueError):
        return ""


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def download(source, path, local):
    """Check both Content-Length and source format before using the snapshot."""
    if local:
        staged = local / path.name
        if not staged.is_file():
            raise ValueError(f"Missing local source: {staged}")
        return staged, None
    for attempt in range(3):
        try:
            request = Request(source, headers={"User-Agent": "CoolCode archive snapshot builder/1.0"})
            with urlopen(request, timeout=70) as response, path.open("wb") as stream:
                if urlparse(response.url).scheme != "https" or response.headers.get_content_type().startswith("text/html"):
                    raise ValueError(f"Unexpected download response for {source}")
                shutil.copyfileobj(response, stream, length=1024 * 1024)
                byte_count = response.headers.get("Content-Length")
                if byte_count and path.stat().st_size != int(byte_count):
                    raise ValueError(f"Incomplete download of {source}")
                modified = response.headers.get("Last-Modified")
                updated = parsedate_to_datetime(modified).date().isoformat() if modified else None
                return path, updated
        except (OSError, ValueError) as error:
            if attempt == 2:
                raise RuntimeError(f"Could not fetch {source}: {error}") from error
            print(f"Retrying {source}: {error}", flush=True)
            time.sleep(2 ** attempt)


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def prepare(root, staging):
    shutil.copytree(root / "web", staging)
    (staging / "data").mkdir()


def pack(staging, group, label, rows):
    files = []
    for offset in range(0, len(rows), CHUNK):
        name = f"{group}-{offset // CHUNK + 1:03d}.json.gz"
        with (staging / "data" / name).open("wb") as out:
            payload = json.dumps(rows[offset:offset + CHUNK], ensure_ascii=False, separators=(",", ":"))
            out.write(gzip.compress(payload.encode(), compresslevel=5, mtime=0))
        files.append(name)
    return {"id": group, "label": label, "count": len(rows), "shards": files}


def finish(output, staging, groups, types, sources, extra=None):
    total = sum(group["count"] for group in groups)
    if total == 0:
        raise ValueError("The source contained no usable records.")
    manifest = {"version": 1, "count": total, "groups": groups, "types": sorted(types, key=str.casefold),
                "sources": sources, "built": dt.datetime.now(dt.timezone.utc).isoformat()}
    if extra:
        manifest.update(extra)
    write(staging / "data" / "manifest.json", manifest)
    if output.exists():
        shutil.rmtree(output)
    staging.replace(output)
    size = sum(p.stat().st_size for p in (output / "data").glob("*.gz"))
    print(f"{total:,} records · {len(groups)} groups · {size / 2**20:.1f} MiB compressed")


def output_path(argument, root):
    result = argument.resolve()
    # Only replace a dedicated build directory. Protect project source and download inputs.
    if result == root or result in root.parents or result == root / "web" or root / "web" in result.parents:
        raise ValueError("Choose a dedicated output directory outside web/.")
    result.parent.mkdir(parents=True, exist_ok=True)
    return result
