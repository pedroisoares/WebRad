import {
  buscar,
  sair,
  preencherCabecalho,
  abrirEquipamento,
  contexto,
  erro,
  gravar,
  linhas,
  mostrarArtigos,
  mostrarInteracoes,
  numero,
  primeira,
  texto,
  type Linha,
  executar,
} from '../units/Sigat2';
import { ChamadoGenerated } from './Chamado.generated';

export class Chamado extends ChamadoGenerated {
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

  private ticketId = '';
  private chamado: Linha | undefined;

  public async Mostrar(): Promise<void> {
    preencherCabecalho(this.LBLUsuario);
    await this.Carregar();
  }

  public async Carregar(): Promise<void> {
    const id = Number(contexto('chamado'));
    if (!Number.isInteger(id) || id <= 0) {
      this.LBLChamado.caption = 'Nenhum chamado selecionado';
      return;
    }
    this.LBLChamado.caption = 'Chamado #' + id + ' (carregando...)';
    const parametros = { id };
    try {
      const c = primeira(await executar(this.Api.Detalhe, parametros));
      this.chamado = c;
      this.MostrarAcoes(c);
      if (c === undefined) {
        this.LBLChamado.caption = 'Chamado #' + id + ' não encontrado';
        return;
      }
      this.LBLChamado.caption = 'Chamado #' + id + ' - ' + texto(c.resumo_chamado);
      this.Status.caption =
        texto(c.status_chamado) + (Number(c.prioridade_chamado) === 1 ? ' (prioridade)' : '');
      this.Ticket.caption = texto(c.ticket_chamado);
      this.Fila.caption = texto(c.nome_fila_chamado);
      this.Responsavel.caption = texto(c.nome_responsavel, 'Ninguém');
      this.Solicitante.caption = texto(c.nome_solicitante_chamado);
      this.Telefone.caption = texto(c.telefone_chamado) + ' / ' + texto(c.celular_chamado);
      this.Local.caption = texto(c.nome_local);
      this.Endereco.caption = texto(c.endereco_local);
      this.Regiao.caption = texto(c.regiao_local);
      this.Abertura.caption = texto(c.data_chamado);
      this.Encerramento.caption = texto(c.data_encerramento_chamado);
      this.Resumo.caption = texto(c.resumo_chamado);
      this.ticketId = texto(c.id_ticket_chamado, '');
      const interacoes = executar(this.Api.Interacoes, parametros);
      await Promise.all([
        interacoes.then((r) => mostrarInteracoes(this.HTMLInteracoes, linhas(r))),
        executar(this.Api.Equipamentos, parametros),
        executar(this.Api.Servicos, parametros),
        executar(this.Api.Reparos, parametros),
        executar(this.Api.Historico, parametros),
        executar(this.Api.Anexos, parametros),
        executar(this.Api.Termos, parametros),
        executar(this.Api.Telefones, parametros),
        Number(this.ticketId) > 0
          ? executar(this.Api.Artigos, { id: Number(this.ticketId) }).then((r) =>
              mostrarArtigos(this.HTMLEmails, linhas(r)),
            )
          : Promise.resolve(mostrarArtigos(this.HTMLEmails, [])),
      ]);
    } catch (e) {
      Toast('Erro ao carregar o chamado: ' + erro(e), { kind: 'error' });
    }
  }

  /** Same rules as the SIGAT buttons; HexAPI enforces them again on every write. */
  private MostrarAcoes(c: Linha | undefined): void {
    const eu = Access.user?.id ?? '';
    const nivel = numero(Access.user?.data?.autorizacao_usuario) ?? 0;
    const responsavel = texto(c?.id_responsavel, '');
    const aberto = texto(c?.status_chamado, '') === 'ABERTO';
    this.BTNBloquear.visible = aberto && responsavel === '';
    this.BTNDesbloquear.visible =
      aberto && responsavel !== '' && (responsavel === eu || nivel >= 3);
    this.BTNPrioridade.visible = c !== undefined && Access.hasRole('admin');
    this.BTNPrioridade.caption =
      numero(c?.prioridade_chamado) === 1 ? 'Remover prioridade' : 'Priorizar';
  }

  private async Gravar(operacao: Parameters<typeof gravar>[0], sucesso: string): Promise<void> {
    const id = numero(this.chamado?.id_chamado);
    if (id === null) return;
    const botoes = [this.BTNBloquear, this.BTNDesbloquear, this.BTNPrioridade];
    for (const botao of botoes) botao.enabled = false;
    try {
      await gravar(operacao, { id_chamado: id });
      Toast(sucesso, { kind: 'success' });
    } catch (e) {
      Toast(erro(e), { kind: 'warning' });
    } finally {
      for (const botao of botoes) botao.enabled = true;
      await this.Carregar();
    }
  }

  public async Bloquear(): Promise<void> {
    await this.Gravar(this.Api.Bloquear, 'Chamado bloqueado.');
  }

  public async Desbloquear(): Promise<void> {
    await this.Gravar(this.Api.Desbloquear, 'Chamado desbloqueado.');
  }

  public async Priorizar(): Promise<void> {
    const remover = numero(this.chamado?.prioridade_chamado) === 1;
    await this.Gravar(this.Api.Priorizar, remover ? 'Prioridade removida.' : 'Chamado priorizado.');
  }

  /** Like the SIGAT, opening the e-mails clears the unread count for the user who holds the chamado. */
  public async TrocarAba(
    _sender: unknown,
    event: CustomEvent<{ readonly panel: string }>,
  ): Promise<void> {
    const c = this.chamado;
    if (event.detail.panel !== 'PNLEmails' || c === undefined) return;
    if (texto(c.id_responsavel, '') !== (Access.user?.id ?? '')) return;
    if ((numero(c.email_nao_lido_chamado) ?? 0) === 0) return;
    const id = numero(c.id_chamado);
    if (id === null) return;
    try {
      await gravar(this.Api.ZerarNaoLidos, { id_chamado: id });
      this.chamado = { ...c, email_nao_lido_chamado: 0 };
    } catch {
      // The SIGAT ignores this failure too; the count is cleared on the next visit.
    }
  }

  public AbrirOtobo(): void {
    if (this.ticketId === '' || this.ticketId === '0') {
      Toast('Este chamado não tem ticket no OTOBO.', { kind: 'info' });
      return;
    }
    Navigate(
      'https://otobo.prefeitura.local/otobo/index.pl?Action=AgentTicketZoom;TicketID=' +
        encodeURIComponent(this.ticketId),
      { newWindow: true },
    );
  }

  public AbrirEquipamento(
    _sender: unknown,
    event: CustomEvent<{ getValue<T>(field: string): T | undefined }>,
  ): void {
    abrirEquipamento(event.detail.getValue<string>('num_equipamento'));
  }

  public async SelecionarReparo(
    _sender: unknown,
    event: CustomEvent<{ getValue<T>(field: string): T | undefined }>,
  ): Promise<void> {
    const reparo = event.detail.getValue<number>('id_reparo');
    if (reparo === undefined) return;
    this.LBLReparo.caption = 'Histórico do reparo #' + reparo;
    try {
      await executar(this.Api.ReparoHistorico, { id: reparo });
    } catch (e) {
      Toast('Erro ao carregar o reparo: ' + erro(e), { kind: 'error' });
    }
  }
}
