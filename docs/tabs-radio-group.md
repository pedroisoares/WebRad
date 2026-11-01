# Tabs and Radio Group

## Tabs

`WebTabs` is a tab strip. Each tab shows one named component, usually a Panel,
and hides the others, so every tab's content stays an ordinary component with
its own layout, styles, and typed instance.

1. Place the strip and one Panel per tab on the page, usually stacked in the
   same column.
2. Set **Tabs** to the captions, for example `Dados gerais`, `Histórico`.
3. Set **Panels** to the Panel names in the same order, for example
   `PNLDadosGerais`, `PNLHistorico`. A tab with an empty entry shows nothing.

Hidden panels collapse by default, so the selected panel takes the space.
Names are resolved within the same page or reusable placement. The strip is a
WAI-ARIA `tablist`: tabs link to their panels with `aria-controls`, and the arrow
keys, Home, and End move between tabs.

```ts
this.Abas.selectTab('Histórico'); // caption or panel name
this.Abas.selectedIndex = 0;

public AbaAlterada(_sender: WebTabs, event: CustomEvent<WebTabChangeEventDetail>): void {
  const { index, caption, panel, previousIndex } = event.detail;
}
```

`OnChange` fires only when the user changes the tab.

## Radio Group

`WebRadioGroup` is a `fieldset` of native radio buttons with an optional
caption rendered as its legend. **Items** are the captions, **Values** are
optional values sent to code and APIs (one per item, defaulting to the
caption), and **Orientation** is vertical or horizontal. `value`,
`selectedIndex`, and `selectedItem` read or change the selection; `required`
with `validate()` marks an unanswered group with `aria-invalid`. Disabling the
component disables every option through the fieldset.
