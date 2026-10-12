import { useEffect, useState } from "react";
import { SearchableSelect } from "../components/SearchableSelect.js";
import { ifcClassSnapshot } from "../../shared/ifc-class-snapshot.js";
import { nsTfmSystemOptions } from "../../shared/ns-tfm-system-options.js";
import { ifcDictionaryUri, nsTfmGuideUrl } from "../../shared/asset-classifications.js";
import { readIfcClasses } from "./classification-api.js";

export function AssetClassificationFields({ ifcClass, system, onIfcClass, onSystem }: {
  ifcClass: string;
  system: string;
  onIfcClass(value: string): void;
  onSystem(value: string): void;
}) {
  const [classes, setClasses] = useState(ifcClassSnapshot);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let active = true;
    void readIfcClasses().then(options => { if (active) setClasses(options); })
      .catch(() => { if (active) setOffline(true); });
    return () => { active = false; };
  }, []);
  return <>
    <div className="classification-field">
      <span>IFC Class</span>
      <SearchableSelect label="IFC Class" value={ifcClass} options={classes} onChange={onIfcClass} />
      <small><a href={`https://search.bsdd.buildingsmart.org${new URL(ifcDictionaryUri).pathname}`} target="_blank" rel="noreferrer">buildingSMART bSDD · IFC 4.3</a>{offline && " · Saved list"}</small>
    </div>
    <div className="classification-field">
      <span>System</span>
      <SearchableSelect label="System" value={system} options={nsTfmSystemOptions} onChange={onSystem} />
      <small><a href={nsTfmGuideUrl} target="_blank" rel="noreferrer">NS 3451:2022 · Statsbygg NS-TFM</a></small>
    </div>
  </>;
}
