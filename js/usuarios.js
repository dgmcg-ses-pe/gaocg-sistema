/**
 * GAOCG App - Gestão de Usuários (Funcionalidade 9), exclusiva dos perfis
 * gerente e administrador.
 */

const TelaUsuarios = (function () {
  let usuarios = [];
  let mostrarDesativados = false;

  const ICONE_LAPIS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  async function render() {
    if (!Auth.ehGerente()) {
      document.getElementById('conteudo').innerHTML = '<p class="estado-vazio">Acesso restrito ao perfil gerente.</p>';
      return;
    }
    mostrarDesativados = false;
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">Usuários</h2>
      <div class="painel">
        <div class="barra-filtros">
          <label style="align-self:center;font-size:13px;white-space:nowrap"><input type="checkbox" id="chkMostrarDesativados" /> Mostrar usuários desativados</label>
          <span style="flex:1"></span>
          <button class="botao primario" id="btnNovoUsuario">+ Novo usuário</button>
        </div>
        <div id="listaUsuarios"></div>
      </div>`;
    document.getElementById('btnNovoUsuario').addEventListener('click', () => abrirFormulario());
    document.getElementById('chkMostrarDesativados').addEventListener('change', function () {
      mostrarDesativados = this.checked;
      renderTabela();
    });
    await carregar();
  }

  async function carregar() {
    usuarios = await CacheAbas.comRevalidacao('usuarios', {},
      (opcoes) => Api.chamar('listarUsuarios', {}, opcoes),
      (novosUsuarios) => { usuarios = novosUsuarios; renderTabela(); }
    );
    renderTabela();
  }

  /** azul (Gerente) e cinza (Analista) já existiam; roxo é novo, só pro Administrador do Aplicativo. */
  const CORES_PERFIL_ = { administrador: 'roxo', gerente: 'azul' };
  function seloPerfilHtml_(perfil) {
    return `<span class="selo ${CORES_PERFIL_[perfil] || 'cinza'}">${UI.escaparHtml(UI.rotuloPerfil(perfil))}</span>`;
  }

  function renderTabela() {
    const alvo = document.getElementById('listaUsuarios');
    const linhas = mostrarDesativados ? usuarios : usuarios.filter(u => u.ativo);
    if (!linhas.length) {
      alvo.innerHTML = '<p class="estado-vazio">Nenhum usuário para exibir.</p>';
      return;
    }
    alvo.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Ativo</th><th></th></tr></thead>
        <tbody>${linhas.map(u => `
          <tr data-id="${u.id}">
            <td>${UI.escaparHtml(u.nome)}</td>
            <td>${UI.escaparHtml(u.login)}</td>
            <td>${seloPerfilHtml_(u.perfil)}</td>
            <td>${u.ativo ? '<span class="selo verde">Ativo</span>' : '<span class="selo cinza">Inativo</span>'}</td>
            <td class="tabela-acoes">
              <button type="button" class="botao-icone editar" data-acao="editar" title="Editar">${ICONE_LAPIS}</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    alvo.querySelectorAll('tr[data-id]').forEach(tr => {
      const usuario = linhas.find(u => u.id === tr.dataset.id);
      tr.querySelector('[data-acao="editar"]').addEventListener('click', () => abrirFormulario(usuario));
    });
  }

  /**
   * Criação (sessão 2026-08-26, pedido do usuário): só nome completo e
   * perfil (Gerente ou Analista - conceder Administrador continua exclusivo
   * da edição, ver perfilValidado_ em backend/Usuarios.gs). Login e senha
   * não são mais digitados - o backend gera "primeironome.ultimonome" e
   * uma senha temporária aleatória (ver criarUsuario, mesmo arquivo),
   * exibidos pro Gerente/Administrador logo depois de salvar
   * (mostrarCredenciaisGeradas_) pra ele poder repassar pro novo usuário.
   *
   * Edição: nome completo aparece só pra CONSULTA (desabilitado) - como o
   * nome aparece no app é algo que só o próprio dono da conta muda, em "Minha
   * conta" (alterarMeuNome, js/app.js). Aqui só dá pra mexer no perfil.
   */
  function abrirFormulario(usuario) {
    const editando = !!usuario;
    const corpo = editando ? `
      <form id="formUsuario">
        <div class="campo"><label>Nome completo</label><input id="usNome" value="${UI.escaparHtml(usuario.nome)}" disabled /></div>
        <p class="ajuda">Só o próprio usuário pode alterar como o nome dele aparece no aplicativo (em "Minha conta").</p>
        <div class="campo"><label>Login</label><input value="${UI.escaparHtml(usuario.login)}" disabled /></div>
        <div class="campo"><label>Perfil</label>
          <select id="usPerfil">
            <option value="analista" ${usuario.perfil === 'analista' ? 'selected' : ''}>Analista</option>
            <option value="gerente" ${usuario.perfil === 'gerente' ? 'selected' : ''}>Gerente</option>
            ${Auth.ehAdministrador() ? `<option value="administrador" ${usuario.perfil === 'administrador' ? 'selected' : ''}>Administrador do Aplicativo</option>` : ''}
          </select>
          ${!Auth.ehAdministrador() ? '<p class="ajuda">Só um Administrador do Aplicativo pode conceder o perfil de Administrador.</p>' : ''}
        </div>
        <p id="usErro" class="erro-campo oculto"></p>
      </form>` : `
      <form id="formUsuario">
        <div class="campo"><label>Nome completo *</label><input id="usNome" required /></div>
        <div class="campo"><label>Tipo de usuário</label>
          <select id="usPerfil">
            <option value="analista">Analista</option>
            <option value="gerente">Gerente</option>
          </select>
        </div>
        <p id="usErro" class="erro-campo oculto"></p>
      </form>`;
    const rodape = `
      ${editando ? `
        <button class="botao ${usuario.ativo ? 'perigo' : 'sucesso'}" id="btnToggleUsuario">${usuario.ativo ? 'Inativar' : 'Reativar'}</button>
        <button class="botao" id="btnRedefinirSenha">Redefinir senha</button>` : ''}
      <button class="botao" id="btnCancelarUsuario">Cancelar</button>
      <button class="botao primario" id="btnSalvarUsuario">${editando ? 'Salvar' : 'Salvar novo usuário'}</button>`;

    UI.abrirModal(editando ? 'Editar usuário' : 'Novo usuário', corpo, rodape);

    document.getElementById('btnCancelarUsuario').addEventListener('click', UI.fecharModal);

    if (editando) {
      document.getElementById('btnToggleUsuario').addEventListener('click', async () => {
        // reativarUsuario é ação própria, não atualizarUsuario com
        // { ativo: true } - esse endpoint só lida com nome/perfil, então um
        // campo "ativo" ali era ignorado em silêncio e o usuário continuava
        // inativo mesmo com o toast de sucesso (ver reativarUsuario,
        // backend/Usuarios.gs).
        if (usuario.ativo) {
          await Api.chamar('inativarUsuario', { id: usuario.id });
        } else {
          await Api.chamar('reativarUsuario', { id: usuario.id });
        }
        CacheAbas.invalidar('usuarios');
        UI.toast('Usuário atualizado.', 'sucesso');
        UI.fecharModal();
        await carregar();
      });
      document.getElementById('btnRedefinirSenha').addEventListener('click', () => confirmarRedefinirSenha_(usuario));
    }

    document.getElementById('btnSalvarUsuario').addEventListener('click', async () => {
      // Nada mudou (sessão 2026-08-13, pedido do usuário): editando um
      // usuário já existente, só fecha o card em vez de chamar o backend à
      // toa - mesmo dirty-tracking que já decidia minimizar x fechar no
      // clique fora (ver UI.modalFoiEditado, js/app.js).
      if (editando && !UI.modalFoiEditado()) { UI.fecharModal(); return; }
      const erroEl = document.getElementById('usErro');
      erroEl.classList.add('oculto');
      const dados = { perfil: document.getElementById('usPerfil').value };
      if (!editando) {
        dados.nome = document.getElementById('usNome').value.trim();
        if (!dados.nome) { UI.mostrarErro(erroEl, 'Informe o nome completo.'); return; }
      }
      try {
        if (editando) {
          await Api.chamar('atualizarUsuario', { id: usuario.id, data: dados });
          CacheAbas.invalidar('usuarios');
          UI.toast('Usuário salvo.', 'sucesso');
          UI.fecharModal();
          await carregar();
        } else {
          const criado = await Api.chamar('criarUsuario', { data: dados });
          CacheAbas.invalidar('usuarios');
          UI.toast('Usuário salvo.', 'sucesso');
          UI.fecharModal();
          await carregar();
          mostrarCredenciaisGeradas_(criado);
        }
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  /**
   * Depois de criar, mostra o login gerado e a senha padrão pro
   * Gerente/Administrador repassar ao novo usuário - sem isso ninguém saberia
   * qual login foi gerado (nem digitado nem escolhido, ver criarUsuario,
   * backend/Usuarios.gs). Só "OK": não é um formulário, é aviso.
   */
  function mostrarCredenciaisGeradas_(usuario) {
    const corpo = `
      <p class="ajuda"><strong>Anote agora:</strong> esta senha temporária é mostrada uma única vez e não pode ser recuperada depois. Repasse estas credenciais ao usuário por um canal seguro. No primeiro login ele será obrigado a trocá-la.</p>
      <div class="campo"><label>Login</label><input value="${UI.escaparHtml(usuario.login)}" disabled /></div>
      <div class="campo"><label>Senha temporária</label><input value="${UI.escaparHtml(usuario.senha_temporaria)}" disabled /></div>`;
    UI.abrirModal('Usuário criado', corpo, `<button class="botao primario" id="btnFecharCredenciais">OK</button>`, { pequeno: true });
    document.getElementById('btnFecharCredenciais').addEventListener('click', UI.fecharModal);
  }

  /** Igual a mostrarCredenciaisGeradas_, mas para o reset de senha (só a senha muda, o login continua o mesmo). */
  function mostrarSenhaRedefinida_(nome, senhaTemporaria) {
    const corpo = `
      <p class="ajuda"><strong>Anote agora:</strong> esta senha temporária é mostrada uma única vez e não pode ser recuperada depois. Repasse-a a ${UI.escaparHtml(nome)} por um canal seguro. No próximo login será obrigatório trocá-la.</p>
      <div class="campo"><label>Senha temporária</label><input value="${UI.escaparHtml(senhaTemporaria)}" disabled /></div>`;
    UI.abrirModal('Senha redefinida', corpo, `<button class="botao primario" id="btnFecharSenhaRedefinida">OK</button>`, { pequeno: true });
    document.getElementById('btnFecharSenhaRedefinida').addEventListener('click', UI.fecharModal);
  }

  /**
   * "Redefinir senha" (sessão 2026-08-26) não pede mais uma senha nova
   * digitada pelo Gerente/Administrador - gera uma senha temporária aleatória
   * e força a troca no próximo login (ver redefinirSenha, backend/Usuarios.gs).
   * Confirmação grande e em destaque, mesmo padrão de confirmarExclusao
   * (js/unidades.js) - é uma ação que derruba a senha atual do usuário.
   */
  function confirmarRedefinirSenha_(usuario) {
    const corpo = `<p class="aviso-exclusao">REDEFINIR A SENHA DE "${UI.escaparHtml(usuario.nome).toUpperCase()}"? UMA NOVA SENHA TEMPORÁRIA SERÁ GERADA E MOSTRADA UMA ÚNICA VEZ. NO PRÓXIMO LOGIN, ELE(A) SERÁ OBRIGADO(A) A TROCÁ-LA.</p>`;
    UI.abrirModal('Redefinir senha', corpo,
      `<button class="botao" id="btnCancelarRedefinirSenha">Cancelar</button><button class="botao perigo" id="btnConfirmarRedefinirSenha">Redefinir</button>`,
      { pequeno: true });

    document.getElementById('btnCancelarRedefinirSenha').addEventListener('click', UI.fecharModal);
    document.getElementById('btnConfirmarRedefinirSenha').addEventListener('click', async () => {
      try {
        const resposta = await Api.chamar('redefinirSenha', { id: usuario.id });
        CacheAbas.invalidar('usuarios');
        UI.fecharModal();
        mostrarSenhaRedefinida_(usuario.nome, resposta.senha_temporaria);
      } catch (err) {
        UI.toast(err.message, 'erro');
      }
    });
  }

  return { render };
})();
