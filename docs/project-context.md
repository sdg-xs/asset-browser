# Project context

Reviewed against local `main` at `8f2cd6f` on 2026-10-06. Recheck Git status and current tests when resuming; this document records scope and implementation decisions rather than live process state.

## Scope and decisions

The delivered build is a staff-only, local-first IFC asset browser. The agreed MVP has a library, read-only properties and representative geometry. FM import remains a future integration. Existing facility management, digital-twin placement, RFA families, property editing and Nucleus are outside this build. The UI references Autodesk Content Catalog and uses HEMY branding.

The user selected BS19 for initial verification. Categories come from `Identity Data / Generic Hard Asset`. An instance property takes precedence whenever present; a type property supplies the value only when the instance property is absent. Effective blank or `NA` values are excluded. Cards group by source model identity and IFC type GlobalId and retain occurrence IDs. One card can have multiple categories.

The authoritative scope is [requirements-review.md](requirements-review.md). The completed original plan is [the MVP implementation plan](superpowers/plans/2026-10-05-web-asset-browser-mvp.md).

## Current behavior and architecture

Clicking a card selects it and opens the side inspector. Clicking its arrow selects the same card and opens a centered dialog containing the geometry and parameters. Grid and list views support both actions. Dialog close or Escape restores focus to its opener. Card cubes are placeholders; geometry loads on selection.

`src/library/useLibrary.ts` coordinates inventory, indexing and inspection. `src/ifc/client.ts` and `worker.ts` manage a dedicated browser worker. `reader.ts` reads properties and extracts a representative occurrence with web-ifc `GetFlatMesh`. That Open Components supplies the viewer world and camera, and Three.js draws meshes. This is an element preview, without full-building Fragments conversion or a commercial That Open Platform backend.

`server/library-store.ts` discovers originals, retains managed uploads and saves catalog indexes and visibility in `.local-data/library.json`. Removal hides a model and keeps its bytes. `shared/contracts.ts` defines validated API records. Download and index-save fingerprints bind derived data to source size and modification time. Revision conflicts refresh metadata and retry indexing once. Keep one service process per data directory.

See [architecture-review.md](architecture-review.md) for responsibilities and [README.md](../README.md) for commands, configuration and API routes.

## Models and repository delivery

The repository is [sdg-xs/asset-browser](https://github.com/sdg-xs/asset-browser). `main` was pushed and made the default branch. Actual BS19 and HG62 files are external local sources and were not committed. Only small IFC test fixtures are in Git. A clone needs `IFC_SOURCE_ROOT` configured or IFC uploads to populate its library.

The local default source root points to `C:/Users/StevenGomba/OneDrive - HEMY AS/Desktop/Omniverse Working Files/PROPERTIES`, with sources under `<CODE>/IFC/*.ifc`. Uploads and catalog state are ignored local data. Use the Node/Vite service to run the application; opening HTML through Live Preview does not provide its API or build pipeline.

## Evidence and remaining limits

BS19 has 1,019 catalog types and 107 categories. The verified Airthings sensor occurrence 1118159 renders two meshes and 954 triangles, with 16 property panels including type identity. Both card and arrow previews were checked in Chrome, including a narrow viewport and modal focus return. Historical indexing measurements took 13–21 seconds on this machine. Cached catalogs still require a source parse before first inspection.

The viewer's approximately 5.97 MB uncompressed SDK chunk remains a deferred optimization. Size/mtime fingerprints cannot detect edits that preserve both values. HG62, every IFC exporter, guaranteed memory ceilings and long-session leak freedom remain unverified. [verification.md](verification.md) records automated checks and historical browser evidence; ignored `output/playwright/` files are local artifacts, not shipped repository assets.

## Graphify

The local `graphify-out/` graph is navigation assistance. Verify facts against its cited source files and distinguish planned requirements from implemented behavior. It excludes original IFC geometry, managed storage, build output and dependencies. Refresh after source or documentation changes using `graphify-out/refresh.ps1` when Gemini is configured, or invoke the Graphify skill for host extraction. Generated graphs and credentials are not repository deliverables.
