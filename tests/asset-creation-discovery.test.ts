import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { IfcReader } from "../src/ifc/reader.js";

const model = { id: "b3907523-463f-414b-8235-1d5e1cce0454", fingerprint: "fixture" };
let reader: IfcReader | undefined;
afterEach(() => reader?.dispose());

async function source() {
  return readFile(new URL("./fixtures/assets.ifc", import.meta.url), "utf8");
}
async function open(text: string, purpose: "browse" | "creation" = "creation") {
  reader = new IfcReader();
  await reader.initialize();
  reader.open(new TextEncoder().encode(text), model, undefined, purpose);
  return reader;
}

describe("real IFC creation discovery", () => {
  it("groups all occurrences of a type and keeps classified untyped elements", async () => {
    const current = await open(await source());
    const index = current.discoverAssets();
    expect(index.modelId).toBe(model.id);
    expect(index.fingerprint).toBe("fixture");
    expect(index.stats).toEqual({ elements: 5, candidates: 2, classified: 2, unclassified: 0, untyped: 1 });
    expect(index.candidates).toEqual([
      { key: "type:0000000000000000000042", identity: { kind: "type", globalId: "0000000000000000000042" }, name: "Sensor type", ifcClass: "IFCBUILDINGELEMENTPROXYTYPE", categories: ["Temperature sensor", "Air quality sensor"], classificationIssues: [], occurrenceIds: [30, 31, 32, 34], representativeId: 30 },
      { key: "element:0000000000000000000033", identity: { kind: "element", globalId: "0000000000000000000033" }, name: "Untyped sensor", ifcClass: "IFCBUILDINGELEMENTPROXY", categories: ["Temperature sensor"], classificationIssues: [], occurrenceIds: [33], representativeId: 33 },
    ]);
  });

  it("keeps a blank typed candidate without falling back to type classification and ignores spaces", async () => {
    const text = (await source()).replace("(#30,#31,#32,#34),#42", "(#30,#31,#34),#42").replace(/ENDSEC;\s*END-ISO/, "#60=IFCBUILDINGELEMENTPROXYTYPE('0000000000000000000060',#5,'Blank type',$,$,(#41),$,$,$,.NOTDEFINED.);\n#61=IFCRELDEFINESBYTYPE('0000000000000000000061',#5,$,$,(#32),#60);\n#62=IFCSPACE('0000000000000000000062',#5,'Room',$,$,#14,$,$,.ELEMENT.,.INTERNAL.,$);\nENDSEC;\nEND-ISO");
    const current = await open(text);
    const index = current.discoverAssets();
    expect(index.stats).toEqual({ elements: 5, candidates: 3, classified: 2, unclassified: 1, untyped: 1 });
    expect(index.candidates.find(candidate => candidate.identity.globalId === "0000000000000000000060")).toMatchObject({ identity: { kind: "type" }, categories: [], occurrenceIds: [32], representativeId: 32 });
    expect(index.candidates.some(candidate => candidate.occurrenceIds.includes(62) || candidate.occurrenceIds.includes(15) || candidate.occurrenceIds.includes(13))).toBe(false);
  });

  it.each(["conflicting", "unsupported"])("retains %s classification issues for review and preserves browse rejection", async kind => {
    const text = kind === "conflicting"
      ? (await source()).replace("'Identity Data',$,(#40)", "'Identity Data',$,(#40,#44)")
      : (await source()).replace("IFCPROPERTYSINGLEVALUE('Generic Hard Asset',$,IFCLABEL('Air quality sensor'),$)", "IFCPROPERTYENUMERATEDVALUE('Generic Hard Asset',$,(IFCLABEL('Air quality sensor')),$)");
    const current = await open(text);
    const candidate = current.discoverAssets().candidates.find(candidate => candidate.identity.kind === "type");
    expect(candidate?.occurrenceIds).toEqual([30, 31, 32, 34]);
    expect(candidate?.classificationIssues.length).toBeGreaterThan(0);
    expect(candidate?.categories).toContain("Temperature sensor");
    expect(() => current.open(new TextEncoder().encode(text), model)).toThrow(/Conflicting|Unsupported/);
    expect(() => current.discoverAssets()).toThrow(/Open an IFC/);
  });

  it("uses a readable IFC class for unnamed untyped components and separates identity kinds", async () => {
    const text = (await source()).replace("'0000000000000000000033',#5,'Untyped sensor'", "'0000000000000000000042',#5,$");
    const index = (await open(text)).discoverAssets();
    expect(index.candidates.map(candidate => candidate.key)).toEqual(["type:0000000000000000000042", "element:0000000000000000000042"]);
    expect(index.candidates[1]?.name).toMatch(/Ifc|IFC/i);
    expect(index.candidates[1]?.name.trim()).not.toBe("");
  });

  it("clears discovery state after malformed replacement and can reopen", async () => {
    const text = await source();
    const current = await open(text);
    expect(current.discoverAssets().candidates).toHaveLength(2);
    expect(() => current.open(new TextEncoder().encode("not IFC"), model)).toThrow(/IFC/);
    expect(() => current.discoverAssets()).toThrow(/Open an IFC/);
    expect(() => current.properties(30)).toThrow();
    current.open(new TextEncoder().encode(text), model);
    expect(current.discoverAssets().candidates).toHaveLength(2);
  });

  it("closes a malformed component without a stable identity after discovery fails", async () => {
    const text = (await source()).replace("'0000000000000000000033',#5,'Untyped sensor'", "$,#5,'Untyped sensor'");
    const current = await open(text);
    expect(() => current.discoverAssets()).toThrow(/GlobalId/);
    expect(() => current.properties(30)).toThrow();
    expect(() => current.discoverAssets()).toThrow(/Open an IFC/);
  });

  it("retains conflicting instance classifications without using the type value", async () => {
    const text = (await source()).replace("'Identity Data',$,(#44)", "'Identity Data',$,(#44,#50)");
    const current = await open(text);
    const index = current.discoverAssets();
    expect(index.candidates[0]?.categories).toEqual(["Air quality sensor"]);
    expect(index.candidates[1]?.categories).toEqual([]);
    expect(index.candidates[1]?.classificationIssues.length).toBeGreaterThan(0);
    expect(() => current.open(new TextEncoder().encode(text), model)).toThrow(/Conflicting/);
  });
});
