/**
 * GAOCG App - Fluxograma GAOCG (sessão 2026-10-06, pedido do usuário).
 *
 * Visualizador próprio da modelagem de processos exportada pelo Bizagi
 * Modeler ("Publicar > Web"), copiada em fluxograma-gaocg/ - só as partes
 * que o app usa: files/diagrams/*.svg (o desenho de cada diagrama) e
 * libs/js/json/configuration.json.js (o modelo: páginas, elementos,
 * descrições e qual subprocesso cada "Call Activity" chama). Para atualizar,
 * exporte de novo pelo Bizagi e substitua essas duas partes - nada aqui
 * depende de nome de processo, tudo é lido do modelo.
 *
 * O motivo de não usar o visualizador do próprio Bizagi: um mesmo
 * subprocesso (ex.: Atesto) é chamado por vários processos, e o Bizagi só
 * oferece a lista "Chamada por" - o usuário se perde. Aqui a navegação
 * guarda o CAMINHO percorrido (`pilha`, mostrado como trilha no topo):
 * clicar num subprocesso empilha; clicar no evento de fim desempilha e volta
 * pro processo de onde o usuário veio, destacando o bloco por onde ele
 * entrou. Sem processo anterior (subprocesso aberto direto pelo seletor), o
 * evento de fim mostra os processos que chamam aquele subprocesso.
 *
 * Eventos de fim: o modelo só traz os que têm documentação (ex.: Atesto),
 * então também são reconhecidos pelo desenho - o Bizagi pinta todo evento
 * de fim com o preenchimento #EEAAAA (COR_EVENTO_FIM_).
 */

const TelaFluxograma = (function () {
  const BASE_ = 'fluxograma-gaocg/';
  const COR_EVENTO_FIM_ = '#EEAAAA';
  const TIPOS_CONTAINER_ = ['Participant', 'Lane', 'SequenceFlow'];
  const ROTULOS_TIPO_ = {
    AbstractTask: 'Tarefa', UserTask: 'Tarefa de usuário', ManualTask: 'Tarefa manual', SendTask: 'Tarefa de envio',
    ReceiveTask: 'Tarefa de recebimento', ServiceTask: 'Tarefa de serviço', ScriptTask: 'Tarefa de script',
    CallActivity: 'Subprocesso', SubProcess: 'Subprocesso', ExclusiveGateway: 'Decisão', ParallelGateway: 'Paralelo',
    InclusiveGateway: 'Decisão inclusiva', ComplexGateway: 'Decisão complexa', EventBasedGateway: 'Decisão por evento',
    TimerIntermediate: 'Evento de tempo', Milestone: 'Marco'
  };

  let modelo = null;           // { paginas: {id: pagina}, ordem: [ids], chamadores: {id: [{paginaId, elementoId}]}, raizes: [ids] }
  let carregandoModelo = null; // Promise única do carregamento do modelo
  const cacheSvg_ = new Map(); // url -> texto do SVG
  let pilha = [];              // [{ paginaId, viaElementoId }] - viaElementoId: bloco do processo anterior por onde entrou
  let destaqueId = null;       // elemento a destacar ao renderizar (volta de subprocesso)
  let vbOriginal = null;       // viewBox do diagrama inteiro
  let vb = null;               // viewBox atual (zoom/pan)
  let svgAtual = null;
  let seqRender_ = 0;

  // ===================== MODELO =====================

  function caminhoArquivo_(caminhoBizagi) {
    return BASE_ + String(caminhoBizagi || '').split('\\').join('/');
  }

  function carregarModelo_() {
    if (modelo) return Promise.resolve(modelo);
    if (carregandoModelo) return carregandoModelo;
    carregandoModelo = new Promise((resolve, reject) => {
      window.Bizagi = window.Bizagi || {};
      const script = document.createElement('script');
      script.src = BASE_ + 'libs/js/json/configuration.json.js';
      script.onload = () => {
        try { resolve(montarModelo_(window.Bizagi.AppModel)); } catch (e) { reject(e); }
      };
      script.onerror = () => reject(new Error('Não foi possível carregar a modelagem dos processos.'));
      document.head.appendChild(script);
    }).then(m => { modelo = m; return m; }, err => { carregandoModelo = null; throw err; });
    return carregandoModelo;
  }

  function percorrer_(elementos, fn) {
    (elementos || []).forEach(e => { fn(e); percorrer_(e.pageElements, fn); percorrer_(e.elements, fn); });
  }

  /** Página (diagrama) chamada por um elemento - via propriedade com pageRef (ProcessRef das Call Activities). */
  function paginaChamada_(elemento, paginas) {
    const prop = (elemento.properties || []).find(p => p.pageRef && paginas[p.pageRef]);
    return prop ? prop.pageRef : null;
  }

  function montarModelo_(appModel) {
    if (!appModel || !Array.isArray(appModel.pages)) throw new Error('Modelagem dos processos em formato inesperado.');
    const paginas = {};
    appModel.pages.forEach(p => {
      const elementos = {};
      percorrer_(p.elements, e => { if (e.id) elementos[e.id] = e; });
      paginas[p.id] = { id: p.id, nome: p.name, descricao: p.description || '', autor: p.author || '', versao: p.version || '', imagem: caminhoArquivo_(p.image), elementos };
    });
    const chamadores = {};
    Object.values(paginas).forEach(p => {
      Object.values(p.elementos).forEach(e => {
        const alvo = paginaChamada_(e, paginas);
        if (!alvo || alvo === p.id) return;
        (chamadores[alvo] = chamadores[alvo] || []).push({ paginaId: p.id, elementoId: e.id });
      });
    });
    const ordem = appModel.pages.map(p => p.id);
    const raizes = ordem.filter(id => !chamadores[id]);
    return { paginas, ordem, chamadores, raizes };
  }

  // ===================== TELA =====================

  async function render() {
    document.getElementById('conteudo').innerHTML = `
      <div class="cabecalho-tela">
        <h2 class="titulo-tela">Fluxograma GAOCG</h2>
        <div class="acoes-tela">
          <select id="fxSeletor" aria-label="Abrir diagrama"><option>Carregando…</option></select>
        </div>
      </div>
      <div class="painel fx-painel">
        <nav class="fx-trilha" id="fxTrilha" aria-label="Caminho percorrido"></nav>
        <div class="fx-barra">
          <button type="button" class="botao" id="fxVoltar">← Voltar ao processo anterior</button>
          <span class="fx-barra-espaco"></span>
          <button type="button" class="botao" id="fxZoomMenos" title="Diminuir zoom" aria-label="Diminuir zoom">−</button>
          <button type="button" class="botao" id="fxZoomMais" title="Aumentar zoom" aria-label="Aumentar zoom">+</button>
          <button type="button" class="botao" id="fxAjustar">Ajustar à tela</button>
        </div>
        <p class="ajuda fx-dica">Clique num <strong>subprocesso</strong> para abri-lo. No <strong>evento de fim</strong> (círculo vermelho), você volta para o processo de onde veio. Arraste para mover; use a roda do mouse ou os botões para o zoom.</p>
        <div class="fx-corpo">
          <div class="fx-area" id="fxArea"><p class="estado-vazio">Carregando…</p></div>
          <aside class="fx-detalhe oculto" id="fxDetalhe" aria-live="polite"></aside>
        </div>
      </div>`;

    let m;
    try {
      m = await carregarModelo_();
    } catch (err) {
      document.getElementById('fxArea').innerHTML = `<p class="estado-vazio">${UI.escaparHtml(err.message)}</p>`;
      return;
    }
    // A tela pode ter sido trocada enquanto o modelo carregava.
    if (!document.getElementById('fxArea')) return;

    montarSeletor_(m);
    ligarBarra_();
    if (!pilha.length || !m.paginas[pilha[pilha.length - 1].paginaId]) pilha = [{ paginaId: m.raizes[0] || m.ordem[0], viaElementoId: null }];
    await mostrarAtual_();
  }

  function montarSeletor_(m) {
    const ehSub = id => !!m.chamadores[id];
    const opcao = id => `<option value="${UI.escaparHtml(id)}">${UI.escaparHtml(m.paginas[id].nome)}</option>`;
    const principais = m.ordem.filter(id => !ehSub(id));
    const subs = m.ordem.filter(ehSub).sort((a, b) => m.paginas[a].nome.localeCompare(m.paginas[b].nome, 'pt-BR'));
    const seletor = document.getElementById('fxSeletor');
    seletor.innerHTML = '<option value="">Ir direto para um diagrama…</option>' +
      (principais.length ? `<optgroup label="Processos">${principais.map(opcao).join('')}</optgroup>` : '') +
      (subs.length ? `<optgroup label="Subprocessos">${subs.map(opcao).join('')}</optgroup>` : '');
    seletor.addEventListener('change', () => {
      if (!seletor.value) return;
      pilha = [{ paginaId: seletor.value, viaElementoId: null }];
      destaqueId = null;
      seletor.value = '';
      mostrarAtual_();
    });
  }

  function ligarBarra_() {
    document.getElementById('fxVoltar').addEventListener('click', voltar_);
    document.getElementById('fxZoomMais').addEventListener('click', () => zoomCentro_(0.8));
    document.getElementById('fxZoomMenos').addEventListener('click', () => zoomCentro_(1.25));
    document.getElementById('fxAjustar').addEventListener('click', () => { if (vbOriginal) aplicarViewBox_(Object.assign({}, vbOriginal)); });
  }

  function renderTrilha_() {
    const trilha = document.getElementById('fxTrilha');
    if (!trilha) return;
    trilha.innerHTML = pilha.map((item, i) => {
      const nome = UI.escaparHtml(modelo.paginas[item.paginaId].nome);
      const ultimo = i === pilha.length - 1;
      return (i ? '<span class="fx-trilha-sep" aria-hidden="true">›</span>' : '') +
        (ultimo ? `<span class="fx-trilha-atual" aria-current="page">${nome}</span>` : `<button type="button" class="fx-trilha-item" data-indice="${i}">${nome}</button>`);
    }).join('');
    trilha.querySelectorAll('.fx-trilha-item').forEach(botao => {
      botao.addEventListener('click', () => irParaNivel_(Number(botao.dataset.indice)));
    });
    const voltar = document.getElementById('fxVoltar');
    voltar.disabled = pilha.length < 2;
    voltar.title = pilha.length < 2 ? 'Você está no início do caminho' : 'Voltar para: ' + modelo.paginas[pilha[pilha.length - 2].paginaId].nome;
  }

  // ===================== NAVEGAÇÃO =====================

  function abrirSubprocesso_(paginaId, viaElementoId) {
    // Ciclo (processo que já está no caminho): volta até ele em vez de empilhar de novo.
    const jaNoCaminho = pilha.findIndex(item => item.paginaId === paginaId);
    if (jaNoCaminho >= 0) { irParaNivel_(jaNoCaminho); return; }
    pilha.push({ paginaId, viaElementoId });
    destaqueId = null;
    mostrarAtual_();
  }

  /** Volta pro nível `indice` da trilha, destacando o bloco por onde o usuário tinha saído dele. */
  function irParaNivel_(indice) {
    if (indice < 0 || indice >= pilha.length - 1) return;
    destaqueId = pilha[indice + 1].viaElementoId;
    pilha = pilha.slice(0, indice + 1);
    mostrarAtual_();
  }

  function voltar_() {
    if (pilha.length < 2) return;
    const saindoDe = modelo.paginas[pilha[pilha.length - 1].paginaId].nome;
    irParaNivel_(pilha.length - 2);
    UI.toast('Fim de "' + saindoDe + '" - de volta a "' + modelo.paginas[pilha[pilha.length - 1].paginaId].nome + '".', 'info');
  }

  function aoClicarFim_() {
    if (pilha.length > 1) { voltar_(); return; }
    mostrarChamadores_();
  }

  // ===================== DIAGRAMA =====================

  async function mostrarAtual_() {
    const minha = ++seqRender_;
    const pagina = modelo.paginas[pilha[pilha.length - 1].paginaId];
    renderTrilha_();
    fecharDetalhe_();
    const area = document.getElementById('fxArea');
    area.classList.add('fx-carregando');
    let texto;
    try {
      texto = await obterSvg_(pagina.imagem);
    } catch (err) {
      if (minha === seqRender_) { area.classList.remove('fx-carregando'); area.innerHTML = `<p class="estado-vazio">${UI.escaparHtml(err.message)}</p>`; }
      return;
    }
    if (minha !== seqRender_ || !document.getElementById('fxArea')) return;
    area.classList.remove('fx-carregando');

    const svg = criarSvgSeguro_(texto);
    if (!svg) { area.innerHTML = '<p class="estado-vazio">Não foi possível exibir este diagrama.</p>'; return; }
    area.innerHTML = '';
    area.appendChild(svg);
    svgAtual = svg;
    vbOriginal = lerViewBox_(svg);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    aplicarViewBox_(Object.assign({}, vbOriginal));
    marcarElementos_(svg, pagina);
    ligarPanZoom_(area, svg);

    if (destaqueId) {
      const alvo = svg.querySelector(`[data-element-id="${CSS.escape(destaqueId)}"]`);
      if (alvo) { alvo.classList.add('fx-destaque'); centralizarEm_(alvo); }
      destaqueId = null;
    }
  }

  async function obterSvg_(url) {
    if (cacheSvg_.has(url)) return cacheSvg_.get(url);
    const resposta = await fetch(encodeURI(url));
    if (!resposta.ok) throw new Error('Diagrama não encontrado (' + resposta.status + ').');
    const texto = await resposta.text();
    cacheSvg_.set(url, texto);
    return texto;
  }

  /**
   * SVG vem do próprio repositório (exportação do Bizagi), mas entra na
   * página como DOM - então passa pelo mesmo cuidado de sempre: sem
   * <script>/<foreignObject>, sem atributos on*, e href só de âncora interna
   * ou imagem embutida (data:image/...).
   */
  function criarSvgSeguro_(texto) {
    const doc = new DOMParser().parseFromString(texto, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
    svg.querySelectorAll('script, foreignObject, iframe, object, embed').forEach(n => n.remove());
    [svg, ...svg.querySelectorAll('*')].forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        const nome = attr.name.toLowerCase();
        const valor = String(attr.value || '').trim().toLowerCase();
        if (nome.startsWith('on')) el.removeAttribute(attr.name);
        else if ((nome === 'href' || nome === 'xlink:href') && !(valor.startsWith('#') || valor.startsWith('data:image/'))) el.removeAttribute(attr.name);
      });
    });
    return document.importNode(svg, true);
  }

  function lerViewBox_(svg) {
    const partes = String(svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    if (partes.length === 4 && partes.every(n => isFinite(n)) && partes[2] > 0 && partes[3] > 0) {
      return { x: partes[0], y: partes[1], w: partes[2], h: partes[3] };
    }
    const w = parseFloat(svg.getAttribute('width')) || 1000;
    const h = parseFloat(svg.getAttribute('height')) || 600;
    return { x: 0, y: 0, w, h };
  }

  function aplicarViewBox_(novo) {
    if (!svgAtual) return;
    // Limites de zoom: de 8x de aproximação até 3x o diagrama inteiro.
    const minW = vbOriginal.w / 8, maxW = vbOriginal.w * 3;
    if (novo.w < minW) { const f = minW / novo.w; novo.x -= (novo.w * f - novo.w) / 2; novo.y -= (novo.h * f - novo.h) / 2; novo.w *= f; novo.h *= f; }
    if (novo.w > maxW) { const f = maxW / novo.w; novo.x -= (novo.w * f - novo.w) / 2; novo.y -= (novo.h * f - novo.h) / 2; novo.w *= f; novo.h *= f; }
    vb = novo;
    svgAtual.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }

  /** Converte um ponto da tela (clientX/Y) em coordenada do SVG. */
  function pontoSvg_(clientX, clientY) {
    const ctm = svgAtual.getScreenCTM();
    if (!ctm) return { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function zoomEm_(fator, ponto) {
    aplicarViewBox_({
      x: ponto.x - (ponto.x - vb.x) * fator,
      y: ponto.y - (ponto.y - vb.y) * fator,
      w: vb.w * fator,
      h: vb.h * fator
    });
  }

  function zoomCentro_(fator) {
    if (!vb) return;
    zoomEm_(fator, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });
  }

  /** Caixa do elemento em coordenadas do SVG (considerando as transformações dos grupos). */
  function caixaNoSvg_(el) {
    const b = el.getBBox();
    const m = svgAtual.getScreenCTM().inverse().multiply(el.getScreenCTM());
    const cantos = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
      .map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
    const xs = cantos.map(p => p.x), ys = cantos.map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  /** Aproxima e centraliza no elemento (volta de subprocesso), sem passar do diagrama inteiro. */
  function centralizarEm_(el) {
    try {
      const c = caixaNoSvg_(el);
      const proporcao = vbOriginal.h / vbOriginal.w;
      const w = Math.min(vbOriginal.w, Math.max(c.w * 5, 900));
      const h = w * proporcao;
      aplicarViewBox_({ x: c.x + c.w / 2 - w / 2, y: c.y + c.h / 2 - h / 2, w, h });
    } catch (e) { /* sem layout ainda - fica no diagrama inteiro */ }
  }

  /**
   * Torna clicáveis os elementos do diagrama: subprocessos (abrem o
   * diagrama chamado), eventos de fim (voltam pro processo anterior) e
   * tarefas/decisões/eventos (mostram a descrição). Raias/participantes
   * ficam de fora - ocupam o fundo inteiro e atrapalhariam o arrastar.
   */
  function marcarElementos_(svg, pagina) {
    const anterior = pilha.length > 1 ? modelo.paginas[pilha[pilha.length - 2].paginaId] : null;
    svg.querySelectorAll('g.djs-shape[data-element-id]').forEach(g => {
      const id = g.getAttribute('data-element-id');
      const elemento = pagina.elementos[id];
      const visual = g.querySelector(':scope > .djs-visual');
      const ehFim = elemento ? /End$/.test(elemento.elementType || '') : !!(visual && visual.innerHTML.indexOf(COR_EVENTO_FIM_) >= 0);
      const alvo = elemento ? paginaChamada_(elemento, modelo.paginas) : null;

      // Sem elemento no modelo e sem ser evento de fim = rótulo/decoração. O
      // Bizagi desenha o texto de cada bloco como uma forma SEPARADA, por
      // cima do bloco - sem isto, clicar no texto de um subprocesso não
      // chegaria nele (achado testando: o clique caía no rótulo).
      if (!elemento && !ehFim) { g.classList.add('fx-rotulo'); return; }

      let acao = null, dica = '';
      if (ehFim) {
        acao = () => aoClicarFim_();
        dica = anterior ? 'Fim - voltar para: ' + anterior.nome : 'Fim do processo';
        g.classList.add('fx-fim');
      } else if (alvo) {
        acao = () => abrirSubprocesso_(alvo, id);
        dica = 'Abrir: ' + modelo.paginas[alvo].nome;
        g.classList.add('fx-subprocesso');
      } else if (elemento && TIPOS_CONTAINER_.indexOf(elemento.elementType) === -1) {
        acao = () => mostrarDetalhe_(elemento);
        dica = elemento.name || '';
      }
      if (!acao) return;
      g.classList.add('fx-clicavel');
      g._fxAcao = acao;
      if (dica) {
        const titulo = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        titulo.textContent = dica;
        g.insertBefore(titulo, g.firstChild);
      }
    });
  }

  /** Reforço do clique: o menor elemento clicável cuja caixa contém o ponto (ex.: clique num pedaço de rótulo que ainda captura o ponteiro). */
  function clicavelNoPonto_(svg, x, y) {
    let melhor = null, menorArea = Infinity;
    svg.querySelectorAll('.fx-clicavel').forEach(g => {
      const visual = g.querySelector(':scope > .djs-visual') || g;
      const r = visual.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return;
      const area = r.width * r.height;
      if (area < menorArea) { menorArea = area; melhor = g; }
    });
    return melhor;
  }

  function ligarPanZoom_(area, svg) {
    const ponteiros = new Map();
    let inicio = null;    // { x, y, vb } do arrasto com 1 dedo/mouse
    let pinca = null;     // { dist, vb, centro } da pinça com 2 dedos
    let moveu = false;

    svg.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button !== 0) return;
      ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      svg.setPointerCapture(e.pointerId);
      moveu = false;
      if (ponteiros.size === 1) {
        inicio = { x: e.clientX, y: e.clientY, vb: Object.assign({}, vb), alvo: e.target };
      } else if (ponteiros.size === 2) {
        const [a, b] = [...ponteiros.values()];
        pinca = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, vb: Object.assign({}, vb), centro: pontoSvg_((a.x + b.x) / 2, (a.y + b.y) / 2) };
        inicio = null;
      }
    });

    svg.addEventListener('pointermove', e => {
      if (!ponteiros.has(e.pointerId)) return;
      ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinca && ponteiros.size === 2) {
        const [a, b] = [...ponteiros.values()];
        const fator = pinca.dist / (Math.hypot(a.x - b.x, a.y - b.y) || 1);
        moveu = true;
        vb = Object.assign({}, pinca.vb);
        zoomEm_(fator, pinca.centro);
        return;
      }
      if (!inicio) return;
      const dx = e.clientX - inicio.x, dy = e.clientY - inicio.y;
      if (!moveu && Math.hypot(dx, dy) < 5) return;
      moveu = true;
      area.classList.add('fx-arrastando');
      const escala = inicio.vb.w / svg.getBoundingClientRect().width;
      aplicarViewBox_({ x: inicio.vb.x - dx * escala, y: inicio.vb.y - dy * escala, w: inicio.vb.w, h: inicio.vb.h });
    });

    const soltar = e => {
      if (!ponteiros.has(e.pointerId)) return;
      ponteiros.delete(e.pointerId);
      area.classList.remove('fx-arrastando');
      if (ponteiros.size < 2) pinca = null;
      // Clique = soltar sem ter arrastado: dispara a ação do elemento sob o ponteiro.
      if (e.type === 'pointerup' && inicio && !moveu && ponteiros.size === 0) {
        const g = (inicio.alvo && inicio.alvo.closest ? inicio.alvo.closest('.fx-clicavel') : null) || clicavelNoPonto_(svg, inicio.x, inicio.y);
        if (g && g._fxAcao) g._fxAcao();
      }
      if (ponteiros.size === 0) inicio = null;
    };
    svg.addEventListener('pointerup', soltar);
    svg.addEventListener('pointercancel', soltar);

    // A área continua a mesma entre diagramas - liga a roda uma vez só.
    if (!area._fxRodaLigada) {
      area._fxRodaLigada = true;
      area.addEventListener('wheel', e => {
        if (!svgAtual || !vb) return;
        e.preventDefault();
        zoomEm_(e.deltaY > 0 ? 1.15 : 1 / 1.15, pontoSvg_(e.clientX, e.clientY));
      }, { passive: false });
    }
  }

  // ===================== PAINEL DE DETALHES =====================

  /** Descrição do Bizagi vem em HTML (Word-like, com estilos inline) - vira só texto, parágrafo a parágrafo. */
  function descricaoParaHtml_(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    const blocos = [];
    doc.body.querySelectorAll('p, li, div').forEach(el => {
      if (el.querySelector('p, li, div')) return;
      const texto = el.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      if (texto) blocos.push(texto);
    });
    if (!blocos.length) {
      const texto = doc.body.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      if (texto) blocos.push(texto);
    }
    return blocos.map(t => `<p>${UI.escaparHtml(t)}</p>`).join('');
  }

  function linksDoElemento_(elemento) {
    return (elemento.properties || [])
      .filter(p => p.type === 'url' && !p.pageRef && /^https?:\/\//i.test(String(p.value || '')))
      .map(p => `<li><a href="${UI.escaparHtml(p.value)}" target="_blank" rel="noopener noreferrer">${UI.escaparHtml(p.name && p.name !== p.id ? p.name : 'Abrir link')}</a></li>`);
  }

  function abrirPainel_(html) {
    const painel = document.getElementById('fxDetalhe');
    if (!painel) return;
    painel.innerHTML = '<button type="button" class="fx-detalhe-fechar" aria-label="Fechar">&times;</button>' + html;
    painel.classList.remove('oculto');
    painel.querySelector('.fx-detalhe-fechar').addEventListener('click', fecharDetalhe_);
  }

  function fecharDetalhe_() {
    const painel = document.getElementById('fxDetalhe');
    if (painel) { painel.classList.add('oculto'); painel.innerHTML = ''; }
  }

  function mostrarDetalhe_(elemento) {
    const tipo = ROTULOS_TIPO_[elemento.elementType] ||
      (/Start$/.test(elemento.elementType) ? 'Evento de início' : (/Intermediate$/.test(elemento.elementType) ? 'Evento intermediário' : elemento.elementType));
    const descricao = descricaoParaHtml_(elemento.description);
    const links = linksDoElemento_(elemento);
    abrirPainel_(`
      <span class="fx-detalhe-tipo">${UI.escaparHtml(tipo)}</span>
      <h3>${UI.escaparHtml(elemento.name || '(sem nome)')}</h3>
      ${descricao || '<p class="ajuda">Sem descrição cadastrada no Bizagi.</p>'}
      ${links.length ? `<h4>Links</h4><ul>${links.join('')}</ul>` : ''}`);
  }

  /** Evento de fim sem processo anterior no caminho: oferece os processos que chamam este subprocesso. */
  function mostrarChamadores_() {
    const atual = pilha[pilha.length - 1].paginaId;
    const chamadores = modelo.chamadores[atual] || [];
    if (!chamadores.length) {
      UI.toast('Fim do processo "' + modelo.paginas[atual].nome + '".', 'info');
      return;
    }
    abrirPainel_(`
      <span class="fx-detalhe-tipo">Fim do subprocesso</span>
      <h3>${UI.escaparHtml(modelo.paginas[atual].nome)}</h3>
      <p>Você abriu este subprocesso diretamente. Para qual processo quer voltar?</p>
      <div class="fx-chamadores">
        ${chamadores.map((c, i) => `<button type="button" class="botao" data-indice="${i}">${UI.escaparHtml(modelo.paginas[c.paginaId].nome)}</button>`).join('')}
      </div>`);
    document.querySelectorAll('#fxDetalhe .fx-chamadores [data-indice]').forEach(botao => {
      botao.addEventListener('click', () => {
        const c = chamadores[Number(botao.dataset.indice)];
        pilha = [{ paginaId: c.paginaId, viaElementoId: null }];
        destaqueId = c.elementoId;
        mostrarAtual_();
      });
    });
  }

  return { render };
})();
