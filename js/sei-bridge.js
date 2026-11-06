/**
 * GAOCG App - Ponte com a extensão "GAOCG SEI Bridge" (Extension/gaocg-sei-bridge).
 *
 * Envia um documento gerado aqui (hoje: a SOF) para um processo JÁ ABERTO numa
 * aba do SEI, preenchendo o formulário nativo de "Incluir Documento". Não há
 * servidor no meio nem API do SEI: a extensão automatiza o DOM sobre a sessão
 * do próprio usuário, então só funciona com o SEI aberto e logado no mesmo
 * navegador.
 *
 * Pré-requisitos (se algum faltar, o usuário recebe uma mensagem dizendo qual):
 *   1. Chrome/Edge com a extensão instalada em modo desenvolvedor;
 *   2. o ID da extensão configurado aqui (ver ID_PADRAO_/idExtensao abaixo);
 *   3. uma aba aberta em sei.pe.gov.br com o processo carregado.
 */

const SeiBridge = (function () {
  /**
   * ID da extensão - FIXO desde a sessão 2026-08-13 (ver "key" em
   * Extension/gaocg-sei-bridge/manifest.json). Antes disso, uma extensão sem
   * compactação tinha o ID derivado do CAMINHO da pasta no disco - mover,
   * renomear ou copiar a pasta pra outra máquina mudava o ID e quebrava a
   * ponte com "Could not establish connection. Receiving end does not exist."
   * (aconteceu de novo com o usuário testando num 2º computador, depois de
   * mover a pasta extraída mais de uma vez). O par de chaves foi gerado com
   * `openssl genrsa`/`openssl rsa -pubout`, e o ID abaixo é derivado
   * matematicamente da chave pública (SHA-256 dela, primeiros 16 bytes,
   * mapeados pro alfabeto a-p que o Chrome usa) - a MESMA chave em
   * manifest.json em qualquer pasta/computador sempre gera este mesmo ID.
   *
   * Se um dia a chave do manifest.json for trocada de novo (não deveria - é
   * exatamente o que este ajuste elimina), o valor pode ser sobrescrito em
   * runtime pelo localStorage, sem precisar de deploy:
   *
   *     localStorage.setItem('gaocg_sei_extension_id', 'novo-id-aqui');
   */
  const ID_PADRAO_ = 'gmhefdeokoolgcpfohhkomgljndffnpi';
  const CHAVE_ID_LOCAL_ = 'gaocg_sei_extension_id';

  function idExtensao() {
    let salvo = '';
    try { salvo = localStorage.getItem(CHAVE_ID_LOCAL_) || ''; } catch (e) { salvo = ''; }
    return (salvo || ID_PADRAO_).trim();
  }

  function extensaoDisponivel() {
    return !!(window.chrome && window.chrome.runtime && window.chrome.runtime.sendMessage);
  }

  /**
   * Avisa a extensão da sessão atual (null ao sair). Silencioso: sem a extensão
   * instalada, o app segue igual, e ninguém está esperando por isto na tela.
   */
  function compartilharSessao(token) {
    if (!extensaoDisponivel()) return;
    try {
      chrome.runtime.sendMessage(idExtensao(), { type: 'SESSAO_GAOCG', token: token || null }, () => {
        void chrome.runtime.lastError; // sem isso o Chrome loga "Unchecked runtime.lastError"
      });
    } catch (e) { /* extensão indisponível */ }
  }

  /**
   * chrome.runtime.sendMessage é baseado em callback e sinaliza falha por
   * chrome.runtime.lastError (que PRECISA ser lido, senão o Chrome loga
   * "Unchecked runtime.lastError" no console). Aqui vira Promise, com um
   * timeout próprio: se a extensão não existir, em alguns casos o callback
   * simplesmente nunca é chamado.
   */
  function enviarMensagem_(mensagem, timeoutMs) {
    return new Promise((resolve, reject) => {
      let concluido = false;
      const temporizador = setTimeout(() => {
        if (concluido) return;
        concluido = true;
        reject(new Error('A extensão não respondeu. Verifique se ela está instalada e ativa em chrome://extensions.'));
      }, timeoutMs || 30000);

      try {
        chrome.runtime.sendMessage(idExtensao(), mensagem, (resposta) => {
          if (concluido) return;
          concluido = true;
          clearTimeout(temporizador);
          const erro = chrome.runtime.lastError;
          if (erro) {
            reject(new Error(
              'Não foi possível falar com a extensão GAOCG SEI Bridge (' + erro.message + '). ' +
              'Confira se ela está instalada e se o ID configurado está correto.'
            ));
            return;
          }
          resolve(resposta || {});
        });
      } catch (e) {
        if (concluido) return;
        concluido = true;
        clearTimeout(temporizador);
        reject(e);
      }
    });
  }

  /**
   * O documento da SOF é gerado por montarDocumentoSeiHtml_ (js/sof.js) como um
   * HTML completo (<html>/<head><style>/<body>), próprio para baixar ou
   * imprimir. O editor do SEI (CKEditor) recebe só o CONTEÚDO do corpo e
   * descarta <style>, então aqui o documento é convertido: pega o body e
   * transforma as regras da folha de estilo em atributos style inline, que
   * sobrevivem à colagem no editor.
   *
   * Sem isso, o documento chegaria no SEI sem nenhuma borda de tabela - é o
   * grosso do layout da SOF (cronograma de desembolso, assinaturas).
   *
   * ATENÇÃO - duplicação manual: as regras abaixo são uma CÓPIA das do
   * <style> de montarDocumentoSeiHtml_ (js/sof.js), não uma leitura
   * automática dele - as duas listas podem ficar dessincronizadas se só um
   * dos dois arquivos for atualizado (foi exatamente o que aconteceu em
   * 2026-08-13: o título passou a sair alinhado à esquerda no download/
   * impressão, mas continuou centralizado no envio ao SEI, porque só o
   * <style> de sof.js tinha sido corrigido). Toda vez que o <style> de
   * montarDocumentoSeiHtml_ mudar, revise esta função também.
   */
  function prepararHtmlParaEditor_(htmlCompleto) {
    const doc = new DOMParser().parseFromString(htmlCompleto, 'text/html');
    const corpo = doc.body;
    if (!corpo) return htmlCompleto;

    const aplicar = (seletor, estilo) => {
      corpo.querySelectorAll(seletor).forEach(el => {
        el.setAttribute('style', ((el.getAttribute('style') || '') + ';' + estilo).replace(/^;/, ''));
      });
    };

    // A ordem importa: cada regra é somada ao fim do style, então as classes
    // específicas ficam depois das regras gerais para prevalecer sobre elas.
    aplicar('table.sei-tabela', 'border-collapse:collapse;width:900px;margin:8px 0');
    aplicar('table.sei-tabela td, table.sei-tabela th', 'border:1px solid #000;padding:4px 8px;font-size:11pt;vertical-align:top');
    aplicar('table.sei-tabela th', 'text-align:center;vertical-align:middle;background:#fff');
    aplicar('p', 'margin:6pt 0;text-align:justify');
    aplicar('.sei-titulo', 'font-size:11pt;text-align:left');
    aplicar('.sei-direita', 'text-align:right;font-size:11pt');
    aplicar('.sei-centro', 'text-align:center');
    aplicar('.sei-meio', 'vertical-align:middle');
    aplicar('th.sei-mes', 'font-weight:normal');
    aplicar('table.sei-pca', 'margin:8px auto');
    aplicar('td.sei-pca-celula', "font-family:'Times New Roman', Times, serif;font-size:12pt;font-weight:bold");

    // border="1" como reforço: se o SEI higienizar os atributos style, as
    // tabelas ainda saem com borda em vez de virar texto corrido.
    corpo.querySelectorAll('table.sei-tabela').forEach(t => t.setAttribute('border', '1'));

    // A fonte/tamanho/cor do body (ver <style> de montarDocumentoSeiHtml_)
    // nunca tinha um elemento próprio pra virar style inline - innerHTML não
    // inclui a tag <body> em si, só o conteúdo dela. Sem isso, o texto
    // colado no CKEditor herdava a fonte padrão do editor do SEI (Times New
    // Roman), não a Calibri do documento gerado (achado do usuário,
    // 2026-08-13). Um <div> envolvendo tudo resolve: filhos herdam
    // font-family/font-size/color por CSS normal, e as células de tabela
    // continuam com o próprio font-size (11pt) por cima, como já era.
    const envoltorio = doc.createElement('div');
    envoltorio.setAttribute('style', 'font-family:Calibri, Arial, sans-serif;font-size:12pt;color:#000');
    while (corpo.firstChild) envoltorio.appendChild(corpo.firstChild);
    return envoltorio.outerHTML;
  }

  /**
   * Padrões do documento de SOF no SEI da SES-PE. Ficam AQUI, e não na
   * extensão, porque são decisão de negócio (o que a GAOCG usa), não detalhe
   * técnico de automação - e assim mudam sem precisar reinstalar a extensão em
   * cada máquina.
   */
  const PADRAO_DOCUMENTO_SOF_ = {
    // Rótulo exato do tipo na tela "Escolha o Tipo do Documento" do SEI.
    //
    // excluir (sessão 2026-09-03, pedido do usuário): o SEI tem um 2º tipo,
    // "SES e-SOF - Sol Orçamentária e Financeira Eletrônica", que também
    // contém a substring "SOF" - o rótulo genérico "SOF" acima (fallback pra
    // unidade sem o tipo completo cadastrado) casava com os dois, e a
    // extensão ficava com o ÚLTIMO item que bate (a e-SOF, que aparece
    // depois na lista do SEI). A extensão (Extension/gaocg-sei-bridge/
    // content-sei.js) já tem essa mesma exclusão embutida como fallback -
    // repetida aqui de propósito, e não só lá, porque quem decide QUAL tipo
    // de documento a GAOCG usa é essa configuração do app (comentário acima:
    // "decisão de negócio, não detalhe técnico de automação"), que atualiza
    // sem precisar reinstalar a extensão em cada máquina.
    tipoConfig: {
      filtro: 'SOF',
      rotulos: ['SES - SOF - Solicitação Orçamentária e Financeira', 'SOF - Solicitação Orçamentária e Financeira', 'SOF'],
      excluir: ['e-SOF', 'eletrônica', 'eletronica']
    },
    // "Nenhum" faz o editor abrir VAZIO - o conteúdo da SOF entra sozinho, sem
    // a barra de confirmação (que só existe pra não sobrescrever o modelo do SEI).
    textoInicial: 'Nenhum',
    nivelAcesso: 'restrito',
    hipoteseLegal: 'Controle Interno'
  };

  /**
   * Envia a SOF para o SEI. `htmlCompleto` é o retorno de
   * montarDocumentoSeiHtml_ (js/sof.js) - reaproveitado exatamente como está,
   * pra o que vai ao SEI ser o MESMO documento que o botão "Salvar e gerar
   * documento SEI" baixa.
   *
   * autoEnviar: true (decisão do usuário, sessão 2026-08-10) - a extensão
   * também clica em "Salvar" e deixa o editor aberto. O documento é apenas
   * CRIADO, nunca assinado: continua removível pelo próprio SEI se algo sair
   * errado. A assinatura permanece 100% manual.
   */
  async function enviarSof(sof, htmlCompleto) {
    if (!extensaoDisponivel()) {
      UI.toast('Extensão GAOCG SEI Bridge não encontrada. Instale-a no Chrome/Edge para enviar direto ao SEI.', 'erro');
      return false;
    }
    if (!sof.sei) {
      UI.toast('Esta SOF não tem o número do processo SEI preenchido - não dá pra saber para qual processo enviar.', 'erro');
      return false;
    }

    try {
      const resposta = await enviarMensagem_({
        type: 'ENVIAR_DOCUMENTO',
        numeroProcesso: sof.sei,
        documento: Object.assign({}, PADRAO_DOCUMENTO_SOF_, {
          tipo: 'sof',
          numero: sof.sof_numero ? ('SOF ' + sof.sof_numero) : String(sof.id || ''),
          descricaoEspecificacao: sof.objeto || '',
          observacoes: sof.observacao || '',
          conteudoHtml: prepararHtmlParaEditor_(htmlCompleto),
          // O SEI numera cada nova SOF sozinho (ex.: "173/2026") e entrega o
          // modelo já com esse número - que só existe no momento da criação,
          // então o app não tem como saber antes. A extensão lê o número do
          // modelo e troca ESTE valor por ele no documento, para o que fica no
          // processo sair com a numeração oficial do SEI.
          marcadorNumeroSof: sof.sof_numero || '',
          autoEnviar: true
        })
      });

      if (!resposta.ok) {
        // Processo não aberto NÃO é erro quando a extensão já agendou o envio:
        // ela abre a pesquisa e cria o documento sozinha assim que o analista
        // abrir o processo certo. Mostrar isso como falha vermelha faria o
        // analista achar que precisa refazer alguma coisa.
        UI.toast(
          'SEI: ' + (resposta.erro || 'erro desconhecido ao preencher o documento.'),
          resposta.envioAgendado ? 'info' : 'erro'
        );
        return !!resposta.envioAgendado;
      }

      // O envio tem duas etapas independentes (ver content-sei.js): o cadastro
      // (best-effort) e o conteúdo, que só entra quando o editor do SEI abrir -
      // depois de "Confirmar Dados". A mensagem precisa deixar claro que o
      // trabalho NÃO acabou quando este toast aparece, senão o analista confirma
      // o documento e acha que o conteúdo já foi (foi assim que o primeiro teste
      // real gerou um documento vazio).
      if (!resposta.conteudoAgendado) {
        UI.toast('SEI: não consegui preparar o conteúdo do documento. Use "Salvar e gerar documento SEI" e cole manualmente.', 'erro');
        return false;
      }
      if (resposta.aviso) {
        UI.toast('SEI: ' + resposta.aviso, 'info');
      }
      UI.toast(
        resposta.salvou
          ? 'Documento criado no SEI. O editor vai abrir com o conteúdo da SOF - revise e assine.'
          : (resposta.cadastroPreenchido
              ? 'Cadastro preenchido no SEI. Clique em "Salvar" - o conteúdo entra sozinho no editor.'
              : 'Continue o cadastro no SEI. Ao salvar, o conteúdo entra sozinho no editor.'),
        'sucesso'
      );
      return true;
    } catch (e) {
      UI.toast(e.message, 'erro');
      return false;
    }
  }

  /**
   * Pergunta à extensão se ela já capturou, na tela do SEI, o número que o
   * SEI gerou pra uma SOF enviada a este processo (sessão 2026-08-14, pedido
   * do usuário). Só uma consulta - não abre nem mexe em nenhuma aba do SEI;
   * a extensão responde com o que já tiver guardado (ver
   * guardarNumeroSofCapturado_/CONSULTAR_NUMERO_SOF em
   * Extension/gaocg-sei-bridge/content-sei.js e background.js).
   *
   * Devolve `{ ok: true, numero, capturadoEm }` quando encontra, ou
   * `{ ok: false, motivo }` quando não (extensão ausente, processo sem
   * envio, ou o envio ainda não chegou ao ponto de o SEI gerar o número -
   * nenhum desses casos é um erro de verdade, então não usa toast aqui:
   * quem chama decide como avisar o usuário).
   */
  async function consultarNumeroSof(numeroProcesso) {
    if (!extensaoDisponivel()) return { ok: false, motivo: 'extensao_ausente' };
    if (!numeroProcesso) return { ok: false, motivo: 'sem_processo' };
    try {
      const resposta = await enviarMensagem_({ type: 'CONSULTAR_NUMERO_SOF', numeroProcesso }, 8000);
      return resposta && resposta.ok ? { ok: true, numero: resposta.numero, capturadoEm: resposta.capturadoEm } : { ok: false, motivo: 'nao_encontrado' };
    } catch (e) {
      return { ok: false, motivo: 'erro', erro: e.message };
    }
  }

  return { enviarSof, extensaoDisponivel, consultarNumeroSof, prepararHtmlParaEditor_, compartilharSessao };
})();
