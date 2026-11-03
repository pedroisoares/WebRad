import {
  abrirBloqueados,
  buscar,
  sair,
  preencherCabecalho,
  abrir,
  abrirEquipamento,
  contexto,
  erro,
  formaDaFila,
  gravar,
  imprimirChamado,
  imprimirRelatorio,
  linhas,
  mostrarComunicacao,
  mostrarHistorico,
  mostrarInteracoesDoChamado,
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

  public MostrarBloqueados(): void {
    abrirBloqueados();
  }

  private ticketId = '';
  private chamado: Linha | undefined;
  private equipamentos: Linha[] = [];
  private servicos: Linha[] = [];
  private interacoes: Linha[] = [];
  private historico: Linha[] = [];
  private termos: Linha[] = [];
  private reparos: Linha[] = [];
  private filas: Linha[] = [];
  private usuarios: Linha[] = [];
  private editando = false;
  private gravandoPrioridade = false;

  public async Mostrar(): Promise<void> {
    preencherCabecalho(this);
    this.ACPLocal.bindOperation(this.Api, 'Locais', {
      listPath: '/data',
      displayField: '/nome_local',
      keyField: '/id_local',
      detailField: '/regiao_local',
      searchParameter: 'q',
      limitParameter: '',
    });
    this.POPLocal.hide();
    this.GRPRegistrar.visible = false;
    await this.Carregar();
  }

  private MostrarCampos(c: Linha | undefined): void {
    this.EDTResumo.value = texto(c?.resumo_chamado, '');
    this.EDTStatus.value = texto(c?.status_chamado, '');
    this.EDTFila.value = texto(c?.nome_fila_chamado, '');
    this.EDTAbertura.value = texto(c?.data_chamado, '');
    this.EDTSolicitante.value = texto(c?.nome_solicitante_chamado, '');
    this.EDTCelular.value = texto(c?.celular_chamado, '');
    this.EDTTelefone.value = texto(c?.telefone_chamado, '');
    this.EDTLocal.value = texto(c?.nome_local, '');
    this.EDTRegiao.value = texto(c?.regiao_local, '');
    this.EDTComplemento.value = texto(c?.complemento_chamado, '');
    const responsavel = texto(c?.id_responsavel, '');
    this.CMBResponsavel.items =
      responsavel === ''
        ? [{ value: '', label: '' }]
        : [{ value: responsavel, label: texto(c?.nome_responsavel) }];
    this.CMBResponsavel.value = responsavel;
  }

  /** Read-only like the SIGAT form until Editar; Salvar and Cancelar only while editing. */
  private ModoEdicao(editando: boolean): void {
    this.editando = editando;
    for (const campo of [
      this.EDTResumo,
      this.EDTStatus,
      this.EDTFila,
      this.EDTAbertura,
      this.EDTRegiao,
      this.EDTComplemento,
    ])
      campo.enabled = false;
    for (const campo of [this.EDTSolicitante, this.EDTCelular, this.EDTTelefone]) {
      campo.enabled = editando;
      campo.clearValidation();
    }
    this.CMBResponsavel.enabled = editando && this.Nivel() >= 3;
    this.EDTLocal.visible = !editando;
    this.EDTLocal.enabled = false;
    this.ACPLocal.visible = editando;
    this.BTNSalvar.visible = editando;
    this.BTNCancelar.visible = editando;
    this.MostrarAcoes(this.chamado);
  }

  private Nivel(): number {
    return numero(Access.user?.data?.autorizacao_usuario) ?? 0;
  }

  public async Carregar(): Promise<void> {
    const id = Number(contexto('chamado'));
    this.editando = false;
    if (!Number.isInteger(id) || id <= 0) {
      this.LBLTicket.caption = 'Nenhum chamado selecionado';
      this.LBLTrilhaNumero.caption = '';
      this.MostrarCabecalho(undefined);
      return;
    }
    this.LBLTrilhaNumero.caption = '#' + id;
    this.LBLNumero.caption = '(#' + id + ')';
    const parametros = { id };
    try {
      const c = primeira(await executar(this.Api.Detalhe, parametros));
      this.chamado = c;
      this.MostrarCabecalho(c);
      this.MostrarCampos(c);
      this.ModoEdicao(false);
      if (c === undefined) {
        this.LBLTicket.caption = 'Chamado #' + id + ' não encontrado';
        return;
      }
      this.ticketId = texto(c.id_ticket_chamado, '');
      const naoLidos = numero(c.email_nao_lido_chamado) ?? 0;
      await Promise.all([
        executar(this.Api.Interacoes, parametros).then((r) => {
          this.interacoes = linhas(r);
          mostrarInteracoesDoChamado(this.HTMLInteracoes, this.interacoes);
        }),
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
        executar(this.Api.Reparos, parametros).then((r) => {
          this.reparos = linhas(r);
        }),
        executar(this.Api.Historico, parametros).then((r) => {
          this.historico = linhas(r);
          mostrarHistorico(this.HTMLHistorico, this.historico);
        }),
        executar(this.Api.Anexos, parametros).then((r) => {
          const comAnexos = linhas(r).length > 0;
          this.LBLAnexos.visible = comAnexos;
          this.GRDAnexos.visible = comAnexos;
        }),
        executar(this.Api.Termos, parametros).then((r) => {
          this.termos = linhas(r);
          this.LBLTermos.visible = this.termos.length > 0;
          this.GRDTermos.visible = this.termos.length > 0;
        }),
        Number(this.ticketId) > 0
          ? executar(this.Api.Artigos, { id: Number(this.ticketId) }).then((r) =>
              mostrarComunicacao(this.HTMLEmails, linhas(r), naoLidos),
            )
          : Promise.resolve(mostrarComunicacao(this.HTMLEmails, [], 0)),
      ]);
      this.MostrarRegistro();
    } catch (e) {
      Toast('Erro ao carregar o chamado: ' + erro(e), { kind: 'error' });
    }
  }

  /** Title, queue icon, priority star, unread badge and the infovia warning of ver_chamado.php. */
  private MostrarCabecalho(c: Linha | undefined): void {
    this.LBLTicket.caption = c === undefined ? this.LBLTicket.caption : texto(c.ticket_chamado);
    this.ICOFila.icon = formaDaFila(c?.icone_fila) as typeof this.ICOFila.icon;
    this.ICOFila.accessibleLabel = 'Fila ' + texto(c?.nome_fila_chamado, '');
    const prioridade = numero(c?.prioridade_chamado) === 1;
    this.ICOPrioridade.visible = prioridade;
    this.gravandoPrioridade = true;
    this.CHKPrioridade.checked = prioridade;
    this.gravandoPrioridade = false;
    this.CHKPrioridade.visible = c !== undefined && this.Nivel() > 3;
    this.BTNRelatorio.visible = c !== undefined && this.Nivel() > 3;
    this.BTNImprimir.visible = c !== undefined;
    this.BTNOtobo.visible = Number(texto(c?.id_ticket_chamado, '0')) > 0;
    this.LBLInfovia.visible = c !== undefined && numero(c.infovia) === 0;
    const naoLidos = numero(c?.email_nao_lido_chamado) ?? 0;
    this.Abas.badges = ['', naoLidos > 0 ? String(naoLidos) : ''];
  }

  /** The button rules of chamado.js (carregaChamado); HexAPI enforces them again on every write. */
  private MostrarAcoes(c: Linha | undefined): void {
    const eu = Access.user?.id ?? '';
    const nivel = this.Nivel();
    const responsavel = texto(c?.id_responsavel, '');
    const aberto = texto(c?.status_chamado, '') === 'ABERTO';
    const edicao = this.editando;
    this.BTNBloquear.visible = !edicao && aberto && responsavel === '';
    this.BTNDesbloquear.visible =
      !edicao && aberto && responsavel !== '' && (responsavel === eu || nivel >= 3);
    this.BTNEditar.visible =
      !edicao && aberto && (nivel >= 3 || (responsavel !== '' && responsavel === eu));
  }

  private async Gravar(operacao: Parameters<typeof gravar>[0], sucesso: string): Promise<void> {
    const id = numero(this.chamado?.id_chamado);
    if (id === null) return;
    const botoes = [this.BTNBloquear, this.BTNDesbloquear, this.CHKPrioridade];
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

  /** The Prioridade checkbox toggles chamado.prioridade_chamado (Chamado::priorizar_chamado). */
  public async Priorizar(): Promise<void> {
    if (this.gravandoPrioridade) return;
    const remover = numero(this.chamado?.prioridade_chamado) === 1;
    await this.Gravar(this.Api.Priorizar, remover ? 'Prioridade removida.' : 'Chamado priorizado.');
  }

  // ---- editar (Chamado::alterar_chamado)

  public async Editar(): Promise<void> {
    const c = this.chamado;
    if (c === undefined) return;
    this.ModoEdicao(true);
    this.ACPLocal.selectedItem = {
      value: texto(c.id_local, ''),
      label: texto(c.nome_local, ''),
      detail: texto(c.regiao_local, ''),
    };
    if (this.Nivel() < 3) return;
    try {
      if (this.usuarios.length === 0) this.usuarios = linhas(await this.Api.Usuarios.execute());
      const atual = texto(c.id_responsavel, '');
      this.CMBResponsavel.items = [
        { value: '', label: '' },
        ...this.usuarios.map((u) => ({
          value: texto(u.id_usuario, ''),
          label: texto(u.nome_usuario),
        })),
      ];
      this.CMBResponsavel.value = atual;
    } catch (e) {
      Toast('Erro ao carregar os usuários: ' + erro(e), { kind: 'error' });
    }
  }

  public async Cancelar(): Promise<void> {
    this.ModoEdicao(false);
    this.MostrarCampos(this.chamado);
  }

  /** Same rules as the SIGAT form (jQuery validate); HexAPI checks them again. */
  private Validar(): boolean {
    let valido = true;
    const regra = (campo: typeof this.EDTTelefone, mensagem: string, ok: boolean): void => {
      campo.element.setCustomValidity(ok ? '' : mensagem);
      campo.element.setAttribute('aria-invalid', String(!ok));
      campo.element.title = ok ? '' : mensagem;
      if (!ok && valido) {
        Toast(mensagem, { kind: 'warning' });
        campo.focus();
        valido = false;
      }
    };
    const telefone = this.EDTTelefone.value.trim();
    const celular = this.EDTCelular.value.trim();
    regra(
      this.EDTSolicitante,
      'Solicitante: campo obrigatório!',
      this.EDTSolicitante.value.trim() !== '',
    );
    regra(
      this.EDTTelefone,
      telefone === ''
        ? 'Telefone: campo obrigatório!'
        : 'Telefone: somente dígitos (0-9), mínimo 3 dígitos!',
      /^[0-9]{3,}$/.test(telefone),
    );
    regra(
      this.EDTCelular,
      'Celular: somente dígitos (0-9), mínimo 9 dígitos!',
      celular === '' || /^[0-9]{9,}$/.test(celular),
    );
    if (valido && numero(this.ACPLocal.selectedItem?.value) === null) {
      Toast('Local: escolha um local da lista!', { kind: 'warning' });
      this.ACPLocal.focus();
      valido = false;
    }
    return valido;
  }

  public async Salvar(): Promise<void> {
    const id = numero(this.chamado?.id_chamado);
    if (id === null || !this.Validar()) return;
    const responsavel = numero(this.CMBResponsavel.value);
    this.BTNSalvar.enabled = false;
    this.BTNCancelar.enabled = false;
    try {
      await gravar(this.Api.Alterar, {
        id_chamado: id,
        nome_solicitante: this.EDTSolicitante.value.trim(),
        telefone: this.EDTTelefone.value.trim(),
        celular: this.EDTCelular.value.trim(),
        id_local: numero(this.ACPLocal.selectedItem?.value) ?? 0,
        id_responsavel: this.Nivel() >= 3 && responsavel !== null ? responsavel : null,
      });
      Toast('Chamado alterado.', { kind: 'success' });
      await this.Carregar();
    } catch (e) {
      Toast(erro(e), { kind: 'warning' });
    } finally {
      this.BTNSalvar.enabled = true;
      this.BTNCancelar.enabled = true;
    }
  }

  // ---- local (modal de endereço)

  public async VerEndereco(): Promise<void> {
    const c = this.chamado;
    if (c === undefined) return;
    this.LBLLocalNome.caption = texto(c.nome_local);
    this.LBLLocalEndereco.caption = texto(c.endereco_local, 'Endereço não cadastrado');
    this.POPLocal.show();
    try {
      await executar(this.Api.Telefones, { id: numero(c.id_chamado) ?? 0 });
    } catch (e) {
      Toast('Erro ao carregar os telefones: ' + erro(e), { kind: 'error' });
    }
  }

  public FecharEndereco(): void {
    this.POPLocal.hide();
  }

  public AbrirLocal(): void {
    this.POPLocal.hide();
    abrir('Local', 'local', this.chamado?.id_local);
  }

  /** Like the SIGAT, opening the e-mails clears the unread count for the user who holds the chamado. */
  public async TrocarAba(
    _sender: unknown,
    event: CustomEvent<{ readonly panel: string }>,
  ): Promise<void> {
    const c = this.chamado;
    if (event.detail.panel !== 'PNLComunicacao' || c === undefined) return;
    if (texto(c.id_responsavel, '') !== (Access.user?.id ?? '')) return;
    if ((numero(c.email_nao_lido_chamado) ?? 0) === 0) return;
    const id = numero(c.id_chamado);
    if (id === null) return;
    try {
      await gravar(this.Api.ZerarNaoLidos, { id_chamado: id });
      this.chamado = { ...c, email_nao_lido_chamado: 0 };
      this.Abas.badges = ['', ''];
    } catch {
      // The SIGAT ignores this failure too; the count is cleared on the next visit.
    }
  }

  // ---- impressão

  public Imprimir(): void {
    const c = this.chamado;
    if (c === undefined) return;
    imprimirChamado({
      chamado: c,
      equipamentos: this.equipamentos,
      servicos: this.servicos,
      interacoes: this.interacoes,
    });
  }

  public async Relatorio(): Promise<void> {
    const c = this.chamado;
    if (c === undefined) return;
    this.BTNRelatorio.enabled = false;
    try {
      const reparos = await Promise.all(
        this.reparos.map(async (reparo) => ({
          reparo,
          historico: linhas(
            await executar(this.Api.ReparoHistorico, { id: numero(reparo.id_reparo) ?? 0 }),
          ),
        })),
      );
      imprimirRelatorio({
        chamado: c,
        equipamentos: this.equipamentos,
        servicos: this.servicos,
        interacoes: this.interacoes,
        historico: this.historico,
        termos: this.termos,
        reparos,
        usuario: texto(Access.user?.name, ''),
      });
    } catch (e) {
      Toast('Erro ao montar o relatório: ' + erro(e), { kind: 'error' });
    } finally {
      this.BTNRelatorio.enabled = true;
    }
  }

  // ---- registrar interação (Interacao::registrar_interacao do SIGAT)

  private PodeRegistrar(c: Linha | undefined): boolean {
    return (
      c !== undefined &&
      texto(c.status_chamado, '') === 'ABERTO' &&
      (texto(c.id_responsavel, '') === (Access.user?.id ?? '') || this.Nivel() >= 3)
    );
  }

  public NovaInteracao(): void {
    this.GRPRegistrar.visible = true;
    this.BTNNovaInteracao.visible = false;
  }

  public FecharInteracao(): void {
    this.GRPRegistrar.visible = false;
    this.BTNNovaInteracao.visible = this.PodeRegistrar(this.chamado);
  }

  /** Types offered by the SIGAT form; Atendimento only in queues 5 to 8. */
  private MostrarRegistro(): void {
    const c = this.chamado;
    const pode = this.PodeRegistrar(c);
    this.BTNNovaInteracao.visible = pode && !this.GRPRegistrar.visible;
    if (!pode) this.GRPRegistrar.visible = false;
    this.LBLRegistrar.visible = !pode && texto(c?.status_chamado, '') === 'ABERTO';
    this.LBLRegistrar.caption = 'Para registrar uma interação, bloqueie o chamado.';
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
      this.GRPRegistrar.visible = false;
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
