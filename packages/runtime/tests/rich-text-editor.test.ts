// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WebRichTextEditor,
  isSafeRichTextLink,
  richTextToPlainText,
  sanitizeRichTextHtml,
} from '../src/index.js';

function editor(html = ''): WebRichTextEditor {
  const element = document.createElement('div');
  element.innerHTML = html;
  document.body.append(element);
  return new WebRichTextEditor(element);
}

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.lang = '';
});

describe('rich text sanitizing', () => {
  it('keeps basic formatting and drops scripts, handlers and styles', () => {
    const html = sanitizeRichTextHtml(
      '<p style="color:red" onclick="x()">Olá <b>mundo</b><script>alert(1)</script></p>' +
        '<img src=x onerror=alert(1)><ul><li class="a">um</li></ul><font>texto</font><strike>x</strike>',
    );
    expect(html).toBe('<p>Olá <b>mundo</b></p><ul><li>um</li></ul>texto<s>x</s>');
  });

  it('keeps only safe links and opens them in a new tab', () => {
    expect(sanitizeRichTextHtml('<a href="https://sigat.example/x">ok</a>')).toBe(
      '<a href="https://sigat.example/x" target="_blank" rel="noopener noreferrer">ok</a>',
    );
    expect(sanitizeRichTextHtml('<a href="java\nscript:alert(1)">bad</a>')).toBe('<a>bad</a>');
    expect(isSafeRichTextLink('mailto:a@b.c')).toBe(true);
    expect(isSafeRichTextLink('/chamados/1')).toBe(true);
    expect(isSafeRichTextLink(' JavaScript:alert(1)')).toBe(false);
    expect(isSafeRichTextLink('data:text/html,x')).toBe(false);
  });

  it('converts to plain text with line breaks between blocks', () => {
    expect(
      richTextToPlainText('<p>Linha 1</p><p>Linha <b>2</b><br>3</p><ul><li>a</li><li>b</li></ul>'),
    ).toBe('Linha 1\nLinha 2\n3\na\nb');
  });
});

describe('WebRichTextEditor', () => {
  it('builds a toolbar and an editable textbox with pt-BR labels', () => {
    document.documentElement.lang = 'pt-BR';
    const component = editor();
    const content = component.content;
    expect(content.isContentEditable || content.contentEditable === 'true').toBe(true);
    expect(content.getAttribute('role')).toBe('textbox');
    expect(
      component.element.querySelector('[data-webrad-command="bold"]')?.getAttribute('aria-label'),
    ).toBe('Negrito');
    component.showToolbar = false;
    expect(component.element.querySelector<HTMLElement>('.wr-richtext-toolbar')?.hidden).toBe(true);
  });

  it('sanitizes initial markup and assigned values', () => {
    const component = editor('<p>Inicial<script>x()</script></p>');
    expect(component.value).toBe('<p>Inicial</p>');
    component.value = '<h3 onclick="x">Título</h3><p>Texto</p>';
    expect(component.value).toBe('<h3>Título</h3><p>Texto</p>');
    expect(component.text).toBe('Título\nTexto');
    expect(component.isEmpty).toBe(false);
  });

  it('sets plain text as escaped paragraphs and reports empty content', () => {
    const component = editor();
    expect(component.value).toBe('');
    expect(component.content.dataset.webradEmpty).toBe('true');
    component.text = 'a < b\n\nfim';
    expect(component.value).toBe('<p>a &lt; b</p><p><br></p><p>fim</p>');
    expect(component.text).toBe('a < b\n\nfim');
    component.clear();
    expect(component.isEmpty).toBe(true);
  });

  it('validates required and maximum length', () => {
    const component = editor();
    component.required = true;
    expect(component.validate()).toBe(false);
    expect(component.element.getAttribute('aria-invalid')).toBe('true');
    component.text = 'abcdef';
    component.maxLength = 5;
    expect(component.validate()).toBe(false);
    component.maxLength = 6;
    expect(component.validate()).toBe(true);
    expect(component.element.hasAttribute('aria-invalid')).toBe(false);
  });

  it('disables editing and the toolbar when read-only or disabled', () => {
    const component = editor();
    component.readOnly = true;
    expect(component.content.contentEditable).toBe('false');
    expect(component.execute('bold')).toBe(false);
    component.readOnly = false;
    component.enabled = false;
    expect(component.content.contentEditable).toBe('false');
    expect(
      component.element.querySelector<HTMLButtonElement>('[data-webrad-command="italic"]')
        ?.disabled,
    ).toBe(true);
  });

  it('runs editing commands and refuses unsafe links', () => {
    const component = editor('<p>texto</p>');
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec });
    try {
      expect(component.execute('bold')).toBe(true);
      expect(exec).toHaveBeenLastCalledWith('bold', false, undefined);
      component.execute('numberedList');
      expect(exec).toHaveBeenLastCalledWith('insertOrderedList', false, undefined);
      expect(component.execute('link', 'javascript:alert(1)')).toBe(false);
      component.execute('link', 'https://sigat.example');
      expect(exec).toHaveBeenLastCalledWith('createLink', false, 'https://sigat.example');
    } finally {
      Reflect.deleteProperty(document, 'execCommand');
    }
  });

  it('pastes sanitized HTML and emits OnInput and OnChange', () => {
    const component = editor();
    let inputs = 0;
    let changes = 0;
    component.element.addEventListener('input', () => (inputs += 1));
    component.element.addEventListener('change', () => (changes += 1));
    const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        getData: (type: string) =>
          type === 'text/html'
            ? '<p onclick="x">Colado <script>bad()</script><b>forte</b></p>'
            : '',
      },
    });
    component.content.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    expect(component.value).toBe('<p>Colado <b>forte</b></p>');
    expect(inputs).toBe(1);
    component.content.dispatchEvent(new FocusEvent('blur'));
    expect(changes).toBe(1);
    component.content.dispatchEvent(new FocusEvent('blur'));
    expect(changes).toBe(1);
  });
});
