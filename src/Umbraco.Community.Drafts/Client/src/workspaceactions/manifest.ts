export const manifests: Array<UmbExtensionManifest> = [
  {
    name: "Drafts Auto Save Workspace Footer App",
    alias: "Drafts.WorkspaceFooterApp.AutoSave",
    type: "workspaceFooterApp",
    element: () => import("./auto-save.element.js"),
    weight: 900,
    conditions: [
      {
        alias: "Umb.Condition.WorkspaceAlias",
        match: "Umb.Workspace.Document",
      },
    ],
  },
  {
    type: "modal",
    alias: "Drafts.DiffModal",
    name: "Drafts Diff Modal",
    element: () => import("./draft-diff-modal.element.js"),
  },
];
