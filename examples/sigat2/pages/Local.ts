import {
  buscar,
  sair,
  preencherCabecalho,
  contexto,
  erro,
  linhas,
  primeira,
  sim,
  texto,
  executar,
} from '../units/Sigat2';
import { LocalGenerated } from './Local.generated';

export class Local extends LocalGenerated {
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
    const id = Number(contexto('local'));
    if (!Number.isInteger(id) || id <= 0) {
      this.LBLLocal.caption = 'Nenhum local selecionado';
      return;
    }
    try {
      const [local, , secretarias] = await Promise.all([
        executar(this.Api.Local, { id }),
        executar(this.Api.Telefones, { id }),
        this.Api.Secretarias.execute(),
      ]);
      const l = primeira(local);
      const secretaria = linhas(secretarias).find(
        (s) => String(s.id_secretaria) === String(l?.secretaria_local),
      );
      this.LBLLocal.caption = texto(l?.nome_local, 'Local #' + id);
      this.Endereco.caption = texto(l?.endereco_local);
      this.Secretaria.caption = texto(secretaria?.sigla_secretaria);
      this.Regiao.caption = texto(l?.regiao_local);
      this.Situacao.caption = sim(l?.status_local) ? 'Ativo' : 'Inativo';
      this.Infovia.caption = sim(l?.infovia) ? 'Sim' : 'Não';
    } catch (e) {
      Toast('Erro ao carregar o local: ' + erro(e), { kind: 'error' });
    }
  }

  public Voltar(): void {
    Navigate('Admin');
  }
}
