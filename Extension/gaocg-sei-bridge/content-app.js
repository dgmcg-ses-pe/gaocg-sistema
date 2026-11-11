/**
 * GAOCG SEI Bridge - ponte para as páginas do app GAOCG (2026-11-11, pedido do usuário).
 *
 * Quando a extensão anexa uma LE/OB num Recibo a partir do SEI (ReciboSei.gs), o
 * background.js avisa as abas do app abertas neste navegador por chrome.tabs.sendMessage.
 * A página do app não ouve mensagens da extensão diretamente, então este script repassa
 * o aviso por window.postMessage, e js/recibos.js recarrega só a lista de Recibos.
 *
 * Só repassa (nada de dados sensíveis vai junto: id e descrição do recibo, tipo e
 * número do documento) e só para a própria página, na mesma origem.
 */
chrome.runtime.onMessage.addListener((mensagem) => {
  if (!mensagem || mensagem.type !== "GAOCG_RECIBOS_ALTERADOS") return false;
  window.postMessage({
    origem: "gaocg-sei-bridge",
    tipo: "recibos-alterados",
    alteracoes: Array.isArray(mensagem.alteracoes) ? mensagem.alteracoes : []
  }, window.location.origin);
  return false;
});
