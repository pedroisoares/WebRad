# Rich Text Editor

`WebRichTextEditor` is a small WYSIWYG editor for descriptions, notes, and
replies. Its toolbar has bold, italic, underline, strike, heading, bulleted and
numbered lists, quote, link, and clear formatting. Ctrl+B, Ctrl+I, and Ctrl+U
also work, and toolbar captions follow the page language.

## Values

- `value` is the content as sanitized HTML, or `''` when the editor is empty.
  Save it in a text or `LONGTEXT` column and assign it back to show it again.
- `text` is the plain text, with a line break between paragraphs and list items.
  Assigning `text` creates one paragraph per line, with markup escaped.
- `isEmpty`, `clear()`, and `execute(command, argument?)` let code inspect and
  format the content; `execute('link', 'https://…')` creates a link without
  asking.

```ts
protected async BTNSalvarClick(): Promise<void> {
  if (!this.RTDescricao.validate()) return;
  await this.api.execute('salvarChamado', { body: { descricao: this.RTDescricao.value } });
}
```

## Sanitizing

Content is sanitized when it is assigned, pasted, and read. Only `p`, `div`,
`br`, `b`, `strong`, `i`, `em`, `u`, `s`, `span`, `h2`, `h3`, `ul`, `ol`, `li`,
`blockquote`, and `a` are kept, without attributes. Links keep an `href` only
for `http`, `https`, `mailto`, `tel`, anchors, and relative paths, and open in
a new tab with `rel="noopener noreferrer"`. Scripts, styles, frames, forms, and
images are removed; other tags keep only their text. `sanitizeRichTextHtml` and
`richTextToPlainText` are exported for HTML that comes from elsewhere, such as
an API response shown in an HTML component.

## Properties and events

| Property       | Default | Meaning                                                |
| -------------- | ------- | ------------------------------------------------------ |
| Value (HTML)   | empty   | Initial content.                                       |
| Placeholder    | empty   | Shown while the editor is empty.                       |
| Show Toolbar   | true    | Hide it for a plain formatted text box.                |
| Read Only      | false   | Shows the content without editing or toolbar commands. |
| Maximum Length | 0       | Most plain-text characters accepted by `validate()`.   |
| Required       | false   | `validate()` fails while the editor is empty.          |

**OnInput** fires on each edit; **OnChange** fires when the editor loses focus
with a different value.

The browser editing commands behind the toolbar (`document.execCommand`) are
deprecated but still supported by every current browser; the component
sanitizes their output like any other content.
