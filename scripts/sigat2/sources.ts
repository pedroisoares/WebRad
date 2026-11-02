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

export function erro(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
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
  ['abrir', 'abrirChamado', 'erro', 'linhas', 'texto'],
  `
  private carregado = false;

  public async Mostrar(): Promise<void> {
    preencherCabecalho(this.LBLUsuario);
    if (this.carregado) {
      await this.GRDChamados.refresh();
      return;
    }
    this.carregado = true;
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

  public async MudarFila(): Promise<void> {
    const fila = Number(this.CBFila.value);
    this.Api.Chamados.parameter.fila = fila > 0 ? fila : undefined;
    await this.GRDChamados.refresh();
    this.LBLResumo.caption = fila === 99 ? 'Chamados com entrega pendente' : '';
  }

  public async Atualizar(): Promise<void> {
    await this.GRDChamados.refresh();
    if (Access.hasRole('triagem')) await this.Api.Triagem.execute().catch(() => undefined);
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
    'linhas',
    'mostrarArtigos',
    'mostrarInteracoes',
    'primeira',
    'texto',
  ],
  `
  private ticketId = '';

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
        executar(this.Api.Equipamentos, parametros),
        executar(this.Api.Servicos, parametros),
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
    } catch (e) {
      Toast('Erro ao carregar o chamado: ' + erro(e), { kind: 'error' });
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
