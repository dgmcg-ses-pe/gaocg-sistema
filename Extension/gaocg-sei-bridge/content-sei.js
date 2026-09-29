/**
 * GAOCG SEI Bridge — content-sei.js
 *
 * Roda dentro do SEI (sei.pe.gov.br). Automatiza o DOM do formulário nativo de
 * inclusão de documento, sobre a sessão já autenticada do usuário. Não existe
 * API do SEI aqui.
 *
 * ===== Como o fluxo do SEI realmente funciona (aprendido no 1º teste real) =====
 *
 * O editor de texto (CKEditor) do documento NÃO existe na tela de cadastro: o
 * SEI só o abre DEPOIS de "Confirmar Dados", e normalmente numa JANELA NOVA.
 * A versão 0.2.0 tentava injetar o conteúdo durante o cadastro e, como o editor
 * ainda não existia, o documento nascia vazio - foi exatamente o que aconteceu
 * no primeiro teste real (documento "ANEXO" criado sem conteúdo nenhum).
 *
 * Por isso o envio agora é dividido em duas etapas independentes:
 *
 *   Etapa 1 (best-effort): abre "Incluir Documento", tenta escolher o tipo e
 *            preencher o cadastro. Se qualquer parte falhar, NÃO aborta - o
 *            usuário termina na mão.
 *   Etapa 2 (a que importa): o HTML fica guardado em chrome.storage.local como
 *            "pendente". Toda página do SEI que carregar procura um editor; ao
 *            encontrar um editor VAZIO, injeta o conteúdo e limpa o pendente.
 *
 * Assim o conteúdo chega ao documento mesmo que o usuário escolha o tipo e
 * preencha o cadastro manualmente - que é o caso quando o tipo esperado não
 * existe na unidade.
 *
 * ===== Isolated world =====
 *
 * Content script roda num contexto JS isolado: ele compartilha o DOM com a
 * página, mas NÃO enxerga as variáveis dela (`window.jQuery`, `window.CKEDITOR`
 * etc. são sempre undefined aqui). A versão 0.2.0 tinha um helper que tentava
 * usar o jQuery da página - código morto que nunca rodava. Removido: eventos
 * nativos (`new Event('change', {bubbles:true})`) disparam normalmente os
 * handlers da página, inclusive os registrados via jQuery, então são
 * suficientes e não dependem de nada da página.
 */

/**
 * Tipos de documento a tentar no SEI, EM ORDEM, para cada tipo do GAOCG. O
 * texto precisa ser idêntico ao que aparece na lista "Escolha o Tipo do
 * Documento". A lista existe porque nem toda unidade tem um tipo próprio "SOF" -
 * caindo em "Anexo", que é o tipo genérico usado no primeiro teste real.
 * Se nenhum for encontrado, a extensão NÃO falha: deixa a tela de escolha
 * aberta para o usuário decidir, e o conteúdo entra depois pela Etapa 2.
 *
 * `excluir` (achado 2026-09-02): o SEI ganhou um segundo tipo, "SES e-SOF -
 * Sol Orçamentária e Financeira Eletrônica", que também contém a substring
 * "SOF" - então o rótulo genérico "SOF" (fallback pra unidades sem o tipo
 * completo cadastrado) casava com os dois, e `itemDaLista_` ficava com o
 * ÚLTIMO item que bate, que é a e-SOF (aparece depois na lista do SEI).
 * `excluir` filtra fora qualquer item cujo texto contenha um desses termos,
 * ANTES de aplicar `rotulos` - garante que a e-SOF nunca seja escolhida
 * quando o tipo pedido é a SOF padrão.
 *
 * Aquela 1ª correção não foi suficiente: o usuário relatou (2026-09-04) que a
 * e-SOF ainda era escolhida "vez ou outra". Os dois furos que sobraram - a
 * exclusão olhar só o texto do elemento (e não da linha inteira) e `rotulos`
 * não ser tratada como lista de prioridade - estão explicados e corrigidos em
 * `melhorItemDaLista_`.
 */
const MAPA_TIPO_DOCUMENTO = {
  sof: {
    filtro: "SOF",
    rotulos: ["SES - SOF - Solicitação Orçamentária e Financeira", "SOF - Solicitação Orçamentária e Financeira", "SOF"],
    excluir: ["e-SOF", "eletrônica", "eletronica"]
  },
  nota_empenho: { filtro: "Nota de Empenho", rotulos: ["Nota de Empenho"] },
  recibo: { filtro: "Recibo", rotulos: ["Recibo"] }
  // O envio em lote (arrastar e soltar, ver "Envio em lote" mais abaixo) NÃO
  // usa uma entrada fixa aqui: o tipo (ex. "Anexo") vem da configuração do
  // painel e é passado direto como override pra escolherTipoDocumento_. Uma
  // 1ª versão tentava um tipo genérico "Externo" antes - não existe; corrigido
  // depois de conferir a extensão SEI Pro (ver comentário na seção do lote).
};

const MAPA_NIVEL_ACESSO = { publico: "0", restrito: "1", sigiloso: "2" };

const CHAVE_PENDENTE_ = "documentoPendente";
/** Depois disso o pendente é descartado, pra não injetar num documento aberto muito tempo depois. */
const VALIDADE_PENDENTE_MS_ = 15 * 60 * 1000;

/**
 * ATENÇÃO À ORDEM: esta declaração precisa vir ANTES do bloco `if (window.top
 * === window)` abaixo, que chama iniciarVigilancia_() na hora.
 *
 * Bug real da v0.5.0 ("Cannot access 'vigilanciaAtiva_' before initialization"):
 * a flag estava declarada mais abaixo no arquivo, junto de iniciarVigilancia_.
 * `function` é içada e pode ser chamada antes da sua posição no arquivo, mas
 * `let`/`const` ficam na Temporal Dead Zone até a linha da declaração executar -
 * então a chamada estourava e o content script inteiro morria antes de
 * registrar qualquer listener. Nada funcionava, nem a etapa 1.
 */
let vigilanciaAtiva_ = false;

/**
 * BUG CORRIGIDO (3º teste real, 2026-08-10): a vigilância era disparada UMA vez,
 * no carregamento da página. Na prática a sequência é:
 *
 *   1. página do processo carrega -> vigia roda, não há pendente ainda, encerra;
 *   2. usuário clica em "Enviar ao SEI" -> pendente é gravado;
 *   3. o SEI abre o cadastro e depois o editor DENTRO DE IFRAMES, sem recarregar
 *      o documento do topo -> o content script não roda de novo;
 *   4. ninguém mais procura o editor. Nenhuma barra aparecia.
 *
 * Agora a vigilância é (re)ligada em três momentos - carregamento, gravação do
 * pendente (storage.onChanged) e logo depois de agendar - e é idempotente, pra
 * os três gatilhos não criarem três laços concorrentes.
 *
 * A flag `vigilanciaAtiva_` é declarada lá em cima, junto das constantes - ver
 * o comentário sobre Temporal Dead Zone lá.
 */
function iniciarVigilancia_() {
  if (vigilanciaAtiva_) return;
  vigilanciaAtiva_ = true;
  vigiarEditorParaConteudoPendente_()
    .catch(() => {})
    .then(() => { vigilanciaAtiva_ = false; });
}

/* ===================== varredura de frames ===================== */

/** Documento do topo + todos os iframes de mesma origem (recursivo). */
function documentosDisponiveis_(doc) {
  doc = doc || document;
  const lista = [doc];
  for (const frame of Array.from(doc.querySelectorAll("iframe, frame"))) {
    let interno = null;
    try {
      interno = frame.contentDocument;
    } catch (e) {
      interno = null; // cross-origin
    }
    if (interno) lista.push(...documentosDisponiveis_(interno));
  }
  return lista;
}

function acharEm_(seletor) {
  for (const doc of documentosDisponiveis_()) {
    const el = doc.querySelector(seletor);
    if (el) return el;
  }
  return null;
}

function acharTodos_(seletor) {
  const encontrados = [];
  for (const doc of documentosDisponiveis_()) {
    encontrados.push(...Array.from(doc.querySelectorAll(seletor)));
  }
  return encontrados;
}

/**
 * Documento (topo ou iframe) que contém um texto - usado para ESCOPAR a busca
 * de campos a uma tela específica.
 *
 * Bug real (5º teste, 2026-08-10): `escolherTipoDocumento_` pegava "o primeiro
 * input de texto visível" varrendo TODOS os documentos. O primeiro é o da busca
 * da barra superior do SEI, que fica no documento do topo - ou seja, a extensão
 * digitava "SOF" na caixa de pesquisa do SEI em vez do filtro de tipo de
 * documento (que fica dentro do iframe de conteúdo), e a lista nunca filtrava.
 */
function documentoComTexto_(trecho) {
  const alvo = trecho.toLowerCase();
  for (const doc of documentosDisponiveis_()) {
    let texto = "";
    try {
      texto = (doc.body && (doc.body.innerText || doc.body.textContent)) || "";
    } catch (e) {
      texto = "";
    }
    if (texto.toLowerCase().indexOf(alvo) !== -1) return doc;
  }
  return null;
}

function aguardarCondicao_(condicao, timeoutMs = 10000, intervaloMs = 200) {
  return new Promise(resolve => {
    const inicio = Date.now();
    const tick = () => {
      let valor = null;
      try {
        valor = condicao();
      } catch (e) {
        valor = null; // frame navegando
      }
      if (valor) return resolve(valor);
      if (Date.now() - inicio > timeoutMs) return resolve(null); // devolve null, nunca lança
      setTimeout(tick, intervaloMs);
    };
    tick();
  });
}

/**
 * Eventos nativos bastam: eles acionam tanto handlers inline (onchange="...")
 * quanto os registrados por addEventListener/jQuery da página. Ver comentário
 * sobre isolated world no topo do arquivo.
 */
function dispararChange_(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

const esperar_ = ms => new Promise(r => setTimeout(r, ms));

/**
 * Tecla sintética que o jQuery enxerga.
 *
 * O construtor de KeyboardEvent não deixa definir `keyCode`/`which` (são
 * getters derivados), e o jQuery normaliza justamente por eles - sem
 * redefini-los, o handler da página recebe keyCode 0 e ignora a tecla. Por isso
 * o defineProperty.
 */
function teclar_(el, key, keyCode) {
  for (const tipo of ["keydown", "keypress", "keyup"]) {
    const ev = new KeyboardEvent(tipo, { key: key, bubbles: true, cancelable: true });
    Object.defineProperty(ev, "keyCode", { get: () => keyCode });
    Object.defineProperty(ev, "which", { get: () => keyCode });
    el.dispatchEvent(ev);
  }
}

/**
 * Clique com a sequência completa de eventos de mouse. Componentes de
 * autocomplete costumam agir no `mousedown` (antes do blur do campo), não no
 * `click` - um `.click()` seco simplesmente não seleciona.
 */
function clicarComoUsuario_(el) {
  for (const tipo of ["mouseover", "mouseenter", "mousemove", "mousedown", "mouseup", "click"]) {
    el.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, view: el.ownerDocument.defaultView }));
  }
}

/** A tela de cadastro chegou? "Nome na Árvore" é o marco confiável. */
function chegouTelaCadastro_() {
  return !!(acharEm_("#frmDocumentoCadastro") || campoPorRotulo_("Nome na Árvore"));
}

/**
 * Item visível da lista de sugestões cujo texto contenha um dos rótulos (e
 * NENHUM dos termos de `excluir` - ver comentário em MAPA_TIPO_DOCUMENTO
 * sobre "SOF" casando também com "e-SOF").
 *
 * Devolve o elemento MAIS PROFUNDO que ainda contém o rótulo inteiro: os
 * ancestrais (body, div do container) também "contêm" o texto, e clicar neles
 * não seleciona nada.
 *
 * Serve para dois fins: saber que a lista já apareceu (espera adaptativa antes
 * de mandar ArrowDown) e, no fallback, saber onde clicar.
 */
function itemDaLista_(escopo, rotulos, excluir) {
  const termosExcluir = (excluir || []).map(t => t.toLowerCase());
  const itens = Array.from(escopo.querySelectorAll("li, a, tr, td, div, span")).filter(el => {
    if (el.offsetParent === null) return false;
    const texto = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!texto) return false;
    if (termosExcluir.some(t => texto.indexOf(t) !== -1)) return false;
    return rotulos.some(r => texto.indexOf(r.toLowerCase()) !== -1);
  });
  return itens.length ? itens[itens.length - 1] : null;
}

/**
 * Texto da LINHA inteira da lista à qual um elemento pertence (o `<li>`/`<tr>`/
 * `<a>` mais próximo). Quando não há linha identificável - o próprio container
 * da lista, por exemplo - devolve o texto do elemento mesmo, que continua
 * contendo o texto de todos os itens e portanto continua sendo barrado pela
 * exclusão, como antes.
 */
function textoDaLinhaLista_(el) {
  const linha = (el.closest && el.closest("li, tr, option, a")) || el;
  return (linha.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Versão ESTRITA de `itemDaLista_`, usada só quando há termos em `excluir` -
 * hoje, só o tipo "SOF" (ver MAPA_TIPO_DOCUMENTO). Sem `excluir` ela delega pro
 * `itemDaLista_` original, de propósito: os fluxos que não têm ambiguidade
 * (Nota de Empenho, Recibo e o envio em lote) continuam com o comportamento
 * exato de antes, sem risco de regressão.
 *
 * Corrige DOIS furos que ainda deixavam a e-SOF ser escolhida de vez em quando
 * (relato do usuário 2026-09-04, depois da 1ª correção de 2026-09-02):
 *
 * 1. A exclusão era avaliada só no texto do PRÓPRIO elemento. Quando o SEI
 *    destaca o trecho buscado dentro do item (`SES e-<b>SOF</b> - ...`), esse
 *    `<b>` tem texto "SOF" - não contém "e-SOF" nem "eletrônica", passava pelo
 *    filtro, e como está DENTRO da linha da e-SOF, clicar nele escolhia a
 *    e-SOF. Agora a exclusão olha o texto da LINHA inteira
 *    (`textoDaLinhaLista_`), então qualquer pedaço de dentro da e-SOF é
 *    barrado junto com ela.
 *
 * 2. `rotulos` é uma lista de PRIORIDADE (nome completo primeiro, "SOF" solto
 *    por último, como fallback pras unidades sem o tipo completo), mas o código
 *    tratava todos como equivalentes e ficava com o ÚLTIMO elemento na ordem do
 *    documento. Ou seja: mesmo com o nome completo presente na tela, um
 *    casamento frouxo de "SOF" que aparecesse depois ganhava. Agora percorre os
 *    rótulos EM ORDEM e só desce pro próximo se o anterior não existir na tela.
 *
 * Dentro do rótulo vencedor, fica com o elemento de menor texto - o mais justo
 * ao rótulo, isto é, o mais profundo que ainda o contém inteiro (mesma intenção
 * do original, só que escolhido corretamente). Clicar num pedaço interno
 * funciona porque `clicarComoUsuario_` dispara eventos que sobem (`bubbles`)
 * até o handler da linha.
 */
function melhorItemDaLista_(escopo, rotulos, excluir) {
  if (!excluir || !excluir.length) return itemDaLista_(escopo, rotulos, excluir);

  const termosExcluir = excluir.map(t => t.toLowerCase());
  const candidatos = Array.from(escopo.querySelectorAll("li, a, tr, td, div, span"))
    .filter(el => el.offsetParent !== null)
    .map(el => ({ el: el, texto: (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase() }))
    .filter(c => c.texto && !termosExcluir.some(t => textoDaLinhaLista_(c.el).indexOf(t) !== -1));

  for (const rotulo of rotulos) {
    const alvo = rotulo.toLowerCase();
    const doRotulo = candidatos.filter(c => c.texto.indexOf(alvo) !== -1);
    if (!doRotulo.length) continue;
    doRotulo.sort((a, b) => a.texto.length - b.texto.length);
    return doRotulo[0].el;
  }
  return null;
}

/* ===================== Etapa 1: cadastro (best-effort) ===================== */

async function preencherDocumento(documento, numeroProcesso) {
  if (!location.href.includes("procedimento_trabalhar")) {
    return { ok: false, erro: "Esta aba do SEI não está com um processo aberto. Abra o processo e tente de novo." };
  }

  // Guarda o conteúdo ANTES de qualquer automação: mesmo que tudo abaixo falhe
  // e o usuário faça o cadastro na mão, o conteúdo entra quando o editor abrir.
  const agendou = await agendarConteudo_(documento, numeroProcesso);
  // Liga a vigilância JÁ - o editor pode abrir dentro de um iframe, sem novo
  // carregamento desta página (ver comentário em iniciarVigilancia_).
  if (agendou) iniciarVigilancia_();

  const abriu = await abrirIncluirDocumento_();
  if (!abriu) {
    return {
      ok: true, conteudoAgendado: agendou, tipoSelecionado: false, cadastroPreenchido: false,
      aviso: 'Não encontrei o botão "Incluir Documento". Inclua o documento manualmente - o conteúdo será preenchido sozinho quando o editor abrir.'
    };
  }

  const tipoSelecionado = await escolherTipoDocumento_(documento.tipo, documento.tipoConfig);

  // O formulário de cadastro nem sempre tem id #frmDocumentoCadastro; o sinal
  // mais confiável de que ele chegou é o rótulo "Nome na Árvore".
  const chegouCadastro = await aguardarCondicao_(
    () => acharEm_("#frmDocumentoCadastro") || campoPorRotulo_("Nome na Árvore"),
    tipoSelecionado ? 12000 : 4000, 300
  );

  let cadastroPreenchido = false;
  if (chegouCadastro) {
    // "Texto Inicial: Nenhum" - com isso o editor abre VAZIO e o conteúdo da
    // SOF entra sozinho, sem a barra de confirmação (que só existe para não
    // sobrescrever conteúdo preexistente, como o modelo do próprio SEI).
    marcarOpcaoPorRotulo_(documento.textoInicial || "Nenhum");

    const nomeArvore = campoPorRotulo_("Nome na Árvore");
    if (nomeArvore && documento.numero) { nomeArvore.value = documento.numero; dispararChange_(nomeArvore); }

    const descricao = campoPorRotulo_("Descrição");
    if (descricao && documento.descricaoEspecificacao) { descricao.value = documento.descricaoEspecificacao; dispararChange_(descricao); }

    const observacoes = campoPorRotulo_("Observações desta unidade");
    if (observacoes && documento.observacoes) { observacoes.value = documento.observacoes; dispararChange_(observacoes); }

    // Nível de acesso: tenta pelo rótulo visível (Público/Restrito/Sigiloso) e,
    // se não achar, pelo name nativo do SEI.
    const rotuloNivel = { publico: "Público", restrito: "Restrito", sigiloso: "Sigiloso" }[documento.nivelAcesso] || "Público";
    if (!marcarOpcaoPorRotulo_(rotuloNivel)) {
      const doc = (chegouCadastro.ownerDocument || document);
      const radio = doc.querySelector(`input[name="rdoNivelAcesso"][value="${MAPA_NIVEL_ACESSO[documento.nivelAcesso] || "0"}"]`);
      if (radio) { radio.checked = true; radio.click(); dispararChange_(radio); }
    }
    // A Hipótese Legal só aparece depois de marcar Restrito/Sigiloso.
    if (documento.hipoteseLegal) {
      await aguardarCondicao_(() => selecionarOpcaoPorTexto_(documento.hipoteseLegal), 4000, 250);
    }

    cadastroPreenchido = true;
  }

  if (documento.autoEnviar && cadastroPreenchido) {
    // O botão da tela real se chama "Salvar" (não "Confirmar Dados", como em
    // outras versões do SEI) - os dois são aceitos.
    const botao = acharTodos_('#sbmSalvar, input[value="Salvar"], button[value="Salvar"], input[value="Confirmar Dados"], button[value="Confirmar Dados"]')
      .find(b => b.offsetParent !== null);
    if (botao) {
      botao.click();
      return { ok: true, conteudoAgendado: agendou, tipoSelecionado, cadastroPreenchido, salvou: true };
    }
  }

  return {
    ok: true,
    conteudoAgendado: agendou,
    tipoSelecionado,
    cadastroPreenchido,
    salvou: false,
    aviso: tipoSelecionado ? "" : "Não achei o tipo de documento esperado na sua unidade - escolha o tipo manualmente."
  };
}

async function abrirIncluirDocumento_() {
  const seletor = [
    'a[title="Incluir Documento"]',
    'img[title="Incluir Documento"]',
    'a[href*="documento_escolher_tipo"]'
  ].join(", ");
  const alvo = await aguardarCondicao_(() => acharEm_(seletor), 8000);
  if (!alvo) return false;
  (alvo.closest("a") || alvo).click();
  return true;
}

/**
 * Escolhe o tipo do documento na tela "Gerar Documento".
 *
 * Corrigido depois de ver a tela real (2026-08-10): NÃO é um `<select>`. É um
 * campo de filtro + uma lista de sugestões, e o rótulo do item é o nome
 * completo - "SES - SOF - Solicitação Orçamentária e Financeira". A versão
 * anterior comparava por igualdade exata com "SOF", o que nunca casaria.
 *
 * Fluxo: digita o filtro (ex.: "SOF"), espera a lista reagir e clica no item
 * cujo texto CONTENHA um dos rótulos configurados. O `<select id="selSerie">`
 * das versões antigas continua suportado como alternativa.
 */
async function escolherTipoDocumento_(tipoGaocg, override) {
  const cfg = Object.assign({}, MAPA_TIPO_DOCUMENTO[tipoGaocg] || {}, override || {});
  const rotulos = (cfg.rotulos || []).filter(Boolean);
  if (!rotulos.length) return false;

  // 0. ESCOPO: a tela de escolha do tipo fica num iframe de conteúdo. Sem
  //    escopar, o "primeiro input de texto visível" é o da busca da barra
  //    superior do SEI, no documento do topo - era ali que o filtro estava
  //    sendo digitado (ver documentoComTexto_).
  const escopo = await aguardarCondicao_(
    () => documentoComTexto_("Escolha o Tipo do Documento"), 8000, 120
  ) || document;

  // 1. Preenche o filtro, se a tela tiver um. É o que faz a lista aparecer.
  if (cfg.filtro) {
    const filtro = await aguardarCondicao_(
      () => Array.from(escopo.querySelectorAll('input[type=text], input:not([type])'))
        .find(i => i.offsetParent !== null),
      6000, 100
    );
    if (filtro) {
      filtro.focus();
      filtro.value = cfg.filtro;
      filtro.dispatchEvent(new Event("input", { bubbles: true }));
      teclar_(filtro, cfg.filtro.slice(-1), cfg.filtro.toUpperCase().charCodeAt(cfg.filtro.length - 1));
      dispararChange_(filtro);

      // 2. Seleção pelo TECLADO - caminho nativo do autocomplete (o SEI usa
      //    jQuery UI). Um `.click()` no item quase nunca seleciona: o widget
      //    age no mousedown/menuselect, não no click. Seta pra baixo destaca o
      //    primeiro item da PRÓPRIA lista/ordem do SEI, Enter confirma - às
      //    cegas, sem checar QUAL item ficou destacado.
      //
      // Por isso esse caminho só roda quando não há `excluir` configurado
      // (achado 2026-09-02): pra tipos ambíguos como "SOF" - que agora
      // também acha "SES e-SOF - Sol Orçamentária e Financeira Eletrônica",
      // já que "SOF" é substring de "e-SOF" -, não dá pra confiar que o
      // primeiro item da busca do próprio SEI é o certo (o SEI pode ordenar
      // e-SOF na frente). Nesses casos pula direto pro passo 3, que clica no
      // item específico já filtrado por `itemDaLista_` (rótulo + exclusão).
      //
      // A espera aqui é ADAPTATIVA: age assim que a sugestão aparece na tela,
      // em vez do 700ms fixo "por garantia" que existia antes - o usuário
      // notou a demora e ela não tinha razão de ser. Só se a lista não aparecer
      // é que sobra um respiro fixo, para não desistir cedo demais numa rede
      // lenta. Respiros reduzidos de novo (achado 2026-09-04, pedido de
      // velocidade no envio em lote - esta função é compartilhada com o
      // fluxo da SOF, então só os respiros FIXOS puderam ser cortados; o
      // resto do tempo aqui é o próprio SEI carregando a tela, que não dá
      // pra encurtar sem arriscar quebrar a seleção).
      const apareceu = await aguardarCondicao_(() => melhorItemDaLista_(escopo, rotulos, cfg.excluir), 6000, 80);
      if (!cfg.excluir || !cfg.excluir.length) {
        await esperar_(apareceu ? 40 : 250);
        teclar_(filtro, "ArrowDown", 40);
        await esperar_(40);
        teclar_(filtro, "Enter", 13);
        if (await aguardarCondicao_(chegouTelaCadastro_, 3500, 120)) return true;
      }
    }
  }

  // 3. Não avançou pelo teclado: procura o item e clica com a sequência
  //    completa de mouse.
  const achado = await aguardarCondicao_(() => {
    const select = escopo.querySelector("#selSerie");
    if (select) {
      const opcao = Array.from(select.options).find(o =>
        rotulos.some(r => (o.textContent || "").toLowerCase().indexOf(r.toLowerCase()) !== -1));
      if (opcao) return { tipo: "select", select: select, opcao: opcao };
    }
    const item = melhorItemDaLista_(escopo, rotulos, cfg.excluir);
    if (item) return { tipo: "item", item: item };
    return null;
  }, 8000, 120);

  if (!achado) return false;
  if (achado.tipo === "item") {
    // Última conferência antes de clicar: o texto da LINHA não pode conter
    // nenhum termo excluído. `melhorItemDaLista_` já garante isso, mas a lista
    // do SEI pode ter sido re-renderizada entre achar e clicar (a busca é
    // assíncrona) - e clicar no tipo errado é justamente o erro que estamos
    // caçando, então vale a checagem de novo, agora, com o elemento em mãos.
    const linha = textoDaLinhaLista_(achado.item);
    if ((cfg.excluir || []).some(t => linha.indexOf(t.toLowerCase()) !== -1)) return false;
    clicarComoUsuario_(achado.item);
    await aguardarCondicao_(chegouTelaCadastro_, 5000, 250);
    // Devolve o RÓTULO escolhido em vez de um `true` seco: continua sendo
    // verdadeiro pra quem só testa truthy (era o único uso), e passa a aparecer
    // no resultado do envio - se algum dia a escolha errar de novo, o retorno
    // já diz qual item foi clicado, em vez de virar adivinhação.
    return linha || true;
  }
  achado.select.value = achado.opcao.value;
  dispararChange_(achado.select);
  return (achado.opcao.textContent || "").trim() || true;
}

function preencherCampo_(doc, seletor, valor) {
  if (valor === undefined || valor === null || valor === "") return false;
  const campo = doc.querySelector(seletor);
  if (!campo) return false;
  campo.value = valor;
  dispararChange_(campo);
  return true;
}

/* ============ localização de campos POR RÓTULO VISÍVEL ============
 *
 * Os ids do formulário "Gerar Documento" do SEI variam por versão/customização
 * e não foram confirmados no ambiente da SES-PE. Os RÓTULOS, por outro lado,
 * estão na tela e são estáveis: "Descrição:", "Nome na Árvore:", "Hipótese
 * Legal:", "Nível de Acesso", "Texto Inicial". Procurar pelo rótulo é bem mais
 * resistente a diferença de versão do que chutar `#txtDescricao` e afins.
 */

function textoNormalizado_(el) {
  return (el.textContent || "").replace(/\s+/g, " ").replace(/:\s*$/, "").trim().toLowerCase();
}

/** Todos os elementos de todos os documentos acessíveis, em ordem de documento. */
function todosElementos_() {
  const lista = [];
  for (const doc of documentosDisponiveis_()) {
    lista.push(...Array.from(doc.querySelectorAll("*")));
  }
  return lista;
}

const SELETOR_CAMPO_ = "input:not([type=hidden]):not([type=button]):not([type=submit]), select, textarea";

/**
 * Campo associado a um rótulo visível. Primeiro tenta `<label for=...>`
 * (relação explícita); senão, pega o primeiro campo que aparece DEPOIS do
 * rótulo na ordem do documento - que é como o formulário do SEI é montado.
 */
function campoPorRotulo_(rotulo, tipoDesejado) {
  const alvo = rotulo.toLowerCase();
  const elementos = todosElementos_();

  for (let i = 0; i < elementos.length; i++) {
    const el = elementos[i];
    if (el.children.length > 2) continue;          // só folhas/rótulos curtos
    if (textoNormalizado_(el) !== alvo) continue;

    if (el.tagName === "LABEL" && el.htmlFor) {
      const porFor = el.ownerDocument.getElementById(el.htmlFor);
      if (porFor) return porFor;
    }
    for (let j = i + 1; j < Math.min(i + 40, elementos.length); j++) {
      const cand = elementos[j];
      if (!cand.matches || !cand.matches(SELETOR_CAMPO_)) continue;
      if (tipoDesejado && cand.tagName.toLowerCase() !== tipoDesejado) continue;
      return cand;
    }
  }
  return null;
}

/** Radio/checkbox cujo texto ao lado (ou label associado) é `rotulo`. */
function marcarOpcaoPorRotulo_(rotulo) {
  const alvo = rotulo.trim().toLowerCase();
  for (const entrada of acharTodos_('input[type=radio], input[type=checkbox]')) {
    let texto = "";
    const doc = entrada.ownerDocument;
    if (entrada.id) {
      const lbl = doc.querySelector('label[for="' + entrada.id + '"]');
      if (lbl) texto = textoNormalizado_(lbl);
    }
    if (!texto && entrada.parentElement) texto = textoNormalizado_(entrada.parentElement);
    if (!texto && entrada.nextElementSibling) texto = textoNormalizado_(entrada.nextElementSibling);
    if (texto === alvo) {
      // Já marcado (é o caso de "Restrito" e "Nenhum", que são o padrão da
      // tela): não mexe. Disparar o evento de novo faria o SEI reprocessar uma
      // mudança que não houve.
      if (entrada.checked) return true;

      // Um ÚNICO disparo: o click nativo já marca o campo e emite `change`.
      //
      // Erro corrigido no 9º teste (2026-08-10): antes eram três gatilhos
      // seguidos (checked = true, click() e dispararChange_), o que fazia o
      // `alterarNivelAcesso` do próprio SEI rodar repetidas vezes e estourar
      // "Cannot read properties of null (reading 'executar')" no console - a
      // segunda execução encontrava um elemento que a primeira ainda não tinha
      // terminado de montar.
      entrada.click();
      return true;
    }
  }
  return false;
}

/** <select> que contenha uma opção cujo texto contenha `trecho` - e a seleciona. */
function selecionarOpcaoPorTexto_(trecho) {
  const alvo = trecho.trim().toLowerCase();
  for (const select of acharTodos_("select")) {
    const opcao = Array.from(select.options).find(o => (o.textContent || "").toLowerCase().indexOf(alvo) !== -1);
    if (opcao) {
      select.value = opcao.value;
      dispararChange_(select);
      return true;
    }
  }
  return false;
}

/* ===================== identificação do processo aberto ===================== */

/** Formato do número de processo do SEI (mesmo padrão validado no GAOCG). */
const REGEX_PROCESSO_SEI_ = /\d{5,10}\.\d{6}\/\d{4}-\d{2}/g;
const CHAVE_PROCESSO_ABRIR_ = "processoParaAbrir";
/** Envio inteiro (documento + número do processo) aguardando o processo abrir. */
const CHAVE_ENVIO_PENDENTE_ = "envioPendente";
/** Evita que duas abas retomem o mesmo envio ao mesmo tempo. */
let retomandoEnvio_ = false;

/**
 * A página está saindo (navegação/fechamento)?
 *
 * Mandar mensagem ao background nesse momento gera o ruído
 * "A listener indicated an asynchronous response by returning true, but the
 * message channel closed before a response was received": o canal morre junto
 * com a página, antes da resposta chegar. Não quebra nada - o trabalho já
 * terminou -, mas polui o console e faz parecer que algo falhou.
 */
let paginaSaindo_ = false;

/** Só dígitos - a comparação ignora pontuação/formatação divergente. */
function digitos_(texto) {
  return String(texto || "").replace(/\D/g, "");
}

/**
 * Números de processo visíveis nesta aba (documento do topo + iframes de mesma
 * origem). Ler o TEXTO da página é mais confiável que olhar a URL: a URL do
 * `procedimento_trabalhar` traz `id_procedimento`, um id interno do banco, não
 * o número do processo - não dá para casar com o que o analista digitou na SOF.
 */
function processosVisiveis_() {
  const achados = new Set();
  for (const doc of documentosDisponiveis_()) {
    let texto = "";
    try {
      texto = (doc.body && (doc.body.innerText || doc.body.textContent)) || "";
    } catch (e) {
      texto = "";
    }
    const casados = texto.match(REGEX_PROCESSO_SEI_);
    if (casados) casados.forEach(n => achados.add(n));
  }
  return Array.from(achados);
}

function conferirProcesso_(numeroEsperado) {
  const alvo = digitos_(numeroEsperado);
  const visiveis = processosVisiveis_();
  return {
    tem: !!alvo && visiveis.some(n => digitos_(n) === alvo),
    numeros: visiveis,
    ehPaginaDeProcesso: location.href.includes("procedimento_trabalhar")
  };
}

/* ===================== abrir o processo pela pesquisa do SEI ===================== */

/**
 * Campo de pesquisa do SEI. São vários candidatos porque o id varia entre
 * versões/temas e NÃO foi confirmado no ambiente da SES-PE - por isso o fluxo
 * degrada: se nenhum casar, mostra o número na tela para o usuário colar à mão,
 * em vez de falhar em silêncio.
 */
/**
 * Campo "Pesquisar..." da barra superior do SEI - existe em QUALQUER tela dele
 * (inclusive "Controle de Processos"), por isso não é preciso abrir uma aba
 * nova só para pesquisar.
 *
 * O seletor por `placeholder` veio da tela real enviada pelo usuário (7º teste)
 * e é o mais confiável da lista; os ids continuam como alternativa para outras
 * versões/temas do SEI.
 */
const SELETORES_PESQUISA_SEI_ = [
  'input[placeholder*="Pesquisar" i]',
  "#txtPesquisaRapida",
  'input[name="txtPesquisaRapida"]',
  "#txtInfraPesquisar",
  'input[type="search"]'
];

/** Preenche a busca do SEI e submete. Devolve false se não achar o campo. */
async function pesquisarProcesso_(numero) {
  const campo = await aguardarCondicao_(() => {
    for (const seletor of SELETORES_PESQUISA_SEI_) {
      const el = acharEm_(seletor);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }, 10000, 400);

  if (!campo) {
    avisarNaTela_("GAOCG: não encontrei a pesquisa do SEI. Abra o processo " + numero + " manualmente - o documento é criado sozinho quando ele abrir.");
    return false;
  }

  campo.focus();
  campo.value = numero;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
  dispararChange_(campo);
  teclar_(campo, "Enter", 13);
  if (campo.form) campo.form.submit();

  avisarNaTela_("GAOCG: pesquisando o processo " + numero + " no SEI. Abra o processo - o documento é criado sozinho.");
  return true;
}

/** Pesquisa agendada para a PRÓXIMA carga de página (fluxo da aba nova). */
async function tentarPesquisarProcesso_() {
  let alvo = null;
  try {
    const dados = await chrome.storage.local.get(CHAVE_PROCESSO_ABRIR_);
    alvo = dados && dados[CHAVE_PROCESSO_ABRIR_];
  } catch (e) {
    return;
  }
  if (!alvo || !alvo.numero) return;
  // Consome ANTES de pesquisar: submeter o formulário recarrega a página e o
  // content script roda de novo - sem isso, entraria em laço de pesquisa.
  await chrome.storage.local.remove(CHAVE_PROCESSO_ABRIR_).catch(() => {});
  await pesquisarProcesso_(alvo.numero);
}

/* ===================== retomada automática do envio ===================== */

/**
 * Fecha o ciclo do "processo não estava aberto".
 *
 * Antes (v0.7/0.8) a extensão abria a pesquisa do SEI e devolvia erro pedindo
 * ao analista para **clicar em enviar de novo** no GAOCG depois de abrir o
 * processo. Na prática isso é um passo a mais sem necessidade: a intenção já
 * tinha sido declarada no primeiro clique.
 *
 * Agora o envio inteiro (documento + número do processo) fica guardado e é
 * retomado sozinho assim que uma aba do SEI carregar com AQUELE processo
 * aberto. Se o analista abrir outro processo, nada acontece - a conferência de
 * número continua valendo, e o pendente só expira pelo tempo (15 min).
 */
async function retomarEnvioPendente_() {
  if (retomandoEnvio_) return;
  if (!location.href.includes("procedimento_trabalhar")) return;

  let pendente = null;
  try {
    const dados = await chrome.storage.local.get(CHAVE_ENVIO_PENDENTE_);
    pendente = dados && dados[CHAVE_ENVIO_PENDENTE_];
  } catch (e) {
    return;
  }
  if (!pendente || !pendente.documento || !pendente.numeroProcesso) return;
  if (Date.now() - (pendente.criadoEm || 0) > VALIDADE_PENDENTE_MS_) {
    await chrome.storage.local.remove(CHAVE_ENVIO_PENDENTE_).catch(() => {});
    return;
  }

  // A árvore do processo pode demorar a montar; só depois disso o número
  // aparece no texto da página.
  const bate = await aguardarCondicao_(() => conferirProcesso_(pendente.numeroProcesso).tem, 15000, 500);
  if (!bate) return; // outro processo nesta aba - deixa o pendente para a próxima

  retomandoEnvio_ = true;
  await chrome.storage.local.remove(CHAVE_ENVIO_PENDENTE_).catch(() => {});
  avisarNaTela_("GAOCG: processo " + pendente.numeroProcesso + " encontrado. Criando o documento da SOF...");
  try {
    await preencherDocumento(pendente.documento, pendente.numeroProcesso);
  } catch (e) {
    avisarNaTela_("GAOCG: falha ao criar o documento - " + (e && e.message ? e.message : e));
  } finally {
    retomandoEnvio_ = false;
  }
}

/* ===================== Etapa 2: conteúdo pendente ===================== */

function agendarConteudo_(documento, numeroProcesso) {
  if (!documento || !documento.conteudoHtml) return Promise.resolve(false);
  return chrome.storage.local
    .set({
      [CHAVE_PENDENTE_]: {
        html: documento.conteudoHtml,
        rotulo: documento.numero || "",
        // Número da SOF como está no app - é o texto que será trocado pelo
        // número que o SEI gerar no modelo (ver numeroSofNoModelo_).
        marcadorNumero: documento.marcadorNumeroSof || "",
        // Número do processo SEI (sessão 2026-08-14, restaurado 2026-09-03
        // depois da sincronização com a v0.46.0 ter derrubado esse trecho
        // sem querer) - guardado só para, depois de descobrir o número que
        // o SEI gerou pro modelo, saber sob qual chave devolvê-lo ao app
        // (ver guardarNumeroSofCapturado_ abaixo).
        numeroProcesso: numeroProcesso || "",
        criadoEm: Date.now()
      }
    })
    .then(() => true)
    .catch(() => false);
}

/** Só dígitos, mesma normalização de conferirProcesso_/digitos_ - chave estável independente de pontuação. */
const CHAVE_NUMEROS_SOF_CAPTURADOS_ = "numerosSofCapturados";

/**
 * Guarda o número que o SEI gerou pro modelo (ex.: "173/2026"), pra o app
 * poder perguntar por ele depois (sessão 2026-08-14, pedido do usuário: "a
 * extensão devolver o valor da SOF que foi pega no SEI"). Fica esperando em
 * chrome.storage.local, sob a chave do NÚMERO DO PROCESSO - o app não tem
 * como saber esse número por conta própria, e é o único dado que ele tem à
 * mão pra perguntar (ver SeiBridge.consultarNumeroSof, js/sei-bridge.js, e o
 * handler CONSULTAR_NUMERO_SOF em background.js).
 *
 * Mescla em vez de sobrescrever a chave inteira - várias SOFs de processos
 * diferentes podem ter passado por aqui na mesma máquina.
 */
async function guardarNumeroSofCapturado_(numeroProcesso, numeroSei) {
  if (!numeroProcesso || !numeroSei) return;
  const chave = digitos_(numeroProcesso);
  if (!chave) return;
  try {
    const dados = await chrome.storage.local.get(CHAVE_NUMEROS_SOF_CAPTURADOS_);
    const mapa = (dados && dados[CHAVE_NUMEROS_SOF_CAPTURADOS_]) || {};
    mapa[chave] = { numero: numeroSei, capturadoEm: Date.now() };
    await chrome.storage.local.set({ [CHAVE_NUMEROS_SOF_CAPTURADOS_]: mapa });
  } catch (e) { /* melhor esforço - não trava o fluxo principal de inserir o conteúdo */ }
}

async function lerConteudoPendente_() {
  try {
    const dados = await chrome.storage.local.get(CHAVE_PENDENTE_);
    const pendente = dados && dados[CHAVE_PENDENTE_];
    if (!pendente || !pendente.html) return null;
    if (Date.now() - (pendente.criadoEm || 0) > VALIDADE_PENDENTE_MS_) {
      await chrome.storage.local.remove(CHAVE_PENDENTE_);
      return null;
    }
    return pendente;
  } catch (e) {
    return null;
  }
}

/**
 * Corpo editável do documento, em qualquer frame acessível desta página.
 *
 * Um documento do SEI tem seções pré-definidas (cabeçalho, principal, rodapé,
 * assinatura), cada uma com seu próprio editor - e só a "principal" aceita
 * edição. A versão anterior pegava o PRIMEIRO `iframe.cke_wysiwyg_frame` que
 * encontrasse, que é o cabeçalho: era ali que o conteúdo ia parar (4º teste
 * real, 2026-08-10).
 *
 * Agora coleta todos os candidatos, descarta os travados (`isContentEditable`
 * false, que é como o SEI protege cabeçalho/rodapé) e, entre os que sobram,
 * fica com o de maior altura - o corpo do documento é sempre o maior.
 */
function corpoDoEditor_() {
  const candidatos = [];

  for (const iframe of acharTodos_('iframe.cke_wysiwyg_frame, iframe[title="Rich Text Editor"]')) {
    try {
      const corpo = iframe.contentDocument && iframe.contentDocument.body;
      if (corpo) {
        candidatos.push({
          corpo: corpo,
          editavel: corpo.isContentEditable !== false,
          altura: iframe.offsetHeight || 0
        });
      }
    } catch (e) { /* cross-origin */ }
  }

  // CKEditor 5 / modo "div editável" (sem iframe).
  for (const el of acharTodos_('.cke_editable[contenteditable="true"], div[contenteditable="true"].cke_editable')) {
    candidatos.push({ corpo: el, editavel: true, altura: el.offsetHeight || 0 });
  }

  if (!candidatos.length) return null;
  const editaveis = candidatos.filter(c => c.editavel);
  const pool = editaveis.length ? editaveis : candidatos;
  pool.sort((a, b) => b.altura - a.altura);
  return pool[0].corpo;
}

/** Editor sem nada dentro - dá pra preencher sozinho, sem risco de apagar nada. */
function editorEstaVazio_(corpo) {
  if (!corpo) return false;
  if (corpo.querySelector("table, img, ul, ol")) return false;
  return corpo.textContent.replace(/ /g, " ").trim() === "";
}

/**
 * Etapa 2: coloca o conteúdo no editor assim que ele abrir - e salva.
 *
 * Histórico das decisões, para não regredir:
 * - v0.3.0 só injetava em editor VAZIO, como salvaguarda contra sobrescrever um
 *   documento existente. Mas o tipo "SOF" tem MODELO próprio no SEI: o editor
 *   SEMPRE abre preenchido com o template. Resultado: nunca injetava.
 * - v0.4.0 passou a PERGUNTAR quando havia conteúdo. Como o modelo aparece em
 *   100% dos envios, a pergunta virou atrito puro.
 * - v0.11.0 substitui sempre, sem perguntar, e ainda salva - pedido explícito
 *   do usuário, que aceita reabrir e editar no SEI quando precisar.
 *
 * O que continua limitando o estrago: o pendente só nasce de um envio explícito
 * do GAOCG, é consumido uma única vez, expira em 15 minutos, e o documento
 * criado nunca é assinado.
 */
async function vigiarEditorParaConteudoPendente_() {
  const pendente = await lerConteudoPendente_();
  if (!pendente) return;

  // Vigia até o pendente expirar, não por 45s fixos: entre clicar em "Enviar ao
  // SEI" e o editor abrir existe o cadastro inteiro sendo preenchido à mão, o
  // que passa fácil de um minuto. O intervalo de 600ms mantém o custo baixo.
  const restante = VALIDADE_PENDENTE_MS_ - (Date.now() - (pendente.criadoEm || 0));
  if (restante <= 0) return;
  const corpo = await aguardarCondicao_(() => corpoDoEditor_(), restante, 600);
  if (!corpo) return;

  // Substitui SEMPRE, sem perguntar (decisão do usuário, 2026-08-10).
  //
  // A barra de confirmação existia porque, pelo DOM, não dá para distinguir "o
  // modelo em branco de um documento novo" de "um documento já preenchido". Na
  // prática o tipo "SOF" SEMPRE abre com o modelo do SEI, então a pergunta
  // aparecia em 100% dos envios e virou só atrito. O usuário aceitou o risco
  // explicitamente: o documento ainda não está assinado e pode ser reaberto e
  // editado no próprio SEI.
  //
  // O que continua limitando o estrago: o pendente só é criado por um envio
  // explícito do GAOCG, é consumido numa única vez e expira em 15 minutos.
  await aplicarConteudo_(corpo, pendente);
}

/**
 * Aplica o conteúdo pelo caminho mais confiável disponível.
 *
 * Preferência: API do CKEditor (`setData`), executada no MAIN world via
 * background (ver INJETAR_CKEDITOR em background.js). Motivo: o CKEditor mantém
 * um modelo interno e o que ele grava vem de `getData()`, não necessariamente do
 * DOM - escrever `innerHTML` no corpo editável pode ser ignorado na hora de
 * salvar. Content script roda em contexto isolado e NÃO enxerga
 * `window.CKEDITOR`, por isso a chamada precisa passar pelo main world.
 *
 * Essa é a mesma barreira que o SEI Pro resolve declarando o CKEditor em
 * `web_accessible_resources` e injetando um <script> na página (técnica da era
 * MV2). O `chrome.scripting.executeScript({ world: 'MAIN' })` do MV3 chega ao
 * mesmo lugar sem expor nenhum recurso da extensão a páginas de terceiros.
 *
 * Fallback para `innerHTML` quando não houver CKEditor (editor em modo div, ou
 * versão que não exponha a instância).
 */
/**
 * Número da SOF que o próprio SEI gerou no modelo do documento (ex.: "173/2026").
 *
 * O SEI numera cada nova SOF sequencialmente e já entrega o modelo com esse
 * número - mesmo com "Texto Inicial: Nenhum" marcado, confirmado no 5º teste
 * real. Esse número é gerado NA HORA da criação, então o app não tem como
 * saber de antemão: só dá para lê-lo aqui, do modelo, antes de substituir o
 * conteúdo.
 *
 * Primeiro procura um número colado à sigla "SOF" (mais confiável); se não
 * achar, cai para o primeiro NNN/AAAA nos 1000 primeiros caracteres - o
 * cabeçalho do documento -, para não capturar uma data ou valor perdido no meio
 * do texto.
 */
function numeroSofNoModelo_(corpo) {
  if (!corpo) return null;
  const texto = ((corpo.innerText || corpo.textContent) || "").replace(/\s+/g, " ");
  const comSigla = texto.match(/SOF[^\d]{0,20}(\d{1,4}\s*\/\s*\d{4})/i);
  if (comSigla) return comSigla[1].replace(/\s/g, "");
  const noCabecalho = texto.slice(0, 1000).match(/\b(\d{1,4}\s*\/\s*\d{4})\b/);
  return noCabecalho ? noCabecalho[1].replace(/\s/g, "") : null;
}

/**
 * Espera o conteúdo do editor parar de mudar.
 *
 * BUG do 8º teste (2026-08-10): o conteúdo do app não colava e o modelo do SEI
 * permanecia. Causa: o corpo do editor existe no DOM ANTES de o CKEditor
 * terminar de carregar o modelo do documento. A extensão injetava nesse
 * intervalo e, logo depois, o modelo era carregado POR CIMA - resultado
 * idêntico a "não fez nada".
 *
 * Isso não aparecia até a v0.6.0 porque havia a barra de confirmação: o tempo
 * até o usuário clicar em "Substituir" já servia de espera. Ao remover a
 * pergunta (v0.11.0), a corrida ficou exposta.
 */
async function aguardarEditorEstabilizar_(msEstavel, msLimite) {
  const inicio = Date.now();
  let anterior = null;
  let desde = Date.now();
  while (Date.now() - inicio < (msLimite || 20000)) {
    const corpo = corpoDoEditor_();
    const atual = corpo ? (corpo.innerHTML || "").length : -1;
    if (atual !== anterior) {
      anterior = atual;
      desde = Date.now();
    } else if (atual >= 0 && Date.now() - desde >= (msEstavel || 1500)) {
      return true;
    }
    await esperar_(300);
  }
  return false;
}

/** O que está no editor se parece com o que tentamos colocar? */
function conteudoConfere_(html) {
  const corpo = corpoDoEditor_();
  if (!corpo) return false;
  const atual = (corpo.innerHTML || "").length;
  // Metade do tamanho é folga suficiente: o CKEditor reescreve a marcação
  // (remove atributos, normaliza tags), mas não corta o documento pela metade.
  return atual >= Math.floor(html.length * 0.5);
}

/**
 * Sanitiza o HTML do documento antes de injetá-lo na página do SEI (defesa em
 * profundidade, 2026-09-29). O HTML vem do app GAOCG - origem confiável pelo
 * externally_connectable do manifest, e o app já escapa os campos. Mas esta é a
 * fronteira onde conteúdo externo entra numa página de TERCEIROS (sei.pe.gov.br):
 * se o app fosse comprometido (ex.: XSS num campo de texto livre), sem isto o
 * HTML malicioso seria injetado no SEI via innerHTML/setData e poderia executar
 * script na origem do SEI. Uma allowlist estrita deixa passar só as tags e
 * atributos que o documento realmente usa (parágrafos, tabelas, formatação),
 * removendo script, handlers de evento (on*), iframe, img e afins. As classes do
 * app são descartadas de propósito: os estilos já viajam inline
 * (prepararHtmlParaEditor_, sei-bridge.js), então o visual do documento é mantido.
 */
var TAGS_PERMITIDAS_DOC_ = {
  P: 1, BR: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, S: 1,
  H1: 1, H2: 1, H3: 1, H4: 1, DIV: 1, SPAN: 1,
  TABLE: 1, THEAD: 1, TBODY: 1, TFOOT: 1, TR: 1, TH: 1, TD: 1,
  UL: 1, OL: 1, LI: 1
};
var ATRIBUTOS_PERMITIDOS_DOC_ = {
  style: 1, colspan: 1, rowspan: 1, align: 1, valign: 1,
  width: 1, border: 1, cellpadding: 1, cellspacing: 1
};
var TAGS_REMOVER_COM_CONTEUDO_ = [
  "script", "style", "iframe", "object", "embed", "link", "meta", "base",
  "form", "input", "button", "textarea", "select", "img", "svg", "math",
  "video", "audio", "source", "noscript", "template"
];

function estiloSeguro_(valor) {
  // Descarta o style inteiro se contiver vetores conhecidos (url(), expression, javascript:).
  return /url\s*\(|expression\s*\(|javascript:/i.test(valor) ? "" : valor;
}

function sanitizarHtmlDocumento_(html) {
  var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  var corpo = doc.body;
  if (!corpo) return "";

  // 1. Remove por completo (com o conteúdo) as tags perigosas.
  corpo.querySelectorAll(TAGS_REMOVER_COM_CONTEUDO_.join(",")).forEach(function (el) { el.remove(); });

  // 2. De trás pra frente (descendentes antes dos ancestrais): tag fora da
  //    allowlist é desembrulhada (mantém o texto), atributo fora da allowlist
  //    (inclui todo on*) é removido, e o style passa pelo filtro acima.
  var elementos = corpo.querySelectorAll("*");
  for (var i = elementos.length - 1; i >= 0; i--) {
    var el = elementos[i];
    if (!TAGS_PERMITIDAS_DOC_[el.tagName]) {
      while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
      el.remove();
      continue;
    }
    var attrs = Array.prototype.slice.call(el.attributes);
    for (var k = 0; k < attrs.length; k++) {
      var nome = attrs[k].name.toLowerCase();
      if (!ATRIBUTOS_PERMITIDOS_DOC_[nome]) {
        el.removeAttribute(attrs[k].name);
      } else if (nome === "style") {
        var limpo = estiloSeguro_(attrs[k].value);
        if (limpo) el.setAttribute("style", limpo); else el.removeAttribute("style");
      }
    }
  }

  return corpo.innerHTML;
}

async function aplicarConteudo_(corpoInicial, pendente) {
  // 1. Deixa o modelo do SEI terminar de carregar antes de qualquer coisa.
  await aguardarEditorEstabilizar_(1500, 20000);
  const corpo = corpoDoEditor_() || corpoInicial;

  // 2. Lê o número do modelo (agora que ele existe de verdade) e troca no HTML.
  const numeroSei = editorEstaVazio_(corpo) ? null : numeroSofNoModelo_(corpo);
  let html = pendente.html;
  if (numeroSei && pendente.marcadorNumero && pendente.marcadorNumero !== numeroSei) {
    html = html.split(pendente.marcadorNumero).join(numeroSei);
  }
  // Sanitiza ANTES de qualquer injeção (setData ou innerHTML) - ver
  // sanitizarHtmlDocumento_. Este é o único ponto por onde o HTML do documento
  // chega ao editor do SEI, então basta filtrar aqui.
  html = sanitizarHtmlDocumento_(html);
  // Guarda pro app poder buscar depois (sessão 2026-08-14) - não bloqueia o
  // resto do fluxo se falhar.
  if (numeroSei) guardarNumeroSofCapturado_(pendente.numeroProcesso, numeroSei).catch(() => {});

  // 3. Injeta e CONFERE. Se o modelo ainda vier por cima, tenta de novo - sem
  //    a conferência, a extensão avisava "inserido" com o modelo na tela.
  let resultado = { ok: false };
  let via = "dom";
  let colou = false;
  for (let tentativa = 1; tentativa <= 3 && !colou; tentativa++) {
    resultado = await pedirInjecaoNoMainWorld_(html);
    via = resultado.ok ? "api" : "dom";
    if (!resultado.ok) {
      const alvo = corpoDoEditor_() || corpo;
      alvo.innerHTML = html;
      alvo.dispatchEvent(new Event("input", { bubbles: true }));
      alvo.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await esperar_(1200);
    colou = conteudoConfere_(html);
    console.log("[GAOCG SEI Bridge] tentativa " + tentativa + " via " + via + " - colou: " + colou);
  }

  if (!colou) {
    avisarNaTela_("GAOCG: não consegui colar o conteúdo da SOF no editor. Use \"Salvar e gerar documento SEI\" no app e cole manualmente.");
    return;
  }

  const detalhe = via === "api" ? " (seção " + (resultado.escolhida || "?") + ")" : " (modo DOM)";

  await chrome.storage.local.remove(CHAVE_PENDENTE_).catch(() => {});

  // Salvar automaticamente (pedido do usuário, 2026-08-10). Pequena pausa antes:
  // o CKEditor precisa terminar de processar o setData, senão o salvamento pode
  // pegar o conteúdo antigo.
  await esperar_(800);
  const salvou = salvarNoEditor_();

  avisarNaTela_(
    "GAOCG: conteúdo da " + (pendente.rotulo || "SOF") + " inserido" + detalhe +
    (numeroSei ? " · Nº da SOF no SEI: " + numeroSei : "") +
    (salvou ? " · salvo automaticamente." : " · SALVE o documento (não achei o botão Salvar).")
  );
}

/**
 * Clica no "Salvar" do editor do SEI. São vários candidatos porque o botão
 * muda de forma entre versões (botão da barra do SEI, item da toolbar do
 * CKEditor, input submit). Devolve false sem lançar - aí o aviso na tela pede
 * o salvamento manual, em vez de dar a impressão de que ficou tudo pronto.
 */
function salvarNoEditor_() {
  const seletores = [
    "#cmdSalvar",
    'input[value="Salvar"]',
    'button[value="Salvar"]',
    'a[title="Salvar"]',
    'img[title="Salvar"]',
    "a.cke_button__save",
    ".cke_button__save"
  ].join(", ");

  const botao = acharTodos_(seletores).find(b => b.offsetParent !== null);
  if (!botao) return false;
  clicarComoUsuario_(botao.closest("a") || botao);
  return true;
}

/** Devolve { ok, escolhida } - `escolhida` é o nome da seção do SEI que recebeu o conteúdo. */
function pedirInjecaoNoMainWorld_(html) {
  // Com a página saindo, a resposta nunca chegaria: cai direto no modo DOM em
  // vez de deixar um canal de mensagem órfão (ver paginaSaindo_).
  if (paginaSaindo_) return Promise.resolve({ ok: false });
  try {
    return chrome.runtime
      .sendMessage({ type: "INJETAR_CKEDITOR", html: html })
      .then(r => (r && r.ok) ? { ok: true, escolhida: r.escolhida } : { ok: false })
      .catch(() => ({ ok: false }));
  } catch (e) {
    return Promise.resolve({ ok: false });
  }
}

/** Aviso discreto na própria página do SEI - o app GAOCG pode nem estar visível quando o editor abre. */
function avisarNaTela_(texto) {
  const aviso = document.createElement("div");
  aviso.textContent = texto;
  aviso.style.cssText = [
    "position:fixed", "top:12px", "right:12px", "z-index:2147483647",
    "background:#1c7a37", "color:#fff", "padding:10px 14px", "border-radius:8px",
    "font:13px system-ui,sans-serif", "box-shadow:0 4px 12px rgba(0,0,0,.25)", "max-width:340px"
  ].join(";");
  document.body.appendChild(aviso);
  setTimeout(() => aviso.remove(), 8000);
}

/* ===================== Envio em lote (arrastar e soltar) =====================
 *
 * Pedido do usuário (2026-09-02): arrastar vários arquivos do PC direto para
 * dentro do processo aberto no SEI, cada um virando um "Documento Externo".
 *
 * HISTÓRICO (2 rodadas de correção antes do 1º teste real com captura de
 * tela, 2026-09-03):
 *
 * 1ª tentativa: escolhia um tipo genérico "Externo" primeiro. Sem ter como
 * testar, chutei errado ao "corrigir" isso olhando o código da extensão SEI
 * Pro (SEI-Pro/sei-pro no GitHub): lá, o tipo configurado (ex. "Anexo") já é
 * escolhido DIRETO como externo. Troquei pra esse caminho.
 *
 * 2ª tentativa (a que o usuário testou de verdade): escolher "Anexo" direto
 * abriu a tela de GERAR DOCUMENTO (com "Texto Inicial: Documento
 * Modelo/Texto Padrão/Nenhum", editor embutido) - SEM nenhum campo de
 * arquivo. Prova de que, NESTA instalação (SES-PE), "Anexo" é um tipo
 * INTERNO (com modelo/editor), não externo - diferente do ambiente onde a
 * SEI Pro foi testada. A suposição original (tipo genérico "Externo" que leva
 * à tela de upload, com "Tipo do Documento" como classificação DENTRO do
 * cadastro do Externo) era a certa pra cá. Revertido.
 *
 * O mesmo teste revelou outro bug real: a tela pediu "Informe o Número" e
 * nada foi salvo - "Número" é um campo DIFERENTE de "Nome na Árvore"
 * (confirmado na tela: os dois aparecem lado a lado) e é OBRIGATÓRIO. Como
 * não existe um "número" natural pra um arquivo solto do lote, a extensão
 * agora GERA um identificador automático pra esse campo (pedido do usuário -
 * "faça um gerador de ID") - ver gerarNumeroDocumento_.
 *
 * O que ainda fica de pé da checagem no código da SEI Pro (não contestado
 * pelo teste real): formato padrão "Nato-digital" e os nomes reais dos campos
 * (`filArquivo`, `txtDataElaboracao`, `txtNumero`, `txtNomeArvore`), usados
 * como fallback do rótulo visível.
 *
 * O que CONTINUA sendo suposição, sem confirmação num teste real completo
 * (até o arquivo realmente aparecer anexado no processo):
 *   1. Que depois de salvar, a tela volta pro MESMO processo sem recarregar o
 *      documento do topo - por isso o próximo arquivo da fila é processado em
 *      seguida. Se o SEI navegar/recarregar ao salvar, a fila em memória se
 *      perde e só os arquivos já enviados ficam registrados - o painel avisa
 *      quantos faltam nesse caso, em vez de travar.
 *   2. Que o botão "Salvar"/"Confirmar Dados" já usado pro resto do arquivo
 *      também existe nesta tela.
 *
 * Cada arquivo do lote usa o MESMO Tipo do Documento e Nível de Acesso,
 * configurados uma única vez no painel (decisão do usuário) - o nome de cada
 * arquivo vira o "Nome na Árvore" daquele documento.
 */

/**
 * Cronômetro de diagnóstico (pedido do usuário, 2026-09-04: "tem como ver
 * quanto tempo o SEI leva pra responder, pra otimizar direito?"). Loga
 * `rotulo` + quanto tempo passou desde `t0` (em ms), prefixado "[GAOCG
 * tempo]" pra ser fácil de filtrar no Console do DevTools, e devolve o
 * timestamp atual - encadeável, pra medir cada etapa sem precisar guardar
 * uma variável por etapa.
 */
function marcarTempo_(t0, rotulo) {
  const agora = Date.now();
  console.log("[GAOCG tempo] " + rotulo + ": " + (agora - t0) + "ms");
  return agora;
}

/** Data de hoje no formato dd/mm/aaaa, como os campos de data do SEI esperam. */
function dataHojeSei_() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return dd + "/" + mm + "/" + d.getFullYear();
}

/** Nome do arquivo sem a extensão, pra usar como "Nome na Árvore". */
function nomeSemExtensao_(nomeArquivo) {
  const i = nomeArquivo.lastIndexOf(".");
  return i > 0 ? nomeArquivo.slice(0, i) : nomeArquivo;
}

/**
 * Anexa um `File` real (vindo de um evento de drop) a um `<input type=file>`
 * via DataTransfer - é o único jeito de programaticamente colocar um arquivo
 * num input desses (não dá pra atribuir `.value`, por segurança do browser).
 */
function anexarArquivoAoInput_(inputArquivo, arquivo) {
  try {
    const dt = new DataTransfer();
    dt.items.add(arquivo);
    inputArquivo.files = dt.files;
    dispararChange_(inputArquivo);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Contador em memória - garante que dois arquivos do MESMO lote nunca gerem o
 * mesmo "Número" mesmo se disparados no mesmo segundo (ver gerarNumeroDocumento_).
 */
let contadorLote_ = 0;

/**
 * true enquanto um lote está sendo processado - achado 2026-09-04 (medição
 * real de tempo): o relógio que reposiciona a caixa de anotação
 * (setInterval a cada 2s, ver inicialização no fim do arquivo) varre a
 * página inteira (todos os `a`/`span`/`div`, em todos os iframes) e ficava
 * rodando o tempo todo, inclusive durante o lote - competindo por CPU bem na
 * hora que a escolha do tipo "Externo" ficava progressivamente mais lenta
 * (4,5s → 8s ao longo do lote, sinal de acúmulo de iframes na página do SEI
 * a cada "Incluir Documento"). Usado pra pausar esse relógio enquanto o lote
 * roda, já que a caixa de anotação não precisa se mexer nesse meio tempo.
 */
let gaocgLoteEmAndamento_ = false;

/**
 * Gera um "Número" automático pro Documento Externo - achado 2026-09-03 (teste
 * real): esse campo é DIFERENTE de "Nome na Árvore" e é OBRIGATÓRIO (alerta
 * "Informe o Número" bloqueava o salvamento, e nada era anexado). Como o fluxo
 * de lote não tem um número real de processo/documento pra usar, gera um
 * identificador só pra satisfazer a obrigatoriedade - carimbo de data/hora +
 * contador, então nunca colide dentro do mesmo lote nem entre lotes.
 */
function gerarNumeroDocumento_() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  contadorLote_ += 1;
  return "GAOCG-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
    + "-" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
    + "-" + String(contadorLote_).padStart(3, "0");
}

/* ===================== varredura ISOLADA, só do envio em lote =====================
 *
 * Pedido do usuário (2026-09-04): separar essa funcionalidade da que a SOF/NE/
 * Recibo usa, pra poder otimizar o envio em lote (velocidade, comportamento de
 * espera etc.) sem NENHUM risco de afetar aqueles fluxos, que já estão
 * comprovados funcionando de verdade em testes reais.
 *
 * Daqui pra baixo, cada função tem uma versão própria com sufixo `Lote_`:
 *   - cópias de funções REALMENTE compartilhadas com a SOF/NE/Recibo
 *     (`documentosDisponiveis_`, `acharEm_`, `acharTodos_`, `documentoComTexto_`,
 *     `todosElementos_`, `campoPorRotulo_`, `abrirIncluirDocumento_`,
 *     `escolherTipoDocumento_`, `chegouTelaCadastro_`) - os originais continuam
 *     intactos, só pra SOF/NE/Recibo;
 *   - `forcarOpcaoPorRotuloLote_`, `marcarRadioReforcadoLote_`,
 *     `selecionarEmSelectPorRotuloLote_`, `campoPorRotuloOuNomeLote_` e
 *     `selecionarOpcaoPorTextoLote_` JÁ eram exclusivas do envio em lote antes
 *     desta separação (a SOF nunca as usou) - os originais sem sufixo foram
 *     REMOVIDOS (ficariam mortos, sem uso), não só duplicados.
 * Usadas SÓ por `enviarArquivoComoExterno_` a partir de agora. Utilitários realmente
 * genéricos e sem estado (`esperar_`, `dispararChange_`, `teclar_`,
 * `clicarComoUsuario_`, `textoNormalizado_`, `aguardarCondicao_`,
 * `SELETOR_CAMPO_`, `itemDaLista_` - este último já recebe o escopo por
 * parâmetro, não tem estado compartilhado pra isolar) continuam reaproveitados
 * como estavam - não haveria ganho nenhum em duplicá-los.
 */

/** Documento do topo + todos os iframes de mesma origem (recursivo) - cópia isolada pro envio em lote. */
function documentosDisponiveisLote_(doc) {
  doc = doc || document;
  const lista = [doc];
  for (const frame of Array.from(doc.querySelectorAll("iframe, frame"))) {
    let interno = null;
    try {
      interno = frame.contentDocument;
    } catch (e) {
      interno = null; // cross-origin
    }
    if (interno) lista.push(...documentosDisponiveisLote_(interno));
  }
  return lista;
}

function acharEmLote_(seletor) {
  for (const doc of documentosDisponiveisLote_()) {
    const el = doc.querySelector(seletor);
    if (el) return el;
  }
  return null;
}

function acharTodosLote_(seletor) {
  const encontrados = [];
  for (const doc of documentosDisponiveisLote_()) {
    encontrados.push(...Array.from(doc.querySelectorAll(seletor)));
  }
  return encontrados;
}

/** Documento (topo ou iframe) que contém um texto - cópia isolada pro envio em lote (ver documentoComTexto_). */
function documentoComTextoLote_(trecho) {
  const alvo = trecho.toLowerCase();
  for (const doc of documentosDisponiveisLote_()) {
    let texto = "";
    try {
      texto = (doc.body && (doc.body.innerText || doc.body.textContent)) || "";
    } catch (e) {
      texto = "";
    }
    if (texto.toLowerCase().indexOf(alvo) !== -1) return doc;
  }
  return null;
}

/** Todos os elementos de todos os documentos acessíveis - cópia isolada pro envio em lote. */
function todosElementosLote_() {
  const lista = [];
  for (const doc of documentosDisponiveisLote_()) {
    lista.push(...Array.from(doc.querySelectorAll("*")));
  }
  return lista;
}

/** Campo por rótulo visível - cópia isolada pro envio em lote (ver campoPorRotulo_). */
function campoPorRotuloLote_(rotulo, tipoDesejado) {
  const alvo = rotulo.toLowerCase();
  const elementos = todosElementosLote_();

  for (let i = 0; i < elementos.length; i++) {
    const el = elementos[i];
    if (el.children.length > 2) continue;
    if (textoNormalizado_(el) !== alvo) continue;

    if (el.tagName === "LABEL" && el.htmlFor) {
      const porFor = el.ownerDocument.getElementById(el.htmlFor);
      if (porFor) return porFor;
    }
    for (let j = i + 1; j < Math.min(i + 40, elementos.length); j++) {
      const cand = elementos[j];
      if (!cand.matches || !cand.matches(SELETOR_CAMPO_)) continue;
      if (tipoDesejado && cand.tagName.toLowerCase() !== tipoDesejado) continue;
      return cand;
    }
  }
  return null;
}

/** Campo por rótulo (várias variações) OU pelo atributo `name` real do SEI - cópia isolada pro envio em lote. */
function campoPorRotuloOuNomeLote_(rotulos, nomeAttr, tipoDesejado) {
  for (const rotulo of rotulos) {
    const campo = campoPorRotuloLote_(rotulo, tipoDesejado);
    if (campo) return campo;
  }
  if (nomeAttr) {
    const campo = acharEmLote_('[name="' + nomeAttr + '"]');
    if (campo && (!tipoDesejado || campo.tagName.toLowerCase() === tipoDesejado)) return campo;
  }
  return null;
}

async function abrirIncluirDocumentoLote_() {
  const seletor = [
    'a[title="Incluir Documento"]',
    'img[title="Incluir Documento"]',
    'a[href*="documento_escolher_tipo"]'
  ].join(", ");
  const alvo = await aguardarCondicao_(() => acharEmLote_(seletor), 8000);
  if (!alvo) return false;
  (alvo.closest("a") || alvo).click();
  return true;
}

/** "Nome na Árvore" é o marco confiável de que o cadastro chegou - cópia isolada pro envio em lote. */
function chegouTelaCadastroLote_() {
  return !!(acharEmLote_("#frmDocumentoCadastro") || campoPorRotuloLote_("Nome na Árvore"));
}

/**
 * Escolhe o tipo do documento - versão SIMPLIFICADA e isolada, só pro envio em
 * lote: assinatura direta (`filtro`, `rotulos`) em vez de `tipoGaocg` +
 * `MAPA_TIPO_DOCUMENTO` (o lote nunca usou essa tabela - sempre passava um
 * override completo) e sem suporte a `excluir` (não é usado aqui; o único
 * "tipo ambíguo" conhecido, SOF vs. e-SOF, é problema exclusivo do fluxo da
 * SOF). Mesma lógica de seleção (teclado primeiro, mouse como reforço).
 */
async function escolherTipoDocumentoLote_(filtro, rotulos) {
  if (!rotulos || !rotulos.length) return false;

  // Intervalos de verificação (o 4º parâmetro de aguardarCondicao_) apertados
  // agora que essa função é isolada só do lote (achado 2026-09-04, medição
  // real: "escolher tipo Externo" leva uns 4,5s, dominado por espera real do
  // SEI carregar a tela) - de 120/100/80ms pra 30ms, checa o dobro/triplo de
  // vezes por segundo, então detecta a tela pronta um pouco mais cedo em
  // média. Ganho pequeno (a maior parte do tempo continua sendo o SEI
  // respondendo, não dá pra encurtar isso), mas sem custo nenhum de segurança
  // agora que não compartilha mais com a SOF.
  const escopo = await aguardarCondicao_(
    () => documentoComTextoLote_("Escolha o Tipo do Documento"), 8000, 30
  ) || document;

  if (filtro) {
    const filtroEl = await aguardarCondicao_(
      () => Array.from(escopo.querySelectorAll('input[type=text], input:not([type])')).find(i => i.offsetParent !== null),
      6000, 30
    );
    if (filtroEl) {
      filtroEl.focus();
      filtroEl.value = filtro;
      filtroEl.dispatchEvent(new Event("input", { bubbles: true }));
      teclar_(filtroEl, filtro.slice(-1), filtro.toUpperCase().charCodeAt(filtro.length - 1));
      dispararChange_(filtroEl);

      const apareceu = await aguardarCondicao_(() => itemDaLista_(escopo, rotulos), 6000, 30);
      await esperar_(apareceu ? 40 : 250);
      teclar_(filtroEl, "ArrowDown", 40);
      await esperar_(40);
      teclar_(filtroEl, "Enter", 13);
      if (await aguardarCondicao_(chegouTelaCadastroLote_, 3500, 30)) return true;
    }
  }

  const achado = await aguardarCondicao_(() => {
    const select = escopo.querySelector("#selSerie");
    if (select) {
      const opcao = Array.from(select.options).find(o =>
        rotulos.some(r => (o.textContent || "").toLowerCase().indexOf(r.toLowerCase()) !== -1));
      if (opcao) return { tipo: "select", select: select, opcao: opcao };
    }
    const item = itemDaLista_(escopo, rotulos);
    if (item) return { tipo: "item", item: item };
    return null;
  }, 8000, 30);

  if (!achado) return false;
  if (achado.tipo === "item") {
    clicarComoUsuario_(achado.item);
    return await aguardarCondicao_(chegouTelaCadastroLote_, 5000, 30) ? true : true;
  }
  achado.select.value = achado.opcao.value;
  dispararChange_(achado.select);
  return true;
}

/** Igual a forcarOpcaoPorRotulo_ - cópia isolada pro envio em lote (dispara clique+change mesmo se já marcado). */
function forcarOpcaoPorRotuloLote_(rotulo) {
  const alvo = rotulo.trim().toLowerCase();
  for (const entrada of acharTodosLote_('input[type=radio], input[type=checkbox]')) {
    let texto = "";
    const doc = entrada.ownerDocument;
    if (entrada.id) {
      const lbl = doc.querySelector('label[for="' + entrada.id + '"]');
      if (lbl) texto = textoNormalizado_(lbl);
    }
    if (!texto && entrada.parentElement) texto = textoNormalizado_(entrada.parentElement);
    if (!texto && entrada.nextElementSibling) texto = textoNormalizado_(entrada.nextElementSibling);
    if (texto === alvo) {
      entrada.checked = true;
      entrada.click();
      dispararChange_(entrada);
      return true;
    }
  }
  return false;
}

/** 2 camadas (radio nativo + clique em elemento visível) - cópia isolada pro envio em lote. */
async function marcarRadioReforcadoLote_(rotulo) {
  if (forcarOpcaoPorRotuloLote_(rotulo)) return true;
  const alvo = rotulo.trim().toLowerCase();
  const elemento = acharTodosLote_("label, span, div, li, a, button").find(el =>
    el.offsetParent !== null && el.children.length <= 2 && textoNormalizado_(el) === alvo
  );
  if (!elemento) return false;
  clicarComoUsuario_(elemento);
  await esperar_(150);
  return true;
}

/** Igual a selecionarEmSelectPorRotulo_ - cópia isolada pro envio em lote. */
function selecionarEmSelectPorRotuloLote_(rotulo, contendo) {
  const campo = campoPorRotuloLote_(rotulo, "select");
  if (!campo) return false;
  const alvo = contendo.trim().toLowerCase();
  const opcao = Array.from(campo.options).find(o => (o.textContent || "").toLowerCase().indexOf(alvo) !== -1);
  if (!opcao) return false;
  campo.value = opcao.value;
  dispararChange_(campo);
  return true;
}

/** <select> com uma opção contendo `trecho` - cópia isolada pro envio em lote. */
function selecionarOpcaoPorTextoLote_(trecho) {
  const alvo = trecho.trim().toLowerCase();
  for (const select of acharTodosLote_("select")) {
    const opcao = Array.from(select.options).find(o => (o.textContent || "").toLowerCase().indexOf(alvo) !== -1);
    if (opcao) {
      select.value = opcao.value;
      dispararChange_(select);
      return true;
    }
  }
  return false;
}

/**
 * Envia UM arquivo como Documento Externo. Cada etapa é best-effort e devolve
 * cedo com `erro` descritivo em vez de travar a fila inteira - um arquivo
 * problemático não pode impedir os outros.
 */
async function enviarArquivoComoExterno_(arquivo, config) {
  const tInicioArquivo = Date.now();
  let t = tInicioArquivo;
  console.log("[GAOCG tempo] --- iniciando " + arquivo.name + " ---");

  // Diagnóstico (achado 2026-09-04, medição real: "escolher tipo Externo" foi
  // de 4,5s a 8s, piorando a cada arquivo do lote) - conta quantos iframes
  // existem na página nesse momento, pra confirmar (ou descartar) a suspeita
  // de que o SEI vai acumulando iframes "mortos" de aberturas anteriores de
  // "Incluir Documento", tornando a varredura de tela cada vez mais cara.
  console.log("[GAOCG tempo] iframes na página antes de abrir Incluir Documento:", document.querySelectorAll("iframe, frame").length);

  const abriu = await abrirIncluirDocumentoLote_();
  t = marcarTempo_(t, "abrir Incluir Documento");
  if (!abriu) return { ok: false, nome: arquivo.name, erro: 'Não encontrei "Incluir Documento".' };

  // CORREÇÃO (achado 2026-09-03, teste real): escolher o tipo configurado
  // (ex. "Anexo") DIRETO na tela "Escolha o Tipo do Documento" abre a tela de
  // GERAR documento (com editor/"Texto Inicial"), não tem campo de arquivo
  // nenhum - "Anexo" aqui é um tipo interno, não externo. Existe sim um tipo
  // genérico "Externo" separado nesta instalação do SEI (a suposição original,
  // antes de eu "corrigir" com base no código da extensão SEI Pro - que serve
  // outro ambiente, onde a configuração dos tipos é diferente). Volta a
  // escolher "Externo" primeiro; o tipo configurado no painel (ex. "Anexo")
  // entra depois, como a CLASSIFICAÇÃO dentro do cadastro do Externo (campo
  // "Tipo do Documento").
  const tipoOk = await escolherTipoDocumentoLote_("Externo", ["Externo", "Documento Externo"]);
  t = marcarTempo_(t, "escolher tipo Externo");
  if (!tipoOk) return { ok: false, nome: arquivo.name, erro: 'Não encontrei o tipo "Externo" na lista do SEI.' };

  // Marco de chegada: o input de arquivo é o sinal mais confiável de que a
  // tela certa (cadastro de documento externo) abriu - mais confiável que um
  // rótulo de texto, que pode vir composto.
  const chegou = await aguardarCondicao_(
    () => acharEmLote_('input[type="file"]') || acharEmLote_('[name="filArquivo"]') || acharEmLote_("#frmDocumentoCadastro"),
    12000, 250
  );
  t = marcarTempo_(t, "chegar no cadastro do Documento Externo");
  if (!chegou) return { ok: false, nome: arquivo.name, erro: "O cadastro do Documento Externo não abriu." };

  // A PARTIR DAQUI: campos por NOME/ID REAL, não mais por rótulo visível nem
  // "reforço" de clique. Achado 2026-09-04, cavando o código da extensão SEI
  // Pro mais a fundo (função `submitUploadArvore`, que de fato monta e
  // envia o cadastro de Documento Externo pro SEI): os 3 erros anteriores
  // ("Informe o Formato", "Nível de acesso local não informado", Hipótese
  // Legal vazia) tinham uma causa em comum - alguns desses campos são
  // DUPLICADOS: um radio/select VISÍVEL e um `<input type=hidden>` que
  // precisa ter o MESMO valor, e clicar no radio visível não escreve
  // sozinho no hidden correspondente. Nomes/ids reais confirmados no código
  // deles:
  //   selSerie            - select "Tipo do Documento"
  //   rdoNivelAcesso       - radio Nível de Acesso (valor "0"/"1"/"2", igual
  //                          ao MAPA_NIVEL_ACESSO já usado no resto do arquivo)
  //   hdnStaNivelAcessoLocal - hidden, PRECISA ter o MESMO valor de rdoNivelAcesso
  //                          (esse é o campo do erro "Nível de acesso local")
  //   rdoFormato           - radio Formato (valor "N" = Nato-digital, "D" = Digitalizado)
  //   selHipoteseLegal / hdnIdHipoteseLegal - select + hidden espelhado, MESMO valor
  //   hdnFlagDocumentoCadastro - hidden fixo "2"
  //   txaObservacoes        - Observações (deixado vazio, igual ao deles)
  //   txtDataElaboracao, txtNumero - já usados antes, confirmados de novo

  // ORDEM REESCRITA (achado 2026-09-04, 3º teste real): o Nível de Acesso
  // agora é o PRIMEIRO campo mexido, não o último. No teste anterior, Tipo,
  // Data, Número e Formato TINHAM sido preenchidos certinho (confirmado nos
  // testes de antes), mas a tela voltou a pedir "Informe a Data" - ou seja,
  // esses campos foram ZERADOS de volta em algum momento DEPOIS de
  // preenchidos. Suspeita forte: clicar em Nível de Acesso (ou no seu div,
  // ver abaixo) dispara um recarregamento PARCIAL da tela (a mesma cascata
  // que popula a Hipótese Legal), que reresetava tudo que já tinha sido
  // preenchido antes dele. Resolvido invertendo a ordem: mexe no Nível de
  // Acesso primeiro, espera qualquer recarregamento acontecer e assentar, e
  // só DEPOIS preenche o resto - assim nada preenchido é jogado fora.

  // Nível de Acesso: o SEI embrulha cada opção num
  // `<div id="divOptPublico" class="infraDivRadio">` / `divOptRestrito` /
  // `divOptSigiloso` (confirmado no HTML real) - é ESSE div que tem o clique
  // de verdade, não o `<input>` por baixo.
  //
  // SÓ 1 DISPARO DE EVENTO AQUI (achado 2026-09-04, console real do
  // navegador): a versão anterior clicava no div E no radio E disparava
  // change de novo mais adiante na conferência - até 3 disparos seguidos no
  // MESMO grupo. O console mostrou "Uncaught TypeError: Cannot read
  // properties of null (reading 'executar')" - o MESMO bug nativo do SEI já
  // documentado neste arquivo (ver comentário no 9º teste da SOF, dentro de
  // marcarOpcaoPorRotulo_): disparar cliques/changes repetidos rápido demais
  // no mesmo campo faz uma segunda execução do handler nativo encontrar um
  // elemento que a primeira ainda não terminou de montar - e é bem provável
  // que isso estivesse atropelando a chamada que carrega a Hipótese Legal.
  // Agora só UM caminho é usado (o primeiro que existir), sem repetir.
  const nomeOpcaoNivel = { publico: "Publico", restrito: "Restrito", sigiloso: "Sigiloso" }[config.nivelAcesso] || "Publico";
  const divNivel = document.getElementById("divOpt" + nomeOpcaoNivel);
  const valorNivelPedido = MAPA_NIVEL_ACESSO[config.nivelAcesso] || "0";
  const radioNivel = acharEmLote_(`input[name="rdoNivelAcesso"][value="${valorNivelPedido}"]`);

  // NÃO clica se já está no valor certo (achado 2026-09-04, console real: o
  // crash nativo `alterarNivelAcesso` - "Cannot read properties of null
  // (reading 'executar')" - continuava aparecendo mesmo com só 1 disparo por
  // execução, e o arquivo seguia sendo salvo sem anexo depois disso. Suspeita
  // forte: esse crash deixa algum estado interno do JS da página quebrado, e
  // isso contamina o upload do arquivo logo em seguida. O padrão já
  // documentado neste arquivo pra esse MESMO erro, no fluxo da SOF - dentro
  // de marcarOpcaoPorRotulo_ - é exatamente este: "se já está marcado, não
  // mexe, não dispara de novo". Faltava aplicar essa mesma proteção aqui.
  // ACHADO 2026-09-04 (console real - mesmo erro nativo persistindo): o
  // "pular se já certo" não bastou porque o caminho que DE FATO clica ainda
  // tinha 3 disparos (`checked=true` + `.click()` + `dispararChange_()`) -
  // EXATAMENTE o padrão que já provamos, na SOF, que quebra o SEI
  // (`alterarNivelAcesso`). O clique no div (`clicarComoUsuario_`) já
  // dispara toda a sequência de mouse que um clique de verdade dispara -
  // isso sozinho já é "um clique". A parte redundante era mexer no radio
  // TAMBÉM, por cima, com checked+click+change manuais. Removido - agora
  // é só o clique no div OU, na ausência dele, um único `.click()` puro no
  // radio (o padrão comprovado da SOF, sem checked/dispararChange_ extra).
  const jaEstaCerto = radioNivel && radioNivel.checked;
  if (jaEstaCerto) {
    // nada a fazer - já é o valor pedido, não repete o clique.
  } else if (divNivel) {
    clicarComoUsuario_(divNivel);
  } else if (radioNivel) {
    radioNivel.click();
  } else {
    const rotuloNivel = { publico: "Público", restrito: "Restrito", sigiloso: "Sigiloso" }[config.nivelAcesso] || "Público";
    await marcarRadioReforcadoLote_(rotuloNivel);
  }
  // Espera um recarregamento parcial (se houver) assentar - só se algo foi
  // de fato clicado; se já estava certo, não há nada pra esperar assentar.
  // Reduzida de 1200ms pra 700ms (achado 2026-09-04: pedido de velocidade
  // depois do 1º lote 100% bem-sucedido - ainda generosa, mas menos que a
  // versão "com folga extra" que só serviu pra confirmar que a ORDEM dos
  // campos era o problema real, não necessariamente o tempo exato de espera).
  if (!jaEstaCerto) await esperar_(350);

  // CONFERE o que ficou de fato marcado - só LÊ o estado atual, NÃO clica de
  // novo (ver comentário acima sobre disparo duplicado). O valor pedido pode
  // não "pegar" nesta tela (já visto antes); o código aceita o que ficou
  // marcado de verdade e trabalha com ele daqui pra frente, inclusive
  // escrevendo o hidden espelhado (`hdnStaNivelAcessoLocal`, o campo exato
  // do erro "Nível de acesso local").
  const radioMarcado = acharEmLote_('input[name="rdoNivelAcesso"]:checked');
  const valorNivel = radioMarcado ? radioMarcado.value : valorNivelPedido;
  const nivelLocal = acharEmLote_('[name="hdnStaNivelAcessoLocal"]');
  if (nivelLocal) nivelLocal.value = valorNivel;
  t = marcarTempo_(t, "Nível de Acesso");

  // TODOS os campos que podem disparar recarregamento (radio/select
  // "estruturais") ficam AGRUPADOS AQUI, cada um com sua pausa própria pra
  // assentar - achado 2026-09-04 (relato do usuário: "tudo anda muito
  // rápido, não dá tempo do SEI processar antes do próximo passo"). Formato
  // é OUTRO radio, igual Nível de Acesso, e clicar nele TAMBÉM pode
  // recarregar parte da tela - antes ele vinha DEPOIS de Data/Número/Nome
  // serem preenchidos, sem pausa nenhuma depois, e por isso esses campos
  // podiam ser zerados de novo sem o código perceber. Agora: TODOS os
  // campos estruturais primeiro (com pausa depois de cada um), e só DEPOIS
  // os campos de texto "de folha" - bem no fim, o mais perto possível do
  // anexo, pra sobrar o menor tempo possível pra algo os zerar de novo.

  // Tipo do Documento: direto por id/name (mais confiável que rótulo).
  const selSerie = acharEmLote_('#selSerie, [name="selSerie"]');
  if (selSerie) {
    const alvo = (config.tipoDocumento || "Anexo").trim().toLowerCase();
    const opcao = Array.from(selSerie.options).find(o => (o.textContent || "").toLowerCase().indexOf(alvo) !== -1);
    if (opcao && selSerie.value !== opcao.value) {
      selSerie.value = opcao.value;
      dispararChange_(selSerie);
      await esperar_(300);
    }
  } else {
    selecionarEmSelectPorRotuloLote_("Tipo do Documento", config.tipoDocumento || "Anexo");
    await esperar_(300);
  }
  t = marcarTempo_(t, "Tipo do Documento");

  // Formato: "N" = Nato-digital. Direto por name+value - só clica se ainda
  // não estiver marcado (mesma proteção do Nível de Acesso: clicar de novo
  // em cima do valor já certo arrisca o crash nativo do SEI), e com pausa
  // própria depois - pode disparar cascata igual ao Nível de Acesso.
  const radioFormato = acharEmLote_('input[name="rdoFormato"][value="N"]') || acharEmLote_('input[name="rdoFormato"]');
  if (radioFormato && radioFormato.checked) {
    // já está certo - não mexe, não espera.
  } else if (radioFormato) {
    radioFormato.click(); // só isso - mesmo padrão comprovado da SOF, sem checked/dispararChange_ extra
    await esperar_(350);
  } else {
    await marcarRadioReforcadoLote_("Nato-digital") || await marcarRadioReforcadoLote_("Digitalizado nesta unidade");
    await esperar_(350);
  }
  t = marcarTempo_(t, "Formato");

  // A PARTIR DAQUI: campos "de folha" (texto), preenchidos por ÚLTIMO, o mais
  // perto possível do anexo - depois de todos os campos estruturais já
  // terem assentado, sobra o mínimo de tempo possível pra algo zerá-los.
  const dataCampo = campoPorRotuloOuNomeLote_(["Data do Documento", "Data de Elaboração", "Data"], "txtDataElaboracao");
  if (dataCampo) { dataCampo.value = dataHojeSei_(); dispararChange_(dataCampo); }

  const numeroCampo = campoPorRotuloOuNomeLote_(["Número"], "txtNumero");
  if (numeroCampo) { numeroCampo.value = gerarNumeroDocumento_(); dispararChange_(numeroCampo); }

  const nomeArvore = campoPorRotuloOuNomeLote_(["Nome na Árvore"], "txtNomeArvore");
  if (nomeArvore) { nomeArvore.value = nomeSemExtensao_(arquivo.name); dispararChange_(nomeArvore); }

  const observacoes = acharEmLote_('#txaObservacoes, [name="txaObservacoes"]');
  if (observacoes && !observacoes.value) { observacoes.value = ""; dispararChange_(observacoes); }
  t = marcarTempo_(t, "campos de texto (Data/Número/Nome/Observações)");

  // NÃO mexe em hdnFlagDocumentoCadastro - o próprio SEI já entrega esse
  // campo preenchido por padrão nesta tela.

  // `filArquivo` é o name real do campo de arquivo no SEI (confirmado no
  // código da extensão SEI Pro) - tentado antes do rótulo/busca genérica.
  let inputArquivo = campoPorRotuloOuNomeLote_(["Arquivo"], "filArquivo", "input");
  if (!inputArquivo || inputArquivo.type !== "file") {
    inputArquivo = acharTodosLote_('input[type="file"]').find(i => i.offsetParent !== null) || inputArquivo;
  }
  if (!inputArquivo || inputArquivo.type !== "file") {
    return { ok: false, nome: arquivo.name, erro: "Não encontrei o campo de anexar arquivo." };
  }
  if (!anexarArquivoAoInput_(inputArquivo, arquivo)) {
    return { ok: false, nome: arquivo.name, erro: "Não consegui anexar o arquivo ao campo do SEI." };
  }
  t = marcarTempo_(t, "achar campo + anexar arquivo (sem contar a espera depois)");

  // Espera o arquivo terminar de subir antes de seguir pro Salvar (achado
  // 2026-09-04, teste real: documento salvo com sucesso mas "não contém
  // anexo" - o SEI sobe o arquivo de forma assíncrona nos bastidores antes de
  // aceitar o Salvar). A 1ª tentativa tentava DETECTAR isso (esperando o nome
  // do arquivo aparecer em algum lugar da tela) mas não achou nada - ou o
  // upload não deixa rastro visível em texto em lugar nenhum do cadastro, ou
  // o rastro usa um formato que não bate com o nome bruto do arquivo. Trocado
  // por uma pausa fixa simples (pedido do usuário). Aumentada de 1,5s pra 3s
  // (achado 2026-09-04, relato do usuário: o fluxo inteiro andava rápido
  // demais de um jeito geral, não só nesse ponto - "não dava tempo do SEI
  // carregar o documento anexado, e já entrava pra anexar outro ou salvar").
  // Reduzida de 3s pra 1,8s, depois pra 1s (achado 2026-09-04: pedido de
  // velocidade - 5 arquivos levando 48s vs. 24s de outra extensão) - ainda
  // dá uma folga real pro upload de um PDF pequeno, só não tão generosa.
  await esperar_(1000);
  t = marcarTempo_(t, "espera fixa pós-anexo (1s)");

  // Hipótese Legal MOVIDA pra cá, DEPOIS de anexar o arquivo (achado
  // 2026-09-04, 5º teste real: o HTML confirmou o select certo, já cheio de
  // opções, "Controle Interno" com value="1" - mesmo assim continuava vazio
  // na hora de salvar). Suspeita: nem Nível de Acesso nem Formato são os
  // únicos passos que recarregam parte do formulário - anexar o arquivo
  // (que aciona o widget nativo `infraUpload` do SEI) pode fazer o mesmo,
  // zerando uma seleção feita ANTES dele. Por isso a seleção de verdade
  // agora acontece só aqui, o mais tarde possível, depois de TODOS os passos
  // que podem disparar esse tipo de atualização - técnica simples da SOF
  // (`selecionarOpcaoPorTexto_`), com log pra confirmar o resultado.
  const achouHipotese = await aguardarCondicao_(() => selecionarOpcaoPorTextoLote_("Controle Interno"), 6000, 300);
  console.log("[GAOCG lote] Hipótese Legal 'Controle Interno' selecionada:", achouHipotese);
  t = marcarTempo_(t, "Hipótese Legal");

  // Reafirma os 2 hidden espelhados JUSTO ANTES de salvar (mesma lógica -
  // se ainda houver algum reset de última hora, escrever de novo aqui, o
  // mais tarde possível antes do clique, é a defesa final).
  const nivelLocalFinal = acharEmLote_('[name="hdnStaNivelAcessoLocal"]');
  const radioNivelFinal = acharEmLote_('input[name="rdoNivelAcesso"]:checked');
  if (nivelLocalFinal && radioNivelFinal) nivelLocalFinal.value = radioNivelFinal.value;
  const hipoteseSelectFinal = acharTodosLote_("select").find(s => Array.from(s.options).some(o => o.selected && o.textContent.toLowerCase().indexOf("controle interno") !== -1));
  const hipoteseLocalFinal = acharEmLote_('[name="hdnIdHipoteseLegal"]');
  if (hipoteseSelectFinal && hipoteseLocalFinal) hipoteseLocalFinal.value = hipoteseSelectFinal.value;
  console.log("[GAOCG lote] no fim - select achado:", hipoteseSelectFinal && hipoteseSelectFinal.id, "valor:", hipoteseSelectFinal && hipoteseSelectFinal.value);

  const botao = acharTodosLote_('#sbmSalvar, input[value="Salvar"], button[value="Salvar"], input[value="Confirmar Dados"], button[value="Confirmar Dados"]')
    .find(b => b.offsetParent !== null);
  if (!botao) return { ok: false, nome: arquivo.name, erro: 'Preenchi o cadastro, mas não achei o botão "Salvar".' };
  botao.click();
  t = marcarTempo_(t, "reafirmar hidden + clicar Salvar");

  // Espera sair da tela de cadastro (assume retorno ao próprio processo - ver
  // aviso no topo desta seção).
  //
  // BUG CORRIGIDO (achado 2026-09-04, teste real): antes, não sair a tempo
  // ainda contava como sucesso ("confirmado: false", mas ok: true) - por
  // isso o lote "terminava" sem erro nenhum reportado mesmo quando NENHUM
  // arquivo tinha sido de fato anexado (a tela ficava travada num erro de
  // validação nativo do SEI, tipo o banner vermelho "Nível de acesso local
  // não informado", e o clique em Salvar simplesmente não saía dali). Agora
  // isso é tratado como falha de verdade, com uma mensagem que ajuda a saber
  // que ficou uma validação pendente na tela.
  const saiu = await aguardarCondicao_(() => !campoPorRotuloLote_("Nome na Árvore") && !acharEmLote_("#frmDocumentoCadastro"), 15000, 300);
  t = marcarTempo_(t, "espera confirmação do Salvar (voltar pro processo)");
  console.log("[GAOCG tempo] TOTAL " + arquivo.name + ": " + (Date.now() - tInicioArquivo) + "ms");
  if (!saiu) {
    // Achado 2026-09-04: em vez de pedir print toda vez que um arquivo falha,
    // captura sozinho o texto do banner de erro que o SEI mostra na tela (ex.
    // "Nível de acesso local não informado.") - várias classes candidatas
    // porque a exata não foi confirmada; pega a primeira visível com texto
    // curto o bastante pra ser mensagem, não o conteúdo da página inteira.
    const banner = acharTodosLote_('.alert, [class*="erro" i], [class*="Erro"], [class*="aviso" i], [class*="Aviso"], [role="alert"]')
      .filter(el => el.offsetParent !== null)
      .map(el => (el.textContent || "").replace(/\s+/g, " ").trim())
      .find(txt => txt.length > 5 && txt.length < 300);
    return {
      ok: false,
      nome: arquivo.name,
      erro: banner
        ? 'SEI recusou: "' + banner + '"'
        : "Cliquei em Salvar, mas a tela não confirmou - deve ter ficado um aviso de validação pendente (campo obrigatório não preenchido)."
    };
  }
  return { ok: true, nome: arquivo.name };
}

/** Processa a fila inteira, sequencialmente, atualizando o painel a cada passo. */
async function processarLote_(arquivos, config, painel) {
  const tInicioLote = Date.now();
  const resultados = [];
  for (let i = 0; i < arquivos.length; i++) {
    const arquivo = arquivos[i];
    atualizarProgressoPainel_(painel, i, arquivos.length, arquivo.name);
    let resultado;
    try {
      resultado = await enviarArquivoComoExterno_(arquivo, config);
    } catch (e) {
      resultado = { ok: false, nome: arquivo.name, erro: String(e && e.message ? e.message : e) };
    }
    resultados.push(resultado);
    const tAntesRespiro = Date.now();
    // Respiro entre um arquivo e outro - dá tempo da tela assentar antes de
    // já clicar em "Incluir Documento" de novo. Aumentado de 400ms pra 2500ms
    // (achado 2026-09-04, teste real): depois do 1º arquivo salvar com
    // sucesso, o 2º falhou logo no início ("Não encontrei o tipo Externo") -
    // sinal de que a tela ainda estava se reajustando (voltando do salvamento
    // pro processo) quando o próximo arquivo já tentou abrir "Incluir
    // Documento". 400ms não é tempo suficiente pra essa transição.
    //
    // CAUSA REAL identificada pelo usuário (2026-09-04): depois de Salvar, o
    // PRÓPRIO SEI abre o documento recém-anexado pra mostrar o conteúdo -
    // isso é o maior gap de tempo de todos, e cortar essa pausa pra 700ms (na
    // rodada de velocidade) não dava tempo disso acontecer/assentar antes do
    // próximo arquivo já tentar abrir "Incluir Documento" de novo, quebrando
    // a seleção do tipo. Voltada pra um valor generoso - essa pausa aqui é
    // uma das que realmente precisa de tempo de verdade, não é só folga.
    //
    // PULA no ÚLTIMO arquivo (achado 2026-09-04, medição real: os logs
    // mostravam esse respiro rodando até depois do último arquivo do lote,
    // onde não tem mais nada esperando - 3,5s de desperdício puro).
    if (i < arquivos.length - 1) {
      await esperar_(3500);
      marcarTempo_(tAntesRespiro, "respiro entre arquivos (3,5s fixo)");
    }
  }
  console.log("[GAOCG tempo] === TOTAL DO LOTE (" + arquivos.length + " arquivo(s)): " + (Date.now() - tInicioLote) + "ms ===");
  finalizarProgressoPainel_(painel, resultados);
}

/* -------- painel flutuante: HTML/CSS injetados uma única vez -------- */

const ID_PAINEL_LOTE_ = "gaocgPainelLote";

function garantirEstiloPainel_() {
  if (document.getElementById("gaocgEstiloLote")) return;
  const estilo = document.createElement("style");
  estilo.id = "gaocgEstiloLote";
  estilo.textContent = `
    #${ID_PAINEL_LOTE_} { position:fixed; left:16px; bottom:16px; width:290px; z-index:2147483000;
      font:13px system-ui,sans-serif; background:#fff; border:1px solid #ccd3da; border-radius:10px;
      box-shadow:0 6px 20px rgba(0,0,0,.18); overflow:hidden; }
    #${ID_PAINEL_LOTE_} .gaocg-cab { background:#1c5a8a; color:#fff; padding:8px 10px; display:flex;
      justify-content:space-between; align-items:center; font-weight:600; }
    #${ID_PAINEL_LOTE_} .gaocg-cab button { background:transparent; border:none; color:#fff; cursor:pointer;
      font-size:15px; line-height:1; padding:2px 4px; }
    #${ID_PAINEL_LOTE_} .gaocg-corpo { padding:10px; }
    #${ID_PAINEL_LOTE_} .gaocg-linha { display:flex; gap:6px; margin-bottom:8px; align-items:center; }
    #${ID_PAINEL_LOTE_} .gaocg-linha label { flex:0 0 auto; color:#444; font-size:12px; }
    #${ID_PAINEL_LOTE_} .gaocg-linha input, #${ID_PAINEL_LOTE_} .gaocg-linha select {
      flex:1 1 auto; font-size:12px; padding:3px 4px; min-width:0; }
    #${ID_PAINEL_LOTE_} .gaocg-drop { border:2px dashed #9db3c4; border-radius:8px; padding:16px 8px;
      text-align:center; color:#5a6b78; font-size:12px; transition:.15s; cursor:default; }
    #${ID_PAINEL_LOTE_} .gaocg-drop.gaocg-sobre { background:#eaf3fb; border-color:#1c5a8a; color:#1c5a8a; }
    #${ID_PAINEL_LOTE_} .gaocg-progresso { margin-top:8px; display:flex; align-items:center; gap:8px; }
    #${ID_PAINEL_LOTE_} .gaocg-spinner { width:16px; height:16px; border:2px solid #d6e0e8;
      border-top-color:#1c5a8a; border-radius:50%; animation:gaocgGirar .8s linear infinite; flex:none; }
    @keyframes gaocgGirar { to { transform:rotate(360deg); } }
    #${ID_PAINEL_LOTE_} .gaocg-progresso-texto { font-size:12px; color:#333; flex:1; }
    #${ID_PAINEL_LOTE_} .gaocg-barra { height:6px; border-radius:4px; background:#e3e8ec; margin-top:6px; overflow:hidden; }
    #${ID_PAINEL_LOTE_} .gaocg-barra-preenc { height:100%; width:0%; background:#1c7a37; transition:width .3s ease; }
    #${ID_PAINEL_LOTE_}.gaocg-minimizado .gaocg-corpo { display:none; }

    #${ID_CAIXA_ANOTACAO_} { position:fixed; z-index:2147483000; background:#fff; border:1px solid #ccd3da;
      border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,.12); padding:8px 10px; font:13px system-ui,sans-serif; }
    #${ID_CAIXA_ANOTACAO_} .gaocg-anotacoes-titulo { display:flex; justify-content:space-between; align-items:center;
      font-weight:600; color:#444; font-size:12px; margin-bottom:4px; }
    #${ID_CAIXA_ANOTACAO_} .gaocg-anotacoes-titulo button { border:1px solid #ccd3da; background:#f5f7f9; border-radius:5px;
      cursor:pointer; font-size:11px; padding:2px 6px; }
    #${ID_CAIXA_ANOTACAO_} textarea { width:100%; box-sizing:border-box; font:12px system-ui,sans-serif; color:#333;
      border:1px solid #dde3e8; border-radius:6px; padding:5px 6px; resize:vertical; }
    #${ID_CAIXA_ANOTACAO_} .gaocg-anotacoes-acoes { display:flex; align-items:center; gap:8px; margin-top:6px; }
    #${ID_CAIXA_ANOTACAO_} .gaocg-anotacoes-acoes button { border:none; background:#1c5a8a; color:#fff; border-radius:6px;
      padding:4px 12px; cursor:pointer; font-size:12px; }
    #${ID_CAIXA_ANOTACAO_} .gaocg-anotacoes-acoes span { font-size:11px; }

    #gaocgOverlayLote { position:fixed; inset:0; background:rgba(244,246,248,.82);
      backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); z-index:2147482999;
      display:flex; align-items:center; justify-content:center; }
    #gaocgOverlayLote .gaocg-overlay-conteudo { display:flex; flex-direction:column; align-items:center;
      gap:14px; font:14px system-ui,sans-serif; color:#333; max-width:320px; text-align:center;
      background:#fff; padding:22px 26px; border-radius:12px; box-shadow:0 8px 28px rgba(0,0,0,.15); }
    #gaocgOverlayLote .gaocg-spinner { border:3px solid #d6e0e8; border-top-color:#1c5a8a; border-radius:50%;
      animation:gaocgGirar .8s linear infinite; }
  `;
  document.head.appendChild(estilo);
}

function atualizarProgressoPainel_(painel, indice, total, nomeArquivo) {
  const bloco = painel.querySelector("#gaocgProgresso");
  const texto = painel.querySelector("#gaocgProgressoTexto");
  const barra = painel.querySelector("#gaocgBarraPreenc");
  if (!bloco || !texto || !barra) return;
  bloco.hidden = false;
  texto.textContent = "Enviando " + (indice + 1) + " de " + total + ": " + nomeArquivo;
  barra.style.width = Math.round((indice / total) * 100) + "%";
}

function finalizarProgressoPainel_(painel, resultados) {
  const bloco = painel.querySelector("#gaocgProgresso");
  const texto = painel.querySelector("#gaocgProgressoTexto");
  const barra = painel.querySelector("#gaocgBarraPreenc");
  const spinner = painel.querySelector(".gaocg-spinner");
  if (spinner) spinner.style.display = "none";
  if (barra) barra.style.width = "100%";
  const ok = resultados.filter(r => r.ok).length;
  const falhas = resultados.filter(r => !r.ok);
  if (texto) {
    texto.textContent = ok + " de " + resultados.length + " arquivo(s) enviado(s)." +
      (falhas.length ? " Falharam: " + falhas.map(f => f.nome + " (" + f.erro + ")").join("; ") : "");
  }
  setTimeout(() => { if (bloco) bloco.hidden = true; if (spinner) spinner.style.display = ""; }, falhas.length ? 15000 : 6000);
}

/**
 * Achado 2026-09-03, revisando o código da extensão SEI Pro mais a fundo:
 * o jeito real que ela lê/grava a anotação NÃO abre nada visível pro usuário.
 * A ação "Anotações" da árvore é um `<a href="...">` de verdade (com um
 * `<img title="Anotações">` dentro) - a URL desse link já é a tela de
 * anotação completa. Em vez de CLICAR nesse link (que navega/abre algo na
 * tela, causando o efeito colateral que o usuário reportou), a extensão
 * carrega essa MESMA url num `<iframe>` escondido (`frmCheckerProcessoPro`),
 * espera carregar, e mexe direto nos campos de dentro dele: `#txaDescricao`
 * (o texto da anotação) e um `button[type="submit"]` (salvar). Tudo invisível
 * - o iframe nunca aparece na tela.
 *
 * Reaproveitado aqui do mesmo jeito: acha o link real (sem clicar), carrega a
 * URL dele num iframe de 1x1px fora da tela, e lê/escreve os campos.
 */
const ID_IFRAME_ANOTACAO_ = "gaocgIframeAnotacao";

/** Link real (`<a href>`) por trás do ícone "Anotações" da árvore - sem clicar em nada. */
function linkAnotacao_() {
  const candidatosTexto = acharTodos_("a").filter(el => {
    const texto = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    return texto === "anotações" || texto === "anotação";
  });
  const candidatosImg = acharTodos_('img[title]').filter(el => (el.getAttribute("title") || "").toLowerCase().indexOf("anota") !== -1);
  const ancora = candidatosTexto[0] || (candidatosImg[0] && candidatosImg[0].closest("a"));
  return ancora && ancora.getAttribute("href") && ancora.getAttribute("href") !== "#" ? ancora.href : null;
}

/** Leitura PASSIVA, sem sequer montar o iframe: só serve se o SEI já expõe a anotação inteira no `title` do ícone (tooltip). */
function leituraPassivaAnotacao_() {
  const el = acharTodos_('img[title], a[title]').find(el =>
    (el.getAttribute("title") || "").toLowerCase().indexOf("anota") !== -1 && (el.getAttribute("title") || "").trim().length > 20
  );
  return el ? el.getAttribute("title").trim() : null;
}

/** Iframe de 1x1px fora da tela, reaproveitado entre chamadas - nunca fica visível pro usuário. */
function iframeAnotacao_() {
  let iframe = document.getElementById(ID_IFRAME_ANOTACAO_);
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = ID_IFRAME_ANOTACAO_;
    iframe.style.cssText = "position:fixed; left:-9999px; top:-9999px; width:1px; height:1px; opacity:0; pointer-events:none;";
    document.body.appendChild(iframe);
  }
  return iframe;
}

/** Carrega `url` no iframe escondido e devolve o `document` de dentro dele (ou null, se não carregar/for cross-origin). */
function carregarIframeAnotacao_(url) {
  return new Promise(resolve => {
    const iframe = iframeAnotacao_();
    let resolvido = false;
    const finalizar = () => {
      if (resolvido) return;
      resolvido = true;
      iframe.removeEventListener("load", finalizar);
      let doc = null;
      try { doc = iframe.contentDocument; } catch (e) { doc = null; }
      resolve(doc);
    };
    iframe.addEventListener("load", finalizar);
    setTimeout(finalizar, 8000); // rede de segurança - nunca trava esperando pra sempre
    iframe.src = url;
  });
}

/** Lê o texto atual da anotação - carrega o iframe escondido e sai. Ação explícita (botão "Carregar" da caixa). */
async function carregarAnotacaoDoSei_() {
  const url = linkAnotacao_();
  if (!url) return null;
  const doc = await carregarIframeAnotacao_(url);
  const area = doc && doc.querySelector("#txaDescricao");
  return area ? (area.value || "").trim() : null;
}

/** Escreve o texto e salva - carrega o iframe escondido, preenche `#txaDescricao` e clica em `button[type=submit]`. */
async function salvarAnotacaoNoSei_(texto) {
  const url = linkAnotacao_();
  if (!url) return { ok: false, erro: 'Não encontrei o link de "Anotações" nesta árvore.' };
  const doc = await carregarIframeAnotacao_(url);
  if (!doc) return { ok: false, erro: "A tela de anotação não carregou (ou é de outra origem que o navegador bloqueia)." };
  const area = doc.querySelector("#txaDescricao");
  if (!area) return { ok: false, erro: 'Campo de anotação (#txaDescricao) não encontrado - o SEI pode usar outro id aqui.' };
  area.value = texto;
  area.dispatchEvent(new Event("input", { bubbles: true }));
  area.dispatchEvent(new Event("change", { bubbles: true }));
  const botao = doc.querySelector('button[type="submit"], input[type="submit"]');
  if (!botao) return { ok: false, erro: "Escrevi o texto, mas não achei o botão de salvar dentro da tela de anotação." };
  botao.click();
  await esperar_(800);
  return { ok: true };
}

/** Mostra uma mensagem curta de status na caixa (ex.: "Salvo ✓"), some sozinha depois de um tempo. */
function statusCaixaAnotacao_(caixa, texto, ehErro) {
  const alvo = caixa.querySelector("#gaocgAnotacaoStatus");
  if (!alvo) return;
  alvo.textContent = texto;
  alvo.style.color = ehErro ? "#b02a2a" : "#1c7a37";
  if (texto) setTimeout(() => { if (alvo.textContent === texto) alvo.textContent = ""; }, 5000);
}

/** Clique em "Carregar" - ação EXPLÍCITA do usuário, só agora é que abre o modal nativo. */
async function carregarNaCaixa_(caixa) {
  const area = caixa.querySelector("#gaocgAnotacaoTexto");
  if (!area) return;
  statusCaixaAnotacao_(caixa, "Procurando…", false);
  let texto = null;
  try {
    texto = await carregarAnotacaoDoSei_();
  } catch (e) {
    texto = null;
  }
  if (texto === null) {
    statusCaixaAnotacao_(caixa, 'Não achei o ícone "Anotações" do SEI.', true);
    return;
  }
  area.value = texto;
  statusCaixaAnotacao_(caixa, texto ? "Carregado." : "Sem anotação ainda.", false);
}

/** Clique em "Salvar" - ação EXPLÍCITA do usuário, escreve no modal nativo e salva. */
async function salvarDaCaixa_(caixa) {
  const area = caixa.querySelector("#gaocgAnotacaoTexto");
  if (!area) return;
  statusCaixaAnotacao_(caixa, "Salvando…", false);
  let resultado;
  try {
    resultado = await salvarAnotacaoNoSei_(area.value);
  } catch (e) {
    resultado = { ok: false, erro: String(e && e.message ? e.message : e) };
  }
  statusCaixaAnotacao_(caixa, resultado.ok ? "Salvo ✓" : resultado.erro, !resultado.ok);
}

const ID_CAIXA_ANOTACAO_ = "gaocgCaixaAnotacao";

/**
 * Referência de posição pra caixa de anotação: o link "Consultar Andamento",
 * que fica na coluna esquerda (árvore do processo), logo ACIMA do espaço em
 * branco que o usuário indicou (captura de tela, 2026-09-03) - não existe id
 * fixo conhecido pra esse espaço em si, então a caixa é posicionada por
 * coordenada (position:fixed), logo abaixo desse link, com a MESMA largura da
 * coluna - em vez de tentar injetar dentro da árvore do SEI (arriscado,
 * poderia quebrar o layout/JS nativo dela).
 */
/**
 * Deixa `elemento` arrastável pelo `cabecalho` (mousedown nele inicia o
 * arrasto), e lembra a posição escolhida entre recarregamentos via
 * localStorage (pedido do usuário, 2026-09-04: as duas janelas do GAOCG -
 * anotação e lote - precisavam poder ser movidas pra outro lugar da tela).
 * Devolve `true` se já havia uma posição salva (e ela foi restaurada) - o
 * chamador usa isso pra saber se deve pular o posicionamento automático
 * padrão.
 */
function tornarArrastavel_(elemento, cabecalho, chave) {
  let arrastando = false, offsetX = 0, offsetY = 0;
  cabecalho.style.cursor = "move";
  cabecalho.addEventListener("mousedown", e => {
    if (e.target.closest("button")) return; // não inicia arrasto clicando num botão do cabeçalho
    arrastando = true;
    const rect = elemento.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    e.preventDefault();
  });
  document.addEventListener("mousemove", e => {
    if (!arrastando) return;
    const x = Math.max(0, Math.min(window.innerWidth - elemento.offsetWidth, e.clientX - offsetX));
    const y = Math.max(0, Math.min(window.innerHeight - elemento.offsetHeight, e.clientY - offsetY));
    elemento.style.left = x + "px";
    elemento.style.top = y + "px";
    elemento.style.right = "auto";
    elemento.style.bottom = "auto";
  });
  document.addEventListener("mouseup", () => {
    if (!arrastando) return;
    arrastando = false;
    elemento.dataset.posicaoManual = "1";
    try {
      localStorage.setItem(chave, JSON.stringify({ left: elemento.style.left, top: elemento.style.top }));
    } catch (e) { /* localStorage indisponível - só não persiste, sem quebrar o arrasto */ }
  });

  try {
    const salvo = JSON.parse(localStorage.getItem(chave) || "null");
    if (salvo && salvo.left && salvo.top) {
      elemento.style.left = salvo.left;
      elemento.style.top = salvo.top;
      elemento.style.right = "auto";
      elemento.style.bottom = "auto";
      elemento.dataset.posicaoManual = "1";
      return true;
    }
  } catch (e) { /* localStorage indisponível - segue com a posição padrão */ }
  return false;
}

function localizarReferenciaAnotacao_() {
  return acharTodos_("a, span, div").find(el => {
    if (el.offsetParent === null) return false;
    const t = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    return t === "consultar andamento";
  }) || null;
}

/**
 * Cria (uma vez) e reposiciona (sempre que chamada) a caixa de anotação sobre
 * a coluna esquerda do SEI. Devolve null sem fazer nada se a referência de
 * posição não for encontrada (ex.: layout mudou, ou não é uma tela de
 * processo) - a caixa simplesmente não aparece, sem quebrar o resto.
 */
function posicionarCaixaAnotacao_() {
  let caixa = document.getElementById(ID_CAIXA_ANOTACAO_);
  let temPosicaoSalva = false;

  if (!caixa) {
    garantirEstiloPainel_();
    caixa = document.createElement("div");
    caixa.id = ID_CAIXA_ANOTACAO_;
    caixa.innerHTML = `
      <div class="gaocg-anotacoes-titulo">
        <span>📝 Anotação do processo</span>
        <button type="button" id="gaocgCarregarAnotacao" title="Carregar do SEI">⤓ Carregar</button>
      </div>
      <textarea id="gaocgAnotacaoTexto" rows="4" placeholder="Escreva aqui ou clique em Carregar pra trazer a anotação já existente no SEI…"></textarea>
      <div class="gaocg-anotacoes-acoes">
        <button type="button" id="gaocgSalvarAnotacao">Salvar</button>
        <span id="gaocgAnotacaoStatus"></span>
      </div>
    `;
    document.body.appendChild(caixa);
    caixa.querySelector("#gaocgCarregarAnotacao").addEventListener("click", () => carregarNaCaixa_(caixa));
    caixa.querySelector("#gaocgSalvarAnotacao").addEventListener("click", () => salvarDaCaixa_(caixa));

    // Leitura PASSIVA no carregamento - NÃO clica em nada nem monta o iframe
    // escondido (ver comentário acima, seção "Achado 2026-09-03..."). Só
    // preenche se o SEI já expõe o texto pronto no `title` do ícone; senão
    // fica em branco até o usuário clicar em "Carregar" de propósito.
    const passiva = leituraPassivaAnotacao_();
    if (passiva) caixa.querySelector("#gaocgAnotacaoTexto").value = passiva;

    // Arrastável pelo cabeçalho (pedido do usuário, 2026-09-04) - a posição
    // escolhida fica salva entre recarregamentos. Se já havia uma salva, o
    // reposicionamento automático (por coordenada, ver comentário acima)
    // nunca mais mexe nela - só serve pra achar a posição PADRÃO da 1ª vez.
    temPosicaoSalva = tornarArrastavel_(caixa, caixa.querySelector(".gaocg-anotacoes-titulo"), "gaocgPosAnotacao");
  }

  if (caixa.dataset.posicaoManual === "1") return caixa; // usuário já escolheu onde fica - nunca mais reposiciona sozinho

  const ref = localizarReferenciaAnotacao_();
  if (!ref) return temPosicaoSalva ? caixa : null;
  const coluna = ref.closest("div") || ref;
  const rect = coluna.getBoundingClientRect();
  if (!rect.width || !rect.height) return temPosicaoSalva ? caixa : null;

  // Posição padrão (1ª vez, sem nada salvo) um pouco mais embaixo do que
  // antes (pedido do usuário) - mais respiro abaixo de "Consultar Andamento".
  caixa.style.left = Math.round(rect.left) + "px";
  caixa.style.top = Math.round(rect.bottom + 40) + "px";
  caixa.style.width = Math.round(rect.width) + "px";
  return caixa;
}

/** Cria o painel flutuante, uma única vez por página. Sem efeito se já existir. */
function criarPainelLote_() {
  if (document.getElementById(ID_PAINEL_LOTE_)) return;
  garantirEstiloPainel_();

  const painel = document.createElement("div");
  painel.id = ID_PAINEL_LOTE_;
  painel.innerHTML = `
    <div class="gaocg-cab">
      <span>📎 GAOCG · Envio em lote</span>
      <button type="button" id="gaocgMinimizar" title="Minimizar">–</button>
    </div>
    <div class="gaocg-corpo">
      <div class="gaocg-linha">
        <label>Tipo:</label>
        <input type="text" id="gaocgTipoDoc" value="Anexo">
      </div>
      <div class="gaocg-linha">
        <label>Nível:</label>
        <select id="gaocgNivelAcesso">
          <option value="publico">Público</option>
          <option value="restrito">Restrito</option>
          <option value="sigiloso">Sigiloso</option>
        </select>
      </div>
      <div class="gaocg-drop" id="gaocgDropZone">Arraste os arquivos aqui para enviar como Documento Externo</div>
      <div class="gaocg-progresso" id="gaocgProgresso" hidden>
        <div class="gaocg-spinner"></div>
        <div class="gaocg-progresso-texto" id="gaocgProgressoTexto"></div>
      </div>
      <div class="gaocg-barra"><div class="gaocg-barra-preenc" id="gaocgBarraPreenc"></div></div>
    </div>
  `;
  document.body.appendChild(painel);

  painel.querySelector("#gaocgMinimizar").addEventListener("click", () => {
    painel.classList.toggle("gaocg-minimizado");
  });

  // Arrastável pelo cabeçalho (pedido do usuário, 2026-09-04) - a posição
  // escolhida fica salva entre recarregamentos.
  tornarArrastavel_(painel, painel.querySelector(".gaocg-cab"), "gaocgPosLote");

  const dropZone = painel.querySelector("#gaocgDropZone");
  let processando = false;
  ["dragenter", "dragover"].forEach(evento => {
    dropZone.addEventListener(evento, e => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("gaocg-sobre");
    });
  });
  ["dragleave", "dragend"].forEach(evento => {
    dropZone.addEventListener(evento, e => {
      e.preventDefault();
      dropZone.classList.remove("gaocg-sobre");
    });
  });
  dropZone.addEventListener("drop", e => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("gaocg-sobre");
    if (processando) {
      avisarNaTela_("GAOCG: já tem um lote sendo enviado - espere terminar antes de soltar mais arquivos.");
      return;
    }
    const arquivos = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (!arquivos.length) return;
    const config = {
      tipoDocumento: (painel.querySelector("#gaocgTipoDoc").value || "Anexo").trim(),
      nivelAcesso: painel.querySelector("#gaocgNivelAcesso").value || "publico"
    };
    processando = true;
    gaocgLoteEmAndamento_ = true;
    mostrarOverlayLote_();
    processarLote_(arquivos, config, painel)
      .catch(err => avisarNaTela_("GAOCG: erro no envio em lote - " + String(err && err.message ? err.message : err)))
      .finally(() => { processando = false; gaocgLoteEmAndamento_ = false; esconderOverlayLote_(); });
  });
}

/**
 * "Invisível" (pedido do usuário, 2026-09-04, depois do 1º lote 100%
 * funcional): em vez de mover o fluxo inteiro pra dentro de um iframe
 * escondido (reescreveria toda a base de seletores compartilhada com
 * SOF/NE/Recibo, risco real de quebrar o que já funciona), a automação
 * continua rodando na página de verdade - só que um overlay cobre a tela
 * inteira enquanto isso acontece, então o usuário só vê o painel de
 * progresso do GAOCG por cima, não as telas do SEI passando uma a uma.
 */
function mostrarOverlayLote_() {
  if (document.getElementById("gaocgOverlayLote")) return;
  garantirEstiloPainel_();
  const overlay = document.createElement("div");
  overlay.id = "gaocgOverlayLote";
  overlay.innerHTML = `
    <div class="gaocg-overlay-conteudo">
      <div class="gaocg-spinner" style="width:34px;height:34px;border-width:3px;"></div>
      <div>Enviando arquivos para o SEI… não feche nem recarregue esta aba.</div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function esconderOverlayLote_() {
  const overlay = document.getElementById("gaocgOverlayLote");
  if (overlay) overlay.remove();
}

/* ===================== inicialização (sempre por último) =====================
 *
 * TODO o código que executa na carga do script fica AQUI, depois de todas as
 * declarações. Convenção adotada depois do bug real da v0.5.0
 * ("Cannot access 'vigilanciaAtiva_' before initialization"): `function` é içada
 * e pode ser chamada de qualquer lugar, mas `let`/`const` ficam na Temporal Dead
 * Zone até a linha da declaração executar. Com a inicialização no meio do
 * arquivo, bastava alguém declarar uma constante abaixo dela para o content
 * script inteiro morrer antes de registrar qualquer listener - e o sintoma era
 * "nada acontece", sem pista nenhuma na tela do SEI.
 *
 * Mantendo este bloco no fim, nenhuma ordem de declaração acima pode quebrá-lo.
 */

// Só o documento do topo age. Com todos os frames agindo, vários responderiam à
// mesma mensagem (o primeiro sendResponse vence) e o conteúdo seria injetado
// mais de uma vez.
if (window.top === window) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return false;

    // Pergunta barata e síncrona: esta aba mostra o processo X?
    if (message.type === "CONFERIR_PROCESSO") {
      sendResponse(conferirProcesso_(message.numero));
      return false;
    }

    // Pesquisar AGORA, nesta aba - sem abrir aba nova nem recarregar nada.
    if (message.type === "PESQUISAR_PROCESSO") {
      pesquisarProcesso_(message.numero)
        .then(ok => sendResponse({ ok: ok }))
        .catch(() => sendResponse({ ok: false }));
      return true; // resposta assíncrona
    }

    if (message.type !== "PREENCHER_DOCUMENTO") return false;

    // Responde UMA vez, e no máximo em 10s. O preenchimento pode terminar com
    // um clique em "Salvar", que navega a página e mata o content script - se a
    // resposta ainda estivesse pendente, o canal fecharia sem resposta e o
    // Chrome registraria o erro "message channel closed" (visto no 9º teste).
    let respondido = false;
    const responder = resultado => {
      if (respondido) return;
      respondido = true;
      try { sendResponse(resultado); } catch (e) { /* canal já fechou */ }
    };
    const limite = setTimeout(
      () => responder({ ok: true, parcial: true, aviso: "Preenchimento seguindo no SEI." }),
      10000
    );
    preencherDocumento(message.documento, message.numeroProcesso)
      .then(resultado => { clearTimeout(limite); responder(resultado); })
      .catch(erro => { clearTimeout(limite); responder({ ok: false, erro: String(erro && erro.message ? erro.message : erro) }); });
    return true; // resposta assíncrona
  });

  // Se a extensão pediu para abrir um processo pela pesquisa, é nesta carga de
  // página que isso acontece.
  tentarPesquisarProcesso_();

  // E se havia um envio esperando o processo abrir, ele é retomado sozinho aqui
  // - sem exigir um segundo clique no GAOCG.
  retomarEnvioPendente_();

  // Marca que a página está saindo, para não abrir mensagem que morreria no
  // meio do caminho (ver paginaSaindo_).
  for (const evento of ["pagehide", "beforeunload"]) {
    window.addEventListener(evento, () => { paginaSaindo_ = true; });
  }

  // Etapa 2: vale para QUALQUER página do SEI, inclusive a janela do editor que
  // o SEI abre depois de "Confirmar Dados" - é ali que o conteúdo finalmente entra.
  iniciarVigilancia_();

  // Painel de envio em lote + caixa de anotação: só fazem sentido na página
  // de um processo aberto. Espera a árvore/toolbar do processo assentar antes
  // de desenhar, pra não competir com o carregamento inicial da página.
  if (location.href.includes("procedimento_trabalhar")) {
    aguardarCondicao_(() => acharEm_('a[title="Incluir Documento"], img[title="Incluir Documento"]'), 15000, 300)
      .then(() => criarPainelLote_())
      .catch(() => {});

    // A caixa de anotação é reposicionada (não só criada) a cada 2s - cobre
    // redimensionamento de janela, zoom, ou a árvore lateral crescendo/
    // encolhendo, sem precisar de um listener específico pra cada caso.
    setInterval(() => {
      if (gaocgLoteEmAndamento_) return; // pausado durante o lote - ver comentário em gaocgLoteEmAndamento_
      try { posicionarCaixaAnotacao_(); } catch (e) {}
    }, 2000);
  }

  // Rede de segurança para o caso em que o editor abre SEM recarregar o
  // documento do topo (o SEI navega dentro de iframes). Nesse cenário o content
  // script não roda de novo, então a vigilância precisa ser (re)ligada pelo
  // próprio evento de gravação do pendente - inclusive quando o pendente foi
  // criado por OUTRA aba.
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area === "local" && mudancas[CHAVE_PENDENTE_] && mudancas[CHAVE_PENDENTE_].newValue) {
      iniciarVigilancia_();
    }
  });
}
