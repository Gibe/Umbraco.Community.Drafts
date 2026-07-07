import {
  html,
  customElement,
  state,
} from "@umbraco-cms/backoffice/external/lit";
import { UmbModalBaseElement } from "@umbraco-cms/backoffice/modal";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import { UMB_DOCUMENT_WORKSPACE_CONTEXT } from "@umbraco-cms/backoffice/document";
import { UMB_AUTH_CONTEXT, type UmbAuthContext } from "@umbraco-cms/backoffice/auth";
import { UMB_NOTIFICATION_CONTEXT, type UmbNotificationContext } from "@umbraco-cms/backoffice/notification";

/**
 * Replacement for Umbraco's core `umb-discard-changes-modal`. Adds a
 * "Save draft" option so leaving a page with unsaved changes doesn't have to
 * mean losing them - the draft is already being auto-saved by this package,
 * but the wording of the core modal implies otherwise.
 */
@customElement("drafts-discard-changes-modal")
export default class DraftsDiscardChangesModalElement extends UmbModalBaseElement {
  private _workspaceContext?: typeof UMB_DOCUMENT_WORKSPACE_CONTEXT.TYPE;
  private _authContext?: UmbAuthContext;
  private _notificationContext?: UmbNotificationContext;

  @state()
  private _saving = false;

  constructor() {
    super();
    this.consumeContext(UMB_DOCUMENT_WORKSPACE_CONTEXT, (ctx) => {
      this._workspaceContext = ctx;
    });
    this.consumeContext(UMB_AUTH_CONTEXT, (ctx) => {
      this._authContext = ctx;
    });
    this.consumeContext(UMB_NOTIFICATION_CONTEXT, (ctx) => {
      this._notificationContext = ctx;
    });
  }

  async #handleSaveDraft() {
    const nodeKey = this._workspaceContext?.getUnique();
    if (!nodeKey || !this._workspaceContext) return;

    this._saving = true;
    try {
      const token = await this._authContext?.getLatestToken();
      const contentData = JSON.stringify({
        values: this._workspaceContext.getValues(),
        variants: this._workspaceContext.getVariants(),
      });

      const response = await fetch("/umbraco/drafts/api/v1/drafts", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ nodeKey, contentData }),
      });

      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

      window.dispatchEvent(new CustomEvent("drafts-updated"));
      this._notificationContext?.peek("positive", {
        data: { headline: "Draft saved", message: "" },
      });
      this._submitModal();
    } catch {
      this._notificationContext?.peek("danger", {
        data: { headline: "Could not save draft", message: "Please try again." },
      });
    } finally {
      this._saving = false;
    }
  }

  #handleDiscard() {
    this._submitModal();
  }

  #handleCancel() {
    this._rejectModal();
  }

  render() {
    return html`
      <uui-dialog-layout class="uui-text" headline=${this.localize.term("prompt_unsavedChanges")}>
        <umb-localize key="prompt_unsavedChangesWarning"></umb-localize>

        <uui-button
          slot="actions"
          id="cancel"
          label=${this.localize.term("prompt_stay")}
          ?disabled=${this._saving}
          @click=${this.#handleCancel}></uui-button>

        <uui-button
          slot="actions"
          id="confirm"
          color="danger"
          look="primary"
          label=${this.localize.term("prompt_discardChanges")}
          ?disabled=${this._saving}
          @click=${this.#handleDiscard}></uui-button>

        ${this._workspaceContext
          ? html`
              <uui-button
                slot="actions"
                id="save-draft"
                look="primary"
                color="positive"
                label="Save draft"
                ?disabled=${this._saving}
                .state=${this._saving ? "waiting" : undefined}
                @click=${this.#handleSaveDraft}>
                Save draft
              </uui-button>
            `
          : ""}
      </uui-dialog-layout>
    `;
  }

  static styles = [UmbTextStyles];
}

declare global {
  interface HTMLElementTagNameMap {
    "drafts-discard-changes-modal": DraftsDiscardChangesModalElement;
  }
}
