import {
  css,
  html,
  customElement,
  state,
} from "@umbraco-cms/backoffice/external/lit";
import { UmbLitElement } from "@umbraco-cms/backoffice/lit-element";
import { UMB_NOTIFICATION_CONTEXT } from "@umbraco-cms/backoffice/notification";
import { UMB_AUTH_CONTEXT } from "@umbraco-cms/backoffice/auth";

interface DraftItem {
  nodeKey: string;
  nodeName: string;
  savedAt: string;
}

@customElement("drafts-list")
export class DraftsList extends UmbLitElement {
  @state()
  private _drafts: DraftItem[] = [];

  @state()
  private _loading = true;

  private _boundRefresh = () => this._loadDrafts();
  private _notificationContext?: typeof UMB_NOTIFICATION_CONTEXT.TYPE;
  private _authContext?: typeof UMB_AUTH_CONTEXT.TYPE;

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
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        this._drafts = await response.json();
      }
    } catch {
      // silently fail
    }
    this._loading = false;

    this.dispatchEvent(
      new CustomEvent("draft-count-changed", {
        detail: this._drafts.length,
        bubbles: true,
        composed: true,
      })
    );
  }

  private _navigateToNode(nodeKey: string) {
    window.history.pushState(
      {},
      "",
      `/umbraco/section/content/workspace/document/edit/${nodeKey}?draft=true`
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  private async _removeDraft(e: Event, nodeKey: string) {
    e.stopPropagation();
    try {
      const token = await this._authContext?.getLatestToken();
      const response = await fetch(
        `/umbraco/drafts/api/v1/drafts/${nodeKey}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        this._notificationContext?.peek("positive", {
          data: { headline: "Draft discarded", message: "" },
        });
      } else {
        this._notificationContext?.peek("danger", {
          data: { headline: "Failed to discard draft", message: "" },
        });
      }
    } catch {
      this._notificationContext?.peek("danger", {
        data: { headline: "Failed to discard draft", message: "" },
      });
    }

    this._loadDrafts();
    window.dispatchEvent(new CustomEvent("drafts-updated"));
  }

  private _formatTime(savedAt: string): string {
    const date = new Date(savedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  render() {
    if (this._loading) {
      return html`<uui-loader></uui-loader>`;
    }

    // if (this._drafts.length === 0) {
    //   return html`<uui-menu-item label="No drafts" disabled></uui-menu-item>`;
    // }

    return html`
      ${this._drafts.map(
        (draft) => html`
          <uui-menu-item
            label=${draft.nodeName}
            @click-label=${() => this._navigateToNode(draft.nodeKey)}
          >
            <uui-icon slot="icon" name="icon-document"></uui-icon>
            <span slot="description" class="draft-time">${this._formatTime(draft.savedAt)}</span>
            <uui-action-bar slot="actions">
              <uui-button
                label="Discard"
                @click=${(e: Event) => this._removeDraft(e, draft.nodeKey)}
              >
                <uui-icon name="icon-delete"></uui-icon>
              </uui-button>
            </uui-action-bar>
          </uui-menu-item>
        `
      )}
    `;
  }

  static styles = [
    css`
      :host {
        display: contents;
      }

      .draft-time {
        font-size: 11px;
        opacity: 0.7;
      }
    `,
  ];
}

export default DraftsList;

declare global {
  interface HTMLElementTagNameMap {
    "drafts-list": DraftsList;
  }
}
