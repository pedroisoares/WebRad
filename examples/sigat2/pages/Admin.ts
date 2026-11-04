import {
  abrirBloqueados,
  buscar,
  sair,
  preencherCabecalho,
  abrir,
  type CelulaDoCadastro,
  destacarLinhas,
  erro,
  gravar,
  linhas,
  numero,
  sim,
  texto,
  executar,
} from '../units/Sigat2';
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
  /** The tabs loaded so far; each list is read the first time its tab opens. */
  private readonly abertas = new Set<number>();

  public async Mostrar(): Promise<void> {
    preencherCabecalho(this);
    if (!this.carregado) {
      this.carregado = true;
      for (const grade of [
        this.GRDEventos,
        this.GRDUsuarios,
        this.GRDModelos,
        this.GRDLocais,
        this.GRDSecretarias,
        this.GRDServicos,
        this.GRDBancadas,
        this.GRDFilas,
        this.GRDTelefones,
      ])
        destacarLinhas(grade);
      // SIGAT orders the log by ID, newest first.
      this.GRDEventos.sortBy('id_evento', 'desc');
    }
    await this.CarregarAba(this.Abas.selectedIndex);
    this.TMREventos.Start();
  }

  public Ocultar(): void {
    this.TMREventos.Stop();
  }

  public async TrocarAba(): Promise<void> {
    await this.CarregarAba(this.Abas.selectedIndex);
  }

  private async CarregarAba(indice: number): Promise<void> {
    // The log is read again whenever its tab opens; the other lists once.
    if (indice !== 0 && this.abertas.has(indice)) return;
    this.abertas.add(indice);
    try {
      switch (indice) {
        case 0:
          await this.Api.Eventos.execute();
          break;
        case 2:
          await this.Api.Modelos.execute();
          break;
        case 3:
          await this.Api.Locais.execute();
          break;
        case 4:
          await this.Api.Secretarias.execute();
          break;
        case 5:
          await this.Api.Servicos.execute();
          break;
        case 6:
          await this.Api.Bancadas.execute();
          break;
        case 7:
          await this.Api.Filas.execute();
          break;
        // Usuários pages on the server and loads itself.
        default:
          break;
      }
    } catch (e) {
      this.abertas.delete(indice);
      Toast('Erro ao carregar a lista: ' + erro(e), { kind: 'error' });
    }
  }

  /** SIGAT reloads the log every 30 seconds and keeps the page, sort and filters. */
  public async AtualizarEventos(): Promise<void> {
    if (this.Abas.selectedIndex !== 0) return;
    try {
      await this.Api.Eventos.execute();
    } catch {
      // The next tick tries again; the list keeps the last events read.
    }
  }

  public AbrirUsuario(
    _sender: unknown,
    event: CustomEvent<{ getValue<T>(field: string): T | undefined }>,
  ): void {
    abrir('Usuario', 'usuario', event.detail.getValue<number>('id_usuario'));
  }

  // ---- cadastros: Bancadas, Secretarias e Filas

  /** The record open in each form; null while the form adds a new one. */
  private bancada: number | null = null;
  private secretaria: number | null = null;
  private fila: number | null = null;

  /** The row of a click on the pencil column, or undefined for a click on another cell. */
  private Linha(event: CustomEvent<CelulaDoCadastro>): CelulaDoCadastro | undefined {
    return event.detail.column.cellKind === 'button' ? event.detail : undefined;
  }

  /**
   * Saves a form. A refusal (empty or repeated name, fila with open chamados) keeps the
   * form open with the HexAPI message; a success closes it and reads the list again.
   */
  private async Salvar(
    botao: { enabled: boolean },
    janela: { hide(): void },
    gravacao: () => Promise<unknown>,
    sucesso: string,
    lista: { execute(): Promise<unknown> },
  ): Promise<void> {
    botao.enabled = false;
    try {
      await gravacao();
    } catch (e) {
      Toast(erro(e), { kind: 'warning' });
      return;
    } finally {
      botao.enabled = true;
    }
    janela.hide();
    Toast(sucesso, { kind: 'success' });
    try {
      await lista.execute();
    } catch (e) {
      Toast('Erro ao carregar a lista: ' + erro(e), { kind: 'error' });
    }
  }

  // ---- cadastros: Modelos de Mensagem, Locais (com telefones) e Serviços

  private modelo: number | null = null;
  private local: number | null = null;
  private telefone: number | null = null;
  private servico: number | null = null;
  /** Filas and active secretarias for the form combos, read on first use. */
  private filas: Readonly<Record<string, unknown>>[] | null = null;
  private secretarias: Readonly<Record<string, unknown>>[] | null = null;

  private async Filas(atual: number | null): Promise<{ value: string; label: string }[]> {
    this.filas ??= linhas(await this.Api.FilasLista.execute());
    return this.filas
      .filter((f) => texto(f.status_fila, '') === 'ATIVO' || numero(f.id_fila) === atual)
      .map((f) => ({ value: texto(f.id_fila, ''), label: texto(f.nome_fila) }));
  }

  /** Fills a combo and selects the record's value, or nothing for a new record. */
  private Escolher(
    combo: {
      items: readonly (string | { value: string; label: string })[];
      value: string;
      selectedIndex: number;
    },
    itens: readonly { value: string; label: string }[],
    valor: string,
  ): void {
    combo.items = itens;
    if (itens.some((i) => i.value === valor)) combo.value = valor;
    else combo.selectedIndex = -1;
  }

  private async Abrir(janela: { show(): void }, preparar: () => Promise<void>): Promise<void> {
    try {
      await preparar();
    } catch (e) {
      Toast('Erro ao abrir o formulário: ' + erro(e), { kind: 'error' });
      return;
    }
    janela.show();
  }

  private static readonly TIPOS = [
    { value: 'ATENDIMENTO', label: 'Atendimento' },
    { value: 'OBSERVACAO', label: 'Observação' },
    { value: 'INSERVIVEL', label: 'Inservível' },
    { value: 'ALT_FILA', label: 'Alteração de fila' },
    { value: 'REM_ESPERA', label: 'Remover da espera' },
    { value: 'ESPERA', label: 'Deixar em espera' },
  ];

  private async FormularioModelo(id: number | null, linha?: CelulaDoCadastro): Promise<void> {
    await this.Abrir(this.POPModelo, async () => {
      const fila = numero(linha?.getValue('fila_modelo_mensagem'));
      this.Escolher(
        this.CMBModeloTipo,
        Admin.TIPOS,
        texto(linha?.getValue('tipo_modelo_mensagem'), ''),
      );
      this.Escolher(this.CMBModeloFila, await this.Filas(fila), fila === null ? '' : String(fila));
      this.modelo = id;
      this.LBLModeloTitulo.caption =
        id === null ? 'Novo modelo de mensagem' : 'Editar modelo #' + String(id);
      this.TXAModeloTexto.value = texto(linha?.getValue('mensagem_modelo_mensagem'), '');
      this.CHKModeloAtivo.checked = id === null || sim(linha?.getValue('status_modelo_mensagem'));
      this.CHKModeloAtivo.enabled = id !== null;
    });
  }

  public async NovoModelo(): Promise<void> {
    await this.FormularioModelo(null);
  }

  public async EditarModelo(_sender: unknown, event: CustomEvent<CelulaDoCadastro>): Promise<void> {
    const linha = this.Linha(event);
    const id = numero(linha?.getValue('id_modelo_mensagem'));
    if (linha !== undefined && id !== null) await this.FormularioModelo(id, linha);
  }

  public CancelarModelo(): void {
    this.POPModelo.hide();
  }

  public async SalvarModelo(): Promise<void> {
    const mensagem = this.TXAModeloTexto.value.trim();
    const tipo = this.CMBModeloTipo.value;
    const fila = numero(this.CMBModeloFila.value);
    const falta =
      tipo === ''
        ? 'Escolha o tipo do modelo.'
        : fila === null || this.CMBModeloFila.value === ''
          ? 'Escolha a fila do modelo.'
          : mensagem === ''
            ? 'Informe o texto do modelo.'
            : '';
    if (falta !== '' || fila === null) {
      Toast(falta, { kind: 'warning' });
      return;
    }
    const id = this.modelo;
    await this.Salvar(
      this.BTNSalvarModelo,
      this.POPModelo,
      () =>
        id === null
          ? gravar(this.Api.ModeloInserir, { mensagem, tipo, id_fila: fila })
          : gravar(this.Api.ModeloAlterar, {
              id_modelo_mensagem: id,
              mensagem,
              tipo,
              id_fila: fila,
              ativo: this.CHKModeloAtivo.checked,
            }),
      id === null ? 'Modelo incluído.' : 'Modelo alterado.',
      this.Api.Modelos,
    );
  }

  private static readonly REGIOES = ['INTERNA', 'CENTRO', 'NORTE', 'SUL', 'LESTE', 'OESTE'];

  private async FormularioLocal(id: number | null, linha?: CelulaDoCadastro): Promise<void> {
    await this.Abrir(this.POPLocal, async () => {
      this.secretarias ??= linhas(await executar(this.Api.SecretariasAtivas, { ativas: true }));
      const secretaria = texto(linha?.getValue('id_secretaria'), '');
      const itens = this.secretarias.map((s) => ({
        value: texto(s.id_secretaria, ''),
        label: texto(s.sigla_secretaria) + ' - ' + texto(s.nome_secretaria),
      }));
      // A local keeps its secretaria even after the secretaria was switched off.
      if (secretaria !== '' && !itens.some((i) => i.value === secretaria))
        itens.push({
          value: secretaria,
          label:
            texto(linha?.getValue('sigla_secretaria')) +
            ' - ' +
            texto(linha?.getValue('nome_secretaria')) +
            ' (inativa)',
        });
      this.Escolher(this.CMBLocalSecretaria, itens, secretaria);
      const regiao = texto(linha?.getValue('regiao_local'), '');
      const regioes = Admin.REGIOES.map((r) => ({ value: r, label: r }));
      // Old locais may hold N/A; it stays valid for them only.
      if (regiao !== '' && !Admin.REGIOES.includes(regiao))
        regioes.push({ value: regiao, label: regiao });
      this.Escolher(this.CMBLocalRegiao, regioes, regiao);
      this.local = id;
      this.LBLLocalTitulo.caption = id === null ? 'Novo local' : 'Editar local #' + String(id);
      this.EDTLocalNome.value = texto(linha?.getValue('nome_local'), '');
      this.EDTLocalEndereco.value = texto(linha?.getValue('endereco_local'), '');
      this.CHKLocalInfovia.checked = id === null || sim(linha?.getValue('infovia'));
      this.CHKLocalAtivo.checked = id === null || sim(linha?.getValue('status_local'));
      this.CHKLocalAtivo.enabled = id !== null;
    });
  }

  public async NovoLocal(): Promise<void> {
    await this.FormularioLocal(null);
  }

  /** The pencil edits the local, the phone opens its telefones, any other cell opens its page. */
  public async EditarLocal(_sender: unknown, event: CustomEvent<CelulaDoCadastro>): Promise<void> {
    const id = numero(event.detail.getValue('id_local'));
    if (id === null) return;
    const linha = this.Linha(event);
    if (linha === undefined) abrir('Local', 'local', id);
    else if (linha.column.header === 'Telefones')
      await this.Telefones(id, texto(linha.getValue('nome_local')));
    else await this.FormularioLocal(id, linha);
  }

  public CancelarLocal(): void {
    this.POPLocal.hide();
  }

  public async SalvarLocal(): Promise<void> {
    const nome = this.EDTLocalNome.value.trim();
    const secretaria = numero(this.CMBLocalSecretaria.value);
    const regiao = this.CMBLocalRegiao.value;
    const falta =
      nome === ''
        ? 'Informe o nome do local.'
        : secretaria === null || this.CMBLocalSecretaria.value === ''
          ? 'Escolha a secretaria do local.'
          : regiao === ''
            ? 'Escolha a região do local.'
            : '';
    if (falta !== '' || secretaria === null) {
      Toast(falta, { kind: 'warning' });
      return;
    }
    const comum = {
      nome_local: nome,
      endereco_local: this.EDTLocalEndereco.value.trim(),
      id_secretaria: secretaria,
      regiao_local: regiao,
      infovia: this.CHKLocalInfovia.checked,
    };
    const id = this.local;
    await this.Salvar(
      this.BTNSalvarLocal,
      this.POPLocal,
      () =>
        id === null
          ? gravar(this.Api.LocalInserir, comum)
          : gravar(this.Api.LocalAlterar, {
              ...comum,
              id_local: id,
              ativo: this.CHKLocalAtivo.checked,
            }),
      id === null ? 'Local incluído.' : 'Local alterado.',
      this.Api.Locais,
    );
  }

  // Telefones: the list of the local over one form that adds or edits a telefone.

  private async Telefones(local: number, nome: string): Promise<void> {
    await this.Abrir(this.POPTelefone, async () => {
      await executar(this.Api.Telefones, { id: local });
      this.local = local;
      this.LBLTelefoneTitulo.caption = 'Telefones de ' + nome;
      this.NovoTelefone();
    });
  }

  public NovoTelefone(): void {
    this.telefone = null;
    this.EDTTelefoneSetor.value = '';
    this.EDTTelefoneNumero.value = '';
    this.BTNSalvarTelefone.caption = 'Adicionar';
    this.BTNExcluirTelefone.visible = false;
    this.BTNNovoTelefone.visible = false;
  }

  public EditarTelefone(_sender: unknown, event: CustomEvent<CelulaDoCadastro>): void {
    const linha = this.Linha(event);
    const id = numero(linha?.getValue('id'));
    if (linha === undefined || id === null) return;
    this.telefone = id;
    this.EDTTelefoneSetor.value = texto(linha.getValue('setor'), '');
    this.EDTTelefoneNumero.value = texto(linha.getValue('telefone'), '');
    this.BTNSalvarTelefone.caption = 'Salvar';
    this.BTNExcluirTelefone.visible = true;
    this.BTNNovoTelefone.visible = true;
  }

  public CancelarTelefone(): void {
    this.POPTelefone.hide();
  }

  /** Writes a telefone change and reads the list again; the window stays open. */
  private async GravarTelefone(gravacao: () => Promise<unknown>, sucesso: string): Promise<void> {
    const botoes = [this.BTNSalvarTelefone, this.BTNExcluirTelefone];
    for (const botao of botoes) botao.enabled = false;
    try {
      await gravacao();
      Toast(sucesso, { kind: 'success' });
      this.NovoTelefone();
    } catch (e) {
      Toast(erro(e), { kind: 'warning' });
    } finally {
      for (const botao of botoes) botao.enabled = true;
    }
    try {
      await this.Api.Telefones.execute();
    } catch (e) {
      Toast('Erro ao carregar os telefones: ' + erro(e), { kind: 'error' });
    }
  }

  public async SalvarTelefone(): Promise<void> {
    const setor = this.EDTTelefoneSetor.value.trim();
    const telefone = this.EDTTelefoneNumero.value.trim();
    if (setor === '' || telefone === '') {
      Toast(setor === '' ? 'Informe o setor do telefone.' : 'Informe o telefone.', {
        kind: 'warning',
      });
      return;
    }
    const id = this.telefone;
    const local = this.local;
    if (id === null && local === null) return;
    await this.GravarTelefone(
      () =>
        id === null
          ? gravar(this.Api.TelefoneInserir, { id_local: local ?? 0, setor, telefone })
          : gravar(this.Api.TelefoneAlterar, { id, setor, telefone }),
      id === null ? 'Telefone incluído.' : 'Telefone alterado.',
    );
  }

  public async ExcluirTelefone(): Promise<void> {
    const id = this.telefone;
    if (id === null) return;
    await this.GravarTelefone(() => gravar(this.Api.TelefoneExcluir, { id }), 'Telefone excluído.');
  }

  private async FormularioServico(id: number | null, linha?: CelulaDoCadastro): Promise<void> {
    await this.Abrir(this.POPServico, async () => {
      const fila = numero(linha?.getValue('id_fila_servico'));
      this.Escolher(this.CMBServicoFila, await this.Filas(fila), fila === null ? '' : String(fila));
      this.Escolher(
        this.CMBServicoPontuacao,
        ['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n })),
        texto(linha?.getValue('pontuacao_servico'), ''),
      );
      this.servico = id;
      this.LBLServicoTitulo.caption =
        id === null ? 'Novo serviço' : 'Editar serviço #' + String(id);
      this.EDTServicoNome.value = texto(linha?.getValue('nome_servico'), '');
      this.EDTServicoUnidade.value = texto(linha?.getValue('unidade_medida'), 'UN');
      this.EDTServicoValor.value = texto(linha?.getValue('valor_servico'), '0');
      this.CHKServicoAtivo.checked = id === null || sim(linha?.getValue('status_servico'));
      this.CHKServicoAtivo.enabled = id !== null;
    });
  }

  public async NovoServico(): Promise<void> {
    await this.FormularioServico(null);
  }

  public async EditarServico(
    _sender: unknown,
    event: CustomEvent<CelulaDoCadastro>,
  ): Promise<void> {
    const linha = this.Linha(event);
    const id = numero(linha?.getValue('id_servico'));
    if (linha !== undefined && id !== null) await this.FormularioServico(id, linha);
  }

  public CancelarServico(): void {
    this.POPServico.hide();
  }

  public async SalvarServico(): Promise<void> {
    const nome = this.EDTServicoNome.value.trim();
    const fila = numero(this.CMBServicoFila.value);
    const unidade = this.EDTServicoUnidade.value.trim().toUpperCase();
    const pontuacao = numero(this.CMBServicoPontuacao.value);
    // SIGAT asks for a dot; a comma is accepted here too.
    const valorTexto = this.EDTServicoValor.value.trim().replace(',', '.');
    const valor = /^\d+(\.\d{1,2})?$/.test(valorTexto) ? Number(valorTexto) : null;
    const falta =
      nome === ''
        ? 'Informe o nome do serviço.'
        : fila === null || this.CMBServicoFila.value === ''
          ? 'Escolha a fila do serviço.'
          : unidade.length < 1 || unidade.length > 3
            ? 'A unidade de medida deve ter de 1 a 3 caracteres.'
            : pontuacao === null || this.CMBServicoPontuacao.value === ''
              ? 'Escolha a complexidade, de 1 a 5.'
              : valor === null
                ? 'Informe o valor unitário, como 99.99.'
                : '';
    if (falta !== '' || fila === null || pontuacao === null || valor === null) {
      Toast(falta, { kind: 'warning' });
      return;
    }
    const comum = { nome_servico: nome, id_fila: fila, unidade_medida: unidade, pontuacao, valor };
    const id = this.servico;
    await this.Salvar(
      this.BTNSalvarServico,
      this.POPServico,
      () =>
        id === null
          ? gravar(this.Api.ServicoInserir, comum)
          : gravar(this.Api.ServicoAlterar, {
              ...comum,
              id_servico: id,
              ativo: this.CHKServicoAtivo.checked,
            }),
      id === null ? 'Serviço incluído.' : 'Serviço alterado.',
      this.Api.Servicos,
    );
  }

  public NovoBancada(): void {
    this.bancada = null;
    this.LBLBancadaTitulo.caption = 'Nova bancada';
    this.EDTBancadaNome.value = '';
    // A new record is always active (and a new bancada free), as the SIGAT insert row shows.
    this.CHKBancadaAtiva.checked = true;
    this.CHKBancadaOcupada.checked = false;
    this.CHKBancadaAtiva.enabled = false;
    this.CHKBancadaOcupada.enabled = false;
    this.POPBancada.show();
  }

  public EditarBancada(_sender: unknown, event: CustomEvent<CelulaDoCadastro>): void {
    const linha = this.Linha(event);
    const id = numero(linha?.getValue('id_bancada'));
    if (linha === undefined || id === null) return;
    this.bancada = id;
    this.LBLBancadaTitulo.caption = 'Editar bancada #' + String(id);
    this.EDTBancadaNome.value = texto(linha.getValue('nome_bancada'), '');
    this.CHKBancadaAtiva.checked = sim(linha.getValue('status_bancada'));
    this.CHKBancadaOcupada.checked = sim(linha.getValue('ocupado_bancada'));
    this.CHKBancadaAtiva.enabled = true;
    this.CHKBancadaOcupada.enabled = true;
    this.POPBancada.show();
  }

  public CancelarBancada(): void {
    this.POPBancada.hide();
  }

  public async SalvarBancada(): Promise<void> {
    const nome = this.EDTBancadaNome.value.trim();
    if (nome === '') {
      Toast('Informe a identificação da bancada.', { kind: 'warning' });
      return;
    }
    const id = this.bancada;
    await this.Salvar(
      this.BTNSalvarBancada,
      this.POPBancada,
      () =>
        id === null
          ? gravar(this.Api.BancadaInserir, { nome_bancada: nome })
          : gravar(this.Api.BancadaAlterar, {
              id_bancada: id,
              nome_bancada: nome,
              status_bancada: this.CHKBancadaAtiva.checked,
              ocupado_bancada: this.CHKBancadaOcupada.checked,
            }),
      id === null ? 'Bancada incluída.' : 'Bancada alterada.',
      this.Api.Bancadas,
    );
  }

  public NovoSecretaria(): void {
    this.secretaria = null;
    this.LBLSecretariaTitulo.caption = 'Nova secretaria';
    this.EDTSecretariaSigla.value = '';
    this.EDTSecretariaNome.value = '';
    this.CHKSecretariaAtiva.checked = true;
    this.CHKSecretariaAtiva.enabled = false;
    this.POPSecretaria.show();
  }

  public EditarSecretaria(_sender: unknown, event: CustomEvent<CelulaDoCadastro>): void {
    const linha = this.Linha(event);
    const id = numero(linha?.getValue('id_secretaria'));
    if (linha === undefined || id === null) return;
    this.secretaria = id;
    this.LBLSecretariaTitulo.caption = 'Editar secretaria #' + String(id);
    this.EDTSecretariaSigla.value = texto(linha.getValue('sigla_secretaria'), '');
    this.EDTSecretariaNome.value = texto(linha.getValue('nome_secretaria'), '');
    this.CHKSecretariaAtiva.checked = sim(linha.getValue('status_secretaria'));
    this.CHKSecretariaAtiva.enabled = true;
    this.POPSecretaria.show();
  }

  public CancelarSecretaria(): void {
    this.POPSecretaria.hide();
  }

  public async SalvarSecretaria(): Promise<void> {
    const sigla = this.EDTSecretariaSigla.value.trim();
    const nome = this.EDTSecretariaNome.value.trim();
    if (sigla === '' || nome === '') {
      Toast(sigla === '' ? 'Informe a sigla da secretaria.' : 'Informe o nome da secretaria.', {
        kind: 'warning',
      });
      return;
    }
    const id = this.secretaria;
    this.secretarias = null;
    await this.Salvar(
      this.BTNSalvarSecretaria,
      this.POPSecretaria,
      () =>
        id === null
          ? gravar(this.Api.SecretariaInserir, { nome_secretaria: nome, sigla_secretaria: sigla })
          : gravar(this.Api.SecretariaAlterar, {
              id_secretaria: id,
              nome_secretaria: nome,
              sigla_secretaria: sigla,
              status_secretaria: this.CHKSecretariaAtiva.checked,
            }),
      id === null ? 'Secretaria incluída.' : 'Secretaria alterada.',
      this.Api.Secretarias,
    );
  }

  public NovoFila(): void {
    this.fila = null;
    this.LBLFilaTitulo.caption = 'Nova fila';
    this.EDTFilaNome.value = '';
    this.EDTFilaIcone.value = '';
    this.CHKFilaAtiva.checked = true;
    this.CHKFilaAtiva.enabled = false;
    this.POPFila.show();
  }

  public EditarFila(_sender: unknown, event: CustomEvent<CelulaDoCadastro>): void {
    const linha = this.Linha(event);
    const id = numero(linha?.getValue('id_fila'));
    if (linha === undefined || id === null) return;
    this.fila = id;
    this.LBLFilaTitulo.caption = 'Editar fila #' + String(id);
    this.EDTFilaNome.value = texto(linha.getValue('nome_fila'), '');
    this.EDTFilaIcone.value = texto(linha.getValue('icone_fila'), '');
    this.CHKFilaAtiva.checked = texto(linha.getValue('status_fila'), '') === 'ATIVO';
    this.CHKFilaAtiva.enabled = true;
    this.POPFila.show();
  }

  public CancelarFila(): void {
    this.POPFila.hide();
  }

  public async SalvarFila(): Promise<void> {
    const nome = this.EDTFilaNome.value.trim();
    if (nome === '') {
      Toast('Informe o nome da fila.', { kind: 'warning' });
      return;
    }
    const icone = this.EDTFilaIcone.value.trim();
    const id = this.fila;
    this.filas = null;
    await this.Salvar(
      this.BTNSalvarFila,
      this.POPFila,
      () =>
        id === null
          ? gravar(this.Api.FilaInserir, { nome_fila: nome, icone_fila: icone })
          : gravar(this.Api.FilaAlterar, {
              id_fila: id,
              nome_fila: nome,
              icone_fila: icone,
              ativa: this.CHKFilaAtiva.checked,
            }),
      id === null ? 'Fila incluída.' : 'Fila alterada.',
      this.Api.Filas,
    );
  }
}
