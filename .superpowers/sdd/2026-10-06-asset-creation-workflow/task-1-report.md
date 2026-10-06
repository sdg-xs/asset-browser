# Task 1 report

Status: complete. Implemented discovery, creation-purpose worker transport, and additive source inventory persistence on `feat/asset-creation-workflow` from clean baseline `a7889d6`. No selective catalog import or creation frontend was implemented.

## Interfaces

`shared/asset-creation.ts` exports Zod-derived `CreationIdentity`, `CreationCandidate`, `CreationIndex` and their PascalCase schemas. `CreationIdentity` is `{ kind: "type"; globalId: string } | { kind: "element"; globalId: string }`. `creationCandidateKey(identity)` returns `type:<globalId>` or `element:<globalId>`.

`CreationCandidate` contains `key`, `identity`, readable `name`, `ifcClass`, `categories: string[]`, `classificationIssues: string[]`, `occurrenceIds: number[]`, and `representativeId: number`.

`CreationIndex` contains `schemaVersion: 1`, `modelId`, `fingerprint`, `candidates`, and `stats: { elements, candidates, classified, unclassified, untyped }`. All counts are nonnegative integers. `elements` counts physical occurrences; all other counts count candidates. Classified means at least one unambiguous effective nonblank/non-NA classification among the candidate's occurrences. Untyped means an element-identity candidate. Candidate categories are deduplicated actual classifications. A type can contain multiple valid classifications across different occurrences.

`LibraryModel` gains optional `creationIndex: CreationIndex`; missing means legacy/not analyzed for creation. Source revision refresh removes the creation index along with invalidating the ordinary browse index.

`IfcReader.open(bytes, model, progress?, purpose?)` preserves the old argument positions. Fourth argument is optional `"browse" | "creation"`, default `"browse"`. `IfcReader.discoverAssets(progress?): CreationIndex` uses the open source. Ordinary browse mode preserves existing classification rejection and classified catalog behavior. Creation opening retains ambiguous/unsupported classification metadata and excludes those ambiguous occurrences from its compatible classified CatalogIndex. Discovery includes every physical IFCELEMENT occurrence, independent of classification or a usable type, and excludes spatial containers/project/spaces.

`IfcWorkerClient.openModel({ model, fileUrl, onProgress?, purpose? })` accepts the same purpose and caches by source identity, revision, and purpose. `IfcWorkerClient.discoverAssets({ modelId, onProgress? }): Promise<CreationIndex>` requires an open matching model and validates the returned source/revision and schema. Worker requests gain `kind: "discover"`; responses gain `kind: "creation-index"`. The worker clears its prior model before a replacement open and validates incoming requests. The client validates worker responses.

`LibraryApi.saveCreationIndex(index: CreationIndex): Promise<CreationIndex>` is required. `PUT /api/models/:id/creation-index` returns the CreationIndex directly. `LibraryStore.saveCreationIndex(id, index): Promise<CreationIndex>` serializes through the existing inventory queue, guards matching model ID/current fingerprint, and commits atomically. Schemas reject duplicate candidate keys, keys inconsistent with identities, empty/invalid/repeated members, members shared across candidates, representatives outside their candidate, element candidates with multiple occurrences, and counts inconsistent with membership/classification. Existing browse indexes are not required or replaced by this operation.

## Fixtures and tests

Actual web-ifc parsing uses the unchanged `tests/fixtures/assets.ifc`. Focused valid STEP variants are derived in memory for a separate blank-classification type, IFCSPACE, conflicting/unsupported type values, conflicting instance values, unnamed untyped identity, and a malformed component missing GlobalId. The API uses the existing isolated `libraryFixture()` temporary source/data roots and dynamically allocated localhost ports. No original IFC or normal `.local-data` files were modified.

Added `tests/asset-creation-discovery.test.ts` and `tests/asset-creation-transport.test.ts`. Extended `tests/library-api.test.ts` with creation persistence, invalidation, and rejected-write behavior. Existing UI source API fixtures only gain the required additive method; their assertions remain intact. The transport harness substitutes the browser Worker boundary while exercising actual client/protocol/schema behavior. Discovery tests use the real WASM parser. The production worker also bundles successfully.

## TDD evidence

1. `npm test -- tests/asset-creation-discovery.test.ts tests/library-api.test.ts --maxWorkers=2`: first run produced 9 failures and 23 passes. Four discovery cases failed because `discoverAssets` did not exist, two ambiguous creation-opening cases still threw Conflicting/Unsupported classification errors, and three creation API cases returned 404. See `task-1-red.log`.
2. Implemented schemas, reader discovery/tolerant opening, and source API persistence. Same command then passed 32 tests. See `task-1-green-initial.log`.
3. Transport regression run `npm test -- tests/asset-creation-transport.test.ts --maxWorkers=2` produced 2 failures and 3 passes: mismatched-source and mismatched-fingerprint creation responses resolved instead of rejecting. Added matching-source/revision guards; targeted run passed. See `task-1-transport-red.log`.
4. Self-review reproduced missing cleanup after malformed GlobalId discovery. `npm test -- tests/asset-creation-discovery.test.ts --maxWorkers=2` produced 1 failure and 7 passes: `properties(30)` still succeeded after discovery failed. Added reader close-on-discovery-error; targeted run then passed. See `task-1-state-red.log`.
5. Initial strict typecheck identified only the two existing UI fixtures missing the newly required `saveCreationIndex`. Added the required method without weakening assertions. Final strict check passed.

## Successful verification

- `npm test -- tests/asset-creation-discovery.test.ts tests/asset-creation-transport.test.ts tests/ifc-reader.test.ts tests/ifc-library-analysis.test.ts tests/catalog.test.ts tests/library-api.test.ts tests/library-store.test.ts --maxWorkers=2`: 7 files, 72 tests passed, 5.70 seconds. See `task-1-targeted.log`.
- `npm run typecheck`: exit 0; `tsc --noEmit` under the repository's strict, noUncheckedIndexedAccess, and exactOptionalPropertyTypes settings. See `task-1-typecheck.log`.
- `npm run build`: exit 0; WASM copy, strict typecheck, server compilation, and Vite worker/application bundling succeeded. Vite build took 15.42 seconds. See `task-1-build.log`.
- `npm test -- --maxWorkers=2`: 14 files, 201 tests passed, 13.19 seconds. The baseline had 185 tests; this task adds 16. See `task-1-full-suite.log`.
- `git diff --check`: exit 0, no whitespace errors. Git reports Windows LF-to-CRLF normalization notices.

Commands were run sequentially so parser/test/build workers did not compete. Logs are confined to this task directory and contain bounded output. Build and full test warnings are Three.js CommonJS deprecation, dependency `use client` directives, and large bundle chunks, with no failed checks.

## Self-review and concerns

Reviewed stable identity separation, blank instance override, unsupported/conflicting classifications, element/type grouping, count consistency, invalid member ownership, persisted rejection atomicity, source revision invalidation, worker purpose caching, reader cleanup, and existing WASM release paths. The invalid-index API test reads exact `library.json` bytes after each of ten rejected writes and proves the inventory remains unchanged. Creation-purpose conflicts do not fabricate category values. A type with multiple valid occurrence-level classifications retains the real values in `categories`; ambiguity within one occurrence becomes reviewable `classificationIssues`.

No task-blocking concerns remain. The source inventory boundary validates structural candidate membership; it does not reparse IFC bytes server-side to prove express IDs because parsing remains the browser worker's responsibility. Creation-reference previews and the creation dialog must explicitly request `purpose: "creation"` in later frontend work. Existing `librarySnapshot()` remains classified browse analysis; Task 2 must add selective candidate analysis for blank/untyped candidates. The reader closes on malformed discovery failures, including invalid identity/schema data.

Normal `.local-data`, original source IFC files, controller ledger, and the root checkout remain untouched. No runtime dependencies, remote push, or subagents were used.
