# Toasts and dialogs

WebRAD pages can notify and ask the user without the browser's `alert` and
`confirm` boxes. `Toast`, `ConfirmDialog`, and `MessageDialog` are available in
page code without an import, follow the application theme, and use the page
language (`pt` or `en`) for default button captions. `Message` and `Confirm`
remain available as the native browser boxes.

## Toast

A toast is a short notification that closes by itself.

```ts
protected async BTNSalvarClick(): Promise<void> {
  await this.api.execute('salvarChamado');
  Toast('Chamado salvo.', { kind: 'success', title: 'Chamado 42' });
}
```

| Option     | Default     | Meaning                                                               |
| ---------- | ----------- | --------------------------------------------------------------------- |
| `kind`     | `info`      | `info`, `success`, `warning`, or `error`.                             |
| `title`    | none        | Bold first line.                                                      |
| `duration` | 4000        | Milliseconds before closing (7000 for errors); 0 keeps it open.       |
| `position` | `top-right` | `top-` or `bottom-` with `right`, `left`, or `center`.                |
| `action`   | none        | `{ label, onClick }` button, such as "Desfazer"; it closes the toast. |

Toasts stack in one region per position. Hovering or focusing a toast pauses
its timer. Errors use `role="alert"`; other kinds use `role="status"`. `Toast`
returns a handle with `close()` and a `closed` promise.

## ConfirmDialog

`ConfirmDialog` opens a modal dialog and resolves `true` when the user confirms,
or `false` for Cancel and Escape.

```ts
protected async BTNExcluirClick(): Promise<void> {
  const confirmed = await ConfirmDialog('Excluir este usuário?', {
    title: 'Excluir usuário',
    confirmText: 'Excluir',
    kind: 'error',
  });
  if (!confirmed) return;
  await this.api.execute('excluirUsuario');
  Toast('Usuário excluído.', { kind: 'success' });
}
```

The default kind is `warning`. With `kind: 'error'`, the confirm button is
styled as destructive and Cancel starts focused, so pressing Enter does not
confirm by accident. Focus returns to the previous element when the dialog
closes.

## MessageDialog

`MessageDialog(message, { title, okText, kind })` shows a message in the same
modal style and resolves when the user closes it. Line breaks in the message are
kept.

Messages are always rendered as text, never as HTML.
