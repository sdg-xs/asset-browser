import { creationCandidateKey } from "./asset-creation.js";
import type { SourceTypeObservation } from "./catalog-library.js";

export function sourceObservationKey(observation: SourceTypeObservation): string {
  return creationCandidateKey(observation.typeGlobalId === null
    ? { kind: "element", globalId: observation.elementGlobalId }
    : { kind: "type", globalId: observation.typeGlobalId });
}
