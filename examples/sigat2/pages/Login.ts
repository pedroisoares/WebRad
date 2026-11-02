import { erro, papeisDoUsuario, primeira, texto } from '../units/Sigat2';
import { LoginGenerated } from './Login.generated';

export class Login extends LoginGenerated {
  public Mostrar(): void {
    this.LBLMensagem.caption = '';
    if (Access.isAuthenticated) Navigate('index');
  }

  public async SenhaTecla(_sender: unknown, event: KeyboardEvent): Promise<void> {
    if (event.key === 'Enter') await this.Entrar();
  }

  public async Entrar(): Promise<void> {
    const login = this.EDTLogin.value.trim();
    if (login === '' || this.EDTSenha.value === '') {
      this.LBLMensagem.caption = 'Informe usuário e senha.';
      return;
    }
    this.BTNEntrar.enabled = false;
    this.LBLMensagem.caption = 'Entrando...';
    try {
      const resultado = await RestGO.login(login, this.EDTSenha.value);
      if (!resultado.sucess) {
        this.LBLMensagem.caption = resultado.error.message;
        return;
      }
      const usuario = primeira(await this.ApiSessao.SessaoUsuario.execute());
      if (usuario === undefined) {
        this.LBLMensagem.caption = 'Usuário não encontrado ou inativo no SIGAT.';
        return;
      }
      Access.setUser({
        id: texto(usuario.id_usuario),
        name: texto(usuario.nome_usuario),
        roles: papeisDoUsuario(usuario),
        data: usuario,
      });
      this.EDTSenha.value = '';
      Navigate(Access.lastDenied?.page ?? 'index');
    } catch (e) {
      this.LBLMensagem.caption = 'Falha ao entrar: ' + erro(e);
    } finally {
      this.BTNEntrar.enabled = true;
    }
  }
}
