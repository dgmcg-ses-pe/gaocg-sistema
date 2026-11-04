/**
 * GAOCG App - Log de Auditoria (Funcionalidade 6). Gerente vê tudo com
 * filtros; analista vê apenas as próprias ações.
 */

const TelaLogAuditoria = (function () {
  let paginaAtual = 1;
  const TAMANHO_PAGINA = 50;

  async function render() {
    const gerente = Auth.ehGerente();
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">Log de Auditoria</h2>
      <div class="painel">
        ${gerente ? `
        <div class="barra-filtros">
          <div class="campo"><label>Tipo de processo</label>
            <select id="logTipoProcesso"><option value="">Todos</option><option>SOF</option><option>Recibo</option><option>Unidade</option><option>Usuario</option><option>NotaEmpenho</option><option>Login</option></select>
          </div>
          <div class="campo"><label>ID do processo</label><input id="logProcessoId" /></div>
          <label style="align-self:center;font-size:13px"><input type="checkbox" id="logForaDono" /> Somente edições em processo de outro usuário</label>
          <button class="botao" id="btnFiltrarLog">Filtrar</button>
        </div>` : '<p class="ajuda">Você vê apenas as edições feitas por você mesmo.</p>'}
        <div id="listaLog"></div>
        <div class="paginacao" id="paginacaoLog"></div>
      </div>`;

    if (gerente) document.getElementById('btnFiltrarLog').addEventListener('click', () => { paginaAtual = 1; carregar(); });
    await carregar();
  }

  async function carregar() {
    const gerente = Auth.ehGerente();
    const params = { page: paginaAtual, pageSize: TAMANHO_PAGINA };
    if (gerente) {
      params.tipo_processo = document.getElementById('logTipoProcesso').value;
      params.processo_id = document.getElementById('logProcessoId').value.trim();
      params.fora_do_dono = document.getElementById('logForaDono').checked;
    }
    const resposta = await CacheAbas.comRevalidacao('logAuditoria', params,
      (opcoes) => Api.chamar('listarLogAuditoria', params, opcoes),
      aplicarResposta_
    );
    aplicarResposta_(resposta);
  }

  function aplicarResposta_(resposta) {
    renderTabela(resposta.items);
    renderPaginacao(resposta.total);
  }

  function renderTabela(itens) {
    const alvo = document.getElementById('listaLog');
    if (!itens.length) { alvo.innerHTML = '<p class="estado-vazio">Nenhum registro de auditoria encontrado.</p>'; return; }
    alvo.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Data/Hora</th><th>Usuário</th><th>Processo</th><th>Campo</th><th>De</th><th>Para</th><th>Editado por outro usuário</th></tr></thead>
        <tbody>${itens.map(l => `
          <tr>
            <td>${UI.formatarData(l.data_hora)}</td>
            <td>${UI.escaparHtml(l.usuario_id)} (${UI.escaparHtml(l.perfil_usuario)})</td>
            <td>${UI.escaparHtml(l.tipo_processo)} ${UI.escaparHtml(l.processo_id)}</td>
            <td>${UI.escaparHtml(l.campo_alterado)}</td>
            <td>${UI.escaparHtml(l.valor_anterior)}</td>
            <td>${UI.escaparHtml(l.valor_novo)}</td>
            <td>${l.fora_do_dono ? '<span class="selo amarelo">Sim</span>' : '<span class="selo cinza">Não</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function renderPaginacao(total) {
    const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
    document.getElementById('paginacaoLog').innerHTML = `
      <span>${total} registro(s) - página ${paginaAtual} de ${totalPaginas}</span>
      <div class="botoes">
        <button class="botao" id="logPagAnterior" ${paginaAtual <= 1 ? 'disabled' : ''}>Anterior</button>
        <button class="botao" id="logPagProxima" ${paginaAtual >= totalPaginas ? 'disabled' : ''}>Próxima</button>
      </div>`;
    document.getElementById('logPagAnterior').addEventListener('click', () => { paginaAtual--; carregar(); });
    document.getElementById('logPagProxima').addEventListener('click', () => { paginaAtual++; carregar(); });
  }

  return { render };
})();
