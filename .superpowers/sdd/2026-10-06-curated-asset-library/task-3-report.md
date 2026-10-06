# Task 3 report: Persistent catalog service and API

Status: DONE

## Exact interfaces and API

`CatalogLibraryStore.create({dataRoot, models?}): Promise<CatalogLibraryStore>`, `.read(): Promise<CatalogLibrary>`, `.execute(command: LibraryCommand): Promise<CatalogLibrary>`. The optional `models` is the original `LibraryStore`; imports and explicit source rebinding require it. Creating with `{dataRoot}` supports persistence reads and catalog-only commands, but attempts to import/rebind fail with `SOURCE_VALIDATION_REQUIRED` rather than bypassing validation.

`mountCatalogLibraryRoutes(app: express.Express, models: LibraryStore, dataRoot: string): Promise<void>` creates the store with original model validation and mounts:

- `GET /api/catalog-library`: HTTP 200, complete schema-version-1 `CatalogLibrary`, `Cache-Control: no-store`.
- `POST /api/catalog-library/commands`: validated shared camelCase `LibraryCommand`, HTTP 200 with complete resulting `CatalogLibrary`. All shared command kinds are supported. Commands carry `expectedRevision`; revision comparison happens inside the serialized mutation queue before source checks. Repeat identical complete imports preserve revision and do not rewrite the catalog file.

Errors preserve the original `{error:{code,message}}` envelope. Domain issues are included in the message so failed batch approval explains incomplete entries. `REVISION_CONFLICT` is 409; domain `NOT_FOUND` is 404; `INVALID_COMMAND`/`PUBLICATION_INVALID` are 400. Malformed JSON/command schema uses existing `INVALID_REQUEST` 400. Forged snapshot or geometry references use `INVALID_SOURCE_REFERENCE` 400. Invisible/missing models use existing `MODEL_NOT_FOUND` 404; invalid model IDs use existing `INVALID_MODEL_ID` 400. Current disk fingerprint mismatches use `SOURCE_CHANGED` 409. Current index missing/stale uses `INDEX_REQUIRED` 409. Host, origin, query rejection, payload size limits and existing error middleware remain in force.

## Persistence and source validation

Catalog writes use a unique exclusive temporary file in the configured managed data directory, then atomic rename to `catalog-library.json`. The queue covers revision comparison, validation, domain application and publication. Memory changes only after rename succeeds. Temporary files are cleaned on success/failure; a failed command does not poison the queue. Read/execute responses are independent clones. Missing storage starts empty without writing. Invalid JSON, invalid schema or unsupported schema rejects startup with actionable `INVALID_CATALOG_STATE`, naming the catalog file and backup restoration; it never replaces corrupt bytes.

Original `library.json` structure, source paths and source-file handling are preserved. Unchanged catalog imports/edits do not rewrite original inventory bytes; inventory discovery/revision refresh retains its original behavior when sources change. No browser-supplied path is used by catalog routes.

Imports require the complete current index: exact model fingerprint, source name, type GlobalIds and count, type names/classes/categories, and exact occurrence memberships. Domain validation also rejects repeated types/fields/memberships and field occurrences outside their type. Observation values remain browser analysis evidence; the API does not parse or manufacture IFC observations.

Explicit `confirmedSourceReferences` require current catalog source records, matching fingerprint, visible current indexed model/type and valid occurrence membership. Cached catalog memberships must also match the current index, so a browser cannot rebind a stale cached reference after an index changes. Repeated reference memberships are rejected by shared domain rules. Historical references retained by ordinary edits/archive/restore/merge remain revision-bound catalog data; approving or restoring does not silently refresh geometry or require the source to remain visible. Downstream preview must still validate inventory availability and fingerprint.

Bounded original store extension: `LibraryStore.withCurrentModels<T>(requirements: {modelId,fingerprint}[], operation: (models: LibraryModel[]) => Promise<T>): Promise<T>`. It uses the existing source queue directly, never reenters it, validates visibility/index plus an opened file's actual stat fingerprint, closes every opened handle in `finally`, and holds the source queue through catalog publication. Queue order is catalog queue, then model queue. Source methods never acquire the catalog queue. This prevents source hide/index updates from interleaving with validated publication. External filesystem writes retain the existing size/mtime fingerprint semantics and are detected when the guard checks current files; no hashing or external filesystem lock was added.

## Validation and self-review

Initial RED: `npm test -- --run tests/catalog-library-api.test.ts --maxWorkers=2`, 14 failed. Missing routes produced 404 instead of requested behavior; corrupt storage was incorrectly accepted because no catalog existed.

Initial GREEN: same command, 14 passed. Expanded tests cover cached-index rebinding, source queue ordering, actual concurrent hide/import, real atomic rename failure, queue recovery and response clone isolation. An unawaited asynchronous test assertion caused one test-only failure and was corrected.

Final focused: `npm test -- --run tests/catalog-library-api.test.ts tests/catalog-library.test.ts --maxWorkers=2`, 2 files, 49 tests passed. Catalog API tests total 18.

Full suite: `npm test -- --maxWorkers=2`, 10 files, 120 tests passed in 7.64s. Existing viewer dependency emitted `THREE_CJS_DEPRECATED`; catalog focused output was clean. `npm run typecheck` passed. Final source-store edit after checks only formatted the already-tested condition/error construction.

Self-review verified input boundary parsing, stale command priority, atomic failed batches, idempotence, restart/restore, hidden approved retention, exact source type/membership checks, changed disk 409, handles closed, source queue ordering, real failed publication recovery and cloned responses. No dependencies, unsafe casts, non-null assertions or unrelated UI changes. Catalog modules/tests formatted with temporary pinned Prettier without package edits. Root's pending plan change is excluded from the commit; its existing EOF whitespace finding is unrelated.

Owned files: server/catalog-library-store.ts, server/catalog-library-routes.ts, server/app.ts mount-only edit, server/library-store.ts bounded guard extension, tests/catalog-library-api.test.ts, this report. No blocking concerns.
