# Task 1 report: Catalog contracts and pure curation rules

Status: DONE

## Implementation

Added the schema-version-1 catalog domain without changing existing IFC, storage, UI, package manifests, or runtime dependencies. All new entries/source records/categories receive independent `crypto.randomUUID()` IDs. Mutations validate Zod command payloads, check expected revision, clone the state, and return an atomic result; failed commands leave the input unchanged. Repeat model/type/fingerprint imports return the original state and revision.

Imported entries are generic drafts with empty staff identity/specification overrides. Source observations and raw values remain in separate source records. Exact category labels seed canonical categories; suggestions do not become confirmed template mappings. Multiple distinct canonical categories leave the imported category unknown. Technical/placement/asset/product-identity fields are excluded from reusable specification suggestions, while the original observations remain available.

Normalization covers length, area, volume, power, flow, and voltage to m/m²/m³/W/m³/s/V, numeric tolerance 1e-9 relative with absolute floor 1e-9. Blank/missing markers differ from zero. Unsupported units/measures remain text with the original unit. Milli/mega prefix case is preserved. Product identity ignores blanks, NA/n-a equivalents, and exporter Revit; name/source hints never become confirmed identity.

Publication requires name/category and known curated or confirmed mapped source specifications for generic entries, or confirmed manufacturer/model. Unresolved source conflicts reject publication; an explicit specification override, including an explicit missing resolution, preserves the original source conflict trace. All requested batch entries validate before any approval. Merge retains the target definition, combines revision-bound occurrence references, archives absorbed entries, and returns the target to draft. Split uses confirmed variant mappings, partitions actual source memberships with tolerant value equality, archives the original, and creates independent drafts. Stale reference fingerprints cannot be split.

Refresh updates only source observations/revision and review flags; approved definitions and overrides remain approved and unchanged. Missing types become `current:false` source records and retain definitions. Old geometry reference fingerprints and occurrence memberships never silently change. An explicit edit with reviewed `confirmedSourceReferences` can rebind them to current valid memberships.

Explicit category aliases can consolidate separately imported canonical labels. Entries move to the selected canonical ID, source labels remain untouched, and absorbed template fields become retained suggestions for confirmation in the target template. Renaming retains the prior canonical name as an alias. Ambiguous collisions with unrelated aliases reject atomically.

## Exact downstream interfaces

`shared/catalog-library.ts` exports these Zod schemas and inferred types:

- `normalizedValueSchema` / `NormalizedValue`: `{kind:'missing'}` | `{kind:'number',value:number,unit:string}` | `{kind:'text',value:string,unit:string|null}`.
- `observedFieldSchema` / `ObservedField`: `{key,pset,name,measure,unit,values:[{rawValue,normalized,occurrenceIds}]}`. Use a stable Pset/name key. Missing occurrence values are detectable against the containing type occurrence list; each field membership must belong to that type and appear at most once.
- `sourceTypeObservationSchema` / `SourceTypeObservation`: `{typeGlobalId,name,ifcClass,categories:string[],occurrenceIds:number[],fields:ObservedField[]}`.
- `librarySnapshotSchema` / `LibrarySnapshot`: `{modelId,fingerprint,sourceName,types:SourceTypeObservation[]}`. Import expects the complete current analysis of one model, so absent previously imported types become noncurrent.
- `fieldMappingSchema` / `FieldMapping`: `{key,label,dataKind:'number'|'text',canonicalUnit:string|null,role:'specification'|'variant'}`.
- `catalogCategorySchema` / `CatalogCategory`: `{id,name,aliases:string[]}`.
- `categoryTemplateSchema` / `CategoryTemplate`: `{categoryId,mappings:FieldMapping[],suggestions:FieldMapping[]}`; only mappings are staff-confirmed.
- `identitySchema` / `CatalogIdentity`: `{value:string,confirmed:boolean}`.
- `editableDefinitionSchema` / `EditableDefinition`: `{name,description,kind:'generic'|'product',family:string|null,categoryId:string|null,tags:string[],manufacturer:CatalogIdentity,model:CatalogIdentity,specifications:Record<string,NormalizedValue>}`. Specifications are staff overrides; an absent key means no override, `kind:'missing'` is an explicit resolution.
- `sourceReferenceSchema` / `SourceReference`: `{sourceId,fingerprint,occurrenceIds:number[],equivalent:boolean}`. Reference order expresses preferred geometry source; only explicitly confirmed `equivalent:true` alternatives should be automatic geometry fallbacks. Reference fingerprint is independent from latest source fingerprint.
- `sourceRecordSchema` / `SourceRecord`: `{id,modelId,fingerprint,sourceName,revision:number,current:boolean,observation:SourceTypeObservation}`. `current` means present in latest imported analysis, not visible in the external source inventory. Downstream geometry must also validate actual inventory visibility/fingerprint and membership.
- `libraryEntrySchema` / `LibraryEntry`: `{id,definition:EditableDefinition,status:'draft'|'approved'|'archived',sourceReferences:SourceReference[],reviewFlags:('source-changed')[]}`.
- `catalogLibrarySchema` / `CatalogLibrary`: `{schemaVersion:1,revision:number,categories:CatalogCategory[],templates:CategoryTemplate[],sources:SourceRecord[],entries:LibraryEntry[]}`.
- `duplicateCandidateSchema` / `DuplicateCandidate`: `{entryId,confidence:'identity'|'specifications'|'name',differences:string[],missingEvidence:string[]}`. Names and unsupported units never produce strong equivalence evidence. Confirmed unequal identity appears in differences rather than being mislabeled missing.
- `fieldSuggestionSchema` / `FieldSuggestion`: `{key,status:'consistent'|'missing'|'conflicting',values:NormalizedValue[],missingOccurrences:number[]}`. `values` remains present even for partial-missing/conflicting observations; conflict resolution is derived from an explicit definition override rather than deleting the trace.
- `libraryCommandSchema` / `LibraryCommand`: discriminated by `kind`, all with `expectedRevision:number`:
  - `import`: `snapshot:LibrarySnapshot`.
  - `edit`: `entryId,definition:EditableDefinition,confirmedSourceReferences?:SourceReference[]`. Editing an approved definition returns it to draft. Optional reviewed references must identify current fingerprint and valid, nonrepeated occurrence memberships; providing them clears source-change flags. Approval alone never rebinds geometry.
  - `approve`, `archive`, `restore`: nonempty `entryIds:string[]`; restore returns to draft.
  - `merge`: `targetId,absorbedIds:string[]`.
  - `split`: `entryId,variantFieldKeys:string[]`; mappings must already be confirmed as variant.
  - `category`: `id,name,aliases:string[]`; upsert, rename, or explicit alias consolidation.
  - `template`: `categoryId,mappings:FieldMapping[]`; complete confirmed mappings, retaining unconfirmed suggestions.

`shared/catalog-rules.ts` public exports:

```ts
emptyCatalogLibrary(): CatalogLibrary
applyLibraryCommand(state: CatalogLibrary, command: LibraryCommand): CatalogLibrary
entryIssues(state: CatalogLibrary, entry: LibraryEntry): string[]
duplicateCandidates(state: CatalogLibrary, entryId: string): DuplicateCandidate[]
entryFieldSuggestions(state: CatalogLibrary, entry: LibraryEntry): FieldSuggestion[]
CatalogDomainError // Error subclass with .code and .issues:string[]
```

Stable error codes: `REVISION_CONFLICT` -> HTTP 409; `NOT_FOUND` -> 404; `INVALID_COMMAND` and `PUBLICATION_INVALID` -> 400. Server should parse unknown persisted state/requests through the exported Zod schemas and check snapshots against current inventory before applying an import.

`shared/catalog-normalization.ts` exports `normalizeObservation({value:string,measure:string,unit:string|null}):NormalizedValue`, `identityValue(value:string):string`, and `equalNormalized(left:NormalizedValue,right:NormalizedValue):boolean`. Analysis should translate IFC unit metadata into recognized symbols (m/mm/cm/km/ft/in, m²/mm²/cm²/ft² and ASCII equivalents, m³/mm³/l/ft³ and ASCII equivalents, W/kW/MW/mW, m³/s/l/s/l/min/m³/h and ASCII equivalents, V/kV/MV/mV). Unrecognized metadata stays explicit text; no implicit SI default when the unit is missing.

Focused internal modules expose helpers used by the facade, not additional payload contracts: catalog-errors, catalog-import, catalog-observations, catalog-review, catalog-split. These keep command mutation, normalization, aggregation, review/comparison, and partitioning separate.

## Validation and TDD evidence

RED command: `npm test -- --run tests/catalog-library.test.ts`.

- Initial missing-module failure was followed by a runnable schema/normalization scaffold with domain command stubs. Genuine behavior RED: `9 tests | 8 failed`, with `Catalog commands not implemented` for all import/curation scenarios; normalization passed independently.
- SI-prefix regression RED: `22 tests | 1 failed`, expected milliW value 0.001 but received 1000000. Fixed exact symbol lookup before case-normalized lookup.
- Alias and unknown-unit comparison RED: `24 tests | 2 failed`, category alias rejected and unsupported text assigned specification-confidence instead of name-confidence. Fixed explicit alias consolidation and unavailable comparable-unit evidence.
- Canonical membership RED: `25 tests | 1 failed`, aliased equivalent labels resulted in null category. Fixed unique canonical category IDs.
- Confirmed identity evidence RED: `26 tests | 1 failed`, unequal manufacturers/models produced no visible differences. Fixed explicit identity comparison evidence.

GREEN: final focused command -> `1 file passed, 26 tests passed`, 602ms. Tests cover requested domain scenarios plus every unit family, missing membership, exact category seeding, confirmed products, removed sources, explicit revision rebinding, invalid atomic imports, restore, template confirmation, unsupported units, aliases, and identity differences.

`npm run typecheck` -> passed, including final schema type naming cleanup.

`npm test` -> `8 files passed, 79 tests passed`, 65.23s before final regression additions. Long startup was mainly jsdom environment initialization, not a catalog failure.

Final `npm test -- --maxWorkers=2` -> `8 files passed, 81 tests passed`, 6.87s. Existing THREE_CJS_DEPRECATED warning remains in viewer tests; focused domain output is clean. No unrelated processes were killed.

`git diff --cached --check` -> passed.

## Files and self-review

Owned files: shared/catalog-library.ts, shared/catalog-normalization.ts, shared/catalog-rules.ts, shared/catalog-errors.ts, shared/catalog-import.ts, shared/catalog-observations.ts, shared/catalog-review.ts, shared/catalog-split.ts, tests/catalog-library.test.ts, this task report.

Applied TypeScript/type-system discipline: authoritative Zod-derived contracts, unknown request validation at boundary, discriminated variants, exhaustive command switch, no any/unsafe casts/non-null assertions. Formatted using temporary pinned Prettier execution without modifying package.json/package-lock.json or adding dependencies. Reviewed all owned modules and staged whitespace diff. Fixed self-review findings concerning unit prefix case, duplicate identity evidence, category alias consolidation, and alias-equivalent membership. Retained revision-bound references and isolated error module to avoid import cycles.

No unresolved correctness concerns. Inventory-driven geometry availability, stale snapshot rejection against inventory, persistence serialization, worker extraction, and UI remain downstream tasks by design. Do not treat `source.current` or an approved catalog lifecycle alone as permission to preview a refreshed source reference.
