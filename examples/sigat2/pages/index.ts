import {
  buscar,
  sair,
  preencherCabecalho,
  abrir,
  abrirChamado,
  erro,
  linhas,
  texto,
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
