import { buscar, sair, preencherCabecalho, abrir, erro } from '../units/Sigat2';
import { InserviveisGenerated } from './Inserviveis.generated';

export class Inserviveis extends InserviveisGenerated {
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

  public async Mostrar(): Promise<void> {
    preencherCabecalho(this.LBLUsuario);
    try {
      await this.Api.Remessas.execute();
    } catch (e) {
      Toast('Erro ao carregar as remessas: ' + erro(e), { kind: 'error' });
    }
  }

  public AbrirRemessa(
    _sender: unknown,
    event: CustomEvent<{ getValue<T>(field: string): T | undefined }>,
  ): void {
    abrir('Remessa', 'remessa', event.detail.getValue<number>('id_remessa_inservivel'));
  }
}
