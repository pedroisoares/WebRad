import type {
  WebButton,
  WebButtonIcon,
  WebDataGrid,
  WebHtml,
  WebLabel,
  WebTabs,
} from '@webrad/runtime';

export type Linha = Readonly<Record<string, unknown>>;

// Runtime globals are installed after the units load, so configure on the next tick.
// Until then the router falls back to /login, which is this project's Login page.
queueMicrotask(() => Access.configure({ loginPage: 'Login', deniedPage: 'Negado' }));

/**
 * Sets an operation's parameters and runs it. Values passed to execute() only
 * fill body templates, so query parameters must be assigned first.
 */
export function executar(
  operacao: { readonly parameter: object; execute(): Promise<unknown> },
  valores: Readonly<Record<string, string | number | boolean | undefined>>,
): Promise<unknown> {
  for (const [nome, valor] of Object.entries(valores)) Reflect.set(operacao.parameter, nome, valor);
  return operacao.execute();
}

/** Rows of a HexAPI envelope ({ success, data: [...] }). */
export function linhas(resposta: unknown): Linha[] {
  const data: unknown =
    typeof resposta === 'object' && resposta !== null ? Reflect.get(resposta, 'data') : undefined;
  return Array.isArray(data) ? (data as Linha[]) : [];
}

export function primeira(resposta: unknown): Linha | undefined {
  return linhas(resposta)[0];
}

export function texto(valor: unknown, vazio = '-'): string {
  if (valor === null || valor === undefined || valor === '') return vazio;
  return String(valor);
}

export function numero(valor: unknown): number | null {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function sim(valor: unknown): boolean {
  return valor === true || valor === 1 || valor === '1' || valor === 'true';
}

/** The HexAPI message ({ success: false, error }) when there is one, else the error text. */
export function erro(e: unknown): string {
  if (typeof e === 'object' && e !== null) {
    const corpo: unknown = Reflect.get(e, 'body');
    if (typeof corpo === 'object' && corpo !== null) {
      const mensagem: unknown = Reflect.get(corpo, 'error');
      if (typeof mensagem === 'string' && mensagem !== '') return mensagem;
    }
  }
  return e instanceof Error ? e.message : String(e);
}

// ---- writes: HexAPI composite operations

type ValorGravacao = string | number | boolean | null | readonly (string | number)[];

interface Gravacao {
  execute(opcoes?: {
    readonly parameters?: Readonly<Record<string, ValorGravacao>>;
    readonly headers?: Readonly<Record<string, string>>;
  }): Promise<unknown>;
}

function novaChave(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }
}

function deveRepetir(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const status: unknown = Reflect.get(e, 'status');
  // No status: network failure or timeout, so the outcome is unknown.
  if (typeof status !== 'number') return true;
  if (status >= 500) return true;
  // 409 with Retry-After: the same Idempotency-Key is still running.
  const resposta: unknown = Reflect.get(e, 'response');
  return status === 409 && resposta instanceof Response && resposta.headers.has('Retry-After');
}

/**
 * Runs a write with one Idempotency-Key per user action. Retries after a network
 * failure, timeout or 5xx reuse the key, so HexAPI never records the action twice.
 * Business refusals (409 with a message) are not retried.
 */
export async function gravar(
  operacao: Gravacao,
  valores: Readonly<Record<string, ValorGravacao>>,
): Promise<unknown> {
  const chave = novaChave();
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await operacao.execute({ parameters: valores, headers: { 'Idempotency-Key': chave } });
    } catch (e) {
      if (tentativa >= 3 || !deveRepetir(e)) throw e;
      await new Promise((resolver) => setTimeout(resolver, 400 * 2 ** tentativa));
    }
  }
}

/** The same roles the HexAPI derives from the SIGAT usuario table. */
export function papeisDoUsuario(u: Linha): string[] {
  const papeis = ['nivel' + texto(u.autorizacao_usuario, '0')];
  if ((numero(u.autorizacao_usuario) ?? 0) >= 4) papeis.push('admin');
  if (sim(u.triagem_usuario)) papeis.push('triagem');
  if (sim(u.encerramento_usuario)) papeis.push('encerramento');
  if (sim(u.inservivel_usuario)) papeis.push('inservivel');
  if ((numero(u.fila_usuario) ?? 0) > 0) papeis.push('fila' + texto(u.fila_usuario));
  return papeis;
}

// ---- context passed between pages (kept per browser tab, survives reload)

function guardar(chave: string, valor: string): void {
  try {
    sessionStorage.setItem('sigat2.' + chave, valor);
  } catch {
    // Storage may be blocked; the page then shows its empty state.
  }
}

function ler(chave: string): string {
  try {
    return sessionStorage.getItem('sigat2.' + chave) ?? '';
  } catch {
    return '';
  }
}

export function abrir(pagina: string, chave: string, valor: unknown): void {
  guardar(chave, String(valor ?? ''));
  Navigate(pagina);
}

export function contexto(chave: string): string {
  return ler(chave);
}

export function abrirChamado(id: unknown): void {
  if (numero(id) !== null) abrir('Chamado', 'chamado', id);
}

export function abrirEquipamento(num: unknown): void {
  if (texto(num, '') !== '') abrir('Equipamento', 'equipamento', num);
}

// ---- header shared by every signed-in page

/** The navbar and footer components every signed-in page has (see header() and footer()). */
export interface Moldura {
  readonly LBLUsuario: WebLabel;
  readonly BTNBloqueados: WebButton;
  readonly LBLRodapeGrupo: WebLabel;
  readonly LBLRodapeAmbiente: WebLabel;
}

/** Bootstrap 4 badge colours named by grupo.cor_grupo. */
const COR_DO_GRUPO: Readonly<Record<string, readonly [fundo: string, texto: string]>> = {
  primary: ['#007bff', '#ffffff'],
  secondary: ['#6c757d', '#ffffff'],
  success: ['#28a745', '#ffffff'],
  danger: ['#dc3545', '#ffffff'],
  warning: ['#ffc107', '#212529'],
  info: ['#17a2b8', '#ffffff'],
  light: ['#f8f9fa', '#212529'],
  dark: ['#343a40', '#ffffff'],
};

function ambiente(): string {
  const host = location.hostname;
  return host === 'localhost' || host.startsWith('127.') || host === ''
    ? 'development'
    : 'production';
}

/** Fills the navbar greeting and lock count and the footer group badge and environment. */
export function preencherCabecalho(pagina: Moldura): void {
  const dados = Access.user?.data ?? {};
  pagina.LBLUsuario.caption = (Access.user?.name ?? '') + '!';
  mostrarBloqueados(pagina, numero(dados.total_bloqueados));
  pagina.LBLRodapeGrupo.caption = texto(dados.nome_grupo);
  const [fundo, cor] = COR_DO_GRUPO[texto(dados.cor_grupo, 'secondary')] ??
    COR_DO_GRUPO.secondary ?? ['#6c757d', '#ffffff'];
  pagina.LBLRodapeGrupo.backgroundColor = fundo;
  pagina.LBLRodapeGrupo.color = cor;
  pagina.LBLRodapeAmbiente.caption = pagina.LBLRodapeAmbiente.caption.replace(
    /Ambiente: [^|]*/u,
    'Ambiente: ' + ambiente() + ' ',
  );
}

/** The yellow lock badge: how many open chamados the user holds. */
export function mostrarBloqueados(
  pagina: Pick<Moldura, 'BTNBloqueados'>,
  total: number | null,
): void {
  pagina.BTNBloqueados.caption = String(total ?? 0);
  pagina.BTNBloqueados.element.title =
    (total ?? 0) === 1
      ? '1 chamado bloqueado por você'
      : String(total ?? 0) + ' chamados bloqueados por você';
}

/** SIGAT lists the user's locked chamados from the lock badge; SIGAT2 opens the user's page. */
export function abrirBloqueados(): void {
  const id = Access.user?.id ?? '';
  if (Access.hasRole('admin') && id !== '') {
    abrir('Usuario', 'usuario', id);
    return;
  }
  const total = numero(Access.user?.data?.total_bloqueados) ?? 0;
  Toast(
    total === 1
      ? 'Você tem 1 chamado bloqueado.'
      : 'Você tem ' + String(total) + ' chamados bloqueados.',
    { kind: 'info' },
  );
}

export function buscar(termo: string): void {
  const t = termo.trim();
  if (t.length < 3) {
    Toast('Digite ao menos 3 caracteres para buscar.', { kind: 'warning' });
    return;
  }
  abrir('Busca', 'busca', t);
}

export async function sair(): Promise<void> {
  try {
    await RestGO.logout();
  } catch {
    // The local session is cleared even when the server is unreachable.
  }
  Access.clear();
  Navigate('Login');
}

// ---- HTML shown inside sandboxed WebHtml frames

const ESTILO =
  '<style>body{font-family:system-ui,sans-serif;font-size:14px;margin:0;padding:8px;color:#1f2937}' +
  '.item{border-radius:8px;padding:8px 10px;margin:0 0 10px;border:1px solid #e5e7eb}' +
  '.topo{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:#4b5563}' +
  '.tag{display:inline-block;border-radius:6px;padding:1px 6px;font-size:12px;background:#eef2ff;color:#3730a3}' +
  '.vazio{color:#6b7280}</style>';

export function escapar(valor: unknown): string {
  return texto(valor, '').replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

export function mostrarArtigos(destino: WebHtml, artigos: readonly Linha[]): void {
  const itens = artigos.map(
    (a) =>
      '<div class="item"><div class="topo"><span><strong>' +
      escapar(a.a_from) +
      '</strong> ' +
      escapar(a.a_subject) +
      '</span><span>' +
      escapar(a.create_time_fmt) +
      '</span></div><hr>' +
      texto(a.a_body, '') +
      '</div>',
  );
  destino.html =
    ESTILO + (itens.length > 0 ? itens.join('') : '<p class="vazio">Nenhuma mensagem.</p>');
}
// ---- SIGAT visual signals
//
// The badges and icons SIGAT attendants already read at a glance (painel.js,
// Chamado::listar_chamados_painel, ver_chamado.php and the ConsulTIC manual),
// redrawn with the Lucide shapes WebRAD bundles (ISC) in the SIGAT Bootstrap 4
// colours. Every signal also has a text form, so colour is never the only cue.

/** SIGAT config: tempo_medio_atendimento (6 h) and tempo_max_atendimento (24 h). */
export const ESPERA_ATENCAO_MIN = 6 * 60;
export const ESPERA_CRITICA_MIN = 24 * 60;
/** SIGAT lets users up to level 2 hold at most 3 open chamados of queue 1 (Remoto). */
export const LIMITE_BLOQUEIOS_REMOTO = 3;

const COR = {
  perigo: '#dc3545',
  perigoBorda: '#a71d2a',
  alerta: '#ffc107',
  alertaBorda: '#8a6d00',
  sucesso: '#28a745',
  sucessoBorda: '#1e7e34',
  info: '#17a2b8',
  primario: '#007bff',
  secundario: '#6c757d',
  escuro: '#212529',
} as const;

type NoSvg = readonly [string, Readonly<Record<string, string>>];

const FORMAS: Readonly<Record<string, readonly NoSvg[]>> = {
  star: [
    [
      'path',
      {
        d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
      },
    ],
  ],
  circle: [['circle', { cx: '12', cy: '12', r: '10' }]],
  hands: [['path', { d: 'M12 6v6l4 2' }]],
  mail: [
    ['path', { d: 'm22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7' }],
    ['rect', { x: '2', y: '4', width: '20', height: '16', rx: '2' }],
  ],
  truck: [
    ['path', { d: 'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2' }],
    ['path', { d: 'M15 18H9' }],
    [
      'path',
      { d: 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14' },
    ],
    ['circle', { cx: '17', cy: '18', r: '2' }],
    ['circle', { cx: '7', cy: '18', r: '2' }],
  ],
  lock: [
    ['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
  ],
  'lock-open': [
    ['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 9.9-1' }],
  ],
  alert: [
    ['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }],
    ['path', { d: 'M12 9v4' }],
    ['path', { d: 'M12 17h.01' }],
  ],
  pause: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M10 15V9' }],
    ['path', { d: 'M14 15V9' }],
  ],
  headset: [
    [
      'path',
      {
        d: 'M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z',
      },
    ],
    ['path', { d: 'M21 16v2a4 4 0 0 1-4 4h-5' }],
  ],
  footprints: [
    [
      'path',
      {
        d: 'M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z',
      },
    ],
    [
      'path',
      {
        d: 'M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z',
      },
    ],
    ['path', { d: 'M16 17h4' }],
    ['path', { d: 'M4 13h4' }],
  ],
  wrench: [
    [
      'path',
      {
        d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z',
      },
    ],
  ],
  boxes: [
    [
      'path',
      {
        d: 'M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z',
      },
    ],
    ['path', { d: 'm7 16.5-4.74-2.85' }],
    ['path', { d: 'm7 16.5 5-3' }],
    ['path', { d: 'M7 16.5v5.17' }],
    [
      'path',
      {
        d: 'M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z',
      },
    ],
    ['path', { d: 'm17 16.5-5-3' }],
    ['path', { d: 'm17 16.5 4.74-2.85' }],
    ['path', { d: 'M17 16.5v5.17' }],
    [
      'path',
      {
        d: 'M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z',
      },
    ],
    ['path', { d: 'M12 8 7.26 5.15' }],
    ['path', { d: 'm12 8 4.74-2.85' }],
    ['path', { d: 'M12 13.5V8' }],
  ],
  network: [
    ['rect', { x: '16', y: '16', width: '6', height: '6', rx: '1' }],
    ['rect', { x: '2', y: '16', width: '6', height: '6', rx: '1' }],
    ['rect', { x: '9', y: '2', width: '6', height: '6', rx: '1' }],
    ['path', { d: 'M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3' }],
    ['path', { d: 'M12 12V8' }],
  ],
  'phone-call': [
    ['path', { d: 'M13 2a9 9 0 0 1 9 9' }],
    ['path', { d: 'M13 6a5 5 0 0 1 5 5' }],
    [
      'path',
      {
        d: 'M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384',
      },
    ],
  ],
  'radio-tower': [
    ['path', { d: 'M4.9 16.1C1 12.2 1 5.8 4.9 1.9' }],
    ['path', { d: 'M7.8 4.7a6.14 6.14 0 0 0-.8 7.5' }],
    ['circle', { cx: '12', cy: '9', r: '2' }],
    ['path', { d: 'M16.2 4.8c2 2 2.26 5.11.8 7.47' }],
    ['path', { d: 'M19.1 1.9a9.96 9.96 0 0 1 0 14.1' }],
    ['path', { d: 'M9.5 18h5' }],
    ['path', { d: 'm8 22 4-11 4 11' }],
  ],
  'ethernet-port': [
    ['path', { d: 'M10 8v1' }],
    ['path', { d: 'M14 8v1' }],
    ['path', { d: 'M18 8v1' }],
    [
      'path',
      {
        d: 'M19 17a2 2 0 00-1.765 1.059l-.47.882A2 2 0 0115 20H9a2 2 0 01-1.765-1.059l-.47-.882A2 2 0 005 17H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v9a2 2 0 01-2 2z',
      },
    ],
    ['path', { d: 'M6 8v1' }],
  ],
  package: [
    [
      'path',
      {
        d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z',
      },
    ],
    ['path', { d: 'M12 22V12' }],
    ['polyline', { points: '3.29 7 12 12 20.71 7' }],
    ['path', { d: 'm7.5 4.27 9 5.15' }],
  ],
};

/** fila.icone_fila holds Font Awesome 5 classes; each maps to the closest Lucide shape. */
const ICONE_DA_FILA: Readonly<Record<string, string>> = {
  'fa-headset': 'headset',
  'fa-walking': 'footprints',
  'fa-tools': 'wrench',
  'fa-cubes': 'boxes',
  'fa-project-diagram': 'network',
  'fa-phone-volume': 'phone-call',
  'fa-network-wired': 'ethernet-port',
  'fa-broadcast-tower': 'radio-tower',
  'fa-box': 'package',
  'fa-truck': 'truck',
};

export function formaDaFila(iconeFila: unknown): string {
  const classes = texto(iconeFila, '').split(/\s+/);
  for (const classe of classes) {
    const forma = ICONE_DA_FILA[classe];
    if (forma !== undefined) return forma;
  }
  return 'package';
}

/** One Lucide shape placed at (x, y) with the given size; estilo holds fill/stroke attributes. */
function forma(nome: string, x: number, y: number, tamanho: number, estilo: string): string {
  const nos = FORMAS[nome] ?? [];
  return (
    '<g transform="translate(' +
    x +
    ' ' +
    y +
    ') scale(' +
    tamanho / 24 +
    ')" ' +
    estilo +
    '>' +
    nos
      .map(
        ([tag, atributos]) =>
          '<' +
          tag +
          Object.entries(atributos)
            .map(([k, v]) => ' ' + k + '="' + v + '"')
            .join('') +
          '/>',
      )
      .join('') +
    '</g>'
  );
}

const TRACO = 'fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"';

function solido(
  nome: string,
  x: number,
  y: number,
  tamanho: number,
  cor: string,
  borda: string,
): string {
  return forma(
    nome,
    x,
    y,
    tamanho,
    'fill="' + cor + '" stroke="' + borda + '" stroke-width="1.5" stroke-linejoin="round"',
  );
}

function relogio(x: number, y: number, tamanho: number, critico: boolean): string {
  const cor = critico ? COR.perigo : COR.alerta;
  const borda = critico ? COR.perigoBorda : COR.alertaBorda;
  return (
    solido('circle', x, y, tamanho, cor, borda) +
    forma('hands', x, y, tamanho, TRACO + ' stroke="' + (critico ? '#ffffff' : COR.escuro) + '"')
  );
}

/** Rounded Bootstrap badge with a stroked icon inside. */
function selo(
  nome: string,
  x: number,
  y: number,
  fundo: string,
  cor: string,
  largura = 26,
): string {
  return (
    '<rect x="' +
    x +
    '" y="' +
    y +
    '" width="' +
    largura +
    '" height="20" rx="4" fill="' +
    fundo +
    '"/>' +
    forma(nome, x + (largura - 14) / 2, y + 3, 14, TRACO + ' stroke="' + cor + '"')
  );
}

function svg(largura: number, altura: number, corpo: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    largura +
    '" height="' +
    altura +
    '" viewBox="0 0 ' +
    largura +
    ' ' +
    altura +
    '" aria-hidden="true" focusable="false">' +
    corpo +
    '</svg>'
  );
}

function imagem(largura: number, altura: number, corpo: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(svg(largura, altura, corpo));
}

/** SIGAT painel status: PRIORIDADE (red star), ABERTO (yellow circle), FECHADO (green circle). */
export function iconeStatus(status: string, x = 9, y = 9, tamanho = 18): string {
  if (status === 'PRIORIDADE') return solido('star', x, y, tamanho, COR.perigo, COR.perigoBorda);
  if (status === 'FECHADO') return solido('circle', x, y, tamanho, COR.sucesso, COR.sucessoBorda);
  return solido('circle', x, y, tamanho, COR.alerta, COR.alertaBorda);
}

export function nomeDoStatus(status: string): string {
  return status === 'PRIORIDADE'
    ? 'Prioridade'
    : status === 'FECHADO'
      ? 'Fechado'
      : status === 'ABERTO'
        ? 'Aberto'
        : texto(status);
}

/** Time without interaction as SIGAT shows it, e.g. "1a 2m", "2d 3h", "5h 10min", "Agora mesmo". */
export function tempoDeEspera(minutos: number | null): string {
  if (minutos === null || minutos < 1) return 'Agora mesmo';
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const resto = minutos % 60;
  if (dias >= 365) return Math.floor(dias / 365) + 'a ' + Math.floor((dias % 365) / 30) + 'm';
  if (dias >= 30) return Math.floor(dias / 30) + 'm ' + (dias % 30) + 'd';
  if (dias > 0) return dias + 'd ' + horas + 'h';
  if (horas > 0) return horas + 'h ' + resto + 'min';
  return resto + 'min';
}

/** 0 = within the SIGAT window, 1 = over 6 h (yellow clock), 2 = 24 h or more (red clock). */
export function nivelDeEspera(minutos: number | null): 0 | 1 | 2 {
  if (minutos === null) return 0;
  if (minutos >= ESPERA_CRITICA_MIN) return 2;
  return minutos >= ESPERA_ATENCAO_MIN ? 1 : 0;
}

export type Entrega = '' | 'PRONTO' | 'PARCIAL';

export function situacaoDaEntrega(entregaChamado: unknown, equipPendentes: unknown): Entrega {
  if (numero(entregaChamado) !== 1) return '';
  return (numero(equipPendentes) ?? 0) > 0 ? 'PARCIAL' : 'PRONTO';
}

/**
 * Adds the painel signals to each row of painel-chamados, as Chamado::listar_chamados_painel
 * draws them: the status icon, the clock and unread e-mail badge that follow the requester,
 * the queue and delivery badges that follow the location, the wait time and a text summary
 * of all of them. Rows already prepared are left alone.
 */
export function prepararLinhasDoPainel(resposta: unknown): void {
  for (const linha of linhas(resposta) as Record<string, unknown>[]) {
    if (typeof linha.sinal_status === 'string') continue;
    const status = texto(linha.status_painel, '');
    const minutos = numero(linha.minutos_espera);
    const nivel = nivelDeEspera(minutos);
    const naoLidos = numero(linha.email_nao_lido_chamado) ?? 0;
    const entrega = situacaoDaEntrega(linha.entrega_chamado, linha.equip_pendentes);
    let solicitante = '';
    let x = 1;
    const avisos: string[] = [];
    if (nivel > 0) {
      solicitante += relogio(x, 1, 16, nivel === 2);
      x += 20;
      avisos.push(
        nivel === 2
          ? 'Chamado pendente há mais de 24 horas'
          : 'Chamado pendente há mais de 6 horas',
      );
    }
    if (naoLidos > 0) {
      solicitante += selo('mail', x, 0, COR.info, '#ffffff', 22);
      x += 24;
      avisos.push('e-mail não lido');
    }
    const fila = texto(linha.nome_fila, '');
    let local = selo(formaDaFila(linha.icone_fila), 1, 0, COR.secundario, '#ffffff', 22);
    const locais = ['Fila ' + fila];
    if (entrega !== '') {
      local += selo(
        'truck',
        25,
        0,
        entrega === 'PRONTO' ? COR.sucesso : COR.alerta,
        entrega === 'PRONTO' ? '#ffffff' : COR.escuro,
        22,
      );
      locais.push(
        entrega === 'PRONTO' ? 'Pronto para entrega' : 'Parcialmente pronto para entrega',
      );
    }
    const partes = [nomeDoStatus(status)];
    if (nivel > 0) partes.push((nivel === 2 ? '24h+' : '6h+') + ' sem interação');
    if (naoLidos > 0) partes.push('e-mail não lido');
    if (entrega === 'PRONTO') partes.push('entrega pronta');
    if (entrega === 'PARCIAL') partes.push('entrega parcial');
    linha.sinal_status = imagem(20, 20, iconeStatus(status, 2, 2, 16));
    linha.sinal_solicitante = solicitante === '' ? '' : imagem(x, 20, solicitante);
    linha.aviso_solicitante = avisos.join(', ');
    linha.sinal_local = imagem(entrega === '' ? 24 : 48, 20, local);
    linha.aviso_local = locais.join(', ');
    linha.situacao = partes.join(' · ');
    linha.espera_fmt = tempoDeEspera(minutos);
  }
}

// ---- painel decorations: SIGAT puts badges inside the text cells and icons in the tabs

const CSS_PAINEL =
  '[data-sigat2-lista] .wr-data-grid-body-row:hover > .wr-data-grid-cell{background:bisque;cursor:pointer}' +
  '.sigat2-sinal{display:inline-block;height:19px;margin-left:4px;vertical-align:top}' +
  '.sigat2-contador{display:inline-block;margin-left:2px;padding:2px 5px;border-radius:4px;background:#f8f9fa;color:#212529;font-size:11px;font-weight:700;line-height:1}' +
  '.sigat2-aba-icone{display:inline-block;width:16px;height:16px;margin-right:6px;vertical-align:-2px}' +
  '.sigat2-aba-icone svg{display:block;width:16px;height:16px}' +
  '[data-sigat2-abas] .wr-tab{opacity:1;font-weight:400;padding:8px 16px}' +
  '[data-sigat2-abas] .wr-tab[aria-selected="true"]{color:#495057;border-color:#dee2e6 #dee2e6 #fff;font-weight:400}' +
  '[data-sigat2-abas] .wr-tab:hover:not([aria-selected="true"]){border-color:#e9ecef #e9ecef #dee2e6}';

function estiloDoPainel(documento: Document): void {
  if (documento.getElementById('sigat2-painel-css') !== null) return;
  const estilo = documento.createElement('style');
  estilo.id = 'sigat2-painel-css';
  estilo.textContent = CSS_PAINEL;
  documento.head.append(estilo);
}

/** Field of a row that holds the signal image drawn after the text of a column. */
const SINAIS_DA_COLUNA: Readonly<Record<string, readonly [imagem: string, aviso: string]>> = {
  '/nome_solicitante_chamado': ['sinal_solicitante', 'aviso_solicitante'],
  '/nome_local': ['sinal_local', 'aviso_local'],
};

function decorarLinhas(grade: WebDataGrid): void {
  const colunas = new Map(
    grade.configuration.columns.map((coluna) => [coluna.id, coluna.fieldPath]),
  );
  const linhasVisiveis = grade.visibleRows;
  const corpo = grade.element.querySelectorAll<HTMLElement>(
    '.wr-data-grid-body > .wr-data-grid-body-row',
  );
  corpo.forEach((elemento, indice) => {
    const linha = linhasVisiveis[indice] as Linha | undefined;
    if (linha === undefined || elemento.dataset.sigat2Sinais === 'true') return;
    elemento.dataset.sigat2Sinais = 'true';
    for (const celula of elemento.querySelectorAll<HTMLElement>('.wr-data-grid-cell')) {
      const campo = colunas.get(celula.dataset.webradDataGridColumn ?? '') ?? '';
      if (campo === '/resumo_chamado') celula.title = texto(linha.resumo_chamado, '');
      if (campo === '/sinal_status') {
        const imagemStatus = celula.querySelector('img');
        if (imagemStatus !== null)
          imagemStatus.alt = imagemStatus.title = texto(linha.situacao, '');
      }
      const sinal = SINAIS_DA_COLUNA[campo];
      if (sinal === undefined) continue;
      if (campo === '/nome_solicitante_chamado' && (numero(linha.email_nao_lido_chamado) ?? 0) > 0)
        celula.style.fontWeight = '700';
      const fonte = texto(linha[sinal[0]], '');
      if (fonte === '') continue;
      const imagemSinal = celula.ownerDocument.createElement('img');
      imagemSinal.className = 'sigat2-sinal';
      imagemSinal.src = fonte;
      imagemSinal.alt = imagemSinal.title = texto(linha[sinal[1]], '');
      celula.append(imagemSinal);
    }
  });
}

/**
 * Draws the SIGAT badges right after the requester and location texts of the painel list,
 * and the DataTables row highlight. The cells keep their text, so sorting and searching
 * still work on them. Runs again whenever the grid draws new rows.
 */
export function sinaisNaLista(grade: WebDataGrid): void {
  estiloDoPainel(grade.element.ownerDocument);
  grade.element.dataset.sigat2Lista = 'true';
  const observador = new MutationObserver(() => decorarLinhas(grade));
  observador.observe(grade.element, { childList: true, subtree: true });
  decorarLinhas(grade);
}

/** Marks a list with the DataTables row highlight of the painel. */
export function destacarLinhas(grade: WebDataGrid): void {
  estiloDoPainel(grade.element.ownerDocument);
  grade.element.dataset.sigat2Lista = 'true';
}

const FORMAS_DAS_ABAS: Readonly<Record<string, readonly NoSvg[]>> = {
  funnel: [
    [
      'path',
      {
        d: 'M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z',
      },
    ],
  ],
  archive: [
    ['rect', { width: '20', height: '5', x: '2', y: '3', rx: '1' }],
    ['path', { d: 'M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8' }],
    ['path', { d: 'M10 12h4' }],
  ],
};

/** The nav-tabs look of the SIGAT painel, with the Font Awesome icons redrawn in Lucide. */
export function iconesNasAbas(abas: WebTabs, icones: readonly string[]): void {
  estiloDoPainel(abas.element.ownerDocument);
  abas.element.dataset.sigat2Abas = 'true';
  abas.element.querySelectorAll<HTMLElement>('[role="tab"]').forEach((aba, indice) => {
    const nome = icones[indice];
    if (nome === undefined || aba.querySelector('.sigat2-aba-icone') !== null) return;
    const nos = FORMAS_DAS_ABAS[nome] ?? FORMAS[nome] ?? [];
    const icone = aba.ownerDocument.createElement('span');
    icone.className = 'sigat2-aba-icone';
    icone.setAttribute('aria-hidden', 'true');
    icone.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      nos
        .map(
          ([tag, atributos]) =>
            '<' +
            tag +
            Object.entries(atributos)
              .map(([k, v]) => ' ' + k + '="' + v + '"')
              .join('') +
            '/>',
        )
        .join('') +
      '</svg>';
    aba.prepend(icone);
  });
}

/** The badge-light counter that SIGAT puts on the selected queue button. */
export function contadorNoBotao(botao: WebButton, valor: number | null): void {
  botao.element.querySelector('.sigat2-contador')?.remove();
  if (valor === null) return;
  estiloDoPainel(botao.element.ownerDocument);
  const contador = botao.element.ownerDocument.createElement('span');
  contador.className = 'sigat2-contador';
  contador.textContent = String(valor);
  botao.element.append(contador);
}

/** fila.icone_fila (Font Awesome 5) mapped to the closest icon of the WebRAD button catalogue. */
const ICONE_DO_BOTAO: Readonly<Record<string, WebButtonIcon>> = {
  'fa-headset': 'headset',
  'fa-walking': 'user',
  'fa-tools': 'settings',
  'fa-cubes': 'archive',
  'fa-project-diagram': 'share',
  'fa-phone-volume': 'phone',
  'fa-network-wired': 'server',
  'fa-broadcast-tower': 'radio',
  'fa-box': 'gift',
  'fa-truck': 'truck',
  'fa-chalkboard-teacher': 'monitor',
  'fa-laptop': 'laptop',
  'fa-desktop': 'monitor',
  'fa-print': 'printer',
};

export function iconeDoBotaoDaFila(iconeFila: unknown): WebButtonIcon {
  for (const classe of texto(iconeFila, '').split(' ')) {
    const icone = ICONE_DO_BOTAO[classe];
    if (icone !== undefined) return icone;
  }
  return 'list';
}

// ---- Ver chamado: the SIGAT tab contents, in Bootstrap 4 colours, inside sandboxed frames

const ESTILO_BOOTSTRAP =
  '<style>body{font-family:-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;' +
  'font-size:16px;line-height:1.5;margin:0;padding:0 1px;color:#212529}' +
  'hr{border:0;border-top:1px solid rgba(0,0,0,.1);margin:0}' +
  '.interacao{margin:0 0 16px;padding:4px;border-radius:4px;overflow:hidden}.interacao .data{float:right}' +
  '.alteracao{margin:0 0 24px;padding:12px;border:1px solid rgba(0,0,0,.125);border-radius:4px}' +
  '.alteracao .data{display:inline-block;padding:4px 7px;margin-right:4px;border-radius:4px;background:#17a2b8;color:#fff;font-size:12px;font-weight:700;line-height:1}' +
  '.artigos{border:1px solid rgba(0,0,0,.125);border-radius:4px;overflow:hidden}' +
  'details{border-bottom:1px solid rgba(0,0,0,.125)}details:last-child{border-bottom:0}' +
  'summary{display:flex;justify-content:space-between;gap:12px;padding:12px 48px;background:rgba(0,0,0,.03);color:#007bff;cursor:pointer;list-style:none}' +
  'summary::-webkit-details-marker{display:none}summary:hover{text-decoration:underline}' +
  'details[open] summary{border-bottom:1px solid rgba(0,0,0,.125)}' +
  'pre{margin:0;padding:20px 30px;font-size:14px;white-space:pre-wrap;word-break:break-word;font-family:SFMono-Regular,Menlo,Monaco,Consolas,monospace}' +
  '.vazio{color:#6c757d;margin:8px 0}</style>';

/** Bootstrap table-* backgrounds used by Json::interacoes for each interaction type. */
const FUNDO_INTERACAO: Readonly<Record<string, string>> = {
  ABERTURA: '#d6d8db',
  ALT: '#d6d8db',
  ATENDIMENTO: '#b8daff',
  ATENDIMENTO_INS: '#b8daff',
  ALT_FILA: '#ffeeba',
  OBSERVACAO: '#bee5eb',
  TENTATIVA_ENTREGA: '#bee5eb',
  FECHAMENTO: '#c3e6cb',
  FECHAMENTO_EQUIP: '#c3e6cb',
  FECHAMENTO_INS: '#c3e6cb',
  FECHAMENTO_MAN: '#c3e6cb',
  ENTREGA: '#c3e6cb',
  FALHA_ENTREGA: '#f5c6cb',
  ESPERA: '#ffa789',
  REM_ESPERA: '#fff0fe',
  INSERVIVEL_REPARO: '#f5c6cb',
};

/** The sentence after the user's name in Json::interacoes (already HTML). */
const ACAO_INTERACAO: Readonly<Record<string, string>> = {
  ATENDIMENTO: 'realizou um <strong>atendimento</strong>',
  ATENDIMENTO_INS: 'realizou um <strong>atendimento</strong>',
  ALT: 'alterou dados do chamado',
  ALT_FILA: 'alterou a <strong>fila</strong>',
  OBSERVACAO: 'fez uma <strong>observação</strong>',
  FECHAMENTO: 'finalizou o chamado',
  FECHAMENTO_EQUIP: 'finalizou o chamado',
  FECHAMENTO_INS: 'finalizou o chamado',
  FECHAMENTO_MAN: 'finalizou o chamado',
  ENTREGA: 'realizou a entrega',
  TENTATIVA_ENTREGA: 'registrou uma <b>tentativa</b> de entrega',
  FALHA_ENTREGA: 'registrou uma <b>falha</b> na <b>entrega</b>',
  ESPERA: 'deixou equipamentos em <b>espera</b>',
  REM_ESPERA: 'retirou equipamentos da <b>espera</b>',
  INSERVIVEL_REPARO: 'registrou um <b>inservível</b>',
};

/**
 * The Interações tab as Json::interacoes draws it: one coloured box per interaction, newest
 * first. Texts are HTML saved by SIGAT; the sandboxed frame runs no scripts.
 */
export function mostrarInteracoesDoChamado(destino: WebHtml, interacoes: readonly Linha[]): void {
  const itens = interacoes.map((i) => {
    const tipo = texto(i.tipo_interacao, '');
    const acao = ACAO_INTERACAO[tipo];
    return (
      '<div class="interacao" style="background:' +
      (FUNDO_INTERACAO[tipo] ?? '#d6d8db') +
      '">' +
      '<span class="data">' +
      escapar(i.data_interacao) +
      '</span><strong>' +
      escapar(i.nome_usuario) +
      '</strong>' +
      (acao === undefined
        ? texto(i.texto_interacao, '')
        : ' ' + acao + '<hr>' + texto(i.texto_interacao, '')) +
      '</div>'
    );
  });
  destino.html =
    ESTILO_BOOTSTRAP +
    (itens.length > 0 ? itens.join('') : '<p class="vazio">Nenhuma interação.</p>');
}

/** OTOBO dates are UTC in the database; ver_chamado.php subtracts 3 hours and shows d/m/y - H:i:s. */
function dataDoArtigo(valor: unknown): string {
  const data = new Date(texto(valor, ''));
  if (Number.isNaN(data.getTime())) return texto(valor, '');
  const local = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  const dois = (n: number): string => String(n).padStart(2, '0');
  return (
    dois(local.getUTCDate()) +
    '/' +
    dois(local.getUTCMonth() + 1) +
    '/' +
    dois(local.getUTCFullYear() % 100) +
    ' - ' +
    dois(local.getUTCHours()) +
    ':' +
    dois(local.getUTCMinutes()) +
    ':' +
    dois(local.getUTCSeconds())
  );
}

/**
 * The Comunicação tab as ver_chamado.php draws it: an accordion of the ticket e-mails,
 * newest first and open, with the sender without the address. The unread ones are bold.
 */
export function mostrarComunicacao(
  destino: WebHtml,
  artigos: readonly Linha[],
  naoLidos: number,
): void {
  const itens = artigos.map((a, indice) => {
    const remetente = escapar(texto(a.a_from, '').replace(/\s<.+>/, ''));
    return (
      '<details' +
      (indice === 0 ? ' open' : '') +
      '><summary><span>' +
      (indice < naoLidos ? '<strong>' + remetente + '</strong>' : remetente) +
      '</span><span>' +
      escapar(dataDoArtigo(a.create_time)) +
      '</span></summary>' +
      '<pre>' +
      escapar(a.a_body) +
      '</pre></details>'
    );
  });
  destino.html =
    ESTILO_BOOTSTRAP +
    (itens.length > 0
      ? '<div class="artigos">' + itens.join('') + '</div>'
      : '<p class="vazio">Nenhuma mensagem.</p>');
}

/** The Histórico tab as Json::carrega_historico draws it: date badge, user and the change. */
export function mostrarHistorico(destino: WebHtml, historico: readonly Linha[]): void {
  const itens = historico.map(
    (h) =>
      '<div class="alteracao"><span class="data">' +
      escapar(h.data_alteracao_fmt) +
      '</span> <strong>' +
      escapar(h.nome_usuario) +
      '</strong> ' +
      texto(h.texto_alteracao, '') +
      '</div>',
  );
  destino.html =
    ESTILO_BOOTSTRAP + (itens.length > 0 ? itens.join('') : '<p class="vazio">Sem histórico.</p>');
}

// ---- Ver chamado: printing (chamado/imprimir_chamados and imprimir_relatorio_chamado)

/** The FPDF letterhead (libraries/Pdf_html.php Header), repeated on every printed page. */
const ESTILO_IMPRESSAO =
  '<style>@page{size:A4;margin:10mm 12mm 14mm;' +
  '@bottom-center{content:"Página " counter(page) "/" counter(pages);font:italic 8pt Arial,Helvetica,sans-serif}}' +
  'body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#000;margin:0}' +
  '.folha{width:100%;border-collapse:collapse}.folha>thead>tr>td,.folha>tbody>tr>td{padding:0;border:0}' +
  '.timbre{display:flex;align-items:center;justify-content:space-between;padding:0 6mm 8mm}' +
  '.timbre img{width:17mm;height:17mm;object-fit:contain}.timbre div{text-align:center;line-height:1.35}' +
  '.timbre b{display:block;font-size:11pt}.timbre b+b{font-size:12pt}.timbre i{font-size:10pt}' +
  'h1{font-size:12pt;text-align:center;margin:8mm 0 0}h2{font-size:12pt;text-align:center;margin:0 0 6mm}' +
  '.ticket{text-align:center;font-weight:700;font-size:7pt;margin:1mm 0 6mm}' +
  '.emitido{text-align:right;font-size:9pt;margin:0;line-height:1.6}.fim{text-align:center;font-size:9pt;line-height:1.6;margin-top:6mm}' +
  '.secao{border-bottom:1px solid #000;padding:4mm 0 8mm;margin-bottom:8mm}' +
  '.campo{display:flex;line-height:1.5}.campo>b{flex:none;width:35mm}.campo>b.largo{width:40mm}' +
  '.campo>span{flex:1}.campo .par{flex:none;width:50mm}.campo .par+b{width:35mm}' +
  '.sub{font-weight:700;margin:0;line-height:1.5}.reparo{margin:0 0 4mm}.equipamento{margin:0 0 6mm}' +
  '.traco{text-align:center;font-weight:700;margin:4mm 0}' +
  '.interacao{margin:0 0 8mm;break-inside:auto}.interacao img{max-width:100%;height:auto}' +
  '.interacao .despacho>b{margin-right:2mm}.artigo{margin:0 0 6mm}.artigo pre{font:inherit;white-space:pre-wrap;margin:1mm 0 0}' +
  '.historico{line-height:1.8}.historico b{margin-right:2mm}' +
  'table.grade{width:100%;border-collapse:collapse;margin:0 0 3mm}.grade td,.grade th{border:1px solid #000;padding:1mm 2mm;vertical-align:top;text-align:left}' +
  '.grade th{width:1%;white-space:nowrap}.ultima{display:flex;justify-content:space-between;font-weight:700;margin:4mm 0 2mm}' +
  '</style>';

function dois(n: number): string {
  return String(n).padStart(2, '0');
}

function agoraFormatado(): string {
  const d = new Date();
  return (
    dois(d.getDate()) +
    '/' +
    dois(d.getMonth() + 1) +
    '/' +
    d.getFullYear() +
    ' - ' +
    dois(d.getHours()) +
    ':' +
    dois(d.getMinutes()) +
    ':' +
    dois(d.getSeconds())
  );
}

/** OTOBO dates are UTC; the PDF printed them unshifted (3 h ahead). SIGAT2 uses local time as the tab does. */
function dataCompletaDoArtigo(valor: unknown): string {
  const data = new Date(texto(valor, ''));
  if (Number.isNaN(data.getTime())) return texto(valor, '');
  const local = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  return (
    dois(local.getUTCDate()) +
    '/' +
    dois(local.getUTCMonth() + 1) +
    '/' +
    local.getUTCFullYear() +
    ' - ' +
    dois(local.getUTCHours()) +
    ':' +
    dois(local.getUTCMinutes()) +
    ':' +
    dois(local.getUTCSeconds())
  );
}

/** Text before the first <hr> of an interaction (imprimir_chamados keeps only the note). */
function textoSemResumo(html: string): string {
  const fim = html.indexOf('<hr');
  return fim >= 0 ? html.slice(0, fim) : html;
}

function endereco(arquivo: string): string {
  return new URL('assets/imported/' + arquivo, document.baseURI).href;
}

/** Opens the page in a new window with the letterhead on every page and prints it once the logos load. */
function janelaDeImpressao(titulo: string, corpo: string): void {
  const janela = window.open('', '_blank');
  if (janela === null) {
    Toast('O navegador bloqueou a janela de impressão. Permita pop-ups para o SIGAT2.', {
      kind: 'warning',
    });
    return;
  }
  const timbre =
    '<div class="timbre"><img src="' +
    endereco('logo-pms.png') +
    '" alt="Brasão de Sorocaba">' +
    '<div><b>Secretaria do Gabinete Central</b><b>Coordenadoria Geral de Tecnologia da Informação</b>' +
    '<i>Prefeitura de Sorocaba</i></div><img src="' +
    endereco('logo-cgti-preto.png') +
    '" alt="CGTI"></div>';
  janela.document.open();
  janela.document.write(
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' +
      escapar(titulo) +
      '</title>' +
      ESTILO_IMPRESSAO +
      '</head><body><table class="folha"><thead><tr><td>' +
      timbre +
      '</td></tr></thead><tbody><tr><td>' +
      corpo +
      '</td></tr></tbody></table></body></html>',
  );
  janela.document.close();
  let impresso = false;
  const imprimir = (): void => {
    if (impresso) return;
    impresso = true;
    janela.focus();
    janela.print();
  };
  janela.addEventListener('load', imprimir);
  if (janela.document.readyState === 'complete') imprimir();
  else window.setTimeout(imprimir, 3000);
}

function campo(rotulo: string, valor: unknown, largo = false): string {
  return (
    '<div class="campo"><b' +
    (largo ? ' class="largo"' : '') +
    '>' +
    rotulo +
    '</b><span>' +
    escapar(valor) +
    '</span></div>'
  );
}

export interface DadosDoChamado {
  readonly chamado: Linha;
  readonly equipamentos: readonly Linha[];
  readonly servicos: readonly Linha[];
  readonly interacoes: readonly Linha[];
}

/** The SIGAT "CHAMADOS" sheet for one chamado: data, pending items and the last interaction. */
export function imprimirChamado(d: DadosDoChamado): void {
  const c = d.chamado;
  const pendentes = d.equipamentos.filter(
    (e) => texto(e.status_equipamento_chamado, '') !== 'ENTREGUE',
  );
  const servicos = d.servicos.filter((s) => texto(s.status_servico, '') !== 'FECHADO');
  const ultima = d.interacoes[0];
  const linha = (rotulo: string, valor: unknown): string =>
    '<th>' + rotulo + '</th><td>' + escapar(valor) + '</td>';
  const corpoUltima =
    ultima === undefined
      ? '<table class="grade"><tr><td>Sem interações.</td></tr></table>'
      : '<div class="ultima"><span>Última interação</span><span>' +
        escapar(ultima.data_interacao) +
        ' - ' +
        escapar(ultima.nome_usuario) +
        '</span></div><div class="interacao">' +
        (texto(ultima.tipo_interacao, '') === 'OBSERVACAO'
          ? texto(ultima.texto_interacao, '')
          : textoSemResumo(texto(ultima.texto_interacao, ''))) +
        '</div>';
  janelaDeImpressao(
    'Chamado ' + texto(c.id_chamado),
    '<h1>CHAMADOS</h1><p class="emitido">Emitido em ' +
      agoraFormatado() +
      '</p>' +
      '<p class="ultima"><span></span><span>' +
      escapar(c.ticket_chamado) +
      ' - Chamado #' +
      escapar(c.id_chamado) +
      '</span></p>' +
      '<table class="grade"><tr>' +
      linha('Data', c.data_chamado) +
      linha('Fila', c.nome_fila_chamado) +
      '</tr>' +
      '<tr>' +
      linha('Solicitante', c.nome_solicitante_chamado) +
      linha('Telefone', c.telefone_chamado) +
      '</tr>' +
      '<tr><th>Local</th><td colspan="3">' +
      escapar(c.nome_local) +
      '</td></tr>' +
      '<tr>' +
      linha('Endereço', c.endereco_local) +
      linha('Região', c.regiao_local) +
      '</tr>' +
      '<tr><th>Complemento</th><td colspan="3">' +
      escapar(c.complemento_chamado) +
      '</td></tr>' +
      '<tr><th colspan="4">Resumo</th></tr><tr><td colspan="4">' +
      escapar(c.resumo_chamado) +
      '</td></tr>' +
      '<tr><th colspan="4">Equipamentos pendentes</th></tr><tr><td colspan="4">' +
      pendentes
        .map((e) => escapar(e.num_equipamento) + ' - ' + escapar(e.descricao_equipamento))
        .join('<br>') +
      '&nbsp;</td></tr>' +
      '<tr><th colspan="4">Serviços pendentes</th></tr><tr><td colspan="4">' +
      servicos
        .map(
          (s) =>
            escapar(s.nome_servico) +
            ' (' +
            escapar(s.quantidade) +
            ' ' +
            escapar(s.unidade_medida) +
            ')',
        )
        .join('<br>') +
      '&nbsp;</td></tr>' +
      '</table>' +
      corpoUltima,
  );
}

export interface RelatorioDoChamado extends DadosDoChamado {
  readonly usuario: string;
  readonly reparos: readonly { readonly reparo: Linha; readonly historico: readonly Linha[] }[];
  readonly historico: readonly Linha[];
  readonly termos: readonly Linha[];
  readonly artigos: readonly Linha[];
}

/** One line of a repair's history, with the wording of imprimir_relatorio_chamado. */
function linhaDoReparo(h: Linha): string {
  const subquery = numero(h.subquery);
  const servico = texto(h.nome_servico, '');
  let data = texto(h.data_reparo_servico, '');
  let frase = texto(h.nome_abertura_usuario, '') + ' adicionou o serviço ' + servico + '.';
  if (subquery === 3) {
    frase = texto(h.nome_fechamento_usuario, '') + ' ' + servico;
  } else if (subquery === 1 && numero(h.realizado_reparo_servico) === 1) {
    data = texto(h.data_encerramento_reparo_servico, '');
    frase = texto(h.nome_fechamento_usuario, '') + ' finalizou o serviço ' + servico + '.';
  } else if (subquery === 1 && numero(h.status_reparo_servico) === 0) {
    data = texto(h.data_encerramento_reparo_servico, '');
    frase = texto(h.nome_fechamento_usuario, '') + ' removeu o serviço ' + servico + '.';
  }
  return '<div class="campo"><b>' + escapar(data) + '</b><span>' + escapar(frase) + '</span></div>';
}

/**
 * The SIGAT "Relatório detalhado" (imprimir_relatorio_chamado): Informações, Equipamentos with
 * their repairs, Serviços, Interações (with their pictures), Comunicação and Histórico. The BGInfo
 * inventory and the merged termo PDFs are not included yet.
 */
export function imprimirRelatorio(r: RelatorioDoChamado): void {
  const c = r.chamado;
  const secao = (titulo: string, corpo: string): string =>
    corpo === '' ? '' : '<div class="secao"><h2>' + titulo + '</h2>' + corpo + '</div>';
  const equipamentos = r.equipamentos
    .map((e) => {
      const reparos = r.reparos.filter(
        (x) => texto(x.reparo.num_equipamento_reparo, '') === texto(e.num_equipamento, ''),
      );
      return (
        '<div class="equipamento">' +
        campo('Nº de identificação:', e.num_equipamento, true) +
        campo('Descrição:', e.descricao_equipamento) +
        campo('Lacre:', e.tag_equipamento) +
        campo('Status:', e.status_equipamento_chamado) +
        (reparos.length === 0
          ? ''
          : '<p class="sub">Reparos</p>' +
            reparos
              .map(
                (x) =>
                  '<div class="reparo">' +
                  campo('Reparo:', x.reparo.id_reparo) +
                  campo('Início:', x.reparo.data_inicio_reparo) +
                  campo('Término:', x.reparo.data_fim_reparo) +
                  campo('Bancada:', x.reparo.nome_bancada) +
                  campo('Status:', x.reparo.status_reparo) +
                  (x.historico.length === 0
                    ? ''
                    : '<p class="sub">Histórico</p>' +
                      '<div class="campo"><b>' +
                      escapar(x.reparo.data_inicio_reparo) +
                      '</b><span>' +
                      escapar(
                        texto(x.historico[0]?.nome_abertura_usuario, '') + ' iniciou o reparo.',
                      ) +
                      '</span></div>' +
                      x.historico.map(linhaDoReparo).join('')) +
                  '</div>',
              )
              .join('')) +
        '</div>'
      );
    })
    .join('');
  const servicos = r.servicos
    .map(
      (s) =>
        '<div class="equipamento">' +
        campo('Serviço:', s.nome_servico) +
        campo('Status:', s.status_servico) +
        campo('Quantidade:', texto(s.quantidade) + ' ' + texto(s.unidade_medida, '')) +
        '</div>',
    )
    .join('');
  const interacoes = r.interacoes
    .map((i) => {
      const equips = texto(i.pool_equipamentos, '')
        .split('::')
        .filter((x) => x !== '');
      return (
        '<div class="traco">' +
        '-'.repeat(65) +
        '</div><div class="interacao">' +
        '<div class="campo"><b class="largo">' +
        escapar(i.data_interacao) +
        '</b><span>' +
        escapar(i.nome_usuario) +
        '</span></div>' +
        campo('Tipo de interação:', i.tipo_interacao) +
        (equips.length === 0
          ? ''
          : '<p class="sub">Equipamentos:</p>' +
            equips.map((x) => '<p class="sub">' + escapar(x) + '</p>').join('')) +
        '<div class="despacho"><b>Despacho:</b>' +
        texto(i.texto_interacao, '') +
        '</div></div>'
      );
    })
    .join('');
  const artigos = r.artigos
    .map(
      (a) =>
        '<div class="artigo"><b>' +
        escapar(dataCompletaDoArtigo(a.create_time)) +
        '</b>' +
        '<div class="campo"><b style="width:10mm">De:</b><span>' +
        escapar(a.a_from) +
        '</span></div>' +
        '<div class="campo"><b style="width:20mm">Assunto:</b><span>' +
        escapar(a.a_subject) +
        '</span></div>' +
        '<pre>' +
        escapar(a.a_body) +
        '</pre></div>',
    )
    .join('');
  const historico =
    r.historico.length === 0
      ? ''
      : '<div class="historico">' +
        r.historico
          .map(
            (h) =>
              '<div><b>' +
              escapar(h.data_alteracao_fmt) +
              '</b>' +
              escapar(h.nome_usuario) +
              ' ' +
              texto(h.texto_alteracao, '') +
              '</div>',
          )
          .join('') +
        '</div>';
  const termos = r.termos
    .map(
      (t) =>
        '<div class="campo"><b>' +
        escapar(t.tipo_termo) +
        '</b><span>' +
        escapar(t.nome_termo) +
        '</span></div>',
    )
    .join('');
  const emitido = 'Emitido em ' + agoraFormatado();
  janelaDeImpressao(
    'impressao_chamado_' + texto(c.id_chamado),
    '<h1>CHAMADO - ' +
      escapar(c.id_chamado) +
      '</h1><p class="ticket">' +
      escapar(c.ticket_chamado) +
      '</p>' +
      '<p class="emitido">' +
      emitido +
      '<br>Por: ' +
      escapar(r.usuario) +
      '</p>' +
      secao(
        'Informações',
        campo('Solicitante:', c.nome_solicitante_chamado) +
          '<div class="campo"><b>Telefone:</b><span class="par">' +
          escapar(c.telefone_chamado) +
          '</span><b>Celular:</b><span>' +
          escapar(c.celular_chamado) +
          '</span></div>' +
          campo('Local:', c.nome_local) +
          campo('Endereço:', c.endereco_local) +
          campo('Complemento:', c.complemento_chamado) +
          campo('Região:', c.regiao_local) +
          campo('Resumo:', c.resumo_chamado) +
          campo('Aberto em:', c.data_chamado) +
          campo('Encerrado em:', c.data_encerramento_chamado) +
          campo('Status:', c.status_chamado) +
          campo('Responsável:', c.nome_responsavel),
      ) +
      secao('Equipamentos', equipamentos) +
      secao('Serviços', servicos) +
      secao('Interações', interacoes) +
      secao('Comunicação', artigos) +
      secao('Histórico', historico) +
      secao('Termos', termos) +
      '<p class="fim">' +
      emitido +
      '<br>Por: ' +
      escapar(r.usuario) +
      '</p>',
  );
}
