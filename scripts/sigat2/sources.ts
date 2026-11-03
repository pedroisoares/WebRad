/** Authored TypeScript of the SIGAT2 example: one shared unit plus one class per page. */

const UNIT = `import type { WebHtml, WebLabel } from '@webrad/runtime';

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

export function preencherCabecalho(usuario: WebLabel): void {
  usuario.caption = Access.user?.name ?? '';
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

const ESTILO = '<style>body{font-family:system-ui,sans-serif;font-size:14px;margin:0;padding:8px;color:#1f2937}' +
  '.item{border-radius:8px;padding:8px 10px;margin:0 0 10px;border:1px solid #e5e7eb}' +
  '.topo{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:#4b5563}' +
  '.tag{display:inline-block;border-radius:6px;padding:1px 6px;font-size:12px;background:#eef2ff;color:#3730a3}' +
  '.vazio{color:#6b7280}</style>';

export function escapar(valor: unknown): string {
  return texto(valor, '').replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

const CORES: Readonly<Record<string, string>> = {
  ATENDIMENTO: '#e0edff', ATENDIMENTO_INS: '#e0edff', ALT_FILA: '#fff4d6', OBSERVACAO: '#e0f5f9',
  FECHAMENTO: '#ddf5e3', FECHAMENTO_EQUIP: '#ddf5e3', FECHAMENTO_INS: '#ddf5e3', FECHAMENTO_MAN: '#ddf5e3',
  ENTREGA: '#ddf5e3', TENTATIVA_ENTREGA: '#e0f5f9', FALHA_ENTREGA: '#fde2e2', ESPERA: '#ffd9cc',
  REM_ESPERA: '#fff0fe',
};

const ACOES: Readonly<Record<string, string>> = {
  ATENDIMENTO: 'realizou um atendimento', ATENDIMENTO_INS: 'realizou um atendimento',
  ALT: 'alterou dados do chamado', ALT_FILA: 'alterou a fila', OBSERVACAO: 'fez uma observação',
  FECHAMENTO: 'finalizou o chamado', FECHAMENTO_EQUIP: 'finalizou o chamado',
  FECHAMENTO_INS: 'finalizou o chamado', FECHAMENTO_MAN: 'finalizou o chamado',
  ENTREGA: 'realizou a entrega', TENTATIVA_ENTREGA: 'registrou uma tentativa de entrega',
  FALHA_ENTREGA: 'registrou uma falha na entrega', ESPERA: 'deixou equipamentos em espera',
  REM_ESPERA: 'retirou equipamentos da espera', INSERVIVEL_REPARO: 'registrou um inservível',
};

/** Interaction texts are HTML written by SIGAT; WebHtml renders them in a sandboxed frame. */
export function mostrarInteracoes(destino: WebHtml, interacoes: readonly Linha[]): void {
  const itens = interacoes.map((i) => {
    const tipo = texto(i.tipo_interacao, '');
    const acao = ACOES[tipo];
    const cabecalho = '<strong>' + escapar(i.nome_usuario) + '</strong> ' + escapar(acao ?? '');
    const marcas =
      (sim(i.pode_desfazer) ? ' <span class="tag">pode ser desfeita no SIGAT</span>' : '') +
      (sim(i.tem_laudo) ? ' <span class="tag">laudo técnico</span>' : '');
    return '<div class="item" style="background:' + (CORES[tipo] ?? '#f3f4f6') + '">' +
      '<div class="topo"><span>' + cabecalho + marcas + '</span><span>' + escapar(i.data_interacao) + '</span></div>' +
      (acao === undefined ? '' : '<hr>') + texto(i.texto_interacao, '') + '</div>';
  });
  destino.html = ESTILO + (itens.length > 0 ? itens.join('') : '<p class="vazio">Nenhuma interação.</p>');
}

export function mostrarArtigos(destino: WebHtml, artigos: readonly Linha[]): void {
  const itens = artigos.map(
    (a) =>
      '<div class="item"><div class="topo"><span><strong>' + escapar(a.a_from) + '</strong> ' +
      escapar(a.a_subject) + '</span><span>' + escapar(a.create_time_fmt) + '</span></div><hr>' +
      texto(a.a_body, '') + '</div>',
  );
  destino.html = ESTILO + (itens.length > 0 ? itens.join('') : '<p class="vazio">Nenhuma mensagem.</p>');
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
  perigo: '#dc3545', perigoBorda: '#a71d2a',
  alerta: '#ffc107', alertaBorda: '#8a6d00',
  sucesso: '#28a745', sucessoBorda: '#1e7e34',
  info: '#17a2b8', primario: '#007bff', secundario: '#6c757d', escuro: '#212529',
} as const;

type NoSvg = readonly [string, Readonly<Record<string, string>>];

const FORMAS: Readonly<Record<string, readonly NoSvg[]>> = {
  star: [['path', { d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' }]],
  circle: [['circle', { cx: '12', cy: '12', r: '10' }]],
  hands: [['path', { d: 'M12 6v6l4 2' }]],
  mail: [['path', { d: 'm22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7' }], ['rect', { x: '2', y: '4', width: '20', height: '16', rx: '2' }]],
  truck: [['path', { d: 'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2' }], ['path', { d: 'M15 18H9' }], ['path', { d: 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14' }], ['circle', { cx: '17', cy: '18', r: '2' }], ['circle', { cx: '7', cy: '18', r: '2' }]],
  lock: [['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }], ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }]],
  'lock-open': [['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }], ['path', { d: 'M7 11V7a5 5 0 0 1 9.9-1' }]],
  alert: [['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }], ['path', { d: 'M12 9v4' }], ['path', { d: 'M12 17h.01' }]],
  pause: [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M10 15V9' }], ['path', { d: 'M14 15V9' }]],
  headset: [['path', { d: 'M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z' }], ['path', { d: 'M21 16v2a4 4 0 0 1-4 4h-5' }]],
  footprints: [['path', { d: 'M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z' }], ['path', { d: 'M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z' }], ['path', { d: 'M16 17h4' }], ['path', { d: 'M4 13h4' }]],
  wrench: [['path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z' }]],
  boxes: [['path', { d: 'M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z' }], ['path', { d: 'm7 16.5-4.74-2.85' }], ['path', { d: 'm7 16.5 5-3' }], ['path', { d: 'M7 16.5v5.17' }], ['path', { d: 'M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z' }], ['path', { d: 'm17 16.5-5-3' }], ['path', { d: 'm17 16.5 4.74-2.85' }], ['path', { d: 'M17 16.5v5.17' }], ['path', { d: 'M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z' }], ['path', { d: 'M12 8 7.26 5.15' }], ['path', { d: 'm12 8 4.74-2.85' }], ['path', { d: 'M12 13.5V8' }]],
  network: [['rect', { x: '16', y: '16', width: '6', height: '6', rx: '1' }], ['rect', { x: '2', y: '16', width: '6', height: '6', rx: '1' }], ['rect', { x: '9', y: '2', width: '6', height: '6', rx: '1' }], ['path', { d: 'M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3' }], ['path', { d: 'M12 12V8' }]],
  'phone-call': [['path', { d: 'M13 2a9 9 0 0 1 9 9' }], ['path', { d: 'M13 6a5 5 0 0 1 5 5' }], ['path', { d: 'M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384' }]],
  'radio-tower': [['path', { d: 'M4.9 16.1C1 12.2 1 5.8 4.9 1.9' }], ['path', { d: 'M7.8 4.7a6.14 6.14 0 0 0-.8 7.5' }], ['circle', { cx: '12', cy: '9', r: '2' }], ['path', { d: 'M16.2 4.8c2 2 2.26 5.11.8 7.47' }], ['path', { d: 'M19.1 1.9a9.96 9.96 0 0 1 0 14.1' }], ['path', { d: 'M9.5 18h5' }], ['path', { d: 'm8 22 4-11 4 11' }]],
  'ethernet-port': [['path', { d: 'M10 8v1' }], ['path', { d: 'M14 8v1' }], ['path', { d: 'M18 8v1' }], ['path', { d: 'M19 17a2 2 0 00-1.765 1.059l-.47.882A2 2 0 0115 20H9a2 2 0 01-1.765-1.059l-.47-.882A2 2 0 005 17H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v9a2 2 0 01-2 2z' }], ['path', { d: 'M6 8v1' }]],
  package: [['path', { d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z' }], ['path', { d: 'M12 22V12' }], ['polyline', { points: '3.29 7 12 12 20.71 7' }], ['path', { d: 'm7.5 4.27 9 5.15' }]],
};

/** fila.icone_fila holds Font Awesome 5 classes; each maps to the closest Lucide shape. */
const ICONE_DA_FILA: Readonly<Record<string, string>> = {
  'fa-headset': 'headset', 'fa-walking': 'footprints', 'fa-tools': 'wrench', 'fa-cubes': 'boxes',
  'fa-project-diagram': 'network', 'fa-phone-volume': 'phone-call', 'fa-network-wired': 'ethernet-port',
  'fa-broadcast-tower': 'radio-tower', 'fa-box': 'package', 'fa-truck': 'truck',
};

export function formaDaFila(iconeFila: unknown): string {
  const classes = texto(iconeFila, '').split(/\\s+/);
  for (const classe of classes) {
    const forma = ICONE_DA_FILA[classe];
    if (forma !== undefined) return forma;
  }
  return 'package';
}

/** One Lucide shape placed at (x, y) with the given size; estilo holds fill/stroke attributes. */
function forma(nome: string, x: number, y: number, tamanho: number, estilo: string): string {
  const nos = FORMAS[nome] ?? [];
  return '<g transform="translate(' + x + ' ' + y + ') scale(' + tamanho / 24 + ')" ' + estilo + '>' +
    nos.map(([tag, atributos]) => '<' + tag + Object.entries(atributos).map(([k, v]) => ' ' + k + '="' + v + '"').join('') + '/>').join('') +
    '</g>';
}

const TRACO = 'fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"';

function solido(nome: string, x: number, y: number, tamanho: number, cor: string, borda: string): string {
  return forma(nome, x, y, tamanho, 'fill="' + cor + '" stroke="' + borda + '" stroke-width="1.5" stroke-linejoin="round"');
}

function relogio(x: number, y: number, tamanho: number, critico: boolean): string {
  const cor = critico ? COR.perigo : COR.alerta;
  const borda = critico ? COR.perigoBorda : COR.alertaBorda;
  return solido('circle', x, y, tamanho, cor, borda) +
    forma('hands', x, y, tamanho, TRACO + ' stroke="' + (critico ? '#ffffff' : COR.escuro) + '"');
}

/** Rounded Bootstrap badge with a stroked icon inside. */
function selo(nome: string, x: number, y: number, fundo: string, cor: string, largura = 26): string {
  return '<rect x="' + x + '" y="' + y + '" width="' + largura + '" height="20" rx="4" fill="' + fundo + '"/>' +
    forma(nome, x + (largura - 14) / 2, y + 3, 14, TRACO + ' stroke="' + cor + '"');
}

function svg(largura: number, altura: number, corpo: string): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + largura + '" height="' + altura +
    '" viewBox="0 0 ' + largura + ' ' + altura + '" aria-hidden="true" focusable="false">' + corpo + '</svg>';
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
  return status === 'PRIORIDADE' ? 'Prioridade' : status === 'FECHADO' ? 'Fechado' : status === 'ABERTO' ? 'Aberto' : texto(status);
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
 * Adds the painel signal columns to each row of painel-chamados: the status icon,
 * the alert strip (clock, unread e-mail, delivery), the queue badge, the wait time
 * and a text summary of all of them. Rows already prepared are left alone.
 */
export function prepararLinhasDoPainel(resposta: unknown): void {
  for (const linha of linhas(resposta) as Record<string, unknown>[]) {
    if (typeof linha.sinal_status === 'string') continue;
    const status = texto(linha.status_painel, '');
    const minutos = numero(linha.minutos_espera);
    const nivel = nivelDeEspera(minutos);
    const naoLidos = numero(linha.email_nao_lido_chamado) ?? 0;
    const entrega = situacaoDaEntrega(linha.entrega_chamado, linha.equip_pendentes);
    let alertas = '';
    let x = 2;
    if (nivel > 0) {
      alertas += relogio(x + 3, 9, 18, nivel === 2);
      x += 28;
    }
    if (naoLidos > 0) {
      alertas += selo('mail', x, 8, COR.info, '#ffffff');
      x += 30;
    }
    if (entrega !== '') {
      alertas += selo('truck', x, 8, entrega === 'PRONTO' ? COR.sucesso : COR.alerta, entrega === 'PRONTO' ? '#ffffff' : COR.escuro);
    }
    const partes = [nomeDoStatus(status)];
    if (nivel > 0) partes.push((nivel === 2 ? '24h+' : '6h+') + ' sem interação');
    if (naoLidos > 0) partes.push('e-mail não lido');
    if (entrega === 'PRONTO') partes.push('entrega pronta');
    if (entrega === 'PARCIAL') partes.push('entrega parcial');
    const fila = texto(linha.nome_fila, '');
    const largura = Math.min(190, 34 + fila.length * 7);
    linha.sinal_status = imagem(36, 36, iconeStatus(status));
    linha.sinal_alertas = imagem(90, 36, alertas);
    linha.sinal_fila = imagem(largura, 36,
      '<rect x="1" y="7" width="' + (largura - 2) + '" height="22" rx="5" fill="' + COR.secundario + '"/>' +
      forma(formaDaFila(linha.icone_fila), 7, 11, 14, TRACO + ' stroke="#ffffff"') +
      '<text x="27" y="22.5" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="12" fill="#ffffff">' + escapar(fila) + '</text>');
    linha.situacao = partes.join(' · ');
    linha.espera_fmt = tempoDeEspera(minutos);
  }
}

// ---- signal strips rendered inside WebHtml frames (real text next to every icon)

const ESTILO_SINAIS = '<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;margin:0;padding:4px 2px;color:#1f2937}' +
  '.faixa{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
  '.chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #d1d5db;border-radius:999px;padding:3px 10px 3px 6px;background:#fff;white-space:nowrap}' +
  '.chip svg{flex:none}.chip b{font-variant-numeric:tabular-nums}' +
  '.perigo{border-color:#dc3545;background:#fdecee;color:#7a1520}.alerta{border-color:#d39e00;background:#fff8e1;color:#5c4400}' +
  '.sucesso{border-color:#28a745;background:#e9f7ec;color:#145523}.info{border-color:#17a2b8;background:#e6f6f8;color:#0b4f5a}' +
  '.neutro{color:#374151}.legenda{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px 16px;font-size:13px}' +
  '.legenda div{display:flex;align-items:center;gap:8px}h2{font-size:13px;margin:0 0 6px;color:#4b5563;font-weight:600}</style>';

function chip(icone: string, conteudo: string, tom: 'perigo' | 'alerta' | 'sucesso' | 'info' | 'neutro', largura = 24): string {
  return '<span class="chip ' + tom + '">' + svg(largura, 24, icone) + '<span>' + conteudo + '</span></span>';
}

function contagem(valor: unknown): number {
  return numero(valor) ?? 0;
}

/** Counters above the painel queue (painel-indicadores): what needs attention first. */
export function mostrarIndicadores(destino: WebHtml, indicadores: Linha | undefined): void {
  if (indicadores === undefined) {
    destino.html = ESTILO_SINAIS + '<p class="neutro">Indicadores indisponíveis.</p>';
    return;
  }
  const bloqueados = contagem(indicadores.meus_bloqueados);
  const remoto = contagem(indicadores.meus_bloqueados_remoto);
  const comLimite = (numero(Access.user?.data?.autorizacao_usuario) ?? 0) <= 2;
  const itens = [
    chip(solido('circle', 3, 3, 18, COR.alerta, COR.alertaBorda), 'Abertos <b>' + contagem(indicadores.abertos) + '</b> de ' + contagem(indicadores.total), 'neutro'),
    chip(solido('star', 3, 3, 18, COR.perigo, COR.perigoBorda), 'Prioridade <b>' + contagem(indicadores.prioritarios) + '</b>', contagem(indicadores.prioritarios) > 0 ? 'perigo' : 'neutro'),
    chip(relogio(3, 3, 18, true), 'Sem interação há 24 h ou mais <b>' + contagem(indicadores.sem_interacao_24h) + '</b>', contagem(indicadores.sem_interacao_24h) > 0 ? 'perigo' : 'neutro'),
    chip(relogio(3, 3, 18, false), 'Entre 6 h e 24 h <b>' + contagem(indicadores.sem_interacao_6h) + '</b>', contagem(indicadores.sem_interacao_6h) > 0 ? 'alerta' : 'neutro'),
    chip(forma('lock-open', 3, 3, 18, TRACO + ' stroke="' + COR.secundario + '"'), 'Sem responsável <b>' + contagem(indicadores.sem_responsavel) + '</b>', 'neutro'),
    chip(selo('mail', 0, 2, COR.info, '#ffffff'), 'E-mails não lidos <b>' + contagem(indicadores.emails_nao_lidos) + '</b>', contagem(indicadores.emails_nao_lidos) > 0 ? 'info' : 'neutro', 26),
    chip(selo('truck', 0, 2, COR.sucesso, '#ffffff'), 'Prontos para entrega <b>' + contagem(indicadores.prontos_entrega) + '</b>', contagem(indicadores.prontos_entrega) > 0 ? 'sucesso' : 'neutro', 26),
    chip(selo('truck', 0, 2, COR.alerta, COR.escuro), 'Entrega parcial <b>' + contagem(indicadores.entrega_parcial) + '</b>', 'neutro', 26),
    chip(forma('lock', 3, 3, 18, TRACO + ' stroke="' + COR.escuro + '"'), 'Meus bloqueados <b>' + bloqueados + '</b>', 'neutro'),
  ];
  if (comLimite)
    itens.push(chip(forma('lock', 3, 3, 18, TRACO + ' stroke="' + (remoto >= LIMITE_BLOQUEIOS_REMOTO ? COR.perigo : COR.escuro) + '"'),
      'No Remoto <b>' + remoto + '</b> de ' + LIMITE_BLOQUEIOS_REMOTO, remoto >= LIMITE_BLOQUEIOS_REMOTO ? 'perigo' : 'neutro'));
  destino.html = ESTILO_SINAIS + '<div class="faixa" role="list">' + itens.map((i) => i.replace('<span class="chip', '<span role="listitem" class="chip')).join('') + '</div>';
}

/** What each SIGAT icon means, as the ConsulTIC manual teaches new attendants. */
export function mostrarLegenda(destino: WebHtml): void {
  const item = (icone: string, significado: string, largura = 24): string =>
    '<div>' + svg(largura, 24, icone) + '<span>' + significado + '</span></div>';
  destino.html = ESTILO_SINAIS + '<h2>Legenda</h2><div class="legenda">' +
    item(iconeStatus('PRIORIDADE', 3, 3), 'Prioridade: atender antes dos demais') +
    item(iconeStatus('ABERTO', 3, 3), 'Chamado aberto, aguardando atendimento') +
    item(iconeStatus('FECHADO', 3, 3), 'Chamado fechado') +
    item(relogio(3, 3, 18, false), 'Sem interação há mais de 6 horas') +
    item(relogio(3, 3, 18, true), 'Sem interação há 24 horas ou mais') +
    item(selo('mail', 0, 2, COR.info, '#ffffff'), 'E-mail do solicitante não lido', 26) +
    item(selo('truck', 0, 2, COR.sucesso, '#ffffff'), 'Pronto para entrega', 26) +
    item(selo('truck', 0, 2, COR.alerta, COR.escuro), 'Parcialmente pronto para entrega', 26) +
    item(forma('lock', 3, 3, 18, TRACO + ' stroke="' + COR.escuro + '"'), 'Bloqueie antes de atender (no Remoto, até ' + LIMITE_BLOQUEIOS_REMOTO + ' por pessoa)') +
    '</div>';
}

/** The chamado header signals of ver_chamado.php, with text, as one strip. */
export function mostrarSinaisDoChamado(destino: WebHtml, c: Linha | undefined): void {
  if (c === undefined) {
    destino.html = '';
    return;
  }
  const statusChamado = texto(c.status_chamado, '');
  const prioridade = numero(c.prioridade_chamado) === 1;
  const status = prioridade && statusChamado !== 'FECHADO' ? 'PRIORIDADE' : statusChamado;
  const minutos = numero(c.minutos_espera);
  const nivel = nivelDeEspera(minutos);
  const naoLidos = numero(c.email_nao_lido_chamado) ?? 0;
  const espera = numero(c.equip_espera) ?? 0;
  const responsavel = texto(c.nome_responsavel, '');
  const eu = texto(Access.user?.id, '');
  const itens = [
    chip(iconeStatus(status, 3, 3), escapar(statusChamado === '' ? '-' : statusChamado.charAt(0) + statusChamado.slice(1).toLowerCase()) + (prioridade ? ' · <b>prioridade</b>' : ''),
      status === 'PRIORIDADE' ? 'perigo' : status === 'FECHADO' ? 'sucesso' : 'alerta'),
    chip(selo(formaDaFila(c.icone_fila), 0, 2, COR.secundario, '#ffffff'), 'Fila ' + escapar(texto(c.nome_fila_chamado)), 'neutro', 26),
  ];
  if (statusChamado === 'ABERTO') {
    itens.push(responsavel === ''
      ? chip(forma('lock-open', 3, 3, 18, TRACO + ' stroke="' + COR.secundario + '"'), 'Livre: bloqueie antes de atender', 'neutro')
      : chip(forma('lock', 3, 3, 18, TRACO + ' stroke="' + COR.escuro + '"'),
          texto(c.id_responsavel, '') === eu ? 'Bloqueado por você' : 'Bloqueado por ' + escapar(responsavel), texto(c.id_responsavel, '') === eu ? 'info' : 'neutro'));
    if (minutos !== null)
      itens.push(nivel === 0
        ? chip(forma('circle', 3, 3, 18, TRACO + ' stroke="' + COR.secundario + '"') + forma('hands', 3, 3, 18, TRACO + ' stroke="' + COR.secundario + '"'), 'Última interação há ' + tempoDeEspera(minutos), 'neutro')
        : chip(relogio(3, 3, 18, nivel === 2), 'Sem interação há ' + tempoDeEspera(minutos), nivel === 2 ? 'perigo' : 'alerta'));
  }
  if (naoLidos > 0)
    itens.push(chip(selo('mail', 0, 2, COR.primario, '#ffffff'), '<b>' + naoLidos + '</b> ' + (naoLidos === 1 ? 'e-mail não lido' : 'e-mails não lidos'), 'info', 26));
  const entrega = situacaoDaEntrega(c.entrega_chamado, c.equip_pendentes);
  if (entrega !== '')
    itens.push(entrega === 'PRONTO'
      ? chip(selo('truck', 0, 2, COR.sucesso, '#ffffff'), 'Pronto para entrega', 'sucesso', 26)
      : chip(selo('truck', 0, 2, COR.alerta, COR.escuro), 'Parcialmente pronto para entrega', 'alerta', 26));
  if (espera > 0)
    itens.push(chip(forma('pause', 3, 3, 18, TRACO + ' stroke="' + COR.alertaBorda + '"'), '<b>' + espera + '</b> ' + (espera === 1 ? 'equipamento em espera' : 'equipamentos em espera'), 'alerta'));
  if (numero(c.infovia) === 0)
    itens.push(chip(forma('alert', 3, 3, 18, TRACO + ' stroke="' + COR.perigo + '"'), 'Este local não acessa a infovia', 'perigo'));
  destino.html = ESTILO_SINAIS + '<div class="faixa" role="list">' + itens.map((i) => i.replace('<span class="chip', '<span role="listitem" class="chip')).join('') + '</div>';
}
`;

/** Header handlers repeated in every page class (the header components exist on each page). */
const CABECALHO = `
  public AbrirPainel(): void {
    Navigate('index');
  }

  public AbrirInserviveis(): void {
    Navigate('Inserviveis');
  }

  public AbrirAdmin(): void {
    Navigate('Admin');
  }

  public BuscaRapida(): void {
    buscar(this.EDTBuscaRapida.value);
  }

  public BuscaRapidaTecla(_sender: unknown, event: KeyboardEvent): void {
    if (event.key === 'Enter') buscar(this.EDTBuscaRapida.value);
  }

  public async Sair(): Promise<void> {
    await sair();
  }
`;

function page(
  file: string,
  className: string,
  imports: readonly string[],
  body: string,
  header = true,
): string {
  const unitImports = [
    ...new Set([
      ...(header ? ['buscar', 'sair', 'preencherCabecalho'] : []),
      ...imports,
      ...(body.includes('executar(') ? ['executar'] : []),
    ]),
  ];
  const unit =
    unitImports.length > 0 ? `import { ${unitImports.join(', ')} } from '../units/Sigat2';\n` : '';
  return `${unit}import { ${className}Generated } from './${file}.generated';

export class ${className} extends ${className}Generated {${header ? CABECALHO : ''}${body}}
`;
}

const INDEX = page(
  'index',
  'index',
  [
    'abrir',
    'abrirChamado',
    'erro',
    'linhas',
    'mostrarIndicadores',
    'mostrarLegenda',
    'prepararLinhasDoPainel',
    'primeira',
    'texto',
  ],
  `
  private carregado = false;

  public async Mostrar(): Promise<void> {
    preencherCabecalho(this.LBLUsuario);
    this.TMRAtualizar.Start();
    if (this.carregado) {
      await this.Atualizar();
      return;
    }
    this.carregado = true;
    // The signal columns (status icon, alerts, queue badge) are computed from each row
    // before the grid draws it: prepare what is loaded, listen first, then bind the grid
    // again so its own listener runs after this one.
    const prepararPainel = (): void => prepararLinhasDoPainel(this.Api.getOperationState('Chamados').data);
    prepararPainel();
    this.Api.subscribe(prepararPainel);
    this.GRDChamados.bindApiClient(this.Api);
    mostrarLegenda(this.HTMLLegenda);
    void this.CarregarIndicadores();
    try {
      const filas = linhas(await this.Api.Filas.execute());
      this.CBFila.items = ['Todas as filas', ...filas.map((f) => texto(f.nome_fila)), 'Entrega'];
      this.CBFila.values = ['0', ...filas.map((f) => texto(f.id_fila)), '99'];
      this.CBFila.value = '0';
    } catch (e) {
      Toast('Não foi possível carregar as filas: ' + erro(e), { kind: 'error' });
    }
    if (Access.hasRole('triagem')) void this.Api.Triagem.execute().catch(() => undefined);
  }

  public Ocultar(): void {
    this.TMRAtualizar.Stop();
  }

  public async MudarFila(): Promise<void> {
    const fila = Number(this.CBFila.value);
    this.Api.Chamados.parameter.fila = fila > 0 ? fila : undefined;
    await Promise.all([this.GRDChamados.refresh(), this.CarregarIndicadores()]);
    this.LBLResumo.caption = fila === 99 ? 'Chamados com entrega pendente' : '';
  }

  /** Runs on the Atualizar button and every 2 minutes while the painel is open. */
  public async Atualizar(): Promise<void> {
    await Promise.all([this.GRDChamados.refresh(), this.CarregarIndicadores()]);
    if (Access.hasRole('triagem')) await this.Api.Triagem.execute().catch(() => undefined);
  }

  private async CarregarIndicadores(): Promise<void> {
    const fila = Number(this.CBFila.value);
    try {
      mostrarIndicadores(this.HTMLIndicadores, primeira(await executar(this.Api.Indicadores, { fila: fila > 0 ? fila : undefined })));
    } catch {
      mostrarIndicadores(this.HTMLIndicadores, undefined);
    }
  }

  public AbrirChamadoDaGrade(_sender: unknown, event: CustomEvent<{ getValue<T>(field: string): T | undefined }>): void {
    abrirChamado(event.detail.getValue<number>('id_chamado'));
  }

  public AbrirEncerrado(_sender: unknown, event: CustomEvent<{ getValue<T>(field: string): T | undefined }>): void {
    abrirChamado(event.detail.getValue<number>('id_chamado'));
  }

  public AbrirTriagem(_sender: unknown, event: CustomEvent<{ getValue<T>(field: string): T | undefined }>): void {
    abrir('Triagem', 'ticket', event.detail.getValue<number>('id'));
  }
`,
);

const LOGIN = page(
  'Login',
  'Login',
  ['erro', 'papeisDoUsuario', 'primeira', 'texto'],
  `
  public Mostrar(): void {
    this.LBLMensagem.caption = '';
    if (Access.isAuthenticated) Navigate('index');
  }

  public async SenhaTecla(_sender: unknown, event: KeyboardEvent): Promise<void> {
    if (event.key === 'Enter') await this.Entrar();
  }

  public async Entrar(): Promise<void> {
    const login = this.EDTLogin.value.trim();
    if (login === '' || this.EDTSenha.value === '') {
      this.LBLMensagem.caption = 'Informe usuário e senha.';
      return;
    }
    this.BTNEntrar.enabled = false;
    this.LBLMensagem.caption = 'Entrando...';
    try {
      const resultado = await RestGO.login(login, this.EDTSenha.value);
      if (!resultado.sucess) {
        this.LBLMensagem.caption = resultado.error.message;
        return;
      }
      const usuario = primeira(await this.ApiSessao.SessaoUsuario.execute());
      if (usuario === undefined) {
        this.LBLMensagem.caption = 'Usuário não encontrado ou inativo no SIGAT.';
        return;
      }
      Access.setUser({
        id: texto(usuario.id_usuario),
        name: texto(usuario.nome_usuario),
        roles: papeisDoUsuario(usuario),
        data: usuario,
      });
      this.EDTSenha.value = '';
      Navigate(Access.lastDenied?.page ?? 'index');
    } catch (e) {
      this.LBLMensagem.caption = 'Falha ao entrar: ' + erro(e);
    } finally {
      this.BTNEntrar.enabled = true;
    }
  }
`,
  false,
);

const CHAMADO = page(
  'Chamado',
  'Chamado',
  [
    'abrirEquipamento',
    'contexto',
    'erro',
    'gravar',
    'linhas',
    'mostrarArtigos',
    'mostrarInteracoes',
    'mostrarSinaisDoChamado',
    'numero',
    'primeira',
    'texto',
    'type Linha',
  ],
  `
  private ticketId = '';
  private chamado: Linha | undefined;
  private equipamentos: Linha[] = [];
  private servicos: Linha[] = [];
  private filas: Linha[] = [];

  public async Mostrar(): Promise<void> {
    preencherCabecalho(this.LBLUsuario);
    await this.Carregar();
  }

  public async Carregar(): Promise<void> {
    const id = Number(contexto('chamado'));
    if (!Number.isInteger(id) || id <= 0) {
      this.LBLChamado.caption = 'Nenhum chamado selecionado';
      return;
    }
    this.LBLChamado.caption = 'Chamado #' + id + ' (carregando...)';
    const parametros = { id };
    try {
      const c = primeira(await executar(this.Api.Detalhe, parametros));
      this.chamado = c;
      this.MostrarAcoes(c);
      mostrarSinaisDoChamado(this.HTMLSinais, c);
      if (c === undefined) {
        this.LBLChamado.caption = 'Chamado #' + id + ' não encontrado';
        return;
      }
      this.LBLChamado.caption = 'Chamado #' + id + ' - ' + texto(c.resumo_chamado);
      this.Status.caption = texto(c.status_chamado) + (Number(c.prioridade_chamado) === 1 ? ' (prioridade)' : '');
      this.Ticket.caption = texto(c.ticket_chamado);
      this.Fila.caption = texto(c.nome_fila_chamado);
      this.Responsavel.caption = texto(c.nome_responsavel, 'Ninguém');
      this.Solicitante.caption = texto(c.nome_solicitante_chamado);
      this.Telefone.caption = texto(c.telefone_chamado) + ' / ' + texto(c.celular_chamado);
      this.Local.caption = texto(c.nome_local);
      this.Endereco.caption = texto(c.endereco_local);
      this.Regiao.caption = texto(c.regiao_local);
      this.Abertura.caption = texto(c.data_chamado);
      this.Encerramento.caption = texto(c.data_encerramento_chamado);
      this.Resumo.caption = texto(c.resumo_chamado);
      this.ticketId = texto(c.id_ticket_chamado, '');
      const interacoes = executar(this.Api.Interacoes, parametros);
      await Promise.all([
        interacoes.then((r) => mostrarInteracoes(this.HTMLInteracoes, linhas(r))),
        executar(this.Api.Equipamentos, parametros).then((r) => {
          this.equipamentos = linhas(r);
        }),
        executar(this.Api.Servicos, parametros).then((r) => {
          this.servicos = linhas(r);
        }),
        this.filas.length > 0
          ? Promise.resolve()
          : this.Api.Filas.execute().then((r) => {
              this.filas = linhas(r);
            }),
        executar(this.Api.Reparos, parametros),
        executar(this.Api.Historico, parametros),
        executar(this.Api.Anexos, parametros),
        executar(this.Api.Termos, parametros),
        executar(this.Api.Telefones, parametros),
        Number(this.ticketId) > 0
          ? executar(this.Api.Artigos, { id: Number(this.ticketId) }).then((r) =>
              mostrarArtigos(this.HTMLEmails, linhas(r)),
            )
          : Promise.resolve(mostrarArtigos(this.HTMLEmails, [])),
      ]);
      this.MostrarRegistro();
    } catch (e) {
      Toast('Erro ao carregar o chamado: ' + erro(e), { kind: 'error' });
    }
  }

  /** Same rules as the SIGAT buttons; HexAPI enforces them again on every write. */
  private MostrarAcoes(c: Linha | undefined): void {
    const eu = Access.user?.id ?? '';
    const nivel = numero(Access.user?.data?.autorizacao_usuario) ?? 0;
    const responsavel = texto(c?.id_responsavel, '');
    const aberto = texto(c?.status_chamado, '') === 'ABERTO';
    this.BTNBloquear.visible = aberto && responsavel === '';
    this.BTNDesbloquear.visible = aberto && responsavel !== '' && (responsavel === eu || nivel >= 3);
    this.BTNPrioridade.visible = c !== undefined && Access.hasRole('admin');
    this.BTNPrioridade.caption = numero(c?.prioridade_chamado) === 1 ? 'Remover prioridade' : 'Priorizar';
  }

  private async Gravar(operacao: Parameters<typeof gravar>[0], sucesso: string): Promise<void> {
    const id = numero(this.chamado?.id_chamado);
    if (id === null) return;
    const botoes = [this.BTNBloquear, this.BTNDesbloquear, this.BTNPrioridade];
    for (const botao of botoes) botao.enabled = false;
    try {
      await gravar(operacao, { id_chamado: id });
      Toast(sucesso, { kind: 'success' });
    } catch (e) {
      Toast(erro(e), { kind: 'warning' });
    } finally {
      for (const botao of botoes) botao.enabled = true;
      await this.Carregar();
    }
  }

  public async Bloquear(): Promise<void> {
    await this.Gravar(this.Api.Bloquear, 'Chamado bloqueado.');
  }

  public async Desbloquear(): Promise<void> {
    await this.Gravar(this.Api.Desbloquear, 'Chamado desbloqueado.');
  }

  public async Priorizar(): Promise<void> {
    const remover = numero(this.chamado?.prioridade_chamado) === 1;
    await this.Gravar(this.Api.Priorizar, remover ? 'Prioridade removida.' : 'Chamado priorizado.');
  }

  /** Like the SIGAT, opening the e-mails clears the unread count for the user who holds the chamado. */
  public async TrocarAba(_sender: unknown, event: CustomEvent<{ readonly panel: string }>): Promise<void> {
    const c = this.chamado;
    if (event.detail.panel !== 'PNLEmails' || c === undefined) return;
    if (texto(c.id_responsavel, '') !== (Access.user?.id ?? '')) return;
    if ((numero(c.email_nao_lido_chamado) ?? 0) === 0) return;
    const id = numero(c.id_chamado);
    if (id === null) return;
    try {
      await gravar(this.Api.ZerarNaoLidos, { id_chamado: id });
      this.chamado = { ...c, email_nao_lido_chamado: 0 };
    } catch {
      // The SIGAT ignores this failure too; the count is cleared on the next visit.
    }
  }

  // ---- registrar interação (Interacao::registrar_interacao do SIGAT)

  private PodeRegistrar(c: Linha | undefined): boolean {
    const nivel = numero(Access.user?.data?.autorizacao_usuario) ?? 0;
    return (
      c !== undefined &&
      texto(c.status_chamado, '') === 'ABERTO' &&
      (texto(c.id_responsavel, '') === (Access.user?.id ?? '') || nivel >= 3)
    );
  }

  /** Types offered by the SIGAT form; Atendimento only in queues 5 to 8. */
  private MostrarRegistro(): void {
    const c = this.chamado;
    const pode = this.PodeRegistrar(c);
    this.GRPRegistrar.visible = pode;
    this.LBLRegistrar.caption = pode
      ? ''
      : 'Para registrar uma interação, o chamado precisa estar aberto e bloqueado por você (ou você precisa ter autorização 3 ou mais).';
    if (!pode || c === undefined) return;
    const fila = numero(c.id_fila) ?? 0;
    const tipos = [
      ...(fila >= 5 && fila <= 8 ? [{ value: 'ATENDIMENTO', label: 'Atendimento' }] : []),
      { value: 'OBSERVACAO', label: 'Observação' },
      { value: 'ALT_FILA', label: 'Alteração de fila' },
      { value: 'ESPERA', label: 'Deixar em espera' },
      { value: 'REM_ESPERA', label: 'Remover da espera' },
    ];
    const anterior = this.CMBTipo.value;
    this.CMBTipo.items = tipos;
    this.CMBTipo.value = tipos.some((t) => t.value === anterior) ? anterior : (tipos[0]?.value ?? '');
    this.MudarTipo();
  }

  public MudarTipo(): void {
    const tipo = this.CMBTipo.value;
    const filaAtual = numero(this.chamado?.id_fila);
    this.CMBFila.visible = tipo === 'ALT_FILA';
    this.CMBFila.items = this.filas
      .filter((f) => numero(f.id_fila) !== filaAtual)
      .map((f) => ({ value: texto(f.id_fila, ''), label: texto(f.nome_fila) }));
    const itens: { value: string; label: string }[] = [];
    if (tipo === 'ESPERA' || tipo === 'REM_ESPERA') {
      const status = tipo === 'ESPERA' ? ['ABERTO', 'FALHA'] : ['ESPERA'];
      for (const e of this.equipamentos)
        if (status.includes(texto(e.status_equipamento_chamado, '')))
          itens.push({
            value: 'e:' + texto(e.num_equipamento, ''),
            label: 'Equipamento ' + texto(e.num_equipamento) + ' - ' + texto(e.descricao_equipamento),
          });
    }
    if (tipo === 'ATENDIMENTO' || tipo === 'ESPERA' || tipo === 'REM_ESPERA') {
      const status = tipo === 'REM_ESPERA' ? 'ESPERA' : 'ABERTO';
      for (const s of this.servicos)
        if (texto(s.status_servico, '') === status)
          itens.push({
            value: 's:' + texto(s.id, ''),
            label:
              'Serviço ' + texto(s.nome_servico) + ' (' + texto(s.quantidade) + ' ' + texto(s.unidade_medida) + ')',
          });
    }
    const comItens = tipo === 'ATENDIMENTO' || tipo === 'ESPERA' || tipo === 'REM_ESPERA';
    this.LSTItens.visible = comItens && itens.length > 0;
    this.LSTItens.items = itens;
    this.LBLItens.caption = !comItens
      ? ''
      : itens.length === 0
        ? 'Não há equipamentos ou serviços para esta ação.'
        : tipo === 'ATENDIMENTO'
          ? 'Marque os serviços que foram finalizados:'
          : tipo === 'ESPERA'
            ? 'Marque o que será deixado em espera:'
            : 'Marque o que sairá da espera:';
  }

  public async Registrar(): Promise<void> {
    const id = numero(this.chamado?.id_chamado);
    if (id === null) return;
    const selecionados = this.LSTItens.visible ? this.LSTItens.selectedValues : [];
    const equipamentos = selecionados.filter((v) => v.startsWith('e:')).map((v) => v.slice(2));
    const servicos = selecionados.filter((v) => v.startsWith('s:')).map((v) => Number(v.slice(2)));
    const comum = { id_chamado: id, texto: this.RTEInteracao.value };
    const tipo = this.CMBTipo.value;
    this.BTNRegistrar.enabled = false;
    try {
      if (tipo === 'ALT_FILA') {
        const fila = numero(this.CMBFila.value);
        if (fila === null) {
          Toast('Escolha a nova fila.', { kind: 'warning' });
          return;
        }
        await gravar(this.Api.AlterarFila, { ...comum, id_fila: fila });
      } else if (tipo === 'ATENDIMENTO') {
        await gravar(this.Api.Atendimento, { ...comum, servicos });
      } else if (tipo === 'ESPERA') {
        await gravar(this.Api.Espera, { ...comum, equipamentos, servicos });
      } else if (tipo === 'REM_ESPERA') {
        await gravar(this.Api.RemoverEspera, { ...comum, equipamentos, servicos });
      } else {
        await gravar(this.Api.Observacao, comum);
      }
      Toast('Interação registrada.', { kind: 'success' });
      this.RTEInteracao.value = '';
      this.Abas.selectTab('PNLInteracoes');
      await this.Carregar();
    } catch (e) {
      Toast(erro(e), { kind: 'warning' });
    } finally {
      this.BTNRegistrar.enabled = true;
    }
  }

  public AbrirOtobo(): void {
    if (this.ticketId === '' || this.ticketId === '0') {
      Toast('Este chamado não tem ticket no OTOBO.', { kind: 'info' });
      return;
    }
    Navigate('https://otobo.prefeitura.local/otobo/index.pl?Action=AgentTicketZoom;TicketID=' + encodeURIComponent(this.ticketId), { newWindow: true });
  }

  public AbrirEquipamento(_sender: unknown, event: CustomEvent<{ getValue<T>(field: string): T | undefined }>): void {
    abrirEquipamento(event.detail.getValue<string>('num_equipamento'));
  }

  public async SelecionarReparo(_sender: unknown, event: CustomEvent<{ getValue<T>(field: string): T | undefined }>): Promise<void> {
    const reparo = event.detail.getValue<number>('id_reparo');
    if (reparo === undefined) return;
    this.LBLReparo.caption = 'Histórico do reparo #' + reparo;
    try {
      await executar(this.Api.ReparoHistorico, { id: reparo });
    } catch (e) {
      Toast('Erro ao carregar o reparo: ' + erro(e), { kind: 'error' });
    }
  }
`,
);

const TRIAGEM = page(
  'Triagem',
  'Triagem',
  ['abrirChamado', 'contexto', 'erro', 'linhas', 'mostrarArtigos', 'primeira', 'texto'],
  `
  private chamadoCriado: unknown = undefined;

  public async Mostrar(): Promise<void> {
    preencherCabecalho(this.LBLUsuario);
    this.BTNAbrirChamado.visible = false;
    const id = Number(contexto('ticket'));
    if (!Number.isInteger(id) || id <= 0) {
      this.LBLTicket.caption = 'Nenhum ticket selecionado';
      return;
    }
    try {
      const t = primeira(await executar(this.Api.Ticket, { id }));
      if (t === undefined) {
        this.LBLTicket.caption = 'Ticket não está mais aguardando triagem';
        return;
      }
      this.LBLTicket.caption = 'Ticket#' + texto(t.tn);
      this.Assunto.caption = texto(t.title);
      this.Remetente.caption = texto(t.a_from);
      this.Abertura.caption = texto(t.create_time);
      this.FilaSigat.caption = texto(t.id_fila_sigat);
      const [artigos, , importados] = await Promise.all([
        executar(this.Api.Artigos, { id }),
        executar(this.Api.Anexos, { id }),
        executar(this.Api.Importado, { ticket: id }),
      ]);
      mostrarArtigos(this.HTMLArtigos, linhas(artigos));
      const chamado = linhas(importados)[0];
      this.chamadoCriado = chamado?.id_chamado;
      this.BTNAbrirChamado.visible = chamado !== undefined;
      this.LBLImportacao.caption = chamado === undefined
        ? 'Este ticket ainda não foi importado no SIGAT.'
        : 'Já existe o chamado #' + texto(chamado.id_chamado) + ' (' + texto(chamado.status_chamado) + ') para este ticket.';
    } catch (e) {
      Toast('Erro ao carregar o ticket: ' + erro(e), { kind: 'error' });
    }
  }

  public Voltar(): void {
    Navigate('index');
  }

  public AbrirChamadoCriado(): void {
    abrirChamado(this.chamadoCriado);
  }
`,
);

const EQUIPAMENTO = page(
  'Equipamento',
  'Equipamento',
  ['abrirChamado', 'contexto', 'erro', 'primeira', 'texto'],
  `
  public async Mostrar(): Promise<void> {
    preencherCabecalho(this.LBLUsuario);
    const num = contexto('equipamento');
    this.LBLEquipamento.caption = num === '' ? 'Nenhum equipamento selecionado' : 'Patrimônio ' + num;
    if (num === '') return;
    try {
      const e = primeira(await executar(this.Api.Equipamento, { num }));
      this.Descricao.caption = texto(e?.descricao_equipamento, 'Não cadastrado no SIGAT');
      this.Etiqueta.caption = texto(e?.tag_equipamento);
      this.Cadastro.caption = texto(e?.data_equipamento);
      this.Alteracao.caption = texto(e?.data_alteracao_equipamento);
      await this.CarregarChamados();
    } catch (e) {
      Toast('Erro ao carregar o equipamento: ' + erro(e), { kind: 'error' });
    }
  }

  public async CarregarChamados(): Promise<void> {
    const num = contexto('equipamento');
    if (num === '') return;
    await executar(this.Api.Chamados, { num, atendidos: this.TGLAtendidos.checked });
  }

  public AbrirChamado(_sender: unknown, event: CustomEvent<{ getValue<T>(field: string): T | undefined }>): void {
    abrirChamado(event.detail.getValue<number>('id_chamado'));
  }
`,
);

const BUSCA = page(
  'Busca',
  'Busca',
  ['abrirChamado', 'abrirEquipamento', 'contexto', 'erro', 'linhas'],
  `
  public async Mostrar(): Promise<void> {
    preencherCabecalho(this.LBLUsuario);
    const q = contexto('busca');
    this.EDTBuscaRapida.value = q;
    if (q.length < 3) return;
    this.LBLTermo.caption = 'Resultados para "' + q + '"';
    try {
      const [equipamentos, chamados] = await Promise.all([
        executar(this.Api.Equipamentos, { q }),
        executar(this.Api.Chamados, { q }),
      ]);
      const unico = linhas(equipamentos);
      if (unico.length === 1 && String(unico[0]?.num_equipamento) === q && linhas(chamados).length === 0)
        abrirEquipamento(q);
    } catch (e) {
      Toast('Erro na busca: ' + erro(e), { kind: 'error' });
    }
  }

  public AbrirEquipamento(_sender: unknown, event: CustomEvent<{ getValue<T>(field: string): T | undefined }>): void {
    abrirEquipamento(event.detail.getValue<string>('num_equipamento'));
  }

  public AbrirChamado(_sender: unknown, event: CustomEvent<{ getValue<T>(field: string): T | undefined }>): void {
    abrirChamado(event.detail.getValue<number>('id'));
  }
`,
);

const INSERVIVEIS = page(
  'Inserviveis',
  'Inserviveis',
  ['abrir', 'erro'],
  `
  public async Mostrar(): Promise<void> {
    preencherCabecalho(this.LBLUsuario);
    try {
      await this.Api.Remessas.execute();
    } catch (e) {
      Toast('Erro ao carregar as remessas: ' + erro(e), { kind: 'error' });
    }
  }

  public AbrirRemessa(_sender: unknown, event: CustomEvent<{ getValue<T>(field: string): T | undefined }>): void {
    abrir('Remessa', 'remessa', event.detail.getValue<number>('id_remessa_inservivel'));
  }
`,
);

const REMESSA = page(
  'Remessa',
  'Remessa',
  ['abrirChamado', 'contexto', 'erro', 'primeira', 'sim', 'texto'],
  `
  public async Mostrar(): Promise<void> {
    preencherCabecalho(this.LBLUsuario);
    const id = Number(contexto('remessa'));
    if (!Number.isInteger(id) || id <= 0) {
      this.LBLRemessa.caption = 'Nenhuma remessa selecionada';
      return;
    }
    this.LBLRemessa.caption = 'Remessa #' + id;
    try {
      const [cabecalho] = await Promise.all([
        executar(this.Api.Remessa, { id }),
        executar(this.Api.Equipamentos, { id }),
      ]);
      const r = primeira(cabecalho);
      this.Situacao.caption = r === undefined ? '-' : sim(r.falha_envio) ? 'Falha no envio'
        : r.data_entrega ? 'Entregue' : r.data_fechamento ? 'Fechada' : 'Aberta';
      this.Abertura.caption = texto(r?.data_abertura);
      this.Fechamento.caption = texto(r?.data_fechamento);
      this.Entrega.caption = texto(r?.data_entrega);
      this.Recebedor.caption = texto(r?.nome_recebedor);
      this.Termo.caption = texto(r?.nome_termo);
    } catch (e) {
      Toast('Erro ao carregar a remessa: ' + erro(e), { kind: 'error' });
    }
  }

  public Voltar(): void {
    Navigate('Inserviveis');
  }

  public AbrirChamado(_sender: unknown, event: CustomEvent<{ getValue<T>(field: string): T | undefined }>): void {
    abrirChamado(event.detail.getValue<number>('id_chamado'));
  }
`,
);

const ADMIN = page(
  'Admin',
  'Admin',
  ['abrir', 'erro'],
  `
  private carregado = false;

  public async Mostrar(): Promise<void> {
    preencherCabecalho(this.LBLUsuario);
    if (this.carregado) return;
    this.carregado = true;
    try {
      await Promise.all([
        this.Api.Secretarias.execute(),
        this.Api.Bancadas.execute(),
        this.Api.Modelos.execute(),
        this.Api.Filas.execute(),
      ]);
    } catch (e) {
      Toast('Erro ao carregar os cadastros: ' + erro(e), { kind: 'error' });
    }
  }

  public AbrirUsuario(_sender: unknown, event: CustomEvent<{ getValue<T>(field: string): T | undefined }>): void {
    abrir('Usuario', 'usuario', event.detail.getValue<number>('id_usuario'));
  }

  public AbrirLocal(_sender: unknown, event: CustomEvent<{ getValue<T>(field: string): T | undefined }>): void {
    abrir('Local', 'local', event.detail.getValue<number>('id_local'));
  }
`,
);

const USUARIO = page(
  'Usuario',
  'Usuario',
  ['abrirChamado', 'contexto', 'erro', 'primeira', 'sim', 'texto'],
  `
  public async Mostrar(): Promise<void> {
    preencherCabecalho(this.LBLUsuario);
    const id = Number(contexto('usuario'));
    if (!Number.isInteger(id) || id <= 0) {
      this.LBLUsuarioNome.caption = 'Nenhum usuário selecionado';
      return;
    }
    try {
      const [perfil] = await Promise.all([
        executar(this.Api.Perfil, { id }),
        executar(this.Api.Produtividade, { id }),
        executar(this.Api.Bloqueados, { id }),
      ]);
      const u = primeira(perfil);
      this.LBLUsuarioNome.caption = texto(u?.nome_usuario, 'Usuário #' + id);
      this.Login.caption = texto(u?.login_usuario);
      this.Autorizacao.caption = texto(u?.autorizacao);
      this.Permissoes.caption = [
        sim(u?.triagem_usuario) ? 'triagem' : '',
        sim(u?.encerramento_usuario) ? 'encerramento' : '',
        sim(u?.inservivel_usuario) ? 'inservíveis' : '',
        sim(u?.status_usuario) ? '' : 'INATIVO',
      ].filter((p) => p !== '').join(', ') || '-';
      this.Interacoes.caption = texto(u?.total_interacoes, '0');
      this.UltimoEvento.caption = texto(u?.ultimo_evento);
    } catch (e) {
      Toast('Erro ao carregar o usuário: ' + erro(e), { kind: 'error' });
    }
  }

  public Voltar(): void {
    Navigate('Admin');
  }

  public AbrirChamado(_sender: unknown, event: CustomEvent<{ getValue<T>(field: string): T | undefined }>): void {
    abrirChamado(event.detail.getValue<number>('id_chamado'));
  }
`,
);

const LOCAL = page(
  'Local',
  'Local',
  ['contexto', 'erro', 'linhas', 'primeira', 'sim', 'texto'],
  `
  public async Mostrar(): Promise<void> {
    preencherCabecalho(this.LBLUsuario);
    const id = Number(contexto('local'));
    if (!Number.isInteger(id) || id <= 0) {
      this.LBLLocal.caption = 'Nenhum local selecionado';
      return;
    }
    try {
      const [local, , secretarias] = await Promise.all([
        executar(this.Api.Local, { id }),
        executar(this.Api.Telefones, { id }),
        this.Api.Secretarias.execute(),
      ]);
      const l = primeira(local);
      const secretaria = linhas(secretarias).find((s) => String(s.id_secretaria) === String(l?.secretaria_local));
      this.LBLLocal.caption = texto(l?.nome_local, 'Local #' + id);
      this.Endereco.caption = texto(l?.endereco_local);
      this.Secretaria.caption = texto(secretaria?.sigla_secretaria);
      this.Regiao.caption = texto(l?.regiao_local);
      this.Situacao.caption = sim(l?.status_local) ? 'Ativo' : 'Inativo';
      this.Infovia.caption = sim(l?.infovia) ? 'Sim' : 'Não';
    } catch (e) {
      Toast('Erro ao carregar o local: ' + erro(e), { kind: 'error' });
    }
  }

  public Voltar(): void {
    Navigate('Admin');
  }
`,
);

const NEGADO = page(
  'Negado',
  'Negado',
  [],
  `
  public Mostrar(): void {
    preencherCabecalho(this.LBLUsuario);
  }
`,
);

const NAO_ENCONTRADA = page(
  '404',
  'Page404',
  [],
  `
  public AbrirPainel(): void {
    Navigate('index');
  }
`,
  false,
);

export const SIGAT2_SOURCES: Readonly<Record<string, string>> = {
  'units/Sigat2.ts': UNIT,
  'pages/index.ts': INDEX,
  'pages/Login.ts': LOGIN,
  'pages/Chamado.ts': CHAMADO,
  'pages/Triagem.ts': TRIAGEM,
  'pages/Equipamento.ts': EQUIPAMENTO,
  'pages/Busca.ts': BUSCA,
  'pages/Inserviveis.ts': INSERVIVEIS,
  'pages/Remessa.ts': REMESSA,
  'pages/Admin.ts': ADMIN,
  'pages/Usuario.ts': USUARIO,
  'pages/Local.ts': LOCAL,
  'pages/Negado.ts': NEGADO,
  'pages/404.ts': NAO_ENCONTRADA,
};
