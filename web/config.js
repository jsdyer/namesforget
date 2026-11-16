const source = "https://open.canada.ca/data/en/dataset/e27c6eba-3c5d-4051-9db2-082dc6411c2c";
export const config = {
  source,
  map: true,
  introTitle: "Find a geographical name",
  idLabel: "CGNDB unique key",
  dateLabel: "Decision",
  fields: ["Feature category", "Name language", "Syllabic form", "Naming authority", "Toponymic feature ID", "Concise code"],
  officialLabel: "Natural Resources Canada name lookup ↗",
  officialLink: row => `https://geonames.nrcan.gc.ca/search-place-names/search?${new URLSearchParams({ id: row[2], category: "O" })}`,
  examples: [
    ["Sable Island", '"Sable Island"', "ns"],
    ["Head-Smashed-In", '"Head-Smashed-In"', "ab"],
    ["Deadman", "deadman", ""],
    ["Northern landings", "landing", "nt"],
    ["Undersea features", "", "undersea"],
    ["Portages", "portage", ""],
  ],
};
