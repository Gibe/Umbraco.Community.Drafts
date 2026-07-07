export const manifests: Array<UmbExtensionManifest> = [
  {
    name: "Drafts Sidebar App",
    alias: "Drafts.Sidebar.App",
    type: "sectionSidebarApp",
    element: () => import('./sidebar.element.js'),
    weight: 0,
    conditions: [
      {
        alias: "Umb.Condition.SectionAlias",
        match: "Umb.Section.Content",
      },
    ],
  },
];
