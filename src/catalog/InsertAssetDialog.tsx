import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Building2, Check, Layers, Search } from "lucide-react";
import { Dialog } from "../components/Dialog.js";

// Company property codes verified against the local PROPERTIES folders.
const properties = ["BS17", "BS19", "HG62", "JV3", "ODV18", "SOL10", "SOL11-23", "SOL20", "T135"];
// UI fixtures only; these are not storeys extracted from the property IFCs.
const sampleLevels = ["Basement", "Ground floor", "Level 1", "Level 2", "Roof"];

export function InsertAssetDialog({ assetName, onClose }: {
  assetName: string;
  onClose(): void;
}) {
  const [step, setStep] = useState<"property" | "level">("property");
  const [query, setQuery] = useState("");
  const [property, setProperty] = useState("");
  const [level, setLevel] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const matches = properties.filter(code => code.toLowerCase().includes(query.trim().toLowerCase()));
  return <Dialog title="Insert asset" onClose={onClose} className="insert-asset-dialog">
    <div className="insert-asset-summary">
      <div className="insert-asset-icon"><Layers size={22} aria-hidden="true" /></div>
      <div><span className="eyebrow">Selected asset</span><strong>{assetName}</strong></div>
      <span className="insert-test-badge">Test flow</span>
    </div>
    <ol className="insert-steps" aria-label="Insertion steps">
      <li aria-current={step === "property" ? "step" : undefined}>
        <span>{step === "level" ? <Check size={16} aria-hidden="true" /> : "1"}</span> Property
      </li>
      <li aria-current={step === "level" ? "step" : undefined}><span>2</span> Level</li>
    </ol>
    <section className="insert-destination" aria-labelledby="insert-destination-heading">
      <h3 id="insert-destination-heading" ref={heading} tabIndex={-1}>
        {step === "property" ? "Select a property" : "Select a level"}
      </h3>
      <p>{step === "property" ? "Choose the company digital twin property for this asset." :
        <>Choose a destination in <strong>{property}</strong>. Sample levels are shown for this test.</>}</p>
      {step === "property" ? <>
        <label className="insert-property-search"><Search size={18} aria-hidden="true" />
          <input type="search" aria-label="Search properties" placeholder="Search by property code" value={query}
            onChange={event => setQuery(event.target.value)} />
        </label>
        <fieldset className="insert-property-grid">
          <legend className="sr-only">Company properties</legend>
          {matches.map(code => <label className={`insert-choice ${property === code ? "is-selected" : ""}`} key={code}>
            <input type="radio" name="insert-property" aria-label={code} checked={property === code}
              onChange={() => { if (property !== code) setLevel(""); setProperty(code); }} />
            <Building2 size={24} strokeWidth={1.5} aria-hidden="true" />
            <span><strong>{code}</strong><small>Company property</small></span>
          </label>)}
        </fieldset>
        {!matches.length && <p className="insert-empty">No properties match your search.</p>}
      </> : <>
        <div className="insert-property-context"><Building2 size={20} aria-hidden="true" />
          <strong>{property}</strong><span>Company property</span>
        </div>
        <fieldset className="insert-level-list">
          <legend className="sr-only">Sample levels in {property}</legend>
          {sampleLevels.map(name => <label className={`insert-choice ${level === name ? "is-selected" : ""}`} key={name}>
            <input type="radio" name="insert-level" aria-label={name} checked={level === name} onChange={() => setLevel(name)} />
            <Layers size={20} strokeWidth={1.5} aria-hidden="true" />
            <span><strong>{name}</strong><small>Sample level</small></span>
          </label>)}
        </fieldset>
        {level && <div className="insert-selection-status" role="status">
          <Check size={20} aria-hidden="true" /><span><strong>{property} · {level}</strong>
          <small>Destination selected for testing. No asset has been inserted.</small></span>
        </div>}
      </>}
    </section>
    <div className="dialog-actions insert-footer">
      {step === "level" ? <button type="button" onClick={() => { setQuery(""); setStep("property"); }}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to properties
      </button> : <button type="button" onClick={onClose}>Cancel</button>}
      {step === "property" ? <button type="button" className="primary" disabled={!property} onClick={() => setStep("level")}>
        Select level
      </button> : <button type="button" onClick={onClose}>Close</button>}
    </div>
  </Dialog>;
}
