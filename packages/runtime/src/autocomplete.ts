import { WebComponent, type WebComponentEventHandler } from './component.js';
import type { WebApiClient } from './api-client.js';
import { comboBoxItemText } from './combo-box-data.js';

/** One suggestion: `value` is sent to code and APIs, `label` is shown and typed. */
export interface WebAutocompleteItem {
  readonly value: string;
  readonly label: string;
  /** Optional second line, such as a CPF or a department. */
  readonly detail?: string;
  /** The original record, for code that needs more fields. */
  readonly data?: unknown;
}

export type WebAutocompleteSourceResult = readonly (string | WebAutocompleteItem)[];

/** Returns the suggestions for a search term; may be async. */
export type WebAutocompleteSource = (
  term: string,
) => WebAutocompleteSourceResult | Promise<WebAutocompleteSourceResult>;

export interface WebAutocompleteOperationOptions {
  /** JSON pointer or schema node id of the list inside the response; '' for the root. */
  readonly listPath?: string;
  /** JSON pointer of the caption inside each row; '' uses the row itself. */
  readonly displayField?: string;
  /** JSON pointer of the value inside each row; '' uses the caption. */
  readonly keyField?: string;
  /** JSON pointer of an optional second line inside each row. */
  readonly detailField?: string;
  /** Query parameter that receives the typed term (HexAPI and RestGO use `q`). */
  readonly searchParameter?: string;
  /** Query parameter that limits the result size; '' sends none. */
  readonly limitParameter?: string;
}

export interface WebAutocompleteSearchEventDetail {
  readonly term: string;
}

export interface WebAutocompleteSelectEventDetail {
  readonly item: WebAutocompleteItem | null;
  readonly value: string;
  readonly label: string;
}

const LABELS = {
  pt: {
    empty: 'Nenhum resultado',
    loading: 'Buscando…',
    error: 'Falha na busca',
    required: 'Selecione um item da lista.',
  },
  en: {
    empty: 'No results',
    loading: 'Searching…',
    error: 'Search failed',
    required: 'Select an item from the list.',
  },
} as const;

function labels(document: Document): (typeof LABELS)['pt' | 'en'] {
  const language =
    document.documentElement.lang || document.defaultView?.navigator.language || 'en';
  return language.toLowerCase().startsWith('pt') ? LABELS.pt : LABELS.en;
}

/** Case- and accent-insensitive text used to match suggestions. */
export function normalizeAutocompleteText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase()
    .trim();
}

export function normalizeAutocompleteItems(
  items: WebAutocompleteSourceResult,
): readonly WebAutocompleteItem[] {
  return items.map((item) => (typeof item === 'string' ? { value: item, label: item } : item));
}

/** Keeps the items whose caption or detail contains every typed word. */
export function filterAutocompleteItems(
  items: readonly WebAutocompleteItem[],
  term: string,
  limit: number,
): readonly WebAutocompleteItem[] {
  const words = normalizeAutocompleteText(term).split(/\s+/u).filter(Boolean);
  const matches = items.filter((item) => {
    const text = normalizeAutocompleteText(`${item.label} ${item.detail ?? ''}`);
    return words.every((word) => text.includes(word));
  });
  return limit > 0 ? matches.slice(0, limit) : matches;
}

let autocompleteSequence = 0;

/**
 * A text box that suggests items while the user types. Suggestions come from
 * the static `items`, from a `source` function or from an API operation bound
 * with `bindOperation`, so lookups such as people or cities can search a
 * server without loading the whole table.
 */
export class WebAutocomplete extends WebComponent<HTMLDivElement> {
  readonly #input: HTMLInputElement;
  readonly #list: HTMLUListElement;
  readonly #status: HTMLDivElement;
  #items: readonly WebAutocompleteItem[] = [];
  #source: WebAutocompleteSource | null = null;
  #suggestions: readonly WebAutocompleteItem[] = [];
  #selected: WebAutocompleteItem | null = null;
  #activeIndex = -1;
  #minChars = 2;
  #debounceMs = 300;
  #maxResults = 20;
  #requireSelection = true;
  #noResultsText = '';
  #timer: ReturnType<typeof setTimeout> | null = null;
  #request = 0;
  #lastTerm: string | null = null;

  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLDivElement)) {
      throw new TypeError('WebAutocomplete requires a div element.');
    }
    super(element);
    autocompleteSequence += 1;
    const document = element.ownerDocument;
    const listId = `wr-autocomplete-${element.dataset.webradId ?? 'list'}-${String(autocompleteSequence)}`;
    this.#input =
      element.querySelector<HTMLInputElement>(':scope > input') ?? document.createElement('input');
    this.#input.type = 'text';
    this.#input.className = 'wr-autocomplete-input';
    this.#input.autocomplete = 'off';
    this.#input.setAttribute('role', 'combobox');
    this.#input.setAttribute('aria-autocomplete', 'list');
    this.#input.setAttribute('aria-expanded', 'false');
    this.#input.setAttribute('aria-controls', listId);
    this.#list = document.createElement('ul');
    this.#list.className = 'wr-autocomplete-list';
    this.#list.id = listId;
    this.#list.setAttribute('role', 'listbox');
    this.#list.hidden = true;
    this.#status = document.createElement('div');
    this.#status.className = 'wr-autocomplete-status';
    this.#status.setAttribute('aria-live', 'polite');
    this.#status.hidden = true;
    element.replaceChildren(this.#input, this.#list, this.#status);

    // Native input events would otherwise bubble into OnChange/OnSelect.
    for (const type of ['change', 'select', 'input', 'search']) {
      this.#input.addEventListener(type, (event) => event.stopPropagation());
    }
    this.#input.addEventListener('input', () => this.#onInput());
    this.#input.addEventListener('keydown', (event) => this.#onKeyDown(event));
    this.#input.addEventListener('blur', () => this.#onBlur());
    this.#input.addEventListener('focus', () => {
      if (this.#minChars === 0 && this.#input.value.length === 0) this.#schedule(0);
    });
    // mousedown keeps focus in the input so blur does not close the list first.
    this.#list.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const option = (event.target as Element | null)?.closest<HTMLElement>('[role="option"]');
      const index = Number(option?.dataset.webradIndex ?? -1);
      if (index >= 0) this.#choose(index);
    });
  }

  /** The inner text box, for focus and custom attributes. */
  public get input(): HTMLInputElement {
    return this.#input;
  }

  /** Static suggestions filtered in the browser when no `source` is set. */
  public get items(): readonly WebAutocompleteItem[] {
    return this.#items;
  }

  public set items(value: WebAutocompleteSourceResult) {
    this.#items = normalizeAutocompleteItems(value);
    this.#lastTerm = null;
  }

  /** Function that returns suggestions for a term; replaces `items` while set. */
  public get source(): WebAutocompleteSource | null {
    return this.#source;
  }

  public set source(value: WebAutocompleteSource | null) {
    this.#source = value;
    this.#lastTerm = null;
  }

  /**
   * Searches through a configured API operation: the typed term goes in the
   * query parameter `searchParameter` (default `q`) and the rows come from
   * `listPath`. The client keeps its authentication and error events.
   */
  public bindOperation(
    apiClient: WebApiClient,
    operationName: string,
    options: WebAutocompleteOperationOptions = {},
  ): void {
    const searchParameter = options.searchParameter ?? 'q';
    const limitParameter = options.limitParameter ?? 'page_size';
    this.source = async (term) => {
      const query: Record<string, string | number> = { [searchParameter]: term };
      if (limitParameter.length > 0 && this.#maxResults > 0)
        query[limitParameter] = this.#maxResults;
      await apiClient.execute(operationName, { query });
      const rows = apiClient.getList<unknown>(operationName, options.listPath ?? '');
      const items: WebAutocompleteItem[] = [];
      for (const row of rows) {
        const label = comboBoxItemText(row, options.displayField ?? '');
        if (label === undefined) continue;
        const value = comboBoxItemText(row, options.keyField ?? '') ?? label;
        const detail =
          options.detailField === undefined
            ? undefined
            : comboBoxItemText(row, options.detailField);
        items.push({ value, label, ...(detail === undefined ? {} : { detail }), data: row });
      }
      return items;
    };
  }

  /** Value of the chosen item, or '' (or the typed text when selection is optional). */
  public get value(): string {
    if (this.#selected !== null) return this.#selected.value;
    return this.#requireSelection ? '' : this.#input.value;
  }

  /**
   * Selects the static item with this value; with a `source`, the value is kept
   * and shown as text until `selectedItem` is set with its caption.
   */
  public set value(value: string) {
    const item = this.#items.find((candidate) => candidate.value === value);
    this.#setSelected(item ?? (value.length === 0 ? null : { value, label: value }));
  }

  /** Text currently in the box. */
  public get text(): string {
    return this.#input.value;
  }

  public set text(value: string) {
    this.#input.value = value;
    if (this.#selected !== null && this.#selected.label !== value) this.#selected = null;
  }

  public get selectedItem(): WebAutocompleteItem | null {
    return this.#selected;
  }

  public set selectedItem(value: WebAutocompleteItem | null) {
    this.#setSelected(value);
  }

  public get placeholder(): string {
    return this.#input.placeholder;
  }

  public set placeholder(value: string) {
    this.#input.placeholder = value;
  }

  /** Characters typed before a search starts; 0 lists suggestions on focus. */
  public get minChars(): number {
    return this.#minChars;
  }

  public set minChars(value: number) {
    this.#minChars = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 2;
  }

  /** Pause after the last keystroke before searching, in milliseconds. */
  public get debounceMs(): number {
    return this.#debounceMs;
  }

  public set debounceMs(value: number) {
    this.#debounceMs = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 300;
  }

  /** Most suggestions shown; 0 shows all. */
  public get maxResults(): number {
    return this.#maxResults;
  }

  public set maxResults(value: number) {
    this.#maxResults = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 20;
  }

  /** When true, typed text that is not a chosen item leaves `value` empty. */
  public get requireSelection(): boolean {
    return this.#requireSelection;
  }

  public set requireSelection(value: boolean) {
    this.#requireSelection = value;
  }

  public get required(): boolean {
    return this.#input.required;
  }

  public set required(value: boolean) {
    this.#input.required = value;
  }

  /** Message shown when a search finds nothing; '' uses the page language. */
  public get noResultsText(): string {
    return this.#noResultsText;
  }

  public set noResultsText(value: string) {
    this.#noResultsText = value;
  }

  public override get enabled(): boolean {
    return !this.#input.disabled;
  }

  public override set enabled(value: boolean) {
    super.enabled = value;
    this.#input.disabled = !value;
    if (!value) this.close();
  }

  /** Current suggestions in the open list. */
  public get suggestions(): readonly WebAutocompleteItem[] {
    return this.#suggestions;
  }

  public get isOpen(): boolean {
    return !this.#list.hidden;
  }

  /** Runs a search now, ignoring `minChars` and the debounce. */
  public async search(term: string = this.#input.value): Promise<readonly WebAutocompleteItem[]> {
    this.#cancelTimer();
    const request = ++this.#request;
    this.#lastTerm = term;
    this.emit('OnSearch', { term } satisfies WebAutocompleteSearchEventDetail);
    const text = labels(this.element.ownerDocument);
    let items: readonly WebAutocompleteItem[];
    if (this.#source === null) {
      items = filterAutocompleteItems(this.#items, term, this.#maxResults);
    } else {
      this.element.setAttribute('aria-busy', 'true');
      this.#showStatus(text.loading);
      try {
        const result = normalizeAutocompleteItems(await this.#source(term));
        items = this.#maxResults > 0 ? result.slice(0, this.#maxResults) : result;
      } catch {
        if (request === this.#request) {
          this.element.removeAttribute('aria-busy');
          this.#render([]);
          this.#showStatus(text.error);
        }
        return [];
      }
      if (request !== this.#request) return this.#suggestions;
      this.element.removeAttribute('aria-busy');
    }
    this.#render(items);
    return items;
  }

  public close(): void {
    this.#list.hidden = true;
    this.#status.hidden = true;
    this.#activeIndex = -1;
    this.#input.setAttribute('aria-expanded', 'false');
    this.#input.removeAttribute('aria-activedescendant');
  }

  public clear(): void {
    this.#cancelTimer();
    this.#request += 1;
    this.#input.value = '';
    this.#selected = null;
    this.#lastTerm = null;
    this.element.removeAttribute('aria-busy');
    this.#render([]);
    this.close();
    this.clearValidation();
  }

  public get validationMessage(): string {
    return this.#input.validationMessage;
  }

  /** Requires a chosen item when `required`, or when text was typed and `requireSelection` is on. */
  public validate(): boolean {
    const hasText = this.#input.value.trim().length > 0;
    const missing =
      this.#selected === null &&
      ((this.required && (this.#requireSelection || !hasText)) ||
        (this.#requireSelection && hasText));
    this.#input.setCustomValidity(missing ? labels(this.element.ownerDocument).required : '');
    if (missing) this.#input.setAttribute('aria-invalid', 'true');
    else this.#input.removeAttribute('aria-invalid');
    return !missing;
  }

  public clearValidation(): void {
    this.#input.setCustomValidity('');
    this.#input.removeAttribute('aria-invalid');
  }

  public override focus(options?: FocusOptions): void {
    this.#input.focus(options);
  }

  public set onChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnChange', handler);
  }

  public set onSelect(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnSelect', handler);
  }

  public set onSearch(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnSearch', handler);
  }

  public override dispose(): void {
    this.#cancelTimer();
    this.#request += 1;
    super.dispose();
  }

  #setSelected(item: WebAutocompleteItem | null): void {
    this.#selected = item;
    this.#input.value = item?.label ?? '';
    this.#lastTerm = null;
    this.clearValidation();
  }

  #choose(index: number): void {
    const item = this.#suggestions[index];
    if (item === undefined) return;
    const previous = this.#selected?.value ?? '';
    this.#setSelected(item);
    this.close();
    this.emit('OnSelect', {
      item,
      value: item.value,
      label: item.label,
    } satisfies WebAutocompleteSelectEventDetail);
    if (item.value !== previous) this.emit('OnChange');
  }

  #onInput(): void {
    const hadSelection = this.#selected !== null;
    this.#selected = null;
    this.clearValidation();
    if (hadSelection) {
      this.emit('OnSelect', {
        item: null,
        value: '',
        label: '',
      } satisfies WebAutocompleteSelectEventDetail);
      this.emit('OnChange');
    }
    const term = this.#input.value;
    if (term.trim().length < this.#minChars) {
      this.#cancelTimer();
      this.#request += 1;
      this.element.removeAttribute('aria-busy');
      this.#render([]);
      this.close();
      return;
    }
    this.#schedule(this.#debounceMs);
  }

  #schedule(delay: number): void {
    this.#cancelTimer();
    const run = (): void => {
      this.#timer = null;
      if (this.#input.value !== this.#lastTerm) void this.search(this.#input.value);
      else this.#render(this.#suggestions);
    };
    if (delay === 0) run();
    else this.#timer = setTimeout(run, delay);
  }

  #cancelTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #onBlur(): void {
    this.#cancelTimer();
    this.close();
    if (this.#selected === null && this.#input.value.trim().length > 0) {
      // A typed caption that exactly matches one suggestion counts as choosing it.
      const typed = normalizeAutocompleteText(this.#input.value);
      const index = this.#suggestions.findIndex(
        (item) => normalizeAutocompleteText(item.label) === typed,
      );
      if (index >= 0) this.#choose(index);
      else if (this.#requireSelection) this.validate();
    }
  }

  #onKeyDown(event: KeyboardEvent): void {
    const count = this.#suggestions.length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!this.isOpen) {
          if (count > 0) this.#render(this.#suggestions);
          else void this.search();
          return;
        }
        if (count === 0) return;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.#setActive((this.#activeIndex + step + count) % count);
        return;
      }
      case 'Enter':
        if (this.isOpen && this.#activeIndex >= 0) {
          event.preventDefault();
          this.#choose(this.#activeIndex);
        }
        return;
      case 'Escape':
        if (this.isOpen) {
          event.preventDefault();
          this.close();
        }
        return;
      case 'Tab':
        if (this.isOpen && this.#activeIndex >= 0) this.#choose(this.#activeIndex);
        return;
      default:
        return;
    }
  }

  #setActive(index: number): void {
    this.#activeIndex = index;
    const options = [...this.#list.children] as HTMLElement[];
    options.forEach((option, position) => {
      option.setAttribute('aria-selected', String(position === index));
    });
    const active = options[index];
    if (active === undefined) {
      this.#input.removeAttribute('aria-activedescendant');
      return;
    }
    this.#input.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView?.({ block: 'nearest' });
  }

  #showStatus(message: string): void {
    this.#status.textContent = message;
    this.#status.hidden = false;
  }

  #render(items: readonly WebAutocompleteItem[]): void {
    this.#suggestions = items;
    this.#activeIndex = -1;
    const document = this.element.ownerDocument;
    this.#list.replaceChildren(
      ...items.map((item, index) => {
        const option = document.createElement('li');
        option.id = `${this.#list.id}-${String(index)}`;
        option.className = 'wr-autocomplete-option';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        option.dataset.webradIndex = String(index);
        const caption = document.createElement('span');
        caption.className = 'wr-autocomplete-label';
        caption.textContent = item.label;
        option.append(caption);
        if (item.detail !== undefined && item.detail.length > 0) {
          const detail = document.createElement('span');
          detail.className = 'wr-autocomplete-detail';
          detail.textContent = item.detail;
          option.append(detail);
        }
        return option;
      }),
    );
    this.#input.removeAttribute('aria-activedescendant');
    const focused = document.activeElement === this.#input;
    if (!focused || this.#lastTerm === null) {
      this.close();
      return;
    }
    if (items.length === 0) {
      this.#list.hidden = true;
      this.#input.setAttribute('aria-expanded', 'false');
      this.#showStatus(this.#noResultsText || labels(document).empty);
      return;
    }
    this.#status.hidden = true;
    this.#list.hidden = false;
    this.#input.setAttribute('aria-expanded', 'true');
  }
}
