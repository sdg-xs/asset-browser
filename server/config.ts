import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";

function defaultSourceRoot(environment: NodeJS.ProcessEnv): string {
  const cloudRoot = environment.OneDriveCommercial || environment.OneDrive ||
    join(environment.USERPROFILE || homedir(), "OneDrive - HEMY AS");
  return join(cloudRoot, "Desktop", "Omniverse Working Files", "PROPERTIES");
}
export const DEFAULT_SOURCE_ROOT = defaultSourceRoot(process.env);
export const DEFAULT_MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
const EnvironmentSchema = z.object({
  IFC_SOURCE_ROOT: z.string().min(1).default(DEFAULT_SOURCE_ROOT),
  IFC_DATA_ROOT: z.string().min(1).default(".local-data"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  IFC_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_MAX_UPLOAD_BYTES),
});

export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  const config = EnvironmentSchema.parse({
    ...environment,
    IFC_SOURCE_ROOT: environment.IFC_SOURCE_ROOT ?? defaultSourceRoot(environment),
  });
  return {
    sourceRoot: resolve(config.IFC_SOURCE_ROOT),
    dataRoot: resolve(config.IFC_DATA_ROOT),
    port: config.PORT,
    maxUploadBytes: config.IFC_MAX_UPLOAD_BYTES,
  };
}
