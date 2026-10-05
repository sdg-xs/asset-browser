# Browser IFC implementation API research

Verified on 2026-10-05 against npm registry metadata, published package declarations and JavaScript, and official That Open source. This is implementation research, not a successful BS19 parsing or rendering test. The agreed source model is IFC4, 122,676,603 bytes. See [requirements-review.md](requirements-review.md) and [architecture-review.md](architecture-review.md).

## Package versions and compatibility

| Package | Current npm latest | License | Relevant compatibility |
| --- | --- | --- | --- |
| `web-ifc` | `0.0.78` | MPL-2.0 | Browser IFC parser and geometry engine. |
| `@thatopen/fragments` | `3.4.7` | MIT | Peers require `three >=0.182.0` and `web-ifc >=0.0.77`. |
| `@thatopen/components` | `3.4.8` | MIT | Peers require Fragments `~3.4.7`, `three >=0.182.0`, `web-ifc >=0.0.77`, and `camera-controls >=3.1.2`. |
| `@thatopen/components-front` | `3.4.4` | MIT | Depends on Components `~3.4.0`; not needed for a simple read-only preview. |
| `three` | `0.186.1` | MIT | Latest satisfies the above peer ranges. |

Versions and ranges came directly from the registry's `latest` endpoints: [web-ifc](https://registry.npmjs.org/web-ifc/latest), [Fragments](https://registry.npmjs.org/@thatopen%2Ffragments/latest), [Components](https://registry.npmjs.org/@thatopen%2Fcomponents/latest), [Components front](https://registry.npmjs.org/@thatopen%2Fcomponents-front/latest), [Three.js](https://registry.npmjs.org/three/latest). Pin the chosen versions and commit a lockfile. Peer-range compatibility is not proof that BS19 will work. Fragments 3.4.7 itself develops against web-ifc 0.0.77 and Three.js 0.182.0, so a latest-compatible set still needs the actual browser check. [Published Fragments package](https://registry.npmjs.org/@thatopen%2Ffragments/3.4.7).

## Smallest useful processing pipeline

Recommended implementation: use `web-ifc`, which is part of That Open Engine, inside an application-owned dedicated module worker. Index classification and type relationships first. Generate geometry only when a user opens a type card. Render that occurrence with Three.js. This keeps IFC interpretation in the browser and requires no commercial Platform or server-side converter. Fragments is useful if reusable `.frag` files or its model runtime are actually needed later. The official importer tutorial explicitly permits a plain Three.js scene without Components. [web-ifc project](https://github.com/ThatOpen/engine_web-ifc), [official importer example](https://github.com/ThatOpen/engine_fragment/blob/main/packages/fragments/src/Importers/IfcImporter/example.ts).

1. Give the worker a same-origin model URL, or transfer one `ArrayBuffer` to it. Keep the UI responsive while the worker fetches/opens the model. Transfer ownership instead of cloning the IFC buffer. Return plain metadata records and transferable geometry buffers. [Worker messaging specification](https://html.spec.whatwg.org/multipage/workers.html#dom-worker-postmessage).
2. Initialize one IFC API, open the source, and verify that its model ID is nonnegative. Keep one source open at a time initially. The API's synchronous parsing work remains within the worker.
3. Enumerate physical element IDs, type relations, and occurrence property relations. Build maps once and cache property-set reads. Avoid recursively flattening every entity or constructing all building meshes.
4. Publish model/type/occurrence records and exclusion diagnostics. Keep only needed metadata in the main thread.
5. For an opened type, choose a classified occurrence deterministically and request only its mesh. If it has no usable mesh, try another occurrence in the same group. Report failure if none has supported geometry.
6. Retain the opened IFC only while it is useful. Close it when switching models, and terminate the worker to cancel a long synchronous operation. A worker is not a memory limit; BS19 must still be measured.

Steps 2-6 are recommendations based on the APIs below, not measured performance claims.

## IFC API methods to use

The following signatures were checked in [published web-ifc 0.0.78 declarations](https://unpkg.com/web-ifc@0.0.78/web-ifc-api.d.ts). `Vector<number>` exposes `size()` and `get(index)`.

| Purpose | Method signature |
| --- | --- |
| WASM location | `SetWasmPath(path: string, absolute?: boolean): void` |
| Initialize | `Init(customLocateFileHandler?: LocateFileHandlerFn, forceSingleThread?: boolean): Promise<void>` |
| Open | `OpenModel(data: Uint8Array, settings?: LoaderSettings): number` |
| Schema check | `GetModelSchema(modelID: number): string` |
| Enumerate a class | `GetLineIDsWithType(modelID: number, type: number, includeInherited?: boolean): Vector<number>` |
| Shallow entity read | `GetLine(modelID: number, expressID: number, flatten?: boolean, inverse?: boolean, inversePropKey?: string): any` |
| IFC class label | `GetNameFromTypeCode(type: number): string` after `GetLineType(modelID, expressID)` |
| One occurrence mesh | `GetFlatMesh(modelID: number, expressID: number, applyLinearScalingFactor?: boolean): FlatMesh` |
| Selected occurrence meshes | `StreamMeshes(modelID: number, expressIDs: number[], meshCallback, applyLinearScalingFactor?: boolean): void` |
| Geometry buffers | `GetGeometry(modelID, geometryExpressID)` then `GetVertexArray(ptr, size)` and `GetIndexArray(ptr, size)` |
| Release a source | `CloseModel(modelID: number): void` |

Use `IFCELEMENT` with `includeInherited=true` for the initial physical-element population. Keep the exclusion count's population explicit. Physical IFC class names such as `IFCCOMMUNICATIONSAPPLIANCE` are distinct from the user's `Generic Hard Asset` category.

## Exact metadata traversal

Read `IFCRELDEFINESBYTYPE` once. Each relation's `RelatedObjects` contains occurrence references and `RelatingType` references the type. Read that type's `GlobalId`, `Name`, and `HasPropertySets`. Read `IFCRELDEFINESBYPROPERTIES` once for occurrence sets, using `RelatedObjects` and `RelatingPropertyDefinition`. Follow only the relevant sets and property handles. The type relation is the grouping evidence, not a matching type display name. [IFC type relation and override semantics](https://standards.buildingsmart.org/IFC/DEV/IFC4_3/HTML/lexical/IfcRelDefinesByType.html), [type property-set attribute](https://standards.buildingsmart.org/IFC/DEV/IFC4_3/HTML/lexical/IfcTypeObject.html). These linked pages currently describe IFC4.3; the IFC4 traversal is also verified by web-ifc's IFC4 property helper below.

For each relevant `IfcPropertySet`, compare its `Name.value` to `Identity Data`; inspect `HasProperties`; compare property `Name.value` to `Generic Hard Asset`; read its `NominalValue.value` when it is an `IfcPropertySingleValue`. IFC values and references are wrapper objects, not bare strings. Preserve the distinction between an absent property and a present property whose nominal value is null or blank. Unexpected property kinds or conflicting repeated values should produce diagnostics rather than guessed classification.

Useful convenience methods are `properties.getPropertySets(modelID, elementID?, recursive?, includeTypeProperties?)` and `properties.getTypeProperties(modelID, elementID?, recursive?)`. Important pitfall: `getPropertySets(..., true)` in its fourth argument returns type property sets only. It does not merge occurrence and type properties. The released helper uses `IsTypedBy` for IFC4 type lookup and `IsDefinedBy` for IFC2X3. [Published helper declarations](https://unpkg.com/web-ifc@0.0.78/helpers/properties.d.ts), [official helper implementation](https://github.com/ThatOpen/engine_web-ifc/blob/main/src/ts/helpers/properties.ts).

Apply the agreed application policy after extraction:

- If the occurrence property is present, use it even if blank or `NA`.
- Only an absent occurrence property permits a type-property fallback.
- Trim whitespace before checking blank/`NA`; normalize the sentinel comparison consistently.
- Keep blank/`NA` exclusions separate from missing or conflicting type diagnostics.
- Group with stable service model identity plus type GlobalId. Include source fingerprint, extraction policy version, and parser version in cached revision data. Express IDs are references within one source revision, not persistent cross-file identities.
- If one type has occurrences with different valid classifications, retain those per-occurrence assignments. A category may reference the same type card without changing its grouping identity. Do not silently choose one category and discard the others.

These are application rules and recommended handling of unresolved cases, not library defaults.

## Representative geometry

Request the occurrence ID, not the type object's ID. A type may have a representation map, but an occurrence provides its placed geometry. `FlatMesh.geometries` contains `geometryExpressID`, `flatTransformation`, and RGBA `color` for every placed piece. Read every piece, retain its transform, and include every piece when computing the preview bounds. Geometry callbacks must read their buffers synchronously before returning. [Official geometry-stream example](https://github.com/ThatOpen/engine_web-ifc/blob/main/examples/usage/src/geometrystream.ts).

Vertex data has six floats per vertex: position XYZ followed by normal XYZ. Index data is `Uint32Array`. Build Three.js buffer attributes from the position/normal components, then apply each piece's transformation. web-ifc 0.0.78's array getters copy the WASM arrays; transfer those owned buffers or the separated attribute buffers to the UI. Release each geometry object with `delete()`. Runtime correction from the actual fixture and browser test: although the declaration lists `FlatMesh.delete()`, the returned object has only `geometries` and `expressID`; its `geometries` vector owns `delete()`. Release that vector, and feature-detect the outer disposal method. The same vector disposal applies to entity-ID enumeration. [Published runtime implementation](https://unpkg.com/web-ifc@0.0.78/web-ifc-api.js), [That Open buffer extraction source](https://github.com/ThatOpen/engine_fragment/blob/main/packages/fragments/src/Importers/IfcImporter/src/geometry/ifc-file-reader.ts).

For the preview, derive a bounding box after transforms and translate the assembled preview to its own center. Use a perspective camera, orbit controls, simple lighting, and a fit-to-bounds distance. Preserve IFC source geometry and metadata identities separately from this display translation. Verify units and orientation with BS19. Dispose the previous preview's geometry and materials on selection changes. Do not load or render the building to isolate an already known occurrence.

## If Fragments conversion is selected

Published Fragments 3.4.7 declares `IfcImporter.process(data: ProcessData): Promise<Uint8Array>`. `ProcessData` accepts `bytes`, `id`, `raw`, callback-reading options, and `progressCallback(progress, data)`. Progress data identifies geometry, attribute, relation, or conversion phases. It has no public occurrence-ID filter. `IfcImporter.classes` filters IFC classes. Its internal reader has `isolatedMeshes`, but that is not a supported top-level importer configuration. The importer processes geometry before properties. Therefore converting the whole file solely for type cards is unnecessary work for this MVP. [Published Fragments declarations](https://unpkg.com/@thatopen/fragments@3.4.7/dist/index.d.ts), [official importer source](https://github.com/ThatOpen/engine_fragment/blob/main/packages/fragments/src/Importers/IfcImporter/index.ts).

The runtime supports `new FragmentsModels(workerURL, options?)`, `load(buffer, { modelId, camera?, raw?, onProgress? })`, and `disposeModel(modelId)`. Model methods include `getItemsOfCategories(RegExp[])`, `getItemsData(ids, config?)`, `getItemsGeometry(localIds, lod?)`, `getMergedBox(localIds)`, and `setVisible(localIds | undefined, visible)`. `getItemsData` returns attributes alone by default; relation traversal must be configured. `getItemsGeometry` returns one array of `MeshData` pieces per requested item, suitable for a separate representative scene. Fragments local IDs must be mapped through its GUID APIs rather than assumed to equal source Express IDs. [Fragments model API](https://docs.thatopen.com/api/@thatopen/fragments/classes/FragmentsModel), [Fragments runtime API](https://docs.thatopen.com/api/@thatopen/fragments/classes/FragmentsModels).

Components 3.4.8's `IfcLoader.load(data, coordinate, name, config?)` requires the second and third arguments in the published declaration. It creates an importer and awaits conversion before calling the Fragments runtime. Calling it from the main thread does not automatically move IFC conversion into the runtime's worker. [IfcLoader source](https://github.com/ThatOpen/engine_components/blob/main/packages/core/src/fragments/IfcLoader/index.ts).

## Worker and WASM hosting

For the minimal pipeline, bundle the application's IFC worker and the browser `web-ifc` entry. Serve `web-ifc.wasm` from a same-origin static folder copied from the exact installed version. Pass an absolute URL ending in `/` to `SetWasmPath(..., true)`. Use `Init(undefined, true)` initially to select single-threaded WASM inside the dedicated worker. This avoids making pthread setup a prerequisite. web-ifc's package exports select the Node entry for the `node` condition and the browser entry for `import`; ensure the worker bundler targets browsers. [Published web-ifc package exports](https://registry.npmjs.org/web-ifc/0.0.78).

An application worker and WASM pthreads are different mechanisms. The current initialization code selects multithreaded WASM only when `self.crossOriginIsolated` is true and single-thread mode is not forced. The package contains both browser WASM variants. JavaScript and WASM must come from the same version. [Official initialization source](https://github.com/ThatOpen/engine_web-ifc/blob/main/src/ts/web-ifc-api.ts), [build artifacts and version-matching guidance](https://github.com/ThatOpen/engine_web-ifc/blob/main/README.md).

If using the Fragments runtime, copy `dist/Worker/worker.mjs` or `worker.min.mjs` from Fragments 3.4.7 into local static assets and pass its URL explicitly. Preserve the path's case when copying. `FragmentsModels.getWorker()` instead fetches the exact-version worker from unpkg and returns a blob URL, so it creates a runtime network dependency. Use local files for this local application. These artifacts were confirmed in [published package file metadata](https://unpkg.com/@thatopen/fragments@3.4.7/?meta). [Official worker-loading source](https://github.com/ThatOpen/engine_fragment/blob/main/packages/fragments/src/FragmentsModels/index.ts).

Verify production serving as well as development serving: worker URLs must return JavaScript, WASM URLs must return the binary, and SPA fallback must not return HTML for either. Browser conversion feasibility, memory use, missing type mappings, representative geometry quality, cancellation, and time to usable preview remain to be measured on BS19 before reporting success.
