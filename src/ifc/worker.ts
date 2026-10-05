/// <reference lib="webworker" />
import { IfcReader } from './reader.js';
import { RequestSchema, type WorkerResponse } from './protocol.js';

const reader = new IfcReader();
let openedModel: string | null = null;
const send = (response: WorkerResponse, transfer: Transferable[] = []) => postMessage(response, transfer);

self.onmessage = async (event: MessageEvent<unknown>) => {
  const parsed = RequestSchema.safeParse(event.data);
  if (!parsed.success) {
    send({ kind: 'error', requestId: -1, message: 'Invalid IFC worker request.' });
    return;
  }
  const request = parsed.data;
  try {
    switch (request.kind) {
      case 'open': {
        const url = new URL(request.fileUrl);
        if (url.origin !== self.location.origin) throw new Error('IFC files must be loaded from this application.');
        send({ kind: 'progress', requestId: request.requestId, message: 'Downloading IFC to the browser worker' });
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Unable to load IFC: HTTP ${response.status}.`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        await reader.initialize(request.wasmPath);
        const value = reader.open(bytes, request.model, message => send({ kind: 'progress', requestId: request.requestId, message }));
        openedModel = request.model.id;
        send({ kind: 'index', requestId: request.requestId, value });
        return;
      }
      case 'properties':
        if (openedModel !== request.modelId) throw new Error('Open this source model before inspecting its assets.');
        send({ kind: 'properties', requestId: request.requestId, value: reader.properties(request.elementId) });
        return;
      case 'geometry': {
        if (openedModel !== request.modelId) throw new Error('Open this source model before inspecting its assets.');
        const value = reader.geometry(request.elementId);
        const transfer = [...new Set(value.meshes.flatMap(mesh => [mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer]))];
        send({ kind: 'geometry', requestId: request.requestId, value }, transfer);
        return;
      }
    }
  } catch (error) {
    send({ kind: 'error', requestId: request.requestId, message: error instanceof Error ? error.message : 'IFC processing failed.' });
  }
};
