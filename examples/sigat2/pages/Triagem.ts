import {
  buscar,
  sair,
  preencherCabecalho,
  abrirChamado,
  contexto,
  erro,
  linhas,
  mostrarArtigos,
  primeira,
  texto,
  executar,
} from '../units/Sigat2';
import { TriagemGenerated } from './Triagem.generated';

export class Triagem extends TriagemGenerated {
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

  private chamadoCriado: unknown = undefined;

  public async Mostrar(): Promise<void> {
    preencherCabecalho(this.LBLUsuario);
    this.BTNAbrirChamado.visible = false;
    const id = Number(contexto('ticket'));
    if (!Number.isInteger(id) || id <= 0) {
      this.LBLTicket.caption = 'Nenhum ticket selecionado';
      return;
    }
    try {
      const t = primeira(await executar(this.Api.Ticket, { id }));
      if (t === undefined) {
        this.LBLTicket.caption = 'Ticket não está mais aguardando triagem';
        return;
      }
      this.LBLTicket.caption = 'Ticket#' + texto(t.tn);
      this.Assunto.caption = texto(t.title);
      this.Remetente.caption = texto(t.a_from);
      this.Abertura.caption = texto(t.create_time);
      this.FilaSigat.caption = texto(t.id_fila_sigat);
      const [artigos, , importados] = await Promise.all([
        executar(this.Api.Artigos, { id }),
        executar(this.Api.Anexos, { id }),
        executar(this.Api.Importado, { ticket: id }),
      ]);
      mostrarArtigos(this.HTMLArtigos, linhas(artigos));
      const chamado = linhas(importados)[0];
      this.chamadoCriado = chamado?.id_chamado;
      this.BTNAbrirChamado.visible = chamado !== undefined;
      this.LBLImportacao.caption =
        chamado === undefined
          ? 'Este ticket ainda não foi importado no SIGAT.'
          : 'Já existe o chamado #' +
            texto(chamado.id_chamado) +
            ' (' +
            texto(chamado.status_chamado) +
            ') para este ticket.';
    } catch (e) {
      Toast('Erro ao carregar o ticket: ' + erro(e), { kind: 'error' });
    }
  }

  public Voltar(): void {
    Navigate('index');
  }

  public AbrirChamadoCriado(): void {
    abrirChamado(this.chamadoCriado);
  }
}
