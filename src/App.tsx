import {
  CatalogWorkspace,
  type CatalogWorkspaceProps,
} from "./catalog/CatalogWorkspace.js";
export function App(props: CatalogWorkspaceProps) {
  return <CatalogWorkspace {...props} />;
}
