// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { WebRadioGroup } from '../src/index.js';

function group(): WebRadioGroup {
  const element = document.createElement('fieldset');
  document.body.append(element);
  return new WebRadioGroup(element);
}

describe('WebRadioGroup', () => {
  it('renders native radios with captions, values and a legend', () => {
    const radio = group();
    radio.caption = 'Prioridade';
    radio.items = ['Baixa', 'Média', 'Alta'];
    radio.values = ['1', '2', '3'];
    expect(radio.element.getAttribute('role')).toBe('radiogroup');
    expect(radio.element.querySelector('legend')?.textContent).toBe('Prioridade');
    const inputs = radio.element.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(inputs).toHaveLength(3);
    expect(new Set(Array.from(inputs, (input) => input.name)).size).toBe(1);
    expect(radio.items).toEqual(['Baixa', 'Média', 'Alta']);
    expect(radio.selectedIndex).toBe(-1);
    radio.value = '2';
    expect(radio.selectedIndex).toBe(1);
    expect(radio.selectedItem).toBe('Média');
    radio.selectedIndex = 2;
    expect(radio.value).toBe('3');
    radio.items = ['Baixa', 'Alta'];
    expect(radio.element.querySelector('legend')?.textContent).toBe('Prioridade');
    radio.caption = '';
    expect(radio.element.querySelector('legend')).toBeNull();
    expect(() => {
      radio.values = ['1'];
    }).toThrow(RangeError);
    radio.element.remove();
  });

  it('keeps separate groups independent and reports changes', () => {
    const first = group();
    const second = group();
    first.items = ['A', 'B'];
    second.items = ['A', 'B'];
    first.selectedIndex = 0;
    second.selectedIndex = 1;
    expect(first.selectedIndex).toBe(0);
    let changes = 0;
    first.onChange = () => {
      changes += 1;
    };
    first.element.querySelectorAll<HTMLInputElement>('input')[1]?.click();
    expect(changes).toBe(1);
    expect(first.value).toBe('B');
    expect(second.value).toBe('B');
    first.element.remove();
    second.element.remove();
  });

  it('validates required groups, orientation and disabled state', () => {
    const radio = group();
    radio.items = ['Sim', 'Não'];
    radio.required = true;
    expect(radio.validate()).toBe(false);
    expect(radio.element.getAttribute('aria-invalid')).toBe('true');
    radio.selectedIndex = 0;
    expect(radio.validate()).toBe(true);
    radio.clear();
    expect(radio.selectedIndex).toBe(-1);
    radio.orientation = 'horizontal';
    expect(radio.element.dataset.webradOrientation).toBe('horizontal');
    radio.enabled = false;
    expect(radio.element.disabled).toBe(true);
    radio.element.remove();
  });
});
