import { WebComponent, type WebComponentEventHandler } from './component.js';

export const WEB_RICH_TEXT_COMMANDS = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'heading',
  'bulletList',
  'numberedList',
  'quote',
  'link',
  'clear',
] as const;
export type WebRichTextCommand = (typeof WEB_RICH_TEXT_COMMANDS)[number];

const ALLOWED_TAGS = new Set([
  'A',
  'B',
  'BLOCKQUOTE',
  'BR',
  'DIV',
  'EM',
  'H2',
  'H3',
  'I',
  'LI',
  'OL',
  'P',
  'S',
  'SPAN',
  'STRIKE',
  'STRONG',
  'U',
  'UL',
]);
/** Elements removed with their content; everything else unknown is unwrapped. */
const DROPPED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'TEMPLATE',
  'NOSCRIPT',
  'SVG',
  'MATH',
  'FORM',
  'INPUT',
  'BUTTON',
  'SELECT',
  'TEXTAREA',
  'LINK',
  'META',
  'TITLE',
  'HEAD',
]);

/** True for http(s), mailto, tel, anchors and relative links. */
export function isSafeRichTextLink(value: string): boolean {
  // Browsers ignore control characters and spaces inside the scheme.
  const compact = Array.from(value)
    .filter((character) => character.charCodeAt(0) > 0x20 && character.charCodeAt(0) !== 0x7f)
    .join('')
    .toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/u.exec(compact)?.[1];
  return scheme === undefined || ['http', 'https', 'mailto', 'tel'].includes(scheme);
}

function sanitizeChildren(source: Node, target: Node, document: Document): void {
  for (const child of [...source.childNodes]) {
    if (child.nodeType === 3) {
      target.appendChild(document.createTextNode(child.textContent ?? ''));
      continue;
    }
    if (child.nodeType !== 1) continue;
    const element = child as Element;
    const tag = element.tagName.toUpperCase();
    if (DROPPED_TAGS.has(tag)) continue;
    if (!ALLOWED_TAGS.has(tag)) {
      sanitizeChildren(element, target, document);
      continue;
    }
    const copy = document.createElement(tag === 'STRIKE' ? 's' : tag.toLowerCase());
    if (tag === 'A') {
      const href = element.getAttribute('href')?.trim() ?? '';
      if (href.length > 0 && isSafeRichTextLink(href)) {
        copy.setAttribute('href', href);
        copy.setAttribute('target', '_blank');
        copy.setAttribute('rel', 'noopener noreferrer');
      }
    }
    sanitizeChildren(element, copy, document);
    target.appendChild(copy);
  }
}

/**
 * Keeps only basic formatting (paragraphs, bold, italic, underline, strike,
 * headings, lists, quotes and safe links) and drops every attribute except a
 * safe `href`, so stored HTML can be shown again without running scripts.
 */
export function sanitizeRichTextHtml(
  html: string,
  document: Document = globalThis.document,
): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  const output = document.createElement('div');
  sanitizeChildren(template.content, output, document);
  return output.innerHTML;
}

/** Plain text of rich HTML, with line breaks between blocks. */
export function richTextToPlainText(
  html: string,
  document: Document = globalThis.document,
): string {
  const template = document.createElement('template');
  template.innerHTML = sanitizeRichTextHtml(html, document);
  const lines: string[] = [];
  let line = '';
  const flush = (): void => {
    lines.push(line);
    line = '';
  };
  const walk = (node: Node): void => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        line += child.textContent ?? '';
        continue;
      }
      const tag = (child as Element).tagName;
      if (tag === 'BR') {
        flush();
        continue;
      }
      const block = /^(P|DIV|LI|H2|H3|BLOCKQUOTE|UL|OL)$/u.test(tag);
      if (block && line.length > 0) flush();
      walk(child);
      if (block && line.length > 0) flush();
    }
  };
  walk(template.content);
  if (line.length > 0) flush();
  return lines.join('\n').trim();
}

interface ToolbarButton {
  readonly command: WebRichTextCommand;
  readonly label: { readonly pt: string; readonly en: string };
  readonly glyph: string;
}

const TOOLBAR: readonly ToolbarButton[] = [
  { command: 'bold', label: { pt: 'Negrito', en: 'Bold' }, glyph: 'B' },
  { command: 'italic', label: { pt: 'Itálico', en: 'Italic' }, glyph: 'I' },
  { command: 'underline', label: { pt: 'Sublinhado', en: 'Underline' }, glyph: 'U' },
  { command: 'strikethrough', label: { pt: 'Tachado', en: 'Strikethrough' }, glyph: 'S' },
  { command: 'heading', label: { pt: 'Título', en: 'Heading' }, glyph: 'H' },
  { command: 'bulletList', label: { pt: 'Lista', en: 'Bulleted list' }, glyph: '•' },
  { command: 'numberedList', label: { pt: 'Lista numerada', en: 'Numbered list' }, glyph: '1.' },
  { command: 'quote', label: { pt: 'Citação', en: 'Quote' }, glyph: '❝' },
  { command: 'link', label: { pt: 'Link', en: 'Link' }, glyph: '🔗' },
  { command: 'clear', label: { pt: 'Limpar formatação', en: 'Clear formatting' }, glyph: '⨯' },
];

function isPortuguese(document: Document): boolean {
  const language =
    document.documentElement.lang || document.defaultView?.navigator.language || 'en';
  return language.toLowerCase().startsWith('pt');
}

/**
 * A small WYSIWYG editor for descriptions and notes. `value` is sanitized
 * HTML and `text` the plain text, so pages can save either one.
 */
export class WebRichTextEditor extends WebComponent<HTMLDivElement> {
  readonly #toolbar: HTMLDivElement;
  readonly #content: HTMLDivElement;
  #readOnly = false;
  #maxLength = 0;
  #lastValue = '';

  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLDivElement)) {
      throw new TypeError('WebRichTextEditor requires a div element.');
    }
    super(element);
    const document = element.ownerDocument;
    const portuguese = isPortuguese(document);
    this.#toolbar = document.createElement('div');
    this.#toolbar.className = 'wr-richtext-toolbar';
    this.#toolbar.setAttribute('role', 'toolbar');
    for (const button of TOOLBAR) {
      const control = document.createElement('button');
      control.type = 'button';
      control.className = 'wr-richtext-button';
      control.dataset.webradCommand = button.command;
      const label = portuguese ? button.label.pt : button.label.en;
      control.title = label;
      control.setAttribute('aria-label', label);
      control.textContent = button.glyph;
      // Keep the selection inside the editor while clicking the toolbar.
      control.addEventListener('mousedown', (event) => event.preventDefault());
      control.addEventListener('click', () => this.execute(button.command));
      this.#toolbar.append(control);
    }
    this.#content = document.createElement('div');
    this.#content.className = 'wr-richtext-content';
    this.#content.contentEditable = 'true';
    this.#content.setAttribute('role', 'textbox');
    this.#content.setAttribute('aria-multiline', 'true');
    const initial = element.innerHTML;
    element.replaceChildren(this.#toolbar, this.#content);
    this.value = initial;

    this.#content.addEventListener('input', (event) => {
      event.stopPropagation();
      this.#afterEdit();
    });
    this.#content.addEventListener('paste', (event) => this.#onPaste(event));
    this.#content.addEventListener('blur', () => {
      if (this.value !== this.#lastValue) {
        this.#lastValue = this.value;
        this.emit('OnChange');
      }
    });
    this.#content.addEventListener('keydown', (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const command =
        event.key === 'b'
          ? 'bold'
          : event.key === 'i'
            ? 'italic'
            : event.key === 'u'
              ? 'underline'
              : null;
      if (command === null) return;
      event.preventDefault();
      this.execute(command);
    });
  }

  /** The editable area, for focus and custom attributes. */
  public get content(): HTMLDivElement {
    return this.#content;
  }

  /** Sanitized HTML of the content; '' when empty. */
  public get value(): string {
    if (
      this.#content.textContent?.trim().length === 0 &&
      this.#content.querySelector('li') === null
    )
      return '';
    return sanitizeRichTextHtml(this.#content.innerHTML, this.element.ownerDocument);
  }

  public set value(html: string) {
    this.#content.innerHTML = sanitizeRichTextHtml(html, this.element.ownerDocument);
    this.#lastValue = this.value;
    this.#updateEmpty();
  }

  /** Plain text of the content, with a line break between blocks. */
  public get text(): string {
    return richTextToPlainText(this.#content.innerHTML, this.element.ownerDocument);
  }

  public set text(value: string) {
    const document = this.element.ownerDocument;
    const paragraphs = value.split(/\r?\n/u).map((line) => {
      const paragraph = document.createElement('p');
      if (line.length === 0) paragraph.append(document.createElement('br'));
      else paragraph.textContent = line;
      return paragraph;
    });
    this.#content.replaceChildren(...(value.length === 0 ? [] : paragraphs));
    this.#lastValue = this.value;
    this.#updateEmpty();
  }

  public get placeholder(): string {
    return this.#content.dataset.placeholder ?? '';
  }

  public set placeholder(value: string) {
    this.#content.dataset.placeholder = value;
    this.#content.setAttribute('aria-label', value || this.element.dataset.webradName || 'Editor');
  }

  public get readOnly(): boolean {
    return this.#readOnly;
  }

  public set readOnly(value: boolean) {
    this.#readOnly = value;
    this.#applyEditable();
  }

  public override get enabled(): boolean {
    return this.element.getAttribute('aria-disabled') !== 'true';
  }

  public override set enabled(value: boolean) {
    super.enabled = value;
    this.#applyEditable();
  }

  /** Whether the formatting toolbar is shown. */
  public get showToolbar(): boolean {
    return !this.#toolbar.hidden;
  }

  public set showToolbar(value: boolean) {
    this.#toolbar.hidden = !value;
  }

  /** Most plain-text characters accepted; 0 for no limit. */
  public get maxLength(): number {
    return this.#maxLength;
  }

  public set maxLength(value: number) {
    this.#maxLength = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  }

  public get required(): boolean {
    return this.#content.getAttribute('aria-required') === 'true';
  }

  public set required(value: boolean) {
    if (value) this.#content.setAttribute('aria-required', 'true');
    else this.#content.removeAttribute('aria-required');
  }

  public get isEmpty(): boolean {
    return this.value.length === 0;
  }

  /** Fails when required and empty, or when the text exceeds maxLength. */
  public validate(): boolean {
    const length = this.text.length;
    const valid =
      !(this.required && this.isEmpty) && !(this.#maxLength > 0 && length > this.#maxLength);
    if (valid) this.element.removeAttribute('aria-invalid');
    else this.element.setAttribute('aria-invalid', 'true');
    return valid;
  }

  public clear(): void {
    this.value = '';
    this.element.removeAttribute('aria-invalid');
  }

  /** Applies a toolbar command to the current selection. */
  public execute(command: WebRichTextCommand, argument?: string): boolean {
    if (!this.enabled || this.#readOnly) return false;
    const document = this.element.ownerDocument;
    this.#content.focus();
    const run = (name: string, value?: string): boolean => {
      // execCommand is deprecated but remains the only cross-browser editing API.
      const exec = (document as Document & { execCommand?: Document['execCommand'] }).execCommand;
      return typeof exec === 'function' ? exec.call(document, name, false, value) : false;
    };
    let applied: boolean;
    switch (command) {
      case 'bold':
      case 'italic':
      case 'underline':
      case 'strikethrough':
        applied = run(command);
        break;
      case 'heading':
        applied = run('formatBlock', '<h3>');
        break;
      case 'bulletList':
        applied = run('insertUnorderedList');
        break;
      case 'numberedList':
        applied = run('insertOrderedList');
        break;
      case 'quote':
        applied = run('formatBlock', '<blockquote>');
        break;
      case 'link': {
        const portuguese = isPortuguese(document);
        const href =
          argument ??
          document.defaultView?.prompt(
            portuguese ? 'Endereço do link' : 'Link address',
            'https://',
          ) ??
          null;
        if (href === null || href.trim().length === 0) return false;
        if (!isSafeRichTextLink(href.trim())) return false;
        applied = run('createLink', href.trim());
        break;
      }
      case 'clear':
        applied = run('removeFormat');
        run('formatBlock', '<p>');
        break;
    }
    this.#afterEdit();
    return applied;
  }

  public override focus(options?: FocusOptions): void {
    this.#content.focus(options);
  }

  public set onChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnChange', handler);
  }

  public set onInput(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnInput', handler);
  }

  #applyEditable(): void {
    const editable = this.enabled && !this.#readOnly;
    this.#content.contentEditable = editable ? 'true' : 'false';
    this.#content.setAttribute('aria-readonly', String(this.#readOnly));
    for (const button of this.#toolbar.querySelectorAll('button')) button.disabled = !editable;
  }

  #afterEdit(): void {
    this.#updateEmpty();
    this.emit('OnInput');
  }

  #updateEmpty(): void {
    this.#content.dataset.webradEmpty = String(this.isEmpty);
  }

  #onPaste(event: ClipboardEvent): void {
    const data = event.clipboardData;
    if (data === null) return;
    event.preventDefault();
    const document = this.element.ownerDocument;
    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    const clean =
      html.length > 0
        ? sanitizeRichTextHtml(html, document)
        : text
            .split(/\r?\n/u)
            .map((line) =>
              line.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;'),
            )
            .join('<br>');
    const exec = (document as Document & { execCommand?: Document['execCommand'] }).execCommand;
    const inserted = typeof exec === 'function' && exec.call(document, 'insertHTML', false, clean);
    if (!inserted) {
      const selection = document.getSelection();
      const range = selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const fragment = document.createRange().createContextualFragment(clean);
      if (range !== null && this.#content.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        range.insertNode(fragment);
      } else {
        this.#content.append(fragment);
      }
    }
    this.#afterEdit();
  }
}
