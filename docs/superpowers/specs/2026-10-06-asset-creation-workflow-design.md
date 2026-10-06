# Maintainable asset creation workflow

Status: proposed written baseline for review. The user confirmed the workflow direction, Generic Hard Asset classification and Library as the front page. This document describes the next build, not completed functionality.

## Purpose and boundaries

Staff create reusable definitions for maintainable building components by uploading IFC content, validating and finalizing candidates in Needs review, and approving them into the Library. A library card represents a reusable asset type or specification variant. It does not represent every installed occurrence. The vocabulary is defined in [CONTEXT.md](../../../CONTEXT.md).

The application remains staff-only and local-first. IFC files may contain one asset or multiple assets. Existing approved content, source files, exclusions, source references and curated decisions are preserved. FM integration, placement, maintenance scheduling, installed-asset registers, RFA support, cloud deployment and geometric authoring remain outside this build.

## Entry point and navigation

Library is the default front page and the primary browsing surface. Its primary creation action is Upload IFC. Users can start asset creation without navigating through the technical source browser. The empty Library provides the same upload action.

Needs review is the staff workspace for creating and finalizing asset definitions. Its count reflects drafts and approved definitions awaiting source-change review. Categories supports category names, aliases and reusable property mappings. Sources remains available for file management and advanced IFC inspection, but is not the required entry point for asset creation.

The existing card interactions remain: normal click opens the side inspector, and the arrow opens a centered preview. Both prioritize curated identity, specifications and geometry. Original IFC values and references remain in collapsed Source details. Only review and editing show unresolved conflicts.

## Classification and candidate selection

Generic Hard Asset supplies the asset classification. Existing instance/type precedence remains: a present instance value wins, including a blank value; the type value is used only when the instance parameter is absent. Original source labels and values remain unchanged. Confirmed category aliases map source labels to canonical library categories.

Classification suggests maintainable component candidates. Staff can confirm or correct their category during review. A missing, blank or conflicting classification is a review issue, not permission to invent a category or silently discard otherwise usable components. Unclassified candidates remain outside the approved Library until a category is assigned and staff accepts them as maintainable assets.

IFC type relationships help group candidates but are not a prerequisite for reviewing a valid component. An uploaded component without an IFC type must be offered as an individual candidate that staff can name and classify. Internal source identifiers preserve traceability without becoming card names or reusable identities.

For files containing repeated components, occurrences of the same source type can contribute to one candidate. Equal names alone never merge candidates. Different confirmed reusable characteristics may require separate variants. Candidate selection must distinguish actual maintainable components from contextual geometry, spaces and other supporting model content; staff makes the final selection.

## Creation flow

1. **Upload.** Staff choose an IFC file from the Library. Show file name, upload and analysis progress, and actionable file errors. Cancellation must not publish assets or leave partial catalog entries.
2. **Analyze.** Read component geometry, Generic Hard Asset classifications, type relationships and reusable property suggestions. Retain source observations separately from curated values. Present counts for detected candidates, repeated occurrences and items requiring classification.
3. **Select.** Staff confirm which candidates should become library definitions. A single-asset file uses the same flow with one candidate. A multi-asset file allows reviewing or selecting several candidates together.
4. **Create drafts.** Selected candidates become drafts in Needs review. Upload and analysis never automatically approve definitions. Repeat analysis must remain idempotent for the same source revision and avoid duplicate drafts.
5. **Finalize.** Staff review the preview, readable name, canonical category, generic/product identity and applicable reusable properties. They can edit values, resolve unknowns, split variants or reject a candidate. Rejecting a draft uses the existing archive lifecycle and retains its provenance.
6. **Approve.** Staff explicitly approve one definition or a selected eligible batch. Approved definitions become visible in Library. Ineligible selected drafts remain in review, with their specific reasons displayed; the UI must not imply that they were approved.

## Validation and parameters

Generic definitions require a readable name and canonical Generic Hard Asset category confirmed by staff. Product definitions additionally require confirmed manufacturer and model. Unknown specifications remain permissible for the MVP; missing values must not become zero or fabricated specifications.

Area, Volume, Length, Comments, System and Diameter are the current retained starter properties. They are offered where present and applicable, not required on every category. Existing staff exclusions remain effective across imports. Properties outside the previously excluded conflict list remain available under the existing rules. New category-specific mandatory properties require a separate confirmed requirement rather than being inferred from this workflow.

Validate known property types and supported units. Unsupported units remain visible as unresolved measured values; the application must not guess conversions. For differing reusable values, staff may select a verified value, resolve the property as unknown, or split the candidate into variants. Resolved properties no longer appear as active conflict warnings. Original conflicting values remain inspectable in Source details.

Approval blockers include missing names, missing canonical classification, incomplete product identity and unresolved conflicts. The existing explicit batch option to resolve conflicts as unknown remains available; it must preserve already curated values and never silently run during an ordinary approval.

Preview errors are reported clearly. They do not delete existing approved definitions or automatically rebind them to different geometry. Unreadable IFC files and failed candidate analysis must not create purportedly valid content.

## Lifecycle and existing content

The existing lifecycle remains draft, approved and archived. Editing a definition follows the existing return-to-draft and reapproval behavior. A changed source flags affected approved definitions for review while preserving their accepted specifications and source history. Rebinding geometry requires an explicit selection.

This workflow does not automatically demote or reclassify the current Library. Staff can review existing definitions separately. Source file deletion or hiding does not delete approved definitions. Existing source revision checks, atomic local persistence and stale-tab conflict handling remain required.

## Implementation alignment

Reuse the existing catalog, source upload service, IFC worker, review editor, category mappings and geometry preview. Library currently starts on approved content, but upload and explicit analysis are routed through Sources. Expose a guided creation flow from Library rather than creating a second catalog or a parallel importer.

The current source index excludes missing classifications and skips components without IFC types. Candidate discovery must therefore be separated from the classified type index used for source browsing. Preserve compatibility for current source indexes and references, and avoid relaxing their identifiers by pretending an occurrence identifier is a real IFC type identifier.

Upload and analysis state belongs to the creation flow. Candidate selections must survive moving into review without accidentally selecting unrelated occurrences or publishing unchecked items. Templates, normalized source values and source revision checks remain shared with existing curation.

## Acceptance criteria

- A staff user can start Upload IFC directly from a populated or empty Library.
- A valid single-component IFC produces a reviewable candidate, including when it lacks an IFC type or Generic Hard Asset value.
- A multi-asset IFC shows distinct candidates and repeated occurrences clearly; staff can select which definitions to create.
- Selected candidates enter Needs review as drafts. Nonselected context content stays outside Library.
- Staff can assign or correct Generic Hard Asset classification and finalize applicable parameters without editing original IFC properties.
- Unknown specifications are accepted under the existing MVP rule. Invalid identity and unresolved conflicts receive specific review feedback.
- Explicit approval makes eligible definitions visible in Library. Rejected and incomplete drafts remain outside it.
- Normal browsing shows curated properties and geometry, with Source details collapsed and no resolved-conflict warnings.
- Repeat import, cancellation, analysis failures, restart persistence and stale revisions preserve staff decisions and avoid duplicate or partially approved content.
- Current approved assets and original IFC files survive the alignment. Real single-asset and multi-asset IFC examples, relevant automated regressions, strict typecheck and production build verify delivery.

## Decisions for this baseline

Three candidate approaches were considered: requiring Generic Hard Asset before importing anything, listing every IFC element for manual selection, and using Generic Hard Asset to guide selection with staff correction. The selected approach uses the existing classification while retaining a review path for missing classifications and IFC types. It preserves library identities and prevents the browser from becoming an occurrence warehouse.

Assembly composition tools, extracting standalone IFC files, FM export adapters, extra required maintenance parameters and new publication versioning are separate follow-up decisions. Uploading an existing asset assembly may supply candidate geometry; authoring new assemblies is not part of this baseline.
