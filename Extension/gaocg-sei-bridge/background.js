/**
 * GAOCG SEI Bridge — background.js
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
      console.log("[GAOCG SEI Bridge] áreas CKEditor 5 nesta página:",
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
      console.log("[GAOCG SEI Bridge] conteúdo aplicado (CKEditor 5) na raiz:", escolhida.raiz || "main");
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
    console.log("[GAOCG SEI Bridge] instâncias CKEditor nesta página:", info);
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
    console.log("[GAOCG SEI Bridge] conteúdo aplicado na instância:", escolhida.nome);
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

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
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
