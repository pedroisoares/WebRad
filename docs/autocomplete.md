# Autocomplete

`WebAutocomplete` is a text box that suggests items while the user types. Use it
for lookups that are too large for a Combo Box, such as people, cities, or
equipment, where the server searches and returns only the matching rows.

## Static suggestions

Set **Items** in the Inspector. Typing filters them in the browser, ignoring case
and accents, and every typed word must appear: `sao jose` finds
`São José dos Campos`.

| Property           | Default | Meaning                                                          |
| ------------------ | ------- | ---------------------------------------------------------------- |
| Minimum Characters | 2       | Characters typed before searching; 0 lists suggestions on focus. |
| Search Delay (ms)  | 300     | Pause after the last keystroke before a search starts.           |
| Maximum Results    | 20      | Most suggestions shown; 0 shows all.                             |
| Require Selection  | true    | Typed text that is not a chosen suggestion leaves Value empty.   |
| Required           | false   | `validate()` fails until an item is chosen.                      |
| No Results Text    | empty   | Message when nothing matches; empty uses the page language.      |

## Server search

Bind a configured API Client operation in the page code. The typed term is sent
as the query parameter `q`, with `page_size` limited to Maximum Results, which is
the HexAPI and RestGO convention. Rows are read with JSON pointers.

```ts
protected override async OnLoad(): Promise<void> {
  this.ACPessoa.bindOperation(this.api, 'listarPessoas', {
    listPath: '/data',
    displayField: '/nome',
    keyField: '/id',
    detailField: '/cpf',
  });
}

protected ACPessoaSelect(sender: WebAutocomplete): void {
  const item = sender.selectedItem;
  if (item !== null) this.EDTCodigo.value = item.value;
}
```

Use `searchParameter` and `limitParameter` for other APIs; an empty
`limitParameter` sends no limit. The client keeps its authentication headers and
error events. For anything else, set `source` to a function that returns items,
or a promise of items:

```ts
this.ACCidade.source = async (term) => {
  const response = await fetch(`/cidades?nome=${encodeURIComponent(term)}`);
  const rows = (await response.json()) as { codigo: string; nome: string; uf: string }[];
  return rows.map((row) => ({ value: row.codigo, label: row.nome, detail: row.uf }));
};
```

Only the latest search updates the list, so slow responses never overwrite newer
ones. While a search runs the component sets `aria-busy` and shows a spinner.

## Values and events

- `value` is the chosen item's value; `text` is what is typed; `selectedItem`
  holds `value`, `label`, `detail`, and the original row in `data`.
- Assigning `value` selects the matching static item. With server search, assign
  `selectedItem = { value, label }` to show a saved record.
- **OnSelect** fires when an item is chosen, and with `item: null` when editing
  the text drops the choice. **OnChange** fires when the value changes.
  **OnSearch** fires with the `term` before each search.
- Typing a caption that exactly matches a suggestion and leaving the field
  chooses it.

The list is a WAI-ARIA `listbox` linked to the `combobox` input. Arrow keys move
through suggestions, Enter or Tab choose, and Escape closes the list.
