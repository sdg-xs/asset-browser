import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { IfcReader } from "../src/ifc/reader.js";
import {
  applyLibraryCommand,
  emptyCatalogLibrary,
} from "../shared/catalog-rules.js";
import { RequestSchema, ResponseSchema } from "../src/ifc/protocol.js";

const model = {
  id: "b3907523-463f-414b-8235-1d5e1cce0454",
  fingerprint: "fixture",
  name: "assets.ifc",
};
let reader: IfcReader | undefined;
afterEach(() => reader?.dispose());
async function analyze(
  lines: string,
  typeProperties = "",
  units?: string,
  extraOccurrences: number[] = [],
) {
  let fixture = await readFile(
    new URL("./fixtures/assets.ifc", import.meta.url),
    "utf8",
  );
  fixture = fixture.replace(
    "(#41),$,$,$,.NOTDEFINED.",
    `(#41${typeProperties}),$,$,$,.NOTDEFINED.`,
  );
  if (units) fixture = fixture.replace("#12=IFCUNITASSIGNMENT((#11));", units);
  if (extraOccurrences.length)
    fixture = fixture.replace(
      "(#30,#31,#32,#34),#42",
      `(#30,#31,#32,#34,${extraOccurrences.map((id) => `#${id}`).join(",")}),#42`,
    );
  fixture = fixture.replace(
    /ENDSEC;\r?\nEND-ISO/,
    `${lines}\nENDSEC;\nEND-ISO`,
  );
  reader = new IfcReader();
  await reader.initialize();
  reader.open(new TextEncoder().encode(fixture), model);
  return reader.librarySnapshot();
}
const shared = `#60=IFCPROPERTYSINGLEVALUE('Width',$,IFCLENGTHMEASURE(800.),$);
#61=IFCPROPERTYSET('0000000000000000000061',#5,'Dimensions',$,(#60));
#62=IFCRELDEFINESBYPROPERTIES('0000000000000000000062',#5,$,$,(#30,#31),#61);`;
describe("real IFC reusable library analysis", () => {
  it("retains all memberships of cached instance Psets and source metadata", async () => {
    const snapshot = await analyze(shared);
    expect(snapshot).toMatchObject({
      modelId: model.id,
      fingerprint: "fixture",
      sourceName: "assets.ifc",
    });
    expect(snapshot.types[0]).toMatchObject({
      occurrenceIds: [30, 31],
      categories: ["Temperature sensor", "Air quality sensor"],
    });
    expect(
      snapshot.types[0]?.fields.find((f) => f.name === "Width"),
    ).toMatchObject({
      measure: "IFCLENGTHMEASURE",
      unit: "m",
      values: [
        {
          rawValue: "800",
          normalized: { kind: "number", value: 800, unit: "m" },
          occurrenceIds: [30, 31],
        },
      ],
    });
    expect(reader?.properties(30).some((g) => g.name === "Dimensions")).toBe(
      true,
    );
    expect(reader?.geometry(30).meshes.length).toBeGreaterThan(0);
  });
  it("uses per-property instance presence, including explicit blanks, before type fallback", async () => {
    const snapshot = await analyze(
      `${shared.replace("(#30,#31)", "(#30)").replace("IFCLENGTHMEASURE(800.)", "IFCLABEL('')")}
#63=IFCPROPERTYSINGLEVALUE('Width',$,IFCLENGTHMEASURE(900.),$);
#64=IFCPROPERTYSINGLEVALUE('Height',$,IFCLENGTHMEASURE(1200.),$);
#65=IFCPROPERTYSET('0000000000000000000065',#5,'Dimensions',$,(#63,#64));`,
      ",#65",
    );
    const fields = snapshot.types[0]?.fields;
    expect(fields?.find((f) => f.name === "Width")?.values).toEqual([
      {
        rawValue: "",
        normalized: { kind: "missing" },
        occurrenceIds: [30],
        sourceUnit: null,
        sourceMeasure: "IFCLABEL",
      },
      {
        rawValue: "900",
        sourceUnit: "m",
        sourceMeasure: "IFCLENGTHMEASURE",
        normalized: { kind: "number", value: 900, unit: "m" },
        occurrenceIds: [31],
      },
    ]);
    expect(
      fields?.find((f) => f.name === "Height")?.values[0]?.occurrenceIds,
    ).toEqual([30, 31]);
  });
  it("retains conflict partitions and absent-field membership", async () => {
    const snapshot = await analyze(`${shared.replace("(#30,#31)", "(#30)")}
#63=IFCPROPERTYSINGLEVALUE('Width',$,IFCLENGTHMEASURE(900.),$);
#64=IFCPROPERTYSET('0000000000000000000064',#5,'Dimensions',$,(#63));
#65=IFCRELDEFINESBYPROPERTIES('0000000000000000000065',#5,$,$,(#31),#64);
#66=IFCPROPERTYSINGLEVALUE('Depth',$,IFCLENGTHMEASURE(0.),$);
#67=IFCPROPERTYSET('0000000000000000000067',#5,'Dimensions',$,(#66));
#68=IFCRELDEFINESBYPROPERTIES('0000000000000000000068',#5,$,$,(#30),#67);`);
    expect(
      snapshot.types[0]?.fields
        .find((f) => f.name === "Width")
        ?.values.map((v) => v.occurrenceIds),
    ).toEqual([[30], [31]]);
    expect(
      snapshot.types[0]?.fields.find((f) => f.name === "Depth")?.values,
    ).toEqual([
      {
        rawValue: "0",
        sourceUnit: "m",
        sourceMeasure: "IFCLENGTHMEASURE",
        normalized: { kind: "number", value: 0, unit: "m" },
        occurrenceIds: [30],
      },
    ]);
  });
  it.each([
    [
      "millimetres",
      "#12=IFCUNITASSIGNMENT((#70));\n#70=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);",
      0.8,
      "mm",
    ],
    [
      "feet",
      "#12=IFCUNITASSIGNMENT((#70));\n#70=IFCCONVERSIONBASEDUNIT(#71,.LENGTHUNIT.,'foot',#72);\n#71=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);\n#72=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.3048),#11);",
      243.84,
      "foot",
    ],
  ])(
    "normalizes verified project %s units",
    async (_label, units, expected, unit) => {
      const snapshot = await analyze(shared, "", units);
      expect(
        snapshot.types[0]?.fields.find((f) => f.name === "Width"),
      ).toMatchObject({
        unit,
        values: [
          { normalized: { kind: "number", value: expected, unit: "m" } },
        ],
      });
    },
  );
  it("preserves unsupported measure/unit labels and identity while domain filters installation fields", async () => {
    const snapshot = await analyze(`${shared}
#70=IFCPROPERTYSINGLEVALUE('Manufacturer',$,IFCLABEL('Acme'),$);
#71=IFCPROPERTYSINGLEVALUE('Asset ID',$,IFCLABEL('Installed-42'),$);
#72=IFCPROPERTYSINGLEVALUE('Room',$,IFCLABEL('A101'),$);
#73=IFCPROPERTYSINGLEVALUE('Temperature',$,IFCTHERMODYNAMICTEMPERATUREMEASURE(293.),#76);
#74=IFCPROPERTYSET('0000000000000000000074',#5,'Product',$,(#70,#71,#72,#73));
#75=IFCRELDEFINESBYPROPERTIES('0000000000000000000075',#5,$,$,(#30,#31),#74);
#76=IFCSIUNIT(*,.THERMODYNAMICTEMPERATUREUNIT.,$,.KELVIN.);`);
    expect(
      snapshot.types[0]?.fields.find((f) => f.name === "Temperature"),
    ).toMatchObject({
      measure: "IFCTHERMODYNAMICTEMPERATUREMEASURE",
      unit: "KELVIN",
      values: [{ normalized: { kind: "text", value: "293", unit: "KELVIN" } }],
    });
    expect(
      snapshot.types[0]?.fields.some((f) => f.name === "Manufacturer"),
    ).toBe(true);
    const catalog = applyLibraryCommand(emptyCatalogLibrary(), {
      kind: "import",
      expectedRevision: 0,
      snapshot,
    });
    const suggestions = catalog.templates.flatMap((t) =>
      t.suggestions.map((s) => s.label),
    );
    expect(suggestions).toContain("Width");
    expect(suggestions).not.toContain("Manufacturer");
    expect(suggestions).not.toContain("Asset ID");
    expect(suggestions).not.toContain("Room");
  });
  it("does not infer SI for unassigned source units", async () => {
    const snapshot = await analyze(shared, "", "#12=IFCUNITASSIGNMENT(());");
    expect(
      snapshot.types[0]?.fields.find((f) => f.name === "Width"),
    ).toMatchObject({
      unit: null,
      values: [{ normalized: { kind: "text", value: "800", unit: null } }],
    });
  });
  it.each([
    ["IFCAREAMEASURE", "AREAUNIT", "SQUARE_METRE", ".MILLI.", 0.0008, "m²"],
    [
      "IFCVOLUMEMEASURE",
      "VOLUMEUNIT",
      "CUBIC_METRE",
      ".MILLI.",
      0.0000008,
      "m³",
    ],
    ["IFCPOWERMEASURE", "POWERUNIT", "WATT", ".KILO.", 800000, "W"],
    [
      "IFCELECTRICVOLTAGEMEASURE",
      "ELECTRICVOLTAGEUNIT",
      "VOLT",
      ".MILLI.",
      0.8,
      "V",
    ],
  ])(
    "normalizes source %s SI metadata",
    async (measure, unitType, name, prefix, value, canonical) => {
      const snapshot = await analyze(
        shared.replace("IFCLENGTHMEASURE", measure),
        "",
        `#12=IFCUNITASSIGNMENT((#70));\n#70=IFCSIUNIT(*,.${unitType}.,${prefix},.${name}.);`,
      );
      const normalized = snapshot.types[0]?.fields.find(
        (f) => f.name === "Width",
      )?.values[0]?.normalized;
      expect(normalized).toMatchObject({ kind: "number", unit: canonical });
      if (normalized?.kind === "number")
        expect(normalized.value).toBeCloseTo(value, 12);
    },
  );
  it("normalizes a verified derived volumetric flow unit", async () => {
    const snapshot = await analyze(
      shared.replace("IFCLENGTHMEASURE", "IFCVOLUMETRICFLOWRATEMEASURE"),
      "",
      `#12=IFCUNITASSIGNMENT((#70));
#70=IFCDERIVEDUNIT((#71,#72),.VOLUMETRICFLOWRATEUNIT.,$);
#71=IFCDERIVEDUNITELEMENT(#73,3);
#72=IFCDERIVEDUNITELEMENT(#74,-1);
#73=IFCSIUNIT(*,.LENGTHUNIT.,.CENTI.,.METRE.);
#74=IFCSIUNIT(*,.TIMEUNIT.,$,.SECOND.);`,
    );
    expect(
      snapshot.types[0]?.fields.find((f) => f.name === "Width")?.values[0]
        ?.normalized,
    ).toEqual({ kind: "number", value: 0.0008000000000000001, unit: "m³/s" });
  });
  it("uses explicit units over project units and labels mixed source units", async () => {
    const snapshot = await analyze(`${shared.replace("(#30,#31)", "(#30)")}
#63=IFCPROPERTYSINGLEVALUE('Width',$,IFCLENGTHMEASURE(800000.),#70);
#64=IFCPROPERTYSET('0000000000000000000064',#5,'Dimensions',$,(#63));
#65=IFCRELDEFINESBYPROPERTIES('0000000000000000000065',#5,$,$,(#31),#64);
#70=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);`);
    const field = snapshot.types[0]?.fields.find((f) => f.name === "Width");
    expect(field?.unit).toBe("Mixed source units");
    expect(field?.values.map((v) => v.normalized)).toEqual([
      { kind: "number", value: 800, unit: "m" },
      { kind: "number", value: 800, unit: "m" },
    ]);
    expect(field?.values.map((v) => v.rawValue)).toEqual(["800", "800000"]);
  });
  it("does not normalize incompatible explicit units or plain numeric fields", async () => {
    const snapshot =
      await analyze(`${shared.replace("IFCLENGTHMEASURE(800.),$", "IFCLENGTHMEASURE(800.),#70")}
#70=IFCSIUNIT(*,.POWERUNIT.,$,.WATT.);
#71=IFCPROPERTYSINGLEVALUE('Count',$,IFCINTEGER(8),$);
#72=IFCPROPERTYSET('0000000000000000000072',#5,'Dimensions',$,(#71));
#73=IFCRELDEFINESBYPROPERTIES('0000000000000000000073',#5,$,$,(#30,#31),#72);`);
    expect(
      snapshot.types[0]?.fields.find((f) => f.name === "Width")?.values[0]
        ?.normalized,
    ).toEqual({
      kind: "text",
      value: "800",
      unit: "W",
      unresolvedMeasure: true,
    });
    expect(
      snapshot.types[0]?.fields.find((f) => f.name === "Count"),
    ).toMatchObject({
      measure: "IFCINTEGER",
      unit: null,
      values: [{ normalized: { kind: "text", value: "8", unit: null } }],
    });
  });
  it("validates the analysis protocol and closed reader boundary", async () => {
    const snapshot = await analyze(shared);
    expect(
      RequestSchema.parse({ kind: "analyze", requestId: 7, modelId: model.id })
        .kind,
    ).toBe("analyze");
    expect(
      ResponseSchema.parse({ kind: "analysis", requestId: 7, value: snapshot })
        .kind,
    ).toBe("analysis");
    expect(
      ResponseSchema.safeParse({
        kind: "analysis",
        requestId: 7,
        value: { types: [] },
      }).success,
    ).toBe(false);
    reader?.close();
    expect(() => reader?.librarySnapshot()).toThrow(/Open an IFC/);
  });
  it("compacts all classified occurrences and reports progress every 250", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => 1000 + i);
    const occurrences = ids
      .map(
        (id) =>
          `#${id}=IFCBUILDINGELEMENTPROXY('000000000000000000${id}',#5,'Repeated sensor',$,$,#14,#22,$,.NOTDEFINED.);`,
      )
      .join("\n");
    const snapshot = await analyze(
      `${shared.replace("(#30,#31)", `(#30,#31,${ids.map((id) => `#${id}`).join(",")})`)}\n${occurrences}`,
      "",
      undefined,
      ids,
    );
    expect(snapshot.types[0]?.occurrenceIds).toHaveLength(252);
    const width = snapshot.types[0]?.fields.find((f) => f.name === "Width");
    expect(width?.values).toHaveLength(1);
    expect(width?.values[0]?.occurrenceIds).toHaveLength(252);
    const messages: string[] = [];
    reader?.librarySnapshot((message) => messages.push(message));
    expect(messages).toEqual([
      "Analyzing 0 / 252 classified occurrences",
      "Analyzing 250 / 252 classified occurrences",
      "Analyzed 252 classified occurrences",
    ]);
  });
});

it("retains per-value original units and measure through snapshot serialization", async () => {
  const snapshot = await analyze(`${shared.replace("(#30,#31)", "(#30)")}
#63=IFCPROPERTYSINGLEVALUE('Width',$,IFCLENGTHMEASURE(800000.),#70);
#64=IFCPROPERTYSET('0000000000000000000064',#5,'Dimensions',$,(#63));
#65=IFCRELDEFINESBYPROPERTIES('0000000000000000000065',#5,$,$,(#31),#64);
#70=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);`);
  const { librarySnapshotSchema } =
    await import("../shared/catalog-library.js");
  const restored = librarySnapshotSchema.parse(
    JSON.parse(JSON.stringify(snapshot)),
  );
  expect(
    restored.types[0]?.fields.find((f) => f.name === "Width")?.values,
  ).toMatchObject([
    {
      rawValue: "800",
      sourceUnit: "m",
      sourceMeasure: "IFCLENGTHMEASURE",
      occurrenceIds: [30],
    },
    {
      rawValue: "800000",
      sourceUnit: "mm",
      sourceMeasure: "IFCLENGTHMEASURE",
      occurrenceIds: [31],
    },
  ]);
});
it("retains an unsupported SI prefix in its unknown unit label", async () => {
  const snapshot = await analyze(
    shared.replace("IFCLENGTHMEASURE", "IFCPRESSUREMEASURE"),
    "",
    "#12=IFCUNITASSIGNMENT((#70));\\n#70=IFCSIUNIT(*,.PRESSUREUNIT.,.KILO.,.PASCAL.);".replace(
      "\\n",
      "\n",
    ),
  );
  expect(
    snapshot.types[0]?.fields.find((f) => f.name === "Width")?.values[0],
  ).toMatchObject({
    sourceUnit: "KILO PASCAL",
    normalized: { kind: "text", unit: "KILO PASCAL", unresolvedMeasure: true },
  });
});
