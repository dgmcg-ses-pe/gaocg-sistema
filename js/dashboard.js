/**
 * GAOCG App - Dashboard e Indicadores (Funcionalidade 8).
 *
 * Reescrito na sessão 2026-07-27: virou um painel gerencial de verdade
 * (SOF/Notas de Empenho/Recibos/Unidades, tudo já sem excluídos), com
 * indicadores clicáveis que navegam pra outra aba já filtrada
 * (App.navegarPara(tela, opts) - ver js/app.js) ou abrem um processo direto.
 * O card antigo "Edições em processo de outro usuário (histórico)" foi
 * removido a pedido do usuário - não era um indicador de trava em tempo real
 * (nada a ver com EdicoesEmAndamento), e sim uma contagem histórica do Log de
 * Auditoria sem filtro de data de verdade (bug real, corrigido/removido
 * junto no backend).
 */

const Dashboard = (function () {
  const ICONE_RECIBO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l3 3v17H6z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>';
  const ICONE_CIFRAO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 6.5v11M9 9.2c0-1.5 1.3-2.7 3-2.7s3 1 3 2.3c0 1.6-1.8 2.1-3 2.7-1.3.6-3 1.1-3 2.7 0 1.3 1.3 2.3 3 2.3s3-1.2 3-2.7"/></svg>';
  const ICONE_ARQUIVO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
  const ICONE_ALERTA = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>';
  const ICONE_PREDIO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M6 21V7l6-4 6 4v14"/><path d="M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1"/></svg>';
  const ICONE_SETA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  // Metas de Processos (docs/ESPECIFICACAO_METAS_PROCESSOS.md, sessão 2026-08-24).
  const ICONE_METAS = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
  // Mesmo chevron (para baixo) já usado no cabeçalho do filtro de múltipla
  // escolha (criarFiltroMultiplo, js/app.js) - reaproveitado aqui pra sinalizar
  // "expande no lugar", diferente da seta ICONE_SETA usada nos cards que navegam
  // para outra tela.
  const ICONE_CHEVRON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  const MESES_ABREV_PT_ = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  let mapaUsuarios_ = {};
  // Itens crus do painel "Processos do mês" (dados.metas_processos.itens),
  // guardados pra os filtros de Unidade/Objeto/Estado re-renderizarem a
  // tabela na hora, sem round-trip ao backend (lista já é pequena - uma
  // linha por combinação Unidade+Objeto).
  let metasItensAtuais_ = [];
  let metasAbertoAtual_ = false;
  // Itens do painel "NEs com saldo abaixo da parcela" (sessão 2026-09-01,
  // pedido do usuário) - vem do mesmo `dados.notas_empenho.itens` que já
  // chega no obterDashboard (ver dashboardNotasEmpenho_, Dashboard.gs),
  // filtrado por `alerta` na hora de montar a tabela, sem round-trip extra.
  let saldoBaixoItensAtuais_ = [];
  let saldoBaixoAbertoAtual_ = false;
  // Painel "Saldo das Notas de Empenho" (sessão 2026-11-09, pedido do
  // usuário) - aberto pelo card "Saldo disponível em Notas de Empenho". Usa
  // todos os `dados.notas_empenho.itens`, filtrados em memória.
  let saldoNeItensAtuais_ = [];
  let saldoNeAbertoAtual_ = false;

  async function carregarMapaUsuarios_() {
    try {
      const usuarios = await Api.chamar('listarUsuarios', {}, { cache: true });
      mapaUsuarios_ = {};
      usuarios.forEach(u => { mapaUsuarios_[u.id] = u.nome; });
    } catch (e) {
      // Cosmético (só usado pra exibir "Criado por" nas listas) - falha
      // silenciosa não deve impedir o resto do dashboard de carregar.
    }
  }
  function nomeUsuario_(id) { return mapaUsuarios_[id] || id || '-'; }

  /** "jul.26" -> "jun.26" (espelha competenciaAnterior_ do backend, Dashboard.gs - só pro rótulo da variação). */
  function competenciaAnteriorLabel_(competencia) {
    const partes = String(competencia || '').split('.');
    let idx = MESES_ABREV_PT_.indexOf(partes[0]);
    let ano = Number(partes[1]);
    if (idx < 0 || isNaN(ano)) return '';
    idx--; if (idx < 0) { idx = 11; ano--; }
    return MESES_ABREV_PT_[idx] + '.' + String(ano).padStart(2, '0');
  }

  function variacaoPercentual_(atual, anterior) {
    if (anterior === null || anterior === undefined || anterior === 0) return null;
    return Math.round(((atual - anterior) / anterior) * 100);
  }

  async function render() {
    const container = document.getElementById('conteudo');
    container.innerHTML = `
      <p class="dash-etiqueta">Visão geral operacional</p>
      <h2 class="titulo-tela">Dashboard</h2>
      <p class="dash-subtitulo">Acompanhe pagamentos, processos e pontos de atenção da GAOCG.</p>
      <div class="painel">
        <div class="barra-filtros">
          <div class="campo"><label>Competência</label><select id="dashCompetencia">${UI.opcoesCompetenciaHtml('')}</select></div>
          <button class="botao" id="btnAtualizarDash">Atualizar</button>
          <span style="flex:1"></span>
          <button class="botao primario" id="btnGerarRelatorio">Gerar relatório</button>
        </div>
        <div id="dashConteudo"></div>
      </div>`;
    document.getElementById('btnAtualizarDash').addEventListener('click', carregar);
    document.getElementById('btnGerarRelatorio').addEventListener('click', () => TelaRelatorios.abrir());
    UI.tornarPesquisavel('dashCompetencia');
    await carregar();
  }

  async function carregar() {
    const competencia = document.getElementById('dashCompetencia').value || undefined;
    const params = { competencia };
    const dados = await CacheAbas.comRevalidacao('dashboard', params,
      (opcoes) => Api.chamar('obterDashboard', params, opcoes),
      renderConteudo
    );
    if (!document.getElementById('dashCompetencia').value) {
      document.getElementById('dashCompetencia').value = dados.recibos.competencia;
      UI.tornarPesquisavel('dashCompetencia');
    }
    renderConteudo(dados);
  }

  /**
   * clicavel (padrão true): quando false, o card fica só informativo - sem a
   * classe .clicavel (cursor/hover) e sem a seta (usado no card "Atendido x
   * Solicitado", que não navega pra lugar nenhum).
   */
  function cartaoIndicadorHtml_(id, icone, valor, rotulo, deltaHtml, cor, clicavel) {
    const corClasse = cor || 'azul';
    const ehClicavel = clicavel !== false;
    return `
      <div class="cartao-indicador ${ehClicavel ? 'clicavel' : ''} acento-${corClasse}" id="${id}">
        <div class="cartao-indicador-topo">
          <span class="cartao-indicador-icone ${corClasse}">${icone}</span>
          ${ehClicavel ? `<span class="cartao-indicador-seta">${ICONE_SETA}</span>` : ''}
        </div>
        <div class="valor">${valor}</div>
        <div class="rotulo">${rotulo}</div>
        ${deltaHtml || ''}
      </div>`;
  }

  function renderConteudo(dados) {
    const r = dados.recibos, ne = dados.notas_empenho, atendido = dados.sof_atendido,
      uni = dados.unidades, metas = dados.metas_processos;

    // --- Card 1: Recibos criados x pagos na competência ---
    const deltaRecibos = variacaoPercentual_(r.total_recibos, r.total_recibos_competencia_anterior);
    const competenciaAnterior = competenciaAnteriorLabel_(r.competencia);
    const pagos = r.total_recibos_pagos || 0;
    const naoPagos = r.total_recibos - pagos;
    const compRecibosHtml = `<div class="cartao-indicador-delta">${pagos} pago(s) · ${naoPagos} não pago(s)</div>`;
    const deltaVsMesHtml = deltaRecibos === null ? '' : `<div class="cartao-indicador-delta ${deltaRecibos >= 0 ? 'positivo' : 'negativo'}">${deltaRecibos >= 0 ? '+' : ''}${deltaRecibos}% vs ${UI.escaparHtml(competenciaAnterior)}</div>`;

    // --- Card 2: Atendido (empenhado) x Solicitado, acumulado geral ---
    const solicitado = (atendido && atendido.total_solicitado) || 0;
    const empenhado = (atendido && atendido.total_empenhado) || 0;
    const percentualAtendido = solicitado > 0 ? Math.round((empenhado / solicitado) * 100) : null;
    const faltaAtender = Math.max(solicitado - empenhado, 0);
    const atendidoDeltaHtml = `
      <div class="cartao-indicador-barra"><div class="cartao-indicador-barra-preenchimento" style="width:${Math.min(percentualAtendido || 0, 100)}%"></div></div>
      <div class="cartao-indicador-delta">${UI.formatarMoeda(empenhado)} atendido de ${UI.formatarMoeda(solicitado)} solicitado</div>
      <div class="cartao-indicador-subvalor">Falta ser atendido: ${UI.formatarMoeda(faltaAtender)}</div>`;

    document.getElementById('dashConteudo').innerHTML = `
      <div class="grade-indicadores grade-indicadores-3">
        ${cartaoIndicadorHtml_('dashCardRecibos', ICONE_RECIBO, r.total_recibos, `Recibos na competência ${UI.escaparHtml(r.competencia)}`, compRecibosHtml + deltaVsMesHtml, 'azul')}
        ${cartaoIndicadorHtml_('dashCardAtendido', ICONE_CIFRAO, percentualAtendido === null ? '—' : percentualAtendido + '%', 'Atendido do total solicitado', atendidoDeltaHtml, 'verde', false)}
        ${cartaoSaldoBaixoHtml_(ne)}
        ${cartaoSaldoNeHtml_(ne)}
        ${cartaoIndicadorHtml_('dashCardUnidades', ICONE_PREDIO, UI.formatarMoeda(uni.total_mensal_comprometido), 'Total mensal comprometido (Unidades ativas)', `<div class="cartao-indicador-delta">${uni.total_unidades_ativas} unidade(s) ativa(s)</div>`, 'ciano')}
        ${cartaoMetasHtml_(metas)}
      </div>

      ${painelSaldoBaixoHtml_()}
      ${painelSaldoNeHtml_()}
      ${painelMetasDetalheHtml_(metas)}
      ${painelGraficosHtml_()}
      ${painelPrazosHtml_()}`;

    // Card 1: Recibos da competência, com todos os status EXCETO "PAGO"
    // (o filtro de status é "incluir X", então mandamos todos menos PAGO).
    document.getElementById('dashCardRecibos').addEventListener('click', () => App.navegarPara('recibos', { competencia: [r.competencia], statusExceto: ['PAGO'] }));
    // Card 2 (Atendido x Solicitado) é só informativo - sem clique.
    // Card 3 (NEs com saldo abaixo da parcela): não navega mais - expande o
    // painel no próprio Dashboard, ver configurarPainelSaldoBaixo_ abaixo.
    // Card 4 (Saldo disponível em NE): idem, ver configurarPainelSaldoNe_.
    document.getElementById('dashCardUnidades').addEventListener('click', () => App.navegarPara('unidades'));

    configurarPainelSaldoBaixo_(ne);
    configurarPainelSaldoNe_(ne);
    configurarPainelMetas_(metas);
    configurarGraficos_();
    carregarPrazosContratuais_();
    configurarPainelRecolhivel_('dashGraficosPainel', 'dashGraficosRecolher');
    configurarPainelRecolhivel_('dashPrazosPainel', 'dashPrazosRecolher');
  }

  // ===== Card "NEs com saldo abaixo da parcela" (sessão 2026-09-01, pedido
  // do usuário) - antes navegava direto pra tela de Notas de Empenho já
  // filtrada; agora, igual ao card "Processos do mês" logo abaixo, expande/
  // recolhe no próprio Dashboard uma lista com Unidade/Objeto/Fonte/Saldo/
  // Valor da Parcela de cada NE em alerta, sem precisar trocar de tela.
  function cartaoSaldoBaixoHtml_(ne) {
    return `
      <div class="cartao-indicador clicavel acento-vermelho" id="dashCardSaldoBaixo">
        <div class="cartao-indicador-topo">
          <span class="cartao-indicador-icone vermelho">${ICONE_ALERTA}</span>
          <span class="cartao-indicador-seta" id="dashSaldoBaixoChevron">${ICONE_CHEVRON}</span>
        </div>
        <div class="valor">${ne.total_saldo_abaixo_parcela}</div>
        <div class="rotulo">NEs com saldo abaixo da parcela</div>
        <div class="cartao-indicador-delta">Clique para ver a lista</div>
      </div>`;
  }

  // ===== Cabeçalho comum das seções do Dashboard (sessão 2026-11-09, pedido
  // do usuário: toda seção com título e opção de recolher). Seção aberta por
  // card (Saldo baixo, Saldo das NEs, Processos do mês): o botão fecha, igual a
  // clicar no card de novo. Seção fixa (Gráficos, Prazos): o botão recolhe até
  // o título, e a escolha fica salva neste navegador (localStorage).
  const CHAVE_PAINEIS_RECOLHIDOS_ = 'gaocg_dash_paineis_recolhidos';

  function cabecalhoPainelHtml_(titulo, idBotao, extraHtml) {
    return `
      <div class="dash-painel-cabecalho">
        <h3>${titulo}</h3>
        <div class="dash-painel-cabecalho-acoes">
          ${extraHtml || ''}
          <button type="button" class="dash-painel-recolher" id="${idBotao}" title="Recolher seção" aria-label="Recolher seção" aria-expanded="true">${ICONE_CHEVRON}</button>
        </div>
      </div>`;
  }

  function lerPaineisRecolhidos_() {
    try { return JSON.parse(localStorage.getItem(CHAVE_PAINEIS_RECOLHIDOS_) || '[]') || []; } catch (e) { return []; }
  }

  function salvarPaineisRecolhidos_(lista) {
    try { localStorage.setItem(CHAVE_PAINEIS_RECOLHIDOS_, JSON.stringify(lista)); } catch (e) { /* conveniência - sem storage, só não lembra */ }
  }

  /** Seção fixa: aplica o estado salvo e liga o botão de recolher/expandir. */
  function configurarPainelRecolhivel_(idPainel, idBotao) {
    const painel = document.getElementById(idPainel);
    const botao = document.getElementById(idBotao);
    if (!painel || !botao) return;
    const aplicar = recolhido => {
      painel.classList.toggle('recolhido', recolhido);
      botao.setAttribute('aria-expanded', String(!recolhido));
      botao.title = recolhido ? 'Expandir seção' : 'Recolher seção';
      botao.setAttribute('aria-label', botao.title);
    };
    aplicar(lerPaineisRecolhidos_().indexOf(idPainel) !== -1);
    botao.addEventListener('click', () => {
      const recolher = !painel.classList.contains('recolhido');
      aplicar(recolher);
      const lista = lerPaineisRecolhidos_().filter(id => id !== idPainel);
      if (recolher) lista.push(idPainel);
      salvarPaineisRecolhidos_(lista);
    });
  }

  /** Seção aberta por card: o botão do cabeçalho fecha a seção e acerta o chevron do card. */
  function ligarFecharPainelDeCard_(idBotao, detalheEl, chevronEl, aoFechar) {
    const botao = document.getElementById(idBotao);
    if (!botao) return;
    botao.title = 'Fechar seção';
    botao.setAttribute('aria-label', 'Fechar seção');
    botao.addEventListener('click', () => {
      detalheEl.classList.add('oculto');
      if (chevronEl) chevronEl.classList.remove('aberta');
      aoFechar();
    });
  }

  function painelSaldoBaixoHtml_() {
    return `
      <div class="painel oculto" id="dashSaldoBaixoDetalhe">
        ${cabecalhoPainelHtml_('Notas de Empenho com saldo abaixo da parcela', 'dashSaldoBaixoFechar', '<a href="#" id="dashSaldoBaixoVerTodas">Ver na tela de Notas de Empenho →</a>')}
        <div id="dashSaldoBaixoTabela"></div>
      </div>`;
  }

  function configurarPainelSaldoBaixo_(ne) {
    saldoBaixoItensAtuais_ = (ne.itens || []).filter(it => it.alerta);
    const cardEl = document.getElementById('dashCardSaldoBaixo');
    const detalheEl = document.getElementById('dashSaldoBaixoDetalhe');
    const chevronEl = document.getElementById('dashSaldoBaixoChevron');
    if (!cardEl || !detalheEl) return;

    // Recolhido por padrão a cada carregar() (troca de competência,
    // "Atualizar") - mesmo comportamento do painel de Metas, ver
    // configurarPainelMetas_ abaixo.
    detalheEl.classList.toggle('oculto', !saldoBaixoAbertoAtual_);
    chevronEl.classList.toggle('aberta', saldoBaixoAbertoAtual_);

    cardEl.addEventListener('click', () => {
      saldoBaixoAbertoAtual_ = detalheEl.classList.contains('oculto');
      detalheEl.classList.toggle('oculto', !saldoBaixoAbertoAtual_);
      chevronEl.classList.toggle('aberta', saldoBaixoAbertoAtual_);
    });
    document.getElementById('dashSaldoBaixoVerTodas').addEventListener('click', e => {
      e.preventDefault();
      App.navegarPara('notasEmpenho', { saldoBaixo: true });
    });
    ligarFecharPainelDeCard_('dashSaldoBaixoFechar', detalheEl, chevronEl, () => { saldoBaixoAbertoAtual_ = false; });

    renderTabelaSaldoBaixo_();
  }

  /** Pior saldo primeiro (mais negativo/menor sobra), pra chamar atenção pro caso mais urgente logo no topo. */
  function renderTabelaSaldoBaixo_() {
    const alvo = document.getElementById('dashSaldoBaixoTabela');
    if (!alvo) return;
    if (!saldoBaixoItensAtuais_.length) {
      alvo.innerHTML = '<p class="estado-vazio">Nenhuma Nota de Empenho com saldo abaixo da parcela no momento.</p>';
      return;
    }
    const itens = saldoBaixoItensAtuais_.slice().sort((a, b) => a.saldo_atual - b.saldo_atual);
    alvo.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Unidade</th><th>Objeto</th><th>Fonte</th><th>Saldo</th><th>Valor da Parcela</th></tr></thead>
        <tbody>${itens.map(it => `
          <tr data-numero="${UI.escaparHtml(it.numero_ne)}">
            <td>${UI.escaparHtml(it.unidade_nome || '-')}</td>
            <td>${UI.escaparHtml(it.objeto || '-')}</td>
            <td>${UI.escaparHtml(it.fonte || '-')}</td>
            <td><strong class="vermelho">${UI.formatarMoeda(it.saldo_atual)}</strong></td>
            <td>${UI.formatarMoeda(it.parcela_mensal_referencia)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    alvo.querySelectorAll('tr[data-numero]').forEach(tr => {
      tr.addEventListener('click', () => App.navegarPara('notasEmpenho', { saldoBaixo: true }));
    });
  }

  // ===== Card "Saldo disponível em Notas de Empenho" (sessão 2026-11-09,
  // pedido do usuário) - antes navegava direto pra tela de Notas de Empenho;
  // agora expande no próprio Dashboard a lista de todas as NEs com Unidade,
  // Objeto e saldo. Clicar numa NE abre a tela de Notas de Empenho já com a
  // busca pelo número dela.
  function cartaoSaldoNeHtml_(ne) {
    const semSaldoHtml = ne.total_sem_saldo > 0
      ? `<div class="cartao-indicador-delta negativo">${ne.total_sem_saldo} sem saldo</div>`
      : '<div class="cartao-indicador-delta">Clique para ver o saldo de cada NE</div>';
    return `
      <div class="cartao-indicador clicavel acento-vermelho" id="dashCardSaldoNe">
        <div class="cartao-indicador-topo">
          <span class="cartao-indicador-icone vermelho">${ICONE_ALERTA}</span>
          <span class="cartao-indicador-seta" id="dashSaldoNeChevron">${ICONE_CHEVRON}</span>
        </div>
        <div class="valor">${UI.formatarMoeda(ne.saldo_disponivel)}</div>
        <div class="rotulo">Saldo disponível em Notas de Empenho</div>
        ${semSaldoHtml}
      </div>`;
  }

  function painelSaldoNeHtml_() {
    return `
      <div class="painel oculto" id="dashSaldoNeDetalhe">
        ${cabecalhoPainelHtml_('Saldo das Notas de Empenho', 'dashSaldoNeFechar', '<a href="#" id="dashSaldoNeVerTodas">Ver na tela de Notas de Empenho →</a>')}
        <div class="barra-filtros">
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Unidade</label>
            <div id="dashSaldoNeFiltroUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="dashSaldoNeFiltroUnidade" title="Limpar filtro de Unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Objeto</label>
            <div id="dashSaldoNeFiltroObjeto"></div><button type="button" class="filtro-multiplo-x" data-alvo="dashSaldoNeFiltroObjeto" title="Limpar filtro de Objeto">&times;</button>
          </div>
          <div class="campo"><label>Situação</label>
            <select id="dashSaldoNeFiltroSituacao">
              <option value="">Todas</option>
              <option value="com_saldo">Com saldo</option>
              <option value="abaixo">Abaixo da parcela</option>
              <option value="sem_saldo">Sem saldo</option>
              <option value="concluida">Concluída</option>
            </select>
          </div>
          <span style="flex:1"></span>
          <span id="dashSaldoNeContagem" class="ajuda" style="align-self:center"></span>
        </div>
        <div id="dashSaldoNeTabela"></div>
      </div>`;
  }

  /**
   * Uma situação por NE, na ordem de prioridade: concluída (campo do backend,
   * neConcluida_) > sem saldo (<= 0) > abaixo da parcela (`alerta`) > com saldo.
   * Mesmo critério de "sem saldo" do card (dashboardNotasEmpenho_, Dashboard.gs).
   */
  function situacaoSaldoNe_(it) {
    if (it.concluida) return 'concluida';
    if (Number(it.saldo_atual) <= 0) return 'sem_saldo';
    if (it.alerta) return 'abaixo';
    return 'com_saldo';
  }

  const SELO_SITUACAO_NE_ = {
    concluida: '<span class="selo verde">Concluída</span>',
    sem_saldo: '<span class="selo vermelho">Sem saldo</span>',
    abaixo: '<span class="selo vermelho">Abaixo da parcela</span>',
    com_saldo: '<span class="selo azul">Com saldo</span>'
  };

  function configurarPainelSaldoNe_(ne) {
    saldoNeItensAtuais_ = ne.itens || [];
    const cardEl = document.getElementById('dashCardSaldoNe');
    const detalheEl = document.getElementById('dashSaldoNeDetalhe');
    const chevronEl = document.getElementById('dashSaldoNeChevron');
    if (!cardEl || !detalheEl) return;

    // Mesmo comportamento dos painéis de Saldo baixo e Metas: mantém aberto
    // entre carregamentos só se o usuário não o fechou.
    detalheEl.classList.toggle('oculto', !saldoNeAbertoAtual_);
    chevronEl.classList.toggle('aberta', saldoNeAbertoAtual_);

    cardEl.addEventListener('click', () => {
      saldoNeAbertoAtual_ = detalheEl.classList.contains('oculto');
      detalheEl.classList.toggle('oculto', !saldoNeAbertoAtual_);
      chevronEl.classList.toggle('aberta', saldoNeAbertoAtual_);
    });
    document.getElementById('dashSaldoNeVerTodas').addEventListener('click', e => {
      e.preventDefault();
      App.navegarPara('notasEmpenho');
    });
    ligarFecharPainelDeCard_('dashSaldoNeFechar', detalheEl, chevronEl, () => { saldoNeAbertoAtual_ = false; });

    const unidadesOpcoes = [];
    const unidadesVistas = new Set();
    const objetosOpcoes = [];
    const objetosVistos = new Set();
    saldoNeItensAtuais_.forEach(it => {
      const unidade = it.unidade_nome || '-';
      if (!unidadesVistas.has(unidade)) { unidadesVistas.add(unidade); unidadesOpcoes.push(unidade); }
      const objeto = it.objeto || '-';
      if (!objetosVistos.has(objeto)) { objetosVistos.add(objeto); objetosOpcoes.push(objeto); }
    });
    unidadesOpcoes.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    objetosOpcoes.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    UI.criarFiltroMultiplo('dashSaldoNeFiltroUnidade', unidadesOpcoes, renderTabelaSaldoNe_);
    UI.criarFiltroMultiplo('dashSaldoNeFiltroObjeto', objetosOpcoes, renderTabelaSaldoNe_);
    UI.ligarLimpezaFiltros('#dashSaldoNeDetalhe', null, renderTabelaSaldoNe_);
    document.getElementById('dashSaldoNeFiltroSituacao').addEventListener('change', renderTabelaSaldoNe_);

    renderTabelaSaldoNe_();
  }

  /** Filtra saldoNeItensAtuais_ em memória e redesenha a tabela, ordenada por Unidade, Objeto e Nº da NE. */
  function renderTabelaSaldoNe_() {
    const alvo = document.getElementById('dashSaldoNeTabela');
    if (!alvo) return;
    const unidades = UI.valoresFiltroMultiplo('dashSaldoNeFiltroUnidade');
    const objetos = UI.valoresFiltroMultiplo('dashSaldoNeFiltroObjeto');
    const situacao = document.getElementById('dashSaldoNeFiltroSituacao').value;

    const itens = saldoNeItensAtuais_
      .filter(it => !unidades.length || unidades.indexOf(it.unidade_nome || '-') !== -1)
      .filter(it => !objetos.length || objetos.indexOf(it.objeto || '-') !== -1)
      .filter(it => !situacao || situacaoSaldoNe_(it) === situacao)
      .slice()
      .sort((a, b) => String(a.unidade_nome || '').localeCompare(String(b.unidade_nome || ''), 'pt-BR')
        || String(a.objeto || '').localeCompare(String(b.objeto || ''), 'pt-BR')
        || String(a.numero_ne).localeCompare(String(b.numero_ne)));

    const contagemEl = document.getElementById('dashSaldoNeContagem');
    if (contagemEl) contagemEl.textContent = `${itens.length} nota${itens.length === 1 ? '' : 's'} de empenho`;

    if (!itens.length) {
      alvo.innerHTML = '<p class="estado-vazio">Nenhuma Nota de Empenho para este filtro.</p>';
      return;
    }
    const total = itens.reduce((soma, it) => soma + (Number(it.saldo_atual) || 0), 0);
    alvo.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Nº da NE</th><th>Unidade</th><th>Objeto</th><th>Fonte</th><th>Saldo</th><th>Situação</th></tr></thead>
        <tbody>${itens.map(it => {
          const sit = situacaoSaldoNe_(it);
          const corSaldo = sit === 'sem_saldo' || sit === 'abaixo' ? 'vermelho' : '';
          return `
          <tr data-numero="${UI.escaparHtml(it.numero_ne)}" title="Abrir na tela de Notas de Empenho">
            <td>${UI.escaparHtml(it.numero_ne)}</td>
            <td>${UI.escaparHtml(it.unidade_nome || '-')}</td>
            <td>${UI.escaparHtml(it.objeto || '-')}</td>
            <td>${UI.escaparHtml(it.fonte || '-')}</td>
            <td><strong class="${corSaldo}">${UI.formatarMoeda(it.saldo_atual)}</strong></td>
            <td>${SELO_SITUACAO_NE_[sit]}</td>
          </tr>`;
        }).join('')}
        </tbody>
        <tfoot><tr><td colspan="4"><strong>Total</strong></td><td><strong>${UI.formatarMoeda(total)}</strong></td><td></td></tr></tfoot>
      </table>`;
    alvo.querySelectorAll('tr[data-numero]').forEach(tr => {
      tr.addEventListener('click', () => App.navegarPara('notasEmpenho', { busca: tr.dataset.numero }));
    });
  }

  // ===== Card "Processos do mês" (Metas de Processos, sessão 2026-08-24) =====
  // Diferente dos outros cards clicáveis do Dashboard, este NÃO navega para
  // outra tela - clicar nele expande/recolhe um painel com filtros + tabela
  // no próprio Dashboard (pedido do usuário: "só apareça quando o card for
  // clicado"). Por isso usa um chevron (ICONE_CHEVRON) em vez da seta
  // ICONE_SETA dos demais, e fica recolhido por padrão a cada carregamento.
  function cartaoMetasHtml_(m) {
    const semMetaCadastrada = !m.itens.length;
    const valor = semMetaCadastrada ? '—' : `${m.total_chegado} <span style="font-size:15px;font-weight:600;color:var(--cinza-500)">de ${m.total_esperado}</span>`;
    const pct = m.total_esperado > 0 ? Math.min(Math.round((m.total_chegado / m.total_esperado) * 100), 100) : 0;
    const linhaFalta = semMetaCadastrada
      ? '<div class="cartao-indicador-delta">Nenhuma meta cadastrada ainda</div>'
      : (m.total_falta > 0
        ? `<div class="cartao-indicador-delta negativo">${m.total_falta} processo(s) ainda esperado(s)</div>`
        : '<div class="cartao-indicador-delta positivo">Tudo recebido ✓</div>');
    const barraHtml = semMetaCadastrada ? '' : `<div class="cartao-indicador-barra"><div class="cartao-indicador-barra-preenchimento" style="width:${pct}%"></div></div>`;
    return `
      <div class="cartao-indicador clicavel acento-roxo" id="dashCardMetas">
        <div class="cartao-indicador-topo">
          <span class="cartao-indicador-icone roxo">${ICONE_METAS}</span>
          <span class="cartao-indicador-seta" id="dashMetasChevron">${ICONE_CHEVRON}</span>
        </div>
        <div class="valor">${valor}</div>
        <div class="rotulo">Processos do mês ${UI.escaparHtml(m.competencia)}</div>
        ${barraHtml}
        ${linhaFalta}
      </div>`;
  }

  function painelMetasDetalheHtml_(m) {
    return `
      <div class="painel oculto" id="dashMetasDetalhe">
        ${cabecalhoPainelHtml_(`Processos do mês ${UI.escaparHtml((m && m.competencia) || '')}`, 'dashMetasFechar', '<a href="#" id="dashMetasVerTodas">Gerenciar metas →</a>')}
        <div class="barra-filtros">
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Unidade</label>
            <div id="dashMetasFiltroUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="dashMetasFiltroUnidade" title="Limpar filtro de Unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Objeto</label>
            <div id="dashMetasFiltroObjeto"></div><button type="button" class="filtro-multiplo-x" data-alvo="dashMetasFiltroObjeto" title="Limpar filtro de Objeto">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Tipo de Unidade</label>
            <div id="dashMetasFiltroTipoUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="dashMetasFiltroTipoUnidade" title="Limpar filtro de Tipo de Unidade">&times;</button>
          </div>
          <div class="campo"><label>Estado</label>
            <select id="dashMetasFiltroEstado">
              <option value="">Todos</option>
              <option value="chegado">Recebido</option>
              <option value="falta">Não recebido</option>
            </select>
          </div>
          <span style="flex:1"></span>
          <span id="dashMetasContagem" class="ajuda" style="align-self:center"></span>
        </div>
        <div id="dashMetasTabela"></div>
        <div id="dashMetasAviso"></div>
      </div>`;
  }

  function configurarPainelMetas_(m) {
    metasItensAtuais_ = m.itens || [];
    const cardEl = document.getElementById('dashCardMetas');
    const detalheEl = document.getElementById('dashMetasDetalhe');
    const chevronEl = document.getElementById('dashMetasChevron');
    if (!cardEl || !detalheEl) return;

    // Recolhido por padrão a cada `carregar()` (troca de competência, botão
    // Atualizar) - metasAbertoAtual_ só é reaproveitado se o usuário nunca
    // fechou o painel manualmente entre um carregamento e outro.
    detalheEl.classList.toggle('oculto', !metasAbertoAtual_);
    chevronEl.classList.toggle('aberta', metasAbertoAtual_);

    cardEl.addEventListener('click', () => {
      metasAbertoAtual_ = detalheEl.classList.contains('oculto');
      detalheEl.classList.toggle('oculto', !metasAbertoAtual_);
      chevronEl.classList.toggle('aberta', metasAbertoAtual_);
    });

    const unidadesOpcoes = [];
    const unidadesVistas = new Set();
    const objetosOpcoes = [];
    const objetosVistos = new Set();
    const tiposUnidadeOpcoes = [];
    const tiposUnidadeVistos = new Set();
    metasItensAtuais_.forEach(item => {
      if (!unidadesVistas.has(item.unidade_id)) { unidadesVistas.add(item.unidade_id); unidadesOpcoes.push({ valor: item.unidade_id, rotulo: item.unidade_nome }); }
      if (!objetosVistos.has(item.objeto)) { objetosVistos.add(item.objeto); objetosOpcoes.push(item.objeto); }
      if (item.tipo_unidade && !tiposUnidadeVistos.has(item.tipo_unidade)) { tiposUnidadeVistos.add(item.tipo_unidade); tiposUnidadeOpcoes.push(item.tipo_unidade); }
    });
    UI.criarFiltroMultiplo('dashMetasFiltroUnidade', unidadesOpcoes, renderTabelaMetas_);
    UI.criarFiltroMultiplo('dashMetasFiltroObjeto', objetosOpcoes, renderTabelaMetas_);
    UI.criarFiltroMultiplo('dashMetasFiltroTipoUnidade', tiposUnidadeOpcoes, renderTabelaMetas_);
    UI.ligarLimpezaFiltros('#dashMetasDetalhe', null, renderTabelaMetas_);
    document.getElementById('dashMetasFiltroEstado').addEventListener('change', renderTabelaMetas_);
    document.getElementById('dashMetasVerTodas').addEventListener('click', e => { e.preventDefault(); App.navegarPara('metasProcessos'); });
    ligarFecharPainelDeCard_('dashMetasFechar', detalheEl, chevronEl, () => { metasAbertoAtual_ = false; });

    renderTabelaMetas_();
    renderAvisoSemMeta_(m.sem_meta || []);
  }

  // Colunas Liquidado e Pago do painel "Processos do mês" (sessão 2026-11-09,
  // pedido do usuário): check verde = feito, relógio amarelo = processo
  // recebido aguardando a etapa, X vermelho = processo ainda não recebido.
  const ICONE_ETAPA_ = {
    feito: '<svg class="icone-etapa feito" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    aguardando: '<svg class="icone-etapa aguardando" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    ausente: '<svg class="icone-etapa ausente" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  /**
   * Ícone de uma etapa (liquidado/pago) de uma linha de meta. A base é o maior
   * entre esperado e recebido: só fica "feito" quando todos os processos dessa
   * base passaram pela etapa. Nenhum recebido -> X; senão relógio. Com mais de
   * um processo, mostra também a contagem (ex.: 1/2). Backend antigo (sem o
   * campo) -> "-".
   */
  function etapaMetaHtml_(it, feitos, etapa) {
    if (feitos === undefined || feitos === null) return '<span class="ajuda">-</span>';
    const base = Math.max(Number(it.esperado) || 0, Number(it.chegado) || 0);
    const rotuloEtapa = etapa === 'pago' ? 'pago(s)' : 'liquidado(s)';
    let estado, titulo;
    if (!it.chegado) {
      estado = 'ausente'; titulo = 'Processo ainda não recebido';
    } else if (feitos >= base) {
      estado = 'feito'; titulo = `${feitos} de ${base} ${rotuloEtapa}`;
    } else {
      estado = 'aguardando'; titulo = `Recebido, aguardando: ${feitos} de ${base} ${rotuloEtapa}`;
    }
    const contagem = base > 1 ? ` <span class="etapa-contagem">${feitos}/${base}</span>` : '';
    return `<span class="etapa-meta" title="${titulo}">${ICONE_ETAPA_[estado]}${contagem}</span>`;
  }

  /**
   * Coluna "Recebido" do painel "Processos do mês" (sessão 2026-11-09, pedido
   * do usuário: substitui as colunas Esperado e Falta). Sim (verde) quando
   * chegou tudo o que a meta espera; Não (vermelho) quando não chegou nada.
   * Meta com mais de um processo e só parte recebida mostra "1 de 2" em
   * amarelo, pra não esconder o que ainda falta.
   */
  function recebidoMetaHtml_(it) {
    const esperado = Number(it.esperado) || 0, chegado = Number(it.chegado) || 0;
    if (chegado >= esperado && chegado > 0) {
      const extra = it.excedente > 0 ? ` title="Recebido(s) ${chegado}, esperado(s) ${esperado}"` : '';
      return `<span class="selo verde"${extra}>Sim</span>`;
    }
    if (!chegado) return '<span class="selo vermelho">Não</span>';
    return `<span class="selo amarelo" title="Recebido(s) ${chegado} de ${esperado} esperado(s)">${chegado} de ${esperado}</span>`;
  }

  /** Filtra metasItensAtuais_ em memória (sem chamada ao backend) e redesenha só a tabela. */
  function renderTabelaMetas_() {
    const alvo = document.getElementById('dashMetasTabela');
    if (!alvo) return;
    const unidadeIds = UI.valoresFiltroMultiplo('dashMetasFiltroUnidade');
    const objetos = UI.valoresFiltroMultiplo('dashMetasFiltroObjeto');
    const tiposUnidade = UI.valoresFiltroMultiplo('dashMetasFiltroTipoUnidade');
    const estado = document.getElementById('dashMetasFiltroEstado').value;

    const itens = metasItensAtuais_
      .filter(it => !unidadeIds.length || unidadeIds.indexOf(it.unidade_id) !== -1)
      .filter(it => !objetos.length || objetos.indexOf(it.objeto) !== -1)
      .filter(it => !tiposUnidade.length || tiposUnidade.indexOf(it.tipo_unidade) !== -1)
      .filter(it => !estado || it.estado === estado)
      .slice()
      .sort((a, b) => b.falta - a.falta);

    // Contagem no canto direito (sessão 2026-09-01, pedido do usuário) -
    // quantos processos (linhas Unidade+Objeto) o filtro atual está
    // mostrando, mesmo quando dá zero.
    const contagemEl = document.getElementById('dashMetasContagem');
    if (contagemEl) contagemEl.textContent = `${itens.length} processo${itens.length === 1 ? '' : 's'}`;

    if (!itens.length) {
      alvo.innerHTML = '<p class="estado-vazio">Nenhuma meta cadastrada para este filtro ainda.</p>';
      return;
    }
    alvo.innerHTML = `
      <p class="dash-legenda-etapas">
        <span>${ICONE_ETAPA_.feito} concluído</span>
        <span>${ICONE_ETAPA_.aguardando} recebido, aguardando</span>
        <span>${ICONE_ETAPA_.ausente} processo ainda não recebido</span>
      </p>
      <table class="tabela">
        <thead><tr><th>Unidade</th><th>Objeto</th><th>Liquidado</th><th>Pago</th><th>Recebido</th></tr></thead>
        <tbody>${itens.map(it => `
          <tr data-unidade="${it.unidade_id}" data-objeto="${UI.escaparHtml(it.objeto)}">
            <td>${UI.escaparHtml(it.unidade_nome)}</td>
            <td>${UI.escaparHtml(it.objeto)}</td>
            <td>${etapaMetaHtml_(it, it.liquidado, 'liquidado')}</td>
            <td>${etapaMetaHtml_(it, it.pago, 'pago')}</td>
            <td>${recebidoMetaHtml_(it)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;

    alvo.querySelectorAll('tr[data-unidade]').forEach(tr => {
      tr.addEventListener('click', () => App.navegarPara('recibos', {
        competencia: [document.getElementById('dashCompetencia').value],
        unidade_id: [tr.dataset.unidade],
        objeto: [tr.dataset.objeto]
      }));
    });
  }

  function renderAvisoSemMeta_(semMeta) {
    const alvo = document.getElementById('dashMetasAviso');
    if (!alvo) return;
    if (!semMeta.length) { alvo.innerHTML = ''; return; }
    const itens = semMeta.map(s => `${UI.escaparHtml(s.unidade_nome)} — ${UI.escaparHtml(s.objeto)} (${s.quantidade})`).join('; ');
    alvo.innerHTML = `<div class="aviso-edicao-simultanea"><p>Recebido sem meta cadastrada: ${itens}.</p></div>`;
  }

  // ===== Prazos contratuais das Unidades (sessão 2026-08-14, pedido do
  // usuário) - painel no canto inferior do Dashboard, ordenado do prazo mais
  // próximo de vencer pro mais longo. A ordenação usa sempre o Prazo final =
  // fim dos 10 anos do C.G. (Contrato Regular) ou fim do instrumento
  // temporário (TAC/Termo de Compromisso/Contrato Emergencial) - nunca o
  // "próximo T.A." (coluna própria, sessão 2026-08-24), que é só uma
  // renovação intermediária, não um fim de prazo. Cálculo compartilhado com
  // o card de Unidades - ver UI.calcularPrazoContratoUnidade (js/app.js).
  //
  // Busca todas as unidades ATIVAS separado de obterDashboard (que só
  // devolve agregados, não a lista) - reaproveita listarUnidades com
  // cache:true, mesmo padrão já usado em SOF/Recibos pra popular filtros.
  function painelPrazosHtml_() {
    return `
      <div class="painel" id="dashPrazosPainel">
        ${cabecalhoPainelHtml_('Prazos contratuais das Unidades', 'dashPrazosRecolher')}
        <div class="dash-painel-corpo">
          <div id="dashPrazosArea"><p class="estado-vazio">Carregando…</p></div>
        </div>
      </div>`;
  }

  async function carregarPrazosContratuais_() {
    const area = document.getElementById('dashPrazosArea');
    if (!area) return;
    try {
      const resposta = await Api.chamar('listarUnidades', { pageSize: 100000, somenteAtivas: true }, { cache: true });
      const linhas = resposta.items
        .map(u => ({ unidade: u, prazo: UI.calcularPrazoContratoUnidade(u) }))
        // Sem prazo calculável (Situação/data ainda não preenchida) vai pro
        // fim da lista - Infinity nunca perde de um número real de dias.
        .sort((a, b) => (a.prazo ? a.prazo.diasPrazoFinal : Infinity) - (b.prazo ? b.prazo.diasPrazoFinal : Infinity));
      area.innerHTML = tabelaPrazosHtml_(linhas);
    } catch (e) {
      area.innerHTML = `<p class="estado-vazio">Não foi possível carregar os prazos. ${UI.escaparHtml(e.message || '')}</p>`;
    }
  }

  function tabelaPrazosHtml_(linhas) {
    if (!linhas.length) return '<p class="estado-vazio">Nenhuma unidade ativa cadastrada.</p>';
    const corpo = linhas.map(({ unidade: u, prazo }) => {
      if (!prazo) {
        return `<tr><td>${UI.escaparHtml(u.nome)}</td><td>-</td><td>-</td><td>-</td><td><span class="selo cinza">Prazo não informado</span></td></tr>`;
      }
      const dias = prazo.diasPrazoFinal;
      const textoDias = dias >= 0 ? `${dias} dia(s)` : `vencido há ${Math.abs(dias)} dia(s)`;
      // Próximo T.A. (sessão 2026-08-24, pedido do usuário): só existe pra
      // Contrato Regular dentro dos 8 primeiros anos - instrumento temporário
      // (TAC/Termo de Compromisso/Contrato Emergencial) e os 2 anos finais
      // do C.G. não têm T.A. pendente (ver UI.calcularPrazoContratoUnidade).
      const diasTa = prazo.diasProximoTa;
      const proximoTaHtml = diasTa === null
        ? '-'
        : `<span class="selo ${UI.corAlertaPrazo(diasTa)}">${diasTa >= 0 ? `${diasTa} dia(s)` : `vencido há ${Math.abs(diasTa)} dia(s)`}</span>`;
      return `<tr>
        <td>${UI.escaparHtml(u.nome)}</td>
        <td>${UI.escaparHtml(prazo.situacao)}</td>
        <td>${proximoTaHtml}</td>
        <td>${UI.formatarDataBr(prazo.dataPrazoFinalIso)}</td>
        <td><span class="selo ${UI.corAlertaPrazo(dias)}">${textoDias}</span></td>
      </tr>`;
    }).join('');
    return `<table class="tabela"><thead><tr><th>Unidade</th><th>Situação do Contrato</th><th>Próximo T.A.</th><th>Prazo final</th><th>Dias restantes</th></tr></thead><tbody>${corpo}</tbody></table>`;
  }

  // ===== Painel de gráficos (Parte 2 do redesign, 2026-07-28) =====
  // Uma métrica por dimensão, dentro de um período. Barras/linha usam UM hue
  // (magnitude, não identidade); pizza usa a paleta categórica validada (guia
  // dataviz) em ordem fixa, com teto de fatias. Uma tabela de valores acompanha
  // o gráfico (números exatos + acessibilidade). App é tema claro (light-only).

  const GRAF_METRICAS_ = [
    { valor: 'pago', rotulo: 'Total pago' },
    { valor: 'liquidado', rotulo: 'Total liquidado' },
    { valor: 'empenhado', rotulo: 'Total atendido (NE)' },
    { valor: 'contagem', rotulo: 'Nº de recibos' }
  ];
  const GRAF_DIMENSOES_ = [
    { valor: 'oss', rotulo: 'OSS' },
    { valor: 'unidade', rotulo: 'Unidade' },
    { valor: 'fonte', rotulo: 'Fonte' },
    { valor: 'status', rotulo: 'Status' },
    { valor: 'mes', rotulo: 'Mês' }
  ];
  const GRAF_TIPOS_ = [
    { valor: 'barrasV', rotulo: 'Barras verticais' },
    { valor: 'barrasH', rotulo: 'Barras horizontais' },
    { valor: 'pizza', rotulo: 'Pizza / Rosca' },
    { valor: 'linha', rotulo: 'Linha (por mês)' }
  ];
  const GRAF_HUE_ = '#2a78d6';
  const GRAF_PALETA_ = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
  const GRAF_GRID_ = '#e1e0d9', GRAF_EIXO_ = '#c3c2b7';

  function opcoesSelectHtml_(lista, selecionado) {
    return lista.map(o => `<option value="${o.valor}" ${o.valor === selecionado ? 'selected' : ''}>${UI.escaparHtml(o.rotulo)}</option>`).join('');
  }

  function painelGraficosHtml_() {
    return `
      <div class="painel dash-graficos" id="dashGraficosPainel">
        ${cabecalhoPainelHtml_('Gráficos', 'dashGraficosRecolher')}
        <div class="dash-painel-corpo">
        <div class="dash-graf-controles">
          <div class="campo"><label>Métrica</label><select id="grafMetrica">${opcoesSelectHtml_(GRAF_METRICAS_, 'pago')}</select></div>
          <div class="campo"><label>Agrupar por</label><select id="grafAgrupar">${opcoesSelectHtml_(GRAF_DIMENSOES_, 'oss')}</select></div>
          <div class="campo"><label>Tipo de gráfico</label><select id="grafTipo">${opcoesSelectHtml_(GRAF_TIPOS_, 'barrasV')}</select></div>
          <div class="campo"><label>De</label><select id="grafCompInicio">${UI.opcoesCompetenciaHtml('', true)}</select></div>
          <div class="campo"><label>Até</label><select id="grafCompFim">${UI.opcoesCompetenciaHtml('', true)}</select></div>
        </div>
        <div id="grafArea" class="dash-graf-area"><p class="estado-vazio">Carregando…</p></div>
        </div>
      </div>`;
  }

  function valSelect_(id) { const el = document.getElementById(id); return el ? el.value : ''; }

  function configurarGraficos_() {
    ['grafMetrica', 'grafAgrupar', 'grafTipo', 'grafCompInicio', 'grafCompFim'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => { aplicarRestricoesGrafico_(); carregarGrafico_(); });
    });
    aplicarRestricoesGrafico_();
    carregarGrafico_();
  }

  /**
   * Regras de compatibilidade da barra de controles:
   * - Métrica "empenhado" não tem dimensão "Status" (NE não tem status).
   * - Tipo "Linha" só quando Agrupar por = Mês.
   */
  function aplicarRestricoesGrafico_() {
    const metrica = valSelect_('grafMetrica');
    const agrupar = document.getElementById('grafAgrupar');
    const tipo = document.getElementById('grafTipo');
    if (!agrupar || !tipo) return;

    const optStatus = agrupar.querySelector('option[value="status"]');
    if (optStatus) optStatus.disabled = (metrica === 'empenhado');
    if (metrica === 'empenhado' && agrupar.value === 'status') agrupar.value = 'oss';

    const optLinha = tipo.querySelector('option[value="linha"]');
    if (optLinha) optLinha.disabled = (agrupar.value !== 'mes');
    if (agrupar.value !== 'mes' && tipo.value === 'linha') tipo.value = 'barrasV';
  }

  async function carregarGrafico_() {
    const area = document.getElementById('grafArea');
    if (!area) return;
    const params = {
      metrica: valSelect_('grafMetrica'),
      agruparPor: valSelect_('grafAgrupar'),
      competenciaInicio: valSelect_('grafCompInicio') || undefined,
      competenciaFim: valSelect_('grafCompFim') || undefined
    };
    const tipo = valSelect_('grafTipo');
    area.innerHTML = '<p class="estado-vazio">Carregando…</p>';
    try {
      const dados = await Api.chamar('obterGraficoDashboard', params, { silencioso: true });
      desenharGrafico_(area, dados, tipo);
    } catch (e) {
      area.innerHTML = `<p class="estado-vazio">Não foi possível carregar o gráfico. ${UI.escaparHtml(e.message || '')}</p>`;
    }
  }

  function desenharGrafico_(area, dados, tipo) {
    const itens = (dados && dados.itens) || [];
    if (!itens.length) {
      area.innerHTML = '<p class="estado-vazio">Sem dados para essa seleção/período.</p>';
      return;
    }
    const ehMoeda = !!dados.ehMoeda;
    let corpo;
    if (tipo === 'pizza') corpo = graficoPizza_(itens, ehMoeda);
    else if (tipo === 'linha') corpo = graficoLinha_(itens, ehMoeda);
    else if (tipo === 'barrasH') corpo = graficoBarrasH_(itens, ehMoeda);
    else corpo = graficoBarrasV_(itens, ehMoeda);
    area.innerHTML = `<div class="graf-render">${corpo}</div>${tabelaValores_(dados, ehMoeda)}`;
  }

  // ----- formatação e utilitários -----
  function formatarValorGraf_(v, ehMoeda) { return ehMoeda ? UI.formatarMoeda(v) : String(Math.round(v)); }
  /** Rótulo curto pra dentro do gráfico (evita textos enormes de moeda). */
  function formatarCompacto_(v, ehMoeda) {
    if (!ehMoeda) return String(Math.round(v));
    const abs = Math.abs(v);
    if (abs >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
    if (abs >= 1e3) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return UI.formatarMoeda(v);
  }
  function cortar_(s, max) { s = String(s || ''); return s.length > max ? s.slice(0, max - 1) + '…' : s; }
  /** Top N + "Outros" (evita gráficos ilegíveis com dezenas de categorias). */
  function limitarItens_(itens, max) {
    if (itens.length <= max) return itens.slice();
    const top = itens.slice(0, max);
    const resto = itens.slice(max).reduce((s, it) => s + it.valor, 0);
    top.push({ label: 'Outros', valor: resto });
    return top;
  }
  function rotuloDimensao_(dim) { const d = GRAF_DIMENSOES_.find(x => x.valor === dim); return d ? d.rotulo : 'Categoria'; }
  function tabelaValores_(dados, ehMoeda) {
    const linhas = dados.itens.map(it => `<tr><td>${UI.escaparHtml(it.label)}</td><td class="graf-td-num">${formatarValorGraf_(it.valor, ehMoeda)}</td></tr>`).join('');
    return `
      <details class="graf-tabela-wrap">
        <summary>Ver valores (${dados.itens.length}) · Total: ${formatarValorGraf_(dados.total, ehMoeda)}</summary>
        <table class="tabela graf-tabela"><thead><tr><th>${UI.escaparHtml(rotuloDimensao_(dados.agruparPor))}</th><th class="graf-td-num">Valor</th></tr></thead><tbody>${linhas}</tbody></table>
      </details>`;
  }

  // ----- geradores de gráfico -----
  function graficoBarrasV_(itens, ehMoeda) {
    const dados = limitarItens_(itens, 16);
    const W = 720, H = 300, padL = 16, padR = 16, padT = 22, padB = 66;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const n = dados.length;
    const max = Math.max.apply(null, dados.map(d => d.valor)) || 1;
    const passo = plotW / n;
    const barW = Math.min(passo * 0.62, 64);
    const baseline = padT + plotH;
    const barras = dados.map((d, i) => {
      const h = max > 0 ? (d.valor / max) * plotH : 0;
      const cxBar = padL + passo * i + passo / 2;
      const bx = cxBar - barW / 2, by = baseline - h;
      return `
        <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 0).toFixed(1)}" rx="3" fill="${GRAF_HUE_}"/>
        <text x="${cxBar.toFixed(1)}" y="${(by - 5).toFixed(1)}" text-anchor="middle" class="graf-val-txt">${UI.escaparHtml(formatarCompacto_(d.valor, ehMoeda))}</text>
        <text transform="rotate(-35 ${cxBar.toFixed(1)} ${(baseline + 15).toFixed(1)})" x="${cxBar.toFixed(1)}" y="${(baseline + 15).toFixed(1)}" text-anchor="end" class="graf-eixo-txt">${UI.escaparHtml(cortar_(d.label, 14))}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="graf-svg" role="img" preserveAspectRatio="xMidYMid meet">
      <line x1="${padL}" y1="${baseline}" x2="${W - padR}" y2="${baseline}" stroke="${GRAF_EIXO_}" stroke-width="1"/>
      ${barras}
    </svg>`;
  }

  function graficoBarrasH_(itens, ehMoeda) {
    const dados = limitarItens_(itens, 25);
    const max = Math.max.apply(null, dados.map(d => d.valor)) || 1;
    const linhas = dados.map(d => {
      const pct = max > 0 ? (d.valor / max) * 100 : 0;
      return `<div class="graf-hbar-linha">
        <div class="graf-hbar-rotulo" title="${UI.escaparHtml(d.label)}">${UI.escaparHtml(d.label)}</div>
        <div class="graf-hbar-trilho"><div class="graf-hbar-fill" style="width:${pct.toFixed(1)}%"></div></div>
        <div class="graf-hbar-valor">${UI.escaparHtml(formatarCompacto_(d.valor, ehMoeda))}</div>
      </div>`;
    }).join('');
    return `<div class="graf-hbars">${linhas}</div>`;
  }

  function graficoPizza_(itens, ehMoeda) {
    const dados = limitarItens_(itens, 7);
    const total = dados.reduce((s, d) => s + d.valor, 0) || 1;
    const R = 70, cx = 90, cy = 90, C = 2 * Math.PI * R;
    let acc = 0;
    const arcos = dados.map((d, i) => {
      const dash = (d.valor / total) * C;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${GRAF_PALETA_[i % GRAF_PALETA_.length]}" stroke-width="26" stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
      acc += dash;
      return seg;
    }).join('');
    const legenda = dados.map((d, i) => `
      <div class="graf-leg-item">
        <span class="graf-leg-cor" style="background:${GRAF_PALETA_[i % GRAF_PALETA_.length]}"></span>
        <span class="graf-leg-rotulo" title="${UI.escaparHtml(d.label)}">${UI.escaparHtml(d.label)}</span>
        <span class="graf-leg-valor">${UI.escaparHtml(formatarCompacto_(d.valor, ehMoeda))} · ${Math.round((d.valor / total) * 100)}%</span>
      </div>`).join('');
    return `<div class="graf-pizza-wrap">
      <svg viewBox="0 0 180 180" class="graf-svg-pizza" role="img"><g>${arcos}</g></svg>
      <div class="graf-legenda">${legenda}</div>
    </div>`;
  }

  function graficoLinha_(itens, ehMoeda) {
    const W = 720, H = 260, padL = 64, padR = 16, padT = 18, padB = 42;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const n = itens.length;
    const max = Math.max.apply(null, itens.map(d => d.valor)) || 1;
    const x = i => n === 1 ? padL + plotW / 2 : padL + (i * plotW) / (n - 1);
    const y = v => padT + plotH - (max > 0 ? (v / max) * plotH : 0);
    const nLinhas = 4;
    let grid = '';
    for (let g = 0; g <= nLinhas; g++) {
      const val = (max * g) / nLinhas, gy = y(val);
      grid += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${GRAF_GRID_}" stroke-width="1"/>`;
      grid += `<text x="${padL - 8}" y="${(gy + 3).toFixed(1)}" text-anchor="end" class="graf-eixo-txt">${UI.escaparHtml(formatarCompacto_(val, ehMoeda))}</text>`;
    }
    const pts = itens.map((d, i) => `${x(i).toFixed(1)},${y(d.valor).toFixed(1)}`).join(' ');
    const marcadores = itens.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.valor).toFixed(1)}" r="3.5" fill="${GRAF_HUE_}"/>`).join('');
    const rotulosX = itens.map((d, i) => `<text x="${x(i).toFixed(1)}" y="${H - padB + 16}" text-anchor="middle" class="graf-eixo-txt">${UI.escaparHtml(cortar_(d.label, 8))}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="graf-svg" role="img" preserveAspectRatio="xMidYMid meet">
      ${grid}
      <polyline fill="none" stroke="${GRAF_HUE_}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts}"/>
      ${marcadores}
      ${rotulosX}
    </svg>`;
  }

  return { render };
})();
