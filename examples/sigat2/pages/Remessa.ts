import {
  buscar,
  sair,
  preencherCabecalho,
  abrirChamado,
  contexto,
  erro,
  primeira,
  sim,
  texto,
  executar,
} from '../units/Sigat2';
import { RemessaGenerated } from './Remessa.generated';

export class Remessa extends RemessaGenerated {
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
      this.Situacao.caption =
        r === undefined
          ? '-'
          : sim(r.falha_envio)
            ? 'Falha no envio'
            : r.data_entrega
              ? 'Entregue'
              : r.data_fechamento
                ? 'Fechada'
                : 'Aberta';
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

  public AbrirChamado(
    _sender: unknown,
    event: CustomEvent<{ getValue<T>(field: string): T | undefined }>,
  ): void {
    abrirChamado(event.detail.getValue<number>('id_chamado'));
  }
}
