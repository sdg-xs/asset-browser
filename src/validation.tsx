import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LibraryModelsSchema, type LibraryModel, type CatalogIndex, type PreviewGeometry, type PropertyGroup } from '../shared/contracts.js';
import { IfcWorkerClient } from './ifc/client.js';
import { AssetViewer } from './viewer/AssetViewer.js';

function ValidationApp() {
  const client = useRef(new IfcWorkerClient());
  const generation = useRef(0);
  const [models, setModels] = useState<LibraryModel[]>([]);
  const [modelId, setModelId] = useState('');
  const [index, setIndex] = useState<CatalogIndex | null>(null);
  const [typeId, setTypeId] = useState('');
  const [status, setStatus] = useState('Choose a source and index it in the browser.');
  const [geometry, setGeometry] = useState<PreviewGeometry | null>(null);
  const [properties, setProperties] = useState<PropertyGroup[]>([]);
  const [metrics, setMetrics] = useState({ indexMs: 0, previewMs: 0, representativeId: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/models').then(async response => {
      if (!response.ok) throw new Error(`Library HTTP ${response.status}`);
      const raw: unknown = await response.json();
      const found = LibraryModelsSchema.parse(raw);
      if (active) { setModels(found); setModelId((found.find(model => model.name.toUpperCase() === 'BS19.IFC') ?? found[0])?.id ?? ''); }
    }).catch(error => { if (active) setStatus(String(error)); });
    return () => { active = false; client.current.dispose(); };
  }, []);

  const cancel = () => { generation.current++; client.current.dispose(); setBusy(false); setStatus('Cancelled. You can retry.'); };
  const open = async () => {
    const model = models.find(item => item.id === modelId);
    if (!model) return;
    const current = ++generation.current;
    const start = performance.now();
    setBusy(true); setGeometry(null); setProperties([]); setIndex(null);
    try {
      const result = await client.current.openModel({ model, fileUrl: `/api/models/${model.id}/file`, onProgress: message => { if (current === generation.current) setStatus(message); } });
      if (current !== generation.current) return;
      setIndex(result);
      setTypeId((result.types.find(type => type.categories.includes('Air quality sensor')) ?? result.types[0])?.id ?? '');
      setMetrics({ indexMs: performance.now() - start, previewMs: 0, representativeId: 0 });
      setStatus('Index ready. Select a real type to inspect.');
    } catch (error) { if (current === generation.current) setStatus(String(error)); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const inspect = async () => {
    const type = index?.types.find(item => item.id === typeId);
    if (!type) return;
    const current = ++generation.current;
    const start = performance.now();
    setBusy(true); setGeometry(null); setProperties([]); setStatus('Reading representative occurrence geometry');
    try {
      let failure = new Error('No occurrence has supported geometry.');
      for (const elementId of type.occurrenceIds) {
        try {
          const mesh = await client.current.readGeometry({ modelId, elementId });
          const groups = await client.current.readProperties({ modelId, elementId });
          if (current !== generation.current) return;
          setGeometry(mesh); setProperties(groups);
          setMetrics(previous => ({ ...previous, previewMs: performance.now() - start, representativeId: elementId }));
          setStatus('Representative preview and read-only properties ready.');
          return;
        } catch (error) {
          if (current !== generation.current) return;
          failure = error instanceof Error ? error : new Error(String(error));
        }
      }
      throw failure;
    } catch (error) { if (current === generation.current) setStatus(String(error)); }
    finally { if (current === generation.current) setBusy(false); }
  };

  return <main style={{ fontFamily: 'system-ui', maxWidth: 1100, margin: '24px auto', padding: 16 }}>
    <h1>Browser IFC validation</h1>
    <label>Source <select value={modelId} onChange={event => { cancel(); setModelId(event.target.value); setIndex(null); setGeometry(null); setProperties([]); }}>{models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>{' '}
    <button onClick={() => void open()} disabled={busy || !modelId}>Index source</button>{' '}
    <button onClick={cancel} disabled={!busy}>Cancel</button>
    <p role="status">{status}</p>
    {index && <>
      <pre data-testid="index-evidence">{JSON.stringify({ ...metrics, stats: index.stats, typeCount: index.types.length, categories: [...new Set(index.types.flatMap(type => type.categories))].length }, null, 2)}</pre>
      <label>Asset type <select value={typeId} onChange={event => { generation.current++; setTypeId(event.target.value); setGeometry(null); setProperties([]); setBusy(false); }}>{index.types.map(type => <option key={type.id} value={type.id}>{type.name} — {type.categories.join(', ')}</option>)}</select></label>{' '}
      <button onClick={() => void inspect()} disabled={busy || !typeId}>Inspect representative</button>
      <pre data-testid="type-evidence">{JSON.stringify(index.types.find(type => type.id === typeId), null, 2)}</pre>
    </>}
    {geometry && <AssetViewer geometry={geometry} />}
    <div data-testid="property-evidence">{properties.map((group, i) => <section key={`${group.source}:${group.name}:${i}`}><h2>{group.name} ({group.source})</h2><dl>{group.values.map((property, j) => <div key={j}><dt>{property.name}</dt><dd>{property.value || '(blank)'}</dd></div>)}</dl></section>)}</div>
  </main>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root.');
createRoot(root).render(<ValidationApp />);
