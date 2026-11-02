import {
  buscar,
  sair,
  preencherCabecalho,
  abrirChamado,
  abrirEquipamento,
  contexto,
  erro,
  linhas,
  executar,
} from '../units/Sigat2';
import { BuscaGenerated } from './Busca.generated';

export class Busca extends BuscaGenerated {
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
      if (
        unico.length === 1 &&
        String(unico[0]?.num_equipamento) === q &&
        linhas(chamados).length === 0
      )
        abrirEquipamento(q);
    } catch (e) {
      Toast('Erro na busca: ' + erro(e), { kind: 'error' });
    }
  }

  public AbrirEquipamento(
    _sender: unknown,
    event: CustomEvent<{ getValue<T>(field: string): T | undefined }>,
  ): void {
    abrirEquipamento(event.detail.getValue<string>('num_equipamento'));
  }

  public AbrirChamado(
    _sender: unknown,
    event: CustomEvent<{ getValue<T>(field: string): T | undefined }>,
  ): void {
    abrirChamado(event.detail.getValue<number>('id'));
  }
}
