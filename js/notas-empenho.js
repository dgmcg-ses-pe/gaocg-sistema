/**
 * GAOCG App - Acompanhamento de Notas de Empenho (Funcionalidade 5, item 4).
 * O cadastro de novas NEs continua sendo feito dentro da tela de SOF (produto
 * final do processo); esta tela é o acompanhamento transversal dos valores:
 * um card por número de NE (original + reforços somados), com o valor atual
 * (bruto - liquidado nos Recibos vinculados) em destaque, e alerta quando
 * esse valor fica abaixo da parcela mensal da fonte correspondente.
 */

const TelaNotasEmpenho = (function () {
  const OPCOES_FONTE = ['TESOURO', 'SUS', 'Outra'];
  const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const ICONE_PASTA = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';
  const ICONE_LIXEIRA = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
  let unidades = [];
  let grupos = [];
  let gruposTodos = [];
  /** Competências do filtro ativo - usadas para destacar o mês no cronograma (ver cronogramaBoxHtml_). */
  let competenciasFiltradas_ = [];
  let ultimoFiltroJson = null;
  let paginaAtual = 1;
  let totalRegistros = 0;
  // Tamanho de página escolhível (sessão 2026-08-31) - ver mesma explicação em js/sof.js.
  let tamanhoPagina = 20;
  const TAMANHO_PAGINA_TODOS_ = 100000;
  // Exclusão em lote (sessão 2026-08-31) - ver mesma explicação em js/sof.js.
  // Diferente de SOF/Unidades/Recibos, cada card aqui é um GRUPO (numero_ne),
  // não uma linha só - a seleção guarda o numero_ne, e na hora de excluir
  // resolve pra TODAS as linhas de cada grupo selecionado (grupo.linhas -
  // mãe + reforços) via excluirGrupoNotaEmpenhoEmLote.
  let modoSelecaoLote = false;
  let numerosNeSelecionados_ = new Set();

  /**
   * opts (opcional, vindo do Dashboard via App.navegarPara): `saldoBaixo: true`
   * já marca o filtro "Somente saldo abaixo da parcela" antes da primeira
   * carga (link "Ver na tela de Notas de Empenho" do painel "NEs com saldo
   * abaixo da parcela" do Dashboard).
   */
  async function render(opts) {
    // Sai do modo de seleção em lote sempre que a tela é (re)aberta - ver
    // mesmo comentário/motivo em js/sof.js (bug relatado pelo usuário: trocar
    // de aba sem clicar Cancelar mantinha a borda pontilhada de seleção nos
    // cards ao voltar pra esta tela).
    modoSelecaoLote = false;
    numerosNeSelecionados_.clear();
    const [unidadesCarregadas, opcoesOss, opcoesObjeto] = await Promise.all([
      Api.chamar('listarUnidades', { somenteAtivas: true, pageSize: 100000 }, { cache: true }),
      TelaListas.obterOpcoes('OSS'),
      TelaListas.obterOpcoes('OBJETO')
    ]);
    unidades = unidadesCarregadas.items;
    const tiposUnidade = Array.from(new Set(unidades.map(u => u.tipo).filter(Boolean))).sort();
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">Notas de Empenho</h2>
      <div class="painel">
        <p class="ajuda">Cada card agrupa a Nota de Empenho original e seus reforços pelo número. O valor atual já desconta o que foi liquidado nos Recibos vinculados a essa NE.</p>
        <div class="barra-filtros">
          <div class="campo campo-tamanho-pagina"><label>Itens por página</label>
            <select id="neTamanhoPaginaTopo">${UI.opcoesTamanhoPaginaHtml(tamanhoPagina === TAMANHO_PAGINA_TODOS_ ? 'todos' : tamanhoPagina)}</select>
          </div>
          <div class="campo campo-busca-livre"><label>Busca livre</label>
            <input type="text" id="neBusca" placeholder="número, SEI, valor..." /><button type="button" class="busca-livre-x" data-alvo="neBusca" title="Limpar busca livre">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Unidade</label>
            <div id="neFiltroUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="neFiltroUnidade" title="Limpar filtro de Unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">OSS</label>
            <div id="neFiltroOss"></div><button type="button" class="filtro-multiplo-x" data-alvo="neFiltroOss" title="Limpar filtro de OSS">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Objeto</label>
            <div id="neFiltroObjeto"></div><button type="button" class="filtro-multiplo-x" data-alvo="neFiltroObjeto" title="Limpar filtro de Objeto">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Tipo de unidade</label>
            <div id="neFiltroTipoUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="neFiltroTipoUnidade" title="Limpar filtro de Tipo de unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">DEA</label>
            <div id="neFiltroDea"></div><button type="button" class="filtro-multiplo-x" data-alvo="neFiltroDea" title="Limpar filtro de DEA">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Fonte</label>
            <div id="neFiltroFonte"></div><button type="button" class="filtro-multiplo-x" data-alvo="neFiltroFonte" title="Limpar filtro de Fonte">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Ano</label>
            <div id="neFiltroAno"></div><button type="button" class="filtro-multiplo-x" data-alvo="neFiltroAno" title="Limpar filtro de Ano">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Competência</label>
            <div id="neFiltroCompetencia"></div><button type="button" class="filtro-multiplo-x" data-alvo="neFiltroCompetencia" title="Limpar filtro de Competência">&times;</button>
          </div>
          <div class="campo campo-checkbox-filtro">
            <label class="rotulo-checkbox"><input type="checkbox" id="neFiltroSaldoBaixo" /> Somente saldo abaixo da parcela</label>
          </div>
          <button class="botao" id="btnFiltrarNe">Filtrar</button>
          <button class="botao botao-limpar-filtros" id="btnLimparFiltrosNe">Limpar filtros</button>
          <button class="botao" id="btnGerarRelatorioNe">Gerar Relatório</button>
          <button class="botao" id="btnModoSelecaoLoteNe">Apagar cards</button>
          <span style="flex:1"></span>
          <button class="botao primario" id="btnNovaNe">+ Nova Nota de Empenho</button>
        </div>
        <div class="barra-selecao-lote oculto" id="barraSelecaoLoteNe">
          <label class="rotulo-checkbox"><input type="checkbox" id="chkSelecionarTodosNe" /> Selecionar todos</label>
          <span id="contagemSelecaoLoteNe">0 selecionado(s)</span>
          <button type="button" class="botao perigo" id="btnExcluirSelecionadosNe" disabled>Excluir selecionados</button>
          <button type="button" class="botao" id="btnCancelarSelecaoLoteNe">Cancelar</button>
        </div>
        <div id="listaNe"></div>
        <div class="paginacao" id="paginacaoNe"></div>
      </div>`;
    document.getElementById('btnFiltrarNe').addEventListener('click', () => { if (filtrosMudaram_()) { paginaAtual = 1; carregar(); } });
    document.getElementById('neBusca').addEventListener('keydown', e => { if (e.key === 'Enter' && filtrosMudaram_()) { paginaAtual = 1; carregar(); } });
    document.getElementById('btnNovaNe').addEventListener('click', abrirModalNovaNe);
    document.getElementById('btnGerarRelatorioNe').addEventListener('click', abrirGerarRelatorio);
    document.getElementById('btnModoSelecaoLoteNe').addEventListener('click', () => alternarModoSelecaoLote_());
    document.getElementById('btnCancelarSelecaoLoteNe').addEventListener('click', () => alternarModoSelecaoLote_(false));
    document.getElementById('btnExcluirSelecionadosNe').addEventListener('click', excluirSelecionadosLoteClique_);
    document.getElementById('chkSelecionarTodosNe').addEventListener('change', function () {
      numerosNeSelecionados_ = this.checked ? new Set(grupos.map(g => g.numero_ne)) : new Set();
      atualizarBarraSelecaoLote_();
      renderCards();
    });
    // Seletor "Itens por página" duplicado no topo - ver mesma explicação em js/sof.js.
    document.getElementById('neTamanhoPaginaTopo').addEventListener('change', function () { mudarTamanhoPagina_(this.value); });
    // Opções INICIAIS - a partir da primeira carga elas vêm das facetas do
    // backend (ver FACETAS_NE_/aplicarResposta_). Substitui o estreitamento
    // antigo, que valia só para Unidade/Tipo/OSS.
    UI.criarFiltroMultiplo('neFiltroUnidade', unidades.map(u => ({ valor: u.id, rotulo: u.nome })));
    UI.criarFiltroMultiplo('neFiltroOss', opcoesOss.map(o => o.valor));
    UI.criarFiltroMultiplo('neFiltroObjeto', opcoesObjeto.map(o => o.valor));
    UI.criarFiltroMultiplo('neFiltroTipoUnidade', tiposUnidade);
    UI.criarFiltroMultiplo('neFiltroDea', ['SIM', 'NÃO']);
    UI.criarFiltroMultiplo('neFiltroFonte', OPCOES_FONTE);
    UI.criarFiltroMultiplo('neFiltroAno', UI.listaAnos());
    UI.criarFiltroMultiplo('neFiltroCompetencia', UI.listaCompetencias());
    document.getElementById('neFiltroSaldoBaixo').addEventListener('change', () => {
      if (filtrosMudaram_()) { paginaAtual = 1; carregar(); }
    });
    if (opts && opts.saldoBaixo) document.getElementById('neFiltroSaldoBaixo').checked = true;
    UI.ligarLimpezaFiltros('.barra-filtros', 'btnLimparFiltrosNe', () => {
      if (filtrosMudaram_()) { paginaAtual = 1; carregar(); }
    }, aoLimparFiltroIndividual_);
    await carregar();
  }

  function filtrosAtuais() {
    return {
      busca: document.getElementById('neBusca').value.trim(),
      unidade_id: UI.valoresFiltroMultiplo('neFiltroUnidade'),
      oss: UI.valoresFiltroMultiplo('neFiltroOss'),
      objeto: UI.valoresFiltroMultiplo('neFiltroObjeto'),
      tipo_unidade: UI.valoresFiltroMultiplo('neFiltroTipoUnidade'),
      dea: UI.valoresFiltroMultiplo('neFiltroDea'),
      fonte: UI.valoresFiltroMultiplo('neFiltroFonte'),
      // Ano vem dos 4 primeiros dígitos do número da NE (2026NE000418).
      ano: UI.valoresFiltroMultiplo('neFiltroAno'),
      // Competência: a NE entra quando o CRONOGRAMA DE DESEMBOLSO dela tem
      // algum mês naquela competência (definição escolhida pelo usuário) - ver
      // filtrarGruposNotasEmpenho_ em backend/NotasEmpenho.gs.
      competencia: UI.valoresFiltroMultiplo('neFiltroCompetencia'),
      saldoBaixo: document.getElementById('neFiltroSaldoBaixo').checked
    };
  }

  /** Mesmo formato "vazio" de filtrosAtuais(), sem depender do DOM - ver mesma função em js/sof.js. Usada só por preCarregar(). */
  function filtrosPadrao_() {
    return { busca: '', unidade_id: [], oss: [], objeto: [], tipo_unidade: [], dea: [], fonte: [], ano: [], competencia: [], saldoBaixo: false };
  }

  /** Pré-carrega os dados desta tela em segundo plano - ver mesma função em js/sof.js. */
  async function preCarregar() {
    try {
      await Promise.all([
        Api.chamar('listarUnidades', { somenteAtivas: true, pageSize: 100000 }, { cache: true, silencioso: true }),
        TelaListas.obterOpcoes('OSS', { silencioso: true }),
        TelaListas.obterOpcoes('OBJETO', { silencioso: true })
      ]);
      const params = Object.assign({ page: 1, pageSize: tamanhoPagina }, filtrosPadrao_());
      await CacheAbas.comRevalidacao('notasEmpenho', params,
        (opcoes) => Api.chamar('listarNotasEmpenho', params, Object.assign({ silencioso: true }, opcoes)),
        () => {}
      );
    } catch (e) { /* pré-carga é best-effort */ }
  }

  /** Chave de filtrosAtuais() correspondente a cada id de filtro-multiplo da barra - ver aoLimparFiltroIndividual_. */
  const CHAVE_POR_FILTRO_ = {
    neFiltroUnidade: 'unidade_id', neFiltroOss: 'oss', neFiltroObjeto: 'objeto',
    neFiltroTipoUnidade: 'tipo_unidade', neFiltroDea: 'dea', neFiltroFonte: 'fonte',
    neFiltroAno: 'ano', neFiltroCompetencia: 'competencia', neBusca: 'busca'
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

  /** Evita reler a lista/mostrar o spinner quando Filtrar/Limpar filtros/"x" não mudam nada de fato. */
  function filtrosMudaram_() {
    return JSON.stringify(filtrosAtuais()) !== ultimoFiltroJson;
  }

  /**
   * "Gerar Relatório" (sessão 2026-08-08): escolha de colunas + agrupamento +
   * as 4 saídas (tela/PDF/CSV/Sheets), com os filtros já aplicados na tela.
   * Modal compartilhado com Unidades e Recibos
   * (TelaRelatorios.abrirParaTela, js/relatorios.js).
   *
   * Cada linha do relatório é um CARD desta tela - ou seja, uma NE agrupada
   * (original + reforços somados), com os mesmos totais que o card mostra -
   * e não uma linha solta da aba NotasEmpenho.
   */
  function abrirGerarRelatorio() {
    return TelaRelatorios.abrirParaTela({
      fonte: 'notasEmpenho',
      titulo: 'Gerar Relatório de Notas de Empenho',
      obterFiltros: filtrosAtuais,
      ajuda: 'Cada linha é uma Nota de Empenho agrupada (original + reforços), como nos cards. O relatório usa os filtros aplicados na tela, em todas as páginas.'
    });
  }

  async function carregar() {
    await carregarComFiltros_(filtrosAtuais());
  }

  async function carregarComFiltros_(filtros) {
    // Zera o cache do combo "Nota de Empenho a Reforçar" (Nova NE -> Reforço):
    // ele é buscado sem filtro na primeira vez que esse tipo é selecionado no
    // modal, e precisa refletir qualquer NE criada desde o último carregar().
    gruposTodos = [];
    // Guardado antes da chamada porque a renderização usa isso para destacar o
    // mês filtrado - e `aplicarResposta_` também roda na revalidação em segundo
    // plano, quando os campos da tela podem já ter mudado.
    competenciasFiltradas_ = filtros.competencia || [];
    ultimoFiltroJson = JSON.stringify(filtros);
    const params = Object.assign({ page: paginaAtual, pageSize: tamanhoPagina }, filtros);
    const resposta = await CacheAbas.comRevalidacao('notasEmpenho', params,
      (opcoes) => Api.chamar('listarNotasEmpenho', params, opcoes),
      aplicarResposta_
    );
    aplicarResposta_(resposta);
  }

  /** id do widget -> dimensão no mapa de facetas (ver UI.aplicarFacetas). */
  const FACETAS_NE_ = {
    neFiltroUnidade: { chave: 'unidade_id', rotulo: id => (unidades.find(u => String(u.id) === String(id)) || {}).nome || id },
    neFiltroOss: { chave: 'oss' },
    neFiltroObjeto: { chave: 'objeto' },
    neFiltroTipoUnidade: { chave: 'tipo_unidade' },
    neFiltroDea: { chave: 'dea' },
    neFiltroFonte: { chave: 'fonte' },
    neFiltroAno: { chave: 'ano' },
    neFiltroCompetencia: { chave: 'competencia' }
  };

  function aplicarResposta_(resposta) {
    grupos = resposta.items;
    totalRegistros = resposta.total;
    UI.aplicarFacetas(resposta.facetas, FACETAS_NE_);
    renderCards();
    renderPaginacao();
  }

  /** Muda tamanhoPagina a partir de qualquer um dos dois seletores (topo/embaixo) e sincroniza o outro - ver mesma função em js/sof.js. */
  function mudarTamanhoPagina_(valorSelecionado) {
    tamanhoPagina = valorSelecionado === 'todos' ? TAMANHO_PAGINA_TODOS_ : Number(valorSelecionado);
    paginaAtual = 1;
    ['neTamanhoPaginaTopo', 'neTamanhoPagina'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = valorSelecionado;
    });
    carregar();
  }

  function renderPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(totalRegistros / tamanhoPagina));
    document.getElementById('paginacaoNe').innerHTML = `
      <span>${totalRegistros} registro(s) - página ${paginaAtual} de ${totalPaginas}</span>
      <div class="paginacao-tamanho"><label for="neTamanhoPagina">Por página</label>
        <select id="neTamanhoPagina">${UI.opcoesTamanhoPaginaHtml(tamanhoPagina === TAMANHO_PAGINA_TODOS_ ? 'todos' : tamanhoPagina)}</select>
      </div>
      <div class="botoes">
        <button class="botao" id="nePagAnterior" ${paginaAtual <= 1 ? 'disabled' : ''}>Anterior</button>
        <button class="botao" id="nePagProxima" ${paginaAtual >= totalPaginas ? 'disabled' : ''}>Próxima</button>
      </div>`;
    document.getElementById('nePagAnterior').addEventListener('click', () => { paginaAtual--; carregar(); });
    document.getElementById('nePagProxima').addEventListener('click', () => { paginaAtual++; carregar(); });
    document.getElementById('neTamanhoPagina').addEventListener('change', function () { mudarTamanhoPagina_(this.value); });
  }

  function seloSituacao_(situacao) {
    if (situacao === 'Pago') return 'verde';
    if (situacao === 'Liquidado') return 'azul';
    if (situacao === 'Em processamento') return 'amarelo';
    return 'cinza';
  }

  /**
   * "Cronograma solicitado" (sessão 2026-07-29, pedido do usuário): meses
   * SOLICITADOS pela SOF (fonte+objeto casada com esta NE), verde quando o
   * acumulado empenhado (mãe + reforços) já cobre o acumulado solicitado até
   * aquele mês, vermelho quando ainda não - vem pronto do backend
   * (g.cronograma_solicitado, montarGruposNotasEmpenho_ em NotasEmpenho.gs).
   * Diferente do cronograma abaixo (que é o lido por OCR do documento da NE,
   * com Situação vinda dos Recibos/pagamento) - aqui o sinal é só "o valor
   * empenhado já dá pra cobrir esse mês do que a SOF pediu", sem depender de
   * já ter sido liquidado/pago.
   */
  function cronogramaSolicitadoBoxHtml_(g) {
    const meses = g.cronograma_solicitado || [];
    if (!meses.length) return '';
    return `
      <div class="cartao-ne-cronograma-solicitado">
        <div class="cartao-ne-cronograma-cabecalho">
          <div>
            <strong>CRONOGRAMA SOLICITADO (SOF)</strong>
            <div class="ajuda">${UI.escaparHtml(g.objeto || g.sof_objeto || '-')}</div>
          </div>
          <span class="cartao-ne-cronograma-badge">${meses.length} meses</span>
        </div>
        <div class="cronograma-solicitado-grade">
          ${meses.map(c => `
            <div class="cronograma-solicitado-item ${c.atendido ? 'atendido' : 'pendente'}" title="${c.atendido ? 'Atendido' : 'Falta atender'}">
              <span class="cronograma-solicitado-mes">${UI.escaparHtml(NOMES_MESES[c.mes - 1] || c.mes)}</span>
              <span class="cronograma-solicitado-valor">${UI.formatarMoeda(c.valor)}</span>
            </div>`).join('')}
        </div>
        <!-- Legenda é só a chave de cores: os valores (Total Atendido, Total
             Solicitado) já aparecem no próprio card da NE, logo acima. -->
        <p class="ajuda">🟩 Atendido · 🟥 Falta atender</p>
      </div>`;
  }

  const MESES_ABREV_ = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  /**
   * "mmm.aa" a partir do mês do cronograma e do ano da NE - espelha
   * competenciaDoMes_ (backend/NotasEmpenho.gs), que é quem decide o filtro.
   * Se as duas divergirem, o mês filtrado deixa de ser destacado.
   */
  function competenciaDoMesNe_(mes, ano) {
    return MESES_ABREV_[mes - 1] + '.' + String(ano).slice(-2);
  }

  function cronogramaBoxHtml_(g) {
    const cronograma = g.cronograma || [];
    const total = cronograma.reduce((s, c) => s + Number(c.valor || 0), 0);
    const confereTotal = Math.abs(total - Number(g.valor_bruto || 0)) < 0.01;
    // Com filtro de Competência ativo, o cronograma já abre expandido e o(s)
    // mês(es) filtrado(s) ficam destacados - o pedido do usuário foi justamente
    // "ao filtrar, mostrar como está a situação da NE naquele mês". Sem isso o
    // analista teria de abrir card por card para ver o que filtrou.
    const filtrando = competenciasFiltradas_.length > 0;
    const ehFiltrado = c => filtrando && competenciasFiltradas_.indexOf(competenciaDoMesNe_(c.mes, g.ano)) !== -1;
    return `
      <div class="cartao-ne-cronograma-caixa ${filtrando ? '' : 'oculto'}">
        ${cronogramaSolicitadoBoxHtml_(g)}
        ${cronograma.length ? `
        <div class="cartao-ne-cronograma-cabecalho">
          <div>
            <strong>CRONOGRAMA DE DESEMBOLSO (documento)</strong>
            <div class="ajuda">Pagamentos mensais · ${g.ano || ''}</div>
          </div>
          <span class="cartao-ne-cronograma-badge">${cronograma.length} meses</span>
        </div>
        <table class="tabela">
          <thead><tr><th>Mês</th><th>Valor previsto</th><th>Situação</th></tr></thead>
          <tbody>${cronograma.map(c => `
            <tr class="${ehFiltrado(c) ? 'linha-mes-filtrado' : ''}">
              <td>${UI.escaparHtml(NOMES_MESES[c.mes - 1] || c.mes)}${c.reforco ? ' <span class="selo azul">+ reforço</span>' : ''}${ehFiltrado(c) ? ' <span class="selo azul">filtrado</span>' : ''}</td>
              <td>${UI.formatarMoeda(c.valor)}</td>
              <td><span class="selo ${seloSituacao_(c.situacao)}">${UI.escaparHtml(c.situacao)}</span></td>
            </tr>`).join('') || '<tr><td colspan="3" class="estado-vazio">Sem cronograma lido para esta NE.</td></tr>'}</tbody>
          <tfoot><tr>
            <td><strong>Total do cronograma</strong></td>
            <td><strong>${UI.formatarMoeda(total)}</strong></td>
            <td class="ajuda">${confereTotal ? 'Conforme valor bruto' : 'Diverge do valor bruto'}</td>
          </tr></tfoot>
        </table>` : ''}
      </div>`;
  }

  /**
   * Tabela "Reforços lançados" desta NE (sessão 2026-07-30, pedido do
   * usuário: "a NE de reforço está sendo salva várias vezes como se fosse um
   * arquivo para cada mês"). Cada linha da tabela é UM documento de reforço
   * (agrupado por numero_ne_reforco no backend, ver reforcos_agrupados em
   * montarGruposNotasEmpenho_/agruparReforcosPorNumero_, NotasEmpenho.gs),
   * mesmo que ele cubra vários meses - não mais uma linha por mês. O botão
   * de excluir e o link "Ver arquivo" ficam dentro da própria linha,
   * referentes a todos os meses daquele documento de uma vez
   * (excluirNotasEmpenhoEmLote, com os ids de todos os meses do grupo).
   */
  function linhasReforcoHtml_(g) {
    const grupos = g.reforcos_agrupados || [];
    if (!grupos.length) return '';
    return `
      <div class="cartao-ne-linhas">
        <label>Reforços lançados</label>
        <div class="tabela-reforcos-wrap">
          <table class="tabela tabela-reforcos">
            <thead><tr><th>Nº da NE de reforço</th><th>Meses</th><th>Valor por mês</th><th>Arquivo</th><th></th></tr></thead>
            <tbody>
              ${grupos.map(rg => `
                <tr data-ids="${rg.ids.join(',')}">
                  <td>${rg.numero_ne_reforco ? UI.escaparHtml(rg.numero_ne_reforco) : '<span class="ajuda">-</span>'}</td>
                  <td>${rg.meses.length
                    ? `<ul class="tabela-reforcos-lista">${rg.meses.map(m => `<li>${UI.escaparHtml(NOMES_MESES[m.mes - 1])}</li>`).join('')}</ul>`
                    : '<span class="ajuda">-</span>'}</td>
                  <td>${rg.meses.length
                    ? `<ul class="tabela-reforcos-lista">${rg.meses.map(m => `<li>${UI.formatarMoeda(m.valor)}</li>`).join('')}</ul>`
                    : UI.formatarMoeda(rg.valor_total)}</td>
                  <td>${rg.arquivo_url ? `<a href="${UI.escaparHtml(rg.arquivo_url)}" target="_blank" rel="noopener" class="botao">Ver arquivo</a>` : '<span class="ajuda">-</span>'}</td>
                  <td><button type="button" class="botao-icone excluir" data-acao="excluir-reforco" data-ids="${rg.ids.join(',')}" title="Excluir este reforço (todos os meses deste documento)">${ICONE_LIXEIRA}</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function cartaoNeHtml_(g) {
    const cronograma = g.cronograma || [];
    const cronogramaSolicitado = g.cronograma_solicitado || [];
    const temCronograma = cronograma.length > 0 || cronogramaSolicitado.length > 0;
    return `
      <div class="cartao-ne ${g.alerta ? 'alerta' : ''} ${modoSelecaoLote ? 'em-selecao-lote' : ''}" data-numero="${UI.escaparHtml(g.numero_ne)}">
        <div class="cartao-ne-topo">
          ${modoSelecaoLote ? `<input type="checkbox" class="checkbox-selecao-lote" data-numero="${UI.escaparHtml(g.numero_ne)}" ${numerosNeSelecionados_.has(g.numero_ne) ? 'checked' : ''} title="Selecionar para excluir" />` : ''}
          <span class="cartao-ne-meta">${ICONE_PASTA} ${UI.escaparHtml(g.objeto || '-')} · SOF ${UI.escaparHtml(g.sof_numero || '-')}</span>
          ${g.alerta ? '<span class="selo vermelho">Saldo abaixo da parcela</span>' : ''}
        </div>
        <h3 class="cartao-ne-numero">${UI.escaparHtml(g.numero_ne)}</h3>
        <p class="cartao-ne-unidade">${UI.escaparHtml(g.unidade_nome || '-')}</p>
        <div class="cartao-ne-infogrid">
          <div class="cartao-ne-infogrid-item"><span>Total Solicitado</span><strong>${UI.formatarMoeda(g.total_solicitado)}</strong></div>
          <div class="cartao-ne-infogrid-item"><span>Total Atendido</span><strong>${UI.formatarMoeda(g.total_atendido)}</strong></div>
          <div class="cartao-ne-infogrid-item"><span>Saldo Atual</span><strong class="${g.alerta ? 'vermelho' : ''}">${UI.formatarMoeda(g.saldo_atual)}</strong></div>
          <div class="cartao-ne-infogrid-item"><span>Falta ser Atendido</span>${g.falta_atendido <= 0.005
            ? '<strong class="verde">O total solicitado já foi atendido!</strong>'
            : `<strong>${UI.formatarMoeda(g.falta_atendido)}</strong>`}</div>
        </div>
        ${linhasReforcoHtml_(g)}
        <div class="cartao-ne-rodape">
          <div class="cartao-ne-rodape-links">
            ${temCronograma ? '<button type="button" class="botao cartao-ne-ver-cronograma">Ver cronograma ↓</button>' : '<span class="ajuda">Sem cronograma</span>'}
            ${(g.arquivos || []).map((a, i) => `<a href="${UI.escaparHtml(a.url)}" target="_blank" rel="noopener" class="botao">Ver arquivo${g.arquivos.length > 1 ? ' ' + (i + 1) : ''}</a>`).join('')}
          </div>
          <button type="button" class="botao sucesso" data-acao="reforco">+ Reforço</button>
        </div>
        ${temCronograma ? cronogramaBoxHtml_(g) : ''}
      </div>`;
  }

  function renderCards() {
    const alvo = document.getElementById('listaNe');
    if (!grupos.length) { alvo.innerHTML = '<p class="estado-vazio">Nenhuma Nota de Empenho encontrada.</p>'; return; }
    alvo.innerHTML = `<div class="grade-cards-sof">${grupos.map(cartaoNeHtml_).join('')}</div>`;

    alvo.querySelectorAll('.cartao-ne').forEach(cartao => {
      const grupo = grupos.find(g => g.numero_ne === cartao.dataset.numero);

      if (modoSelecaoLote) {
        const chk = cartao.querySelector('.checkbox-selecao-lote');
        chk.addEventListener('change', () => {
          if (chk.checked) numerosNeSelecionados_.add(chk.dataset.numero); else numerosNeSelecionados_.delete(chk.dataset.numero);
          atualizarBarraSelecaoLote_();
        });
        return;
      }

      cartao.querySelector('[data-acao="reforco"]').addEventListener('click', () => abrirModalReforco(grupo));
      // botão, não link (sessão 2026-09-01, pedido do usuário: padronizar
      // com os outros botões do app) - não precisa mais de preventDefault,
      // já que um <button> não navega em lugar nenhum sozinho.
      const botaoCronograma = cartao.querySelector('.cartao-ne-ver-cronograma');
      if (botaoCronograma) botaoCronograma.addEventListener('click', () => {
        const caixa = cartao.querySelector('.cartao-ne-cronograma-caixa');
        caixa.classList.toggle('oculto');
        const aberto = !caixa.classList.contains('oculto');
        botaoCronograma.textContent = aberto ? 'Ocultar cronograma ↑' : 'Ver cronograma ↓';
      });
      cartao.querySelectorAll('[data-acao="excluir-reforco"]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          excluirReforcoClique_(btn.dataset.ids.split(','));
        });
      });
    });
  }

  /** Liga/desliga o modo de seleção em lote (sessão 2026-08-31) - ver mesma função em js/sof.js. */
  function alternarModoSelecaoLote_(ligar) {
    modoSelecaoLote = typeof ligar === 'boolean' ? ligar : !modoSelecaoLote;
    numerosNeSelecionados_.clear();
    document.getElementById('btnModoSelecaoLoteNe').classList.toggle('ativo', modoSelecaoLote);
    atualizarBarraSelecaoLote_();
    renderCards();
  }

  function atualizarBarraSelecaoLote_() {
    document.getElementById('barraSelecaoLoteNe').classList.toggle('oculto', !modoSelecaoLote);
    document.getElementById('contagemSelecaoLoteNe').textContent = `${numerosNeSelecionados_.size} selecionado(s)`;
    document.getElementById('btnExcluirSelecionadosNe').disabled = numerosNeSelecionados_.size === 0;
    // "Selecionar todos" reflete o estado atual mesmo quando a seleção veio
    // de marcar os cards um por um (não só pelo próprio checkbox) -
    // indeterminate (nem marcado nem desmarcado) quando só parte está selecionada.
    const chkTodos = document.getElementById('chkSelecionarTodosNe');
    const totalMarcavel = grupos.length;
    chkTodos.checked = totalMarcavel > 0 && numerosNeSelecionados_.size === totalMarcavel;
    chkTodos.indeterminate = numerosNeSelecionados_.size > 0 && numerosNeSelecionados_.size < totalMarcavel;
  }

  /**
   * Exclui vários cards de NE inteiros de uma vez (sessão 2026-08-31) - cada
   * card selecionado é um GRUPO (mãe + reforços); junta as ids de TODAS as
   * linhas de cada grupo selecionado (grupo.linhas) antes de mandar pro
   * backend, que exclui tudo junto (excluirGrupoNotaEmpenhoEmLote).
   */
  function excluirSelecionadosLoteClique_() {
    if (!numerosNeSelecionados_.size) return;
    const qtdCards = numerosNeSelecionados_.size;
    const idsParaExcluir = grupos
      .filter(g => numerosNeSelecionados_.has(g.numero_ne))
      .flatMap(g => (g.linhas || []).map(l => l.id));
    if (!idsParaExcluir.length) return;
    const corpo = `<p class="aviso-exclusao">TEM CERTEZA QUE QUER EXCLUIR ${qtdCards} NOTA(S) DE EMPENHO (COM TODOS OS SEUS REFORÇOS)? A EXCLUSÃO PODE SER REVERTIDA APENAS POR UM ADMINISTRADOR DIRETAMENTE NA PLANILHA.</p>`;
    UI.abrirModal('Excluir Notas de Empenho em lote', corpo,
      `<button class="botao" id="btnCancelarExclusaoLoteNe">Cancelar</button><button class="botao perigo" id="btnConfirmarExclusaoLoteNe">Excluir</button>`,
      { pequeno: true });
    document.getElementById('btnCancelarExclusaoLoteNe').addEventListener('click', UI.fecharModal);
    document.getElementById('btnConfirmarExclusaoLoteNe').addEventListener('click', async () => {
      try {
        await Api.chamar('excluirGrupoNotaEmpenhoEmLote', { ids: idsParaExcluir });
        CacheAbas.invalidar('notasEmpenho');
        CacheAbas.invalidar('sof');
        UI.toast('Notas de Empenho excluídas.', 'sucesso');
        UI.fecharModal();
        alternarModoSelecaoLote_(false);
        await carregar();
      } catch (err) {
        UI.toast(err.message, 'erro');
      }
    });
  }

  /**
   * Exclui um reforço (sessão 2026-07-29, atualizado 2026-07-30 pra excluir
   * em lote): um "reforço" na tabela "Reforços lançados" pode ser 1+ linhas
   * na planilha (1 por mês, quando o documento cobre vários meses de uma
   * vez) - o botão exclui o grupo inteiro (todos os meses daquele
   * documento), não uma linha isolada, com uma única confirmação.
   */
  async function excluirReforcoClique_(ids) {
    const mensagem = ids.length > 1
      ? 'Excluir este reforço (todos os ' + ids.length + ' meses deste documento)? A exclusão pode ser revertida apenas por um administrador diretamente na planilha.'
      : 'Excluir este reforço? A exclusão pode ser revertida apenas por um administrador diretamente na planilha.';
    if (!confirm(mensagem)) return;
    try {
      await Api.chamar('excluirNotasEmpenhoEmLote', { ids });
      CacheAbas.invalidar('notasEmpenho');
      CacheAbas.invalidar('sof');
      UI.toast('Reforço excluído.', 'sucesso');
      await carregar();
    } catch (err) {
      UI.toast(err.message, 'erro');
    }
  }

  /**
   * "+ Reforço" no card da NE (sessão 2026-07-29, pedido do usuário): o
   * documento é lido por OCR (mesma extração de lerAnexoNotaEmpenho usada
   * pra NE original) - se o documento tiver a tabela "Cronograma de
   * Desembolso", cada mês com valor > 0 é tratado como um mês reforçado (o
   * analista não digita nada: 1 mês vira 1 reforço, 2+ meses viram vários
   * reforços de uma vez, todos compartilhando o mesmo arquivo anexado -
   * criarReforcosEmLote, NotasEmpenho.gs). Se o documento não tiver essa
   * tabela (formato mais simples, sem cronograma), cai pro Preço Total lido
   * como valor único, sem mês associado - só nesse caso residual (ou se a
   * leitura falhar) os campos manuais de Mês/Valor ficam disponíveis, como
   * uma rede de segurança, não o caminho principal.
   */
  /**
   * Confere o "Nº DA N.E. DE REFERÊNCIA:" lido do documento (só existe em
   * documentos de reforço) contra a NE que o analista está de fato
   * reforçando (sessão 2026-07-30, pedido do usuário) - não bloqueia (o OCR
   * pode errar a leitura de um campo secundário), só avisa bem visível.
   * Atualiza o <p id="{idAviso}"> indicado; some sozinho quando bate ou
   * quando o documento não tinha esse campo preenchido (NE original, ou
   * campo não lido).
   */
  function conferirNeReferencia_(idAviso, numeroLido, numeroAlvo) {
    const el = document.getElementById(idAviso);
    if (!el) return;
    if (numeroLido && numeroAlvo && numeroLido !== numeroAlvo) {
      el.classList.remove('oculto');
      el.textContent = `⚠ O documento indica reforço da NE ${numeroLido}, mas você está reforçando a NE ${numeroAlvo} - confira antes de salvar.`;
    } else {
      el.classList.add('oculto');
      el.textContent = '';
    }
  }

  /**
   * Mostra (num <details> recolhido, some sozinho até ter algo) o texto
   * bruto que o OCR leu do documento (sessão 2026-07-30) - diagnóstico pra
   * quando um campo não é identificado corretamente: o layout visto no PDF
   * nem sempre bate com a ordem/formatação que o OCR do Google devolve como
   * texto plano, então ver o texto real é o jeito confiável de depurar um
   * regex que não está batendo, em vez de adivinhar.
   */
  function mostrarDiagnosticoOcr_(idDetails, texto) {
    const el = document.getElementById(idDetails);
    if (!el) return;
    if (texto) {
      el.classList.remove('oculto');
      el.querySelector('pre').textContent = texto;
    } else {
      el.classList.add('oculto');
      el.querySelector('pre').textContent = '';
    }
  }

  /**
   * Apaga em segundo plano (sessão 2026-08-12) um arquivo que
   * lerAnexoNotaEmpenho já subiu definitivamente pro Drive (ver otimização
   * lá: o upload passou a acontecer na leitura, não mais no salvamento) mas
   * que acabou não sendo salvo - reselecionar outro arquivo, "Remover
   * anexo", ou fechar o modal sem salvar. {silencioso: true} evita o
   * spinner global (Api.chamar, js/api.js) - é limpeza que o analista nem
   * precisa perceber, não uma ação que ele pediu ou precisa esperar; erro
   * aqui (rede, arquivo já removido) é apenas ignorado.
   */
  function descartarArquivoNaoSalvo_(arquivoDriveId) {
    if (!arquivoDriveId) return;
    Api.chamar('descartarArquivoNaoSalvoNotaEmpenho', { arquivoId: arquivoDriveId }, { silencioso: true }).catch(() => {});
  }

  function abrirModalReforco(grupo) {
    const corpo = `
      <form id="formReforcoNe">
        <p class="ajuda">Reforço para a NE ${UI.escaparHtml(grupo.numero_ne)} (fonte ${UI.escaparHtml(grupo.fonte)}). Anexe o documento - os meses reforçados e os valores são identificados automaticamente.</p>
        <div class="campo"><label>Arquivo *</label><input type="file" id="reforcoArquivo" accept=".pdf,image/*" required /></div>
        <p id="reforcoStatusAnexo" class="ajuda oculto"></p>
        <p id="reforcoAvisoReferencia" class="aviso-divergencia oculto"></p>
        <div id="reforcoMesesDetectados" class="oculto"></div>
        <details class="ocr-diagnostico oculto" id="reforcoDiagnostico">
          <summary>Ver texto lido do documento (diagnóstico)</summary>
          <pre></pre>
        </details>
        <div class="grade-2" id="reforcoManualCampos">
          <div class="campo"><label>Mês de referência do reforço *</label>
            <select id="reforcoMes" required><option value="">Selecione...</option>${NOMES_MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>Valor do reforço *</label><input id="reforcoValor" type="text" inputmode="decimal" class="campo-moeda" required /></div>
        </div>
        <p id="reforcoErro" class="erro-campo oculto"></p>
      </form>`;
    UI.abrirModal('Adicionar reforço', corpo,
      `<button class="botao" id="btnCancelarReforco">Cancelar</button><button class="botao primario" id="btnSalvarReforco">Salvar</button>`,
      { pequeno: true });

    UI.tornarPesquisavel('reforcoMes');

    let itensDetectados = null; // [{mes_referencia, valor}, ...] quando o OCR acha 1+ meses no cronograma do documento
    let arquivoLido = null; // {arquivo_drive_id, arquivo_url} - arquivo já enviado ao Drive por uma leitura bem-sucedida (ver lerAnexoNotaEmpenho, NotasEmpenho.gs)
    let numeroNeReforcoDetectado = null; // número da própria NE de reforço (lido do documento), usado para agrupar no card

    // Fecha o modal por qualquer caminho (Cancelar, X, clique fora, ou
    // fechamento programático após salvar) - se sobrar um arquivo já
    // enviado ao Drive mas não salvo, descarta em segundo plano (sessão
    // 2026-08-12). Depois de um salvamento bem-sucedido, arquivoLido já foi
    // zerado antes do fecharModal() correspondente, então isto vira no-op.
    UI.aoFecharModal(() => descartarArquivoNaoSalvo_(arquivoLido && arquivoLido.arquivo_drive_id));

    function mostrarMesesDetectados_(itens) {
      const alvo = document.getElementById('reforcoMesesDetectados');
      if (!itens || !itens.length) { alvo.classList.add('oculto'); alvo.innerHTML = ''; return; }
      alvo.classList.remove('oculto');
      alvo.innerHTML = `<label>Meses reforçados (lidos do documento)</label>
        <div class="cronograma-ne-grade">${itens.map(it => `<div class="cronograma-ne-item"><span>${UI.escaparHtml(NOMES_MESES[it.mes_referencia - 1])}</span><span>${UI.formatarMoeda(it.valor)}</span></div>`).join('')}</div>`;
    }

    document.getElementById('reforcoArquivo').addEventListener('change', async function () {
      const inputEl = this;
      const arquivo = inputEl.files[0];
      const statusEl = document.getElementById('reforcoStatusAnexo');
      const erroEl = document.getElementById('reforcoErro');
      const camposManuais = document.getElementById('reforcoManualCampos');
      erroEl.classList.add('oculto');
      // Trocar de arquivo sem clicar "Remover anexo" primeiro abandona
      // qualquer upload já feito por uma leitura anterior - descarta em
      // segundo plano antes de zerar o estado (sessão 2026-08-12).
      descartarArquivoNaoSalvo_(arquivoLido && arquivoLido.arquivo_drive_id);
      itensDetectados = null;
      arquivoLido = null;
      numeroNeReforcoDetectado = null;
      mostrarMesesDetectados_(null);
      conferirNeReferencia_('reforcoAvisoReferencia', null, null);
      mostrarDiagnosticoOcr_('reforcoDiagnostico', null);
      if (!arquivo) return;
      if (arquivo.size > 8 * 1024 * 1024) { UI.toast('Arquivo muito grande (máximo 8MB).', 'erro'); inputEl.value = ''; return; }
      statusEl.classList.remove('oculto');
      statusEl.textContent = 'Lendo documento...';
      try {
        const base64 = await UI.lerArquivoBase64(arquivo);
        const resultado = await Api.chamar('lerAnexoNotaEmpenho', { arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type });
        // arquivo_drive_id/arquivo_url (sessão 2026-08-12): a leitura já subiu
        // o arquivo definitivamente pro Drive - salvar não precisa reenviar
        // o base64, só referenciar esses dois campos (ver criarReforcosEmLote/
        // criarNotaEmpenho, NotasEmpenho.gs).
        arquivoLido = { arquivo_drive_id: resultado.arquivo_drive_id, arquivo_url: resultado.arquivo_url };
        const mesesComValor = (resultado.cronograma || []).filter(c => Number(c.valor) > 0);
        numeroNeReforcoDetectado = resultado.numero_ne || null;
        conferirNeReferencia_('reforcoAvisoReferencia', resultado.numero_ne_referencia, grupo.numero_ne);
        mostrarDiagnosticoOcr_('reforcoDiagnostico', resultado.texto_ocr_debug);

        let mensagemStatus;
        if (mesesComValor.length) {
          itensDetectados = mesesComValor.map(c => ({ mes_referencia: c.mes, valor: c.valor }));
          mostrarMesesDetectados_(itensDetectados);
          camposManuais.classList.add('oculto');
          document.getElementById('reforcoMes').required = false;
          document.getElementById('reforcoValor').required = false;
          const totalDetectado = itensDetectados.reduce((s, it) => s + it.valor, 0);
          mensagemStatus = `🔒 ${itensDetectados.length} mês(es) identificado(s) automaticamente, total ${UI.formatarMoeda(totalDetectado)}.`;
        } else if (resultado.preco_total) {
          document.getElementById('reforcoValor').value = resultado.preco_total;
          document.getElementById('reforcoValor').readOnly = true;
          camposManuais.classList.remove('oculto');
          mensagemStatus = `🔒 Valor lido do documento (${UI.formatarMoeda(resultado.preco_total)}) - não foi possível identificar o mês; selecione manualmente.`;
        } else {
          camposManuais.classList.remove('oculto');
          mensagemStatus = 'Não foi possível ler meses nem valor no documento - preencha manualmente.';
        }
        statusEl.innerHTML = mensagemStatus + ' <a href="#" id="reforcoRemoverAnexo">Remover anexo' + (itensDetectados ? '' : ' / preencher manualmente') + '</a>';
        document.getElementById('reforcoRemoverAnexo').addEventListener('click', e => {
          e.preventDefault();
          descartarArquivoNaoSalvo_(arquivoLido && arquivoLido.arquivo_drive_id);
          itensDetectados = null;
          arquivoLido = null;
          numeroNeReforcoDetectado = null;
          inputEl.value = '';
          mostrarMesesDetectados_(null);
          conferirNeReferencia_('reforcoAvisoReferencia', null, null);
          mostrarDiagnosticoOcr_('reforcoDiagnostico', null);
          camposManuais.classList.remove('oculto');
          document.getElementById('reforcoMes').required = true;
          document.getElementById('reforcoValor').required = true;
          document.getElementById('reforcoValor').readOnly = false;
          document.getElementById('reforcoValor').value = '';
          statusEl.classList.add('oculto');
        });
      } catch (err) {
        inputEl.value = '';
        arquivoLido = null;
        numeroNeReforcoDetectado = null;
        statusEl.classList.add('oculto');
        camposManuais.classList.remove('oculto');
        // texto_ocr_debug (sessão 2026-08-12): vem junto do erro (ver fail_ em
        // Utils.gs/erro.dados em api.js) justamente nas falhas de leitura -
        // antes só aparecia quando a leitura dava certo, o caso que menos
        // precisa de diagnóstico.
        mostrarDiagnosticoOcr_('reforcoDiagnostico', err.dados && err.dados.texto_ocr_debug);
        UI.toast('Não foi possível ler o documento automaticamente - preencha manualmente. ' + err.message, 'erro');
      }
    });

    document.getElementById('btnCancelarReforco').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarReforco').addEventListener('click', async () => {
      const erroEl = document.getElementById('reforcoErro');
      erroEl.classList.add('oculto');
      if (!arquivoLido) { UI.mostrarErro(erroEl, 'Anexe o arquivo do reforço.'); return; }

      try {
        if (itensDetectados && itensDetectados.length) {
          await Api.chamar('criarReforcosEmLote', {
            data: Object.assign({ sof_id: grupo.sof_id, numero_ne: grupo.numero_ne, numero_ne_reforco: numeroNeReforcoDetectado, itens: itensDetectados }, arquivoLido)
          });
        } else {
          const mesReferencia = document.getElementById('reforcoMes').value;
          // parseValorBr, não .value cru: "1.234,56" passava por Number() como
          // NaN, NaN <= 0 é false, então a validação abaixo AUTORIZAVA e o
          // backend gravava 0 (ver js/app.js).
          const valor = UI.parseValorBr(document.getElementById('reforcoValor').value);
          if (!mesReferencia) { UI.mostrarErro(erroEl, 'Selecione o mês de referência do reforço.'); return; }
          if (!valor || valor <= 0) { UI.mostrarErro(erroEl, 'Informe um valor válido.'); return; }
          await Api.chamar('criarNotaEmpenho', {
            data: Object.assign({ sof_id: grupo.sof_id, tipo: 'reforco', numero_ne: grupo.numero_ne, numero_ne_reforco: numeroNeReforcoDetectado, fonte: grupo.fonte, valor, mes_referencia: mesReferencia }, arquivoLido)
          });
        }
        CacheAbas.invalidar('notasEmpenho');
        // Reforço muda o valor atendido acumulado da fonte+objeto - a tela de
        // SOF (cronograma verde/vermelho) precisa refletir isso na próxima
        // vez que for aberta, não só a tela de NE.
        CacheAbas.invalidar('sof');
        UI.toast('Reforço adicionado.', 'sucesso');
        // Zera ANTES do fecharModal() - o arquivo acabou de ser vinculado à
        // NE salva, não é mais "não salvo" (ver aoFecharModal registrado
        // acima, senão o próprio arquivo que acabou de ser salvo seria apagado).
        arquivoLido = null;
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  /** Renderiza (ou esconde) o preview de cronograma dentro do modal de criação. */
  function renderCronogramaPreview_(cronograma) {
    const alvo = document.getElementById('novaNeCronograma');
    if (!cronograma || !cronograma.length) { alvo.classList.add('oculto'); alvo.innerHTML = ''; return; }
    alvo.classList.remove('oculto');
    alvo.innerHTML = `<label>Cronograma de desembolso (lido do documento)</label>
      <div class="cronograma-ne-grade">${cronograma.map(c => `<div class="cronograma-ne-item"><span>${UI.escaparHtml(c.rotulo)}</span><span>${UI.formatarMoeda(c.valor)}</span></div>`).join('')}</div>`;
  }

  /**
   * "Nova Nota de Empenho":
   * - Original: Unidade -> SOF em comum -> Fonte + anexo, com OCR (backend
   *   lerAnexoNotaEmpenho) preenchendo Número/Cronograma/Preço Total e
   *   travando os campos (mesmo padrão de ligarAnexoComOcr_ em js/recibos.js)
   *   - "Remover anexo" libera pra tentar de novo.
   * - Reforço (sessão 2026-07-29, com OCR): os campos Unidade/SOF somem -
   *   busca direto, num combo pesquisável, a Nota de Empenho original (de
   *   qualquer SOF/unidade) a reforçar; ao anexar o arquivo, o OCR
   *   (lerAnexoNotaEmpenho) tenta identificar sozinho quais meses foram
   *   reforçados e o valor de cada um (mesmo mecanismo de abrirModalReforco,
   *   duplicado aqui por ser um modal/DOM separado) - Mês/Valor manuais só
   *   aparecem como reserva, se a leitura não achar a tabela de cronograma.
   */
  function abrirModalNovaNe() {
    const corpo = `
      <form id="formNovaNe">
        <div class="campo"><label>Tipo *</label>
          <select id="novaNeTipo">
            <option value="original">Nota de Empenho original (nova)</option>
            <option value="reforco">Reforço de uma Nota de Empenho já existente</option>
          </select>
        </div>
        <div id="blocoNovaNeUnidadeSof" class="grade-2">
          <div class="campo"><label>Unidade *</label>
            <select id="novaNeUnidade" required><option value="">Selecione...</option>${unidades.map(u => `<option value="${u.id}">${UI.escaparHtml(u.nome)}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>SOF *</label>
            <select id="novaNeSof" required><option value="">Selecione a unidade primeiro</option></select>
          </div>
        </div>
        <div id="blocoNovaNeOriginal">
        <div class="grade-2">
          <div class="campo"><label>Fonte *</label>
            <select id="novaNeFonte" required><option value="">Selecione o SOF primeiro</option></select>
          </div>
          <div class="campo"><label>Objeto *</label>
            <select id="novaNeObjeto" required><option value="">Selecione a fonte primeiro</option></select>
          </div>
        </div>
        <div class="campo"><label>Anexo da Nota de Empenho *</label><input type="file" id="novaNeArquivo" accept=".pdf,image/*" /></div>
        <p class="ajuda">Ao anexar, o número, o cronograma de desembolso e o preço total são lidos automaticamente do documento.</p>
        <p id="novaNeStatusAnexo" class="ajuda oculto"></p>
        <div class="campo"><label>Número</label><input id="novaNeNumero" readonly /></div>
        <div id="novaNeCronograma" class="oculto"></div>
        <div class="campo"><label>Preço Total</label><input id="novaNePrecoTotal" readonly /></div>
        <p id="novaNeAvisoDivergencia" class="aviso-divergencia oculto">⚠ A soma do cronograma não bate com o Preço Total do documento.</p>
        <details class="ocr-diagnostico oculto" id="novaNeDiagnostico">
          <summary>Ver texto lido do documento (diagnóstico)</summary>
          <pre></pre>
        </details>
        </div>

        <div id="blocoNovaNeReforco" class="oculto">
          <div class="campo"><label>Nota de Empenho a Reforçar *</label>
            <select id="novaNeReforcoAlvo" required><option value="">Selecione o tipo "Reforço" acima</option></select>
          </div>
          <div class="campo"><label>Arquivo *</label><input type="file" id="novaNeReforcoArquivo" accept=".pdf,image/*" /></div>
          <p class="ajuda">Ao anexar, os meses reforçados e os valores são identificados automaticamente.</p>
          <p id="novaNeReforcoStatusAnexo" class="ajuda oculto"></p>
          <p id="novaNeReforcoAvisoReferencia" class="aviso-divergencia oculto"></p>
          <div id="novaNeReforcoMesesDetectados" class="oculto"></div>
          <details class="ocr-diagnostico oculto" id="novaNeReforcoDiagnostico">
            <summary>Ver texto lido do documento (diagnóstico)</summary>
            <pre></pre>
          </details>
          <div class="grade-2" id="novaNeReforcoManualCampos">
            <div class="campo"><label>Mês de referência do reforço *</label>
              <select id="novaNeReforcoMes" required><option value="">Selecione...</option>${NOMES_MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>
            </div>
            <div class="campo"><label>Valor do reforço *</label><input id="novaNeReforcoValor" type="text" inputmode="decimal" class="campo-moeda" /></div>
          </div>
        </div>

        <p id="novaNeErro" class="erro-campo oculto"></p>
      </form>`;
    UI.abrirModal('Nova Nota de Empenho', corpo,
      `<button class="botao" id="btnCancelarNovaNe">Cancelar</button><button class="botao primario" id="btnSalvarNovaNe">Salvar</button>`);

    let sofsDaUnidade = [];
    let leituraOcr = null; // {numero_ne, cronograma, preco_total, arquivo_drive_id, arquivo_url} - original
    let fontesDoSofAtual = [];
    // Reforço lido por OCR (sessão 2026-07-29) - ver abrirModalReforco (mesma
    // lógica, duplicada aqui porque este modal tem seu próprio DOM/estado).
    let itensReforcoDetectados = null;
    let arquivoReforcoLido = null; // {arquivo_drive_id, arquivo_url}
    let numeroNeReforcoDetectado = null; // número da própria NE de reforço (lido do documento), usado para agrupar no card

    // Este modal tem DOIS sub-fluxos independentes (original/reforço,
    // alternados pelo select "Tipo") - trocar de tipo não limpa o anexo já
    // lido do outro (ver novaNeTipo abaixo), então os dois podem ter um
    // arquivo pendente ao mesmo tempo; descarta em segundo plano qualquer um
    // que ainda esteja com upload feito mas não salvo, por qualquer caminho
    // de fechamento do modal (sessão 2026-08-12). Depois de um salvamento
    // bem-sucedido, a variável correspondente já foi zerada antes do
    // fecharModal(), então vira no-op pra aquele arquivo específico.
    UI.aoFecharModal(() => {
      descartarArquivoNaoSalvo_(leituraOcr && leituraOcr.arquivo_drive_id);
      descartarArquivoNaoSalvo_(arquivoReforcoLido && arquivoReforcoLido.arquivo_drive_id);
    });

    function mostrarMesesReforcoDetectados_(itens) {
      const alvo = document.getElementById('novaNeReforcoMesesDetectados');
      if (!alvo) return;
      if (!itens || !itens.length) { alvo.classList.add('oculto'); alvo.innerHTML = ''; return; }
      alvo.classList.remove('oculto');
      alvo.innerHTML = `<label>Meses reforçados (lidos do documento)</label>
        <div class="cronograma-ne-grade">${itens.map(it => `<div class="cronograma-ne-item"><span>${UI.escaparHtml(NOMES_MESES[it.mes_referencia - 1])}</span><span>${UI.formatarMoeda(it.valor)}</span></div>`).join('')}</div>`;
    }

    /** Repopula o <select> de Objeto a partir da Fonte escolhida (cascata, sessão 2026-07-29). */
    function atualizarObjetoNovaNe_() {
      const selectObjeto = document.getElementById('novaNeObjeto');
      const fonteValor = document.getElementById('novaNeFonte').value;
      const opcoes = Array.from(new Set(fontesDoSofAtual.filter(f => f.fonte === fonteValor).map(f => f.objeto).filter(Boolean)));
      selectObjeto.innerHTML = opcoes.length
        ? opcoes.map(o => `<option value="${UI.escaparHtml(o)}">${UI.escaparHtml(o)}</option>`).join('')
        : '<option value="">Selecione a fonte primeiro</option>';
      selectObjeto.disabled = !opcoes.length;
    }

    ['novaNeUnidade', 'novaNeSof', 'novaNeReforcoAlvo', 'novaNeReforcoMes'].forEach(id => UI.tornarPesquisavel(id));

    document.getElementById('novaNeTipo').addEventListener('change', async function () {
      const ehReforco = this.value === 'reforco';
      document.getElementById('blocoNovaNeUnidadeSof').classList.toggle('oculto', ehReforco);
      document.getElementById('blocoNovaNeOriginal').classList.toggle('oculto', ehReforco);
      document.getElementById('blocoNovaNeReforco').classList.toggle('oculto', !ehReforco);
      if (ehReforco && !gruposTodos.length) {
        const selectAlvo = document.getElementById('novaNeReforcoAlvo');
        selectAlvo.innerHTML = '<option value="">Carregando...</option>';
        gruposTodos = (await Api.chamar('listarNotasEmpenho', { pageSize: 100000 })).items;
        selectAlvo.innerHTML = gruposTodos.length
          ? '<option value="">Selecione...</option>' + gruposTodos.map(g => `<option value="${UI.escaparHtml(g.numero_ne)}">NE ${UI.escaparHtml(g.numero_ne)} — ${UI.escaparHtml(g.unidade_nome || '')} — ${UI.escaparHtml(g.fonte || '')}</option>`).join('')
          : '<option value="">Nenhuma Nota de Empenho cadastrada</option>';
        UI.tornarPesquisavel('novaNeReforcoAlvo');
      }
    });

    document.getElementById('novaNeUnidade').addEventListener('change', async function () {
      const selectSof = document.getElementById('novaNeSof');
      document.getElementById('novaNeFonte').innerHTML = '<option value="">Selecione o SOF primeiro</option>';
      sofsDaUnidade = [];
      if (!this.value) { selectSof.innerHTML = '<option value="">Selecione a unidade primeiro</option>'; UI.tornarPesquisavel('novaNeSof'); return; }
      selectSof.innerHTML = '<option value="">Carregando...</option>';
      const resposta = await Api.chamar('listarSof', { unidade_id: this.value, pageSize: 1000 });
      sofsDaUnidade = resposta.items;
      selectSof.innerHTML = sofsDaUnidade.length
        ? '<option value="">Selecione...</option>' + sofsDaUnidade.map(s => `<option value="${s.id}">${UI.escaparHtml(s.sof_numero || s.id)} - ${UI.escaparHtml(s.objeto || '')}</option>`).join('')
        : '<option value="">Nenhum SOF cadastrado nesta unidade</option>';
      UI.tornarPesquisavel('novaNeSof');
    });

    document.getElementById('novaNeSof').addEventListener('change', function () {
      const selectFonte = document.getElementById('novaNeFonte');
      const sof = sofsDaUnidade.find(s => s.id === this.value);
      fontesDoSofAtual = sof ? (sof.fontes || []) : [];
      const fontesUnicas = Array.from(new Set(fontesDoSofAtual.map(f => f.fonte).filter(Boolean)));
      selectFonte.innerHTML = fontesUnicas.length
        ? '<option value="">Selecione...</option>' + fontesUnicas.map(f => `<option>${UI.escaparHtml(f)}</option>`).join('')
        : '<option value="">Nenhuma fonte cadastrada neste SOF</option>';
      atualizarObjetoNovaNe_();
    });
    document.getElementById('novaNeFonte').addEventListener('change', atualizarObjetoNovaNe_);

    document.getElementById('novaNeArquivo').addEventListener('change', async function () {
      const inputEl = this;
      const arquivo = inputEl.files[0];
      const statusEl = document.getElementById('novaNeStatusAnexo');
      const erroEl = document.getElementById('novaNeErro');
      erroEl.classList.add('oculto');
      if (!arquivo) return;
      // Trocar de arquivo sem clicar "Remover anexo" primeiro abandona
      // qualquer upload já feito por uma leitura anterior (sessão 2026-08-12).
      descartarArquivoNaoSalvo_(leituraOcr && leituraOcr.arquivo_drive_id);
      leituraOcr = null;
      if (arquivo.size > 8 * 1024 * 1024) { UI.toast('Arquivo muito grande (máximo 8MB).', 'erro'); inputEl.value = ''; return; }
      statusEl.classList.remove('oculto');
      statusEl.textContent = 'Lendo documento...';
      try {
        const base64 = await UI.lerArquivoBase64(arquivo);
        const resultado = await Api.chamar('lerAnexoNotaEmpenho', { arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type });
        // arquivo_drive_id/arquivo_url (sessão 2026-08-12): a leitura já subiu
        // o arquivo definitivamente pro Drive - salvar só referencia esses
        // dois campos, sem reenviar o base64 (ver criarNotaEmpenho, NotasEmpenho.gs).
        leituraOcr = { numero_ne: resultado.numero_ne, cronograma: resultado.cronograma, preco_total: resultado.preco_total, arquivo_drive_id: resultado.arquivo_drive_id, arquivo_url: resultado.arquivo_url };
        document.getElementById('novaNeNumero').value = resultado.numero_ne;
        document.getElementById('novaNePrecoTotal').value = resultado.preco_total;
        renderCronogramaPreview_(resultado.cronograma);
        document.getElementById('novaNeAvisoDivergencia').classList.toggle('oculto', !resultado.cronograma_diverge_do_total);
        mostrarDiagnosticoOcr_('novaNeDiagnostico', resultado.texto_ocr_debug);
        statusEl.innerHTML = '🔒 Dados lidos do documento. <a href="#" id="novaNeRemoverAnexo">Remover anexo</a>';
        document.getElementById('novaNeRemoverAnexo').addEventListener('click', function (e) {
          e.preventDefault();
          descartarArquivoNaoSalvo_(leituraOcr && leituraOcr.arquivo_drive_id);
          leituraOcr = null;
          inputEl.value = '';
          document.getElementById('novaNeNumero').value = '';
          document.getElementById('novaNePrecoTotal').value = '';
          renderCronogramaPreview_([]);
          document.getElementById('novaNeAvisoDivergencia').classList.add('oculto');
          mostrarDiagnosticoOcr_('novaNeDiagnostico', null);
          statusEl.classList.add('oculto');
        });
      } catch (err) {
        inputEl.value = '';
        leituraOcr = null;
        statusEl.classList.add('oculto');
        mostrarDiagnosticoOcr_('novaNeDiagnostico', err.dados && err.dados.texto_ocr_debug);
        UI.toast(err.message, 'erro');
      }
    });

    document.getElementById('novaNeReforcoArquivo').addEventListener('change', async function () {
      const inputEl = this;
      const arquivo = inputEl.files[0];
      const statusEl = document.getElementById('novaNeReforcoStatusAnexo');
      const erroEl = document.getElementById('novaNeErro');
      const camposManuais = document.getElementById('novaNeReforcoManualCampos');
      erroEl.classList.add('oculto');
      // Trocar de arquivo sem clicar "Remover anexo" primeiro abandona
      // qualquer upload já feito por uma leitura anterior (sessão 2026-08-12).
      descartarArquivoNaoSalvo_(arquivoReforcoLido && arquivoReforcoLido.arquivo_drive_id);
      itensReforcoDetectados = null;
      arquivoReforcoLido = null;
      numeroNeReforcoDetectado = null;
      mostrarMesesReforcoDetectados_(null);
      conferirNeReferencia_('novaNeReforcoAvisoReferencia', null, null);
      mostrarDiagnosticoOcr_('novaNeReforcoDiagnostico', null);
      if (!arquivo) return;
      if (arquivo.size > 8 * 1024 * 1024) { UI.toast('Arquivo muito grande (máximo 8MB).', 'erro'); inputEl.value = ''; return; }
      statusEl.classList.remove('oculto');
      statusEl.textContent = 'Lendo documento...';
      try {
        const base64 = await UI.lerArquivoBase64(arquivo);
        const resultado = await Api.chamar('lerAnexoNotaEmpenho', { arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type });
        // arquivo_drive_id/arquivo_url (sessão 2026-08-12): ver comentário
        // equivalente no handler de novaNeArquivo, acima.
        arquivoReforcoLido = { arquivo_drive_id: resultado.arquivo_drive_id, arquivo_url: resultado.arquivo_url };
        const mesesComValor = (resultado.cronograma || []).filter(c => Number(c.valor) > 0);
        numeroNeReforcoDetectado = resultado.numero_ne || null;
        conferirNeReferencia_('novaNeReforcoAvisoReferencia', resultado.numero_ne_referencia, document.getElementById('novaNeReforcoAlvo').value);
        mostrarDiagnosticoOcr_('novaNeReforcoDiagnostico', resultado.texto_ocr_debug);

        let mensagemStatus;
        if (mesesComValor.length) {
          itensReforcoDetectados = mesesComValor.map(c => ({ mes_referencia: c.mes, valor: c.valor }));
          mostrarMesesReforcoDetectados_(itensReforcoDetectados);
          camposManuais.classList.add('oculto');
          document.getElementById('novaNeReforcoMes').required = false;
          document.getElementById('novaNeReforcoValor').required = false;
          const totalDetectado = itensReforcoDetectados.reduce((s, it) => s + it.valor, 0);
          mensagemStatus = `🔒 ${itensReforcoDetectados.length} mês(es) identificado(s) automaticamente, total ${UI.formatarMoeda(totalDetectado)}.`;
        } else if (resultado.preco_total) {
          document.getElementById('novaNeReforcoValor').value = resultado.preco_total;
          document.getElementById('novaNeReforcoValor').readOnly = true;
          camposManuais.classList.remove('oculto');
          mensagemStatus = `🔒 Valor lido do documento (${UI.formatarMoeda(resultado.preco_total)}) - não foi possível identificar o mês; selecione manualmente.`;
        } else {
          camposManuais.classList.remove('oculto');
          mensagemStatus = 'Não foi possível ler meses nem valor no documento - preencha manualmente.';
        }
        statusEl.innerHTML = mensagemStatus + ' <a href="#" id="novaNeReforcoRemoverAnexo">Remover anexo' + (itensReforcoDetectados ? '' : ' / preencher manualmente') + '</a>';
        document.getElementById('novaNeReforcoRemoverAnexo').addEventListener('click', e => {
          e.preventDefault();
          descartarArquivoNaoSalvo_(arquivoReforcoLido && arquivoReforcoLido.arquivo_drive_id);
          itensReforcoDetectados = null;
          arquivoReforcoLido = null;
          numeroNeReforcoDetectado = null;
          inputEl.value = '';
          mostrarMesesReforcoDetectados_(null);
          conferirNeReferencia_('novaNeReforcoAvisoReferencia', null, null);
          mostrarDiagnosticoOcr_('novaNeReforcoDiagnostico', null);
          camposManuais.classList.remove('oculto');
          document.getElementById('novaNeReforcoMes').required = true;
          document.getElementById('novaNeReforcoValor').required = true;
          document.getElementById('novaNeReforcoValor').readOnly = false;
          document.getElementById('novaNeReforcoValor').value = '';
          statusEl.classList.add('oculto');
        });
      } catch (err) {
        inputEl.value = '';
        arquivoReforcoLido = null;
        numeroNeReforcoDetectado = null;
        statusEl.classList.add('oculto');
        camposManuais.classList.remove('oculto');
        mostrarDiagnosticoOcr_('novaNeReforcoDiagnostico', err.dados && err.dados.texto_ocr_debug);
        UI.toast('Não foi possível ler o documento automaticamente - preencha manualmente. ' + err.message, 'erro');
      }
    });

    document.getElementById('btnCancelarNovaNe').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarNovaNe').addEventListener('click', async () => {
      const erroEl = document.getElementById('novaNeErro');
      erroEl.classList.add('oculto');
      const ehReforco = document.getElementById('novaNeTipo').value === 'reforco';

      if (ehReforco) {
        const numeroNe = document.getElementById('novaNeReforcoAlvo').value;
        const grupo = gruposTodos.find(g => g.numero_ne === numeroNe);
        if (!grupo) { UI.mostrarErro(erroEl, 'Selecione a Nota de Empenho a reforçar.'); return; }
        if (!arquivoReforcoLido) { UI.mostrarErro(erroEl, 'Anexe o arquivo do reforço.'); return; }
        try {
          if (itensReforcoDetectados && itensReforcoDetectados.length) {
            await Api.chamar('criarReforcosEmLote', {
              data: Object.assign({ sof_id: grupo.sof_id, numero_ne: grupo.numero_ne, numero_ne_reforco: numeroNeReforcoDetectado, itens: itensReforcoDetectados }, arquivoReforcoLido)
            });
          } else {
            const mesReferencia = document.getElementById('novaNeReforcoMes').value;
            const valor = UI.parseValorBr(document.getElementById('novaNeReforcoValor').value);
            if (!mesReferencia) { UI.mostrarErro(erroEl, 'Selecione o mês de referência do reforço.'); return; }
            if (!valor || valor <= 0) { UI.mostrarErro(erroEl, 'Informe um valor válido para o reforço.'); return; }
            await Api.chamar('criarNotaEmpenho', {
              data: Object.assign({ sof_id: grupo.sof_id, tipo: 'reforco', numero_ne: grupo.numero_ne, numero_ne_reforco: numeroNeReforcoDetectado, fonte: grupo.fonte, valor, mes_referencia: mesReferencia }, arquivoReforcoLido)
            });
          }
          CacheAbas.invalidar('notasEmpenho');
          CacheAbas.invalidar('sof');
          UI.toast('Reforço adicionado.', 'sucesso');
          // Zera ANTES do fecharModal() - o arquivo acabou de ser vinculado à
          // NE salva (ver aoFecharModal registrado acima), senão o próprio
          // arquivo que acabou de ser salvo seria apagado.
          arquivoReforcoLido = null;
          UI.fecharModal();
          await carregar();
        } catch (err) {
          UI.mostrarErro(erroEl, err.message);
        }
        return;
      }

      const sofId = document.getElementById('novaNeSof').value;
      if (!sofId) { UI.mostrarErro(erroEl, 'Selecione o SOF.'); return; }
      const fonte = document.getElementById('novaNeFonte').value;
      if (!fonte) { UI.mostrarErro(erroEl, 'Selecione a fonte.'); return; }
      const objeto = document.getElementById('novaNeObjeto').value;
      if (!objeto) { UI.mostrarErro(erroEl, 'Selecione o objeto.'); return; }
      if (!leituraOcr) { UI.mostrarErro(erroEl, 'Anexe o documento da Nota de Empenho.'); return; }
      try {
        await Api.chamar('criarNotaEmpenho', {
          data: {
            sof_id: sofId, tipo: 'original', numero_ne: leituraOcr.numero_ne, fonte, objeto, valor: leituraOcr.preco_total,
            cronograma: leituraOcr.cronograma,
            arquivo_drive_id: leituraOcr.arquivo_drive_id, arquivo_url: leituraOcr.arquivo_url
          }
        });
        CacheAbas.invalidar('notasEmpenho');
        CacheAbas.invalidar('sof');
        UI.toast('Nota de Empenho criada.', 'sucesso');
        // Zera ANTES do fecharModal() - mesmo motivo do reforço acima.
        leituraOcr = null;
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  return { render, preCarregar };
})();
