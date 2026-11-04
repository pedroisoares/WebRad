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
  numero,
  sim,
  texto,
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
        case 4:
          await this.Api.Secretarias.execute();
          break;
        case 6:
          await this.Api.Bancadas.execute();
          break;
        case 7:
          await this.Api.Filas.execute();
          break;
        // Usuários, Locais and Serviços page on the server and load themselves.
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

  public NovoBancada(): void {
    this.bancada = null;
    this.LBLBancadaTitulo.caption = 'Nova bancada';
    this.EDTBancadaNome.value = '';
    // A new bancada is always active and free.
    this.CHKBancadaAtiva.checked = true;
    this.CHKBancadaOcupada.checked = false;
    this.GRPBancadaMarcas.visible = false;
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
    this.GRPBancadaMarcas.visible = true;
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
    this.CHKSecretariaAtiva.visible = false;
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
    this.CHKSecretariaAtiva.visible = true;
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
    this.CHKFilaAtiva.visible = false;
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
    this.CHKFilaAtiva.visible = true;
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

  public AbrirLocal(
    _sender: unknown,
    event: CustomEvent<{ getValue<T>(field: string): T | undefined }>,
  ): void {
    abrir('Local', 'local', event.detail.getValue<number>('id_local'));
  }
}
