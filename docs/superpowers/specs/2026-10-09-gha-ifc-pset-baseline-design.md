# GHA and IFC property baseline design

Status: awaiting written-spec approval. Product implementation has not started.

## Intent and agreed workflow

Extend the existing asset browser so staff can configure a Generic Hard Asset classification, select its IFC class through a searchable dropdown, and immediately see applicable standard Pset parameters. Asset creation inherits that classification and presents the same parameter layout, with manual values or source-property mappings.

The user explicitly requires the asset's IFC class to be inherited and fixed. An asset form must never independently change the GHA mapping. Server validation must enforce this rule, including requests that bypass the UI.

GHA remains the company classification with a stable ID, name and editable definition. Several GHAs may share one IFC class. Standard parameters are automatically listed, but listing does not create a value, import source data, make a field mandatory or approve company requirements.

## Current implementation and constraints

- `shared/catalog-library.ts` defines categories with stable IDs, aliases and optional upload-field mappings. Category templates contain confirmed and suggested source mappings. Definitions store curated specifications; approved entries retain frozen publications.
- `src/catalog/CategoryEditor.tsx` manages categories and source mappings. `UploadAssetDetails.tsx` applies category upload defaults but currently permits an independent IFC class value or source mapping.
- `shared/catalog-rules.ts` handles catalog commands and category alias absorption. `server/catalog-library-store.ts` validates, serializes and atomically persists commands with `expectedRevision` checks.
- `shared/catalog-publication.ts` provides additive schema-1 compatibility. Existing keys, values, approvals, exclusions, uploads, geometry references and source observations must survive this extension.
- The installed web-ifc parser recognizes IFC2X3, IFC4 and IFC4X3. Current inspected fixtures use IFC4. There is no existing standard Pset reference dataset or persisted catalog-wide target IFC release.
- The checkout contains substantial pre-existing changes. Implementation must extend these files without discarding or committing unrelated work.

## Approach and reference coverage

Use an additive catalog extension and the existing Categories, creation and review workflows. Keep the current source mapping and publication behavior for existing custom fields. A replacement of the template model would unnecessarily threaten existing parameter identities and approvals; inserting reference properties directly into templates would conflate definitions, assignments and values.

The proposed first reference baseline is IFC4 ADD2 TC1, explicitly labeled and pinned to its release. Preserve parsing of other currently supported source schemas. Do not advertise IFC4 baseline coverage for IFC2X3 or IFC4X3, infer applicability across releases or silently convert source schemas. Reference coverage and source parsing support must have separate labels.

Use a locally packaged buildingSMART reference snapshot with release, source URL and upstream revision information. The snapshot must contain the supported class hierarchy, class-specific PredefinedType options, Pset applicability and property metadata needed for deterministic filtering. If packaging is limited to a documented subset, the UI must identify that coverage and never claim missing Psets are inapplicable.

bSDD is a definition reference only. Store verified reference links where available, without a runtime service, credentials, synchronization, dictionary editor or IDS subsystem. Do not invent bSDD identifiers from property names. IFC standard definitions remain the authoritative basis for applicability.

## Data separation

1. **GHA classification:** preserve the existing category ID, name and aliases; add the company definition. Do not guess definitions for existing company labels.
2. **GHA IFC mapping:** associate the GHA with a reference release, valid IFC class, optional valid PredefinedType, and Draft/Approved lifecycle. Store this separately from upload mappings, which describe where source values come from.
3. **Reusable property definition:** use stable release-qualified reference identities. Store Pset name, property name, semantic definition, IFC datatype/property shape, enumerations or units where specified, applicability, and references. A property definition contains no asset value or company-required flag.
4. **Per-GHA property assignment:** reference the GHA and property definition; record library-type or installed-occurrence scope, optional source keys, company display configuration, optional/required requirement and approval state. Selection and source mapping are company configuration, not edits to the standard definition.
5. **Actual values:** keep library specification values on the reusable definition and source observations in their current records. Reference assignments by stable identity. Installed-asset values remain source occurrence information; this change does not create an installed-asset inventory.

Standard applicability and company scope are different concepts. Type-driven IFC properties can have occurrence overrides without making all occurrence values reusable specifications. Occurrence-only parameters must be identified and excluded from library specification publication. Unsupported complex property shapes must retain their metadata and show an explicit editing limitation rather than being flattened into invented text values.

Keep false, zero, blank and unknown distinct when supporting baseline datatypes. Existing custom text/number values and normalization must keep their meanings. Adding a field cannot fabricate a default value.

## IFC inheritance and identity protection

The GHA configuration owns the IFC class selector. Assets display the inherited release, class and PredefinedType as read-only information. Source IFC class evidence stays separately visible and unchanged.

On creation the server derives the IFC identity from the selected GHA, not from a client-supplied class string. Reject contradictory supplied identities before persistence. Persist the inherited identity so subsequent configuration changes cannot silently reclassify assets.

Once referenced by an asset, a GHA mapping's release, class and PredefinedType cannot be replaced through ordinary configuration edits. Names, definitions and compatible property assignments remain editable. Changing GHA on an asset cannot bypass the IFC identity lock. A future deliberate reclassification/migration process is outside this change.

Existing catalog entries without a persisted mapping remain readable, editable through their existing workflows, and retain approval/publication. Do not guess a single GHA mapping from mixed source IFC classes. New baseline creation requires a configured GHA mapping; the UI explains how to configure an unmapped GHA. Existing unclassified IFC analysis/import can still retain source evidence and create legacy review drafts, without fabricating a baseline identity.

Category alias absorption must not discard incompatible mappings or change locked identities. Reject incompatible absorption before mutation. Compatible assignments can be retained by stable identity without copying values between assets.

## Category and asset UI

In Categories, retain company labels, aliases, custom mappings and upload defaults. Add the GHA definition, searchable IFC class dropdown, applicable PredefinedType dropdown, reference-release label and mapping status.

Selecting a class immediately displays applicable Psets grouped by name. Include inherited applicability and predefined-type constraints. Staff can search the parameter list. No separate per-property selection is required merely to see the baseline. Staff can choose which optional properties to use, enter company source mappings, and save that configuration as Draft.

Asset creation selects a GHA and shows its fixed IFC identity plus the corresponding baseline. Used parameters accept manual values or the existing searchable source-property mapping interaction. Unused optional parameters stay empty and do not create persisted values. Keep custom fields available alongside the standard baseline.

Separate reusable library specifications from installed-asset/source parameters with plain labels. Show mapping and company requirement approval status. A source mismatch must be disclosed without rewriting source evidence or letting the asset form override the GHA mapping.

Changing a class during initial GHA configuration recalculates the displayed baseline. It must never silently delete saved assignments or values. An incompatible saved assignment requires explicit removal before configuration can be saved; referenced mappings remain fixed.

## Approval and publication

New IFC mappings and company property assignments are Draft. Saving configuration or selecting an IFC class does not approve them. Existing asset approval commands remain separate from approving company configuration.

Draft requirements remain optional and cannot block existing approvals. A requirement becomes mandatory only through an explicit company approval command. Validate that approval against the reference release, applicability, value datatype support and assignment scope. Newly approved requirements apply to subsequent asset review; they do not revoke existing approvals or rewrite frozen publications.

Editing an approved requirement returns the changed configuration to Draft while retaining the last approved configuration for publication decisions. Pending configuration cannot silently relax or tighten accepted company requirements.

All new commands follow the existing Zod boundary validation, monotonic catalog revision, atomic persistence and HTTP 409 refresh behavior. Do not retry stale staff decisions automatically.

## Compatibility and persistence

Add fields with explicit legacy defaults through the current schema-1 migration path. Preserve existing category/entry IDs, parameter keys, curated overrides, custom mappings, approval states, publications, source references and geometry. Do not introduce network access on catalog load.

Reference definitions are packaged once; catalog records store selected assignments and reference identities rather than duplicating the entire reference dataset for every GHA or asset. Loading an old catalog must not create assignments, requirements or standard values. The next successful command persists additive metadata through the existing store.

## Verification and acceptance

- Reference tests cover class inheritance, predefined-type restrictions, applicable/inapplicable Psets, release isolation, type/occurrence applicability and stable identities.
- Domain tests cover multiple GHAs sharing a class, automatically available optional baselines, independent values, preservation of custom fields, Draft requirements, explicit approval and frozen publications.
- Server tests prove contradictory IFC identities, attempted remapping of referenced GHAs, incompatible category absorption and stale revisions reject without any catalog mutation.
- Persistence tests load a legacy schema-1 catalog, apply baseline configuration, restart the store and compare retained IDs, custom values, publications, references and geometry.
- UI tests cover searchable class selection, automatic parameter listing, fixed inherited asset identity, manual/source mapping, optional empty fields and separate installed-asset information.
- Run the relevant tests, full suite with bounded workers, strict typecheck and production build. Record any pre-existing failures separately.
- Verify the running production UI on desktop and narrow mobile layouts, including keyboard selection, source mappings, Draft/approval outcomes and restart retention, using isolated data and service ports. Preserve normal local catalog data and source files.

Report actual reference coverage, schema support, datatype limitations and browser/persistence evidence. No push or deployment is authorized.

## Reference sources

- IFC property template applicability: https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2/HTML/schema/ifckernel/lexical/ifcpropertysettemplatetypeenum.htm
- bSDD separates property definitions and class-property assignments: https://technical.buildingsmart.org/services/bsdd/data-structure/
- Existing curated design: `2026-10-06-curated-asset-library-design.md`.

## Approval checkpoint

The GHA-owned fixed identity and automatic baseline listing reflect the user's clarification. Approval of this written specification is still required, including the proposed initial IFC4 reference coverage. After written-spec approval, prepare a reviewable implementation plan and obtain the user's execution-method selection before changing product code.
