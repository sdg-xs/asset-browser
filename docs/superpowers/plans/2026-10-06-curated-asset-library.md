# Curated asset library implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace source-model browsing as the main experience with a persistent, staff-curated catalog of reusable product and generic specification variants.

**Architecture:** Keep IFC inventory/index/worker/viewer intact and add a catalog domain and persistent catalog service. Worker analysis supplies compact reusable observations; independent catalog entries retain staff overrides and reviewed source references. React provides Library, Needs review, Categories and Sources workspaces.

**Tech Stack:** Existing Node 24, TypeScript strict, React 19, Express 5, Zod 4, web-ifc 0.0.78, That Open Components/Three, Vitest and Playwright CLI. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-06-curated-asset-library-design.md`

## Global constraints

- Staff-only, local-first; preserve original IFC files and existing `library.json` state.
- Persist new catalog in `catalog-library.json`, schema version 1, with serialized atomic writes and revision checks.
- Library cards use independent UUIDs; source GUID/Express IDs remain internal references.
- Main Library shows approved entries only; import, split and merge results require review.
- Missing values are unknown; instance presence takes precedence; unsupported units remain explicit.
- Staff confirms categories, template mappings, product identity, merges and approvals.
- Preserve card click side inspection and arrow centered preview, focus return and revision-bound downloads.
- No FM/placement/RFA/Nucleus, no manufactured library assets, no dependency upgrades.

## Review focus

- Same names with unequal cabinet dimensions must not auto-merge. Tasks 1/3/4 test this.
- Explicit instance blanks and missing numeric values must not inherit or become zero. Tasks 1/2 test this.
- Source replacement or removal must preserve curated definitions and avoid stale geometry identity. Tasks 3/4 test this.
- Late analysis, preview and stale mutation replies must not overwrite a later staff decision. Tasks 3/4 test this.
- Batch approval, split partitions and merge must be atomic and leave incomplete/conflicting entries visible for review. Tasks 1/3/4 test this.

## File map and shared interfaces

Create `shared/catalog-library.ts` for Zod contracts and derived types, `shared/catalog-rules.ts` for domain operations, and `shared/catalog-normalization.ts` for mappings/units. Create `src/ifc/analyze-library.ts` for extraction/aggregation, `server/catalog-library-store.ts` and `server/catalog-library-routes.ts` for storage/API, and `src/catalog/` for API/state and focused React components. Keep existing source modules available. Root `App.tsx` becomes the workspace shell; move the current source-only screen into `src/components/SourceWorkspace.tsx` with minimal behavior changes.

Task 1 owns the shared contract. Downstream tasks consume it rather than redefining payloads:

- `LibrarySnapshot`: `{ modelId, fingerprint, sourceName, types: SourceTypeObservation[] }`.
- Each `SourceTypeObservation`: `{ typeGlobalId, name, ifcClass, categories, occurrenceIds, fields: ObservedField[] }`. An `ObservedField` has stable `key` from Pset/name, `pset`, `name`, measure/unit metadata and distinct values carrying occurrence membership, raw value and normalized value. Missing occurrences remain detectable from the type's full occurrence list.
- `CatalogLibrary`: schemaVersion, revision, categories/templates, source records and entries. Source records separate observations from entry overrides and preserve current/source revision.
- `LibraryCommand`: discriminated union for `import`, `edit`, `approve`, `archive`, `restore`, `merge`, `split`, `category` and `template`, each carrying `expectedRevision`. `import` carries a snapshot; `edit` an entry ID and complete editable definition; `approve/archive/restore` entry IDs; `merge` target ID and absorbed IDs; `split` entry ID and confirmed variant field keys; `category` canonical ID/name/aliases; `template` category ID and confirmed field mappings. Export all schema-derived types.
- Export `emptyCatalogLibrary(): CatalogLibrary`, `applyLibraryCommand(state: CatalogLibrary, command: LibraryCommand): CatalogLibrary`, `entryIssues(state: CatalogLibrary, entry: LibraryEntry): string[]`, and `duplicateCandidates(state: CatalogLibrary, entryId: string): DuplicateCandidate[]` from catalog-rules. Domain errors have stable codes; server translates to 400/404/409.
- Export `normalizeObservation(input: { value: string; measure: string; unit: string | null }): NormalizedValue` from normalization. Values use a discriminated union for number with canonical unit, text and missing. Preserve raw values beside normalized observations.

### Task 1: Catalog contracts and pure curation rules

**Files:** Create shared/catalog-library.ts, shared/catalog-normalization.ts, shared/catalog-rules.ts, tests/catalog-library.test.ts. Split rules into focused shared modules if necessary, retaining the stated exports.

**Interfaces:** Produces all shared interfaces above. Use browser/server-compatible `crypto.randomUUID()` for new independent IDs. Store explicit editable overrides separately from source suggestions. Fields confirmed as variant define splits.

- [x] Write failing tests for: millimetre/metre equivalence; blank versus zero; unknown units retained; Revit/n-a identity ignored; conflicting occurrence values; generic/product publication requirements; same-name unequal cabinet candidates; idempotent import; merge retains target fields/combines references and returns draft; split partitions occurrence memberships and leaves drafts; approved overrides survive source update; bulk approval rejects entire batch if an entry is incomplete.
- [x] Run `npm test -- --run tests/catalog-library.test.ts` and record genuine RED failures.
- [x] Implement contracts/normalization/rules. Seed categories exactly from source labels, generic drafts and field suggestions. Product hints never become confirmed identity automatically. Source availability is derived separately from definition existence. Archive absorbed merge entries; keep review flags for changed observations. Staff resolution may override a conflict but preserves its trace.
- [x] Run focused tests and `npm run typecheck`, self-review, commit only task files. Write task report with exact produced interfaces for downstream workers.

### Task 2: Real IFC reusable specification analysis

**Files:** Create src/ifc/analyze-library.ts, tests/ifc-library-analysis.test.ts; modify src/ifc/reader.ts, protocol.ts, client.ts, worker.ts; extend tests/fixtures/assets.ifc only when needed to demonstrate a real defect.

**Interfaces:** Consumes Task 1 `LibrarySnapshot` contracts and normalization. Produces `IfcReader.librarySnapshot(progress?: Progress): LibrarySnapshot` and `IfcWorkerClient.analyzeLibrary({ modelId, onProgress? }): Promise<LibrarySnapshot>`. Add `analyze` request and `analysis` response to protocol; existing property/geometry/open behavior remains compatible.

- [x] Write failing real-parser tests: instance dimensions are reusable; explicit instance blanks suppress type fallback; property-set caching retains all classified occurrences; conflicting dimensions carry occurrence membership; source SI/conversion units normalize correctly; installation IDs/location fields are excluded from reusable suggestions; unsupported fields/units stay labeled; shared Psets do not lose membership.
- [x] Run `npm test -- --run tests/ifc-library-analysis.test.ts tests/ifc-reader.test.ts` and record RED.
- [x] Extend reader with cached typed property observations and source unit resolution. Analyze all classified typed occurrences, compact per field/distinct value rather than repeating panels; preserve original categories and raw values. Report progress every 250 occurrences, use the existing abort-by-worker-termination lifecycle, extract no geometry during analysis. Store opened catalog/model metadata needed for snapshots.
- [x] Add schema-validated worker/client protocol and errors. Run focused tests, strict typecheck, self-review and commit. Report snapshot size/time on a small fixture and known unsupported measure handling.

### Task 3: Persistent catalog service and source revision validation

**Files:** Create server/catalog-library-store.ts, server/catalog-library-routes.ts, tests/catalog-library-api.test.ts; modify server/app.ts only to mount catalog routes; use existing storage config/data root.

**Interfaces:** Consumes Task 1 contracts/rules. Produces `GET /api/catalog-library` -> CatalogLibrary and `POST /api/catalog-library/commands` -> CatalogLibrary. Produce `CatalogLibraryStore.create({dataRoot}): Promise<CatalogLibraryStore>`, `.read(): Promise<CatalogLibrary>`, `.execute(command: LibraryCommand): Promise<CatalogLibrary>`. Mounted routes share original LibraryStore for validating imported model/index/fingerprint/occurrence references; route factory signature `mountCatalogLibraryRoutes(app: express.Express, models: LibraryStore, dataRoot: string): Promise<void>`.

- [x] Write failing API tests for absent/valid persisted state, malformed body, stale expectedRevision HTTP409, concurrent mutations one winner, atomic batch approval, repeat imports, rejected forged model/type/occurrence references, changed fingerprint import409, hidden source retains approved catalog, restart and archived restoration. Verify original library.json bytes are not rewritten by catalog edits.
- [x] Run `npm test -- --run tests/catalog-library-api.test.ts` and record RED.
- [x] Implement serialized atomic catalog state file publication. Validate import against visible source index and file revision; support existing unchanged cached catalogs. No browser-supplied file paths. Domain codes map into existing error envelope. Corrupt persistence yields an actionable error without replacing it with empty state.
- [x] Run focused catalog/service tests, typecheck, self-review and commit. Report any source-store extension and exact API behavior.

### Task 4: Approved library, review workspace and category/source authoring UI

**Files:** Create src/catalog/api.ts, useCatalogLibrary.ts, CatalogWorkspace.tsx, CatalogSidebar.tsx, DefinitionCards.tsx, DefinitionInspector.tsx, EntryEditor.tsx, CategoryEditor.tsx and focused review dialogs; create src/components/SourceWorkspace.tsx; modify src/App.tsx, src/styles.css and minimal source hook integration; create tests/curated-library-ui.test.tsx. Preserve existing source-screen tests by moving their component import to SourceWorkspace rather than deleting tests or testing a hidden legacy main page.

**Interfaces:** Consumes Tasks 1–3, existing source Dependencies/useLibrary, AssetViewer/loader and native Dialog. Produce `CatalogWorkspace` mounted by App with default real dependencies and injectable catalog/source APIs/worker for behavior tests. `useCatalogLibrary` loads and mutates through catalog API, exposes pending/errors and rejects stale response replacement. SourceWorkspace can call `onImport(model: LibraryModel): Promise<void>` and display source processing; analysis uses a dedicated worker, disposed on cancel/unmount. Definition preview validates visible current model/fingerprint/type and occurrence subset, tries preferred then equivalent references, and preserves definitions on failure.

- [x] Apply frontend-design with existing HEMY tokens, local fonts and Autodesk Content Catalog direction. Read its implementation-patterns reference. Implement responsive Library/Needs review/Categories/Sources navigation and one main h1. Main Library defaults to approved entries across models, with category/search/source/kind filters, grid/list, readable variant specs and source availability. Add real empty states pointing to source analysis/review.
- [x] Write failing UI tests for approved-only landing; explicit source analysis/import and cancellation; editing/approval persisted state; bulk incomplete rejection; product suggestions stay unconfirmed; aliases/templates saved; duplicate comparison and merge confirmation; split resulting drafts; archive/restore; preferred geometry; hidden-source definition usable; arrow modal selected feedback; source changes avoid unrelated identity; stale catalog conflict refresh preserves unsaved editor values; unmount/late reply safety.
- [x] Run focused tests to record RED, then implement thin catalog API and state hook, workspace/components and source-screen relocation. Library editor shows curated fields first and raw/conflicting observations separately. Staff can resolve fields, choose product/generic, confirm template field role/unit mapping, review suggested aliases/duplicates and select source occurrence. Mutations have progress/error feedback; no silent optimistic approvals. Batch selection operates on filtered visible entries and is cleared/reconciled when records change.
- [x] Keep source upload/index/hide, worker disposal, revision conflicts and lazy viewer retry functional. Use native dialogs, labeled actions and focus return; mobile navigation and stacked inspector have no horizontal overflow; reduced motion respected. Avoid rendering hundreds of editors or canvas thumbnails at once.
- [x] Run curated UI tests plus existing library UI and viewer loader suites, full `npm test`, `npm run build`. Self-review and commit. Write report listing functional UI flows and test evidence, not promises.

### Task 5: Real-model delivery, documentation and final verification

**Files:** Modify README.md, docs/project-context.md, docs/requirements-review.md, docs/architecture-review.md and docs/verification.md. Add tests only for defects discovered during real verification; fixes belong in relevant modules. Keep output/playwright evidence ignored.

**Interfaces:** Consumes full delivered catalog. Runs isolated service on unused localhost port with task-owned data root initially; original sources read-only. Final deliverable must be usable from the normal repository checkout without moving original models.

- [x] Run the full suite, strict typecheck and production build. Use Playwright CLI to open real production UI, analyze/import BS19 and JV3 with recorded counts, size/time/progress and errors. Verify main Library initially contains no unapproved drafts. Curate actual records using category template and real specifications or confirmed identity, explicitly approve one, and verify curated values plus real geometry in side and centered preview.
- [x] Exercise reviewed duplicate differences, a specification conflict/split or real fixture equivalent, category mapping, preferred geometry fallback, restart persistence and source hide retention. Avoid claiming broad coverage from one sample; document exporter/unit and memory limits. Check desktop 1280x720 and mobile390x844, no horizontal overflow, native dialog Escape/focus and zero unexpected console errors. View screenshots.
- [x] Update docs to supersede source-model card organization with the approved catalog; document catalog API/schema/review flows and local-only model availability. Graphify refresh remains controller-owned after integration into the normal checkout; record that deferral and extraction limitations honestly.
- [x] Run final checks once after any fixes, commit task changes and report evidence paths. Controller performs whole-branch review before integrating into the normal checkout. No remote push is required by this request.
