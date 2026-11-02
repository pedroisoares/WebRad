// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { WebTabs, type WebTabChangeEventDetail } from '../src/index.js';

function page(): { readonly root: HTMLElement; readonly tabs: WebTabs } {
  const root = document.createElement('div');
  root.dataset.webradPageId = 'page';
  const strip = document.createElement('div');
  root.append(strip);
  for (const name of ['DadosGerais', 'Historico']) {
    const panel = document.createElement('div');
    panel.dataset.webradName = name;
    panel.dataset.webradId = name.toLowerCase();
    root.append(panel);
  }
  document.body.append(root);
  return { root, tabs: new WebTabs(strip) };
}

const panel = (root: HTMLElement, name: string): HTMLElement =>
  root.querySelector<HTMLElement>(`[data-webrad-name="${name}"]`) ?? document.createElement('div');

describe('WebTabs', () => {
  it('shows only the panel of the selected tab and links them for assistive technology', () => {
    const { root, tabs } = page();
    tabs.tabs = ['Dados gerais', 'Histórico'];
    tabs.panels = ['DadosGerais', 'Historico'];
    expect(tabs.element.getAttribute('role')).toBe('tablist');
    expect(panel(root, 'DadosGerais').hidden).toBe(false);
    expect(panel(root, 'Historico').hidden).toBe(true);
    const buttons = tabs.element.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(buttons[0]?.getAttribute('aria-selected')).toBe('true');
    expect(buttons[0]?.getAttribute('aria-controls')).toBe(panel(root, 'DadosGerais').id);
    expect(panel(root, 'Historico').getAttribute('role')).toBe('tabpanel');

    const events: WebTabChangeEventDetail[] = [];
    tabs.onChange = (_sender, event) => {
      events.push((event as CustomEvent<WebTabChangeEventDetail>).detail);
    };
    buttons[1]?.click();
    expect(tabs.selectedIndex).toBe(1);
    expect(tabs.selectedTab).toBe('Histórico');
    expect(panel(root, 'DadosGerais').hidden).toBe(true);
    expect(panel(root, 'Historico').hidden).toBe(false);
    expect(events).toEqual([
      { index: 1, caption: 'Histórico', panel: 'Historico', previousIndex: 0 },
    ]);

    tabs.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(tabs.selectedIndex).toBe(0);
    expect(tabs.selectTab('Historico')).toBe(true);
    expect(tabs.selectedIndex).toBe(1);
    expect(tabs.selectTab('Inexistente')).toBe(false);
    expect(events).toHaveLength(2);
    root.remove();
  });

  it('applies panels created after the strip in the same render', async () => {
    const root = document.createElement('div');
    root.dataset.webradPageId = 'page';
    const strip = document.createElement('div');
    root.append(strip);
    document.body.append(root);
    const tabs = new WebTabs(strip);
    tabs.tabs = ['A', 'B'];
    tabs.panels = ['PainelA', 'PainelB'];
    for (const name of ['PainelA', 'PainelB']) {
      const element = document.createElement('div');
      element.dataset.webradName = name;
      root.append(element);
    }
    await Promise.resolve();
    expect(panel(root, 'PainelA').hidden).toBe(false);
    expect(panel(root, 'PainelB').hidden).toBe(true);
    root.remove();
  });

  it('lets a second instance for the same element drive the rendered strip', () => {
    const { root, tabs } = page();
    tabs.tabs = ['Dados gerais', 'Histórico'];
    tabs.panels = ['DadosGerais', 'Historico'];
    const pageCode = new WebTabs(tabs.element);
    expect(pageCode.tabs).toEqual(['Dados gerais', 'Histórico']);
    expect(pageCode.selectTab('Historico')).toBe(true);
    expect(tabs.selectedIndex).toBe(1);
    expect(panel(root, 'Historico').hidden).toBe(false);
    expect(panel(root, 'DadosGerais').hidden).toBe(true);

    const events: number[] = [];
    pageCode.onChange = (_sender, event) => {
      events.push((event as CustomEvent<WebTabChangeEventDetail>).detail.index);
    };
    tabs.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(events).toEqual([0]);
  });
});
