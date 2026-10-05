import { SourceRevisionError } from '../../shared/revision.js';
import type { LibraryModel } from '../../shared/contracts.js';

export async function downloadModel(fileUrl: string | URL, model: Pick<LibraryModel, 'fingerprint'>): Promise<Uint8Array> {
  const response = await fetch(fileUrl, { headers: { 'X-IFC-Fingerprint': model.fingerprint }, cache: 'no-store' });
  if (response.status === 409) throw new SourceRevisionError();
  if (!response.ok) throw new Error(`Unable to load IFC: HTTP ${response.status}.`);
  if (response.headers.get('X-IFC-Fingerprint') !== model.fingerprint) throw new SourceRevisionError();
  return new Uint8Array(await response.arrayBuffer());
}
