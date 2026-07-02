import { manifests as sidebars } from "./sidebars/manifest.js";
import { manifests as menus } from "./menus/manifest.js";
import { manifests as workspaceactions } from "./workspaceactions/manifest.js";
import { manifests as workspaces } from "./workspaces/manifest.js";

// Job of the bundle is to collate all the manifests from different parts of
// the extension and load other manifests
// We load this bundle from umbraco-package.json
export const manifests: Array<UmbExtensionManifest> = [
  ...sidebars,
  ...menus,
  ...workspaceactions,
  ...workspaces,
];
