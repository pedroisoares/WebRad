import { abrirBloqueados, buscar, sair, preencherCabecalho, abrir, erro } from '../units/Sigat2';
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

  public async Mostrar(): Promise<void> {
    preencherCabecalho(this);
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
