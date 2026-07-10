import {
  css,
  html,
  nothing,
  customElement,
  state,
} from "@umbraco-cms/backoffice/external/lit";
import { UmbLitElement } from "@umbraco-cms/backoffice/lit-element";
import { UMB_DOCUMENT_WORKSPACE_CONTEXT } from "@umbraco-cms/backoffice/document";
import { UMB_AUTH_CONTEXT } from "@umbraco-cms/backoffice/auth";
import { UmbVariantId } from "@umbraco-cms/backoffice/variant";
import { UMB_MODAL_MANAGER_CONTEXT } from "@umbraco-cms/backoffice/modal";
import { UMB_NOTIFICATION_CONTEXT } from "@umbraco-cms/backoffice/notification";
import { DRAFT_DIFF_MODAL_TOKEN, type DraftDiffModalData, type DraftDiffModalValue } from "./draft-diff-modal.token.js";
import { buildValueKey, buildVariantKey } from "./draft-row-key.js";
import { buildDiffRows } from "./draft-diff.js";

@customElement("drafts-auto-save-action")
export default class DraftsAutoSaveElement extends UmbLitElement {
  private _autoSaveInterval: ReturnType<typeof setInterval> | null = null;
  private _workspaceContext?: typeof UMB_DOCUMENT_WORKSPACE_CONTEXT.TYPE;
  private _authContext?: typeof UMB_AUTH_CONTEXT.TYPE;
  private _notificationContext?: typeof UMB_NOTIFICATION_CONTEXT.TYPE;
  private _lastSavedData: string = "";
  private _nodeKey: string | null = null;
  private _lastCheckedNodeKey: string | null = null;
  private _isPersistedDataLoaded = false;
  private _modalManagerContext?: typeof UMB_MODAL_MANAGER_CONTEXT.TYPE;

  @state()
  private _status: "idle" | "dirty" | "saving" | "saved" = "idle";

  @state()
  private _lastSavedTime: string = "";

  private _boundCheckAndLoadDraft = () => this._checkAndLoadDraft();

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("popstate", this._boundCheckAndLoadDraft);

    this.consumeContext(UMB_AUTH_CONTEXT, (ctx) => {
      this._authContext = ctx;
    });

    this.consumeContext(UMB_DOCUMENT_WORKSPACE_CONTEXT, (ctx) => {
      if (!ctx) return;
      this._workspaceContext = ctx;
      const newNodeKey = ctx?.getUnique() ?? null;

      if (newNodeKey !== this._nodeKey) {
        this._nodeKey = newNodeKey;
        this._lastCheckedNodeKey = null; // Reset check for new node
      }

      this._isPersistedDataLoaded = false;
      this.observe(ctx.persistedData, (data) => {
        if (!this._isPersistedDataLoaded) {
          if (data === undefined) return; // Workspace not loaded yet — wait
          this._isPersistedDataLoaded = true;
          this._checkAndLoadDraft();
          return;
        }
        // Document was saved — remove draft from sidebar immediately
        this._status = 'idle';
        window.dispatchEvent(new CustomEvent('drafts-updated'));
      });

      // Capture initial state
      const values = ctx?.getValues();
      const variants = ctx?.getVariants();
      this._lastSavedData = JSON.stringify({ values, variants });

      this.observe(ctx.data, () => {
        if (this._status === 'saving') return;
        const currentData = JSON.stringify({ values: ctx.getValues(), variants: ctx.getVariants() });
        if (currentData !== this._lastSavedData) {
          this._status = 'dirty';
        }
      });

      this._startAutoSave();
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
    window.removeEventListener("popstate", this._boundCheckAndLoadDraft);
    this._stopAutoSave();
  }

  private _startAutoSave() {
    // Auto-save every 10 seconds
    this._autoSaveInterval = setInterval(() => {
      this._performAutoSave();
    }, 10000);

    // Also save after 5 seconds on initial load to capture early edits
    setTimeout(() => {
      this._performAutoSave();
    }, 5000);
  }

  private _stopAutoSave() {
    if (this._autoSaveInterval) {
      clearInterval(this._autoSaveInterval);
      this._autoSaveInterval = null;
    }
  }

  private async _checkAndLoadDraft() {
    if (!this._workspaceContext || !this._nodeKey || !this._authContext) return;

    const urlParams = new URL(window.location.href).searchParams;
    const forceLoad = urlParams.get("draft") === "true";

    // If we've already checked this node and no force load is requested, bail
    if (!forceLoad && this._lastCheckedNodeKey === this._nodeKey) return;
    this._lastCheckedNodeKey = this._nodeKey;

    try {
      const token = await this._authContext?.getLatestToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch(`/umbraco/drafts/api/v1/drafts/${this._nodeKey}`, {
        credentials: "include",
        headers,
      });

      if (response.ok) {
        const draft = await response.json();

        const data = JSON.parse(draft.contentData);

        // Which rows the user chose to apply. Undefined means "apply everything"
        // (force-loaded via ?draft=true, where no diff modal is shown).
        let selectedKeys: Set<string> | undefined;

        // If not force loading, ask the user
        if (!forceLoad) {
          const currentValues = this._workspaceContext?.getValues() ?? [];
          const currentVariants = this._workspaceContext?.getVariants() ?? [];
          const currentContent = { values: currentValues as any, variants: currentVariants as any };

          // If the draft is identical to the current content there is nothing
          // to review — delete it quietly instead of showing the modal.
          const hasChanges = buildDiffRows(currentContent, data).some((row) => row.changed);
          if (!hasChanges) {
            await fetch(`/umbraco/drafts/api/v1/drafts/${this._nodeKey}`, {
              method: "DELETE",
              credentials: "include",
              headers,
            });
            window.dispatchEvent(new CustomEvent("drafts-updated"));
            return;
          }

          const result = await this._openDiffModal({
            savedAt: draft.savedAt,
            currentContent,
            draftContent: data,
          });

          // User dismissed the modal without choosing - leave draft intact
          if (result === undefined) return;

          if (result.action === "discard") {
            await fetch(`/umbraco/drafts/api/v1/drafts/${this._nodeKey}`, {
              method: "DELETE",
              credentials: "include",
              headers,
            });

            this._notificationContext?.peek("positive", {
              data: { headline: "Draft discarded", message: "" },
            });

            window.dispatchEvent(new CustomEvent("drafts-updated"));
            return;
          }

          selectedKeys = new Set(result.selectedKeys ?? []);
        }

        if (data.values) {
          for (const item of data.values) {
            if (
              selectedKeys &&
              !selectedKeys.has(buildValueKey(item.alias, item.culture ?? null, item.segment ?? null))
            )
              continue;
            const variantId = UmbVariantId.Create(item);
            await this._workspaceContext.setPropertyValue(item.alias, item.value, variantId);
          }
        }

        if (data.variants) {
          for (const variant of data.variants) {
            if (selectedKeys && !selectedKeys.has(buildVariantKey(variant.culture ?? null, variant.segment ?? null)))
              continue;
            const variantId = UmbVariantId.Create(variant);
            this._workspaceContext.setName(variant.name, variantId);
          }
        }

        this._lastSavedData = draft.contentData;
        this._lastSavedTime = new Date(draft.savedAt).toLocaleTimeString();
        this._status = "saved";

        // Remove the query param from URL if it was there
        if (forceLoad) {
          const url = new URL(window.location.href);
          url.searchParams.delete("draft");
          window.history.replaceState({}, "", url.toString());
        }
      }
    } catch (e) {
      console.error("Failed to load draft", e);
    }
  }

  /**
   * Resolves once the backoffice router has gone quiet: no router-slot
   * navigation events for `quietMs` in a row (capped at `maxWaitMs`).
   * Umbraco's modal manager force-closes every non-routable modal on each
   * `navigationsuccess` event, and the document workspace keeps navigating
   * (variant redirect, tab/view mounting) for a while after its data loads,
   * so a fixed delay before opening the modal is a race.
   */
  private _waitForRouterIdle(quietMs = 500, maxWaitMs = 10000): Promise<void> {
    return new Promise((resolve) => {
      const events = [
        "willchangestate",
        "changestate",
        "navigationstart",
        "navigationsuccess",
        "navigationcancel",
        "navigationend",
      ];
      let quietTimer = 0;
      const done = () => {
        events.forEach((e) => window.removeEventListener(e, onNavigation));
        clearTimeout(quietTimer);
        clearTimeout(maxTimer);
        resolve();
      };
      const onNavigation = () => {
        clearTimeout(quietTimer);
        quietTimer = window.setTimeout(done, quietMs);
      };
      const maxTimer = window.setTimeout(done, maxWaitMs);
      events.forEach((e) => window.addEventListener(e, onNavigation));
      quietTimer = window.setTimeout(done, quietMs);
    });
  }

  /**
   * Opens the diff modal once the router is idle. If a late navigation still
   * force-closes it (the sidebar blocks user-initiated navigation, so a
   * rejection paired with a navigationsuccess can only be an auto-close),
   * waits for the router to settle again and reopens it.
   * Returns undefined when the user dismissed the modal without choosing.
   */
  private async _openDiffModal(data: DraftDiffModalData): Promise<DraftDiffModalValue | undefined> {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this._waitForRouterIdle();
      if (!this.isConnected) return undefined;

      let closedByNavigation = false;
      const onNavigation = () => {
        closedByNavigation = true;
      };
      window.addEventListener("navigationsuccess", onNavigation);
      try {
        const handler = this._modalManagerContext?.open(this, DRAFT_DIFF_MODAL_TOKEN, { data });
        return await handler?.onSubmit();
      } catch {
        if (!closedByNavigation) return undefined; // Genuine user dismissal
        // The router auto-closed the modal — settle and reopen
      } finally {
        window.removeEventListener("navigationsuccess", onNavigation);
      }
    }
    return undefined;
  }

  private async _performAutoSave() {
    if (!this._workspaceContext || !this._nodeKey || !this._authContext) return;

    try {
      const token = await this._authContext?.getLatestToken();
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      // Get the current property values from the workspace context
      const values = this._workspaceContext.getValues();
      const variants = this._workspaceContext.getVariants();
      const currentData = JSON.stringify({ values, variants });

      // Only save if data has changed
      if (currentData === this._lastSavedData) {
        // If the data hasn't changed, let's check if the draft still exists on the server.
        // If it doesn't (returns 404), it means it was likely discarded by a server-side save event.
        if (this._status === "saved") {
          const checkResponse = await fetch(
            `/umbraco/drafts/api/v1/drafts/${this._nodeKey}`,
            {
              method: "GET",
              credentials: "include",
              headers: authHeaders,
            }
          );

          if (checkResponse.status === 404) {
            this._status = "idle";
            window.dispatchEvent(new CustomEvent("drafts-updated"));
          }
        }
        return;
      }

      this._status = "saving";
      const response = await fetch("/umbraco/drafts/api/v1/drafts", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          nodeKey: this._nodeKey,
          contentData: currentData,
        }),
      });

      if (response.ok) {
        this._lastSavedData = currentData;
        this._status = "saved";
        this._lastSavedTime = new Date().toLocaleTimeString();

        // Notify sidebar to refresh
        window.dispatchEvent(new CustomEvent("drafts-updated"));
      }
    } catch {
      this._status = "idle";
    }
  }

  render() {
    if (this._status === "idle") {
      return nothing;
    }

    if (this._status === "dirty") {
      return html`<span class="status dirty">Unsaved changes&hellip;</span>`;
    }

    if (this._status === "saving") {
      return html`<span class="status saving">Saving draft&hellip;</span>`;
    }

    return html`<span class="status saved">Draft saved at ${this._lastSavedTime}</span>`;
  }

  static styles = [
    css`
      :host {
        display: flex;
        align-items: center;
        padding: 0 var(--uui-size-4);
      }

      .status {
        font-size: 12px;
        opacity: 0.8;
      }

      .saving {
        color: var(--uui-color-warning);
      }

      .dirty {
        color: var(--uui-color-warning-standalone, #d97706);
      }

      .saved {
        color: var(--uui-color-positive);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "drafts-auto-save-action": DraftsAutoSaveElement;
  }
}
