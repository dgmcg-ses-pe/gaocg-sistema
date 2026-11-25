/**
 * Painel da extensão (clique no ícone) - 2026-10-15, pedido do usuário: um
 * botão para cada função que o GAOCG acrescenta à tela do processo no SEI -
 * anexação de arquivos e cartão de anotação -, deixando, com as duas
 * desligadas, só o envio de SOF. Tipo e nível dos anexos também ficam aqui.
 * As preferências ficam em chrome.storage.local (mesmas chaves lidas pelo
 * content-sei.js), e o content script reage pelo storage.onChanged - abas do
 * SEI já abertas mudam na hora, sem recarregar.
 */
const CHAVE_FERRAMENTAS_SEI_ = "ferramentasSeiAtivas";
const CHAVE_ANOTACAO_SEI_ = "anotacaoSeiAtiva";
const CHAVE_ACOMPANHAMENTO_SEI_ = "acompanhamentoSeiAtivo";
const CHAVE_RECIBO_SEI_ = "reciboSeiAtivo";
const CHAVE_ATRIBUIR_SEI_ = "atribuirSeiAtivo";
const CHAVE_ANEXO_TIPO_ = "anexoTipoDocumento";
const CHAVE_ANEXO_NIVEL_ = "anexoNivelAcesso";
const CHAVE_ANEXO_TIPO_PELO_NOME_ = "anexoTipoPeloNome";

document.getElementById("versao").textContent = "Versão " + chrome.runtime.getManifest().version;

function ligarBotao_(chave, idStatus, idBotao, valorInicial) {
  const statusEl = document.getElementById(idStatus);
  const botao = document.getElementById(idBotao);

  function mostrar(ativo) {
    statusEl.textContent = ativo ? "Ativado" : "Desativado";
    statusEl.className = "status " + (ativo ? "ativo" : "inativo");
    botao.textContent = ativo ? "Desativar" : "Ativar";
    botao.className = ativo ? "desativar" : "ativar";
    botao.dataset.ativo = ativo ? "1" : "0";
    botao.disabled = false;
  }

  mostrar(valorInicial);
  botao.addEventListener("click", async () => {
    const novo = botao.dataset.ativo !== "1";
    botao.disabled = true;
    await chrome.storage.local.set({ [chave]: novo });
    mostrar(novo);
  });
}

// Ausente = ativo (comportamento de antes destas opções existirem). A anotação
// sem chave própria herda a de anexos: na v0.49.0 um botão só desligava as duas
// janelas (mesma migração de lerPreferenciasFerramentas_, content-sei.js).
chrome.storage.local.get([CHAVE_FERRAMENTAS_SEI_, CHAVE_ANOTACAO_SEI_, CHAVE_ACOMPANHAMENTO_SEI_, CHAVE_RECIBO_SEI_, CHAVE_ATRIBUIR_SEI_, CHAVE_ANEXO_TIPO_, CHAVE_ANEXO_NIVEL_, CHAVE_ANEXO_TIPO_PELO_NOME_]).then(dados => {
  const anexos = dados[CHAVE_FERRAMENTAS_SEI_] !== false;
  const anotacao = (CHAVE_ANOTACAO_SEI_ in dados) ? dados[CHAVE_ANOTACAO_SEI_] !== false : anexos;
  ligarBotao_(CHAVE_FERRAMENTAS_SEI_, "statusFerramentas", "btnFerramentas", anexos);
  ligarBotao_(CHAVE_ANOTACAO_SEI_, "statusAnotacao", "btnAnotacao", anotacao);
  ligarBotao_(CHAVE_ACOMPANHAMENTO_SEI_, "statusAcompanhamento", "btnAcompanhamento", dados[CHAVE_ACOMPANHAMENTO_SEI_] !== false);
  ligarBotao_(CHAVE_RECIBO_SEI_, "statusReciboSei", "btnReciboSei", dados[CHAVE_RECIBO_SEI_] !== false);
  ligarBotao_(CHAVE_ATRIBUIR_SEI_, "statusAtribuir", "btnAtribuir", dados[CHAVE_ATRIBUIR_SEI_] !== false);

  const tipo = document.getElementById("anexoTipo");
  const nivel = document.getElementById("anexoNivel");
  tipo.value = dados[CHAVE_ANEXO_TIPO_] || "Anexo";
  nivel.value = dados[CHAVE_ANEXO_NIVEL_] || "publico";
  const tipoPeloNome = document.getElementById("anexoTipoPeloNome");
  tipoPeloNome.checked = dados[CHAVE_ANEXO_TIPO_PELO_NOME_] !== false;
  tipoPeloNome.addEventListener("change", () => {
    chrome.storage.local.set({ [CHAVE_ANEXO_TIPO_PELO_NOME_]: tipoPeloNome.checked });
  });
  tipo.addEventListener("input", () => {
    chrome.storage.local.set({ [CHAVE_ANEXO_TIPO_]: tipo.value.trim() || "Anexo" });
  });
  nivel.addEventListener("change", () => {
    chrome.storage.local.set({ [CHAVE_ANEXO_NIVEL_]: nivel.value });
  });
});

/**
 * Ordens Bancárias do E-fisco (2026-11-19, pedido do usuário): liga/desliga a busca
 * automática, os tipos de unidade que o usuário cuida (no setor GAOCG a divisão é
 * Hospitais / UPAs / UPAEs + Carretas) e o intervalo. Quem busca é o background.js.
 */
const CHAVE_EFISCO_CONFIG_ = "efiscoConfig";
const CHAVE_EFISCO_ESTADO_ = "efiscoEstado";
const CHAVE_EFISCO_OBS_ = "efiscoObs";
const CONFIG_EFISCO_PADRAO_ = { ativo: true, grupos: [], intervaloMin: 30 };

async function lerConfigEfisco_() {
  const d = await chrome.storage.local.get(CHAVE_EFISCO_CONFIG_);
  return Object.assign({}, CONFIG_EFISCO_PADRAO_, d[CHAVE_EFISCO_CONFIG_] || {});
}

async function salvarConfigEfisco_(parcial) {
  const atual = await lerConfigEfisco_();
  await chrome.storage.local.set({ [CHAVE_EFISCO_CONFIG_]: Object.assign(atual, parcial) });
}

function quandoEfisco_(ms) {
  return ms ? new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
}

async function mostrarEfisco_() {
  const config = await lerConfigEfisco_();
  const d = await chrome.storage.local.get([CHAVE_EFISCO_ESTADO_, CHAVE_EFISCO_OBS_]);
  const estado = d[CHAVE_EFISCO_ESTADO_] || {};
  const novas = Object.values(d[CHAVE_EFISCO_OBS_] || {}).filter(o => o.estado === "nova" && !o.linhaDeBase).length;

  const status = document.getElementById("statusEfisco");
  const botao = document.getElementById("btnEfisco");
  status.textContent = config.ativo ? "Busca automática ligada" : "Busca automática desligada";
  status.className = "status " + (config.ativo ? "ativo" : "inativo");
  botao.textContent = config.ativo ? "Desativar" : "Ativar";
  botao.className = config.ativo ? "desativar" : "ativar";
  botao.disabled = false;

  document.querySelectorAll("#gruposEfisco input").forEach(c => { c.checked = (config.grupos || []).indexOf(c.value) !== -1; });
  document.getElementById("intervaloEfisco").value = String(config.intervaloMin);

  const situacao = document.getElementById("situacaoEfisco");
  const alerta = ["sem_login", "sem_app", "sem_tipos", "erro"].indexOf(estado.situacao) !== -1;
  let texto;
  if (estado.emAndamento) texto = estado.progresso || "Buscando...";
  else if (!(config.grupos || []).length) texto = "Marque acima os tipos de unidade que você cuida.";
  else if (estado.situacao === "sem_login") texto = "Entre no E-fisco neste navegador.";
  else if (estado.situacao === "sem_app") texto = "Entre no app GAOCG neste navegador.";
  else if (estado.situacao === "erro") texto = "A última busca falhou: " + (estado.mensagem || "");
  else if (estado.ultimaVerificacao) texto = "Última busca: " + quandoEfisco_(estado.ultimaVerificacao) + ". " + (estado.mensagem || "");
  else texto = "Ainda não houve busca.";
  situacao.textContent = texto;
  situacao.className = "situacao-efisco" + (alerta && !estado.emAndamento ? " alerta" : "");

  document.getElementById("btnBuscarEfisco").disabled = !!estado.emAndamento;
  document.getElementById("btnVerEfisco").textContent = novas ? "Ver OBs (" + novas + " nova" + (novas > 1 ? "s" : "") + ")" : "Ver OBs";
}

document.getElementById("btnEfisco").addEventListener("click", async () => {
  const config = await lerConfigEfisco_();
  await salvarConfigEfisco_({ ativo: !config.ativo });
});

document.querySelectorAll("#gruposEfisco input").forEach(c => c.addEventListener("change", () => {
  const grupos = Array.from(document.querySelectorAll("#gruposEfisco input:checked")).map(x => x.value);
  salvarConfigEfisco_({ grupos: grupos });
}));

document.getElementById("intervaloEfisco").addEventListener("change", e => {
  salvarConfigEfisco_({ intervaloMin: Number(e.target.value) });
});

async function buscarEfisco_() {
  try { await chrome.runtime.sendMessage({ type: "EFISCO_VERIFICAR" }); } catch (e) { /* a situação aparece pelo storage */ }
}

document.getElementById("btnBuscarEfisco").addEventListener("click", buscarEfisco_);
document.getElementById("btnVerEfisco").addEventListener("click", () => chrome.runtime.sendMessage({ type: "EFISCO_ABRIR_LISTA" }));

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "local" && (mudancas[CHAVE_EFISCO_CONFIG_] || mudancas[CHAVE_EFISCO_ESTADO_] || mudancas[CHAVE_EFISCO_OBS_])) mostrarEfisco_();
});
mostrarEfisco_();
