import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readConfig } from "../server/config.js";

describe("device-local library folders", () => {
  it("uses this device's business OneDrive folder for existing IFC sources", () => {
    const config = readConfig({ OneDriveCommercial: "D:/Synced business", OneDrive: "D:/Personal" });
    expect(config.sourceRoot).toBe(join("D:/Synced business", "Desktop", "Omniverse Working Files", "PROPERTIES"));
  });

  it("uses the current user profile when OneDrive environment variables are unavailable", () => {
    const config = readConfig({ USERPROFILE: "C:/Users/NewDevice" });
    expect(config.sourceRoot).toBe(join("C:/Users/NewDevice", "OneDrive - HEMY AS", "Desktop", "Omniverse Working Files", "PROPERTIES"));
  });

  it("retains an explicitly configured source folder", () => {
    expect(readConfig({ IFC_SOURCE_ROOT: "D:/Properties", OneDriveCommercial: "D:/Synced business" }).sourceRoot)
      .toBe(join("D:/Properties"));
  });
});
