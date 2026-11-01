// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import {
  WebEdit,
  applyMaskPattern,
  formatNativeDateInputValue,
  formatWithWebEditMask,
  isValidCnpj,
  isValidCpf,
  nativeDateInputValueToDate,
  toNativeDateInputValue,
} from '../src/index.js';

function edit(lang = 'pt-BR'): WebEdit {
  document.documentElement.lang = lang;
  const element = document.createElement('input');
  document.body.append(element);
  return new WebEdit(element);
}

function type(control: WebEdit, text: string): void {
  control.element.focus();
  control.element.value = text;
  control.element.setSelectionRange(text.length, text.length);
  control.element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('WebEdit masks', () => {
  it('formats the built-in Brazilian masks', () => {
    expect(formatWithWebEditMask('12345678909', 'cpf')).toBe('123.456.789-09');
    expect(formatWithWebEditMask('11222333000181', 'cnpj')).toBe('11.222.333/0001-81');
    expect(formatWithWebEditMask('1234567890', 'cpf-cnpj')).toBe('123.456.789-0');
    expect(formatWithWebEditMask('112223330001', 'cpf-cnpj')).toBe('11.222.333/0001');
    expect(formatWithWebEditMask('1938341234', 'phone')).toBe('(19) 3834-1234');
    expect(formatWithWebEditMask('19998765432', 'phone')).toBe('(19) 99876-5432');
    expect(formatWithWebEditMask('13330000', 'cep')).toBe('13330-000');
    expect(formatWithWebEditMask('123', 'cpf')).toBe('123');
    expect(formatWithWebEditMask('1234', 'cpf')).toBe('123.4');
  });

  it('applies custom patterns with digit, letter and alphanumeric slots', () => {
    expect(applyMaskPattern('pmi001234', 'AAA-999999')).toBe('PMI-001234');
    expect(applyMaskPattern('12x34', '99.99')).toBe('12.34');
    expect(applyMaskPattern('ab12', '**/**')).toBe('ab/12');
  });

  it('checks CPF and CNPJ digits', () => {
    expect(isValidCpf('123.456.789-09')).toBe(true);
    expect(isValidCpf('123.456.789-00')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
  });

  it('reformats while typing, sets a numeric keyboard and reports the unmasked value', () => {
    const control = edit();
    control.mask = 'cpf';
    expect(control.element.inputMode).toBe('numeric');
    expect(control.element.maxLength).toBe(14);
    type(control, '1234567890');
    expect(control.value).toBe('123.456.789-0');
    expect(control.element.selectionStart).toBe(13);
    type(control, '123.456.789-09');
    expect(control.unmaskedValue).toBe('12345678909');
    control.value = '98765432100';
    expect(control.value).toBe('987.654.321-00');
    control.mask = 'none';
    expect(control.element.hasAttribute('maxlength')).toBe(false);
    control.element.remove();
  });

  it('validates required fields, incomplete masks and check digits with localized messages', () => {
    const control = edit();
    control.required = true;
    control.mask = 'cpf';
    expect(control.validate()).toBe(false);
    expect(control.validationMessage).toBe('Preencha este campo.');
    expect(control.element.getAttribute('aria-invalid')).toBe('true');
    control.value = '123.456.789-00';
    expect(control.isValid).toBe(false);
    expect(control.validate()).toBe(false);
    expect(control.validationMessage).toBe('CPF inválido.');
    control.value = '123.456.789-09';
    expect(control.validate()).toBe(true);
    expect(control.element.hasAttribute('aria-invalid')).toBe(false);

    const phone = edit('en');
    phone.mask = 'phone';
    phone.value = '19 3834';
    expect(phone.validate()).toBe(false);
    expect(phone.validationMessage).toBe('Please enter the complete value.');
    phone.element.dispatchEvent(new Event('blur'));
    phone.value = '1938341234';
    phone.element.dispatchEvent(new Event('blur'));
    expect(phone.element.hasAttribute('aria-invalid')).toBe(false);
    control.element.remove();
    phone.element.remove();
  });
});

describe('WebEdit dates', () => {
  it('converts Brazilian, ISO and MySQL text to native input values', () => {
    expect(toNativeDateInputValue('05/01/2024', 'date')).toBe('2024-01-05');
    expect(toNativeDateInputValue('5/1/2024 14:30', 'datetime-local')).toBe('2024-01-05T14:30');
    expect(toNativeDateInputValue('2024-01-05 14:30:15', 'datetime-local')).toBe(
      '2024-01-05T14:30:15',
    );
    expect(toNativeDateInputValue('2024-01-05T14:30:00Z', 'date')).toBe('2024-01-05');
    expect(toNativeDateInputValue('2024-01-05 08:05:00', 'time')).toBe('08:05');
    expect(toNativeDateInputValue('01/2024', 'month')).toBe('2024-01');
    expect(toNativeDateInputValue('31/02/2024', 'date')).toBe('');
    expect(toNativeDateInputValue('ontem', 'date')).toBe('');
  });

  it('reads and formats dates in the page language', () => {
    expect(nativeDateInputValueToDate('2024-01-05', 'date')?.getDate()).toBe(5);
    expect(formatNativeDateInputValue('2024-01-05', 'date', 'pt-BR')).toBe('05/01/2024');
    expect(formatNativeDateInputValue('2024-01-05T14:30', 'datetime-local', 'pt-BR')).toBe(
      '05/01/2024 14:30',
    );
    expect(formatNativeDateInputValue('', 'date', 'pt-BR')).toBe('');
  });

  it('accepts dd/mm/yyyy values, limits and Date objects on date inputs', () => {
    const control = edit();
    control.value = '05/01/2024';
    control.inputType = 'date';
    expect(control.value).toBe('2024-01-05');
    control.value = '10/02/2024';
    expect(control.value).toBe('2024-02-10');
    expect(control.formattedValue).toBe('10/02/2024');
    control.minimum = '01/03/2024';
    expect(control.minimum).toBe('2024-03-01');
    expect(control.validate()).toBe(false);
    control.dateValue = new Date(2024, 3, 15);
    expect(control.value).toBe('2024-04-15');
    expect(control.validate()).toBe(true);
    expect(control.dateValue?.getMonth()).toBe(3);
    control.dateValue = null;
    expect(control.value).toBe('');
    control.element.remove();
  });
});
