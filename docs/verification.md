# Curated catalog verification

Current asset creation acceptance was performed on 2026-10-06 in production Chrome through Playwright CLI, Node 24.19.0. The production build preceded browser checks. Separate port-3002 data roots held controlled creation data and a compatibility copy of the existing catalog. Normal port 3001, normal managed state and original IFC files were preserved. Earlier curated/source-browser measurements below are historical; their type-card counts do not describe creation candidates.

## Library asset creation delivery

The controlled files derive from `tests/fixtures/assets.ifc`, a real IFC4 STEP model with metre units and extruded physical solids. They do not modify the original BS19/JV3 files.

| Controlled fixture | Bytes | Physical occurrences | Candidates | Imported selection |
| --- | ---: | ---: | ---: | --- |
| `single-asset.ifc` | 1,716 | 1 | 1 classified, untyped element | First sensor |
| `multi-asset.ifc` | 3,115 | 5 | 1 typed candidate with 4 occurrences; 1 unclassified, untyped element | Untyped sensor only |

Production Chrome verified Upload IFC from empty and populated Library, discovery before persistence, and explicit subset import into Needs review. The single draft stayed absent from Library until approval. Staff finalized Comments as Unknown, and the approved card retained that value. Approval of the unclassified multi-file draft returned HTTP 400 with the missing-category reason; assigning Temperature sensor in Edit definition then permitted explicit approval. Actual solids rendered for both element definitions. The typed multi-file candidate was separately imported and archived; it remained absent from Library.

Repeated uploads receive new source identities and can create separate same-name drafts. They do not automatically merge. A same-source/fingerprint `import-selected` repeated through the browser API returned HTTP 200 with four entries before and after, and preserved the existing approved entry exactly. A stale mutation returned HTTP 409 `REVISION_CONFLICT`, with the complete catalog unchanged. Final controlled state, also checked after service restart: revision 9, two approved entries, one archived entry and one draft from a separate upload. The approved First sensor retained its UUID and `{kind: "missing"}` Comments specification.

BS19 upload and complete creation analysis found 9,204 physical elements and 3,083 candidates: 1,098 classified, 1,985 unclassified and 1,444 untyped candidates. No BS19 candidates were imported during that original browser check. The final review fix subsequently completed a real BS19 selected import through HTTP in a fresh isolated root, as recorded below. A subsequent active BS19 analysis was canceled with Escape while it displayed Downloading IFC to the browser worker. The dialog closed, focus returned to Upload IFC, Library stayed open and the catalog revision/counts stayed unchanged after the cancellation window. Uploaded source bytes remained available as the UI states.

The desktop and 390×844 selection screenshots were visually inspected. At the narrow viewport the dialog measured 358×712.39 pixels, x8.5/y65.80, with document width 375 and no horizontal overflow. Candidate text wrapped and the selected untyped row remained visible with its focus outline. Native Escape restored the single fixture's Preview trigger and the upload trigger after cancellation. A 14-Tab walk in the approved BS19 preview reached 13 controls inside the dialog plus one browser body transition; it reached no background page control and returned to Close dialog. Escape restored the originating preview arrow.

The browser exposed a file-picker inconsistency after Choose another IFC: the previous filename remained and Analyze stayed enabled. Clearing the local File fixed it. The new regression first failed (1 failed/13 passed), then passed (14/14). The rebuilt production browser confirmed an empty picker, no old filename and disabled Analyze after retry.

Evidence retained locally: [single solid](../output/playwright/creation-single-geometry.png), [mobile subset selection](../output/playwright/creation-multi-selection-mobile.png), [approved untyped solid](../output/playwright/creation-approved-untyped-geometry.png), and [approved Library after restart](../output/playwright/creation-approved-library.png). Bounded snapshots, API results, keyboard metrics and logs are under `output/asset-creation-delivery/`, including `repeat-same-source.txt`, `stale-mutation.txt`, `cancel-confirmed.txt`, `after-cancel-delayed.txt`, `restart-state.txt` and `focus-walk.txt`.

## Final creation review fixes

Real-parser HTTP regressions now cover type-level, instance-level and blank/text Generic Hard Asset conflicts. Complete analysis preserves each original raw value and normalized value under its original property key, with its exact occurrence membership. Blank and NA values remain normalized missing evidence; another value on the same occurrence remains visible as ambiguity. Optional classificationIssues must match the persisted creation index. Only those version-3 classification observations allow distinct values to overlap; duplicate values or IDs, outside-candidate IDs, ordinary-field overlap and legacy overlap still reject. Removing or forging issue metadata rejects before persistence.

Ambiguous candidates create drafts with no canonical category even when another occurrence supplies one surviving category label. Premature approval rejects. Staff chooses the canonical category, saves the draft, and explicitly approves. The production Chrome run performed those actions for the conflicting Sensor type. Its original Temperature sensor and Air quality sensor evidence on occurrence 31 stayed unchanged after approval and service restart. Legacy Sources opening still rejects conflicting classifications. GHA remains source classification evidence, excluded from reusable specification suggestions.

The selection summary now distinguishes candidates from physical occurrences, counts repeated occurrences beyond the first occurrence per candidate, and counts candidates needing classification from absent, multiple or issue classifications. The workload is computed once per index. A final 390×844 screenshot was visually inspected: 5 physical occurrences, 3 repeated occurrences, 1 candidate needing classification, and a selected conflicting typed row. Document width was 390, with no horizontal overflow. Escape closed the dialog and restored Upload IFC focus.

A fresh isolated source root held a byte-identical copy of the original 122,676,603-byte BS19 IFC. The actual current parser discovered 3,083 candidates covering 9,204 occurrences, with 1,098 classified, 1,985 unclassified and 1,444 untyped candidates. Its complete one-selected command measured **35,905,423 UTF-8 bytes**, above the old 33,554,432-byte budget. `POST /api/catalog-library/commands` now accepts at most 67,108,864 bytes of JSON. Other JSON API routes retain 33,554,432 bytes.

The actual BS19 command returned HTTP 200 and persisted every one of its 3,083 observations with all 9,204 memberships, creating exactly one draft and no approval. A stale repeat returned HTTP 409; a current-revision repeat returned HTTP 200 without duplicate drafts or a write. Both preserved catalog SHA-256 `51423bb8afe6cd7ac563a8c46489a9911bf7e3e40fc7bed8ea42102121ecc5f4`. The automated boundary regression sends a valid complete command above 32 MiB, proves another endpoint still rejects it, and proves a command above 64 MiB rejects with unchanged persistence.

Evidence is in `output/asset-creation-delivery/final-fix-bs19-http.json`, `final-fix-state-evidence.json`, `final-fix-selection-final.yml`, `final-fix-selection-final-metrics.txt`, `final-fix-approval-blocked.yml`, `final-fix-restarted-library.yml`, and [the final narrow selection image](../output/playwright/final-fix-ambiguous-selection-final.png). The first red run reproduced both parser exceptions and the 413 command failure; the separate UI red run failed its missing-summary assertion. A first green attempt corrected an order-sensitive test assertion and replaced deep comparison of huge Buffers with SHA-256 checks after that test process exhausted its heap. Final gates passed with default memory settings. The initial browser session had one expected HTTP 400 resource error from premature approval; the refreshed final session reported zero console messages.

Owned service PIDs 47084 and 40476 used `final-fix-data` and `final-fix-sources`; the service restarted after the final build. Owned browser PID 47752 used the named final-fix session. Ownership checks preceded stopping both services and closing that session. Port 3002 was free afterward and normal 3001/PID 44248 remained. Both normal catalog hashes matched the pre-work baseline, recorded in `final-fix-normal-hashes.json`; the BS19 original/copy hash match is in `final-fix-source-hashes.json`. No normal mutation or original IFC edit occurred. These checks establish the actual fixtures and BS19 HTTP path, not universal exporter support or a memory benchmark.

## Existing BS19/JV3 compatibility

A separate compatibility root copied the existing source inventory, its managed upload bytes and the existing approved catalog. Only copied managed-upload paths were rebound to the copied upload folder; the copied approval file remained byte-for-byte identical. Its revision 6 retained 1,558 existing user approvals and 12 drafts. This check created no approvals in that copy or normal data.

| Existing source | Bytes | Saved legacy elements / classified / excluded / untyped | Approved preview inspected |
| --- | ---: | --- | --- |
| BS19 | 122,676,603 | 9,204 / 4,938 / 4,187 / 79 | Airthings Space Mini, occurrence 1118159; reference also retains 1118216 and 1118323 |
| JV3 | 77,787,993 | 2,838 / 1,887 / 923 / 28 | Central-Fire-Alarm:Standard, occurrence 147170 |

Both actual full-model approved previews rendered in the rebuilt application. Their screenshots were visually read: [BS19 sensor](../output/playwright/creation-compatibility-bs19-geometry.png) and [JV3 alarm panel](../output/playwright/creation-compatibility-jv3-geometry.png). The approved BS19 inspector kept Source details collapsed. Compatibility console collection reported zero errors or warnings. The controlled session separately retained two expected HTTP resource errors from deliberate publication-requirement (400) and stale-revision (409) probes. An initial compatibility startup rejected copied uploads still pointing outside the new root; rebinding only the copied inventory paths corrected it. Its initial connection-refused browser navigation is not counted as a successful runtime check.

SHA-256 checks after verification matched the normal-data baseline for both `library.json` (955,136 bytes) and `catalog-library.json` (82,421,656 bytes). The copied approval file had the same catalog hash. Owned service PIDs 42840 and 34160 served controlled data; compatibility PID 29348 exited on path validation, and corrected PID 40628 served the copy. All owned services were stopped and the owned browser session (CLI PID 41392) was closed. Port 3002 was free; normal port 3001 remained PID 44248.

These are local workflow checks, not exporter-wide coverage, a memory benchmark or a long-session leak claim. No submitted-import cancellation delay was injected in this browser run; its late-persistence/navigation behavior remains covered by the Task 3 automated regression. Product identity, conflict batches and candidate pagination have automated coverage; the controlled browser run used generic definitions and two candidates.

## Current automated gates

After the final review fixes, `npm test -- --maxWorkers=2` passed 240 tests in 18 files, in 17.26 seconds, exit 0. `npm run build` ran afterward and passed strict TypeScript, server compilation and Vite production output, exit 0. Existing Three CommonJS, Lucide module-directive, bundle-size and Vitest isolation notices remain baseline limitations. Current logs are `output/asset-creation-delivery/final-fix-full-tests.log` and `final-fix-build.log`; earlier delivery logs remain retained. Vite completed the final build in 1.51 seconds. Tests completed before the build.

The browser found and fixed three defects: BS19 installation/GUID properties appeared as reusable suggestions; side geometry reused the centered two-column layout and squeezed its canvas; side-inspector cleanup stole focus from the centered arrow opener. Domain and native-dialog focus regressions went RED then GREEN. Raw source observations remain intact, and the actual side/centered layouts were rechecked after the final build.

## Final review regression acceptance

The coordinated fix separates immutable accepted specifications from live suggestions and staff overrides. Canonical category parameter IDs can map several raw source keys; overlapping unequal observations remain conflicts. Schema-1 compatibility preserves existing IDs, revisions and decisions, adds publication snapshots for current approvals, and flags stale legacy approvals while retaining recoverable explicit values. Historical mixed-unit details already lost by legacy aggregation cannot be reconstructed; an explicit version-2 reanalysis enriches them once. Geometry confirmation preserves exact subsets; changed fingerprints require explicit membership selection. Hidden unchanged historical references survive while newly accepted references are validated. Flagged approved entries remain published and also appear in Needs review. Successful category saves reconcile server-preserved aliases.

Focused RED/GREEN cases cover every final-review finding, including API restart retention and real-parser unit provenance. The independent re-review extension also covers known ordinary-text mapping rejection, legacy copied unknown-measure overrides, and distinct current/historical revisions of one source. Explicit rebind metadata supports consolidation of only selected occurrence subsets; API/UI tests retain untouched hidden history. Category save completion now waits for the saved revision before announcing reconciled aliases. The production service loaded the existing 1,576-entry dataset (1 approved, 1,569 drafts, 6 archived fixtures). A single warm Playwright sample measured review opening at 74 ms with 50 cards, filtering Data-Cabinet at 190 ms with 7 cards, and selecting those seven at 36 ms. These are local interaction timings, not cold-load benchmarks or a comparative speedup claim. The selection was not approved. Desktop document width was 1280 at viewport 1280; mobile was 390 at viewport 390. Final desktop/mobile review screenshots and the real approved cabinet preview were visually inspected. Its accepted display values were 8.209124 m² and 0.1952143 m³; geometry remained available, and Escape restored focus to its preview arrow. Console reported zero errors or warnings. No real catalog mutations were performed during this bounded final browser pass.

Artifacts under ignored output/playwright: final-fix-queue-metric.txt, final-fix-review-desktop.png, final-fix-review-mobile.png, final-fix-published-preview.png, final-fix-preview-metrics.txt and final-fix-console.txt. The complete finding-to-fix record is in the local final-fix-report.md beside the task reports.

## Real BS19/JV3 imports

| Source | Types/drafts | Classified occurrences | Observed fields | Compact UTF-8 snapshot bytes | Measured repeat analysis/import |
| ------ | -----------: | ---------------------: | --------------: | ---------------------------: | ------------------------------: |
| BS19   |        1,019 |                  4,938 |          55,134 |                   20,037,869 |                       11,005 ms |
| JV3    |          551 |                  1,887 |          28,679 |                    9,335,873 |                        5,994 ms |

Initial real imports created 1,570 drafts and 152 distinct category labels; the main Library remained empty until explicit approval. The timings above measure a later same-fingerprint repeat, from clicking Analyze through completion of the HTTP response, including download/worker opening, classification/analysis, validation and saving. They are individual local warm-repeat measurements, not first-import benchmarks. Progress was sampled every 500 ms and showed download, opening, property relationships, classified occurrence analysis and saving. Repeat import retained revision 15 and entry counts. Exact payload bytes use Node `Buffer.byteLength(JSON.stringify(snapshot))` on the submitted browser snapshot. Earlier PowerShell reserialization estimates differ slightly because number serialization differs.

The final pretty-printed isolated catalog is 71,976,208 bytes, including two small retained fixture sources. Before the final review fix, full-state responses and unbounded review rendering had a measurable cost: one actual edit response completed in 1,657 ms, and opening the complete review list exceeded the CLI's five-second click timeout before becoming usable. Filtering actual cabinet records worked. No general memory ceiling or throughput claim follows from this run.

## Actual curation and preview

A real BS19 `Base-Cabinet:Drawer-Cabinet_2200x650x900mm` definition was renamed `Generic pantry drawer cabinet`, retained generic identity with no guessed manufacturer, and explicitly approved. It uses source `Dimensions / Area = 8.209124116586796 m²` and `Dimensions / Volume = 0.19521426543496748 m³`; dimensions in its name were not treated as verified specifications. Staff confirmed those category mappings, renamed Area to Surface area and saved the Pantry cabinet alias. The approved entry UUID is `766ee64f-6b94-428b-b94a-d366173c5116`; representative occurrence is 651620. Curated fields lead the inspector; raw IFC properties and source observations remain available below it.

Actual same-name `Data-Cabinet-2:Standard` duplicate comparison displayed widths 0.3, 0.6, 0.4, 0.5 and 1.0 m with unequal heights/areas. They were left separate. This is real-source duplicate evidence, not proof that every candidate is equivalent or every property exporter is supported.

Production screenshots were actually viewed: `final-desktop-side.png`, `final-desktop-centered.png`, `final-mobile-centered.png` and `final-mobile-library.png`. Real geometry and usable Fit asset controls are visible. Desktop is 1280x720 with document width 1280; mobile is 390x844 with document width 390. Escape returned focus to `Preview Generic pantry drawer cabinet`, including after a side inspector had been open. The stable final browser session reported zero console messages, errors or warnings. Earlier harness/session closures and stale snapshots required a task-owned browser restart; they were not attributed to application defects without reproduction.

## Controlled fixture, persistence and retention

The ignored `delivery-fixture.ifc` derives from the real-parser `tests/fixtures/assets.ifc` and adds occurrence widths 0.06/0.08 m. Two task-owned uploads were parsed by the actual IfcReader and imported through the production API. Confirmed Width variant mapping split each draft into exact single-occurrence partitions, producing four drafts. Equivalent 0.08 m partitions merged, preserved target specifications, archived the absorbed definition and returned to draft. After explicit equivalent-reference confirmation and approval, hiding the preferred upload still rendered the visible equivalent source in the browser. The fixture is labeled as a verification asset; it is separate from BS19/JV3 evidence. A stale catalog command returned HTTP 409 `REVISION_CONFLICT`. See `fixture-verification.ts`, `fixture-evidence.json` and `fixture-confirmed-fallback.png` under `output/playwright/`.

BS19 was hidden through its actual Sources confirmation dialog. Its approved definition remained visible with Geometry unavailable. Restart preserved that hidden source state, approved specifications, category/template edits and archived fixture entries. Both original source SHA-256 hashes stayed unchanged, and the normal `library.json` hash matched the untouched copied baseline. To capture final geometry, BS19 visibility was restored only in the stopped isolated data fixture, then the task-owned service was restarted. All six fixture definitions are archived and both uploads hidden/retained; final isolated state is revision 15, 1 approved real entry, 1,569 real drafts and 6 archived fixture entries. Nothing was copied into normal managed data.

## Current limits and follow-up

These historical classified Sources snapshots fit the then-current 32 MiB JSON limit. Complete creation snapshots contain more observations. The current catalog-command endpoint accepts at most 64 MiB; other JSON routes retain 32 MiB, and larger commands may still reject. The observations/persistence remain substantial despite distinct-value compaction. Full-state API paging/deltas remain deferred scaling work. Rendering now uses explicit 50-definition pages with visible-page batch selection, cached revision derivations and Set membership checks. Unknown SI labels preserve prefixes and unresolved measures cannot establish strong duplicate equivalence. Numeric displays use seven significant digits; stored values retain their precision. HG62, arbitrary exporters, guaranteed browser/worker memory peaks and long-session leak freedom remain unverified. Source size/mtime fingerprints cannot detect edits preserving both.

Task-owned service PID history was 33560, 30064, 39780 and final 32788 on port 3002. It was launched hidden with `IFC_DATA_ROOT=output/curated-validation-data`; existing port 3001 was untouched. The copied baseline's hidden historical upload was excluded only from isolated state because its original upload path correctly failed the isolated root boundary. Original sources and normal managed files were retained.

Graphify was refreshed in the normal checkout after integration. Its graph remains navigation assistance: semantic extraction dropped out-of-scope source attributions, CSS/IFC fixtures are not structural code inputs, and source files remain authoritative. Extraction costs and graph health are recorded locally in `graphify-out/` and `output/curated-delivery/`. Task reports and review decisions are preserved in ignored `output/curated-delivery/sdd-record/`; browser evidence remains local.

## Normal-checkout delivery, 2026-10-06

The independently reviewed implementation was integrated into local `main` at `5553688`. The normal checkout passed all 179 tests across 12 files and the strict typecheck/server/Vite production build. Remote push is outside this delivery.

Fresh version-2 analysis and validated API imports populated the real local catalog with 1,570 drafts, zero approved definitions and 152 original category labels. No validation fixture or sample approval was copied. Staff can curate and approve drafts in Needs review; only approved definitions enter Library.

| Source | Types | Classified occurrences | Import request bytes | Parser/import elapsed ms |
| --- | ---: | ---: | ---: | ---: |
| BS19 | 1019 | 4938 | 24146829 | 26916 |
| JV3 | 551 | 1887 | 11185257 | 14632 |

Both historical classified-analysis requests fit the then-current 32 MiB limit; they do not establish the size of complete creation commands. These are single Node-parser/import validation observations, including download, initialization, analysis and command response, rather than UI benchmarks. The original `library.json` still matches its recorded baseline SHA-256. Original IFC files remain in their existing external folders.

Chrome on the normal service verified the 1,570-draft queue, its 50-card first page, empty approved Library and a real Fire Detector centered geometry/property preview. The document and viewport widths were both 1280; console had zero errors/warnings. Screenshots `output/playwright/curated-normal-review.png` and `curated-normal-geometry.png` were inspected. Exact imports, build/test logs and preserved prior acceptance evidence are in ignored `output/curated-delivery/`.

## Historical source-browser verification

The following sections record the earlier parser, viewer and source-browser work. The current catalog scope above supersedes their source-model card/read-only catalog assumptions.

# Browser IFC verification

Measured locally on 2026-10-05 using Chrome through Playwright CLI, Node 24.19.0 and the lockfile-pinned npm packages. The production catalog is `/`. Task 2's temporary `/validation.html` entry has been removed; its historical measurements below remain applicable to the parser/viewer revision tested at that time.

## Context refresh on 2026-10-06

The full `npm test` suite passed 55 tests across seven files against application revision `8f2cd6f`. This includes the centered-preview regression previously checked only in the focused run. The known Three CommonJS deprecation warning remains. This context and documentation refresh does not add a new browser run or change application behavior.

## JV3 library indexing on 2026-10-06

Selected the existing `JV3.ifc` source through the production UI at `http://127.0.0.1:3001`. Its 77,787,993-byte source produced a persisted catalog with 551 types and 81 categories. The 2,838 physical elements comprise 1,887 classified occurrences, 923 excluded occurrences and 28 untyped occurrences.

`Central-Fire-Alarm:Standard`, representative occurrence 147170, rendered two meshes and 24 triangles. Its instance `Identity Data / Generic Hard Asset` value is `Fire Alarm Central`. Normal card selection opened the side inspector; the arrow opened the centered preview with the same geometry, 17 property panels and one selected card. Chrome console reported zero errors or warnings. The side-inspector screenshot was visually inspected. Local evidence is `output/playwright/jv3-inspector.png`, `jv3-centered-preview.png` and `jv3-inspector-snapshot.txt`. The original IFC remains in its source folder; this operation saved the derived catalog in managed local state and required no application code change.

## Final revision and inventory fixes

The final checks pass 54 tests across seven files, strict TypeScript, and the production build. The focused API/UI run passes 37 tests. Six regression cases initially failed on the prior implementation: revision-bound downloads, oversized JSON, download and index-save conflicts during cached inspection, startup inventory after upload, and mobile category focus. Further tests cover a real temporary IFC replacement through the API, worker download function and web-ifc reader; late inventory after hiding a model; and preservation of a catalog completed during inventory refresh.

Downloads now send `X-IFC-Fingerprint`. The service compares it with the opened disk file's size/mtime and streams that same file descriptor, returning `SOURCE_CHANGED` HTTP 409 before sending replacement bytes when the expected revision differs. The worker validates the returned fingerprint. Both download and index-save conflicts discard the open source, refresh metadata, and reindex once. Inspection resolves the type and occurrence IDs from that successfully opened catalog. Upload success reloads the complete inventory while preserving selection and any completed matching-revision catalog. Inventory generations reject stale responses after removal. Other API JSON routes still return structured HTTP 413 above 32 MiB. The catalog-command endpoint now has a bounded 64 MiB budget for complete creation analysis.

Production Chrome session `asset-finalfix` used the existing service at `http://127.0.0.1:3001`. Its `tsx watch` process reloaded server edits, verified by an actual stale-fingerprint 409 response. No extra service or manual process restart was needed. Cached BS19 initially displayed 1,019 types and 107 categories without downloading IFC. First inspection opened the source and rendered occurrence 1118159, two meshes and 954 triangles, with 16 property panels including type identity. Successful BS19 and focus checks had zero console errors or warnings.

For replacement verification, the UI uploaded the small IFC fixture as `finalfix-revision.ifc`, ID `8460bc12-04f6-4c74-83c2-f6730c9d06d9`. After indexing and reloading the page, its cached Sensor type card was selected as the source without opening IFC. Only this test upload was then replaced on disk. Clicking the cached card produced file 409, inventory 200, current file 200, and index-save 200. The inspector and card showed Replacement pump type, occurrence 130, one mesh and 12 triangles. No stale Sensor type or ordinary save warning remained. The test upload was restored to its original fixture bytes, hidden through the UI, and retained with SHA-256 `94FDF0489FD376EFFD2865055B9A80AF9E9BFDD858C9A375C028AE93CD9FF57A`. Inventory returned to nine models. Existing property source files were unchanged.

At 390 × 844, keyboard Enter on Air quality sensor closed the category sidebar and returned focus to the visible category toggle with `aria-expanded=false`. Both viewport width and document scroll width were 390 pixels. Screenshots were visually inspected. Local evidence is under ignored `output/playwright/`: `finalfix-bs19.png`, `finalfix-bs19-evidence.txt`, `finalfix-bs19-console.txt`, `finalfix-narrow-focus.png`, `finalfix-focus-evidence.txt`, `finalfix-revision.png`, `finalfix-revision-evidence.txt`, `finalfix-revision-requests.txt`, revision before/after records, and retained hashes.

The final app bundle is about 312 kB uncompressed and 95 kB gzip. The separately loaded viewer remains about 5.97 MB; its Vite chunk warning is an accepted deferred optimization. Lucide directive notices and the Node viewer test's Three CommonJS warning remain. The size/mtime fingerprint cannot detect edits preserving both values. HG62, arbitrary exporter compatibility, long-session leak freedom and guaranteed peak memory remain outside the verified scope.

## Production catalog delivery

The final React workspace uses local IBM Plex Sans fonts and Lucide icons, real source inventories, category/search filters, grid/list results, and a lazy-loaded inspector. Cards contain real metadata and neutral placeholders. The app owns one IFC worker, serializes inspection requests, disposes it on source changes/removal, and guards progress, indexes and inspections against stale completions. Cached indexes populate results immediately; inspection still opens the correct source. Preview failures preserve the catalog and allow retry. Properties correspond to the occurrence actually previewed after geometry fallback.

The initial Task 3 checks passed 43 tests across six files, typecheck and build. Its seven catalog tests covered supplied-record filtering/list/category/property interactions, empty inventory, indexing failures/retry, late inspection closure, late indexing after removal, removal failure recovery, and reopening a source after a worker failure. The last two regressions were observed RED before their corrections: no Retry processing control after removal failure; then one source open instead of two after inspection retry. Both passed after correcting their lifecycle paths. jsdom lacks native dialog methods, so those methods alone are substituted in DOM tests; actual modal focus/close behavior was checked in Chrome. Worker responses are controlled in interaction tests; the real parser and viewer have separate tests and browser checks.

The production browser run used `http://127.0.0.1:3002` and isolated `IFC_DATA_ROOT=output/task3-library-data`, with one service writer. Existing processes on ports 3001 and 5173 and existing managed storage were left intact. Invocation was `node C:/Users/StevenGomba/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/@playwright/cli/playwright-cli.js -s=asset-task3 open http://127.0.0.1:3002 --browser chrome`. Normal interactions used snapshot references through `click`, `fill`, `select`, and `upload`; there is no generated Playwright test suite.

The fresh source inventory contained nine models. Initial BS19 indexing produced 1,019 types, 107 categories, 4,938 classified occurrences, 4,187 excluded occurrences and 79 untyped occurrences. The Air quality sensor category reduced the results to one type with three occurrences. Searching Airthings and switching to list mode preserved the result. Selection displayed 15 source property groups plus the type identity panel. The real representative #1118159 rendered two meshes and 954 triangles, with bounds 0.0586447 × 0.0817735 × 0.0850051 metres. Its `Generic Hard Asset` is Air quality sensor and `Asset Name` is Air quality sensor-1.2.BS19. Actual SDK geometry was visible in screenshots.

Desktop 1440×1000 and narrow 390×844 screenshots were inspected. Neither viewport had horizontal document overflow. The narrow inspector filled the viewport below the header, and closing it returned to the filtered list. Category navigation collapses behind a labeled toggle. Dialogs use native modal behavior, restore opener focus, and expose validation/status messages. The inspector receives keyboard focus on selection and supports Escape. Reduced motion disables animation.

Persistence sequence used a 3,066-byte copy of `tests/fixtures/assets.ifc`, named `task3-persistence.ifc`, uploaded through the UI. The service assigned ID `23dcd29c-157f-4d62-9e8d-045511be22d0`; indexing produced one type with two occurrences, two excluded occurrences and one untyped occurrence. After service restart, the upload and saved index remained in the inventory. Selecting its cached card opened the correct uploaded source and rendered its cuboid and properties. Removing it through the confirmation dialog, restarting again and reloading restored nine visible models with no uploaded test entry. The persisted record remained hidden, its file still existed, and both uploaded and fixture SHA-256 values were `94FDF0489FD376EFFD2865055B9A80AF9E9BFDD858C9A375C028AE93CD9FF57A`.

An invalid `.ifc` text upload returned HTTP 400 and displayed "Upload a complete STEP IFC file with an IFC schema header." It did not add a model. The successful catalog and inspection run had zero console errors or warnings. The intentional invalid upload produced the expected failed-resource HTTP 400 console entry; subsequent successful reload/inspection had zero messages. Recorded API responses include file/WASM/index HTTP 200, valid upload HTTP 201, and invalid upload HTTP 400. No unexpected parser or WebGL errors were observed. A source selection after removal briefly chose BS17 during verification; the final selection policy now prefers BS19 or another cached source. That incidental run is not claimed as broader model validation.

Local evidence in ignored `output/playwright/`: `task3-desktop-catalog.png`, `task3-desktop-inspector.png`, `task3-mobile-catalog.png`, `task3-mobile-inspector.png`, `task3-invalid-upload.png`, `task3-upload-after-restart.png`, `task3-restart1-snapshot.yml`, `task3-upload-record.json`, `task3-persistence-evidence.json`, `task3-requests.txt`, `task3-console.txt`, and task-owned service startup/restart logs. The final build keeps the app script around 309 kB uncompressed, 94 kB gzip, while deferring the approximately 5.97 MB viewer chunk, 1.05 MB gzip. Vite still emits the SDK chunk size warning and harmless Lucide `use client` directive notices; the Node viewer test emits Three's CommonJS deprecation notice. Previous measured BS19 processing and browser memory limits follow below. No HG62 browser support claim is added.

## Automated checks

Task 3 review fix round 1 adds two focused regression cases. `npm test -- --run tests/library-ui.test.tsx tests/viewer-loader.test.tsx` passes nine tests, and `npm run build` passes including strict typechecking. The initial upload/list race first failed with `No models` after a successful upload; inventory generations now prevent the earlier list result or error from replacing newer state. A viewer module rejection first unmounted the test root. The inspector now catches that failure locally and keeps properties available.

The targeted production Chrome fault probe also caught native dynamic-import failure caching: creating a new React lazy component alone did not recover. Retry now reads the publicly served `/asset-manifest.json`, validates a relative `assets/*.js` path, creates a fresh same-origin URL, and checks that the loaded module exports a viewer component. Development retry uses the local Vite source URL. With the first viewer chunk request aborted once, the catalog and all 16 property panels remained available. Clicking Retry viewer download fetched the manifest and cache-busted chunk, restored two meshes and 954 triangles, and removed the fallback. The console retained only the two intentional failure entries, with no additional error on recovery. Evidence: `output/playwright/task3-fix1-download-failure.yml`, `task3-fix1-retry-requests.txt`, and `task3-fix1-recovered-viewer.png`. Unchanged parser and storage suites were not rerun in this fix round.

- `npm test`: 36 passing tests (26 service tests; four catalog policy tests; five actual IFC-reader tests; one viewer lifecycle test).
- `npm run build`: strict TypeScript, server compilation and production Vite build pass.
- Catalog tests first failed because `catalog.ts` did not exist. Actual IFC-reader tests first failed because `reader.ts` did not exist. The real fixture additionally caught the published `FlatMesh.delete()` declaration mismatch and malformed-header parser error; both are corrected.
- `tests/fixtures/assets.ifc` is an IFC4 STEP model with project/building structure, SI metre units, owner history, five physical proxy occurrences, type/property relations and extruded solids. Real web-ifc parsing verifies instance precedence, type fallback, unrelated-Pset exclusion, blank/NA suppression, type grouping, read-only properties and nonempty occurrence geometry.

## BS19 real browser results

Source: `C:/Users/StevenGomba/OneDrive - HEMY AS/Desktop/Omniverse Working Files/PROPERTIES/BS19/IFC/BS19.ifc`, 122,676,603 bytes.

| Measurement                                            | Result                         |
| ------------------------------------------------------ | ------------------------------ |
| Development fetch + worker initialization + indexing   | 17,768.6 ms                    |
| Production build first completed indexing run          | 20,779.6 ms                    |
| Final production build indexing run                    | 15,153.3 ms                    |
| Physical `IFCELEMENT` population, including subclasses | 9,204                          |
| Classified and reliably typed occurrences              | 4,938                          |
| Excluded absent/blank/NA effective classification      | 4,187                          |
| Classified occurrences missing an unambiguous type     | 79                             |
| Type cards, grouped by model ID and IFC type GlobalId  | 1,019                          |
| Distinct category strings (case preserved)             | 107                            |
| Selected occurrence mesh + property request round-trip | 80.8 ms                        |
| Final production mesh + property request round-trip    | 96.6 ms                        |
| Selected occurrence geometry                           | 2 meshes, 954 triangles        |
| Selected occurrence property groups                    | 15                             |
| Transformed preview bounds, metres                     | 0.058645 × 0.081774 × 0.085005 |

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

| Phase                                      | Samples | Maximum private MiB | Last private MiB | Maximum working-set MiB | Last working-set MiB |
| ------------------------------------------ | ------: | ------------------: | ---------------: | ----------------------: | -------------------: |
| Before opening BS19                        |       3 |               261.0 |            261.0 |                   485.4 |                485.4 |
| First indexing through ready               |      18 |               689.9 |            683.8 |                   921.0 |                913.1 |
| Retained source and rendered preview       |       5 |               740.9 |            736.9 |                   933.0 |                931.5 |
| After source switch disposed worker/viewer |       8 |               366.8 |            327.7 |                   568.2 |                550.7 |
| Second open before cancellation            |       2 |               649.4 |            649.4 |                   890.0 |                890.0 |
| After cancellation during parser opening   |       8 |               662.2 |            282.0 |                   902.6 |                532.3 |
| Retry indexing through ready               |      18 |               708.7 |            696.7 |                   948.5 |                932.7 |
| Retry rendered preview                     |       3 |               745.6 |            739.5 |                   940.3 |                934.9 |
| After retry source switch/disposal         |       6 |               376.2 |            346.7 |                   580.6 |                554.1 |

The sampler waited 500 ms between CLI/CDP/OS collection calls; actual sample intervals were approximately 1.4 seconds. Values are sampled process totals, not guaranteed peaks. Private bytes measure committed process allocations. Working sets measure resident process pages and their sum can double-count shared pages. GPU memory outside process accounting is not measured. The main page and dedicated worker share a renderer, so these numbers cannot isolate worker memory. No main-thread heap measurement is presented as whole-browser memory, and no forced garbage collection was used.

The renderer with most IFC-related growth, PID 8856, changed from 58.0 MiB private at baseline to 477.1 MiB during retry inspection and 81.3 MiB after disposal. The GPU process changed from 82.8 to 144.3 MiB between baseline and final disposal. The overall footprint fell substantially after each disposal/cancellation, with a brief delay after worker termination. Residual process memory and the short observation window prevent a leak-free claim or a promise about repeated long sessions.

During this run, first indexing took 13,412.1 ms and retry indexing took 13,521.9 ms. Geometry/property requests took 73.5 ms and 50.4 ms. Both produced the same 9,204-element counts, 1,019 types, 107 categories, two sensor meshes, 954 triangles and 15 property groups. Final console output was zero errors and warnings. Source selection to BS17 was used only to dispose BS19; BS17 was not parsed.

Local artifacts under `output/playwright/`: `measure-browser-memory.ps1`, `bs19-browser-memory.jsonl`, `bs19-browser-memory-summary.json`, `memory-browser-process.json`, `memory-run-render-metrics.txt`, `memory-retry-render-metrics.txt`, and `bs19-fix1-representative.png`. The JSONL retains each sample's status, timestamps, PID/type and byte counts.

## Centered card preview

The card arrow is a separate, keyboard-accessible dialog control. It selects/highlights the same card while opening the existing geometry/property inspector in a centered modal; clicking the card body retains the side inspector. Grid and list modes support both actions. The popup uses a native dialog for keyboard focus containment, Escape closure, and focus return to the originating arrow.

Focused regression: `npm test -- --run tests/library-ui.test.tsx tests/viewer-loader.test.tsx` passed 16 tests. The new test first failed because the arrow control did not exist, then passed for normal card inspection, centered preview parameters, selected-card feedback, close/focus return, list-mode expansion, and native cancel. Production build and strict typecheck passed.

Production Chrome verified BS19 sensor occurrence 1118159 in the centered window: two meshes, 954 triangles, 16 property groups, selected card true, and no concurrent side inspector. At 1280x720 the dialog bounds were x80/y41, 1120x638. At 390x844 its width was366 and document width390, with no horizontal overflow. Escape closed it and restored focus to the card arrow. Normal card click still opened the side inspector and highlighted the card; the list-view arrow also reopened the centered geometry. Console reported zero errors or warnings. Screenshots: `output/playwright/asset-centered-preview-desktop.png` and `asset-centered-preview-mobile.png`, both visually inspected.
