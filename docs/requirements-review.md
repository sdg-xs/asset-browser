# Web asset browser requirements

Scope agreed by the user on 2026-10-05 after requirements and architecture review. This document supersedes the initial proposed requirements. The local MVP is implemented; production browser evidence and limits are recorded in [verification.md](verification.md).

Source brief: `C:/Users/StevenGomba/OneDrive - HEMY AS/Desktop/Obsidian Notes/Work/Developments/Web Asset Browser.md`.

## Agreed MVP

Build a local, staff-only web asset browser with real IFC uploads, library browsing, read-only properties, and a simple representative 3D preview. A minimal local file service provides persistent access to saved models and uploads.

The existing facility-management software, ticket and maintenance workflows, asset selection, digital-twin placement, and FM import are outside this MVP. FM import was explicitly deferred during the review. RFA support, property editing, commercial That Open Platform integration, Nucleus integration, and a full catalog database are also deferred.

## Library and storage

- Read existing models from `C:/Users/StevenGomba/OneDrive - HEMY AS/Desktop/Omniverse Working Files/PROPERTIES/<CODE>/IFC/`.
- Treat this source as a local file collection. A separate database or library API has not been verified.
- Save new uploads in a separate MVP-managed folder. Do not reorganize or overwrite the existing property folders.
- Retain uploaded files and library state across refreshes and restarts.
- Removing a model persistently hides it and its type cards from the library. It does not delete the IFC file.
- Show upload and processing status, including actionable failure information.

## Asset organization

An IFC file is a source container. The library displays asset type cards derived from classified elements inside that file. Multiple occurrences of a type belong beneath the same card.

Keep types from different source models separate, even if their names match. Use stable source-model identity plus IFC type GlobalId as the initial grouping key. Track source revisions/fingerprints separately to associate extracted data and previews with the correct file version.

Use `Identity Data / Generic Hard Asset` as the initial category property:

1. Use the element's property when it is present.
2. Fall back to the IFC type's property only when the element property is absent.
3. Exclude effective blank or `NA` classifications from asset cards.
4. Show the count of excluded elements for each processed model.

Do not merge types solely by their display names. Report elements that cannot be reliably mapped to a type; the sample inspection does not establish complete type coverage.

## Inspection

Opening a type card provides read-only IFC properties and a representative 3D preview. The viewer supports inspection; it has no placement or editing tools. Source type names are display labels, not unique identifiers.

The browser uses web-ifc for IFC processing and That Open Components for representative viewing. Browser processing and viewing were verified on BS19 and the small IFC fixture. This does not establish support for every supplied model.

## Initial validation model

Use `C:/Users/StevenGomba/OneDrive - HEMY AS/Desktop/Omniverse Working Files/PROPERTIES/BS19/IFC/BS19.ifc` first.

BS19 is IFC4, 122,676,603 bytes, approximately 117 MiB. Bounded inspection verified:

- `Identity Data / Generic Hard Asset = Air quality sensor`.
- The property set is linked to `IFCCOMMUNICATIONSAPPLIANCE #1118323`.
- An IFC type relation groups three occurrences under type `#1118152`.
- The type GlobalId is `0iEspr7ox$PCrl9h2pzQQO`.
- The type name is `Air-Quality_CO2-Sensor:Airthings-Space-Mini_80mm_Indoor`.
- The sampled element also has a separate `Family and Type` property.

HG62 was inspected before selecting BS19. It is IFC4, 544,981,520 bytes, approximately 520 MiB. Its sampled category, element, and type relationships also support the mapping. Full HG62 browser support is not an initial feasibility commitment.

The initial findings above came from bounded file inspection. Subsequent browser validation produced 1,019 BS19 type cards, 107 categories, 4,187 excluded occurrences and 79 untyped occurrences, and rendered the sensor's representative geometry. See the verification document for the tested scope.

## Acceptance checks for implementation

1. The library loads from the existing IFC source folders and restores persisted model visibility.
2. A valid IFC upload is saved in the managed folder and remains available after a restart.
3. Processing shows progress or status and reports errors without discarding the stored source.
4. BS19 produces category/type cards using verified IFC relationships, with separate occurrence references and skipped-element counts.
5. A selected type displays read-only properties and a representative 3D preview.
6. Equally named types in different source models remain separate.
7. Removing a model survives refresh/restart and leaves its original IFC on disk.
8. No FM, placement, Nucleus, or commercial Platform dependency is needed to demonstrate the MVP.

All eight checks have implementation evidence. Automated tests cover source identity, classifications, storage boundaries and stale responses; the production browser run covers BS19 browsing/inspection and valid upload, restart, removal, second restart, and retained file hashes. See [verification.md](verification.md) for evidence and [architecture-review.md](architecture-review.md) for responsibilities.
