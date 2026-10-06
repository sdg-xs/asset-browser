import type {
  CatalogLibrary,
  LibraryEntry,
  NormalizedValue,
  SourceReference,
} from "./catalog-library.js";
import { equalNormalized } from "./catalog-normalization.js";
import {
  sourceFor,
  parameterKeys,
  occurrenceParameterValues,
} from "./catalog-observations.js";
import { CatalogDomainError } from "./catalog-errors.js";

type Partition = { values: NormalizedValue[]; references: SourceReference[] };
export function splitEntry(
  state: CatalogLibrary,
  entry: LibraryEntry,
  keys: string[],
): void {
  const mappings =
    state.templates.find(
      (template) => template.categoryId === entry.definition.categoryId,
    )?.mappings ?? [];
  if (
    entry.status === "archived" ||
    new Set(keys).size !== keys.length ||
    keys.some(
      (key) =>
        !mappings.some(
          (mapping) => mapping.key === key && mapping.role === "variant",
        ),
    )
  )
    throw new CatalogDomainError(
      "INVALID_COMMAND",
      "Split fields must be confirmed variant mappings on an active entry.",
    );
  const partitions: Partition[] = [];
  for (const reference of entry.sourceReferences) {
    const source = sourceFor(state, reference.sourceId);
    if (
      !source ||
      !source.current ||
      reference.fingerprint !== source.fingerprint
    )
      throw new CatalogDomainError(
        "INVALID_COMMAND",
        "Review current source references before splitting.",
      );
    for (const occurrenceId of reference.occurrenceIds) {
      const values = keys.map((key) => {
        const observed = occurrenceParameterValues(
          source,
          parameterKeys(state, entry, key),
          occurrenceId,
        );
        if (observed.length > 1)
          throw new CatalogDomainError(
            "INVALID_COMMAND",
            "Resolve conflicting mapped properties on each occurrence before splitting.",
          );
        return observed[0] ?? ({ kind: "missing" } satisfies NormalizedValue);
      });
      let partition = partitions.find((partition) =>
        partition.values.every((value, index) => {
          const other = values[index];
          return other !== undefined && equalNormalized(value, other);
        }),
      );
      if (!partition) {
        partition = { values, references: [] };
        partitions.push(partition);
      }
      let member = partition.references.find(
        (member) =>
          member.sourceId === reference.sourceId &&
          member.fingerprint === reference.fingerprint,
      );
      if (!member) {
        member = { ...reference, occurrenceIds: [] };
        partition.references.push(member);
      }
      member.occurrenceIds.push(occurrenceId);
    }
  }
  if (partitions.length < 2)
    throw new CatalogDomainError(
      "INVALID_COMMAND",
      "Split requires at least two observed variants.",
    );
  for (const partition of partitions) {
    const definition = structuredClone(entry.definition);
    keys.forEach((key, index) => {
      const value = partition.values[index];
      if (value) definition.specifications[key] = value;
    });
    state.entries.push({
      id: crypto.randomUUID(),
      definition,
      status: "draft",
      reviewFlags: [...entry.reviewFlags],
      sourceReferences: partition.references,
    });
  }
  entry.status = "archived";
}
