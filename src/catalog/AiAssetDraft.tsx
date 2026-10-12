import { useRef, useState } from "react";
import { ArrowUp, Paperclip, Sparkles, X } from "lucide-react";

export function AiAssetDraft() {
  const picker = useRef<HTMLInputElement>(null);
  const [references, setReferences] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const addReferences = (files: File[]) => setReferences(previous => [...previous, ...files]);
  return <section className="creation-method creation-ai" aria-label="Create asset with AI">
    <header className="creation-method-heading">
      <h3><Sparkles size={18} aria-hidden="true" /> Use AI</h3>
      <span className="creation-ai-badge">Coming soon</span>
    </header>
    <div className="creation-ai-welcome">
      <div className="creation-ai-symbol"><Sparkles size={26} aria-hidden="true" /></div>
      <h4>What would you like to create?</h4>
      <p>Describe your asset and add reference images or documents.</p>
    </div>
    <div className={`creation-ai-references${dragging ? " is-dragging" : ""}`}
      role="region" aria-label="AI reference files"
      onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        addReferences(Array.from(event.dataTransfer.files));
      }}>
      <Paperclip size={18} aria-hidden="true" />
      <span>Drag and drop files for reference</span>
    </div>
    {references.length > 0 && <ul className="creation-ai-file-list" aria-label="Selected AI references">
      {references.map((file, index) => <li key={index}>
        <Paperclip size={14} aria-hidden="true" /><span>{file.name}</span>
        <button type="button" className="icon-button" aria-label={`Remove reference ${file.name}`}
          onClick={() => setReferences(previous => previous.filter((_, item) => item !== index))}>
          <X size={14} aria-hidden="true" />
        </button>
      </li>)}
    </ul>}
    <div className="creation-ai-composer">
      <textarea aria-label="AI asset description" placeholder="Describe the asset you want to create…" rows={3} />
      <div className="creation-ai-toolbar">
        <input ref={picker} hidden type="file" multiple aria-label="AI reference file picker"
          onChange={event => { addReferences(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <button type="button" className="creation-ai-attach" onClick={() => picker.current?.click()}>
          <Paperclip size={16} aria-hidden="true" /> Add files
        </button>
        <button type="button" className="primary creation-ai-send" aria-label="Send AI message" disabled>
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
    <p className="creation-ai-note">AI is not connected yet. Messages and reference files are not submitted.</p>
  </section>;
}
