# Curated asset library requirements

The user-approved 2026-10-06 [curated design](superpowers/specs/2026-10-06-curated-asset-library-design.md) supersedes the original source-type-card organization and read-only catalog scope. The original IFC browser remains in Sources. This is a local, staff-only application, with no remote deployment required.

## Definitions and review

- Library displays approved reusable products and generic specification variants across sources. Independent UUIDs identify cards; IFC GUIDs and Express IDs remain internal source references.
- Imported types become drafts. Staff explicitly approves entries, individually or in a reviewed batch. A readable name and canonical category are required for a generic definition; specifications may be unknown. A product requires staff-confirmed manufacturer and model. Staff may explicitly resolve unresolved conflicts as unknown during batch approval, preserving raw source evidence and existing curated values. Missing names or categories continue to block approval.
- Staff can edit curated definitions, archive/restore them, confirm categories/aliases/templates, resolve unknown/conflicting specifications, review duplicates, merge and split confirmed variants. Original IFC properties stay read-only.
- Equal names never automatically merge. Differences and missing evidence must be visible before confirmation. Merge retains target overrides and archives absorbed definitions; split preserves occurrence partitions. Both results require review.
- Imported category labels remain distinct until staff confirms aliases. Each template parameter has a stable key, one or more source property keys, a display label, data kind, canonical unit and specification/variant role. Comparison, conflicts, overrides and splitting use parameter identity rather than display text. Source/name hints remain suggestions.

## Source interpretation

Instance property presence takes precedence over type fallback, including explicit blanks. `Identity Data / Generic Hard Asset` seeds categories; absent/blank/NA effective classifications are excluded from source indexes and counted. Missing numeric data is unknown, never zero. Observations retain raw value, measure/unit metadata, normalized value and exact occurrence membership.

Recognized SI/conversion-based length, area, volume, power, flow and voltage normalize to m, m², m³, W, m³/s and V. Unsupported units remain text/unknown. Technical identities and installation labels are provenance, not reusable suggestions. Raw IFC property inspection remains available. Product hints are not confirmed identity.

## Persistence and geometry

`library.json` preserves source/index/visibility state. A separate schema-version-1 `catalog-library.json` preserves definitions, source observations, categories, templates and overrides. Atomic serialized writes and expected catalog revisions prevent stale tabs from overwriting staff decisions. Same-fingerprint import is idempotent; changed sources retain overrides and frozen accepted specifications, and flag approved entries in Needs review. Geometry rebinding never implicitly expands a variant subset.

Source hiding does not delete files or approved entries. Card click opens side inspection; the arrow opens a centered native dialog with focus return. Preview uses the current preferred source/occurrence, then only explicitly equivalent references. Current inventory/fingerprint/type/membership checks prevent silent rebinding to a different asset. Geometry errors stay local; approved definitions remain usable without a model.

## Acceptance and limits

Real BS19/JV3 imports, actual generic curation and approval, source/raw properties, both preview modes, mobile/desktop layout, restart persistence and hidden-source retention are required. Small actual IFC fixtures may supply controlled split/merge/fallback cases; their evidence must remain separate from real-model evidence. Full tests, strict typecheck and production build must pass.

The local sources and approved catalog are not shipped in Git. A fresh machine needs original sources or uploads and explicit import/review. Large catalog response/rendering costs, unsupported exporters/units, source size/mtime detection limits and unverified HG62 memory demand are documented in [verification](verification.md). FM workflows/import, placement, RFA, Nucleus, original IFC editing and enterprise catalog backends remain deferred.
