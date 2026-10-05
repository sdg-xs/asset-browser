# Browser IFC verification

Measured locally on 2026-10-05 using Chrome through Playwright CLI, Node 24.19.0 and the pinned npm packages. The minimal test interface is `/validation.html`; Task 3 supplies the catalog UI.

## Automated checks

- `npm test`: 36 passing tests (26 service tests; four catalog policy tests; five actual IFC-reader tests; one viewer lifecycle test).
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

These timings are individual local measurements, not a benchmark or a first-painted-frame measurement. Browser process memory was subsequently sampled during the lifecycle below; exact per-worker memory is not available from those process measurements. HG62 and other sources were not parsed. The production viewer bundle is about 6.26 MB uncompressed (1.14 MB gzip); Vite reports its size warning because Components includes its compatible Fragments dependencies. Geometry is generated only for the selected occurrence.

Statistics form disjoint outcomes: classification suppression is counted before missing-type checks. Conflicting classification properties and unsupported classification property kinds fail explicitly with property-set IDs, rather than guessing a category. General property inspection displays scalar/list/enumerated Pset values; other property kinds are identified as unsupported scalar values, and quantity sets are not expanded. Geometry failures allow the caller to try another occurrence. The validation page implements that fallback and guards asynchronous selections with a generation counter.

`IfcWorkerClient` exposes `openModel({ model, fileUrl, onProgress })`, `readProperties({ modelId, elementId })`, `readGeometry({ modelId, elementId })`, and `dispose()`. `onProgress` receives text. Opening another source terminates all previous work. The client reuses an already open source only for identical model ID and fingerprint. A cached index alone is insufficient for inspection: call `openModel` before inspecting. `dispose()` cancels and releases the worker and remains reusable for retries. UI code must ignore stale promises after selection changes. `<AssetViewer geometry={geometry} />` owns its That Open world, resize observation, fit/orbit controls and resource cleanup.

## Review fixes and browser memory, 2026-10-05

The reader now resolves an occurrence's category before considering its type category. Invalid type classifications only fail when an occurrence actually needs that fallback. Two actual IFC regression cases cover conflicting and unsupported type properties with explicit occurrence overrides, including blank and NA exclusions. A real Components lifecycle test reproduces renderer construction failure and verifies that partial scene/world cleanup permits unmount and retry. The world factory releases allocated resources and removes an incomplete world before normal Components disposal. `npm test` now passes 36 tests across five files; strict typecheck and production build pass. The Node-only Components test emits its dependency's Three CommonJS deprecation warning.

Memory collection used a fresh Playwright CLI Chrome session, `asset-memory`, at the production `/validation.html`. Browser CDP `SystemInfo.getProcessInfo` returned only processes owned by that session. For every sample, the PowerShell collector fetched that list again, checked each process name was Chrome, then read Windows `PrivateMemorySize64` and `WorkingSet64` only for those IDs. Browser PID 12348 belonged to CLI PID 30064 and used a temporary Playwright profile. The scope included its browser, three renderers, GPU, network and storage processes. It excluded the local Node service and all other Chrome sessions.

| Phase | Samples | Maximum private MiB | Last private MiB | Maximum working-set MiB | Last working-set MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before opening BS19 | 3 | 261.0 | 261.0 | 485.4 | 485.4 |
| First indexing through ready | 18 | 689.9 | 683.8 | 921.0 | 913.1 |
| Retained source and rendered preview | 5 | 740.9 | 736.9 | 933.0 | 931.5 |
| After source switch disposed worker/viewer | 8 | 366.8 | 327.7 | 568.2 | 550.7 |
| Second open before cancellation | 2 | 649.4 | 649.4 | 890.0 | 890.0 |
| After cancellation during parser opening | 8 | 662.2 | 282.0 | 902.6 | 532.3 |
| Retry indexing through ready | 18 | 708.7 | 696.7 | 948.5 | 932.7 |
| Retry rendered preview | 3 | 745.6 | 739.5 | 940.3 | 934.9 |
| After retry source switch/disposal | 6 | 376.2 | 346.7 | 580.6 | 554.1 |

The sampler waited 500 ms between CLI/CDP/OS collection calls; actual sample intervals were approximately 1.4 seconds. Values are sampled process totals, not guaranteed peaks. Private bytes measure committed process allocations. Working sets measure resident process pages and their sum can double-count shared pages. GPU memory outside process accounting is not measured. The main page and dedicated worker share a renderer, so these numbers cannot isolate worker memory. No main-thread heap measurement is presented as whole-browser memory, and no forced garbage collection was used.

The renderer with most IFC-related growth, PID 8856, changed from 58.0 MiB private at baseline to 477.1 MiB during retry inspection and 81.3 MiB after disposal. The GPU process changed from 82.8 to 144.3 MiB between baseline and final disposal. The overall footprint fell substantially after each disposal/cancellation, with a brief delay after worker termination. Residual process memory and the short observation window prevent a leak-free claim or a promise about repeated long sessions.

During this run, first indexing took 13,412.1 ms and retry indexing took 13,521.9 ms. Geometry/property requests took 73.5 ms and 50.4 ms. Both produced the same 9,204-element counts, 1,019 types, 107 categories, two sensor meshes, 954 triangles and 15 property groups. Final console output was zero errors and warnings. Source selection to BS17 was used only to dispose BS19; BS17 was not parsed.

Local artifacts under `output/playwright/`: `measure-browser-memory.ps1`, `bs19-browser-memory.jsonl`, `bs19-browser-memory-summary.json`, `memory-browser-process.json`, `memory-run-render-metrics.txt`, `memory-retry-render-metrics.txt`, and `bs19-fix1-representative.png`. The JSONL retains each sample's status, timestamps, PID/type and byte counts.
