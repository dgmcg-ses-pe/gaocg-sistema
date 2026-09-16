/**
 * GAOCG App - Wrapper de chamadas à Web App do Apps Script.
 *
 * Usa POST com Content-Type "text/plain" (nunca "application/json") para que
 * o navegador trate a requisição como "simples" e NÃO dispare um preflight
 * OPTIONS - o Apps Script Web App não responde bem a esse preflight. Leituras
 * simples também podem usar GET (nunca gera preflight). Ver Code.gs/Utils.gs
 * no backend para o outro lado dessa decisão.
 */

const Api = (function () {
  // Preenchido após o deploy do Apps Script (Implantar > Nova implantação > Aplicativo da Web).
  const API_URL = 'https://script.google.com/macros/s/AKfycbzbLozyF4h0HLbCeJdWyj1skAmxgrUhjV17FvKzXKVqF9l3gIAnS6ufmvj-PvjAOv4ZTg/exec';

  let token = null;
  const cache = new Map();

  function definirToken(novoToken) {
    token = novoToken;
  }

  function chaveCache(action, payload) {
    return action + ':' + JSON.stringify(payload || {});
  }

  /** Remove do cache todas as entradas da ação informada (qualquer payload). */
  function invalidarCache(action) {
    Array.from(cache.keys()).forEach(chave => {
      if (chave.indexOf(action + ':') === 0) cache.delete(chave);
    });
  }

  /**
   * "Parâmetro \"action\" ausente." (achado 2026-09-03, pedido do usuário:
   * "vez ou outra o app fica bem lento pra carregar e dá esse erro") -
   * mensagem do PRIMEIRÍSSIMO `if` de handleRequest_ (Code.gs, backend),
   * antes de qualquer autenticação/leitura/escrita: só acontece quando o
   * corpo do POST chega vazio no servidor, o que só pode ser perda de
   * requisição em trânsito (rede instável) - nunca a lógica de negócio já
   * tendo rodado. Por isso é seguro reenviar automaticamente, mesmo para
   * ações de escrita: nada foi executado na tentativa que falhou.
   */
  const ERRO_ACTION_AUSENTE_ = 'Parâmetro "action" ausente.';

  /**
   * Ações que NÃO escrevem nada - só essas podem ser repetidas sozinhas
   * quando a requisição falha no transporte (HTTP 404/5xx, queda de rede).
   *
   * Por que a lista é explícita em vez de um prefixo tipo "listar*": o
   * Apps Script executa o script no POST e entrega o resultado num 2º salto
   * (redirect pra script.googleusercontent.com). Quando esse 2º salto falha,
   * o script MUITO PROVAVELMENTE já rodou - repetir uma escrita criaria um
   * SOF/Recibo/NE duplicado. Por isso escrita nenhuma entra aqui, incluindo
   * as que parecem leitura: lerAnexoNotaEmpenho/lerAnexoRecibo sobem o
   * arquivo pro Drive (repetir deixaria arquivo órfão), gerarRelatorioSheets
   * cria uma planilha, gerarRecibosMeta cria recibos.
   *
   * O caso do ERRO_ACTION_AUSENTE_ abaixo é diferente e continua valendo pra
   * qualquer ação: ali o servidor provou que não executou nada.
   */
  const ACOES_REPETIVEIS_ = new Set([
    // login entra aqui apesar do nome: login_ (Auth.gs) só lê a aba Usuarios e
    // devolve um token assinado (gerarToken_ é stateless, não grava sessão
    // nenhuma), então repetir não deixa rastro. É justamente a requisição que
    // mais precisa disso - a 1ª da sessão, a que costuma pegar o script frio.
    // Senha errada volta HTTP 200 com ok:false, que não dispara retry nenhum.
    'login', 'ping', 'getVersoes',
    'listarUsuarios', 'listarUnidades', 'listarOpcoes',
    'listarSof', 'obterSof', 'obterTemplateSof',
    'listarNotasEmpenho', 'listarNotasEmpenhoPorSof', 'listarNotasEmpenhoPorUnidade', 'listarObjetosSofPorUnidade',
    'listarRecibos', 'indicadoresRecibos', 'listarRecibosPorGrupo', 'listarObservacoesRecibo',
    'listarLogAuditoria', 'listarSugestoes',
    'obterDashboard', 'obterGraficoDashboard',
    'listarMetasProcessos',
    'obterCatalogoRelatorios', 'listarModelosRelatorio', 'gerarRelatorio',
    'listarChavesApi'
  ]);

  /**
   * Partida a frio do Apps Script (medido em 2026-09-16, pedido do usuário:
   * "às vezes quando vou logar o sistema fica muito lento... e carrega com
   * informações incompletas"): com a instância fria, a 1ª requisição leva
   * ~20-25s e devolve HTTP 404 no 2º salto; com ela quente, 16 requisições
   * paralelas voltam 200 em ~1,5s. Como o 404 estoura ANTES de existir JSON,
   * o retry do ERRO_ACTION_AUSENTE_ nunca cobria esse caso - as chamadas
   * morriam caladas (preCarregar engole erro) e a aba ficava sem dado.
   * Uma nova tentativa logo depois já pega a instância quente, por isso a
   * espera é curta.
   */
  const ESPERAS_RETRY_MS_ = [800, 2500];

  function esperar_(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function requisitar_(corpo) {
    const resposta = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(corpo)
    });
    if (!resposta.ok) {
      throw new Error('Falha de comunicação com o servidor (HTTP ' + resposta.status + ').');
    }
    return resposta.json();
  }

  async function requisitarComRetry_(corpo) {
    if (!ACOES_REPETIVEIS_.has(corpo.action)) return requisitar_(corpo);

    for (let tentativa = 0; ; tentativa++) {
      try {
        return await requisitar_(corpo);
      } catch (err) {
        if (tentativa >= ESPERAS_RETRY_MS_.length) throw err;
        await esperar_(ESPERAS_RETRY_MS_[tentativa]);
      }
    }
  }

  /**
   * O cache guarda a PROMISE, não o resultado - assim duas chamadas idênticas
   * disparadas ao mesmo tempo viram uma requisição só. Sem isso, o
   * pré-carregamento do login (SOF + Notas de Empenho + Recibos pedindo
   * listarUnidades/listarOpcoes juntos) mandava a mesma requisição 3x: quando
   * a 2ª e a 3ª saíam, a 1ª ainda não tinha voltado, então não havia nada no
   * cache pra elas encontrarem - carga tripla justo no cold start.
   * Promise rejeitada é removida na hora: erro não fica grudado no cache.
   */
  function chamar(action, payload, opcoes) {
    const usarCache = !!(opcoes && opcoes.cache);
    if (!usarCache) return executar_(action, payload, opcoes);

    const chave = chaveCache(action, payload);
    if (cache.has(chave)) return cache.get(chave);

    const promessa = executar_(action, payload, opcoes);
    cache.set(chave, promessa);
    promessa.catch(() => { cache.delete(chave); });
    return promessa;
  }

  /**
   * opcoes.silencioso: pra chamadas de limpeza/"fire and forget" que o
   * usuário não precisa esperar (ex.: liberar a trava de edição simultânea ao
   * fechar um modal que já sumiu da tela, marcar um card como visualizado).
   * Sem isso, toda chamada trava a tela inteira com o spinner global até a
   * requisição terminar - mesmo quando não há nada visível esperando por ela,
   * o que é sentido como lentidão mesmo já sendo uma chamada não bloqueante
   * no código (ver PROGRESS.md, seção de Performance).
   */
  async function executar_(action, payload, opcoes) {
    const corpo = Object.assign({ action, token }, payload || {});
    const silencioso = !!(opcoes && opcoes.silencioso);

    if (!silencioso) UI.mostrarCarregando();
    try {
      let json = await requisitarComRetry_(corpo);
      if (!json.ok && json.error === ERRO_ACTION_AUSENTE_) {
        json = await requisitarComRetry_(corpo);
      }

      if (!json.ok) {
        if (json.error && json.error.toLowerCase().indexOf('sessão') !== -1) {
          Auth.encerrarSessaoLocal();
          App.mostrarTelaLogin();
        }
        const erro = new Error(json.error || 'Erro desconhecido retornado pelo servidor.');
        // dados (sessão 2026-08-12): payload extra que o backend às vezes manda
        // junto com o erro (ver fail_ em Utils.gs) - hoje só texto_ocr_debug em
        // lerAnexoNotaEmpenho, pra diagnosticar leituras que falharam (antes
        // esse texto só vinha em respostas de sucesso, exatamente o oposto de
        // quando faz falta). undefined pra qualquer chamada que não manda nada.
        erro.dados = json.data;
        throw erro;
      }
      return json.data;
    } finally {
      if (!silencioso) UI.esconderCarregando();
    }
  }

  return { chamar, definirToken, invalidarCache };
})();
