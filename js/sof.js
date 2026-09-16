/**
 * GAOCG App - Gestão de Processos de SOF (Funcionalidade 3, Anexo I) + Notas de
 * Empenho acopladas (Funcionalidade 5).
 */

const TelaSof = (function () {
  const OPCOES_FONTE = ['TESOURO', 'SUS', 'Outra'];
  const OPCOES_SOF_TIPO = ['Emenda Parlamentar Federal/Estadual', 'Investimento', 'Pagamentos Regulares'];
  const NOVO_OBJETO_VALOR_ = '__novo_objeto__';
  const ETAPAS_ANDAMENTO = [
    'SES-NP_DGPO', 'SES-DGPO', 'SES', 'NAP_POAS', 'SES-GPOAS', 'SES-GORC', 'SES-GPF',
    'SES-CEO_GAOCG', 'SES-DGMCG', 'SES-GEMP', 'NE EMITIDA', 'SES-CJCG', 'C.G./T.A. FORMALIZADO'
  ];
  const CAMPOS_OBRIGATORIOS = [
    { id: 'sofUnidade', rotulo: 'Unidade' },
    { id: 'sofTipoSof', rotulo: 'Tipo de SOF' },
    { id: 'seiCredorCnpj', rotulo: 'CNPJ' },
    { id: 'sofContrato', rotulo: 'Contrato de Gestão' },
    { id: 'seiAcao', rotulo: 'Ação' },
    { id: 'seiSubacao', rotulo: 'Subação' },
    { id: 'seiGrupoDespesa', rotulo: 'Grupo de despesa' },
    { id: 'sofCeo', rotulo: 'Contrato CEO' },
    { id: 'sofSei', rotulo: 'Número do Processo' },
    { id: 'sofNumero', rotulo: 'Nº SOF' },
    { id: 'sofDea', rotulo: 'DEA' },
    { id: 'sofPeriodoInicio', rotulo: 'Período (início)' },
    { id: 'sofPeriodoFim', rotulo: 'Período (fim)' },
    { id: 'seiTipoSolicitacao', rotulo: 'Solicito' },
    { id: 'seiTipoPleito', rotulo: 'Assinalar o pleito' },
    { id: 'seiAreaSetorSolicitante', rotulo: 'Área/setor solicitante' },
    { id: 'seiTemaPoas', rotulo: 'Tema POAS' },
    { id: 'sofObjeto', rotulo: 'Objeto' },
    { id: 'seiObjetoDespesa', rotulo: 'Objeto da despesa (texto completo p/ documento SEI)' },
    { id: 'sofOss', rotulo: 'OSS' },
    { id: 'seiDestinacao', rotulo: 'Destinação' },
    { id: 'seiCredor', rotulo: 'Credor' },
    { id: 'seiSolicitanteNome', rotulo: 'Solicitante - Nome' },
    { id: 'seiSolicitanteCargo', rotulo: 'Solicitante - Cargo' },
    { id: 'seiSolicitanteSetor', rotulo: 'Solicitante - Setor' },
    { id: 'seiOrdenadorNome', rotulo: 'Ordenador - Nome' },
    { id: 'seiOrdenadorCargo', rotulo: 'Ordenador - Cargo' },
    { id: 'seiOrdenadorSetor', rotulo: 'Ordenador - Setor' }
  ];
  let unidades = [];
  let itens = [];
  let paginaAtual = 1;
  let totalRegistros = 0;
  // Tamanho de página escolhível (sessão 2026-08-31, pedido do usuário: 20,
  // 40, 80, 100 ou Todos) - deixou de ser const. TAMANHO_PAGINA_TODOS_ é o
  // valor mandado ao backend pra "Todos", mesmo truque de pageSize gigante
  // já usado nesta tela pra buscar TODAS as unidades pro dropdown.
  let tamanhoPagina = 20;
  const TAMANHO_PAGINA_TODOS_ = 100000;
  let sofEmEdicaoId = null;
  // IDs de SOF com uma busca automática do número SEI em andamento (sessão
  // 2026-09-04, ver iniciarBuscaAutomaticaNumeroSof_) - evita 2 polls
  // concorrentes pra mesma SOF (ex.: usuário clica "Salvar e enviar ao SEI"
  // de novo antes do primeiro poll terminar).
  const buscasAutomaticasNumeroSof_ = new Set();
  let abrindoLinha = false;
  let linhasFontes = [];
  let ultimoFiltroJson = null;
  let opcoesObjetoAtuais = [];
  // Reforço lido por OCR no mini-formulário de NE (sessão 2026-07-29) - [{mes_referencia, valor}, ...]
  // quando o documento anexado tem um cronograma com 1+ meses; ver ligarOcrMiniFormularioNe_/lerMiniFormularioNe_.
  let itensReforcoMiniform_ = null;
  // Número PRÓPRIO do documento de reforço lido por OCR (sessão 2026-07-30) -
  // distinto do número da NE mãe; agrupa os meses desse mesmo documento como
  // "um reforço só" na tela de Notas de Empenho.
  let numeroNeReforcoMiniform_ = null;
  // arquivo_drive_id/arquivo_url (sessão 2026-08-12) - quando a leitura por
  // OCR do anexo do mini-formulário dá certo, o arquivo já sobe pro Drive
  // nessa hora (lerAnexoNotaEmpenho, NotasEmpenho.gs); salvar reaproveita em
  // vez de reenviar o mesmo arquivo. null enquanto não há leitura bem-sucedida
  // pendente - nesse caso lerMiniFormularioNe_ cai no caminho antigo (reler o
  // arquivo e mandar o base64), porque este mini-formulário permite salvar
  // com o arquivo mesmo que a leitura automática tenha falhado.
  let arquivoNeDriveIdMiniform_ = null;
  let arquivoNeUrlMiniform_ = null;
  // Exclusão em lote (sessão 2026-08-31, pedido do usuário: botão "Apagar
  // cards"): modoSelecaoLote liga/desliga os checkboxes nos cards;
  // idsSelecionadosLote_ guarda os ids marcados enquanto o modo está ativo -
  // zerado sempre que o modo é ligado/desligado ou a listagem recarrega.
  let modoSelecaoLote = false;
  let idsSelecionadosLote_ = new Set();

  /**
   * opts (opcional, vindo do Dashboard via App.navegarPara): `semNe: true`
   * marca o checkbox "Sem NE emitida" antes da primeira carga (fica visível
   * e ativo na barra de filtros, igual a qualquer outro filtro - sessão
   * 2026-07-27, achado real: antes disso o filtro era aplicado por baixo dos
   * panos sem aparecer em lugar nenhum na tela); `abrirId` abre esse SOF
   * direto logo após a primeira carga.
   */
  async function render(opts) {
    // Sai do modo de seleção em lote sempre que a tela é (re)aberta (sessão
    // 2026-09-01, bug relatado pelo usuário: trocar de aba com "Apagar
    // cards" ligado, sem clicar Cancelar, mantinha modoSelecaoLote=true no
    // módulo - ele persiste entre navegações porque só o HTML de #conteudo é
    // trocado, não o estado JS de cada tela - então voltar pra SOF renderizava
    // os cards já com a borda pontilhada de seleção, sem a barra de ações
    // pra sair desse estado (a barra nasce oculta por padrão no HTML).
    modoSelecaoLote = false;
    idsSelecionadosLote_.clear();
    const [unidadesCarregadas, opcoesOss, opcoesObjeto] = await Promise.all([
      Api.chamar('listarUnidades', { somenteAtivas: true, pageSize: 100000 }, { cache: true }),
      TelaListas.obterOpcoes('OSS'),
      TelaListas.obterOpcoes('OBJETO')
    ]);
    unidades = unidadesCarregadas.items;
    const tiposUnidade = Array.from(new Set(unidades.map(u => u.tipo).filter(Boolean))).sort();
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">SOF</h2>
      <div class="painel">
        <div class="barra-filtros">
          <div class="campo campo-tamanho-pagina"><label>Itens por página</label>
            <select id="sofTamanhoPaginaTopo">${UI.opcoesTamanhoPaginaHtml(tamanhoPagina === TAMANHO_PAGINA_TODOS_ ? 'todos' : tamanhoPagina)}</select>
          </div>
          <div class="campo campo-busca-livre"><label>Busca livre</label>
            <input type="text" id="sofBusca" placeholder="unidade, SEI, valor..." /><button type="button" class="busca-livre-x" data-alvo="sofBusca" title="Limpar busca livre">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Unidade</label>
            <div id="sofFiltroUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="sofFiltroUnidade" title="Limpar filtro de Unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">OSS</label>
            <div id="sofFiltroOss"></div><button type="button" class="filtro-multiplo-x" data-alvo="sofFiltroOss" title="Limpar filtro de OSS">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Objeto</label>
            <div id="sofFiltroObjeto"></div><button type="button" class="filtro-multiplo-x" data-alvo="sofFiltroObjeto" title="Limpar filtro de Objeto">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Tipo de unidade</label>
            <div id="sofFiltroTipoUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="sofFiltroTipoUnidade" title="Limpar filtro de Tipo de unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">DEA</label>
            <div id="sofFiltroDea"></div><button type="button" class="filtro-multiplo-x" data-alvo="sofFiltroDea" title="Limpar filtro de DEA">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Fonte</label>
            <div id="sofFiltroFonte"></div><button type="button" class="filtro-multiplo-x" data-alvo="sofFiltroFonte" title="Limpar filtro de Fonte">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Ano</label>
            <div id="sofFiltroAno"></div><button type="button" class="filtro-multiplo-x" data-alvo="sofFiltroAno" title="Limpar filtro de Ano">&times;</button>
          </div>
          <label style="align-self:center;font-size:13px;white-space:nowrap"><input type="checkbox" id="sofFiltroSemNe" /> Sem NE emitida</label>
          <button class="botao" id="btnFiltrarSof">Filtrar</button>
          <button class="botao botao-limpar-filtros" id="btnLimparFiltrosSof">Limpar filtros</button>
          <button class="botao" id="btnGerarRelatorioSof">Gerar Relatório</button>
          <button class="botao" id="btnModoSelecaoLoteSof">Apagar cards</button>
          <span style="flex:1"></span>
          <button class="botao primario" id="btnNovoSof">+ Nova SOF</button>
        </div>
        <div class="barra-selecao-lote oculto" id="barraSelecaoLoteSof">
          <label class="rotulo-checkbox"><input type="checkbox" id="chkSelecionarTodosSof" /> Selecionar todos</label>
          <span id="contagemSelecaoLoteSof">0 selecionado(s)</span>
          <button type="button" class="botao perigo" id="btnExcluirSelecionadosSof" disabled>Excluir selecionados</button>
          <button type="button" class="botao" id="btnCancelarSelecaoLoteSof">Cancelar</button>
        </div>
        <div id="listaSof"></div>
        <div class="paginacao" id="paginacaoSof"></div>
      </div>`;

    document.getElementById('btnFiltrarSof').addEventListener('click', () => { if (filtrosMudaram_()) { paginaAtual = 1; carregar(); } });
    document.getElementById('sofBusca').addEventListener('keydown', e => {
      if (e.key === 'Enter' && filtrosMudaram_()) { paginaAtual = 1; carregar(); }
    });
    document.getElementById('btnNovoSof').addEventListener('click', async function () {
      this.disabled = true;
      try { await abrirFormulario(); } finally { this.disabled = false; }
    });
    document.getElementById('btnGerarRelatorioSof').addEventListener('click', abrirGerarRelatorio);
    document.getElementById('btnModoSelecaoLoteSof').addEventListener('click', () => alternarModoSelecaoLote_());
    document.getElementById('btnCancelarSelecaoLoteSof').addEventListener('click', () => alternarModoSelecaoLote_(false));
    document.getElementById('btnExcluirSelecionadosSof').addEventListener('click', excluirSelecionadosLoteClique_);
    document.getElementById('chkSelecionarTodosSof').addEventListener('change', function () {
      idsSelecionadosLote_ = this.checked ? new Set(itens.map(i => String(i.id))) : new Set();
      atualizarBarraSelecaoLote_();
      renderCards();
    });
    // Seletor "Itens por página" duplicado no topo (sessão 2026-08-31,
    // pedido do usuário: "pra quem estiver utilizando saber que existe essa
    // opção só de olhar a aba inicialmente") - o de baixo (renderPaginacao)
    // continua sendo o "dono" da opção, reconstruído a cada carregar(); este
    // aqui só precisa ficar sincronizado com ele (ver mudarTamanhoPagina_).
    document.getElementById('sofTamanhoPaginaTopo').addEventListener('change', function () { mudarTamanhoPagina_(this.value); });
    document.getElementById('sofFiltroSemNe').addEventListener('change', () => { paginaAtual = 1; carregar(); });
    // Estas são as opções INICIAIS. A partir da primeira carga, todas as listas
    // passam a vir das facetas do backend (ver FACETAS_SOF_/aplicarResposta_):
    // cada filtro só mostra valores que ainda levam a algum resultado, dado o
    // que está marcado nos outros. O estreitamento antigo, que valia só para
    // Unidade/Tipo/OSS e rodava no clique do checkbox, foi substituído por isso
    // - dois mecanismos disputando a mesma lista se anulariam.
    UI.criarFiltroMultiplo('sofFiltroUnidade', unidades.map(u => ({ valor: u.id, rotulo: u.nome })));
    UI.criarFiltroMultiplo('sofFiltroOss', opcoesOss.map(o => o.valor));
    UI.criarFiltroMultiplo('sofFiltroObjeto', opcoesObjeto.map(o => o.valor));
    UI.criarFiltroMultiplo('sofFiltroTipoUnidade', tiposUnidade);
    UI.criarFiltroMultiplo('sofFiltroDea', ['SIM', 'NÃO']);
    UI.criarFiltroMultiplo('sofFiltroFonte', OPCOES_FONTE);
    UI.criarFiltroMultiplo('sofFiltroAno', UI.listaAnos());
    UI.ligarLimpezaFiltros('.barra-filtros', 'btnLimparFiltrosSof', () => {
      document.getElementById('sofFiltroSemNe').checked = false;
      if (filtrosMudaram_()) { paginaAtual = 1; carregar(); }
    }, aoLimparFiltroIndividual_);
    if (opts && opts.semNe) document.getElementById('sofFiltroSemNe').checked = true;
    await carregar();
    if (opts && opts.abrirId) abrirSofExistente(opts.abrirId);
  }

  /** Evita reler a lista/mostrar o spinner quando Filtrar/Limpar filtros/"x" não mudam nada de fato. */
  function filtrosMudaram_() {
    return JSON.stringify(filtrosAtuais()) !== ultimoFiltroJson;
  }

  function filtrosAtuais() {
    return {
      busca: document.getElementById('sofBusca').value.trim(),
      unidade_id: UI.valoresFiltroMultiplo('sofFiltroUnidade'),
      oss: UI.valoresFiltroMultiplo('sofFiltroOss'),
      objeto: UI.valoresFiltroMultiplo('sofFiltroObjeto'),
      tipo_unidade: UI.valoresFiltroMultiplo('sofFiltroTipoUnidade'),
      dea: UI.valoresFiltroMultiplo('sofFiltroDea'),
      fonte: UI.valoresFiltroMultiplo('sofFiltroFonte'),
      // Ano de exercício, tirado do Nº SOF ("173/2026") - ver anoDoSof_ em
      // backend/Sof.gs. A SOF não tem competência (decisão do usuário: nesta
      // tela só o Ano faz sentido).
      ano: UI.valoresFiltroMultiplo('sofFiltroAno'),
      semNe: document.getElementById('sofFiltroSemNe').checked
    };
  }

  /**
   * Mesmo formato "vazio" de filtrosAtuais(), mas sem depender do DOM (que
   * ainda não existe antes da 1ª renderização) - usada só por preCarregar()
   * (sessão 2026-08-31, pedido do usuário: aba já carregada ao entrar no
   * app). Se um campo novo entrar em filtrosAtuais(), replicar aqui com o
   * valor "vazio" equivalente.
   */
  function filtrosPadrao_() {
    return { busca: '', unidade_id: [], oss: [], objeto: [], tipo_unidade: [], dea: [], fonte: [], ano: [], semNe: false };
  }

  /**
   * Pré-carrega os dados desta tela em segundo plano, sem tocar no DOM (a
   * tela pode nem estar visível ainda - ver App.mostrarApp) - sessão
   * 2026-08-31, pedido do usuário: SOF já carregada ao entrar no app. Aquece
   * tanto o cache de Api.chamar (dropdowns, {cache:true}) quanto o snapshot
   * de CacheAbas (listagem padrão, página 1) - quando o usuário realmente
   * clicar na aba, render()/carregar() encontram tudo pronto (mesma chave de
   * cache) e a troca de aba fica instantânea. Best-effort: qualquer falha
   * aqui é silenciosa - o carregamento normal ao clicar na aba continua
   * funcionando do mesmo jeito se a pré-carga não der certo.
   */
  async function preCarregar() {
    try {
      await Promise.all([
        Api.chamar('listarUnidades', { somenteAtivas: true, pageSize: 100000 }, { cache: true }),
        TelaListas.obterOpcoes('OSS'),
        TelaListas.obterOpcoes('OBJETO')
      ]);
      const params = Object.assign({ page: 1, pageSize: tamanhoPagina }, filtrosPadrao_());
      await CacheAbas.comRevalidacao('sof', params,
        (opcoes) => Api.chamar('listarSof', params, Object.assign({ silencioso: true }, opcoes)),
        () => {}
      );
    } catch (e) { /* pré-carga é best-effort - ver comentário acima */ }
  }

  /** Chave de filtrosAtuais() correspondente a cada id de filtro-multiplo da barra - ver aoLimparFiltroIndividual_. */
  const CHAVE_POR_FILTRO_ = {
    sofFiltroUnidade: 'unidade_id', sofFiltroOss: 'oss', sofFiltroObjeto: 'objeto',
    sofFiltroTipoUnidade: 'tipo_unidade', sofFiltroDea: 'dea', sofFiltroFonte: 'fonte',
    sofFiltroAno: 'ano', sofBusca: 'busca'
  };

  /**
   * "x" individual de um filtro: recarrega usando o ÚLTIMO FILTRO REALMENTE
   * APLICADO (ultimoFiltroJson), só com este campo zerado por cima - nunca o
   * estado ao vivo dos outros campos (filtrosAtuais()), que pode ter seleções
   * feitas mas ainda não confirmadas em "Filtrar". Nenhum outro widget é
   * tocado - se outro campo tinha uma seleção pendente, ela continua
   * marcada na tela, só não entra nesta recarga (o usuário ainda pode
   * clicar "Filtrar" pra aplicá-la quando quiser).
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
    const resposta = await CacheAbas.comRevalidacao('sof', params,
      (opcoes) => Api.chamar('listarSof', params, opcoes),
      aplicarResposta_
    );
    aplicarResposta_(resposta);
  }

  /** id do widget -> dimensão no mapa de facetas (ver UI.aplicarFacetas). */
  const FACETAS_SOF_ = {
    sofFiltroUnidade: { chave: 'unidade_id', rotulo: id => (unidades.find(u => String(u.id) === String(id)) || {}).nome || id },
    sofFiltroOss: { chave: 'oss' },
    sofFiltroObjeto: { chave: 'objeto' },
    sofFiltroTipoUnidade: { chave: 'tipo_unidade' },
    sofFiltroDea: { chave: 'dea' },
    sofFiltroFonte: { chave: 'fonte' },
    sofFiltroAno: { chave: 'ano' }
  };

  function aplicarResposta_(resposta) {
    itens = resposta.items;
    totalRegistros = resposta.total;
    UI.aplicarFacetas(resposta.facetas, FACETAS_SOF_);
    renderCards();
    renderPaginacao();
  }

  function percentualAndamento(sof) {
    const idx = sof && sof.andamento ? ETAPAS_ANDAMENTO.indexOf(sof.andamento) : -1;
    if (idx < 0) return 0;
    return Math.round(((idx + 1) / ETAPAS_ANDAMENTO.length) * 100);
  }

  const ICONE_LIXEIRA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

  function cartaoSofHtml(s) {
    const unidade = unidades.find(u => u.id === s.unidade_id);
    const pct = percentualAndamento(s);
    const fontesTexto = (s.fontes || []).map(f => f.fonte).filter(Boolean).join(', ');
    return `
      <div class="cartao-sof ${modoSelecaoLote ? 'em-selecao-lote' : ''}" data-id="${s.id}">
        <div class="cartao-sof-topo">
          <div class="cartao-sof-topo-acoes">
            ${modoSelecaoLote
              ? `<input type="checkbox" class="checkbox-selecao-lote" data-id="${s.id}" ${idsSelecionadosLote_.has(String(s.id)) ? 'checked' : ''} title="Selecionar para excluir" />`
              : `<button type="button" class="botao-icone excluir" data-acao="excluir" title="Excluir">${ICONE_LIXEIRA}</button>`}
          </div>
        </div>
        <h3 class="cartao-sof-titulo">${UI.escaparHtml(s.sof_numero || '-')}</h3>
        <p class="cartao-sof-subtitulo">${UI.escaparHtml(unidade ? unidade.nome : s.unidade_id)}</p>
        <div class="cartao-sof-infogrid">
          <div class="cartao-sof-infogrid-item"><span>Número do Processo</span><strong>${UI.escaparHtml(s.sei || '-')}</strong></div>
          <div class="cartao-sof-infogrid-item"><span>Objeto</span><strong>${UI.escaparHtml(s.objeto || '-')}</strong></div>
          <div class="cartao-sof-infogrid-item"><span>Fonte</span><strong>${UI.escaparHtml(fontesTexto || '-')}</strong></div>
          <div class="cartao-sof-infogrid-item"><span>Total Solicitado</span><strong>${UI.formatarMoeda(s.total_solicitado)}</strong></div>
        </div>
        <div class="cartao-sof-andamento">
          <div class="cartao-sof-andamento-topo">
            <span>Andamento <strong>${UI.escaparHtml(s.andamento || '-')}</strong></span>
            <span>${pct}%</span>
          </div>
          <div class="barra-progresso"><div class="barra-progresso-preenchimento ${pct >= 100 ? 'completo' : ''}" style="width:${pct}%"></div></div>
          ${stepperHtml(s)}
        </div>
        <div class="cartao-sof-rodape">
          ${s.possui_ne ? '<span class="selo verde">NE Emitida</span>' : '<span class="selo amarelo">Aguardando NE</span>'}
          <button type="button" class="botao primario" data-acao="abrir">Abrir processo &rarr;</button>
        </div>
      </div>`;
  }

  function ligarEventosCartaoSof_(cartaoEl, sof) {
    if (modoSelecaoLote) {
      const chk = cartaoEl.querySelector('.checkbox-selecao-lote');
      chk.addEventListener('change', () => {
        if (chk.checked) idsSelecionadosLote_.add(String(sof.id)); else idsSelecionadosLote_.delete(String(sof.id));
        atualizarBarraSelecaoLote_();
      });
      return;
    }
    cartaoEl.querySelector('.botao-icone.excluir').addEventListener('click', () => excluirSofClique(sof));
    cartaoEl.querySelector('[data-acao="abrir"]').addEventListener('click', () => abrirSofExistente(sof.id));
    cartaoEl.querySelectorAll('.stepper-marcador').forEach(btn => {
      btn.addEventListener('click', () => avancarEtapaCartao(sof, btn.dataset.etapa, cartaoEl));
    });
  }

  function renderCards() {
    const alvo = document.getElementById('listaSof');
    if (!itens.length) { alvo.innerHTML = '<p class="estado-vazio">Nenhum processo de SOF encontrado.</p>'; return; }
    alvo.innerHTML = `<div class="grade-cards-sof">${itens.map(cartaoSofHtml).join('')}</div>`;
    alvo.querySelectorAll('.cartao-sof').forEach(cartao => {
      const sof = itens.find(i => i.id === cartao.dataset.id);
      if (sof) ligarEventosCartaoSof_(cartao, sof);
    });
  }

  /** Reconstrói só um card (depois de avançar uma etapa do stepper direto na lista), sem recarregar a página inteira. */
  function rerenderCartaoSof_(sof) {
    const atual = document.querySelector(`.cartao-sof[data-id="${sof.id}"]`);
    if (!atual) return;
    atual.outerHTML = cartaoSofHtml(sof);
    const novo = document.querySelector(`.cartao-sof[data-id="${sof.id}"]`);
    if (novo) ligarEventosCartaoSof_(novo, sof);
  }

  /**
   * Avança/retrocede o andamento direto no card, sem precisar abrir o modal
   * de edição - o stepper de 13 etapas fica à mostra e editável na lista.
   */
  async function avancarEtapaCartao(sof, etapa, cartaoEl) {
    if (etapa === 'NE EMITIDA' && !sof.possui_ne) {
      UI.toast('Anexe a Nota de Empenho no processo (botão "Abrir processo") para avançar esta etapa.', 'erro');
      return;
    }
    try {
      await Api.chamar('atualizarSof', { id: sof.id, data: { andamento: etapa } });
      CacheAbas.invalidar('sof');
      sof.andamento = etapa;
      rerenderCartaoSof_(sof);
      UI.toast('Andamento atualizado.', 'sucesso');
    } catch (err) {
      UI.toast(err.message, 'erro');
    }
  }

  /**
   * Liga/desliga o modo de seleção em lote (sessão 2026-08-31). `ligar`
   * omitido alterna o estado atual; passar true/false força um dos dois
   * (usado por "Cancelar" e depois de excluir com sucesso).
   */
  function alternarModoSelecaoLote_(ligar) {
    modoSelecaoLote = typeof ligar === 'boolean' ? ligar : !modoSelecaoLote;
    idsSelecionadosLote_.clear();
    document.getElementById('btnModoSelecaoLoteSof').classList.toggle('ativo', modoSelecaoLote);
    atualizarBarraSelecaoLote_();
    renderCards();
  }

  function atualizarBarraSelecaoLote_() {
    document.getElementById('barraSelecaoLoteSof').classList.toggle('oculto', !modoSelecaoLote);
    document.getElementById('contagemSelecaoLoteSof').textContent = `${idsSelecionadosLote_.size} selecionado(s)`;
    document.getElementById('btnExcluirSelecionadosSof').disabled = idsSelecionadosLote_.size === 0;
    const chkTodos = document.getElementById('chkSelecionarTodosSof');
    chkTodos.checked = itens.length > 0 && idsSelecionadosLote_.size === itens.length;
    chkTodos.indeterminate = idsSelecionadosLote_.size > 0 && idsSelecionadosLote_.size < itens.length;
  }

  /** Mesmo padrão de aviso-exclusao já usado em Unidades (confirmarExclusao, js/unidades.js), aqui pra excluir vários processos de SOF de uma vez. */
  function excluirSelecionadosLoteClique_() {
    if (!idsSelecionadosLote_.size) return;
    const qtd = idsSelecionadosLote_.size;
    const corpo = `<p class="aviso-exclusao">TEM CERTEZA QUE QUER EXCLUIR ${qtd} PROCESSO(S) DE SOF? A EXCLUSÃO PODE SER REVERTIDA APENAS POR UM ADMINISTRADOR DIRETAMENTE NA PLANILHA.</p>`;
    UI.abrirModal('Excluir processos em lote', corpo,
      `<button class="botao" id="btnCancelarExclusaoLoteSof">Cancelar</button><button class="botao perigo" id="btnConfirmarExclusaoLoteSof">Excluir</button>`,
      { pequeno: true });
    document.getElementById('btnCancelarExclusaoLoteSof').addEventListener('click', UI.fecharModal);
    document.getElementById('btnConfirmarExclusaoLoteSof').addEventListener('click', async () => {
      try {
        await Api.chamar('excluirSofEmLote', { ids: Array.from(idsSelecionadosLote_) });
        CacheAbas.invalidar('sof');
        UI.toast('Processos excluídos.', 'sucesso');
        UI.fecharModal();
        alternarModoSelecaoLote_(false);
        await carregar();
      } catch (err) {
        UI.toast(err.message, 'erro');
      }
    });
  }

  async function excluirSofClique(sof) {
    if (!sof) return;
    if (!confirm('Excluir este processo de SOF? A exclusão pode ser revertida apenas por um administrador diretamente na planilha.')) return;
    try {
      await Api.chamar('excluirSof', { id: sof.id });
      CacheAbas.invalidar('sof');
      UI.toast('SOF excluído.', 'sucesso');
      await carregar();
    } catch (err) {
      UI.toast(err.message, 'erro');
    }
  }

  /**
   * Muda tamanhoPagina a partir do valor de QUALQUER UM dos dois seletores
   * ("Itens por página" no topo da barra de filtros, ou "Por página" perto
   * da paginação embaixo - sessão 2026-08-31, pedido do usuário: a opção
   * precisa aparecer no topo também, "só de olhar a aba inicialmente") -
   * sincroniza o OUTRO seletor na hora (sem esperar a rede) e recarrega.
   */
  function mudarTamanhoPagina_(valorSelecionado) {
    tamanhoPagina = valorSelecionado === 'todos' ? TAMANHO_PAGINA_TODOS_ : Number(valorSelecionado);
    paginaAtual = 1;
    ['sofTamanhoPaginaTopo', 'sofTamanhoPagina'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = valorSelecionado;
    });
    carregar();
  }

  function renderPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(totalRegistros / tamanhoPagina));
    document.getElementById('paginacaoSof').innerHTML = `
      <span>${totalRegistros} registro(s) - página ${paginaAtual} de ${totalPaginas}</span>
      <div class="paginacao-tamanho"><label for="sofTamanhoPagina">Por página</label>
        <select id="sofTamanhoPagina">${UI.opcoesTamanhoPaginaHtml(tamanhoPagina === TAMANHO_PAGINA_TODOS_ ? 'todos' : tamanhoPagina)}</select>
      </div>
      <div class="botoes">
        <button class="botao" id="sofPagAnterior" ${paginaAtual <= 1 ? 'disabled' : ''}>Anterior</button>
        <button class="botao" id="sofPagProxima" ${paginaAtual >= totalPaginas ? 'disabled' : ''}>Próxima</button>
      </div>`;
    document.getElementById('sofPagAnterior').addEventListener('click', () => { paginaAtual--; carregar(); });
    document.getElementById('sofPagProxima').addEventListener('click', () => { paginaAtual++; carregar(); });
    document.getElementById('sofTamanhoPagina').addEventListener('change', function () { mudarTamanhoPagina_(this.value); });
  }

  /**
   * "Gerar Relatório" (sessão 2026-08-14, pedido do usuário): substitui o
   * antigo "Exportar CSV" (despejava colunas cruas da planilha, sem rótulo/
   * formatação/totais). Escolha de colunas + agrupamento + as 4 saídas
   * (tela/PDF/CSV/Sheets), com os filtros já aplicados na tela. Modal
   * compartilhado com Unidades/Recibos/Notas de Empenho
   * (TelaRelatorios.abrirParaTela, js/relatorios.js).
   */
  function abrirGerarRelatorio() {
    return TelaRelatorios.abrirParaTela({
      fonte: 'sof',
      titulo: 'Gerar Relatório de SOF',
      obterFiltros: filtrosAtuais,
      ajuda: 'O relatório usa os filtros aplicados na tela (todas as páginas, não só a visível). Sem filtro, entram todos os processos.'
    });
  }

  async function abrirSofExistente(id) {
    if (abrindoLinha) return;
    abrindoLinha = true;
    marcarCartaoCarregando(id, true);
    try {
      // O card já tem tudo que obterSof devolveria (fontes, total), então
      // reaproveita "itens" em vez de pedir de novo ao backend - mesmo padrão
      // já usado em abrirReciboExistente (js/recibos.js).
      const sof = itens.find(s => s.id === id);
      if (!sof) return;
      // Abre o formulário na hora, com dado local (zero espera de rede), e
      // checa conflito de edição simultânea em paralelo - ver
      // EdicaoSimultanea/PROGRESS.md (seção de Performance).
      const edicaoPromise = EdicaoSimultanea.iniciarEdicao('SOF', id);
      // silencioso: a seção de Notas de Empenho pode aparecer um instante
      // depois do resto do formulário, sem travar a tela toda com o spinner
      // global enquanto isso.
      const notasPromise = Api.chamar('listarNotasEmpenhoPorSof', { sofId: id }, { silencioso: true }).catch(() => []);
      await abrirFormulario(sof, notasPromise);
      EdicaoSimultanea.tratarConflito(edicaoPromise, 'SOF', id);
    } finally {
      abrindoLinha = false;
      marcarCartaoCarregando(id, false);
    }
  }

  /** Feedback visual imediato no clique (o card fica "carregando" enquanto as chamadas de rede resolvem). */
  function marcarCartaoCarregando(id, carregando) {
    const cartao = document.querySelector(`.cartao-sof[data-id="${id}"]`);
    if (cartao) cartao.classList.toggle('carregando', carregando);
  }

  /**
   * Resolve Ação/Subação/G.D. pra uma Unidade dado um "Tipo de SOF" (casado
   * por título de Seção, case-insensitive) e um Objeto (a Subação pode vir
   * de uma exceção pra esse Objeto, se houver uma dentro da seção) - sessão
   * 2026-09-01, pedido do usuário. Espelha EXATAMENTE
   * resolverAcaoSubacaoGdDaUnidade_ (backend/Unidades.gs) pra o que aparece
   * no formulário bater com o que é gravado de verdade ao salvar (a mesma
   * lógica roda de novo lá, como autoridade final).
   */
  function resolverAcaoSubacaoGd_(unidade, tipo, objeto) {
    const tipoNormalizado = String(tipo || '').trim().toLowerCase();
    const secao = ((unidade && unidade.acoes) || []).find(a => String(a.titulo || '').trim().toLowerCase() === tipoNormalizado);
    if (!secao) return { acao: '', subacao: '', gd: '' };
    const excecao = (secao.excecoes || []).find(e => String(e.objeto || '') === String(objeto || ''));
    return {
      acao: secao.acao || '',
      subacao: excecao ? (excecao.subacao || '') : (secao.subacao || ''),
      gd: secao.gd || ''
    };
  }

  function camposAutopreenchimento(unidade, sof) {
    const mapa = {
      oss_snapshot: 'oss', cnpj_snapshot: 'cnpj', contrato_snapshot: 'contrato_gestao',
      classificacao_orcamentaria_snapshot: 'classificacao_orcamentaria'
    };
    const resultado = {};
    Object.keys(mapa).forEach(campoSnapshot => {
      resultado[campoSnapshot] = sof ? (sof[campoSnapshot] || '') : (unidade ? unidade[mapa[campoSnapshot]] || '' : '');
    });
    if (sof) {
      resultado.acao_snapshot = sof.acao_snapshot || '';
      resultado.subacao_snapshot = sof.subacao_snapshot || '';
      resultado.gd_snapshot = sof.gd_snapshot || '';
    } else {
      // Ação/Subação/G.D. (sessão 2026-09-01) não vêm mais do campo solto da
      // unidade (virou só histórico, nunca mais escrito) - vêm da Seção de
      // Ação casada pelo Tipo de SOF já escolhido (ou não - sofTipoSof pode
      // nem existir ainda, ver 3º parâmetro de abrirFormulario) + a exceção
      // do Objeto já escolhido, se houver.
      const tipoAtual = document.getElementById('sofTipoSof') ? document.getElementById('sofTipoSof').value : '';
      const objetoAtual = document.getElementById('sofObjeto') ? document.getElementById('sofObjeto').value : '';
      const resolvido = resolverAcaoSubacaoGd_(unidade, tipoAtual, objetoAtual);
      resultado.acao_snapshot = resolvido.acao;
      resultado.subacao_snapshot = resolvido.subacao;
      resultado.gd_snapshot = resolvido.gd;
    }
    return resultado;
  }

  /** Reaplica Ação/Subação/G.D. sugeridos (resolverAcaoSubacaoGd_) a partir da Unidade/Tipo/Objeto ATUALMENTE escolhidos no formulário - chamado sempre que qualquer um dos três muda (em qualquer ordem). */
  function atualizarAcaoSubacaoGdPreenchidos_() {
    const unidade = unidades.find(u => u.id === document.getElementById('sofUnidade').value);
    const tipo = document.getElementById('sofTipoSof').value;
    const objeto = document.getElementById('sofObjeto').value;
    const resolvido = resolverAcaoSubacaoGd_(unidade, tipo, objeto);
    document.getElementById('seiAcao').value = resolvido.acao;
    document.getElementById('seiSubacao').value = resolvido.subacao;
    document.getElementById('seiGrupoDespesa').value = resolvido.gd;
  }

  /**
   * Mapeamento campo do formulário -> chave do SOF, usado só para aplicar um
   * SOF "modelo" (autopreenchimento por Tipo de SOF, ver aplicarTemplateSof_
   * abaixo). Cobre todo campo simples (texto/select/textarea) do formulário -
   * Fontes de recurso e Manutenção SEI são arrays dinâmicos, tratados à parte.
   * CNPJ/Ação/Subação usam altCampo porque, num SOF salvo antes da sessão que
   * unificou esses campos, o valor pode estar só no par sei_* ou só no
   * snapshot - depois dessa sessão os dois sempre vêm iguais.
   */
  const CAMPOS_TEMPLATE_SOF_ = [
    { id: 'sofContrato', campo: 'contrato_snapshot' },
    { id: 'sofTa', campo: 'ta' },
    { id: 'sofSei', campo: 'sei' },
    { id: 'sofNumero', campo: 'sof_numero' },
    { id: 'sofDea', campo: 'dea' },
    { id: 'sofPeriodoInicio', campo: 'periodo_inicio' },
    { id: 'sofPeriodoFim', campo: 'periodo_fim' },
    { id: 'seiData', campo: 'sei_data' },
    { id: 'seiTipoSolicitacao', campo: 'sei_tipo_solicitacao' },
    { id: 'seiPrevistoPca', campo: 'sei_previsto_pca' },
    { id: 'seiNumeroPca', campo: 'sei_numero_pca' },
    { id: 'seiNumeroDfd', campo: 'sei_numero_dfd' },
    { id: 'seiTipoPleito', campo: 'sei_tipo_pleito' },
    { id: 'seiJustificativaPleito', campo: 'sei_justificativa_pleito' },
    { id: 'seiAreaSetorSolicitante', campo: 'sei_area_setor_solicitante' },
    { id: 'seiTemaPoas', campo: 'sei_tema_poas' },
    { id: 'sofObjeto', campo: 'objeto' },
    { id: 'seiObjetoDespesa', campo: 'sei_objeto_despesa' },
    { id: 'sofOss', campo: 'oss_snapshot' },
    { id: 'seiDestinacao', campo: 'sei_destinacao' },
    { id: 'seiCredor', campo: 'sei_credor' },
    { id: 'seiCredorCnpj', campo: 'sei_credor_cnpj', altCampo: 'cnpj_snapshot' },
    { id: 'seiAcao', campo: 'sei_acao', altCampo: 'acao_snapshot' },
    { id: 'seiSubacao', campo: 'sei_subacao', altCampo: 'subacao_snapshot' },
    // "Grupo de despesa" unifica o antigo G.D. (gd_snapshot) - usa sei_grupo_despesa,
    // com gd_snapshot como alternativa pra modelos antigos que só tinham o G.D.
    { id: 'seiGrupoDespesa', campo: 'sei_grupo_despesa', altCampo: 'gd_snapshot' },
    { id: 'seiMedidaCompensatoriaPoas', campo: 'sei_medida_compensatoria_poas' },
    { id: 'seiConvenioNumero', campo: 'sei_convenio_numero' },
    { id: 'seiConvenioEfisco', campo: 'sei_convenio_efisco' },
    { id: 'seiConvenioConta', campo: 'sei_convenio_conta' },
    { id: 'seiConvenioBanco', campo: 'sei_convenio_banco' },
    { id: 'seiContrapartidaConvenio', campo: 'sei_contrapartida_convenio' },
    { id: 'seiContrapartidaConta', campo: 'sei_contrapartida_conta' },
    { id: 'seiContrapartidaBanco', campo: 'sei_contrapartida_banco' },
    { id: 'sofNumeroContrato', campo: 'contrato' },
    { id: 'sofCeo', campo: 'ceo' },
    { id: 'seiSolicitanteNome', campo: 'sei_solicitante_nome' },
    { id: 'seiSolicitanteCargo', campo: 'sei_solicitante_cargo' },
    { id: 'seiSolicitanteSetor', campo: 'sei_solicitante_setor' },
    { id: 'seiOrdenadorNome', campo: 'sei_ordenador_nome' },
    { id: 'seiOrdenadorCargo', campo: 'sei_ordenador_cargo' },
    { id: 'seiOrdenadorSetor', campo: 'sei_ordenador_setor' },
    { id: 'seiAssinaturaNeNome', campo: 'sei_assinatura_ne_nome' },
    { id: 'seiAssinaturaNeCargo', campo: 'sei_assinatura_ne_cargo' },
    { id: 'seiAssinaturaNlNome', campo: 'sei_assinatura_nl_nome' },
    { id: 'seiAssinaturaNlCargo', campo: 'sei_assinatura_nl_cargo' },
    { id: 'sofObservacao', campo: 'observacao' }
  ];

  /**
   * Aplica um SOF "modelo" (o mais recente do mesmo Tipo de SOF NA MESMA
   * unidade já escolhida - ver obterTemplateSof em Sof.gs) nos campos do
   * formulário em criação, destacando (classe .destaque-repeticao) tudo que
   * foi preenchido automaticamente - o usuário decide o que muda e o que
   * repete. Unidade não entra no preenchimento (sessão 2026-08-13, pedido do
   * usuário): o backend já garante que template.unidade_id é a unidade
   * escolhida, então sobrescrever o campo aqui só arriscaria desfazer uma
   * troca de unidade que o usuário acabou de fazer. O destaque de um campo
   * some sozinho assim que o usuário mexe nele (input/change, uma vez).
   */
  function aplicarTemplateSof_(template) {
    const destacar = el => {
      el.classList.add('destaque-repeticao');
      const remover = () => el.classList.remove('destaque-repeticao');
      el.addEventListener('input', remover, { once: true });
      el.addEventListener('change', remover, { once: true });
    };

    CAMPOS_TEMPLATE_SOF_.forEach(item => {
      const el = document.getElementById(item.id);
      const valor = template[item.campo] || (item.altCampo && template[item.altCampo]) || '';
      if (!el || !valor) return;
      // Objeto da despesa é um editor contenteditable (usa innerHTML, não value).
      if (item.id === 'seiObjetoDespesa') el.innerHTML = objetoDespesaParaHtml_(valor);
      else el.value = valor;
      destacar(el);
    });
    document.getElementById('sofOss').dispatchEvent(new Event('change', { bubbles: true }));

    if (template.fontes && template.fontes.length) {
      // total_atendido não entra aqui de propósito: é o empenhado da SOF de
      // ORIGEM do template, não desta SOF nova (que ainda não tem NE nenhuma).
      linhasFontes = template.fontes.map(f => ({ fonte: f.fonte, objeto: f.objeto, codigo_poas: f.codigo_poas, parcela_mensal: f.parcela_mensal, cronograma: f.cronograma || [] }));
      renderFontesFormulario();
    }
    linhasManutencaoSei_ = parseManutencaoSei_(template.sei_manutencao_linhas);
    renderManutencaoSeiFormulario_();

    // Os campos acima foram preenchidos por atribuição direta a .value/innerHTML,
    // sem disparar input/change - o listener delegado em #formSof (ver
    // abrirFormulario) não veria essas mudanças sozinho. Chamada explícita
    // aqui reavalia o vermelho de "obrigatório vazio" pra tudo que o template
    // acabou de preencher.
    aplicarDestaqueObrigatorios_();

    UI.toast('Campos preenchidos com os dados do último SOF desse tipo - revise os destacados em amarelo.', 'aviso');
  }

  /**
   * Formulário único de SOF - fundiu o antigo "+ Nova SOF" (simples) com o
   * que era o modal separado "Criar SOF - SEI" (só disponível editando).
   * Pedido do usuário: o formulário do documento SEI passou a ser o próprio
   * formulário de criação, não um passo extra depois. Ver PROGRESS.md.
   */
  async function abrirFormulario(sof, notasPromise) {
    const editando = !!sof;
    sofEmEdicaoId = editando ? sof.id : null;
    linhasFontes = (sof && sof.fontes && sof.fontes.length)
      ? sof.fontes.map(f => ({ fonte: f.fonte, objeto: f.objeto, codigo_poas: f.codigo_poas, parcela_mensal: f.parcela_mensal, cronograma: f.cronograma || [], total_atendido: f.total_atendido }))
      : [{ fonte: '', objeto: '', codigo_poas: '', parcela_mensal: '', cronograma: [] }];
    linhasManutencaoSei_ = parseManutencaoSei_(sof ? sof.sei_manutencao_linhas : null);
    const unidadeAtual = sof ? unidades.find(u => u.id === sof.unidade_id) : null;
    const snapshot = camposAutopreenchimento(unidadeAtual, sof);
    const opcoesObjeto = await TelaListas.obterOpcoes('OBJETO');
    opcoesObjetoAtuais = opcoesObjeto.map(o => o.valor);
    const opcoesOss = await TelaListas.obterOpcoes('OSS');

    const opt = (valorAtual, valor) => `<option value="${UI.escaparHtml(valor)}" ${valorAtual === valor ? 'selected' : ''}>${UI.escaparHtml(valor)}</option>`;
    const selectSimNao = (id, valorAtual) => `<select id="${id}"><option value="">-</option><option ${valorAtual === 'SIM' ? 'selected' : ''}>SIM</option><option ${valorAtual === 'NÃO' ? 'selected' : ''}>NÃO</option></select>`;
    const v = campo => UI.escaparHtml(sof ? sof[campo] || '' : '');

    const corpo = `
      <form id="formSof">
        <div class="campo"><label>Unidade *</label>
          <select id="sofUnidade" required>
            <option value="">Selecione...</option>
            ${unidades.map(u => `<option value="${u.id}" ${sof && sof.unidade_id === u.id ? 'selected' : ''}>${UI.escaparHtml(u.nome)}</option>`).join('')}
          </select>
          ${editando ? '<p class="ajuda">Trocar a unidade atualiza automaticamente OSS/CNPJ/Contrato/Ação/Subação/GD sugeridos - revise antes de salvar (sessão 2026-08-12, pedido do usuário).</p>' : ''}
        </div>
        <div class="campo"><label>Tipo de SOF *</label>
          <select id="sofTipoSof">
            <option value="">Selecione...</option>
            ${OPCOES_SOF_TIPO.map(o => opt(sof ? sof.tipo : '', o)).join('')}
          </select>
          ${!editando ? '<p class="ajuda">Se a unidade escolhida já tiver um SOF desse tipo, os campos são preenchidos com os dados do último (destacados em amarelo) - revise antes de salvar.</p>' : ''}
        </div>
        <div class="campo"><label>Objeto (lista) *</label>${selectObjetoHtml_(opcoesObjeto, sof ? sof.objeto : '')}</div>
        ${sof && sof.divergente_da_unidade ? '<p class="aviso-divergencia">⚠ Um ou mais campos abaixo divergem do cadastro atual da unidade.</p>' : ''}

        <h4 class="sei-secao-titulo">Dados do cadastro</h4>
        <div class="grade-3">
          <div class="campo"><label>Contrato de Gestão *</label><input id="sofContrato" value="${UI.escaparHtml(snapshot.contrato_snapshot)}" /></div>
          <div class="campo"><label>T.A.</label><input id="sofTa" value="${v('ta')}" /></div>
        </div>

        <h4 class="sei-secao-titulo">Identificação do processo</h4>
        <div class="grade-3">
          <div class="campo"><label>Número do Processo *</label><input id="sofSei" value="${v('sei')}" placeholder="0000000000.000000/0000-00" /></div>
          <div class="campo">
            <label>Nº SOF *</label>
            <div class="campo-linha-botao">
              <input id="sofNumero" value="${sof ? v('sof_numero') : '000/0000'}" placeholder="000/0000" />
              ${editando ? '<button type="button" class="botao" id="btnBuscarNumeroSofSei" title="Traz na hora o número que o SEI gerou - normalmente nem precisa clicar, o app já busca sozinho depois de Salvar e enviar ao SEI">🔄 SEI</button>' : ''}
            </div>
            <p class="ajuda">O número oficial (ex.: 173/2026) é gerado pelo SEI só quando o documento é criado lá - fica "000/0000" até então. Depois de "Salvar e enviar ao SEI", o app busca esse número sozinho e preenche automaticamente assim que o SEI gerar.${editando ? ' O botão "SEI" é só um atalho pra trazer na hora, sem esperar.' : ''}</p>
          </div>
          <div class="campo"><label>DEA *</label>
            <select id="sofDea">
              <option value="">-</option>
              <option ${sof && sof.dea === 'SIM' ? 'selected' : ''}>SIM</option>
              <option ${sof && sof.dea === 'NÃO' ? 'selected' : ''}>NÃO</option>
            </select>
          </div>
          <div class="campo"><label>Período - início *</label><input type="date" id="sofPeriodoInicio" value="${v('periodo_inicio')}" /></div>
          <div class="campo"><label>Período - fim *</label><input type="date" id="sofPeriodoFim" value="${v('periodo_fim')}" /></div>
        </div>
        <div class="grade-2">
          <div class="campo"><label>Data</label><input type="date" id="seiData" value="${sof && sof.sei_data ? sof.sei_data : hojeIso_()}" /></div>
          <div class="campo"><label>Solicito *</label><select id="seiTipoSolicitacao"><option value="">Selecione...</option>${OPCOES_SEI_SOLICITACAO.map(o => opt(sof ? sof.sei_tipo_solicitacao : '', o)).join('')}</select></div>
        </div>
        <div class="grade-3">
          <div class="campo"><label>Previsto no PCA?</label>${selectSimNao('seiPrevistoPca', sof ? sof.sei_previsto_pca : '')}</div>
          <div class="campo"><label>Nº do PCA</label><input id="seiNumeroPca" value="${v('sei_numero_pca')}" /></div>
          <div class="campo"><label>Nº do DFD</label><input id="seiNumeroDfd" value="${v('sei_numero_dfd')}" /></div>
        </div>
        <div class="campo"><label>Assinalar o pleito *</label><select id="seiTipoPleito"><option value="">Selecione...</option>${OPCOES_SEI_PLEITO.map(o => opt(sof ? sof.sei_tipo_pleito : '', o)).join('')}</select></div>

        <h4 class="sei-secao-titulo">Contexto</h4>
        <div class="campo"><label>Justificativa do pleito para a CPF/SAD</label><textarea id="seiJustificativaPleito" rows="3">${v('sei_justificativa_pleito')}</textarea></div>
        <div class="grade-2">
          <div class="campo"><label>Área/setor solicitante *</label><input id="seiAreaSetorSolicitante" value="${v('sei_area_setor_solicitante')}" /></div>
          <div class="campo"><label>Tema POAS *</label><input id="seiTemaPoas" value="${v('sei_tema_poas')}" /></div>
        </div>
        <div class="campo">
          <label>Objeto da despesa (texto completo p/ documento SEI) *</label>
          <div class="editor-rico">
            <div class="editor-rico-barra">
              <button type="button" class="editor-rico-btn" data-cmd="bold" title="Negrito (Ctrl+B)"><b>N</b></button>
            </div>
            <div id="seiObjetoDespesa" class="editor-rico-area" contenteditable="true" data-placeholder="Parágrafo completo, com despachos/notas técnicas/valores, igual ao que vai constar no documento. Selecione um trecho e clique em N (ou Ctrl+B) para deixar em negrito.">${objetoDespesaParaHtml_(sof ? sof.sei_objeto_despesa : '')}</div>
          </div>
        </div>

        <h4 class="sei-secao-titulo">Destinação e classificação</h4>
        <div class="grade-3">
          <div class="campo"><label>OSS *</label>${selectOssHtml_(opcoesOss, snapshot.oss_snapshot)}</div>
          <div class="campo"><label>Destinação (Hospital, Geres etc.) *</label><input id="seiDestinacao" value="${UI.escaparHtml((sof && sof.sei_destinacao) || (unidadeAtual ? unidadeAtual.tipo : '') || '')}" /></div>
          <div class="campo"><label>Credor *</label><input id="seiCredor" value="${UI.escaparHtml((sof && sof.sei_credor) || (unidadeAtual ? unidadeAtual.nome : '') || '')}" /></div>
          <div class="campo"><label>CNPJ *</label><input id="seiCredorCnpj" value="${UI.escaparHtml((sof && sof.sei_credor_cnpj) || snapshot.cnpj_snapshot || '')}" /></div>
          <div class="campo"><label>Ação *</label><input id="seiAcao" value="${UI.escaparHtml((sof && sof.sei_acao) || snapshot.acao_snapshot || '')}" /></div>
          <div class="campo"><label>Subação *</label><input id="seiSubacao" value="${UI.escaparHtml((sof && sof.sei_subacao) || snapshot.subacao_snapshot || '')}" /></div>
          <div class="campo"><label>Grupo de despesa *</label><input id="seiGrupoDespesa" value="${UI.escaparHtml((sof && sof.sei_grupo_despesa) || snapshot.gd_snapshot || '')}" placeholder="Ex.: 3.3.50" /></div>
          <div class="campo"><label>Contrato CEO *</label><input id="sofCeo" value="${UI.escaparHtml((sof && sof.ceo) || (unidadeAtual ? unidadeAtual.contrato_ceo : '') || '')}" placeholder="Ex.: 00871/2022" /></div>
        </div>

        <div class="campo">
          <label>Fontes de recurso e cronograma de desembolso *</label>
          <datalist id="listaObjetosSof">${opcoesObjeto.map(o => `<option value="${UI.escaparHtml(o.valor)}">`).join('')}</datalist>
          <div id="sofFontesContainer" class="linhas-fonte"></div>
          <div class="linhas-fonte-rodape">
            <button type="button" class="botao" id="btnAdicionarFonte">+ Adicionar fonte</button>
            <span class="linhas-fonte-total">Total geral: <strong id="sofFontesTotalGeral">R$ 0,00</strong></span>
          </div>
          <p class="ajuda">Preencha só os meses que se aplicam - pagamento único usa 1 mês, pagamento recorrente usa vários. Cada fonte tem seu próprio Objeto (ex.: TES/SUS), pra rastrear o valor atendido por objeto.</p>
        </div>

        <h4 class="sei-secao-titulo">Medida compensatória POAS</h4>
        <div class="campo"><textarea id="seiMedidaCompensatoriaPoas" rows="2">${v('sei_medida_compensatoria_poas')}</textarea></div>

        <h4 class="sei-secao-titulo">Manutenção de Geres, Hospitais Regionais e Suprimento Individual</h4>
        <div id="seiManutencaoContainer" class="linhas-fonte"></div>
        <button type="button" class="botao" id="btnAdicionarLinhaManutencaoSei">+ Adicionar linha</button>

        <h4 class="sei-secao-titulo">Despesas SUS/Portaria ou Convênio/Recursos Próprios</h4>
        <div class="grade-2">
          <div class="campo"><label>Nº do Convênio ou Portaria</label><input id="seiConvenioNumero" value="${v('sei_convenio_numero')}" /></div>
          <div class="campo"><label>Nº do E-fisco</label><input id="seiConvenioEfisco" value="${v('sei_convenio_efisco')}" /></div>
          <div class="campo"><label>Nº da Conta</label><input id="seiConvenioConta" value="${v('sei_convenio_conta')}" /></div>
          <div class="campo"><label>Banco</label><input id="seiConvenioBanco" value="${v('sei_convenio_banco')}" /></div>
          <div class="campo"><label>Contrapartida do Convênio Nº</label><input id="seiContrapartidaConvenio" value="${v('sei_contrapartida_convenio')}" /></div>
          <div class="campo"><label>Nº da Conta (contrapartida)</label><input id="seiContrapartidaConta" value="${v('sei_contrapartida_conta')}" /></div>
          <div class="campo"><label>Banco (contrapartida)</label><input id="seiContrapartidaBanco" value="${v('sei_contrapartida_banco')}" /></div>
        </div>

        <h4 class="sei-secao-titulo">Licitações</h4>
        <div class="grade-2">
          <div class="campo"><label>Número do Contrato</label><input id="sofNumeroContrato" value="${v('contrato')}" /></div>
        </div>

        <h4 class="sei-secao-titulo">Solicitante</h4>
        <div class="grade-3">
          <div class="campo"><label>Nome *</label><input id="seiSolicitanteNome" value="${v('sei_solicitante_nome')}" /></div>
          <div class="campo"><label>Cargo *</label><input id="seiSolicitanteCargo" value="${v('sei_solicitante_cargo')}" /></div>
          <div class="campo"><label>Setor *</label><input id="seiSolicitanteSetor" value="${UI.escaparHtml((sof && sof.sei_solicitante_setor) || (sof && sof.sei_area_setor_solicitante) || '')}" /></div>
        </div>

        <h4 class="sei-secao-titulo">Ordenador</h4>
        <div class="grade-3">
          <div class="campo"><label>Nome *</label><input id="seiOrdenadorNome" value="${v('sei_ordenador_nome')}" /></div>
          <div class="campo"><label>Cargo *</label><input id="seiOrdenadorCargo" value="${v('sei_ordenador_cargo')}" /></div>
          <div class="campo"><label>Setor *</label><input id="seiOrdenadorSetor" value="${v('sei_ordenador_setor')}" /></div>
        </div>

        <h4 class="sei-secao-titulo">Assinatura da Nota de Empenho</h4>
        <div class="grade-2">
          <div class="campo"><label>Nome</label><input id="seiAssinaturaNeNome" value="${v('sei_assinatura_ne_nome')}" /></div>
          <div class="campo"><label>Cargo</label><input id="seiAssinaturaNeCargo" value="${v('sei_assinatura_ne_cargo')}" /></div>
        </div>

        <h4 class="sei-secao-titulo">Assinatura da Nota de Liquidação</h4>
        <div class="grade-2">
          <div class="campo"><label>Nome</label><input id="seiAssinaturaNlNome" value="${v('sei_assinatura_nl_nome')}" /></div>
          <div class="campo"><label>Cargo</label><input id="seiAssinaturaNlCargo" value="${v('sei_assinatura_nl_cargo')}" /></div>
        </div>

        <div class="campo"><label>Observação</label><textarea id="sofObservacao" rows="2">${v('observacao')}</textarea></div>
        <p class="ajuda">O andamento do processo é editado direto no card da listagem (stepper), sem precisar abrir esta tela.</p>
        <p id="sofErro" class="erro-campo oculto"></p>
      </form>
      ${editando ? '<div id="secaoNotasEmpenho" style="border-top:1px solid var(--cinza-200);margin-top:16px;padding-top:12px"></div>' : ''}`;

    UI.abrirModal(editando ? 'Editar SOF' : 'Nova SOF', corpo,
      `<button class="botao" id="btnCancelarSof">Cancelar</button><button class="botao" id="btnEnviarSofSei" title="Salva a SOF e preenche o formulário de Incluir Documento num processo já aberto no SEI">Salvar e enviar ao SEI</button><button class="botao primario" id="btnSalvarSof">Salvar</button>`,
      { grande: true });
    // Duas limpezas no mesmo fechamento (aoFecharModal só guarda 1 callback
    // por vez - ver UI.abrirModal/aoFecharModal, js/app.js): liberar a trava
    // de edição simultânea (já existia) e descartar, em segundo plano, um
    // anexo de NE já enviado ao Drive pelo mini-formulário mas nunca salvo
    // (sessão 2026-08-12 - ver descartarArquivoNeNaoSalvo_).
    if (editando) UI.aoFecharModal(() => { EdicaoSimultanea.sairDaEdicao('SOF', sof.id); descartarArquivoNeNaoSalvo_(); });

    // Destaque vermelho dos obrigatórios vazios (sessão 2026-08-14): estado
    // inicial (tanto SOF nova quanto edição) + ao vivo, delegado no form
    // inteiro - cobre digitação, seleção de <select> e o editor rico de
    // Objeto da despesa (contenteditable dispara 'input' normalmente).
    aplicarDestaqueObrigatorios_();
    document.getElementById('formSof').addEventListener('input', aplicarDestaqueObrigatorios_);
    document.getElementById('formSof').addEventListener('change', aplicarDestaqueObrigatorios_);

    renderFontesFormulario();
    // Preenchimento proporcional do cronograma (sessão 2026-08-12, pedido do
    // usuário) - dispara ao mudar Período-início/fim; a Parcela Mensal de
    // cada fonte tem o gatilho equivalente dentro de renderFontesFormulario
    // (uma linha nova ainda não tem período nem parcela pra prorratear, então
    // não precisa disparar aqui de novo).
    document.getElementById('sofPeriodoInicio').addEventListener('change', aplicarCronogramaProporcionalTodasFontes_);
    document.getElementById('sofPeriodoFim').addEventListener('change', aplicarCronogramaProporcionalTodasFontes_);
    document.getElementById('btnAdicionarFonte').addEventListener('click', () => {
      linhasFontes = lerLinhasFontesDoDom_();
      linhasFontes.push({ fonte: '', objeto: '', codigo_poas: '', parcela_mensal: '', cronograma: [] });
      renderFontesFormulario();
    });
    renderManutencaoSeiFormulario_();
    document.getElementById('btnAdicionarLinhaManutencaoSei').addEventListener('click', () => {
      linhasManutencaoSei_ = lerLinhasManutencaoSeiDoDom_();
      linhasManutencaoSei_.push({ codigo: '', elemento: '', valor: '' });
      renderManutencaoSeiFormulario_();
    });

    document.getElementById('sofUnidade').addEventListener('change', function () {
      const unidade = unidades.find(u => u.id === this.value);
      const preenchido = camposAutopreenchimento(unidade, null);
      document.getElementById('sofOss').value = preenchido.oss_snapshot;
      document.getElementById('sofOss').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('sofContrato').value = preenchido.contrato_snapshot;
      document.getElementById('seiDestinacao').value = unidade ? unidade.tipo || '' : '';
      document.getElementById('seiCredor').value = unidade ? unidade.nome || '' : '';
      document.getElementById('seiCredorCnpj').value = preenchido.cnpj_snapshot;
      document.getElementById('seiAcao').value = preenchido.acao_snapshot;
      document.getElementById('seiSubacao').value = preenchido.subacao_snapshot;
      // Campo unificado "Grupo de despesa" recebe o G.D. da unidade.
      document.getElementById('seiGrupoDespesa').value = preenchido.gd_snapshot;
      // Contrato CEO (sessão 2026-08-14, pedido do usuário) - mesmo padrão de
      // Destinação/Credor acima: vem direto da Unidade, não do snapshot
      // (não existe "campo espelhado" pra ele, é sempre o dado vigente da
      // Unidade no momento da troca). Continua editável depois.
      document.getElementById('sofCeo').value = unidade ? unidade.contrato_ceo || '' : '';
    });

    // Ação/Subação/G.D. também reagem à troca de Tipo de SOF (sessão
    // 2026-09-01, pedido do usuário: "se for pagamentos regulares, entra um
    // tipo, se for Investimento entram os outros valores") - o listener de
    // Objeto já existe mais abaixo (sofObjeto), só ganhou a chamada extra lá.
    document.getElementById('sofTipoSof').addEventListener('change', atualizarAcaoSubacaoGdPreenchidos_);

    if (!editando) {
      // Autopreenchimento pelo último SOF do mesmo tipo NA MESMA unidade
      // escolhida (sessão 2026-08-13, pedido do usuário) - antes buscava o
      // último SOF do tipo em qualquer unidade, o que trazia campos (e até
      // trocava a própria unidade já selecionada) de outra unidade. Agora só
      // autopreenche se essa unidade já tiver um SOF daquele tipo; reage à
      // troca de Unidade OU de Tipo, em qualquer ordem que o usuário preencha.
      //
      // Usava `listarSof({ tipo, page: 1, pageSize: 1 })`: pedia 1 linha, mas o
      // backend calculava fontes/atendido/destaque de TODAS as SOFs antes de
      // paginar - 20 a 45 segundos na medição do usuário. `obterTemplateSof`
      // (Sof.gs) faz só o necessário. `cache: true` deixa instantânea a troca
      // repetida de tipo/unidade; salvarSof invalida esse cache, porque o
      // "último SOF do tipo" muda quando um novo é criado.
      const buscarTemplateSof_ = async () => {
        const tipo = document.getElementById('sofTipoSof').value;
        const unidadeId = document.getElementById('sofUnidade').value;
        if (!tipo || !unidadeId) return;
        try {
          const template = await Api.chamar('obterTemplateSof', { tipo, unidadeId }, { cache: true });
          if (template) aplicarTemplateSof_(template);
        } catch (err) {
          // Autopreenchimento é conveniência, não deve travar o cadastro - falha silenciosa, usuário preenche na mão.
        }
      };
      document.getElementById('sofTipoSof').addEventListener('change', buscarTemplateSof_);
      document.getElementById('sofUnidade').addEventListener('change', buscarTemplateSof_);
    }

    // "+ Adicionar novo objeto..." (última opção do select, ver selectObjetoHtml_): não persiste
    // nada aqui - só entra como opção local nova, selecionada. A gravação em Listas
    // Personalizadas (criarOpcao) só acontece em salvarSof, e só se o SOF for salvo de fato.
    document.getElementById('sofObjeto').addEventListener('change', function () {
      // Ação/Subação/G.D. (sessão 2026-09-01) - a exceção da seção casada
      // pode mudar a Subação sugerida pra este Objeto específico. Roda antes
      // do "+ Adicionar novo objeto..." abaixo de propósito - não afeta em
      // nada esse fluxo (só recomputa de novo quando ele disparar 'change'
      // de novo com o valor definitivo).
      atualizarAcaoSubacaoGdPreenchidos_();
      if (this.value !== NOVO_OBJETO_VALOR_) return;
      const novoValor = (prompt('Digite o novo objeto:') || '').trim();
      if (!novoValor) {
        this.value = '';
      } else {
        const existente = opcoesObjetoAtuais.find(v => v.toLowerCase() === novoValor.toLowerCase());
        if (existente) {
          this.value = existente;
        } else {
          const opcaoNova = document.createElement('option');
          opcaoNova.textContent = novoValor;
          opcaoNova.selected = true;
          this.insertBefore(opcaoNova, this.querySelector(`option[value="${NOVO_OBJETO_VALOR_}"]`));
        }
      }
      this.dispatchEvent(new Event('change', { bubbles: true }));
    });

    document.getElementById('btnCancelarSof').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarSof').addEventListener('click', () => salvarSof(sof));
    // "Salvar e enviar ao SEI" (sessão 2026-08-08): exige a extensão GAOCG SEI
    // Bridge instalada e o processo já aberto numa aba do sei.pe.gov.br - ver
    // js/sei-bridge.js e Extension/gaocg-sei-bridge/.
    document.getElementById('btnEnviarSofSei').addEventListener('click', async function () {
      this.disabled = true;
      try { await salvarSof(sof, { enviarSei: true }); } finally { this.disabled = false; }
    });

    // "🔄 SEI" ao lado de Nº SOF (sessão 2026-08-14, pedido do usuário): traz o
    // número que o SEI gerou no modelo do documento, se "Salvar e enviar ao
    // SEI" já tiver rodado e o editor do SEI já tiver aberto (é nesse momento
    // que a extensão descobre o número - ver numeroSofNoModelo_/
    // guardarNumeroSofCapturado_, content-sei.js). Só consulta o que a
    // extensão já capturou - não abre nem mexe em nenhuma aba do SEI.
    const btnBuscarNumeroSof = document.getElementById('btnBuscarNumeroSofSei');
    if (btnBuscarNumeroSof) {
      btnBuscarNumeroSof.addEventListener('click', async function () {
        const numeroProcesso = document.getElementById('sofSei').value.trim();
        if (!numeroProcesso) { UI.toast('Preencha o Número do Processo antes de buscar.', 'erro'); return; }
        this.disabled = true;
        try {
          const resposta = await SeiBridge.consultarNumeroSof(numeroProcesso);
          if (!resposta.ok) {
            UI.toast(
              resposta.motivo === 'extensao_ausente'
                ? 'Extensão GAOCG SEI Bridge não encontrada.'
                : 'Ainda não encontrei um número gerado pelo SEI para este processo - use "Salvar e enviar ao SEI", espere o editor abrir no SEI e tente de novo.',
              'aviso'
            );
            return;
          }
          const campoNumero = document.getElementById('sofNumero');
          campoNumero.value = resposta.numero;
          campoNumero.dispatchEvent(new Event('input', { bubbles: true }));
          campoNumero.dispatchEvent(new Event('change', { bubbles: true }));
          UI.toast('Número da SOF trazido do SEI: ' + resposta.numero + '. Revise e clique em Salvar.', 'sucesso');
        } finally {
          this.disabled = false;
        }
      });
    }

    /**
     * Automatiza o que o botão "🔄 SEI" acima faz na mão (sessão 2026-09-04,
     * pedido do usuário: "depois que salva a SOF com o novo número já
     * atualizar o novo número da SOF no app"). Chamada logo depois de
     * SeiBridge.enviarSof, roda em segundo plano - consulta a extensão de
     * tempos em tempos até achar o número que o SEI gerou (ou desistir) e,
     * assim que achar, GRAVA sozinha na SOF (Api.chamar('atualizarSof', ...)),
     * mesmo que o formulário já tenha sido fechado nesse meio tempo (é o caso
     * de reenviar uma SOF já existente - salvarSof fecha o modal na hora).
     * Também atualiza o campo #sofNumero ao vivo, se esta MESMA SOF ainda
     * estiver aberta pra edição (sofEmEdicaoId).
     *
     * Intervalo de 10s, desiste depois de ~16min - a extensão descarta o
     * conteúdo "pendente" depois de 15min (VALIDADE_PENDENTE_MS_,
     * Extension/gaocg-sei-bridge/content-sei.js), então não faz sentido
     * insistir além disso. O botão manual continua ali como reforço/atalho,
     * caso o usuário volte depois dessa janela.
     */
    function iniciarBuscaAutomaticaNumeroSof_(sofId, numeroProcesso) {
      if (!sofId || !numeroProcesso || buscasAutomaticasNumeroSof_.has(sofId)) return;
      buscasAutomaticasNumeroSof_.add(sofId);

      const INTERVALO_MS = 10000;
      const LIMITE_MS = 16 * 60 * 1000;
      const inicio = Date.now();

      (async function tentar() {
        try {
          while (Date.now() - inicio < LIMITE_MS) {
            await new Promise(resolve => setTimeout(resolve, INTERVALO_MS));
            let resposta;
            try {
              resposta = await SeiBridge.consultarNumeroSof(numeroProcesso);
            } catch (e) {
              return; // erro inesperado - desiste em silêncio, o botão manual continua disponível
            }
            if (resposta.motivo === 'extensao_ausente') return; // sem extensão, não adianta insistir

            if (resposta.ok) {
              try {
                await Api.chamar('atualizarSof', { id: sofId, data: { sof_numero: resposta.numero } });
                CacheAbas.invalidar('sof');
                if (sofEmEdicaoId === sofId) {
                  const campoNumero = document.getElementById('sofNumero');
                  if (campoNumero) {
                    campoNumero.value = resposta.numero;
                    campoNumero.dispatchEvent(new Event('input', { bubbles: true }));
                    campoNumero.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
                UI.toast('Número da SOF preenchido automaticamente: ' + resposta.numero + '.', 'sucesso');
              } catch (e) {
                // Não conseguiu gravar (ex.: sessão expirou nesse meio tempo) -
                // não trava nada, o usuário ainda pode trazer na mão depois.
              }
              return;
            }
            // Ainda não encontrado - tenta de novo no próximo ciclo.
          }
        } finally {
          buscasAutomaticasNumeroSof_.delete(sofId);
        }
      })();
    }

    // Barra do editor "Objeto da despesa" (negrito). mousedown preventDefault
    // pra não perder a seleção ao clicar no botão; Ctrl+B já funciona nativo.
    document.querySelectorAll('#formSof .editor-rico-btn').forEach(btn => {
      btn.addEventListener('mousedown', e => e.preventDefault());
      btn.addEventListener('click', () => {
        document.getElementById('seiObjetoDespesa').focus();
        document.execCommand(btn.dataset.cmd, false, null);
      });
    });

    ['sofUnidade', 'sofOss', 'sofObjeto'].forEach(id => UI.tornarPesquisavel(id));
    // Só agora o <input> visível de cada select pesquisável existe de fato -
    // reaplica o destaque de obrigatório vazio pra ele também (ver comentário
    // em aplicarDestaqueObrigatorios_ acima sobre por que isso não dava pra
    // fazer numa chamada só).
    aplicarDestaqueObrigatorios_();

    if (editando) {
      await renderNotasEmpenho(sof, notasPromise);
    }
  }

  /** Monta o <select> de OSS a partir da lista personalizada; se o valor do snapshot não estiver na lista, entra como opção extra selecionada (não perde dado já existente). */
  function selectOssHtml_(opcoesOss, valorAtual) {
    const valores = opcoesOss.map(o => o.valor);
    const extra = valorAtual && valores.indexOf(valorAtual) === -1 ? [valorAtual] : [];
    const todas = extra.concat(valores);
    return `<select id="sofOss">
      <option value="">Selecione...</option>
      ${todas.map(v => `<option ${v === valorAtual ? 'selected' : ''}>${UI.escaparHtml(v)}</option>`).join('')}
    </select>`;
  }

  /** Igual a selectOssHtml_, mas com uma opção extra no fim pra cadastrar um novo Objeto sem sair do formulário (ver ligarSelectObjeto_). */
  function selectObjetoHtml_(opcoesObjeto, valorAtual) {
    const valores = opcoesObjeto.map(o => o.valor);
    const extra = valorAtual && valores.indexOf(valorAtual) === -1 ? [valorAtual] : [];
    const todas = extra.concat(valores);
    return `<select id="sofObjeto">
      <option value="">Selecione...</option>
      ${todas.map(v => `<option ${v === valorAtual ? 'selected' : ''}>${UI.escaparHtml(v)}</option>`).join('')}
      <option value="${NOVO_OBJETO_VALOR_}">+ Adicionar novo objeto...</option>
    </select>`;
  }

  const NOMES_MESES_ABREV_FONTE_ = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  /**
   * Preenchimento automático e proporcional do cronograma de cada fonte, a
   * partir do Período (início/fim) do SOF (sessão 2026-08-12, pedido do
   * usuário) - dispara ao mudar Período-início/fim OU a Parcela Mensal de
   * qualquer fonte (ver aplicarCronogramaProporcionalTodasFontes_ abaixo).
   *
   * Regra dada pelo usuário: meses inteiramente dentro do período recebem a
   * Parcela Mensal cheia; o mês de início (se não começar no dia 1) e o mês
   * de fim (se não terminar no fim do mês) recebem só a fração proporcional
   * aos dias do período dentro daquele mês, sobre um padrão FIXO de 30 dias
   * por mês (28 pra fevereiro, sempre - não é o calendário real, é a regra
   * que o usuário pediu). Ex.: parcela 100, período 01/01 a 15/03 -> Jan=100,
   * Fev=100, Mar=(100/30)*15=50.
   *
   * "SEMPRE recalcular tudo" foi escolha explícita do usuário (sessão
   * 2026-08-12, ver PROGRESS.md) - substitui qualquer valor já digitado nos
   * meses do intervalo, mesmo que o analista tenha ajustado à mão antes.
   * Meses fora do intervalo [início, fim] não são tocados (nem zerados).
   *
   * Regra do setor (sessão 2026-08-14, pedido do usuário): por cima do valor
   * já calculado acima (cheio ou proporcional), o PRIMEIRO mês do período
   * recebe 1 centavo A MAIS e o ÚLTIMO 1 centavo A MENOS - convenção do
   * próprio setor, não é arredondamento. Ex.: parcela 100, período 01/01 a
   * 15/03 -> Jan=100,01 · Fev=100 · Mar=49,99. Início e fim no mesmo mês
   * cancelam os dois ajustes entre si (não existe "primeiro" x "último"
   * distintos nesse caso) e o valor sai intacto, de propósito.
   */
  // 30 dias fixos pra TODO mês, 28 só pra fevereiro - NÃO é o calendário real
  // (março/maio/etc. têm 31 de verdade). Regra explícita do usuário (padrão
  // de contagem "comercial", comum em cálculo financeiro por parcela mensal).
  var DIAS_PADRAO_MES_ = [30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30];

  function calcularCronogramaProporcional_(periodoInicioIso, periodoFimIso, parcelaMensal) {
    if (!periodoInicioIso || !periodoFimIso || !parcelaMensal) return null;
    const inicio = new Date(periodoInicioIso + 'T00:00:00');
    const fim = new Date(periodoFimIso + 'T00:00:00');
    if (isNaN(inicio.getTime()) || isNaN(fim.getTime()) || fim < inicio) return null;

    const cronograma = {};
    let cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    const cursorFim = new Date(fim.getFullYear(), fim.getMonth(), 1);
    // Limite de segurança (10 anos) - período com data absurda/invertida não
    // trava o navegador num loop enorme.
    for (let seguranca = 0; cursor <= cursorFim && seguranca < 120; seguranca++) {
      const mesNumero = cursor.getMonth() + 1;
      const diasNoMes = DIAS_PADRAO_MES_[cursor.getMonth()];
      const ehMesInicio = cursor.getFullYear() === inicio.getFullYear() && cursor.getMonth() === inicio.getMonth();
      const ehMesFim = cursor.getFullYear() === fim.getFullYear() && cursor.getMonth() === fim.getMonth();
      const diaInicioEfetivo = ehMesInicio ? inicio.getDate() : 1;
      const diaFimEfetivo = ehMesFim ? Math.min(fim.getDate(), diasNoMes) : diasNoMes;
      const diasUsados = Math.max(0, diaFimEfetivo - diaInicioEfetivo + 1);
      cronograma[mesNumero] = Math.round((parcelaMensal / diasNoMes) * diasUsados * 100) / 100;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    // Regra do setor: +1 centavo no primeiro mês, -1 centavo no último (ver
    // comentário do JSDoc acima). Sequencial na mesma chave quando início e
    // fim caem no mesmo mês - os dois ajustes se cancelam.
    const mesInicio = inicio.getMonth() + 1;
    const mesFim = fim.getMonth() + 1;
    if (cronograma.hasOwnProperty(mesInicio)) cronograma[mesInicio] = Math.round((cronograma[mesInicio] + 0.01) * 100) / 100;
    if (cronograma.hasOwnProperty(mesFim)) cronograma[mesFim] = Math.round((cronograma[mesFim] - 0.01) * 100) / 100;

    return cronograma;
  }

  /** Aplica o cronograma proporcional em TODAS as linhas de fonte atualmente na tela, cada uma com sua própria Parcela Mensal. Sem período preenchido, não faz nada. */
  function aplicarCronogramaProporcionalTodasFontes_() {
    const periodoInicio = document.getElementById('sofPeriodoInicio').value;
    const periodoFim = document.getElementById('sofPeriodoFim').value;
    if (!periodoInicio || !periodoFim) return;
    document.querySelectorAll('#sofFontesContainer .linha-fonte-cronograma').forEach(linha => {
      const parcela = UI.parseValorBr(linha.querySelector('.linha-fonte-parcela').value);
      const cronograma = calcularCronogramaProporcional_(periodoInicio, periodoFim, parcela);
      if (!cronograma) return;
      linha.querySelectorAll('.linha-fonte-mes').forEach(input => {
        const mes = Number(input.dataset.mes);
        if (cronograma.hasOwnProperty(mes)) input.value = cronograma[mes];
      });
      atualizarTotalLinhaFonte_(linha);
    });
    atualizarTotalGeralFormulario();
  }

  /** Lê as linhas de fonte direto do DOM (fonte da verdade entre re-renders). */
  function lerLinhasFontesDoDom_() {
    return Array.from(document.querySelectorAll('#sofFontesContainer .linha-fonte-cronograma')).map(linha => {
      // total_atendido (sessão 2026-07-29): não é editável (só leitura, vem de
      // obterSof), mas precisa sobreviver aos re-renders (+Adicionar
      // fonte/Remover) - guardado num data-attribute pra não se perder.
      const totalAtendidoAttr = linha.dataset.totalAtendido;
      return {
        fonte: linha.querySelector('.linha-fonte-select').value,
        objeto: linha.querySelector('.linha-fonte-objeto').value.trim(),
        codigo_poas: linha.querySelector('.linha-fonte-codigo-poas').value.trim(),
        parcela_mensal: UI.parseValorBr(linha.querySelector('.linha-fonte-parcela').value),
        cronograma: Array.from(linha.querySelectorAll('.linha-fonte-mes')).map(i => ({ mes: Number(i.dataset.mes), valor: UI.parseValorBr(i.value) })),
        total_atendido: totalAtendidoAttr === undefined || totalAtendidoAttr === '' ? undefined : Number(totalAtendidoAttr)
      };
    });
  }

  /**
   * Cada Fonte virou um mini-cronograma: Fonte/Objeto/Código POAS/Parcela
   * Mensal numa linha, e 12 valores mensais (Jan-Dez) preenchidos manualmente
   * embaixo - pode ter só 1 mês (pagamento único) ou vários (pagamento
   * recorrente). Total Solicitado deixou de ser digitado - vira somente
   * leitura, soma dos meses. Parcela Mensal continua separada, não entra no
   * documento gerado e segue sendo só a base do alerta da Nota de Empenho.
   * Classe própria "linha-fonte-cronograma" (em vez de reaproveitar
   * ".linha-fonte") porque essa linha não cabe mais no grid de 4 colunas numa
   * única linha que ".linha-fonte" pressupõe (usado também pelas linhas de
   * Manutenção, que continuam simples e não podem mudar de layout).
   *
   * Objeto (sessão 2026-07-29): campo próprio por linha de fonte (ex.:
   * "CONTRATO DE GESTÃO (TES)"), obrigatório - é o que amarra NE/Recibo ao
   * objeto certo. Input com
   * <datalist> (sugestões da mesma lista de Objeto usada em todo o app),
   * mas aceita texto livre - não é um <select> fechado.
   *
   * Destaque verde/vermelho no cronograma (sessão 2026-07-29, pedido do
   * usuário): só aparece quando o SOF já está salvo e tem total_atendido
   * calculado (obterSof) - marca em verde os meses cujo acumulado solicitado
   * já está coberto pelo total empenhado (NE mãe + reforços) desta fonte+
   * objeto, e vermelho os que ainda não. SOF novo (sem total_atendido ainda)
   * não mostra destaque nenhum.
   */
  function linhaFonteHtml(item, indice, podeRemover) {
    const porMes = {};
    (item.cronograma || []).forEach(c => { porMes[c.mes] = c.valor; });

    const temAtendido = item.total_atendido !== undefined && item.total_atendido !== null;
    const statusPorMes = {};
    if (temAtendido) {
      let acumulado = 0;
      Object.keys(porMes).map(Number).sort((a, b) => a - b).forEach(mes => {
        acumulado += Number(porMes[mes]) || 0;
        statusPorMes[mes] = acumulado <= item.total_atendido + 0.01 ? 'atendido' : 'pendente';
      });
    }

    const mesesHtml = NOMES_MESES_ABREV_FONTE_.map((nome, i) => {
      const mes = i + 1;
      const valorMes = porMes[mes];
      const classeStatus = (temAtendido && valorMes) ? ` mes-${statusPorMes[mes]}` : '';
      return `<div class="campo linha-fonte-mes-campo${classeStatus}"><label>${nome}</label><input class="linha-fonte-mes campo-moeda" type="text" inputmode="decimal" data-mes="${mes}" value="${valorMes || ''}" /></div>`;
    }).join('');

    return `
      <div class="linha-fonte-cronograma" data-indice="${indice}" data-total-atendido="${temAtendido ? item.total_atendido : ''}">
        ${podeRemover ? '<button type="button" class="botao-icone linha-fonte-remover" title="Remover fonte">&times;</button>' : ''}
        <div class="linha-fonte-cabecalho">
          <div class="campo"><label>Fonte</label>
            <select class="linha-fonte-select">
              <option value="">-</option>
              ${OPCOES_FONTE.map(f => `<option ${item.fonte === f ? 'selected' : ''}>${f}</option>`).join('')}
            </select>
          </div>
          <div class="campo"><label>Objeto</label><input class="linha-fonte-objeto" list="listaObjetosSof" value="${UI.escaparHtml(item.objeto || '')}" placeholder="Ex.: CONTRATO DE GESTÃO (TES)" /></div>
          <div class="campo"><label>Código POAS</label><input class="linha-fonte-codigo-poas" value="${UI.escaparHtml(item.codigo_poas || '')}" /></div>
          <div class="campo"><label>Parcela Mensal</label><input class="linha-fonte-parcela campo-moeda" type="text" inputmode="decimal" value="${item.parcela_mensal || ''}" /></div>
          <div class="campo"><label>Total Solicitado</label><strong class="linha-fonte-total-exibicao">R$ 0,00</strong></div>
          ${temAtendido ? `<div class="campo"><label>Total Atendido</label><strong class="linha-fonte-total-atendido-exibicao">${UI.formatarMoeda(item.total_atendido)}</strong></div>` : ''}
        </div>
        <div class="linha-fonte-meses">${mesesHtml}</div>
        ${temAtendido ? '<p class="ajuda linha-fonte-legenda">🟩 Atendido · 🟥 Falta atender</p>' : ''}
      </div>`;
  }

  function atualizarTotalLinhaFonte_(linhaEl) {
    const soma = Array.from(linhaEl.querySelectorAll('.linha-fonte-mes')).reduce((s, i) => s + (UI.parseValorBr(i.value) || 0), 0);
    const alvo = linhaEl.querySelector('.linha-fonte-total-exibicao');
    if (alvo) alvo.textContent = UI.formatarMoeda(soma);
    return soma;
  }

  function atualizarTotalGeralFormulario() {
    const linhas = Array.from(document.querySelectorAll('#sofFontesContainer .linha-fonte-cronograma'));
    const soma = linhas.reduce((total, linha) => total + atualizarTotalLinhaFonte_(linha), 0);
    const alvo = document.getElementById('sofFontesTotalGeral');
    if (alvo) alvo.textContent = UI.formatarMoeda(soma);
  }

  function renderFontesFormulario() {
    const alvo = document.getElementById('sofFontesContainer');
    alvo.innerHTML = linhasFontes.map((item, i) => linhaFonteHtml(item, i, linhasFontes.length > 1)).join('');

    alvo.querySelectorAll('.linha-fonte-remover').forEach(btn => {
      btn.addEventListener('click', () => {
        linhasFontes = lerLinhasFontesDoDom_();
        const indice = Number(btn.closest('.linha-fonte-cronograma').dataset.indice);
        linhasFontes.splice(indice, 1);
        renderFontesFormulario();
      });
    });
    alvo.querySelectorAll('.linha-fonte-select').forEach(select => {
      select.addEventListener('change', function () {
        const outras = Array.from(alvo.querySelectorAll('.linha-fonte-select')).filter(s => s !== this);
        if (this.value && outras.some(s => s.value === this.value)) {
          confirm('Você está escolhendo a mesma fonte que a anterior, isso está correto?');
        }
      });
    });
    alvo.querySelectorAll('.linha-fonte-mes').forEach(input => {
      input.addEventListener('input', atualizarTotalGeralFormulario);
    });
    // Preenchimento proporcional do cronograma (sessão 2026-08-12): a Parcela
    // Mensal é o outro gatilho, além do Período-início/fim (ver
    // abrirFormulario) - dispara pra TODAS as fontes (não só esta linha),
    // mesma função, é barata e idempotente.
    alvo.querySelectorAll('.linha-fonte-parcela').forEach(input => {
      input.addEventListener('change', aplicarCronogramaProporcionalTodasFontes_);
    });
    atualizarTotalGeralFormulario();
  }

  /**
   * "Objeto da despesa" permite negrito (2026-07-28). Armazenamento é texto
   * puro com marcador markdown `**negrito**` (nada de HTML na célula do Sheets,
   * sem risco de XSS): o negrito é reconstruído só na exibição por
   * objetoDespesaParaHtml_. serializarObjetoDespesa_ converte o conteúdo do
   * editor contenteditable de volta pra esse texto com `**`.
   */
  function isBoldStyle_(el) {
    const fw = el.style && el.style.fontWeight;
    return fw === 'bold' || fw === 'bolder' || Number(fw) >= 600;
  }
  function serializarObjetoDespesa_(editorEl) {
    const segs = [];
    (function walk(node, bold) {
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) { segs.push({ t: n.nodeValue, b: bold }); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName;
        if (tag === 'BR') { segs.push({ t: '\n', b: false }); return; }
        const b = bold || tag === 'B' || tag === 'STRONG' || isBoldStyle_(n);
        if (tag === 'DIV' || tag === 'P') segs.push({ t: '\n', b: false });
        walk(n, b);
      });
    })(editorEl, false);
    let out = '';
    segs.forEach(s => {
      if (s.t === '\n') { out += '\n'; return; }
      const t = String(s.t).replace(/\*/g, ''); // asterisco literal não convive com o marcador **
      out += (s.b && t.trim()) ? '**' + t + '**' : t;
    });
    return out.replace(/\*\*(\s*)\*\*/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
  }
  /** Texto (com `**negrito**`) -> HTML seguro: escapa tudo, depois aplica negrito e quebras de linha. */
  function objetoDespesaParaHtml_(texto) {
    return UI.escaparHtml(String(texto || ''))
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  /** Junta os campos "de sempre" do SOF com os ~34 campos do documento SEI (formulário único desde a fusão). */
  function coletarDadosFormulario() {
    const linhasManutencao = lerLinhasManutencaoSeiDoDom_().filter(l => l.codigo || l.elemento || l.valor);
    return {
      unidade_id: document.getElementById('sofUnidade').value,
      tipo: document.getElementById('sofTipoSof').value,
      oss_snapshot: document.getElementById('sofOss').value.trim(),
      cnpj_snapshot: document.getElementById('seiCredorCnpj').value.trim(),
      contrato_snapshot: document.getElementById('sofContrato').value.trim(),
      acao_snapshot: document.getElementById('seiAcao').value.trim(),
      subacao_snapshot: document.getElementById('seiSubacao').value.trim(),
      // "G.D." e "Grupo de despesa" foram unificados num único campo (mesma
      // informação) - ambos vêm de seiGrupoDespesa (2026-07-28).
      gd_snapshot: document.getElementById('seiGrupoDespesa').value.trim(),
      sei: document.getElementById('sofSei').value.trim(),
      sof_numero: document.getElementById('sofNumero').value.trim(),
      periodo_inicio: document.getElementById('sofPeriodoInicio').value,
      periodo_fim: document.getElementById('sofPeriodoFim').value,
      dea: document.getElementById('sofDea').value.trim(),
      ta: document.getElementById('sofTa').value.trim(),
      ceo: document.getElementById('sofCeo').value.trim(),
      contrato: document.getElementById('sofNumeroContrato').value.trim(),
      fontes: lerLinhasFontesDoDom_(),
      objeto: document.getElementById('sofObjeto').value.trim(),
      observacao: document.getElementById('sofObservacao').value.trim(),
      completo: true,

      sei_data: document.getElementById('seiData').value,
      sei_tipo_solicitacao: document.getElementById('seiTipoSolicitacao').value,
      sei_previsto_pca: document.getElementById('seiPrevistoPca').value,
      sei_numero_pca: document.getElementById('seiNumeroPca').value.trim(),
      sei_numero_dfd: document.getElementById('seiNumeroDfd').value.trim(),
      sei_tipo_pleito: document.getElementById('seiTipoPleito').value,
      sei_justificativa_pleito: document.getElementById('seiJustificativaPleito').value.trim(),
      sei_area_setor_solicitante: document.getElementById('seiAreaSetorSolicitante').value.trim(),
      sei_tema_poas: document.getElementById('seiTemaPoas').value.trim(),
      sei_objeto_despesa: serializarObjetoDespesa_(document.getElementById('seiObjetoDespesa')),
      sei_destinacao: document.getElementById('seiDestinacao').value.trim(),
      sei_credor: document.getElementById('seiCredor').value.trim(),
      sei_credor_cnpj: document.getElementById('seiCredorCnpj').value.trim(),
      sei_acao: document.getElementById('seiAcao').value.trim(),
      sei_subacao: document.getElementById('seiSubacao').value.trim(),
      sei_grupo_despesa: document.getElementById('seiGrupoDespesa').value.trim(),
      sei_medida_compensatoria_poas: document.getElementById('seiMedidaCompensatoriaPoas').value.trim(),
      sei_manutencao_linhas: JSON.stringify(linhasManutencao),
      sei_convenio_numero: document.getElementById('seiConvenioNumero').value.trim(),
      sei_convenio_efisco: document.getElementById('seiConvenioEfisco').value.trim(),
      sei_convenio_conta: document.getElementById('seiConvenioConta').value.trim(),
      sei_convenio_banco: document.getElementById('seiConvenioBanco').value.trim(),
      sei_contrapartida_convenio: document.getElementById('seiContrapartidaConvenio').value.trim(),
      sei_contrapartida_conta: document.getElementById('seiContrapartidaConta').value.trim(),
      sei_contrapartida_banco: document.getElementById('seiContrapartidaBanco').value.trim(),
      sei_solicitante_nome: document.getElementById('seiSolicitanteNome').value.trim(),
      sei_solicitante_cargo: document.getElementById('seiSolicitanteCargo').value.trim(),
      sei_solicitante_setor: document.getElementById('seiSolicitanteSetor').value.trim(),
      sei_ordenador_nome: document.getElementById('seiOrdenadorNome').value.trim(),
      sei_ordenador_cargo: document.getElementById('seiOrdenadorCargo').value.trim(),
      sei_ordenador_setor: document.getElementById('seiOrdenadorSetor').value.trim(),
      sei_assinatura_ne_nome: document.getElementById('seiAssinaturaNeNome').value.trim(),
      sei_assinatura_ne_cargo: document.getElementById('seiAssinaturaNeCargo').value.trim(),
      sei_assinatura_nl_nome: document.getElementById('seiAssinaturaNlNome').value.trim(),
      sei_assinatura_nl_cargo: document.getElementById('seiAssinaturaNlCargo').value.trim()
    };
  }

  /**
   * Lê o mini-formulário de Nota de Empenho embutido na edição de SOF (sem
   * botão próprio - só é salvo/adicionado junto com o botão "Salvar" do
   * formulário principal). Retorna `null` se o mini-formulário nem existe na
   * tela (SOF novo) ou está totalmente vazio (usuário não quer adicionar
   * nenhuma NE nesse Salvar). Lança erro com mensagem amigável se algo foi
   * preenchido parcialmente.
   */
  async function lerMiniFormularioNe_() {
    const numeroEl = document.getElementById('neNumero');
    if (!numeroEl) return null;
    const tipo = document.getElementById('neTipo').value;
    const numero = numeroEl.value.trim();
    const fonte = document.getElementById('neFonte').value;
    const objeto = document.getElementById('neObjeto').value;
    // valorBruto x valor: a presença do campo é aferida pelo texto digitado
    // (um "0" conta como preenchido), mas o que vai pro backend é o número já
    // normalizado do formato BR - ver UI.parseValorBr em js/app.js.
    const valorBruto = document.getElementById('neValor').value;
    const valor = UI.parseValorBr(valorBruto);
    const arquivoInput = document.getElementById('neArquivo');
    const arquivo = arquivoInput.files[0];

    const algumPreenchido = numero || fonte || valorBruto || arquivo;
    if (!algumPreenchido) return null;

    if (!numero) throw new Error('Informe o número da Nota de Empenho (ou limpe os outros campos da NE pra não adicionar nenhuma).');
    if (!fonte) throw new Error('Selecione a fonte da Nota de Empenho.');
    // Objeto só é exigido na original - reforço herda da NE original no
    // backend (sempre), o valor aqui é só informativo/travado.
    if (tipo === 'original' && !objeto) throw new Error('Selecione o objeto da Nota de Empenho.');
    if (!arquivo) throw new Error('Anexe o arquivo da Nota de Empenho.');
    if (arquivo.size > 8 * 1024 * 1024) throw new Error('Arquivo da Nota de Empenho muito grande (máximo 8MB).');

    // arquivo_drive_id (sessão 2026-08-12): se o anexo atual já foi lido com
    // sucesso por lerAnexoNotaEmpenho (ligarOcrMiniFormularioNe_ acima), o
    // arquivo JÁ está no Drive - reaproveita em vez de reler/reenviar o mesmo
    // arquivo (evitava o segundo upload completo que fazia leitura+salvamento
    // somarem 30s+ - achado do usuário, sessão 2026-08-12). Se a leitura
    // falhou (arquivoNeDriveIdMiniform_ ainda null) mas o analista preencheu
    // os campos manualmente com o arquivo selecionado, cai no caminho antigo -
    // reler o arquivo e mandar o base64, upload acontece no backend como
    // sempre aconteceu (nunca foi exigido que o OCR desse certo pra salvar
    // aqui, e isso continua valendo).
    const arquivoBase64 = arquivoNeDriveIdMiniform_ ? null : await UI.lerArquivoBase64(arquivo);
    return {
      tipo, numero_ne: numero, fonte, objeto, valor, arquivoBase64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type,
      arquivo_drive_id: arquivoNeDriveIdMiniform_, arquivo_url: arquivoNeUrlMiniform_,
      // itens (sessão 2026-07-29): meses reforçados detectados por OCR, quando
      // tipo=reforco e o documento tinha um cronograma com 1+ meses - ver
      // ligarOcrMiniFormularioNe_. salvarSof usa criarReforcosEmLote nesse caso.
      itens: tipo === 'reforco' ? itensReforcoMiniform_ : null,
      // numero_ne_reforco (sessão 2026-07-30): número PRÓPRIO do documento de
      // reforço lido por OCR - agrupa os meses desse documento como "um
      // reforço só" na tela de Notas de Empenho.
      numero_ne_reforco: tipo === 'reforco' ? numeroNeReforcoMiniform_ : null
    };
  }

  /** Salva o SOF - opcoes.enviarSei também monta o documento HTML e manda pra extensão do SEI na sequência (ver SeiBridge.enviarSof abaixo). */
  async function salvarSof(sofExistente, opcoes) {
    opcoes = opcoes || {};
    // Nada mudou (sessão 2026-08-13, pedido do usuário): editando uma SOF já
    // existente, no botão "Salvar" puro (enviarSei pede uma ação explícita à
    // parte, então continua rodando mesmo sem edição), só fecha o card em vez
    // de validar + chamar o backend à toa - é o mesmo dirty-tracking que já
    // decidia minimizar x fechar no clique fora (ver UI.modalFoiEditado,
    // js/app.js).
    if (sofExistente && !opcoes.enviarSei && !UI.modalFoiEditado()) {
      UI.fecharModal();
      return;
    }
    const erroEl = document.getElementById('sofErro');
    erroEl.classList.add('oculto');
    erroEl.classList.remove('erro-campo-grande');
    // Portao unico dos campos monetarios (UI.validarCamposMoeda, js/app.js):
    // recusa texto que nao vira numero em vez de gravar R$ 0,00 sem avisar.
    if (!UI.validarCamposMoeda()) return;
    const dados = coletarDadosFormulario();
    if (!dados.unidade_id && !sofExistente) {
      mostrarErroObrigatoriosSof_(erroEl, { mensagem: 'Selecione a unidade.', ids: ['sofUnidade'] });
      return;
    }
    const resultadoObrigatorios = validarCamposObrigatorios();
    if (resultadoObrigatorios) { mostrarErroObrigatoriosSof_(erroEl, resultadoObrigatorios); return; }

    let dadosNe;
    try {
      dadosNe = await lerMiniFormularioNe_();
    } catch (err) {
      erroEl.classList.remove('erro-campo-grande');
      UI.mostrarErro(erroEl, err.message);
      return;
    }

    try {
      let resposta;
      if (sofExistente) resposta = await Api.chamar('atualizarSof', { id: sofExistente.id, data: dados });
      else resposta = await Api.chamar('criarSof', { data: dados });

      // Objeto novo (digitado via "+ Adicionar novo objeto..." no <select>, abaixo) só
      // vira opção de verdade em Listas Personalizadas depois que o SOF salvou com sucesso.
      if (dados.objeto && !opcoesObjetoAtuais.includes(dados.objeto)) {
        try {
          await Api.chamar('criarOpcao', { data: { tipo_lista: 'OBJETO', valor: dados.objeto } });
          Api.invalidarCache('listarOpcoes');
          CacheAbas.invalidar('listas');
          opcoesObjetoAtuais.push(dados.objeto);
        } catch (err) {
          // Falha aqui é secundária - o SOF já foi salvo. Não interrompe o fluxo de sucesso.
        }
      }

      if (dadosNe) {
        // Reforço com meses detectados por OCR (sessão 2026-07-29): cria todos
        // de uma vez, compartilhando o mesmo arquivo anexado (criarReforcosEmLote).
        if (dadosNe.tipo === 'reforco' && dadosNe.itens && dadosNe.itens.length) {
          await Api.chamar('criarReforcosEmLote', {
            data: { sof_id: resposta.id, numero_ne: dadosNe.numero_ne, numero_ne_reforco: dadosNe.numero_ne_reforco, itens: dadosNe.itens,
              arquivoBase64: dadosNe.arquivoBase64, arquivoNome: dadosNe.arquivoNome, arquivoTipo: dadosNe.arquivoTipo,
              arquivo_drive_id: dadosNe.arquivo_drive_id, arquivo_url: dadosNe.arquivo_url }
          });
        } else {
          await Api.chamar('criarNotaEmpenho', {
            data: { sof_id: resposta.id, tipo: dadosNe.tipo, numero_ne: dadosNe.numero_ne, numero_ne_reforco: dadosNe.numero_ne_reforco, fonte: dadosNe.fonte, objeto: dadosNe.objeto, valor: dadosNe.valor,
              arquivoBase64: dadosNe.arquivoBase64, arquivoNome: dadosNe.arquivoNome, arquivoTipo: dadosNe.arquivoTipo,
              arquivo_drive_id: dadosNe.arquivo_drive_id, arquivo_url: dadosNe.arquivo_url }
          });
        }
        // Zera ANTES de qualquer fecharModal() adiante (chamado logo abaixo,
        // no branch sofExistente) - o arquivo acabou de ser vinculado à NE
        // salva, não é mais "não salvo" (ver aoFecharModal registrado em
        // abrirFormulario, senão o próprio arquivo recém-salvo seria apagado).
        arquivoNeDriveIdMiniform_ = null;
        arquivoNeUrlMiniform_ = null;
        if (dadosNe.tipo === 'original') {
          resposta.possui_ne = true;
          const idxAtual = ETAPAS_ANDAMENTO.indexOf(resposta.andamento);
          const idxNeEmitida = ETAPAS_ANDAMENTO.indexOf('NE EMITIDA');
          if (idxAtual < idxNeEmitida) resposta.andamento = 'NE EMITIDA';
        }
      }

      if (opcoes.enviarSei) {
        // A SOF é salva primeiro e só então enviada, pra o que vai pro
        // processo ser exatamente o que ficou gravado. montarDocumentoSeiHtml_
        // continua sendo a única fonte do layout da SOF. SeiBridge mostra o
        // próprio toast com o resultado (sucesso, extensão ausente, nenhuma
        // aba do SEI aberta, etc.) - por isso o toast genérico abaixo não fala
        // de SEI nesse caso.
        const sofCompleta = Object.assign({}, sofExistente, resposta, dados);
        const html = montarDocumentoSeiHtml_(sofCompleta);
        await SeiBridge.enviarSof(sofCompleta, html);
        // Não espera terminar (fire-and-forget) - roda em segundo plano
        // enquanto o resto do fluxo de salvarSof segue normal (fechar/reabrir
        // modal). Ver iniciarBuscaAutomaticaNumeroSof_ acima.
        iniciarBuscaAutomaticaNumeroSof_(resposta.id, sofCompleta.sei);
      }

      CacheAbas.invalidar('sof');
      // O "último SOF do tipo" acabou de mudar - ver o change de sofTipoSof.
      Api.invalidarCache('obterTemplateSof');
      if (dadosNe) CacheAbas.invalidar('notasEmpenho');
      UI.toast(
        opcoes.enviarSei ? 'SOF salva.'
          : (dadosNe ? 'SOF e Nota de Empenho salvos com sucesso.' : 'SOF salvo com sucesso.'),
        'sucesso'
      );
      if (sofExistente) {
        UI.fecharModal();
        await carregar();
      } else {
        // Reabre imediatamente em modo edição: só a partir daqui o SOF tem
        // id e a seção de Notas de Empenho (produto final do processo) pode
        // ser usada, sem exigir que o usuário feche e reabra manualmente.
        await carregar();
        await abrirSofExistente(resposta.id);
      }
    } catch (err) {
      erroEl.classList.remove('erro-campo-grande');
      UI.mostrarErro(erroEl, err.message);
    }
  }

  function camposNumeroNeHtml(notas, tipo) {
    if (tipo === 'reforco') {
      const numerosOriginais = Array.from(new Set(notas.filter(n => n.tipo === 'original').map(n => n.numero_ne).filter(Boolean)));
      if (!numerosOriginais.length) return '<p class="ajuda">Nenhuma NE original cadastrada ainda neste SOF — adicione a original primeiro.</p>';
      return `<select id="neNumero">${numerosOriginais.map(num => `<option value="${UI.escaparHtml(num)}">${UI.escaparHtml(num)}</option>`).join('')}</select>`;
    }
    return '<input id="neNumero" />';
  }

  /** Objetos distintos, entre as fontes do SOF, que batem com a fonte escolhida. */
  function opcoesObjetoParaFonte_(sof, fonteValor) {
    if (!fonteValor) return [];
    return Array.from(new Set((sof.fontes || []).filter(f => f.fonte === fonteValor).map(f => f.objeto).filter(Boolean)));
  }

  /** Repopula o <select> de Objeto a partir da Fonte escolhida no mini-formulário de NE. */
  function atualizarSelectObjetoNe_(sof) {
    const objetoEl = document.getElementById('neObjeto');
    if (!objetoEl) return;
    const opcoes = opcoesObjetoParaFonte_(sof, document.getElementById('neFonte').value);
    objetoEl.innerHTML = opcoes.length
      ? opcoes.map(o => `<option value="${UI.escaparHtml(o)}">${UI.escaparHtml(o)}</option>`).join('')
      : '<option value="">Selecione a fonte primeiro</option>';
    objetoEl.disabled = !opcoes.length;
  }

  /**
   * Reforço nunca escolhe fonte/objeto de novo (o backend sempre herda da NE
   * original correspondente) - ao trocar o Tipo pra "Reforço" (ou trocar qual
   * NE está sendo reforçada), Fonte/Objeto ficam travados mostrando os
   * valores da original, só informativos.
   */
  function sincronizarFonteObjetoReforco_(sof, notas) {
    const numeroEl = document.getElementById('neNumero');
    const fonteEl = document.getElementById('neFonte');
    const objetoEl = document.getElementById('neObjeto');
    if (!numeroEl || !fonteEl || !objetoEl) return;
    const original = notas.find(n => n.tipo === 'original' && n.numero_ne === numeroEl.value);
    fonteEl.value = original ? (original.fonte || '') : '';
    atualizarSelectObjetoNe_(sof);
    objetoEl.innerHTML = `<option value="${UI.escaparHtml(original ? original.objeto || '' : '')}">${UI.escaparHtml(original ? original.objeto || '-' : '-')}</option>`;
    fonteEl.disabled = true;
    objetoEl.disabled = true;
  }

  /**
   * Agrupa as linhas tipo='reforco' de UMA Nota de Empenho (mesmo
   * numero_ne) por numero_ne_reforco - um documento de reforço que cobre
   * vários meses vira 1 item só (mesma lógica de agruparReforcosPorNumero_
   * em backend/NotasEmpenho.gs, duplicada aqui por serem módulos/DOMs
   * separados - ver conferirNeReferencia_/mostrarDiagnosticoOcr_ acima pro
   * mesmo padrão já usado neste arquivo). Linhas sem numero_ne_reforco
   * (reforço lançado manualmente, sem o OCR reconhecer o documento) não são
   * agrupadas entre si - cada uma vira seu próprio item, chaveada pelo id.
   */
  function agruparReforcosPorNumeroSof_(linhasReforco) {
    const porChave = {};
    const ordem = [];
    linhasReforco.forEach(l => {
      const chave = l.numero_ne_reforco ? ('n:' + l.numero_ne_reforco) : ('id:' + l.id);
      if (!porChave[chave]) {
        porChave[chave] = { numero_ne_reforco: l.numero_ne_reforco || '', ids: [], meses: [], valor_total: 0, arquivo_url: '' };
        ordem.push(chave);
      }
      const grupo = porChave[chave];
      grupo.ids.push(l.id);
      grupo.valor_total += Number(l.valor) || 0;
      if (!grupo.arquivo_url && l.arquivo_url) grupo.arquivo_url = l.arquivo_url;
      if (l.mes_referencia) grupo.meses.push(Number(l.mes_referencia));
    });
    return ordem.map(chave => {
      const grupo = porChave[chave];
      grupo.meses.sort((a, b) => a - b);
      return grupo;
    });
  }

  /**
   * Monta as linhas da tabela "Notas de Empenho" embutida na edição de SOF
   * (sessão 2026-08-07, pedido do usuário: um documento de reforço que cobre
   * vários meses estava aparecendo "como se fosse mais de um documento" -
   * mesmo bug já corrigido no card da tela de Notas de Empenho em
   * 2026-07-30, ver PROGRESS.md "Tabela Reforços Lançados agrupada por
   * documento" - só não tinha sido replicado aqui ainda). Originais (e
   * reforços manuais sem numero_ne_reforco) continuam 1 linha por linha da
   * planilha; reforços de um mesmo documento (mesmo numero_ne_reforco)
   * viram 1 linha só, com os meses cobertos e o valor total, 1 único link
   * "Ver arquivo" e 1 único botão de excluir (exclui todos os meses juntos).
   */
  function linhasNotasEmpenhoHtml_(notas) {
    if (!notas.length) return '<tr><td colspan="8" class="estado-vazio">Nenhuma NE vinculada ainda.</td></tr>';
    const naoReforco = notas.filter(n => n.tipo !== 'reforco');
    const porNumeroNe = {};
    notas.filter(n => n.tipo === 'reforco').forEach(n => {
      (porNumeroNe[n.numero_ne] = porNumeroNe[n.numero_ne] || []).push(n);
    });

    const linhasOriginais = naoReforco.map(n => `
      <tr data-id="${n.id}">
        <td>${n.tipo}</td><td>${UI.escaparHtml(n.numero_ne || '-')}</td><td>${UI.escaparHtml(n.fonte || '-')}</td>
        <td>${UI.escaparHtml(n.objeto || '-')}</td><td>${UI.formatarMoeda(n.valor)}</td><td>${UI.escaparHtml(n.periodo || '-')}</td>
        <td>${n.arquivo_url ? `<a href="${UI.escaparHtml(n.arquivo_url)}" target="_blank" rel="noopener" class="botao">Ver arquivo</a>` : '-'}</td>
        <td><button type="button" class="botao-icone excluir" data-acao="excluir-ne" data-id="${n.id}" title="Excluir">${ICONE_LIXEIRA}</button></td>
      </tr>`);

    const linhasReforco = Object.keys(porNumeroNe).flatMap(numeroNe => {
      const primeira = porNumeroNe[numeroNe][0];
      return agruparReforcosPorNumeroSof_(porNumeroNe[numeroNe]).map(g => `
        <tr data-ids="${g.ids.join(',')}">
          <td>reforco</td><td>${UI.escaparHtml(numeroNe || '-')}</td><td>${UI.escaparHtml(primeira.fonte || '-')}</td>
          <td>${UI.escaparHtml(primeira.objeto || '-')}</td><td>${UI.formatarMoeda(g.valor_total)}</td>
          <td>${g.meses.length ? g.meses.map(m => NOMES_MESES_ABREV_FONTE_[m - 1]).join('/') : '-'}</td>
          <td>${g.arquivo_url ? `<a href="${UI.escaparHtml(g.arquivo_url)}" target="_blank" rel="noopener" class="botao">Ver arquivo</a>` : '-'}</td>
          <td><button type="button" class="botao-icone excluir" data-acao="excluir-ne-lote" data-ids="${g.ids.join(',')}" title="Excluir este reforço (todos os meses deste documento)">${ICONE_LIXEIRA}</button></td>
        </tr>`);
    });

    return linhasOriginais.concat(linhasReforco).join('') || '<tr><td colspan="8" class="estado-vazio">Nenhuma NE vinculada ainda.</td></tr>';
  }

  async function renderNotasEmpenho(sof, notasPromise) {
    const notas = await (notasPromise || Api.chamar('listarNotasEmpenhoPorSof', { sofId: sof.id }));
    const total = notas.reduce((s, n) => s + Number(n.valor || 0), 0);
    const opcoesFonte = Array.from(new Set((sof.fontes || []).map(f => f.fonte).filter(Boolean)));
    const fontesDisponiveis = opcoesFonte.length ? opcoesFonte : OPCOES_FONTE;
    itensReforcoMiniform_ = null;
    numeroNeReforcoMiniform_ = null;
    // A seção inteira vai ser reconstruída (alvo.innerHTML abaixo) - qualquer
    // anexo já lido/enviado ao Drive nesta versão anterior do mini-formulário
    // fica órfão se não descartado agora (sessão 2026-08-12).
    descartarArquivoNeNaoSalvo_();
    const alvo = document.getElementById('secaoNotasEmpenho');
    // Resposta atrasada de um modal que já foi fechado/trocado: sem esta
    // guarda o script inteiro morria com "Cannot set properties of null"
    // (visto no console do usuário, sessão 2026-09-16, quando a chamada
    // demorou ~20s por cold start do Apps Script e ele já tinha saído da tela).
    if (!alvo) return;
    alvo.innerHTML = `
      <h4 style="margin:0 0 8px">Notas de Empenho (total: ${UI.formatarMoeda(total)})</h4>
      <table class="tabela">
        <thead><tr><th>Tipo</th><th>Número</th><th>Fonte</th><th>Objeto</th><th>Valor Atendido</th><th>Período</th><th>Arquivo</th><th></th></tr></thead>
        <tbody>${linhasNotasEmpenhoHtml_(notas)}</tbody>
      </table>
      <p class="ajuda">Preencha abaixo pra anexar uma nova Nota de Empenho a este SOF - ela só é salva quando você clicar em "Salvar" (rodapé desta tela). Deixe em branco se não quiser adicionar nenhuma agora. Em Reforço, anexe o documento primeiro - os meses reforçados e os valores são identificados automaticamente.</p>
      <div class="grade-3">
        <div class="campo"><label>Tipo</label><select id="neTipo"><option value="original">Original</option><option value="reforco">Reforço</option></select></div>
        <div class="campo"><label>Número</label><div id="neNumeroContainer">${camposNumeroNeHtml(notas, 'original')}</div></div>
        <div class="campo"><label>Fonte</label><select id="neFonte"><option value="">-</option>${fontesDisponiveis.map(f => `<option>${UI.escaparHtml(f)}</option>`).join('')}</select></div>
      </div>
      <div class="grade-3" id="neCamposManuais">
        <div class="campo"><label>Objeto</label><select id="neObjeto"><option value="">Selecione a fonte primeiro</option></select></div>
        <div class="campo"><label>Valor Atendido (empenho)</label><input id="neValor" type="text" inputmode="decimal" class="campo-moeda" /></div>
      </div>
      <div id="neMesesDetectados" class="oculto"></div>
      <p id="neAvisoReferencia" class="aviso-divergencia oculto"></p>
      <div class="campo"><label>Arquivo da Nota de Empenho</label><input type="file" id="neArquivo" accept=".pdf,image/*" /></div>
      <details class="ocr-diagnostico oculto" id="neDiagnostico">
        <summary>Ver texto lido do documento (diagnóstico)</summary>
        <pre></pre>
      </details>`;

    document.getElementById('neFonte').addEventListener('change', () => atualizarSelectObjetoNe_(sof));
    document.getElementById('neTipo').addEventListener('change', function () {
      // Trocar o Tipo invalida qualquer anexo/leitura de OCR já feita (o
      // reforço detectado por mês não faz sentido pra uma original, e
      // vice-versa) - limpa o arquivo e o estado antes de reconstruir os campos.
      document.getElementById('neArquivo').value = '';
      itensReforcoMiniform_ = null;
      numeroNeReforcoMiniform_ = null;
      descartarArquivoNeNaoSalvo_();
      const alvoMeses = document.getElementById('neMesesDetectados');
      alvoMeses.classList.add('oculto');
      alvoMeses.innerHTML = '';
      conferirNeReferencia_(null, null);
      mostrarDiagnosticoOcr_(null);
      const statusAnexo = document.querySelector('.anexo-ocr-status');
      if (statusAnexo) statusAnexo.classList.add('oculto');
      document.getElementById('neValor').readOnly = false;
      document.getElementById('neValor').value = '';

      document.getElementById('neNumeroContainer').innerHTML = camposNumeroNeHtml(notas, this.value);
      UI.tornarPesquisavel('neNumero');
      const fonteEl = document.getElementById('neFonte');
      if (this.value === 'reforco') {
        sincronizarFonteObjetoReforco_(sof, notas);
        document.getElementById('neNumero').addEventListener('change', () => sincronizarFonteObjetoReforco_(sof, notas));
      } else {
        fonteEl.disabled = false;
        fonteEl.value = '';
        atualizarSelectObjetoNe_(sof);
      }
    });
    UI.tornarPesquisavel('neNumero');
    ligarOcrMiniFormularioNe_(sof);

    // Excluir uma NE já anexada (mãe ou reforço) direto desta tabela -
    // sessão 2026-07-29, pedido do usuário. Ação imediata (não espera o
    // "Salvar" da SOF), mesmo padrão de excluir SOF/Recibo.
    alvo.querySelectorAll('[data-acao="excluir-ne"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const linha = btn.closest('tr');
        const tipo = linha ? linha.children[0].textContent : '';
        const rotulo = tipo === 'original' ? 'a Nota de Empenho ORIGINAL (mãe)' : 'este reforço';
        if (!confirm(`Excluir ${rotulo}? A exclusão pode ser revertida apenas por um administrador diretamente na planilha.`)) return;
        try {
          await Api.chamar('excluirNotaEmpenho', { id: btn.dataset.id });
          CacheAbas.invalidar('sof');
          CacheAbas.invalidar('notasEmpenho');
          UI.toast('Nota de Empenho excluída.', 'sucesso');
          await renderNotasEmpenho(sof, undefined);
        } catch (err) {
          UI.toast(err.message, 'erro');
        }
      });
    });
    // Reforço agrupado por documento (ver linhasNotasEmpenhoHtml_) - exclui
    // todos os meses daquele documento de uma vez, mesmo endpoint em lote já
    // usado pelo card da tela de Notas de Empenho (excluirReforcoClique_ em
    // js/notas-empenho.js).
    alvo.querySelectorAll('[data-acao="excluir-ne-lote"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ids = btn.dataset.ids.split(',');
        const mensagem = ids.length > 1
          ? `Excluir este reforço (todos os ${ids.length} meses deste documento)? A exclusão pode ser revertida apenas por um administrador diretamente na planilha.`
          : 'Excluir este reforço? A exclusão pode ser revertida apenas por um administrador diretamente na planilha.';
        if (!confirm(mensagem)) return;
        try {
          await Api.chamar('excluirNotasEmpenhoEmLote', { ids });
          CacheAbas.invalidar('sof');
          CacheAbas.invalidar('notasEmpenho');
          UI.toast('Reforço excluído.', 'sucesso');
          await renderNotasEmpenho(sof, undefined);
        } catch (err) {
          UI.toast(err.message, 'erro');
        }
      });
    });
  }

  /**
   * Confere o "Nº DA N.E. DE REFERÊNCIA:" lido do documento de reforço
   * contra a NE que o analista está de fato reforçando (sessão 2026-07-30,
   * pedido do usuário) - não bloqueia (o OCR pode errar a leitura de um
   * campo secundário), só avisa bem visível. Mesma lógica de
   * conferirNeReferencia_ em js/notas-empenho.js, duplicada aqui por serem
   * módulos/DOMs separados.
   */
  function conferirNeReferencia_(numeroLido, numeroAlvo) {
    const el = document.getElementById('neAvisoReferencia');
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
   * Mostra (num <details> recolhido) o texto bruto que o OCR leu do
   * documento (sessão 2026-07-30) - diagnóstico pra quando um campo não é
   * identificado corretamente. Mesma lógica de mostrarDiagnosticoOcr_ em
   * js/notas-empenho.js, duplicada aqui por serem módulos/DOMs separados.
   */
  function mostrarDiagnosticoOcr_(texto) {
    const el = document.getElementById('neDiagnostico');
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
   * Apaga em segundo plano (sessão 2026-08-12) o arquivo que uma leitura por
   * OCR do mini-formulário já subiu definitivamente pro Drive mas que acabou
   * não sendo salvo - trocar de anexo, "Remover anexo", trocar o Tipo, ou
   * fechar o formulário de SOF sem salvar. Mesma lógica de
   * descartarArquivoNaoSalvo_ em js/notas-empenho.js, duplicada aqui por
   * serem módulos/DOMs separados. Sempre zera as duas variáveis - chamar de
   * novo depois (nada pendente) é seguro e não faz nada.
   */
  function descartarArquivoNeNaoSalvo_() {
    if (arquivoNeDriveIdMiniform_) {
      Api.chamar('descartarArquivoNaoSalvoNotaEmpenho', { arquivoId: arquivoNeDriveIdMiniform_ }, { silencioso: true }).catch(() => {});
    }
    arquivoNeDriveIdMiniform_ = null;
    arquivoNeUrlMiniform_ = null;
  }

  /**
   * Ao anexar o arquivo no mini-formulário de NE (dentro da edição de SOF),
   * lê o documento por OCR:
   * - Original: preenche Número, Fonte (classificada do código orçamentário)
   *   e Valor Empenhado, travando os campos - mesmo padrão de
   *   ligarAnexoComOcr_ em js/recibos.js.
   * - Reforço (sessão 2026-07-29): detecta sozinho quais meses foram
   *   reforçados e o valor de cada um (via o mesmo "Cronograma de
   *   Desembolso" que a original usa) - sem o analista digitar nada; Fonte/
   *   Objeto continuam vindo travados da NE original (sincronizarFonteObjetoReforco_).
   * Link "Remover anexo" sempre disponível pra refazer/preencher manualmente.
   */
  function ligarOcrMiniFormularioNe_(sof) {
    const inputEl = document.getElementById('neArquivo');
    const statusEl = document.createElement('p');
    statusEl.className = 'ajuda anexo-ocr-status oculto';
    inputEl.insertAdjacentElement('afterend', statusEl);

    function travarReforco_(resultado) {
      const valorEl = document.getElementById('neValor');
      const alvoMeses = document.getElementById('neMesesDetectados');
      const mesesComValor = (resultado.cronograma || []).filter(c => Number(c.valor) > 0);
      conferirNeReferencia_(resultado.numero_ne_referencia, document.getElementById('neNumero').value);
      // Número PRÓPRIO do documento de reforço (sessão 2026-07-30) - vai junto
      // no criarReforcosEmLote/criarNotaEmpenho, pra agrupar os meses desse
      // documento como "um reforço só" na tela de Notas de Empenho.
      numeroNeReforcoMiniform_ = resultado.numero_ne || null;

      if (mesesComValor.length) {
        itensReforcoMiniform_ = mesesComValor.map(c => ({ mes_referencia: c.mes, valor: c.valor }));
        const totalDetectado = itensReforcoMiniform_.reduce((s, it) => s + it.valor, 0);
        alvoMeses.classList.remove('oculto');
        alvoMeses.innerHTML = `<label>Meses reforçados (lidos do documento)</label>
          <div class="cronograma-ne-grade">${itensReforcoMiniform_.map(it => `<div class="cronograma-ne-item"><span>${NOMES_MESES_ABREV_FONTE_[it.mes_referencia - 1]}</span><span>${UI.formatarMoeda(it.valor)}</span></div>`).join('')}</div>`;
        valorEl.value = totalDetectado;
        valorEl.readOnly = true;
        statusEl.innerHTML = `🔒 ${itensReforcoMiniform_.length} mês(es) identificado(s) automaticamente, total ${UI.formatarMoeda(totalDetectado)}.`;
      } else {
        itensReforcoMiniform_ = null;
        alvoMeses.classList.add('oculto');
        alvoMeses.innerHTML = '';
        if (resultado.preco_total) {
          valorEl.value = resultado.preco_total;
          valorEl.readOnly = true;
          statusEl.innerHTML = `🔒 Valor lido do documento (${UI.formatarMoeda(resultado.preco_total)}) - mês não identificado no documento.`;
        } else {
          statusEl.innerHTML = 'Não foi possível ler o valor do documento - preencha manualmente.';
        }
      }
      statusEl.classList.remove('oculto');
      statusEl.innerHTML += ' <a href="#" class="anexo-ocr-remover">Remover anexo</a>';
      statusEl.querySelector('.anexo-ocr-remover').addEventListener('click', e => {
        e.preventDefault();
        descartarArquivoNeNaoSalvo_();
        itensReforcoMiniform_ = null;
        numeroNeReforcoMiniform_ = null;
        alvoMeses.classList.add('oculto');
        alvoMeses.innerHTML = '';
        conferirNeReferencia_(null, null);
        mostrarDiagnosticoOcr_(null);
        valorEl.readOnly = false;
        valorEl.value = '';
        inputEl.value = '';
        statusEl.classList.add('oculto');
      });
    }

    function travarOriginal_(resultado) {
      const numeroEl = document.getElementById('neNumero');
      if (numeroEl) {
        numeroEl.value = resultado.numero_ne;
        numeroEl.readOnly = true;
      }
      const fonteEl = document.getElementById('neFonte');
      const objetoEl = document.getElementById('neObjeto');
      const fonteEncontrada = resultado.fonte && Array.from(fonteEl.options).some(o => o.value === resultado.fonte);
      // Objeto: só trava sozinho quando a fonte lida tem UM único objeto
      // cadastrado no SOF - com mais de um, o analista escolhe manualmente
      // (não dá pra adivinhar qual dos dois o documento é).
      let objetoTravado = false;
      if (fonteEncontrada) {
        fonteEl.value = resultado.fonte;
        fonteEl.disabled = true;
        atualizarSelectObjetoNe_(sof);
        const opcoesObjeto = opcoesObjetoParaFonte_(sof, resultado.fonte);
        if (opcoesObjeto.length === 1) {
          objetoEl.value = opcoesObjeto[0];
          objetoEl.disabled = true;
          objetoTravado = true;
        }
      }
      document.getElementById('neValor').value = resultado.preco_total;
      document.getElementById('neValor').readOnly = true;

      statusEl.classList.remove('oculto');
      statusEl.innerHTML = (fonteEncontrada
        ? '🔒 Número/Fonte/Valor lidos do documento.' + (objetoTravado ? '' : ' Selecione o Objeto.')
        : '🔒 Número/Valor lidos do documento (Fonte não identificada - selecione manualmente).')
        + ' <a href="#" class="anexo-ocr-remover">Remover anexo</a>';
      statusEl.querySelector('.anexo-ocr-remover').addEventListener('click', e => {
        e.preventDefault();
        descartarArquivoNeNaoSalvo_();
        if (numeroEl) {
          numeroEl.readOnly = false;
          numeroEl.value = '';
        }
        fonteEl.disabled = false;
        if (fonteEncontrada) fonteEl.value = '';
        atualizarSelectObjetoNe_(sof);
        objetoEl.disabled = false;
        document.getElementById('neValor').readOnly = false;
        document.getElementById('neValor').value = '';
        mostrarDiagnosticoOcr_(null);
        inputEl.value = '';
        statusEl.classList.add('oculto');
      });
    }

    function travar(resultado) {
      // arquivo_drive_id/arquivo_url (sessão 2026-08-12): a leitura já subiu
      // o arquivo definitivamente pro Drive - lerMiniFormularioNe_ reaproveita
      // em vez de reler/reenviar o mesmo arquivo no "Salvar" (ver lá).
      arquivoNeDriveIdMiniform_ = resultado.arquivo_drive_id || null;
      arquivoNeUrlMiniform_ = resultado.arquivo_url || null;
      mostrarDiagnosticoOcr_(resultado.texto_ocr_debug);
      if (document.getElementById('neTipo').value === 'reforco') travarReforco_(resultado);
      else travarOriginal_(resultado);
    }

    inputEl.addEventListener('change', async function () {
      const arquivo = inputEl.files[0];
      if (!arquivo) return;
      // Trocar de arquivo sem clicar "Remover anexo" primeiro abandona
      // qualquer upload já feito por uma leitura anterior (sessão 2026-08-12).
      descartarArquivoNeNaoSalvo_();
      try {
        if (arquivo.size > 8 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 8MB).');
        const base64 = await UI.lerArquivoBase64(arquivo);
        const resultado = await Api.chamar('lerAnexoNotaEmpenho', { arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type });
        travar(resultado);
      } catch (err) {
        inputEl.value = '';
        mostrarDiagnosticoOcr_(err.dados && err.dados.texto_ocr_debug);
        UI.toast(err.message, 'erro');
      }
    });
  }

  /**
   * Monta o HTML do stepper de Andamento (13 etapas fixas), embutido direto
   * no card da listagem (Funcionalidade 3) - não existe mais dentro do modal
   * de edição. Navegação é livre (qualquer nó, pra frente ou pra trás) — a
   * única trava é o nó "NE EMITIDA", que só fica clicável depois que o SOF
   * tiver uma Nota de Empenho anexada.
   */
  function stepperHtml(sof) {
    const atual = sof && sof.andamento ? ETAPAS_ANDAMENTO.indexOf(sof.andamento) : -1;
    return `<div class="stepper">${ETAPAS_ANDAMENTO.map((etapa, i) => {
      const estado = i < atual ? 'concluido' : (i === atual ? 'atual' : 'futuro');
      const bloqueado = etapa === 'NE EMITIDA' && !sof.possui_ne;
      return `<div class="stepper-no ${estado}">
        <button type="button" class="stepper-marcador" data-etapa="${UI.escaparHtml(etapa)}" ${bloqueado ? 'disabled' : ''} title="${bloqueado ? 'Anexe a Nota de Empenho para liberar esta etapa' : ''}">${i <= atual ? '✓' : (i + 1)}</button>
        <span class="stepper-rotulo">${UI.escaparHtml(etapa)}</span>
      </div>`;
    }).join('')}</div>`;
  }

  /**
   * Destaque vermelho ao vivo dos campos obrigatórios ainda vazios (sessão
   * 2026-08-14, pedido do usuário) - complementa o amarelo de
   * aplicarTemplateSof_ (campo repetido do modelo). Só ida: nunca troca o que
   * o usuário já escolheu, só espelha o "vazio/preenchido" de cada campo em
   * CAMPOS_OBRIGATORIOS na classe .campo-obrigatorio-vazio (CSS em
   * style.css). Idempotente e barato (26 campos) - chamado toda vez que algo
   * muda no formulário (delegado em #formSof, ver abrirFormulario) e também
   * na mão depois de aplicarTemplateSof_ (que preenche campos por atribuição
   * direta a .value, sem disparar input/change - o listener delegado não veria).
   */
  /**
   * O elemento que o usuário REALMENTE VÊ pra um campo obrigatório - pode ser
   * o próprio <input>/<select>/<textarea>/editor, ou o <input> proxy que
   * UI.tornarPesquisavel (sofUnidade/sofOss/sofObjeto) desenha por cima de um
   * <select> escondido (display:none). Usado tanto pelo destaque estático
   * (aplicarDestaqueObrigatorios_) quanto pelo piscar+scroll de
   * destacarCamposFaltando_ - achado real (sessão 2026-08-14): aplicar a
   * classe vermelha no <select> escondido nunca aparecia na tela, porque
   * quem o usuário vê é o proxy.
   */
  function elementoVisivelCampo_(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    if (el.tagName === 'SELECT' && el.nextElementSibling && el.nextElementSibling.classList.contains('select-pesquisavel')) {
      const proxy = el.nextElementSibling.querySelector('.select-pesquisavel-input');
      if (proxy) return proxy;
    }
    return el;
  }

  function aplicarDestaqueObrigatorios_() {
    CAMPOS_OBRIGATORIOS.forEach(campo => {
      const el = document.getElementById(campo.id);
      if (!el) return;
      const valor = (el.value !== undefined ? el.value : (el.textContent || '')).trim();
      const vazio = !valor;
      el.classList.toggle('campo-obrigatorio-vazio', vazio);
      const proxy = elementoVisivelCampo_(campo.id);
      if (proxy && proxy !== el) proxy.classList.toggle('campo-obrigatorio-vazio', vazio);
    });
  }

  /**
   * Devolve TODOS os campos obrigatórios ainda vazios (não só o 1º - sessão
   * 2026-09-04, pedido do usuário: "a informação de quais campos faltam"),
   * junto com uma mensagem já pronta listando os rótulos. `ids` é usado por
   * mostrarErroObrigatoriosSof_ pra rolar a tela até o 1º campo e piscar
   * todos em vermelho.
   */
  function validarCamposObrigatorios() {
    const faltando = CAMPOS_OBRIGATORIOS.filter(campo => {
      const el = document.getElementById(campo.id);
      // Objeto da despesa é um editor contenteditable (não tem .value) - usa textContent.
      const valor = (el.value !== undefined ? el.value : (el.textContent || '')).trim();
      return !valor;
    });
    if (faltando.length) {
      return {
        mensagem: 'Preencha os campos obrigatórios: ' + faltando.map(c => c.rotulo).join(', ') + '.',
        ids: faltando.map(c => c.id)
      };
    }
    const fontes = lerLinhasFontesDoDom_();
    if (!fontes.length) return { mensagem: 'Informe ao menos uma fonte.', ids: [], seletorExtra: '#sofFontesContainer' };
    for (const linha of fontes) {
      if (!String(linha.fonte || '').trim() || !String(linha.parcela_mensal || '').trim()) {
        return { mensagem: 'Preencha fonte e parcela mensal em todas as linhas de fonte.', ids: [], seletorExtra: '#sofFontesContainer' };
      }
      const soma = linha.cronograma.reduce((s, c) => s + (Number(c.valor) || 0), 0);
      if (soma <= 0) return { mensagem: 'Preencha ao menos um mês com valor maior que zero em cada linha de fonte.', ids: [], seletorExtra: '#sofFontesContainer' };
    }
    return null;
  }

  /**
   * Mostra a falta de campos obrigatórios com destaque de verdade (sessão
   * 2026-09-04, pedido do usuário): mensagem MAIOR (.erro-campo-grande, CSS
   * em style.css - maior/mais chamativa que o .erro-campo padrão dos outros
   * formulários), rola o modal até o 1º campo faltando, e pisca em vermelho
   * TODOS os campos faltando por alguns segundos (.piscar-campo) - a
   * marcação vermelha ESTÁTICA (.campo-obrigatorio-vazio,
   * aplicarDestaqueObrigatorios_) continua depois disso, só o piscar some.
   */
  function mostrarErroObrigatoriosSof_(erroEl, resultado) {
    erroEl.classList.add('erro-campo-grande');
    UI.mostrarErro(erroEl, resultado.mensagem);

    const alvo = (resultado.ids || [])
      .map(elementoVisivelCampo_)
      .filter(Boolean)
      .concat(resultado.seletorExtra ? [document.querySelector(resultado.seletorExtra)].filter(Boolean) : []);
    if (!alvo.length) return;

    alvo[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    alvo.forEach(el => {
      el.classList.remove('piscar-campo');
      void el.offsetWidth; // força reflow, pra reiniciar a animação mesmo se já tinha piscado antes
      el.classList.add('piscar-campo');
      setTimeout(() => el.classList.remove('piscar-campo'), 2200);
    });
  }

  // ===================== Documento SEI =====================
  // Documento "Solicitação Orçamentária e Financeira" (modelo SEI/GOVPE) - os
  // campos vivem no formulário único de SOF (abrirFormulario, acima; até uma
  // sessão anterior isso era um modal separado, só disponível editando -
  // ver PROGRESS.md, sessão de fusão do formulário na criação). Os campos
  // ficam salvos no próprio SOF (via criarSof/atualizarSof) e o documento é
  // gerado como HTML autocontido (sem o timbre nem o rodapé de endereço da
  // Secretaria, por pedido do usuário) na hora de "Salvar e enviar ao SEI"
  // (botão "Salvar e gerar documento SEI" existiu até 2026-08-14 - removido
  // por não ter mais utilidade, pedido do usuário).

  const OPCOES_SEI_SOLICITACAO = [
    'CLASSIFICAÇÃO DA DESPESA',
    'DECLARAÇÃO DE DISPONIBILIDADE ORÇAMENTÁRIA',
    'DOTAÇÃO ORÇAMENTÁRIA E PROGRAMAÇÃO FINANCEIRA PARA EMPENHO'
  ];
  const OPCOES_SEI_PLEITO = [
    'Licitação', 'Adesão à ARP', 'Reajuste', 'TAC',
    'Dispensa de Licitação', 'Consumo de ARP', 'Acréscimo Contratual', 'Contratação Direta',
    'Inexigibilidade', 'Edital de Credenciamento', 'Emenda Parlamentar Estadual', 'Reequilíbrio Econômico Financeiro',
    'Formação de ARP', 'Adesão a Credenciamento'
  ];
  const NOMES_MESES_SEI_ = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const OBSERVACOES_SEI_ = [
    'Para as Diárias/Capacitação acrescentar: período do evento, localização do evento, número de participantes e carga horária;',
    'Para as solicitações da Despesa de Exercícios Anteriores (DEA): deverão vir com o DH e competência;',
    'Para os Contratos: informar o credor, período, número do contrato CEO, valor do contrato anual e mensal, cópia do contrato e último termo aditivo se houver;',
    'Para as solicitações de Auxílio Funeral e dias deixados de receber acrescentar: cópias da certidão de óbito do ex-servidor(a), documentação do requerente, bem como o despacho do jurídico com o deferimento. Informar o nome do requerente, CPF, nome do ex-servidor, matrícula, data do óbito, cargo/função;',
    'Para as solicitações de Medicamentos: informar credor, item do e-Fisco, quantidade, valor unitário, período de abastecimento com a compra, vencimento da ata, número e data da emissão da Nota Fiscal (nos casos de pagamento de NF). Para os medicamentos oriundos de ação judicial, informar o número do processo;',
    'Para as solicitações de Plantão Extra: informar a unidade, competência a que se refere o plantão, bem como especificar o valor de pessoa física e obrigação patronal.'
  ];
  let linhasManutencaoSei_ = [];

  function hojeIso_() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function parseManutencaoSei_(jsonTexto) {
    try {
      const arr = JSON.parse(jsonTexto || '[]');
      return Array.isArray(arr) && arr.length ? arr : [{ codigo: '', elemento: '', valor: '' }];
    } catch (e) {
      return [{ codigo: '', elemento: '', valor: '' }];
    }
  }

  function lerLinhasManutencaoSeiDoDom_() {
    return Array.from(document.querySelectorAll('#seiManutencaoContainer .linha-fonte')).map(linha => ({
      codigo: linha.querySelector('.linha-manutencao-codigo').value.trim(),
      elemento: linha.querySelector('.linha-manutencao-elemento').value.trim(),
      valor: UI.parseValorBr(linha.querySelector('.linha-manutencao-valor').value)
    }));
  }

  function linhaManutencaoSeiHtml_(item, indice) {
    return `
      <div class="linha-fonte" data-indice="${indice}">
        <div class="campo"><label>Código</label><input class="linha-manutencao-codigo" value="${UI.escaparHtml(item.codigo || '')}" /></div>
        <div class="campo"><label>Elemento</label><input class="linha-manutencao-elemento" value="${UI.escaparHtml(item.elemento || '')}" /></div>
        <div class="campo"><label>Valor</label><input class="linha-manutencao-valor campo-moeda" type="text" inputmode="decimal" value="${item.valor || ''}" /></div>
        <button type="button" class="botao-icone linha-fonte-remover linha-manutencao-remover" title="Remover linha">&times;</button>
      </div>`;
  }

  function renderManutencaoSeiFormulario_() {
    const alvo = document.getElementById('seiManutencaoContainer');
    if (!alvo) return;
    alvo.innerHTML = linhasManutencaoSei_.map((item, i) => linhaManutencaoSeiHtml_(item, i)).join('');
    alvo.querySelectorAll('.linha-manutencao-remover').forEach(btn => {
      btn.addEventListener('click', () => {
        linhasManutencaoSei_ = lerLinhasManutencaoSeiDoDom_();
        const indice = Number(btn.closest('.linha-fonte').dataset.indice);
        linhasManutencaoSei_.splice(indice, 1);
        if (!linhasManutencaoSei_.length) linhasManutencaoSei_.push({ codigo: '', elemento: '', valor: '' });
        renderManutencaoSeiFormulario_();
      });
    });
  }

  /** Divide um array em grupos de N (usado só pra montar a tabela de "Assinalar o pleito" no documento gerado, 4 colunas por linha). */
  function agruparEm_(lista, tamanho) {
    const grupos = [];
    for (let i = 0; i < lista.length; i += tamanho) grupos.push(lista.slice(i, i + tamanho));
    return grupos;
  }

  /**
   * Monta o HTML autocontido do documento "Criar SOF - SEI" - `sof` aqui já
   * deve vir mesclado com os dados recém-salvos (ver salvarSof, opção enviarSei).
   * Não reproduz a marcação bagunçada de spans aninhados do export original do
   * SEI - usa HTML/CSS limpo com o mesmo layout visual, sem o timbre (imagem)
   * nem o rodapé de endereço da Secretaria (pedido explícito do usuário).
   */
  function montarDocumentoSeiHtml_(sof) {
    const nl2br_ = texto => UI.escaparHtml(texto || '').replace(/\n/g, '<br>');
    const marcado_ = (valorAtual, opcao) => valorAtual === opcao ? 'X' : '&nbsp;';
    // Soma direto do cronograma, em vez de usar f.total_solicitado (sessão
    // 2026-08-13, achado do usuário: coluna Total saindo zerada). Esse campo
    // só existe de verdade na resposta do backend - o formulário nunca lê/
    // escreve nele (é só um <strong> calculado na tela, ver
    // atualizarTotalLinhaFonte_) - e em salvarSof o sofCompleta é montado com
    // `Object.assign({}, sofExistente, resposta, dados)`, onde dados.fontes
    // (lido do DOM, sem total_solicitado) SOBRESCREVE resposta.fontes (que
    // tinha o valor certo). Calcular aqui evita depender dessa ordem de
    // merge - e é literalmente a mesma conta que o formulário já faz.
    const totalPorCronograma_ = f => (f.cronograma || []).reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const fontes = sof.fontes || [];
    const totalFontes = fontes.reduce((s, f) => s + totalPorCronograma_(f), 0);
    const linhasManutencao = parseManutencaoSei_(sof.sei_manutencao_linhas).filter(l => l.codigo || l.elemento || l.valor);
    const totalManutencao = linhasManutencao.reduce((s, l) => s + (Number(l.valor) || 0), 0);

    const solicitacaoHtml = OPCOES_SEI_SOLICITACAO.map(op =>
      `<p>( ${marcado_(sof.sei_tipo_solicitacao, op)} ) ${UI.escaparHtml(op)}</p>`).join('');

    const pleitoHtml = agruparEm_(OPCOES_SEI_PLEITO, 4).map(linha =>
      `<tr>${linha.map(op => `<td>( ${marcado_(sof.sei_tipo_pleito, op)} ) ${UI.escaparHtml(op)}</td>`).join('')}</tr>`).join('');

    const fontesHtml = fontes.length
      ? fontes.map(f => {
          const porMes = {};
          (f.cronograma || []).forEach(c => { porMes[c.mes] = c.valor; });
          const celulasMeses = Array.from({ length: 12 }, (_, i) => `<td>${porMes[i + 1] ? UI.formatarMoeda(porMes[i + 1]) : ''}</td>`).join('');
          return `<tr><td>${UI.escaparHtml(f.codigo_poas || '')}</td><td>${UI.escaparHtml(f.fonte || '')}</td>${celulasMeses}<td>${UI.formatarMoeda(totalPorCronograma_(f))}</td></tr>`;
        }).join('')
      : `<tr><td colspan="15" style="text-align:center">Nenhuma fonte cadastrada no SOF.</td></tr>`;

    const manutencaoHtml = linhasManutencao.length
      ? linhasManutencao.map(l => `<tr><td>${UI.escaparHtml(l.codigo || '')}</td><td>${UI.escaparHtml(l.elemento || '')}</td><td>${UI.formatarMoeda(l.valor)}</td></tr>`).join('')
        + `<tr><td></td><td><strong>TOTAL</strong></td><td><strong>${UI.formatarMoeda(totalManutencao)}</strong></td></tr>`
      : '';

    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="utf-8" />
<title>${UI.escaparHtml(sof.sof_numero || sof.id)} - Solicitação Orçamentária e Financeira</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #000; max-width: 900px; margin: 24px auto; padding: 0 16px; }
  p { margin: 6pt 0; text-align: justify; }
  h2 { text-align: left; font-size: 13pt; }
  table.sei-tabela { border-collapse: collapse; width: 100%; margin: 8px 0; }
  table.sei-tabela td, table.sei-tabela th { border: 1px solid #000; padding: 4px 8px; font-size: 10.5pt; vertical-align: top; }
  table.sei-tabela th { text-align: center; }
  .sei-direita { text-align: right; }
  .sei-assinatura-ne { background: #f1c40f; }
  .sei-assinatura-nl { background: #e6a19b; }
</style>
</head>
<body>
  <h2>SOF ${UI.escaparHtml(sof.sof_numero || '')} - SES – Secretaria de Saúde - Solicitação Orçamentária e Financeira</h2>
  <p>Prezado(a), Solicito:</p>
  ${solicitacaoHtml}

  <p>Em caso de envio à CPF/SAD, assinalar o pleito:</p>
  <table class="sei-tabela"><tbody>${pleitoHtml}</tbody></table>

  <p>Justificativa do pleito para a CPF/SAD:</p>
  <p>${nl2br_(sof.sei_justificativa_pleito)}</p>

  <p>Área/setor solicitante: ${UI.escaparHtml(sof.sei_area_setor_solicitante || '')}</p>
  <p>Tema POAS: ${UI.escaparHtml(sof.sei_tema_poas || '')}</p>
  <p>Objeto da despesa: ${objetoDespesaParaHtml_(sof.sei_objeto_despesa)}</p>

  <p>Destinação (Hospital, Geres, etc...): ${UI.escaparHtml(sof.sei_destinacao || '')}</p>
  <p>Credor: ${UI.escaparHtml(sof.sei_credor || '')}</p>
  <p>CPF/CNPJ: ${UI.escaparHtml(sof.sei_credor_cnpj || '')}</p>
  <p>Ação: ${UI.escaparHtml(sof.sei_acao || '')}</p>
  <p>Subação: ${UI.escaparHtml(sof.sei_subacao || '')}</p>
  <p>Grupo de despesa: ${UI.escaparHtml(sof.sei_grupo_despesa || '')}</p>
  <p>Contrato CEO: ${UI.escaparHtml(sof.ceo || '')}</p>

  <p>Valor total com cronograma de desembolso (mensal):</p>
  <table class="sei-tabela">
    <thead><tr><th>Código POAS</th><th>Fonte</th>${NOMES_MESES_SEI_.map(m => `<th>${m.substring(0, 3).toUpperCase()}</th>`).join('')}<th>Total</th></tr></thead>
    <tbody>${fontesHtml}</tbody>
    <tfoot><tr><td colspan="14" style="text-align:right"><strong>TOTAL</strong></td><td><strong>${UI.formatarMoeda(totalFontes)}</strong></td></tr></tfoot>
  </table>

  <p>Medida compensatória POAS (caso seja necessário):</p>
  <p>${nl2br_(sof.sei_medida_compensatoria_poas)}</p>

  <p>Para os casos de MANUTENÇÃO DE GERES, HOSPITAIS REGIONAIS e SUPRIMENTO INDIVIDUAL:</p>
  ${manutencaoHtml ? `<table class="sei-tabela"><thead><tr><th>Código</th><th>Elemento</th><th>Valor</th></tr></thead><tbody>${manutencaoHtml}</tbody></table>` : '<p class="ajuda">-</p>'}

  <p>Para os casos de DESPESAS SUS/PORTARIA OU CONVÊNIO/RECURSOS PRÓPRIOS:</p>
  <p>Nº do Convênio ou Portaria: ${UI.escaparHtml(sof.sei_convenio_numero || '')}</p>
  <p>Nº do E-fisco: ${UI.escaparHtml(sof.sei_convenio_efisco || '')}</p>
  <p>Nº da Conta: ${UI.escaparHtml(sof.sei_convenio_conta || '')}</p>
  <p>Banco: ${UI.escaparHtml(sof.sei_convenio_banco || '')}</p>
  <p>Contrapartida do Convênio Nº: ${UI.escaparHtml(sof.sei_contrapartida_convenio || '')}</p>
  <p>Nº da Conta: ${UI.escaparHtml(sof.sei_contrapartida_conta || '')}</p>
  <p>Banco: ${UI.escaparHtml(sof.sei_contrapartida_banco || '')}</p>

  <p>Para os casos de LICITAÇÕES:</p>
  <p>Número do Contrato: ${UI.escaparHtml(sof.contrato || '')}</p>

  <p>Observações:</p>
  ${OBSERVACOES_SEI_.map(o => {
    // Sublinha só o rótulo (até os dois-pontos), igual ao modelo do SEI -
    // ver montarDocumentoSeiHtml_ acima. Strings fixas do código, não
    // precisam escapar.
    const fimRotulo = o.indexOf(':');
    return fimRotulo === -1 ? `<p>${o}</p>` : `<p><u>${o.slice(0, fimRotulo + 1)}</u>${o.slice(fimRotulo + 1)}</p>`;
  }).join('')}

  <table class="sei-tabela">
    <tr><th colspan="2">SOLICITANTE</th></tr>
    <tr><td>NOME</td><td>${UI.escaparHtml(sof.sei_solicitante_nome || '')}</td></tr>
    <tr><td>CARGO</td><td>${UI.escaparHtml(sof.sei_solicitante_cargo || '')}</td></tr>
    <tr><td>SETOR</td><td>${UI.escaparHtml(sof.sei_solicitante_setor || '')}</td></tr>
  </table>

  <table class="sei-tabela">
    <tr><th colspan="2">ORDENADOR</th></tr>
    <tr><td>NOME</td><td>${UI.escaparHtml(sof.sei_ordenador_nome || '')}</td></tr>
    <tr><td>CARGO</td><td>${UI.escaparHtml(sof.sei_ordenador_cargo || '')}</td></tr>
    <tr><td>SETOR</td><td>${UI.escaparHtml(sof.sei_ordenador_setor || '')}</td></tr>
  </table>

  <table class="sei-tabela">
    <tr><th colspan="2" class="sei-assinatura-ne">ASSINATURA DA NOTA DE EMPENHO</th></tr>
    <tr><td>NOME</td><td>${UI.escaparHtml(sof.sei_assinatura_ne_nome || '')}</td></tr>
    <tr><td>CARGO</td><td>${UI.escaparHtml(sof.sei_assinatura_ne_cargo || '')}</td></tr>
  </table>

  <table class="sei-tabela">
    <tr><th colspan="2" class="sei-assinatura-nl">ASSINATURA DA NOTA DE LIQUIDAÇÃO</th></tr>
    <tr><td>NOME</td><td>${UI.escaparHtml(sof.sei_assinatura_nl_nome || '')}</td></tr>
    <tr><td>CARGO</td><td>${UI.escaparHtml(sof.sei_assinatura_nl_cargo || '')}</td></tr>
  </table>
</body>
</html>`;
  }

  return { render, preCarregar };
})();
