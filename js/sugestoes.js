/**
 * GAOCG App - Sugestões (sessão 2026-08-14, pedido do usuário).
 *
 * Qualquer usuário autenticado pode enviar uma sugestão sobre o app. Cada um
 * vê só as próprias (o backend já filtra - ver listarSugestoes,
 * backend/Sugestoes.gs) - exceto o Administrador do Aplicativo, que vê
 * todas e é quem dá o feedback.
 *
 * Fluxo de status: Aguardando análise -> Em análise (Administrador abriu) ->
 * Lida (Administrador respondeu). Editar o texto depois de "Lida" reabre pra
 * "Aguardando análise" (pedido do usuário - evita feedback desatualizado em
 * cima de um texto que já mudou).
 */
const TelaSugestoes = (function () {
  let sugestoes = [];
  let mapaUsuarios_ = {};

  const CORES_STATUS_ = {
    'Aguardando análise': 'amarelo',
    'Em análise': 'azul',
    'Lida': 'verde'
  };

  // ===== Fotos na sugestão (sessão 2026-11-09, pedido do usuário) =====
  // Até 5 imagens por sugestão, escolhidas no botão ou coladas (Ctrl+V) no
  // formulário. Antes de enviar, cada foto é reduzida no navegador (lado maior
  // até 1600 px, JPEG) para caber folgada no limite de 4 MB do backend
  // (validarFotosSugestao_, backend/Sugestoes.gs). A exibição pede cada imagem
  // ao backend (obterFotoSugestao), que só entrega ao autor e ao Administrador.
  const MAX_FOTOS_ = 5;
  const LADO_MAX_FOTO_ = 1600;
  const MAX_BYTES_FOTO_ = 4 * 1024 * 1024;
  const ICONE_FOTO_ = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/></svg>';

  function carregarImagem_(arquivo) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir a imagem "' + (arquivo.name || 'colada') + '".')); };
      img.src = url;
    });
  }

  function blobParaBase64_(blob) {
    return UI.lerArquivoBase64(blob);
  }

  /**
   * Arquivo de imagem -> { nome, tipo, base64, previa }. GIF vai como está
   * (redimensionar perderia a animação). PNG pequeno também, pra print de tela
   * continuar nítido; o resto é reduzido e convertido em JPEG.
   */
  async function prepararFoto_(arquivo) {
    const tipoOriginal = String(arquivo.type || '').toLowerCase();
    if (!/^image\/(jpeg|png|webp|gif)$/.test(tipoOriginal)) {
      throw new Error('"' + (arquivo.name || 'arquivo') + '" não é uma imagem aceita (JPG, PNG, WEBP ou GIF).');
    }
    const nomeBase = String(arquivo.name || 'print').replace(/\.[^.]+$/, '') || 'foto';
    if (tipoOriginal === 'image/gif') {
      if (arquivo.size > MAX_BYTES_FOTO_) throw new Error('O GIF "' + arquivo.name + '" passa de 4 MB.');
      return { nome: nomeBase + '.gif', tipo: 'image/gif', base64: await blobParaBase64_(arquivo), previa: URL.createObjectURL(arquivo) };
    }
    const img = await carregarImagem_(arquivo);
    const maiorLado = Math.max(img.naturalWidth, img.naturalHeight);
    if (tipoOriginal === 'image/png' && maiorLado <= LADO_MAX_FOTO_ && arquivo.size <= 1.5 * 1024 * 1024) {
      return { nome: nomeBase + '.png', tipo: 'image/png', base64: await blobParaBase64_(arquivo), previa: URL.createObjectURL(arquivo) };
    }
    const escala = Math.min(1, LADO_MAX_FOTO_ / maiorLado);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // fundo branco no lugar da transparência do PNG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Não foi possível preparar a imagem "' + (arquivo.name || 'colada') + '".');
    if (blob.size > MAX_BYTES_FOTO_) throw new Error('A imagem "' + (arquivo.name || 'colada') + '" continua acima de 4 MB depois de reduzida.');
    return { nome: nomeBase + '.jpg', tipo: 'image/jpeg', base64: await blobParaBase64_(blob), previa: URL.createObjectURL(blob) };
  }

  /** base64 vindo do backend -> URL de Blob para <img> e para abrir em outra aba. */
  function base64ParaUrl_(base64, tipo) {
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: tipo || 'image/jpeg' }));
  }

  /** Miniaturas da sugestão aberta: cada foto é pedida ao backend e cai no lugar do "Carregando..." correspondente. */
  function carregarFotosDetalhe_(sugestao) {
    const grade = document.getElementById('detalheSugestaoFotos');
    if (!grade) return;
    const urls = [];
    UI.aoFecharModal(() => urls.forEach(u => URL.revokeObjectURL(u)));
    (sugestao.fotos || []).forEach(foto => {
      const slot = grade.querySelector(`[data-foto="${CSS.escape(String(foto.id))}"]`);
      Api.chamar('obterFotoSugestao', { id: sugestao.id, foto_id: foto.id }, { cache: true, semSpinner: true })
        .then(res => {
          if (!slot || !slot.isConnected) return;
          const url = base64ParaUrl_(res.base64, res.tipo);
          urls.push(url);
          slot.innerHTML = `<a href="${url}" target="_blank" rel="noopener" title="Abrir em tamanho real"><img src="${url}" alt="${UI.escaparHtml(foto.nome || 'Foto da sugestão')}" /></a>`;
        })
        .catch(err => {
          if (slot && slot.isConnected) slot.innerHTML = `<span class="ajuda">${UI.escaparHtml(err.message)}</span>`;
        });
    });
  }

  async function render() {
    const container = document.getElementById('conteudo');
    const souAdmin = Auth.ehAdministrador();
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 class="titulo-tela" style="margin:0">Sugestões</h2>
        <button class="botao primario" id="btnNovaSugestao">+ Nova sugestão</button>
      </div>
      <div class="painel">
        <p class="ajuda">${souAdmin ? 'Você vê as sugestões de todos os usuários.' : 'Você vê só as sugestões que você mesmo enviou.'}</p>
        <div id="listaSugestoes"></div>
      </div>`;
    document.getElementById('btnNovaSugestao').addEventListener('click', abrirFormularioNova_);
    if (souAdmin) await carregarMapaUsuarios_();
    await carregar();
  }

  /** Só o Administrador precisa resolver usuario_id -> nome (pra saber quem enviou cada uma). */
  async function carregarMapaUsuarios_() {
    try {
      const usuarios = await Api.chamar('listarUsuarios', {}, { cache: true });
      mapaUsuarios_ = {};
      usuarios.forEach(u => { mapaUsuarios_[u.id] = u.nome; });
    } catch (e) {
      // Cosmético (só usado pra exibir o nome do autor) - falha silenciosa.
    }
  }

  async function carregar() {
    sugestoes = await Api.chamar('listarSugestoes', {});
    renderLista();
  }

  function renderLista() {
    const alvo = document.getElementById('listaSugestoes');
    if (!sugestoes.length) {
      alvo.innerHTML = '<p class="estado-vazio">Nenhuma sugestão ainda.</p>';
      return;
    }
    const souAdmin = Auth.ehAdministrador();
    alvo.innerHTML = sugestoes.map(s => `
      <div class="cartao-sugestao" data-id="${s.id}">
        <div class="cartao-sugestao-topo">
          ${souAdmin ? `<strong>${UI.escaparHtml(mapaUsuarios_[s.usuario_id] || s.usuario_id)}</strong>` : `<span class="ajuda">${UI.formatarData(s.data_criacao)}</span>`}
          <span class="selo ${CORES_STATUS_[s.status] || 'cinza'}">${UI.escaparHtml(s.status)}</span>
        </div>
        <p class="cartao-sugestao-texto">${UI.escaparHtml(s.texto)}</p>
        ${(s.fotos || []).length ? `<p class="cartao-sugestao-fotos">${ICONE_FOTO_} ${s.fotos.length} foto${s.fotos.length === 1 ? '' : 's'} anexada${s.fotos.length === 1 ? '' : 's'}</p>` : ''}
        ${s.feedback_administrador ? `<p class="cartao-sugestao-feedback"><strong>Feedback do Administrador:</strong> ${UI.escaparHtml(s.feedback_administrador)}</p>` : ''}
      </div>`).join('');

    alvo.querySelectorAll('.cartao-sugestao').forEach(cartao => {
      cartao.addEventListener('click', () => abrirDetalhe_(sugestoes.find(s => s.id === cartao.dataset.id)));
    });
  }

  function abrirFormularioNova_() {
    const corpo = `
      <form id="formNovaSugestao">
        <div class="campo"><label>Sua sugestão *</label><textarea id="novaSugestaoTexto" rows="5" required placeholder="Conte sua ideia, problema ou sugestão de melhoria para o GAOCG App..."></textarea></div>
        <div class="campo">
          <label>Fotos (opcional)</label>
          <div class="sugestao-fotos-acoes">
            <button type="button" class="botao" id="btnAnexarFotosSugestao">${ICONE_FOTO_} Anexar fotos</button>
            <input type="file" id="novaSugestaoFotos" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden />
            <span class="ajuda" id="novaSugestaoFotosContagem">Até ${MAX_FOTOS_} imagens. Também dá para colar um print com Ctrl+V.</span>
          </div>
          <div id="novaSugestaoPrevias" class="sugestao-fotos-grade"></div>
        </div>
        <p id="novaSugestaoErro" class="erro-campo oculto"></p>
      </form>`;
    UI.abrirModal('Nova sugestão', corpo,
      `<button class="botao" id="btnCancelarSugestao">Cancelar</button><button class="botao primario" id="btnEnviarSugestao">Enviar sugestão</button>`,
      { pequeno: true });

    const fotos = [];
    const erroEl = document.getElementById('novaSugestaoErro');
    const inputFotos = document.getElementById('novaSugestaoFotos');
    const form = document.getElementById('formNovaSugestao');

    function renderPrevias_() {
      const alvo = document.getElementById('novaSugestaoPrevias');
      if (!alvo) return;
      alvo.innerHTML = fotos.map((f, i) => `
        <div class="sugestao-foto">
          <img src="${f.previa}" alt="${UI.escaparHtml(f.nome)}" />
          <button type="button" class="sugestao-foto-remover" data-indice="${i}" title="Remover foto" aria-label="Remover foto">&times;</button>
        </div>`).join('');
      alvo.querySelectorAll('.sugestao-foto-remover').forEach(btn => {
        btn.addEventListener('click', () => {
          const [removida] = fotos.splice(Number(btn.dataset.indice), 1);
          if (removida) URL.revokeObjectURL(removida.previa);
          renderPrevias_();
        });
      });
      const contagem = document.getElementById('novaSugestaoFotosContagem');
      if (contagem) contagem.textContent = fotos.length
        ? `${fotos.length} de ${MAX_FOTOS_} foto${fotos.length === 1 ? '' : 's'}`
        : `Até ${MAX_FOTOS_} imagens. Também dá para colar um print com Ctrl+V.`;
      document.getElementById('btnAnexarFotosSugestao').disabled = fotos.length >= MAX_FOTOS_;
    }

    async function adicionarArquivos_(arquivos) {
      erroEl.classList.add('oculto');
      const lista = Array.from(arquivos || []);
      if (!lista.length) return;
      const vagas = MAX_FOTOS_ - fotos.length;
      if (lista.length > vagas) UI.mostrarErro(erroEl, `Só cabem mais ${vagas} foto${vagas === 1 ? '' : 's'} (máximo de ${MAX_FOTOS_}).`);
      for (const arquivo of lista.slice(0, Math.max(vagas, 0))) {
        try {
          fotos.push(await prepararFoto_(arquivo));
        } catch (err) {
          UI.mostrarErro(erroEl, err.message);
        }
      }
      renderPrevias_();
    }

    document.getElementById('btnAnexarFotosSugestao').addEventListener('click', () => inputFotos.click());
    inputFotos.addEventListener('change', async () => {
      await adicionarArquivos_(inputFotos.files);
      inputFotos.value = '';
    });
    // Colar print (Ctrl+V) em qualquer ponto do formulário.
    form.addEventListener('paste', e => {
      const imagens = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(f => /^image\//.test(f.type));
      if (!imagens.length) return;
      e.preventDefault();
      adicionarArquivos_(imagens);
    });
    UI.aoFecharModal(() => fotos.forEach(f => URL.revokeObjectURL(f.previa)));

    document.getElementById('btnCancelarSugestao').addEventListener('click', UI.fecharModal);
    const btnEnviar = document.getElementById('btnEnviarSugestao');
    btnEnviar.addEventListener('click', async () => {
      erroEl.classList.add('oculto');
      const texto = document.getElementById('novaSugestaoTexto').value.trim();
      if (!texto) { UI.mostrarErro(erroEl, 'Escreva sua sugestão antes de enviar.'); return; }
      btnEnviar.disabled = true;
      try {
        await Api.chamar('criarSugestao', { data: { texto, fotos: fotos.map(f => ({ nome: f.nome, tipo: f.tipo, base64: f.base64 })) } });
        UI.toast('Sugestão enviada. Obrigado!', 'sucesso');
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      } finally {
        btnEnviar.disabled = false;
      }
    });
  }

  /**
   * Administrador abrindo uma "Aguardando análise" pela 1ª vez: marca "Em
   * análise" ANTES de montar o modal - a visualização já conta -, silencioso
   * pra não travar a abertura do modal esperando essa chamada.
   */
  async function abrirDetalhe_(sugestao) {
    const usuarioLogado = Auth.usuario();
    const souAutor = usuarioLogado && String(usuarioLogado.id) === String(sugestao.usuario_id);
    const souAdmin = Auth.ehAdministrador();

    if (souAdmin && sugestao.status === 'Aguardando análise') {
      Api.chamar('marcarSugestaoEmAnalise', { id: sugestao.id }, { silencioso: true })
        .then(() => {
          sugestao.status = 'Em análise';
          const idx = sugestoes.findIndex(s => s.id === sugestao.id);
          if (idx !== -1) sugestoes[idx] = sugestao;
          renderLista();
          const seloModal = document.getElementById('detalheSugestaoStatus');
          if (seloModal) { seloModal.textContent = 'Em análise'; seloModal.className = 'selo azul'; }
        })
        .catch(() => { /* conveniência - se falhar, o modal já abriu normalmente */ });
    }

    const corpo = `
      <div class="campo"><label>Status</label><br><span id="detalheSugestaoStatus" class="selo ${CORES_STATUS_[sugestao.status] || 'cinza'}">${UI.escaparHtml(sugestao.status)}</span></div>
      <div class="campo"><label>Sugestão${souAutor ? '' : ` (de ${UI.escaparHtml(mapaUsuarios_[sugestao.usuario_id] || sugestao.usuario_id)})`}</label>
        <textarea id="detalheSugestaoTexto" rows="5" ${souAutor ? '' : 'disabled'}>${UI.escaparHtml(sugestao.texto)}</textarea>
      </div>
      ${(sugestao.fotos || []).length ? `
        <div class="campo"><label>Fotos</label>
          <div id="detalheSugestaoFotos" class="sugestao-fotos-grade">${sugestao.fotos.map(f => `
            <div class="sugestao-foto" data-foto="${UI.escaparHtml(String(f.id))}"><span class="ajuda">Carregando...</span></div>`).join('')}
          </div>
        </div>` : ''}
      ${souAutor ? '<p class="ajuda">Editar depois de respondida reabre a sugestão como "Aguardando análise".</p>' : ''}
      ${souAdmin
        ? `<div class="campo"><label>Feedback do Administrador</label><textarea id="detalheSugestaoFeedback" rows="4" placeholder="Escreva sua resposta...">${UI.escaparHtml(sugestao.feedback_administrador || '')}</textarea></div>`
        : (sugestao.feedback_administrador ? `<div class="campo"><label>Feedback do Administrador</label><p>${UI.escaparHtml(sugestao.feedback_administrador)}</p></div>` : '')}
      <p id="detalheSugestaoErro" class="erro-campo oculto"></p>`;

    const botoes = [];
    if (souAutor) botoes.push('<button class="botao" id="btnSalvarEdicaoSugestao">Salvar edição</button>');
    if (souAdmin) botoes.push('<button class="botao primario" id="btnEnviarFeedback">Enviar feedback</button>');

    UI.abrirModal('Sugestão', corpo, `<button class="botao" id="btnFecharSugestao">Fechar</button>${botoes.join('')}`);
    document.getElementById('btnFecharSugestao').addEventListener('click', UI.fecharModal);
    carregarFotosDetalhe_(sugestao);

    if (souAutor) {
      document.getElementById('btnSalvarEdicaoSugestao').addEventListener('click', async () => {
        // Nada mudou: só fecha, sem chamar o backend à toa (mesmo
        // dirty-tracking usado em todo card do app - ver UI.modalFoiEditado).
        if (!UI.modalFoiEditado()) { UI.fecharModal(); return; }
        const erroEl = document.getElementById('detalheSugestaoErro');
        erroEl.classList.add('oculto');
        const texto = document.getElementById('detalheSugestaoTexto').value.trim();
        if (!texto) { UI.mostrarErro(erroEl, 'Escreva sua sugestão antes de salvar.'); return; }
        try {
          await Api.chamar('atualizarSugestao', { id: sugestao.id, data: { texto } });
          UI.toast('Sugestão atualizada.', 'sucesso');
          UI.fecharModal();
          await carregar();
        } catch (err) {
          UI.mostrarErro(erroEl, err.message);
        }
      });
    }
    if (souAdmin) {
      document.getElementById('btnEnviarFeedback').addEventListener('click', async () => {
        const erroEl = document.getElementById('detalheSugestaoErro');
        erroEl.classList.add('oculto');
        const feedback = document.getElementById('detalheSugestaoFeedback').value.trim();
        if (!feedback) { UI.mostrarErro(erroEl, 'Escreva um feedback antes de enviar.'); return; }
        try {
          await Api.chamar('responderSugestao', { id: sugestao.id, feedback });
          UI.toast('Feedback enviado.', 'sucesso');
          UI.fecharModal();
          await carregar();
        } catch (err) {
          UI.mostrarErro(erroEl, err.message);
        }
      });
    }
  }

  return { render };
})();
