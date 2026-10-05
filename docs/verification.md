# Browser IFC verification

Measured locally on 2026-10-05 using Chrome through Playwright CLI, Node 24.19.0 and the lockfile-pinned npm packages. The production catalog is `/`. Task 2's temporary `/validation.html` entry has been removed; its historical measurements below remain applicable to the parser/viewer revision tested at that time.

## Production catalog delivery

The final React workspace uses local IBM Plex Sans fonts and Lucide icons, real source inventories, category/search filters, grid/list results, and a lazy-loaded inspector. Cards contain real metadata and neutral placeholders. The app owns one IFC worker, serializes inspection requests, disposes it on source changes/removal, and guards progress, indexes and inspections against stale completions. Cached indexes populate results immediately; inspection still opens the correct source. Preview failures preserve the catalog and allow retry. Properties correspond to the occurrence actually previewed after geometry fallback.

Final checks: `npm test` passes 43 tests across six files, `npm run typecheck` passes, and `npm run build` passes. The seven catalog tests in `tests/library-ui.test.tsx` cover supplied-record filtering/list/category/property interactions, empty inventory, indexing failures/retry, late inspection closure, late indexing after removal, removal failure recovery, and reopening a source after a worker failure. The last two regressions were observed RED before their corrections: no Retry processing control after removal failure; then one source open instead of two after inspection retry. Both pass after correcting their lifecycle paths. jsdom lacks native dialog methods, so those methods alone are substituted in DOM tests; actual modal focus/close behavior was checked in Chrome. Worker responses are controlled in interaction tests; the real parser and viewer have separate tests and browser checks.

The production browser run used `http://127.0.0.1:3002` and isolated `IFC_DATA_ROOT=output/task3-library-data`, with one service writer. Existing processes on ports 3001 and 5173 and existing managed storage were left intact. Invocation was `node C:/Users/StevenGomba/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/@playwright/cli/playwright-cli.js -s=asset-task3 open http://127.0.0.1:3002 --browser chrome`. Normal interactions used snapshot references through `click`, `fill`, `select`, and `upload`; there is no generated Playwright test suite.

The fresh source inventory contained nine models. Initial BS19 indexing produced 1,019 types, 107 categories, 4,938 classified occurrences, 4,187 excluded occurrences and 79 untyped occurrences. The Air quality sensor category reduced the results to one type with three occurrences. Searching Airthings and switching to list mode preserved the result. Selection displayed 15 source property groups plus the type identity panel. The real representative #1118159 rendered two meshes and 954 triangles, with bounds 0.0586447 × 0.0817735 × 0.0850051 metres. Its `Generic Hard Asset` is Air quality sensor and `Asset Name` is Air quality sensor-1.2.BS19. Actual SDK geometry was visible in screenshots.

Desktop 1440×1000 and narrow 390×844 screenshots were inspected. Neither viewport had horizontal document overflow. The narrow inspector filled the viewport below the header, and closing it returned to the filtered list. Category navigation collapses behind a labeled toggle. Dialogs use native modal behavior, restore opener focus, and expose validation/status messages. The inspector receives keyboard focus on selection and supports Escape. Reduced motion disables animation.

Persistence sequence used a 3,066-byte copy of `tests/fixtures/assets.ifc`, named `task3-persistence.ifc`, uploaded through the UI. The service assigned ID `23dcd29c-157f-4d62-9e8d-045511be22d0`; indexing produced one type with two occurrences, two excluded occurrences and one untyped occurrence. After service restart, the upload and saved index remained in the inventory. Selecting its cached card opened the correct uploaded source and rendered its cuboid and properties. Removing it through the confirmation dialog, restarting again and reloading restored nine visible models with no uploaded test entry. The persisted record remained hidden, its file still existed, and both uploaded and fixture SHA-256 values were `94FDF0489FD376EFFD2865055B9A80AF9E9BFDD858C9A375C028AE93CD9FF57A`.

An invalid `.ifc` text upload returned HTTP 400 and displayed "Upload a complete STEP IFC file with an IFC schema header." It did not add a model. The successful catalog and inspection run had zero console errors or warnings. The intentional invalid upload produced the expected failed-resource HTTP 400 console entry; subsequent successful reload/inspection had zero messages. Recorded API responses include file/WASM/index HTTP 200, valid upload HTTP 201, and invalid upload HTTP 400. No unexpected parser or WebGL errors were observed. A source selection after removal briefly chose BS17 during verification; the final selection policy now prefers BS19 or another cached source. That incidental run is not claimed as broader model validation.

Local evidence in ignored `output/playwright/`: `task3-desktop-catalog.png`, `task3-desktop-inspector.png`, `task3-mobile-catalog.png`, `task3-mobile-inspector.png`, `task3-invalid-upload.png`, `task3-upload-after-restart.png`, `task3-restart1-snapshot.yml`, `task3-upload-record.json`, `task3-persistence-evidence.json`, `task3-requests.txt`, `task3-console.txt`, and task-owned service startup/restart logs. The final build keeps the app script around 309 kB uncompressed, 94 kB gzip, while deferring the approximately 5.97 MB viewer chunk, 1.05 MB gzip. Vite still emits the SDK chunk size warning and harmless Lucide `use client` directive notices; the Node viewer test emits Three's CommonJS deprecation notice. Previous measured BS19 processing and browser memory limits follow below. No HG62 browser support claim is added.

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
