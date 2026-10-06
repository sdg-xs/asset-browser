# Project context

The next proposed baseline is the [maintainable asset creation workflow](superpowers/specs/2026-10-06-asset-creation-workflow-design.md): Library is the front page and upload entry point; Generic Hard Asset supplies classification; staff finalize drafts in Needs review before approval. This design awaits written-spec review and is not yet implemented. [Domain vocabulary](../CONTEXT.md) defines asset as a maintainable building component and distinguishes reusable definitions from occurrences.

The approved scope changed on 2026-10-06 from source-type browsing to a persistent staff-curated catalog. [Requirements](requirements-review.md) and the [curated design](superpowers/specs/2026-10-06-curated-asset-library-design.md) supersede the original source-GUID card/read-only curation assumptions. Read [verification](verification.md) for evidence and limits, and check current Git status/tests when resuming.

## Delivered behavior

Library contains approved product or generic specification definitions, each with an independent UUID. Needs review contains imported drafts and approved entries whose sources changed. Published values remain frozen until explicit acceptance. Categories manages canonical labels, aliases and confirmed specification/variant mappings. Sources retains the original source browser, indexing, uploads, hide controls, geometry and raw IFC properties, and adds explicit reusable analysis/import.

Staff confirms category, specifications, product identity, merge decisions and approval. Source observations and curated overrides are separate. Same-name cabinets with different dimensions remain separate. Split and merge results return to draft. A hidden source retains original bytes and approved definitions; geometry becomes unavailable unless another reviewed equivalent source can supply it. IFC editing, FM, placement, RFA, Nucleus and commercial Platform integration remain deferred.

## Ownership and persistence

`shared/catalog-library.ts` owns the Zod schema and command union. `catalog-rules.ts`, `catalog-observations.ts`, normalization/import/publication/variant modules own domain decisions. `src/catalog/` owns catalog authoring, API/revision state and representative preview selection. The existing `src/library/`, IFC worker/reader and AssetInspector remain the source/geometry implementation.

`server/library-store.ts` retains source identities, indexes and visibility in `library.json`. `server/catalog-library-store.ts` persists `catalog-library.json`, schema version 1, through serialized atomic writes with revision checks. Catalog requests return full state. `SOURCE_CHANGED` protects downloads/indexes, and `REVISION_CONFLICT` protects staff decisions. No stale mutation is silently replayed.

IFC indexing and reusable observation analysis run in dedicated browser workers. That Open Components and Three.js render selected-occurrence web-ifc meshes without full-building Fragments conversion. Curated values lead the inspector; raw IFC remains read-only provenance.

## Local delivery

Use Node 24+, `npm run dev`, or `npm run build` then `npm start`. Configure `IFC_SOURCE_ROOT` for another computer. The default remains the external `PROPERTIES/<CODE>/IFC/*.ifc` folder. A fresh clone has no approved catalog until staff imports and approves real definitions. Original IFC files, managed uploads, catalog JSON and `output/playwright/` evidence are ignored local artifacts. Do not copy the validation catalog into normal managed data.

Task 5 used an isolated production service on port 3002 with a copied source index in `output/curated-validation-data`. Normal port 3001/data and source files were preserved. It imported BS19/JV3, curated an actual BS19 generic cabinet using source area/volume, and checked side/centered geometry. A small real-parser fixture separately exercised split, merge, revision conflict and confirmed fallback. See the task report for the exact final isolated state.

## Limits and navigation

Snapshots were about 20.0 MB for BS19 and 9.3 MB for JV3; combined pretty JSON was about 72 MB. Full-state APIs cost time and memory. Review rendering is paged at 50 definitions; selection applies to the visible page, and derived observations are cached. No HG62, exporter-wide, guaranteed memory-peak or long-session leak claim is made. Source fingerprints use size/mtime. Unsupported units never acquire guessed normalization.

The ignored `graphify-out/` graph in the normal checkout is navigation assistance. The controller refreshes it after integrating source/docs changes, using the corrected local dispatch. No duplicate worktree graph was generated. Verify graph findings against cited files; planned requirements are not implementation evidence.

Geometry reference identity includes source ID and fingerprint: merged current/historical revision partitions remain distinct through review, and unchanged hidden history is retained. Category parameters reject known incompatible ordinary text/number kinds; unresolved measured text remains incomplete evidence until a verified interpretation is supplied. Legacy copied unknown-measure overrides acquire provenance markers without changing their raw text decisions.

Geometry confirmation commands may supply sourceRebindings (source ID, old/new fingerprint and explicitly selected occurrences). Rebinding into a revision already represented consolidates only the selected subset with that existing partition; unselected occurrences cannot enter the union. Historical partitions remain separate unless explicitly rebound.
