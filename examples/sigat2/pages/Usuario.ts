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
import { UsuarioGenerated } from './Usuario.generated';

export class Usuario extends UsuarioGenerated {
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
    const id = Number(contexto('usuario'));
    if (!Number.isInteger(id) || id <= 0) {
      this.LBLUsuarioNome.caption = 'Nenhum usuário selecionado';
      return;
    }
    try {
      const [perfil] = await Promise.all([
        executar(this.Api.Perfil, { id }),
        executar(this.Api.Produtividade, { id }),
        executar(this.Api.Bloqueados, { id }),
      ]);
      const u = primeira(perfil);
      this.LBLUsuarioNome.caption = texto(u?.nome_usuario, 'Usuário #' + id);
      this.Login.caption = texto(u?.login_usuario);
      this.Autorizacao.caption = texto(u?.autorizacao);
      this.Permissoes.caption =
        [
          sim(u?.triagem_usuario) ? 'triagem' : '',
          sim(u?.encerramento_usuario) ? 'encerramento' : '',
          sim(u?.inservivel_usuario) ? 'inservíveis' : '',
          sim(u?.status_usuario) ? '' : 'INATIVO',
        ]
          .filter((p) => p !== '')
          .join(', ') || '-';
      this.Interacoes.caption = texto(u?.total_interacoes, '0');
      this.UltimoEvento.caption = texto(u?.ultimo_evento);
    } catch (e) {
      Toast('Erro ao carregar o usuário: ' + erro(e), { kind: 'error' });
    }
  }

  public Voltar(): void {
    Navigate('Admin');
  }

  public AbrirChamado(
    _sender: unknown,
    event: CustomEvent<{ getValue<T>(field: string): T | undefined }>,
  ): void {
    abrirChamado(event.detail.getValue<number>('id_chamado'));
  }
}
