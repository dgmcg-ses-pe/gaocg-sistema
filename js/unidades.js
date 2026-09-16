/**
 * GAOCG App - Cadastro Mestre de Unidades (Funcionalidade 2), incluindo o
 * Valor do Contrato de Gestão e os Termos Aditivos (T.A.s) vinculados.
 */

const TelaUnidades = (function () {
  const OPCOES_TIPO = ['UPA', 'UPAE', 'Hospital', 'Carreta', 'Outro'];
  // Situação do Contrato (sessão 2026-08-14, pedido do usuário) - ver
  // UI.calcularPrazoContratoUnidade (js/app.js) pra como cada uma vira
  // contador no card.
  const OPCOES_SITUACAO_CONTRATO = ['Contrato Regular', 'TAC', 'Termo de Compromisso', 'Contrato Emergencial'];
  function situacaoContratoEhTemporaria_(situacao) {
    return situacao === 'TAC' || situacao === 'Termo de Compromisso' || situacao === 'Contrato Emergencial';
  }
  let unidades = [];
  let todasUnidades = []; // sem filtro nenhum - só pra popular o dropdown do filtro "Unidade", separado da lista filtrada exibida nos cartões
  let linhasTas = [];
  // Seções de Ação (sessão 2026-09-01, pedido do usuário) - mesmo padrão de
  // linhasTas acima, só que em 2 níveis (cada seção tem sua própria lista de
  // exceções por Objeto aninhada, ver lerLinhasAcoesDoDom_/renderAcoesFormulario_).
  let linhasAcoes = [];
  // Opções de Objeto (Listas Personalizadas) pro <select> de cada exceção -
  // carregadas 1x em render(), junto com OSS.
  let opcoesObjetoUnidades_ = [];
  let ultimoFiltroJson = null;
  let paginaAtual = 1;
  let totalRegistros = 0;
  // Tamanho de página escolhível (sessão 2026-08-31) - ver mesma explicação em js/sof.js.
  let tamanhoPagina = 20;
  const TAMANHO_PAGINA_TODOS_ = 100000;
  // Exclusão em lote (sessão 2026-08-31) - ver mesma explicação em js/sof.js.
  // Só unidades ATIVAS entram na seleção (o botão individual equivalente,
  // "excluir", também só existe pra unidades ativas - inativar de novo uma
  // já inativa não faz sentido).
  let modoSelecaoLote = false;
  let idsSelecionadosLote_ = new Set();

  const ICONE_LAPIS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const ICONE_LIXEIRA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
  const ICONE_RESTAURAR = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';

  async function render() {
    // Sai do modo de seleção em lote sempre que a tela é (re)aberta - ver
    // mesmo comentário/motivo em js/sof.js (bug relatado pelo usuário: trocar
    // de aba sem clicar Cancelar mantinha a borda pontilhada de seleção nos
    // cards ao voltar pra esta tela).
    modoSelecaoLote = false;
    idsSelecionadosLote_.clear();
    const [opcoesOss, opcoesObjeto, todasUnidadesCarregadas] = await Promise.all([
      TelaListas.obterOpcoes('OSS'),
      TelaListas.obterOpcoes('OBJETO'),
      Api.chamar('listarUnidades', { pageSize: 100000 }, { cache: true })
    ]);
    opcoesObjetoUnidades_ = opcoesObjeto;
    todasUnidades = todasUnidadesCarregadas.items;
    const container = document.getElementById('conteudo');
    container.innerHTML = `
      <h2 class="titulo-tela">Unidades</h2>
      <div class="painel">
        <div class="barra-filtros">
          <div class="campo campo-tamanho-pagina"><label>Itens por página</label>
            <select id="uniTamanhoPaginaTopo">${UI.opcoesTamanhoPaginaHtml(tamanhoPagina === TAMANHO_PAGINA_TODOS_ ? 'todos' : tamanhoPagina)}</select>
          </div>
          <div class="campo campo-busca-livre"><label>Busca livre</label>
            <input type="text" id="uniBusca" placeholder="nome, OSS, CNPJ..." /><button type="button" class="busca-livre-x" data-alvo="uniBusca" title="Limpar busca livre">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Unidade</label>
            <div id="uniFiltroUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="uniFiltroUnidade" title="Limpar filtro de Unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Tipo</label>
            <div id="uniFiltroTipo"></div><button type="button" class="filtro-multiplo-x" data-alvo="uniFiltroTipo" title="Limpar filtro de Tipo">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">OSS</label>
            <div id="uniFiltroOss"></div><button type="button" class="filtro-multiplo-x" data-alvo="uniFiltroOss" title="Limpar filtro de OSS">&times;</button>
          </div>
          <label style="align-self:center;font-size:13px;white-space:nowrap"><input type="checkbox" id="chkSomenteAtivas" checked /> Somente ativas</label>
          <button class="botao" id="btnFiltrarUni">Filtrar</button>
          <button class="botao botao-limpar-filtros" id="btnLimparFiltrosUni">Limpar filtros</button>
          <span style="flex:1"></span>
          <button class="botao" id="btnGerarRelatorioUni">Gerar Relatório</button>
          <button class="botao" id="btnModoSelecaoLoteUni">Apagar cards</button>
          <button class="botao primario" id="btnNovaUnidade">+ Nova unidade</button>
        </div>
        <p class="ajuda legenda-prazo-unidades">
          Cor do prazo do contrato no card: <span class="selo verde">Verde</span> tranquilo, mais de 180 dias ·
          <span class="selo amarelo">Amarelo</span> atenção, até 180 dias ·
          <span class="selo vermelho">Vermelho</span> urgente, até 60 dias ou já vencido
        </p>
        <div class="barra-selecao-lote oculto" id="barraSelecaoLoteUni">
          <label class="rotulo-checkbox"><input type="checkbox" id="chkSelecionarTodosUni" /> Selecionar todos</label>
          <span id="contagemSelecaoLoteUni">0 selecionado(s)</span>
          <button type="button" class="botao perigo" id="btnExcluirSelecionadosUni" disabled>Excluir selecionados</button>
          <button type="button" class="botao" id="btnCancelarSelecaoLoteUni">Cancelar</button>
        </div>
        <div id="listaUnidades"></div>
        <div class="paginacao" id="paginacaoUni"></div>
      </div>`;

    document.getElementById('btnNovaUnidade').addEventListener('click', () => abrirFormulario());
    document.getElementById('btnGerarRelatorioUni').addEventListener('click', abrirGerarRelatorio);
    document.getElementById('btnModoSelecaoLoteUni').addEventListener('click', () => alternarModoSelecaoLote_());
    document.getElementById('btnCancelarSelecaoLoteUni').addEventListener('click', () => alternarModoSelecaoLote_(false));
    document.getElementById('btnExcluirSelecionadosUni').addEventListener('click', excluirSelecionadosLoteClique_);
    // Só unidades ATIVAS entram (mesma regra do checkbox individual - ver
    // acoesCardUnidadeHtml_).
    document.getElementById('chkSelecionarTodosUni').addEventListener('change', function () {
      idsSelecionadosLote_ = this.checked ? new Set(unidades.filter(u => u.ativo).map(u => String(u.id))) : new Set();
      atualizarBarraSelecaoLote_();
      renderCards();
    });
    // Seletor "Itens por página" duplicado no topo - ver mesma explicação em js/sof.js.
    document.getElementById('uniTamanhoPaginaTopo').addEventListener('change', function () { mudarTamanhoPagina_(this.value); });
    document.getElementById('chkSomenteAtivas').addEventListener('change', () => { paginaAtual = 1; carregar(); });
    document.getElementById('btnFiltrarUni').addEventListener('click', () => { if (filtrosMudaram_()) { paginaAtual = 1; carregar(); } });
    document.getElementById('uniBusca').addEventListener('keydown', e => { if (e.key === 'Enter' && filtrosMudaram_()) { paginaAtual = 1; carregar(); } });
    // Opções INICIAIS - a partir da primeira carga elas vêm das facetas do
    // backend (ver FACETAS_UNI_/aplicarResposta_). Substitui o estreitamento
    // antigo, que rodava no clique do checkbox.
    UI.criarFiltroMultiplo('uniFiltroUnidade', todasUnidades.map(u => ({ valor: u.id, rotulo: u.nome })));
    UI.criarFiltroMultiplo('uniFiltroTipo', OPCOES_TIPO);
    UI.criarFiltroMultiplo('uniFiltroOss', opcoesOss.map(o => o.valor));
    UI.ligarLimpezaFiltros('.barra-filtros', 'btnLimparFiltrosUni', () => {
      if (filtrosMudaram_()) { paginaAtual = 1; carregar(); }
    }, aoLimparFiltroIndividual_);
    await carregar();
  }

  function filtrosAtuais() {
    return {
      busca: document.getElementById('uniBusca').value.trim(),
      unidade_id: UI.valoresFiltroMultiplo('uniFiltroUnidade'),
      tipo: UI.valoresFiltroMultiplo('uniFiltroTipo'),
      oss: UI.valoresFiltroMultiplo('uniFiltroOss'),
      somenteAtivas: document.getElementById('chkSomenteAtivas').checked
    };
  }

  /** Mesmo formato "vazio" de filtrosAtuais(), sem depender do DOM - ver mesma função em js/sof.js. Usada só por preCarregar(). */
  function filtrosPadrao_() {
    return { busca: '', unidade_id: [], tipo: [], oss: [], somenteAtivas: true };
  }

  /** Pré-carrega os dados desta tela em segundo plano - ver mesma função em js/sof.js. */
  async function preCarregar() {
    try {
      await TelaListas.obterOpcoes('OSS', { silencioso: true });
      const params = Object.assign({ page: 1, pageSize: tamanhoPagina }, filtrosPadrao_());
      await CacheAbas.comRevalidacao('unidades', params,
        (opcoes) => Api.chamar('listarUnidades', params, Object.assign({ silencioso: true }, opcoes)),
        () => {}
      );
    } catch (e) { /* pré-carga é best-effort */ }
  }

  /** Chave de filtrosAtuais() correspondente a cada id de filtro-multiplo (ou de Busca livre) da barra - ver aoLimparFiltroIndividual_. */
  const CHAVE_POR_FILTRO_ = { uniFiltroUnidade: 'unidade_id', uniFiltroTipo: 'tipo', uniFiltroOss: 'oss', uniBusca: 'busca' };

  /**
   * "x" individual de um filtro (múltipla escolha ou Busca livre): recarrega
   * usando o último filtro realmente aplicado (ultimoFiltroJson), só com
   * este campo zerado por cima - ver mesma função em js/sof.js para a
   * explicação completa. Busca livre zera pra string vazia (é texto, não
   * lista de valores como os demais).
   */
  function aoLimparFiltroIndividual_(idCampo) {
    const chave = CHAVE_POR_FILTRO_[idCampo];
    if (!chave) return;
    const aplicado = ultimoFiltroJson ? JSON.parse(ultimoFiltroJson) : {};
    const filtros = Object.assign({}, aplicado, { [chave]: chave === 'busca' ? '' : [] });
    paginaAtual = 1;
    carregarComFiltros_(filtros);
  }

  /** Evita reler a lista/mostrar o spinner quando Filtrar/Limpar filtros/"x" não mudam nada de fato. */
  function filtrosMudaram_() {
    return JSON.stringify(filtrosAtuais()) !== ultimoFiltroJson;
  }

  async function carregar() {
    await carregarComFiltros_(filtrosAtuais());
  }

  async function carregarComFiltros_(filtros) {
    ultimoFiltroJson = JSON.stringify(filtros);
    const params = Object.assign({ page: paginaAtual, pageSize: tamanhoPagina }, filtros);
    const resposta = await CacheAbas.comRevalidacao('unidades', params,
      (opcoes) => Api.chamar('listarUnidades', params, opcoes),
      aplicarResposta_
    );
    aplicarResposta_(resposta);
  }

  /** id do widget -> dimensão no mapa de facetas (ver UI.aplicarFacetas). */
  const FACETAS_UNI_ = {
    uniFiltroUnidade: { chave: 'unidade_id', rotulo: id => (todasUnidades.find(u => String(u.id) === String(id)) || {}).nome || id },
    uniFiltroTipo: { chave: 'tipo' },
    uniFiltroOss: { chave: 'oss' }
  };

  function aplicarResposta_(resposta) {
    unidades = resposta.items;
    totalRegistros = resposta.total;
    UI.aplicarFacetas(resposta.facetas, FACETAS_UNI_);
    renderCards();
    renderPaginacao();
  }

  /** Muda tamanhoPagina a partir de qualquer um dos dois seletores (topo/embaixo) e sincroniza o outro - ver mesma função em js/sof.js. */
  function mudarTamanhoPagina_(valorSelecionado) {
    tamanhoPagina = valorSelecionado === 'todos' ? TAMANHO_PAGINA_TODOS_ : Number(valorSelecionado);
    paginaAtual = 1;
    ['uniTamanhoPaginaTopo', 'uniTamanhoPagina'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = valorSelecionado;
    });
    carregar();
  }

  function renderPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(totalRegistros / tamanhoPagina));
    document.getElementById('paginacaoUni').innerHTML = `
      <span>${totalRegistros} registro(s) - página ${paginaAtual} de ${totalPaginas}</span>
      <div class="paginacao-tamanho"><label for="uniTamanhoPagina">Por página</label>
        <select id="uniTamanhoPagina">${UI.opcoesTamanhoPaginaHtml(tamanhoPagina === TAMANHO_PAGINA_TODOS_ ? 'todos' : tamanhoPagina)}</select>
      </div>
      <div class="botoes">
        <button class="botao" id="uniPagAnterior" ${paginaAtual <= 1 ? 'disabled' : ''}>Anterior</button>
        <button class="botao" id="uniPagProxima" ${paginaAtual >= totalPaginas ? 'disabled' : ''}>Próxima</button>
      </div>`;
    document.getElementById('uniPagAnterior').addEventListener('click', () => { paginaAtual--; carregar(); });
    document.getElementById('uniPagProxima').addEventListener('click', () => { paginaAtual++; carregar(); });
    document.getElementById('uniTamanhoPagina').addEventListener('change', function () { mudarTamanhoPagina_(this.value); });
  }

  function linhaTaDetalheHtml_(t) {
    const rotulo = `${t.objeto_ta || '-'} (T.A. ${t.numero_ta || '-'})`;
    return `
      <div class="cartao-unidade-detalhe-linha">
        <span title="${UI.escaparHtml(rotulo)}">${UI.escaparHtml(rotulo)}</span>
        <span>${UI.formatarMoeda(t.valor_ta)}</span>
      </div>
      ${t.vencido ? `<p class="ajuda cartao-unidade-ta-vencido">⚠ Pagamento não regular encerrado em ${UI.formatarDataBr(t.data_vencimento)} - remova este T.A. se não for mais válido.</p>` : ''}`;
  }

  /**
   * Duas divisões (sessão 2026-07-29): "Pagamentos Regulares" sempre traz
   * Valor do C.G. - Tesouro/SUS (são recorrentes por definição) + os T.A.s
   * marcados como Regular; "Pagamentos Não Regulares" traz só os T.A.s
   * marcados como Não Regular (tipo_pagamento === 'sazonal' internamente -
   * nome do valor mantido pra não exigir migração dos dados já salvos).
   */
  function detalheTasHtml(unidade) {
    const tas = unidade.tas || [];
    const regulares = tas.filter(t => t.tipo_pagamento !== 'sazonal');
    const naoRegulares = tas.filter(t => t.tipo_pagamento === 'sazonal');
    const naoRegularesHtml = naoRegulares.length
      ? naoRegulares.map(linhaTaDetalheHtml_).join('')
      : '<p class="ajuda">Nenhum pagamento não regular cadastrado.</p>';
    return `
      <div class="cartao-unidade-detalhe oculto">
        <p class="cartao-unidade-detalhe-secao">Pagamentos Regulares</p>
        <div class="cartao-unidade-detalhe-linha"><span>Valor do C.G. - Tesouro</span><span>${UI.formatarMoeda(unidade.valor_contrato_gestao)}</span></div>
        <div class="cartao-unidade-detalhe-linha"><span>Valor do C.G. - SUS</span><span>${UI.formatarMoeda(unidade.valor_contrato_gestao_sus)}</span></div>
        ${regulares.map(linhaTaDetalheHtml_).join('')}
        <p class="cartao-unidade-detalhe-secao cartao-unidade-detalhe-divisor">Pagamentos Não Regulares</p>
        ${naoRegularesHtml}
      </div>`;
  }

  /**
   * Contador(es) de prazo contratual do card (sessão 2026-08-14, pedido do
   * usuário) - toda a conta vem de UI.calcularPrazoContratoUnidade
   * (js/app.js), compartilhada com a tabela nova do Dashboard. Sem Situação
   * do Contrato preenchida (cadastro antigo, ainda não migrado) não mostra
   * nada - não é erro, só falta preencher.
   */
  function prazoContratoHtml_(unidade) {
    const prazo = UI.calcularPrazoContratoUnidade(unidade);
    if (!prazo) return '';
    const textoDias = dias => dias >= 0 ? `${dias} dia(s)` : `vencido há ${Math.abs(dias)} dia(s)`;
    const proximoTaHtml = prazo.diasProximoTa !== null
      ? `<span class="selo ${UI.corAlertaPrazo(prazo.diasProximoTa)}">Próximo T.A. em ${textoDias(prazo.diasProximoTa)}</span>`
      : '';
    return `
      <div class="cartao-unidade-prazo">
        ${proximoTaHtml}
        <span class="selo ${UI.corAlertaPrazo(prazo.diasPrazoFinal)}">${UI.escaparHtml(prazo.rotuloPrazoFinal)}: ${textoDias(prazo.diasPrazoFinal)}</span>
      </div>`;
  }

  /** Ícones do topo do card: checkbox de seleção em lote (só unidades ativas) ou os botões de sempre (editar/excluir/restaurar). */
  function acoesCardUnidadeHtml_(u) {
    if (modoSelecaoLote && u.ativo) {
      return `<input type="checkbox" class="checkbox-selecao-lote" data-id="${u.id}" ${idsSelecionadosLote_.has(String(u.id)) ? 'checked' : ''} title="Selecionar para excluir" />`;
    }
    return `<button type="button" class="botao-icone editar" data-acao="editar" title="Editar">${ICONE_LAPIS}</button>
      ${u.ativo
        ? `<button type="button" class="botao-icone excluir" data-acao="excluir" title="Excluir">${ICONE_LIXEIRA}</button>`
        : `<button type="button" class="botao-icone" data-acao="restaurar" title="Restaurar">${ICONE_RESTAURAR}</button>`}`;
  }

  function renderCards() {
    const alvo = document.getElementById('listaUnidades');
    if (!unidades.length) {
      alvo.innerHTML = '<p class="estado-vazio">Nenhuma unidade cadastrada.</p>';
      return;
    }
    alvo.innerHTML = `<div class="grade-cards-unidade">${unidades.map(u => `
      <div class="cartao-unidade ${u.ativo ? '' : 'inativa'} ${modoSelecaoLote && u.ativo ? 'em-selecao-lote' : ''}" data-id="${u.id}">
        <div class="cartao-unidade-acoes">${acoesCardUnidadeHtml_(u)}</div>
        <div class="cartao-unidade-corpo">
          <div class="cartao-unidade-cabecalho">
            <h3>${UI.escaparHtml(u.nome)}</h3>
            <span class="cartao-unidade-repasse-regular">Repasse Mensal Regular: ${UI.formatarMoeda(u.parcela_mensal_regular)}</span>
            <span class="cartao-unidade-repasse-total">Repasse Mensal Total: ${UI.formatarMoeda(u.parcela_mensal_total)}</span>
          </div>
          <div class="cartao-unidade-meta">${UI.escaparHtml(u.tipo || '-')} · OSS ${UI.escaparHtml(u.oss || '-')} · ${UI.escaparHtml(u.cnpj || '-')} · Contrato CEO ${UI.escaparHtml(u.contrato_ceo || '-')}</div>
          ${prazoContratoHtml_(u)}
          ${detalheTasHtml(u)}
        </div>
      </div>`).join('')}</div>`;

    alvo.querySelectorAll('.cartao-unidade').forEach(cartao => {
      const id = cartao.dataset.id;
      const unidade = unidades.find(u => u.id === id);

      if (modoSelecaoLote && unidade && unidade.ativo) {
        const chk = cartao.querySelector('.checkbox-selecao-lote');
        chk.addEventListener('change', () => {
          if (chk.checked) idsSelecionadosLote_.add(String(unidade.id)); else idsSelecionadosLote_.delete(String(unidade.id));
          atualizarBarraSelecaoLote_();
        });
        return;
      }

      cartao.querySelector('.cartao-unidade-corpo').addEventListener('click', () => {
        cartao.querySelector('.cartao-unidade-detalhe').classList.toggle('oculto');
      });
      cartao.querySelector('[data-acao="editar"]').addEventListener('click', e => {
        e.stopPropagation();
        abrirFormulario(unidade);
      });
      const btnExcluir = cartao.querySelector('[data-acao="excluir"]');
      if (btnExcluir) btnExcluir.addEventListener('click', e => { e.stopPropagation(); confirmarExclusao(unidade); });
      const btnRestaurar = cartao.querySelector('[data-acao="restaurar"]');
      if (btnRestaurar) btnRestaurar.addEventListener('click', async e => {
        e.stopPropagation();
        await Api.chamar('reativarUnidade', { id: unidade.id });
        Api.invalidarCache('listarUnidades');
        CacheAbas.invalidar('unidades');
        UI.toast('Unidade restaurada.', 'sucesso');
        await carregar();
      });
    });
  }

  /** Liga/desliga o modo de seleção em lote (sessão 2026-08-31) - ver mesma função em js/sof.js. */
  function alternarModoSelecaoLote_(ligar) {
    modoSelecaoLote = typeof ligar === 'boolean' ? ligar : !modoSelecaoLote;
    idsSelecionadosLote_.clear();
    document.getElementById('btnModoSelecaoLoteUni').classList.toggle('ativo', modoSelecaoLote);
    atualizarBarraSelecaoLote_();
    renderCards();
  }

  function atualizarBarraSelecaoLote_() {
    document.getElementById('barraSelecaoLoteUni').classList.toggle('oculto', !modoSelecaoLote);
    document.getElementById('contagemSelecaoLoteUni').textContent = `${idsSelecionadosLote_.size} selecionado(s)`;
    document.getElementById('btnExcluirSelecionadosUni').disabled = idsSelecionadosLote_.size === 0;
    const chkTodos = document.getElementById('chkSelecionarTodosUni');
    const totalMarcavel = unidades.filter(u => u.ativo).length;
    chkTodos.checked = totalMarcavel > 0 && idsSelecionadosLote_.size === totalMarcavel;
    chkTodos.indeterminate = idsSelecionadosLote_.size > 0 && idsSelecionadosLote_.size < totalMarcavel;
  }

  /** Mesmo aviso grande de confirmarExclusao, só que pra várias unidades de uma vez (inativarUnidadesEmLote - reversível, "Restaurar" continua funcionando unidade a unidade). */
  function excluirSelecionadosLoteClique_() {
    if (!idsSelecionadosLote_.size) return;
    const qtd = idsSelecionadosLote_.size;
    const corpo = `<p class="aviso-exclusao">TEM CERTEZA QUE QUER EXCLUIR ${qtd} UNIDADE(S) E TODOS OS SEUS DADOS? SE FIZER ISSO NENHUM USUÁRIO TERÁ ACESSO A ESSAS INFORMAÇÕES!</p>`;
    UI.abrirModal('Excluir unidades em lote', corpo,
      `<button class="botao" id="btnCancelarExclusaoLoteUni">Cancelar</button><button class="botao perigo" id="btnConfirmarExclusaoLoteUni">Excluir</button>`,
      { pequeno: true });
    document.getElementById('btnCancelarExclusaoLoteUni').addEventListener('click', UI.fecharModal);
    document.getElementById('btnConfirmarExclusaoLoteUni').addEventListener('click', async () => {
      try {
        await Api.chamar('inativarUnidadesEmLote', { ids: Array.from(idsSelecionadosLote_) });
        Api.invalidarCache('listarUnidades');
        CacheAbas.invalidar('unidades');
        UI.toast('Unidades excluídas.', 'sucesso');
        UI.fecharModal();
        alternarModoSelecaoLote_(false);
        await carregar();
      } catch (err) {
        UI.toast(err.message, 'erro');
      }
    });
  }

  /** Confirmação grande e em destaque - exclusão é lógica (ativo=false), a unidade some do painel mas não do banco. */
  function confirmarExclusao(unidade) {
    const corpo = `<p class="aviso-exclusao">TEM CERTEZA QUE QUER EXCLUIR ESSA UNIDADE E TODOS OS SEUS DADOS? SE FIZER ISSO NENHUM USUÁRIO TERÁ ACESSO A ESSAS INFORMAÇÕES!</p>`;
    UI.abrirModal('Excluir unidade', corpo,
      `<button class="botao" id="btnCancelarExclusao">Cancelar</button><button class="botao perigo" id="btnConfirmarExclusao">Excluir</button>`,
      { pequeno: true });

    document.getElementById('btnCancelarExclusao').addEventListener('click', UI.fecharModal);
    document.getElementById('btnConfirmarExclusao').addEventListener('click', async () => {
      try {
        await Api.chamar('inativarUnidade', { id: unidade.id });
        Api.invalidarCache('listarUnidades');
        CacheAbas.invalidar('unidades');
        UI.toast('Unidade excluída.', 'sucesso');
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.toast(err.message, 'erro');
      }
    });
  }

  /** Lê as linhas de T.A. direto do DOM (fonte da verdade entre re-renders) - mesmo padrão de lerLinhasFontesDoDom_ em js/sof.js. */
  function lerLinhasTasDoDom_() {
    return Array.from(document.querySelectorAll('#tasContainer .linha-ta')).map(linha => ({
      objeto_ta: linha.querySelector('.linha-ta-objeto').value,
      numero_ta: linha.querySelector('.linha-ta-numero').value,
      valor_ta: UI.parseValorBr(linha.querySelector('.linha-ta-valor').value),
      tipo_pagamento: linha.querySelector('.linha-ta-tipo-pagamento').value,
      data_vencimento: linha.querySelector('.linha-ta-data-vencimento').value
    }));
  }

  /**
   * Ganhou "Tipo de pagamento" (Regular/Não Regular) e "Data limite" (sessão
   * 2026-07-27) - a data só aparece quando Não Regular está selecionado (listener
   * de change em renderTasFormulario alterna a visibilidade). Classe própria
   * `.linha-ta` (não reaproveita `.linha-fonte`, que continua servindo só as
   * linhas mais simples de Manutenção do SEI) - mesmo princípio de
   * `.linha-fonte-cronograma` (js/sof.js) quando a linha de Fonte cresceu.
   */
  function linhaTaHtml(item, indice) {
    const sazonal = item.tipo_pagamento === 'sazonal';
    return `
      <div class="linha-ta" data-indice="${indice}">
        <div class="linha-ta-campos">
          <div class="campo"><label>Objeto do T.A.</label><input class="linha-ta-objeto" value="${UI.escaparHtml(item.objeto_ta || '')}" placeholder="Ex.: T.E.A. ou Aquisição de Equipamentos" /></div>
          <div class="campo"><label>Nº do T.A.</label><input class="linha-ta-numero" value="${UI.escaparHtml(item.numero_ta || '')}" placeholder="Ex.: 1º" /></div>
          <div class="campo"><label>Valor do T.A.</label><input class="linha-ta-valor campo-moeda" type="text" inputmode="decimal" value="${item.valor_ta || ''}" /></div>
        </div>
        <div class="linha-ta-pagamento">
          <div class="campo"><label>Tipo de pagamento</label>
            <select class="linha-ta-tipo-pagamento">
              <option value="regular" ${!sazonal ? 'selected' : ''}>Regular</option>
              <option value="sazonal" ${sazonal ? 'selected' : ''}>Não Regular</option>
            </select>
          </div>
          <div class="campo linha-ta-data-campo ${sazonal ? '' : 'oculto'}"><label>Data limite</label><input class="linha-ta-data-vencimento" type="date" value="${item.data_vencimento || ''}" /></div>
        </div>
        <button type="button" class="botao-icone linha-fonte-remover" title="Remover T.A.">&times;</button>
      </div>`;
  }

  function renderTasFormulario() {
    const alvo = document.getElementById('tasContainer');
    alvo.innerHTML = linhasTas.map((item, i) => linhaTaHtml(item, i)).join('');
    alvo.querySelectorAll('.linha-fonte-remover').forEach(btn => {
      btn.addEventListener('click', () => {
        linhasTas = lerLinhasTasDoDom_();
        const indice = Number(btn.closest('.linha-ta').dataset.indice);
        linhasTas.splice(indice, 1);
        renderTasFormulario();
      });
    });
    alvo.querySelectorAll('.linha-ta-tipo-pagamento').forEach(select => {
      select.addEventListener('change', function () {
        this.closest('.linha-ta').querySelector('.linha-ta-data-campo').classList.toggle('oculto', this.value !== 'sazonal');
      });
    });
  }

  // ===== Seções de Ação (sessão 2026-09-01, pedido do usuário) =====
  // Ação/Subação/G.D. eram 3 campos soltos; viraram uma lista de seções
  // (título configurável - casa por título com "Tipo de SOF"/OPCOES_SOF_TIPO
  // em js/sof.js, ex. "Pagamentos Regulares"/"Investimento"), cada uma com
  // sua própria Ação/Subação/G.D., e dentro de cada seção uma lista de
  // exceções (Objeto -> Subação alternativa). 2 níveis de "adicionar linha",
  // mesmo padrão de lerLinhasTasDoDom_/renderTasFormulario acima, só
  // aninhado.

  /** Lê as Seções de Ação (com as exceções de cada uma) direto do DOM - fonte da verdade entre re-renders. */
  function lerLinhasAcoesDoDom_() {
    return Array.from(document.querySelectorAll('#acoesContainer .linha-acao')).map(linhaAcao => ({
      titulo: linhaAcao.querySelector('.linha-acao-titulo').value,
      acao: linhaAcao.querySelector('.linha-acao-acao').value,
      subacao: linhaAcao.querySelector('.linha-acao-subacao').value,
      gd: linhaAcao.querySelector('.linha-acao-gd').value,
      excecoes: Array.from(linhaAcao.querySelectorAll('.linha-acao-excecao')).map(linhaExc => ({
        objeto: linhaExc.querySelector('.linha-acao-excecao-objeto').value,
        subacao: linhaExc.querySelector('.linha-acao-excecao-subacao').value
      }))
    }));
  }

  function linhaExcecaoHtml_(exc, indiceAcao, indiceExcecao) {
    return `
      <div class="linha-acao-excecao" data-indice-excecao="${indiceExcecao}">
        <select class="linha-acao-excecao-objeto">
          <option value="">Selecione o Objeto...</option>
          ${opcoesObjetoUnidades_.map(o => `<option value="${UI.escaparHtml(o.valor)}" ${o.valor === exc.objeto ? 'selected' : ''}>${UI.escaparHtml(o.valor)}</option>`).join('')}
        </select>
        <input class="linha-acao-excecao-subacao" placeholder="Subação alternativa" value="${UI.escaparHtml(exc.subacao || '')}" />
        <button type="button" class="linha-fonte-remover linha-acao-excecao-remover" data-indice-acao="${indiceAcao}" title="Remover exceção">&times;</button>
      </div>`;
  }

  function linhaAcaoHtml_(item, indice) {
    return `
      <div class="linha-acao" data-indice="${indice}">
        <div class="linha-acao-cabecalho">
          <div class="campo"><label>Título da seção</label><input class="linha-acao-titulo" value="${UI.escaparHtml(item.titulo || '')}" placeholder="Ex.: Pagamentos Regulares" /></div>
          <button type="button" class="linha-fonte-remover linha-acao-remover" title="Remover seção">&times;</button>
        </div>
        <div class="linha-acao-campos">
          <div class="campo"><label>Ação</label><input class="linha-acao-acao" value="${UI.escaparHtml(item.acao || '')}" /></div>
          <div class="campo"><label>Subação</label><input class="linha-acao-subacao" value="${UI.escaparHtml(item.subacao || '')}" /></div>
          <div class="campo"><label>G.D.</label><input class="linha-acao-gd" value="${UI.escaparHtml(item.gd || '')}" /></div>
        </div>
        <div class="linha-acao-excecoes">
          <label class="linha-acao-excecoes-titulo">Exceções por Objeto <span class="ajuda">(a Subação muda pra esses Objetos - Ação/G.D. continuam os desta seção)</span></label>
          <div class="linha-acao-excecoes-lista">${(item.excecoes || []).map((exc, ei) => linhaExcecaoHtml_(exc, indice, ei)).join('')}</div>
          <button type="button" class="botao linha-acao-add-excecao" data-indice-acao="${indice}">+ Adicionar Exceção</button>
        </div>
      </div>`;
  }

  function renderAcoesFormulario_() {
    const alvo = document.getElementById('acoesContainer');
    alvo.innerHTML = linhasAcoes.map((item, i) => linhaAcaoHtml_(item, i)).join('');

    alvo.querySelectorAll('.linha-acao-remover').forEach(btn => {
      btn.addEventListener('click', () => {
        linhasAcoes = lerLinhasAcoesDoDom_();
        const indice = Number(btn.closest('.linha-acao').dataset.indice);
        linhasAcoes.splice(indice, 1);
        renderAcoesFormulario_();
      });
    });
    alvo.querySelectorAll('.linha-acao-add-excecao').forEach(btn => {
      btn.addEventListener('click', () => {
        linhasAcoes = lerLinhasAcoesDoDom_();
        const indice = Number(btn.dataset.indiceAcao);
        linhasAcoes[indice].excecoes.push({ objeto: '', subacao: '' });
        renderAcoesFormulario_();
      });
    });
    alvo.querySelectorAll('.linha-acao-excecao-remover').forEach(btn => {
      btn.addEventListener('click', () => {
        linhasAcoes = lerLinhasAcoesDoDom_();
        const indiceAcao = Number(btn.dataset.indiceAcao);
        const indiceExcecao = Number(btn.closest('.linha-acao-excecao').dataset.indiceExcecao);
        linhasAcoes[indiceAcao].excecoes.splice(indiceExcecao, 1);
        renderAcoesFormulario_();
      });
    });
  }

  function abrirFormulario(unidade) {
    const editando = !!unidade;
    linhasTas = (unidade && unidade.tas) ? unidade.tas.map(t => ({
      objeto_ta: t.objeto_ta, numero_ta: t.numero_ta, valor_ta: t.valor_ta,
      tipo_pagamento: t.tipo_pagamento, data_vencimento: t.data_vencimento
    })) : [];
    // Unidade nova (sessão 2026-09-01, pedido do usuário): já nasce com as 2
    // seções padrão tituladas (vazias, só o título) - "por padrão temos Uma
    // ação para Pagamentos Regulares, e outra Ação para Investimento".
    linhasAcoes = (unidade && unidade.acoes && unidade.acoes.length) ? unidade.acoes.map(a => ({
      titulo: a.titulo, acao: a.acao, subacao: a.subacao, gd: a.gd,
      excecoes: (a.excecoes || []).map(e => ({ objeto: e.objeto, subacao: e.subacao }))
    })) : (editando ? [] : [
      { titulo: 'Pagamentos Regulares', acao: '', subacao: '', gd: '', excecoes: [] },
      { titulo: 'Investimento', acao: '', subacao: '', gd: '', excecoes: [] }
    ]);

    const corpo = `
      <form id="formUnidade">
        <div class="grade-2">
          <div class="campo"><label>Nome *</label><input id="uNome" value="${UI.escaparHtml(unidade ? unidade.nome : '')}" required /></div>
          <div class="campo"><label>Tipo</label>
            <select id="uTipo">
              ${OPCOES_TIPO.map(t => `<option ${unidade && unidade.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="campo"><label>OSS</label><input id="uOss" value="${UI.escaparHtml(unidade ? unidade.oss : '')}" /></div>
          <div class="campo"><label>CNPJ *</label><input id="uCnpj" value="${UI.escaparHtml(unidade ? unidade.cnpj : '')}" required placeholder="00.000.000/0000-00" /></div>
          <div class="campo"><label>Contrato de Gestão *</label><input id="uContrato" value="${UI.escaparHtml(unidade ? unidade.contrato_gestao : '')}" required /></div>
          <div class="campo"><label>Contrato CEO</label><input id="uContratoCeo" value="${UI.escaparHtml(unidade ? unidade.contrato_ceo : '')}" placeholder="Ex.: 00871/2022" /></div>
          <div class="campo"><label>Valor do C.G. - Tesouro</label><input id="uValorContratoGestaoTesouro" type="text" inputmode="decimal" class="campo-moeda" value="${unidade && unidade.valor_contrato_gestao ? unidade.valor_contrato_gestao : ''}" /></div>
          <div class="campo"><label>Valor do C.G. - SUS</label><input id="uValorContratoGestaoSus" type="text" inputmode="decimal" class="campo-moeda" value="${unidade && unidade.valor_contrato_gestao_sus ? unidade.valor_contrato_gestao_sus : ''}" /></div>
        </div>
        <div class="grade-2">
          <div class="campo"><label>Situação do Contrato</label>
            <select id="uSituacaoContrato">
              <option value="">-</option>
              ${OPCOES_SITUACAO_CONTRATO.map(s => `<option ${unidade && unidade.situacao_contrato === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div></div>
          <div class="campo ${unidade && unidade.situacao_contrato ? '' : 'oculto'}" id="uCampoDataInicial">
            <label>Data Inicial do Instrumento Contratual</label>
            <input type="date" id="uDataInicialInstrumento" value="${unidade ? unidade.data_inicial_instrumento || '' : ''}" />
          </div>
          <div class="campo ${unidade && situacaoContratoEhTemporaria_(unidade.situacao_contrato) ? '' : 'oculto'}" id="uCampoDataFinal">
            <label>Data final deste Instrumento Contratual</label>
            <input type="date" id="uDataFinalInstrumento" value="${unidade ? unidade.data_final_instrumento || '' : ''}" />
          </div>
        </div>
        <div class="campo">
          <label>Termos Aditivos (T.A.)</label>
          <div id="tasContainer" class="linhas-fonte"></div>
          <button type="button" class="botao" id="btnAdicionarTa">+ Adicionar parcela mensal</button>
        </div>
        <div class="campo">
          <label>Seções de Ação</label>
          <p class="ajuda">Cada seção representa um Tipo de SOF (ex.: "Pagamentos Regulares", "Investimento") - o título precisa bater com o Tipo escolhido lá na SOF pra preencher Ação/Subação/G.D. automaticamente.</p>
          <div id="acoesContainer" class="linhas-acao"></div>
          <button type="button" class="botao" id="btnAdicionarAcao">+ Adicionar seção</button>
        </div>
        <p id="uErro" class="erro-campo oculto"></p>
      </form>`;
    const rodape = `
      <button class="botao" id="btnCancelarUnidade">Cancelar</button>
      <button class="botao primario" id="btnSalvarUnidade">Salvar</button>`;

    UI.abrirModal(editando ? 'Editar unidade' : 'Nova unidade', corpo, rodape);
    document.getElementById('btnCancelarUnidade').addEventListener('click', UI.fecharModal);

    // Data Inicial aparece assim que qualquer Situação é escolhida; Data
    // Final só nos 3 tipos temporários (mesmo padrão de mostrar/esconder
    // campo por change já usado no Tipo de pagamento do T.A., acima).
    document.getElementById('uSituacaoContrato').addEventListener('change', function () {
      document.getElementById('uCampoDataInicial').classList.toggle('oculto', !this.value);
      document.getElementById('uCampoDataFinal').classList.toggle('oculto', !situacaoContratoEhTemporaria_(this.value));
    });

    renderTasFormulario();
    document.getElementById('btnAdicionarTa').addEventListener('click', () => {
      linhasTas = lerLinhasTasDoDom_();
      linhasTas.push({ objeto_ta: '', numero_ta: '', valor_ta: '', tipo_pagamento: 'regular', data_vencimento: '' });
      renderTasFormulario();
    });

    renderAcoesFormulario_();
    document.getElementById('btnAdicionarAcao').addEventListener('click', () => {
      linhasAcoes = lerLinhasAcoesDoDom_();
      linhasAcoes.push({ titulo: '', acao: '', subacao: '', gd: '', excecoes: [] });
      renderAcoesFormulario_();
    });

    document.getElementById('btnSalvarUnidade').addEventListener('click', async () => {
      // Nada mudou (sessão 2026-08-13, pedido do usuário): editando uma
      // unidade já existente, só fecha o card em vez de chamar o backend à
      // toa - mesmo dirty-tracking que já decidia minimizar x fechar no
      // clique fora (ver UI.modalFoiEditado, js/app.js).
      if (editando && !UI.modalFoiEditado()) { UI.fecharModal(); return; }
      const erroEl = document.getElementById('uErro');
      erroEl.classList.add('oculto');
      // Portao unico dos campos monetarios (UI.validarCamposMoeda, js/app.js):
      // recusa texto que nao vira numero em vez de gravar R$ 0,00 sem avisar.
      if (!UI.validarCamposMoeda()) return;
      const dados = {
        nome: document.getElementById('uNome').value.trim(),
        tipo: document.getElementById('uTipo').value,
        oss: document.getElementById('uOss').value.trim(),
        cnpj: document.getElementById('uCnpj').value.trim(),
        contrato_gestao: document.getElementById('uContrato').value.trim(),
        contrato_ceo: document.getElementById('uContratoCeo').value.trim(),
        situacao_contrato: document.getElementById('uSituacaoContrato').value,
        // Zera a data que não se aplica à Situação escolhida - o campo pode
        // estar oculto mas ainda ter um valor digitado antes de trocar de
        // tipo (mesmo cuidado de data_vencimento em substituirTasDaUnidade_,
        // backend/Unidades.gs, pra não sobrar lixo órfão).
        data_inicial_instrumento: document.getElementById('uSituacaoContrato').value ? document.getElementById('uDataInicialInstrumento').value : '',
        data_final_instrumento: situacaoContratoEhTemporaria_(document.getElementById('uSituacaoContrato').value) ? document.getElementById('uDataFinalInstrumento').value : '',
        valor_contrato_gestao: UI.parseValorBr(document.getElementById('uValorContratoGestaoTesouro').value),
        valor_contrato_gestao_sus: UI.parseValorBr(document.getElementById('uValorContratoGestaoSus').value),
        tas: lerLinhasTasDoDom_(),
        acoes: lerLinhasAcoesDoDom_()
      };
      try {
        if (editando) await Api.chamar('atualizarUnidade', { id: unidade.id, data: dados });
        else await Api.chamar('criarUnidade', { data: dados });
        Api.invalidarCache('listarUnidades');
        CacheAbas.invalidar('unidades');
        UI.toast('Unidade salva com sucesso.', 'sucesso');
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  /**
   * "Gerar Relatório" (sessão 2026-07-29, era "Gerar PDF"): escolha de colunas
   * + as mesmas 4 saídas do assistente do Dashboard (tela/PDF/CSV/Sheets),
   * usando os filtros que já estão aplicados NA TELA.
   *
   * O modal em si vive em TelaRelatorios.abrirParaTela (js/relatorios.js) desde
   * a sessão 2026-08-08, quando Recibos e Notas de Empenho ganharam o mesmo
   * botão - antes esse bloco era ~55 linhas de HTML e wiring aqui dentro, e
   * copiá-lo pras outras duas telas daria três cópias quase idênticas.
   */
  function abrirGerarRelatorio() {
    return TelaRelatorios.abrirParaTela({
      fonte: 'unidades',
      titulo: 'Gerar Relatório de Unidades',
      obterFiltros: filtrosAtuais,
      // "Ativa" não é útil no relatório (a tela já lista só ativas por
      // padrão) - escondida só aqui, sem tirar do catálogo compartilhado com
      // o assistente do Dashboard.
      colunasOcultas: ['ativo'],
      ajuda: 'O relatório usa os filtros aplicados na tela. Sem filtro, entram todas as unidades.'
    });
  }

  return { render, preCarregar };
})();
