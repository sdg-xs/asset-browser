# Browser IFC verification

Measured locally on 2026-10-05 using Chrome through Playwright CLI, Node 24.19.0 and the pinned npm packages. The minimal test interface is `/validation.html`; Task 3 supplies the catalog UI.

## Automated checks

- `npm test`: 33 passing tests (26 service tests; four catalog policy tests; three actual IFC-reader tests).
- `npm run build`: strict TypeScript, server compilation and production Vite build pass.
- Catalog tests first failed because `catalog.ts` did not exist. Actual IFC-reader tests first failed because `reader.ts` did not exist. The real fixture additionally caught the published `FlatMesh.delete()` declaration mismatch and malformed-header parser error; both are corrected.
- `tests/fixtures/assets.ifc` is an IFC4 STEP model with project/building structure, SI metre units, owner history, five physical proxy occurrences, type/property relations and extruded solids. Real web-ifc parsing verifies instance precedence, type fallback, unrelated-Pset exclusion, blank/NA suppression, type grouping, read-only properties and nonempty occurrence geometry.

## BS19 real browser results

Source: `C:/Users/StevenGomba/OneDrive - HEMY AS/Desktop/Omniverse Working Files/PROPERTIES/BS19/IFC/BS19.ifc`, 122,676,603 bytes.

| Measurement | Result |
| --- | --- |
| Development fetch + worker initialization + indexing | 17,768.6 ms |
| Production build first completed indexing run | 20,779.6 ms |
| Final production build indexing run | 15,153.3 ms |
| Physical `IFCELEMENT` population, including subclasses | 9,204 |
| Classified and reliably typed occurrences | 4,938 |
| Excluded absent/blank/NA effective classification | 4,187 |
| Classified occurrences missing an unambiguous type | 79 |
| Type cards, grouped by model ID and IFC type GlobalId | 1,019 |
| Distinct category strings (case preserved) | 107 |
| Selected occurrence mesh + property request round-trip | 80.8 ms |
| Final production mesh + property request round-trip | 96.6 ms |
| Selected occurrence geometry | 2 meshes, 954 triangles |
| Selected occurrence property groups | 15 |
| Transformed preview bounds, metres | 0.058645 × 0.081774 × 0.085005 |

The known type GlobalId `0iEspr7ox$PCrl9h2pzQQO` is present, named `Air-Quality_CO2-Sensor:Airthings-Space-Mini_80mm_Indoor`, class `IFCCOMMUNICATIONSAPPLIANCETYPE`, category `Air quality sensor`. Its occurrence IDs are `1118159`, `1118216`, `1118323`; the deterministic first representative is `1118159`. Instance `Identity Data` contains the real classification and asset name. Type identity includes Express ID `1118152` and the expected GlobalId.

The screenshot was visually inspected and shows the sensor mesh. Original IFC piece transforms, colours and metre scaling are preserved, then the assembled asset is recentered for viewing. The dimensions are consistent with the source's 80 mm sensor name. Fit control was clicked successfully. No server parsing or full-building geometry conversion runs.

Artifacts, retained locally under ignored `output/playwright/`:

- `bs19-representative.png`: visible real sensor geometry.
- `bs19-properties.png`: full-page catalog metrics and actual properties.
- `production-snapshot.txt`: production catalog/type evidence.
- `bs19-production-metrics.txt`: final production counts, timings, type identity, meshes and properties.
- `bs19-production-representative.png` and `bs19-production-orbit.png`: final production render and orbit interaction.

The initial development browser session had one unrelated `/favicon.ico` 404, corrected by a data favicon on the validation page. No IFC parser, worker, WebGL or application errors occurred on successful BS19 processing. The final production run had zero console messages, errors or warnings. Production cancellation terminated an active indexing run and displayed "Cancelled. You can retry." Retrying successfully produced the same counts. Local production worker JavaScript and WASM returned HTTP 200 from the existing file service's `dist` assets.

## Limits and integration notes

These timings are individual local measurements, not a benchmark or a first-painted-frame measurement. Whole-browser/worker peak memory was not measured. HG62 and other sources were not parsed. The production viewer bundle is about 6.26 MB uncompressed (1.14 MB gzip); Vite reports its size warning because Components includes its compatible Fragments dependencies. Geometry is generated only for the selected occurrence.

Statistics form disjoint outcomes: classification suppression is counted before missing-type checks. Conflicting classification properties and unsupported classification property kinds fail explicitly with property-set IDs, rather than guessing a category. General property inspection displays scalar/list/enumerated Pset values; other property kinds are identified as unsupported scalar values, and quantity sets are not expanded. Geometry failures allow the caller to try another occurrence. The validation page implements that fallback and guards asynchronous selections with a generation counter.

`IfcWorkerClient` exposes `openModel({ model, fileUrl, onProgress })`, `readProperties({ modelId, elementId })`, `readGeometry({ modelId, elementId })`, and `dispose()`. `onProgress` receives text. Opening another source terminates all previous work. The client reuses an already open source only for identical model ID and fingerprint. A cached index alone is insufficient for inspection: call `openModel` before inspecting. `dispose()` cancels and releases the worker and remains reusable for retries. UI code must ignore stale promises after selection changes. `<AssetViewer geometry={geometry} />` owns its That Open world, resize observation, fit/orbit controls and resource cleanup.
