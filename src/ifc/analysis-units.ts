import { z } from "zod";
import { IFCSIUNIT, IFCCONVERSIONBASEDUNIT, IFCDERIVEDUNIT } from "web-ifc";

const ref = z.object({ value: z.int().positive() });
const label = z.object({ value: z.string() }).nullish();
const unitSchema = z.object({
  type: z.number(),
  Name: label,
  Prefix: label,
  UnitType: label,
  ConversionFactor: ref.optional(),
  ValueComponent: z.object({ value: z.number() }).optional(),
  UnitComponent: ref.optional(),
  Elements: z.array(ref).optional(),
  Unit: ref.optional(),
  Exponent: z.object({ value: z.number().int() }).optional(),
});
export type ResolvedUnit = {
  label: string;
  canonical: string | null;
  factor: number | null;
};
const dimensions: Record<
  string,
  { name: string; symbol: string; power: number }
> = {
  LENGTHUNIT: { name: "METRE", symbol: "m", power: 1 },
  AREAUNIT: { name: "SQUARE_METRE", symbol: "m²", power: 2 },
  VOLUMEUNIT: { name: "CUBIC_METRE", symbol: "m³", power: 3 },
  POWERUNIT: { name: "WATT", symbol: "W", power: 1 },
  ELECTRICVOLTAGEUNIT: { name: "VOLT", symbol: "V", power: 1 },
  TIMEUNIT: { name: "SECOND", symbol: "s", power: 1 },
};
const prefixes: Record<string, { symbol: string; factor: number }> = {
  "": { symbol: "", factor: 1 },
  MILLI: { symbol: "m", factor: 1e-3 },
  CENTI: { symbol: "c", factor: 1e-2 },
  DECI: { symbol: "d", factor: 1e-1 },
  KILO: { symbol: "k", factor: 1e3 },
  MEGA: { symbol: "M", factor: 1e6 },
  MICRO: { symbol: "µ", factor: 1e-6 },
  NANO: { symbol: "n", factor: 1e-9 },
};
export function measureUnitType(measure: string): string | null {
  switch (measure) {
    case "IFCLENGTHMEASURE":
    case "IFCPOSITIVELENGTHMEASURE":
    case "IFCNONNEGATIVELENGTHMEASURE":
      return "LENGTHUNIT";
    case "IFCAREAMEASURE":
      return "AREAUNIT";
    case "IFCVOLUMEMEASURE":
      return "VOLUMEUNIT";
    case "IFCPOWERMEASURE":
      return "POWERUNIT";
    case "IFCVOLUMETRICFLOWRATEMEASURE":
      return "VOLUMETRICFLOWRATEUNIT";
    case "IFCELECTRICVOLTAGEMEASURE":
      return "ELECTRICVOLTAGEUNIT";
    case "IFCTHERMODYNAMICTEMPERATUREMEASURE":
      return "THERMODYNAMICTEMPERATUREUNIT";
    case "IFCPRESSUREMEASURE":
      return "PRESSUREUNIT";
    case "IFCMASSMEASURE":
      return "MASSUNIT";
    case "IFCPLANEANGLEMEASURE":
    case "IFCPOSITIVEPLANEANGLEMEASURE":
      return "PLANEANGLEUNIT";
    default:
      return null;
  }
}
/** Resolve only units whose entity metadata proves the conversion. Names alone are never factors. */
export class AnalysisUnits {
  private cache = new Map<number, ResolvedUnit>();
  constructor(
    private read: (id: number) => unknown,
    private projectUnits: number[],
  ) {}
  forMeasure(measure: string, explicit?: number): ResolvedUnit | null {
    const expected = measureUnitType(measure);
    if (explicit !== undefined) {
      const entity = unitSchema.parse(this.read(explicit));
      const resolved = this.resolve(explicit);
      return entity.UnitType?.value === expected
        ? resolved
        : { label: resolved.label, canonical: null, factor: null };
    }
    if (!expected) return null;
    const matches = this.projectUnits.filter(
      (id) => unitSchema.parse(this.read(id)).UnitType?.value === expected,
    );
    return matches.length === 1 && matches[0] !== undefined
      ? this.resolve(matches[0])
      : null;
  }
  private resolve(id: number, visiting = new Set<number>()): ResolvedUnit {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const entity = unitSchema.parse(this.read(id));
    const unknownUnit: ResolvedUnit = {
      label:
        (entity.Name?.value
          ? [entity.Prefix?.value, entity.Name.value].filter(Boolean).join(" ")
          : null) ??
        entity.UnitType?.value ??
        `Unsupported unit #${id}`,
      canonical: null,
      factor: null,
    };
    if (visiting.has(id)) return unknownUnit;
    visiting.add(id);
    let result = unknownUnit;
    const dimension = dimensions[entity.UnitType?.value ?? ""];
    if (
      entity.type === IFCSIUNIT &&
      dimension &&
      entity.Name?.value === dimension.name
    ) {
      const prefix = prefixes[entity.Prefix?.value ?? ""];
      if (prefix)
        result = {
          label: `${prefix.symbol}${dimension.symbol}`,
          canonical: dimension.symbol,
          factor: prefix.factor ** dimension.power,
        };
    } else if (
      entity.type === IFCCONVERSIONBASEDUNIT &&
      dimension &&
      entity.ConversionFactor
    ) {
      const conversion = unitSchema.parse(
        this.read(entity.ConversionFactor.value),
      );
      if (conversion.UnitComponent && conversion.ValueComponent) {
        const base = this.resolve(conversion.UnitComponent.value, visiting);
        const factor =
          base.factor === null
            ? null
            : base.factor * conversion.ValueComponent.value;
        if (
          base.canonical === dimension.symbol &&
          factor !== null &&
          Number.isFinite(factor) &&
          factor > 0
        )
          result = {
            label: unknownUnit.label,
            canonical: base.canonical,
            factor,
          };
      }
    } else if (
      entity.type === IFCDERIVEDUNIT &&
      entity.UnitType?.value === "VOLUMETRICFLOWRATEUNIT"
    ) {
      let lengthExponent = 0;
      let timeExponent = 0;
      let factor = 1;
      let valid = true;
      const labels: string[] = [];
      for (const ref of entity.Elements ?? []) {
        const element = unitSchema.parse(this.read(ref.value));
        if (!element.Unit || element.Exponent === undefined) {
          valid = false;
          break;
        }
        const exponent = element.Exponent.value;
        const base = this.resolve(element.Unit.value, visiting);
        labels.push(`${base.label}^${exponent}`);
        if (base.canonical === "m") lengthExponent += exponent;
        else if (base.canonical === "m³") lengthExponent += 3 * exponent;
        else if (base.canonical === "s") timeExponent += exponent;
        else valid = false;
        if (base.factor === null) valid = false;
        else factor *= base.factor ** exponent;
      }
      if (
        valid &&
        lengthExponent === 3 &&
        timeExponent === -1 &&
        Number.isFinite(factor) &&
        factor > 0
      )
        result = { label: labels.join("·"), canonical: "m³/s", factor };
    }
    visiting.delete(id);
    this.cache.set(id, result);
    return result;
  }
}
