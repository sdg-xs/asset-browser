import { z } from "zod";
import * as IFC from "web-ifc";
import { ifcDictionaryUri, type ClassificationOption } from "../shared/asset-classifications.js";

const pageSchema = z.object({
  classesTotalCount: z.number().int().min(1).max(10000),
  classes: z.array(z.object({ code: z.string().min(1), name: z.string().min(1) })).min(1),
});
const entityCodes = new Set(Object.keys(IFC));

export function createIfcClassReader(fetcher: typeof fetch = fetch) {
  let cached: { options: ClassificationOption[]; expires: number } | undefined;
  let pending: Promise<ClassificationOption[]> | undefined;
  const download = async () => {
    const options = new Map<string, ClassificationOption>();
    for (let offset = 0, total = 1; offset < total;) {
      const url = new URL("https://api.bsdd.buildingsmart.org/api/Dictionary/v1/Classes");
      url.search = new URLSearchParams({ Uri: ifcDictionaryUri, Limit: "1000", Offset: String(offset) }).toString();
      const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error("buildingSMART bSDD could not return the IFC class list.");
      const raw: unknown = await response.json();
      const page = pageSchema.parse(raw);
      total = page.classesTotalCount;
      offset += page.classes.length;
      for (const item of page.classes) {
        const value = item.code.toUpperCase();
        if (entityCodes.has(value)) options.set(value, { value, label: value, description: item.name });
      }
    }
    const result = [...options.values()].sort((a, b) => a.value.localeCompare(b.value));
    if (!result.length) throw Error("buildingSMART bSDD returned no IFC entity classes.");
    cached = { options: result, expires: Date.now() + 24 * 60 * 60 * 1000 };
    return result;
  };
  return async () => {
    if (cached && cached.expires > Date.now()) return cached.options;
    pending ??= download().finally(() => { pending = undefined; });
    return pending;
  };
}
