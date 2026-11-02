import { WebComponent, type WebComponentEventHandler } from './component.js';

export interface WebTabChangeEventDetail {
  readonly index: number;
  readonly caption: string;
  /** Name of the component shown by this tab, or '' when the tab has none. */
  readonly panel: string;
  readonly previousIndex: number;
}

const SCOPE_SELECTOR = '[data-webrad-reusable-instance="true"], [data-webrad-page-id]';

interface TabsState {
  captions: readonly string[];
  panels: readonly string[];
  selectedIndex: number;
  retryScheduled: boolean;
}

/**
 * State lives with the element, so the instance created by the renderer and the
 * one a page creates for its code drive the same strip.
 */
const tabsStates = new WeakMap<HTMLElement, TabsState>();

/**
 * A tab strip that shows one named component (usually a Panel) per tab and
 * hides the others. Panels stay ordinary components in the page, so each one
 * keeps its own layout, styles and typed instance.
 */
export class WebTabs extends WebComponent<HTMLDivElement> {
  readonly #state: TabsState;

  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLDivElement)) {
      throw new TypeError('WebTabs requires a div element.');
    }
    super(element);
    const existing = tabsStates.get(element);
    if (existing !== undefined) {
      this.#state = existing;
      return;
    }
    this.#state = { captions: [], panels: [], selectedIndex: 0, retryScheduled: false };
    tabsStates.set(element, this.#state);
    element.setAttribute('role', 'tablist');
    element.addEventListener('keydown', (event) => this.#onKeyDown(event));
  }

  /** Tab captions, in order. */
  public get tabs(): readonly string[] {
    return this.#state.captions;
  }

  public set tabs(value: readonly string[]) {
    this.#state.captions = [...value];
    this.#render();
  }

  /** Name of the component each tab shows, by position; '' for none. */
  public get panels(): readonly string[] {
    return this.#state.panels;
  }

  public set panels(value: readonly string[]) {
    this.#state.panels = [...value];
    this.#apply();
  }

  public get selectedIndex(): number {
    return this.#state.captions.length === 0 ? -1 : this.#state.selectedIndex;
  }

  public set selectedIndex(value: number) {
    this.#select(value, false);
  }

  /** Caption of the selected tab, or ''. */
  public get selectedTab(): string {
    return this.#state.captions[this.selectedIndex] ?? '';
  }

  /** Selects a tab by caption or by the name of the component it shows. */
  public selectTab(captionOrPanel: string): boolean {
    const index = this.#state.captions.findIndex(
      (caption, position) =>
        caption === captionOrPanel || this.#state.panels[position] === captionOrPanel,
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
    if (this.#state.captions.length === 0) return;
    const next = Math.min(
      Math.max(0, Math.trunc(Number.isFinite(index) ? index : 0)),
      this.#state.captions.length - 1,
    );
    const previousIndex = this.#state.selectedIndex;
    this.#state.selectedIndex = next;
    this.#apply();
    if (fromUser) this.#buttons()[next]?.focus();
    if (fromUser && next !== previousIndex) {
      this.emit('OnChange', {
        index: next,
        caption: this.#state.captions[next] ?? '',
        panel: this.#state.panels[next] ?? '',
        previousIndex,
      } satisfies WebTabChangeEventDetail);
    }
  }

  #render(): void {
    const document = this.element.ownerDocument;
    const buttons = this.#state.captions.map((caption, index) => {
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
    this.#state.selectedIndex = Math.min(
      this.#state.selectedIndex,
      Math.max(0, this.#state.captions.length - 1),
    );
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
      const panel = this.#panelElement(this.#state.panels[index] ?? '');
      if (panel === null) {
        button.removeAttribute('aria-controls');
        if ((this.#state.panels[index] ?? '').length > 0) missing = true;
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
    if (missing && !this.#state.retryScheduled) {
      this.#state.retryScheduled = true;
      queueMicrotask(() => {
        this.#state.retryScheduled = false;
        if (this.element.isConnected) this.#applyOnce();
      });
    }
  }

  #applyOnce(): void {
    this.#state.retryScheduled = true;
    this.#apply();
    this.#state.retryScheduled = false;
  }

  #onKeyDown(event: KeyboardEvent): void {
    const count = this.#state.captions.length;
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
