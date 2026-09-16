/**
 * GAOCG App - Bootstrap, roteamento entre telas e helpers de UI compartilhados
 * (toast, spinner, modal genérico). Vanilla JS, sem framework.
 */

const UI = (function () {
  function escaparHtml(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  /**
   * Anel de carregamento com porcentagem (sessão 2026-09-01, pedido do
   * usuário: "como eu sei que não travou?") - o Apps Script não expõe
   * progresso real de uma requisição em andamento, então isto é uma
   * ESTIMATIVA por tempo decorrido: sobe rápido no início e desacelera numa
   * curva (progressoEstimado_), se aproximando de ANEL_PROGRESSO_CAP_ sem
   * nunca chegar lá sozinho. Isso garante as duas coisas que o usuário
   * pediu ao mesmo tempo - o anel NUNCA fica parado (prova visual de que
   * não travou) e NUNCA promete "pronto" antes da hora - só
   * finalizarAnelCarregamento_ (chamado quando a resposta chega de
   * verdade) fecha os últimos %.
   */
  const CIRCUNFERENCIA_ANEL_ = 2 * Math.PI * 19; // raio do <circle> em index.html (viewBox 44x44, r=19)
  const ANEL_PROGRESSO_CAP_ = 92;
  const ANEL_PROGRESSO_TAU_S_ = 2.2; // maior = sobe mais devagar
  const ANEL_AVISO_LIMIAR_MS_ = 5000; // acima disso, mostra "Ainda carregando..."

  function progressoEstimado_(decorridoMs) {
    const decorridoS = decorridoMs / 1000;
    return ANEL_PROGRESSO_CAP_ * (1 - Math.exp(-decorridoS / ANEL_PROGRESSO_TAU_S_));
  }

  function aplicarProgressoAnel_(percentual) {
    const circulo = document.getElementById('anelCarregamentoProgresso');
    const texto = document.getElementById('anelCarregamentoTexto');
    if (circulo) circulo.style.strokeDashoffset = String(CIRCUNFERENCIA_ANEL_ * (1 - percentual / 100));
    if (texto) texto.textContent = Math.round(percentual) + '%';
  }

  let carregandoInicioMs_ = 0;
  let carregandoIntervalo_ = null;
  /**
   * Cada acesso a elemento aqui é blindado com "?." (opcional): se o HTML
   * servido estiver um passo atrás do JS num instante de propagação do
   * GitHub Pages (cada arquivo tem seu próprio cache, não são trocados
   * atomicamente juntos - achado real: um elemento faltando fazia
   * `.classList` estourar e abortar a função ANTES do setInterval, travando
   * o anel em 0% pro resto daquela sessão), o anel simplesmente não anima
   * (silencioso) em vez de quebrar o resto da função.
   */
  function iniciarAnelCarregamento_() {
    carregandoInicioMs_ = Date.now();
    aplicarProgressoAnel_(0);
    document.getElementById('carregandoAviso')?.classList.add('oculto');
    clearInterval(carregandoIntervalo_);
    carregandoIntervalo_ = setInterval(() => {
      const decorrido = Date.now() - carregandoInicioMs_;
      aplicarProgressoAnel_(progressoEstimado_(decorrido));
      if (decorrido > ANEL_AVISO_LIMIAR_MS_) document.getElementById('carregandoAviso')?.classList.remove('oculto');
    }, 100);
  }

  /** Fecha o anel em 100% antes de esconder a sobreposição (a transição CSS de .2s já deixa isso suave) - sem isso o "sumiço" aconteceria com o anel ainda incompleto, quebrando a promessa de nunca fechar antes da hora. */
  function finalizarAnelCarregamento_() {
    clearInterval(carregandoIntervalo_);
    carregandoIntervalo_ = null;
    aplicarProgressoAnel_(100);
  }

  /**
   * Contador em vez de toggle simples: se duas chamadas de Api.chamar
   * estiverem em voo ao mesmo tempo, a primeira que terminar não pode
   * esconder a sobreposição enquanto a outra ainda está em andamento - só a
   * PRIMEIRA (0->1) reinicia o anel, só a ÚLTIMA (->0) fecha e esconde.
   */
  let contadorCarregando = 0;
  function mostrarCarregando() {
    contadorCarregando++;
    if (contadorCarregando === 1) iniciarAnelCarregamento_();
    document.getElementById('sobreposicaoCarregando').classList.remove('oculto');
  }
  function esconderCarregando() {
    contadorCarregando = Math.max(0, contadorCarregando - 1);
    if (contadorCarregando === 0) {
      finalizarAnelCarregamento_();
      // Pequeno atraso pra dar tempo da transição do anel até 100% terminar
      // visualmente antes de sumir. Confere de novo dentro do timeout (não
      // só antes de agendar) porque uma nova chamada pode ter começado nesse
      // meio-tempo (contadorCarregando voltou a 1) - aí não é hora de
      // esconder nada.
      setTimeout(() => {
        if (contadorCarregando === 0) document.getElementById('sobreposicaoCarregando').classList.add('oculto');
      }, 200);
    }
  }

  function toast(mensagem, tipo) {
    tipo = tipo || 'info';
    const el = document.createElement('div');
    el.className = 'toast ' + tipo;
    el.textContent = mensagem;
    document.getElementById('containerToasts').appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  let callbackFecharModal = null;
  // modalAtivoEl: nó .modal atualmente exibido dentro de #sobreposicaoModal
  // (null quando nenhum modal está aberto). modalTituloAtivo_/modalSujo_
  // acompanham esse mesmo modal - ver minimizarModalAtivo_/restaurarModalMinimizado_
  // logo abaixo (sessão 2026-08-12, pedido do usuário - "minimizar" um card
  // editado em vez de descartar ao clicar fora).
  let modalAtivoEl = null;
  let modalTituloAtivo_ = '';
  let modalSujo_ = false;
  let contadorModalMinimizado_ = 0;
  const modaisMinimizados_ = []; // [{ id, elemento, titulo, callbackFechar }]

  /**
   * Monta o esqueleto de UM modal (título/corpo/rodapé) - antes disto era um
   * único <div id="modal"> fixo no index.html, reaproveitado (innerHTML
   * sobrescrito) a cada abrirModal(). Virou criação por JS (sessão
   * 2026-08-12) porque minimizar um card precisa preservar o DOM/estado
   * daquele modal específico enquanto OUTRO é aberto por cima - com um único
   * nó fixo isso é impossível (só existe "o" modal).
   */
  function construirModalDom_() {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `
      <div class="modal-cabecalho">
        <h3 class="modal-titulo"></h3>
        <button type="button" class="fechar botao-fechar-modal" title="Fechar">&times;</button>
      </div>
      <div class="modal-corpo"></div>
      <div class="modal-rodape"></div>`;
    return el;
  }

  /**
   * Só o modal ATIVO (visível dentro de #sobreposicaoModal) pode ter ids -
   * minimizado, TODOS os ids de dentro dele (não só modalTitulo/modalCorpo/
   * modalRodape/botaoFecharModal - cada campo de formulário também: sofUnidade,
   * secaoNotasEmpenho, etc., o app inteiro é cheio de document.getElementById
   * por id fixo) somem (desmarcarComoAtivo_), guardados em data-id-original.
   *
   * Achado real (sessão 2026-08-12): sem isso, minimizar duas edições da
   * MESMA tela (ex.: duas SOFs) faria o documento ter dois elementos com
   * id="sofUnidade" ao mesmo tempo - um no modal ativo, outro (oculto) em
   * #areaModaisMinimizados. getElementById devolve só um dos dois (o que
   * vier primeiro na ordem do documento - por sorte de posicionamento, hoje
   * seria sempre o ativo), então não quebra NA HORA - mas um callback
   * assíncrono ainda em voo de dentro do modal MINIMIZADO (ex.: uma leitura
   * de OCR que só termina depois de já ter minimizado) continuaria rodando
   * document.getElementById('sofUnidade') esperando achar o SEU campo, e
   * escreveria por engano no campo do modal ATIVO - corrupção silenciosa de
   * dado do processo errado. Tirar o id por completo enquanto minimizado
   * fecha essa brecha: nenhum getElementById alcança um modal escondido.
   */
  function marcarComoAtivo_(el) {
    // Devolve os ids originais de tudo que passou por desmarcarComoAtivo_ -
    // não faz nada num modal recém-criado (nunca passou por lá).
    el.querySelectorAll('[data-id-original]').forEach(campo => {
      campo.id = campo.dataset.idOriginal;
      delete campo.dataset.idOriginal;
    });
    el.querySelector('.modal-titulo').id = 'modalTitulo';
    el.querySelector('.modal-corpo').id = 'modalCorpo';
    el.querySelector('.modal-rodape').id = 'modalRodape';
    el.querySelector('.botao-fechar-modal').id = 'botaoFecharModal';
  }
  function desmarcarComoAtivo_(el) {
    el.querySelectorAll('[id]').forEach(campo => {
      campo.dataset.idOriginal = campo.id;
      campo.removeAttribute('id');
    });
  }

  function abrirModal(titulo, corpoHtml, rodapeHtml, opcoes) {
    // Nunca deveria haver um modal ativo ao abrir outro (cada tela abre um
    // por vez), mas por segurança abrirModal sempre substitui o que houver -
    // nunca empilha nem pergunta.
    if (modalAtivoEl) { modalAtivoEl.remove(); modalAtivoEl = null; }
    callbackFecharModal = null;
    modalSujo_ = false;

    const el = construirModalDom_();
    marcarComoAtivo_(el);
    el.querySelector('.modal-titulo').textContent = titulo;
    el.querySelector('.modal-corpo').innerHTML = corpoHtml;
    el.querySelector('.modal-rodape').innerHTML = rodapeHtml || '';
    el.classList.toggle('pequeno', !!(opcoes && opcoes.pequeno));
    el.classList.toggle('grande', !!(opcoes && opcoes.grande));
    el.querySelector('.botao-fechar-modal').addEventListener('click', fecharModal);

    // Dirty-tracking genérico (sessão 2026-08-12): a PRIMEIRA interação com
    // qualquer campo do corpo (não importa a tela) marca o modal como
    // "editado" - é só isso que decide se um clique fora minimiza (editado)
    // ou fecha de vez (nada mexido ainda), sem precisar de nenhuma tela
    // rastrear isso por conta própria. Também é o que UI.modalFoiEditado()
    // expõe pra "Salvar" pular validação+rede quando nada mudou (sessão
    // 2026-08-13).
    //
    // O 'click' em <button> (sessão 2026-08-14, achado real, bug relatado
    // pelo usuário) é tão necessário quanto input/change: apagar uma
    // OB/LE, remover uma linha de parcela/fonte etc. são ações que mutam
    // estado só via JS (array.splice/div.remove()), disparadas por clique
    // num <button> - nenhuma delas dispara input OU change. Sem esse
    // terceiro listener, modalFoiEditado() continuava false depois dessas
    // ações, "Salvar" caía no atalho de "nada mudou" (ver
    // salvarReciboEdicao, js/recibos.js) e só fechava o modal - a remoção
    // nunca chegava a ser mandada pro backend, mas já tinha sumido da tela,
    // então reabrir mostrava tudo de volta, como se nada tivesse sido
    // apagado.
    const corpoEl = el.querySelector('.modal-corpo');
    corpoEl.addEventListener('input', () => { modalSujo_ = true; }, { once: true });
    corpoEl.addEventListener('change', () => { modalSujo_ = true; }, { once: true });
    corpoEl.addEventListener('click', e => { if (e.target.closest('button')) modalSujo_ = true; }, { once: true });

    modalTituloAtivo_ = titulo;
    const overlay = document.getElementById('sobreposicaoModal');
    overlay.innerHTML = '';
    overlay.appendChild(el);
    overlay.classList.remove('oculto');
    modalAtivoEl = el;
  }

  /**
   * Registra uma função a ser chamada sempre que o modal atual fechar DE
   * VERDADE (botão Cancelar, X, clique fora sem ter editado nada, ou
   * fechamento programático após salvar) - NÃO dispara ao minimizar (o
   * processo continua "em edição" enquanto o card só está no dock, ver
   * minimizarModalAtivo_) - só quando o analista efetivamente desiste dele
   * (fecharModal) ou descarta o card minimizado pelo "x" do dock
   * (descartarModalMinimizado_). Garante que uma limpeza (ex.: liberar a
   * trava de edição simultânea) aconteça em qualquer desses casos, não só
   * num botão específico. É zerado a cada abrirModal() e após disparar uma vez.
   */
  function aoFecharModal(callback) {
    callbackFecharModal = callback;
  }

  /**
   * Dirty-tracking genérico do modal ativo (ver corpoEl.addEventListener em
   * abrirModal acima) - true assim que o usuário mexeu em QUALQUER campo do
   * corpo desde que o modal abriu. Já existia só pra decidir minimizar x
   * fechar no clique fora; passou a ser exposto (sessão 2026-08-13, pedido do
   * usuário) pros botões "Salvar" de cada tela pularem todo o esquema de
   * salvar (validação + chamada de rede) quando nada mudou - só fecham o
   * card, evitando a lentidão de salvar à toa.
   */
  function modalFoiEditado() {
    return modalSujo_;
  }

  function fecharModal() {
    if (modalAtivoEl) { modalAtivoEl.remove(); modalAtivoEl = null; }
    document.getElementById('sobreposicaoModal').innerHTML = '';
    document.getElementById('sobreposicaoModal').classList.add('oculto');
    if (callbackFecharModal) {
      const callback = callbackFecharModal;
      callbackFecharModal = null;
      callback();
    }
  }

  /**
   * "Clicar fora" com o card editado (sessão 2026-08-12, pedido do usuário)
   * - em vez de descartar o que estava sendo digitado, tira o modal de
   * #sobreposicaoModal (sem remover do documento - todo o DOM/estado/
   * listeners continuam vivos, só ficam ocultos em #areaModaisMinimizados) e
   * adiciona um card no dock (renderDockModais_) pra reabrir depois. NÃO
   * chama callbackFecharModal aqui - ver aoFecharModal acima.
   */
  function minimizarModalAtivo_() {
    if (!modalAtivoEl) return;
    const elemento = modalAtivoEl;
    const titulo = modalTituloAtivo_;
    const callback = callbackFecharModal;
    desmarcarComoAtivo_(elemento);
    document.getElementById('areaModaisMinimizados').appendChild(elemento);
    document.getElementById('sobreposicaoModal').innerHTML = '';
    document.getElementById('sobreposicaoModal').classList.add('oculto');
    modalAtivoEl = null;
    callbackFecharModal = null;

    contadorModalMinimizado_++;
    modaisMinimizados_.push({ id: contadorModalMinimizado_, elemento, titulo, callbackFechar: callback });
    renderDockModais_();
  }

  /**
   * Reabre um card do dock. Se já houver outro modal ativo na tela nesse
   * momento, ele sai do caminho primeiro pela MESMA regra do clique fora
   * (minimiza se editado, fecha se não) - só um modal fica visível por vez.
   */
  function restaurarModalMinimizado_(id) {
    const indice = modaisMinimizados_.findIndex(m => m.id === id);
    if (indice === -1) return;
    const item = modaisMinimizados_[indice];
    modaisMinimizados_.splice(indice, 1);
    renderDockModais_();

    if (modalAtivoEl) {
      if (modalSujo_) minimizarModalAtivo_();
      else fecharModal();
    }

    marcarComoAtivo_(item.elemento);
    const overlay = document.getElementById('sobreposicaoModal');
    overlay.innerHTML = '';
    overlay.appendChild(item.elemento);
    overlay.classList.remove('oculto');
    modalAtivoEl = item.elemento;
    modalTituloAtivo_ = item.titulo;
    callbackFecharModal = item.callbackFechar;
    // Um card só chega ao dock por já ter sido editado (minimizarModalAtivo_
    // só roda quando modalSujo_ já era true) - continua valendo depois de
    // restaurado, então um novo clique fora minimiza de novo, não descarta.
    modalSujo_ = true;
  }

  /** "x" do card no dock - descarta de vez (chama callbackFechar, ex. liberar a trava de edição simultânea, já que o analista está desistindo do processo). */
  function descartarModalMinimizado_(id) {
    const indice = modaisMinimizados_.findIndex(m => m.id === id);
    if (indice === -1) return;
    const item = modaisMinimizados_[indice];
    modaisMinimizados_.splice(indice, 1);
    item.elemento.remove();
    renderDockModais_();
    if (item.callbackFechar) item.callbackFechar();
  }

  function renderDockModais_() {
    const dock = document.getElementById('dockModais');
    dock.innerHTML = modaisMinimizados_.map(m => `
      <div class="dock-modal-card" data-id="${m.id}" title="Reabrir">
        <span class="dock-modal-card-titulo">${escaparHtml(m.titulo)}</span>
        <button type="button" class="dock-modal-card-fechar" data-id="${m.id}" title="Descartar">&times;</button>
      </div>`).join('');
    dock.querySelectorAll('.dock-modal-card').forEach(card => {
      card.addEventListener('click', () => restaurarModalMinimizado_(Number(card.dataset.id)));
    });
    dock.querySelectorAll('.dock-modal-card-fechar').forEach(botao => {
      botao.addEventListener('click', e => {
        e.stopPropagation();
        descartarModalMinimizado_(Number(botao.dataset.id));
      });
    });
  }

  /**
   * Mostra uma mensagem de erro num <p class="erro-campo">. Se a mesma mensagem
   * já estava sendo exibida por esse elemento (tentativa repetida com o mesmo
   * erro), aplica uma animação de "piscar" para reforçar que o erro persiste.
   */
  function mostrarErro(elementoOuId, mensagem) {
    const el = typeof elementoOuId === 'string' ? document.getElementById(elementoOuId) : elementoOuId;
    const repetiu = el.dataset.ultimaMensagem === mensagem;
    el.textContent = mensagem;
    el.dataset.ultimaMensagem = mensagem;
    el.classList.remove('oculto');
    if (repetiu) {
      el.classList.remove('piscar-erro');
      void el.offsetWidth; // força reflow para reiniciar a animação CSS
      el.classList.add('piscar-erro');
    }
  }

  function lerArquivoBase64(arquivo) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result).split(',')[1] || '');
      leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      leitor.readAsDataURL(arquivo);
    });
  }

  /**
   * Cores por status de Recibo (sessão 2026-07-27, pedido visual do usuário -
   * cores exatas de uma referência que ele mandou). `status` é texto livre
   * (configurado em Listas Personalizadas, tipo STATUS_RECIBO) - a busca é
   * por correspondência exata (maiúsculas/espaços nas pontas ignorados); um
   * status que não estiver no mapa cai no visual neutro de sempre (`.selo`
   * sem cor própria). Se algum status da planilha do usuário tiver uma
   * grafia levemente diferente da referência, é só ajustar a chave aqui.
   */
  const CORES_STATUS_RECIBO_ = {
    'PROCESSO INEXISTENTE': { bg: '#17b6a8', fg: '#ffffff' },
    'ENVIADO DE VOLTA A UNIDADE PARA CORREÇÃO': { bg: '#a8790a', fg: '#ffffff' },
    'AGUARDANDO RELATÓRIO CTAI': { bg: '#6e2530', fg: '#ffffff' },
    'AGUARDANDO ORÇAMENTO': { bg: '#ddc6ea', fg: '#4a3355' },
    'AGUARDANDO ASSINATURA DA NE': { bg: '#e34fa0', fg: '#ffffff' },
    'AGUARDANDO FORMALZAÇÃO': { bg: '#3a3d42', fg: '#ffffff' },
    'AGUARDANDO FORMALIZAÇÃO': { bg: '#3a3d42', fg: '#ffffff' },
    'AGUARDANDO ASSINATURA DO ATESTO': { bg: '#e0362f', fg: '#ffffff' },
    'AGUARDANDO LIBERAÇÃO DA LIQUIDAÇÃO(CLSUS)': { bg: '#a9d4f5', fg: '#1c4a68' },
    'AGUARDANDO LIBERAÇÃO DA LIQUIDAÇÃO (CLSUS)': { bg: '#a9d4f5', fg: '#1c4a68' },
    'AGUARDANDO LIBERAÇÃO DA LIQUIDAÇÃO(CLTESOURO)': { bg: '#d9d9dc', fg: '#3a3a3d' },
    'AGUARDANDO LIBERAÇÃO DA LIQUIDAÇÃO (CLTESOURO)': { bg: '#d9d9dc', fg: '#3a3a3d' },
    'AGUARDANDO ASSINATURA DA LIQUIDAÇÃO': { bg: '#4c2f85', fg: '#ffffff' },
    'ENVIADO AO SETOR DE PAGAMENTO (CPAG_TESOURO)': { bg: '#8a8d93', fg: '#ffffff' },
    'ENVIADO AO SETOR DE PAGAMENTO(CPAG_TESOURO)': { bg: '#8a8d93', fg: '#ffffff' },
    'ENVIADO AO SETOR DE PAGAMENTO (CPAG_SUS)': { bg: '#0f3b47', fg: '#ffffff' },
    'ENVIADO AO SETOR DE PAGAMENTO(CPAG_SUS)': { bg: '#0f3b47', fg: '#ffffff' },
    'PAGO': { bg: '#1c7a37', fg: '#ffffff' },
    'PARCELA COMPENSADA': { bg: '#bdeec0', fg: '#1c5c28' }
  };

  function seloStatusReciboHtml(status) {
    const chave = String(status || '').trim().toUpperCase();
    const cor = CORES_STATUS_RECIBO_[chave];
    const estilo = cor ? ` style="background:${cor.bg};color:${cor.fg}"` : '';
    return `<span class="selo selo-status"${estilo}>${escaparHtml(status || '-')}</span>`;
  }

  /**
   * Mesmas cores de seloStatusReciboHtml, mas só o CSS (sem o <span>) -
   * usado no <select> de status editável direto na listagem de Recibos
   * (sessão 2026-08-07), pra ele continuar parecendo um selo colorido em vez
   * de um <select> genérico.
   */
  function corStatusReciboEstilo(status) {
    const chave = String(status || '').trim().toUpperCase();
    const cor = CORES_STATUS_RECIBO_[chave];
    return cor ? `background:${cor.bg};color:${cor.fg}` : '';
  }

  function formatarMoeda(valor) {
    const n = Number(valor) || 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /**
   * Converte um valor DIGITADO em número, aceitando o formato brasileiro.
   *
   * Bug real que originou isto (sessão 2026-08-08): os campos de valor eram
   * `type="number"`, que por especificação HTML só aceita ponto como decimal -
   * mas a tela EXIBE tudo em pt-BR via formatarMoeda ("R$ 1.234,56"). O app
   * mostrava um formato que não aceitava de volta. Quem digitava "1.000"
   * (mil reais) salvava 1, quem digitava "10,50" tinha o campo esvaziado pelo
   * navegador e salvava 0 - nos dois casos com checkValidity() === true, então
   * nenhuma validação pegava e não havia aviso nenhum.
   *
   * Regra de desambiguação (a parte que importa): se há vírgula, ela é o
   * decimal e os pontos são separador de milhar ("1.234,56" -> 1234.56). Sem
   * vírgula, um ponto seguido de exatamente 3 dígitos (repetível) é milhar
   * ("1.000" -> 1000, "1.234.567" -> 1234567); qualquer outro ponto é decimal
   * ("1.5" -> 1.5, "1234.56" -> 1234.56, que é o formato que o campo antigo
   * exigia - continua funcionando).
   *
   * Devolve null (não 0) para entrada inválida, pra quem chama poder recusar
   * em vez de gravar zero silenciosamente.
   */
  function parseValorBr(texto) {
    if (texto === null || texto === undefined) return null;
    let s = String(texto).trim().replace(/\s/g, '').replace(/R\$/gi, '');
    if (s === '') return null;

    if (s.indexOf(',') !== -1) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }

    if (!/^-?\d*\.?\d+$/.test(s)) return null;   // barra "1.2.3", "1e5", "abc"
    const n = Number(s);
    return isNaN(n) || !isFinite(n) ? null : n;
  }

  /**
   * Lê um campo monetário já normalizado. Devolve { ok, valor }: ok=false
   * quando o usuário digitou algo que não é número (aí quem chama aborta e
   * avisa, em vez de gravar 0). Campo vazio é ok com valor 0 - vazio sempre
   * significou "não informado" neste app.
   */
  function lerValorCampo(elOuId) {
    const el = typeof elOuId === 'string' ? document.getElementById(elOuId) : elOuId;
    if (!el) return { ok: true, valor: 0 };
    const bruto = String(el.value || '').trim();
    if (bruto === '') { el.classList.remove('campo-invalido'); return { ok: true, valor: 0 }; }
    const n = parseValorBr(bruto);
    if (n === null) { el.classList.add('campo-invalido'); return { ok: false, valor: null, el }; }
    el.classList.remove('campo-invalido');
    return { ok: true, valor: n };
  }

  /**
   * Portão único antes de qualquer Salvar: recusa se ALGUM `.campo-moeda` da
   * tela tiver texto que não vira número. Vale pros 18 campos monetários do app
   * de uma vez, sem depender de cada formulário lembrar de validar - era
   * justamente essa ausência que deixava gravar R$ 0,00 sem avisar.
   */
  function validarCamposMoeda(container) {
    const raiz = container || document;
    const invalidos = Array.from(raiz.querySelectorAll('.campo-moeda')).filter(el => {
      const bruto = String(el.value || '').trim();
      const ruim = bruto !== '' && parseValorBr(bruto) === null;
      el.classList.toggle('campo-invalido', ruim);
      return ruim;
    });
    if (!invalidos.length) return true;
    invalidos[0].focus();
    toast('Valor inválido em "' + rotuloDoCampo_(invalidos[0]) + '". Use por exemplo 1.234,56 ou 1234.56.', 'erro');
    return false;
  }

  /** Texto do <label> irmão, pra mensagem de erro dizer QUAL campo está errado. */
  function rotuloDoCampo_(el) {
    const campo = el.closest('.campo');
    const label = campo ? campo.querySelector('label') : null;
    return label ? label.textContent.replace('*', '').trim() : 'valor';
  }

  /**
   * Marca em vermelho, ao sair do campo, todo `.campo-moeda` com conteúdo que
   * não dá número - feedback imediato, sem esperar o Salvar. Delegado no
   * document (os formulários são recriados via innerHTML a cada abertura, então
   * listener por elemento se perderia).
   */
  document.addEventListener('blur', (ev) => {
    const el = ev.target;
    if (!el || !el.classList || !el.classList.contains('campo-moeda')) return;
    const bruto = String(el.value || '').trim();
    el.classList.toggle('campo-invalido', bruto !== '' && parseValorBr(bruto) === null);
  }, true);

  function formatarData(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('pt-BR');
  }

  /**
   * Rótulo exibido de um perfil (sessão 2026-08-14: 3 perfis agora, não mais
   * só gerente/analista) - função única, pra não repetir o mapeamento em
   * cada tela que mostra perfil (js/usuarios.js, topbar/"Minha conta" aqui
   * mesmo).
   */
  function rotuloPerfil(perfil) {
    if (perfil === 'administrador') return 'Administrador';
    if (perfil === 'gerente') return 'Gerente';
    return 'Analista';
  }

  /** "aaaa-mm-dd" -> "dd/mm/aaaa", sem hora - só a data (formatarData acima inclui hora). */
  function formatarDataBr(iso) {
    if (!iso) return '';
    const [ano, mes, dia] = String(iso).split('-');
    return dia && mes && ano ? `${dia}/${mes}/${ano}` : String(iso);
  }

  /** Date -> "aaaa-mm-dd" em horário LOCAL (não usa toISOString, que converte pra UTC e pode voltar um dia no fuso do Brasil). */
  function dataParaIsoLocal_(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const SITUACOES_CONTRATO_TEMPORARIAS_ = ['TAC', 'Termo de Compromisso', 'Contrato Emergencial'];

  /**
   * Prazos contratuais de uma Unidade (sessão 2026-08-14, pedido do usuário)
   * - função ÚNICA, compartilhada entre o card de Unidades (js/unidades.js)
   * e a tabela nova do Dashboard (js/dashboard.js), pra nunca desalinharem
   * (mesma classe de bug já vista neste app com o <style> duplicado do
   * documento SEI - ver js/sei-bridge.js).
   *
   * Contexto de negócio: um Contrato de Gestão (C.G.) regular dura até 10
   * anos, com um Termo Aditivo de prorrogação a cada 2 anos a partir da
   * assinatura (marcos em âncora+2/+4/+6/+8 anos - âncora+10 é o FIM do
   * contrato, não mais um T.A.). Depois do marco de +8 anos não sobra T.A.
   * nenhum a fazer nos 2 anos finais - diasProximoTa sai null nesse período.
   * TAC/Termo de Compromisso/Contrato Emergencial são instrumentos
   * temporários (pontes usadas quando os 10 anos acabam e a nova seleção
   * pública da OSS ainda não terminou): o prazo final é a própria
   * data_final_instrumento informada, sem cálculo de T.A.
   *
   * Devolve null quando não há dado suficiente pra calcular (sem Situação
   * do Contrato escolhida, ou faltando a data que aquele tipo exige).
   */
  function calcularPrazoContratoUnidade(unidade) {
    const situacao = unidade && unidade.situacao_contrato;
    if (!situacao) return null;
    const ehTemporaria = SITUACOES_CONTRATO_TEMPORARIAS_.indexOf(situacao) !== -1;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    // "T00:00:00" (sem "Z"): força o parse em horário LOCAL, não UTC - uma
    // data "aaaa-mm-dd" pura vira meia-noite UTC, que no fuso do Brasil
    // (UTC-3) já é o dia anterior à noite, um bug clássico de off-by-one.
    const parseDataLocal = iso => { const d = new Date(iso + 'T00:00:00'); return isNaN(d.getTime()) ? null : d; };

    if (ehTemporaria) {
      const fim = parseDataLocal(unidade.data_final_instrumento);
      if (!fim) return null;
      const dias = Math.round((fim - hoje) / 86400000);
      return {
        situacao, ehTemporaria,
        diasProximoTa: null,
        diasPrazoFinal: dias,
        dataPrazoFinalIso: dataParaIsoLocal_(fim),
        rotuloPrazoFinal: `Fim do instrumento (${situacao})`
      };
    }

    // Contrato Regular.
    const inicio = parseDataLocal(unidade.data_inicial_instrumento);
    if (!inicio) return null;

    const marcosTa = [2, 4, 6, 8].map(anos => { const d = new Date(inicio.getTime()); d.setFullYear(d.getFullYear() + anos); return d; });
    const fimContrato = new Date(inicio.getTime()); fimContrato.setFullYear(fimContrato.getFullYear() + 10);
    const proximoTa = marcosTa.find(d => d >= hoje) || null;

    return {
      situacao, ehTemporaria,
      diasProximoTa: proximoTa ? Math.round((proximoTa - hoje) / 86400000) : null,
      diasPrazoFinal: Math.round((fimContrato - hoje) / 86400000),
      dataPrazoFinalIso: dataParaIsoLocal_(fimContrato),
      rotuloPrazoFinal: 'Fim do Contrato de Gestão (10 anos)'
    };
  }

  /**
   * Cor de alerta (nomes de classe .selo já existentes, ver css/style.css)
   * pra um número de dias restantes - limiares padrão 60/180, ajustáveis
   * aqui num lugar só se o usuário pedir outros números.
   */
  function corAlertaPrazo(dias) {
    if (dias === null || dias === undefined) return 'cinza';
    if (dias <= 60) return 'vermelho';
    if (dias <= 180) return 'amarelo';
    return 'verde';
  }

  const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  /** Gera a lista de competências (formato "mmm.aa", ex.: "mar.26") de 24 meses atrás a 6 meses à frente. */
  function listaCompetencias() {
    const hoje = new Date();
    const lista = [];
    for (let i = 6; i >= -24; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      lista.push(MESES_ABREV[d.getMonth()] + '.' + String(d.getFullYear()).slice(-2));
    }
    return lista;
  }

  /**
   * Anos para os filtros de Ano (sessão 2026-08-12), do próximo ano até 2021,
   * do mais recente para o mais antigo. Intervalo fixo de propósito: derivar
   * dos dados exigiria mais uma chamada ao backend só para montar um dropdown,
   * e a base do app começa em 2022 (migração do histórico de Recibos).
   */
  function listaAnos() {
    const lista = [];
    for (let ano = new Date().getFullYear() + 1; ano >= 2021; ano--) lista.push(String(ano));
    return lista;
  }

  /**
   * Monta as <option> de um <select> de competência. Se valorSelecionado não
   * estiver na lista padrão (dado histórico fora do intervalo gerado), ele é
   * incluído mesmo assim para não "perder" a seleção atual.
   */
  function opcoesCompetenciaHtml(valorSelecionado, incluirTodas) {
    const lista = listaCompetencias();
    if (valorSelecionado && lista.indexOf(valorSelecionado) === -1) lista.unshift(valorSelecionado);
    const opcaoInicial = incluirTodas ? '<option value="">Todas</option>' : '<option value="">-</option>';
    return opcaoInicial + lista.map(c => `<option ${c === valorSelecionado ? 'selected' : ''}>${c}</option>`).join('');
  }

  /**
   * Opções do seletor "Por página" (sessão 2026-08-31, pedido do usuário: 20,
   * 40, 80, 100 ou Todos) - reaproveitado por SOF/Notas de Empenho/Recibos/
   * Unidades, que continuam cada um cuidando do próprio <select> (id,
   * variável de estado, o que fazer no "change") - só o HTML das opções é
   * compartilhado, pra manter as 4 telas com a mesma lista sem repetir.
   * `atual` é o valor numérico corrente (20/40/80/100) OU a string 'todos'.
   */
  function opcoesTamanhoPaginaHtml(atual) {
    const valores = [20, 40, 80, 100];
    return valores.map(v => `<option value="${v}" ${atual === v ? 'selected' : ''}>${v}</option>`).join('')
      + `<option value="todos" ${atual === 'todos' ? 'selected' : ''}>Todos</option>`;
  }

  // botaoFecharModal não é mais um elemento fixo (sessão 2026-08-12 - ver
  // construirModalDom_/abrirModal acima) - o listener do X é registrado ali,
  // um por modal criado, não aqui uma vez só no carregamento da página.
  document.getElementById('sobreposicaoModal').addEventListener('click', function (e) {
    if (e.target !== this) return;
    // Clique fora (sessão 2026-08-12, pedido do usuário): minimiza pro dock
    // se o card já foi editado, fecha normalmente (descarta) se não.
    if (modalSujo_) minimizarModalAtivo_();
    else fecharModal();
  });

  const REGEX_MARCAS_DIACRITICAS = new RegExp('[̀-ͯ]', 'g');
  function normalizarBusca_(texto) {
    return String(texto || '').toLowerCase().normalize('NFD').replace(REGEX_MARCAS_DIACRITICAS, '');
  }

  /**
   * Transforma um <select> já existente num combo pesquisável (progressive
   * enhancement): o <select> original continua no DOM (escondido) e é a
   * fonte de verdade de `.value` - todo código já existente que lê
   * `elemento.value` ou escuta `change` no select continua funcionando sem
   * alteração nenhuma. Ao lado dele é inserido um <input> de texto + um
   * painel de opções filtráveis; escolher uma opção seta o `.value` do
   * select original e dispara `change` nele.
   *
   * Idempotente: se chamado de novo sobre um select já convertido (comum nos
   * cascatas Unidade->SOF->Fonte, onde o innerHTML do select é substituído
   * depois de uma busca), só atualiza a lista de opções a partir do estado
   * atual do select, em vez de duplicar o wrapper.
   */
  function tornarPesquisavel(idOuElemento) {
    const select = typeof idOuElemento === 'string' ? document.getElementById(idOuElemento) : idOuElemento;
    if (!select || select.tagName !== 'SELECT') return;

    const wrapperExistente = select.nextElementSibling && select.nextElementSibling.classList && select.nextElementSibling.classList.contains('select-pesquisavel')
      ? select.nextElementSibling
      : null;

    if (wrapperExistente) {
      atualizarWrapperPesquisavel_(select, wrapperExistente);
      return;
    }

    select.classList.add('select-pesquisavel-original');
    select.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'select-pesquisavel';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'select-pesquisavel-input';
    input.autocomplete = 'off';
    input.placeholder = 'Buscar...';
    const lista = document.createElement('ul');
    lista.className = 'select-pesquisavel-lista oculto';
    wrapper.appendChild(input);
    wrapper.appendChild(lista);
    select.insertAdjacentElement('afterend', wrapper);

    let indiceDestacado = -1;

    function opcoesDoSelect() {
      return Array.from(select.options).filter(o => o.value !== '' || o === select.options[0]);
    }

    function textoDaOpcaoSelecionada() {
      const opcao = select.options[select.selectedIndex];
      return opcao && opcao.value !== '' ? opcao.textContent : '';
    }

    function renderLista(filtro) {
      const termo = normalizarBusca_(filtro);
      const opcoes = opcoesDoSelect().filter(o => o.value !== '');
      const filtradas = termo ? opcoes.filter(o => normalizarBusca_(o.textContent).indexOf(termo) !== -1) : opcoes;
      indiceDestacado = -1;
      lista.innerHTML = filtradas.length
        ? filtradas.map((o, i) => `<li class="select-pesquisavel-opcao" data-valor="${escaparHtml(o.value)}" data-indice="${i}">${escaparHtml(o.textContent)}</li>`).join('')
        : '<li class="select-pesquisavel-vazio">Nenhuma opção encontrada</li>';
      lista.querySelectorAll('.select-pesquisavel-opcao').forEach(li => {
        li.addEventListener('mousedown', e => {
          e.preventDefault();
          escolherValor(li.dataset.valor);
        });
      });
    }

    function abrirLista() {
      if (select.disabled) return;
      renderLista(input.value === textoDaOpcaoSelecionada() ? '' : input.value);
      lista.classList.remove('oculto');
    }

    function fecharLista() {
      lista.classList.add('oculto');
      input.value = textoDaOpcaoSelecionada();
    }

    function escolherValor(valor) {
      select.value = valor;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      input.value = textoDaOpcaoSelecionada();
      fecharLista();
    }

    // Reflete no input trocas de valor feitas fora do wrapper (ex.:
    // autopreenchimento programático que faz `select.value = x` e dispara
    // `change` direto no <select> original, sem passar por escolherValor).
    select.addEventListener('change', () => { input.value = textoDaOpcaoSelecionada(); });

    input.addEventListener('focus', abrirLista);
    input.addEventListener('input', () => { renderLista(input.value); lista.classList.remove('oculto'); });
    input.addEventListener('blur', () => setTimeout(fecharLista, 120));
    input.addEventListener('keydown', e => {
      const itens = () => Array.from(lista.querySelectorAll('.select-pesquisavel-opcao'));
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (lista.classList.contains('oculto')) { abrirLista(); return; }
        const els = itens();
        if (!els.length) return;
        indiceDestacado = Math.min(indiceDestacado + 1, els.length - 1);
        els.forEach(el => el.classList.remove('destacada'));
        els[indiceDestacado].classList.add('destacada');
        els[indiceDestacado].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const els = itens();
        if (!els.length) return;
        indiceDestacado = Math.max(indiceDestacado - 1, 0);
        els.forEach(el => el.classList.remove('destacada'));
        els[indiceDestacado].classList.add('destacada');
        els[indiceDestacado].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const els = itens();
        if (indiceDestacado >= 0 && els[indiceDestacado]) escolherValor(els[indiceDestacado].dataset.valor);
      } else if (e.key === 'Escape') {
        fecharLista();
        input.blur();
      }
    });

    input.disabled = select.disabled;
    input.value = textoDaOpcaoSelecionada();

    // Reobserva o select original (via MutationObserver) pra refletir trocas
    // programáticas de .value/.disabled feitas direto pelo código existente
    // (ex.: reset de formulário) sem precisar tocar em cada call site.
    const observer = new MutationObserver(() => atualizarWrapperPesquisavel_(select, wrapper));
    observer.observe(select, { attributes: true, attributeFilter: ['disabled'] });
    wrapper._observerSelect = observer;
    wrapper._render = () => { input.value = textoDaOpcaoSelecionada(); input.disabled = select.disabled; };
  }

  function atualizarWrapperPesquisavel_(select, wrapper) {
    if (wrapper._render) wrapper._render();
  }

  /**
   * ===== Filtro de múltipla escolha =====
   * Substitui um <div id="..."> vazio (colocado no lugar de um <select> nas
   * barras de filtro) por um combo de checkboxes com busca, permitindo
   * selecionar 0..N opções. O valor "vazio" (nenhuma opção marcada) tem o
   * mesmo efeito de "Todas"/"Todos" que os selects antigos tinham.
   *
   * Cada instância fica registrada em `registroFiltrosMultiplos` pelo id do
   * container, para que `valoresFiltroMultiplo`/`limparFiltroMultiplo` sejam
   * chamados de qualquer lugar (ex.: filtrosAtuais(), botão "Limpar filtros",
   * botão "x" individual de cada campo) sem precisar guardar a referência.
   */
  const registroFiltrosMultiplos = {};

  /**
   * Descarta item nulo/indefinido antes do map: um único elemento assim fazia
   * `o.valor` lançar, e como criarFiltroMultiplo roda dentro do carregar() de
   * cada tela, a exceção virava unhandled rejection - a barra de filtros não
   * montava e a LISTA da aba não renderizava, sem mensagem nenhuma na tela.
   * Não é alcançável pelo backend atual (sheetToObjects_ sempre devolve todas as
   * colunas, vazias no pior caso), mas o custo de blindar é uma linha.
   */
  function normalizarOpcoesFiltro_(opcoes) {
    return (opcoes || [])
      .filter(o => o !== null && o !== undefined)
      .map(o => (typeof o === 'string' ? { valor: o, rotulo: o } : { valor: o.valor, rotulo: o.rotulo != null ? o.rotulo : o.valor }));
  }

  function criarFiltroMultiplo(id, opcoes, aoMudar) {
    const raiz = document.getElementById(id);
    if (!raiz) return null;

    let normalizadas = normalizarOpcoesFiltro_(opcoes);
    let selecionados = new Set();

    raiz.classList.add('filtro-multiplo');
    raiz.innerHTML = `
      <button type="button" class="filtro-multiplo-cabecalho">
        <span class="filtro-multiplo-texto">Todas</span>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="filtro-multiplo-painel oculto">
        <input type="text" class="filtro-multiplo-busca" placeholder="Buscar..." autocomplete="off" />
        <label class="filtro-multiplo-opcao filtro-multiplo-selecionar-todas">
          <input type="checkbox" class="filtro-multiplo-chk-todas" />
          <span>Selecionar todas</span>
        </label>
        <div class="filtro-multiplo-opcoes"></div>
      </div>`;

    const botao = raiz.querySelector('.filtro-multiplo-cabecalho');
    const texto = raiz.querySelector('.filtro-multiplo-texto');
    const painel = raiz.querySelector('.filtro-multiplo-painel');
    const buscaInput = raiz.querySelector('.filtro-multiplo-busca');
    const opcoesContainer = raiz.querySelector('.filtro-multiplo-opcoes');
    const chkTodas = raiz.querySelector('.filtro-multiplo-chk-todas');
    // Últimas opções renderizadas (já filtradas pela busca, se houver) - é
    // sobre ESSAS que "Selecionar todas" age, não sobre `normalizadas`
    // inteiro. Sem isso, buscar "Hospital X", marcar "Selecionar todas" e
    // apagar a busca depois revelaria um monte de opção marcada que a
    // pessoa nunca viu nem quis selecionar.
    let ultimasFiltradas = [];

    function renderOpcoes(filtro) {
      const termo = normalizarBusca_(filtro);
      ultimasFiltradas = termo ? normalizadas.filter(o => normalizarBusca_(o.rotulo).indexOf(termo) !== -1) : normalizadas;
      opcoesContainer.innerHTML = ultimasFiltradas.length
        ? ultimasFiltradas.map(o => `
          <label class="filtro-multiplo-opcao">
            <input type="checkbox" value="${escaparHtml(o.valor)}" ${selecionados.has(o.valor) ? 'checked' : ''} />
            <span>${escaparHtml(o.rotulo)}</span>
          </label>`).join('')
        : '<div class="filtro-multiplo-vazio">Nenhuma opção encontrada</div>';
      opcoesContainer.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
          if (cb.checked) selecionados.add(cb.value); else selecionados.delete(cb.value);
          atualizarTexto();
          atualizarChkTodas_();
          if (aoMudar) aoMudar();
        });
      });
      atualizarChkTodas_();
    }

    /** Sincroniza "Selecionar todas" com o que está marcado dentre as opções filtradas agora - marcado, desmarcado ou "indeterminate" (só parte marcada). */
    function atualizarChkTodas_() {
      const marcadas = ultimasFiltradas.filter(o => selecionados.has(o.valor)).length;
      chkTodas.disabled = ultimasFiltradas.length === 0;
      chkTodas.checked = ultimasFiltradas.length > 0 && marcadas === ultimasFiltradas.length;
      chkTodas.indeterminate = marcadas > 0 && marcadas < ultimasFiltradas.length;
    }

    chkTodas.addEventListener('change', () => {
      ultimasFiltradas.forEach(o => { if (chkTodas.checked) selecionados.add(o.valor); else selecionados.delete(o.valor); });
      atualizarTexto();
      renderOpcoes(buscaInput.value);
      if (aoMudar) aoMudar();
    });

    function atualizarTexto() {
      if (selecionados.size === 0) {
        texto.textContent = 'Todas';
      } else if (selecionados.size === 1) {
        const valor = Array.from(selecionados)[0];
        const opcao = normalizadas.find(o => o.valor === valor);
        texto.textContent = opcao ? opcao.rotulo : valor;
      } else {
        texto.textContent = `${selecionados.size} selecionadas`;
      }
      raiz.classList.toggle('tem-selecao', selecionados.size > 0);
    }

    function aoClicarFora_(e) {
      if (!raiz.contains(e.target)) fechar();
    }

    function abrir() {
      if (!painel.classList.contains('oculto')) return;
      painel.classList.remove('oculto');
      buscaInput.value = '';
      renderOpcoes('');
      buscaInput.focus();
      document.addEventListener('mousedown', aoClicarFora_, true);
    }

    function fechar() {
      painel.classList.add('oculto');
      document.removeEventListener('mousedown', aoClicarFora_, true);
    }

    botao.addEventListener('click', () => { painel.classList.contains('oculto') ? abrir() : fechar(); });
    buscaInput.addEventListener('input', () => renderOpcoes(buscaInput.value));
    buscaInput.addEventListener('keydown', e => { if (e.key === 'Escape') { fechar(); botao.focus(); } });

    atualizarTexto();

    const api = {
      obterValores: () => Array.from(selecionados),
      definirValores: (valores) => {
        selecionados = new Set((valores || []).map(String));
        atualizarTexto();
        if (!painel.classList.contains('oculto')) renderOpcoes(buscaInput.value);
      },
      limpar: () => {
        if (selecionados.size === 0) return;
        selecionados.clear();
        atualizarTexto();
        if (!painel.classList.contains('oculto')) renderOpcoes(buscaInput.value);
      },
      atualizarOpcoes: (novasOpcoes) => {
        normalizadas = normalizarOpcoesFiltro_(novasOpcoes);
        selecionados = new Set(Array.from(selecionados).filter(v => normalizadas.some(o => o.valor === v)));
        atualizarTexto();
        if (!painel.classList.contains('oculto')) renderOpcoes(buscaInput.value);
      }
    };
    registroFiltrosMultiplos[id] = api;
    return api;
  }

  function valoresFiltroMultiplo(id) {
    return registroFiltrosMultiplos[id] ? registroFiltrosMultiplos[id].obterValores() : [];
  }

  function limparFiltroMultiplo(id) {
    if (registroFiltrosMultiplos[id]) registroFiltrosMultiplos[id].limpar();
  }

  /** Pré-seleciona valores num filtro de múltipla escolha já criado - usado pelo Dashboard pra navegar com um filtro inicial já aplicado (ver App.navegarPara). */
  function definirValoresFiltroMultiplo(id, valores) {
    if (registroFiltrosMultiplos[id]) registroFiltrosMultiplos[id].definirValores(valores);
  }

  /** Troca a lista de opções de um filtro de múltipla escolha já criado (poda sozinho qualquer seleção que não exista mais na lista nova) - usado pela cascata Unidade/Tipo de unidade/OSS abaixo. */
  function atualizarOpcoesFiltroMultiplo(id, novasOpcoes) {
    if (registroFiltrosMultiplos[id]) registroFiltrosMultiplos[id].atualizarOpcoes(novasOpcoes);
  }

  function dedupOrdenado_(lista) {
    return Array.from(new Set((lista || []).filter(Boolean))).sort();
  }

  /**
   * ===== Facetas: cada filtro só oferece o que ainda leva a resultado =====
   *
   * O backend devolve, junto com a página, um mapa `facetas` com os valores
   * ainda possíveis de cada dimensão, calculados aplicando todos os OUTROS
   * filtros (ver calcularFacetas_ em backend/Utils.gs). Aqui isso vira a lista
   * de opções de cada widget.
   *
   * Por que vem do backend: a tela tem só a página atual (20 linhas), então não
   * há como derivar dela quais valores existem no conjunto inteiro. Foi por isso
   * também que o estreitamento antigo só funcionava para Unidade/Tipo/OSS - as
   * únicas listas que o frontend tinha por completo.
   *
   * `cfg` mapeia id do widget -> { chave, rotulo }:
   *   chave  - nome da dimensão no mapa de facetas;
   *   rotulo - (opcional) função valor -> texto exibido (ex.: id da unidade
   *            vira o nome dela).
   *
   * A seleção atual é SEMPRE mantida na lista, mesmo que a faceta não a traga.
   * Sem isso, uma combinação que zera resultados faria a opção escolhida sumir
   * e ser descartada silenciosamente - o usuário veria a lista mudar sozinha
   * sem entender por quê, e sem conseguir desmarcar o que causou aquilo.
   */
  function aplicarFacetas(facetas, cfg) {
    if (!facetas) return;
    Object.keys(cfg).forEach(id => {
      const { chave, rotulo } = cfg[id];
      const disponiveis = facetas[chave];
      if (!disponiveis) return;
      const valores = Array.from(new Set(disponiveis.concat(valoresFiltroMultiplo(id).map(String))));
      atualizarOpcoesFiltroMultiplo(id, rotulo
        ? valores.map(v => ({ valor: v, rotulo: rotulo(v) }))
        : valores.slice().sort());
    });
  }

  // recalcularFiltrosCruzadosUnidade foi REMOVIDA na sessão 2026-08-12.
  //
  // Ela estreitava em tempo real só o trio Unidade/Tipo de unidade/OSS, a
  // partir da lista de unidades que o frontend já tinha inteira - as outras
  // dimensões (Objeto, DEA, Fonte, Status, Competência, Ano) ficavam de fora
  // porque a tela só tem a página atual, não o conjunto todo.
  //
  // O estreitamento agora vale para TODOS os filtros e vem das facetas
  // calculadas no backend (aplicarFacetas acima). Manter as duas coisas seria
  // pior que escolher uma: a versão local reescrevia as opções a cada clique de
  // checkbox, desfazendo o que as facetas tinham acabado de definir.

  /**
   * Liga os botões "x" individuais (marcados com data-alvo="<id do filtro>",
   * tanto de filtro de múltipla escolha quanto de campo de Busca livre - ver
   * .busca-livre-x abaixo) e o botão maior de "Limpar filtros" (se existir,
   * via seu id) de uma barra de filtros recém-renderizada.
   *
   * `aoLimpar` roda depois do botão "Limpar filtros" (limpa tudo, inclusive
   * Busca livre - ver querySelectorAll('input[type=text]...') abaixo) -
   * recarrega lendo o estado atual de todos os campos, já que nesse ponto
   * todos foram zerados mesmo.
   *
   * `aoLimparIndividual(idCampo)` (opcional, senão cai em `aoLimpar`) roda
   * depois de um "x" individual (múltipla escolha OU Busca livre). Só o
   * campo `idCampo` foi limpo - nenhum outro widget é tocado aqui. É
   * responsabilidade de quem implementa `aoLimparIndividual` recarregar
   * usando o último filtro realmente aplicado com só esse campo zerado por
   * cima (não o estado ao vivo dos outros campos, que pode ter seleções
   * ainda não confirmadas em "Filtrar") - ver aoLimparFiltroIndividual_/
   * CHAVE_POR_FILTRO_ em js/sof.js para o padrão usado por cada tela.
   */
  function ligarLimpezaFiltros(raizOuSeletor, botaoLimparTodosId, aoLimpar, aoLimparIndividual) {
    const raiz = typeof raizOuSeletor === 'string' ? document.querySelector(raizOuSeletor) : raizOuSeletor;
    if (!raiz) return;
    raiz.querySelectorAll('.filtro-multiplo-x').forEach(btn => {
      btn.addEventListener('click', () => {
        // Só recarrega se ESTE campo tinha algo selecionado - clicar no "x" de
        // um campo vazio não deve mexer em nada.
        const tinhaSelecao = valoresFiltroMultiplo(btn.dataset.alvo).length > 0;
        limparFiltroMultiplo(btn.dataset.alvo);
        if (!tinhaSelecao) return;
        if (aoLimparIndividual) aoLimparIndividual(btn.dataset.alvo);
        else if (aoLimpar) aoLimpar();
      });
    });
    // "x" do campo de Busca livre (sessão 2026-08-24, pedido do usuário) -
    // mesma linguagem visual do "x" dos filtros de múltipla escolha
    // (.filtro-multiplo-x), mas limpando um <input> de texto comum
    // (data-alvo aponta pro id do <input>, não de um filtro-multiplo).
    raiz.querySelectorAll('.busca-livre-x').forEach(btn => {
      const input = document.getElementById(btn.dataset.alvo);
      if (!input) return;
      btn.addEventListener('click', () => {
        if (!input.value) return;
        input.value = '';
        input.focus();
        if (aoLimparIndividual) aoLimparIndividual(btn.dataset.alvo);
        else if (aoLimpar) aoLimpar();
      });
    });
    if (botaoLimparTodosId) {
      const botaoTodos = document.getElementById(botaoLimparTodosId);
      if (botaoTodos) {
        botaoTodos.addEventListener('click', () => {
          raiz.querySelectorAll('.filtro-multiplo-x').forEach(btn => limparFiltroMultiplo(btn.dataset.alvo));
          raiz.querySelectorAll('input[type=text], input[type=search]').forEach(inp => { inp.value = ''; });
          raiz.querySelectorAll('input[type=checkbox]').forEach(chk => { chk.checked = false; });
          raiz.querySelectorAll('select').forEach(sel => { sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); });
          if (aoLimpar) aoLimpar();
        });
      }
    }
  }

  return {
    escaparHtml, mostrarCarregando, esconderCarregando, toast, abrirModal, fecharModal, aoFecharModal, modalFoiEditado, mostrarErro, lerArquivoBase64,
    formatarMoeda, parseValorBr, lerValorCampo, validarCamposMoeda, formatarData, formatarDataBr, rotuloPerfil, calcularPrazoContratoUnidade, corAlertaPrazo,
    listaCompetencias, listaAnos, opcoesCompetenciaHtml, opcoesTamanhoPaginaHtml, tornarPesquisavel,
    criarFiltroMultiplo, valoresFiltroMultiplo, limparFiltroMultiplo, definirValoresFiltroMultiplo,
    atualizarOpcoesFiltroMultiplo, aplicarFacetas, ligarLimpezaFiltros, seloStatusReciboHtml, corStatusReciboEstilo
  };
})();

const App = (function () {
  const TELAS = {
    dashboard: () => Dashboard.render(),
    sof: (opts) => TelaSof.render(opts),
    notasEmpenho: (opts) => TelaNotasEmpenho.render(opts),
    recibos: (opts) => TelaRecibos.render(opts),
    unidades: () => TelaUnidades.render(),
    metasProcessos: () => TelaMetasProcessos.render(),
    listas: () => TelaListas.render(),
    logAuditoria: () => TelaLogAuditoria.render(),
    sugestoes: () => TelaSugestoes.render(),
    usuarios: () => TelaUsuarios.render()
  };

  function mostrarTelaLogin() {
    document.getElementById('appShell').classList.add('oculto');
    document.getElementById('telaLogin').classList.remove('oculto');
  }

  function mostrarApp() {
    const usuario = Auth.usuario();
    document.getElementById('telaLogin').classList.add('oculto');
    document.getElementById('appShell').classList.remove('oculto');
    document.getElementById('nomeUsuarioTopo').textContent = usuario.nome;
    document.getElementById('perfilUsuarioTopo').textContent = UI.rotuloPerfil(usuario.perfil);
    document.querySelectorAll('.somente-gerente').forEach(el => el.classList.toggle('oculto', !Auth.ehGerente()));
    navegarPara('dashboard');
    verificarTrocaSenhaObrigatoria_();
    preCarregarAbas_();
  }

  /**
   * Pré-carrega SOF/Notas de Empenho/Recibos/Unidades em segundo plano
   * assim que o app abre (sessão 2026-08-31, pedido do usuário: "as abas...
   * já sejam carregadas" ao entrar no app - Dashboard já carrega na hora,
   * por ser a tela inicial de navegarPara acima, sem precisar de nada extra
   * aqui). Cada TelaX.preCarregar() só aquece caches (Api.chamar com
   * {cache:true} e CacheAbas) sem tocar no DOM - a troca de aba real
   * (TELAS[tela] em navegarPara) encontra tudo pronto e fica quase
   * instantânea. Roda em paralelo, best-effort - cada preCarregar() já
   * engole os próprios erros, e mesmo se algum falhar por completo a
   * navegação manual pra aquela aba volta a carregar do zero normalmente,
   * exatamente como antes desta função existir.
   */
  async function preCarregarAbas_() {
    // Aquece a instância do Apps Script com UMA chamada barata antes de
    // soltar a rajada (medido em 2026-09-16, pedido do usuário: "às vezes
    // quando vou logar o sistema fica muito lento... e carrega com
    // informações incompletas"): com o script frio, a 1ª requisição leva
    // ~20-25s e as que chegam junto com ela morrem em HTTP 404; com ele
    // quente, 16 paralelas voltam em ~1,5s. Pagar o cold start uma vez, com
    // uma requisição só, evita perder a rajada inteira.
    try { await Api.chamar('ping', {}, { silencioso: true }); } catch (e) { /* segue mesmo assim */ }

    // Uma aba por vez, não as 4 de uma vez: cada preCarregar() já dispara 3-4
    // chamadas em paralelo internamente, e isso aqui é trabalho de segundo
    // plano - não precisa ser instantâneo, precisa não atrapalhar a tela que
    // o usuário está olhando.
    for (const tela of [TelaSof, TelaNotasEmpenho, TelaRecibos, TelaUnidades]) {
      try { await tela.preCarregar(); } catch (e) { /* best-effort, ver comentário acima */ }
    }
  }

  /**
   * Trava a tela no modal de troca de senha obrigatória (sessão 2026-08-26,
   * pedido do usuário) sempre que o usuário logado tem precisaTrocarSenha
   * true - primeiro login de um usuário novo, ou senha redefinida por um
   * Gerente/Administrador (ver criarUsuario/redefinirSenha, Usuarios.gs).
   * Chamado toda vez que a app é exibida (login novo OU sessão restaurada do
   * sessionStorage em App.init), pra cobrir também quem fechou a aba no meio
   * do fluxo sem chegar a trocar a senha. O overlay em si (index.html) não
   * tem X nem fecha ao clicar fora - só some depois que
   * formTrocaSenhaObrigatoria salva com sucesso, logo abaixo.
   */
  function verificarTrocaSenhaObrigatoria_() {
    const usuario = Auth.usuario();
    document.getElementById('sobreposicaoTrocaSenhaObrigatoria').classList.toggle('oculto', !(usuario && usuario.precisaTrocarSenha));
  }

  /**
   * "Minha conta" (sessão 2026-08-14, pedido do usuário) - um único botão
   * "Salvar Alterações" no rodapé salva nome e senha juntos. Os campos de
   * senha começam desabilitados; "Alterar senha" só os libera (não salva
   * nada sozinho) - some depois de clicado, já que seu trabalho acabou.
   * Salvar Alterações só chama alterarMinhaSenha se os campos foram
   * preenchidos (nada digitado = não pediu pra trocar senha, mesmo com os
   * campos liberados) - e só chama alterarMeuNome se o nome realmente
   * mudou, mesmo princípio de "não salvar à toa" já usado em todo card do
   * app (ver UI.modalFoiEditado).
   */
  function abrirModalPerfil() {
    const usuario = Auth.usuario();
    const corpo = `
      <div class="campo"><label>Nome exibido na aplicação *</label><input id="meuNome" value="${UI.escaparHtml(usuario.nome)}" required /></div>
      <div class="campo"><label>Login</label><input value="${UI.escaparHtml(usuario.login)}" disabled /></div>
      <div class="campo"><label>Perfil</label><input value="${UI.escaparHtml(UI.rotuloPerfil(usuario.perfil))}" disabled /></div>
      <hr style="border:none;border-top:1px solid var(--cinza-200);margin:16px 0" />
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h4 style="margin:0">Alterar senha</h4>
        <button type="button" class="botao" id="btnAlterarSenha">Alterar senha</button>
      </div>
      <div class="campo"><label>Senha atual</label><input id="senhaAtual" type="password" disabled /></div>
      <div class="campo"><label>Nova senha</label><input id="senhaNova" type="password" disabled /></div>
      <div class="campo"><label>Confirmar nova senha</label><input id="senhaNovaConfirmacao" type="password" disabled /></div>
      <p id="perfilErro" class="erro-campo oculto"></p>`;

    UI.abrirModal('Minha conta', corpo,
      `<button class="botao" id="btnFecharPerfil">Fechar</button><button class="botao primario" id="btnSalvarAlteracoes">Salvar Alterações</button>`,
      { pequeno: true });

    document.getElementById('btnFecharPerfil').addEventListener('click', UI.fecharModal);

    document.getElementById('btnAlterarSenha').addEventListener('click', function () {
      ['senhaAtual', 'senhaNova', 'senhaNovaConfirmacao'].forEach(id => { document.getElementById(id).disabled = false; });
      document.getElementById('senhaAtual').focus();
      this.remove(); // já liberou os campos - não tem mais função aqui.
    });

    document.getElementById('btnSalvarAlteracoes').addEventListener('click', async () => {
      // Nada mudou: só fecha, sem chamar o backend à toa (mesmo
      // dirty-tracking usado em todo card do app - ver UI.modalFoiEditado).
      if (!UI.modalFoiEditado()) { UI.fecharModal(); return; }

      const erroEl = document.getElementById('perfilErro');
      erroEl.classList.add('oculto');

      const novoNome = document.getElementById('meuNome').value.trim();
      if (!novoNome) { UI.mostrarErro(erroEl, 'Informe o nome.'); return; }

      const senhaAtual = document.getElementById('senhaAtual').value;
      const senhaNova = document.getElementById('senhaNova').value;
      const senhaNovaConfirmacao = document.getElementById('senhaNovaConfirmacao').value;
      // Campo liberado mas deixado em branco não conta como "quis trocar" -
      // só entra em jogo se algo foi de fato digitado.
      const querTrocarSenha = !!(senhaAtual || senhaNova || senhaNovaConfirmacao);
      if (querTrocarSenha) {
        if (!senhaAtual || !senhaNova) { UI.mostrarErro(erroEl, 'Informe a senha atual e a nova senha.'); return; }
        if (senhaNova.length < 6) { UI.mostrarErro(erroEl, 'A nova senha deve ter pelo menos 6 caracteres.'); return; }
        if (senhaNova !== senhaNovaConfirmacao) { UI.mostrarErro(erroEl, 'A confirmação não confere com a nova senha.'); return; }
      }

      try {
        // Senha primeiro: se a senha atual estiver errada, o nome não chega
        // a ser alterado - evita salvar só metade do que foi pedido.
        if (querTrocarSenha) {
          await Api.chamar('alterarMinhaSenha', { senhaAtual, novaSenha: senhaNova });
        }
        if (novoNome !== usuario.nome) {
          await Api.chamar('alterarMeuNome', { novoNome });
          Auth.atualizarNomeLocal(novoNome);
          document.getElementById('nomeUsuarioTopo').textContent = novoNome;
        }
        UI.toast('Alterações salvas com sucesso.', 'sucesso');
        UI.fecharModal();
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  function navegarPara(tela, opts) {
    document.querySelectorAll('#barraLateral nav button').forEach(btn => {
      btn.classList.toggle('ativo', btn.dataset.tela === tela);
    });
    document.getElementById('tituloTopo').textContent = document.querySelector(
      '#barraLateral nav button[data-tela="' + tela + '"]'
    ).textContent;
    document.getElementById('conteudo').innerHTML = '';
    TELAS[tela](opts);
  }

  function fecharMenuMobile() {
    document.getElementById('barraLateral').classList.remove('aberta');
    document.getElementById('fundoMenuMobile').classList.add('oculto');
  }

  function init() {
    Tema.montarControles();

    document.querySelectorAll('#barraLateral nav button').forEach(btn => {
      btn.addEventListener('click', () => { navegarPara(btn.dataset.tela); fecharMenuMobile(); });
    });

    document.getElementById('btnMenuMobile').addEventListener('click', () => {
      document.getElementById('barraLateral').classList.add('aberta');
      document.getElementById('fundoMenuMobile').classList.remove('oculto');
    });
    document.getElementById('fundoMenuMobile').addEventListener('click', fecharMenuMobile);

    document.getElementById('btnSair').addEventListener('click', () => {
      Auth.encerrarSessaoLocal();
      mostrarTelaLogin();
    });

    document.querySelector('#barraTopo .usuario-info').addEventListener('click', abrirModalPerfil);

    document.getElementById('formLogin').addEventListener('submit', async function (e) {
      e.preventDefault();
      const erroEl = document.getElementById('loginErro');
      erroEl.classList.add('oculto');
      const login = document.getElementById('loginUsuario').value.trim();
      const senha = document.getElementById('loginSenha').value;
      if (!login || !senha) {
        UI.mostrarErro(erroEl, 'Preencha usuário e senha.');
        return;
      }
      try {
        await Auth.login(login, senha);
        mostrarApp();
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });

    document.getElementById('formTrocaSenhaObrigatoria').addEventListener('submit', async function (e) {
      e.preventDefault();
      const erroEl = document.getElementById('primeiroLoginErro');
      erroEl.classList.add('oculto');
      const novaSenha = document.getElementById('primeiroLoginSenhaNova').value;
      const confirmacao = document.getElementById('primeiroLoginSenhaConfirmacao').value;
      if (novaSenha.length < 6) { UI.mostrarErro(erroEl, 'A nova senha deve ter pelo menos 6 caracteres.'); return; }
      if (novaSenha !== confirmacao) { UI.mostrarErro(erroEl, 'A confirmação não confere com a nova senha.'); return; }
      try {
        await Api.chamar('trocarSenhaPrimeiroLogin', { novaSenha });
        Auth.limparPrecisaTrocarSenhaLocal();
        this.reset();
        document.getElementById('sobreposicaoTrocaSenhaObrigatoria').classList.add('oculto');
        UI.toast('Senha alterada com sucesso.', 'sucesso');
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });

    if (Auth.carregarSessaoSalva()) {
      mostrarApp();
    } else {
      mostrarTelaLogin();
    }
  }

  return { init, mostrarTelaLogin, mostrarApp, navegarPara };
})();

document.addEventListener('DOMContentLoaded', App.init);
