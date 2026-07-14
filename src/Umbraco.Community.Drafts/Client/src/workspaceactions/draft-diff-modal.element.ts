import {
  html,
  css,
  nothing,
  customElement,
  property,
  state,
  TemplateResult,
} from "@umbraco-cms/backoffice/external/lit";
import { UmbLitElement } from "@umbraco-cms/backoffice/lit-element";
import { UMB_AUTH_CONTEXT, type UmbAuthContext } from "@umbraco-cms/backoffice/auth";
import {
  buildDiffRows,
  extractImageRefs,
  isImageUrl,
  type DraftBlockRow,
  type DraftDiffRow,
  type ImageRef,
} from "./draft-diff.js";

type DiffToken = { text: string; type: "same" | "added" | "removed" };

type MediaItem = { url: string; name: string; isImage: boolean };

const MAX_DIFF_TOKENS = 400;

@customElement("drafts-diff-modal")
export class DraftsDiffModalElement extends UmbLitElement {
  @property({ attribute: false })
  modalContext: any;

  @state()
  private _mediaItems = new Map<string, MediaItem>();

  @state()
  private _hideUnchanged = false;

  @state()
  private _selectedKeys = new Set<string>();

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
      this.#loadMediaItems();
      this._hideUnchanged = false;
      // Default to all draft changes selected
      this._selectedKeys = new Set(this.#getSelectableKeys());
    }
  }

  #toggleHideUnchanged() {
    this._hideUnchanged = !this._hideUnchanged;
  }

  /** Keys the user can toggle: changed rows, or the individual blocks within them. */
  #getSelectableKeys(rows = this.#getDiff()): string[] {
    return rows.flatMap((row) => {
      if (!row.changed) return [];
      if (row.blocks)
        return row.blocks
          .filter((b) => b.status !== "unchanged")
          .map((b) => b.key);
      return [row.key];
    });
  }

  #toggleSelected(key: string, checked: boolean) {
    const next = new Set(this._selectedKeys);
    if (checked) next.add(key);
    else next.delete(key);
    this._selectedKeys = next;
  }

  #toggleBlockGroup(row: DraftDiffRow, checked: boolean) {
    const next = new Set(this._selectedKeys);
    for (const block of row.blocks ?? []) {
      if (block.status === "unchanged") continue;
      if (checked) next.add(block.key);
      else next.delete(block.key);
    }
    this._selectedKeys = next;
  }

  #selectAll() {
    this._selectedKeys = new Set(this.#getSelectableKeys());
  }

  #selectNone() {
    this._selectedKeys = new Set();
  }

  /**
   * Resolves media keys to URLs and names via the Management API — unlike the
   * Delivery API it's always available to a logged-in backoffice user.
   */
  async #loadMediaItems() {
    const current = this.modalContext?.data?.currentContent;
    const draft = this.modalContext?.data?.draftContent;
    const allValues = [
      ...(current?.values ?? []).map((v: any) => v.value),
      ...(draft?.values ?? []).map((v: any) => v.value),
    ];
    const keys = new Set<string>();
    for (const val of allValues) {
      for (const ref of extractImageRefs(val, true)) {
        if (ref.kind === "media") keys.add(ref.key);
      }
    }
    const missing = [...keys].filter((k) => !this._mediaItems.has(k));
    if (missing.length === 0) return;
    try {
      const token = await this.#authContext?.getLatestToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const query = missing.map((k) => `id=${encodeURIComponent(k)}`).join("&");
      const [urlsRes, itemsRes] = await Promise.all([
        fetch(`/umbraco/management/api/v1/media/urls?${query}`, { headers }),
        fetch(`/umbraco/management/api/v1/item/media?${query}`, { headers }),
      ]);
      const urls: Array<{ id: string; urlInfos: Array<{ url: string }> }> =
        urlsRes.ok ? await urlsRes.json() : [];
      const items: Array<{ id: string; variants: Array<{ name: string }> }> =
        itemsRes.ok ? await itemsRes.json() : [];
      const next = new Map(this._mediaItems);
      for (const key of missing) {
        const url = urls.find((u) => u.id === key)?.urlInfos[0]?.url ?? "";
        const name = items.find((i) => i.id === key)?.variants[0]?.name ?? "";
        if (!url && !name) continue; // unknown media — keep the GUID fallback
        next.set(key, { url, name, isImage: !!url && isImageUrl(url) });
      }
      this._mediaItems = next;
    } catch { /* ignore */ }
  }

  #renderImages(refs: ImageRef[]): TemplateResult | typeof nothing {
    if (refs.length === 0) return nothing;
    return html`<div class="media-preview">
      ${refs.map((ref) => {
        if (ref.kind === "url")
          return html`<img src="${ref.url}" alt="" class="media-thumb" loading="lazy" />`;
        const item = this._mediaItems.get(ref.key);
        if (!item) return html`<code class="media-key">${ref.key}</code>`;
        return item.isImage
          ? html`<img src="${item.url}" alt="${item.name}" title="${item.name}" class="media-thumb" loading="lazy" />`
          : html`<span class="media-name">${item.name || ref.key}</span>`;
      })}
    </div>`;
  }

  #handleLoad() {
    // Unchanged rows have nothing to choose between, so they're always applied;
    // changed rows (or individual blocks) are applied only if left checked.
    const selectedKeys = this.#getDiff().flatMap((row) => {
      if (!row.changed) return [row.key];
      if (row.blocks)
        return row.blocks
          .filter((b) => b.status !== "unchanged" && this._selectedKeys.has(b.key))
          .map((b) => b.key);
      return this._selectedKeys.has(row.key) ? [row.key] : [];
    });
    this.modalContext?.updateValue({ action: "load", selectedKeys });
    this.modalContext?.submit();
  }

  #handleDiscard() {
    this.modalContext?.updateValue({ action: "discard" });
    this.modalContext?.submit();
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
    return buildDiffRows(
      this.modalContext?.data?.currentContent,
      this.modalContext?.data?.draftContent
    );
  }

  #renderSimpleRow(row: DraftDiffRow): TemplateResult {
    const tokens = row.changed
      ? this.#computeInlineDiff(row.currentStr, row.draftStr)
      : null;
    const selected = !row.changed || this._selectedKeys.has(row.key);
    return html`
      <div class="diff-row ${row.changed ? "changed" : "unchanged"}">
        <div class="diff-col-select">
          ${row.changed
            ? html`<uui-checkbox
                aria-label=${`Apply change to ${row.alias}`}
                ?checked=${selected}
                @change=${(e: Event) =>
                  this.#toggleSelected(row.key, (e.target as HTMLInputElement).checked)}
              ></uui-checkbox>`
            : nothing}
        </div>
        <div class="diff-col-label">${row.alias}</div>
        <div class="diff-col diff-current">
          ${row.currentImages.length > 0
            ? this.#renderImages(row.currentImages)
            : tokens
              ? this.#renderCurrentSide(tokens)
              : html`<div class="diff-content">${row.currentStr}</div>`}
        </div>
        <div class="diff-col diff-draft">
          ${row.draftImages.length > 0
            ? this.#renderImages(row.draftImages)
            : tokens
              ? this.#renderDraftSide(tokens)
              : html`<div class="diff-content">${row.draftStr}</div>`}
        </div>
      </div>
    `;
  }

  #renderBlockSubRow(block: DraftBlockRow): TemplateResult {
    const selectable = block.status !== "unchanged";
    const selected = this._selectedKeys.has(block.key);
    const tokens =
      block.status === "changed"
        ? this.#computeInlineDiff(block.currentStr, block.draftStr)
        : null;
    const currentCell =
      block.status === "added"
        ? html`<div class="diff-content block-absent">Not present</div>`
        : tokens
          ? this.#renderCurrentSide(tokens)
          : html`<div class="diff-content">${block.currentStr}</div>`;
    const draftCell =
      block.status === "removed"
        ? html`<div class="diff-content block-absent">Removed</div>`
        : tokens
          ? this.#renderDraftSide(tokens)
          : html`<div class="diff-content">${block.draftStr}</div>`;
    return html`
      <div class="diff-row block-row ${selectable ? "changed" : "unchanged"}">
        <div class="diff-col-select">
          ${selectable
            ? html`<uui-checkbox
                aria-label=${`Apply change to ${block.label}`}
                ?checked=${selected}
                @change=${(e: Event) =>
                  this.#toggleSelected(block.key, (e.target as HTMLInputElement).checked)}
              ></uui-checkbox>`
            : nothing}
        </div>
        <div class="diff-col-label block-label">
          ${block.label}
          ${block.status !== "unchanged"
            ? html`<span class="block-status ${block.status}">${block.status}</span>`
            : nothing}
        </div>
        <div class="diff-col diff-current">
          ${currentCell}${this.#renderImages(block.currentImages)}
        </div>
        <div class="diff-col diff-draft">
          ${draftCell}${this.#renderImages(block.draftImages)}
        </div>
      </div>
    `;
  }

  #renderBlockRow(row: DraftDiffRow): TemplateResult {
    const blocks = row.blocks ?? [];
    const changedBlocks = blocks.filter((b) => b.status !== "unchanged");
    const selectedCount = changedBlocks.filter((b) => this._selectedKeys.has(b.key)).length;
    const visibleBlocks = this._hideUnchanged ? changedBlocks : blocks;
    const countText = (count: number) => `${count} block${count === 1 ? "" : "s"}`;
    const currentCount = blocks.filter((b) => !b.isOrder && b.status !== "added").length;
    const draftCount = blocks.filter((b) => !b.isOrder && b.status !== "removed").length;
    return html`
      <div class="diff-row changed block-parent">
        <div class="diff-col-select">
          <uui-checkbox
            aria-label=${`Apply all block changes to ${row.alias}`}
            ?checked=${selectedCount === changedBlocks.length}
            @change=${(e: Event) =>
              this.#toggleBlockGroup(row, (e.target as HTMLInputElement).checked)}
          ></uui-checkbox>
        </div>
        <div class="diff-col-label">
          ${row.alias}
          <span class="block-group-count">${selectedCount} of ${changedBlocks.length} selected</span>
        </div>
        <div class="diff-col block-summary">${countText(currentCount)}</div>
        <div class="diff-col block-summary">${countText(draftCount)}</div>
      </div>
      ${visibleBlocks.map((block) => this.#renderBlockSubRow(block))}
    `;
  }

  render() {
    const rawSavedAt: string = this.modalContext?.data?.savedAt ?? "";
    const savedAt = rawSavedAt ? new Date(rawSavedAt).toLocaleString() : '';
    const rows = this.#getDiff();
    const selectableKeys = this.#getSelectableKeys(rows);
    const hasChanges = selectableKeys.length > 0;
    const visibleRows = this._hideUnchanged ? rows.filter((r) => r.changed) : rows;
    const selectedCount = selectableKeys.filter((k) => this._selectedKeys.has(k)).length;
    const loadButtonLabel =
      hasChanges && selectedCount < selectableKeys.length
        ? `Load selected draft change${selectedCount > 1 ? "s" : ""} (${selectedCount})`
        : "Load draft";

    return html`
      <umb-body-layout headline="Unsaved draft found">
        <p>
          A draft was saved on <strong>${savedAt}</strong>. Review the changes
          below, choose which ones to apply, then load or discard the draft.
        </p>

        ${!hasChanges
          ? html`<p class="no-changes">No differences detected between the draft and current content.</p>`
          : html`<div class="diff-toolbar">
              <div class="diff-toolbar-group">
                <span class="diff-selection-count">${selectedCount} of ${selectableKeys.length} changes selected</span>
                <uui-button look="primary" compact @click=${this.#selectAll} label="Select all">
                  Select all
                </uui-button>
                <uui-button look="secondary" compact @click=${this.#selectNone} label="Select none">
                  Select none
                </uui-button>
              </div>
              <div class="diff-toolbar-group">
                <uui-button
                  look="secondary"
                  compact
                  @click=${this.#toggleHideUnchanged}
                  label=${this._hideUnchanged ? "Show unchanged fields" : "Hide unchanged fields"}
                >
                  ${this._hideUnchanged ? "Show unchanged fields" : "Hide unchanged fields"}
                </uui-button>
              </div>
            </div>`}

        <div class="diff-table">
          <div class="diff-header">
            <div class="diff-col-select"></div>
            <div class="diff-col-label"></div>
            <div class="diff-col">Current content</div>
            <div class="diff-col">
              Draft
              <span class="diff-col-date">${savedAt}</span>
            </div>
          </div>
          ${visibleRows.map((row) =>
            row.blocks ? this.#renderBlockRow(row) : this.#renderSimpleRow(row)
          )}
        </div>

        <div slot="actions">
          <uui-button
            @click=${this.#handleDiscard}
            look="secondary"
            label="Discard draft"
          >
            Discard draft
          </uui-button>
          ${hasChanges && selectedCount === 0
            ? nothing
            : html`<uui-button
                @click=${this.#handleLoad}
                look="primary"
                color="positive"
                label=${loadButtonLabel}
              >
                ${loadButtonLabel}
              </uui-button>`}
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
        align-items: center;
        justify-content: space-between;
        gap: var(--uui-size-3);
        margin-bottom: var(--uui-size-3);
      }

      .diff-toolbar-group {
        display: flex;
        align-items: center;
        gap: var(--uui-size-3);
      }

      .diff-selection-count {
        font-size: 12px;
        color: var(--uui-color-text-alt);
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
        grid-template-columns: 36px 140px 1fr 1fr;
        gap: 1px;
        background: var(--uui-color-divider);
      }

      .diff-col-select {
        background: var(--uui-color-surface-alt);
        padding: var(--uui-size-3) 0;
        display: flex;
        align-items: flex-start;
        justify-content: center;
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

      .block-parent .diff-col-label {
        flex-direction: column;
        gap: 2px;
      }

      .block-group-count {
        font-weight: 400;
        font-size: 11px;
        color: var(--uui-color-text-alt);
      }

      .block-summary {
        font-size: 12px;
        color: var(--uui-color-text-alt);
      }

      .block-row .diff-col-label {
        padding-left: calc(var(--uui-size-4) + 14px);
        font-weight: 500;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 3px;
      }

      .block-status {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-radius: 3px;
        padding: 1px 5px;
      }

      .block-status.added {
        background: #c6f6c6;
        color: #145214;
      }

      .block-status.removed {
        background: #fcd6d6;
        color: #7a1a1a;
      }

      .block-status.changed {
        background: #fdf0c2;
        color: #7a5b00;
      }

      .block-absent {
        color: var(--uui-color-text-alt);
        font-style: italic;
      }

      .media-preview {
        display: flex;
        flex-wrap: wrap;
        gap: var(--uui-size-2);
        margin-top: var(--uui-size-2);
      }

      .media-preview:first-child {
        margin-top: 0;
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

      .media-name {
        font-size: 12px;
      }
    `,
  ];
}

export default DraftsDiffModalElement;
