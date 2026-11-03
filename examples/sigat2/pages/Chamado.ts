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
  mostrarSinaisDoChamado,
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
  private equipamentos: Linha[] = [];
  private servicos: Linha[] = [];
  private filas: Linha[] = [];

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
      mostrarSinaisDoChamado(this.HTMLSinais, c);
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
        executar(this.Api.Equipamentos, parametros).then((r) => {
          this.equipamentos = linhas(r);
        }),
        executar(this.Api.Servicos, parametros).then((r) => {
          this.servicos = linhas(r);
        }),
        this.filas.length > 0
          ? Promise.resolve()
          : this.Api.Filas.execute().then((r) => {
              this.filas = linhas(r);
            }),
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
      this.MostrarRegistro();
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

  // ---- registrar interação (Interacao::registrar_interacao do SIGAT)

  private PodeRegistrar(c: Linha | undefined): boolean {
    const nivel = numero(Access.user?.data?.autorizacao_usuario) ?? 0;
    return (
      c !== undefined &&
      texto(c.status_chamado, '') === 'ABERTO' &&
      (texto(c.id_responsavel, '') === (Access.user?.id ?? '') || nivel >= 3)
    );
  }

  /** Types offered by the SIGAT form; Atendimento only in queues 5 to 8. */
  private MostrarRegistro(): void {
    const c = this.chamado;
    const pode = this.PodeRegistrar(c);
    this.GRPRegistrar.visible = pode;
    this.LBLRegistrar.caption = pode
      ? ''
      : 'Para registrar uma interação, o chamado precisa estar aberto e bloqueado por você (ou você precisa ter autorização 3 ou mais).';
    if (!pode || c === undefined) return;
    const fila = numero(c.id_fila) ?? 0;
    const tipos = [
      ...(fila >= 5 && fila <= 8 ? [{ value: 'ATENDIMENTO', label: 'Atendimento' }] : []),
      { value: 'OBSERVACAO', label: 'Observação' },
      { value: 'ALT_FILA', label: 'Alteração de fila' },
      { value: 'ESPERA', label: 'Deixar em espera' },
      { value: 'REM_ESPERA', label: 'Remover da espera' },
    ];
    const anterior = this.CMBTipo.value;
    this.CMBTipo.items = tipos;
    this.CMBTipo.value = tipos.some((t) => t.value === anterior)
      ? anterior
      : (tipos[0]?.value ?? '');
    this.MudarTipo();
  }

  public MudarTipo(): void {
    const tipo = this.CMBTipo.value;
    const filaAtual = numero(this.chamado?.id_fila);
    this.CMBFila.visible = tipo === 'ALT_FILA';
    this.CMBFila.items = this.filas
      .filter((f) => numero(f.id_fila) !== filaAtual)
      .map((f) => ({ value: texto(f.id_fila, ''), label: texto(f.nome_fila) }));
    const itens: { value: string; label: string }[] = [];
    if (tipo === 'ESPERA' || tipo === 'REM_ESPERA') {
      const status = tipo === 'ESPERA' ? ['ABERTO', 'FALHA'] : ['ESPERA'];
      for (const e of this.equipamentos)
        if (status.includes(texto(e.status_equipamento_chamado, '')))
          itens.push({
            value: 'e:' + texto(e.num_equipamento, ''),
            label:
              'Equipamento ' + texto(e.num_equipamento) + ' - ' + texto(e.descricao_equipamento),
          });
    }
    if (tipo === 'ATENDIMENTO' || tipo === 'ESPERA' || tipo === 'REM_ESPERA') {
      const status = tipo === 'REM_ESPERA' ? 'ESPERA' : 'ABERTO';
      for (const s of this.servicos)
        if (texto(s.status_servico, '') === status)
          itens.push({
            value: 's:' + texto(s.id, ''),
            label:
              'Serviço ' +
              texto(s.nome_servico) +
              ' (' +
              texto(s.quantidade) +
              ' ' +
              texto(s.unidade_medida) +
              ')',
          });
    }
    const comItens = tipo === 'ATENDIMENTO' || tipo === 'ESPERA' || tipo === 'REM_ESPERA';
    this.LSTItens.visible = comItens && itens.length > 0;
    this.LSTItens.items = itens;
    this.LBLItens.caption = !comItens
      ? ''
      : itens.length === 0
        ? 'Não há equipamentos ou serviços para esta ação.'
        : tipo === 'ATENDIMENTO'
          ? 'Marque os serviços que foram finalizados:'
          : tipo === 'ESPERA'
            ? 'Marque o que será deixado em espera:'
            : 'Marque o que sairá da espera:';
  }

  public async Registrar(): Promise<void> {
    const id = numero(this.chamado?.id_chamado);
    if (id === null) return;
    const selecionados = this.LSTItens.visible ? this.LSTItens.selectedValues : [];
    const equipamentos = selecionados.filter((v) => v.startsWith('e:')).map((v) => v.slice(2));
    const servicos = selecionados.filter((v) => v.startsWith('s:')).map((v) => Number(v.slice(2)));
    const comum = { id_chamado: id, texto: this.RTEInteracao.value };
    const tipo = this.CMBTipo.value;
    this.BTNRegistrar.enabled = false;
    try {
      if (tipo === 'ALT_FILA') {
        const fila = numero(this.CMBFila.value);
        if (fila === null) {
          Toast('Escolha a nova fila.', { kind: 'warning' });
          return;
        }
        await gravar(this.Api.AlterarFila, { ...comum, id_fila: fila });
      } else if (tipo === 'ATENDIMENTO') {
        await gravar(this.Api.Atendimento, { ...comum, servicos });
      } else if (tipo === 'ESPERA') {
        await gravar(this.Api.Espera, { ...comum, equipamentos, servicos });
      } else if (tipo === 'REM_ESPERA') {
        await gravar(this.Api.RemoverEspera, { ...comum, equipamentos, servicos });
      } else {
        await gravar(this.Api.Observacao, comum);
      }
      Toast('Interação registrada.', { kind: 'success' });
      this.RTEInteracao.value = '';
      this.Abas.selectTab('PNLInteracoes');
      await this.Carregar();
    } catch (e) {
      Toast(erro(e), { kind: 'warning' });
    } finally {
      this.BTNRegistrar.enabled = true;
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
