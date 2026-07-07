import {
  css,
  html,
  customElement,
  state,
} from "@umbraco-cms/backoffice/external/lit";
import { UmbLitElement } from "@umbraco-cms/backoffice/lit-element";
import { UMB_NOTIFICATION_CONTEXT } from "@umbraco-cms/backoffice/notification";
import { UMB_AUTH_CONTEXT } from "@umbraco-cms/backoffice/auth";
import { UMB_MODAL_MANAGER_CONTEXT, UMB_CONFIRM_MODAL } from "@umbraco-cms/backoffice/modal";

interface DraftItem {
  nodeKey: string;
  nodeName: string;
  savedAt: string;
}

@customElement("drafts-overview-workspace")
export class DraftsOverviewWorkspace extends UmbLitElement {
  @state() private _drafts: DraftItem[] = [];
  @state() private _loading = true;

  private _notificationContext?: typeof UMB_NOTIFICATION_CONTEXT.TYPE;
  private _authContext?: typeof UMB_AUTH_CONTEXT.TYPE;
  private _modalManagerContext?: typeof UMB_MODAL_MANAGER_CONTEXT.TYPE;
  private _boundRefresh = () => this._loadDrafts();

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("drafts-updated", this._boundRefresh);

    this.consumeContext(UMB_AUTH_CONTEXT, (ctx) => {
      this._authContext = ctx;
      this._loadDrafts();
    });

    this.consumeContext(UMB_NOTIFICATION_CONTEXT, (ctx) => {
      this._notificationContext = ctx;
    });

    this.consumeContext(UMB_MODAL_MANAGER_CONTEXT, (ctx) => {
      this._modalManagerContext = ctx;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("drafts-updated", this._boundRefresh);
  }

  private async _loadDrafts() {
    this._loading = true;
    try {
      const token = await this._authContext?.getLatestToken();
      const response = await fetch("/umbraco/drafts/api/v1/drafts", {
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        this._drafts = await response.json();
      }
    } catch {
      // silently fail
    }
    this._loading = false;
  }

  private async _deleteDraft(nodeKey: string) {
    try {
      const token = await this._authContext?.getLatestToken();
      const response = await fetch(`/umbraco/drafts/api/v1/drafts/${nodeKey}`, {
        method: "DELETE",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        this._notificationContext?.peek("positive", {
          data: { headline: "Draft deleted", message: "" },
        });
      } else {
        this._notificationContext?.peek("danger", {
          data: { headline: "Failed to delete draft", message: "" },
        });
      }
    } catch {
      this._notificationContext?.peek("danger", {
        data: { headline: "Failed to delete draft", message: "" },
      });
    }
    this._loadDrafts();
    window.dispatchEvent(new CustomEvent("drafts-updated"));
  }

  private async _emptyDrafts() {
    const modal = this._modalManagerContext?.open(this, UMB_CONFIRM_MODAL, {
      data: {
        headline: "Empty drafts",
        content: "Are you sure you want to delete all drafts? This cannot be undone.",
        confirmLabel: "Empty drafts",
      },
    });

    if (!modal) return;

    try {
      await modal.onSubmit();
    } catch {
      return; // cancelled
    }

    try {
      const token = await this._authContext?.getLatestToken();
      const response = await fetch("/umbraco/drafts/api/v1/drafts", {
        method: "DELETE",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        this._notificationContext?.peek("positive", {
          data: { headline: "All drafts deleted", message: "" },
        });
      } else {
        this._notificationContext?.peek("danger", {
          data: { headline: "Failed to empty drafts", message: "" },
        });
      }
    } catch {
      this._notificationContext?.peek("danger", {
        data: { headline: "Failed to empty drafts", message: "" },
      });
    }
    this._loadDrafts();
    window.dispatchEvent(new CustomEvent("drafts-updated"));
  }

  private _formatDate(savedAt: string): string {
    return new Date(savedAt).toLocaleString();
  }

  private _navigateToNode(nodeKey: string) {
    window.history.pushState(
      {},
      "",
      `/umbraco/section/content/workspace/document/edit/${nodeKey}?draft=true`
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  render() {
    return html`
      <umb-body-layout headline="Drafts">
        <div id="toolbar" slot="header">
        </div>

        ${this._loading
          ? html`<uui-loader></uui-loader>`
          : this._drafts.length === 0
          ? html`<div class="empty-state">
              <uui-icon name="icon-document"></uui-icon>
              <p class="uui-h4">No drafts saved</p>
            </div>`
          : html`
            <uui-button
              look="outline"
              color="default"
              label="Empty drafts"
              ?disabled=${this._drafts.length === 0}
              @click=${this._emptyDrafts}
              class="empty-drafts-btn"
            >
              Empty drafts
            </uui-button>
              <uui-table class="uui-text table-spaced">
                <uui-table-head>
                  <uui-table-head-cell>Name</uui-table-head-cell>
                  <uui-table-head-cell>Last updated</uui-table-head-cell>
                  <uui-table-head-cell></uui-table-head-cell>
                </uui-table-head>
                ${this._drafts.map(
                  (draft) => html`
                    <uui-table-row>
                      <uui-table-cell>
                        <uui-button
                          look="placeholder"
                          label=${draft.nodeName}
                          @click=${() => this._navigateToNode(draft.nodeKey)}
                        >
                          <uui-icon name="icon-document" slot="icon"></uui-icon>
                          ${draft.nodeName}
                        </uui-button>
                      </uui-table-cell>
                      <uui-table-cell>${this._formatDate(draft.savedAt)}</uui-table-cell>
                      <uui-table-cell>
                        <uui-action-bar>
                          <uui-button
                            color="default"
                            look="default"
                            label="Delete"
                            @click=${() => this._deleteDraft(draft.nodeKey)}
                          >
                            <uui-icon name="icon-trash-empty"></uui-icon>
                          </uui-button>
                        </uui-action-bar>
                      </uui-table-cell>
                    </uui-table-row>
                  `
                )}
              </uui-table>
            `}
      </umb-body-layout>
    `;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }

    #toolbar {
      display: flex;
      gap: var(--uui-size-4, 8px);
      padding: var(--uui-size-4, 8px) 0;
    }

    .empty-drafts-btn {
      margin-top: calc(var(--uui-size-3, 6px) * -1);
    }

    .table-spaced {
      margin-top: var(--uui-size-layout-2, 30px);
    }

    uui-table {
      width: 100%;
    }

    uui-table-cell:last-child {
      width: 60px;
      text-align: right;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--uui-size-4, 8px);
      padding: var(--uui-size-layout-3, 48px);
      color: var(--uui-color-text-alt, #6b7280);
      height: 80%;
    }

    .empty-state uui-icon {
      font-size: 48px;
    }

    .uui-h4 {
      font-size: var(--uui-type-h4-size, 21px);
      line-height: 21px;
      font-weight: 400;
      margin-left: -1px;
      margin-bottom: var(--uui-size-layout-1, 24px);
    }
  `;
}

export default DraftsOverviewWorkspace;

declare global {
  interface HTMLElementTagNameMap {
    "drafts-overview-workspace": DraftsOverviewWorkspace;
  }
}
