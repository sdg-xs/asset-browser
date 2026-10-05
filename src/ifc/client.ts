import { z } from 'zod';
import { CatalogIndexSchema, PreviewGeometrySchema, PropertyGroupSchema, type CatalogIndex, type LibraryModel, type PreviewGeometry, type PropertyGroup } from '../../shared/contracts.js';
import { RequestSchema, ResponseSchema, type WorkerRequest } from './protocol.js';
import type { Progress } from './reader.js';
import { SourceRevisionError } from '../../shared/revision.js';

interface Pending { resolve: (value: unknown) => void; reject: (error: Error) => void; onProgress: Progress }
type RequestInput = WorkerRequest extends infer R ? R extends WorkerRequest ? Omit<R, 'requestId'> : never : never;

/** Cancellation terminates the worker, including synchronous WASM work. Reusable after dispose/retry. */
export class IfcWorkerClient {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private opened: CatalogIndex | null = null;

  private createWorker(): Worker {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const parsed = ResponseSchema.safeParse(event.data);
      if (!parsed.success) { this.stop(new Error('The IFC worker returned invalid data.')); return; }
      const response = parsed.data;
      if (response.kind === 'error' && response.requestId === -1) { this.stop(new Error(response.message)); return; }
      const pending = this.pending.get(response.requestId);
      if (!pending) return;
      if (response.kind === 'progress') { pending.onProgress(response.message); return; }
      this.pending.delete(response.requestId);
      if (response.kind === 'error') pending.reject(response.code === 'SOURCE_CHANGED' ? new SourceRevisionError() : new Error(response.message));
      else pending.resolve(response.value);
    };
    worker.onerror = event => this.stop(new Error(event.message || 'IFC worker failed. Retry opening the model.'));
    worker.onmessageerror = () => this.stop(new Error('Could not receive IFC worker data.'));
    return worker;
  }
  private request(input: RequestInput, onProgress: Progress = () => {}): Promise<unknown> {
    this.worker ??= this.createWorker();
    const requestId = ++this.sequence;
    const request = RequestSchema.parse({ ...input, requestId });
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onProgress });
      this.worker?.postMessage(request);
    });
  }
  async openModel({ model, fileUrl, onProgress = () => {} }: { model: LibraryModel; fileUrl: string; onProgress?: Progress }): Promise<CatalogIndex> {
    if (this.opened?.modelId === model.id && this.opened.fingerprint === model.fingerprint) return this.opened;
    this.dispose();
    const pending = this.request({ kind: 'open', model, fileUrl: new URL(fileUrl, window.location.href).href, wasmPath: new URL('/wasm/', window.location.href).href }, onProgress);
    const worker = this.worker;
    try {
      this.opened = CatalogIndexSchema.parse(await pending);
      return this.opened;
    } catch (error) {
      if (this.worker === worker) this.dispose();
      throw error;
    }
  }
  async readProperties({ modelId, elementId }: { modelId: string; elementId: number }): Promise<PropertyGroup[]> {
    return z.array(PropertyGroupSchema).parse(await this.request({ kind: 'properties', modelId, elementId }));
  }
  async readGeometry({ modelId, elementId }: { modelId: string; elementId: number }): Promise<PreviewGeometry> {
    return PreviewGeometrySchema.parse(await this.request({ kind: 'geometry', modelId, elementId }));
  }
  private stop(error: Error): void {
    this.worker?.terminate(); this.worker = null; this.opened = null;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
  dispose(): void { this.stop(new DOMException('IFC processing cancelled.', 'AbortError')); }
}
