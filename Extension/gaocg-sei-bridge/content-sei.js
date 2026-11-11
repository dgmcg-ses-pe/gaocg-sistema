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
  // O anexo por arraste não passa por esta tabela: ele não abre as telas do SEI
  // (ver "Anexar arquivos arrastando para a árvore", mais abaixo).
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
 * (Nota de Empenho e Recibo) continuam com o comportamento
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

  // Modo "div editável" (sem iframe): `.cke_editable` é o CKEditor 4 inline;
  // `.ck-editor__editable` é o CKEditor 5, que o SEI passou a usar na
  // atualização de 2026-11 (o selo "Powered by CKEditor" em cada seção). Sem
  // este seletor a extensão nunca achava o editor novo e não colava nada.
  // Seções travadas do CKEditor 5 ficam com contenteditable="false". Cada
  // célula de tabela também é um `.ck-editor__editable` (com
  // `.ck-editor__nested-editable`) - fica de fora, senão uma célula poderia
  // virar o "corpo" do documento.
  for (const el of acharTodos_('.cke_editable[contenteditable="true"], .ck-editor__editable[contenteditable="true"]:not(.ck-editor__nested-editable)')) {
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
  // Logs de diagnóstico: sem eles, "não achei o editor" e "não havia nada a
  // colar" ficavam indistinguíveis no console (atualização do SEI, 2026-11).
  console.log("[GAOCG SEI Bridge] " + (pendente.rotulo || "SOF") + " pendente - procurando o editor nesta página.");
  const corpo = await aguardarCondicao_(() => corpoDoEditor_(), restante, 600);
  if (!corpo) {
    console.log("[GAOCG SEI Bridge] editor não encontrado nesta página até o pendente expirar.");
    return;
  }
  console.log("[GAOCG SEI Bridge] editor encontrado:", corpo.className || corpo.tagName);

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
  // Compara o TEXTO, não a marcação: o CKEditor 5 descarta estilos inline que
  // o esquema dele não conhece, então o HTML gravado pode ficar bem menor que
  // o enviado mesmo com o documento inteiro colado. Metade do texto é folga
  // suficiente - o editor normaliza espaços, mas não corta o documento.
  const somenteTexto = s => (s || "").replace(/\s+/g, "");
  const esperado = somenteTexto(new DOMParser().parseFromString(html, "text/html").body.textContent);
  const atual = somenteTexto(corpo.textContent);
  return atual.length >= Math.floor(esperado.length * 0.5);
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
    const alvo = corpoDoEditor_() || corpo;
    // No CKEditor 5 o DOM é só um reflexo do modelo interno: escrever
    // innerHTML não muda o documento e ainda pode desalinhar o editor. Lá só a
    // API (MAIN world) serve - se ela falhar, a próxima tentativa repete.
    if (!resultado.ok && !alvo.classList.contains("ck-editor__editable")) {
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

  // CKEditor 5: os botões da barra são <button class="ck-button"> com o nome
  // num <span class="ck-button__label"> (ou só no tooltip, quando o rótulo
  // fica escondido).
  const botaoCk5 = acharTodos_("button.ck-button").find(b => {
    const rotulo = b.querySelector(".ck-button__label");
    const nome = (b.getAttribute("data-cke-tooltip-text") || (rotulo && rotulo.textContent) || "").trim();
    return /^Salvar\b/i.test(nome) && b.offsetParent !== null;
  });

  const botao = botaoCk5 || acharTodos_(seletores).find(b => b.offsetParent !== null);
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

/* ================ Anexar arquivos arrastando para a árvore do processo ================
 *
 * Pedido do usuário (2026-11-04): soltar os arquivos na coluna da árvore e o
 * envio acontecer por trás, sem tela branca e sem o SEI pedir nada.
 *
 * Até a v0.51.0 o envio dirigia as telas do próprio SEI (clicava em "Incluir
 * Documento", preenchia o formulário, clicava em Salvar) sob uma camada que
 * cobria a página inteira - daí a tela branca e inutilizada. Qualquer campo que
 * o JavaScript da página zerasse ou recusasse virava um alerta na frente do
 * usuário, como o que pedia a data do documento.
 *
 * Agora nenhuma tela é aberta: as páginas do SEI são lidas com fetch e o
 * cadastro é enviado direto ao servidor, o mesmo caminho da extensão SEI Pro
 * (SEI-Pro/sei-pro, dist/js/sei-pro-arvore.js). A sequência, por arquivo:
 *   1. GET em documento_escolher_tipo (link do "Incluir Documento" da árvore);
 *   2. GET no link documento_receber ou, no SEI 5, POST com hdnIdSerie=-1;
 *   3. multipart com `filArquivo` na URL do `new infraUpload(...)` da página,
 *      que responde `id#nome#tipo#tamanho#dataHora`;
 *   4. POST do formulário #frmDocumentoCadastro com os valores decididos aqui.
 *
 * O que os testes reais das versões anteriores provaram e continua valendo:
 *   - nesta instalação "Anexo" é tipo interno: o documento nasce como "Externo"
 *     e "Anexo" entra como a classificação (selSerie) dentro do cadastro;
 *   - "Número" fica vazio (pedido do usuário, 2026-11-05): o nome vai só em "Nome na Árvore";
 *   - hdnStaNivelAcessoLocal e hdnIdHipoteseLegal espelham o radio e o select.
 *
 * O SEI grava em ISO-8859-1: urlSei_ e codificarValorSei_ cuidam disso, senão
 * "Relatório" chega trocado na árvore.
 */

const CHAVE_ANEXO_TIPO_ = "anexoTipoDocumento";
const CHAVE_ANEXO_NIVEL_ = "anexoNivelAcesso";
const CHAVE_ANEXO_TIPO_PELO_NOME_ = "anexoTipoPeloNome";
const ID_ZONA_ANEXO_ = "gaocgZonaAnexo";
const ID_STATUS_ANEXO_ = "gaocgStatusAnexo";
const LIMITE_DOCUMENTO_BASE_BYTES_ = 35 * 1024 * 1024; // mesmo limite de DocumentosProcesso.gs
const NOME_NIVEL_ANEXO_ = { publico: "Público", restrito: "Restrito", sigiloso: "Sigiloso" };
const LIMITE_LEITURA_SEI_MS_ = 60000;
const LIMITE_UPLOAD_SEI_MS_ = 600000;
const LIMITE_SALVAR_SEI_MS_ = 120000;
/** Na tela real, "Controle Interno" tem value="1" nesta instalação (HTML confirmado em 2026-09-04); usado só se a página vier sem as opções, que o SEI costuma carregar depois. */
const HIPOTESE_CONTROLE_INTERNO_PADRAO_ = "1";

let configAnexo_ = { tipoDocumento: "Anexo", nivelAcesso: "publico", tipoPeloNome: true };

function dataHojeSei_() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return dd + "/" + mm + "/" + d.getFullYear();
}

function nomeSemExtensao_(nomeArquivo) {
  const i = nomeArquivo.lastIndexOf(".");
  return i > 0 ? nomeArquivo.slice(0, i) : nomeArquivo;
}

/* -------- conversa com o servidor do SEI -------- */

function charsetDaResposta_(resposta, bytes) {
  const doCabecalho = /charset=["']?([\w-]+)/i.exec(resposta.headers.get("content-type") || "");
  if (doCabecalho) return doCabecalho[1];
  const inicio = new TextDecoder("latin1").decode(bytes.slice(0, 2048));
  const daPagina = /<meta[^>]+charset=["']?([\w-]+)/i.exec(inicio);
  return daPagina ? daPagina[1] : "iso-8859-1";
}

/** fetch com limite de tempo que já devolve o texto decodificado e a página interpretada. */
async function pedirSei_(url, opcoes, limiteMs) {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), limiteMs || LIMITE_LEITURA_SEI_MS_);
  try {
    const resposta = await fetch(url, Object.assign(
      { credentials: "same-origin", cache: "no-store", signal: controle.signal }, opcoes || {}
    ));
    if (!resposta.ok) throw new Error("O SEI respondeu com erro (HTTP " + resposta.status + ").");
    const bytes = await resposta.arrayBuffer();
    const charset = charsetDaResposta_(resposta, bytes);
    let texto;
    try {
      texto = new TextDecoder(charset).decode(bytes);
    } catch (e) {
      texto = new TextDecoder("iso-8859-1").decode(bytes);
    }
    const doc = new DOMParser().parseFromString(texto, "text/html");
    if (doc.querySelector("#frmLogin, #pwdSenha, input[type=password]")) {
      throw new Error("A sessão do SEI expirou. Entre novamente e solte o arquivo de novo.");
    }
    return { url: resposta.url, texto: texto, doc: doc, charset: charset };
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("O SEI demorou demais para responder.");
    throw e;
  } finally {
    clearTimeout(limite);
  }
}

const SUBSTITUTOS_LATIN1_ = {
  "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"',
  "…": "...", " ": " ", "•": "-", "€": "EUR"
};

/** Percent-encoding no charset da página. Fora do ISO-8859-1, troca pelo equivalente mais próximo. */
function codificarValorSei_(valor, charset) {
  const texto = String(valor === undefined || valor === null ? "" : valor).normalize("NFC");
  if (/utf-?8/i.test(charset || "")) return encodeURIComponent(texto);
  let saida = "";
  for (const caractere of texto) {
    const convertido = caractere.codePointAt(0) > 255 ? (SUBSTITUTOS_LATIN1_[caractere] || "_") : caractere;
    for (const c of convertido) {
      const codigo = c.charCodeAt(0);
      saida += /[A-Za-z0-9\-_.~]/.test(c) ? c : "%" + codigo.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return saida;
}

function corpoFormularioSei_(campos, charset) {
  return campos
    .map(par => codificarValorSei_(par[0], charset) + "=" + codificarValorSei_(par[1], charset))
    .join("&");
}

function cabecalhoFormularioSei_(charset) {
  return { "Content-Type": "application/x-www-form-urlencoded; charset=" + (charset || "iso-8859-1") };
}

/** Pares [nome, valor] do que um navegador enviaria deste formulário. */
function camposDoFormulario_(form) {
  const campos = [];
  for (const el of Array.from(form.querySelectorAll("input[name], select[name], textarea[name]"))) {
    if (el.disabled) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === "select") {
      for (const opcao of Array.from(el.selectedOptions)) campos.push([el.name, opcao.value]);
      continue;
    }
    if (tag === "input") {
      const tipo = (el.getAttribute("type") || "text").toLowerCase();
      if (["file", "button", "submit", "image", "reset"].includes(tipo)) continue;
      if ((tipo === "radio" || tipo === "checkbox") && !el.checked) continue;
    }
    campos.push([el.name, el.value]);
  }
  return campos;
}

function definirCampo_(campos, nome, valor) {
  const restantes = campos.filter(par => par[0] !== nome);
  campos.length = 0;
  campos.push(...restantes, [nome, valor]);
}

/** Link do "Incluir Documento": está no script da árvore (Nos[0].acoes) e, às vezes, na barra da direita. */
function acharLinkIncluirDocumento_() {
  const padrao = /controlador\.php\?acao=documento_escolher_tipo[^"'\\\s<>]*/;
  const documentos = documentosDisponiveis_();
  for (const doc of documentos) {
    for (const script of Array.from(doc.querySelectorAll("script:not([src])"))) {
      const achado = padrao.exec(script.textContent || "");
      if (achado) return new URL(achado[0].replace(/&amp;/g, "&"), doc.baseURI).href;
    }
  }
  for (const doc of documentos) {
    const icone = doc.querySelector('a[href*="documento_escolher_tipo"], a[title="Incluir Documento"], img[title="Incluir Documento"]');
    const ancora = icone && (icone.closest("a") || icone);
    if (ancora && /acao=/.test(ancora.getAttribute("href") || "")) return ancora.href;
  }
  return null;
}

/** Da lista de tipos até o cadastro do Documento Externo. */
async function abrirCadastroExterno_(linkTipos) {
  const tipos = await pedirSei_(linkTipos);
  if (tipos.doc.querySelector("#frmDocumentoCadastro")) return tipos;

  const ancoras = Array.from(tipos.doc.querySelectorAll('a[href*="acao=documento_receber"]'));
  const direta = ancoras.find(a => /[?&]id_serie=-1(&|$)/.test(a.getAttribute("href"))) || ancoras[0];
  if (direta) return pedirSei_(new URL(direta.getAttribute("href"), tipos.url).href);

  // SEI 5: toda âncora da lista tem href="#", e a escolha sai por POST.
  const form = tipos.doc.querySelector("#frmDocumentoEscolherTipo");
  const temExterno = tipos.doc.querySelector('input[value="-1"]') ||
    Array.from(tipos.doc.querySelectorAll("a")).some(a => (a.textContent || "").trim().toLowerCase() === "externo");
  if (!form || !temExterno) throw new Error('Não encontrei o tipo "Externo" na lista do SEI.');

  const campos = camposDoFormulario_(form);
  definirCampo_(campos, "hdnIdSerie", "-1");
  return pedirSei_(new URL(form.getAttribute("action") || tipos.url, tipos.url).href, {
    method: "POST",
    headers: cabecalhoFormularioSei_(tipos.charset),
    body: corpoFormularioSei_(campos, tipos.charset)
  });
}

function urlUploadDoCadastro_(pagina) {
  const achado = /new\s+infraUpload\(\s*['"][^'"]*['"]\s*,\s*['"]([^'"]+)['"]/.exec(pagina.texto);
  if (achado) return new URL(achado[1].replace(/&amp;/g, "&"), pagina.url).href;
  const form = pagina.doc.querySelector("#frmAnexos");
  return form && form.getAttribute("action") ? new URL(form.getAttribute("action"), pagina.url).href : null;
}

/** O SEI separa a resposta do upload com "#" e lê o nome em ISO-8859-1: só o nome interno do anexo muda, não o da árvore. */
function nomeSeguroParaUpload_(nome) {
  return nome.normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[&/\\#+()$~%'":*?<>{}]/g, "_")
    .replace(/[^\x20-\x7E]/g, "_");
}

function textoSemTags_(texto) {
  return String(texto || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function subirArquivoSei_(arquivo, urlUpload, pagina) {
  const dados = new FormData();
  const formAnexos = pagina.doc.querySelector("#frmAnexos");
  if (formAnexos) {
    for (const par of camposDoFormulario_(formAnexos)) dados.append(par[0], par[1]);
  }
  const nome = nomeSeguroParaUpload_(arquivo.name);
  dados.append("filArquivo", new File([arquivo], nome, { type: arquivo.type }), nome);

  const resposta = await pedirSei_(urlUpload, { method: "POST", body: dados }, LIMITE_UPLOAD_SEI_MS_);
  const texto = textoSemTags_(resposta.texto);
  const partes = texto.split("#");
  if (partes.length < 5 || !partes[0] || partes[0].toUpperCase() === "ERRO" || !/^\d+$/.test(partes[3])) {
    console.warn("[GAOCG anexo] resposta inesperada do upload:", texto.slice(0, 300));
    throw new Error("O SEI recusou o arquivo" + (texto ? ": " + texto.slice(0, 160) : "."));
  }
  return { id: partes[0], nome: partes[1], tamanho: partes[3], dataHora: partes[4] };
}

function tamanhoFormatado_(bytes) {
  const n = Number(bytes);
  if (n < 1024) return n + " bytes";
  if (n < 1048576) return (n / 1024).toFixed(2) + " Kb";
  if (n < 1073741824) return (n / 1048576).toFixed(2) + " Mb";
  return (n / 1073741824).toFixed(2) + " Gb";
}

/** Usuário e unidade que o próprio SEI mostraria na tabela de anexos (últimos valores do objTabelaAnexos.adicionar). */
function autorDoAnexo_(texto) {
  const achado = /objTabelaAnexos\.adicionar\(\s*\[[\s\S]*?,\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*\]\s*\)/.exec(texto);
  return achado ? { usuario: achado[1], unidade: achado[2] } : { usuario: "", unidade: "" };
}

function opcaoDoTipo_(select, tipo) {
  const alvo = tipo.trim().toLowerCase();
  const opcoes = Array.from(select.options).filter(o => o.value && o.value !== "null");
  const texto = o => (o.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  return opcoes.find(o => texto(o) === alvo) || opcoes.find(o => texto(o).indexOf(alvo) !== -1) || null;
}

/** Palavras comparáveis de um texto: sem acento, minúsculas, com "º" virando "o" ("Nº" = "no"). */
function palavrasDoTipo_(texto) {
  return Array.from(String(texto || "").matchAll(/[\p{L}\p{N}º°ª]+/gu)).map(achado => ({
    palavra: semAcentos_(achado[0]).toLowerCase().replace(/[º°ª]/g, "o"),
    inicio: achado.index
  }));
}

/** Tipo da lista cujas palavras abrem a sequência; entre "Nota" e "Nota Fiscal", vale o mais longo. */
function tipoNoInicio_(palavras, opcoes) {
  let melhor = null;
  for (const opcao of opcoes) {
    const doTipo = opcao.palavras;
    if (!doTipo.length || doTipo.length > palavras.length) continue;
    if (melhor && doTipo.length <= melhor.palavras.length) continue;
    if (doTipo.every((p, i) => p === palavras[i].palavra)) melhor = opcao;
  }
  return melhor;
}

/**
 * Deduz o tipo pelo começo do nome do arquivo (pedido do usuário, 2026-11-05).
 * Só o COMEÇO conta, de propósito: "Relatório da Nota Fiscal" é um relatório. Não
 * pede nada ao SEI, então não pesa no envio: a lista vem da própria tela do cadastro.
 * Sem certeza devolve null, e o arquivo fica com o tipo padrão do painel da extensão.
 */
function identificarTipoPeloNome_(nome, select) {
  const opcoes = Array.from(select.options)
    .filter(o => o.value && o.value !== "null")
    .map(o => ({ opcao: o, palavras: palavrasDoTipo_(o.textContent).map(p => p.palavra) }));
  const palavras = palavrasDoTipo_(nome);
  if (!palavras.length) return null;
  const porNome = texto => {
    const alvo = palavrasDoTipo_(texto).map(p => p.palavra).join(" ");
    const achada = opcoes.find(o => o.palavras.join(" ") === alvo);
    return achada ? achada.opcao : null;
  };

  // Padrões dos arquivos da equipe, que não trazem o tipo no nome: o texto fica como está.
  const emTexto = palavras.map(p => p.palavra).join(" ");
  const padroes = [
    [/^(\d{4} ?)?ne ?\d+/, "Nota de Empenho"],
    [/^no? ?\d+( \d+)*$/, "Nota de Empenho"],
    [/^(\d{4} ?)?le ?\d+/, "Nota de Liquidação"],
    [/^liquidacao\b/, "Nota de Liquidação"],
    [/^\d+o\b/, "Termo Aditivo"], // "14º - AFOGADOS - RATEIO", "17º T.A. UPAE AFOGADOS"
    [/^\d+ (termo aditivo |ta |t a )?ao contrato\b/, "Termo Aditivo"],
    [/^(ta|t a) \d/, "Termo Aditivo"],
    [/^(cg|c g)\b/, "Contrato"], // "C.G. 007.2014 - UPAE AFOGADOS": o SEI só tem o tipo "Contrato"
    [/^de gestao\b/, "Contrato"]
  ];
  for (const [padrao, tipo] of padroes) {
    const opcao = padrao.test(emTexto) && porNome(tipo);
    if (opcao) return { opcao: opcao, nomeArvore: nome };
  }

  // "Nota Fiscal - Outubro": o tipo sai do nome, para a árvore não repeti-lo.
  const direto = tipoNoInicio_(palavras, opcoes);
  if (direto) {
    const seguinte = palavras[direto.palavras.length];
    let corte = seguinte ? seguinte.inicio : nome.length;
    if (nome[corte - 1] === "(") corte -= 1;
    return { opcao: direto.opcao, nomeArvore: nome.slice(corte).trim() };
  }

  // Exportado do SEI, como "SEI_94733574_GOVPE___Nota_Tecnica_63": o tipo vem depois do número
  // e, às vezes, da sigla do órgão. O nome fica como está.
  if (palavras[0].palavra === "sei" && palavras[1] && /^\d+$/.test(palavras[1].palavra)) {
    for (const pulo of [2, 3]) {
      const achado = tipoNoInicio_(palavras.slice(pulo), opcoes);
      if (achado) return { opcao: achado.opcao, nomeArvore: nome };
    }
  }
  return null;
}

function valorHipoteseLegal_(form, nivelAcesso) {
  if (nivelAcesso === "publico") return "";
  const select = form.querySelector('#selHipoteseLegal, [name="selHipoteseLegal"]');
  const opcoes = select ? Array.from(select.options).filter(o => o.value && o.value !== "null") : [];
  const controleInterno = opcoes.find(o => (o.textContent || "").toLowerCase().indexOf("controle interno") !== -1);
  if (controleInterno) return controleInterno.value;
  if (opcoes.length) throw new Error('Não encontrei a Hipótese Legal "Controle Interno" no SEI.');
  console.warn("[GAOCG anexo] página sem as opções de Hipótese Legal; usando o valor conhecido de Controle Interno.");
  return HIPOTESE_CONTROLE_INTERNO_PADRAO_;
}

/** Monta o cadastro a partir do que o SEI entregou. A data sai daqui, sem depender do JavaScript da tela. */
function camposDoCadastroExterno_(form, arquivo, config, anexo, autor) {
  const selSerie = form.querySelector('#selSerie, [name="selSerie"]');
  const nomeArquivo = nomeSemExtensao_(arquivo.name);
  const fixa = selSerie && config.tipoValor ? Array.from(selSerie.options).find(o => o.value === config.tipoValor) : null;
  const deduzido = !fixa && selSerie && config.tipoPeloNome ? identificarTipoPeloNome_(nomeArquivo, selSerie) : null;
  const serie = fixa || (deduzido ? deduzido.opcao : selSerie && opcaoDoTipo_(selSerie, config.tipoDocumento));
  if (!serie) throw new Error('Não encontrei o tipo "' + config.tipoDocumento + '" no cadastro do SEI.');

  const nivel = MAPA_NIVEL_ACESSO[config.nivelAcesso] || "0";
  const hipotese = valorHipoteseLegal_(form, config.nivelAcesso);
  const campoNome = form.querySelector('#txtNomeArvore, [name="txtNomeArvore"]');
  const limiteNome = Number(campoNome && campoNome.getAttribute("maxlength")) || 50;

  const campos = camposDoFormulario_(form);
  const definicoes = {
    selSerie: serie.value,
    hdnIdSerie: serie.value,
    rdoNivelAcesso: nivel,
    hdnStaNivelAcessoLocal: nivel,
    rdoFormato: "N",
    selTipoConferencia: "",
    hdnIdTipoConferencia: "",
    selHipoteseLegal: hipotese,
    hdnIdHipoteseLegal: hipotese,
    hdnFlagDocumentoCadastro: "2",
    txtDataElaboracao: dataHojeSei_(),
    txtNomeArvore: (config.nomeArvore !== undefined ? config.nomeArvore : deduzido ? deduzido.nomeArvore : nomeArquivo).slice(0, limiteNome),
    hdnAnexos: [
      anexo.id, anexo.nome, anexo.dataHora, anexo.tamanho,
      tamanhoFormatado_(anexo.tamanho), autor.usuario, autor.unidade
    ].join("±")
  };
  for (const nome of Object.keys(definicoes)) definirCampo_(campos, nome, definicoes[nome]);
  return { campos: campos, tipo: (serie.textContent || "").replace(/\s+/g, " ").trim() };
}

function mensagemDeRecusaSei_(doc) {
  const seletores = "#divInfraExcecao, .infraExcecao, .infraMensagem, .alert, [role=alert]";
  for (const el of Array.from(doc.querySelectorAll(seletores))) {
    const texto = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (texto.length > 5 && texto.length < 300) return texto;
  }
  return "";
}

/** Envia UM arquivo. Qualquer problema vira exceção com mensagem para o usuário. */
async function anexarArquivoNoSei_(arquivo, config) {
  const linkTipos = await aguardarCondicao_(acharLinkIncluirDocumento_, 8000, 200);
  if (!linkTipos) {
    throw new Error('Não encontrei "Incluir Documento" neste processo. Confira se ele está aberto na sua unidade.');
  }

  const cadastro = await abrirCadastroExterno_(linkTipos);
  const form = cadastro.doc.querySelector("#frmDocumentoCadastro");
  if (!form) throw new Error("O cadastro do Documento Externo não abriu.");
  const urlUpload = urlUploadDoCadastro_(cadastro);
  if (!urlUpload) throw new Error("Não encontrei o endereço de upload na tela do SEI.");

  const anexo = await subirArquivoSei_(arquivo, urlUpload, cadastro);
  const { campos, tipo } = camposDoCadastroExterno_(form, arquivo, config, anexo, autorDoAnexo_(cadastro.texto));

  let salvo;
  try {
    salvo = await pedirSei_(new URL(form.getAttribute("action") || cadastro.url, cadastro.url).href, {
      method: "POST",
      headers: cabecalhoFormularioSei_(cadastro.charset),
      body: corpoFormularioSei_(campos, cadastro.charset)
    }, LIMITE_SALVAR_SEI_MS_);
  } catch (e) {
    throw new Error("O SEI não confirmou a gravação (" + e.message + "). Confira a árvore antes de enviar de novo.");
  }

  if (/acao=arvore_visualizar/.test(salvo.url) && !salvo.doc.querySelector("#frmDocumentoCadastro")) return { tipo: tipo };

  console.warn("[GAOCG anexo] gravação não confirmada:", salvo.url, salvo.texto.slice(0, 500));
  const recusa = mensagemDeRecusaSei_(salvo.doc);
  throw new Error(recusa
    ? 'O SEI recusou: "' + recusa + '"'
    : "O SEI não confirmou a gravação. Confira a árvore antes de enviar de novo.");
}

/* -------- fila de envio -------- */

const filaAnexos_ = [];
let resultadosAnexos_ = [];
let anexoEmAndamento_ = false;

function enfileirarAnexos_(arquivos) {
  const config = Object.assign({}, configAnexo_);
  for (const arquivo of arquivos) filaAnexos_.push({ arquivo: arquivo, nome: arquivo.name, config: config });
  if (!anexoEmAndamento_) processarFilaAnexos_();
}

async function processarFilaAnexos_() {
  anexoEmAndamento_ = true;
  resultadosAnexos_ = [];
  while (filaAnexos_.length) {
    const item = filaAnexos_.shift();
    const atual = resultadosAnexos_.length + 1;
    mostrarProgressoAnexo_(atual, atual + filaAnexos_.length, item.nome);
    try {
      const arquivo = item.arquivo || await item.baixar();
      const enviado = await anexarArquivoNoSei_(arquivo, item.config);
      resultadosAnexos_.push({ ok: true, nome: item.nome, tipo: enviado.tipo });
    } catch (e) {
      const erro = String(e && e.message ? e.message : e);
      console.warn("[GAOCG anexo] falhou:", item.nome, erro);
      resultadosAnexos_.push({ ok: false, nome: item.nome, erro: erro });
    }
  }
  anexoEmAndamento_ = false;
  mostrarResultadoAnexos_(resultadosAnexos_);
  atualizarArvoreProcesso_();
}

/** Mostra os documentos novos sem mexer no que o usuário está lendo do lado direito. */
function atualizarArvoreProcesso_() {
  const area = acharAreaArvore_();
  try {
    if (area && area.contentWindow) area.contentWindow.location.reload();
    else location.reload();
  } catch (e) {
    location.reload();
  }
}

/* -------- aviso de progresso (não bloqueia a tela) -------- */

function caixaStatusAnexo_() {
  let caixa = document.getElementById(ID_STATUS_ANEXO_);
  if (caixa) return caixa;
  garantirEstiloPainel_();
  caixa = document.createElement("div");
  caixa.id = ID_STATUS_ANEXO_;
  caixa.innerHTML = `
    <div class="gaocg-status-linha">
      <div class="gaocg-spinner"></div>
      <div class="gaocg-status-texto"></div>
      <button type="button" title="Fechar">×</button>
    </div>
    <div class="gaocg-barra"><div class="gaocg-barra-preenc"></div></div>
    <ul class="gaocg-status-tipos" hidden></ul>
    <ul class="gaocg-status-erros" hidden></ul>
  `;
  caixa.querySelector("button").addEventListener("click", () => { caixa.hidden = true; });
  document.body.appendChild(caixa);
  return caixa;
}

let temporizadorStatusAnexo_ = null;

function mostrarProgressoAnexo_(atual, total, nome) {
  clearTimeout(temporizadorStatusAnexo_);
  const caixa = caixaStatusAnexo_();
  caixa.hidden = false;
  caixa.classList.remove("gaocg-status-fim");
  caixa.querySelector(".gaocg-status-texto").textContent = "Anexando " + atual + " de " + total + ": " + nome;
  caixa.querySelector(".gaocg-barra-preenc").style.width = Math.round(((atual - 1) / total) * 100) + "%";
  caixa.querySelector(".gaocg-status-erros").hidden = true;
  caixa.querySelector(".gaocg-status-tipos").hidden = true;
}

function mostrarResultadoAnexos_(resultados) {
  const caixa = caixaStatusAnexo_();
  const falhas = resultados.filter(r => !r.ok);
  const certos = resultados.length - falhas.length;
  caixa.hidden = false;
  caixa.classList.add("gaocg-status-fim");
  caixa.querySelector(".gaocg-barra-preenc").style.width = "100%";
  caixa.querySelector(".gaocg-status-texto").textContent = certos + " de " + resultados.length + " arquivo(s) anexado(s).";
  const lista = caixa.querySelector(".gaocg-status-erros");
  lista.textContent = "";
  for (const falha of falhas) {
    const linha = document.createElement("li");
    linha.textContent = falha.nome + ": " + falha.erro;
    lista.appendChild(linha);
  }
  lista.hidden = !falhas.length;
  const tipos = caixa.querySelector(".gaocg-status-tipos");
  tipos.textContent = "";
  for (const certo of resultados.filter(r => r.ok)) {
    const linha = document.createElement("li");
    const rotulo = document.createElement("strong");
    rotulo.textContent = certo.tipo;
    linha.append(rotulo, ": " + certo.nome);
    tipos.appendChild(linha);
  }
  tipos.hidden = !tipos.childElementCount;
  // Falha fica na tela até o usuário fechar: é o único registro do que não entrou.
  // Sem falha, dá tempo de conferir os tipos antes de sumir.
  if (!falhas.length) temporizadorStatusAnexo_ = setTimeout(() => { caixa.hidden = true; }, 15000);
}

/* -------- área de soltar sobre a coluna da árvore --------
 *
 * Os eventos de arrastar não atravessam iframes: quem detecta o arquivo chegando
 * é o documento da árvore. Daí em diante uma camada no documento do topo cobre a
 * coluna inteira e recebe o drop - assim funciona também quando a árvore é longa
 * e sobra pouco espaço vazio, e por cima da caixa de anotação.
 */

function acharAreaArvore_() {
  const direta = acharEm_('iframe#ifrArvore, iframe[name="ifrArvore"], frame#ifrArvore, frame[name="ifrArvore"]');
  if (direta) return direta;
  for (const doc of documentosDisponiveis_()) {
    for (const frame of Array.from(doc.querySelectorAll("iframe, frame"))) {
      let interno = null;
      try { interno = frame.contentDocument; } catch (e) { interno = null; }
      const texto = interno && interno.body ? interno.body.textContent || "" : "";
      if (texto.indexOf("Consultar Andamento") !== -1) return frame;
    }
  }
  return acharEm_("#divArvore");
}

/** Retângulo do elemento nas coordenadas do documento do topo, somando os iframes no caminho. */
function retanguloNoTopo_(el) {
  const r = el.getBoundingClientRect();
  let esquerda = r.left;
  let topo = r.top;
  let janela = el.ownerDocument.defaultView;
  while (janela && janela !== window && janela.frameElement) {
    const f = janela.frameElement.getBoundingClientRect();
    esquerda += f.left;
    topo += f.top;
    janela = janela.parent;
  }
  return { left: esquerda, top: topo, width: r.width, height: r.height };
}

function trazArquivos_(evento) {
  const tipos = evento.dataTransfer && evento.dataTransfer.types;
  return !!tipos && Array.from(tipos).includes("Files");
}

let temporizadorZonaAnexo_ = null;

function zonaAnexo_() {
  let zona = document.getElementById(ID_ZONA_ANEXO_);
  if (zona) return zona;
  garantirEstiloPainel_();
  zona = document.createElement("div");
  zona.id = ID_ZONA_ANEXO_;
  zona.hidden = true;
  zona.innerHTML = '<div class="gaocg-zona-titulo">Solte para anexar a este processo</div><div class="gaocg-zona-config"></div>';
  ["dragenter", "dragover"].forEach(tipo => zona.addEventListener(tipo, e => {
    if (!trazArquivos_(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    mostrarZonaAnexo_();
  }));
  zona.addEventListener("drop", receberArquivosSoltos_);
  document.body.appendChild(zona);
  return zona;
}

function esconderZonaAnexo_() {
  clearTimeout(temporizadorZonaAnexo_);
  const zona = document.getElementById(ID_ZONA_ANEXO_);
  if (zona) zona.hidden = true;
}

/** Enquanto o arquivo estiver em cima, os eventos não param; meio segundo sem nenhum significa que saiu ou desistiu. */
function mostrarZonaAnexo_() {
  const area = acharAreaArvore_();
  if (!area) return;
  const zona = zonaAnexo_();
  const r = retanguloNoTopo_(area);
  zona.style.left = r.left + "px";
  zona.style.top = r.top + "px";
  zona.style.width = r.width + "px";
  zona.style.height = r.height + "px";
  zona.querySelector(".gaocg-zona-config").textContent =
    (configAnexo_.tipoPeloNome ? "Tipo pelo nome do arquivo (padrão: " + configAnexo_.tipoDocumento + ")" : "Tipo: " + configAnexo_.tipoDocumento) +
    " · Nível: " + (NOME_NIVEL_ANEXO_[configAnexo_.nivelAcesso] || NOME_NIVEL_ANEXO_.publico);
  zona.hidden = false;
  clearTimeout(temporizadorZonaAnexo_);
  temporizadorZonaAnexo_ = setTimeout(esconderZonaAnexo_, 500);
}

function receberArquivosSoltos_(evento) {
  if (!trazArquivos_(evento)) return;
  evento.preventDefault();
  evento.stopPropagation();
  esconderZonaAnexo_();
  if (!ferramentasSeiAtivas_) return;

  const arquivos = [];
  let pastas = 0;
  for (const item of Array.from(evento.dataTransfer.items || [])) {
    if (item.kind !== "file") continue;
    const entrada = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (entrada && entrada.isDirectory) { pastas += 1; continue; }
    const arquivo = item.getAsFile();
    if (arquivo) arquivos.push(arquivo);
  }
  if (pastas) avisarNaTela_("GAOCG: pastas não são anexadas. Arraste os arquivos de dentro dela.");
  if (arquivos.length) enfileirarAnexos_(arquivos);
}

const documentosComArraste_ = new WeakSet();

function ligarArrasteNoDocumento_(doc) {
  if (documentosComArraste_.has(doc)) return;
  documentosComArraste_.add(doc);
  const ehTopo = doc === document;
  ["dragenter", "dragover"].forEach(tipo => doc.addEventListener(tipo, e => {
    if (!ferramentasSeiAtivas_ || !trazArquivos_(e)) return;
    e.preventDefault();
    // Fora da coluna da árvore o drop é recusado: sem isso, o navegador abriria
    // o arquivo no lugar da página do SEI.
    e.dataTransfer.dropEffect = ehTopo ? "none" : "copy";
    mostrarZonaAnexo_();
  }));
  if (!ehTopo) doc.addEventListener("drop", e => { if (ferramentasSeiAtivas_) receberArquivosSoltos_(e); });
}

/** A árvore recarrega e troca de documento com frequência: a cada recarga precisa ligar de novo. */
function iniciarAnexoPorArraste_() {
  ligarArrasteNoDocumento_(document);
  const ligarArvore = () => {
    const area = acharAreaArvore_();
    let interno = null;
    try { interno = area && area.contentDocument; } catch (e) { interno = null; }
    if (interno) ligarArrasteNoDocumento_(interno);
  };
  ligarArvore();
  setInterval(ligarArvore, 1000);
  window.addEventListener("beforeunload", e => {
    if (anexoEmAndamento_) { e.preventDefault(); e.returnValue = ""; }
  });
}

/* -------- estilos das janelas do GAOCG, injetados uma única vez -------- */

function garantirEstiloPainel_() {
  if (document.getElementById("gaocgEstiloLote")) return;
  const estilo = document.createElement("style");
  estilo.id = "gaocgEstiloLote";
  estilo.textContent = `
    #${ID_ZONA_ANEXO_} { position:fixed; z-index:2147483600; box-sizing:border-box; display:flex; flex-direction:column;
      align-items:center; justify-content:center; gap:6px; padding:12px; text-align:center;
      background:rgba(28,90,138,.88); border:3px dashed #fff; border-radius:8px; color:#fff; font:14px system-ui,sans-serif; }
    #${ID_ZONA_ANEXO_}[hidden] { display:none; }
    #${ID_ZONA_ANEXO_} > div { pointer-events:none; }
    #${ID_ZONA_ANEXO_} .gaocg-zona-titulo { font-size:16px; font-weight:600; }
    #${ID_ZONA_ANEXO_} .gaocg-zona-config { font-size:12px; }

    #${ID_STATUS_ANEXO_} { position:fixed; left:16px; bottom:16px; width:320px; max-width:calc(100vw - 32px); z-index:2147483000;
      box-sizing:border-box; padding:10px; background:#fff; color:#333; border:1px solid #ccd3da; border-radius:10px;
      box-shadow:0 6px 20px rgba(0,0,0,.18); font:13px system-ui,sans-serif; }
    #${ID_STATUS_ANEXO_}[hidden] { display:none; }
    #${ID_STATUS_ANEXO_} .gaocg-status-linha { display:flex; align-items:center; gap:8px; }
    #${ID_STATUS_ANEXO_} .gaocg-status-texto { flex:1; min-width:0; font-size:12px; overflow-wrap:anywhere; }
    #${ID_STATUS_ANEXO_} button { border:none; background:transparent; color:#555; cursor:pointer; font-size:16px; line-height:1; padding:0 2px; }
    #${ID_STATUS_ANEXO_} .gaocg-spinner { width:16px; height:16px; border:2px solid #d6e0e8;
      border-top-color:#1c5a8a; border-radius:50%; animation:gaocgGirar .8s linear infinite; flex:none; }
    #${ID_STATUS_ANEXO_}.gaocg-status-fim .gaocg-spinner { display:none; }
    @keyframes gaocgGirar { to { transform:rotate(360deg); } }
    #${ID_STATUS_ANEXO_} .gaocg-barra { height:6px; border-radius:4px; background:#e3e8ec; margin-top:6px; overflow:hidden; }
    #${ID_STATUS_ANEXO_} .gaocg-barra-preenc { height:100%; width:0%; background:#1c7a37; transition:width .3s ease; }
    #${ID_STATUS_ANEXO_} .gaocg-status-tipos { margin:8px 0 0; padding:0 0 0 16px; max-height:180px; overflow:auto; font-size:12px; overflow-wrap:anywhere; }
    #${ID_STATUS_ANEXO_} .gaocg-status-erros { margin:8px 0 0; padding:0 0 0 16px; max-height:180px; overflow:auto; font-size:12px; color:#a12a2a; overflow-wrap:anywhere; }
  `;
  document.head.appendChild(estilo);
}

/* ================ Cartão de anotação na árvore do processo ================
 *
 * Pedido do usuário (2026-11-04): a anotação aparece sozinha ao abrir o processo,
 * num cartão dentro da coluna da árvore, logo abaixo de "Consultar Andamento".
 *
 * A leitura é a mesma do SEI Pro: o link "Anotações" está no script da árvore
 * (Nos[0].acoes), vale em qualquer documento aberto à direita, e a página dele
 * traz #txaDescricao e #chkSinPrioridade. A gravação usa fetch em vez de clicar
 * numa tela escondida: assim nenhum alerta do SEI trava a aba e dá para conferir
 * o resultado relendo a página. O SEI Pro não confere; aqui um erro aparece no
 * cartão em vez de "Salvo". Texto vazio remove a anotação (também como no SEI Pro).
 *
 * O cartão fica num Shadow DOM: o CSS do SEI e os temas não mexem nele, e ele não
 * mexe na árvore. A árvore recarrega com frequência, então o estado mora aqui fora
 * e o cartão é remontado a cada recarga, sem perder o que estava sendo digitado.
 */

const ID_CARTAO_ANOTACAO_ = "gaocgCartaoAnotacao";
const CHAVE_ANOTACAO_MINIMIZADA_ = "gaocgAnotacaoMinimizada";

const estadoAnotacao_ = {
  chave: null,        // processo a que o estado se refere
  link: null,
  raiz: null,         // ShadowRoot do cartão montado
  carregado: false,   // só depois de ler do SEI o texto pode ser editado e salvo
  lendo: false,
  salvando: false,
  salvarDeNovo: false,
  conflito: false,
  textoServidor: "",
  prioridadeServidor: false,
  texto: "",
  prioridade: false,
  limite: 500,
  status: null
};

function normalizarTextoAnotacao_(texto) {
  return String(texto || "").replace(/\r\n?/g, "\n").replace(/\s+$/, "");
}

/** Mesma comparação que o SEI vai enxergar: caracteres fora do ISO-8859-1 são trocados ao gravar. */
function mesmoTextoAnotacao_(a, b) {
  return codificarValorSei_(normalizarTextoAnotacao_(a), "iso-8859-1") === codificarValorSei_(normalizarTextoAnotacao_(b), "iso-8859-1");
}

function anotacaoAlterada_() {
  const e = estadoAnotacao_;
  return e.carregado && (!mesmoTextoAnotacao_(e.texto, e.textoServidor) || e.prioridade !== e.prioridadeServidor);
}

/** Link da tela de anotação: primeiro no script da árvore, depois nos ícones visíveis. */
function linkAnotacaoDaArvore_(docArvore) {
  const absoluto = (href, doc) => new URL(href.replace(/&amp;/g, "&"), doc.baseURI).href;
  for (const script of Array.from(docArvore.querySelectorAll("script:not([src])"))) {
    const texto = (script.textContent || "").replace(/\\(["'/])/g, "$1");
    if (texto.indexOf("acoes") === -1) continue;
    const direto = /controlador\.php\?acao=anotacao_registrar[^"'\\\s<>]*/.exec(texto);
    if (direto) return absoluto(direto[0], docArvore);
    const ancoras = /<a\b[^>]*href="(controlador\.php\?acao=[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let achado;
    while ((achado = ancoras.exec(texto))) {
      if (/title="Anota/i.test(achado[0])) return absoluto(achado[1], docArvore);
    }
  }
  for (const doc of documentosDisponiveis_()) {
    const icone = doc.querySelector('a[href*="acao=anotacao_registrar"], a[title^="Anota"], img[title^="Anota"]');
    const ancora = icone && (icone.closest("a") || icone);
    const href = ancora && ancora.getAttribute("href");
    if (href && /acao=/.test(href)) return absoluto(href, doc);
  }
  return null;
}

async function lerAnotacaoDoSei_(link) {
  const pagina = await pedirSei_(link);
  const area = pagina.doc.querySelector('#txaDescricao, [name="txaDescricao"]');
  if (!area) throw new Error("O SEI não abriu a tela de anotação.");
  const form = area.closest("form") || pagina.doc.querySelector("form");
  if (!form) throw new Error("O SEI não abriu a tela de anotação.");
  const caixaPrioridade = form.querySelector('#chkSinPrioridade, [name="chkSinPrioridade"]');
  return {
    pagina: pagina,
    form: form,
    area: area,
    caixaPrioridade: caixaPrioridade,
    texto: normalizarTextoAnotacao_(area.value),
    prioridade: !!(caixaPrioridade && caixaPrioridade.checked),
    limite: Number(area.getAttribute("maxlength")) || 500
  };
}

/** Grava e relê: só conta como salvo se o SEI devolver o que foi enviado. */
async function gravarAnotacaoNoSei_(lida, texto, prioridade, link) {
  const campos = camposDoFormulario_(lida.form);
  definirCampo_(campos, lida.area.name || "txaDescricao", normalizarTextoAnotacao_(texto).replace(/\n/g, "\r\n"));
  if (lida.caixaPrioridade && lida.caixaPrioridade.name) {
    const nome = lida.caixaPrioridade.name;
    const restantes = campos.filter(par => par[0] !== nome);
    campos.length = 0;
    campos.push(...restantes);
    if (prioridade) campos.push([nome, lida.caixaPrioridade.getAttribute("value") || "on"]);
  }
  // O PHP do SEI reconhece a gravação pelo botão: um envio sem ele só reabre a tela.
  const botao = lida.form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
  if (botao && botao.name) definirCampo_(campos, botao.name, botao.getAttribute("value") || botao.value || "");

  const { pagina, form } = lida;
  await pedirSei_(new URL(form.getAttribute("action") || pagina.url, pagina.url).href, {
    method: "POST",
    headers: cabecalhoFormularioSei_(pagina.charset),
    body: corpoFormularioSei_(campos, pagina.charset)
  }, LIMITE_SALVAR_SEI_MS_);

  const conferida = await lerAnotacaoDoSei_(link);
  if (!mesmoTextoAnotacao_(conferida.texto, texto) || (lida.caixaPrioridade && conferida.prioridade !== !!prioridade)) {
    throw new Error("O SEI não confirmou a gravação.");
  }
  return conferida;
}

/* -------- leitura e gravação a partir do cartão -------- */

async function carregarCartaoAnotacao_() {
  const e = estadoAnotacao_;
  if (e.lendo) return;
  e.lendo = true;
  const reabertura = e.carregado;
  if (!reabertura) mostrarStatusAnotacao_("Carregando…");
  atualizarCartaoAnotacao_();
  try {
    const lida = await lerAnotacaoDoSei_(e.link);
    // Com texto ainda não salvo, a base de comparação fica como estava: se o SEI
    // mudou nesse meio-tempo, a gravação avisa em vez de sobrescrever calada.
    if (!anotacaoAlterada_()) {
      e.textoServidor = lida.texto;
      e.prioridadeServidor = lida.prioridade;
      e.texto = lida.texto;
      e.prioridade = lida.prioridade;
    }
    e.limite = lida.limite;
    e.carregado = true;
    mostrarStatusAnotacao_(anotacaoAlterada_() ? "Alterações não salvas" : "");
  } catch (erro) {
    console.warn("[GAOCG anotação] não consegui ler:", erro);
    if (!reabertura) mostrarStatusAnotacao_("Não consegui ler a anotação.", true, true);
  } finally {
    e.lendo = false;
    atualizarCartaoAnotacao_();
  }
}

async function salvarCartaoAnotacao_(opcoes) {
  const e = estadoAnotacao_;
  const forcar = !!(opcoes && opcoes.forcar);
  if (!e.carregado) return;
  if (e.salvando) { e.salvarDeNovo = true; return; }
  if (!anotacaoAlterada_()) return;

  e.salvando = true;
  const textoEnviado = e.texto;
  const prioridadeEnviada = e.prioridade;
  mostrarStatusAnotacao_("Salvando…");
  atualizarCartaoAnotacao_();
  try {
    const atual = await lerAnotacaoDoSei_(e.link);
    const mudouNoSei = !mesmoTextoAnotacao_(atual.texto, e.textoServidor) || atual.prioridade !== e.prioridadeServidor;
    if (mudouNoSei && !forcar && !e.conflito) {
      e.conflito = true;
      mostrarStatusAnotacao_("Outra pessoa alterou esta anotação. Salve de novo para substituir o texto dela.", true);
      return;
    }
    const conferida = await gravarAnotacaoNoSei_(atual, textoEnviado, prioridadeEnviada, e.link);
    e.conflito = false;
    e.textoServidor = conferida.texto;
    e.prioridadeServidor = conferida.prioridade;
    // Só adota o texto do SEI se nada foi digitado enquanto salvava.
    if (e.texto === textoEnviado && e.prioridade === prioridadeEnviada) {
      e.texto = conferida.texto;
      e.prioridade = conferida.prioridade;
    }
    const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    mostrarStatusAnotacao_(conferida.texto ? "Salvo às " + hora : "Anotação removida");
  } catch (erro) {
    console.warn("[GAOCG anotação] não consegui salvar:", erro);
    mostrarStatusAnotacao_("Não salvou: " + String(erro && erro.message ? erro.message : erro), true);
  } finally {
    e.salvando = false;
    atualizarCartaoAnotacao_();
    if (e.salvarDeNovo) {
      e.salvarDeNovo = false;
      salvarCartaoAnotacao_();
    }
  }
}

/* -------- o cartão -------- */

function cartaoMinimizado_(chave) {
  try { return localStorage.getItem(chave) === "1"; } catch (e) { return false; }
}

function guardarCartaoMinimizado_(chave, valor) {
  try { localStorage.setItem(chave, valor ? "1" : "0"); } catch (e) { /* só não lembra */ }
}

const ICONES_ANOTACAO_ = {
  nota: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/><path d="M8 9h8M8 13h4"/></svg>',
  seta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
  lixo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  salvar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-7h8v7"/></svg>'
};

const ESTILO_CARTAO_ANOTACAO_ = `
  :host { all: initial; display: block; margin: 12px 8px; max-width: calc(100vw - 16px);
    font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8;
    stroke-linecap: round; stroke-linejoin: round; display: block; }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
  button:disabled { cursor: default; opacity: .45; }
  button:focus-visible, textarea:focus-visible { outline: 2px solid #8a6500; outline-offset: 1px; }

  .cartao { background: #fff6c9; color: #43360a; border: 1px solid #ecd67c; border-radius: 10px;
    box-shadow: 0 1px 2px rgba(80,60,0,.14), 0 4px 12px rgba(80,60,0,.10); overflow: hidden;
    transition: background-color .15s, border-color .15s; }
  .cartao.prioridade { background: #ffe9e2; border-color: #e0654a; color: #4c1d11; }

  .cabecalho { display: flex; align-items: center; gap: 6px; padding: 7px 8px 7px 10px;
    background: rgba(140,105,0,.09); }
  .prioridade .cabecalho { background: rgba(200,60,30,.11); }
  .titulo { flex: 1; min-width: 0; font-weight: 600; font-size: 12.5px; letter-spacing: .01em; }
  .selo { display: none; font-size: 10.5px; font-weight: 700; color: #fff; background: #c8401f;
    border-radius: 999px; padding: 1px 7px; }
  .prioridade .selo { display: inline-block; }
  .icone { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 6px; flex: none; }
  .icone:hover:not(:disabled) { background: rgba(90,70,0,.13); }
  .minimizado .seta svg { transform: rotate(180deg); }

  textarea { display: block; width: 100%; min-height: 72px; max-height: 320px; padding: 9px 11px 6px; border: 0;
    resize: none; background: transparent; color: inherit; font-family: inherit; font-size: 14.5px; line-height: 1.45; }
  textarea::placeholder { color: rgba(70,55,10,.55); }
  textarea:read-only { opacity: .6; }

  .rodape { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 3px 8px 7px; }
  .interruptor { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 3px 4px; border-radius: 6px; }
  .trilho { width: 26px; height: 15px; border-radius: 999px; background: rgba(90,70,0,.3); position: relative; flex: none;
    transition: background-color .15s; }
  .trilho::after { content: ""; position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 50%;
    background: #fff; transition: transform .15s; }
  [aria-checked="true"] .trilho { background: #c8401f; }
  [aria-checked="true"] .trilho::after { transform: translateX(11px); }
  .espaco { flex: 1; }
  .contador { font-size: 11px; opacity: .65; font-variant-numeric: tabular-nums; }

  .status { padding: 0 11px 8px; font-size: 11.5px; overflow-wrap: anywhere; }
  .status.erro { color: #a3220a; font-weight: 600; }
  .status button { text-decoration: underline; margin-left: 4px; }

  .confirmar { display: flex; align-items: center; gap: 6px; padding: 7px 10px; font-size: 12px;
    border-top: 1px solid rgba(90,70,0,.2); }
  .confirmar span { flex: 1; }
  .confirmar button { padding: 3px 9px; border-radius: 6px; font-weight: 600; }
  .confirmar .sim { background: #c8401f; color: #fff; }
  .confirmar .nao { background: rgba(90,70,0,.13); }

  .minimizado .corpo { display: none; }
`;

function mostrarStatusAnotacao_(texto, ehErro, comRepetir) {
  const e = estadoAnotacao_;
  e.status = { texto: texto, ehErro: !!ehErro, comRepetir: !!comRepetir };
  pintarStatusAnotacao_();
}

function pintarStatusAnotacao_() {
  const raiz = estadoAnotacao_.raiz;
  const status = estadoAnotacao_.status;
  const alvo = raiz && raiz.querySelector(".status");
  if (!alvo) return;
  alvo.textContent = status ? status.texto : "";
  alvo.classList.toggle("erro", !!(status && status.ehErro));
  alvo.hidden = !(status && status.texto);
  if (status && status.comRepetir) {
    const repetir = document.createElement("button");
    repetir.type = "button";
    repetir.textContent = "Tentar de novo";
    repetir.addEventListener("click", carregarCartaoAnotacao_);
    alvo.appendChild(repetir);
  }
}

function ajustarAlturaAnotacao_(area) {
  area.style.height = "auto";
  if (area.scrollHeight) area.style.height = Math.min(area.scrollHeight + 2, 320) + "px";
}

/** Reflete o estado no cartão. Não mexe no textarea enquanto ele está sendo editado com o mesmo conteúdo. */
function atualizarCartaoAnotacao_() {
  const e = estadoAnotacao_;
  const raiz = e.raiz;
  if (!raiz) return;
  const area = raiz.querySelector("textarea");
  if (area.value !== e.texto) area.value = e.texto;
  area.readOnly = !e.carregado;
  area.maxLength = e.limite || 500;
  raiz.querySelector(".cartao").classList.toggle("prioridade", e.prioridade);
  const interruptor = raiz.querySelector(".interruptor");
  interruptor.setAttribute("aria-checked", e.prioridade ? "true" : "false");
  interruptor.disabled = !e.carregado;
  raiz.querySelector(".salvar").disabled = !e.carregado || e.salvando || !anotacaoAlterada_();
  raiz.querySelector(".lixo").disabled = !e.carregado || e.salvando || !e.textoServidor;
  raiz.querySelector(".contador").textContent = area.value.length + "/" + (e.limite || 500);
  ajustarAlturaAnotacao_(area);
  pintarStatusAnotacao_();
}

/** Os cartões entram logo abaixo de "Consultar Andamento"; sem esse bloco, no fim da árvore. */
function pontoDosCartoes_(doc) {
  const bloco = doc.querySelector("#divConsultarAndamento");
  if (bloco) return bloco;
  const ancora = Array.from(doc.querySelectorAll("a")).find(a => (a.textContent || "").trim().toLowerCase() === "consultar andamento");
  return ancora ? (ancora.closest("div") || ancora) : null;
}

function montarCartaoAnotacao_(doc, link) {
  const e = estadoAnotacao_;
  const idProcesso = /[?&]id_(?:protocolo|procedimento)=(\d+)/.exec(link);
  const chave = idProcesso ? idProcesso[1] : link;
  if (e.chave !== chave) {
    Object.assign(e, {
      chave: chave, carregado: false, conflito: false, textoServidor: "", prioridadeServidor: false,
      texto: "", prioridade: false, status: null
    });
  }
  e.link = link;

  const hospedeiro = doc.createElement("div");
  hospedeiro.id = ID_CARTAO_ANOTACAO_;
  const raiz = hospedeiro.attachShadow({ mode: "open" });
  raiz.innerHTML = `
    <style>${ESTILO_CARTAO_ANOTACAO_}</style>
    <section class="cartao" aria-label="Anotação do processo">
      <header class="cabecalho">
        ${ICONES_ANOTACAO_.nota}
        <span class="titulo">Anotação</span>
        <span class="selo">Prioridade</span>
        <button type="button" class="icone seta" title="Minimizar" aria-label="Minimizar">${ICONES_ANOTACAO_.seta}</button>
      </header>
      <div class="corpo">
        <textarea rows="3" placeholder="Escreva uma anotação para este processo…" aria-label="Texto da anotação" readonly></textarea>
        <div class="rodape">
          <button type="button" class="icone lixo" title="Remover anotação" aria-label="Remover anotação">${ICONES_ANOTACAO_.lixo}</button>
          <button type="button" class="interruptor" role="switch" aria-checked="false"><span class="trilho"></span>Prioridade</button>
          <span class="espaco"></span>
          <span class="contador"></span>
          <button type="button" class="icone salvar" title="Salvar" aria-label="Salvar">${ICONES_ANOTACAO_.salvar}</button>
        </div>
        <div class="status" role="status" hidden></div>
        <div class="confirmar" hidden>
          <span>Remover esta anotação?</span>
          <button type="button" class="nao">Não</button>
          <button type="button" class="sim">Remover</button>
        </div>
      </div>
    </section>
  `;

  const cartao = raiz.querySelector(".cartao");
  const area = raiz.querySelector("textarea");
  const confirmar = raiz.querySelector(".confirmar");
  const botaoSeta = raiz.querySelector(".seta");

  const aplicarMinimizado = minimizado => {
    cartao.classList.toggle("minimizado", minimizado);
    const rotulo = minimizado ? "Expandir" : "Minimizar";
    botaoSeta.title = rotulo;
    botaoSeta.setAttribute("aria-label", rotulo);
    if (!minimizado) ajustarAlturaAnotacao_(area);
  };
  aplicarMinimizado(cartaoMinimizado_(CHAVE_ANOTACAO_MINIMIZADA_));

  botaoSeta.addEventListener("click", () => {
    const minimizado = !cartao.classList.contains("minimizado");
    aplicarMinimizado(minimizado);
    guardarCartaoMinimizado_(CHAVE_ANOTACAO_MINIMIZADA_, minimizado);
    if (minimizado) salvarCartaoAnotacao_();
  });

  area.addEventListener("input", () => {
    e.texto = area.value;
    e.conflito = false;
    if (anotacaoAlterada_()) mostrarStatusAnotacao_("Alterações não salvas");
    else mostrarStatusAnotacao_("");
    atualizarCartaoAnotacao_();
  });
  // Ao sair do campo, salva sozinho - menos se o foco foi para um botão do próprio
  // cartão, que decide o que fazer (ex.: remover não deve salvar antes).
  area.addEventListener("focusout", ev => {
    if (ev.relatedTarget && raiz.contains(ev.relatedTarget)) return;
    if (!e.conflito) salvarCartaoAnotacao_();
  });
  area.addEventListener("keydown", ev => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
      ev.preventDefault();
      salvarCartaoAnotacao_({ forcar: e.conflito });
    }
  });

  raiz.querySelector(".salvar").addEventListener("click", () => salvarCartaoAnotacao_({ forcar: e.conflito }));
  raiz.querySelector(".interruptor").addEventListener("click", () => {
    e.prioridade = !e.prioridade;
    atualizarCartaoAnotacao_();
    salvarCartaoAnotacao_();
  });
  raiz.querySelector(".lixo").addEventListener("click", () => { confirmar.hidden = false; });
  raiz.querySelector(".nao").addEventListener("click", () => { confirmar.hidden = true; });
  raiz.querySelector(".sim").addEventListener("click", () => {
    confirmar.hidden = true;
    e.texto = "";
    e.prioridade = false;
    atualizarCartaoAnotacao_();
    salvarCartaoAnotacao_({ forcar: true });
  });

  const referencia = pontoDosCartoes_(doc);
  if (referencia && referencia.parentNode) referencia.parentNode.insertBefore(hospedeiro, referencia.nextSibling);
  else doc.body.appendChild(hospedeiro);

  e.raiz = raiz;
  atualizarCartaoAnotacao_();
  carregarCartaoAnotacao_();
}

/** Roda a cada segundo: monta o cartão quando a árvore (re)carrega e obedece ao botão do popup. */
function garantirCartaoAnotacao_() {
  const area = acharAreaArvore_();
  let doc = null;
  try { doc = area && (area.contentDocument || area.ownerDocument); } catch (e) { doc = null; }
  if (!doc || !doc.body || doc.readyState === "loading") return;

  const existente = doc.getElementById(ID_CARTAO_ANOTACAO_);
  if (existente) {
    existente.style.display = anotacaoSeiAtiva_ ? "" : "none";
    return;
  }
  if (!anotacaoSeiAtiva_) return;
  // Sem o link o processo não está aberto nesta unidade, e o SEI não deixaria anotar.
  const link = linkAnotacaoDaArvore_(doc);
  if (link) montarCartaoAnotacao_(doc, link);
}

/* ================ Cartão de acompanhamento especial na árvore ================
 *
 * 1ª etapa do "Anexar documentos do processo" (pedido do usuário, 2026-11-05):
 * mostrar o acompanhamento e o que dá para identificar nele. Só leitura.
 *
 * A árvore traz um link acompanhamento_gerenciar do próprio processo. Confirmado
 * no SEI real: com acompanhamento, ele abre a "Tabela de Acompanhamentos"; sem
 * nenhum, redireciona para o formulário "Novo Acompanhamento Especial". Por isso
 * nada aqui envia formulário: abrir esse link em GET não cadastra nada.
 *
 * Cada unidade tem os próprios acompanhamentos e grupos, então o resultado vale
 * para a unidade ativa. O início do número do processo não serve para identificar
 * a unidade: o usuário confirmou que uma unidade pode ter mais de um início.
 */

const ID_CARTAO_ACOMPANHAMENTO_ = "gaocgCartaoAcompanhamento";
const CHAVE_ACOMPANHAMENTO_MINIMIZADO_ = "gaocgAcompanhamentoMinimizado";

const estadoAcompanhamento_ = { raiz: null, link: null, lendo: false };

function linkAcompanhamentoDaArvore_(docArvore) {
  for (const script of Array.from(docArvore.querySelectorAll("script:not([src])"))) {
    const texto = (script.textContent || "").replace(/\\(["'/])/g, "$1");
    const achado = /controlador\.php\?acao=acompanhamento_gerenciar[^"'\\\s<>]*/.exec(texto);
    if (achado) return new URL(achado[0].replace(/&amp;/g, "&"), docArvore.baseURI).href;
  }
  return null;
}

function semAcentos_(texto) {
  return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** "RECIBO SUS 2026" e "RATEIO - 2026" viram o mesmo objeto todo ano, sem o ano. */
function objetoDoGrupo_(grupo) {
  const semAno = String(grupo || "").replace(/\b(19|20)\d{2}\b/g, " ").replace(/\s+/g, " ");
  return semAno.replace(/^[\s\-–/]+|[\s\-–/]+$/g, "").trim() || String(grupo || "").trim();
}

/** A observação começa pela unidade: "UPAE GARANHUNS -OUTUBRO/26 - SUS". */
function unidadeDaObservacao_(observacao) {
  return String(observacao || "").split(/\s+-\s*|\s*-\s+/)[0].trim();
}

function fontesNoTexto_(texto) {
  const normal = semAcentos_(texto).toUpperCase();
  const fontes = [];
  if (/\bSUS\b/.test(normal)) fontes.push("SUS");
  if (/\bTES(OURO)?\b/.test(normal)) fontes.push("Tesouro");
  if (/\bRATEIO\b/.test(normal)) fontes.push("Rateio");
  return fontes;
}

/** O grupo manda; a observação só decide se ele não disser. Duas fontes no mesmo texto contam como não identificada. */
function fonteDoAcompanhamento_(grupo, observacao) {
  const doGrupo = fontesNoTexto_(grupo);
  if (doGrupo.length) return doGrupo.length === 1 ? doGrupo[0] : "";
  const daObservacao = fontesNoTexto_(observacao);
  return daObservacao.length === 1 ? daObservacao[0] : "";
}

async function lerAcompanhamentoDoSei_(link) {
  const pagina = await pedirSei_(link);
  const tabelas = Array.from(pagina.doc.querySelectorAll("table"));
  const tabela = tabelas.find(t => /Acompanhamentos/.test(t.getAttribute("summary") || "")) ||
    tabelas.find(t => /Grupo/.test(t.textContent) && /Observa/.test(t.textContent));
  if (!tabela) return []; // sem acompanhamento: o SEI abriu o formulário de cadastro

  const titulos = Array.from(tabela.querySelectorAll("th")).map(th => semAcentos_(th.textContent).trim().toLowerCase());
  const colunaGrupo = titulos.indexOf("grupo");
  const colunaObservacao = titulos.indexOf("observacao");
  const celula = (linha, i) => (i >= 0 && linha.cells[i] ? linha.cells[i].textContent.replace(/\s+/g, " ").trim() : "");
  return Array.from(tabela.querySelectorAll("tr"))
    .filter(linha => linha.querySelector("td"))
    .map(linha => {
      const grupo = celula(linha, colunaGrupo);
      const observacao = celula(linha, colunaObservacao);
      return {
        grupo: grupo,
        observacao: observacao,
        unidade: unidadeDaObservacao_(observacao),
        objeto: objetoDoGrupo_(grupo),
        fonte: fonteDoAcompanhamento_(grupo, observacao)
      };
    });
}

const ESTILO_CARTAO_ACOMPANHAMENTO_ = `
  :host { all: initial; display: block; margin: 12px 8px; max-width: calc(100vw - 16px);
    font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8;
    stroke-linecap: round; stroke-linejoin: round; display: block; flex: none; }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
  button:focus-visible { outline: 2px solid #1c5a8a; outline-offset: 1px; }

  .cartao { background: #eef4fa; color: #1b3247; border: 1px solid #b9d0e4; border-radius: 10px;
    box-shadow: 0 1px 2px rgba(20,60,90,.14), 0 4px 12px rgba(20,60,90,.10); overflow: hidden; }
  .cabecalho { display: flex; align-items: center; gap: 6px; padding: 7px 8px 7px 10px; background: rgba(28,90,138,.1); }
  .titulo { flex: 1; min-width: 0; font-weight: 600; font-size: 12.5px; }
  .icone { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 6px; flex: none; }
  .icone:hover { background: rgba(28,90,138,.15); }
  .minimizado .seta svg { transform: rotate(180deg); }
  .minimizado .corpo { display: none; }

  .corpo { padding: 9px 11px 10px; }
  .aviso { font-size: 12.5px; opacity: .8; }
  .aviso.erro { color: #a3220a; font-weight: 600; opacity: 1; }
  .aviso button { text-decoration: underline; margin-left: 4px; }
  .registro + .registro { margin-top: 10px; padding-top: 10px; border-top: 1px solid #c9dbea; }
  .grupo { font-weight: 600; font-size: 12.5px; overflow-wrap: anywhere; }
  .observacao { margin-top: 2px; font-size: 13.5px; overflow-wrap: anywhere; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; margin: 8px 0 0; font-size: 12px; }
  dt { opacity: .7; }
  dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
  dd.vazio { font-weight: 400; font-style: italic; opacity: .7; }

  select { width: 100%; max-width: 100%; font: inherit; font-size: 12px; color: inherit; background: #fff;
    border: 1px solid #b9d0e4; border-radius: 6px; padding: 3px 4px; }
  .anexar { display: block; width: 100%; margin-top: 9px; padding: 6px 8px; border-radius: 7px; background: #1c5a8a;
    color: #fff; font-weight: 600; font-size: 12.5px; text-align: center; }
  .anexar:hover:not(:disabled) { background: #174c75; }
  .anexar:disabled { opacity: .5; cursor: default; }
  .secundario { padding: 6px 10px; border-radius: 7px; background: rgba(28,90,138,.12); font-size: 12.5px; font-weight: 600; }
  .conferencia { margin-top: 10px; padding-top: 10px; border-top: 1px solid #c9dbea; }
  .caminho { font-weight: 600; font-size: 12px; overflow-wrap: anywhere; margin-bottom: 6px; }
  .arquivos { list-style: none; margin: 0 0 8px; padding: 0; }
  .arquivos li { padding: 7px 0; border-bottom: 1px solid #d7e4ef; }
  .arquivos li.sem-tipo { background: #fff4d6; margin: 0 -6px; padding: 7px 6px; border-radius: 6px; }
  .nome { display: flex; gap: 6px; align-items: flex-start; font-size: 12.5px; overflow-wrap: anywhere; cursor: pointer; margin-bottom: 4px; }
  .nome input { margin: 2px 0 0; flex: none; }
  .nome span { min-width: 0; }
  .detalhe { font-size: 11px; opacity: .72; margin-top: 3px; }
  .alerta { font-size: 11px; font-weight: 600; color: #8a5a00; margin-top: 3px; }
  .acoes { display: flex; gap: 6px; align-items: stretch; margin-top: 8px; }
  .acoes .anexar { flex: 1; width: auto; margin: 0; }
  .escolha { margin-top: 6px; }
`;

function pintarCartaoAcompanhamento_(registros, erro) {
  const raiz = estadoAcompanhamento_.raiz;
  if (!raiz) return;
  const corpo = raiz.querySelector(".corpo");
  corpo.textContent = "";

  const aviso = (texto, ehErro) => {
    const el = document.createElement("div");
    el.className = "aviso" + (ehErro ? " erro" : "");
    el.textContent = texto;
    corpo.appendChild(el);
    return el;
  };
  if (erro) {
    const el = aviso("Não consegui ler o acompanhamento.", true);
    const repetir = document.createElement("button");
    repetir.type = "button";
    repetir.textContent = "Tentar de novo";
    repetir.addEventListener("click", carregarCartaoAcompanhamento_);
    el.appendChild(repetir);
    return;
  }
  if (!registros) { aviso("Carregando…"); return; }
  if (!registros.length) { aviso("Sem acompanhamento nesta unidade."); return; }

  for (const registro of registros) {
    const bloco = document.createElement("div");
    bloco.className = "registro";
    const grupo = document.createElement("div");
    grupo.className = "grupo";
    grupo.textContent = registro.grupo || "Sem grupo";
    bloco.appendChild(grupo);
    if (registro.observacao) {
      const observacao = document.createElement("div");
      observacao.className = "observacao";
      observacao.textContent = registro.observacao;
      bloco.appendChild(observacao);
    }
    const lista = document.createElement("dl");
    for (const [rotulo, valor] of [["Unidade", registro.unidade], ["Objeto", registro.objeto], ["Fonte", registro.fonte]]) {
      const termo = document.createElement("dt");
      termo.textContent = rotulo;
      const definicao = document.createElement("dd");
      definicao.textContent = valor || "Não identificada";
      if (!valor) definicao.className = "vazio";
      lista.append(termo, definicao);
    }
    bloco.appendChild(lista);
    if (ferramentasSeiAtivas_) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "anexar";
      botao.textContent = "Anexar documentos do processo";
      botao.addEventListener("click", () => abrirConferenciaDocumentos_(registro, {}));
      bloco.appendChild(botao);
    }
    corpo.appendChild(bloco);
  }
  const conferencia = document.createElement("div");
  conferencia.className = "conferencia";
  conferencia.hidden = true;
  corpo.appendChild(conferencia);
}

/* -------- "Anexar documentos do processo": conferência antes de enviar --------
 *
 * Os documentos vêm da pasta ANEXOS, pelo backend do app (DocumentosProcesso.gs). O acesso
 * é o da pessoa logada no app, que fica com o service worker (background.js): esta página
 * nunca vê o token. Nada é anexado sem o segundo clique, porque um documento de outra
 * unidade num processo de pagamento é um erro real; tipo e nome já vêm preenchidos.
 */

function pedirAoAppGaocg_(acao, dados) {
  return chrome.runtime.sendMessage({ type: "DOCUMENTOS_GAOCG", acao: acao, dados: dados }).then(resposta => {
    if (!resposta) throw new Error("A extensão não respondeu. Recarregue a página do SEI.");
    if (!resposta.ok) throw new Error(resposta.erro || "O app GAOCG não respondeu.");
    return resposta.dados;
  });
}

function base64ParaBytes_(base64) {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function baixarDocumentoDaBase_(id) {
  const dados = await pedirAoAppGaocg_("baixarDocumentoProcesso", { id: id });
  return new File([base64ParaBytes_(dados.base64)], dados.nome, { type: dados.tipo || "application/pdf" });
}

function dataCurta_(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("pt-BR");
}

function tamanhoCurto_(bytes) {
  const n = Number(bytes) || 0;
  return n < 1048576 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1048576).toFixed(1) + " MB";
}

/** A árvore já mostra este documento? Serve para não anexar duas vezes no mesmo processo. */
function documentoJaNaArvore_(tipo, nomeArvore) {
  const area = acharAreaArvore_();
  const doc = area && area.contentDocument;
  if (!doc || !doc.body) return false;
  const normalizar = t => palavrasDoTipo_(t).map(p => p.palavra).join(" ");
  // Inclui os scripts da página, que trazem os nós da árvore mesmo com a pasta recolhida.
  const arvore = normalizar(doc.documentElement.textContent);
  const procurado = normalizar(nomeArvore ? tipo + " " + nomeArvore : tipo);
  return !!procurado && arvore.indexOf(procurado) !== -1;
}

function painelConferencia_() {
  const raiz = estadoAcompanhamento_.raiz;
  const painel = raiz && raiz.querySelector(".conferencia");
  if (!painel) return null;
  painel.textContent = "";
  painel.hidden = false;
  return painel;
}

function fecharConferencia_() {
  const raiz = estadoAcompanhamento_.raiz;
  const painel = raiz && raiz.querySelector(".conferencia");
  if (painel) { painel.textContent = ""; painel.hidden = true; }
}

function elementoConferencia_(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function botaoCancelarConferencia_() {
  const botao = elementoConferencia_("button", "secundario", "Cancelar");
  botao.type = "button";
  botao.addEventListener("click", fecharConferencia_);
  return botao;
}

const PERGUNTA_PASTA_ANEXOS_ = {
  unidade: ["Não identifiquei a unidade com certeza. Qual é?", "unidadePasta"],
  objeto: ["Não há pasta certa para este objeto. Qual usar?", "objetoPasta"],
  divisao: ["Este objeto é dividido. Qual pasta usar?", "divisaoPasta"]
};

/** Sem certeza, quem decide é o usuário: nunca se escolhe uma pasta por aproximação. */
function pedirEscolhaDePasta_(painel, registro, escolha, dados) {
  const [pergunta, campo] = PERGUNTA_PASTA_ANEXOS_[dados.falta];
  painel.appendChild(elementoConferencia_("div", "aviso", pergunta));
  if (!dados.opcoes.length) {
    painel.appendChild(elementoConferencia_("div", "aviso", "Essa pasta ainda não tem subpastas na base de documentos."));
    painel.appendChild(botaoCancelarConferencia_());
    return;
  }
  const lista = elementoConferencia_("select", "escolha");
  lista.setAttribute("aria-label", pergunta);
  for (const nome of dados.opcoes) {
    const opcao = elementoConferencia_("option", "", nome);
    opcao.value = nome;
    lista.appendChild(opcao);
  }
  const acoes = elementoConferencia_("div", "acoes");
  const continuar = elementoConferencia_("button", "anexar", "Continuar");
  continuar.type = "button";
  continuar.addEventListener("click", () => {
    const nova = Object.assign({}, escolha, { [campo]: lista.value });
    if (dados.unidadePasta) nova.unidadePasta = dados.unidadePasta;
    if (dados.objetoPasta) nova.objetoPasta = dados.objetoPasta;
    abrirConferenciaDocumentos_(registro, nova);
  });
  acoes.append(botaoCancelarConferencia_(), continuar);
  painel.append(lista, acoes);
}

async function abrirConferenciaDocumentos_(registro, escolha) {
  const painel = painelConferencia_();
  if (!painel) return;
  painel.appendChild(elementoConferencia_("div", "aviso", "Procurando os documentos…"));
  try {
    const dados = await pedirAoAppGaocg_("listarDocumentosProcesso", {
      unidade: registro.unidade,
      grupo: registro.grupo,
      fonte: registro.fonte,
      unidadePasta: escolha.unidadePasta,
      objetoPasta: escolha.objetoPasta,
      divisaoPasta: escolha.divisaoPasta
    });
    painel.textContent = "";
    if (!dados.encontrado) {
      pedirEscolhaDePasta_(painel, registro, escolha, dados);
      return;
    }
    if (!dados.arquivos.length) {
      painel.appendChild(elementoConferencia_("div", "aviso", "A pasta " + dados.caminho + " está vazia."));
      painel.appendChild(botaoCancelarConferencia_());
      return;
    }

    // Os tipos vêm da própria tela do SEI: abrir o cadastro não grava nada.
    painel.appendChild(elementoConferencia_("div", "aviso", "Conferindo os tipos no SEI…"));
    const linkTipos = acharLinkIncluirDocumento_();
    if (!linkTipos) throw new Error('Não encontrei "Incluir Documento" neste processo. Confira se ele está aberto na sua unidade.');
    const cadastro = await abrirCadastroExterno_(linkTipos);
    const selSerie = cadastro.doc.querySelector('#selSerie, [name="selSerie"]');
    if (!selSerie) throw new Error("O cadastro do Documento Externo não abriu.");
    painel.textContent = "";
    montarConferencia_(painel, dados, selSerie);
  } catch (erro) {
    console.warn("[GAOCG documentos] falhou:", erro);
    painel.textContent = "";
    painel.appendChild(elementoConferencia_("div", "aviso erro", String(erro && erro.message ? erro.message : erro)));
    painel.appendChild(botaoCancelarConferencia_());
  }
}

function montarConferencia_(painel, dados, selSerie) {
  const config = Object.assign({}, configAnexo_);
  const opcoesTipo = Array.from(selSerie.options).filter(o => o.value && o.value !== "null");
  const padrao = opcaoDoTipo_(selSerie, config.tipoDocumento);

  painel.appendChild(elementoConferencia_("div", "caminho", dados.caminho));
  const lista = elementoConferencia_("ul", "arquivos");
  const linhas = [];

  for (const arquivo of dados.arquivos) {
    const nomeArquivo = nomeSemExtensao_(arquivo.nome);
    const deduzido = config.tipoPeloNome ? identificarTipoPeloNome_(nomeArquivo, selSerie) : null;
    const opcaoInicial = deduzido ? deduzido.opcao : padrao;
    const nomeArvore = deduzido ? deduzido.nomeArvore : nomeArquivo;
    const tipoInicial = opcaoInicial ? (opcaoInicial.textContent || "").trim() : "";
    const repetido = documentoJaNaArvore_(tipoInicial, nomeArvore);

    const item = elementoConferencia_("li", deduzido ? "" : "sem-tipo");
    const rotulo = elementoConferencia_("label", "nome");
    const marcar = document.createElement("input");
    marcar.type = "checkbox";
    const grandeDemais = Number(arquivo.tamanho) > LIMITE_DOCUMENTO_BASE_BYTES_;
    marcar.checked = !repetido && !grandeDemais;
    marcar.disabled = grandeDemais;
    rotulo.append(marcar, elementoConferencia_("span", "", arquivo.nome));
    const detalhe = [dataCurta_(arquivo.modificado) && "alterado em " + dataCurta_(arquivo.modificado), tamanhoCurto_(arquivo.tamanho)].filter(Boolean).join(" · ");
    const seletor = elementoConferencia_("select", "tipo");
    seletor.setAttribute("aria-label", "Tipo de " + arquivo.nome);
    for (const opcao of opcoesTipo) {
      const nova = elementoConferencia_("option", "", (opcao.textContent || "").trim());
      nova.value = opcao.value;
      seletor.appendChild(nova);
    }
    if (opcaoInicial) seletor.value = opcaoInicial.value;
    item.append(rotulo, seletor, elementoConferencia_("div", "detalhe", detalhe));
    if (!deduzido) item.appendChild(elementoConferencia_("div", "alerta", "Tipo não identificado pelo nome: confira."));
    if (grandeDemais) item.appendChild(elementoConferencia_("div", "alerta", "Tem mais de 35 MB: anexe arrastando para a árvore."));
    if (repetido) item.appendChild(elementoConferencia_("div", "alerta", "Parece já estar na árvore. Desmarcado."));
    lista.appendChild(item);
    linhas.push({ arquivo: arquivo, marcar: marcar, seletor: seletor, nomeArvore: nomeArvore });
  }
  painel.appendChild(lista);

  const nivel = NOME_NIVEL_ANEXO_[config.nivelAcesso] || NOME_NIVEL_ANEXO_.publico;
  painel.appendChild(elementoConferencia_("div", "detalhe", "Nível: " + nivel + " · Data: hoje · Nato-digital"));

  const acoes = elementoConferencia_("div", "acoes");
  const confirmar = elementoConferencia_("button", "anexar");
  confirmar.type = "button";
  const contar = () => {
    const total = linhas.filter(l => l.marcar.checked).length;
    confirmar.textContent = "Anexar " + total + " documento(s)";
    confirmar.disabled = !total;
  };
  linhas.forEach(l => l.marcar.addEventListener("change", contar));
  contar();
  confirmar.addEventListener("click", () => {
    const escolhidas = linhas.filter(l => l.marcar.checked);
    fecharConferencia_();
    for (const linha of escolhidas) {
      filaAnexos_.push({
        nome: linha.arquivo.nome,
        baixar: () => baixarDocumentoDaBase_(linha.arquivo.id),
        config: Object.assign({}, config, { tipoValor: linha.seletor.value, nomeArvore: linha.nomeArvore })
      });
    }
    if (!anexoEmAndamento_) processarFilaAnexos_();
  });
  acoes.append(botaoCancelarConferencia_(), confirmar);
  painel.appendChild(acoes);
}

async function carregarCartaoAcompanhamento_() {
  const e = estadoAcompanhamento_;
  if (e.lendo) return;
  e.lendo = true;
  pintarCartaoAcompanhamento_(null);
  try {
    pintarCartaoAcompanhamento_(await lerAcompanhamentoDoSei_(e.link));
  } catch (erro) {
    console.warn("[GAOCG acompanhamento] não consegui ler:", erro);
    pintarCartaoAcompanhamento_(null, true);
  } finally {
    e.lendo = false;
  }
}

function montarCartaoAcompanhamento_(doc, link) {
  const hospedeiro = doc.createElement("div");
  hospedeiro.id = ID_CARTAO_ACOMPANHAMENTO_;
  const raiz = hospedeiro.attachShadow({ mode: "open" });
  raiz.innerHTML = `
    <style>${ESTILO_CARTAO_ACOMPANHAMENTO_}</style>
    <section class="cartao" aria-label="Acompanhamento Especial">
      <header class="cabecalho">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
        <span class="titulo">Acompanhamento Especial</span>
        <button type="button" class="icone seta" title="Minimizar" aria-label="Minimizar">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>
        </button>
      </header>
      <div class="corpo" role="status"></div>
    </section>
  `;
  const cartao = raiz.querySelector(".cartao");
  const seta = raiz.querySelector(".seta");
  const aplicarMinimizado = minimizado => {
    cartao.classList.toggle("minimizado", minimizado);
    const rotulo = minimizado ? "Expandir" : "Minimizar";
    seta.title = rotulo;
    seta.setAttribute("aria-label", rotulo);
  };
  aplicarMinimizado(cartaoMinimizado_(CHAVE_ACOMPANHAMENTO_MINIMIZADO_));
  seta.addEventListener("click", () => {
    const minimizado = !cartao.classList.contains("minimizado");
    aplicarMinimizado(minimizado);
    guardarCartaoMinimizado_(CHAVE_ACOMPANHAMENTO_MINIMIZADO_, minimizado);
  });

  // Abaixo do cartão de anotação, quando ele existir.
  const referencia = doc.getElementById(ID_CARTAO_ANOTACAO_) || pontoDosCartoes_(doc);
  if (referencia && referencia.parentNode) referencia.parentNode.insertBefore(hospedeiro, referencia.nextSibling);
  else doc.body.appendChild(hospedeiro);

  estadoAcompanhamento_.raiz = raiz;
  estadoAcompanhamento_.link = link;
  carregarCartaoAcompanhamento_();
}

function garantirCartaoAcompanhamento_() {
  const area = acharAreaArvore_();
  let doc = null;
  try { doc = area && (area.contentDocument || area.ownerDocument); } catch (e) { doc = null; }
  if (!doc || !doc.body || doc.readyState === "loading") return;

  const existente = doc.getElementById(ID_CARTAO_ACOMPANHAMENTO_);
  if (existente) {
    existente.style.display = acompanhamentoSeiAtivo_ ? "" : "none";
    return;
  }
  if (!acompanhamentoSeiAtivo_) return;
  const link = linkAcompanhamentoDaArvore_(doc);
  if (link) montarCartaoAcompanhamento_(doc, link);
}

/* ============== LE/OB do processo anexadas sozinhas no Recibo do app ==============
 *
 * Fase 1 do pedido de 2026-11-11: ao abrir um processo, cada PDF da árvore que parece
 * Nota de Liquidação ou Ordem Bancária é baixado (sessão do SEI de quem está logado) e
 * enviado ao app, que lê o documento, acha o Recibo pela NE + competência e anexa
 * quando não há dúvida (ReciboSei.gs). O app guarda o que já viu de cada documento,
 * então reabrir o processo só manda o que ainda não foi resolvido.
 *
 * A árvore vem dos scripts `Nos[i] = new infraArvoreNo(...)` do iframe da árvore -
 * confirmado ao vivo em 2026-11-11: documento externo traz `Nos[i].src` apontando para
 * documento_download_anexo, que devolve o PDF direto. Pasta recolhida não traz os
 * documentos (só um nó AGUARDE), então só entra o que estiver nas pastas abertas.
 */

const ID_CARTAO_RECIBO_SEI_ = "gaocgCartaoReciboSei";
const CHAVE_RECIBO_SEI_MINIMIZADO_ = "gaocgReciboSeiMinimizado";
const REGEX_NOME_LE_OB_ = /ordem\s+banc|nota\s+de\s+liquida|\d{4}\s*(?:LE|OB)\s*\d{6}|\b(?:LE|OB)\s*n?[ºo°]?\s*\d{3,6}\b/i;
const estadoReciboSei_ = { raiz: null, chave: "", execucao: null, arvore: null, interrompido: false, itens: [] };

function textoDosScriptsDaArvore_(doc) {
  return Array.from(doc.querySelectorAll("script")).map(s => s.textContent || "").join("\n");
}

/** Processo e documentos externos (PDF) carregados na árvore. */
function documentosDaArvoreSei_(doc) {
  const texto = textoDosScriptsDaArvore_(doc);
  const processo = /new infraArvoreNo\("PROCESSO","(\d+)",[^,]*,"[^"]*",(?:"[^"]*"|null),"([^"]*)"/.exec(texto);
  if (!processo) return null;
  const fontes = {};
  const reSrc = /Nos\[(\d+)\]\.src\s*=\s*'([^']*)'/g;
  let s;
  while ((s = reSrc.exec(texto))) fontes[s[1]] = s[2];
  const documentos = [];
  const reNo = /Nos\[(\d+)\]\s*=\s*new infraArvoreNo\("DOCUMENTO","(\d+)","[^"]*",(?:"[^"]*"|null),(?:"[^"]*"|null),"([^"]*)"/g;
  let m;
  while ((m = reNo.exec(texto))) {
    const src = fontes[m[1]] || "";
    if (!/acao=documento_download_anexo/.test(src)) continue;
    documentos.push({ id: m[2], nome: m[3], url: new URL(src, doc.baseURI || doc.location.href).href });
  }
  return { idProcesso: processo[1], numeroProcesso: processo[2], documentos: documentos };
}

function nomeCurtoDocumentoSei_(nome) {
  return String(nome || "").replace(/\s*\(\d+\)\s*$/, "").trim();
}

function bytesParaBase64_(bytes) {
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

async function baixarPdfDaArvore_(url) {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), LIMITE_LEITURA_SEI_MS_);
  try {
    const resposta = await fetch(url, { credentials: "same-origin", cache: "no-store", signal: controle.signal });
    if (!resposta.ok) throw new Error("O SEI respondeu com erro (HTTP " + resposta.status + ").");
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    const ehPdf = [0x25, 0x50, 0x44, 0x46, 0x2d].every((b, i) => bytes[i] === b); // "%PDF-"
    if (!ehPdf) throw new Error("O SEI não devolveu um PDF (sessão expirada?).");
    const disposicao = resposta.headers.get("content-disposition") || "";
    const nome = (/filename="([^"]+)"/.exec(disposicao) || [])[1] || "documento.pdf";
    return { base64: bytesParaBase64_(bytes), nome: nome };
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("O SEI demorou demais para entregar o PDF.");
    throw e;
  } finally {
    clearTimeout(limite);
  }
}

const ESTILO_CARTAO_RECIBO_SEI_ = ESTILO_CARTAO_ACOMPANHAMENTO_ + `
  .itens { list-style: none; margin: 0; padding: 0; }
  .itens li { display: flex; gap: 7px; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid #d7e4ef; }
  .itens li:last-child { border-bottom: 0; }
  .marca { flex: none; width: 16px; text-align: center; font-weight: 700; }
  .ok .marca { color: #1e7b3c; }
  .pendente .marca { color: #a35d00; }
  .lendo .marca, .ignorado .marca { color: #5a6f82; }
  .texto { min-width: 0; }
  .doc { font-size: 12.5px; font-weight: 600; overflow-wrap: anywhere; }
  .situacao { font-size: 11.5px; margin-top: 1px; overflow-wrap: anywhere; }
  .pendente .situacao { color: #8a4b00; }
  .reanexar { margin-top: 5px; font-size: 11.5px; padding: 3px 9px; }
`;

function situacaoItemReciboSei_(item) {
  if (item.erro) return { classe: "pendente", marca: "!", texto: item.erro };
  const r = item.registro;
  if (!r) return { classe: "lendo", marca: "…", texto: item.lendo ? "Lendo e conferindo no app…" : "Na fila" };
  // Fica no cartão de vez (pedido do usuário, 2026-11-11): o app guarda o resultado, então reabrir o
  // processo mostra de novo onde cada documento foi parar.
  const onde = r.recibo_id + (r.recibo_descricao ? " (" + r.recibo_descricao + ")" : "");
  const nota = r.motivo ? " " + r.motivo : "";
  if (r.resultado === "anexado") return { classe: "ok", marca: "✓", texto: "Anexada no recibo " + onde + "." + nota };
  if (r.resultado === "ja_estava") return { classe: "ok", marca: "✓", texto: "Já estava no recibo " + onde + "." };
  if (r.resultado === "ignorado") return { classe: "ignorado", marca: "–", texto: r.motivo || "Não é LE nem OB." };
  // Conferido no app a cada abertura do processo (2026-11-11): apagada do recibo no app.
  // Não reanexa sozinha - a remoção pode ter sido de propósito -, só oferece o botão.
  if (r.resultado === "removido") {
    return { classe: "pendente", marca: "!", texto: r.motivo || "Foi removida do recibo no app.", reanexar: true };
  }
  return { classe: "pendente", marca: "!", texto: "Não anexada: " + (r.motivo || "precisa de conferência.") };
}

/** Botão "Anexar de novo": baixa o PDF de novo e pede ao app para reanexar (só vale se saiu mesmo do recibo). */
async function reanexarItemReciboSei_(item) {
  const arvore = estadoReciboSei_.arvore;
  if (!arvore || item.lendo) return;
  item.lendo = true;
  item.erro = "";
  pintarCartaoReciboSei_();
  try {
    const pdf = await baixarPdfDaArvore_(item.url);
    item.registro = await pedirAoAppGaocg_("anexarDocumentoSeiRecibo", {
      numero_processo: arvore.numeroProcesso, id_documento_sei: item.id, nome_arvore: item.nome,
      arquivoNome: pdf.nome, arquivoBase64: pdf.base64, reanexar: true
    });
  } catch (erro) {
    item.erro = String(erro && erro.message ? erro.message : erro);
  } finally {
    item.lendo = false;
    pintarCartaoReciboSei_();
  }
}

function pintarCartaoReciboSei_(aviso, ehErro) {
  const raiz = estadoReciboSei_.raiz;
  if (!raiz) return;
  const corpo = raiz.querySelector(".corpo");
  corpo.textContent = "";
  if (aviso) {
    const el = document.createElement("div");
    el.className = "aviso" + (ehErro ? " erro" : "");
    el.textContent = aviso;
    corpo.appendChild(el);
  }
  const visiveis = estadoReciboSei_.itens.filter(i => !(i.registro && i.registro.resultado === "ignorado"));
  if (!visiveis.length) {
    if (!aviso) {
      const el = document.createElement("div");
      el.className = "aviso";
      el.textContent = "Nenhuma LE ou OB nas pastas abertas.";
      corpo.appendChild(el);
    }
    return;
  }
  const lista = document.createElement("ul");
  lista.className = "itens";
  for (const item of visiveis) {
    const s = situacaoItemReciboSei_(item);
    const li = document.createElement("li");
    li.className = s.classe;
    const marca = document.createElement("span");
    marca.className = "marca";
    marca.textContent = s.marca;
    const texto = document.createElement("div");
    texto.className = "texto";
    const doc = document.createElement("div");
    doc.className = "doc";
    doc.textContent = nomeCurtoDocumentoSei_(item.nome);
    const situacao = document.createElement("div");
    situacao.className = "situacao";
    situacao.textContent = s.texto;
    texto.append(doc, situacao);
    if (s.reanexar) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "secundario reanexar";
      botao.textContent = "Anexar de novo";
      botao.addEventListener("click", () => reanexarItemReciboSei_(item));
      texto.appendChild(botao);
    }
    li.append(marca, texto);
    lista.appendChild(li);
  }
  corpo.appendChild(lista);
}

/**
 * Cada chamada vira a execução da vez (e.execucao): a anterior para no próximo documento.
 * Acontece quando a árvore recarrega (novo cartão) ou quando o botão do painel é religado.
 */
async function sincronizarReciboSei_(arvore) {
  const e = estadoReciboSei_;
  const execucao = {};
  e.execucao = execucao;
  e.arvore = arvore;
  e.interrompido = false;
  const vigente = () => e.execucao === execucao;
  try {
    pintarCartaoReciboSei_("Conferindo com o app GAOCG…");
    let vistos = [];
    try {
      vistos = await pedirAoAppGaocg_("documentosSeiProcessados", { numero_processo: arvore.numeroProcesso });
    } catch (erro) {
      if (vigente()) pintarCartaoReciboSei_(String(erro && erro.message ? erro.message : erro), true);
      return;
    }
    if (!vigente()) return;
    const porId = {};
    (vistos || []).forEach(v => { porId[String(v.id_documento_sei)] = v; });
    // Um resultado final já conhecido nesta página vale mesmo que a lista do app venha atrasada.
    e.itens.forEach(item => { item.registro = porId[item.id] || (item.registro && item.registro.final ? item.registro : null); });
    pintarCartaoReciboSei_();

    for (const item of e.itens) {
      if (!vigente()) return;
      if (!reciboSeiAtivo_) { e.interrompido = true; return; }
      if (item.registro && item.registro.final) continue;
      item.lendo = true;
      item.erro = "";
      pintarCartaoReciboSei_();
      try {
        const pdf = await baixarPdfDaArvore_(item.url);
        item.registro = await pedirAoAppGaocg_("anexarDocumentoSeiRecibo", {
          numero_processo: arvore.numeroProcesso, id_documento_sei: item.id, nome_arvore: item.nome,
          arquivoNome: pdf.nome, arquivoBase64: pdf.base64
        });
      } catch (erro) {
        item.erro = String(erro && erro.message ? erro.message : erro);
      } finally {
        item.lendo = false;
        if (vigente()) pintarCartaoReciboSei_();
      }
    }
  } finally {
    if (vigente()) e.execucao = null;
  }
}

function montarCartaoReciboSei_(doc, arvore) {
  const hospedeiro = doc.createElement("div");
  hospedeiro.id = ID_CARTAO_RECIBO_SEI_;
  const raiz = hospedeiro.attachShadow({ mode: "open" });
  raiz.innerHTML = `
    <style>${ESTILO_CARTAO_RECIBO_SEI_}</style>
    <section class="cartao" aria-label="LE e OB no recibo do GAOCG">
      <header class="cabecalho">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 14 2 2 4-4"/></svg>
        <span class="titulo">GAOCG · LE/OB no recibo</span>
        <button type="button" class="icone seta" title="Minimizar" aria-label="Minimizar">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>
        </button>
      </header>
      <div class="corpo" role="status"></div>
    </section>
  `;
  const cartao = raiz.querySelector(".cartao");
  const seta = raiz.querySelector(".seta");
  const aplicarMinimizado = minimizado => {
    cartao.classList.toggle("minimizado", minimizado);
    const rotulo = minimizado ? "Expandir" : "Minimizar";
    seta.title = rotulo;
    seta.setAttribute("aria-label", rotulo);
  };
  aplicarMinimizado(cartaoMinimizado_(CHAVE_RECIBO_SEI_MINIMIZADO_));
  seta.addEventListener("click", () => {
    const minimizado = !cartao.classList.contains("minimizado");
    aplicarMinimizado(minimizado);
    guardarCartaoMinimizado_(CHAVE_RECIBO_SEI_MINIMIZADO_, minimizado);
  });

  const referencia = doc.getElementById(ID_CARTAO_ACOMPANHAMENTO_) || doc.getElementById(ID_CARTAO_ANOTACAO_) || pontoDosCartoes_(doc);
  if (referencia && referencia.parentNode) referencia.parentNode.insertBefore(hospedeiro, referencia.nextSibling);
  else doc.body.appendChild(hospedeiro);

  const chave = arvore.idProcesso + ":" + arvore.documentos.map(d => d.id).join(",");
  const anteriores = estadoReciboSei_.chave.split(":")[0] === arvore.idProcesso ? estadoReciboSei_.itens : [];
  estadoReciboSei_.raiz = raiz;
  estadoReciboSei_.chave = chave;
  estadoReciboSei_.itens = arvore.documentos.map(d => {
    const antes = anteriores.find(a => a.id === d.id);
    return { id: d.id, nome: d.nome, url: d.url, registro: antes ? antes.registro : null, erro: "", lendo: false };
  });
  pintarCartaoReciboSei_();
  sincronizarReciboSei_(arvore);
}

/** Roda a cada segundo, junto dos outros cartões: só aparece em processo com LE/OB na árvore. */
function garantirCartaoReciboSei_() {
  const area = acharAreaArvore_();
  let doc = null;
  try { doc = area && (area.contentDocument || area.ownerDocument); } catch (e) { doc = null; }
  if (!doc || !doc.body || doc.readyState === "loading") return;

  const existente = doc.getElementById(ID_CARTAO_RECIBO_SEI_);
  if (existente) {
    existente.style.display = reciboSeiAtivo_ ? "" : "none";
    // Desligado no meio da conferência e religado: retoma de onde parou.
    if (reciboSeiAtivo_ && estadoReciboSei_.interrompido && !estadoReciboSei_.execucao && estadoReciboSei_.arvore) {
      sincronizarReciboSei_(estadoReciboSei_.arvore);
    }
    return;
  }
  if (!reciboSeiAtivo_) return;
  const arvore = documentosDaArvoreSei_(doc);
  if (!arvore) return;
  arvore.documentos = arvore.documentos.filter(d => REGEX_NOME_LE_OB_.test(d.nome));
  if (arvore.documentos.length) montarCartaoReciboSei_(doc, arvore);
}

/* ============ liga/desliga das janelas de anexo e anotação (popup) ============
 *
 * 2026-10-15, pedido do usuário: o painel da extensão (popup.html/popup.js) tem
 * um botão para cada função - anexação de arquivos (arrastar para a árvore) e
 * "Anotação do processo" -, deixando, com as duas desligadas, só o envio de
 * SOF (que não depende disto e segue sempre ativo). Ausente no storage =
 * ativo, o comportamento de antes desta opção existir.
 * Desligar a anotação só ESCONDE o cartão, para religar não perder o que já
 * estava digitado. Desligar os anexos faz a árvore ignorar arquivos arrastados;
 * um envio já em andamento vai até o fim.
 *
 * Migração: na v0.49.0 a chave de anexos (ferramentasSeiAtivas) desligava as
 * duas janelas. Sem chave própria salva, a anotação herda esse valor - quem
 * já tinha desligado não vê a anotação reaparecer na atualização.
 */
const CHAVE_FERRAMENTAS_SEI_ = "ferramentasSeiAtivas";
const CHAVE_ANOTACAO_SEI_ = "anotacaoSeiAtiva";
const CHAVE_ACOMPANHAMENTO_SEI_ = "acompanhamentoSeiAtivo";
// LE/OB do processo anexadas sozinhas no Recibo do app (2026-11-11). Ausente = ativo.
const CHAVE_RECIBO_SEI_ = "reciboSeiAtivo";
let ferramentasSeiAtivas_ = true;
let anotacaoSeiAtiva_ = true;
let acompanhamentoSeiAtivo_ = true;
let reciboSeiAtivo_ = true;

function lerPreferenciasFerramentas_(dados) {
  ferramentasSeiAtivas_ = dados[CHAVE_FERRAMENTAS_SEI_] !== false;
  anotacaoSeiAtiva_ = (CHAVE_ANOTACAO_SEI_ in dados) ? dados[CHAVE_ANOTACAO_SEI_] !== false : ferramentasSeiAtivas_;
  acompanhamentoSeiAtivo_ = dados[CHAVE_ACOMPANHAMENTO_SEI_] !== false;
  reciboSeiAtivo_ = dados[CHAVE_RECIBO_SEI_] !== false;
  configAnexo_ = {
    tipoDocumento: String(dados[CHAVE_ANEXO_TIPO_] || "").trim() || "Anexo",
    nivelAcesso: (dados[CHAVE_ANEXO_NIVEL_] in MAPA_NIVEL_ACESSO) ? dados[CHAVE_ANEXO_NIVEL_] : "publico",
    tipoPeloNome: dados[CHAVE_ANEXO_TIPO_PELO_NOME_] !== false
  };
}

async function carregarPreferenciaFerramentas_() {
  try {
    lerPreferenciasFerramentas_(await chrome.storage.local.get([CHAVE_FERRAMENTAS_SEI_, CHAVE_ANOTACAO_SEI_, CHAVE_ACOMPANHAMENTO_SEI_, CHAVE_RECIBO_SEI_, CHAVE_ANEXO_TIPO_, CHAVE_ANEXO_NIVEL_, CHAVE_ANEXO_TIPO_PELO_NOME_]));
  } catch (e) { ferramentasSeiAtivas_ = true; anotacaoSeiAtiva_ = true; }
  return ferramentasSeiAtivas_;
}

function garantirCartoesDaArvore_() {
  garantirCartaoAnotacao_();
  garantirCartaoAcompanhamento_();
  garantirCartaoReciboSei_();
}

function aplicarVisibilidadeFerramentas_() {
  if (!ferramentasSeiAtivas_) esconderZonaAnexo_();
  if (location.href.includes("procedimento_trabalhar")) garantirCartoesDaArvore_();
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

  // Anexo por arraste + cartão de anotação: só fazem sentido na página de um
  // processo aberto. A preferência é lida antes do primeiro arraste; desligado
  // no painel da extensão, o arraste é ignorado (ver aplicarVisibilidadeFerramentas_).
  if (location.href.includes("procedimento_trabalhar")) {
    carregarPreferenciaFerramentas_()
      .catch(() => {})
      .then(() => {
        garantirCartoesDaArvore_();
        setInterval(garantirCartoesDaArvore_, 1000);
      });
    iniciarAnexoPorArraste_();
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
    // Botão do painel da extensão: vale na hora para esta aba.
    if (area === "local" && (mudancas[CHAVE_FERRAMENTAS_SEI_] || mudancas[CHAVE_ANOTACAO_SEI_] || mudancas[CHAVE_ACOMPANHAMENTO_SEI_] || mudancas[CHAVE_RECIBO_SEI_] || mudancas[CHAVE_ANEXO_TIPO_] || mudancas[CHAVE_ANEXO_NIVEL_] || mudancas[CHAVE_ANEXO_TIPO_PELO_NOME_])) {
      // Relê as duas juntas: a anotação pode herdar a chave de anexos (migração).
      carregarPreferenciaFerramentas_().then(aplicarVisibilidadeFerramentas_);
    }
  });
}
