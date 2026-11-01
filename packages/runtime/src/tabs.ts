import { WebComponent, type WebComponentEventHandler } from './component.js';

export interface WebTabChangeEventDetail {
  readonly index: number;
  readonly caption: string;
  /** Name of the component shown by this tab, or '' when the tab has none. */
  readonly panel: string;
  readonly previousIndex: number;
}

const SCOPE_SELECTOR = '[data-webrad-reusable-instance="true"], [data-webrad-page-id]';

/**
 * A tab strip that shows one named component (usually a Panel) per tab and
 * hides the others. Panels stay ordinary components in the page, so each one
 * keeps its own layout, styles and typed instance.
 */
export class WebTabs extends WebComponent<HTMLDivElement> {
  #captions: readonly string[] = [];
  #panels: readonly string[] = [];
  #selectedIndex = 0;
  #retryScheduled = false;

  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLDivElement)) {
      throw new TypeError('WebTabs requires a div element.');
    }
    super(element);
    element.setAttribute('role', 'tablist');
    element.addEventListener('keydown', (event) => this.#onKeyDown(event));
  }

  /** Tab captions, in order. */
  public get tabs(): readonly string[] {
    return this.#captions;
  }

  public set tabs(value: readonly string[]) {
    this.#captions = [...value];
    this.#render();
  }

  /** Name of the component each tab shows, by position; '' for none. */
  public get panels(): readonly string[] {
    return this.#panels;
  }

  public set panels(value: readonly string[]) {
    this.#panels = [...value];
    this.#apply();
  }

  public get selectedIndex(): number {
    return this.#captions.length === 0 ? -1 : this.#selectedIndex;
  }

  public set selectedIndex(value: number) {
    this.#select(value, false);
  }

  /** Caption of the selected tab, or ''. */
  public get selectedTab(): string {
    return this.#captions[this.selectedIndex] ?? '';
  }

  /** Selects a tab by caption or by the name of the component it shows. */
  public selectTab(captionOrPanel: string): boolean {
    const index = this.#captions.findIndex(
      (caption, position) =>
        caption === captionOrPanel || this.#panels[position] === captionOrPanel,
    );
    if (index < 0) return false;
    this.#select(index, false);
    return true;
  }

  public set onChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnChange', handler);
  }

  #buttons(): HTMLButtonElement[] {
    return [...this.element.querySelectorAll<HTMLButtonElement>(':scope > [role="tab"]')];
  }

  #select(index: number, fromUser: boolean): void {
    if (this.#captions.length === 0) return;
    const next = Math.min(
      Math.max(0, Math.trunc(Number.isFinite(index) ? index : 0)),
      this.#captions.length - 1,
    );
    const previousIndex = this.#selectedIndex;
    this.#selectedIndex = next;
    this.#apply();
    if (fromUser) this.#buttons()[next]?.focus();
    if (fromUser && next !== previousIndex) {
      this.emit('OnChange', {
        index: next,
        caption: this.#captions[next] ?? '',
        panel: this.#panels[next] ?? '',
        previousIndex,
      } satisfies WebTabChangeEventDetail);
    }
  }

  #render(): void {
    const document = this.element.ownerDocument;
    const buttons = this.#captions.map((caption, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'wr-tab';
      button.setAttribute('role', 'tab');
      button.textContent = caption;
      button.dataset.webradTabIndex = String(index);
      button.addEventListener('click', () => this.#select(index, true));
      return button;
    });
    this.element.replaceChildren(...buttons);
    this.#selectedIndex = Math.min(this.#selectedIndex, Math.max(0, this.#captions.length - 1));
    this.#apply();
  }

  /** The page or reusable placement whose components this strip controls. */
  #scope(): ParentNode {
    return this.element.closest(SCOPE_SELECTOR) ?? this.element.ownerDocument;
  }

  #panelElement(name: string): HTMLElement | null {
    if (name.length === 0) return null;
    const scope = this.#scope();
    for (const candidate of scope.querySelectorAll<HTMLElement>('[data-webrad-name]')) {
      if (candidate.dataset.webradName !== name || candidate === this.element) continue;
      const owner = candidate.parentElement?.closest(SCOPE_SELECTOR) ?? this.element.ownerDocument;
      if (owner === scope) return candidate;
    }
    return null;
  }

  #apply(): void {
    const selected = this.selectedIndex;
    let missing = false;
    this.#buttons().forEach((button, index) => {
      const active = index === selected;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      const panel = this.#panelElement(this.#panels[index] ?? '');
      if (panel === null) {
        button.removeAttribute('aria-controls');
        if ((this.#panels[index] ?? '').length > 0) missing = true;
        return;
      }
      if (panel.id.length === 0)
        panel.id = `wr-tabpanel-${panel.dataset.webradId ?? String(index)}`;
      button.id = button.id || `${panel.id}-tab`;
      button.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      new WebComponent(panel).visible = active;
    });
    // Panels after the strip in page order are created later in the same render.
    if (missing && !this.#retryScheduled) {
      this.#retryScheduled = true;
      queueMicrotask(() => {
        this.#retryScheduled = false;
        if (this.element.isConnected) this.#applyOnce();
      });
    }
  }

  #applyOnce(): void {
    this.#retryScheduled = true;
    this.#apply();
    this.#retryScheduled = false;
  }

  #onKeyDown(event: KeyboardEvent): void {
    const count = this.#captions.length;
    if (count === 0) return;
    const current = this.selectedIndex;
    const target =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (current + 1) % count
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (current - 1 + count) % count
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? count - 1
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    this.#select(target, true);
  }
}
