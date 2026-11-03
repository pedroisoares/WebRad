/**
 * Builds the SIGAT2 example project: the first-phase screens of the SIGAT -> SIGAT2
 * migration, every one of them backed by the read-only HexAPI catalog
 * (`catalogos/sigat2.json` in the hexapi repository).
 *
 * The output is an ordinary editable WebRAD project. Run
 * `node scripts/generate-sigat2.mjs` to regenerate `examples/sigat2`.
 */
import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  applyDefaultComponentStyle,
  applyProjectThemePreset,
  createDefaultApiClientConfiguration,
  createDefaultComponentLayout,
  createDefaultDataGridConfiguration,
  createPage,
  createProject,
  defaultIdFactory,
  parseProject,
  type ApiClientBodyParameterType,
  type ApiClientFieldType,
  type ApiClientResponseSchema,
  type ComponentLayout,
  type ComponentStyleProperties,
  type ComponentNode,
  type ComponentStyleModel,
  type DataGridColumn,
  type PageModel,
  type WebRadProject,
} from '@webrad/project-model';
import type { WebRadIconName } from '@webrad/runtime/icons';
import { SIGAT_LOGO_SVG } from './logo.js';
import { SIGAT2_SOURCES } from './sources.js';

// ---------------------------------------------------------------- layout helpers

interface Node {
  readonly type: string;
  readonly name: string;
  readonly id?: string;
  readonly width?: number;
  readonly height?: number;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly events?: Readonly<Record<string, string>>;
  readonly container?: Partial<ComponentLayout['container']>;
  readonly item?: Partial<ComponentLayout['item']>;
  /** A project style to use instead of the component type's default style. */
  readonly styleId?: string;
  readonly children?: readonly Node[];
}

interface PageSpec {
  readonly name: string;
  readonly caption: string;
  readonly roles: readonly string[];
  readonly events: Readonly<Record<string, string>>;
  readonly header: boolean;
  readonly children: readonly Node[];
  /** Page style and root layout overrides (the Login page uses them). */
  readonly styleId?: string;
  readonly container?: Partial<ComponentLayout['container']>;
}

function compose(
  document: PageModel,
  styles: readonly ComponentStyleModel[],
  spec: PageSpec,
  version: string,
): PageModel {
  const root = document.components.find((node) => node.id === document.rootComponentId);
  if (!root) throw new Error('Document has no root.');
  const components: ComponentNode[] = [];
  const add = (node: Node, parentId: string): string => {
    const definition = defaultComponentRegistry.require(node.type);
    const created = defaultComponentRegistry.createComponent(node.type, {
      id: node.id,
      name: node.name,
      parentId,
      existingNames: [root, ...components],
      width: node.width,
      height: node.height,
      props: node.props,
      events: node.events,
    });
    const index = components.length;
    components.push(created);
    const children = (node.children ?? []).map((child) => add(child, created.id));
    components[index] = applyDefaultComponentStyle(
      {
        ...created,
        ...(node.styleId === undefined ? {} : { styleId: node.styleId }),
        children,
        layout: {
          container: definition.canHaveChildren
            ? { ...created.layout.container, mode: 'column', gap: 12, ...node.container }
            : created.layout.container,
          item: {
            ...created.layout.item,
            width: 'stretch',
            height: 'fixed',
            shrink: false,
            ...node.item,
          },
        },
      },
      styles,
    );
    return created.id;
  };
  // Signed-in pages copy the SIGAT frame: navbar, content and footer. The content is the
  // only part that scrolls, so its horizontal scrollbar stays above the footer.
  const body: readonly Node[] = spec.header
    ? [
        header(),
        {
          type: 'WebGroup',
          name: 'Conteudo',
          styleId: SIGAT_STYLE.conteudo,
          item: { height: 'stretch', minHeight: 0, shrink: true },
          container: {
            mode: 'column',
            gap: 16,
            alignItems: 'stretch',
            paddingTop: 16,
            paddingRight: 24,
            paddingBottom: 24,
            paddingLeft: 24,
          },
          children: spec.children,
        },
        footer(version),
      ]
    : spec.children;
  const childIds = body.map((child) => add(child, root.id));
  const layout = createDefaultComponentLayout();
  return {
    ...document,
    components: [
      applyDefaultComponentStyle(
        {
          ...root,
          ...(spec.styleId === undefined
            ? spec.header
              ? { styleId: SIGAT_STYLE.pagina }
              : {}
            : { styleId: spec.styleId }),
          children: childIds,
          props: {
            ...root.props,
            caption: spec.caption,
            browserTitle: 'SIGAT2 | ' + spec.caption,
            allowedRoles: [...spec.roles],
          },
          events: { ...root.events, ...spec.events },
          layout: {
            ...layout,
            item: spec.header
              ? { ...layout.item, height: 'stretch', minHeight: 0 }
              : { ...layout.item, height: 'fit-content', minHeight: 600 },
            container: {
              ...layout.container,
              mode: 'column',
              gap: spec.header ? 0 : 16,
              alignItems: 'stretch',
              ...(spec.header
                ? { paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 }
                : { paddingTop: 16, paddingRight: 24, paddingBottom: 24, paddingLeft: 24 }),
              ...spec.container,
            },
          },
        },
        styles,
      ),
      ...components,
    ],
  };
}

function label(name: string, caption: string, height = 28): Node {
  return { type: 'WebLabel', name, height, props: { caption, autoSize: false } };
}

function title(name: string, caption: string): Node {
  return label(name, caption, 36);
}

function edit(name: string, placeholder: string, props: Record<string, unknown> = {}): Node {
  return { type: 'WebEdit', name, height: 40, props: { value: '', placeholder, ...props } };
}

function button(
  name: string,
  caption: string,
  handler: string,
  icon: WebRadIconName,
  roles: readonly string[] = [],
): Node {
  return {
    type: 'WebButton',
    name,
    width: 180,
    height: 40,
    props: { caption, icon, ...(roles.length > 0 ? { allowedRoles: [...roles] } : {}) },
    events: { OnClick: handler },
    item: { width: 'fixed', minWidth: 120, maxWidth: 220, grow: 0, shrink: true },
  };
}

function row(name: string, children: readonly Node[]): Node {
  return {
    type: 'WebGroup',
    name,
    item: { height: 'fit-content' },
    container: { mode: 'row', gap: 12, wrap: true, alignItems: 'center' },
    children,
  };
}

function combo(name: string, items: readonly string[] = [], onChange?: string): Node {
  return {
    type: 'WebComboBox',
    name,
    width: 320,
    height: 40,
    props: { items: [...items], selectedIndex: items.length > 0 ? 0 : -1, value: items[0] ?? '' },
    item: { width: 'fixed', minWidth: 200, grow: 0, shrink: true },
    ...(onChange === undefined ? {} : { events: { OnChange: onChange } }),
  };
}

function listBox(name: string, height: number): Node {
  return {
    type: 'WebListBox',
    name,
    height,
    props: { items: [], selectedIndex: -1, multiple: true },
  };
}

function richText(name: string, placeholder: string, height: number): Node {
  return { type: 'WebRichTextEditor', name, height, props: { value: '', placeholder } };
}

function panel(name: string, children: readonly Node[]): Node {
  return {
    type: 'WebPanel',
    name,
    width: 600,
    item: { width: 'stretch', height: 'fit-content', minWidth: 0, grow: 0, shrink: true },
    container: { paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16, gap: 10 },
    children,
  };
}

/** Two-column grid of read-only key/value labels; values are filled by page code. */
function details(name: string, fields: readonly (readonly [string, string])[]): Node {
  return {
    type: 'WebGroup',
    name,
    item: { height: 'fit-content' },
    container: { mode: 'row', gap: 8, wrap: true, alignItems: 'start' },
    children: fields.map(([field, caption]) => ({
      type: 'WebGroup',
      name: name + field,
      width: 260,
      item: { width: 'fixed', height: 'fit-content', minWidth: 220, grow: 1, shrink: true },
      container: { mode: 'column', gap: 2 },
      children: [label('LBL' + field, caption, 20), label(field, '-', 26)],
    })),
  };
}

function tabs(
  name: string,
  captions: readonly string[],
  panels: readonly string[],
  onChange?: string,
): Node {
  return {
    type: 'WebTabs',
    name,
    height: 44,
    props: { tabs: [...captions], panels: [...panels], selectedIndex: 0 },
    ...(onChange === undefined ? {} : { events: { OnChange: onChange } }),
  };
}

function html(name: string, height = 420, title = name): Node {
  return { type: 'WebHtml', name, height, props: { html: '', title } };
}

/** A Bootstrap 4 small button (`btn btn-sm btn-*`) of the SIGAT navbar and painel. */
function sigatButton(
  name: string,
  caption: string,
  handler: string,
  icon: WebRadIconName,
  styleId: string,
  roles: readonly string[] = [],
): Node {
  return {
    type: 'WebButton',
    name,
    height: 31,
    props: { caption, icon, ...(roles.length > 0 ? { allowedRoles: [...roles] } : {}) },
    events: { OnClick: handler },
    styleId,
    item: { width: 'fit-content', grow: 0, shrink: false },
  };
}

function sigatLabel(name: string, caption: string, styleId: string, height = 24): Node {
  return {
    ...label(name, caption, height),
    styleId,
    item: { width: 'fit-content', grow: 0, shrink: false },
  };
}

/**
 * The SIGAT navbar (`templates/cabecalho.php`), shown on every signed-in page: the star
 * logo and "SIGAT" on the left, the quick search in the middle and, on the right, the
 * greeting, the user's lock count, Painel, Inservíveis, Administração and Sair.
 */
function header(): Node {
  return {
    type: 'WebGroup',
    name: 'Cabecalho',
    styleId: SIGAT_STYLE.barra,
    item: { height: 'fit-content', shrink: false },
    container: {
      mode: 'row',
      gap: 16,
      wrap: true,
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 8,
      paddingRight: 16,
      paddingBottom: 8,
      paddingLeft: 16,
    },
    children: [
      {
        type: 'WebGroup',
        name: 'GRPMarca',
        item: { width: 'fit-content', height: 'fit-content', grow: 0 },
        container: { mode: 'row', gap: 8, alignItems: 'center' },
        children: [
          {
            type: 'WebImage',
            name: 'IMGMarca',
            width: 40,
            height: 40,
            props: { src: 'assets/imported/' + LOGIN_LOGO_ASSET, alt: '' },
            styleId: LOGIN_STYLE.logo,
            item: { width: 'fixed', grow: 0, shrink: false },
          },
          sigatLabel('LBLMarca', 'SIGAT', SIGAT_STYLE.marca, 40),
        ],
      },
      {
        type: 'WebGroup',
        name: 'GRPBusca',
        item: { width: 'fit-content', height: 'fit-content', grow: 0, shrink: true },
        container: { mode: 'row', gap: 0, alignItems: 'center' },
        children: [
          {
            ...edit('EDTBuscaRapida', 'Busca rápida...'),
            height: 38,
            width: 300,
            styleId: SIGAT_STYLE.busca,
            item: { width: 'fixed', minWidth: 160, grow: 0, shrink: true },
            events: { OnKeyDown: 'BuscaRapidaTecla' },
          },
          {
            ...sigatButton('BTNBuscar', 'Buscar', 'BuscaRapida', 'search', SIGAT_STYLE.botaoBusca),
            width: 42,
            height: 38,
            item: { width: 'fixed', grow: 0, shrink: false },
          },
        ],
      },
      {
        type: 'WebGroup',
        name: 'GRPUsuario',
        item: { width: 'fit-content', height: 'fit-content', grow: 0 },
        container: { mode: 'row', gap: 4, wrap: true, alignItems: 'center' },
        children: [
          sigatLabel('LBLOla', 'Olá,', SIGAT_STYLE.textoClaro),
          sigatLabel('LBLUsuario', '', SIGAT_STYLE.textoClaroForte),
          {
            ...sigatButton(
              'BTNBloqueados',
              '0',
              'MostrarBloqueados',
              'lock',
              SIGAT_STYLE.seloBloqueados,
            ),
            height: 26,
          },
          sigatButton('BTNPainel', 'Painel', 'AbrirPainel', 'menu', SIGAT_STYLE.botaoPrimario),
          sigatButton(
            'BTNInserviveis',
            'Remessas de inservíveis',
            'AbrirInserviveis',
            'cart',
            SIGAT_STYLE.botaoPrimario,
            ['inservivel'],
          ),
          sigatButton(
            'BTNAdmin',
            'Administração',
            'AbrirAdmin',
            'settings',
            SIGAT_STYLE.botaoSecundario,
            ['admin'],
          ),
          sigatButton('BTNSair', 'Sair', 'Sair', 'sign-out', SIGAT_STYLE.botaoPerigo),
        ],
      },
    ],
  };
}

/**
 * The SIGAT footer (`templates/rodape.php`): the user's group badge, the environment and
 * the version, right-aligned on a dark bar fixed to the bottom of the window.
 */
function footer(version: string): Node {
  return {
    type: 'WebGroup',
    name: 'Rodape',
    styleId: SIGAT_STYLE.barra,
    item: { height: 'fit-content', shrink: false },
    container: {
      mode: 'row',
      gap: 4,
      wrap: true,
      alignItems: 'center',
      justifyContent: 'end',
      paddingTop: 8,
      paddingRight: 16,
      paddingBottom: 8,
      paddingLeft: 16,
    },
    children: [
      sigatLabel('LBLRodapeAutorizacao', 'Autorização:', SIGAT_STYLE.rodape, 20),
      sigatLabel('LBLRodapeGrupo', '-', SIGAT_STYLE.selo, 18),
      sigatLabel(
        'LBLRodapeAmbiente',
        '| Ambiente: production | Versão: ' + version + ' | SEAD/CGTI',
        SIGAT_STYLE.rodape,
        20,
      ),
    ],
  };
}

// ---------------------------------------------------------------- API helpers

type Fields = Readonly<Record<string, ApiClientFieldType>>;

interface Operation {
  readonly id: string;
  readonly name: string;
  readonly endpoint: string;
  readonly banco?: string;
  readonly params?: readonly string[];
  readonly fields: Fields;
  /** JSON body parameters of a POST to a HexAPI composite operation. */
  readonly body?: Readonly<Record<string, ApiClientBodyParameterType>>;
}

function responseSchema(fields: Fields): ApiClientResponseSchema {
  const node = (name: string, path: string, fieldType: ApiClientFieldType) => ({
    id: defaultIdFactory(),
    name,
    path,
    kind: 'field' as const,
    fieldType,
    nullable: name !== 'success',
    children: [],
  });
  return {
    version: 1,
    root: {
      id: defaultIdFactory(),
      name: 'Response',
      path: '',
      kind: 'object',
      fieldType: 'object',
      nullable: false,
      children: [
        node('success', '/success', 'boolean'),
        {
          id: defaultIdFactory(),
          name: 'data',
          path: '/data',
          kind: 'list',
          fieldType: 'list',
          nullable: false,
          children: Object.entries(fields).map(([name, type]) =>
            node(name, '/data/*/' + name, type),
          ),
        },
        node('page', '/page', 'integer'),
        node('page_size', '/page_size', 'integer'),
        node('total_pages', '/total_pages', 'integer'),
        node('total', '/total', 'integer'),
        node('has_more', '/has_more', 'boolean'),
      ],
    },
  };
}

/** Response of a HexAPI composite operation: { success, data: { passos: {...} } }. */
function writeSchema(): ApiClientResponseSchema {
  return {
    version: 1,
    root: {
      id: defaultIdFactory(),
      name: 'Response',
      path: '',
      kind: 'object',
      fieldType: 'object',
      nullable: false,
      children: [
        {
          id: defaultIdFactory(),
          name: 'success',
          path: '/success',
          kind: 'field',
          fieldType: 'boolean',
          nullable: false,
          children: [],
        },
        {
          id: defaultIdFactory(),
          name: 'data',
          path: '/data',
          kind: 'field',
          fieldType: 'unknown',
          nullable: true,
          children: [],
        },
      ],
    },
  };
}

/** A write: POST to a composite operation published on the sigat-gravacao database. */
function write(
  name: string,
  endpoint: string,
  body: Readonly<Record<string, ApiClientBodyParameterType>>,
): Operation {
  return { id: defaultIdFactory(), name, endpoint, banco: 'sigat-gravacao', fields: {}, body };
}

function op(
  name: string,
  endpoint: string,
  fields: Fields,
  params: readonly string[] = [],
  banco = 'sigat',
): Operation {
  return { id: defaultIdFactory(), name, endpoint, banco, params, fields };
}

function apiClient(name: string, id: string, operations: readonly Operation[]): Node {
  const base = createDefaultApiClientConfiguration();
  const template = base.operations[0];
  if (!template) throw new Error('Default API Client operation is missing.');
  return {
    type: 'WebApiClient',
    id,
    name,
    props: {
      apiClientConfig: {
        ...base,
        connection: 'restgo-session',
        timeoutMs: 30_000,
        operations: operations.map((operation) => ({
          ...template,
          id: operation.id,
          name: operation.name,
          method: operation.body === undefined ? 'GET' : 'POST',
          path: `${operation.banco ?? 'sigat'}/${operation.endpoint}`,
          apiVersion: 1,
          ...(operation.body === undefined
            ? {}
            : {
                body: {
                  kind: 'json' as const,
                  content:
                    '{ ' +
                    Object.keys(operation.body)
                      .map((param) => `"${param}": <${param}>`)
                      .join(', ') +
                    ' }',
                  parameters: Object.entries(operation.body).map(([param, type]) => ({
                    name: param,
                    type,
                  })),
                },
              }),
          query: (operation.params ?? []).map((param) => ({
            id: defaultIdFactory(),
            name: param,
            value: '',
            enabled: false,
          })),
          responseSchema:
            operation.body === undefined ? responseSchema(operation.fields) : writeSchema(),
        })),
      },
    },
  };
}

/**
 * A grid column. `computed` columns are filled by page code from the row (for example the
 * SIGAT signal icons), so they are not part of the endpoint contract and the server cannot
 * sort or search them.
 */
interface ColumnOptions {
  readonly image?: boolean;
  /** Smallest width of a dynamic column, so a wide list scrolls instead of squeezing it. */
  readonly minWidth?: number;
  readonly computed?: boolean;
  readonly align?: 'start' | 'center' | 'end';
}

type Column = readonly [header: string, field: string, width?: number, options?: ColumnOptions];

function grid(
  name: string,
  clientId: string,
  operation: Operation,
  columns: readonly Column[],
  options: {
    readonly server?: boolean;
    readonly height?: number;
    readonly onCell?: string;
    readonly empty?: string;
  } = {},
): Node {
  const base = createDefaultDataGridConfiguration();
  const column = base.columns[0];
  if (!column) throw new Error('Default Data Grid column is missing.');
  for (const [, field, , extra] of columns)
    if (extra?.computed !== true && !(field in operation.fields))
      throw new Error(`${name}: field ${field} is not returned by ${operation.endpoint}.`);
  return {
    type: 'WebDataGrid',
    name,
    height: options.height ?? 460,
    props: {
      dataGridConfig: {
        ...base,
        apiClientId: clientId,
        operationId: operation.id,
        listPath: '/data',
        columnCount: columns.length,
        stripedRows: true,
        emptyMessage: options.empty ?? 'Nenhum registro',
        pagination: options.server === true ? 'server' : 'client',
        pageSize: 25,
        searchEnabled: true,
        sortEnabled: true,
        exportEnabled: true,
        columns: columns.map(([headerText, field, width, extra]): DataGridColumn => ({
          ...column,
          id: defaultIdFactory(),
          header: headerText,
          fieldPath: '/' + field,
          ...(width === undefined
            ? { widthMode: 'dynamic', minWidth: extra?.minWidth ?? 90 }
            : { widthMode: 'fixed', width, minWidth: Math.min(width, 90) }),
          ...(extra?.image === true ? { cellKind: 'image' as const } : {}),
          ...(extra?.computed === true ? { sortable: false, searchable: false } : {}),
          ...(extra?.align === undefined
            ? {}
            : { headerAlign: extra.align, cellAlign: extra.align }),
        })),
      },
    },
    events: options.onCell === undefined ? {} : { OnCellClick: options.onCell },
  };
}

// ---------------------------------------------------------------- shared response contracts

const S = 'string' as const;
const I = 'integer' as const;
const N = 'number' as const;
const D = 'datetime' as const;

const F = {
  sessaoUsuario: {
    id_usuario: I,
    nome_usuario: S,
    login_usuario: S,
    autorizacao_usuario: I,
    fila_usuario: I,
    triagem_usuario: I,
    encerramento_usuario: I,
    inservivel_usuario: I,
    status_usuario: I,
    data_usuario: S,
    nome_grupo: S,
    cor_grupo: S,
    total_bloqueados: I,
  },
  filas: { id_fila: I, nome_fila: S, icone_fila: S },
  painel: {
    id_chamado: I,
    status_painel: S,
    status_chamado: S,
    prioridade_chamado: I,
    ticket_chamado: S,
    id_ticket_chamado: I,
    nome_solicitante_chamado: S,
    resumo_chamado: S,
    nome_local: S,
    regiao_local: S,
    id_fila_chamado: I,
    nome_fila: S,
    icone_fila: S,
    data_chamado: D,
    data_chamado_fmt: S,
    data_ultima_interacao: D,
    minutos_espera: I,
    nome_responsavel: S,
    id_responsavel: I,
    email_nao_lido_chamado: I,
    entrega_chamado: I,
    equip_pendentes: I,
  },
  indicadores: {
    total: I,
    abertos: I,
    prioritarios: I,
    sem_interacao_6h: I,
    sem_interacao_24h: I,
    sem_responsavel: I,
    emails_nao_lidos: I,
    prontos_entrega: I,
    entrega_parcial: I,
    meus_bloqueados: I,
    meus_bloqueados_remoto: I,
  },
  encerrados: {
    id_chamado: I,
    ticket_chamado: S,
    nome_solicitante_chamado: S,
    nome_local: S,
    nome_fila: S,
    data_encerramento_chamado: D,
    data_encerramento_fmt: S,
    nome_usuario: S,
  },
  triagem: {
    id: I,
    tn: S,
    ticket: S,
    create_time: D,
    create_time_fmt: S,
    title: S,
    queue_id: I,
    id_fila_sigat: I,
    a_from: S,
  },
  triagemTicket: {
    id: I,
    tn: S,
    queue_id: I,
    id_fila_sigat: I,
    create_time: D,
    title: S,
    a_from: S,
  },
  artigos: {
    article_id: I,
    a_from: S,
    a_subject: S,
    a_body: S,
    create_time: D,
    create_time_fmt: S,
  },
  ticketAnexos: { id: I, article_id: I, filename: S, content_type: S, content_size: S },
  importado: { id_chamado: I, ticket_chamado: S, status_chamado: S },
  chamado: {
    id_chamado: I,
    status_chamado: S,
    complemento_chamado: S,
    id_ticket_chamado: I,
    ticket_chamado: S,
    id_fila: I,
    nome_fila_chamado: S,
    icone_fila: S,
    nome_solicitante_chamado: S,
    descricao_chamado: S,
    email_chamado: S,
    id_local: I,
    nome_local: S,
    endereco_local: S,
    regiao_local: S,
    infovia: I,
    data_chamado: S,
    data_encerramento_chamado: S,
    telefone_chamado: S,
    celular_chamado: S,
    id_responsavel: I,
    nome_responsavel: S,
    prioridade_chamado: I,
    resumo_chamado: S,
    email_nao_lido_chamado: I,
    entrega_chamado: I,
    equip_espera: I,
    minutos_espera: I,
    equip_pendentes: I,
  },
  equipamentos: {
    num_equipamento: S,
    descricao_equipamento: S,
    tag_equipamento: S,
    status_equipamento_chamado: S,
    status_equipamento_chamado_ant: S,
    ultima_alteracao_equipamento_chamado: D,
  },
  servicos: {
    id: I,
    id_servico: I,
    nome_servico: S,
    unidade_medida: S,
    quantidade: I,
    status_servico: S,
    data_ult_alteracao_servico_chamado: D,
  },
  interacoes: {
    id_interacao: I,
    tipo_interacao: S,
    id_chamado_interacao: I,
    data_interacao: S,
    data_interacao_iso: D,
    texto_interacao: S,
    nome_usuario: S,
    id_usuario_interacao: I,
    pool_equipamentos: S,
    pool_servicos: S,
    status_chamado: S,
    pode_desfazer: I,
    tem_laudo: I,
  },
  historico: {
    id_alteracao: I,
    nome_usuario: S,
    texto_alteracao: S,
    data_alteracao: D,
    data_alteracao_fmt: S,
  },
  anexos: { id_anexo_otrs: I, nome_arquivo_otrs: S, id_triagem_sigat: I },
  telefones: { id: I, setor: S, telefone: S, id_local: I },
  termos: { id_termo: I, nome_termo: S, tipo_termo: S, data_termo: D, id_chamado_termo: I },
  reparos: {
    id_reparo: I,
    num_equipamento_reparo: S,
    status_reparo: S,
    nome_bancada: S,
    nome_usuario: S,
    data_inicio_reparo: S,
    data_fim_reparo: S,
    justificativa_reparo: S,
    id_remessa: I,
    id_laudo_tecnico: S,
    soma_servico: N,
  },
  reparoHistorico: {
    subquery: I,
    id_reparo_servico: I,
    realizado_reparo_servico: I,
    status_reparo_servico: I,
    data_reparo_servico: S,
    data_encerramento_reparo_servico: S,
    data: D,
    id_abertura_usuario: I,
    nome_abertura_usuario: S,
    id_fechamento_usuario: I,
    nome_fechamento_usuario: S,
    id_servico: I,
    nome_servico: S,
  },
  equipamento: {
    num_equipamento: S,
    descricao_equipamento: S,
    tag_equipamento: S,
    data_equipamento: D,
    data_alteracao_equipamento: D,
  },
  equipamentoChamados: {
    status_equipamento_chamado: S,
    id_chamado: I,
    resumo_chamado: S,
    data_chamado: D,
    data_chamado_fmt: S,
    ticket_chamado: S,
    id_ticket_chamado: I,
    status_chamado: S,
  },
  buscaEquipamentos: { num_equipamento: S, descricao_equipamento: S, tag_equipamento: S },
  buscaChamados: {
    id: I,
    ticket: S,
    nome_solicitante: S,
    nome_local: S,
    status: S,
    data_abertura: D,
    data_encerramento: D,
    responsavel: S,
  },
  remessas: {
    id_remessa_inservivel: I,
    cod_divisao: I,
    divisao_remessa: S,
    data_abertura: S,
    data_fechamento: S,
    data_entrega: S,
    nome_recebedor: S,
    falha_envio: I,
    id_termo: I,
    nome_usuario: S,
    qtd_equipamentos: I,
  },
  remessa: {
    id_remessa_inservivel: I,
    data_abertura: D,
    data_fechamento: D,
    data_entrega: D,
    nome_recebedor: S,
    falha_envio: I,
    divisao_remessa: I,
    pool_equipamentos: S,
    nome_usuario: S,
    id_termo: I,
    nome_termo: S,
  },
  remessaEquipamentos: {
    numero_equipamento: S,
    descricao_equipamento: S,
    id_chamado: I,
    id_interacao: I,
    texto_interacao: S,
    nome_local: S,
    nome_usuario: S,
    data_abertura: D,
    data_fechamento: D,
    falha_envio: I,
    id_termo: I,
  },
  adminUsuarios: {
    id_usuario: I,
    nome_usuario: S,
    login_usuario: S,
    autorizacao_usuario: I,
    fila_usuario: I,
    triagem_usuario: I,
    encerramento_usuario: I,
    inservivel_usuario: I,
    status_usuario: I,
    data_usuario: D,
    alteracao_usuario: D,
  },
  usuarioPerfil: {
    id_usuario: I,
    nome_usuario: S,
    login_usuario: S,
    autorizacao_usuario: I,
    autorizacao: S,
    triagem_usuario: I,
    encerramento_usuario: I,
    inservivel_usuario: I,
    status_usuario: I,
    total_interacoes: I,
    ultimo_evento: D,
  },
  produtividade: { dia: S, interacoes: I, aberturas: I, encerramentos: I },
  bloqueados: {
    id_chamado: I,
    status_chamado: S,
    ticket_chamado: S,
    resumo_chamado: S,
    data_chamado: D,
    id_ticket_chamado: I,
    email_nao_lido_chamado: I,
  },
  locais: {
    id_local: I,
    nome_local: S,
    endereco_local: S,
    regiao_local: S,
    status_local: I,
    infovia: I,
    alteracao_local: D,
    id_secretaria: I,
    nome_secretaria: S,
    sigla_secretaria: S,
  },
  local: {
    id_local: I,
    status_local: I,
    nome_local: S,
    secretaria_local: I,
    endereco_local: S,
    regiao_local: S,
    infovia: I,
    pms_id: I,
  },
  secretarias: {
    id_secretaria: I,
    nome_secretaria: S,
    sigla_secretaria: S,
    status_secretaria: I,
    ultima_alteracao: D,
  },
  servicosAdmin: {
    id_servico: I,
    id_fila_servico: I,
    nome_fila: S,
    nome_servico: S,
    valor_servico: N,
    pontuacao_servico: I,
    status_servico: I,
    unidade_medida: S,
    data_ultima_alteracao: D,
  },
  bancadas: { id_bancada: I, nome_bancada: S, status_bancada: I, ocupado_bancada: I },
  modelos: {
    id_modelo_mensagem: I,
    status_modelo_mensagem: I,
    fila_modelo_mensagem: I,
    nome_fila: S,
    mensagem_modelo_mensagem: S,
    tipo_modelo_mensagem: S,
    data_modelo_mensagem: D,
    alterado_modelo_mensagem: D,
  },
  eventos: {
    id_evento: I,
    acao_evento: S,
    desc_evento: S,
    nome_usuario: S,
    data_evento: D,
    data_evento_fmt: S,
  },
} as const satisfies Record<string, Fields>;

// ---------------------------------------------------------------- pages

// ---------------------------------------------------------------- Login (legacy SIGAT look)

/**
 * The Login page copies the legacy SIGAT sign-in screen (Bootstrap 4): a narrow
 * white card with the star logo, the "SIGAT" title, two fields, a blue
 * "Entrar" button and the CGTI footer. Its styles are fixed light colours, as
 * in SIGAT, and only this page uses them.
 */
const LOGIN_STYLE = {
  pagina: 'sigat2-login-pagina',
  cartao: 'sigat2-login-cartao',
  titulo: 'sigat2-login-titulo',
  campo: 'sigat2-login-campo',
  botao: 'sigat2-login-botao',
  mensagem: 'sigat2-login-mensagem',
  rodape: 'sigat2-login-rodape',
  logo: 'sigat2-login-logo',
} as const;

const LOGIN_LOGO_ASSET = 'sigat-logo.svg';

function px(value: number) {
  return { value, unit: 'px' as const };
}

function loginStyle(
  id: string,
  name: string,
  componentType: string,
  states: Partial<
    Record<'base' | 'hover' | 'focus' | 'active' | 'disabled', ComponentStyleProperties>
  >,
): ComponentStyleModel {
  return {
    id,
    name,
    componentType,
    states: { base: {}, hover: {}, focus: {}, active: {}, disabled: {}, ...states },
  };
}

const SYSTEM_FONT = { fontFamily: 'ide' } as const;
const TEXT = '#212529';

function loginStyles(): readonly ComponentStyleModel[] {
  return [
    loginStyle(LOGIN_STYLE.pagina, 'Login Pagina', 'WebPage', {
      base: { ...SYSTEM_FONT, backgroundColor: '#ffffff', textColor: TEXT },
    }),
    loginStyle(LOGIN_STYLE.cartao, 'Login Cartao', 'WebPanel', {
      base: {
        ...SYSTEM_FONT,
        backgroundColor: '#ffffff',
        borderWidth: px(1),
        borderStyle: 'solid',
        borderColor: '#dfdfdf',
        borderRadius: px(4),
        boxShadow: 'none',
      },
    }),
    loginStyle(LOGIN_STYLE.logo, 'Login Logo', 'WebImage', {
      base: {
        objectFit: 'contain',
        objectPosition: 'center',
        borderWidth: px(0),
        borderStyle: 'none',
      },
    }),
    loginStyle(LOGIN_STYLE.titulo, 'Login Titulo', 'WebLabel', {
      base: {
        ...SYSTEM_FONT,
        textColor: TEXT,
        fontSize: px(40),
        fontWeight: 'medium',
        lineHeight: px(48),
        // A label is a flex box: justifyContent places the text, textAlign wraps it.
        justifyContent: 'center',
        textAlign: 'center',
      },
    }),
    loginStyle(LOGIN_STYLE.campo, 'Login Campo', 'WebEdit', {
      base: {
        ...SYSTEM_FONT,
        backgroundColor: '#ffffff',
        textColor: '#495057',
        fontSize: px(16),
        borderWidth: px(1),
        borderStyle: 'solid',
        borderColor: '#ced4da',
        borderRadius: px(4),
        paddingLeft: px(12),
        paddingRight: px(12),
        boxShadow: 'none',
        transitionProperty: 'all',
        transitionDuration: 150,
        transitionTimingFunction: 'easeOut',
      },
      focus: {
        borderColor: '#80bdff',
        ringWidth: px(3),
        ringColor: '#bfdeff',
        ringOffsetWidth: px(0),
      },
      disabled: { backgroundColor: '#e9ecef', cursor: 'not-allowed' },
    }),
    loginStyle(LOGIN_STYLE.botao, 'Login Botao', 'WebButton', {
      base: {
        ...SYSTEM_FONT,
        backgroundColor: '#007bff',
        borderWidth: px(1),
        borderStyle: 'solid',
        borderColor: '#007bff',
        borderRadius: px(4),
        textColor: '#ffffff',
        fontSize: px(16),
        fontWeight: 'normal',
        justifyContent: 'center',
        textAlign: 'center',
        buttonContentMode: 'text',
        boxShadow: 'none',
        cursor: 'pointer',
        transitionProperty: 'all',
        transitionDuration: 150,
        transitionTimingFunction: 'easeOut',
      },
      hover: { backgroundColor: '#0069d9', borderColor: '#0062cc' },
      focus: { ringWidth: px(3), ringColor: '#80bdff', ringOffsetWidth: px(0) },
      active: { backgroundColor: '#0062cc', borderColor: '#005cbf' },
      disabled: { opacity: 65, cursor: 'not-allowed' },
    }),
    loginStyle(LOGIN_STYLE.mensagem, 'Login Mensagem', 'WebLabel', {
      base: {
        ...SYSTEM_FONT,
        textColor: '#dc3545',
        fontSize: px(14),
        fontWeight: 'normal',
        lineHeight: px(20),
        justifyContent: 'center',
        textAlign: 'center',
      },
    }),
    loginStyle(LOGIN_STYLE.rodape, 'Login Rodape', 'WebLabel', {
      base: {
        ...SYSTEM_FONT,
        textColor: TEXT,
        fontSize: px(13),
        fontWeight: 'normal',
        lineHeight: px(18),
        justifyContent: 'end',
        textAlign: 'right',
      },
    }),
  ];
}

// ---------------------------------------------------------------- SIGAT frame (legacy look)

/**
 * Styles of the signed-in SIGAT frame and painel: the Bootstrap 4 dark navbar and footer,
 * `btn-sm` buttons in the Bootstrap colours, the nav tabs and the DataTables list. Like
 * the Login page, they use fixed light colours, as SIGAT does.
 */
const SIGAT_STYLE = {
  pagina: 'sigat2-pagina',
  barra: 'sigat2-barra',
  conteudo: 'sigat2-conteudo',
  marca: 'sigat2-marca',
  busca: 'sigat2-busca',
  botaoBusca: 'sigat2-botao-busca',
  textoClaro: 'sigat2-texto-claro',
  textoClaroForte: 'sigat2-texto-claro-forte',
  seloBloqueados: 'sigat2-selo-bloqueados',
  botaoPrimario: 'sigat2-botao-primario',
  botaoSecundario: 'sigat2-botao-secundario',
  botaoSecundarioIcone: 'sigat2-botao-secundario-icone',
  botaoPerigo: 'sigat2-botao-perigo',
  botaoInfo: 'sigat2-botao-info',
  botaoSucesso: 'sigat2-botao-sucesso',
  rodape: 'sigat2-rodape',
  selo: 'sigat2-selo',
  abas: 'sigat2-abas',
  quadro: 'sigat2-quadro',
  lista: 'sigat2-lista',
} as const;

const DARK = '#343a40';

/** Bootstrap 4 `.btn-sm` in one colour; `cor` is [background, hover, active, text]. */
function bootstrapButton(
  id: string,
  name: string,
  [fundo, hover, ativo, texto]: readonly [string, string, string, string],
  extra: ComponentStyleProperties = {},
): ComponentStyleModel {
  return loginStyle(id, name, 'WebButton', {
    base: {
      ...SYSTEM_FONT,
      backgroundColor: fundo,
      borderWidth: px(1),
      borderStyle: 'solid',
      borderColor: fundo,
      borderRadius: px(3),
      textColor: texto,
      fontSize: px(14),
      fontWeight: 'normal',
      lineHeight: px(21),
      paddingTop: px(4),
      paddingBottom: px(4),
      paddingLeft: px(8),
      paddingRight: px(8),
      gap: px(5),
      justifyContent: 'center',
      textAlign: 'center',
      whiteSpace: 'nowrap',
      buttonContentMode: 'text-icon',
      buttonIconPosition: 'left',
      buttonIconSize: px(14),
      buttonIconColor: texto,
      boxShadow: 'none',
      cursor: 'pointer',
      transitionProperty: 'colors',
      transitionDuration: 150,
      transitionTimingFunction: 'easeOut',
      ...extra,
    },
    hover: { backgroundColor: hover, borderColor: hover },
    focus: { ringWidth: px(3), ringColor: '#80bdff', ringOffsetWidth: px(0) },
    active: { backgroundColor: ativo, borderColor: ativo },
    disabled: { opacity: 65, cursor: 'not-allowed' },
  });
}

function sigatStyles(): readonly ComponentStyleModel[] {
  const textoBarra = (id: string, name: string, extra: ComponentStyleProperties) =>
    loginStyle(id, name, 'WebLabel', {
      base: {
        ...SYSTEM_FONT,
        textColor: '#f8f9fa',
        fontSize: px(16),
        lineHeight: px(24),
        ...extra,
      },
    });
  return [
    loginStyle(SIGAT_STYLE.pagina, 'SIGAT Pagina', 'WebPage', {
      base: { ...SYSTEM_FONT, backgroundColor: '#ffffff', textColor: TEXT },
    }),
    loginStyle(SIGAT_STYLE.barra, 'SIGAT Barra escura', 'WebGroup', {
      base: { ...SYSTEM_FONT, backgroundColor: DARK, textColor: '#f8f9fa' },
    }),
    loginStyle(SIGAT_STYLE.conteudo, 'SIGAT Conteudo', 'WebGroup', {
      base: { ...SYSTEM_FONT, backgroundColor: '#ffffff', textColor: TEXT, overflow: 'auto' },
    }),
    textoBarra(SIGAT_STYLE.marca, 'SIGAT Marca', {
      textColor: '#ffffff',
      fontSize: px(28),
      fontWeight: 'medium',
      lineHeight: px(34),
    }),
    textoBarra(SIGAT_STYLE.textoClaro, 'SIGAT Texto claro', {}),
    textoBarra(SIGAT_STYLE.textoClaroForte, 'SIGAT Texto claro forte', { fontWeight: 'bold' }),
    loginStyle(SIGAT_STYLE.busca, 'SIGAT Busca rapida', 'WebEdit', {
      base: {
        ...SYSTEM_FONT,
        backgroundColor: '#ffffff',
        textColor: '#495057',
        fontSize: px(16),
        borderWidth: px(1),
        borderStyle: 'solid',
        borderColor: '#ced4da',
        borderRadius: px(4),
        paddingLeft: px(12),
        paddingRight: px(12),
        boxShadow: 'none',
      },
      focus: {
        borderColor: '#80bdff',
        ringWidth: px(3),
        ringColor: '#bfdeff',
        ringOffsetWidth: px(0),
      },
    }),
    bootstrapButton(
      SIGAT_STYLE.botaoBusca,
      'SIGAT Botao busca',
      ['#007bff', '#0069d9', '#0062cc', '#ffffff'],
      { buttonContentMode: 'icon', buttonIconSize: px(16), borderRadius: px(4) },
    ),
    bootstrapButton(
      SIGAT_STYLE.seloBloqueados,
      'SIGAT Selo bloqueados',
      ['#ffc107', '#e0a800', '#d39e00', TEXT],
      {
        buttonIconPosition: 'right',
        fontSize: px(12),
        fontWeight: 'bold',
        lineHeight: px(16),
        paddingLeft: px(5),
        paddingRight: px(5),
        gap: px(3),
        buttonIconSize: px(13),
        borderRadius: px(4),
      },
    ),
    bootstrapButton(SIGAT_STYLE.botaoPrimario, 'SIGAT Botao primario', [
      '#007bff',
      '#0069d9',
      '#0062cc',
      '#ffffff',
    ]),
    bootstrapButton(SIGAT_STYLE.botaoSecundario, 'SIGAT Botao secundario', [
      '#6c757d',
      '#5a6268',
      '#545b62',
      '#ffffff',
    ]),
    bootstrapButton(
      SIGAT_STYLE.botaoSecundarioIcone,
      'SIGAT Botao secundario so icone',
      ['#6c757d', '#5a6268', '#545b62', '#ffffff'],
      { buttonContentMode: 'icon' },
    ),
    bootstrapButton(SIGAT_STYLE.botaoPerigo, 'SIGAT Botao perigo', [
      '#dc3545',
      '#c82333',
      '#bd2130',
      '#ffffff',
    ]),
    bootstrapButton(SIGAT_STYLE.botaoInfo, 'SIGAT Botao info', [
      '#17a2b8',
      '#138496',
      '#117a8b',
      '#ffffff',
    ]),
    bootstrapButton(SIGAT_STYLE.botaoSucesso, 'SIGAT Botao sucesso', [
      '#28a745',
      '#218838',
      '#1e7e34',
      '#ffffff',
    ]),
    textoBarra(SIGAT_STYLE.rodape, 'SIGAT Rodape', { fontSize: px(13), lineHeight: px(20) }),
    loginStyle(SIGAT_STYLE.selo, 'SIGAT Selo', 'WebLabel', {
      base: {
        ...SYSTEM_FONT,
        backgroundColor: '#dc3545',
        textColor: '#ffffff',
        fontSize: px(10),
        fontWeight: 'bold',
        lineHeight: px(12),
        paddingLeft: px(4),
        paddingRight: px(4),
        borderRadius: px(4),
        justifyContent: 'center',
      },
    }),
    loginStyle(SIGAT_STYLE.abas, 'SIGAT Abas', 'WebTabs', {
      // The tab buttons stretch to the full strip height, one pixel over its bottom border;
      // hidden overflow keeps that pixel from adding a scrollbar to the three tabs.
      base: {
        ...SYSTEM_FONT,
        textColor: '#007bff',
        fontSize: px(16),
        borderColor: '#dee2e6',
        overflow: 'hidden',
      },
    }),
    loginStyle(SIGAT_STYLE.quadro, 'SIGAT Quadro', 'WebPanel', {
      base: {
        ...SYSTEM_FONT,
        backgroundColor: '#ffffff',
        textColor: TEXT,
        borderWidth: px(0),
        borderStyle: 'none',
        boxShadow: 'none',
        paddingTop: px(0),
        paddingRight: px(0),
        paddingBottom: px(0),
        paddingLeft: px(0),
      },
    }),
    loginStyle(SIGAT_STYLE.lista, 'SIGAT Lista', 'WebDataGrid', {
      base: {
        ...SYSTEM_FONT,
        backgroundColor: '#ffffff',
        textColor: TEXT,
        fontSize: px(13),
        borderWidth: px(0),
        borderStyle: 'none',
        borderRadius: px(0),
        boxShadow: 'none',
        dataGridHeaderBackgroundColor: '#ffffff',
        dataGridHeaderTextColor: TEXT,
        dataGridHeaderFontWeight: 'bold',
        dataGridHeaderBorderColor: '#111111',
        dataGridHeaderBorderWidth: px(2),
        dataGridHeaderBorderStyle: 'solid',
        dataGridHorizontalLineVisibility: 'show',
        dataGridHorizontalLineColor: '#dddddd',
        dataGridHorizontalLineWidth: px(1),
        dataGridHorizontalLineStyle: 'solid',
        dataGridVerticalLineVisibility: 'hide',
      },
    }),
  ];
}

function loginPage(): PageSpec {
  const id = defaultIdFactory();
  const campo = (name: string, placeholder: string, props: Record<string, unknown> = {}): Node => ({
    ...edit(name, placeholder, props),
    height: 38,
    styleId: LOGIN_STYLE.campo,
  });
  return {
    name: 'Login',
    caption: 'Entrar',
    roles: [],
    events: { OnShow: 'Mostrar' },
    header: false,
    styleId: LOGIN_STYLE.pagina,
    container: { alignItems: 'center', paddingTop: 160, gap: 0 },
    children: [
      {
        type: 'WebPanel',
        name: 'PNLLogin',
        width: 305,
        styleId: LOGIN_STYLE.cartao,
        item: { width: 'fixed', height: 'fit-content', minWidth: 0, grow: 0, shrink: true },
        container: { paddingTop: 26, paddingRight: 4, paddingBottom: 6, paddingLeft: 4, gap: 0 },
        children: [
          {
            type: 'WebGroup',
            // Fixed IDs for the components added to the page keep the seeded IDs of the
            // other pages unchanged when the project is regenerated.
            id: 'sigat2-login-formulario',
            name: 'GRPFormulario',
            item: { height: 'fit-content' },
            container: { mode: 'column', gap: 16, paddingLeft: 16, paddingRight: 16 },
            children: [
              {
                type: 'WebImage',
                id: 'sigat2-login-logo',
                name: 'IMGLogo',
                width: 90,
                height: 88,
                props: { src: 'assets/imported/' + LOGIN_LOGO_ASSET, alt: 'SIGAT' },
                styleId: LOGIN_STYLE.logo,
                item: { width: 'fixed', alignSelf: 'center', grow: 0 },
              },
              { ...title('LBLTitulo', 'SIGAT'), height: 48, styleId: LOGIN_STYLE.titulo },
              campo('EDTLogin', 'Nome de usuário'),
              {
                ...campo('EDTSenha', 'Senha', { inputType: 'password' }),
                events: { OnKeyDown: 'SenhaTecla' },
              },
              {
                type: 'WebButton',
                name: 'BTNEntrar',
                height: 38,
                props: { caption: 'Entrar', icon: 'login' },
                events: { OnClick: 'Entrar' },
                styleId: LOGIN_STYLE.botao,
              },
              { ...label('LBLMensagem', '', 40), styleId: LOGIN_STYLE.mensagem },
            ],
          },
          { ...label('LBLRodape', 'CGTI - SIGAT2', 18), styleId: LOGIN_STYLE.rodape },
        ],
      },
      apiClient('ApiSessao', id, [op('SessaoUsuario', 'sessao-usuario', F.sessaoUsuario)]),
    ],
  };
}

/** Slots for the painel queue buttons; page code fills them from `filas`. */
const PAINEL_FILAS = 12;

function painelPage(): PageSpec {
  const id = defaultIdFactory();
  const filas = op('Filas', 'filas', F.filas);
  const painel = op('Chamados', 'painel-chamados', F.painel, ['fila', 'q']);
  const indicadores = op('Indicadores', 'painel-indicadores', F.indicadores, ['fila']);
  const encerrados = op('Encerrados', 'painel-encerrados', F.encerrados, ['q']);
  const triagem = op('Triagem', 'triagem', F.triagem, ['q'], 'otobo');
  const quadro = (name: string, children: readonly Node[]): Node => ({
    ...panel(name, children),
    styleId: SIGAT_STYLE.quadro,
    item: { width: 'stretch', height: 'stretch', minWidth: 0, minHeight: 0, grow: 1, shrink: true },
    container: { paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, gap: 8 },
  });
  const lista = (node: Node): Node => {
    const config = (node.props as { dataGridConfig: Record<string, unknown> }).dataGridConfig;
    return {
      ...node,
      styleId: SIGAT_STYLE.lista,
      item: { height: 'stretch', minHeight: 320, shrink: true },
      props: {
        dataGridConfig: {
          ...config,
          pageSize: 200,
          pageSizeOptions: [15, 25, 50, 100, 200],
          stickyHeader: true,
          rowHeightMode: 'fixed',
          fixedRowHeight: 36,
          cellPaddingVertical: 8,
          searchPlaceholder: 'Busca:',
        },
      },
    };
  };
  const filaButton = (index: number): Node => ({
    ...sigatButton(
      'BTNFila' + String(index),
      'Fila ' + String(index),
      'FiltrarFila',
      'list',
      SIGAT_STYLE.botaoPrimario,
    ),
    props: { caption: 'Fila ' + String(index), icon: 'list', visible: false },
  });
  return {
    name: 'index',
    caption: 'Painel',
    roles: ['*'],
    events: { OnShow: 'Mostrar', OnHide: 'Ocultar' },
    header: true,
    children: [
      {
        ...tabs(
          'Abas',
          ['Triagem', 'Chamados', 'Arquivo'],
          ['PNLTriagem', 'PNLChamados', 'PNLArquivo'],
        ),
        styleId: SIGAT_STYLE.abas,
        height: 48,
        props: {
          tabs: ['Triagem', 'Chamados', 'Arquivo'],
          panels: ['PNLTriagem', 'PNLChamados', 'PNLArquivo'],
          selectedIndex: 1,
        },
        item: { shrink: false },
      },
      {
        ...quadro('PNLTriagem', [
          lista(
            grid(
              'GRDTriagem',
              id,
              triagem,
              [
                ['Ticket', 'ticket', 200],
                ['Data de abertura', 'create_time_fmt', 150],
                ['Assunto', 'title'],
                ['Solicitante', 'a_from'],
              ],
              { onCell: 'AbrirTriagem', empty: 'Sem resultados.' },
            ),
          ),
        ]),
        props: { allowedRoles: ['triagem'] },
      },
      quadro('PNLChamados', [
        {
          type: 'WebGroup',
          name: 'Filas',
          item: { height: 'fit-content', shrink: false },
          container: { mode: 'row', gap: 4, wrap: true, alignItems: 'center' },
          children: [
            ...Array.from({ length: PAINEL_FILAS }, (_, index) => filaButton(index + 1)),
            {
              ...sigatButton(
                'BTNEntrega',
                'Entrega',
                'FiltrarFila',
                'truck',
                SIGAT_STYLE.botaoSucesso,
              ),
              props: { caption: 'Entrega', icon: 'truck', visible: false },
            },
            sigatButton('BTNTodos', 'Todos', 'FiltrarFila', 'search', SIGAT_STYLE.botaoInfo),
            sigatButton(
              'BTNImprimir',
              'Imprimir',
              'Imprimir',
              'printer',
              SIGAT_STYLE.botaoSecundario,
            ),
            {
              ...sigatButton(
                'BTNLimpar',
                'Limpar filtros do painel',
                'LimparPainel',
                'rotate-ccw',
                SIGAT_STYLE.botaoSecundarioIcone,
              ),
              width: 36,
              item: { width: 'fixed', grow: 0, shrink: false },
            },
          ],
        },
        lista(
          grid(
            'GRDChamados',
            id,
            painel,
            [
              ['#', 'id_chamado', 72],
              ['Status', 'sinal_status', 64, { image: true, computed: true, align: 'center' }],
              ['Solicitante', 'nome_solicitante_chamado', undefined, { minWidth: 280 }],
              ['Solicitação', 'resumo_chamado', 300],
              ['Local', 'nome_local', undefined, { minWidth: 400 }],
              ['Região', 'regiao_local', 100],
              ['Data', 'data_chamado_fmt', 140],
              ['Última interação', 'espera_fmt', 130, { computed: true }],
              ['Responsável', 'nome_responsavel', 170],
            ],
            { server: true, onCell: 'AbrirChamadoDaGrade', empty: 'Sem chamados :)' },
          ),
        ),
      ]),
      quadro('PNLArquivo', [
        lista(
          grid(
            'GRDEncerrados',
            id,
            encerrados,
            [
              ['#', 'id_chamado', 80],
              ['Ticket', 'ticket_chamado', 170],
              ['Solicitante', 'nome_solicitante_chamado'],
              ['Local', 'nome_local'],
              ['Fila', 'nome_fila', 140],
              ['Encerramento', 'data_encerramento_fmt', 150],
              ['Finalizado por', 'nome_usuario', 170],
            ],
            { server: true, onCell: 'AbrirEncerrado', empty: 'Sem resultados.' },
          ),
        ),
      ]),
      apiClient('Api', id, [filas, painel, indicadores, encerrados, triagem]),
      {
        type: 'WebTimer',
        name: 'TMRAtualizar',
        props: { time: 120_000, loop: true, enabled: false },
        events: { OnTimer: 'Atualizar' },
      },
    ],
  };
}

function chamadoPage(): PageSpec {
  const id = defaultIdFactory();
  const ops = {
    detalhe: op('Detalhe', 'chamado-detalhe', F.chamado, ['id']),
    equipamentos: op('Equipamentos', 'chamado-equipamentos', F.equipamentos, ['id', 'status']),
    servicos: op('Servicos', 'chamado-servicos', F.servicos, ['id']),
    interacoes: op('Interacoes', 'chamado-interacoes', F.interacoes, ['id']),
    historico: op('Historico', 'chamado-historico', F.historico, ['id']),
    anexos: op('Anexos', 'chamado-anexos', F.anexos, ['id']),
    telefones: op('Telefones', 'chamado-telefones', F.telefones, ['id']),
    termos: op('Termos', 'chamado-termos', F.termos, ['id']),
    reparos: op('Reparos', 'chamado-reparos', F.reparos, ['id']),
    reparoHistorico: op('ReparoHistorico', 'reparo-historico', F.reparoHistorico, ['id']),
    artigos: op('Artigos', 'ticket-artigos', F.artigos, ['id'], 'otobo'),
    bloquear: write('Bloquear', 'chamado-bloquear', { id_chamado: 'integer' }),
    desbloquear: write('Desbloquear', 'chamado-desbloquear', { id_chamado: 'integer' }),
    priorizar: write('Priorizar', 'chamado-priorizar', { id_chamado: 'integer' }),
    zerarNaoLidos: write('ZerarNaoLidos', 'chamado-zerar-nao-lidos', { id_chamado: 'integer' }),
    filas: op('Filas', 'filas', F.filas),
    observacao: write('Observacao', 'interacao-observacao', {
      id_chamado: 'integer',
      texto: 'string',
    }),
    alterarFila: write('AlterarFila', 'interacao-alterar-fila', {
      id_chamado: 'integer',
      id_fila: 'integer',
      texto: 'string',
    }),
    atendimento: write('Atendimento', 'interacao-atendimento', {
      id_chamado: 'integer',
      texto: 'string',
      servicos: 'array',
    }),
    espera: write('Espera', 'interacao-espera', {
      id_chamado: 'integer',
      texto: 'string',
      equipamentos: 'array',
      servicos: 'array',
    }),
    removerEspera: write('RemoverEspera', 'interacao-remover-espera', {
      id_chamado: 'integer',
      texto: 'string',
      equipamentos: 'array',
      servicos: 'array',
    }),
  };
  return {
    name: 'Chamado',
    caption: 'Chamado',
    roles: ['*'],
    events: { OnShow: 'Mostrar' },
    header: true,
    children: [
      row('Topo', [
        { ...title('LBLChamado', 'Chamado'), width: 400, item: { width: 'fixed', grow: 1 } },
        button('BTNOtobo', 'Abrir no OTOBO', 'AbrirOtobo', 'external-link'),
        button('BTNRecarregar', 'Recarregar', 'Carregar', 'refresh'),
      ]),
      html('HTMLSinais', 44, 'Situação do chamado'),
      row('Acoes', [
        button('BTNBloquear', 'Bloquear', 'Bloquear', 'lock'),
        button('BTNDesbloquear', 'Desbloquear', 'Desbloquear', 'unlock'),
        button('BTNPrioridade', 'Priorizar', 'Priorizar', 'star', ['admin']),
      ]),
      panel('PNLDados', [
        details('Dados', [
          ['Status', 'Status'],
          ['Ticket', 'Ticket'],
          ['Fila', 'Fila'],
          ['Responsavel', 'Responsável'],
          ['Solicitante', 'Solicitante'],
          ['Telefone', 'Telefone / celular'],
          ['Local', 'Local'],
          ['Endereco', 'Endereço'],
          ['Regiao', 'Região'],
          ['Abertura', 'Abertura'],
          ['Encerramento', 'Encerramento'],
          ['Resumo', 'Resumo'],
        ]),
      ]),
      tabs(
        'Abas',
        [
          'Interações',
          'Equipamentos',
          'Serviços',
          'Reparos',
          'E-mails do ticket',
          'Histórico',
          'Anexos e termos',
          'Registrar interação',
        ],
        [
          'PNLInteracoes',
          'PNLEquipamentos',
          'PNLServicos',
          'PNLReparos',
          'PNLEmails',
          'PNLHistorico',
          'PNLAnexos',
          'PNLRegistrar',
        ],
        'TrocarAba',
      ),
      panel('PNLInteracoes', [html('HTMLInteracoes', 520)]),
      panel('PNLEquipamentos', [
        grid(
          'GRDEquipamentos',
          id,
          ops.equipamentos,
          [
            ['Patrimônio', 'num_equipamento', 140],
            ['Descrição', 'descricao_equipamento'],
            ['Etiqueta', 'tag_equipamento', 140],
            ['Status', 'status_equipamento_chamado', 140],
          ],
          { height: 360, onCell: 'AbrirEquipamento' },
        ),
      ]),
      panel('PNLServicos', [
        grid(
          'GRDServicos',
          id,
          ops.servicos,
          [
            ['Serviço', 'nome_servico'],
            ['Qtde', 'quantidade', 90],
            ['Unidade', 'unidade_medida', 100],
            ['Status', 'status_servico', 120],
          ],
          { height: 320 },
        ),
      ]),
      panel('PNLReparos', [
        grid(
          'GRDReparos',
          id,
          ops.reparos,
          [
            ['#', 'id_reparo', 80],
            ['Patrimônio', 'num_equipamento_reparo', 130],
            ['Bancada', 'nome_bancada', 140],
            ['Status', 'status_reparo', 120],
            ['Início', 'data_inicio_reparo', 160],
            ['Fim', 'data_fim_reparo', 160],
            ['Finalizado por', 'nome_usuario'],
            ['Valor (R$)', 'soma_servico', 110],
          ],
          { height: 280, onCell: 'SelecionarReparo' },
        ),
        label('LBLReparo', 'Selecione um reparo para ver o histórico da bancada.'),
        grid(
          'GRDReparoHistorico',
          id,
          ops.reparoHistorico,
          [
            ['Data', 'data_reparo_servico', 160],
            ['Serviço / anotação', 'nome_servico'],
            ['Aberto por', 'nome_abertura_usuario', 170],
            ['Encerrado em', 'data_encerramento_reparo_servico', 160],
            ['Encerrado por', 'nome_fechamento_usuario', 170],
          ],
          { height: 300 },
        ),
      ]),
      panel('PNLEmails', [html('HTMLEmails', 520)]),
      panel('PNLHistorico', [
        grid(
          'GRDHistorico',
          id,
          ops.historico,
          [
            ['Data', 'data_alteracao_fmt', 170],
            ['Usuário', 'nome_usuario', 200],
            ['Alteração', 'texto_alteracao'],
          ],
          { height: 420 },
        ),
      ]),
      panel('PNLAnexos', [
        label('LBLAnexos', 'Anexos do OTOBO (o download direto fica para a fase 2)'),
        grid(
          'GRDAnexos',
          id,
          ops.anexos,
          [
            ['#', 'id_anexo_otrs', 100],
            ['Arquivo', 'nome_arquivo_otrs'],
          ],
          { height: 200 },
        ),
        label('LBLTermos', 'Termos gerados'),
        grid(
          'GRDTermos',
          id,
          ops.termos,
          [
            ['#', 'id_termo', 90],
            ['Arquivo', 'nome_termo'],
            ['Tipo', 'tipo_termo', 140],
            ['Data', 'data_termo', 170],
          ],
          { height: 200 },
        ),
        label('LBLTelefones', 'Telefones do local'),
        grid(
          'GRDTelefones',
          id,
          ops.telefones,
          [
            ['Setor', 'setor'],
            ['Telefone', 'telefone', 180],
          ],
          { height: 200 },
        ),
      ]),
      panel('PNLRegistrar', [
        label('LBLRegistrar', ''),
        {
          type: 'WebGroup',
          name: 'GRPRegistrar',
          item: { height: 'fit-content' },
          container: { mode: 'column', gap: 10 },
          children: [
            row('TipoInteracao', [combo('CMBTipo', [], 'MudarTipo'), combo('CMBFila')]),
            label('LBLItens', ''),
            listBox('LSTItens', 180),
            richText('RTEInteracao', 'Descreva a interação...', 220),
            row('AcoesInteracao', [button('BTNRegistrar', 'Registrar', 'Registrar', 'save')]),
          ],
        },
      ]),
      apiClient('Api', id, Object.values(ops)),
    ],
  };
}

function triagemPage(): PageSpec {
  const id = defaultIdFactory();
  const ticket = op('Ticket', 'triagem-ticket', F.triagemTicket, ['id'], 'otobo');
  const artigos = op('Artigos', 'ticket-artigos', F.artigos, ['id'], 'otobo');
  const anexos = op('Anexos', 'ticket-anexos', F.ticketAnexos, ['id'], 'otobo');
  const importado = op('Importado', 'ticket-importado', F.importado, ['ticket']);
  return {
    name: 'Triagem',
    caption: 'Triagem',
    roles: ['triagem'],
    events: { OnShow: 'Mostrar' },
    header: true,
    children: [
      row('Topo', [
        { ...title('LBLTicket', 'Triagem'), width: 400, item: { width: 'fixed', grow: 1 } },
        button('BTNVoltar', 'Voltar à triagem', 'Voltar', 'arrow-left'),
        button('BTNAbrirChamado', 'Abrir chamado já criado', 'AbrirChamadoCriado', 'external-link'),
      ]),
      panel('PNLTicket', [
        details('Dados', [
          ['Assunto', 'Assunto'],
          ['Remetente', 'Remetente'],
          ['Abertura', 'Abertura'],
          ['FilaSigat', 'Fila no SIGAT'],
        ]),
        label('LBLImportacao', ''),
      ]),
      panel('PNLArtigos', [html('HTMLArtigos', 520)]),
      panel('PNLAnexos', [
        label('LBLAnexos', 'Anexos do ticket'),
        grid(
          'GRDAnexos',
          id,
          anexos,
          [
            ['Arquivo', 'filename'],
            ['Tipo', 'content_type', 200],
            ['Tamanho', 'content_size', 120],
          ],
          { height: 220 },
        ),
      ]),
      label(
        'LBLFase2',
        'A importação do ticket como chamado continua no SIGAT até a fase 2 (gravação em várias tabelas e API do OTOBO).',
        44,
      ),
      apiClient('Api', id, [ticket, artigos, anexos, importado]),
    ],
  };
}

function equipamentoPage(): PageSpec {
  const id = defaultIdFactory();
  const equipamento = op('Equipamento', 'equipamento', F.equipamento, ['num']);
  const chamados = op('Chamados', 'equipamento-chamados', F.equipamentoChamados, [
    'num',
    'atendidos',
  ]);
  return {
    name: 'Equipamento',
    caption: 'Equipamento',
    roles: ['*'],
    events: { OnShow: 'Mostrar' },
    header: true,
    children: [
      title('LBLEquipamento', 'Equipamento'),
      panel('PNLDados', [
        details('Dados', [
          ['Descricao', 'Descrição'],
          ['Etiqueta', 'Etiqueta'],
          ['Cadastro', 'Cadastrado em'],
          ['Alteracao', 'Última alteração'],
        ]),
      ]),
      panel('PNLChamados', [
        row('Filtro', [
          {
            type: 'WebToggle',
            name: 'TGLAtendidos',
            width: 56,
            height: 32,
            props: { checked: false },
            events: { OnChange: 'CarregarChamados' },
            item: { width: 'fixed' },
          },
          {
            ...label('LBLAtendidos', 'Incluir chamados em que o equipamento já foi atendido'),
            width: 420,
            item: { width: 'fixed' },
          },
        ]),
        grid(
          'GRDChamados',
          id,
          chamados,
          [
            ['#', 'id_chamado', 90],
            ['Ticket', 'ticket_chamado', 170],
            ['Resumo', 'resumo_chamado'],
            ['Abertura', 'data_chamado_fmt', 150],
            ['Status no chamado', 'status_equipamento_chamado', 160],
            ['Chamado', 'status_chamado', 120],
          ],
          { height: 480, onCell: 'AbrirChamado' },
        ),
      ]),
      apiClient('Api', id, [equipamento, chamados]),
    ],
  };
}

function buscaPage(): PageSpec {
  const id = defaultIdFactory();
  const equipamentos = op('Equipamentos', 'busca-equipamentos', F.buscaEquipamentos, ['q']);
  const chamados = op('Chamados', 'busca-chamados', F.buscaChamados, ['q']);
  return {
    name: 'Busca',
    caption: 'Busca',
    roles: ['*'],
    events: { OnShow: 'Mostrar' },
    header: true,
    children: [
      title('LBLBusca', 'Busca rápida'),
      label('LBLTermo', 'Digite ao menos 3 caracteres no campo de busca.'),
      panel('PNLEquipamentos', [
        label('LBLEquipamentos', 'Equipamentos (até 10)'),
        grid(
          'GRDEquipamentos',
          id,
          equipamentos,
          [
            ['Patrimônio', 'num_equipamento', 150],
            ['Descrição', 'descricao_equipamento'],
            ['Etiqueta', 'tag_equipamento', 160],
          ],
          { height: 300, onCell: 'AbrirEquipamento' },
        ),
      ]),
      panel('PNLChamados', [
        label('LBLChamados', 'Chamados (até 10)'),
        grid(
          'GRDChamados',
          id,
          chamados,
          [
            ['#', 'id', 90],
            ['Ticket', 'ticket', 170],
            ['Solicitante', 'nome_solicitante'],
            ['Local', 'nome_local'],
            ['Status', 'status', 120],
            ['Responsável', 'responsavel', 170],
          ],
          { height: 300, onCell: 'AbrirChamado' },
        ),
      ]),
      apiClient('Api', id, [equipamentos, chamados]),
    ],
  };
}

function inserviveisPage(): PageSpec {
  const id = defaultIdFactory();
  const remessas = op('Remessas', 'remessas', F.remessas);
  return {
    name: 'Inserviveis',
    caption: 'Remessas de inservíveis',
    roles: ['inservivel'],
    events: { OnShow: 'Mostrar' },
    header: true,
    children: [
      title('LBLTitulo', 'Remessas de inservíveis'),
      grid(
        'GRDRemessas',
        id,
        remessas,
        [
          ['#', 'id_remessa_inservivel', 80],
          ['Divisão', 'divisao_remessa', 100],
          ['Abertura', 'data_abertura', 150],
          ['Fechamento', 'data_fechamento', 150],
          ['Entrega', 'data_entrega', 120],
          ['Recebedor', 'nome_recebedor'],
          ['Equipamentos', 'qtd_equipamentos', 130],
          ['Aberta por', 'nome_usuario', 170],
        ],
        { height: 620, onCell: 'AbrirRemessa' },
      ),
      apiClient('Api', id, [remessas]),
    ],
  };
}

function remessaPage(): PageSpec {
  const id = defaultIdFactory();
  const remessa = op('Remessa', 'remessa', F.remessa, ['id']);
  const equipamentos = op('Equipamentos', 'remessa-equipamentos', F.remessaEquipamentos, ['id']);
  return {
    name: 'Remessa',
    caption: 'Remessa de inservíveis',
    roles: ['inservivel'],
    events: { OnShow: 'Mostrar' },
    header: true,
    children: [
      row('Topo', [
        { ...title('LBLRemessa', 'Remessa'), width: 400, item: { width: 'fixed', grow: 1 } },
        button('BTNVoltar', 'Voltar às remessas', 'Voltar', 'arrow-left'),
      ]),
      panel('PNLDados', [
        details('Dados', [
          ['Situacao', 'Situação'],
          ['Abertura', 'Abertura'],
          ['Fechamento', 'Fechamento'],
          ['Entrega', 'Entrega'],
          ['Recebedor', 'Recebedor'],
          ['Termo', 'Termo'],
        ]),
      ]),
      grid(
        'GRDEquipamentos',
        id,
        equipamentos,
        [
          ['Patrimônio', 'numero_equipamento', 140],
          ['Descrição', 'descricao_equipamento'],
          ['Chamado', 'id_chamado', 100],
          ['Local', 'nome_local'],
        ],
        { height: 520, onCell: 'AbrirChamado' },
      ),
      apiClient('Api', id, [remessa, equipamentos]),
    ],
  };
}

function adminPage(): PageSpec {
  const id = defaultIdFactory();
  const ops = {
    usuarios: op('Usuarios', 'admin-usuarios', F.adminUsuarios, ['q']),
    locais: op('Locais', 'admin-locais', F.locais, ['q']),
    secretarias: op('Secretarias', 'secretarias', F.secretarias, ['ativas']),
    servicos: op('Servicos', 'admin-servicos', F.servicosAdmin, ['q', 'fila', 'status']),
    bancadas: op('Bancadas', 'bancadas', F.bancadas, ['livres']),
    modelos: op('Modelos', 'modelos-mensagem', F.modelos, ['tipo', 'fila']),
    filas: op('Filas', 'admin-filas', { id_fila: I, nome_fila: S, status_fila: S, icone_fila: S }),
    eventos: op('Eventos', 'admin-eventos', F.eventos, ['q']),
  };
  return {
    name: 'Admin',
    caption: 'Administração',
    roles: ['admin'],
    events: { OnShow: 'Mostrar' },
    header: true,
    children: [
      title('LBLTitulo', 'Administração'),
      tabs(
        'Abas',
        [
          'Usuários',
          'Locais',
          'Secretarias',
          'Serviços',
          'Bancadas',
          'Modelos de mensagem',
          'Filas',
          'Eventos',
        ],
        [
          'PNLUsuarios',
          'PNLLocais',
          'PNLSecretarias',
          'PNLServicos',
          'PNLBancadas',
          'PNLModelos',
          'PNLFilas',
          'PNLEventos',
        ],
      ),
      panel('PNLUsuarios', [
        grid(
          'GRDUsuarios',
          id,
          ops.usuarios,
          [
            ['Nome', 'nome_usuario'],
            ['Login', 'login_usuario', 180],
            ['Autorização', 'autorizacao_usuario', 110],
            ['Fila', 'fila_usuario', 80],
            ['Triagem', 'triagem_usuario', 90],
            ['Encerramento', 'encerramento_usuario', 120],
            ['Inservível', 'inservivel_usuario', 100],
            ['Ativo', 'status_usuario', 80],
          ],
          { server: true, height: 560, onCell: 'AbrirUsuario' },
        ),
      ]),
      panel('PNLLocais', [
        grid(
          'GRDLocais',
          id,
          ops.locais,
          [
            ['#', 'id_local', 80],
            ['Local', 'nome_local'],
            ['Endereço', 'endereco_local'],
            ['Secretaria', 'sigla_secretaria', 120],
            ['Região', 'regiao_local', 110],
            ['Ativo', 'status_local', 80],
            ['Infovia', 'infovia', 80],
          ],
          { server: true, height: 560, onCell: 'AbrirLocal' },
        ),
      ]),
      panel('PNLSecretarias', [
        grid(
          'GRDSecretarias',
          id,
          ops.secretarias,
          [
            ['#', 'id_secretaria', 80],
            ['Sigla', 'sigla_secretaria', 140],
            ['Nome', 'nome_secretaria'],
            ['Ativa', 'status_secretaria', 80],
          ],
          { height: 520 },
        ),
      ]),
      panel('PNLServicos', [
        grid(
          'GRDServicos',
          id,
          ops.servicos,
          [
            ['#', 'id_servico', 80],
            ['Serviço', 'nome_servico'],
            ['Fila', 'nome_fila', 160],
            ['Valor', 'valor_servico', 100],
            ['Pontos', 'pontuacao_servico', 90],
            ['Unidade', 'unidade_medida', 90],
            ['Ativo', 'status_servico', 80],
          ],
          { server: true, height: 560 },
        ),
      ]),
      panel('PNLBancadas', [
        grid(
          'GRDBancadas',
          id,
          ops.bancadas,
          [
            ['#', 'id_bancada', 80],
            ['Bancada', 'nome_bancada'],
            ['Ocupada', 'ocupado_bancada', 100],
            ['Ativa', 'status_bancada', 100],
          ],
          { height: 420 },
        ),
      ]),
      panel('PNLModelos', [
        grid(
          'GRDModelos',
          id,
          ops.modelos,
          [
            ['#', 'id_modelo_mensagem', 80],
            ['Tipo', 'tipo_modelo_mensagem', 160],
            ['Fila', 'nome_fila', 160],
            ['Mensagem', 'mensagem_modelo_mensagem'],
            ['Ativo', 'status_modelo_mensagem', 80],
          ],
          { height: 520 },
        ),
      ]),
      panel('PNLFilas', [
        grid(
          'GRDFilas',
          id,
          ops.filas,
          [
            ['#', 'id_fila', 80],
            ['Fila', 'nome_fila'],
            ['Status', 'status_fila', 120],
            ['Ícone', 'icone_fila', 200],
          ],
          { height: 420 },
        ),
      ]),
      panel('PNLEventos', [
        grid(
          'GRDEventos',
          id,
          ops.eventos,
          [
            ['#', 'id_evento', 100],
            ['Data', 'data_evento_fmt', 170],
            ['Usuário', 'nome_usuario', 200],
            ['Ação', 'acao_evento', 220],
            ['Descrição', 'desc_evento'],
          ],
          { server: true, height: 560 },
        ),
      ]),
      apiClient('Api', id, Object.values(ops)),
    ],
  };
}

function usuarioPage(): PageSpec {
  const id = defaultIdFactory();
  const perfil = op('Perfil', 'usuario-perfil', F.usuarioPerfil, ['id']);
  const produtividade = op('Produtividade', 'usuario-produtividade', F.produtividade, ['id']);
  const bloqueados = op('Bloqueados', 'usuario-bloqueados', F.bloqueados, ['id']);
  return {
    name: 'Usuario',
    caption: 'Usuário',
    roles: ['admin'],
    events: { OnShow: 'Mostrar' },
    header: true,
    children: [
      row('Topo', [
        { ...title('LBLUsuarioNome', 'Usuário'), width: 400, item: { width: 'fixed', grow: 1 } },
        button('BTNVoltar', 'Voltar', 'Voltar', 'arrow-left'),
      ]),
      panel('PNLDados', [
        details('Dados', [
          ['Login', 'Login'],
          ['Autorizacao', 'Autorização'],
          ['Permissoes', 'Permissões'],
          ['Interacoes', 'Interações (30 dias)'],
          ['UltimoEvento', 'Último evento'],
        ]),
      ]),
      panel('PNLProdutividade', [
        label('LBLProdutividade', 'Produtividade nos últimos 30 dias'),
        grid(
          'GRDProdutividade',
          id,
          produtividade,
          [
            ['Dia', 'dia', 140],
            ['Interações', 'interacoes'],
            ['Aberturas', 'aberturas'],
            ['Encerramentos', 'encerramentos'],
          ],
          { height: 300 },
        ),
      ]),
      panel('PNLBloqueados', [
        label('LBLBloqueados', 'Chamados bloqueados pelo usuário'),
        grid(
          'GRDBloqueados',
          id,
          bloqueados,
          [
            ['#', 'id_chamado', 90],
            ['Ticket', 'ticket_chamado', 170],
            ['Resumo', 'resumo_chamado'],
            ['Status', 'status_chamado', 120],
          ],
          { height: 360, onCell: 'AbrirChamado' },
        ),
      ]),
      apiClient('Api', id, [perfil, produtividade, bloqueados]),
    ],
  };
}

function localPage(): PageSpec {
  const id = defaultIdFactory();
  const local = op('Local', 'local', F.local, ['id']);
  const telefones = op('Telefones', 'local-telefones', F.telefones, ['id']);
  const secretarias = op('Secretarias', 'secretarias', F.secretarias, ['ativas']);
  return {
    name: 'Local',
    caption: 'Local',
    roles: ['*'],
    events: { OnShow: 'Mostrar' },
    header: true,
    children: [
      row('Topo', [
        { ...title('LBLLocal', 'Local'), width: 400, item: { width: 'fixed', grow: 1 } },
        button('BTNVoltar', 'Voltar', 'Voltar', 'arrow-left'),
      ]),
      panel('PNLDados', [
        details('Dados', [
          ['Endereco', 'Endereço'],
          ['Secretaria', 'Secretaria'],
          ['Regiao', 'Região'],
          ['Situacao', 'Situação'],
          ['Infovia', 'Infovia'],
        ]),
      ]),
      panel('PNLTelefones', [
        label('LBLTelefones', 'Telefones'),
        grid(
          'GRDTelefones',
          id,
          telefones,
          [
            ['Setor', 'setor'],
            ['Telefone', 'telefone', 200],
          ],
          { height: 320 },
        ),
      ]),
      apiClient('Api', id, [local, telefones, secretarias]),
    ],
  };
}

function negadoPage(): PageSpec {
  return {
    name: 'Negado',
    caption: 'Acesso negado',
    roles: ['*'],
    events: { OnShow: 'Mostrar' },
    header: true,
    children: [
      panel('PNLNegado', [
        title('LBLNegado', 'Acesso negado'),
        label('LBLTexto', 'Seu perfil no SIGAT não permite abrir esta tela.'),
        button('BTNVoltar', 'Ir para o painel', 'AbrirPainel', 'list'),
      ]),
    ],
  };
}

function naoEncontradaPage(): PageSpec {
  return {
    name: '404',
    caption: 'Página não encontrada',
    roles: [],
    events: {},
    header: false,
    children: [
      panel('PNLNaoEncontrada', [
        title('LBLNaoEncontrada', 'Página não encontrada'),
        button('BTNVoltar', 'Ir para o painel', 'AbrirPainel', 'list'),
      ]),
    ],
  };
}

// ---------------------------------------------------------------- project

export function buildSigat2Project(): {
  readonly project: WebRadProject;
  readonly userSources: Readonly<Record<string, string>>;
} {
  const base = applyProjectThemePreset(
    createProject('Sigat2', { pageWidth: 1280, pageHeight: 1200 }),
    'flat',
  );
  const index = base.pages.find((page) => page.id === base.entryPage);
  const notFound = base.pages.find((page) => page.name === '404');
  if (!index || !notFound) throw new Error('The mandatory index and 404 pages are missing.');
  const styles = [...base.styles, ...loginStyles(), ...sigatStyles()];
  const version = base.settings.nativeApplication.version;
  const specs = [
    painelPage(),
    loginPage(),
    chamadoPage(),
    triagemPage(),
    equipamentoPage(),
    buscaPage(),
    inserviveisPage(),
    remessaPage(),
    adminPage(),
    usuarioPage(),
    localPage(),
    negadoPage(),
  ];
  const pages = specs.map((spec) =>
    compose(
      spec.name === 'index' ? index : createPage(spec.name, { width: 1280, height: 1200 }),
      styles,
      spec,
      version,
    ),
  );
  const project = parseProject({
    ...base,
    settings: {
      ...base.settings,
      restGo: {
        ...base.settings.restGo,
        enabled: true,
        baseUrl: 'http://127.0.0.1:8090',
        apiVersion: 1,
        defaultDatabase: 'sigat',
        persistSession: true,
        sessionStorage: 'session',
        storageKey: 'sigat2',
      },
    },
    styles,
    sourceFiles: [
      ...(base.sourceFiles ?? []),
      { id: defaultIdFactory(), kind: 'unit', name: 'Sigat2' },
    ],
    assets: [
      ...(base.assets ?? []),
      {
        id: 'sigat2-asset-logo',
        fileName: LOGIN_LOGO_ASSET,
        mediaType: 'image/svg+xml',
        base64: Buffer.from(SIGAT_LOGO_SVG, 'utf8').toString('base64'),
      },
    ],
    pages: [...pages, compose(notFound, styles, naoEncontradaPage(), version)],
  });
  return { project, userSources: SIGAT2_SOURCES };
}
