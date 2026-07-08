import { css, html, customElement, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import './drafts-list.element.js';

@customElement('drafts-sidebar-item')
export default class DraftsSidebarItemElement extends UmbLitElement {
  @state() private _isOpen = false;
  @state() private _draftCount = 0;

  private _onCountChanged(e: CustomEvent<number>) {
    this._draftCount = e.detail;
  }

  private _navigateToDraftsOverview() {
    window.history.pushState({}, '', '/umbraco/section/content/workspace/drafts');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  render() {
    return html`
      <uui-menu-item
        ?has-children=${this._draftCount > 0}
        ?show-children=${this._isOpen}
        @show-children=${() => { this._isOpen = true; }}
        @hide-children=${() => { this._isOpen = false; }}
        @click-label=${this._navigateToDraftsOverview}
        label="Drafts"
      >
        <uui-icon slot="icon" name="icon-documents"></uui-icon>
        <span slot="label" class="label-slot">
          Drafts
          ${this._draftCount > 0
            ? html`<span class="count-badge">${this._draftCount}</span>`
            : ''}
        </span>
        <drafts-list @draft-count-changed=${this._onCountChanged}></drafts-list>
      </uui-menu-item>
    `;
  }

  static override styles = css`
    :host {
      display: block;
    }

    .label-slot {
      display: flex;
      align-items: center;
      gap: var(--uui-size-3, 6px);
    }

    .count-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: var(--uui-color-default, #1b264f);
      color: var(--uui-color-default-contrast, #fff);
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
    }
  `;
}
