import { UmbModalToken } from "@umbraco-cms/backoffice/modal";

export interface DraftContent {
  values: Array<{
    alias: string;
    value: unknown;
    culture: string | null;
    segment: string | null;
  }>;
  variants: Array<{
    name: string;
    culture: string | null;
    segment: string | null;
  }>;
}

export interface DraftDiffModalData {
  savedAt: string;
  currentContent: DraftContent;
  draftContent: DraftContent;
}

export interface DraftDiffModalValue {
  action: "load" | "discard";
  /**
   * Identity keys (see draft-row-key.ts) of the rows — or, for block-editor
   * properties (block list / block grid), the individual blocks at any
   * nesting depth — the user chose to apply. Only set when action is "load".
   */
  selectedKeys?: string[];
}

export const DRAFT_DIFF_MODAL_TOKEN = new UmbModalToken<
  DraftDiffModalData,
  DraftDiffModalValue
>("Drafts.DiffModal", {
  modal: {
    type: "sidebar",
    size: "large",
  },
});
