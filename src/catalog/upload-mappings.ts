import type { UploadMappings } from "../../shared/catalog-library.js";

export const uploadParameters = [
  { key: "name", label: "Asset name" },
  { key: "ifcClass", label: "IFC Class" },
  { key: "system", label: "System" },
] as const;

export const manualUploadMappings: UploadMappings = { name: "", ifcClass: "", system: "", fdvuDocumentationUrl: "" };
export const nativeUploadProperties = [
  { key: "asset-name", label: "IFC asset type name" },
  { key: "ifc-class", label: "IFC entity class" },
];
