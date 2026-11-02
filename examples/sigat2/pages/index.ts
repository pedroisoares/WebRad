import {
  buscar,
  sair,
  preencherCabecalho,
  abrir,
  abrirChamado,
  erro,
  linhas,
  mostrarIndicadores,
  mostrarLegenda,
  prepararLinhasDoPainel,
  primeira,
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
    const prepararPainel = (): void =>
      prepararLinhasDoPainel(this.Api.getOperationState('Chamados').data);
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
      mostrarIndicadores(
        this.HTMLIndicadores,
        primeira(await executar(this.Api.Indicadores, { fila: fila > 0 ? fila : undefined })),
      );
    } catch {
      mostrarIndicadores(this.HTMLIndicadores, undefined);
    }
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
