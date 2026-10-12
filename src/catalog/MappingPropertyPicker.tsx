import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export interface MappingPropertyOption {
  key: string;
  label: string;
}

export function MappingPropertyPicker({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: MappingPropertyOption[];
  onChange(value: string): void;
}) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = options.find(option => option.key === value);
  const search = query.trim().toLocaleLowerCase();
  const matches = options.filter(option => option.label.toLocaleLowerCase().includes(search));
  const choices = [{ key: "", label: "Enter manually" }, ...matches];
  const activeIndex = Math.min(active, choices.length - 1);
  useEffect(() => {
    if (open) menu.current?.querySelector('[role="option"].active')?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIndex, query]);
  const choose = (key: string) => {
    onChange(key);
    setOpen(false);
    setQuery("");
  };
  return <div className="mapping-property-picker" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <div className="mapping-search-input">
      <Search size={15} aria-hidden="true" />
      <input role="combobox" aria-label={label} aria-expanded={open} aria-controls={`${id}-list`}
        aria-autocomplete="list" aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        autoComplete="off" placeholder="Search or type a property…"
        value={open ? query : value ? selected?.label ?? `Unavailable property: ${value}` : "Enter manually"}
        onFocus={() => { setOpen(true); setQuery(""); setActive(0); }}
        onClick={() => { if (!open) { setOpen(true); setQuery(""); setActive(0); } }}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(event.target.value.trim() ? 1 : 0); }}
        onKeyDown={event => {
          if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) { setOpen(true); setQuery(""); setActive(0); }
            else setActive(index => Math.max(0, Math.min(choices.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
          }
          if (event.key === "Enter" && open) {
            event.preventDefault();
            const option = choices[activeIndex];
            if (option) choose(option.key);
          }
        }} />
      <ChevronDown size={15} aria-hidden="true" />
    </div>
    {open && <div ref={menu} className="mapping-property-menu" id={`${id}-list`} role="listbox" aria-label={`${label} properties`}>
      {choices.map((option, index) => <button type="button" role="option" id={`${id}-option-${index}`} key={option.key}
        aria-label={option.label} aria-selected={option.key === value} tabIndex={-1}
        className={index === activeIndex ? "active" : ""}
        onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(option.key)}>
        <span>{option.label}</span>
      </button>)}
      {matches.length === 0 && <p role="status">No matching properties. Try another search or enter the value manually.</p>}
    </div>}
  </div>;
}
