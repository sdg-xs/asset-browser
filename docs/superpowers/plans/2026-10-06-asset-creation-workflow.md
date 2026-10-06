# Asset creation workflow implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let staff upload one-asset or multi-asset IFC files from Library, select maintainable component candidates, finalize their classifications and parameters in Needs review, and approve eligible definitions into Library.

**Architecture:** Retain the existing classified source index and add a separate creation candidate index that includes unclassified and untyped physical components. Persist the complete candidate analysis with an explicit selected-candidate import command, preserving existing library UUIDs, observations and revisions. A guided creation dialog uses the existing upload service and IFC worker; existing review and preview components consume both legacy typed sources and new component sources.

**Tech Stack:** Existing React 19, strict TypeScript, Vite, Express, Zod, web-ifc, That Open Components and Three.js. No new runtime dependency or framework upgrade.

**Spec:** `docs/superpowers/specs/2026-10-06-asset-creation-workflow-design.md`

## Global Constraints

- The application remains staff-only and local-first.
- Library is the default front page and the primary browsing surface. Its primary creation action is Upload IFC.
- IFC files may contain one asset or multiple assets.
- Generic Hard Asset supplies the asset classification. A present instance value wins, including a blank value; the type value is used only when the instance parameter is absent.
- A library card represents a reusable asset type or specification variant. It does not represent every installed occurrence.
- Upload and analysis never automatically approve definitions.
- Generic definitions require a readable name and canonical category. Product definitions additionally require confirmed manufacturer and model. Unknown specifications remain permissible for the MVP.
- Area, Volume, Length, Comments, System and Diameter are the current retained starter properties. Existing staff exclusions remain effective across imports.
- Original IFC values and references remain in collapsed Source details. Only review and editing show unresolved conflicts.
- Existing approved content, source files, exclusions, source references and curated decisions are preserved.
- FM integration, placement, maintenance scheduling, installed-asset registers, RFA support, cloud deployment and geometric authoring remain outside this build.
- Do not mutate normal `.local-data` or original IFC files during implementation/verification. Use an isolated data root and port for write verification.
- No new runtime dependency or framework upgrade. No remote push is part of this task.
- Implementers must not spawn subagents. Use relevant meaningful regressions, TDD and the existing frontend style; retain card, centered-dialog, keyboard and source-browser behavior.

## Review Focus

- An IFC without a type relationship or Generic Hard Asset still offers a named physical component for staff review; Task 1 real-parser tests and Task 2 element import/preview tests own this.
- Repeating selection after a same-revision import can add previously unselected candidates without duplicating approved or archived definitions; Task 2 domain/API tests own this.
- Switching source revisions or canceling while upload/analysis/import is in flight does not save stale analysis, create unchecked drafts or report canceled work as success; Task 3 deferred-promise UI tests own this.
- Existing legacy typed references and newly imported element references resolve only to their revision-bound membership; Task 2 reference/preview tests own this.
- Batch approval contains eligible and incomplete selections; eligible definitions are explicitly approved and incomplete selections remain reviewable with concrete reasons, with no claim of full success; Task 3 UI tests own this.

## File ownership and task interfaces

Task 1 owns creation metadata discovery, its worker transport and the additive source inventory index. Task 2 owns selection-aware catalog persistence, element identity and preview/reference integration. Task 3 owns the guided Library creation UI and review finalization. Task 4 owns delivery evidence and documentation.

Typed and element identities are different domain cases. Never encode an element GUID or synthetic key as if it were an IFC type GlobalId. Legacy classified source indexes continue to contain real IFC types only.

### Task 1: Discover and persist creation candidates

**Files:**
- Create: `shared/asset-creation.ts`, `src/ifc/creation-catalog.ts`, `tests/asset-creation-discovery.test.ts`.
- Modify: `shared/contracts.ts`, `src/ifc/reader.ts`, `src/ifc/protocol.ts`, `src/ifc/client.ts`, `src/ifc/worker.ts`, `src/library/api.ts`, `server/library-store.ts`, `server/app.ts`.
- Modify test source API fixtures where the required additive method is introduced; preserve all existing tests.
- Use actual parser fixtures under `tests/fixtures/`; add focused IFC fixtures or derive valid variants of the existing real STEP fixture.

**Interfaces:**
- Produces `CreationIdentity = { kind: "type"; globalId: string } | { kind: "element"; globalId: string }`, schema-derived.
- Produces `creationCandidateKey(identity: CreationIdentity): string`, with stable keys `type:<globalId>` and `element:<globalId>`.
- Produces schema-derived `CreationCandidate` with `key`, `identity`, `name`, `ifcClass`, `categories: string[]`, `classificationIssues: string[]`, `occurrenceIds: number[]`, and `representativeId: number`.
- Produces schema-derived `CreationIndex` with `modelId`, `fingerprint`, `candidates`, and counts of physical elements, candidates, classified candidates, unclassified candidates and untyped candidates. Counts distinguish candidates from occurrences.
- Adds optional `creationIndex: CreationIndex` to `LibraryModel`; absence means a legacy source not yet analyzed for creation.
- Adds `IfcReader.discoverAssets(progress?: Progress): CreationIndex` after `open`, and `IfcWorkerClient.discoverAssets({ modelId, onProgress? }): Promise<CreationIndex>`.
- Add optional `purpose: "browse" | "creation"` to worker `openModel` requests, defaulting to browse. Reader opening accepts the same optional purpose without changing existing argument positions. Creation purpose retains ambiguous classifications as candidate issues instead of failing before discovery; browse behavior stays compatible. The creation dialog and creation-reference previews explicitly request creation purpose.
- Adds required `LibraryApi.saveCreationIndex(index: CreationIndex): Promise<CreationIndex>` and `PUT /api/models/:id/creation-index`, guarded by current fingerprint and serialized inventory writes.

- [x] **Step 1: Write failing behavioral tests.** Real-parser discovery must include a classified typed component, a blank-classification typed component and an untyped component, with different type/element identities. Two occurrences of one real IFC type form one candidate. Instance blank overrides type classification. IFC spaces/project/spatial containers are not candidates. Malformed files fail without retained reader state. Posting a stale, duplicate-key or invalid-member creation index rejects without changing inventory.
- [x] **Step 2: Run the tests and record the actual failures.** Run `npm test -- tests/asset-creation-discovery.test.ts tests/library-api.test.ts --maxWorkers=2`.
- [x] **Step 3: Implement discovery and transport.** Reuse existing relationship/property traversal and normalization. Discovery does not require classification or IFC type. Preserve source/type names where available and a readable IFC class fallback for unnamed components. Surface ambiguous classification as reviewable metadata rather than causing the whole creation flow to disappear. Keep the old `open()` classified index compatible. Validate schemas at worker/API boundaries and release WASM handles as before. Validate candidate membership, representative membership and stable identity keys in the source inventory boundary.
- [x] **Step 4: Run relevant tests and strict typecheck.** Run discovery, existing reader/catalog and source API/store suites plus `npm run typecheck`. Demonstrate rejected writes preserve the persisted source inventory. Update fixtures only to implement the additive API method; do not weaken existing assertions.
- [x] **Step 5: Commit and report.** Commit all Task 1 code/tests with `feat: discover maintainable asset creation candidates`. The report must give exact interfaces, fixtures, failures-before-fix, successful commands and compatibility concerns.

### Task 2: Import only selected candidates and support element sources

**Files:**
- Modify: `shared/catalog-library.ts`, `shared/catalog-import.ts`, `shared/catalog-rules.ts`, `server/catalog-library-store.ts`, `src/ifc/analyze-library.ts`, worker protocol/client/reader, `src/catalog/useDefinitionPreview.ts`, `src/catalog/ReviewDialog.tsx`, `src/catalog/DefinitionInspector.tsx`, `src/library/useLibrary.ts`, `src/components/AssetInspector.tsx`.
- Inspect only: `shared/catalog-references.ts`; its source UUID/fingerprint keys and occurrence memberships already support both typed and element observations.
- Create: `shared/catalog-source-identity.ts`, `tests/asset-creation-import.test.ts` and focused preview/API regressions.

**Interfaces:**
- Consumes Task 1 `CreationIndex`, candidate keys and worker discovery.
- Extend source observations as a validated union: legacy typed observation has `typeGlobalId: string`; element observation has `typeGlobalId: null` and required `elementGlobalId: string`. Common name/class/category/membership/field properties remain compatible. Add `sourceObservationKey(observation): string`, returning Task 1 stable identity keys.
- Permit analysis version 3 in source records/snapshots alongside existing version 2. Version 3 denotes complete creation discovery and observation membership; legacy imports remain valid.
- Adds `IfcWorkerClient.analyzeAssets({ modelId, onProgress? }): Promise<LibrarySnapshot>` and reader equivalent. It analyzes every discovered candidate into the existing snapshot `types` container, preserving nullable type versus element identity rather than fabricating types.
- Adds command `{ kind: "import-selected"; expectedRevision: number; snapshot: LibrarySnapshot; candidateKeys: string[] }`. Keys must be unique, nonempty and members of the complete version-3 creation analysis.
- `importSnapshot` may accept selected candidate keys internally. Persist all complete observations but create definitions only for explicitly selected candidates. Importing a previously observed but unselected candidate later must create its draft once. Existing entries, including archives, are not automatically recreated.
- Extends preview asset typing to a discriminated legacy real-type asset or an element asset with `typeGlobalId: null` and `elementGlobalId`; preserve common viewer fields and existing Sources behavior.

- [x] **Step 1: Write failing domain/API and preview tests.** A complete analysis with two candidates selected down to one creates one draft, no approvals, and preserves observations. Subsequent same-revision selection of the second creates it without duplicating the first. Repeating a selection is idempotent and does not recreate archives. Blank category remains a draft with a specific approval blocker. Two untyped elements with different GUIDs remain distinct source identities. Invalid selection, stale source revision and altered snapshot membership reject atomically. Typed legacy approval and untyped revision-bound geometry both continue to work; changed/unselected occurrences cannot enter a preview or rebind.
- [x] **Step 2: Run tests and record failures.** Run `npm test -- tests/asset-creation-import.test.ts tests/catalog-library-api.test.ts tests/curated-library-ui.test.tsx --maxWorkers=2` with bounded logs.
- [x] **Step 3: Implement import and identity integration.** Validate complete creation snapshot metadata against the persisted current creation index through the existing source/catalog serialization boundary. Match sources by `sourceObservationKey`, preserve their existing UUIDs for legacy real types, and avoid marking unrelated element sources absent during a legacy typed-only analysis. Same-fingerprint transition from legacy version 2 to complete version 3 must preserve curated overrides and flag changed source observations. Update reference, split/merge and geometry review consumers for nullable type identities. Opening a new element preview must check a fresh worker creation index against the saved candidate identity and exact allowed subset. Raw details label Element versus Type truthfully.
- [x] **Step 4: Verify domain/API/preview behavior and typecheck.** Run all catalog domain/API, relevant reader/analysis and curated UI/preview tests plus `npm run typecheck`. Confirm startup reads old schema-1 catalog files and retains source UUIDs, approvals, exclusions and frozen published values.
- [x] **Step 5: Commit and report.** Commit as `feat: import selected asset candidates into review`. Report interfaces, actual passing commands and compatibility/migration evidence.

### Task 3: Build Library upload and focused asset finalization

**Files:**
- Create: `src/catalog/AssetCreationDialog.tsx`, `src/catalog/useAssetCreation.ts`, `tests/asset-creation-ui.test.tsx`.
- Modify: `src/catalog/CatalogWorkspace.tsx`, `src/catalog/CatalogSidebar.tsx`, `src/catalog/EntryEditor.tsx`, `src/catalog/DefinitionInspector.tsx`, `src/styles.css`, existing curated UI fixtures as needed.
- Read/apply `$frontend-design` and its implementation-patterns reference. Retain existing IBM Plex, charcoal/teal palette, spacing, native dialogs, focus return and responsive behavior.

**Interfaces:**
- Consumes `LibraryApi.upload`, `saveIndex`, `saveCreationIndex`, worker `openModel`, `discoverAssets`, `analyzeAssets`, and catalog `import-selected`.
- Produces a focused `useAssetCreation` hook and `AssetCreationDialog` with typed finite stages for file choice, uploading, analyzing, selection, importing, failure and completion; avoid contradictory boolean bags.
- Dialog props: source API, catalog revision/execute callback, analysis worker factory, close callback, and success callback that opens Needs review only after confirmed persistence.
- Keep existing advanced Sources analysis available. Add explicit Upload IFC action in both populated and empty Library. Staff do not need to visit Sources to create assets.

- [x] **Step 1: Write failing UI behavior tests.** From empty/populated Library, Upload IFC opens a labeled dialog and accepts an IFC file. Upload/analysis produce candidate selection rather than automatically saved drafts. Classified candidates may be initially selected; unclassified/context candidates require explicit selection. One-asset flow uses the same stages. Import sends only selected keys and opens Needs review after success. Empty selection cannot import. Cancel during delayed upload/analysis/import disposes workers and ignores late completions; an already submitted atomic import may complete, so never claim it was rolled back. Invalid files and API revision conflicts are actionable and retry does not silently reuse stale selections. Mixed eligible/incomplete selected approvals publish the eligible subset with honest counts and retain incomplete drafts/reasons.
- [x] **Step 2: Run the new tests and record actual failures.** Run `npm test -- tests/asset-creation-ui.test.tsx --maxWorkers=2`.
- [x] **Step 3: Implement the guided frontend.** Use a prominent Library header upload action and an accessible, keyboard-operable creation dialog. Show file name, progress, detected asset types/candidates, occurrence counts, classification and clear review-required labels. Page candidate lists at 50 and keep explicit selection across pages, with a global count and no accidental selection of offscreen unchecked candidates. For large full-model files, avoid repeated full candidate scans per rendered row. Review focuses on name, canonical Generic Hard Asset classification, preview, generic/product identity and applicable source properties. Provide a clear route to Categories when a missing category cannot be selected; do not invent classification. Keep Unknown distinct from known values, maintain explicit conflict resolution, and retain original data only in collapsed Source details. Reject uses Archive. For batch approval, preflight current selections, explicitly submit eligible IDs, display skipped reasons and selected/approved counts, and preserve stale-revision safeguards. Keep no-eligible selection actionable without submitting an empty command.
- [x] **Step 4: Verify UI tests and typecheck.** Run new creation UI and existing curated/source/viewer UI suites plus `npm run typecheck`. Check native dialog dismissal, Escape, focus return, loading announcements, errors, narrow-screen layout and source preview fallbacks. No user-facing implementation jargon or FM workflows.
- [x] **Step 5: Commit and report.** Commit as `feat: create assets from the library upload workflow`. Report exact UI flow and cancellation/batch behavior, test commands and frontend design choices.

### Task 4: Verify the complete workflow and document delivery

**Files:**
- Modify: `README.md`, `docs/requirements-review.md`, `docs/project-context.md`, `docs/architecture-review.md`, `docs/verification.md`, approved workflow spec status and this plan's checkboxes.
- Test: focused end-to-end regressions where actual verification exposes a defect; keep screenshots, scripts, full logs and data in ignored `output/asset-creation-delivery/`.

**Interfaces:**
- Consumes completed Tasks 1-3 and the existing local server configuration. Uses a separate local data root and service port 3002, checking ownership before starting/stopping services. Never replace normal catalog data with a test catalog.

- [x] **Step 1: Verify real IFC flows.** With Playwright, upload a real small single-asset IFC and a real multi-asset IFC, including an untyped or unclassified physical component. Inspect actual geometry, select a subset, confirm drafts appear in Needs review and remain absent from Library, assign missing classification, finalize an unknown property and approve. Verify Library then shows approved content with collapsed Source details. Exercise rejection, repeat import, canceled analysis, a rejected stale mutation, restart persistence and keyboard focus. Existing full BS19/JV3 source imports/approved geometry remain compatible; record evidence separately from controlled small fixtures.
- [x] **Step 2: Run final gates.** `npm test -- --maxWorkers=2`, then `npm run build`, sequentially, with output redirected to bounded log artifacts. Capture command exit codes and test totals. Existing dependency warnings are documented baseline limitations, not claims of new regressions.
- [x] **Step 3: Document actual behavior.** Update docs around Library-first asset creation, classification, review and explicit approval. Record what was actually verified, dataset sizes, approved/draft counts and remaining limits. Do not present planned behavior as delivered or alter original model files.
- [x] **Step 4: Commit and report.** Commit as `docs: verify library asset creation workflow`. Report real browser evidence, final gate results, task-owned process IDs, exact limitations and clean Git status.

## Plan self-review

Spec coverage: discovery/classification selection belongs to Task 1; persistence, identities, idempotence and geometry membership belong to Task 2; upload/review/approval/navigation/parameters belong to Task 3; lifecycle preservation, real examples and delivery documentation belong to Task 4. All five Review Focus conditions have named regression owners. Interfaces retain legacy typed data while explicitly representing element identity. No task requires arbitrary single-asset export or assembly authoring. Implementation judgment may split focused helpers without widening this scope.
