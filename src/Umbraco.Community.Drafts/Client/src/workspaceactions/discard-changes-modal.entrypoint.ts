import type { UmbEntryPointOnInit, UmbEntryPointOnUnload } from "@umbraco-cms/backoffice/extension-api";
import type { ManifestModal } from "@umbraco-cms/backoffice/modal";

const DISCARD_CHANGES_MODAL_ALIAS = "Umb.Modal.DiscardChanges";

const manifest: ManifestModal = {
  type: "modal",
  alias: DISCARD_CHANGES_MODAL_ALIAS,
  name: "Drafts Discard Changes Modal",
  element: () => import("./discard-changes-modal.element.js"),
};

/**
 * Replaces Umbraco's built-in "Discard unsaved changes" modal with our own,
 * which adds a "Save draft" option. The core modal is registered under the
 * same alias, so it must be unregistered first before we can take its place.
 */
export const onInit: UmbEntryPointOnInit = (_host, extensionRegistry) => {
  extensionRegistry.unregister(DISCARD_CHANGES_MODAL_ALIAS);
  extensionRegistry.register(manifest);
};

export const onUnload: UmbEntryPointOnUnload = () => {};
