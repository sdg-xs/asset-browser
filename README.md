# HEMY local IFC asset library

This MVP service discovers existing IFC sources, retains uploaded IFC files, and stores library visibility and derived indexes. IFC extraction and the catalog interface are implemented in the next tasks.

Use Node.js 24 and install the lockfile-pinned dependencies with `npm ci`.

```powershell
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the localhost service on port 3001. For a production build, run `npm run build` followed by `npm start`, then open `http://127.0.0.1:3001`. The service binds to `127.0.0.1`.

`npm test` runs real temporary-filesystem and API tests. `npm run typecheck` checks strict TypeScript.

Environment settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `IFC_SOURCE_ROOT` | `C:/Users/StevenGomba/OneDrive - HEMY AS/Desktop/Omniverse Working Files/PROPERTIES` | Discover `<CODE>/IFC/*.ifc` without modifying source files. |
| `IFC_DATA_ROOT` | `.local-data` relative to the working directory | Persist `library.json`, managed `uploads/`, and upload `staging/`. |
| `PORT` | `3001` | Local API and production UI port, also used by the Vite proxy. |
| `IFC_MAX_UPLOAD_BYTES` | `1073741824`, 1 GiB | Maximum streamed upload size. |

For another machine, configure `IFC_SOURCE_ROOT` before starting. A missing source folder produces an empty existing-model inventory and a startup explanation in the terminal. Managed uploads remain available. Filesystem permission failures produce an actionable API error.

Keep the managed folder outside the original property folders. Removing a model persistently hides it, preserves its IFC bytes, and blocks its file route. Uploaded file names are display labels; managed disk names use random IDs, so equally named uploads stay separate.

The revision fingerprint is file size plus filesystem modification time in milliseconds. A changed fingerprint clears the derived index while keeping model identity. This MVP does not hash every large IFC file; external changes that preserve both size and modification time are not detectable. State operations are serialized within the single service process, and state publication uses temporary-file rename. Run one service process per managed data folder.

API routes return schema-validated records from `shared/contracts.ts`:

- `GET /api/health` returns `{ "status": "ok" }`.
- `GET /api/models` returns the visible model array, with `index: null` until indexed.
- `GET /api/models/:id/file` streams the IFC source by persisted model ID.
- `POST /api/models` accepts one multipart `file` and returns its saved model with status 201.
- `DELETE /api/models/:id` hides the model and returns status 204.
- `PUT /api/models/:id/index` saves a matching-model, matching-fingerprint catalog index and returns the updated model.

Errors return `{ "error": { "code": "...", "message": "..." } }`. Requests cannot supply filesystem paths. Mutations require a matching localhost origin when the Origin header is present. Invalid Host headers and cross-site mutations are rejected. Upload validation checks a bounded STEP/IFC header and completion marker before publishing the file; actual IFC parsing remains the browser's responsibility.
