# Populated HEMY review app

When the user asks to run, present, show or review this app, start the populated copy in this folder and open its local browser URL.

1. Work from this folder. Check for Node.js 24 or newer and npm. If Node is missing, explain that prerequisite.
2. Install dependencies with `npm ci --omit=dev` if they are absent. The compiled app is already included.
3. Run `npm start` as a background task that stays running. On Windows, launch any background process with a hidden window. The command prepares portable data paths and prints the URL; use that actual URL because it can select an available port.
4. Verify `/api/health`, confirm `/api/catalog-library` contains the populated entries, then present or open the printed browser URL. Check an asset preview if browser control is available.

The populated state and IFC geometry are in `review-data`. Preserve that folder when installing or rebuilding. Reviewer edits stay in this local copy. Use `npm start` to prepare paths after extracting or moving the folder; direct server startup skips this step.

For requested code changes, install full dependencies with `npm ci`, use `npm run dev`, and validate with `npm run typecheck` and appropriate tests. Rebuild with `npm run build` before showing changes through `npm start`.

Use the current active session model for development, planning, debugging and code review. Subagents inherit it. Ask for explicit approval before selecting a different model.
