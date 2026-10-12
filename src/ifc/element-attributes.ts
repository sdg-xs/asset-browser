import { z } from "zod";
import { REF } from "web-ifc";
import type { PropertyObservation } from "./analyze-library.js";

const scalar = z.union([z.string(), z.number().finite(), z.boolean()]);
const wrappedScalar = z.object({ value: scalar, type: z.number().optional(), name: z.string().optional() });
type AttributeValue = z.infer<typeof scalar> | null | z.infer<typeof wrappedScalar> | AttributeValue[];
const attributeValue: z.ZodType<AttributeValue> = z.lazy(() => z.union([
  scalar, z.null(), wrappedScalar, z.array(attributeValue),
]));
const record = z.object({ expressID: z.number().int(), type: z.number() }).catchall(z.unknown());
const identity = z.object({ type: z.number(), Name: z.object({ value: z.string() }).nullish() });

export function elementAttributes({ raw, group, read, className }: {
  raw: unknown;
  group: string;
  read(id: number): unknown;
  className(type: number): string;
}): PropertyObservation[] {
  const entity = record.parse(raw);
  const text = (value: AttributeValue): string => {
    if (value === null) return "";
    if (Array.isArray(value)) return value.map(text).join(", ");
    if (typeof value !== "object") return String(value);
    if (value.type === REF && typeof value.value === "number") {
      const target = identity.parse(read(value.value));
      return `${className(target.type)} #${value.value}${target.Name?.value ? ` · ${target.Name.value}` : ""}`;
    }
    return String(value.value);
  };
  const properties: PropertyObservation[] = [];
  const add = (name: string, value: string) => properties.push({
    key: JSON.stringify([group, name]), pset: group, name, measure: "IFC attribute", unit: null,
    origin: "attribute", rawValue: value, normalized: value ? { kind: "text", value, unit: null } : { kind: "missing" },
  });
  for (const [name, value] of Object.entries(entity)) {
    if (name === "type") {
      if (typeof value === "number") add("IFC Class", className(value));
    } else {
      const parsed = attributeValue.safeParse(value);
      add(name === "expressID" ? "Express ID" : name, parsed.success ? text(parsed.data) : "[Complex IFC attribute]");
    }
  }
  return properties;
}
