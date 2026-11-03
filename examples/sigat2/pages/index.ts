import {
  abrirBloqueados,
  buscar,
  sair,
  preencherCabecalho,
  abrir,
  abrirChamado,
  contadorNoBotao,
  destacarLinhas,
  erro,
  iconeDoBotaoDaFila,
  iconesNasAbas,
  linhas,
  mostrarBloqueados,
  numero,
  prepararLinhasDoPainel,
  primeira,
  sinaisNaLista,
  texto,
  executar,
} from '../units/Sigat2';
import { indexGenerated } from './index.generated';

export class index extends indexGenerated {
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

  public MostrarBloqueados(): void {
    abrirBloqueados();
  }

  private carregado = false;
  /** id_fila of each visible queue button, in order. */
  private filas: number[] = [];
  /** Selected queue: 0 = Todos, 99 = Entrega, as in SIGAT. */
  private fila = 0;

  private botoesDeFila() {
    return [
      this.BTNFila1,
      this.BTNFila2,
      this.BTNFila3,
      this.BTNFila4,
      this.BTNFila5,
      this.BTNFila6,
      this.BTNFila7,
      this.BTNFila8,
      this.BTNFila9,
      this.BTNFila10,
      this.BTNFila11,
      this.BTNFila12,
    ];
  }

  public async Mostrar(): Promise<void> {
    preencherCabecalho(this);
    this.TMRAtualizar.Start();
    if (this.carregado) {
      await this.Atualizar();
      return;
    }
    this.carregado = true;
    iconesNasAbas(this.Abas, ['funnel', 'headset', 'archive']);
    // The signals are computed from each row before the grid draws it: prepare what is
    // loaded, listen first, then bind the grid again so its own listener runs after this one.
    const prepararPainel = (): void =>
      prepararLinhasDoPainel(this.Api.getOperationState('Chamados').data);
    prepararPainel();
    this.Api.subscribe(prepararPainel);
    this.GRDChamados.bindApiClient(this.Api);
    sinaisNaLista(this.GRDChamados);
    destacarLinhas(this.GRDTriagem);
    destacarLinhas(this.GRDEncerrados);
    try {
      const filas = linhas(await this.Api.Filas.execute());
      this.filas = [];
      this.botoesDeFila().forEach((botao, indice) => {
        const fila = filas[indice];
        botao.visible = fila !== undefined;
        if (fila === undefined) return;
        botao.caption = texto(fila.nome_fila);
        botao.icon = iconeDoBotaoDaFila(fila.icone_fila);
        this.filas.push(numero(fila.id_fila) ?? 0);
      });
    } catch (e) {
      Toast('Não foi possível carregar as filas: ' + erro(e), { kind: 'error' });
    }
    if (Access.hasRole('triagem')) void this.Api.Triagem.execute().catch(() => undefined);
    await this.SelecionarFila(this.filaInicial());
  }

  public Ocultar(): void {
    this.TMRAtualizar.Stop();
  }

  /** SIGAT opens the queue chosen last (cookie fila_painel), else the user's own queue. */
  private filaInicial(): number {
    let salva = '';
    try {
      salva = localStorage.getItem('sigat2.fila_painel') ?? '';
    } catch {
      // Storage may be blocked; fall back to the user's queue.
    }
    const valida = (fila: number | null): fila is number =>
      fila !== null && (fila === 0 || fila === 99 || this.filas.includes(fila));
    const escolhida = salva === '' ? null : numero(salva);
    if (valida(escolhida)) return escolhida;
    const doUsuario = numero(Access.user?.data?.fila_usuario);
    return valida(doUsuario) ? doUsuario : 0;
  }

  private botaoDaFila(fila: number) {
    if (fila === 99) return this.BTNEntrega;
    return this.botoesDeFila()[this.filas.indexOf(fila)] ?? this.BTNTodos;
  }

  public async FiltrarFila(sender: { readonly name: string }): Promise<void> {
    if (sender.name === 'BTNTodos') return this.SelecionarFila(0);
    if (sender.name === 'BTNEntrega') return this.SelecionarFila(99);
    const indice = this.botoesDeFila().findIndex((botao) => botao.name === sender.name);
    const fila = this.filas[indice];
    if (fila !== undefined) await this.SelecionarFila(fila);
  }

  private async SelecionarFila(fila: number): Promise<void> {
    this.fila = fila;
    try {
      localStorage.setItem('sigat2.fila_painel', String(fila));
    } catch {
      // Storage may be blocked; the choice then lasts only while the page is open.
    }
    this.Api.Chamados.parameter.fila = fila > 0 ? fila : undefined;
    // Bootstrap marks the pressed toggle with its darker active colour.
    const ativo: Readonly<Record<string, string>> = { BTNTodos: '#117a8b', BTNEntrega: '#1e7e34' };
    const selecionado = this.botaoDaFila(fila);
    for (const botao of [...this.botoesDeFila(), this.BTNEntrega, this.BTNTodos]) {
      const cor = botao === selecionado ? (ativo[botao.name] ?? '#0062cc') : '';
      botao.backgroundColor = cor;
      botao.borderColor = cor;
      botao.element.setAttribute('aria-pressed', String(botao === selecionado));
    }
    await this.Atualizar();
  }

  /** Runs on a queue change and every 2 minutes while the painel is open. */
  public async Atualizar(): Promise<void> {
    await Promise.all([this.GRDChamados.refresh(), this.CarregarIndicadores()]);
    const total = numero(
      (this.Api.getOperationState('Chamados').data as { total?: unknown } | undefined)?.total,
    );
    for (const botao of [...this.botoesDeFila(), this.BTNEntrega, this.BTNTodos])
      contadorNoBotao(
        botao,
        botao === this.botaoDaFila(this.fila)
          ? (total ?? this.GRDChamados.visibleRows.length)
          : null,
      );
    if (Access.hasRole('triagem')) await this.Api.Triagem.execute().catch(() => undefined);
  }

  /** The lock badge and the Entrega button come from painel-indicadores. */
  private async CarregarIndicadores(): Promise<void> {
    try {
      const indicadores = primeira(await executar(this.Api.Indicadores, { fila: undefined }));
      mostrarBloqueados(this, numero(indicadores?.meus_bloqueados));
      const entregas =
        (numero(indicadores?.prontos_entrega) ?? 0) + (numero(indicadores?.entrega_parcial) ?? 0);
      this.BTNEntrega.visible = entregas > 0 || this.fila === 99;
    } catch {
      // The painel works without the counters.
    }
  }

  /** Prints the painel as listed (SIGAT printed the chamados ticked in its list). */
  public Imprimir(): void {
    window.print();
  }

  /** SIGAT's broom: forget the list's search, sort and page size and load it again. */
  public async LimparPainel(): Promise<void> {
    this.GRDChamados.searchText = '';
    this.GRDChamados.clearSort();
    this.GRDChamados.pageSize = 200;
    this.GRDChamados.page = 1;
    await this.Atualizar();
  }

  public AbrirChamadoDaGrade(
    _sender: unknown,
    event: CustomEvent<{ getValue<T>(field: string): T | undefined }>,
  ): void {
    abrirChamado(event.detail.getValue<number>('id_chamado'));
  }

  public AbrirEncerrado(
    _sender: unknown,
    event: CustomEvent<{ getValue<T>(field: string): T | undefined }>,
  ): void {
    abrirChamado(event.detail.getValue<number>('id_chamado'));
  }

  public AbrirTriagem(
    _sender: unknown,
    event: CustomEvent<{ getValue<T>(field: string): T | undefined }>,
  ): void {
    abrir('Triagem', 'ticket', event.detail.getValue<number>('id'));
  }
}
