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

| Button (Chamado page)                 | Operation                 | Shown when                                                             |
| ------------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| Bloquear                              | `chamado-bloquear`        | the chamado is open and nobody holds it                                |
| Desbloquear                           | `chamado-desbloquear`     | the chamado is open and held by the user, or the user is level 3 or up |
| Priorizar / Remover prioridade        | `chamado-priorizar`       | the user has the `admin` role                                          |
| (opening the "E-mails do ticket" tab) | `chamado-zerar-nao-lidos` | the user holds the chamado and it has unread e-mails                   |

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

- **Painel**: Status icon, a text Situação column, an Alertas strip (clock,
  e-mail, truck), the queue badge and the time since the last interaction, as in
  SIGAT. The page computes these columns from each `painel-chamados` row
  (`prepararLinhasDoPainel` in `units/Sigat2.ts`) before the grid draws it, so
  they are not sortable on the server. Above the grid, `painel-indicadores` feeds
  counters for the selected queue: open, priority, 24 h+ and 6 to 24 h without
  interaction, without anyone assigned, unread e-mails, deliveries and the user's
  locks. A legend below the grid explains each icon. The painel refreshes every
  2 minutes while it is open.
- **Chamado**: a strip under the title with the status, queue, who holds the
  chamado (or "Livre: bloqueie antes de atender"), the time without interaction,
  unread e-mails, delivery, equipment on hold and the SIGAT "Este local não acessa
  a infovia" warning.

SIGAT showed no clock when the wait was exactly 24 hours (it compared whole
hours with `>= 6 && < 24` and `> 24`). SIGAT2 uses 6 h and 24 h as the
boundaries.

## Pages

| Page                | SIGAT screen                        | Endpoints                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Login               | Login                               | `sessao-usuario`                                                                                                                                                                                                                                                                                                                     |
| Painel (`index`)    | Painel (chamados, triagem, arquivo) | `filas`, `painel-chamados`, `painel-indicadores`, `triagem`, `painel-encerrados`                                                                                                                                                                                                                                                     |
| Chamado             | Chamado                             | writes: `chamado-bloquear`, `chamado-desbloquear`, `chamado-priorizar`, `chamado-zerar-nao-lidos`; reads: `chamado-detalhe`, `chamado-interacoes`, `chamado-equipamentos`, `chamado-servicos`, `chamado-reparos`, `reparo-historico`, `ticket-artigos`, `chamado-historico`, `chamado-anexos`, `chamado-termos`, `chamado-telefones` |
| Triagem             | Triagem of an OTOBO ticket          | `triagem-ticket`, `ticket-artigos`, `ticket-anexos`, `ticket-importado`                                                                                                                                                                                                                                                              |
| Equipamento         | Equipment history                   | `equipamento`, `equipamento-chamados`                                                                                                                                                                                                                                                                                                |
| Busca               | Quick search                        | `busca-equipamentos`, `busca-chamados`                                                                                                                                                                                                                                                                                               |
| Inserviveis/Remessa | Inservíveis                         | `remessas`, `remessa`, `remessa-equipamentos`                                                                                                                                                                                                                                                                                        |
| Admin               | Administration                      | `admin-usuarios`, `admin-locais`, `admin-servicos`, `admin-filas`, `secretarias`, `bancadas`, `modelos-mensagem`, `admin-eventos`                                                                                                                                                                                                    |
| Usuario             | User profile                        | `usuario-perfil`, `usuario-produtividade`, `usuario-bloqueados`                                                                                                                                                                                                                                                                      |
| Local               | Location                            | `local`, `local-telefones`, `secretarias`                                                                                                                                                                                                                                                                                            |
| Negado, 404         | Access denied, not found            | none                                                                                                                                                                                                                                                                                                                                 |

Pages pass the selected chamado, ticket, equipment and so on through
`sessionStorage` (see `units/Sigat2.ts`), because `Navigate` keeps the current
query string.
