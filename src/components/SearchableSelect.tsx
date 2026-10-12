import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { ClassificationOption } from "../../shared/asset-classifications.js";

export function SearchableSelect({ label, value, options, onChange, disabled = false, placeholder, emptyLabel = "Not assigned", noMatchesMessage }: {
  label: string;
  value: string;
  options: ClassificationOption[];
  onChange(value: string): void;
  disabled?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  noMatchesMessage?: string;
}) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const matches = options.filter(option => `${option.label} ${option.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const choices = [{ value: "", label: emptyLabel, description: "" }, ...matches];
  const selectedLabel = options.find(option => option.value === value)?.label ?? value;
  const activeIndex = Math.min(active, choices.length - 1);
  useEffect(() => {
    if (open) menu.current?.querySelector('[role="option"].active')?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIndex, query]);
  const choose = (next: string) => { onChange(next); setOpen(false); setQuery(""); };
  return <div className="classification-picker" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <div className="classification-search-input">
      <Search size={15} aria-hidden="true" />
      <input role="combobox" disabled={disabled} aria-label={label} aria-expanded={open && !disabled} aria-controls={`${id}-list`}
        aria-autocomplete="list" aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        autoComplete="off" placeholder={placeholder ?? `Search ${label === "System" ? "code or system name" : "IFC classes"}…`}
        value={open && !disabled ? query : selectedLabel}
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
            if (query.trim() && !matches.length) return;
            const option = choices[activeIndex];
            if (option) choose(option.value);
          }
        }} />
      <ChevronDown size={15} aria-hidden="true" />
    </div>
    {open && !disabled && <div ref={menu} className="classification-menu" id={`${id}-list`} role="listbox" aria-label={`${label} choices`}>
      {choices.map((option, index) => <button type="button" role="option" id={`${id}-option-${index}`} key={option.value}
        aria-label={option.label} aria-selected={option.value === value} tabIndex={-1}
        className={index === activeIndex ? "active" : ""}
        onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(option.value)}>
        <span>{option.label}</span>{option.description && <small>{option.description}</small>}
      </button>)}
      {!matches.length && <p role="status">{noMatchesMessage ?? `No matching ${label === "System" ? "systems" : "IFC classes"}.`}</p>}
    </div>}
  </div>;
}
