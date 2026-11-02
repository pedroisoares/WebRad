# SIGAT2

SIGAT2 is the first phase of the SIGAT → SIGAT2 migration: the screens of the
legacy SIGAT (CodeIgniter + jQuery) rebuilt as a WebRAD project. They read the
production `db_sigat` and OTOBO databases through the HexAPI catalog
`catalogos/sigat2.json`, and they leave the database structure as it is. Phase 1
covered the reads. Phase 2 adds the first writes on the Chamado page (see
[Writes](#writes)). The remaining SIGAT write actions (open a chamado, record an
interaction, close a reparo, deliver equipment, and so on) are listed in the HexAPI
inventory `catalogos/SIGAT2-INVENTARIO.md`.

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

HexAPI checks the same rules again; a refusal (for example the 3-lock limit on
queue 1) comes back as a 409 with the SIGAT message, shown in a toast.

`gravar()` in `units/Sigat2.ts` sends every write with an `Idempotency-Key`
header, one key per click. After a network failure, a timeout or a 5xx it retries
with the same key, so HexAPI never records the action twice.

## Pages

| Page                | SIGAT screen                        | Endpoints                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Login               | Login                               | `sessao-usuario`                                                                                                                                                                                                                                                                                                                     |
| Painel (`index`)    | Painel (chamados, triagem, arquivo) | `filas`, `painel-chamados`, `triagem`, `painel-encerrados`                                                                                                                                                                                                                                                                           |
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
