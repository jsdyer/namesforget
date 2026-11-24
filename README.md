# Names That Time Forgot

<!-- coolcode:guide -->
Choose a province, territory or undersea area and search a name, feature type or reference locality. Map points are published reference coordinates rather than boundaries or entrances; use the official lookup to investigate historical name status.
<!-- /coolcode:guide -->

A browser-only atlas of the current official geographical names maintained by Natural Resources Canada. Search by name, feature type, reference locality, government-assigned key, or language label. Filter by province, territory or undersea area, and open a record for source coordinates and naming information. The map shows plottable results on the current page. Its dots represent reference coordinates, not a feature boundary or directions to an entrance.

The [Canadian Geographical Names catalogue](https://open.canada.ca/data/en/dataset/e27c6eba-3c5d-4051-9db2-082dc6411c2c) links to the [official weekly zipped CSV exports](https://ftp.maps.canada.ca/pub/nrcan_rncan/vector/geobase_cgn_toponyme/prov_csv_eng/). This app uses the English-labelled national and undersea releases, preserves original name spellings and syllabic forms, and deduplicates by CGNDB unique key. Use the official lookup to explore historical name status. Names in this snapshot do not establish historical or current abandonment. Natural Resources Canada warns that the source contains some offensive historical terminology.

```sh
python3 scripts/build.py
python3 -m http.server --directory dist 8000
```

Open http://127.0.0.1:8000/. Python 3.11+ is used at build time. The runtime uses a recent browser's worker and gzip decompression support. Use `--inputs` with `canada.zip` and `undersea.zip` from the official sources to reproduce a specific snapshot. The manifest records source file hashes and dates.

GitHub Actions runs the official download and build on each deployment. The build writes compressed data shards grouped by area to `dist/data/`; visitors download only the needed area when a region is selected. The raw source ZIP and generated output stay outside Git. A failed download or malformed CSV stops deployment before replacing the previous site.

Contains information licensed under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada/). Source: Natural Resources Canada. Base map outlines are [public-domain Natural Earth data](https://www.naturalearthdata.com/about/terms-of-use/).

<!-- schedule-reliability -->
## Schedule reliability

Public GitHub repositories can have scheduled workflows disabled after 60 days of inactivity. A separate weekly [schedule guard](.github/workflows/schedule-guard.yml) calls GitHub's enable-workflow API for an explicit list of refresh workflows and itself. It can restore workflows disabled for inactivity, preserves manually disabled workflows, and runs independently of collection failures.

This is an interim mitigation, not a scheduling guarantee: GitHub does not document active-workflow renewal as a permanent exemption, and scheduled runs can be delayed or dropped. A scheduler on our own Linux server is the planned independent trigger. The guard does not collect data, create dummy commits, or change source/check timestamps; successful collection and published data freshness still need monitoring.
<!-- /schedule-reliability -->
