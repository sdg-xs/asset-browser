import { copyFile, mkdir } from 'node:fs/promises';
await mkdir(new URL('../public/wasm/', import.meta.url), { recursive: true });
await copyFile(new URL('../node_modules/web-ifc/web-ifc.wasm', import.meta.url), new URL('../public/wasm/web-ifc.wasm', import.meta.url));
