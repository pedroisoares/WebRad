# Edit masks, validation, and dates

`WebEdit` covers the SIGAT form fields: Brazilian document masks, phone and CEP
masks, required fields with validation, and date/time inputs in the page
language. Every option is an ordinary Inspector property, so pages saved before
these options keep their plain text inputs.

## Masks

| `mask`     | Example                            | Validation                            |
| ---------- | ---------------------------------- | ------------------------------------- |
| `cpf`      | 123.456.789-09                     | check digits                          |
| `cnpj`     | 11.222.333/0001-81                 | check digits                          |
| `cpf-cnpj` | switches to CNPJ after 11 digits   | check digits of the matching document |
| `phone`    | (19) 3834-1234 or (19) 99876-5432  | 10 or 11 digits                       |
| `cep`      | 13330-000                          | 8 digits                              |
| `custom`   | `maskPattern` such as `AAA-999999` | complete pattern                      |

In `maskPattern`, `9` is a digit, `A` a letter (uppercased), `*` a letter or
digit, and any other character is literal. The input reformats while typing,
keeps the caret after the same digit, limits its length, and opens the numeric
keyboard on phones for numeric masks. Assigning `value` from code formats it
too; `unmaskedValue` returns the value without punctuation for APIs.

## Validation

`required`, `minimum`, and `maximum` map to the native constraints. `validate()`
checks them together with e-mail/URL formats, mask completeness, and CPF/CNPJ
check digits, marks the field with `aria-invalid` and a localized browser
message, and returns whether it is valid. After the first validation, or once a
masked or required field has a value, leaving the field validates it again.
`isValid` checks silently and `clearValidation()` removes the mark.

```ts
public async Salvar(): Promise<void> {
  const ok = [this.Cpf, this.Email, this.Abertura].map((field) => field.validate());
  if (ok.includes(false)) return;
  await this.Api.execute('SalvarSolicitante', {
    parameters: { cpf: this.Cpf.unmaskedValue, abertura: this.Abertura.value },
  });
}
```

## Dates and times

`inputType` accepts `date`, `datetime-local`, `time`, and `month`. They use the
browser's native picker, which follows the operating system language (dd/mm/aaaa
in Portuguese). Values stay in the ISO format HexAPI and RestGO accept, while
`value`, `minimum`, and `maximum` also accept `dd/mm/yyyy`, `dd/mm/yyyy hh:mm`,
and MySQL `yyyy-mm-dd hh:mm:ss`, so SIGAT data can be assigned unchanged.
`dateValue` reads and writes a local `Date`, and `formattedValue` returns the
value formatted for the page language, such as `05/01/2024 14:30`.
