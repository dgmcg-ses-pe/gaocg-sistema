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
chrome.storage.local.get([CHAVE_FERRAMENTAS_SEI_, CHAVE_ANOTACAO_SEI_, CHAVE_ACOMPANHAMENTO_SEI_, CHAVE_ANEXO_TIPO_, CHAVE_ANEXO_NIVEL_, CHAVE_ANEXO_TIPO_PELO_NOME_]).then(dados => {
  const anexos = dados[CHAVE_FERRAMENTAS_SEI_] !== false;
  const anotacao = (CHAVE_ANOTACAO_SEI_ in dados) ? dados[CHAVE_ANOTACAO_SEI_] !== false : anexos;
  ligarBotao_(CHAVE_FERRAMENTAS_SEI_, "statusFerramentas", "btnFerramentas", anexos);
  ligarBotao_(CHAVE_ANOTACAO_SEI_, "statusAnotacao", "btnAnotacao", anotacao);
  ligarBotao_(CHAVE_ACOMPANHAMENTO_SEI_, "statusAcompanhamento", "btnAcompanhamento", dados[CHAVE_ACOMPANHAMENTO_SEI_] !== false);

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
