import type { SourceTypeObservation } from "./catalog-library.js";
import { sourceObservationKey } from "./catalog-source-identity.js";

export function typeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function identifiedTypeKey(observation: SourceTypeObservation): string {
  return typeNameKey(observation.name) || sourceObservationKey(observation);
}
