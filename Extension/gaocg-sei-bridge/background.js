/**
 * GAOCG Conecta — background.js
 *
 * Recebe mensagens externas do app GAOCG (via chrome.runtime.sendMessage com o
 * ID desta extensão) e repassa para a aba do SEI que estiver com o processo
 * certo aberto, acionando o content script (content-sei.js).
 *
 * Formato esperado da mensagem vinda do GAOCG:
 * {
 *   type: "ENVIAR_DOCUMENTO",
 *   numeroProcesso: "00000.000000/2026-00",   // opcional, ajuda a achar a aba certa
 *   documento: {
 *     tipo: "sof",                             // "sof" | "nota_empenho" | "recibo"
 *     numero: "SOF 123/2026",                  // vira o "Número/Nome na árvore"
 *     descricaoEspecificacao: "SOF referente a ...",
 *     observacoes: "",
 *     nivelAcesso: "publico",                  // "publico" | "restrito" | "sigiloso"
 *     conteudoHtml: "<p>...</p>",              // corpo do documento (HTML simples)
 *     autoEnviar: false                        // true = já clica em "Confirmar Dados"
 *   }
 * }
 *
 * Segundo tipo de mensagem externa, só consulta (sessão 2026-08-14, restaurado
 * 2026-09-03 depois de a sincronização com a v0.46.0 ter derrubado esse trecho
 * sem querer):
 * { type: "CONSULTAR_NUMERO_SOF", numeroProcesso: "00000.000000/2026-00" }
 * -> { ok: true, numero: "173/2026", capturadoEm: <epoch ms> } ou { ok: false }
 * se a extensão ainda não capturou o número gerado pelo SEI pra este processo
 * (ver consultarNumeroSofCapturado_/guardarNumeroSofCapturado_ abaixo).
 */

/**
 * Host único do SEI (SES-PE). Antes eram padrões abertos (`*://*.br/*...`), que
 * davam à extensão acesso a praticamente qualquer site .br - permissão muito
 * além do necessário. Precisa bater com `host_permissions` e `content_scripts`
 * do manifest.json.
 */
const SEI_TAB_URL_PATTERN = "https://sei.pe.gov.br/*";

// A checagem de "é a página do processo" passou a ser feita no content script
// (conferirProcesso_ -> ehPaginaDeProcesso), que enxerga a URL real de cada aba.

/**
 * Localiza a aba que está com EXATAMENTE o processo informado aberto.
 *
 * Mudança de segurança (2026-08-10, pedido do usuário): antes havia um fallback
 * para "qualquer aba do SEI aberta" quando o número não batia. Isso significa
 * que, com o processo errado em foco, o documento seria criado NO PROCESSO
 * ERRADO - dentro de um sistema de processos oficial, sem nenhum aviso. Agora,
 * não achou o número exato, não faz nada: devolve erro e pede para abrir o
 * processo certo.
 *
 * A conferência é feita perguntando ao content script de cada aba quais números
 * de processo ela EXIBE, e não olhando a URL: a URL do `procedimento_trabalhar`
 * traz `id_procedimento`, um id interno do banco, que não tem relação com o
 * número que o analista digitou na SOF.
 */
async function acharAbaDoProcesso_(numeroProcesso) {
  const tabs = await chrome.tabs.query({ url: SEI_TAB_URL_PATTERN });
  if (!tabs.length) return { aba: null, motivo: "sem_abas" };

  const porRecente = lista => lista.slice().sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  const candidatas = [];

  for (const aba of porRecente(tabs)) {
    let resposta = null;
    try {
      resposta = await enviarParaAba(aba.id, { type: "CONFERIR_PROCESSO", numero: numeroProcesso });
    } catch (e) {
      continue; // aba do SEI sem content script utilizável - ignora
    }
    // EXIGE estar na página do processo, não só exibir o número.
    //
    // Bug encontrado no 7º teste (2026-08-10): a tela "Controle de Processos"
    // LISTA vários números de processo. Se o processo alvo estivesse nessa
    // lista, a conferência achava o número e dava a aba como válida - mas ali
    // não existe árvore nem botão "Incluir Documento", então a criação
    // quebrava logo depois. Estar listado não é estar aberto.
    if (resposta && resposta.tem && resposta.ehPaginaDeProcesso) {
      candidatas.push({ aba: aba });
    }
  }

  if (!candidatas.length) return { aba: null, motivo: "processo_nao_aberto" };
  return { aba: candidatas[0].aba, motivo: "ok" };
}

/**
 * Processo não está aberto: guarda o envio INTEIRO (documento + número) e abre
 * uma aba nova no SEI já pesquisando o processo.
 *
 * O envio guardado é o que permite a extensão **retomar sozinha** assim que o
 * analista abrir o processo certo (ver retomarEnvioPendente_ em
 * content-sei.js) - antes era preciso voltar ao GAOCG e clicar em enviar de
 * novo, um passo a mais sem necessidade, já que a intenção foi declarada no
 * primeiro clique.
 *
 * Aba NOVA de propósito: não mexe no que o analista já tem aberto.
 */
async function agendarEnvioEAbrirPesquisa_(numeroProcesso, documento) {
  try {
    await chrome.storage.local.set({
      envioPendente: { numeroProcesso: numeroProcesso, documento: documento, criadoEm: Date.now() }
    });

    // Reaproveita uma aba do SEI que já esteja aberta: a barra "Pesquisar..."
    // do canto superior existe em QUALQUER tela do SEI (Controle de Processos
    // inclusive), então abrir uma aba nova só para pesquisar era desperdício -
    // observação do usuário no 7º teste.
    const tabs = await chrome.tabs.query({ url: SEI_TAB_URL_PATTERN });
    const aba = tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
    if (aba) {
      await chrome.tabs.update(aba.id, { active: true });
      try { await chrome.windows.update(aba.windowId, { focused: true }); } catch (e) { /* janela sumiu */ }
      try {
        const r = await enviarParaAba(aba.id, { type: "PESQUISAR_PROCESSO", numero: numeroProcesso });
        if (r && r.ok) return { ok: true, modo: "aba_atual" };
      } catch (e) { /* cai para aba nova */ }
    }

    // Nenhuma aba utilizável: aí sim abre uma nova e deixa o número guardado
    // para o content script daquela aba pesquisar quando carregar.
    await chrome.storage.local.set({ processoParaAbrir: { numero: numeroProcesso, criadoEm: Date.now() } });
    await chrome.tabs.create({ url: "https://sei.pe.gov.br/", active: true });
    return { ok: true, modo: "aba_nova" };
  } catch (e) {
    return { ok: false };
  }
}

/**
 * Manda a mensagem para o content script da aba. Se a aba do SEI já estava
 * aberta ANTES da extensão ser instalada/recarregada, o content script não foi
 * injetado nela e o sendMessage falha com "Could not establish connection" -
 * caso muito comum na prática. Nesse cenário, injeta o script sob demanda
 * (permissão `scripting`) e tenta de novo, em vez de mandar o usuário recarregar
 * a aba do SEI na mão.
 */
async function enviarParaAba(abaId, payload) {
  try {
    return await chrome.tabs.sendMessage(abaId, payload);
  } catch (erro) {
    if (!String(erro).includes("Could not establish connection")) throw erro;
    await chrome.scripting.executeScript({
      target: { tabId: abaId },
      files: ["content-sei.js"]
    });
    return await chrome.tabs.sendMessage(abaId, payload);
  }
}

/**
 * Roda DENTRO da página (main world), não no content script. Recebe só o `html`
 * por `args` - não pode fechar sobre nenhuma variável daqui, porque a função é
 * serializada para ser executada no outro contexto.
 *
 * ===== Por que escolher UMA instância, e não todas =====
 *
 * Um documento do SEI é dividido em seções pré-definidas - cabeçalho,
 * principal, rodapé e assinatura (documentação oficial do SEI) - e cada uma é
 * uma instância separada do CKEditor. Só a "principal" aceita edição; as outras
 * ficam travadas (read-only).
 *
 * Bug real (4º teste, 2026-08-10): a v0.5.x chamava setData em TODAS as
 * instâncias, ou seja, escrevia o documento inteiro por cima do cabeçalho e do
 * rodapé também. O usuário viu as três áreas e só a do meio editável.
 *
 * Critério de escolha, nesta ordem:
 *   1. descarta as read-only (é o discriminador confiável - o próprio SEI trava
 *      cabeçalho/rodapé);
 *   2. entre as restantes, prefere uma cujo nome remeta ao corpo do documento;
 *   3. empatando, a de maior altura visível (o corpo é sempre a maior).
 *
 * Também loga as instâncias encontradas no console DA PÁGINA DO SEI - é onde o
 * usuário consegue ver os nomes reais e me reportar, caso a heurística erre.
 */
function aplicarViaCkeditor_(html) {
  try {
    // ===== CKEditor 5 (SEI atualizado em 2026-11) =====
    // Não existe `CKEDITOR.instances`: cada área editável (div
    // `.ck-editor__editable`) carrega o editor dono dela em `ckeditorInstance`.
    // Uma seção pode ser um editor separado ou uma "raiz" de um editor
    // multi-raiz com barra única - por isso o conteúdo vai para a RAIZ dessa
    // área (`data.set({ raiz: html })`), nunca para o editor inteiro, que
    // apagaria cabeçalho e rodapé.
    // Esta função é serializada para o MAIN world e não enxerga as funções
    // do resto do arquivo: tudo o que ela usa precisa estar aqui dentro.
    const areasCk5 = Array.from(document.querySelectorAll(".ck-editor__editable"))
      .filter(el => el.ckeditorInstance);
    if (areasCk5.length) {
      const info = areasCk5.map(el => {
        const editor = el.ckeditorInstance;
        let raiz = null;
        try {
          const nomes = editor.ui && editor.ui.getEditableElementsNames
            ? Array.from(editor.ui.getEditableElementsNames())
            : [];
          raiz = nomes.find(n => editor.ui.getEditableElement(n) === el) || null;
        } catch (e) { /* versão sem a API de nomes */ }
        return {
          el: el,
          editor: editor,
          raiz: raiz,
          readOnly: !!editor.isReadOnly || el.getAttribute("contenteditable") !== "true",
          altura: el.offsetHeight || 0,
          status: editor.state
        };
      });
      console.log("[GAOCG Conecta] áreas CKEditor 5 nesta página:",
        info.map(i => ({ raiz: i.raiz, readOnly: i.readOnly, altura: i.altura, status: i.status })));

      const prontas = info.filter(i => i.status === "ready" || i.status === undefined);
      if (!prontas.length) return { ok: false, motivo: "CKEditor 5 ainda não está pronto" };
      const editaveis = prontas.filter(i => !i.readOnly);
      const candidatas = editaveis.length ? editaveis : prontas;
      // No SEI (diagnóstico real, 2026-11-03) são três editores inline -
      // cabeçalho e rodapé travados e o corpo com a classe `infra-edit`.
      const escolhida =
        candidatas.find(i => i.el.classList.contains("infra-edit")) ||
        candidatas.find(i => /principal|conteudo|conteúdo|corpo|texto/i.test(i.raiz || "")) ||
        candidatas.slice().sort((a, b) => b.altura - a.altura)[0];

      if (escolhida.raiz) {
        escolhida.editor.data.set({ [escolhida.raiz]: html });
      } else {
        escolhida.editor.setData(html);
      }
      console.log("[GAOCG Conecta] conteúdo aplicado (CKEditor 5) na raiz:", escolhida.raiz || "main");
      return { ok: true, escolhida: escolhida.raiz || "main" };
    }

    // ===== CKEditor 4 (SEI até 2026-10) =====
    const CK = window.CKEDITOR;
    if (!CK || !CK.instances) return { ok: false, motivo: "CKEDITOR não encontrado nesta página" };

    const info = Object.keys(CK.instances).map(nome => {
      const instancia = CK.instances[nome];
      let altura = 0;
      try {
        if (instancia.ui && instancia.ui.contentsElement && instancia.ui.contentsElement.$) {
          altura = instancia.ui.contentsElement.$.offsetHeight || 0;
        }
      } catch (e) { /* instância ainda montando */ }
      return { nome: nome, readOnly: !!instancia.readOnly, altura: altura, status: instancia.status };
    });
    console.log("[GAOCG Conecta] instâncias CKEditor nesta página:", info);
    if (!info.length) return { ok: false, motivo: "nenhuma instância de CKEditor" };

    // Instância ainda montando ("loaded"/"unloaded") descarta o setData quando
    // termina de carregar o modelo - por isso só as prontas contam.
    const prontas = info.filter(i => i.status === "ready");
    if (!prontas.length) return { ok: false, motivo: "CKEditor ainda não está pronto" };

    const editaveis = prontas.filter(i => !i.readOnly);
    const candidatas = editaveis.length ? editaveis : prontas;
    const escolhida =
      candidatas.find(i => /principal|conteudo|conteúdo|corpo|texto/i.test(i.nome)) ||
      candidatas.slice().sort((a, b) => b.altura - a.altura)[0];

    const instancia = CK.instances[escolhida.nome];
    if (!instancia || typeof instancia.setData !== "function") {
      return { ok: false, motivo: "instância sem setData" };
    }
    instancia.setData(html);
    console.log("[GAOCG Conecta] conteúdo aplicado na instância:", escolhida.nome);
    return { ok: true, escolhida: escolhida.nome, candidatas: info };
  } catch (e) {
    return { ok: false, motivo: String(e && e.message ? e.message : e) };
  }
}

/**
 * Mensagem INTERNA (do content script). O content script roda em contexto
 * isolado e não enxerga `window.CKEDITOR`; só a API `chrome.scripting` com
 * `world: "MAIN"` alcança o objeto real da página. `allFrames: true` porque o
 * editor do SEI costuma estar num iframe - a função devolve false nos frames
 * que não têm CKEditor, e basta um dar certo.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "INJETAR_CKEDITOR") return false;
  (async () => {
    try {
      if (!sender.tab || sender.tab.id === undefined) {
        sendResponse({ ok: false, erro: "Remetente sem aba." });
        return;
      }
      const resultados = await chrome.scripting.executeScript({
        target: { tabId: sender.tab.id, allFrames: true },
        world: "MAIN",
        func: aplicarViaCkeditor_,
        args: [message.html]
      });
      // Só o frame que hospeda o editor tem CKEDITOR; os demais devolvem
      // ok:false. Basta um ter dado certo.
      const sucesso = resultados.map(r => r && r.result).filter(r => r && r.ok)[0];
      sendResponse(sucesso
        ? { ok: true, escolhida: sucesso.escolhida }
        : { ok: false, erro: "Nenhum frame aplicou o conteúdo pela API do CKEditor." });
    } catch (erro) {
      sendResponse({ ok: false, erro: String(erro && erro.message ? erro.message : erro) });
    }
  })();
  return true;
});

/** Só dígitos - mesma normalização usada pelo content script (digitos_ em content-sei.js), pra bater com a chave gravada por guardarNumeroSofCapturado_. */
function digitosProcesso_(texto) {
  return String(texto || "").replace(/\D/g, "");
}

/**
 * "gostaria de saber se existe a possibilidade de a extensão devolver o
 * valor da SOF que foi pega no SEI" (sessão 2026-08-14, pedido do usuário).
 *
 * O número (ex.: "173/2026") só existe depois que o SEI gera o modelo do
 * documento - isso acontece bem depois do sendMessage de ENVIAR_DOCUMENTO já
 * ter respondido (o editor abre em outra janela/aba, minutos depois). Por
 * isso é um canal À PARTE, por consulta: o content script grava o número
 * assim que descobre (ver guardarNumeroSofCapturado_, content-sei.js) e o
 * app pergunta por ele quando quiser (botão "🔄 SEI" no campo Nº SOF, ver
 * js/sof.js) - não precisa de aba do SEI aberta pra responder, é só ler o
 * chrome.storage.local.
 */
async function consultarNumeroSofCapturado_(numeroProcesso) {
  const chave = digitosProcesso_(numeroProcesso);
  if (!chave) return { ok: false, erro: "Número do processo não informado." };
  const dados = await chrome.storage.local.get("numerosSofCapturados");
  const mapa = (dados && dados.numerosSofCapturados) || {};
  const achado = mapa[chave];
  if (!achado) return { ok: false };
  return { ok: true, numero: achado.numero, capturadoEm: achado.capturadoEm };
}

/**
 * Acesso ao app GAOCG para o botão "Anexar documentos do processo" (2026-11-05). O próprio
 * app avisa a sessão a cada login, troca de senha e saída (js/sei-bridge.js). O token fica
 * em storage.session: some ao fechar o navegador e, por padrão, não é visível para content
 * scripts - a página do SEI pede a ação daqui e só recebe o resultado.
 */
const URL_API_GAOCG_ = "https://fszbykarwastqaadpwmd.supabase.co/functions/v1/api";
const CHAVE_SESSAO_GAOCG_ = "sessaoGaocg";
// documentosSeiProcessados/anexarDocumentoSeiRecibo (2026-11-11): LE/OB do processo anexadas
// sozinhas no Recibo (ReciboSei.gs). A segunda grava, mas é idempotente por documento do SEI
// no backend, então o retry de postarNoAppGaocg_ não anexa duas vezes.
// documentosSeiNeProcessados/anexarNeSeiSof (2026-11-13): NEs do processo anexadas sozinhas na SOF (NeSei.gs),
// só com o SEI na unidade SES-GAOCG. Também idempotente por documento do SEI.
// preverReciboAcompanhamentoSei/criarReciboAcompanhamentoSei (2026-11-17): Recibo criado pelo cartão do
// Acompanhamento Especial (AcompanhamentoSei.gs). A segunda grava, mas é idempotente por processo do SEI.
// listarNesMaeEfisco/anexarObEfiscoRecibo (2026-11-19): OBs do E-fisco das NEs mãe do app (ObEfisco.gs). Só o
// background chama (verificação periódica e página obs-efisco.html); a segunda grava, idempotente pelo número da OB.
const ACOES_DOCUMENTOS_GAOCG_ = ["listarDocumentosProcesso", "baixarDocumentoProcesso", "baixarDocumentosProcesso", "processoSeiNoApp", "documentosSeiProcessados", "anexarDocumentoSeiRecibo", "documentosSeiNeProcessados", "anexarNeSeiSof", "lerSofSei", "importarSofSei", "preverReciboAcompanhamentoSei", "criarReciboAcompanhamentoSei", "listarNesMaeEfisco", "anexarObEfiscoRecibo",
  "enviarDocumentoBase", "excluirDocumentoBase", "substituirDocumentoBase", "criarPastaBase", "salvarOrdemDocumentos", "renomearDocumentoBase"];
// Gerenciar a base de documentos pelo card (2026-11-24). Estas gravam e NÃO são idempotentes: sem repetição
// automática, para um envio que demorou não virar dois arquivos no Drive.
const ACOES_SEM_REPETIR_GAOCG_ = ["enviarDocumentoBase", "excluirDocumentoBase", "substituirDocumentoBase", "criarPastaBase", "importarSofSei"];
const ESPERAS_API_GAOCG_MS_ = [800, 2500];

async function guardarSessaoGaocg_(token) {
  if (token) await chrome.storage.session.set({ [CHAVE_SESSAO_GAOCG_]: token });
  else await chrome.storage.session.remove(CHAVE_SESSAO_GAOCG_);
}

/** Repetir é seguro (leituras, e a única escrita é idempotente): a primeira chamada costuma pegar o script frio. */
async function postarNoAppGaocg_(corpo, semRepetir) {
  for (let tentativa = 0; ; tentativa++) {
    try {
      const resposta = await fetch(URL_API_GAOCG_, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(corpo)
      });
      if (!resposta.ok) throw new Error("O app GAOCG respondeu com erro (HTTP " + resposta.status + ").");
      return await resposta.json();
    } catch (erro) {
      if (semRepetir || tentativa >= ESPERAS_API_GAOCG_MS_.length) throw erro;
      await new Promise(r => setTimeout(r, ESPERAS_API_GAOCG_MS_[tentativa]));
    }
  }
}

async function chamarAppGaocg_(acao, dados) {
  if (!ACOES_DOCUMENTOS_GAOCG_.includes(acao)) return { ok: false, erro: "Ação não permitida." };
  const guardado = await chrome.storage.session.get(CHAVE_SESSAO_GAOCG_);
  const token = guardado[CHAVE_SESSAO_GAOCG_];
  const semSessao = "Entre no app GAOCG neste navegador e tente de novo.";
  if (!token) return { ok: false, erro: semSessao };
  const json = await postarNoAppGaocg_(Object.assign({}, dados, { action: acao, token: token }), ACOES_SEM_REPETIR_GAOCG_.includes(acao));
  if (json.ok) return { ok: true, dados: json.data };
  if (json.error && json.error.toLowerCase().indexOf("sessão") !== -1) {
    await guardarSessaoGaocg_(null);
    return { ok: false, erro: semSessao };
  }
  return { ok: false, erro: json.error || "O app GAOCG não respondeu." };
}

/**
 * Avisa as abas do app abertas neste navegador que um Recibo mudou (2026-11-11, pedido
 * do usuário: a lista de Recibos atualiza na hora quando a extensão anexa LE/OB). Quem
 * repassa para a página é content-app.js; aba sem ele (app em outra origem) só ignora.
 */
const URLS_APP_GAOCG_ = ["https://andersong2021.github.io/APP-GAOCG/*", "https://dgmcg-ses-pe.github.io/gaocg-sistema/*", "https://gaocg.netlify.app/*"];

async function avisarAppRecibosAlterados_(alteracoes) {
  try {
    const abas = await chrome.tabs.query({ url: URLS_APP_GAOCG_ });
    await Promise.all(abas.map(aba =>
      chrome.tabs.sendMessage(aba.id, { type: "GAOCG_RECIBOS_ALTERADOS", alteracoes: alteracoes }).catch(() => {})
    ));
  } catch (e) { /* melhor esforço: a lista também se confere ao voltar para a aba do app */ }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "DOCUMENTOS_GAOCG") return false;
  if (sender.id !== chrome.runtime.id || !sender.tab || !/^https:\/\/sei\.pe\.gov\.br\//.test(sender.url || "")) {
    sendResponse({ ok: false, erro: "Origem não permitida." });
    return false;
  }
  chamarAppGaocg_(message.acao, message.dados)
    .then(resposta => {
      const r = resposta && resposta.ok && resposta.dados;
      if (message.acao === "anexarDocumentoSeiRecibo" && r && r.resultado === "anexado") {
        avisarAppRecibosAlterados_([{
          recibo_id: r.recibo_id, recibo_descricao: r.recibo_descricao || "", tipo: r.tipo, numero_documento: r.numero_documento
        }]);
      }
      if (message.acao === "criarReciboAcompanhamentoSei" && r && (r.resultado === "criado" || r.resultado === "vinculado")) {
        avisarAppRecibosAlterados_((r.recibos || []).map(x => ({
          recibo_id: x.id, recibo_descricao: x.descricao || "",
          texto: (r.resultado === "criado" ? "Recibo " + x.id + " criado" : "Processo " + x.numero_processo + " informado no recibo " + x.id) +
            (r.dividido ? " em parcelas" : "") +
            " a partir do acompanhamento do SEI" + (x.descricao ? " (" + x.descricao + ")" : "")
        })));
      }
      sendResponse(resposta);
    })
    .catch(erro => sendResponse({ ok: false, erro: String(erro && erro.message ? erro.message : erro) }));
  return true;
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message && message.type === "SESSAO_GAOCG") {
        await guardarSessaoGaocg_(message.token);
        sendResponse({ ok: true });
        // Busca de OBs do E-fisco que parou por falta de login no app: retoma assim que ele entra.
        if (message.token && (await lerEstadoEfisco_()).situacao === "sem_app") verificarObsEfisco_({});
        return;
      }

      if (message && message.type === "CONSULTAR_NUMERO_SOF") {
        sendResponse(await consultarNumeroSofCapturado_(message.numeroProcesso));
        return;
      }

      if (!message || message.type !== "ENVIAR_DOCUMENTO") {
        sendResponse({ ok: false, erro: "Tipo de mensagem não suportado." });
        return;
      }

      const numero = message.numeroProcesso;
      if (!numero) {
        sendResponse({ ok: false, erro: "Número do processo SEI não informado pelo GAOCG." });
        return;
      }

      const busca = await acharAbaDoProcesso_(numero);
      if (!busca.aba) {
        // Nenhuma aba com ESTE processo: guarda o envio, abre a pesquisa numa
        // aba nova e a extensão retoma sozinha quando o processo abrir. Nunca
        // cai para "qualquer aba do SEI" - ver acharAbaDoProcesso_.
        const agendamento = await agendarEnvioEAbrirPesquisa_(numero, message.documento);
        sendResponse({
          ok: false,
          processoNaoAberto: true,
          envioAgendado: !!agendamento.ok,
          erro: agendamento.ok
            ? "O processo " + numero + " não estava aberto. Pesquisei ele no SEI"
              + (agendamento.modo === "aba_nova" ? " numa aba nova" : "")
              + " - é só abrir o processo que o documento é criado automaticamente."
            : "O processo " + numero + " não está aberto em nenhuma aba do SEI. Abra o processo e tente de novo."
        });
        return;
      }
      const aba = busca.aba;

      // Traz a aba do SEI para a frente ANTES de preencher: o usuário vê o
      // formulário sendo montado e já fica na tela onde precisa revisar. Se o
      // preenchimento falhar no meio, ele está olhando exatamente onde parou.
      await chrome.tabs.update(aba.id, { active: true });
      try { await chrome.windows.update(aba.windowId, { focused: true }); } catch (e) { /* janela pode ter sumido */ }

      const resposta = await enviarParaAba(aba.id, {
        type: "PREENCHER_DOCUMENTO",
        documento: message.documento,
        // Repassado ao content script pra ele guardar o número gerado pelo
        // SEI sob esta mesma chave (ver guardarNumeroSofCapturado_/
        // CONSULTAR_NUMERO_SOF acima, sessão 2026-08-14).
        numeroProcesso: numero
      });
      sendResponse(resposta);
    } catch (erro) {
      sendResponse({ ok: false, erro: String(erro && erro.message ? erro.message : erro) });
    }
  })();
  return true; // mantém o canal aberto para a resposta assíncrona
});

/* =====================================================================
 * OBs do E-fisco (2026-11-19, pedido do usuário)
 *
 * De tempos em tempos (alarme), a extensão pede ao app as NEs mãe cadastradas
 * (listarNesMaeEfisco), fica só com as dos tipos de unidade que o usuário cuida
 * (painel: Hospitais / UPAs / UPAEs + Carretas) e consulta no E-fisco, com o login
 * que ele já tem no navegador, as Ordens Bancárias de cada uma (offscreen-efisco.js).
 * OB nova vira notificação; o usuário escolhe na página obs-efisco.html quais anexar
 * e só então a extensão baixa o PDF e manda para o app (anexarObEfiscoRecibo).
 * NUNCA anexa no SEI: quem junta a OB no processo é outro setor.
 *
 * - Só entra OB PAGA e assinada (o PDF só sai assinado; antes de paga ela ainda muda).
 * - Linha de base: na 1ª consulta de cada NE, as OBs que já existiam não geram aviso -
 *   ficam em "Anteriores" na página, para o usuário anexar se quiser.
 * - A consulta troca o contexto da tela de Ordem Bancária no E-fisco, mas não espera
 *   nem pergunta se ela estiver aberta numa aba (pedido do usuário, v0.62.1).
 * ===================================================================== */
const CHAVE_EFISCO_CONFIG_ = "efiscoConfig";        // { ativo, grupos: ["hospital", "upa", "upae_carreta"], intervaloMin }
const CHAVE_EFISCO_ESTADO_ = "efiscoEstado";        // { situacao, mensagem, ultimaVerificacao, emAndamento, progresso }
const CHAVE_EFISCO_OBS_ = "efiscoObs";              // { "2026OB095602": { linha do E-fisco + unidade, estado, motivo, recibo... } }
const CHAVE_EFISCO_NES_VISTAS_ = "efiscoNesVistas"; // { "2026NE000418": epoch da 1ª consulta }
const ALARME_EFISCO_ = "efisco-obs";
const URL_EFISCO_ = "https://efisco.sefaz.pe.gov.br/";
// Netlify desde 2026-11-23: o firewall da SES está bloqueando o github.io (v0.63.5).
const URL_APP_GAOCG_ = "https://gaocg.netlify.app/";
const GRUPOS_UNIDADE_EFISCO_ = { hospital: ["HOSPITAL"], upa: ["UPA"], upae_carreta: ["UPAE", "CARRETA"] };
const CONFIG_EFISCO_PADRAO_ = { ativo: true, grupos: [], intervaloMin: 30 };
const PAUSA_ENTRE_NES_MS_ = 300;
const DIAS_GUARDAR_RESOLVIDAS_ = 60;

let verificandoEfisco_ = false;
let anexandoEfisco_ = false;

async function lerConfigEfisco_() {
  const d = await chrome.storage.local.get(CHAVE_EFISCO_CONFIG_);
  return Object.assign({}, CONFIG_EFISCO_PADRAO_, d[CHAVE_EFISCO_CONFIG_] || {});
}

async function configurarAlarmeEfisco_() {
  const config = await lerConfigEfisco_();
  const atual = await chrome.alarms.get(ALARME_EFISCO_);
  if (!config.ativo) {
    if (atual) await chrome.alarms.clear(ALARME_EFISCO_);
    return;
  }
  const periodo = Math.max(5, Number(config.intervaloMin) || CONFIG_EFISCO_PADRAO_.intervaloMin);
  if (atual && atual.periodInMinutes === periodo) return;
  await chrome.alarms.create(ALARME_EFISCO_, { delayInMinutes: 1, periodInMinutes: periodo });
}

async function lerEstadoEfisco_() {
  const d = await chrome.storage.local.get(CHAVE_EFISCO_ESTADO_);
  return d[CHAVE_EFISCO_ESTADO_] || {};
}

async function atualizarEstadoEfisco_(parcial) {
  const atual = await lerEstadoEfisco_();
  await chrome.storage.local.set({ [CHAVE_EFISCO_ESTADO_]: Object.assign({}, atual, parcial) });
}

/** Avisa (notificação) só quando a situação MUDA para sem login - não a cada verificação. */
async function mudarSituacaoEfisco_(situacao, mensagem) {
  const anterior = await lerEstadoEfisco_();
  await atualizarEstadoEfisco_({
    situacao: situacao, mensagem: mensagem || "", emAndamento: false, progresso: "",
    ultimaTentativa: Date.now(), ultimaVerificacao: situacao === "ok" ? Date.now() : anterior.ultimaVerificacao
  });
  if (anterior.situacao === situacao) return;
  if (situacao === "sem_login") {
    await notificarEfisco_("efisco-login", "GAOCG: entre no E-fisco",
      "Para buscar as Ordens Bancárias novas, entre no E-fisco neste navegador. A extensão tenta de novo sozinha.",
      [{ title: "Abrir o E-fisco" }]);
  } else if (situacao === "sem_app") {
    await notificarEfisco_("efisco-app", "GAOCG: entre no app",
      "Para buscar as Ordens Bancárias novas, entre no app GAOCG neste navegador.",
      [{ title: "Abrir o app GAOCG" }]);
  }
}

async function notificarEfisco_(id, titulo, mensagem, botoes) {
  try {
    await chrome.notifications.create(id, {
      type: "basic", iconUrl: "icons/icon-128.png", title: titulo, message: mensagem,
      buttons: botoes || [], requireInteraction: true, priority: 2
    });
  } catch (e) { /* notificações bloqueadas no sistema - o painel e o selo do ícone continuam mostrando */ }
}

/** Fila para ler-alterar-gravar efiscoObs sem uma operação apagar a outra (busca x dispensar x anexar). */
let filaObsEfisco_ = Promise.resolve();
function atualizarObsEfisco_(alterar) {
  const passo = filaObsEfisco_.then(async () => {
    const d = await chrome.storage.local.get(CHAVE_EFISCO_OBS_);
    const obs = d[CHAVE_EFISCO_OBS_] || {};
    const retorno = await alterar(obs);
    await chrome.storage.local.set({ [CHAVE_EFISCO_OBS_]: obs });
    return retorno;
  });
  filaObsEfisco_ = passo.catch(() => {});
  return passo;
}

function novasParaAviso_(obs) {
  return Object.values(obs).filter(o => o.estado === "nova" && !o.linhaDeBase);
}

async function atualizarSeloEfisco_() {
  const d = await chrome.storage.local.get(CHAVE_EFISCO_OBS_);
  const n = novasParaAviso_(d[CHAVE_EFISCO_OBS_] || {}).length;
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#2f7d4a" });
    await chrome.action.setBadgeText({ text: n ? String(n) : "" });
    await chrome.action.setTitle({ title: "GAOCG Conecta" + (n ? " - " + n + " OB(s) nova(s) do E-fisco" : "") });
  } catch (e) { /* sem selo não impede nada */ }
}

function normalizarTipoUnidade_(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
}

function tiposDosGrupos_(grupos) {
  return [].concat(...(grupos || []).map(g => GRUPOS_UNIDADE_EFISCO_[g] || []));
}

/* ---------- documento offscreen (leitor do E-fisco) ---------- */
let criandoOffscreen_ = null;
let tarefasEfisco_ = 0;

async function garantirOffscreen_() {
  const url = chrome.runtime.getURL("offscreen.html");
  const existentes = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
  if (existentes.length) return;
  if (!criandoOffscreen_) {
    criandoOffscreen_ = chrome.offscreen.createDocument({
      url: "offscreen.html", reasons: ["DOM_PARSER"],
      justification: "Ler as telas de Ordem Bancária do E-fisco, com o login do próprio usuário."
    }).finally(() => { criandoOffscreen_ = null; });
  }
  await criandoOffscreen_;
}

async function pedirAoEfisco_(pedido) {
  await garantirOffscreen_();
  const resposta = await chrome.runtime.sendMessage(Object.assign({ alvo: "offscreen-efisco" }, pedido));
  if (!resposta) throw new Error("O leitor do E-fisco não respondeu.");
  return resposta;
}

/** Abre o leitor para a tarefa e fecha quando nenhuma outra estiver usando. */
async function comLeitorEfisco_(tarefa) {
  tarefasEfisco_++;
  try {
    return await tarefa();
  } finally {
    tarefasEfisco_--;
    if (!tarefasEfisco_) { try { await chrome.offscreen.closeDocument(); } catch (e) { /* já fechado */ } }
  }
}

/* ---------- busca ---------- */
async function verificarObsEfisco_(opcoes) {
  opcoes = opcoes || {};
  const manual = !!opcoes.manual;
  if (verificandoEfisco_ || anexandoEfisco_) return { ok: false, erro: "Já existe uma busca ou anexação em andamento." };
  const config = await lerConfigEfisco_();
  if (!manual && !config.ativo) return { ok: false, erro: "A busca automática está desligada." };
  const tipos = tiposDosGrupos_(config.grupos);
  if (!tipos.length) {
    await mudarSituacaoEfisco_("sem_tipos", "Escolha no painel da extensão os tipos de unidade que você cuida.");
    return { ok: false, erro: "Escolha os tipos de unidade que você cuida." };
  }

  verificandoEfisco_ = true;
  await atualizarEstadoEfisco_({ emAndamento: true, progresso: "Pedindo ao app as NEs mãe..." });
  try {
    let lista;
    try { lista = await chamarAppGaocg_("listarNesMaeEfisco", {}); } catch (e) { lista = { ok: false, erro: String(e && e.message ? e.message : e) }; }
    if (!lista.ok) {
      const semApp = /Entre no app GAOCG/.test(lista.erro || "");
      await mudarSituacaoEfisco_(semApp ? "sem_app" : "erro", lista.erro || "O app GAOCG não respondeu.");
      return { ok: false, erro: lista.erro };
    }
    const nes = (lista.dados.nes || []).filter(n => tipos.indexOf(normalizarTipoUnidade_(n.tipo_unidade)) !== -1);
    const noApp = new Set((lista.dados.obs_no_app || []).map(x => String(x).toUpperCase()));
    const vistas = (await chrome.storage.local.get(CHAVE_EFISCO_NES_VISTAS_))[CHAVE_EFISCO_NES_VISTAS_] || {};
    const conhecidas = new Set(Object.keys((await chrome.storage.local.get(CHAVE_EFISCO_OBS_))[CHAVE_EFISCO_OBS_] || {}));
    const achadas = {};
    let consultadas = 0;
    let falha = null;

    await comLeitorEfisco_(async () => {
      for (const ne of nes) {
        await atualizarEstadoEfisco_({ progresso: "Consultando a NE " + ne.numero_ne + " (" + (consultadas + 1) + " de " + nes.length + ")..." });
        let r;
        try { r = await pedirAoEfisco_({ tipo: "LISTAR_OBS_NE", ne: ne.numero_ne }); } catch (e) { r = { ok: false, erro: String(e && e.message ? e.message : e) }; }
        if (!r.ok) { falha = r; break; }
        const linhaDeBase = !vistas[ne.numero_ne];
        r.dados.forEach(l => {
          if (l.situacao !== "PAGA" || !l.assinado) return;
          if (noApp.has(l.numero_ob) || conhecidas.has(l.numero_ob) || achadas[l.numero_ob]) return;
          achadas[l.numero_ob] = Object.assign({}, l, {
            ne_mae: ne.numero_ne, unidade: ne.unidade, tipo_unidade: ne.tipo_unidade, objeto: ne.objeto,
            estado: "nova", linhaDeBase: linhaDeBase, achadaEm: Date.now(), atualizadaEm: Date.now()
          });
        });
        vistas[ne.numero_ne] = vistas[ne.numero_ne] || Date.now();
        consultadas++;
        await new Promise(res => setTimeout(res, PAUSA_ENTRE_NES_MS_));
      }
    });

    // Grava o que deu para consultar, mesmo que tenha parado no meio.
    await chrome.storage.local.set({ [CHAVE_EFISCO_NES_VISTAS_]: vistas });
    const limite = Date.now() - DIAS_GUARDAR_RESOLVIDAS_ * 86400000;
    await atualizarObsEfisco_(obs => {
      Object.values(obs).forEach(o => {
        // Entrou no app por outro caminho (formulário, SEI): sai da lista.
        if (noApp.has(o.numero_ob) && (o.estado === "nova" || o.estado === "pendente")) { o.estado = "no_app"; o.atualizadaEm = Date.now(); }
        if (["anexado", "ja_estava", "no_app"].indexOf(o.estado) !== -1 && (o.atualizadaEm || 0) < limite) delete obs[o.numero_ob];
      });
      Object.keys(achadas).forEach(k => { if (!obs[k]) obs[k] = achadas[k]; });
    });
    await atualizarSeloEfisco_();

    const novas = Object.values(achadas).filter(o => !o.linhaDeBase);
    if (novas.length) await avisarObsNovas_(novas);

    if (falha) {
      await mudarSituacaoEfisco_(falha.semLogin ? "sem_login" : "erro", falha.semLogin ? "Entre no E-fisco neste navegador." : falha.erro);
      return { ok: false, erro: falha.erro, novas: novas.length };
    }
    await mudarSituacaoEfisco_("ok", nes.length
      ? consultadas + " NE(s) mãe consultada(s)" + (novas.length ? ", " + novas.length + " OB(s) nova(s)." : ", nenhuma OB nova.")
      : "Nenhuma NE mãe no app para os tipos de unidade escolhidos.");
    return { ok: true, consultadas: consultadas, novas: novas.length };
  } catch (erro) {
    await mudarSituacaoEfisco_("erro", String(erro && erro.message ? erro.message : erro));
    return { ok: false, erro: String(erro && erro.message ? erro.message : erro) };
  } finally {
    verificandoEfisco_ = false;
    await atualizarEstadoEfisco_({ emAndamento: false, progresso: "" });
  }
}

function moedaBr_(n) {
  return typeof n === "number" ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";
}

async function avisarObsNovas_(novas) {
  const linhas = novas.slice(0, 3).map(o => o.numero_ob + " · " + (o.unidade || o.ne) + " · " + moedaBr_(o.valor));
  if (novas.length > 3) linhas.push("e mais " + (novas.length - 3) + "...");
  await notificarEfisco_("efisco-novas-" + Date.now(),
    novas.length === 1 ? "GAOCG: 1 Ordem Bancária nova no E-fisco" : "GAOCG: " + novas.length + " Ordens Bancárias novas no E-fisco",
    linhas.join("\n") + "\nQuer anexar no app?",
    [{ title: "Ver e escolher quais anexar" }]);
}

/* ---------- anexação no app (nunca no SEI) ---------- */
async function anexarObsEfisco_(numeros) {
  if (verificandoEfisco_ || anexandoEfisco_) return { ok: false, erro: "Espere a busca ou a anexação em andamento terminar." };
  if (!Array.isArray(numeros) || !numeros.length) return { ok: false, erro: "Nenhuma OB escolhida." };
  anexandoEfisco_ = true;
  const resultados = [];
  try {
    const todas = (await chrome.storage.local.get(CHAVE_EFISCO_OBS_))[CHAVE_EFISCO_OBS_] || {};
    await comLeitorEfisco_(async () => {
      for (const numero of numeros) {
        const ob = todas[numero];
        if (!ob) continue;
        await atualizarObsEfisco_(obs => { if (obs[numero]) Object.assign(obs[numero], { estado: "anexando", motivo: "" }); });
        let resultado;
        let parar = false;
        try {
          const pdf = await pedirAoEfisco_({ tipo: "BAIXAR_PDF_OB", ne: ob.ne || ob.ne_mae, numeroOb: numero });
          if (!pdf.ok) {
            resultado = { estado: "pendente", motivo: pdf.semLogin ? "Entre no E-fisco neste navegador e tente de novo." : pdf.erro };
            if (pdf.semLogin) { parar = true; await mudarSituacaoEfisco_("sem_login", "Entre no E-fisco neste navegador."); }
          } else {
            const r = await chamarAppGaocg_("anexarObEfiscoRecibo", {
              numero_ob: numero, ne: ob.ne || ob.ne_mae, data_ob: ob.data, valor_efisco: ob.valor,
              arquivoBase64: pdf.dados.base64, reanexar: true
            });
            if (!r.ok) {
              resultado = { estado: "pendente", motivo: r.erro };
              if (/Entre no app GAOCG/.test(r.erro || "")) parar = true;
            } else {
              const d = r.dados;
              resultado = {
                estado: d.resultado === "anexado" || d.resultado === "ja_estava" ? d.resultado : "pendente",
                motivo: d.motivo || "", recibo_id: d.recibo_id || "", recibo_descricao: d.recibo_descricao || ""
              };
              if (d.resultado === "anexado") {
                avisarAppRecibosAlterados_([{
                  recibo_id: d.recibo_id, recibo_descricao: d.recibo_descricao || "",
                  texto: "OB " + numero + " do E-fisco anexada no recibo " + d.recibo_id + (d.recibo_descricao ? " (" + d.recibo_descricao + ")" : "")
                }]);
              }
            }
          }
        } catch (erro) {
          resultado = { estado: "pendente", motivo: String(erro && erro.message ? erro.message : erro) };
        }
        resultado.atualizadaEm = Date.now();
        await atualizarObsEfisco_(obs => { if (obs[numero]) Object.assign(obs[numero], resultado); });
        resultados.push(Object.assign({ numero_ob: numero }, resultado));
        if (parar) break;
      }
    });
  } finally {
    anexandoEfisco_ = false;
    // OB que não chegou a ser tentada (parou no meio) volta para "nova".
    await atualizarObsEfisco_(obs => Object.values(obs).forEach(o => { if (o.estado === "anexando") o.estado = "nova"; }));
    await atualizarSeloEfisco_();
  }
  return { ok: true, resultados: resultados };
}

async function dispensarObsEfisco_(numeros, restaurar) {
  await atualizarObsEfisco_(obs => (numeros || []).forEach(n => {
    if (!obs[n]) return;
    if (restaurar && obs[n].estado === "dispensada") obs[n].estado = "nova";
    else if (!restaurar && (obs[n].estado === "nova" || obs[n].estado === "pendente")) obs[n].estado = "dispensada";
    obs[n].atualizadaEm = Date.now();
  }));
  await atualizarSeloEfisco_();
  return { ok: true };
}

async function abrirListaObsEfisco_() {
  const url = chrome.runtime.getURL("obs-efisco.html");
  const abas = await chrome.tabs.query({ url: url });
  if (abas.length) {
    await chrome.tabs.update(abas[0].id, { active: true });
    try { await chrome.windows.update(abas[0].windowId, { focused: true }); } catch (e) { /* janela sumiu */ }
  } else {
    await chrome.tabs.create({ url: url, active: true });
  }
}

/** Mensagens do painel (popup.html) e da página obs-efisco.html - só de páginas da própria extensão. */
chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (!mensagem || typeof mensagem.type !== "string" || mensagem.type.indexOf("EFISCO_") !== 0) return false;
  if (remetente.id !== chrome.runtime.id || String(remetente.url || "").indexOf(chrome.runtime.getURL("")) !== 0) {
    responder({ ok: false, erro: "Origem não permitida." });
    return false;
  }
  const tarefa =
    mensagem.type === "EFISCO_VERIFICAR" ? verificarObsEfisco_({ manual: true }) :
    mensagem.type === "EFISCO_ANEXAR" ? anexarObsEfisco_(mensagem.numeros) :
    mensagem.type === "EFISCO_DISPENSAR" ? dispensarObsEfisco_(mensagem.numeros, !!mensagem.restaurar) :
    mensagem.type === "EFISCO_ABRIR_LISTA" ? abrirListaObsEfisco_().then(() => ({ ok: true })) :
    Promise.resolve({ ok: false, erro: "Pedido desconhecido." });
  tarefa.then(responder).catch(erro => responder({ ok: false, erro: String(erro && erro.message ? erro.message : erro) }));
  return true;
});

chrome.alarms.onAlarm.addListener(alarme => {
  if (alarme.name === ALARME_EFISCO_) verificarObsEfisco_({});
});

function aoClicarNotificacaoEfisco_(id) {
  if (id.indexOf("efisco-novas-") === 0) abrirListaObsEfisco_();
  else if (id === "efisco-login") chrome.tabs.create({ url: URL_EFISCO_, active: true });
  else if (id === "efisco-app") chrome.tabs.create({ url: URL_APP_GAOCG_, active: true });
  else return;
  chrome.notifications.clear(id);
}
chrome.notifications.onClicked.addListener(aoClicarNotificacaoEfisco_);
chrome.notifications.onButtonClicked.addListener(id => aoClicarNotificacaoEfisco_(id));

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "local" && mudancas[CHAVE_EFISCO_CONFIG_]) configurarAlarmeEfisco_();
});
chrome.runtime.onInstalled.addListener(() => { configurarAlarmeEfisco_(); atualizarSeloEfisco_(); });
chrome.runtime.onStartup.addListener(() => { configurarAlarmeEfisco_(); atualizarSeloEfisco_(); });
configurarAlarmeEfisco_();
