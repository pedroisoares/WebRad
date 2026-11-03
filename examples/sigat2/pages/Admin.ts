import {
  abrirBloqueados,
  buscar,
  sair,
  preencherCabecalho,
  abrir,
  destacarLinhas,
  erro,
} from '../units/Sigat2';
import { AdminGenerated } from './Admin.generated';

export class Admin extends AdminGenerated {
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
  /** The tabs loaded so far; each list is read the first time its tab opens. */
  private readonly abertas = new Set<number>();

  public async Mostrar(): Promise<void> {
    preencherCabecalho(this);
    if (!this.carregado) {
      this.carregado = true;
      for (const grade of [
        this.GRDEventos,
        this.GRDUsuarios,
        this.GRDModelos,
        this.GRDLocais,
        this.GRDSecretarias,
        this.GRDServicos,
        this.GRDBancadas,
        this.GRDFilas,
      ])
        destacarLinhas(grade);
      // SIGAT orders the log by ID, newest first.
      this.GRDEventos.sortBy('id_evento', 'desc');
    }
    await this.CarregarAba(this.Abas.selectedIndex);
    this.TMREventos.Start();
  }

  public Ocultar(): void {
    this.TMREventos.Stop();
  }

  public async TrocarAba(): Promise<void> {
    await this.CarregarAba(this.Abas.selectedIndex);
  }

  private async CarregarAba(indice: number): Promise<void> {
    // The log is read again whenever its tab opens; the other lists once.
    if (indice !== 0 && this.abertas.has(indice)) return;
    this.abertas.add(indice);
    try {
      switch (indice) {
        case 0:
          await this.Api.Eventos.execute();
          break;
        case 2:
          await this.Api.Modelos.execute();
          break;
        case 4:
          await this.Api.Secretarias.execute();
          break;
        case 6:
          await this.Api.Bancadas.execute();
          break;
        case 7:
          await this.Api.Filas.execute();
          break;
        // Usuários, Locais and Serviços page on the server and load themselves.
        default:
          break;
      }
    } catch (e) {
      this.abertas.delete(indice);
      Toast('Erro ao carregar a lista: ' + erro(e), { kind: 'error' });
    }
  }

  /** SIGAT reloads the log every 30 seconds and keeps the page, sort and filters. */
  public async AtualizarEventos(): Promise<void> {
    if (this.Abas.selectedIndex !== 0) return;
    try {
      await this.Api.Eventos.execute();
    } catch {
      // The next tick tries again; the list keeps the last events read.
    }
  }

  public AbrirUsuario(
    _sender: unknown,
    event: CustomEvent<{ getValue<T>(field: string): T | undefined }>,
  ): void {
    abrir('Usuario', 'usuario', event.detail.getValue<number>('id_usuario'));
  }

  public AbrirLocal(
    _sender: unknown,
    event: CustomEvent<{ getValue<T>(field: string): T | undefined }>,
  ): void {
    abrir('Local', 'local', event.detail.getValue<number>('id_local'));
  }
}
