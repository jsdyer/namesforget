const cache = new Map();
let request = 0;
const size = 18;
const maximumRows = 3600;
const maximumCachedFiles = 8;
const alphabetic = new Intl.Collator("en-CA", { sensitivity: "base", numeric: true });

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function terms(query) {
  return [...query.matchAll(/"([^"]+)"?|([^\s"]+)/gu)]
    .map(match => normalize(match[1] || match[2])).filter(Boolean);
}

async function shard(file) {
  if (cache.has(file)) {
    const entry = cache.get(file);
    cache.delete(file);
    cache.set(file, entry);
    return entry;
  }
  {
    const work = (async () => {
      const reply = await fetch(new URL(`./data/${file}`, import.meta.url), { signal: AbortSignal.timeout(60000) });
      if (!reply.ok) throw new Error(`Data request failed: HTTP ${reply.status}`);
      const bytes = new Uint8Array(await reply.arrayBuffer());
      if (bytes[0] === 31 && bytes[1] === 139) {
        return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json();
      }
      return JSON.parse(new TextDecoder().decode(bytes));
    })();
    cache.set(file, work);
    work.catch(() => { if (cache.get(file) === work) cache.delete(file); });
    while (cache.size > maximumCachedFiles) cache.delete(cache.keys().next().value);
    return work;
  }
}

function project(rows, total, data, page) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.max(1, Math.min(pages, page));
  const first = (current - 1) * size;
  postMessage({ id: data.id, rows: rows.slice(first, first + size), total, capped: total > rows.length, page: current, pages });
}

let previous;
async function run(data) {
  const id = ++request;
  const key = JSON.stringify([data.shards, data.query, data.type, data.sort]);
  if (previous?.key === key) {
    project(previous.rows, previous.total, data, data.page);
    return;
  }
  const words = terms(data.query);
  const phrase = normalize(data.query.replaceAll('"', ""));
  const relevance = row => !phrase ? 0 : row[7].startsWith(phrase) || row[2].toLowerCase() === phrase ? 1 : 0;
  const compare = (a, b) =>
    (data.sort === "oldest" ? (a[4] || "9999").localeCompare(b[4] || "9999") : 0) ||
    (data.sort === "newest" ? (b[4] || "").localeCompare(a[4] || "") : 0) ||
    (data.sort === "best" ? relevance(b) - relevance(a) : 0) ||
    alphabetic.compare(a[0], b[0]) || a[2].localeCompare(b[2]);
  let bestRecords = [];
  let total = 0;
  let cursor = 0;
  let retrieved = 0;
  async function processFiles() {
    while (cursor < data.shards.length && id === request) {
      const file = data.shards[cursor++];
      const rows = await shard(file);
      if (id !== request) return;
      const groupResults = [];
      for (const row of rows) {
        if (data.type && data.type !== row[3]) continue;
        const haystack = row[7];
        if (!words.every(word => haystack.includes(word))) continue;
        groupResults.push(row);
      }
      total += groupResults.length;
      const bestInGroup = groupResults.sort(compare).slice(0, maximumRows);
      bestRecords = bestRecords.concat(bestInGroup).sort(compare).slice(0, maximumRows);
      postMessage({ id: data.id, progress: ++retrieved, files: data.shards.length });
    }
  }
  await Promise.all(Array.from({ length: 4 }, processFiles));
  if (id !== request) return;
  previous = { key, rows: bestRecords, total };
  project(bestRecords, total, data, data.page);
}

onmessage = ({ data }) => run(data).catch(error => {
  postMessage({ id: data.id, error: error instanceof Error ? error.message : "Could not read the data" });
});
