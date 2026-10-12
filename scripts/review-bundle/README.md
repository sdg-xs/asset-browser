# HEMY Asset Library — populated review bundle

Extract the entire ZIP before starting. Open the extracted **HEMY-Asset-Library-Review** folder in Codex and ask:

> Run this app and show me the populated asset library in my browser.

The folder includes the app, a compiled build, the current populated Library and Review queues, categories, and the IFC files needed for geometry previews. Codex can follow `AGENTS.md` to start it.

## Run yourself

Install Node.js 24 or newer. Open a terminal in this folder:

```sh
npm ci --omit=dev
npm start
```

The first dependency installation needs internet access. The app then runs locally; the terminal prints its browser address, usually **http://127.0.0.1:3001**. If that port is busy it selects another port between 3002 and 3010. Keep the terminal running while reviewing. Stop with Ctrl+C.

Review Library cards and their geometry, edit asset details, try uploads, or inspect Manage Categories and its default property mappings. New assets go to Review before approval. Mapped upload values are locked; choose **Enter manually** to edit them.

Changes are saved in your own `review-data` folder. Every recipient has an independent copy; changes are not synchronized back to HEMY or other reviewers. Keep this folder if you want to retain your changes. Extract a fresh copy of the ZIP into another folder to return to the supplied snapshot.

## Develop with Codex

The source code is included. To run the development server, install the development dependencies with `npm ci`, then use `npm run dev` and open **http://127.0.0.1:5173**. Build changes using `npm run build`; `npm start` serves that build.

`review-bundle.json` records the snapshot counts and SHA-256 checksums of the included models. Startup adapts the bundled paths and timestamps after extraction while retaining model identities, approvals and geometry references. Use the provided start commands so this preparation runs before the service starts.
