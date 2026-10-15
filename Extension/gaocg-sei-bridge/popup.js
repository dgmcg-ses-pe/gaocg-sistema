/**
 * Painel da extensão (clique no ícone) - 2026-10-15, pedido do usuário: um
 * botão para cada janela que o GAOCG desenha na tela do processo no SEI -
 * "Envio em lote" (anexação de arquivos) e "Anotação do processo" -, deixando,
 * com as duas desligadas, só o envio de SOF. As preferências ficam em
 * chrome.storage.local (mesmas chaves lidas pelo content-sei.js), e o content
 * script reage pelo storage.onChanged - abas do SEI já abertas mudam na hora,
 * sem recarregar.
 */
const CHAVE_FERRAMENTAS_SEI_ = "ferramentasSeiAtivas";
const CHAVE_ANOTACAO_SEI_ = "anotacaoSeiAtiva";

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
chrome.storage.local.get([CHAVE_FERRAMENTAS_SEI_, CHAVE_ANOTACAO_SEI_]).then(dados => {
  const anexos = dados[CHAVE_FERRAMENTAS_SEI_] !== false;
  const anotacao = (CHAVE_ANOTACAO_SEI_ in dados) ? dados[CHAVE_ANOTACAO_SEI_] !== false : anexos;
  ligarBotao_(CHAVE_FERRAMENTAS_SEI_, "statusFerramentas", "btnFerramentas", anexos);
  ligarBotao_(CHAVE_ANOTACAO_SEI_, "statusAnotacao", "btnAnotacao", anotacao);
});
