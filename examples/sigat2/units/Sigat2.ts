import type { WebHtml, WebLabel } from '@webrad/runtime';

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

const CORES: Readonly<Record<string, string>> = {
  ATENDIMENTO: '#e0edff',
  ATENDIMENTO_INS: '#e0edff',
  ALT_FILA: '#fff4d6',
  OBSERVACAO: '#e0f5f9',
  FECHAMENTO: '#ddf5e3',
  FECHAMENTO_EQUIP: '#ddf5e3',
  FECHAMENTO_INS: '#ddf5e3',
  FECHAMENTO_MAN: '#ddf5e3',
  ENTREGA: '#ddf5e3',
  TENTATIVA_ENTREGA: '#e0f5f9',
  FALHA_ENTREGA: '#fde2e2',
  ESPERA: '#ffd9cc',
  REM_ESPERA: '#fff0fe',
};

const ACOES: Readonly<Record<string, string>> = {
  ATENDIMENTO: 'realizou um atendimento',
  ATENDIMENTO_INS: 'realizou um atendimento',
  ALT: 'alterou dados do chamado',
  ALT_FILA: 'alterou a fila',
  OBSERVACAO: 'fez uma observação',
  FECHAMENTO: 'finalizou o chamado',
  FECHAMENTO_EQUIP: 'finalizou o chamado',
  FECHAMENTO_INS: 'finalizou o chamado',
  FECHAMENTO_MAN: 'finalizou o chamado',
  ENTREGA: 'realizou a entrega',
  TENTATIVA_ENTREGA: 'registrou uma tentativa de entrega',
  FALHA_ENTREGA: 'registrou uma falha na entrega',
  ESPERA: 'deixou equipamentos em espera',
  REM_ESPERA: 'retirou equipamentos da espera',
  INSERVIVEL_REPARO: 'registrou um inservível',
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
    return (
      '<div class="item" style="background:' +
      (CORES[tipo] ?? '#f3f4f6') +
      '">' +
      '<div class="topo"><span>' +
      cabecalho +
      marcas +
      '</span><span>' +
      escapar(i.data_interacao) +
      '</span></div>' +
      (acao === undefined ? '' : '<hr>') +
      texto(i.texto_interacao, '') +
      '</div>'
    );
  });
  destino.html =
    ESTILO + (itens.length > 0 ? itens.join('') : '<p class="vazio">Nenhuma interação.</p>');
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
