# Web asset browser MVP implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a local IFC asset library with persistent uploads, real category/type cards, read-only properties, and representative 3D previews.

**Architecture:** A React application processes IFC in a dedicated browser worker and uses That Open Engine for its 3D world. A small localhost Node service discovers the existing IFC folders, stores uploads separately, and persists model visibility and derived catalog indexes. Load geometry only for the chosen representative element rather than converting/rendering the whole building for each card.

**Tech Stack:** Node 24, TypeScript strict mode, React, Vite, Express, multer, Zod, Vitest, web-ifc 0.0.78, @thatopen/components 3.4.8 and its compatible Fragments/Three dependencies. Use npm lockfile-pinned versions, locally served WASM, IBM Plex Sans, and Lucide icons. Use Playwright CLI for real-browser verification, not a suite of generated screenshot tests.

**Spec:** `docs/requirements-review.md` and `docs/architecture-review.md`. UI direction below supplements the approved functional scope.

## Global constraints

- Local, staff-only browser with a minimal local file service.
- Load existing IFC files from `C:/Users/StevenGomba/OneDrive - HEMY AS/Desktop/Omniverse Working Files/PROPERTIES/<CODE>/IFC/` without modifying them.
- Save new uploads in a separate MVP-managed folder, `.local-data/uploads/`, and persist library state in `.local-data/`.
- Removal persistently hides a model; it does not delete its IFC.
- Group cards by source-model identity plus IFC type GlobalId; equally named types in different source models remain separate.
- Use `Identity Data / Generic Hard Asset`; the element's property wins whenever present, with type fallback only when absent.
- Exclude effective blank or `NA` classification values and report excluded and untyped element counts.
- Properties are read-only; geometry preview is representative inspection only.
- Initial real-file validation is BS19 IFC4, 122,676,603 bytes, approximately 117 MiB.
- IFC processing and viewing remain in the browser. Moving processing to the service requires measured evidence and an explicit design adjustment.
- FM import, existing FM workflows, placement, RFA, Nucleus integration, commercial That Open Platform, and a full catalog database remain deferred.
- Show real data and real processing errors. Do not ship hardcoded BS19 cards or fabricated asset thumbnails.

## UI direction

Reference Autodesk Content Catalog's collection/category browsing, grid/detail display, and content inspection patterns. Sources: [Content Catalog help](https://help.autodesk.com/view/CONTCAT/ENU/), [results grouping](https://help.contentcatalog.autodesk.com/en/articles/8011680-search-customized-results-grouping), [collection management](https://help.autodesk.com/cloudhelp/ENU/Docs-Admin/files/hub-administration/library/content-catalog/Content_Catalog_Collections.html). Use these interaction patterns with HEMY branding, not Autodesk trademarks or a Revit insertion workflow.

Build a practical catalog workspace: slim ink navigation rail, white collection/category sidebar, generous light-gray results canvas, restrained teal selection accent, and a right asset inspector. Use a 4/8 spacing scale, IBM Plex Sans typography, fine borders, modest corner radii, and a subtle coordinate grid only in the preview area. No marketing hero, decorative gradients, large promotional statistics, or disabled FM import CTA.

The primary flow is choose source/model, index it, browse categories/type cards, and inspect properties/geometry. The initial source is BS19; discover other saved models without automatically parsing all large files. Search and grid/list switching are lightweight browsing aids. Cards show model, category, type name, occurrence count, and honest preview availability. Use neutral geometry placeholders until actual geometry/thumbnails exist. Provide uploading/indexing/empty/failed states, retry, and a clear removal dialog explaining retained originals. Make controls keyboard accessible, preserve focus, label fields, announce status, support reduced motion, and adapt the inspector/sidebar to narrow viewports.

## File structure and interfaces

- `shared/contracts.ts`: Zod schemas and derived types for model records, catalog indexes, and API boundaries.
- `server/config.ts`, `server/library-store.ts`, `server/app.ts`, `server/index.ts`: configured filesystem access, atomic persisted state, HTTP API, localhost startup/static hosting.
- `src/ifc/catalog.ts`: pure effective classification and grouping rules.
- `src/ifc/reader.ts`, `src/ifc/worker.ts`, `src/ifc/client.ts`, `src/ifc/protocol.ts`: web-ifc access, worker lifecycle, typed requests/progress/results, representative geometry.
- `src/viewer/AssetViewer.tsx`: That Open world and disposal of representative Three meshes.
- `src/library/api.ts`, `src/library/useLibrary.ts`: validated API client and UI orchestration.
- `src/components/*`, `src/App.tsx`, `src/styles.css`, `src/main.tsx`: catalog UI and interactions.
- `scripts/copy-wasm.mjs`: serve pinned parser assets locally in development and production.
- `tests/*`: behavior-focused storage, classification, actual minimal-IFC extraction, and UI interaction tests.
- `README.md`, `docs/verification.md`: startup and measured real-file/browser evidence.

`LibraryModel`: `{ id, name, source: 'existing' | 'upload', size, modifiedAt, fingerprint, index: CatalogIndex | null }`. Assign stable model IDs in persisted state. Resolve files by ID, not client-supplied filesystem paths. Hidden models do not appear in normal lists. File size/mtime can supply a documented revision fingerprint for this MVP.

`AssetType`: `{ id, modelId, typeGlobalId, name, ifcClass, categories: string[], occurrenceIds: number[], representativeId: number }`. Multiple category values under one IFC type remain one type card with its category memberships. `CatalogIndex`: `{ schemaVersion: 1, modelId, fingerprint, types: AssetType[], stats: { elements, classified, excluded, untyped } }`. Derive types from runtime schemas.

`PropertyGroup`: `{ name, source: 'instance' | 'type', values: { name, value: string }[] }`. Read representative-instance and type groups without writing IFC metadata.

`PreviewGeometry`: `{ meshes: { positions: Float32Array, normals: Float32Array, indices: Uint32Array, transform: number[], color: number[] }[] }`. Validate transferable worker messages at the boundary; geometry arrays represent real IFC meshes.

HTTP: `GET /api/models` returns visible models; `GET /api/models/:id/file` streams IFC; `POST /api/models` accepts multipart field `file`; `DELETE /api/models/:id` hides a model; `PUT /api/models/:id/index` persists a matching-fingerprint index; `GET /api/health` is a startup check. Return structured errors. Uploads use unique destinations, bounded size, IFC header validation, and atomic completion. Source paths are server configuration, never arbitrary request paths. Bind to `127.0.0.1`; reject cross-origin mutating requests and invalid Host headers. Serialize persisted-state mutations to avoid lost concurrent uploads/indexes.

Worker client: `openModel({ model, fileUrl, onProgress }): Promise<CatalogIndex>`, `readProperties({ modelId, elementId }): Promise<PropertyGroup[]>`, `readGeometry({ modelId, elementId }): Promise<PreviewGeometry>`, `dispose(): void`. One open IFC at a time. Explicitly close/reopen when switching models; cached indexes can populate cards, but inspection must open the corresponding source. Stale responses must never overwrite a new selection. Errors terminate the current request and enable retry. Do not swallow parser errors as empty valid catalogs.

## Review focus

1. An explicit instance `NA` or blank must suppress an otherwise valid type classification. Task 2 owns the test.
2. Concurrent upload/index/hide operations and restart must not lose state or restore hidden sources. Task 1 owns the test.
3. Changed source files must invalidate derived indexes rather than show stale properties. Task 1 owns the test.
4. Rapid model/type switching or removal during processing must not display the previous model's geometry or resurrect its cards. Task 3 owns the test.
5. Malformed IFCs, unsupported geometry, and canceled worker work must show actionable failures without losing originals or freezing the UI. Tasks 2 and 3 own these checks.

---

### Task 1: Persistent local library service

**Files:** Create `package.json`, `package-lock.json`, TypeScript/Vite/Vitest configuration, `shared/contracts.ts`, `server/config.ts`, `server/library-store.ts`, `server/app.ts`, `server/index.ts`, `tests/library-store.test.ts`, `tests/library-api.test.ts`, and initial `README.md`. No full UI yet.

**Interfaces:**
- Consumes: configured existing source root and managed data directory.
- Produces: shared schemas/types and the HTTP routes above. Export `createApp({ sourceRoot, dataRoot }): Promise<Express>` and a testable `LibraryStore` with `listModels()`, `hideModel(id)`, `saveIndex(id, index)`, `resolveModelFile(id)`, and upload persistence.

- [x] **Step 1: Set up scripts and failing behavior tests.** `npm run dev` runs localhost service and Vite; `npm run build` runs strict typecheck and production build; `npm start` serves built UI and API on localhost; `npm test` runs Vitest. Real temporary-directory tests assert source discovery, stable identity, persistent hidden state without file deletion, index invalidation after file modification, and two concurrent uploads both surviving restart. API tests assert invalid paths/IDs, malformed headers, cross-origin mutation rejection, streaming file bytes, and multipart upload persistence. Use a minimal actual IFC text fixture, not mocked filesystem calls.
- [x] **Step 2: Record RED.** Run `npm test -- tests/library-store.test.ts tests/library-api.test.ts`; record the expected missing-behavior failure before implementing service logic.
- [x] **Step 3: Implement the store and API.** Infer shared types from Zod, validate boundaries, stream multipart uploads to unique temporary destinations, validate STEP/IFC header, then publish final files. Use atomic state writes with serialized operations and clear errors. Honor hidden state when discovering sources again. Invalidate indexes on fingerprint change. Keep original sources read-only. Document environment overrides for root/data directory/port.
- [x] **Step 4: Verify GREEN and typecheck.** Repeat the focused tests and `npm run typecheck`. Start service and verify `/api/health` and discovery of BS19 without parsing it. Document results in the task report.
- [x] **Step 5: Commit.** Commit only this task's source/configuration/tests/docs with `feat: add persistent local IFC library service`.

### Task 2: Browser IFC classification and representative preview pipeline

**Files:** Create `src/ifc/catalog.ts`, `src/ifc/reader.ts`, `src/ifc/protocol.ts`, `src/ifc/worker.ts`, `src/ifc/client.ts`, `src/viewer/AssetViewer.tsx`, `scripts/copy-wasm.mjs`, `tests/catalog.test.ts`, `tests/ifc-reader.test.ts`, a standards-valid small IFC fixture, and a minimal browser validation entry. Modify package/config only as needed for these capabilities. Record results in `docs/verification.md`.

**Interfaces:**
- Consumes: `LibraryModel`, `CatalogIndex`, `AssetType` and model-file URL from Task 1.
- Produces: worker client/property/geometry interfaces above; `<AssetViewer geometry={geometry} />`, with orbit and fit controls and deterministic disposal. The final UI replaces the minimal validation entry in Task 3.

- [x] **Step 1: Write failing mapping tests.** Test absent instance fallback; explicit blank/`NA` suppression; two occurrences sharing a type; same type name across two model IDs remaining distinct; multiple categories under one type; missing type reporting. Assert `Identity Data` property lookup and the agreed precedence, not arbitrary same-named properties in other Psets.
- [x] **Step 2: Record RED and implement pure catalog rules.** Run `npm test -- tests/catalog.test.ts`, observe the missing behavior, then implement classification/grouping without coupling to rendering.
- [x] **Step 3: Test actual IFC extraction.** Create a small valid IFC4 fixture containing classified typed occurrences, type-level fallback, an excluded occurrence, and simple geometric solids. Write failing tests that open the actual bytes with web-ifc and assert category/type identity, occurrence grouping, properties, and nonempty representative mesh arrays. Verify malformed IFC fails explicitly. Implement `reader.ts` against installed, verified APIs; inspect entity references/property-set presence rather than matching names in raw text. Manage WASM/model/geometry resources.
- [x] **Step 4: Implement worker and Engine preview.** Serve pinned WASM locally; move open/index/mesh operations into a dedicated worker with progress and cancellation/disposal. Transfer buffers, serialize errors, and provide retry. Use That Open's world/camera/renderer to display only representative geometry, preserve geometry transforms/units, recenter the isolated asset, fit the camera, and dispose meshes/materials/controls on replacement/unmount. Avoid converting every building element just to inspect a type.
- [x] **Step 5: Verify BS19 in a real browser.** Run focused tests and typecheck, then use Playwright CLI on the minimal validation page. Process BS19, confirm `Air quality sensor` and the known type GUID occur in the real catalog, select a representative and verify nonempty rendered geometry/properties. Record elapsed processing time, actual counts, browser errors, and screenshot evidence. If this fails, diagnose and fix the browser path; do not silently move processing to the server or substitute mock data.
- [x] **Step 6: Commit.** Commit with `feat: index IFC asset types and preview representative geometry`.

### Task 3: Content Catalog-inspired UI, integration and delivery

**Files:** Create `src/library/api.ts`, `src/library/useLibrary.ts`, `src/components/LibrarySidebar.tsx`, `src/components/AssetGrid.tsx`, `src/components/AssetInspector.tsx`, `src/components/UploadDialog.tsx`, supporting focused components, `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `index.html`, and `tests/library-ui.test.tsx`. Replace the Task 2 validation entry with the production library flow; update `README.md` and `docs/verification.md`.

**Interfaces:**
- Consumes: the Task 1 API/shared contracts and Task 2 worker/preview components.
- Produces: the complete runnable local MVP, documented startup commands, and verified source/upload/inspection/removal behavior.

- [ ] **Step 1: Write focused failing interaction tests.** Verify filtering real supplied catalog records, selection and read-only property display, empty/failed/indexing states, and stale asynchronous selection results being ignored. Verify model removal cannot be undone by a late indexing result. Use testing-library for DOM behavior; do not duplicate rendering implementation assertions.
- [ ] **Step 2: Build the catalog workspace using frontend-design.** Apply the UI direction and locally bundled fonts/icons. Load model inventory, select BS19 initially when available, index only requested models, persist matching indexes, and reuse cached metadata while opening the correct IFC for inspection. Category filtering/search, grid/list modes, upload progress, processing retry, clear removal confirmation, properties and representative preview must be live. Expose skipped/untyped counts and model status without invented statistics or thumbnails.
- [ ] **Step 3: Integrate lifecycle and responsiveness.** Serialize heavy model work, cancel or ignore stale requests on selection/removal, preserve existing catalog data on failed previews, and close resources. Handle upload validation/network errors, no available files, missing source roots, and models without preview geometry. Ensure keyboard focus, accessible dialogs, status announcements, reduced motion, and usable layout at desktop/tablet/narrow widths.
- [ ] **Step 4: Verify GREEN and production build.** Run `npm test`, `npm run typecheck`, and `npm run build`. Use Playwright CLI against the running app for actual BS19 indexing, category filtering, property inspection, real geometry preview, and desktop/mobile screenshots. Use a small real IFC upload to verify persistence across service restart, hide it, restart again, and verify it stays hidden while its file exists. Test invalid upload feedback. Record console/network errors and results in `docs/verification.md`; fix observed defects.
- [ ] **Step 5: Finish delivery docs and commit.** Explain Node prerequisite, `npm install`, `npm run dev`, production build/start, local URLs, root/data directory overrides, retention/removal behavior, and any measured performance limits. Update the review docs' implementation status accurately without claiming broader model support. Commit with `feat: deliver local IFC asset catalog workspace`.

## Execution and review

The user explicitly requested writing-plans followed by subagent-driven-development and frontend-design. Publish this plan link and proceed using that method; do not add another approval gate. Use one fresh implementer per task, task-scoped spec/quality review after each task, and a final whole-project review. Keep a plan-scoped progress ledger, briefs, reports, commit ranges, and rulings. No parallel implementation writers. The repository was previously empty of code and had no Git repository; it is initialized on a dedicated `feat/asset-browser-mvp` branch in the shared project directory, with no existing branch or implementation to disrupt.

Self-review: tasks cover all eight acceptance checks, both classification sources, type identity, persisted storage/visibility, real preview and failures, and the agreed exclusions. Task interfaces use the same shared contracts and worker signatures. Runtime schemas own JSON/IPC types; resource lifetimes and stale results have explicit tests. BS19 browser feasibility precedes the full catalog UI. No broad cloud backend or FM integration is introduced.
