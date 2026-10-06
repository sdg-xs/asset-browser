import {
  librarySnapshotSchema,
  type LibrarySnapshot,
  type ObservedField,
  type NormalizedValue,
} from "../../shared/catalog-library.js";
import { equalNormalized } from "../../shared/catalog-normalization.js";
import type { CatalogIndex } from "../../shared/contracts.js";
import type { Progress } from "./reader.js";

export type PropertyObservation = Pick<
  ObservedField,
  "key" | "pset" | "name" | "measure" | "unit"
> & { rawValue: string; normalized: NormalizedValue };
export function analyzeLibrary({
  index,
  sourceName,
  properties,
  progress,
}: {
  index: CatalogIndex;
  sourceName: string;
  properties: (occurrenceId: number) => PropertyObservation[];
  progress: Progress;
}): LibrarySnapshot {
  let count = 0;
  const types = index.types.map((type) => {
    const fields = new Map<string, ObservedField>();
    for (const occurrenceId of type.occurrenceIds) {
      if (count % 250 === 0)
        progress(
          `Analyzing ${count.toLocaleString()} / ${index.stats.classified.toLocaleString()} classified occurrences`,
        );
      count++;
      for (const observation of properties(occurrenceId)) {
        let field = fields.get(observation.key);
        if (!field) {
          field = {
            key: observation.key,
            pset: observation.pset,
            name: observation.name,
            measure: observation.measure,
            unit: observation.unit,
            values: [],
          };
          fields.set(field.key, field);
        }
        if (field.measure !== observation.measure)
          field.measure = "Mixed IFC measures";
        if (field.unit !== observation.unit) field.unit = "Mixed source units";
        const value = field.values.find(
          (value) =>
            value.rawValue === observation.rawValue &&
            value.sourceUnit === observation.unit &&
            value.sourceMeasure === observation.measure &&
            equalNormalized(value.normalized, observation.normalized),
        );
        if (value) value.occurrenceIds.push(occurrenceId);
        else
          field.values.push({
            rawValue: observation.rawValue,
            sourceUnit: observation.unit,
            sourceMeasure: observation.measure,
            normalized: observation.normalized,
            occurrenceIds: [occurrenceId],
          });
      }
    }
    return {
      typeGlobalId: type.typeGlobalId,
      name: type.name,
      ifcClass: type.ifcClass,
      categories: [...type.categories],
      occurrenceIds: [...type.occurrenceIds],
      fields: [...fields.values()],
    };
  });
  progress(`Analyzed ${count.toLocaleString()} classified occurrences`);
  return librarySnapshotSchema.parse({
    analysisVersion: 2,
    modelId: index.modelId,
    fingerprint: index.fingerprint,
    sourceName,
    types,
  });
}
