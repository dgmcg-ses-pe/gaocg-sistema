/**
 * GAOCG App - Cache-first com revalidação por versão, para trocar de aba
 * parecer instantâneo depois da primeira carga.
 *
 * Cada recurso (sof, recibos, notasEmpenho, unidades, logAuditoria, listas,
 * usuarios, dashboard) tem um contador de versão no backend (Versoes.gs),
 * incrementado a cada escrita. Ao voltar pra uma aba já visitada nesta
 * sessão, mostra o último snapshot na hora e confere em paralelo se a versão
 * mudou (inclusive por outro usuário); só refaz a chamada pesada se mudou.
 *
 * Nome escolhido para não colidir com o Map interno privado `cache` de
 * js/api.js - são dois caches diferentes (referência/dropdowns vs. payload
 * principal das abas).
 *
 * Desde 2026-08-31 (pedido do usuário: SOF/Notas de Empenho/Recibos/
 * Unidades "já carregadas" ao entrar no app) o 1º aquecimento de cada
 * recurso não depende mais do usuário visitar a aba - TelaX.preCarregar()
 * (chamada em App.mostrarApp) já faz esse "cold path" em segundo plano,
 * então normalmente já existe snapshot pronto antes mesmo da 1ª visita.
 */
const CacheAbas = (function () {
  const snapshots = new Map(); // 'recurso:paramsJson' -> { versao, dados }
  let emVoo = null; // dedup de chamadas concorrentes a getVersoes

  function chave(recurso, params) {
    return recurso + ':' + JSON.stringify(params || {});
  }

  function obterVersoes() {
    if (!emVoo) {
      emVoo = Api.chamar('getVersoes', {}, { silencioso: true })
        .catch(() => ({}))
        .finally(() => { emVoo = null; });
    }
    return emVoo;
  }

  /**
   * carregarFn: (opcoes) => Promise<dados>  (a mesma chamada Api.chamar que já existia em
   *   carregar(), agora repassando `opcoes` adiante - ver abaixo)
   * aoRevalidar: (dados) => void            (reaplica dados + re-renderiza; só chamado se algo mudou)
   *
   * A revalidação em segundo plano roda com { silencioso: true }, a primeira
   * carga não. Corrigido na varredura de 2026-08-07: as duas usavam a mesma
   * chamada sem opções, então a conferência "em segundo plano" acendia o
   * spinner global bloqueante (UI.mostrarCarregando, js/api.js) e travava a
   * tela inteira - exatamente o que este cache existe pra evitar. O usuário
   * via o snapshot instantâneo e, meio segundo depois, a tela congelava do
   * mesmo jeito.
   *
   * Quem passar um carregarFn que ignora o argumento continua funcionando
   * como antes (só mantém o spinner) - a mudança degrada, nunca quebra.
   */
  async function comRevalidacao(recurso, params, carregarFn, aoRevalidar) {
    const k = chave(recurso, params);
    const snap = snapshots.get(k);

    if (snap) {
      obterVersoes().then(async (versoes) => {
        if (versoes[recurso] !== snap.versao) {
          const dados = await carregarFn({ silencioso: true });
          snapshots.set(k, { versao: versoes[recurso], dados });
          aoRevalidar(dados);
        }
      });
      return snap.dados; // mostra na hora, sem esperar rede
    }

    const [dados, versoes] = await Promise.all([carregarFn(), obterVersoes()]);
    snapshots.set(k, { versao: versoes[recurso], dados });
    return dados;
  }

  /** Chamar logo após uma escrita bem-sucedida do próprio usuário, pra refletir na hora (sem esperar getVersoes). */
  function invalidar(recurso) {
    Array.from(snapshots.keys()).forEach(k => {
      if (k.indexOf(recurso + ':') === 0) snapshots.delete(k);
    });
  }

  /**
   * O recurso mudou no servidor desde o último snapshot guardado? Uma chamada barata
   * (getVersoes) - usada ao voltar para a aba do app (2026-11-11), pra só recarregar
   * a lista quando alguém mexeu nela por fora. Sem snapshot, responde que mudou.
   */
  async function versaoMudou(recurso) {
    const guardados = Array.from(snapshots.entries()).filter(([k]) => k.indexOf(recurso + ':') === 0);
    if (!guardados.length) return true;
    const versoes = await obterVersoes();
    return guardados.some(([, snap]) => versoes[recurso] !== snap.versao);
  }

  return { comRevalidacao, invalidar, versaoMudou };
})();
