export const manifests: Array<UmbExtensionManifest> = [
  {
    name: "Drafts Overview Workspace",
    alias: "Drafts.Workspace",
    type: "workspace",
    kind: "default",
    element: () => import("./drafts-overview.element.js"),
    meta: {
      entityType: "drafts",
    },
  },
];
