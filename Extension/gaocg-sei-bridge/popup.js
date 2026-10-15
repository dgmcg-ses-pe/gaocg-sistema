/**
 * Painel da extensão (clique no ícone) - 2026-10-15, pedido do usuário: um
 * botão que liga/desliga as janelas de anexação de arquivos (Envio em lote) e
 * de anotação que o GAOCG desenha na tela do processo no SEI, deixando só o
 * envio de SOF. A preferência fica em chrome.storage.local (mesma chave lida
 * pelo content-sei.js, CHAVE_FERRAMENTAS_SEI_), e o content script reage pelo
 * storage.onChanged - abas do SEI já abertas mudam na hora, sem recarregar.
 */
const CHAVE_FERRAMENTAS_SEI_ = "ferramentasSeiAtivas";

const statusEl = document.getElementById("statusFerramentas");
const botao = document.getElementById("btnFerramentas");

document.getElementById("versao").textContent = "Versão " + chrome.runtime.getManifest().version;

function mostrar_(ativas) {
  statusEl.textContent = ativas ? "Ativado" : "Desativado";
  statusEl.className = "status " + (ativas ? "ativo" : "inativo");
  botao.textContent = ativas ? "Desativar" : "Ativar";
  botao.className = ativas ? "desativar" : "ativar";
  botao.dataset.ativas = ativas ? "1" : "0";
  botao.disabled = false;
}

// Ausente = ativo (comportamento de antes desta opção existir).
chrome.storage.local.get(CHAVE_FERRAMENTAS_SEI_).then(dados => {
  mostrar_(dados[CHAVE_FERRAMENTAS_SEI_] !== false);
});

botao.addEventListener("click", async () => {
  const novo = botao.dataset.ativas !== "1";
  botao.disabled = true;
  await chrome.storage.local.set({ [CHAVE_FERRAMENTAS_SEI_]: novo });
  mostrar_(novo);
});
