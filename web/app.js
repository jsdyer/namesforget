import { config } from "./config.js";

const $ = id => document.getElementById(id);
const count = value => new Intl.NumberFormat("en-CA").format(value);
const dateText = value => value ? new Date(value.length === 10 ? value + "T12:00:00Z" : value).toLocaleDateString("en-CA", { dateStyle: "medium", timeZone: "UTC" }) : "Not published";
const query = $("query");
const group = $("group");
const type = $("type");
const sort = $("sort");

let manifest;
let worker;
let latest = 0;
let currentPage = 1;
let timer;
let browse = false;
let currentRows = [];
let mapModule;

function create(tag, text, className) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function link(label, url, className) {
  const anchor = create("a", label, className);
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  return anchor;
}

function button(label, action, className) {
  const control = create("button", label, className);
  control.type = "button";
  control.addEventListener("click", action);
  return control;
}

function renderMap(rows) {
  if (!config.map) return;
  mapModule?.draw($("map"), rows, openRecord);
  $("map-caption").textContent = rows.length ? "Markers show this page of results. Choose a dot or open a record for coordinates." : "Search or select a region to plot places from the archive.";
}

function saveLocation() {
  const state = new URLSearchParams();
  for (const [key, value] of [["q",query.value.trim()],["group", group.value],["type",type.value],["sort",sort.value !== "best" ? sort.value : ""],["browse",browse ? "1" : ""]]) {
    if (value) state.set(key, value);
  }
  const hash = state.toString();
  history.replaceState(null, "", hash ? "#" + hash : location.pathname);
}

function renderIntro() {
  currentRows = [];
  $("status").textContent = "Ready to search";
  $("pages").hidden = true;
  const empty = create("div", null, "panel empty");
  empty.append(
    create("h3", config.introTitle),
    create("p", "Enter at least two characters, choose an example above, or select a filter to start."),
    button("Browse the full index", () => { browse = true; search(); }, "primary")
  );
  $("records").replaceChildren(empty);
  renderMap([]);
}

function showError(message) {
  $("status").textContent = "The index could not be loaded";
  $("pages").hidden = true;
  const error = create("div", null, "panel empty");
  error.append(create("h3", "Try loading the index again"), create("p", message), button("Reload", () => location.reload()), " ", link("Official catalogue ↗", config.source));
  $("records").replaceChildren(error);
}

function search(keepPage = false) {
  clearTimeout(timer);
  if (!manifest || !worker) return;
  if (!keepPage) currentPage = 1;
  const q = query.value.trim();
  const allowed = q.length >= 2 || group.value || type.value || browse;
  latest++;
  saveLocation();
  if (!allowed) return renderIntro();
  const selected = manifest.groups.filter(item => !group.value || group.value === item.id);
  $("status").textContent = "Searching the compiled index…";
  worker.postMessage({
    id: latest, query: q.length >= 2 ? q : "", type: type.value, sort: sort.value, page: currentPage,
    shards: selected.flatMap(item => item.shards),
  });
}

function describe(row) {
  return [row[1], row[3], row[4] ? `${config.dateLabel} ${dateText(row[4])}` : ""].filter(Boolean).join(" · ");
}

function openRecord(row) {
  $("detail-title").textContent = row[0];
  $("detail-meta").textContent = describe(row);
  const fields = [[config.idLabel, row[2]], ...row[5].map((value, index) => [config.fields[index], value])];
  if (config.map && row[6]) fields.push(["Coordinates", `${row[6][0].toFixed(5)}, ${row[6][1].toFixed(5)}`]);
  const details = $("detail-fields");
  details.replaceChildren(...fields.filter(([label, value]) => label && value).flatMap(([label, value]) => [create("dt", label), create("dd", value)]));
  const status = $("detail-status");
  status.textContent = "";
  const actions = $("detail-actions");
  actions.replaceChildren(link(config.officialLabel, config.officialLink(row), "button primary"));
  if (!config.map) actions.append(button("Copy corporation number", async () => {
    try { await navigator.clipboard.writeText(row[2]); status.textContent = "Corporation number copied."; }
    catch { status.textContent = `Corporation number: ${row[2]}`; }
  }));
  if (config.map && row[6]) actions.append(link("Open map ↗", `https://www.openstreetmap.org/?mlat=${row[6][0]}&mlon=${row[6][1]}#map=11/${row[6].join("/")}`, "button"));
  actions.append(button("Copy result search", async () => {
    const url = new URL(location.href);
    url.hash = new URLSearchParams({ q: row[2] }).toString();
    try { await navigator.clipboard.writeText(url.href); status.textContent = "Link copied."; }
    catch { status.textContent = url.href; }
  }));
  const detail = $("detail");
  if (!detail.open) detail.showModal();
}

function render(data) {
  currentPage = data.page;
  currentRows = data.rows;
  $("status").textContent = `${count(data.total)} matching ${data.total === 1 ? "record" : "records"}${data.capped ? " · First 200 pages shown; refine the search to see more" : ""}`;
  $("pages").hidden = data.pages <= 1;
  $("page-info").textContent = `Page ${count(data.page)} of ${count(data.pages)}`;
  $("prev").disabled = data.page <= 1;
  $("next").disabled = data.page >= data.pages;
  const root = $("records");
  root.replaceChildren(...data.rows.map(row => {
    const card = create("article", null, "panel record");
    const title = create("h3");
    title.append(button(row[0], () => openRecord(row)));
    card.append(title, create("p", describe(row), "record-meta"));
    return card;
  }));
  if (!data.total) {
    const empty = create("div", null, "panel empty");
    empty.append(create("h3", "No records match"), create("p", "Try fewer words or clear the filters."), button("Clear filters", reset));
    root.append(empty);
  }
  renderMap(data.rows);
}

function reset() {
  group.value = "";
  type.value = "";
  sort.value = "best";
  query.value = "";
  browse = false;
  search();
  query.focus();
}

query.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(search, 130);
});
for (const control of [group,type,sort]) control.addEventListener("change", () => search());
$("search-form").addEventListener("submit", event => { event.preventDefault(); search(); });
$("clear").addEventListener("click", reset);
$("prev").addEventListener("click", () => { currentPage--; search(true); });
$("next").addEventListener("click", () => { currentPage++; search(true); });
$("choices").append(...config.examples.map(item => button(item[0], () => {
  group.value = item[2] || "";
  type.value = "";
  query.value = item[1];
  search();
  query.focus();
})));

async function init() {
  const response = await fetch("./data/manifest.json");
  if (!response.ok) throw new Error(`Manifest request failed: HTTP ${response.status}`);
  manifest = await response.json();
  if (manifest.version !== 1 || !manifest.count || !Array.isArray(manifest.groups)) throw new Error("Invalid snapshot manifest.");
  $("total").textContent = count(manifest.count);
  $("built").textContent = dateText(manifest.built);
  for (const item of manifest.sources) {
    const row = create("li");
    row.append(link(item.label, item.url), create("span", item.updated ? ` · ${dateText(item.updated)}` : " · date not published"));
    $("sources").append(row);
  }
  for (const item of manifest.groups) group.add(new Option(`${item.label} (${count(item.count)})`, item.id));
  for (const item of manifest.types) type.add(new Option(item, item));
  type.disabled = false;
  group.disabled = false;
  const params = new URLSearchParams(location.hash.slice(1));
  query.value = (params.get("q") || "").slice(0, 180);
  group.value = params.get("group") || "";
  type.value = params.get("type") || "";
  sort.value = params.get("sort") || "best";
  if (sort.selectedIndex === -1) sort.value = "best";
  browse = params.get("browse") === "1";
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.addEventListener("message", ({ data }) => {
    if (data.id !== latest) return;
    if (data.error) return showError(data.error);
    if (data.progress) {
      $("status").textContent = `Searching data · ${data.progress} of ${data.files} files ready`;
      return;
    }
    render(data);
  });
  worker.addEventListener("error", () => showError("Your browser could not start the search worker."));
  search();
  if (config.map) import("./map.js").then(module => {
    mapModule = module;
    renderMap(currentRows);
  }).catch(() => { $("map-caption").textContent = "Map unavailable. Open an individual record for coordinates."; });
}

init().catch(error => showError(error.message));
