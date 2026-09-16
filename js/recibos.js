/**
 * GAOCG App - Gestão de Processos de Recibo (Funcionalidade 4, Anexo II),
 * incluindo parcela dividida.
 */

const TelaRecibos = (function () {
  let unidades = [];
  let itens = [];
  let paginaAtual = 1;
  let totalRegistros = 0;
  // Tamanho de página escolhível (sessão 2026-08-31) - ver mesma explicação
  // em js/sof.js. Aqui o valor inicial (antes do 1º render()) é 20 mas
  // render() troca pra TAMANHO_PAGINA_TODOS_ quando não há competência
  // explícita vinda de fora - ver comentário no render() abaixo.
  let tamanhoPagina = 20;
  const TAMANHO_PAGINA_TODOS_ = 100000;
  let contadorLinhasParcelaDividida = 0;
  let historicoRecibosUnidade = [];
  // Notas de Empenho da unidade selecionada (sessão 2026-07-29) - alimenta o
  // <datalist> de "Nota de Empenho" e o autopreenchimento de Objeto ao
  // escolher/digitar uma NE existente (fecha a cadeia SOF->NE->Recibo).
  let nesDaUnidadeAtual = [];
  // Objetos com SOF/NE já cadastrados pra unidade selecionada (sessão
  // 2026-07-30) - só usada em "Novo processo de Recibo", como fallback do
  // autopreenchimento por Objeto quando ainda não existe nenhum Recibo
  // anterior daquele Objeto (ver recObjeto/listarObjetosSofPorUnidade).
  let objetosSofDaUnidadeNovo = [];
  let abrindoLinha = false;
  let ultimoFiltroJson = null;
  // Exclusão em lote (sessão 2026-08-31) - ver mesma explicação em
  // js/sof.js. Aqui a unidade de seleção é a LINHA (mesma granularidade do
  // botão de excluir individual já existente - inclusive dentro de um card
  // de parcela dividida, cada parcela é sua própria linha/seleção), não o
  // processo/grupo inteiro - "aba de recibo, seria sim apagar a(as)
  // linha(as) referente áquele recibo" (pedido do usuário).
  let modoSelecaoLote = false;
  let idsSelecionadosLote_ = new Set();
  const MESES_ABREV_COMPETENCIA_ = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  /** "ago.26" pro mês corrente - valor inicial do seletor de "Gerar recibos da meta" (mesmo formato de UI.listaCompetencias). */
  function mesAtualComoCompetencia_() {
    const hoje = new Date();
    return MESES_ABREV_COMPETENCIA_[hoje.getMonth()] + '.' + String(hoje.getFullYear()).slice(-2);
  }
  // Opções de STATUS_RECIBO (não deduplicadas) carregadas em render() -
  // reaproveitadas pelo <select> de status editável direto na tabela (sessão
  // 2026-08-07), pra não precisar buscar de novo a cada linha renderizada.
  let statusOpcoesTodasAtual = [];
  // Salva na hora, sem confirmação (é uma edição rápida, reversível a
  // qualquer momento escolhendo outro status de novo) - trava só o <select>
  // que está sendo salvo (por id), pra não disparar 2 chamadas simultâneas
  // na mesma linha se o usuário mudar de novo rapidinho.
  const statusSalvandoIds = new Set();

  const ICONE_LIXEIRA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
  const ICONE_LAPIS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  /**
   * Regra de negócio (sessão 2026-08-06, pedido do usuário): a divisão em
   * parcelas só fica disponível pra Recibos de Objeto "Contrato de Gestão
   * (TES)" (comparação exata com o valor escolhido no campo Objeto - lista
   * gerenciada em Listas Personalizadas), e o split é sempre fixo (não
   * editável pelo usuário). Isolado aqui em constantes pra ser fácil de
   * mudar no futuro (outro objeto-gatilho, outro split) sem caçar número
   * mágico pelo arquivo inteiro - ver semearParcelasTes_/
   * adicionarLinhaParcelaDividida_. A parcela cujo percentual é o MAIOR do
   * array é a que aceita múltiplas Ordens Bancárias (hoje a de 70%).
   */
  const OBJETO_CONTRATO_GESTAO_TES = 'CONTRATO DE GESTÃO (TES)';
  const PARCELA_DIVIDIDA_TES_PERCENTUAIS = [70, 30];
  const PARCELA_DIVIDIDA_TES_PERCENTUAL_MULTI_OB = Math.max(...PARCELA_DIVIDIDA_TES_PERCENTUAIS);

  function ehObjetoContratoGestaoTes_(objeto) {
    return String(objeto || '').trim().toUpperCase() === OBJETO_CONTRATO_GESTAO_TES;
  }

  /**
   * Mostra/esconde o bloco do checkbox "mais de uma parcela" conforme o
   * Objeto escolhido é ou não Contrato de Gestão (TES). Se o Objeto deixar
   * de ser TES enquanto o checkbox estava marcado, desmarca e volta pro modo
   * parcela única sozinho, pra não deixar o formulário num estado
   * inconsistente (checkbox marcado sem poder editar as parcelas).
   */
  function atualizarVisibilidadeParcelaDivididaTes_(blocoCheckboxId, checkboxId, blocoUnicoId, blocoDivididoId, linhasContainerId, objeto) {
    const ehTes = ehObjetoContratoGestaoTes_(objeto);
    document.getElementById(blocoCheckboxId).classList.toggle('oculto', !ehTes);
    const checkbox = document.getElementById(checkboxId);
    if (!ehTes && checkbox.checked) {
      checkbox.checked = false;
      document.getElementById(blocoUnicoId).classList.remove('oculto');
      document.getElementById(blocoDivididoId).classList.add('oculto');
      document.getElementById(linhasContainerId).innerHTML = '';
    }
  }

  /** Semeia as N parcelas fixas de um Recibo dividido de Contrato de Gestão (TES) - hoje 70%/30% (PARCELA_DIVIDIDA_TES_PERCENTUAIS). `dadosPorPercentual` (opcional) - ex. `{70: {...}}` - pré-popula a parcela daquele percentual (usado ao converter um Recibo avulso já existente). */
  function semearParcelasTes_(containerId, obterNotaEmpenho, dadosPorPercentual) {
    PARCELA_DIVIDIDA_TES_PERCENTUAIS.forEach(percentual => {
      const dadosExistentes = dadosPorPercentual && dadosPorPercentual[percentual];
      adicionarLinhaParcelaDividida_(containerId, obterNotaEmpenho, dadosExistentes, { percentualFixo: percentual });
    });
  }

  /**
   * filtroInicial (opcional, vindo do Dashboard via App.navegarPara): pré-
   * seleciona Competência/Status antes da primeira carga, e/ou abre um Recibo
   * específico direto (abrirId) depois dela - ver definirValoresFiltroMultiplo
   * (js/app.js) e abrirReciboExistente abaixo.
   */
  async function render(filtroInicial) {
    // Sai do modo de seleção em lote sempre que a tela é (re)aberta - ver
    // mesmo comentário/motivo em js/sof.js (bug relatado pelo usuário: trocar
    // de aba sem clicar Cancelar mantinha a borda pontilhada de seleção nos
    // cards ao voltar pra esta tela).
    modoSelecaoLote = false;
    idsSelecionadosLote_.clear();
    const [unidadesCarregadas, statusFiltroOpcoesBrutas, opcoesOss, opcoesObjeto] = await Promise.all([
      Api.chamar('listarUnidades', { somenteAtivas: true, pageSize: 100000 }, { cache: true }),
      carregarOpcoesStatus_(),
      TelaListas.obterOpcoes('OSS'),
      TelaListas.obterOpcoes('OBJETO')
    ]);
    const vistosStatus_ = new Set();
    const statusFiltroOpcoes = statusFiltroOpcoesBrutas.filter(o => (vistosStatus_.has(o.valor) ? false : (vistosStatus_.add(o.valor), true)));
    statusOpcoesTodasAtual = statusFiltroOpcoesBrutas;
    unidades = unidadesCarregadas.items;
    const tiposUnidade = Array.from(new Set(unidades.map(u => u.tipo).filter(Boolean))).sort();
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">Recibos</h2>
      <div class="grade-indicadores" id="recIndicadores"></div>
      <div class="painel">
        <div class="barra-filtros">
          <div class="campo campo-tamanho-pagina"><label>Itens por página</label>
            <select id="recTamanhoPaginaTopo">${UI.opcoesTamanhoPaginaHtml(tamanhoPagina === TAMANHO_PAGINA_TODOS_ ? 'todos' : tamanhoPagina)}</select>
          </div>
          <div class="campo campo-busca-livre"><label>Busca livre</label>
            <input type="text" id="recBusca" placeholder="processo, ordem bancária, valor..." /><button type="button" class="busca-livre-x" data-alvo="recBusca" title="Limpar busca livre">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Unidade</label>
            <div id="recFiltroUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroUnidade" title="Limpar filtro de Unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">OSS</label>
            <div id="recFiltroOss"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroOss" title="Limpar filtro de OSS">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Objeto</label>
            <div id="recFiltroObjeto"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroObjeto" title="Limpar filtro de Objeto">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Tipo de unidade</label>
            <div id="recFiltroTipoUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroTipoUnidade" title="Limpar filtro de Tipo de unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">DEA</label>
            <div id="recFiltroDea"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroDea" title="Limpar filtro de DEA">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Competência</label>
            <div id="recFiltroCompetencia"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroCompetencia" title="Limpar filtro de Competência">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Ano</label>
            <div id="recFiltroAno"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroAno" title="Limpar filtro de Ano">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Fonte</label>
            <div id="recFiltroFonte"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroFonte" title="Limpar filtro de Fonte">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Status</label>
            <div id="recFiltroStatus"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroStatus" title="Limpar filtro de Status">&times;</button>
          </div>
          <div class="campo"><label>Contrato de Gestão</label><input id="recFiltroContratoGestao" placeholder="Contrato de Gestão" /></div>
          <div class="campo"><label>Nota de Empenho</label><input id="recFiltroNotaEmpenho" placeholder="Nota de Empenho" /></div>
          <div class="campo"><label>Nº Processo</label><input id="recFiltroNumeroProcesso" placeholder="Nº Processo" /></div>
          <button class="botao" id="btnFiltrarRec">Filtrar</button>
          <button class="botao botao-limpar-filtros" id="btnLimparFiltrosRec">Limpar filtros</button>
          <button class="botao" id="btnGerarRelatorioRec">Gerar Relatório</button>
          <button class="botao" id="btnModoSelecaoLoteRec">Apagar Recibos</button>
          <div class="acao-gerar-meta">
            <div class="campo"><label>Competência p/ gerar</label><select id="recCompetenciaGerarMeta">${UI.opcoesCompetenciaHtml(mesAtualComoCompetencia_())}</select></div>
            <button class="botao" id="btnGerarRecibosMeta" title="Cria um card em branco (sem Nº Processo) pra cada meta ativa que ainda não tem recibo nessa competência">Gerar recibos da meta</button>
          </div>
          <span style="flex:1"></span>
          <button class="botao primario" id="btnNovoRecibo">+ Novo processo</button>
        </div>
        <div class="barra-selecao-lote oculto" id="barraSelecaoLoteRec">
          <label class="rotulo-checkbox"><input type="checkbox" id="chkSelecionarTodosRec" /> Selecionar todos</label>
          <span id="contagemSelecaoLoteRec">0 selecionado(s)</span>
          <button type="button" class="botao perigo" id="btnExcluirSelecionadosRec" disabled>Excluir selecionados</button>
          <button type="button" class="botao" id="btnCancelarSelecaoLoteRec">Cancelar</button>
        </div>
        <div id="listaRecibos"></div>
        <div class="paginacao" id="paginacaoRec"></div>
      </div>`;

    document.getElementById('btnFiltrarRec').addEventListener('click', () => { if (filtrosMudaram_()) { paginaAtual = 1; carregar(); } });
    ['recBusca', 'recFiltroContratoGestao', 'recFiltroNotaEmpenho', 'recFiltroNumeroProcesso'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter' && filtrosMudaram_()) { paginaAtual = 1; carregar(); }
      });
    });
    document.getElementById('btnNovoRecibo').addEventListener('click', async function () {
      this.disabled = true;
      try { await abrirFormularioNovo(); } finally { this.disabled = false; }
    });
    document.getElementById('btnGerarRelatorioRec').addEventListener('click', abrirGerarRelatorio);
    document.getElementById('btnGerarRecibosMeta').addEventListener('click', async function () {
      const competencia = document.getElementById('recCompetenciaGerarMeta').value;
      if (!competencia) { UI.toast('Escolha a competência.', 'erro'); return; }
      this.disabled = true;
      try {
        const resposta = await Api.chamar('gerarRecibosMeta', { competencia });
        Api.invalidarCache('listarRecibos');
        CacheAbas.invalidar('recibos');
        CacheAbas.invalidar('dashboard');
        if (resposta.criados === 0) {
          UI.toast('Nenhuma meta pendente para essa competência - toda meta ativa já tem recibo.', 'info');
        } else {
          UI.toast(`${resposta.criados} card(s) criado(s), em branco, pra completar (destacados até o Nº Processo ser preenchido).`, 'sucesso');
          paginaAtual = 1;
          await carregar();
        }
      } catch (err) {
        UI.toast(err.message, 'erro');
      } finally {
        this.disabled = false;
      }
    });
    document.getElementById('btnModoSelecaoLoteRec').addEventListener('click', () => alternarModoSelecaoLote_());
    document.getElementById('btnCancelarSelecaoLoteRec').addEventListener('click', () => alternarModoSelecaoLote_(false));
    document.getElementById('btnExcluirSelecionadosRec').addEventListener('click', excluirSelecionadosLoteClique_);
    document.getElementById('chkSelecionarTodosRec').addEventListener('change', function () {
      idsSelecionadosLote_ = this.checked ? new Set(itens.map(i => String(i.id))) : new Set();
      atualizarBarraSelecaoLote_();
      renderTabela();
    });
    // Seletor "Itens por página" duplicado no topo - ver mesma explicação em js/sof.js.
    document.getElementById('recTamanhoPaginaTopo').addEventListener('change', function () { mudarTamanhoPagina_(this.value); });
    // Opções INICIAIS - a partir da primeira carga elas vêm das facetas do
    // backend (ver FACETAS_REC_/aplicarResposta_). Substitui o estreitamento
    // antigo, que valia só para Unidade/Tipo/OSS.
    UI.criarFiltroMultiplo('recFiltroUnidade', unidades.map(u => ({ valor: u.id, rotulo: u.nome })));
    UI.criarFiltroMultiplo('recFiltroOss', opcoesOss.map(o => o.valor));
    UI.criarFiltroMultiplo('recFiltroObjeto', opcoesObjeto.map(o => o.valor));
    UI.criarFiltroMultiplo('recFiltroTipoUnidade', tiposUnidade);
    UI.criarFiltroMultiplo('recFiltroDea', ['SIM', 'NÃO']);
    UI.criarFiltroMultiplo('recFiltroCompetencia', UI.listaCompetencias());
    UI.criarFiltroMultiplo('recFiltroAno', UI.listaAnos());
    UI.criarFiltroMultiplo('recFiltroFonte', ['TESOURO', 'SUS', 'Outra']);
    UI.criarFiltroMultiplo('recFiltroStatus', statusFiltroOpcoes.map(o => o.valor));
    // Competência (sessão 2026-08-31, pedido do usuário: "todas as linhas
    // referente áquele mês já sejam carregadas juntos" ao entrar na aba) -
    // sem competência explícita vinda de fora (navegação normal pelo menu),
    // o padrão passa a ser o mês atual, com "Por página" em "Todos" (ver
    // logo abaixo) - o usuário ainda pode trocar os dois livremente depois.
    UI.definirValoresFiltroMultiplo('recFiltroCompetencia', (filtroInicial && filtroInicial.competencia) || [mesAtualComoCompetencia_()]);
    if (!(filtroInicial && filtroInicial.competencia)) {
      // paginaAtual também precisa voltar pra 1 aqui: ela sobrevive entre
      // visitas à aba (mesmo princípio de "lembra onde parou" já usado
      // nesta tela), mas uma página > 1 salva de uma visita anterior com
      // outro tamanhoPagina ficaria fora do intervalo real com TODOS.
      tamanhoPagina = TAMANHO_PAGINA_TODOS_;
      paginaAtual = 1;
      // O seletor do topo já foi montado no HTML acima, ANTES deste reset
      // rodar - sem isso ficaria mostrando o tamanho da visita anterior
      // (ex. "20") mesmo com tamanhoPagina já em TODOS por baixo dos panos.
      document.getElementById('recTamanhoPaginaTopo').value = 'todos';
    }
    if (filtroInicial && filtroInicial.status) UI.definirValoresFiltroMultiplo('recFiltroStatus', filtroInicial.status);
    // unidade_id/objeto (Dashboard, painel "Processos do mês" - Metas de
    // Processos): clique numa linha da tabela de metas já navega pra Recibos
    // com Unidade+Objeto+Competência pré-filtrados, mesmo padrão de
    // pré-seleção usado por competencia/status acima.
    if (filtroInicial && filtroInicial.unidade_id) UI.definirValoresFiltroMultiplo('recFiltroUnidade', filtroInicial.unidade_id);
    if (filtroInicial && filtroInicial.objeto) UI.definirValoresFiltroMultiplo('recFiltroObjeto', filtroInicial.objeto);
    // statusExceto (Dashboard, card de Recibos): seleciona todos os status
    // conhecidos MENOS os informados - é como o filtro múltiplo (que é
    // "incluir X") expressa um "status diferente de PAGO".
    if (filtroInicial && filtroInicial.statusExceto) {
      const excluir = filtroInicial.statusExceto.map(s => String(s).toUpperCase());
      const selecionar = statusFiltroOpcoes.map(o => o.valor)
        .filter(v => excluir.indexOf(String(v).toUpperCase()) === -1);
      UI.definirValoresFiltroMultiplo('recFiltroStatus', selecionar);
    }
    UI.ligarLimpezaFiltros('.barra-filtros', 'btnLimparFiltrosRec', () => {
      if (filtrosMudaram_()) { paginaAtual = 1; carregar(); }
    }, aoLimparFiltroIndividual_);
    await carregar();
    if (filtroInicial && filtroInicial.abrirId) abrirReciboExistente(filtroInicial.abrirId);
  }

  /** Evita reler a lista/mostrar o spinner quando Filtrar/Limpar filtros/"x" não mudam nada de fato. */
  function filtrosMudaram_() {
    return JSON.stringify(filtrosAtuais()) !== ultimoFiltroJson;
  }

  function filtrosAtuais() {
    return {
      busca: document.getElementById('recBusca').value.trim(),
      unidade_id: UI.valoresFiltroMultiplo('recFiltroUnidade'),
      oss: UI.valoresFiltroMultiplo('recFiltroOss'),
      objeto: UI.valoresFiltroMultiplo('recFiltroObjeto'),
      tipo_unidade: UI.valoresFiltroMultiplo('recFiltroTipoUnidade'),
      dea: UI.valoresFiltroMultiplo('recFiltroDea'),
      competencia: UI.valoresFiltroMultiplo('recFiltroCompetencia'),
      // Ano derivado da própria competência ("jul.26" -> "2026"), ver
      // anoDaCompetencia_ em backend/Recibos.gs. Combina com Competência por E.
      ano: UI.valoresFiltroMultiplo('recFiltroAno'),
      fonte: UI.valoresFiltroMultiplo('recFiltroFonte'),
      status: UI.valoresFiltroMultiplo('recFiltroStatus'),
      contrato_gestao: document.getElementById('recFiltroContratoGestao').value.trim(),
      nota_empenho: document.getElementById('recFiltroNotaEmpenho').value.trim(),
      numero_processo: document.getElementById('recFiltroNumeroProcesso').value.trim()
    };
  }

  /**
   * Mesmo formato "vazio" de filtrosAtuais(), sem depender do DOM - ver
   * mesma função em js/sof.js. Usada só por preCarregar(); competencia já
   * vem no mês atual e não `[]`, pra bater com o filtro padrão que render()
   * aplica quando não há competência explícita (ver comentário lá) - senão
   * a pré-carga aqueceria uma chave de cache que o 1º render() real nunca usa.
   */
  function filtrosPadrao_() {
    return {
      busca: '', unidade_id: [], oss: [], objeto: [], tipo_unidade: [], dea: [],
      competencia: [mesAtualComoCompetencia_()], ano: [], fonte: [], status: [],
      contrato_gestao: '', nota_empenho: '', numero_processo: ''
    };
  }

  /** Pré-carrega os dados desta tela em segundo plano - ver mesma função em js/sof.js. */
  async function preCarregar() {
    try {
      await Promise.all([
        Api.chamar('listarUnidades', { somenteAtivas: true, pageSize: 100000 }, { cache: true, silencioso: true }),
        carregarOpcoesStatus_({ silencioso: true }),
        TelaListas.obterOpcoes('OSS', { silencioso: true }),
        TelaListas.obterOpcoes('OBJETO', { silencioso: true })
      ]);
      const params = Object.assign({ page: 1, pageSize: TAMANHO_PAGINA_TODOS_ }, filtrosPadrao_());
      await CacheAbas.comRevalidacao('recibos', params,
        (opcoes) => Api.chamar('listarRecibos', params, Object.assign({ silencioso: true }, opcoes)),
        () => {}
      );
    } catch (e) { /* pré-carga é best-effort */ }
  }

  /** Chave de filtrosAtuais() correspondente a cada id de filtro-multiplo da barra - ver aoLimparFiltroIndividual_. */
  const CHAVE_POR_FILTRO_ = {
    recFiltroUnidade: 'unidade_id', recFiltroOss: 'oss', recFiltroObjeto: 'objeto',
    recFiltroTipoUnidade: 'tipo_unidade', recFiltroDea: 'dea', recFiltroCompetencia: 'competencia',
    recFiltroAno: 'ano', recFiltroFonte: 'fonte', recFiltroStatus: 'status', recBusca: 'busca'
  };

  /**
   * "x" individual de um filtro: recarrega usando o último filtro realmente
   * aplicado (ultimoFiltroJson), só com este campo zerado por cima - ver
   * mesma função em js/sof.js para a explicação completa.
   */
  function aoLimparFiltroIndividual_(idCampo) {
    const chave = CHAVE_POR_FILTRO_[idCampo];
    if (!chave) return;
    const aplicado = ultimoFiltroJson ? JSON.parse(ultimoFiltroJson) : {};
    // Busca livre zera pra string vazia (é texto, não lista de valores como os demais).
    const filtros = Object.assign({}, aplicado, { [chave]: chave === 'busca' ? '' : [] });
    paginaAtual = 1;
    carregarComFiltros_(filtros);
  }

  async function carregar() {
    await carregarComFiltros_(filtrosAtuais());
  }

  async function carregarComFiltros_(filtros) {
    ultimoFiltroJson = JSON.stringify(filtros);
    const params = Object.assign({ page: paginaAtual, pageSize: tamanhoPagina }, filtros);
    // listarRecibos já devolve os indicadores calculados sobre a mesma leitura/filtro
    // (evita reler a aba Recibos inteira duas vezes numa única troca de aba).
    const resposta = await CacheAbas.comRevalidacao('recibos', params,
      (opcoes) => Api.chamar('listarRecibos', params, opcoes),
      aplicarResposta_
    );
    aplicarResposta_(resposta);
  }

  /** id do widget -> dimensão no mapa de facetas (ver UI.aplicarFacetas). */
  const FACETAS_REC_ = {
    recFiltroUnidade: { chave: 'unidade_id', rotulo: id => (unidades.find(u => String(u.id) === String(id)) || {}).nome || id },
    recFiltroOss: { chave: 'oss' },
    recFiltroObjeto: { chave: 'objeto' },
    recFiltroTipoUnidade: { chave: 'tipo_unidade' },
    recFiltroDea: { chave: 'dea' },
    recFiltroCompetencia: { chave: 'competencia' },
    recFiltroAno: { chave: 'ano' },
    recFiltroFonte: { chave: 'fonte' },
    recFiltroStatus: { chave: 'status' }
  };

  function aplicarResposta_(resposta) {
    itens = resposta.items;
    totalRegistros = resposta.total;
    UI.aplicarFacetas(resposta.facetas, FACETAS_REC_);
    renderTabela();
    renderPaginacao();
    renderIndicadores(resposta.indicadores);
  }

  function renderIndicadores(indicadores) {
    document.getElementById('recIndicadores').innerHTML = `
      <div class="cartao-indicador"><div class="valor">${indicadores.pendentes}</div><div class="rotulo">Pendentes (status ≠ PAGO)</div></div>
      <div class="cartao-indicador"><div class="valor">${UI.formatarMoeda(indicadores.total_pago_ano)}</div><div class="rotulo">Total pago no ano</div></div>
      <div class="cartao-indicador" title="Parcela mensal regular de toda unidade ativa × 12, menos o total pago no ano"><div class="valor">${UI.formatarMoeda(indicadores.total_a_pagar)}</div><div class="rotulo">Total a pagar no ano</div></div>`;
  }

  /**
   * <select> de status editável direto na listagem (sessão 2026-08-07,
   * pedido do usuário: "alterar o Status pela própria tela dos recibos sem
   * ter de entrar para editar"). Reaproveita opcoesStatusHtml_/
   * filtrarOpcoesStatusPorFonte_ (mesma regra de filtro por Fonte já usada
   * no formulário de edição) e corStatusReciboEstilo (mesmas cores do selo
   * de sempre, só que aplicadas ao próprio <select> em vez de um <span>).
   * data-status-anterior guarda o valor pra poder reverter visualmente se a
   * gravação falhar (ver aoMudarStatusInline_).
   */
  function celulaStatusHtml_(r) {
    const opcoesFiltradas = filtrarOpcoesStatusPorFonte_(statusOpcoesTodasAtual, r.fonte);
    return `<select class="select-status-recibo" data-id="${r.id}" data-status-anterior="${UI.escaparHtml(r.status || '')}" style="${UI.corStatusReciboEstilo(r.status)}">${opcoesStatusHtml_(opcoesFiltradas, r.status)}</select>`;
  }

  /**
   * Grava o novo status na hora (sem confirmação - é reversível escolhendo
   * outro status de novo) via o mesmo atualizarRecibo do formulário de
   * edição, mandando só `status` (os demais campos do Recibo não são
   * tocados). statusSalvandoIds evita 2 gravações simultâneas na mesma
   * linha; em caso de erro, volta o <select> pro valor anterior. Em caso de
   * sucesso, recarrega a lista inteira (mesmo padrão de excluir/editar) -
   * o status pode mudar o indicador "Pendentes" e o destaque "Parado".
   */
  async function aoMudarStatusInline_(select) {
    const id = select.dataset.id;
    if (statusSalvandoIds.has(id)) return;
    const statusAnterior = select.dataset.statusAnterior || '';
    const novoStatus = select.value;
    statusSalvandoIds.add(id);
    select.disabled = true;
    try {
      await Api.chamar('atualizarRecibo', { id, data: { status: novoStatus } });
      CacheAbas.invalidar('recibos');
      UI.toast('Status atualizado.', 'sucesso');
      await carregar();
    } catch (err) {
      UI.toast(err.message, 'erro');
      select.value = statusAnterior;
      select.disabled = false;
    } finally {
      statusSalvandoIds.delete(id);
    }
  }

  /**
   * Números de OB já anexados a este Recibo, pra coluna "Ordem Bancária"
   * (sessão 2026-08-13, pedido do usuário: "quando forem adicionadas a(s)
   * OB(s), o número da OB apareça na coluna Ordem Bancária") - prioriza a
   * lista (RecibosOrdensBancarias, pode ter mais de uma - ver
   * agruparOrdensBancariasPorRecibo_, Recibos.gs), cai pro campo único
   * antigo (ordem_bancaria) só se a lista vier vazia (Recibo ainda não
   * migrado pra esse formato).
   */
  function textoOrdensBancarias_(r) {
    const numeros = (r.ordens_bancarias || []).map(o => o.numero_ob).filter(Boolean);
    if (numeros.length) return numeros.join(', ');
    return r.ordem_bancaria || '';
  }

  /**
   * Diz ESPECIFICAMENTE qual divergência de valores existe (sessão
   * 2026-08-13, pedido do usuário: "ao passar o mouse por cima da
   * notificação de erro, seja informado qual é o erro") - mesma regra de
   * recalcularAlertaRecibo_ (Recibos.gs): (a) Valor Liquidado diferente do
   * Valor Pago DESTA linha; (b) soma do Valor Pago de TODO o grupo diferente
   * da Parcela Contratual. `linhasDoGrupo` é opcional - Recibo avulso (sem
   * grupo) usa só a própria linha pra (b), já que "grupo" é ele mesmo.
   */
  function descricaoDivergenciaValores_(r, linhasDoGrupo) {
    const motivos = [];
    if (Math.abs((Number(r.valor_liquidado) || 0) - (Number(r.valor_pago) || 0)) > 0.01) {
      motivos.push('Valor Liquidado diferente do Valor Pago');
    }
    const grupo = linhasDoGrupo || [r];
    const somaPago = grupo.reduce((s, x) => s + (Number(x.valor_pago) || 0), 0);
    if (Math.abs(somaPago - (Number(r.parcela_contratual) || 0)) > 0.01) {
      motivos.push(grupo.length > 1 ? 'Soma do Valor Pago das parcelas diferente da Parcela Contratual' : 'Valor Pago diferente da Parcela Contratual');
    }
    return motivos.join(' e ') || 'Divergência de valores';
  }

  /**
   * Texto "Fulano · dd/mm/aaaa" (+ "· +N observação(ões)" se houver mais de
   * uma) sobre a observação mais recente de um Recibo/grupo - usado tanto na
   * tabela (tooltip) quanto no card de parcela dividida (linha visível
   * embaixo do texto), pra não duplicar a montagem em dois lugares.
   */
  function metaUltimaObservacao_(r) {
    if (!r.ultima_observacao) return '';
    const extra = r.observacoes_count > 1 ? ` · +${r.observacoes_count - 1} observação(ões)` : '';
    return `${r.ultima_observacao.autor_nome} · ${UI.formatarData(r.ultima_observacao.data)}${extra}`;
  }

  /** 1ª célula de cada linha (tabela simples ou dentro de um card de parcela dividida): checkbox de seleção em lote, ou o botão de excluir de sempre. */
  function celulaAcaoLinhaRecibo_(id) {
    if (modoSelecaoLote) {
      return `<input type="checkbox" class="checkbox-selecao-lote" data-id="${id}" ${idsSelecionadosLote_.has(String(id)) ? 'checked' : ''} title="Selecionar para excluir" />`;
    }
    return `<button type="button" class="botao-icone excluir" data-acao="excluir" title="Excluir">${ICONE_LIXEIRA}</button>`;
  }

  function linhaReciboHtml_(r) {
    const unidade = unidades.find(u => u.id === r.unidade_id);
    // Destaque (sessão 2026-08-27, pedido do usuário): sem Nº Processo
    // ainda, o processo não "chegou" de verdade (ver dashboardMetasProcessos_,
    // Dashboard.gs) - vale pra qualquer recibo sem o campo preenchido, não só
    // os gerados por "Gerar recibos da meta" (mesma classe .linha-parada já
    // usada em SOF, cor diferente pra não confundir os dois avisos).
    const classeDestaque = r.numero_processo ? '' : 'linha-sem-processo';
    return `<tr data-id="${r.id}" class="${classeDestaque}">
      <td>${celulaAcaoLinhaRecibo_(r.id)}</td>
      <td>${UI.escaparHtml(unidade ? unidade.nome : r.unidade_id)}</td>
      <td>${UI.escaparHtml(r.objeto || '-')}</td>
      <td>${UI.escaparHtml(r.numero_processo)}</td>
      <td>${UI.escaparHtml(r.competencia)}</td>
      <td>${UI.formatarMoeda(r.valor_liquidado)}</td>
      <td>${UI.formatarMoeda(r.valor_pago)}${r.alerta_divergencia_valores ? ` <span class="selo vermelho" title="${UI.escaparHtml(descricaoDivergenciaValores_(r))}">!</span>` : ''}</td>
      <td>${UI.escaparHtml(textoOrdensBancarias_(r))}</td>
      <td>${celulaStatusHtml_(r)}</td>
      <td>${r.ultima_observacao ? `<span title="${UI.escaparHtml(metaUltimaObservacao_(r))}">${UI.escaparHtml(r.ultima_observacao.texto)}</span>` : '-'}</td>
    </tr>`;
  }

  function tabelaRecibosHtml_(linhas) {
    return `
      <table class="tabela">
        <thead><tr><th></th><th>Unidade</th><th>Objeto</th><th>Nº Processo</th><th>Competência</th><th>Valor Liquidado</th><th>Valor Pago</th><th>Ordem Bancária</th><th>Status</th><th>Observações</th></tr></thead>
        <tbody>${linhas.map(linhaReciboHtml_).join('')}</tbody>
      </table>`;
  }

  /**
   * Card destacado pra um grupo de parcela dividida (sessão 2026-08-07,
   * pedido do usuário: "quero que essas parcelas apareçam em destaque...
   * para não se confundir os outros pagamento") - vale pra qualquer grupo
   * (parcela_dividida_grupo_id preenchido), não só os de Contrato de Gestão
   * (TES). Unidade/Objeto/Nº Processo/Competência (compartilhados pelas
   * parcelas do mesmo pagamento) aparecem 1x só no cabeçalho do card; a
   * tabelinha embaixo mostra só o que muda entre as parcelas: percentual,
   * valores, OB e status (cada linha com seu próprio <select> de status,
   * já que cada parcela pode estar numa etapa diferente do fluxo).
   * Observações (sessão 2026-08-26, comentários com autor+data) são
   * compartilhadas pelo grupo - todas as parcelas de um mesmo processo
   * dividido têm a MESMA lista (ver chaveObservacaoRecibo_, backend/Recibos.gs)
   * - por isso só a mais recente aparece 1x no cabeçalho (com autor/data e
   * "+N" se houver mais), igual Unidade/Objeto; a thread completa (com quem
   * escreveu e quando cada uma) mora no modal de edição.
   */
  function cartaoGrupoReciboHtml_(linhasDoGrupo) {
    const ordenadas = linhasDoGrupo.slice().sort((a, b) => (Number(b.percentual_parcela_dividida) || 0) - (Number(a.percentual_parcela_dividida) || 0));
    const primeira = ordenadas[0];
    const unidade = unidades.find(u => u.id === primeira.unidade_id);
    // Mesmo destaque de linhaReciboHtml_ (ver comentário lá) - aqui o grupo
    // inteiro compartilha um só Nº Processo, então o destaque olha só a
    // primeira parcela (representa o grupo inteiro).
    const classeDestaque = primeira.numero_processo ? '' : 'cartao-grupo-recibo-sem-processo';
    return `
      <div class="cartao-grupo-recibo ${classeDestaque}">
        <div class="cartao-grupo-recibo-cabecalho">
          <span class="cartao-grupo-recibo-titulo">🔗 ${UI.escaparHtml(unidade ? unidade.nome : primeira.unidade_id)} · ${UI.escaparHtml(primeira.objeto || '-')}</span>
          <span class="cartao-grupo-recibo-meta">
            ${primeira.numero_processo ? `Nº Processo ${UI.escaparHtml(primeira.numero_processo)}` : ''}
            ${primeira.competencia ? ` · Competência ${UI.escaparHtml(primeira.competencia)}` : ''}
          </span>
        </div>
        ${primeira.ultima_observacao ? `<p class="cartao-grupo-recibo-observacao">💬 ${UI.escaparHtml(primeira.ultima_observacao.texto)}<br><span class="cartao-grupo-recibo-observacao-meta">${UI.escaparHtml(metaUltimaObservacao_(primeira))}</span></p>` : ''}
        <div class="tabela-reforcos-wrap">
          <table class="tabela">
            <thead><tr><th></th><th>Parcela</th><th>Valor Liquidado</th><th>Valor Pago</th><th>Ordem Bancária</th><th>Status</th></tr></thead>
            <tbody>${ordenadas.map(r => `
              <tr data-id="${r.id}">
                <td>${celulaAcaoLinhaRecibo_(r.id)}</td>
                <td>${r.percentual_parcela_dividida !== '' && r.percentual_parcela_dividida !== undefined ? UI.escaparHtml(String(r.percentual_parcela_dividida)) + '%' : '-'}</td>
                <td>${UI.formatarMoeda(r.valor_liquidado)}</td>
                <td>${UI.formatarMoeda(r.valor_pago)}${r.alerta_divergencia_valores ? ` <span class="selo vermelho" title="${UI.escaparHtml(descricaoDivergenciaValores_(r, ordenadas))}">!</span>` : ''}</td>
                <td>${UI.escaparHtml(textoOrdensBancarias_(r))}</td>
                <td>${celulaStatusHtml_(r)}</td>
              </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>`;
  }

  /**
   * Agrupa itens da página atual por parcela_dividida_grupo_id, preservando
   * a ordem de 1ª ocorrência (a lista já vem ordenada por data_criacao
   * desc). Só agrupa linhas que estão na MESMA página - se as parcelas de
   * um grupo caírem em páginas diferentes (raro, só no limite exato de 20
   * registros), a que sobrar aparece como linha avulsa normal.
   */
  function agruparItensParaTabela_(lista) {
    const vistos = new Set();
    const blocos = [];
    lista.forEach(r => {
      if (vistos.has(r.id)) return;
      if (r.parcela_dividida_grupo_id) {
        const doGrupo = lista.filter(x => x.parcela_dividida_grupo_id === r.parcela_dividida_grupo_id);
        doGrupo.forEach(x => vistos.add(x.id));
        blocos.push({ tipo: 'grupo', grupoId: r.parcela_dividida_grupo_id, linhas: doGrupo });
      } else {
        vistos.add(r.id);
        blocos.push({ tipo: 'unica', linha: r });
      }
    });
    return blocos;
  }

  function renderTabela() {
    const alvo = document.getElementById('listaRecibos');
    if (!itens.length) { alvo.innerHTML = '<p class="estado-vazio">Nenhum recibo encontrado.</p>'; return; }

    // Linhas avulsas consecutivas ficam juntas numa tabela só (evita repetir
    // cabeçalho pra cada uma); um grupo de parcela dividida interrompe a
    // tabela corrente e vira seu próprio card (ver cartaoGrupoReciboHtml_).
    const blocos = agruparItensParaTabela_(itens);
    const partes = [];
    let bufferUnicas = [];
    const flush = () => { if (bufferUnicas.length) { partes.push(tabelaRecibosHtml_(bufferUnicas)); bufferUnicas = []; } };
    blocos.forEach(b => {
      if (b.tipo === 'unica') { bufferUnicas.push(b.linha); return; }
      flush();
      partes.push(cartaoGrupoReciboHtml_(b.linhas));
    });
    flush();
    alvo.innerHTML = partes.join('');

    alvo.querySelectorAll('tr[data-id]').forEach(tr => {
      if (modoSelecaoLote) {
        const chk = tr.querySelector('.checkbox-selecao-lote');
        chk.addEventListener('click', e => e.stopPropagation());
        chk.addEventListener('change', () => {
          if (chk.checked) idsSelecionadosLote_.add(tr.dataset.id); else idsSelecionadosLote_.delete(tr.dataset.id);
          atualizarBarraSelecaoLote_();
        });
        return;
      }
      tr.addEventListener('click', () => abrirReciboExistente(tr.dataset.id));
      tr.querySelector('[data-acao="excluir"]').addEventListener('click', e => {
        e.stopPropagation();
        confirmarExclusaoRecibo(tr.dataset.id);
      });
    });
    // Select de status: clicar pra abrir/escolher não pode "vazar" o clique
    // pra linha (que abriria o modal de edição inteiro).
    alvo.querySelectorAll('.select-status-recibo').forEach(select => {
      select.addEventListener('click', e => e.stopPropagation());
      select.addEventListener('change', e => {
        e.stopPropagation();
        aoMudarStatusInline_(select);
      });
    });
  }

  /** Muda tamanhoPagina a partir de qualquer um dos dois seletores (topo/embaixo) e sincroniza o outro - ver mesma função em js/sof.js. */
  function mudarTamanhoPagina_(valorSelecionado) {
    tamanhoPagina = valorSelecionado === 'todos' ? TAMANHO_PAGINA_TODOS_ : Number(valorSelecionado);
    paginaAtual = 1;
    ['recTamanhoPaginaTopo', 'recTamanhoPagina'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = valorSelecionado;
    });
    carregar();
  }

  function renderPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(totalRegistros / tamanhoPagina));
    document.getElementById('paginacaoRec').innerHTML = `
      <span>${totalRegistros} registro(s) - página ${paginaAtual} de ${totalPaginas}</span>
      <div class="paginacao-tamanho"><label for="recTamanhoPagina">Por página</label>
        <select id="recTamanhoPagina">${UI.opcoesTamanhoPaginaHtml(tamanhoPagina === TAMANHO_PAGINA_TODOS_ ? 'todos' : tamanhoPagina)}</select>
      </div>
      <div class="botoes">
        <button class="botao" id="recPagAnterior" ${paginaAtual <= 1 ? 'disabled' : ''}>Anterior</button>
        <button class="botao" id="recPagProxima" ${paginaAtual >= totalPaginas ? 'disabled' : ''}>Próxima</button>
      </div>`;
    document.getElementById('recPagAnterior').addEventListener('click', () => { paginaAtual--; carregar(); });
    document.getElementById('recPagProxima').addEventListener('click', () => { paginaAtual++; carregar(); });
    document.getElementById('recTamanhoPagina').addEventListener('change', function () { mudarTamanhoPagina_(this.value); });
  }

  /**
   * "Gerar Relatório" (sessão 2026-08-08): escolha de colunas + agrupamento +
   * as 4 saídas (tela/PDF/CSV/Sheets), com os filtros já aplicados na tela.
   * Modal compartilhado com Unidades e Notas de Empenho
   * (TelaRelatorios.abrirParaTela, js/relatorios.js).
   *
   * Substituiu de vez o antigo "Exportar CSV" (sessão 2026-08-14, pedido do
   * usuário) - aquele despejava as colunas cruas da planilha (inclusive ids e
   * URLs de anexo) sem formatação nem totais; este traz colunas com rótulo,
   * moeda formatada, subtotais por grupo e total geral.
   *
   * Os filtros vão via `filtrosAtuais` (a função, não o resultado) pra serem
   * lidos no clique em "Gerar" - se o analista mexer num filtro com o modal
   * aberto, vale o estado do momento da geração.
   */
  function abrirGerarRelatorio() {
    return TelaRelatorios.abrirParaTela({
      fonte: 'recibos',
      titulo: 'Gerar Relatório de Recibos',
      obterFiltros: filtrosAtuais,
      ajuda: 'O relatório usa os filtros aplicados na tela (todas as páginas, não só a visível). Sem filtro, entram todos os recibos.'
    });
  }

  async function abrirReciboExistente(id) {
    if (abrindoLinha) return;
    abrindoLinha = true;
    marcarLinhaCarregando(id, true);
    try {
      const recibo = itens.find(r => r.id === id);
      if (!recibo) return;
      // Abre o formulário na hora, com dado local (zero espera de rede), e
      // checa conflito de edição simultânea em paralelo - ver
      // EdicaoSimultanea/PROGRESS.md (seção de Performance).
      const edicaoPromise = EdicaoSimultanea.iniciarEdicao('Recibo', id);
      await abrirFormularioEdicao(recibo);
      EdicaoSimultanea.tratarConflito(edicaoPromise, 'Recibo', id);
    } finally {
      abrindoLinha = false;
      marcarLinhaCarregando(id, false);
    }
  }

  /** Feedback visual imediato no clique (a linha fica "carregando" enquanto as chamadas de rede resolvem). */
  function marcarLinhaCarregando(id, carregando) {
    const linha = document.querySelector(`tr[data-id="${id}"]`);
    if (linha) linha.classList.toggle('carregando', carregando);
  }

  /** Confirmação grande e em destaque - exclusão é lógica (excluido=true), mesmo padrão de confirmarExclusao em js/unidades.js. */
  /** Liga/desliga o modo de seleção em lote (sessão 2026-08-31) - ver mesma função em js/sof.js. */
  function alternarModoSelecaoLote_(ligar) {
    modoSelecaoLote = typeof ligar === 'boolean' ? ligar : !modoSelecaoLote;
    idsSelecionadosLote_.clear();
    document.getElementById('btnModoSelecaoLoteRec').classList.toggle('ativo', modoSelecaoLote);
    atualizarBarraSelecaoLote_();
    renderTabela();
  }

  function atualizarBarraSelecaoLote_() {
    document.getElementById('barraSelecaoLoteRec').classList.toggle('oculto', !modoSelecaoLote);
    document.getElementById('contagemSelecaoLoteRec').textContent = `${idsSelecionadosLote_.size} selecionado(s)`;
    document.getElementById('btnExcluirSelecionadosRec').disabled = idsSelecionadosLote_.size === 0;
    const chkTodos = document.getElementById('chkSelecionarTodosRec');
    chkTodos.checked = itens.length > 0 && idsSelecionadosLote_.size === itens.length;
    chkTodos.indeterminate = idsSelecionadosLote_.size > 0 && idsSelecionadosLote_.size < itens.length;
  }

  /** Mesmo aviso grande de confirmarExclusaoRecibo, só que pra vários recibos de uma vez (excluirRecibosEmLote). */
  function excluirSelecionadosLoteClique_() {
    if (!idsSelecionadosLote_.size) return;
    const qtd = idsSelecionadosLote_.size;
    const corpo = `<p class="aviso-exclusao">TEM CERTEZA QUE QUER EXCLUIR ${qtd} RECIBO(S)?</p>`;
    UI.abrirModal('Excluir recibos em lote', corpo,
      `<button class="botao" id="btnCancelarExclusaoLoteRec">Cancelar</button><button class="botao perigo" id="btnConfirmarExclusaoLoteRec">Excluir</button>`,
      { pequeno: true });
    document.getElementById('btnCancelarExclusaoLoteRec').addEventListener('click', UI.fecharModal);
    document.getElementById('btnConfirmarExclusaoLoteRec').addEventListener('click', async () => {
      try {
        await Api.chamar('excluirRecibosEmLote', { ids: Array.from(idsSelecionadosLote_) });
        CacheAbas.invalidar('recibos');
        UI.toast('Recibos excluídos.', 'sucesso');
        UI.fecharModal();
        alternarModoSelecaoLote_(false);
        await carregar();
      } catch (err) {
        UI.toast(err.message, 'erro');
      }
    });
  }

  function confirmarExclusaoRecibo(id) {
    const corpo = `<p class="aviso-exclusao">TEM CERTEZA QUE QUER EXCLUIR ESSE PROCESSO?</p>`;
    UI.abrirModal('Excluir recibo', corpo,
      `<button class="botao" id="btnCancelarExclusaoRec">Cancelar</button><button class="botao perigo" id="btnConfirmarExclusaoRec">Excluir</button>`,
      { pequeno: true });

    document.getElementById('btnCancelarExclusaoRec').addEventListener('click', UI.fecharModal);
    document.getElementById('btnConfirmarExclusaoRec').addEventListener('click', async () => {
      try {
        await Api.chamar('excluirRecibo', { id });
        CacheAbas.invalidar('recibos');
        UI.toast('Recibo excluído.', 'sucesso');
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.toast(err.message, 'erro');
      }
    });
  }

  function opcoesUnidade(selecionadaId) {
    return `<option value="">Selecione...</option>` + unidades.map(u => `<option value="${u.id}" ${selecionadaId === u.id ? 'selected' : ''}>${UI.escaparHtml(u.nome)}</option>`).join('');
  }

  async function carregarOpcoesStatus_(opcoes) {
    try { return await TelaListas.obterOpcoes('STATUS_RECIBO', opcoes); } catch (e) { return []; }
  }

  function opcoesStatusHtml_(opcoes, statusAtual) {
    const vistos = new Set();
    const unicas = opcoes.filter(o => (vistos.has(o.valor) ? false : (vistos.add(o.valor), true)));
    return `<option value="">-</option>` + unicas.map(o => `<option ${o.valor === statusAtual ? 'selected' : ''}>${UI.escaparHtml(o.valor)}</option>`).join('');
  }

  /**
   * Fluxo de Status ramificado por fonte (CLSUS/CLTESOURO, CPAG_SUS/CPAG_TESOURO
   * etc.): quando a fonte é SUS, esconde as opções do ramo TESOURO (e
   * vice-versa); fonte "Outra"/vazia usa o ramo TESOURO como padrão. Regex com
   * word-boundary pra não colidir com um status futuro tipo "SUSPENSO".
   */
  function filtrarOpcoesStatusPorFonte_(opcoes, fonte) {
    const usaTesouro = fonte !== 'SUS';
    return opcoes.filter(o => {
      const ehSus = /\bSUS\b/i.test(o.valor);
      const ehTesouro = /\bTESOURO\b/i.test(o.valor);
      if (ehSus && !ehTesouro) return !usaTesouro;
      if (ehTesouro && !ehSus) return usaTesouro;
      return true;
    });
  }

  /** Usada nos formulários de criar/editar - já filtrada pela fonte escolhida. */
  async function opcoesStatus(statusAtual, fonte) {
    const opcoes = await carregarOpcoesStatus_();
    return opcoesStatusHtml_(filtrarOpcoesStatusPorFonte_(opcoes, fonte), statusAtual);
  }

  /** Usada na barra de filtros - sem recorte por fonte, pra listar qualquer status já salvo. */
  async function opcoesStatusFiltro(statusAtual) {
    const opcoes = await carregarOpcoesStatus_();
    return opcoesStatusHtml_(opcoes, statusAtual);
  }

  /** Lê um <input type="file"> opcional e devolve {base64,nome,tipo} ou null se vazio. */
  async function lerAnexoDoInput_(input) {
    const arquivo = input && input.files[0];
    if (!arquivo) return null;
    // Se o anexo já foi lido/validado por OCR no momento em que foi escolhido
    // (ver ligarAnexoComOcr_), reaproveita em vez de reler o arquivo.
    if (input._anexoValidado) return input._anexoValidado;
    if (arquivo.size > 8 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 8MB).');
    const base64 = await UI.lerArquivoBase64(arquivo);
    return { base64, nome: arquivo.name, tipo: arquivo.type };
  }

  /** Monta as <option> de um <datalist> de Notas de Empenho (sessão 2026-07-29). */
  function opcoesDatalistNe_(nes) {
    return nes.map(n => `<option value="${UI.escaparHtml(n.numero_ne)}">${UI.escaparHtml(n.objeto || '')}</option>`).join('');
  }

  /**
   * Ao digitar/escolher (via datalist) um número de Nota de Empenho que bate
   * exatamente com uma NE cadastrada na unidade, sugere o Objeto (e a Fonte)
   * dela nos campos indicados - fecha a cadeia SOF->NE->Recibo (sessão
   * 2026-07-29). Não sobrescreve nada se não houver correspondência exata
   * (nem toda "Nota de Empenho" digitada precisa corresponder a uma NE
   * rastreada no sistema - ex. dado histórico migrado).
   */
  function ligarAutopreenchimentoNe_(inputId, objetoElId, fonteElId, obterNes) {
    const inputEl = document.getElementById(inputId);
    const aplicar = function () {
      const valor = inputEl.value.trim().toLowerCase();
      if (!valor) return;
      const bateu = obterNes().find(n => String(n.numero_ne || '').toLowerCase() === valor);
      if (!bateu) return;
      const objetoEl = document.getElementById(objetoElId);
      if (objetoEl && bateu.objeto) objetoEl.value = bateu.objeto;
      const fonteEl = document.getElementById(fonteElId);
      if (fonteEl && bateu.fonte) fonteEl.value = bateu.fonte;
    };
    inputEl.addEventListener('input', aplicar);
    inputEl.addEventListener('change', aplicar);
  }

  /**
   * Liga um <input type="file"> de anexo (Nota de Liquidação/Ordem Bancária)
   * à leitura automática por OCR (backend `lerAnexoRecibo`): ao escolher o
   * arquivo, lê o valor e confere a Nota de Empenho do documento contra
   * obterNotaEmpenho(). Se bater, trava valorInputEl (somente leitura) com o
   * valor extraído e mostra um link "Remover anexo"; se não bater (ou der
   * erro), limpa o input e avisa, sem travar nada. Reaproveitado nos 3
   * contextos do formulário (novo/parcela dividida/edição).
   *
   * Quando o usuário remove um anexo que já existia salvo no Recibo (edição),
   * marca `inputEl.dataset.removerExistente = '1'` - salvarReciboEdicao lê essa
   * flag pra sinalizar ao backend que deve desanexar
   * (`removerNotaLiquidacaoArquivo`/`removerOrdemBancariaArquivo`). Nos
   * formulários de Recibo novo essa flag simplesmente não é lida por ninguém.
   *
   * `inputEl._numeroDocumentoLido` (sessão 2026-08-06) guarda o número do
   * próprio documento (LE/OB, extraído por OCR - ver `numero_documento` em
   * lerAnexoRecibo), lido em salvarReciboNovo/salvarReciboEdicao pra gravar
   * `nota_liquidacao_numero` e usado pela tabela "Documentos anexados" da
   * parcela de 70% (ver renderTabelaOrdensBancariasParcela_). `aoAtualizar`
   * (opcional) é chamado toda vez que o anexo é lido ou removido, pra quem
   * precisa reagir (ex.: essa mesma tabela, quando a LE muda).
   */
  function ligarAnexoComOcr_({ inputEl, tipo, obterNotaEmpenho, valorInputEl, aoAtualizar }) {
    const statusEl = document.createElement('p');
    statusEl.className = 'ajuda anexo-ocr-status oculto';
    inputEl.insertAdjacentElement('afterend', statusEl);

    function travar(valor, existente, numeroDocumento) {
      valorInputEl.value = valor;
      valorInputEl.readOnly = true;
      inputEl._numeroDocumentoLido = numeroDocumento || '';
      statusEl.classList.remove('oculto');
      statusEl.innerHTML = '🔒 Valor lido do documento. <a href="#" class="anexo-ocr-remover">Remover anexo</a>';
      statusEl.querySelector('.anexo-ocr-remover').addEventListener('click', function (e) {
        e.preventDefault();
        valorInputEl.readOnly = false;
        valorInputEl.value = '';
        inputEl.value = '';
        inputEl._anexoValidado = null;
        inputEl._numeroDocumentoLido = '';
        inputEl.dataset.removerExistente = existente ? '1' : '';
        statusEl.classList.add('oculto');
        if (aoAtualizar) aoAtualizar();
      });
      if (aoAtualizar) aoAtualizar();
    }

    inputEl.addEventListener('change', async function () {
      const arquivo = inputEl.files[0];
      if (!arquivo) return;
      const notaEmpenho = (obterNotaEmpenho() || '').trim();
      if (!notaEmpenho) {
        UI.toast('Preencha a Nota de Empenho antes de anexar este documento.', 'erro');
        inputEl.value = '';
        return;
      }
      try {
        if (arquivo.size > 8 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 8MB).');
        const base64 = await UI.lerArquivoBase64(arquivo);
        const resultado = await Api.chamar('lerAnexoRecibo', {
          tipo, arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type, notaEmpenhoEsperada: notaEmpenho
        });
        inputEl._anexoValidado = { base64, nome: arquivo.name, tipo: arquivo.type };
        inputEl.dataset.removerExistente = '';
        travar(resultado.valor, false, resultado.numero_documento);
      } catch (err) {
        inputEl.value = '';
        inputEl._anexoValidado = null;
        UI.toast(err.message, 'erro');
      }
    });

    return { travar };
  }

  // ===================== NOVO RECIBO (com ou sem parcela dividida) =====================

  async function abrirFormularioNovo() {
    const [statusOpcoes, opcoesObjeto] = await Promise.all([opcoesStatus(null, ''), TelaListas.obterOpcoes('OBJETO')]);
    contadorLinhasParcelaDividida = 0;

    const corpo = `
      <form id="formRecibo">
        <div class="grade-2">
          <div class="campo"><label>Unidade *</label><select id="recUnidade" required>${opcoesUnidade(null)}</select></div>
          <div class="campo"><label>OSS</label><input id="recOss" /></div>
          <div class="campo"><label>CNPJ</label><input id="recCnpj" /></div>
          <div class="campo"><label>Tipo de Unidade</label><input id="recTipoUnidade" /></div>
          <div class="campo"><label>Objeto *</label>
            <select id="recObjeto">
              <option value="">Selecione...</option>
              ${opcoesObjeto.map(o => `<option>${UI.escaparHtml(o.valor)}</option>`).join('')}
            </select>
            <p class="ajuda">Escolhendo um objeto já usado antes para essa unidade, os campos abaixo são preenchidos com o último lançamento (ou, se ainda não houver Recibo, com a Fonte/Nota de Empenho/Parcela já cadastradas na SOF).</p>
          </div>
          <div class="campo"><label>Contrato de Gestão</label><input id="recContratoGestao" /></div>
          <div class="campo"><label>Parcela Contratual</label><input id="recParcelaContratual" type="text" inputmode="decimal" class="campo-moeda" /></div>
          <div class="campo"><label>Fonte</label><select id="recFonte"><option value="">-</option><option>TESOURO</option><option>SUS</option><option>Outra</option></select></div>
          <div class="campo"><label>Nota de Empenho</label>
            <input id="recNotaEmpenho" list="listaNeUnidadeNovo" placeholder="Selecione a unidade pra ver as NEs cadastradas" />
            <datalist id="listaNeUnidadeNovo"></datalist>
          </div>
          <div class="campo"><label>Competência</label><select id="recCompetencia">${UI.opcoesCompetenciaHtml('')}</select></div>
          <div class="campo"><label>Ordem Bancária (nº)</label><input id="recOrdemBancaria" /></div>
          <div class="campo"><label>Nº Processo</label><input id="recNumeroProcesso" /></div>
          <div class="campo"><label>Status</label><select id="recStatus">${statusOpcoes}</select></div>
        </div>
        <div class="campo"><label>Observação inicial</label><textarea id="recObservacaoInicial" rows="2"></textarea>
          <p class="ajuda">Fica registrada com seu nome e a data de hoje. Novas observações (de você ou de outros usuários) podem ser adicionadas depois, na edição do processo.</p>
        </div>
        <div class="campo oculto" id="recBlocoTemParcelaDividida"><label><input type="checkbox" id="recTemParcelaDividida" /> Este pagamento é feito por mais de uma parcela?</label>
          <p class="ajuda">Disponível pra Objeto "${UI.escaparHtml(OBJETO_CONTRATO_GESTAO_TES)}" - divide automaticamente em ${UI.escaparHtml(PARCELA_DIVIDIDA_TES_PERCENTUAIS.join('%/'))}%.</p>
        </div>

        <div id="blocoParcelaUnica" class="grade-2">
          <div class="campo"><label>Valor Liquidado</label><input id="recValorLiquidado" type="text" inputmode="decimal" class="campo-moeda" /></div>
          <div class="campo"><label>Nota de Liquidação (anexo)</label><input type="file" id="recNotaLiquidacaoArquivo" accept=".pdf,image/*" /></div>
          <div class="campo"><label>Valor Pago</label><input id="recValorPago" type="text" inputmode="decimal" class="campo-moeda" /></div>
          <div class="campo"><label>Ordem Bancária (anexo)</label><input type="file" id="recOrdemBancariaArquivo" accept=".pdf,image/*" /></div>
        </div>
        <div id="blocoComParcelaDividida" class="oculto">
          <div id="linhasParcelaDividida" class="linhas-parcela-dividida"></div>
        </div>
        <div class="campo"><label><input type="checkbox" id="recCompleto" /> Cadastro completo (deixe desmarcado para rascunho incremental)</label></div>
        <p id="recErro" class="erro-campo oculto"></p>
      </form>`;

    UI.abrirModal('Novo processo de Recibo', corpo,
      `<button class="botao" id="btnCancelarRec">Cancelar</button><button class="botao primario" id="btnSalvarRec">Salvar</button>`);

    ['recUnidade', 'recObjeto', 'recCompetencia', 'recStatus'].forEach(id => UI.tornarPesquisavel(id));

    document.getElementById('recUnidade').addEventListener('change', async function () {
      const unidade = unidades.find(u => u.id === this.value);
      document.getElementById('recOss').value = unidade ? unidade.oss || '' : '';
      document.getElementById('recCnpj').value = unidade ? unidade.cnpj || '' : '';
      document.getElementById('recTipoUnidade').value = unidade ? unidade.tipo || '' : '';
      document.getElementById('recContratoGestao').value = unidade ? unidade.contrato_gestao || '' : '';
      document.getElementById('recParcelaContratual').value = '';
      document.getElementById('recFonte').value = '';
      document.getElementById('recNotaEmpenho').value = '';
      document.getElementById('recObjeto').value = '';
      atualizarVisibilidadeParcelaDivididaTes_('recBlocoTemParcelaDividida', 'recTemParcelaDividida', 'blocoParcelaUnica', 'blocoComParcelaDividida', 'linhasParcelaDividida', '');
      historicoRecibosUnidade = [];
      nesDaUnidadeAtual = [];
      objetosSofDaUnidadeNovo = [];
      document.getElementById('listaNeUnidadeNovo').innerHTML = '';
      if (!unidade) return;

      const [resposta, nes, objetosSof] = await Promise.all([
        Api.chamar('listarRecibos', { unidade_id: unidade.id, pageSize: 1000 }),
        Api.chamar('listarNotasEmpenhoPorUnidade', { unidadeId: unidade.id }),
        Api.chamar('listarObjetosSofPorUnidade', { unidadeId: unidade.id })
      ]);
      historicoRecibosUnidade = resposta.items.slice().sort((a, b) => b.data_criacao < a.data_criacao ? -1 : 1);
      nesDaUnidadeAtual = nes;
      objetosSofDaUnidadeNovo = objetosSof;
      document.getElementById('listaNeUnidadeNovo').innerHTML = opcoesDatalistNe_(nesDaUnidadeAtual);
    });
    ligarAutopreenchimentoNe_('recNotaEmpenho', 'recObjeto', 'recFonte', () => nesDaUnidadeAtual);

    document.getElementById('recObjeto').addEventListener('change', async function () {
      const objeto = this.value.trim();
      const ultimoLancamento = historicoRecibosUnidade.find(r => (r.objeto || '').trim().toLowerCase() === objeto.toLowerCase());
      if (ultimoLancamento) {
        document.getElementById('recContratoGestao').value = ultimoLancamento.contrato_gestao || '';
        document.getElementById('recParcelaContratual').value = ultimoLancamento.parcela_contratual || '';
        document.getElementById('recFonte').value = ultimoLancamento.fonte || '';
        document.getElementById('recNotaEmpenho').value = ultimoLancamento.nota_empenho || '';
      } else {
        // Sem Recibo lançado antes pra esse Objeto (sessão 2026-07-30) - cai
        // pro SOF/NE já cadastrados pra essa unidade+objeto, se existirem
        // (ver listarObjetosSofPorUnidade). Continua tudo editável depois -
        // é só um ponto de partida, não trava nenhum campo.
        const objetoSof = objetosSofDaUnidadeNovo.find(o => (o.objeto || '').trim().toLowerCase() === objeto.toLowerCase());
        if (objetoSof) {
          document.getElementById('recParcelaContratual').value = objetoSof.parcela_mensal || '';
          document.getElementById('recFonte').value = objetoSof.fonte || '';
          document.getElementById('recNotaEmpenho').value = objetoSof.numero_ne || '';
        }
      }
      document.getElementById('recStatus').innerHTML = await opcoesStatus(document.getElementById('recStatus').value, document.getElementById('recFonte').value);
      UI.tornarPesquisavel('recStatus');
      atualizarVisibilidadeParcelaDivididaTes_('recBlocoTemParcelaDividida', 'recTemParcelaDividida', 'blocoParcelaUnica', 'blocoComParcelaDividida', 'linhasParcelaDividida', this.value);
    });

    document.getElementById('recFonte').addEventListener('change', async function () {
      document.getElementById('recStatus').innerHTML = await opcoesStatus(document.getElementById('recStatus').value, this.value);
      UI.tornarPesquisavel('recStatus');
    });

    const obterNotaEmpenhoNovo_ = () => document.getElementById('recNotaEmpenho').value;
    document.getElementById('recTemParcelaDividida').addEventListener('change', function () {
      document.getElementById('blocoParcelaUnica').classList.toggle('oculto', this.checked);
      document.getElementById('blocoComParcelaDividida').classList.toggle('oculto', !this.checked);
      if (this.checked && !document.getElementById('linhasParcelaDividida').children.length) {
        semearParcelasTes_('linhasParcelaDividida', obterNotaEmpenhoNovo_);
      }
    });
    document.getElementById('btnCancelarRec').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarRec').addEventListener('click', salvarReciboNovo);

    ligarAnexoComOcr_({
      inputEl: document.getElementById('recNotaLiquidacaoArquivo'), tipo: 'nota_liquidacao',
      obterNotaEmpenho: obterNotaEmpenhoNovo_, valorInputEl: document.getElementById('recValorLiquidado')
    });
    ligarAnexoComOcr_({
      inputEl: document.getElementById('recOrdemBancariaArquivo'), tipo: 'ordem_bancaria',
      obterNotaEmpenho: obterNotaEmpenhoNovo_, valorInputEl: document.getElementById('recValorPago')
    });
  }

  /**
   * Todo número de LE/OB já anexado em QUALQUER linha de parcela dividida
   * dentro de `containerId` agora (sessão 2026-08-13, pedido do usuário) -
   * usado pro aviso imediato de duplicidade ao clicar "+Adicionar LE"/"+
   * Adicionar OB", antes mesmo de salvar (o backend confere de novo, com
   * certeza, no salvamento - documentoDuplicadoNoProcesso_, Recibos.gs).
   * Olha TODAS as linhas do container, não só a que disparou o anexo - o
   * mesmo documento pode ter sido colado por engano numa parcela diferente.
   */
  function numerosDocumentosAnexadosNaTela_(containerId) {
    const numerosOb = new Set();
    const numerosLe = new Set();
    document.querySelectorAll('#' + containerId + ' .linha-parcela-dividida').forEach(linha => {
      (linha._ordensBancarias || []).forEach(it => { if (it.numero_ob) numerosOb.add(it.numero_ob); });
      if (linha._notaLiquidacao && linha._notaLiquidacao.numero) numerosLe.add(linha._notaLiquidacao.numero);
    });
    return { numerosOb, numerosLe };
  }

  /**
   * Monta uma linha do editor de parcela dividida dentro do container
   * `containerId` (sessão 2026-07-30: parametrizada pra ser reaproveitada
   * tanto em "Novo processo de Recibo" - `linhasParcelaDividida`, sempre
   * linhas novas - quanto em "Editar Recibo" - `linhasParcelaDividedaEd`,
   * ver abrirFormularioEdicao, que também pode pré-popular linhas com dado
   * já existente na planilha).
   *
   * `dadosExistentes` (opcional) - quando presente, pré-preenche a linha:
   * `{ id, percentual_parcela_dividida, valor_liquidado, valor_pago,
   * nota_liquidacao_url, nota_liquidacao_numero, ordem_bancaria_arquivo_url,
   * ordem_bancaria_arquivo_drive_id, ordens_bancarias }`. Uma linha com `id`
   * (já salva na planilha) **não pode ser removida por aqui** - o backend
   * (atualizarParcelasDivididasRecibo) só cria/atualiza o que estiver
   * presente no envio; remover do formulário sem apagar de fato deixaria a
   * linha "esquecida" na planilha, órfã do que a tela mostra - por isso o
   * botão de remover só aparece em linhas novas (ainda não salvas).
   *
   * `opts.percentualFixo` (sessão 2026-08-06, Recibo dividido de Contrato de
   * Gestão (TES) - ver semearParcelasTes_): quando informado, o campo
   * Percentual nasce travado (somente leitura) com esse valor, e a linha
   * nunca mostra botão de remover (split fixo, não dá pra ficar com menos
   * que PARCELA_DIVIDIDA_TES_PERCENTUAIS.length parcelas).
   *
   * TODA linha usa a mesma tabela "Documentos anexados" (LE + N OBs) com os
   * botões "+ Adicionar LE"/"+ Adicionar OB" - ver
   * renderTabelaOrdensBancariasParcela_ (sessão 2026-08-13, pedido do
   * usuário: "preciso que o layout de botões e a tabela... sejam os
   * mesmos" - antes só a linha de maior percentual usava esse padrão, a
   * outra ainda tinha os <input type="file"> soltos de antes da
   * padronização). Valor Pago é sempre somente leitura, somado
   * automaticamente a partir da tabela.
   */
  function adicionarLinhaParcelaDividida_(containerId, obterNotaEmpenho, dadosExistentes, opts) {
    contadorLinhasParcelaDividida++;
    const id = contadorLinhasParcelaDividida;
    const jaSalva = !!(dadosExistentes && dadosExistentes.id);
    const percentualFixo = opts && opts.percentualFixo;
    const div = document.createElement('div');
    div.className = 'linha-parcela-dividida';
    div.dataset.linhaParcelaDividida = id;
    if (jaSalva) div.dataset.idExistente = dadosExistentes.id;
    const valorPercentual = percentualFixo || (dadosExistentes && dadosExistentes.percentual_parcela_dividida) || '';
    div.innerHTML = `
      <div class="linha-parcela-dividida-corpo">
        <div class="grade-3">
          <div class="campo"><label>Percentual (%)</label><input type="text" inputmode="decimal" class="pd-percentual campo-moeda" value="${valorPercentual}" ${percentualFixo ? 'readonly' : ''} /></div>
          <div class="campo"><label>Valor Liquidado</label><input type="text" inputmode="decimal" class="pd-liquidado campo-moeda" value="${dadosExistentes && dadosExistentes.valor_liquidado ? dadosExistentes.valor_liquidado : ''}" /></div>
          <div class="campo"><label>Valor Pago (soma automática)</label><input type="text" inputmode="decimal" class="pd-pago campo-moeda" value="${dadosExistentes && dadosExistentes.valor_pago ? dadosExistentes.valor_pago : ''}" readonly /></div>
        </div>
        <div class="campo pd-ob-bloco">
          <label>Documentos anexados (LE + Ordens Bancárias)</label>
          <div class="pd-ob-tabela-wrap"></div>
          <input type="file" class="pd-le-novo-anexo oculto" accept=".pdf,image/*" />
          <input type="file" class="pd-ob-novo-anexo oculto" accept=".pdf,image/*" />
          <button type="button" class="botao pd-add-le">+ Adicionar LE</button>
          <button type="button" class="botao pd-add-ob">+ Adicionar OB</button>
        </div>
      </div>
      ${jaSalva || percentualFixo ? '' : '<button type="button" class="linha-parcela-dividida-remover" title="Remover parcela">&times;</button>'}`;
    document.getElementById(containerId).appendChild(div);
    if (!jaSalva && !percentualFixo) {
      div.querySelector('.linha-parcela-dividida-remover').addEventListener('click', () => {
        div.remove();
        atualizarBotoesRemoverParcelaDividida_(containerId);
      });
    }
    atualizarBotoesRemoverParcelaDividida_(containerId);

    // _notaLiquidacaoOriginalUrl (imutável, capturada aqui) diferencia "nunca
    // existiu" de "já existia e foi removida agora" pra
    // montarPayloadNotaLiquidacao_ saber quando mandar
    // removerNotaLiquidacaoArquivo.
    div._notaLiquidacaoOriginalUrl = (dadosExistentes && dadosExistentes.nota_liquidacao_url) || '';
    div._notaLiquidacao = div._notaLiquidacaoOriginalUrl ? {
      numero: (dadosExistentes && dadosExistentes.nota_liquidacao_numero) || '',
      url: div._notaLiquidacaoOriginalUrl
    } : null;

    div._ordensBancarias = ((dadosExistentes && dadosExistentes.ordens_bancarias) || []).map(it => ({
      numero_ob: it.numero_ob || '', valor: Number(it.valor) || 0,
      arquivo_drive_id: it.arquivo_drive_id || '', arquivo_url: it.arquivo_url || ''
    }));
    // Compatibilidade (sessão 2026-08-06): se esta linha vem de um Recibo
    // avulso que já tinha UMA Ordem Bancária no formato antigo (campo
    // único, antes desta funcionalidade existir) e ainda não foi migrada
    // pra um item da tabela, mostra ela como item herdado, em vez de
    // "sumir" da tela.
    if (dadosExistentes && dadosExistentes.ordem_bancaria_arquivo_url && !div._ordensBancarias.length) {
      div._ordensBancarias.push({
        numero_ob: '', valor: Number(dadosExistentes.valor_pago) || 0,
        arquivo_drive_id: dadosExistentes.ordem_bancaria_arquivo_drive_id || '', arquivo_url: dadosExistentes.ordem_bancaria_arquivo_url
      });
    }
    div.querySelector('.pd-liquidado').addEventListener('input', () => renderTabelaOrdensBancariasParcela_(div));

    const inputNovoLe = div.querySelector('.pd-le-novo-anexo');
    div.querySelector('.pd-add-le').addEventListener('click', () => inputNovoLe.click());
    inputNovoLe.addEventListener('change', async function () {
      const arquivo = inputNovoLe.files[0];
      if (!arquivo) return;
      const notaEmpenho = (obterNotaEmpenho() || '').trim();
      if (!notaEmpenho) { UI.toast('Preencha a Nota de Empenho antes de anexar este documento.', 'erro'); inputNovoLe.value = ''; return; }
      try {
        if (arquivo.size > 8 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 8MB).');
        const base64 = await UI.lerArquivoBase64(arquivo);
        const resultado = await Api.chamar('lerAnexoRecibo', {
          tipo: 'nota_liquidacao', arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type, notaEmpenhoEsperada: notaEmpenho
        });
        // Duplicidade (sessão 2026-08-13, pedido do usuário): aviso na hora,
        // olhando TODAS as parcelas na tela (não só esta linha) - o backend
        // confere o processo inteiro de novo no salvamento
        // (documentoDuplicadoNoProcesso_, Recibos.gs), essa é só a versão rápida.
        if (resultado.numero_documento && numerosDocumentosAnexadosNaTela_(containerId).numerosLe.has(resultado.numero_documento)) {
          UI.toast('A Nota de Liquidação nº ' + resultado.numero_documento + ' já foi anexada a este processo.', 'erro');
          return;
        }
        div._notaLiquidacao = {
          numero: resultado.numero_documento || '',
          _base64: base64, _nome: arquivo.name, _tipo: arquivo.type
        };
        div.querySelector('.pd-liquidado').value = resultado.valor;
        renderTabelaOrdensBancariasParcela_(div);
      } catch (err) {
        UI.toast(err.message, 'erro');
      } finally {
        inputNovoLe.value = '';
      }
    });

    const inputNovoOb = div.querySelector('.pd-ob-novo-anexo');
    div.querySelector('.pd-add-ob').addEventListener('click', () => inputNovoOb.click());
    inputNovoOb.addEventListener('change', async function () {
      const arquivo = inputNovoOb.files[0];
      if (!arquivo) return;
      const notaEmpenho = (obterNotaEmpenho() || '').trim();
      if (!notaEmpenho) { UI.toast('Preencha a Nota de Empenho antes de anexar este documento.', 'erro'); inputNovoOb.value = ''; return; }
      try {
        if (arquivo.size > 8 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 8MB).');
        const base64 = await UI.lerArquivoBase64(arquivo);
        const resultado = await Api.chamar('lerAnexoRecibo', {
          tipo: 'ordem_bancaria', arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type, notaEmpenhoEsperada: notaEmpenho
        });
        if (resultado.numero_documento && numerosDocumentosAnexadosNaTela_(containerId).numerosOb.has(resultado.numero_documento)) {
          UI.toast('A Ordem Bancária nº ' + resultado.numero_documento + ' já foi anexada a este processo.', 'erro');
          return;
        }
        div._ordensBancarias.push({
          numero_ob: resultado.numero_documento || '', valor: resultado.valor,
          _base64: base64, _nome: arquivo.name, _tipo: arquivo.type
        });
        renderTabelaOrdensBancariasParcela_(div);
      } catch (err) {
        UI.toast(err.message, 'erro');
      } finally {
        inputNovoOb.value = '';
      }
    });
    renderTabelaOrdensBancariasParcela_(div);
  }

  /**
   * Tabela "Documentos anexados" (LE + Ordens Bancárias) da parcela de maior
   * percentual (PARCELA_DIVIDIDA_TES_PERCENTUAL_MULTI_OB) dentro de um
   * Recibo dividido de Contrato de Gestão (TES) - sessão 2026-08-06, estilo
   * reaproveitado de "Reforços lançados" (Notas de Empenho). A linha da LE
   * (sessão 2026-08-12: passou a ter "apagar" também, mesmo padrão das de
   * OB - antes era fixa, sem botão) vem de `div._notaLiquidacao` (número/url;
   * o valor continua lido ao vivo do campo "Valor Liquidado", que é o mesmo
   * de sempre, só preenchido agora pelo botão "+Adicionar LE" em vez do
   * <input type="file">); as de OB vêm de `div._ordensBancarias` (mutado por
   * quem chama). Também recalcula Valor Pago (soma automática) toda vez que roda.
   */
  function renderTabelaOrdensBancariasParcela_(div) {
    const itens = div._ordensBancarias || [];
    const le = div._notaLiquidacao;
    const valorLe = UI.parseValorBr(div.querySelector('.pd-liquidado').value) || 0;
    const alvo = div.querySelector('.pd-ob-tabela-wrap');
    alvo.innerHTML = `
      <div class="tabela-reforcos-wrap">
        <table class="tabela tabela-reforcos">
          <thead><tr><th>Documento</th><th>Número</th><th>Valor</th><th>Arquivo</th><th></th></tr></thead>
          <tbody>
            ${le ? `
            <tr>
              <td>LE</td>
              <td>${le.numero ? UI.escaparHtml(le.numero) : '<span class="ajuda">-</span>'}</td>
              <td>${UI.formatarMoeda(valorLe)}</td>
              <td>${le.url ? `<a href="${UI.escaparHtml(le.url)}" target="_blank" rel="noopener" class="botao">Ver</a>` : '<span class="ajuda">-</span>'}</td>
              <td><button type="button" class="botao-icone excluir" data-acao="remover-le" title="Remover esta LE">${ICONE_LIXEIRA}</button></td>
            </tr>` : ''}
            ${itens.map((it, i) => `
              <tr>
                <td>OB</td>
                <td>${it.numero_ob ? UI.escaparHtml(it.numero_ob) : '<span class="ajuda">-</span>'}</td>
                <td>${UI.formatarMoeda(it.valor)}</td>
                <td>${it.arquivo_url ? `<a href="${UI.escaparHtml(it.arquivo_url)}" target="_blank" rel="noopener" class="botao">Ver</a>` : '<span class="ajuda">-</span>'}</td>
                <td><button type="button" class="botao-icone excluir" data-indice-ob="${i}" title="Remover esta OB">${ICONE_LIXEIRA}</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${(le || itens.length) ? '' : '<p class="ajuda">Nenhum documento anexado ainda.</p>'}`;
    // Confirmação antes de apagar (sessão 2026-08-14, pedido do usuário) -
    // remove só do estado local aqui (instantâneo, sem chamada de rede) - a
    // remoção de verdade na planilha só acontece quando o analista clicar
    // "Salvar" (montarPayloadNotaLiquidacao_/montarPayloadOrdensBancarias_,
    // já existentes), o mesmo padrão "editar local, salvar em lote" já usado
    // em toda a tela - não é uma chamada nova por clique, então não pesa.
    const botaoRemoverLe = alvo.querySelector('[data-acao="remover-le"]');
    if (botaoRemoverLe) botaoRemoverLe.addEventListener('click', () => {
      if (!confirm('Apagar esta Nota de Liquidação?')) return;
      div._notaLiquidacao = null;
      div.querySelector('.pd-liquidado').value = '';
      renderTabelaOrdensBancariasParcela_(div);
    });
    alvo.querySelectorAll('[data-indice-ob]').forEach(botao => {
      botao.addEventListener('click', () => {
        if (!confirm('Apagar esta Ordem Bancária?')) return;
        itens.splice(Number(botao.dataset.indiceOb), 1);
        renderTabelaOrdensBancariasParcela_(div);
      });
    });
    atualizarValorPagoComputado_(div);
  }

  /** Valor Pago da parcela multi-OB = soma automática da tabela (decisão do usuário, sessão 2026-08-06) - somente leitura, recalculado a cada mudança na tabela. */
  function atualizarValorPagoComputado_(div) {
    const soma = (div._ordensBancarias || []).reduce((s, it) => s + (Number(it.valor) || 0), 0);
    div.querySelector('.pd-pago').value = soma ? soma.toFixed(2) : '';
  }

  /** Payload de ordens_bancarias pra criarGrupoParcelaDivididaRecibo/atualizarParcelasDivididasRecibo a partir do estado local da linha (ver div._ordensBancarias). */
  function montarPayloadOrdensBancarias_(div) {
    return (div._ordensBancarias || []).map(it => ({
      numero_ob: it.numero_ob || '',
      valor: it.valor,
      arquivo_drive_id: it.arquivo_drive_id || '',
      arquivo_url: it.arquivo_url || '',
      arquivoBase64: it._base64, arquivoNome: it._nome, arquivoTipo: it._tipo
    }));
  }

  /**
   * Payload de nota_liquidacao pra uma linha multi-OB (sessão 2026-08-12), a
   * partir de div._notaLiquidacao/div._notaLiquidacaoOriginalUrl - mesmo
   * espírito de montarPayloadOrdensBancarias_ acima, mas pra um item único
   * (não uma lista): sem LE nenhuma anexada nunca manda nada; LE removida
   * (havia uma salva, div._notaLiquidacao virou null) manda
   * removerNotaLiquidacaoArquivo pro backend desanexar (mecanismo que já
   * existia, usado até agora pelo link "Remover anexo" do <input
   * type="file"> antigo - ver ligarAnexoComOcr_); LE nova (ainda não
   * salva, tem _base64) manda os campos de upload de sempre.
   */
  function montarPayloadNotaLiquidacao_(div) {
    const le = div._notaLiquidacao;
    const payload = { nota_liquidacao_numero: le ? le.numero : '' };
    if (!le && div._notaLiquidacaoOriginalUrl) payload.removerNotaLiquidacaoArquivo = true;
    if (le && le._base64) Object.assign(payload, { notaLiquidacaoArquivoBase64: le._base64, notaLiquidacaoArquivoNome: le._nome, notaLiquidacaoArquivoTipo: le._tipo });
    return payload;
  }

  /**
   * criarGrupoParcelaDivididaRecibo/atualizarParcelasDivididasRecibo exigem
   * no mínimo 2 parcelas - esconde o botão de remover quando restam só 2.
   * Só considera linhas que TÊM botão de remover (linhas novas, sem
   * percentual fixo) - linhas já salvas ou de split fixo (TES, ver
   * adicionarLinhaParcelaDividida_) nunca têm botão, então não contam pra
   * essa trava.
   */
  function atualizarBotoesRemoverParcelaDividida_(containerId) {
    const linhas = document.querySelectorAll('#' + containerId + ' [data-linha-parcela-dividida]');
    linhas.forEach(linha => {
      const botao = linha.querySelector('.linha-parcela-dividida-remover');
      if (botao) botao.classList.toggle('oculto', linhas.length <= 2);
    });
  }

  async function salvarReciboNovo() {
    const erroEl = document.getElementById('recErro');
    erroEl.classList.add('oculto');
    // Portao unico dos campos monetarios (UI.validarCamposMoeda, js/app.js):
    // recusa texto que nao vira numero em vez de gravar R$ 0,00 sem avisar.
    if (!UI.validarCamposMoeda()) return;
    const unidadeId = document.getElementById('recUnidade').value;
    if (!unidadeId) { UI.mostrarErro(erroEl, 'Selecione a unidade.'); return; }

    const dadosBase = {
      unidade_id: unidadeId,
      oss_snapshot: document.getElementById('recOss').value.trim(),
      cnpj_snapshot: document.getElementById('recCnpj').value.trim(),
      tipo_unidade: document.getElementById('recTipoUnidade').value.trim(),
      objeto: document.getElementById('recObjeto').value.trim(),
      contrato_gestao: document.getElementById('recContratoGestao').value.trim(),
      parcela_contratual: UI.parseValorBr(document.getElementById('recParcelaContratual').value),
      fonte: document.getElementById('recFonte').value,
      nota_empenho: document.getElementById('recNotaEmpenho').value.trim(),
      competencia: document.getElementById('recCompetencia').value.trim(),
      ordem_bancaria: document.getElementById('recOrdemBancaria').value.trim(),
      numero_processo: document.getElementById('recNumeroProcesso').value.trim(),
      status: document.getElementById('recStatus').value,
      completo: document.getElementById('recCompleto').checked
    };
    // Observação inicial (sessão 2026-08-26) vira a 1ª observação da thread,
    // via criarObservacaoRecibo, DEPOIS do processo já existir (não dá pra
    // registrar autor+data de algo que ainda não tem id) - não é mais um
    // campo da própria linha do Recibo.
    const observacaoInicial = document.getElementById('recObservacaoInicial').value.trim();

    try {
      if (document.getElementById('recTemParcelaDividida').checked) {
        const linhas = Array.from(document.querySelectorAll('#linhasParcelaDividida [data-linha-parcela-dividida]'));
        if (linhas.length < 2) { UI.mostrarErro(erroEl, 'Informe ao menos duas parcelas.'); return; }
        const parcelas = await Promise.all(linhas.map(async div => {
          const parcela = {
            percentual_parcela_dividida: UI.parseValorBr(div.querySelector('.pd-percentual').value),
            valor_liquidado: UI.parseValorBr(div.querySelector('.pd-liquidado').value),
            valor_pago: UI.parseValorBr(div.querySelector('.pd-pago').value)
          };
          // LE e OB tratadas por botão + tabela "Documentos anexados" em
          // TODA linha (sessão 2026-08-13, unificado - antes só a de maior
          // percentual) - ver montarPayloadNotaLiquidacao_/
          // montarPayloadOrdensBancarias_, não há mais <input type="file">
          // pra reler aqui.
          Object.assign(parcela, montarPayloadNotaLiquidacao_(div));
          parcela.ordens_bancarias = montarPayloadOrdensBancarias_(div);
          return parcela;
        }));
        const criados = await Api.chamar('criarGrupoParcelaDivididaRecibo', { dadosBase, parcelas });
        if (observacaoInicial) await Api.chamar('criarObservacaoRecibo', { data: { recibo_ref_id: criados[0].parcela_dividida_grupo_id, texto: observacaoInicial } });
      } else {
        dadosBase.valor_liquidado = UI.parseValorBr(document.getElementById('recValorLiquidado').value);
        dadosBase.valor_pago = UI.parseValorBr(document.getElementById('recValorPago').value);
        dadosBase.nota_liquidacao_numero = document.getElementById('recNotaLiquidacaoArquivo')._numeroDocumentoLido || '';
        const nl = await lerAnexoDoInput_(document.getElementById('recNotaLiquidacaoArquivo'));
        if (nl) Object.assign(dadosBase, { notaLiquidacaoArquivoBase64: nl.base64, notaLiquidacaoArquivoNome: nl.nome, notaLiquidacaoArquivoTipo: nl.tipo });
        const ob = await lerAnexoDoInput_(document.getElementById('recOrdemBancariaArquivo'));
        if (ob) Object.assign(dadosBase, { ordemBancariaArquivoBase64: ob.base64, ordemBancariaArquivoNome: ob.nome, ordemBancariaArquivoTipo: ob.tipo });
        const criado = await Api.chamar('criarRecibo', { data: dadosBase });
        if (observacaoInicial) await Api.chamar('criarObservacaoRecibo', { data: { recibo_ref_id: criado.id, texto: observacaoInicial } });
      }
      CacheAbas.invalidar('recibos');
      UI.toast('Recibo salvo com sucesso.', 'sucesso');
      UI.fecharModal();
      await carregar();
    } catch (err) {
      UI.mostrarErro(erroEl, err.message);
    }
  }

  // ===================== OBSERVAÇÕES (sessão 2026-08-26) =====================
  // Comentários com autor+data sobre um processo de Recibo, substituindo o
  // antigo campo único "Observação" (um texto só, sem autoria). Qualquer
  // usuário autenticado cria; só o próprio autor OU um Gerente/Administrador
  // edita/exclui uma já existente (pode_editar, calculado no backend - ver
  // formatarObservacaoRecibo_, backend/Recibos.gs). Editar/excluir uma
  // observação já existente chama o backend na hora (funções abaixo); já
  // ADICIONAR uma observação nova não tem botão próprio (pedido do usuário) -
  // o texto digitado só é enviado junto com o "Salvar" do modal de Editar
  // Recibo, ver salvarReciboEdicao mais abaixo.

  function observacaoHtml_(o) {
    const editadoHtml = o.data_edicao ? ' <span class="ajuda">(editado)</span>' : '';
    const acoesHtml = o.pode_editar ? `
      <button type="button" class="botao-icone editar" data-acao="editar-observacao" data-id="${o.id}" title="Editar">${ICONE_LAPIS}</button>
      <button type="button" class="botao-icone excluir" data-acao="excluir-observacao" data-id="${o.id}" title="Excluir">${ICONE_LIXEIRA}</button>` : '';
    return `
      <div class="observacao-recibo" data-id-observacao="${o.id}">
        <div class="observacao-recibo-texto">${UI.escaparHtml(o.texto)}</div>
        <div class="observacao-recibo-rodape">
          <span class="ajuda">${UI.escaparHtml(o.criado_por_nome)} · ${UI.formatarData(o.data_criacao)}${editadoHtml}</span>
          <span class="observacao-recibo-acoes">${acoesHtml}</span>
        </div>
      </div>`;
  }

  function observacoesListaHtml_(lista) {
    if (!lista.length) return '<p class="ajuda">Nenhuma observação ainda.</p>';
    return lista.map(observacaoHtml_).join('');
  }

  /** Recarrega e re-renderiza a lista de observações do processo aberto - chamado depois de qualquer criar/editar/excluir. */
  async function carregarObservacoes_(refId) {
    const container = document.getElementById('recEdObservacoesLista');
    if (!container) return;
    const lista = await Api.chamar('listarObservacoesRecibo', { recibo_ref_id: refId }, { silencioso: true });
    container.innerHTML = observacoesListaHtml_(lista);
    ligarAcoesObservacoes_(container, refId);
  }

  function ligarAcoesObservacoes_(container, refId) {
    container.querySelectorAll('[data-acao="excluir-observacao"]').forEach(botao => {
      botao.addEventListener('click', async () => {
        if (!confirm('Excluir esta observação?')) return;
        try {
          await Api.chamar('excluirObservacaoRecibo', { id: botao.dataset.id });
          CacheAbas.invalidar('recibos');
          await carregarObservacoes_(refId);
        } catch (err) {
          UI.toast(err.message, 'erro');
        }
      });
    });
    container.querySelectorAll('[data-acao="editar-observacao"]').forEach(botao => {
      botao.addEventListener('click', () => iniciarEdicaoObservacao_(botao.dataset.id, refId));
    });
  }

  /** Troca o texto de UMA observação por um textarea + Salvar/Cancelar, sem mexer nas outras nem reabrir o modal inteiro. */
  function iniciarEdicaoObservacao_(id, refId) {
    const bloco = document.querySelector(`.observacao-recibo[data-id-observacao="${id}"]`);
    if (!bloco) return;
    const textoAtual = bloco.querySelector('.observacao-recibo-texto').textContent;
    bloco.innerHTML = `
      <textarea class="observacao-recibo-editar" rows="2">${UI.escaparHtml(textoAtual)}</textarea>
      <div class="observacao-recibo-acoes">
        <button type="button" class="botao" data-acao="cancelar-edicao-observacao">Cancelar</button>
        <button type="button" class="botao primario" data-acao="salvar-edicao-observacao">Salvar</button>
      </div>`;
    bloco.querySelector('[data-acao="cancelar-edicao-observacao"]').addEventListener('click', () => carregarObservacoes_(refId));
    bloco.querySelector('[data-acao="salvar-edicao-observacao"]').addEventListener('click', async () => {
      const novoTexto = bloco.querySelector('.observacao-recibo-editar').value.trim();
      if (!novoTexto) return;
      try {
        await Api.chamar('atualizarObservacaoRecibo', { id, texto: novoTexto });
        CacheAbas.invalidar('recibos');
        await carregarObservacoes_(refId);
      } catch (err) {
        UI.toast(err.message, 'erro');
      }
    });
  }

  // ===================== EDIÇÃO DE RECIBO EXISTENTE =====================

  async function abrirFormularioEdicao(recibo) {
    const grupoId = recibo.parcela_dividida_grupo_id || '';
    // Status (sessão 2026-08-12, pedido do usuário): saiu deste formulário -
    // "não fazem mais sentido" aqui porque já existe um seletor próprio no
    // card da listagem (select-status-recibo, ver renderCards/linhaCardHtml_
    // acima) que edita o mesmo campo direto, sem precisar abrir esta tela.
    // refIdObservacoes: mesma chave usada no backend (chaveObservacaoRecibo_,
    // Recibos.gs) pra agrupar as observações de um processo - o
    // parcela_dividida_grupo_id quando o Recibo faz parte de um grupo, senão
    // o próprio id.
    const refIdObservacoes = grupoId || recibo.id;
    const [opcoesObjeto, nesDaUnidade, siblingsGrupo, observacoes] = await Promise.all([
      TelaListas.obterOpcoes('OBJETO'),
      Api.chamar('listarNotasEmpenhoPorUnidade', { unidadeId: recibo.unidade_id }),
      grupoId ? Api.chamar('listarRecibosPorGrupo', { grupoId }) : Promise.resolve([]),
      Api.chamar('listarObservacoesRecibo', { recibo_ref_id: refIdObservacoes })
    ]);
    nesDaUnidadeAtual = nesDaUnidade;
    const corpo = `
      <form id="formReciboEdicao">
        ${recibo.divergente_da_unidade ? '<p class="aviso-divergencia">⚠ OSS/CNPJ divergem do cadastro atual da unidade.</p>' : ''}
        ${recibo.alerta_divergencia_valores ? '<p class="aviso-divergencia">⚠ Divergência entre valor liquidado/pago (ou soma da parcela dividida x parcela contratual).</p>' : ''}
        <div class="grade-2">
          <div class="campo"><label>Unidade</label><select disabled>${opcoesUnidade(recibo.unidade_id)}</select></div>
          <div class="campo"><label>OSS</label><input id="recEdOss" value="${UI.escaparHtml(recibo.oss_snapshot)}" /></div>
          <div class="campo"><label>CNPJ</label><input id="recEdCnpj" value="${UI.escaparHtml(recibo.cnpj_snapshot)}" /></div>
          <div class="campo"><label>Tipo de Unidade</label><input id="recEdTipoUnidade" value="${UI.escaparHtml(recibo.tipo_unidade)}" /></div>
          <div class="campo"><label>Objeto *</label>
            <select id="recEdObjeto">
              <option value="">Selecione...</option>
              ${opcoesObjeto.map(o => `<option ${recibo.objeto === o.valor ? 'selected' : ''}>${UI.escaparHtml(o.valor)}</option>`).join('')}
            </select>
          </div>
          <div class="campo"><label>Contrato de Gestão</label><input id="recEdContratoGestao" value="${UI.escaparHtml(recibo.contrato_gestao)}" /></div>
          <div class="campo"><label>Parcela Contratual</label><input id="recEdParcelaContratual" type="text" inputmode="decimal" class="campo-moeda" value="${recibo.parcela_contratual}" /></div>
          <div class="campo"><label>Fonte</label><select id="recEdFonte">${['', 'TESOURO', 'SUS', 'Outra'].map(f => `<option ${recibo.fonte === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
          <div class="campo"><label>Nota de Empenho</label>
            <input id="recEdNotaEmpenho" list="listaNeUnidadeEd" value="${UI.escaparHtml(recibo.nota_empenho)}" />
            <datalist id="listaNeUnidadeEd">${opcoesDatalistNe_(nesDaUnidade)}</datalist>
          </div>
          <div class="campo"><label>Competência</label><select id="recEdCompetencia">${UI.opcoesCompetenciaHtml(recibo.competencia)}</select></div>
          <div class="campo"><label>Nº Processo</label><input id="recEdNumeroProcesso" value="${UI.escaparHtml(recibo.numero_processo)}" /></div>
        </div>
        <div class="campo ${(grupoId || ehObjetoContratoGestaoTes_(recibo.objeto)) ? '' : 'oculto'}" id="recEdBlocoTemParcelaDividida"><label><input type="checkbox" id="recEdTemParcelaDividida" ${grupoId ? 'checked disabled' : ''} /> Este pagamento é feito por mais de uma parcela?</label>
          ${grupoId ? '' : `<p class="ajuda">Disponível pra Objeto "${UI.escaparHtml(OBJETO_CONTRATO_GESTAO_TES)}" - divide automaticamente em ${UI.escaparHtml(PARCELA_DIVIDIDA_TES_PERCENTUAIS.join('%/'))}%.</p>`}
        </div>

        <div id="blocoParcelaUnicaEd" class="grade-2 ${grupoId ? 'oculto' : ''}">
          <div class="campo"><label>Valor Liquidado</label><input id="recEdValorLiquidado" type="text" inputmode="decimal" class="campo-moeda" value="${recibo.valor_liquidado}" /></div>
          <div class="campo"><label>Nota de Liquidação (anexo)</label><input type="file" id="recEdNotaLiquidacaoArquivo" accept=".pdf,image/*" />${recibo.nota_liquidacao_url ? `<p class="ajuda"><a href="${UI.escaparHtml(recibo.nota_liquidacao_url)}" target="_blank" rel="noopener" class="botao">Ver arquivo atual</a></p>` : ''}</div>
          <div class="campo"><label>Valor Pago</label><input id="recEdValorPago" type="text" inputmode="decimal" class="campo-moeda" value="${recibo.valor_pago}" /></div>
          <div class="campo"><label>Ordem Bancária (anexo)</label><input type="file" id="recEdOrdemBancariaArquivo" accept=".pdf,image/*" />${recibo.ordem_bancaria_arquivo_url ? `<p class="ajuda"><a href="${UI.escaparHtml(recibo.ordem_bancaria_arquivo_url)}" target="_blank" rel="noopener" class="botao">Ver arquivo atual</a></p>` : ''}</div>
        </div>
        <div id="blocoComParcelaDivididaEd" class="${grupoId ? '' : 'oculto'}">
          <div id="linhasParcelaDivididaEd" class="linhas-parcela-dividida"></div>
          <button type="button" class="botao ${ehObjetoContratoGestaoTes_(recibo.objeto) ? 'oculto' : ''}" id="btnAddParcelaDivididaEd">+ Adicionar parcela</button>
        </div>

        <div class="campo">
          <label>Observações</label>
          <p class="ajuda">Qualquer usuário pode adicionar uma observação. Só quem escreveu (ou um Gerente/Administrador) pode editar/excluir uma já existente.</p>
          <div id="recEdObservacoesLista" class="observacoes-recibo-lista">${observacoesListaHtml_(observacoes)}</div>
          <div class="observacao-recibo-nova">
            <textarea id="recEdNovaObservacao" rows="2" placeholder="Escreva uma nova observação... (salva junto com o botão &quot;Salvar&quot; deste formulário)"></textarea>
          </div>
        </div>
        <div class="campo"><label><input type="checkbox" id="recEdCompleto" ${recibo.completo ? 'checked' : ''} /> Cadastro completo</label></div>
        <p id="recEdErro" class="erro-campo oculto"></p>
      </form>`;

    UI.abrirModal('Editar Recibo', corpo,
      `<button class="botao" id="btnCancelarRecEd">Cancelar</button><button class="botao primario" id="btnSalvarRecEd">Salvar</button>`);
    UI.aoFecharModal(() => EdicaoSimultanea.sairDaEdicao('Recibo', recibo.id));

    // Observações já existentes (sessão 2026-08-26): editar/excluir continua
    // chamando o backend NA HORA, igual "Redefinir senha" em js/usuarios.js.
    // Já a observação NOVA (campo recEdNovaObservacao, sem botão próprio,
    // pedido do usuário) só é criada quando o "Salvar" deste formulário é
    // clicado - ver salvarReciboEdicao, mais abaixo.
    ligarAcoesObservacoes_(document.getElementById('recEdObservacoesLista'), refIdObservacoes);

    ['recEdObjeto', 'recEdCompetencia'].forEach(id => UI.tornarPesquisavel(id));
    ligarAutopreenchimentoNe_('recEdNotaEmpenho', 'recEdObjeto', 'recEdFonte', () => nesDaUnidadeAtual);

    // Objeto pode mudar de/para "Contrato de Gestão (TES)" durante a edição -
    // só reage se ainda não faz parte de um grupo (ver
    // atualizarVisibilidadeParcelaDivididaTes_; grupo já existente sempre
    // mostra a tabela, não dá pra "desfazer" mudando o Objeto).
    document.getElementById('recEdObjeto').addEventListener('change', function () {
      if (!grupoId) atualizarVisibilidadeParcelaDivididaTes_('recEdBlocoTemParcelaDividida', 'recEdTemParcelaDividida', 'blocoParcelaUnicaEd', 'blocoComParcelaDivididaEd', 'linhasParcelaDivididaEd', this.value);
    });

    const obterNotaEmpenhoEd_ = () => document.getElementById('recEdNotaEmpenho').value;
    const anexoNl = ligarAnexoComOcr_({
      inputEl: document.getElementById('recEdNotaLiquidacaoArquivo'), tipo: 'nota_liquidacao',
      obterNotaEmpenho: obterNotaEmpenhoEd_, valorInputEl: document.getElementById('recEdValorLiquidado')
    });
    if (recibo.nota_liquidacao_url) anexoNl.travar(recibo.valor_liquidado, true, recibo.nota_liquidacao_numero);
    const anexoOb = ligarAnexoComOcr_({
      inputEl: document.getElementById('recEdOrdemBancariaArquivo'), tipo: 'ordem_bancaria',
      obterNotaEmpenho: obterNotaEmpenhoEd_, valorInputEl: document.getElementById('recEdValorPago')
    });
    if (recibo.ordem_bancaria_arquivo_url) anexoOb.travar(recibo.valor_pago, true);

    // Parcela dividida na edição (sessão 2026-07-30, pedido do usuário): se
    // este Recibo já faz parte de um grupo, a tabela já nasce populada com
    // TODAS as parcelas do grupo (checkbox travado marcado - já é um grupo,
    // não dá pra "desfazer" por aqui, só adicionar mais parcelas); senão,
    // nasce vazia e some até o analista marcar o checkbox. Se o grupo é de
    // Contrato de Gestão (TES) - sessão 2026-08-06 -, cada parcela nasce com
    // o percentual travado (opts.percentualFixo) e a de maior percentual
    // (PARCELA_DIVIDIDA_TES_PERCENTUAL_MULTI_OB) com a tabela de OBs.
    if (grupoId) {
      const grupoEhTes = ehObjetoContratoGestaoTes_(recibo.objeto);
      siblingsGrupo.forEach(s => adicionarLinhaParcelaDividida_('linhasParcelaDivididaEd', obterNotaEmpenhoEd_, s,
        grupoEhTes ? { percentualFixo: Number(s.percentual_parcela_dividida) } : undefined));
    }
    document.getElementById('recEdTemParcelaDividida').addEventListener('change', function () {
      document.getElementById('blocoParcelaUnicaEd').classList.toggle('oculto', this.checked);
      document.getElementById('blocoComParcelaDivididaEd').classList.toggle('oculto', !this.checked);
      if (this.checked && !document.getElementById('linhasParcelaDivididaEd').children.length) {
        // Primeira vez convertendo pra parcela dividida - vira Recibo
        // dividido de Contrato de Gestão (TES) (única forma de chegar aqui,
        // ver atualizarVisibilidadeParcelaDivididaTes_): a própria linha do
        // Recibo em edição vira a parcela de maior percentual (com o que ela
        // já tinha, inclusive uma eventual OB única legada migrada pra
        // tabela - ver adicionarLinhaParcelaDividida_), e a(s) outra(s)
        // nascem em branco.
        semearParcelasTes_('linhasParcelaDivididaEd', obterNotaEmpenhoEd_, {
          [PARCELA_DIVIDIDA_TES_PERCENTUAL_MULTI_OB]: {
            id: recibo.id, percentual_parcela_dividida: PARCELA_DIVIDIDA_TES_PERCENTUAL_MULTI_OB,
            valor_liquidado: recibo.valor_liquidado, valor_pago: recibo.valor_pago,
            nota_liquidacao_url: recibo.nota_liquidacao_url, nota_liquidacao_numero: recibo.nota_liquidacao_numero,
            ordem_bancaria_arquivo_url: recibo.ordem_bancaria_arquivo_url, ordem_bancaria_arquivo_drive_id: recibo.ordem_bancaria_arquivo_drive_id
          }
        });
      }
    });
    document.getElementById('btnAddParcelaDivididaEd').addEventListener('click', () => adicionarLinhaParcelaDividida_('linhasParcelaDivididaEd', obterNotaEmpenhoEd_));

    document.getElementById('btnCancelarRecEd').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarRecEd').addEventListener('click', () => salvarReciboEdicao(recibo));
  }

  async function salvarReciboEdicao(recibo) {
    // Nada mudou (sessão 2026-08-13, pedido do usuário): só fecha o card em
    // vez de validar + chamar o backend à toa - mesmo dirty-tracking que já
    // decidia minimizar x fechar no clique fora (ver UI.modalFoiEditado, js/app.js).
    if (!UI.modalFoiEditado()) { UI.fecharModal(); return; }
    const erroEl = document.getElementById('recEdErro');
    erroEl.classList.add('oculto');
    // Portao unico dos campos monetarios (UI.validarCamposMoeda, js/app.js):
    // recusa texto que nao vira numero em vez de gravar R$ 0,00 sem avisar.
    if (!UI.validarCamposMoeda()) return;
    const dados = {
      oss_snapshot: document.getElementById('recEdOss').value.trim(),
      cnpj_snapshot: document.getElementById('recEdCnpj').value.trim(),
      tipo_unidade: document.getElementById('recEdTipoUnidade').value.trim(),
      objeto: document.getElementById('recEdObjeto').value.trim(),
      contrato_gestao: document.getElementById('recEdContratoGestao').value.trim(),
      parcela_contratual: UI.parseValorBr(document.getElementById('recEdParcelaContratual').value),
      fonte: document.getElementById('recEdFonte').value,
      nota_empenho: document.getElementById('recEdNotaEmpenho').value.trim(),
      competencia: document.getElementById('recEdCompetencia').value.trim(),
      numero_processo: document.getElementById('recEdNumeroProcesso').value.trim(),
      // ordem_bancaria/status (sessão 2026-08-12): saíram deste formulário -
      // ver comentário em abrirFormularioEdicao. Omitir por completo (em vez
      // de mandar '') é o que faz atualizarRecibo/atualizarParcelasDivididasRecibo
      // não tocarem nesses campos (hasOwnProperty), preservando o status que
      // o seletor do card já define. observacao saiu daqui também (sessão
      // 2026-08-26) - agora é uma aba própria (RecibosObservacoes). Editar/
      // excluir uma observação já existente salva na hora (ver
      // ligarAcoesObservacoes_ acima); a observação NOVA (campo
      // recEdNovaObservacao) só é enviada junto com este "Salvar", logo
      // abaixo (pedido do usuário - sem botão próprio).
      completo: document.getElementById('recEdCompleto').checked
    };
    const observacaoNova = document.getElementById('recEdNovaObservacao').value.trim();

    try {
      if (document.getElementById('recEdTemParcelaDividida').checked) {
        // Parcela dividida (sessão 2026-07-30) - cada linha da tabela vira um
        // item de `parcelas`; linhas já salvas trazem `id` (atualizam a
        // própria linha no backend), linhas novas não trazem (viram parcela
        // nova no mesmo grupo). Ver atualizarParcelasDivididasRecibo.
        const linhas = Array.from(document.querySelectorAll('#linhasParcelaDivididaEd [data-linha-parcela-dividida]'));
        if (linhas.length < 2) { UI.mostrarErro(erroEl, 'Informe ao menos duas parcelas.'); return; }
        const parcelas = await Promise.all(linhas.map(async div => {
          const parcela = {
            percentual_parcela_dividida: UI.parseValorBr(div.querySelector('.pd-percentual').value),
            valor_liquidado: UI.parseValorBr(div.querySelector('.pd-liquidado').value),
            valor_pago: UI.parseValorBr(div.querySelector('.pd-pago').value)
          };
          if (div.dataset.idExistente) parcela.id = div.dataset.idExistente;
          // LE e OB tratadas por botão + tabela "Documentos anexados" em
          // TODA linha (sessão 2026-08-13, unificado - antes só a de maior
          // percentual) - ver montarPayloadNotaLiquidacao_/
          // montarPayloadOrdensBancarias_, não há mais <input type="file">
          // pra reler aqui (nem a flag dataset.removerExistente - vira
          // removerNotaLiquidacaoArquivo direto quando div._notaLiquidacao é
          // null mas já existia uma LE salva).
          Object.assign(parcela, montarPayloadNotaLiquidacao_(div));
          parcela.ordens_bancarias = montarPayloadOrdensBancarias_(div);
          return parcela;
        }));
        await Api.chamar('atualizarParcelasDivididasRecibo', { id: recibo.id, dadosBase: dados, parcelas });
      } else {
        const inputNl = document.getElementById('recEdNotaLiquidacaoArquivo');
        const inputOb = document.getElementById('recEdOrdemBancariaArquivo');
        dados.valor_liquidado = UI.parseValorBr(document.getElementById('recEdValorLiquidado').value);
        dados.valor_pago = UI.parseValorBr(document.getElementById('recEdValorPago').value);
        dados.nota_liquidacao_numero = inputNl._numeroDocumentoLido || '';
        if (inputNl.dataset.removerExistente === '1') dados.removerNotaLiquidacaoArquivo = true;
        if (inputOb.dataset.removerExistente === '1') dados.removerOrdemBancariaArquivo = true;

        const nl = await lerAnexoDoInput_(inputNl);
        if (nl) Object.assign(dados, { notaLiquidacaoArquivoBase64: nl.base64, notaLiquidacaoArquivoNome: nl.nome, notaLiquidacaoArquivoTipo: nl.tipo });
        const ob = await lerAnexoDoInput_(inputOb);
        if (ob) Object.assign(dados, { ordemBancariaArquivoBase64: ob.base64, ordemBancariaArquivoNome: ob.nome, ordemBancariaArquivoTipo: ob.tipo });

        await Api.chamar('atualizarRecibo', { id: recibo.id, data: dados });
      }
      if (observacaoNova) {
        const refIdObservacoes = recibo.parcela_dividida_grupo_id || recibo.id;
        await Api.chamar('criarObservacaoRecibo', { data: { recibo_ref_id: refIdObservacoes, texto: observacaoNova } });
      }
      CacheAbas.invalidar('recibos');
      UI.toast('Recibo atualizado com sucesso.', 'sucesso');
      UI.fecharModal();
      await carregar();
    } catch (err) {
      UI.mostrarErro(erroEl, err.message);
    }
  }

  return { render, preCarregar };
})();
