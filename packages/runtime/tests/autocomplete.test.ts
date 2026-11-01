// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WebAutocomplete,
  filterAutocompleteItems,
  normalizeAutocompleteItems,
  type WebApiClient,
  type WebAutocompleteSelectEventDetail,
} from '../src/index.js';

function autocomplete(): WebAutocomplete {
  const element = document.createElement('div');
  document.body.append(element);
  const component = new WebAutocomplete(element);
  component.debounceMs = 0;
  component.minChars = 1;
  return component;
}

function type(component: WebAutocomplete, text: string): void {
  component.input.focus();
  component.input.value = text;
  component.input.dispatchEvent(new Event('input', { bubbles: true }));
}

function key(component: WebAutocomplete, name: string): void {
  component.input.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
}

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('autocomplete helpers', () => {
  it('matches every word ignoring case and accents', () => {
    const items = normalizeAutocompleteItems(['São Paulo', 'São José dos Campos', 'Campinas']);
    expect(filterAutocompleteItems(items, 'sao jose', 0).map((item) => item.label)).toEqual([
      'São José dos Campos',
    ]);
    expect(filterAutocompleteItems(items, 'CAMP', 0)).toHaveLength(2);
    expect(filterAutocompleteItems(items, 'camp', 1)).toHaveLength(1);
  });
});

describe('WebAutocomplete', () => {
  it('renders an accessible combobox and filters static items', () => {
    const component = autocomplete();
    component.items = ['Campinas', 'Curitiba', 'Florianópolis'];
    expect(component.input.getAttribute('role')).toBe('combobox');
    type(component, 'cu');
    expect(component.isOpen).toBe(true);
    expect(component.suggestions.map((item) => item.label)).toEqual(['Curitiba']);
    expect(component.input.getAttribute('aria-expanded')).toBe('true');
  });

  it('chooses with the keyboard and emits OnSelect and OnChange', () => {
    const component = autocomplete();
    component.items = [
      { value: '1', label: 'Campinas' },
      { value: '2', label: 'Curitiba' },
    ];
    const selected: WebAutocompleteSelectEventDetail[] = [];
    let changes = 0;
    component.element.addEventListener('select', (event) =>
      selected.push((event as CustomEvent<WebAutocompleteSelectEventDetail>).detail),
    );
    component.element.addEventListener('change', () => (changes += 1));
    type(component, 'c');
    key(component, 'ArrowDown');
    key(component, 'ArrowDown');
    expect(component.input.getAttribute('aria-activedescendant')).toMatch(/-1$/u);
    key(component, 'Enter');
    expect(component.value).toBe('2');
    expect(component.text).toBe('Curitiba');
    expect(component.isOpen).toBe(false);
    expect(selected.at(-1)?.value).toBe('2');
    expect(changes).toBe(1);
    // Editing the text drops the selection.
    type(component, 'Curitib');
    expect(component.value).toBe('');
    expect(changes).toBe(2);
  });

  it('chooses with the mouse without losing focus first', () => {
    const component = autocomplete();
    component.items = ['Campinas', 'Curitiba'];
    type(component, 'cam');
    const option = component.element.querySelector('[role="option"]');
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    option?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(component.value).toBe('Campinas');
  });

  it('waits for minChars and the debounce before searching', () => {
    vi.useFakeTimers();
    const component = autocomplete();
    component.minChars = 3;
    component.debounceMs = 300;
    const source = vi.fn(() => ['Campinas']);
    component.source = source;
    type(component, 'ca');
    vi.advanceTimersByTime(500);
    expect(source).not.toHaveBeenCalled();
    type(component, 'cam');
    vi.advanceTimersByTime(299);
    type(component, 'camp');
    vi.advanceTimersByTime(300);
    expect(source).toHaveBeenCalledTimes(1);
    expect(source).toHaveBeenCalledWith('camp');
  });

  it('ignores stale async results', async () => {
    const component = autocomplete();
    const pending: ((items: string[]) => void)[] = [];
    component.source = () => new Promise((resolve) => pending.push(resolve));
    type(component, 'a');
    type(component, 'ab');
    expect(pending).toHaveLength(2);
    expect(component.element.getAttribute('aria-busy')).toBe('true');
    pending[1]?.(['abc']);
    await flush();
    pending[0]?.(['old']);
    await flush();
    expect(component.suggestions.map((item) => item.label)).toEqual(['abc']);
    expect(component.element.hasAttribute('aria-busy')).toBe(false);
  });

  it('shows a localized empty and error status', async () => {
    document.documentElement.lang = 'pt-BR';
    const component = autocomplete();
    component.source = () => [];
    type(component, 'x');
    await flush();
    const status = component.element.querySelector('.wr-autocomplete-status');
    expect(status?.textContent).toBe('Nenhum resultado');
    component.source = () => Promise.reject(new Error('offline'));
    type(component, 'xy');
    await flush();
    expect(status?.textContent).toBe('Falha na busca');
    document.documentElement.lang = '';
  });

  it('searches through an API operation with the term and limit', async () => {
    const component = autocomplete();
    component.maxResults = 10;
    const execute = vi.fn(() => Promise.resolve(undefined));
    const rows = [
      { id: 7, nome: 'Ana Souza', cpf: '123' },
      { id: 9, nome: 'Ana Lima', cpf: '456' },
    ];
    const getList = vi.fn(() => rows);
    component.bindOperation({ execute, getList } as unknown as WebApiClient, 'buscarPessoas', {
      listPath: '/data',
      displayField: '/nome',
      keyField: '/id',
      detailField: '/cpf',
    });
    type(component, 'ana');
    await flush();
    expect(execute).toHaveBeenCalledWith('buscarPessoas', { query: { q: 'ana', page_size: 10 } });
    expect(getList).toHaveBeenCalledWith('buscarPessoas', '/data');
    expect(component.suggestions[1]).toMatchObject({
      value: '9',
      label: 'Ana Lima',
      detail: '456',
    });
    expect(component.element.querySelectorAll('.wr-autocomplete-detail')).toHaveLength(2);
  });

  it('validates required and free text', () => {
    const component = autocomplete();
    component.items = ['Campinas'];
    component.required = true;
    expect(component.validate()).toBe(false);
    component.text = 'Inexistente';
    expect(component.validate()).toBe(false);
    expect(component.input.getAttribute('aria-invalid')).toBe('true');
    component.value = 'Campinas';
    expect(component.text).toBe('Campinas');
    expect(component.validate()).toBe(true);
    component.requireSelection = false;
    component.text = 'Livre';
    expect(component.value).toBe('Livre');
    expect(component.validate()).toBe(true);
    component.clear();
    expect(component.text).toBe('');
  });

  it('accepts an exact typed caption on blur', () => {
    const component = autocomplete();
    component.items = [{ value: 'SP', label: 'São Paulo' }];
    type(component, 'sao paulo');
    component.input.blur();
    component.input.dispatchEvent(new FocusEvent('blur'));
    expect(component.value).toBe('SP');
  });

  it('does not leak native input events into OnChange', () => {
    const component = autocomplete();
    let changes = 0;
    component.element.addEventListener('change', () => (changes += 1));
    component.input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(changes).toBe(0);
  });
});
