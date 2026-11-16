const svgNamespace = "http://www.w3.org/2000/svg";
const create = name => document.createElementNS(svgNamespace, name);
const outline = await fetch(new URL("./map-outline.json", import.meta.url)).then(response => {
  if (!response.ok) throw new Error("No map outline");
  return response.json();
});

const width = 350;
const height = 190;
// Equal display scale around the atlas centre. A reference dot is not a surveyed boundary.
const place = (lon, lat) => [12 + (lon + 150) * 3.06, 8 + (85 - lat) * 3.65];

function pathFor(polygon) {
  return polygon.map(ring => ring.map(([lon, lat], index) => {
    const [x, y] = place(lon, lat);
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join("") + "Z").join("");
}

const countries = outline.features.flatMap(({ geometry }) => {
  const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  return polygons.map(pathFor);
});

export function draw(target, rows, select) {
  target.replaceChildren();
  target.setAttribute("viewBox", `0 0 ${width} ${height}`);
  for (const data of countries) {
    const path = create("path");
    path.setAttribute("d", data);
    path.setAttribute("fill", "#c0d2ac");
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("stroke", "#758b71");
    path.setAttribute("stroke-width", ".55");
    target.append(path);
  }
  for (const row of rows) {
    if (!row[6]) continue;
    const [lat, lon] = row[6];
    const [x, y] = place(lon, lat);
    if (x < 0 || x > width || y < 0 || y > height) continue;
    const dot = create("circle");
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", y);
    dot.setAttribute("r", 4.5);
    dot.setAttribute("class", "place-dot");
    dot.setAttribute("tabindex", "0");
    dot.setAttribute("role", "button");
    dot.setAttribute("aria-label", row[0]);
    const tooltip = create("title");
    tooltip.textContent = row[0];
    dot.append(tooltip);
    dot.addEventListener("click", () => select(row));
    dot.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select(row);
      }
    });
    target.append(dot);
  }
}
