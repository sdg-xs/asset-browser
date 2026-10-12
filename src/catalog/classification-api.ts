import { ifcClassOptionsSchema, type ClassificationOption } from "../../shared/asset-classifications.js";

let pending: Promise<ClassificationOption[]> | undefined;
export function readIfcClasses() {
  pending ??= fetch("/api/classifications/ifc-classes").then(async response => {
    if (!response.ok) throw Error("Could not refresh the IFC class list from bSDD.");
    const raw: unknown = await response.json();
    return ifcClassOptionsSchema.parse(raw);
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}
