# SIGAT2

SIGAT2 is the first phase of the SIGAT → SIGAT2 migration: the screens of the
legacy SIGAT (CodeIgniter + jQuery) rebuilt as a WebRAD project. They read the
production `db_sigat` and OTOBO databases through the HexAPI catalog
`catalogos/sigat2.json`, and they leave the database structure as it is. Phase 1
covered the reads. Phase 2 adds writes on the Chamado page, including recording interactions (see
[Writes](#writes)). The remaining SIGAT write actions (open a chamado, close a
reparo, deliver equipment, and so on) are listed in the HexAPI inventory
`catalogos/SIGAT2-INVENTARIO.md`.

SIGAT2 does not copy SIGAT bugs. When the PHP code does something wrong, SIGAT2
does it correctly, and the inventory lists each fix.

Open [Sigat2.wrproj](Sigat2.wrproj) in the IDE and press **F9**.

## Regenerating

`examples/sigat2` is generated. Do not edit it by hand; change
`scripts/sigat2/build-project.ts` (pages and components) or
`scripts/sigat2/sources.ts` (authored TypeScript) and run:

```sh
node scripts/generate-sigat2.mjs                 # typechecks, then rewrites examples/sigat2
node scripts/generate-sigat2.mjs --build ./www   # also writes a deployable browser build
```

The generator compiles the project before it writes anything, so a TypeScript
or model error aborts it. Model IDs are seeded, so an unchanged generator
produces the same files.

## Connecting to HexAPI

**Project Settings → RestGo** points to `http://127.0.0.1:8090` with database
`sigat`. Every API Client uses the `restgo-session` connection and calls
`/v1/sigat/<endpoint>`. To run against a real HexAPI:

1. Import `catalogos/sigat2.json` into HexAPI (`HEXAPI_CATALOG_FILE`), with
   the MySQL users from `deploy/mysql-usuarios-hexapi.sql`: read-only users for
   `db_sigat` and `otobo`, and `hexapi_sigat_gravacao` for the writes.
2. Add the SIGAT2 origin to the HexAPI CORS list.
3. Sign in with a SIGAT login. After sign-in, the Login page reads
   `sessao-usuario` and turns the user's flags into roles: `nivel1`…`nivel4`,
   `admin`, `triagem`, `encerramento`, `inservivel` and `filaN`.

The roles only shape the interface. HexAPI enforces the same roles on every
publication.

## Writes

Each SIGAT write is a HexAPI **composite operation** on the `sigat-gravacao`
database: one transaction that changes the chamado and writes the SIGAT history
(`alteracao_chamado` and `evento`) with the same texts as the PHP code. The page
cannot skip the history, because the steps are defined on the server.

| Button (Chamado page)             | Operation                 | Shown when                                                             |
| --------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| Bloquear                          | `chamado-bloquear`        | the chamado is open and nobody holds it                                |
| Desbloquear                       | `chamado-desbloquear`     | the chamado is open and held by the user, or the user is level 3 or up |
| Priorizar / Remover prioridade    | `chamado-priorizar`       | the user has the `admin` role                                          |
| Editar → Salvar (Informações tab) | `chamado-alterar`         | the chamado is open and the user holds it or is level 3 or up          |
| (opening the Comunicação tab)     | `chamado-zerar-nao-lidos` | the user holds the chamado and it has unread e-mails                   |

The **Registrar interação** tab records an interaction. The choice of type picks
the operation; the text comes from the rich text editor and HexAPI cleans it
(parameter type `html`) before saving it:

| Type              | Operation                  | What else it does                                                                             |
| ----------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| Observação        | `interacao-observacao`     | nothing else                                                                                  |
| Alteração de fila | `interacao-alterar-fila`   | moves the chamado to another active queue and releases it                                     |
| Atendimento       | `interacao-atendimento`    | closes the chosen open services; closes the chamado when nothing is left (queues 5 to 8 only) |
| Deixar em espera  | `interacao-espera`         | puts the chosen open (or failed) equipment and open services on hold                          |
| Remover da espera | `interacao-remover-espera` | puts the chosen equipment and services on hold back to open                                   |

The tab is shown to the user who holds the chamado and to level 3 or up, while
the chamado is open. HexAPI checks this again, takes the user from the session
token and writes the interaction, the item changes and the `evento` rows in one
transaction.

HexAPI checks the same rules again; a refusal (for example the 3-lock limit on
queue 1) comes back as a 409 with the SIGAT message, shown in a toast.

`gravar()` in `units/Sigat2.ts` sends every write with an `Idempotency-Key`
header, one key per click. After a network failure, a timeout or a 5xx it retries
with the same key, so HexAPI never records the action twice.

## Visual signals

SIGAT attendants read a chamado's state from a fixed set of icons and badges
(see the SIGAT manual on ConsulTIC and `painel.js`, `Chamado::listar_chamados_painel`
and `ver_chamado.php`). SIGAT2 draws the same signals, in the same Bootstrap 4
colours, with the Lucide shapes WebRAD bundles. Every icon also has a text form,
so colour is never the only cue.

| Signal                     | SIGAT                                        | Meaning                                    |
| -------------------------- | -------------------------------------------- | ------------------------------------------ |
| Red star                   | `fa-star text-danger` (yellow before 1.9.1)  | Priority: serve before the others          |
| Yellow circle              | `fa-circle text-warning`                     | Open, waiting for service                  |
| Green circle               | `fa-circle text-success`                     | Closed (not yet ended)                     |
| Yellow clock               | `fa-clock text-warning`                      | No interaction for more than 6 h           |
| Red clock                  | `fa-clock text-danger`                       | No interaction for 24 h or more            |
| Blue envelope badge        | `badge-info fa-envelope`                     | Unread requester e-mail                    |
| Green / yellow truck badge | `badge-success` / `badge-warning` `fa-truck` | Ready / partly ready for delivery          |
| Grey queue badge           | `badge-secondary` + `fila.icone_fila`        | The chamado's queue                        |
| Lock                       | `fa-lock` count in the header                | Chamados the user holds (3 max in queue 1) |

Where they appear:

- **Painel**: laid out like the SIGAT painel. The Status column shows the star or
  circle. The clock and the e-mail badge follow the requester's name, which is bold
  when an e-mail is unread. The queue and delivery badges follow the location, as in
  `Chamado::listar_chamados_painel`. The page computes these images from each
  `painel-chamados` row (`prepararLinhasDoPainel` in `units/Sigat2.ts`), and
  `sinaisNaLista` draws them after the cell text. The cells keep their text, so
  sorting and searching on Solicitante and Local still work. Each image has a
  tooltip and alt text with its meaning, and the status icon's tooltip gives the
  full situation. The row under the mouse turns bisque, as in SIGAT. The painel
  refreshes every 2 minutes while it is open.
- **Chamado**: the title shows the queue icon and the priority star, as in
  `ver_chamado.php`, and the Comunicação tab carries the unread e-mail count. The
  SIGAT "Este local não acessa a infovia" warning sits under the title. The
  earlier SIGAT2-only strip of status signals was removed so the page matches
  production.

## Chamado page

The page follows `ver_chamado.php` inside the signed-in frame: a breadcrumb
(Painel / Ver chamado / #id), a header with the ticket number and its OTOBO link,
Imprimir, Relatório detalhado (level 4), the Prioridade checkbox and
Bloquear/Desbloquear, then seven tabs with Lucide icons:

- **Informações**: read-only fields in the production layout. **Editar** turns
  Solicitante, Celular, Telefone and Local (autocomplete on `locais-nomes`) into
  inputs, and Responsável into a select of `usuarios-ativos` for level 3 or up;
  Salvar and Cancelar replace Editar and Bloquear is hidden. Salvar calls
  `chamado-alterar`, which checks the same rules again and writes one history line
  with only the fields that changed. The map pin opens the local's address and
  telephones.
- **Comunicação**: the ticket's e-mails as an accordion (sender and date, newest
  open), then the attachments grid when there are any. Opening the tab clears the
  unread count.
- **Reparos**, **Equipamentos** and **Infraestrutura**: the SIGAT grids, with
  "Lista vazia." or "Vazio" when empty.
- **Interações**: the interactions in the Bootstrap `table-*` colours of
  `chamado.js`, and **Nova interação**, which opens the register form.
- **Histórico**: one card per `alteracao_chamado` row with the teal date badge.

Imprimir and Relatório detalhado build a printable HTML page from the read
endpoints and open the browser's print dialog, with the SIGAT letterhead (city
coat of arms, CGTI logo and "Página n/total") on every page. The detailed report
follows `imprimir_relatorio_chamado`: Informações, Equipamentos with their repairs
and repair history, Serviços, Interações (pictures pasted in an interaction are
printed), Comunicação and Histórico. It fixes two SIGAT bugs: repairs without a
date printed 31/12/1969, and e-mail dates were printed in UTC. Still missing,
because their writes or sources are not in HexAPI yet: **Enviar e-mail**
(Comunicação), **Desfazer** on an interaction, the BGInfo block of the detailed
report and the termo PDFs SIGAT appends to it (the report lists the termos).

## Signed-in frame and Painel

Every signed-in page uses the SIGAT frame (`templates/cabecalho.php` and
`templates/rodape.php`). The dark navbar holds the star logo and "SIGAT", the
quick search, "Olá, name!", the yellow lock badge with the user's lock count, and
the Painel, Remessas de inservíveis, Administração and Sair buttons. The dark
footer holds the user's group badge (`grupo.cor_grupo`), the environment and the
project version. Only the content between the two bars scrolls, so a wide list's
horizontal scrollbar sits above the footer, not under it as in SIGAT.

The Painel has the Triagem, Chamados and Arquivo tabs, with Chamados open. Its
queue buttons come from `filas` (up to 12), followed by Entrega (shown when
`painel-indicadores` reports deliveries), Todos, Imprimir and the broom. The
selected button carries the chamado count and the darker Bootstrap "active"
colour. As SIGAT does with its `fila_painel` cookie, the painel reopens the
queue chosen last, and otherwise the user's own queue. A few controls differ from
SIGAT:

- Imprimir prints the painel as listed. SIGAT printed the chamados ticked in a
  checkbox column, and SIGAT2 has no endpoint for that yet.
- The broom clears the list's search, sort and page size, as SIGAT's
  `resetPainelChamados` does.
- The lock badge opens the user's page for admins, and shows a count message for
  everyone else. SIGAT opened a list of the locked chamados.

SIGAT showed no clock when the wait was exactly 24 hours (it compared whole
hours with `>= 6 && < 24` and `> 24`). SIGAT2 uses 6 h and 24 h as the
boundaries.

## Administração

The Admin page copies `paginas/admin.php`: the "Administração" title over a
rule, then Bootstrap nav-pills in the SIGAT order (Log de Eventos, Usuários,
Modelos de Mensagem, Locais, Secretarias, Serviços, Bancadas), plus a Filas tab
that SIGAT does not have. Each list is read the first time its tab opens.

**Log de Eventos** is the SIGAT DataTable (`admin/listar_eventos`): the last
2,000 `evento` rows from `admin-eventos`, newest ID first, 10 per page (10, 25,
50 or 100), the "Busca:" box and a filter row with one "Procurar …" box per
column (the Data Grid `columnFilters` option). Like SIGAT, it reloads every 30
seconds while its tab is open and keeps the page, sort and filters. The hour is
printed with two digits (`08:54:06`); SIGAT prints `8:54:06`.

**Usuários, Modelos de Mensagem, Locais, Secretarias, Serviços, Bancadas and
Filas** are cadastro screens. Each lists every row, active or not, 10 per page with the
filter row, an "Ativo?" checkbox column and a pencil button per row. "Novo …"
and the pencil open the same modal form. As in the SIGAT insert row, a new
record's Ativo box is ticked and locked; the edit form unlocks it, which is how a
record is switched off. Combos list the active filas and secretarias, plus the
one a record already has. Salvar calls the HexAPI composite operation on
`sigat-gravacao` through `gravar()`, so one click is one write even after a
retry, and the operation records the SIGAT event in the same transaction. A
refusal (empty or repeated name, a fila with open chamados, a complexity out of
1 to 5) keeps the form open and shows the HexAPI message; a success closes it and
reads the list again.

- Locais adds a phone button per row. It opens the local's telefones: the list
  over one form that adds a telefone, or edits or deletes the one picked with
  its pencil. Clicking any other cell of a local opens its Local page.
- Serviços checks the SIGAT rules before writing: unit of 1 to 3 letters,
  complexity 1 to 5 and a value such as `99.99` (a comma is accepted too).
- Unlike SIGAT, editing a bancada also saves its name.

- Usuários edits the name, network login (what LDAP checks and HexAPI looks up
  at login), authorization (Operação, Supervisão, Master), panel fila and the
  Triagem, Encerramento and Inservíveis permissions. HexAPI refuses a repeated
  login, editing the system user and removing one's own Master access. New
  permissions apply at the user's next login. Clicking any other cell of a user
  opens its Usuário page.

## Pages

| Page                | SIGAT screen                        | Endpoints                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login               | Login                               | `sessao-usuario`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Painel (`index`)    | Painel (chamados, triagem, arquivo) | `filas`, `painel-chamados`, `painel-indicadores`, `triagem`, `painel-encerrados`                                                                                                                                                                                                                                                                                                                                                            |
| Chamado             | Chamado                             | writes: `chamado-bloquear`, `chamado-desbloquear`, `chamado-priorizar`, `chamado-alterar`, `chamado-zerar-nao-lidos`; reads: `chamado-detalhe`, `usuarios-ativos`, `locais-nomes`, `chamado-interacoes`, `chamado-equipamentos`, `chamado-servicos`, `chamado-reparos`, `reparo-historico`, `ticket-artigos`, `chamado-historico`, `chamado-anexos`, `chamado-termos`, `chamado-telefones`                                                  |
| Triagem             | Triagem of an OTOBO ticket          | `triagem-ticket`, `ticket-artigos`, `ticket-anexos`, `ticket-importado`                                                                                                                                                                                                                                                                                                                                                                     |
| Equipamento         | Equipment history                   | `equipamento`, `equipamento-chamados`                                                                                                                                                                                                                                                                                                                                                                                                       |
| Busca               | Quick search                        | `busca-equipamentos`, `busca-chamados`                                                                                                                                                                                                                                                                                                                                                                                                      |
| Inserviveis/Remessa | Inservíveis                         | `remessas`, `remessa`, `remessa-equipamentos`                                                                                                                                                                                                                                                                                                                                                                                               |
| Admin               | Administration                      | writes: `usuario-inserir`/`-alterar`, `modelo-mensagem-inserir`/`-alterar`, `local-inserir`/`-alterar`, `telefone-local-inserir`/`-alterar`/`-excluir`, `servico-inserir`/`-alterar`, `bancada-inserir`/`-alterar`, `secretaria-inserir`/`-alterar`, `fila-inserir`/`-alterar`; reads: `local-telefones`, `admin-usuarios`, `admin-locais`, `admin-servicos`, `admin-filas`, `secretarias`, `bancadas`, `modelos-mensagem`, `admin-eventos` |
| Usuario             | User profile                        | `usuario-perfil`, `usuario-produtividade`, `usuario-bloqueados`                                                                                                                                                                                                                                                                                                                                                                             |
| Local               | Location                            | `local`, `local-telefones`, `secretarias`                                                                                                                                                                                                                                                                                                                                                                                                   |
| Negado, 404         | Access denied, not found            | none                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Pages pass the selected chamado, ticket, equipment and so on through
`sessionStorage` (see `units/Sigat2.ts`), because `Navigate` keeps the current
query string.
