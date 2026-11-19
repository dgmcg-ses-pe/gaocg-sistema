/**
 * GAOCG SEI Bridge - leitor do E-fisco (documento offscreen, 2026-11-19).
 *
 * O service worker não tem DOMParser, e as telas do E-fisco são formulários clássicos
 * (servlet, POST com ~160 campos), então quem conversa com o E-fisco é este documento
 * escondido. Ele usa o login que o usuário já tem no navegador (cookies do
 * efisco.sefaz.pe.gov.br, liberados pelo host_permissions) - nunca digita senha.
 *
 * Tela usada: Financeiro > Ordem Bancária (/sfi_fin_gfe/PRManterOrdemBancaria). Investigado
 * no E-fisco real em 2026-11-19:
 *  - consulta = GET da tela + POST do próprio formulário com evento=processarFiltroConsulta e
 *    o filtro "Empenho" (ano + NE inicial/final). Cada NE leva ~1 s;
 *  - PDF = a mesma consulta, depois POST evento=exibirOrdemBancariaAssinada com só a
 *    chave_primaria da OB (tela "Operação concluída com sucesso"), depois POST
 *    evento=exibirDocumento com o formulário dessa tela (o botão "Visualizar / imprimir");
 *  - sem login o E-fisco redireciona para fora (fetch com redirect "manual" dá
 *    opaqueredirect); contexto vencido devolve "Tempo de inatividade excedido".
 * Atenção: o GET da tela troca o contexto da tela de Ordem Bancária no servidor - se o
 * usuário estiver com ela aberta numa aba, ela cai. Quem decide se pode consultar é o
 * background.js (abaDeObAberta_).
 */
const URL_OB_EFISCO_ = "https://efisco.sefaz.pe.gov.br/sfi_fin_gfe/PRManterOrdemBancaria";

class SemLoginEfisco_ extends Error {}

/** As telas do E-fisco vêm em ISO-8859-1; Response.text() leria como UTF-8 e trocaria os acentos. */
async function lerTexto_(resposta) {
  const buffer = await resposta.arrayBuffer();
  const tipo = resposta.headers.get("content-type") || "";
  let charset = (/charset=([\w-]+)/i.exec(tipo) || [])[1];
  if (!charset) {
    const inicio = new TextDecoder("latin1").decode(buffer.slice(0, 2048));
    charset = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(inicio) || [])[1] || "windows-1252";
  }
  try { return new TextDecoder(charset).decode(buffer); } catch (e) { return new TextDecoder("windows-1252").decode(buffer); }
}

function lerHtml_(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

function avaliarPagina_(html) {
  if (/inatividade\s+excedido/i.test(html)) throw new SemLoginEfisco_("Sessão do E-fisco vencida.");
  const doc = lerHtml_(html);
  if (!doc.forms[0]) throw new Error("O E-fisco devolveu uma página sem formulário.");
  return doc;
}

async function abrirTelaOb_() {
  let resposta;
  try {
    resposta = await fetch(URL_OB_EFISCO_, { credentials: "include", redirect: "manual" });
  } catch (e) {
    throw new SemLoginEfisco_("Não consegui abrir o E-fisco.");
  }
  if (resposta.type === "opaqueredirect" || (resposta.status >= 300 && resposta.status < 400)) {
    throw new SemLoginEfisco_("O E-fisco pediu login.");
  }
  if (!resposta.ok) throw new Error("O E-fisco respondeu com erro (HTTP " + resposta.status + ").");
  const doc = avaliarPagina_(await lerTexto_(resposta));
  if (!doc.querySelector("[name=SqEmpenhoInicial]")) throw new SemLoginEfisco_("O E-fisco não abriu a tela de Ordem Bancária.");
  return doc;
}

async function postar_(form, ajustar) {
  const dados = new FormData(form);
  ajustar(dados);
  const resposta = await fetch(URL_OB_EFISCO_, {
    method: "POST", credentials: "include", redirect: "manual", body: new URLSearchParams(dados)
  });
  if (resposta.type === "opaqueredirect") throw new SemLoginEfisco_("O E-fisco pediu login.");
  if (!resposta.ok) throw new Error("O E-fisco respondeu com erro (HTTP " + resposta.status + ").");
  return resposta;
}

/** "2026NE000418" -> filtro da tela (ano do empenho + sequencial), e o ano das OBs (exercício atual). */
async function consultarNe_(numeroNe) {
  const m = /^(\d{4})NE(\d{6})$/.exec(String(numeroNe || "").toUpperCase());
  if (!m) throw new Error("NE inválida: " + numeroNe);
  const anoOb = String(new Date().getFullYear());
  const tela = await abrirTelaOb_();
  const resposta = await postar_(tela.forms[0], dados => {
    dados.set("evento", "processarFiltroConsulta");
    dados.set("nao_utilizar_id_contexto_sessao", "true");
    dados.set("qt_registros_pagina", "999999");
    dados.set("DtAnoExercicioCTB", anoOb);
    dados.set("DtAnoExercicioEmpenho", m[1]);
    dados.set("SqEmpenhoInicial", m[2]);
    dados.set("SqEmpenhoFinal", m[2]);
  });
  return { doc: avaliarPagina_(await lerTexto_(resposta)), anoOb: anoOb };
}

function texto_(el) {
  return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
}

/** Colunas pelo cabeçalho da tabela; se o layout mudar e não achar, usa a ordem vista em 2026-11-19. */
function colunasDaTabela_(linha) {
  const padrao = { ob: 1, data: 2, tipo: 3, situacao: 4, pd: 5, ne: 8, credor: 9, valor: 10, assinado: 11 };
  const tabela = linha.closest("table");
  const cabecalho = tabela && Array.from(tabela.querySelectorAll("tr")).find(tr => /N[úu]mero da OB/i.test(texto_(tr)) && tr.querySelector("th, td"));
  if (!cabecalho) return padrao;
  const nomes = Array.from(cabecalho.cells).map(c => texto_(c).toLowerCase());
  const achar = re => nomes.findIndex(n => re.test(n));
  const col = {
    ob: achar(/n[úu]mero da ob/), data: achar(/data da ob/), tipo: achar(/tipo da ob/), situacao: achar(/situa[çc][ãa]o da ob/),
    pd: achar(/n[úu]mero da pd/), ne: achar(/n[úu]mero do empenho/), credor: achar(/^credor$/), valor: achar(/^valor$/), assinado: achar(/^assinado$/)
  };
  return Object.values(col).every(i => i >= 0) ? col : padrao;
}

function valorBr_(texto) {
  const n = Number(String(texto || "").replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? n : null;
}

function linhasDeOb_(doc, anoOb) {
  const caixas = Array.from(doc.querySelectorAll("input[name=chave_primaria]"));
  if (!caixas.length) return [];
  const col = colunasDaTabela_(caixas[0].closest("tr"));
  return caixas.map(caixa => {
    const celulas = caixa.closest("tr").cells;
    const curto = texto_(celulas[col.ob]).toUpperCase();
    return {
      numero_ob: /^OB\d{6}$/.test(curto) ? anoOb + curto : curto,
      data: texto_(celulas[col.data]),
      tipo: texto_(celulas[col.tipo]),
      situacao: texto_(celulas[col.situacao]).toUpperCase(),
      pd: texto_(celulas[col.pd]),
      ne: texto_(celulas[col.ne]).toUpperCase(),
      credor: texto_(celulas[col.credor]),
      valor: valorBr_(texto_(celulas[col.valor])),
      assinado: /^sim$/i.test(texto_(celulas[col.assinado])),
      chave: caixa.value
    };
  }).filter(l => /^\d{4}OB\d{6}$/.test(l.numero_ob));
}

async function listarObsDaNe_(numeroNe) {
  const { doc, anoOb } = await consultarNe_(numeroNe);
  return linhasDeOb_(doc, anoOb).map(l => { const c = Object.assign({}, l); delete c.chave; return c; });
}

function paraBase64_(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function baixarPdfOb_(numeroNe, numeroOb) {
  const { doc, anoOb } = await consultarNe_(numeroNe);
  const linha = linhasDeOb_(doc, anoOb).find(l => l.numero_ob === String(numeroOb).toUpperCase());
  if (!linha) throw new Error("A OB " + numeroOb + " não apareceu na consulta da NE " + numeroNe + " no E-fisco.");
  const exibir = await postar_(doc.forms[0], dados => {
    dados.delete("chave_primaria");
    dados.append("chave_primaria", linha.chave);
    dados.set("evento", "exibirOrdemBancariaAssinada");
  });
  const telaExibir = avaliarPagina_(await lerTexto_(exibir));
  const pdf = await postar_(telaExibir.forms[0], dados => dados.set("evento", "exibirDocumento"));
  const buffer = await pdf.arrayBuffer();
  if (new TextDecoder("latin1").decode(buffer.slice(0, 5)) !== "%PDF-") {
    const html = new TextDecoder("latin1").decode(buffer);
    if (/inatividade\s+excedido/i.test(html)) throw new SemLoginEfisco_("Sessão do E-fisco vencida.");
    throw new Error("O E-fisco não devolveu o PDF da OB " + numeroOb + ".");
  }
  return { base64: paraBase64_(buffer), tamanho: buffer.byteLength };
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (!mensagem || mensagem.alvo !== "offscreen-efisco" || remetente.id !== chrome.runtime.id) return false;
  const tarefa = mensagem.tipo === "LISTAR_OBS_NE" ? listarObsDaNe_(mensagem.ne)
    : mensagem.tipo === "BAIXAR_PDF_OB" ? baixarPdfOb_(mensagem.ne, mensagem.numeroOb)
    : Promise.reject(new Error("Pedido desconhecido."));
  tarefa
    .then(dados => responder({ ok: true, dados: dados }))
    .catch(erro => responder({ ok: false, semLogin: erro instanceof SemLoginEfisco_, erro: String(erro && erro.message ? erro.message : erro) }));
  return true;
});
