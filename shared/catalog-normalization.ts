import type { NormalizedValue } from "./catalog-library.js";
const missing = /^(?:n\/?a|none|null|undefined|-)$/i;
export function identityValue(value: string): string {
  const trimmed = value.trim();
  return !trimmed || missing.test(trimmed) || /^revit$/i.test(trimmed)
    ? ""
    : trimmed;
}
const conversions: Record<
  string,
  { unit: string; factors: Record<string, number> }
> = {
  length: {
    unit: "m",
    factors: { m: 1, mm: 0.001, cm: 0.01, km: 1000, ft: 0.3048, in: 0.0254 },
  },
  area: {
    unit: "m²",
    factors: {
      "m²": 1,
      m2: 1,
      "mm²": 1e-6,
      mm2: 1e-6,
      "cm²": 1e-4,
      cm2: 1e-4,
      "ft²": 0.09290304,
      ft2: 0.09290304,
    },
  },
  volume: {
    unit: "m³",
    factors: {
      "m³": 1,
      m3: 1,
      "mm³": 1e-9,
      mm3: 1e-9,
      l: 0.001,
      "ft³": 0.028316846592,
      ft3: 0.028316846592,
    },
  },
  power: {
    unit: "W",
    factors: { W: 1, w: 1, kW: 1000, kw: 1000, MW: 1e6, mW: 0.001, mw: 0.001 },
  },
  flow: {
    unit: "m³/s",
    factors: {
      "m³/s": 1,
      "m3/s": 1,
      "l/s": 0.001,
      "l/min": 1 / 60000,
      "m³/h": 1 / 3600,
      "m3/h": 1 / 3600,
    },
  },
  voltage: {
    unit: "V",
    factors: { V: 1, v: 1, kV: 1000, kv: 1000, MV: 1e6, mV: 0.001, mv: 0.001 },
  },
};
export function normalizeObservation(input: {
  value: string;
  measure: string;
  unit: string | null;
}): NormalizedValue {
  const value = input.value.trim();
  if (!value || missing.test(value)) return { kind: "missing" };
  const measure = input.measure.toLowerCase();
  const dimension =
    measure.includes("volumetricflow") || measure.includes("flow")
      ? "flow"
      : measure.includes("length")
        ? "length"
        : measure.includes("area")
          ? "area"
          : measure.includes("volume")
            ? "volume"
            : measure.includes("power")
              ? "power"
              : measure.includes("voltage") ||
                  measure.includes("electricpotential")
                ? "voltage"
                : null;
  const conversion = dimension ? conversions[dimension] : undefined;
  const factor =
    conversion && input.unit
      ? (conversion.factors[input.unit.trim()] ??
        conversion.factors[input.unit.trim().toLowerCase()])
      : undefined;
  if (
    conversion &&
    factor !== undefined &&
    /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)
  ) {
    const number = Number(value) * factor;
    if (Number.isFinite(number))
      return { kind: "number", value: number, unit: conversion.unit };
  }
  return { kind: "text", value, unit: input.unit };
}
export function equalNormalized(
  left: NormalizedValue,
  right: NormalizedValue,
): boolean {
  if (left.kind === "missing" || right.kind === "missing")
    return left.kind === right.kind;
  if (left.kind === "number" && right.kind === "number")
    return (
      left.unit === right.unit &&
      Math.abs(left.value - right.value) <=
        1e-9 * Math.max(1, Math.abs(left.value), Math.abs(right.value))
    );
  return (
    left.kind === "text" &&
    right.kind === "text" &&
    left.value === right.value &&
    left.unit === right.unit
  );
}
