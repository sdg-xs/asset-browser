# HEMY curated asset library

A staff-only, local-first catalog of reusable products and generic specification variants. The main Library contains approved definitions with independent UUIDs. Sources retains IFC browsing, uploads, indexing and read-only inspection. Original IFC files stay in their existing folders.

Use Node.js 24 or newer:

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. For production, run `npm run build`, then `npm start` and open `http://127.0.0.1:3001`. The service binds to `127.0.0.1`.

A fresh catalog is empty. In Sources, select an existing model or upload an IFC file, then choose **Analyze and import drafts**. Review imported definitions in Needs review. In Categories, review category names/aliases and confirm reusable source-field mappings and variant roles. Products require confirmed manufacturer and model; generic entries require a category and readable name, and may be approved with unknown specifications. Imported values and name hints are unconfirmed. Each category parameter has a stable identity and can map multiple differently named source properties. Select those properties together in its mapping; inconsistent overlapping values remain conflicts until staff chooses a value or explicitly resolves them as unknown. Instance Mark values remain source evidence and are excluded from reusable suggestions and publication checks.

Staff exclusions are saved in the local catalog and respected by future imports. The `exclude-source-parameters` command removes selected source properties from templates, curated specifications and published specifications while retaining original IFC observations and entry approvals. The current BS19/JV3 conflict cleanup retains Area, Volume, Length, Comments, System and Diameter; other parameters outside that conflict list remain available.

Library inspectors and centered previews show curated specifications and geometry. Original IFC properties and source references are under collapsed **Source details**. Unresolved conflicts appear only in Needs review and the definition editor; an unknown or curated override resolves the warning while preserving the original source values. The Sources workspace retains full IFC inspection.

Click a card to open the side inspector; its arrow opens the centered native preview. Curated specifications appear first, followed by representative geometry, source observations and raw read-only IFC properties. Escape closes the dialog and returns focus to its arrow. Drag to orbit, scroll to zoom, and use Fit asset to restore framing. Geometry loads on inspection rather than on every card.

Same names never auto-merge. Compare duplicates before confirming a merge; the target keeps its curated values, absorbed entries are archived, and the result returns to draft. Confirm variant mappings before splitting occurrences into new drafts. Preferred geometry uses reviewed occurrence order, followed only by references explicitly confirmed equivalent. Approval freezes the accepted values independently of later source/template changes. A changed source appears in Needs review while its approved definition stays in Library. Rebinding a changed source requires explicitly selecting the matching occurrence subset; unavailable historical references stay as provenance. Hiding a source retains its IFC bytes and approved definitions; unavailable geometry is shown locally. Archiving a definition is independent of source visibility.

`library.json` retains source identity, indexes and visibility. `catalog-library.json` separately stores schema-version-1 definitions, templates, categories, observations and revisions. Staff overrides remain separate from source values. Writes are atomic and serialized within one process. Run one service per data folder. Catalog commands carry `expectedRevision`; HTTP 409 refreshes the UI without replaying the decision.

| Variable               | Default                                                                              | Purpose                                                    |
| ---------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `IFC_SOURCE_ROOT`      | `C:/Users/StevenGomba/OneDrive - HEMY AS/Desktop/Omniverse Working Files/PROPERTIES` | Discover `<CODE>/IFC/*.ifc` without changing originals.    |
| `IFC_DATA_ROOT`        | `.local-data`                                                                        | Store both JSON state files, retained uploads and staging. |
| `PORT`                 | `3001`                                                                               | API/production port and Vite proxy target.                 |
| `IFC_MAX_UPLOAD_BYTES` | `1073741824`                                                                         | Maximum streamed upload size, 1 GiB.                       |

A clone needs a configured source folder or uploads, followed by explicit analysis and approval. IFC originals and local catalog data are not repository assets. A missing source folder is reported at startup; managed uploads remain available. Keep the data folder separate from original property folders.

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
- `GET /api/catalog-library` returns the complete catalog.
- `POST /api/catalog-library/commands` accepts `import`, `edit`, `approve`, `archive`, `restore`, `merge`, `split`, `category` and `template` commands with the current `expectedRevision` and returns the complete updated catalog. See the shared discriminated schema for exact payloads.

Errors use `{ "error": { "code": "...", "message": "..." } }`. JSON requests are limited to 32 MiB. Invalid localhost hosts and cross-site mutations are rejected; requests cannot supply filesystem paths. Source fingerprints use size and modification time, not content hashes, so edits preserving both remain undetectable.

The worker respects per-property instance presence, including explicit blank values, before type fallback. Missing values stay unknown. Recognized length, area, volume, power, flow and voltage units normalize to canonical units; unsupported units remain explicit text/unknown. Category/template suggestions exclude technical identity and installation fields; raw observations remain available as provenance. Unit labels do not convert existing values. Unknown dimensional measures are excluded from strong duplicate evidence. Each observation value retains its original unit and measure; displayed numbers use bounded precision without changing stored values.

Run `npm test -- --maxWorkers=2`, `npm run typecheck` and `npm run build`. Real BS19/JV3 verification produced 1,570 drafts and 152 category labels. Their serialized analysis snapshots were about 20.0 MB and 9.3 MB, and the pretty-printed combined catalog was about 72 MB. Commands and reads return full state; review cards are paged in groups of 50, and batch selection applies only to the visible page. Derived observations are cached for each loaded catalog. These samples do not establish a general memory limit, support for HG62 or every IFC exporter. FM, placement, original IFC editing, RFA, Nucleus and remote catalog integration remain deferred. See [project context](docs/project-context.md), [requirements](docs/requirements-review.md), [architecture](docs/architecture-review.md) and [verification](docs/verification.md).
