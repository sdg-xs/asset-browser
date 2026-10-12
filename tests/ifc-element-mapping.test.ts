import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { IfcReader } from "../src/ifc/reader.js";
import { applyLibraryCommand, emptyCatalogLibrary } from "../shared/catalog-rules.js";

it("detects element and type attributes, quantities and linked metadata for upload mapping", async () => {
  const original = await readFile(new URL("./fixtures/assets.ifc", import.meta.url), "utf8");
  const extra = `
#60=IFCQUANTITYLENGTH('Length',$,$,1.25,$);
#62=IFCELEMENTQUANTITY('0000000000000000000062',#5,'Qto_SensorBaseQuantities',$,$,(#60));
#63=IFCRELDEFINESBYPROPERTIES('0000000000000000000063',#5,$,$,(#30),#62);
#70=IFCSYSTEM('0000000000000000000070',#5,'Fire alarm','System description',$);
#71=IFCRELASSIGNSTOGROUP('0000000000000000000071',#5,$,$,(#30),$,#70);
#72=IFCMATERIAL('Steel',$,$);
#73=IFCRELASSOCIATESMATERIAL('0000000000000000000073',#5,$,$,(#30),#72);
#74=IFCDOCUMENTREFERENCE('https://example.com/fdvu.pdf','FDVU-01','FDVU manual',$);
#75=IFCRELASSOCIATESDOCUMENT('0000000000000000000075',#5,$,$,(#30),#74);
#76=IFCCLASSIFICATIONREFERENCE('https://example.com/class','FD-01','Smoke detector',$,$,$);
#77=IFCRELASSOCIATESCLASSIFICATION('0000000000000000000077',#5,$,$,(#30),#76);
`;
  const fixture = original
    .replace("'First sensor',$,$,#14,#22,$,.NOTDEFINED.", "'First sensor','Sensor description','Custom sensor',#14,#22,'FD-01',.NOTDEFINED.")
    .replace("'Sensor type',$,$,(#41),$,$,$,.NOTDEFINED.", "'Sensor type','Type description',$,(#41),$,'TYPE-01','Smoke sensor',.NOTDEFINED.")
    .replace(/ENDSEC;\r?\nEND-ISO/, `${extra}\nENDSEC;\nEND-ISO`);
  const reader = new IfcReader();
  await reader.initialize();
  const model = { id: "b3907523-463f-414b-8235-1d5e1cce0454", fingerprint: "fixture", name: "Rich sensor.ifc" };
  try {
    reader.open(new TextEncoder().encode(fixture), model, undefined, "creation");
    const snapshot = reader.analyzeAssets();
    const type = snapshot.types.find(type => type.typeGlobalId === "0000000000000000000042");
    if (!type) throw Error("Expected sensor type");
    const value = (group: string, name: string) => type.fields.find(field => field.pset === group && field.name === name)
      ?.values.find(value => value.occurrenceIds.includes(30))?.normalized;
    for (const [group, name, expected] of [
      ["IFC element attributes", "Name", "First sensor"],
      ["IFC element attributes", "Description", "Sensor description"],
      ["IFC element attributes", "ObjectType", "Custom sensor"],
      ["IFC element attributes", "Tag", "FD-01"],
      ["IFC element attributes", "GlobalId", "0000000000000000000030"],
      ["IFC element attributes", "PredefinedType", "NOTDEFINED"],
      ["IFC type attributes", "Name", "Sensor type"],
      ["IFC type attributes", "Description", "Type description"],
      ["IFC type attributes", "Tag", "TYPE-01"],
      ["IFC type attributes", "ElementType", "Smoke sensor"],
      ["IFC system attributes", "Name", "Fire alarm"],
      ["IFC material attributes", "Name", "Steel"],
      ["IFC document attributes", "Location", "https://example.com/fdvu.pdf"],
      ["IFC classification attributes", "Identification", "FD-01"],
      ["IFC spatial container attributes", "Name", "Building"],
    ]) expect(value(group ?? "", name ?? "")).toEqual({ kind: "text", value: expected, unit: null });
    expect(value("Qto_SensorBaseQuantities", "Length")).toEqual({ kind: "number", value: 1.25, unit: "m" });
    const imported = applyLibraryCommand(emptyCatalogLibrary(), { kind: "import-asset", expectedRevision: 0, snapshot,
      candidateKey: "type:0000000000000000000042" });
    expect(imported.sources[0]?.observation.fields.some(field => field.origin === "attribute")).toBe(true);
    expect(imported.templates.flatMap(template => template.suggestions).some(mapping => mapping.key.includes("IFC element attributes"))).toBe(false);
    reader.open(new TextEncoder().encode(original), model, undefined, "creation");
    expect(reader.analyzeAssets().types.flatMap(type => type.fields).some(field => field.pset === "IFC system attributes")).toBe(false);
  } finally {
    reader.dispose();
  }
});
