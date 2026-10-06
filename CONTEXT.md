# Asset browser

This context describes a library of reusable definitions for maintainable building components, curated from IFC content by staff.

## Language

**Asset**:
A maintainable component in a building, such as equipment or a component that is inspected, serviced, repaired or replaced.
_Avoid_: Any IFC element, model file

**Asset definition**:
A reusable description of an asset type or specification variant that can be used in multiple buildings.
_Avoid_: Installed asset, occurrence

**Asset type**:
A group of assets sharing a reusable identity and purpose, such as a particular kind of pump or smoke detector.

**Specification variant**:
An asset definition distinguished by confirmed reusable characteristics, such as diameter or capacity.
_Avoid_: Individual instance, GUID variant

**Occurrence**:
An individual representation of a component in a source model. Several occurrences may provide evidence for one asset definition.
_Avoid_: Library entry

**Source model**:
An IFC file supplying component geometry, classifications and original property values.
_Avoid_: Asset

**Source observation**:
An original property value observed on a component or its type in a source model.
_Avoid_: Confirmed specification

**Curated specification**:
A reusable property value accepted by staff for an asset definition.
_Avoid_: Source suggestion

**Conflict**:
Differing source values for a property within the components represented by one asset definition.

**Unknown specification**:
A property for which no reusable value has been confirmed. It is distinct from a known zero or blank value.

**Draft**:
An asset definition awaiting staff review and finalization.

**Approved definition**:
An asset definition accepted by staff for browsing in the Library.

**Generic Hard Asset classification**:
The classification used to assign a maintainable component to a canonical library category, initially read from the source model and confirmed by staff. It is distinct from the generic or product identity of an asset definition.
