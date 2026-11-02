import {
  buscar,
  sair,
  preencherCabecalho,
  abrirChamado,
  contexto,
  erro,
  primeira,
  texto,
  executar,
} from '../units/Sigat2';
import { EquipamentoGenerated } from './Equipamento.generated';

export class Equipamento extends EquipamentoGenerated {
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
    const num = contexto('equipamento');
    this.LBLEquipamento.caption =
      num === '' ? 'Nenhum equipamento selecionado' : 'Patrimônio ' + num;
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

  public AbrirChamado(
    _sender: unknown,
    event: CustomEvent<{ getValue<T>(field: string): T | undefined }>,
  ): void {
    abrirChamado(event.detail.getValue<number>('id_chamado'));
  }
}
