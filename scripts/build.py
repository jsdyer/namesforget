#!/usr/bin/env python3
"""Build a map and search index from Natural Resources Canada's weekly CSV extracts."""
import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import date
from io import TextIOWrapper
import math
from pathlib import Path
import tempfile
from zipfile import BadZipFile, ZipFile

from packing import clean, day, digest, download, finish, normalize, output_path, pack, prepare

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://ftp.maps.canada.ca/pub/nrcan_rncan/vector/geobase_cgn_toponyme/prov_csv_eng/"
SOURCES = (
    ("canada.zip", "cgn_canada_csv_eng.zip", "Canada CSV", 100000),
    ("undersea.zip", "cgn_uf_csv_eng.zip", "Undersea features CSV", 100),
)
PROVINCES = {
    "Alberta": "ab", "British Columbia": "bc", "Manitoba": "mb", "New Brunswick": "nb",
    "Newfoundland and Labrador": "nl", "Northwest Territories": "nt", "Nova Scotia": "ns",
    "Nunavut": "nu", "Ontario": "on", "Prince Edward Island": "pe", "Quebec": "qc",
    "Saskatchewan": "sk", "Yukon": "yt",
}
COLUMNS = (
    "CGNDB ID", "Geographical Name", "Language", "Syllabic Form", "Generic Term",
    "Generic Category", "Concise Code", "Toponymic Feature ID", "Latitude", "Longitude",
    "Location", "Province - Territory", "Decision Date", "Source",
)


def position(lat, lon):
    try:
        y, x = float(lat), float(lon)
        if math.isfinite(y) and math.isfinite(x) and -90 <= y <= 90 and -180 <= x <= 180:
            return [round(y, 6), round(x, 6)]
    except (TypeError, ValueError):
        pass
    return None


def read_archive(path, region_rows, lookup_regions, seen, undersea):
    with ZipFile(path) as archive:
        contents = [item for item in archive.infolist() if item.filename.lower().endswith(".csv")]
        if len(contents) != 1 or contents[0].file_size > 300_000_000:
            raise ValueError(f"Expected one suitable CSV in {path.name}.")
        csv_member = contents[0]
        source_date = date(*csv_member.date_time[:3]).isoformat()
        source_count = 0
        with archive.open(csv_member) as raw, TextIOWrapper(raw, encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            if not reader.fieldnames or set(COLUMNS).difference(reader.fieldnames):
                raise ValueError(f"Unexpected geographical names CSV schema in {path.name}.")
            for row in reader:
                if None in row or any(row.get(field) is None for field in COLUMNS):
                    raise ValueError(f"Malformed geographical names row {reader.line_num} in {path.name}.")
                ref, name, language, syllables, feature, category, concise, feature_id, lat, lon, locality, region, decision, publisher = (
                    clean(row[field]) for field in COLUMNS
                )
                if not ref or not name:
                    continue
                source_count += 1
                if ref in seen:
                    continue
                seen.add(ref)
                region = region or ("Undersea features" if undersea else "Region not listed")
                group_id = PROVINCES.get(region, "undersea" if undersea else "other")
                lookup_regions.setdefault(group_id, region if group_id != "other" else "Other / multiple regions")
                label = ", ".join(part for part in (locality, region) if part)
                details = [category, language if language != "Undetermined" else "", syllables, publisher, feature_id, concise]
                feature = feature or "Type not listed"
                decision = day(decision)
                lookup = normalize(name, ref, label, feature, category, concise, syllables, language, decision)
                region_rows[group_id].append([name, label, ref, feature, decision, details, position(lat, lon), lookup])
        return source_count, source_date


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", type=Path, help="Use local canada.zip and undersea.zip official downloads.")
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    try:
        output = output_path(args.output, ROOT)
        if args.inputs and args.inputs.resolve().is_relative_to(output):
            raise ValueError("Keep input ZIP files outside the output directory.")
        with tempfile.TemporaryDirectory(prefix="geographical-names-", dir=output.parent) as temp:
            scratch = Path(temp)
            staging = scratch / "site"
            prepare(ROOT, staging)
            region_rows = defaultdict(list)
            regions = {}
            seen = set()
            sources = []
            with ThreadPoolExecutor(max_workers=2) as pool:
                jobs = {
                    file: pool.submit(download, BASE + remote, scratch / file, args.inputs)
                    for file, remote, label, minimum in SOURCES
                }
                for file, remote, label, minimum in SOURCES:
                    bundle, updated = jobs[file].result()
                    count, inside_date = read_archive(bundle, region_rows, regions, seen, file == "undersea.zip")
                    print(f"{label}: {count:,} source rows", flush=True)
                    if count < minimum:
                        raise ValueError(f"{label} appears incomplete.")
                    sources.append({"label": label, "url": BASE + remote, "updated": updated or inside_date,
                                    "sha256": digest(bundle)})
            packed = []
            types = set()
            for group, label in sorted(regions.items(), key=lambda pair: pair[1]):
                rows = region_rows[group]
                packed.append(pack(staging, group, label, rows))
                types.update(row[3] for row in rows)
            finish(output, staging, packed, types, sources)
    except (RuntimeError, OSError, ValueError, BadZipFile, csv.Error) as error:
        parser.exit(1, f"Build failed: {error}\n")


if __name__ == "__main__":
    main()
