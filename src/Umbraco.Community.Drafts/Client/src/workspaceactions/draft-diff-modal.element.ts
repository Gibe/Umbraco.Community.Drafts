import {
  html,
  css,
  customElement,
  property,
  state,
  TemplateResult,
} from "@umbraco-cms/backoffice/external/lit";
import { UmbLitElement } from "@umbraco-cms/backoffice/lit-element";
import { UMB_AUTH_CONTEXT, type UmbAuthContext } from "@umbraco-cms/backoffice/auth";
import type { DraftDiffModalData } from "./draft-diff-modal.token.js";

type DiffToken = { text: string; type: "same" | "added" | "removed" };

const MAX_DIFF_TOKENS = 400;

@customElement("drafts-diff-modal")
export class DraftsDiffModalElement extends UmbLitElement {
  @property({ attribute: false })
  modalContext: any;

  @state()
  private _mediaUrls = new Map<string, string>();

  @state()
  private _hideUnchanged = false;

  #authContext: UmbAuthContext | undefined;

  constructor() {
    super();
    this.consumeContext(UMB_AUTH_CONTEXT, (ctx) => {
      this.#authContext = ctx;
    });
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('modalContext')) {
      this.#loadMediaUrls();
      this._hideUnchanged = false;
    }
  }

  #toggleHideUnchanged() {
    this._hideUnchanged = !this._hideUnchanged;
  }

  #extractMediaKeys(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap((v) => this.#extractMediaKeys(v));
    if (typeof value === 'object' && value !== null) {
      const key = (value as any).mediaKey;
      if (typeof key === 'string') return [key];
    }
    return [];
  }

  async #loadMediaUrls() {
    const current = this.modalContext?.data?.currentContent;
    const draft = this.modalContext?.data?.draftContent;
    const allValues = [
      ...(current?.values ?? []).map((v: any) => v.value),
      ...(draft?.values ?? []).map((v: any) => v.value),
    ];
    const keys = new Set<string>();
    for (const val of allValues) {
      for (const key of this.#extractMediaKeys(val)) keys.add(key);
    }
    await Promise.all(
      [...keys].filter((k) => !this._mediaUrls.has(k)).map(async (key) => {
        try {
          const token = await this.#authContext?.getLatestToken();
          const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await fetch(`/umbraco/delivery/api/v2/media/item/${encodeURIComponent(key)}`, { headers });
          if (res.ok) {
            const data = await res.json();
            if (data?.url) this._mediaUrls = new Map(this._mediaUrls).set(key, data.url);
          }
        } catch { /* ignore */ }
      })
    );
  }

  #renderMediaImages(keys: string[]): TemplateResult {
    return html`<div class="diff-content media-preview">
      ${keys.map((key) => {
        const url = this._mediaUrls.get(key);
        return url
          ? html`<img src="${url}" alt="" class="media-thumb" />`
          : html`<code class="media-key">${key}</code>`;
      })}
    </div>`;
  }

  #handleLoad() {
    this.modalContext?.updateValue({ action: "load" });
    this.modalContext?.submit();
  }

  #handleDiscard() {
    this.modalContext?.updateValue({ action: "discard" });
    this.modalContext?.submit();
  }

  /** Converts a property alias to a human-friendly label */
  #formatAlias(alias: string): string {
    return alias
      .replace(/[-_]/g, ' ')                      // kebab-case / snake_case → spaces
      .replace(/([a-z])([A-Z])/g, '$1 $2')        // camelCase → words
      .replace(/\b\w/g, (c) => c.toUpperCase())   // title-case each word
      .trim();
  }

  /** Converts a raw property value to a human-readable string */
  #formatValueFriendly(value: unknown): string {
    if (value === null || value === undefined) return "(empty)";

    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return String(value);

    if (typeof value === "string") {
      if (!value) return "(empty)";
      // Strip HTML tags (e.g. simple richtext stored as string)
      const stripped = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      return stripped || "(empty)";
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return "(empty)";
      // Media picker array
      if (value[0]?.mediaKey !== undefined)
        return value.map((v: any) => v.mediaKey ?? "(unknown)").join("\n");
      // Content picker array
      if (value[0]?.contentKey !== undefined)
        return value.map((v: any) => v.contentKey ?? "(unknown)").join("\n");
      // Generic – recurse per item
      return value.map((v) => this.#formatValueFriendly(v)).join("\n");
    }

    if (typeof value === "object" && value !== null) {
      const obj = value as Record<string, unknown>;

      // Richtext stored as object with markup field
      if (typeof obj["markup"] === "string") {
        const stripped = obj["markup"].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        return stripped || "(empty)";
      }
      // Block editor (contentData array) — format each block's inner property
      // values so edits inside a block (not just adding/removing blocks) are detected
      if (Array.isArray(obj["contentData"])) {
        const contentData = obj["contentData"] as Record<string, unknown>[];
        const settingsData = Array.isArray(obj["settingsData"])
          ? (obj["settingsData"] as Record<string, unknown>[])
          : [];
        if (contentData.length === 0) return "(empty)";

        const formatBlockItem = (item: Record<string, unknown>): string => {
          const props = Object.entries(item)
            .filter(([k]) => k !== "key" && k !== "contentTypeKey" && k !== "udi")
            .map(([k, v]) => `${this.#formatAlias(k)}: ${this.#formatValueFriendly(v)}`);
          return props.length ? props.join("; ") : "(no properties)";
        };

        const blocks = contentData.map(
          (item, i) => `Block ${i + 1}: ${formatBlockItem(item)}`
        );
        if (settingsData.length > 0) {
          blocks.push(
            ...settingsData.map(
              (item, i) => `Settings ${i + 1}: ${formatBlockItem(item)}`
            )
          );
        }
        return blocks.join("\n");
      }
      // Single media / content picker
      if (typeof obj["mediaKey"] === "string") return obj["mediaKey"];
      if (typeof obj["contentKey"] === "string") return obj["contentKey"];
      // Fallback: compact JSON
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  }

  /** Word-level LCS diff. Falls back to whole-string if too large. */
  #computeInlineDiff(oldStr: string, newStr: string): DiffToken[] {
    const tokenize = (s: string): string[] => s.match(/[^\s]+|\s+/g) ?? [];
    const oldToks = tokenize(oldStr);
    const newToks = tokenize(newStr);

    // Guard against O(m*n) blowup on large content
    if (oldToks.length + newToks.length > MAX_DIFF_TOKENS) {
      const result: DiffToken[] = [];
      if (oldStr !== newStr) {
        result.push({ text: oldStr, type: "removed" });
        result.push({ text: newStr, type: "added" });
      } else {
        result.push({ text: oldStr, type: "same" });
      }
      return result;
    }

    const m = oldToks.length;
    const n = newToks.length;
    // Build LCS table
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      new Array(n + 1).fill(0)
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] =
          oldToks[i - 1] === newToks[j - 1]
            ? dp[i - 1][j - 1] + 1
            : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    // Backtrack
    const tokens: DiffToken[] = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldToks[i - 1] === newToks[j - 1]) {
        tokens.unshift({ text: oldToks[i - 1], type: "same" });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        tokens.unshift({ text: newToks[j - 1], type: "added" });
        j--;
      } else {
        tokens.unshift({ text: oldToks[i - 1], type: "removed" });
        i--;
      }
    }
    return tokens;
  }

  /** Renders the left (current) side: same + removed tokens visible, added hidden */
  #renderCurrentSide(tokens: DiffToken[]): TemplateResult {
    return html`<div class="diff-content">${tokens
      .filter((t) => t.type !== "added")
      .map((t) =>
        t.type === "removed"
          ? html`<mark class="removed">${t.text}</mark>`
          : t.text
      )}</div>`;
  }

  /** Renders the right (draft) side: same + added tokens visible, removed hidden */
  #renderDraftSide(tokens: DiffToken[]): TemplateResult {
    return html`<div class="diff-content">${tokens
      .filter((t) => t.type !== "removed")
      .map((t) =>
        t.type === "added"
          ? html`<mark class="added">${t.text}</mark>`
          : t.text
      )}</div>`;
  }

  #getDiff() {
    const current: DraftDiffModalData["currentContent"] =
      this.modalContext?.data?.currentContent;
    const draft: DraftDiffModalData["draftContent"] =
      this.modalContext?.data?.draftContent;

    const variantRows = (current?.variants ?? []).map((cv, i) => {
      const dv = draft?.variants?.[i];
      const currentStr = cv.name || "(empty)";
      const draftStr = dv?.name || "(empty)";
      const changed = currentStr !== draftStr;
      return { alias: "Name", currentStr, draftStr, changed, currentMediaKeys: [] as string[], draftMediaKeys: [] as string[] };
    });

    const allAliases = new Set([
      ...(current?.values ?? []).map((v) => v.alias),
      ...(draft?.values ?? []).map((v) => v.alias),
    ]);

    const propertyRows = Array.from(allAliases).map((alias) => {
      const currentVal = current?.values?.find((v) => v.alias === alias);
      const draftVal = draft?.values?.find((v) => v.alias === alias);
      const currentStr = this.#formatValueFriendly(currentVal?.value);
      const draftStr = this.#formatValueFriendly(draftVal?.value);
      const changed = currentStr !== draftStr;
      return {
        alias: this.#formatAlias(alias),
        currentStr,
        draftStr,
        changed,
        currentMediaKeys: this.#extractMediaKeys(currentVal?.value),
        draftMediaKeys: this.#extractMediaKeys(draftVal?.value),
      };
    });

    return [...variantRows, ...propertyRows];
  }

  render() {
    const rawSavedAt: string = this.modalContext?.data?.savedAt ?? "";
    const savedAt = rawSavedAt ? new Date(rawSavedAt).toLocaleString() : '';
    const rows = this.#getDiff();
    const hasChanges = rows.some((r) => r.changed);
    const visibleRows = this._hideUnchanged ? rows.filter((r) => r.changed) : rows;

    return html`
      <umb-body-layout headline="Unsaved draft found">
        <p>
          A draft was saved on <strong>${savedAt}</strong>. Review the changes
          below, then choose to load or discard it.
        </p>

        ${!hasChanges
          ? html`<p class="no-changes">No differences detected between the draft and current content.</p>`
          : html`<div class="diff-toolbar">
              <uui-button
                look="secondary"
                compact
                @click=${this.#toggleHideUnchanged}
                label=${this._hideUnchanged ? "Show unchanged fields" : "Hide unchanged fields"}
              >
                ${this._hideUnchanged ? "Show unchanged fields" : "Hide unchanged fields"}
              </uui-button>
            </div>`}

        <div class="diff-table">
          <div class="diff-header">
            <div class="diff-col-label"></div>
            <div class="diff-col">Current content</div>
            <div class="diff-col">
              Draft
              <span class="diff-col-date">${savedAt}</span>
            </div>
          </div>
          ${visibleRows.map((row) => {
            const tokens = row.changed
              ? this.#computeInlineDiff(row.currentStr, row.draftStr)
              : null;
            return html`
              <div class="diff-row ${row.changed ? "changed" : "unchanged"}">
                <div class="diff-col-label">${row.alias}</div>
                <div class="diff-col diff-current">
                  ${row.currentMediaKeys.length > 0
                    ? this.#renderMediaImages(row.currentMediaKeys)
                    : tokens
                      ? this.#renderCurrentSide(tokens)
                      : html`<div class="diff-content">${row.currentStr}</div>`}
                </div>
                <div class="diff-col diff-draft">
                  ${row.draftMediaKeys.length > 0
                    ? this.#renderMediaImages(row.draftMediaKeys)
                    : tokens
                      ? this.#renderDraftSide(tokens)
                      : html`<div class="diff-content">${row.draftStr}</div>`}
                </div>
              </div>
            `;
          })}
        </div>

        <div slot="actions">
          <uui-button
            @click=${this.#handleDiscard}
            look="secondary"
            label="Discard draft"
          >
            Discard draft
          </uui-button>
          <uui-button
            @click=${this.#handleLoad}
            look="primary"
            color="positive"
            label="Load draft"
          >
            Load draft
          </uui-button>
        </div>
      </umb-body-layout>
    `;
  }

  static styles = [
    css`
      p {
        margin: 0 0 var(--uui-size-4);
      }

      .no-changes {
        color: var(--uui-color-text-alt);
        font-style: italic;
      }

      .diff-toolbar {
        display: flex;
        justify-content: flex-end;
        margin-bottom: var(--uui-size-3);
      }

      .diff-table {
        display: flex;
        flex-direction: column;
        gap: 1px;
        background: var(--uui-color-divider);
        border: 1px solid var(--uui-color-divider);
        border-radius: var(--uui-border-radius);
        overflow: hidden;
        margin-top: var(--uui-size-4);
      }

      .diff-header,
      .diff-row {
        display: grid;
        grid-template-columns: 140px 1fr 1fr;
        gap: 1px;
        background: var(--uui-color-divider);
      }

      .diff-header > div {
        background: var(--uui-color-surface-alt);
        padding: var(--uui-size-3) var(--uui-size-4);
        font-weight: 700;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--uui-color-text-alt);
      }

      .diff-col-date {
        display: block;
        font-weight: 400;
        text-transform: none;
        letter-spacing: 0;
        font-size: 11px;
        opacity: 0.8;
      }

      .diff-col-label {
        background: var(--uui-color-surface-alt);
        padding: var(--uui-size-3) var(--uui-size-4);
        font-weight: 600;
        font-size: 12px;
        color: var(--uui-color-text-alt);
        display: flex;
        align-items: flex-start;
        word-break: break-word;
      }

      .diff-col {
        background: var(--uui-color-surface);
        padding: var(--uui-size-3) var(--uui-size-4);
        overflow: hidden;
      }

      .diff-content {
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 200px;
        overflow-y: auto;
        color: var(--uui-color-text);
      }

      mark.added {
        background: #c6f6c6;
        color: #145214;
        border-radius: 2px;
        padding: 0 1px;
      }

      mark.removed {
        background: #fcd6d6;
        color: #7a1a1a;
        text-decoration: line-through;
        border-radius: 2px;
        padding: 0 1px;
      }

      .unchanged .diff-col,
      .unchanged .diff-col-label {
        opacity: 0.5;
      }

      .media-preview {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-2);
      }

      .media-thumb {
        max-width: 120px;
        max-height: 90px;
        display: block;
        border-radius: 4px;
        object-fit: contain;
        border: 1px solid var(--uui-color-divider);
      }

      .media-key {
        font-size: 11px;
        opacity: 0.7;
        word-break: break-all;
      }
    `,
  ];
}

export default DraftsDiffModalElement;
