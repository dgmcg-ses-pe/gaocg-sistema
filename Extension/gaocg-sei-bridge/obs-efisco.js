/**
 * Página "Ordens Bancárias do E-fisco" (2026-11-19, pedido do usuário): onde o usuário vê
 * as OBs novas que a extensão achou e escolhe quais anexar no app. Quem faz o trabalho é o
 * background.js (EFISCO_*); esta página só mostra o que está no chrome.storage.local e
 * se redesenha sozinha quando ele muda.
 */
const CHAVE_OBS_ = "efiscoObs";
const CHAVE_ESTADO_ = "efiscoEstado";

const $ = id => document.getElementById(id);

function moeda_(n) {
  return typeof n === "number" ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";
}

function quando_(ms) {
  return ms ? new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-";
}

/** "06/11/2026" -> 20261106 para ordenar da mais nova para a mais antiga. */
function chaveData_(d) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || "");
  return m ? Number(m[3] + m[2] + m[1]) : 0;
}

function el_(tag, props, filhos) {
  const e = document.createElement(tag);
  Object.assign(e, props || {});
  (filhos || []).forEach(f => e.append(f));
  return e;
}

/** O que o usuário marcou/desmarcou, para não perder quando a lista se redesenha (storage mudou). */
const escolhas_ = {};

/** Tabela com caixa de marcar por OB (marcavel) e colunas extras de resultado. */
function tabela_(obs, opcoes) {
  if (!obs.length) return el_("p", { className: "vazio", textContent: opcoes.vazio });
  const cab = ["OB", "Data", "Valor", "Unidade", "NE", "Objeto"].concat(opcoes.colunasExtras || []);
  const thead = el_("thead", {}, [el_("tr", {}, [
    opcoes.marcavel ? el_("th", {}, [el_("input", { type: "checkbox", checked: !!opcoes.marcado, title: "Marcar todas", onchange: e => {
      e.target.closest("table").querySelectorAll("tbody input[type=checkbox]").forEach(c => { c.checked = e.target.checked; escolhas_[c.value] = c.checked; });
    } })]) : ""
  ].concat(cab.map(c => el_("th", { textContent: c }))).filter(x => x !== ""))]);
  const tbody = el_("tbody", {}, obs.map(o => {
    const linha = el_("tr");
    if (opcoes.marcavel) {
      linha.append(el_("td", {}, [o.estado === "anexando"
        ? el_("span", { className: "etiqueta andamento", textContent: "anexando…" })
        : el_("input", { type: "checkbox", checked: o.numero_ob in escolhas_ ? escolhas_[o.numero_ob] : !!opcoes.marcado, value: o.numero_ob,
          onchange: e => { escolhas_[o.numero_ob] = e.target.checked; } })]));
    }
    linha.append(
      el_("td", { textContent: o.numero_ob }),
      el_("td", { textContent: o.data || "" }),
      el_("td", { className: "valor", textContent: moeda_(o.valor) }),
      el_("td", { textContent: (o.unidade || "-") + (o.tipo_unidade ? " (" + o.tipo_unidade + ")" : "") }),
      el_("td", { textContent: o.ne || o.ne_mae || "" }),
      el_("td", { textContent: o.objeto || "" })
    );
    (opcoes.celulasExtras ? opcoes.celulasExtras(o) : []).forEach(c => linha.append(c));
    return linha;
  }));
  return el_("div", { className: "tabela" }, [el_("table", {}, [thead, tbody])]);
}

function marcadas_(idLista) {
  return Array.from($(idLista).querySelectorAll("tbody input[type=checkbox]:checked")).map(c => c.value);
}

function contagem_(id, n) {
  $(id).textContent = n ? "(" + n + ")" : "";
}

function textoSituacao_(estado, emAndamento) {
  if (emAndamento) return estado.progresso || "Buscando...";
  const ultima = "Última busca: " + quando_(estado.ultimaVerificacao) + ".";
  const adiada = estado.adiadaEm ? " A busca automática de " + quando_(estado.adiadaEm) + " esperou porque a tela de Ordem Bancária estava aberta no E-fisco." : "";
  switch (estado.situacao) {
    case "ok": return ultima + " " + (estado.mensagem || "") + adiada;
    case "sem_login": return "Entre no E-fisco neste navegador - a busca não conseguiu entrar. " + ultima;
    case "sem_app": return "Entre no app GAOCG neste navegador - a busca não conseguiu falar com o app. " + ultima;
    case "sem_tipos": return "Escolha no painel da extensão (ícone GAOCG) os tipos de unidade que você cuida.";
    case "erro": return "A última busca falhou: " + (estado.mensagem || "erro desconhecido") + " " + ultima;
    default: return "Ainda não houve busca." + adiada;
  }
}

async function desenhar_() {
  const d = await chrome.storage.local.get([CHAVE_OBS_, CHAVE_ESTADO_]);
  const obs = Object.values(d[CHAVE_OBS_] || {}).sort((a, b) => chaveData_(b.data) - chaveData_(a.data) || String(b.numero_ob).localeCompare(a.numero_ob));
  const estado = d[CHAVE_ESTADO_] || {};
  const ocupado = !!estado.emAndamento || obs.some(o => o.estado === "anexando");
  $("situacao").textContent = textoSituacao_(estado, !!estado.emAndamento);

  const novas = obs.filter(o => (o.estado === "nova" || o.estado === "anexando") && !o.linhaDeBase);
  const anteriores = obs.filter(o => (o.estado === "nova" || o.estado === "anexando") && o.linhaDeBase);
  const pendentes = obs.filter(o => o.estado === "pendente");
  const resolvidas = obs.filter(o => o.estado === "anexado" || o.estado === "ja_estava")
    .sort((a, b) => (b.atualizadaEm || 0) - (a.atualizadaEm || 0)).slice(0, 50);
  const dispensadas = obs.filter(o => o.estado === "dispensada");

  $("listaNovas").replaceChildren(tabela_(novas, { marcavel: true, marcado: true, vazio: "Nenhuma OB nova." }));
  $("listaPendentes").replaceChildren(tabela_(pendentes, {
    marcavel: true, marcado: false, vazio: "Nada pendente.", colunasExtras: ["Motivo"],
    celulasExtras: o => [el_("td", { className: "motivo", textContent: o.motivo || "" })]
  }));
  $("listaAnteriores").replaceChildren(tabela_(anteriores, { marcavel: true, marcado: false, vazio: "Nenhuma." }));
  $("listaResolvidas").replaceChildren(tabela_(resolvidas, {
    vazio: "Nenhuma ainda.", colunasExtras: ["Recibo"],
    celulasExtras: o => [el_("td", { className: "ok", textContent: (o.estado === "ja_estava" ? "Já estava no recibo " : "Recibo ") + (o.recibo_id || "") + (o.recibo_descricao ? " - " + o.recibo_descricao : "") })]
  }));
  $("listaDispensadas").replaceChildren(tabela_(dispensadas, { marcavel: true, marcado: false, vazio: "Nenhuma." }));

  contagem_("qtdNovas", novas.length);
  contagem_("qtdPendentes", pendentes.length);
  contagem_("qtdAnteriores", anteriores.length);
  contagem_("qtdResolvidas", resolvidas.length);
  contagem_("qtdDispensadas", dispensadas.length);
  $("secPendentes").hidden = !pendentes.length;
  ["btnBuscar", "btnAnexarNovas", "btnAnexarPendentes", "btnAnexarAnteriores"].forEach(id => { $(id).disabled = ocupado; });
}

let acaoAConfirmar_ = null;

/** Caixa de aviso no topo: com `acao`, pergunta (Continuar/Cancelar); sem, só informa (Fechar). */
function mostrarCaixa_(texto, acao, sucesso) {
  acaoAConfirmar_ = acao || null;
  $("confirmacaoTexto").textContent = texto;
  $("btnConfirmar").hidden = !acao;
  $("btnCancelarConfirmacao").textContent = acao ? "Cancelar" : "Fechar";
  $("confirmacao").style.background = sucesso ? "#e3f5e8" : "";
  $("confirmacao").hidden = false;
  $("confirmacao").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

$("btnConfirmar").addEventListener("click", () => {
  const acao = acaoAConfirmar_;
  acaoAConfirmar_ = null;
  $("confirmacao").hidden = true;
  if (acao) acao();
});
$("btnCancelarConfirmacao").addEventListener("click", () => { acaoAConfirmar_ = null; $("confirmacao").hidden = true; });

async function enviar_(mensagem) {
  try {
    return await chrome.runtime.sendMessage(mensagem) || { ok: false, erro: "A extensão não respondeu." };
  } catch (e) {
    return { ok: false, erro: String(e && e.message ? e.message : e) };
  }
}

async function anexar_(numeros, confirmado) {
  if (!numeros.length) { mostrarCaixa_("Marque ao menos uma OB."); return; }
  const r = await enviar_({ type: "EFISCO_ANEXAR", numeros: numeros, confirmado: !!confirmado });
  if (r.precisaConfirmar) { mostrarCaixa_(r.erro, () => anexar_(numeros, true)); return; }
  if (!r.ok) { mostrarCaixa_(r.erro); return; }
  const anexadas = r.resultados.filter(x => x.estado === "anexado").length;
  const jaEstavam = r.resultados.filter(x => x.estado === "ja_estava").length;
  const pendentes = r.resultados.filter(x => x.estado === "pendente").length;
  mostrarCaixa_([anexadas ? anexadas + " anexada(s) no app" : "", jaEstavam ? jaEstavam + " já estava(m) no app" : "",
    pendentes ? pendentes + " não deu para anexar (veja o motivo em \"Não deu para anexar\")" : ""].filter(Boolean).join(", ") + ".", null, !pendentes);
}

async function buscar_(confirmado) {
  const r = await enviar_({ type: "EFISCO_VERIFICAR", confirmado: !!confirmado });
  if (r.precisaConfirmar) { mostrarCaixa_(r.erro, () => buscar_(true)); return; }
  if (!r.ok) mostrarCaixa_(r.erro);
}

$("btnBuscar").addEventListener("click", () => buscar_(false));
$("btnAnexarNovas").addEventListener("click", () => anexar_(marcadas_("listaNovas")));
$("btnAnexarPendentes").addEventListener("click", () => anexar_(marcadas_("listaPendentes")));
$("btnAnexarAnteriores").addEventListener("click", () => anexar_(marcadas_("listaAnteriores")));
$("btnDispensarNovas").addEventListener("click", () => enviar_({ type: "EFISCO_DISPENSAR", numeros: marcadas_("listaNovas") }));
$("btnDispensarPendentes").addEventListener("click", () => enviar_({ type: "EFISCO_DISPENSAR", numeros: marcadas_("listaPendentes") }));
$("btnDispensarAnteriores").addEventListener("click", () => enviar_({ type: "EFISCO_DISPENSAR", numeros: marcadas_("listaAnteriores") }));
$("btnRestaurar").addEventListener("click", () => enviar_({ type: "EFISCO_DISPENSAR", numeros: marcadas_("listaDispensadas"), restaurar: true }));

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "local" && (mudancas[CHAVE_OBS_] || mudancas[CHAVE_ESTADO_])) desenhar_();
});
desenhar_();
