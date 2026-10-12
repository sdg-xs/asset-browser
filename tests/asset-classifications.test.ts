import { describe, expect, it, vi } from "vitest";
import { createIfcClassReader } from "../server/ifc-classifications.js";
import { nsTfmSystemOptions } from "../shared/ns-tfm-system-options.js";
import { ifcClassSnapshot } from "../shared/ifc-class-snapshot.js";

describe("asset classifications", () => {
  it("pages through bSDD, omits predefined-type variants, and shares cached results", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ classesTotalCount: 3, classes: [
        { code: "IfcWall", name: "Wall" }, { code: "IfcWallSTANDARD", name: "Standard" },
      ] }))
      .mockResolvedValueOnce(Response.json({ classesTotalCount: 3, classes: [{ code: "IfcAlarm", name: "Alarm" }] }));
    const read = createIfcClassReader(fetcher);
    const [first, second] = await Promise.all([read(), read()]);
    expect(first).toEqual([
      { value: "IFCALARM", label: "IFCALARM", description: "Alarm" },
      { value: "IFCWALL", label: "IFCWALL", description: "Wall" },
    ]);
    expect(second).toBe(first);
    expect(await read()).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("Offset=2");
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("buildingsmart%2Fifc%2F4.3");
  });
  it("allows retrying bSDD after an unsuccessful request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ classesTotalCount: 1, classes: [{ code: "IfcAlarm", name: "Alarm" }] }));
    const read = createIfcClassReader(fetcher);
    await expect(read()).rejects.toThrow("bSDD");
    expect(await read()).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("keeps real IFC entities in the saved list and applies Statsbygg system exclusions", () => {
    expect(ifcClassSnapshot.some(option => option.value === "IFCALARM")).toBe(true);
    expect(ifcClassSnapshot.some(option => option.value === "IFCALARMBELL")).toBe(false);
    expect(nsTfmSystemOptions.find(option => option.value.startsWith("5420 "))?.value).toBe("5420 Brannalarmsystemer");
    expect(nsTfmSystemOptions.find(option => option.value.startsWith("3600 "))?.value).toBe("3600 Luftbehandlingssystemer");
    expect(nsTfmSystemOptions.every(option => /^[2-7]\d{3} \S/.test(option.value))).toBe(true);
    expect(nsTfmSystemOptions.some(option => /^(2300|3100|3300|4600|360[1-7]|5205|7500) /.test(option.value))).toBe(false);
    expect(new Set(nsTfmSystemOptions.map(option => option.value.slice(0, 4))).size).toBe(nsTfmSystemOptions.length);
  });
});
