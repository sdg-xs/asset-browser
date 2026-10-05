# HEMY local IFC asset library

Browse real IFC asset types, filter by category, and inspect read-only properties and representative 3D geometry. The local service discovers existing source files, retains uploads, and persists catalog indexes and model visibility. IFC parsing and geometry extraction run in a browser worker.

Use Node.js 24 or newer. Install dependencies, then start the app:

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the localhost service on port 3001. For a production build, run `npm run build` followed by `npm start`, then open `http://127.0.0.1:3001`. The service binds to `127.0.0.1`.

```powershell
npm run build
npm start
```

The library selects BS19 initially when available. Choosing a source indexes it if needed; cached catalogs appear immediately. Select a category or search by type name, category, or IFC class. Switch between grid and list views, then select a card to open its properties and 3D inspector. The viewer opens the selected IFC source and tries other occurrences if the first has no supported geometry. Drag to orbit, scroll to zoom, and use Fit asset to restore framing. Preview placeholders indicate that geometry has not yet been loaded.

Add model accepts a single `.ifc` file. It saves the upload before browser processing starts, so a processing failure does not discard the file. Remove model hides it persistently and retains its original bytes. Categories use `Identity Data / Generic Hard Asset`, with instance precedence and type fallback only when the instance property is absent. Blank or `NA` values are excluded; excluded and untyped occurrence counts appear above the results.

`npm test` runs storage/API, real IFC parsing, viewer lifecycle, and catalog interaction tests. `npm run typecheck` checks strict TypeScript. `npm ci` is available for reproducible installation from the lockfile.

Environment settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `IFC_SOURCE_ROOT` | `C:/Users/StevenGomba/OneDrive - HEMY AS/Desktop/Omniverse Working Files/PROPERTIES` | Discover `<CODE>/IFC/*.ifc` without modifying source files. |
| `IFC_DATA_ROOT` | `.local-data` relative to the working directory | Persist `library.json`, managed `uploads/`, and upload `staging/`. |
| `PORT` | `3001` | Local API and production UI port, also used by the Vite proxy. |
| `IFC_MAX_UPLOAD_BYTES` | `1073741824`, 1 GiB | Maximum streamed upload size. |

For another machine, configure `IFC_SOURCE_ROOT` before starting. A missing source folder produces an empty existing-model inventory and a startup explanation in the terminal. Managed uploads remain available. Filesystem permission failures produce an actionable API error.

```powershell
$env:IFC_SOURCE_ROOT = 'D:/Properties'
$env:IFC_DATA_ROOT = 'D:/HEMY-library-data'
npm run dev
```

Keep the managed folder outside the original property folders. Removing a model persistently hides it, preserves its IFC bytes, and blocks its file route. Uploaded file names are display labels; managed disk names use random IDs, so equally named uploads stay separate.

The revision fingerprint is file size plus filesystem modification time in milliseconds. A changed fingerprint clears the derived index while keeping model identity. Worker downloads send the expected fingerprint; the service checks the opened disk file before streaming. A conflict reloads metadata and indexes the current source before inspecting its current type and occurrence IDs. This MVP does not hash every large IFC file; external changes that preserve both size and modification time are not detectable. State operations are serialized within the single service process, and state publication uses temporary-file rename. Run one service process per managed data folder.

API routes return schema-validated records from `shared/contracts.ts`:

- `GET /api/health` returns `{ "status": "ok" }`.
- `GET /api/models` returns the visible model array, with `index: null` until indexed.
- `GET /api/models/:id/file` streams the IFC source by persisted model ID. `X-IFC-Fingerprint` binds a download to an expected revision; a mismatch returns structured `SOURCE_CHANGED` HTTP 409. Successful responses include the current fingerprint and disable caching.
- `POST /api/models` accepts one multipart `file` and returns its saved model with status 201.
- `DELETE /api/models/:id` hides the model and returns status 204.
- `PUT /api/models/:id/index` saves a matching-model, matching-fingerprint catalog index and returns the updated model.

Errors return `{ "error": { "code": "...", "message": "..." } }`. JSON bodies over 32 MiB return HTTP 413 with code `REQUEST_TOO_LARGE`. Requests cannot supply filesystem paths. Mutations require a matching localhost origin when the Origin header is present. Invalid Host headers and cross-site mutations are rejected. Upload validation checks a bounded STEP/IFC header and completion marker before publishing the file; actual IFC parsing remains the browser's responsibility.

BS19, approximately 117 MiB, was verified in Chrome with 1,019 types and 107 categories. Prior measured indexing runs took 13–21 seconds on this machine. The viewer loads separately from the approximately 309 kB application script; its roughly 5.97 MB SDK chunk still triggers Vite's size warning. These measurements do not establish support for the 520 MiB HG62 source or every IFC exporter. See [verification evidence and limits](docs/verification.md). FM import, placement, editing, RFA and Nucleus are outside this MVP.
