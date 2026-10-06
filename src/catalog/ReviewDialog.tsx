import {
  referenceKey,
  consolidateReferences,
} from "../../shared/catalog-references.js";
import { useMemo, useState } from "react";
import type {
  CatalogLibrary,
  LibraryEntry,
} from "../../shared/catalog-library.js";
import {
  duplicateCandidates,
  entryFieldSuggestions,
} from "../../shared/catalog-rules.js";
import { Dialog } from "../components/Dialog.js";
import type { CatalogAction } from "./api.js";
import {
  entrySpecifications,
  fieldLabel,
  entryFieldLabel,
  valueText,
} from "./display.js";
export function ReviewDialog({
  mode,
  state,
  entry,
  pending,
  onSave,
  onClose,
  error,
}: {
  mode: "merge" | "split" | "geometry";
  state: CatalogLibrary;
  entry: LibraryEntry;
  pending: boolean;
  error: string;
  onSave(action: CatalogAction): Promise<boolean>;
  onClose(): void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [preferred, setPreferred] = useState(
    entry.sourceReferences[0] ? referenceKey(entry.sourceReferences[0]) : "",
  );
  const [occurrence, setOccurrence] = useState(
    String(entry.sourceReferences[0]?.occurrenceIds[0] ?? ""),
  );
  const [equivalents, setEquivalents] = useState(
    entry.sourceReferences.filter((r) => r.equivalent).map(referenceKey),
  );
  const [reviewedSources, setReviewedSources] = useState<string[]>([]);
  const [subsets, setSubsets] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(
      entry.sourceReferences.map((r) => [
        referenceKey(r),
        [...r.occurrenceIds],
      ]),
    ),
  );
  const rebind = reviewedSources.includes(preferred);
  const setRebind = (reviewed: boolean) =>
    setReviewedSources((ids) =>
      reviewed
        ? [...ids.filter((id) => id !== preferred), preferred]
        : ids.filter((id) => id !== preferred),
    );
  const toggle = (id: string) =>
    setSelected((all) =>
      all.includes(id) ? all.filter((v) => v !== id) : [...all, id],
    );
  const finish = (action: CatalogAction) =>
    void onSave(action).then((ok) => {
      if (ok) onClose();
    });
  const candidates = useMemo(
    () => (mode === "merge" ? duplicateCandidates(state, entry.id) : []),
    [mode, state, entry.id],
  );
  const preferredRef = entry.sourceReferences.find(
    (r) => referenceKey(r) === preferred,
  );
  const preferredSource = state.sources.find(
    (s) => s.id === preferredRef?.sourceId,
  );
  const occurrences = subsets[preferred] ?? preferredRef?.occurrenceIds ?? [];
  return (
    <Dialog
      title={
        mode === "merge"
          ? "Compare and merge definitions"
          : mode === "split"
            ? "Split specification variants"
            : "Choose preferred geometry"
      }
      onClose={onClose}
      busy={pending}
      className="author-dialog"
    >
      {error && <p role="alert">{error}</p>}
      {mode === "merge" && (
        <>
          <p>
            Keep <strong>{entry.definition.name}</strong> as the target. Its
            curated values remain; absorbed definitions are archived. The result
            requires review.
          </p>
          {candidates.length ? (
            candidates.map((candidate) => {
              const other = state.entries.find(
                (e) => e.id === candidate.entryId,
              );
              if (!other) return null;
              return (
                <section className="comparison" key={other.id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={selected.includes(other.id)}
                      onChange={() => toggle(other.id)}
                    />
                    {other.definition.name}
                  </label>
                  <p>Evidence: {candidate.confidence}</p>
                  <p>
                    {candidate.differences.length
                      ? candidate.differences
                          .map((key) =>
                            fieldLabel(state, key, entry.definition.categoryId),
                          )
                          .join(" · ")
                      : "No known differences"}
                  </p>
                  <p>
                    {candidate.missingEvidence
                      .map((key) =>
                        fieldLabel(state, key, entry.definition.categoryId),
                      )
                      .join(" · ")}
                  </p>
                  <div className="comparison-columns">
                    {[entry, other].map((e) => (
                      <div key={e.id}>
                        <strong>{e.definition.name}</strong>
                        <p>
                          {e.definition.manufacturer.value ||
                            "Unknown manufacturer"}{" "}
                          / {e.definition.model.value || "Unknown model"}
                        </p>
                        {entryFieldSuggestions(state, e).map((field) => (
                          <p key={`source:${field.key}`}>
                            Source{" "}
                            {fieldLabel(
                              state,
                              field.key,
                              e.definition.categoryId,
                            )}
                            :{" "}
                            {field.values.map(valueText).join(" / ") ||
                              "Unknown"}{" "}
                            · {field.status}
                          </p>
                        ))}
                        {Object.entries(entrySpecifications(state, e)).map(
                          ([key, value]) => (
                            <p key={key}>
                              {entryFieldLabel(state, e, key)}:{" "}
                              {valueText(value)}
                            </p>
                          ),
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          ) : (
            <p>No duplicate candidates found.</p>
          )}
          <button
            className="primary"
            disabled={pending || !selected.length}
            onClick={() =>
              finish({
                kind: "merge",
                targetId: entry.id,
                absorbedIds: selected,
              })
            }
          >
            Confirm merge
          </button>
        </>
      )}
      {mode === "split" && (
        <>
          <p>
            Choose confirmed variant fields. Actual occurrence values determine
            partitions. The original is archived and each resulting variant
            becomes a draft.
          </p>
          {(
            state.templates.find(
              (t) => t.categoryId === entry.definition.categoryId,
            )?.mappings ?? []
          )
            .filter((m) => m.role === "variant")
            .map((m) => (
              <label className="check" key={m.key}>
                <input
                  type="checkbox"
                  checked={selected.includes(m.key)}
                  onChange={() => toggle(m.key)}
                />
                {m.label}
              </label>
            ))}
          <p>Configure variant fields in Categories if none appear here.</p>
          <button
            className="primary"
            disabled={pending || !selected.length}
            onClick={() =>
              finish({
                kind: "split",
                entryId: entry.id,
                variantFieldKeys: selected,
              })
            }
          >
            Confirm split into drafts
          </button>
        </>
      )}
      {mode === "geometry" && (
        <>
          <p>
            Choose the first occurrence to preview. Automatic fallbacks use only
            sources you explicitly confirm as equivalent. Saving returns the
            definition to review. Review each changed source before saving.
          </p>
          <label>
            Preferred source
            <select
              value={preferred}
              onChange={(e) => {
                setPreferred(e.target.value);
                const ref = entry.sourceReferences.find(
                  (r) => referenceKey(r) === e.target.value,
                );
                setOccurrence(
                  String(
                    (subsets[e.target.value] ?? ref?.occurrenceIds)?.[0] ?? "",
                  ),
                );
              }}
            >
              {entry.sourceReferences.map((r) => (
                <option key={referenceKey(r)} value={referenceKey(r)}>
                  {state.sources.find((s) => s.id === r.sourceId)?.sourceName} ·{" "}
                  {r.fingerprint}
                </option>
              ))}
            </select>
          </label>
          <section className="suggestion">
            <strong>{preferredSource?.observation.name}</strong>
            <p>
              {preferredSource?.sourceName} ·{" "}
              {preferredSource?.observation.ifcClass}
            </p>
            <p>
              Referenced revision: {preferredRef?.fingerprint}. Current
              revision: {preferredSource?.fingerprint}.
            </p>
            {preferredSource?.observation.fields.map((field) => (
              <p key={field.key}>
                {field.name}:{" "}
                {field.values
                  .map(
                    (value) =>
                      `${valueText(value.normalized)} (occurrences ${value.occurrenceIds.join(", ")})`,
                  )
                  .join(" / ")}
              </p>
            ))}
          </section>
          <label className="check">
            <input
              type="checkbox"
              checked={rebind}
              onChange={(e) => {
                setRebind(e.target.checked);
                const ids =
                  preferredRef?.fingerprint === preferredSource?.fingerprint
                    ? (preferredRef?.occurrenceIds ?? [])
                    : [];
                setSubsets((all) => ({ ...all, [preferred]: ids }));
                setOccurrence(String(ids[0] ?? ""));
              }}
            />
            I reviewed the current source revision and its occurrence membership
          </label>
          {rebind && (
            <fieldset>
              <legend>Occurrences belonging to this definition</legend>
              <p>
                Select only matching variants. A changed source requires a new
                subset selection.
              </p>
              {preferredSource?.observation.occurrenceIds.map((id) => (
                <label className="check" key={id}>
                  <input
                    type="checkbox"
                    checked={occurrences.includes(id)}
                    onChange={(e) => {
                      const ids = e.target.checked
                        ? [...occurrences, id]
                        : occurrences.filter((value) => value !== id);
                      setSubsets((all) => ({ ...all, [preferred]: ids }));
                      if (!ids.includes(Number(occurrence)))
                        setOccurrence(String(ids[0] ?? ""));
                    }}
                  />
                  Include occurrence #{id}
                </label>
              ))}
            </fieldset>
          )}
          <label>
            Preferred occurrence
            <select
              value={occurrence}
              onChange={(e) => setOccurrence(e.target.value)}
            >
              {occurrences.map((id) => (
                <option key={id} value={id}>
                  Occurrence #{id}
                </option>
              ))}
            </select>
          </label>
          {entry.sourceReferences
            .filter((r) => referenceKey(r) !== preferred)
            .map((r) => (
              <label className="check" key={referenceKey(r)}>
                <input
                  type="checkbox"
                  checked={equivalents.includes(referenceKey(r))}
                  onChange={(e) =>
                    setEquivalents((all) =>
                      e.target.checked
                        ? [...all, referenceKey(r)]
                        : all.filter((id) => id !== referenceKey(r)),
                    )
                  }
                />
                Equivalent geometry:{" "}
                {state.sources.find((s) => s.id === r.sourceId)?.sourceName} ·{" "}
                {r.fingerprint}
              </label>
            ))}
          <button
            disabled={pending || !occurrence}
            className="primary"
            onClick={() => {
              const references = consolidateReferences(
                [...entry.sourceReferences]
                  .sort(
                    (a, b) =>
                      Number(referenceKey(b) === preferred) -
                      Number(referenceKey(a) === preferred),
                  )
                  .map((r) => {
                    const source = state.sources.find(
                      (s) => s.id === r.sourceId,
                    );
                    const ids = subsets[referenceKey(r)] ?? r.occurrenceIds;
                    return {
                      ...r,
                      fingerprint:
                        reviewedSources.includes(referenceKey(r)) && source
                          ? source.fingerprint
                          : r.fingerprint,
                      equivalent: equivalents.includes(referenceKey(r)),
                      occurrenceIds:
                        referenceKey(r) === preferred
                          ? [
                              Number(occurrence),
                              ...ids.filter((id) => id !== Number(occurrence)),
                            ]
                          : ids,
                    };
                  }),
              );
              finish({
                kind: "edit",
                entryId: entry.id,
                definition: entry.definition,
                confirmedSourceReferences: references,
                sourceRebindings: entry.sourceReferences.flatMap((r) => {
                  const source = state.sources.find((s) => s.id === r.sourceId);
                  return reviewedSources.includes(referenceKey(r)) &&
                    source &&
                    source.fingerprint !== r.fingerprint
                    ? [
                        {
                          sourceId: r.sourceId,
                          fromFingerprint: r.fingerprint,
                          toFingerprint: source.fingerprint,
                          occurrenceIds: subsets[referenceKey(r)] ?? [],
                        },
                      ]
                    : [];
                }),
              });
            }}
          >
            Save preferred geometry
          </button>
        </>
      )}
    </Dialog>
  );
}
