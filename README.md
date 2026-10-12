# HEMY curated asset library

A staff-only, local-first catalog of reusable products and generic specification variants. The main Library contains saved definitions with independent UUIDs. The same staff create assets and maintain the database, so saving does not require a separate review or approval. Original IFC files stay in their existing folders.

Use Node.js 24 or newer:

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. For production, run `npm run build`, then `npm start` and open `http://127.0.0.1:3001`. The service binds to `127.0.0.1`.

A fresh catalog is empty. Start with **Create asset** in Library. Preview a 3D model or choose one asset type from an IFC, select its category and fill in its details, then choose **Save asset**. The asset appears directly in Library. Existing drafts also appear there. A card represents a reusable asset type rather than each installed occurrence.

Manage Categories lists Generic Hard Asset categories with their IFC Class and System. Use Add category at the top-right to create one, or a row's arrow to edit Category name, IFC Class and System. Create a category and assign its IFC Class and System before adding assets. Saved categories appear in the Library category list and asset category selector. Asset creation starts with these saved assignments. The table shows category assignments independently of model properties. Unassigned values appear as a dash. Asset creation requires a readable name and a category when categories are available. IFC Class and System are optional. Asset Details keeps the model type name and uses searchable IFC Class and System selectors without source-property mappings. The same selectors are used when creating categories. IFC classes are queried through `/api/classifications/ifc-classes` from the buildingSMART bSDD IFC 4.3 dictionary, cached for 24 hours, with a saved list if the service is unavailable. System choices use four-digit Norwegian codes and names from [Statsbygg PA 0702 appendix 1-2, revision 5](https://dok.statsbygg.no/wp-content/uploads/2024/12/PA-0702-Vedlegg-1-2-Dokumentasjonskrav-iht-PA-0805-NS-TFM-rev5.pdf), applying the exclusions in [PA 0805 revision 4](https://dok.statsbygg.no/wp-content/uploads/2024/02/PA-0805-Bruk-av-Standard-Norges-Tverrfaglig-Merkesystem-NS-TFM-i-Statsbygg-rev-04.pdf). This list covers the published Statsbygg systems, rather than claiming to reproduce the full NS 3451 standard. The definition editor also supports FDVU documentation, additional specifications and source-field mappings. Original source values remain separate from staff edits.

Staff exclusions are saved in the local catalog and respected by future imports. The `exclude-source-parameters` command removes selected source properties from templates, curated specifications and published specifications while retaining original IFC observations and entry approvals. The current BS19/JV3 conflict cleanup retains Area, Volume, Length, Comments, System and Diameter; other parameters outside that conflict list remain available.

Library inspectors and centered previews show IFC Class, System and representative geometry. Edit definition opens the additional specifications and source details.

Click a card to open the side inspector; its arrow opens the centered native preview. Escape closes the dialog and returns focus to its arrow. Drag to orbit, scroll to zoom, and use Fit asset to restore framing. Geometry loads on inspection rather than on every card.

Edit definitions and update their geometry directly from Library. Existing approved definitions retain their saved specifications, and saved drafts no longer need approval to be accessible. Unavailable geometry is shown locally.

`library.json` retains source identity, indexes and visibility. `catalog-library.json` separately stores schema-version-1 definitions, templates, categories, observations and revisions. Staff overrides remain separate from source values. Writes are atomic and serialized within one process. Run one service per data folder. Catalog commands carry `expectedRevision`; HTTP 409 refreshes the UI without replaying the decision.

| Variable               | Default                                                                              | Purpose                                                    |
| ---------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `IFC_SOURCE_ROOT`      | `Current user's OneDrive / Desktop / Omniverse Working Files / PROPERTIES` | Discover `<CODE>/IFC/*.ifc` without changing originals.    |
| `IFC_DATA_ROOT`        | `.local-data`                                                                        | Store both JSON state files, retained uploads and staging. |
| `PORT`                 | `3001`                                                                               | API/production port and Vite proxy target.                 |
| `IFC_MAX_UPLOAD_BYTES` | `1073741824`                                                                         | Maximum streamed upload size, 1 GiB.                       |

A clone needs a configured source folder or uploads, followed by analysis and saving the selected assets. IFC originals and local catalog data are not repository assets. A missing source folder is reported at startup; managed uploads remain available. Keep the data folder separate from original property folders.

When switching devices, sync `.local-data` (including `uploads` and `geometry`) as well as the source IFC folders. Source discovery uses this device's business OneDrive folder, falling back to OneDrive or the current Windows profile. Model paths are saved relative to their configured source/upload roots, so Windows usernames can differ between devices. Existing absolute paths under the same OneDrive folder layout migrate automatically, preserving IDs, indexes and hidden state. For a different folder layout, set `IFC_SOURCE_ROOT` and `IFC_DATA_ROOT` on that device. Keep these folders available locally in OneDrive, and run one service at a time per synced data folder.

```powershell
$env:IFC_SOURCE_ROOT = 'D:/Properties'
$env:IFC_DATA_ROOT = 'D:/HEMY-library-data'
npm run dev
```

Source routes use `shared/contracts.ts`. Catalog records and commands use `shared/catalog-library.ts`.

- `GET /api/health` returns the local service status.
- `GET /api/models` returns visible sources and saved indexes.
- `GET /api/models/:id/file` streams revision-bound IFC bytes. `X-IFC-Fingerprint` mismatch returns `SOURCE_CHANGED` HTTP 409.
- `POST /api/models` accepts one multipart IFC `file`; `DELETE /api/models/:id` hides it without deleting bytes.
- `PUT /api/models/:id/index` saves an index for the matching source/fingerprint.
- `PUT /api/models/:id/creation-index` saves complete creation candidates, including element identities and their exact occurrence membership.
- `GET /api/catalog-library` returns the complete catalog.
- `POST /api/catalog-library/commands` accepts `import-selected`, legacy `import`, and the editing/review commands with the current `expectedRevision`. It returns the complete updated catalog. See the shared discriminated schema for exact payloads.

Errors use `{ "error": { "code": "...", "message": "..." } }`. `POST /api/catalog-library/commands` accepts at most 64 MiB of JSON; other API JSON requests retain the 32 MiB limit. Invalid localhost hosts and cross-site mutations are rejected; requests cannot supply filesystem paths. Source fingerprints use size and modification time, not content hashes, so edits preserving both remain undetectable.

The worker respects per-property instance presence, including explicit blank values, before type fallback. Missing values stay unknown. Creation analysis retains conflicting Generic Hard Asset values, including blank or NA values normalized as missing, under the original property key with classification issues. Staff assigns the canonical category and explicitly approves; analysis never guesses a category. Equivalent GHA raw text and normalized values fold to the last actual property observation, as in legacy analysis; raw property panels retain both properties and the original IFC retains their datatype declarations. Legacy Sources classification remains strict. Recognized length, area, volume, power, flow and voltage units normalize to canonical units; unsupported units remain explicit text/unknown. Category/template suggestions exclude technical identity and installation fields; raw observations remain available as provenance. Unit labels do not convert existing values. Unknown dimensional measures are excluded from strong duplicate evidence. Each observation value retains its original unit and measure; displayed numbers use bounded precision without changing stored values.

Run `npm test -- --maxWorkers=2`, `npm run typecheck` and `npm run build`. Earlier classified Sources analysis of BS19/JV3 produced 1,570 drafts and 152 category labels. Their serialized analysis snapshots were about 20.0 MB and 9.3 MB, and the pretty-printed combined catalog was about 72 MB. Complete BS19 creation analysis is larger: its one-selected command measured 35,905,423 UTF-8 bytes and passed HTTP import under the bounded 64 MiB command limit. All 3,083 observations and 9,204 occurrence memberships were retained while only one draft was created. Commands and reads return full state; review cards are paged in groups of 50, and batch selection applies only to the visible page. Derived observations are cached for each loaded catalog. These samples do not establish a general memory limit, support for HG62 or every IFC exporter. FM, placement, original IFC editing, RFA, Nucleus and remote catalog integration remain deferred. See [project context](docs/project-context.md), [requirements](docs/requirements-review.md), [architecture](docs/architecture-review.md) and [verification](docs/verification.md).
