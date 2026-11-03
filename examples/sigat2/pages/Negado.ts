import { abrirBloqueados, buscar, sair, preencherCabecalho } from '../units/Sigat2';
import { NegadoGenerated } from './Negado.generated';

export class Negado extends NegadoGenerated {
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

  public Mostrar(): void {
    preencherCabecalho(this);
  }
}
