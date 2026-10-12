import { z } from "zod";

export const classificationOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
});
export type ClassificationOption = z.infer<typeof classificationOptionSchema>;
export const ifcClassOptionsSchema = z.array(classificationOptionSchema).min(1);
export const ifcDictionaryUri = "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3";
export const nsTfmGuideUrl = "https://dok.statsbygg.no/wp-content/uploads/2024/02/PA-0805-Bruk-av-Standard-Norges-Tverrfaglig-Merkesystem-NS-TFM-i-Statsbygg-rev-04.pdf";
export const nsTfmSystemsUrl = "https://dok.statsbygg.no/wp-content/uploads/2024/12/PA-0702-Vedlegg-1-2-Dokumentasjonskrav-iht-PA-0805-NS-TFM-rev5.pdf";
