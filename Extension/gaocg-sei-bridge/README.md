# GAOCG SEI Bridge — extensão-ponte

Extensão de navegador (Manifest V3) que recebe dados do app GAOCG e preenche
o formulário nativo de inclusão de documento de um processo aberto no SEI.

## Arquitetura

```
GAOCG (GitHub Pages)  --chrome.runtime.sendMessage-->  background.js (extensão)
                                                              |
                                                    acha a aba do SEI certa
                                                              |
                                                              v
                                              content-sei.js (roda na aba do SEI)
                                                              |
                                                preenche o form nativo de "Incluir Documento"
```

Não existe servidor intermediário: a extensão fala diretamente com a aba do
navegador que já está autenticada no SEI. Só funciona no mesmo navegador, com
o SEI aberto e logado.

## Instalação (modo desenvolvedor)

1. Abra `chrome://extensions`.
2. Ative "Modo do desenvolvedor" (canto superior direito).
3. "Carregar sem compactação" → selecione a pasta `Extension/gaocg-sei-bridge`
   (a que contém o `manifest.json`).
4. Pronto - o ID que aparece no card deve ser sempre
   `gmhefdeokoolgcpfohhkomgljndffnpi`, o mesmo já configurado em
   `js/sei-bridge.js` (`ID_PADRAO_`). Não precisa copiar nem configurar nada,
   **em nenhum computador** - ver por quê logo abaixo.

> **Por que o ID não muda mais de computador pra computador (sessão
> 2026-08-13):** numa extensão sem compactação "crua", o Chrome deriva o ID
> do CAMINHO da pasta no disco - mover, renomear ou copiar a pasta pra outro
> lugar muda o ID e quebra a ponte com "Could not establish connection.
> Receiving end does not exist." (aconteceu ao achatar a pasta duplicada
> `gaocg-sei-bridge/gaocg-sei-bridge/`, e de novo com a pasta extraída sendo
> movida de lugar num 2º computador). O `manifest.json` agora tem um campo
> `"key"` (a chave pública de um par gerado só pra isso, via `openssl genrsa`
> / `openssl rsa -pubout`) - com ele, o ID vira uma função só da CHAVE, não
> do caminho, e sai igual em qualquer pasta/computador que carregue este
> mesmo `manifest.json`.
>
> Se um dia for preciso gerar uma chave nova (não deveria - é exatamente o
> problema que isso resolve), o app ainda aceita um ID diferente sem
> precisar de deploy novo, via `localStorage.setItem('gaocg_sei_extension_id',
> 'novo-id-aqui')` no console do navegador.

## Como usar

1. No SEI, abra o processo que vai receber o documento (deixe a aba aberta).
2. No GAOCG, abra a SOF e clique em **"Salvar e enviar ao SEI"**.
3. A extensão traz a aba do SEI para a frente, abre "Incluir Documento" e tenta
   escolher o tipo e preencher o cadastro.
4. **Você revisa e clica em "Confirmar Dados"** — a extensão nunca confirma
   sozinha (`autoEnviar` é sempre `false` no app).
5. O SEI abre o editor do documento. **É nesse momento que o conteúdo da SOF
   entra:**
   - se o editor abrir **vazio**, o conteúdo entra sozinho e um aviso verde
     aparece no canto;
   - se o tipo escolhido tiver **modelo próprio** no SEI (o tipo "SOF" tem), o
     editor abre com o template em branco. Aí aparece uma barra azul no canto
     perguntando se pode substituir — clique em **"Substituir"**.
6. Revise e salve o documento.

### Como o processo de destino é identificado

O número vem do campo `sei` da própria SOF. A extensão pergunta a cada aba do
`sei.pe.gov.br` **quais números de processo ela exibe** e só age na que mostrar
exatamente aquele número.

Lê o texto da página, e não a URL, porque a URL do `procedimento_trabalhar` traz
`id_procedimento` — um id interno do banco, sem relação com o número que o
analista digitou na SOF.

**Se o processo não estiver aberto, a extensão NÃO envia** para outra aba. Em
vez disso ela guarda o envio, abre o SEI numa aba nova já pesquisando aquele
número e **retoma sozinha** assim que você abrir o processo certo — sem precisar
voltar ao GAOCG e clicar de novo (v0.9.0). Abrir um processo diferente não
dispara nada: a conferência do número continua valendo, e o envio guardado
expira em 15 minutos.

Até a v0.6.0 havia um fallback para "qualquer aba do SEI aberta" — o que criaria
o documento **no processo errado**, sem aviso, dentro de um sistema de processos
oficial.

### Por que em duas etapas

No SEI, o editor de texto **não existe** na tela de cadastro: ele só abre depois
de "Confirmar Dados", geralmente numa janela nova. A v0.2.0 tentava injetar o
conteúdo durante o cadastro e, como o editor ainda não existia, o documento
nascia vazio — foi o que aconteceu no primeiro teste real.

Agora o conteúdo é guardado em `chrome.storage.local` como *pendente* logo no
começo, e **qualquer** página do SEI que carregar procura um editor vazio para
injetá-lo. Consequências práticas:

- Funciona mesmo que você escolha o tipo e preencha o cadastro **na mão** — as
  duas etapas são independentes.
- O pendente expira em **15 minutos**.
- Em editor **vazio**, entra sozinho. Em editor **com conteúdo**, a extensão
  **pergunta** antes (barra azul com "Substituir"). Não dá para distinguir pelo
  DOM o modelo em branco de um documento já preenchido — as duas coisas são só
  HTML no corpo do editor — então quem decide é você. Sem essa pergunta, a
  escolha seria entre "não funciona com tipos que têm modelo" e "pode apagar um
  documento oficial sem avisar".
- Se você desistir no meio, o pendente some sozinho ao expirar.

### Tipo do documento

`MAPA_TIPO_DOCUMENTO` (em `content-sei.js`) tem uma lista **em ordem de
preferência** por tipo do GAOCG:

```javascript
sof: ["SOF", "Solicitação Orçamentária e Financeira", "Anexo"]
```

A extensão tenta cada nome e usa o primeiro que existir na sua unidade. Se
nenhum existir, ela **não falha** — deixa a tela de escolha aberta para você
decidir, e o conteúdo entra normalmente na etapa 2. Ajuste a lista se sua
unidade usar outro nome.

## Ordens Bancárias do E-fisco (v0.62.0)

A extensão avisa quando sai Ordem Bancária **paga** das NEs mãe cadastradas no app e
pergunta se anexa no app. **Nunca anexa no SEI** — quem junta a OB no processo é outro setor.

1. No painel da extensão (ícone GAOCG), marque os tipos de unidade que você cuida
   (Hospitais, UPAs, UPAEs + Carretas) e o intervalo da busca (padrão: 30 minutos).
2. Fique logado no app GAOCG e no E-fisco neste navegador. Sem login, a extensão
   avisa uma vez (notificação) e tenta de novo sozinha na próxima busca.
3. OB nova vira notificação e número no ícone. "Ver OBs" (no painel ou na notificação)
   abre a página onde você marca quais anexar. A extensão baixa o PDF da OB no E-fisco e
   o app a coloca no Recibo pela NE e competência (mesma leitura da OB que vem do SEI).
   Se houver dúvida, a OB fica em "Não deu para anexar", com o motivo.

Detalhes:
- Na primeira busca de cada NE, as OBs que já existiam não geram aviso: ficam em
  "Anteriores", para anexar se quiser.
- A consulta usa a tela Financeiro > Ordem Bancária do E-fisco por conta própria e não
  espera nem pergunta se essa tela estiver aberta numa aba (pedido do usuário, v0.62.1).
- Arquivos: `offscreen.html`/`offscreen-efisco.js` (leitor do E-fisco), `obs-efisco.html`/
  `obs-efisco.js` (página das OBs) e o trecho "OBs do E-fisco" no fim de `background.js`.
  No backend: `ObEfisco.gs` (`listarNesMaeEfisco`, `anexarObEfiscoRecibo`, aba `ObsEfisco`).

## Cartões do processo e documentos da base (v0.63.0)

- "Acompanhamento · Anexar documentos" só cuida de anexar documentos da pasta ANEXOS; o
  "Recibo no app" (criar recibo ou informar o processo) virou um cartão próprio, que some
  quando o acompanhamento não é de recibo. Cada um minimiza separado.
- Na lista de documentos, a ordem em que se marca é a ordem na árvore do SEI (posição ao lado);
  "Marcar/desmarcar todos" acrescenta os que faltam na ordem da lista.
- O app não percorre mais as pastas do Drive para um arquivo que acabou de listar. O console do
  SEI mostra o tempo de cada um ("[GAOCG anexo] ... SEI Y ms").
- v0.63.1: o cartão "Do SEI para o app" tenta cada LE/OB/NE pendente uma vez por abertura do
  processo (antes recomeçava a cada recarga da árvore, baixando tudo de novo do SEI) e espera a
  fila de anexos terminar antes de baixar qualquer coisa do SEI.
- v0.63.2: "Anexar documentos do processo" baixa todos os escolhidos do app numa chamada só
  (`baixarDocumentosProcesso`, lotes de até 25 MB) e só depois começa a subir no SEI: baixando
  durante o envio, cada documento levava 5-10 s no SEI em vez de ~1 s.
- v0.63.3: o download do app vai em 3 chamadas simultâneas, de custo parecido (15 documentos
  numa chamada só levaram 20 s, porque o app lê um arquivo por vez).

## SOF pronta no SEI para o app (v0.67.0)

Com o SEI na unidade SES-GAOCG, a SOF que está na árvore ("SES - SOF - Solicitação Orçamentária e
Financeira 153", documento interno ou PDF) aparece no cartão "Do SEI para o app". O app lê o documento
(`lerSofSei`, só leitura) e o botão "Conferir e criar no app" mostra unidade, tipo, objeto, período, DEA e
as fontes com os 12 meses, todos editáveis, além dos avisos (ex.: soma dos meses diferente do total).
Nada é gravado sem o clique em "Criar SOF no app" (`importarSofSei`). Se a SOF já existir no app (mesmo
número no mesmo processo), o botão vira "Completar": só entram os campos vazios dela. Depois disso as NEs
do processo são tentadas de novo e entram na SOF.

- A unidade sai do CNPJ do credor; o tipo, da seção de Ação da unidade com a mesma Ação/Subação.
- O objeto de cada fonte é sugerido pelo texto (Rateio, Piso, Sazonalidade) ou "CONTRATO DE GESTÃO (TES/SUS)".
- No PDF do SEI a última coluna do cronograma pode vir cortada: o mês que falta é a diferença para o total
  citado no texto, com aviso.
- v0.67.1: na SES-GAOCG o cartão também lê as pastas recolhidas da árvore (o SEI só traz um nó "Aguarde" e
  carrega o conteúdo depois, pelo frmArvore enviado ao `Pastas[n]['link']`). Delas entram só SOF e NE; LE/OB
  continuam só das pastas abertas.
- Backend: `sof-sei-leitura.ts` (leitura, testável com `node teste/sof-sei.mjs <arquivo>`) e `sof-sei.ts`.

## Cartões renomeados, recarregar e Atribuir Processo (v0.68.0)

- "Recibo no app" virou "Cadastrar Recibo no APP". A competência sai do texto do acompanhamento também
  quando o mês vem por extenso e só com espaço antes do ano ("SETEMBRO 26"); antes só valia "SETEMBRO/26".
  A regra fica no backend (`competenciasDoTextoAcompanhamento_`, `extensao.ts`).
- "GAOCG · Do SEI para o app" virou "Criar SOF no APP / Anexar documentos no APP" e ganhou o botão ↻:
  pede a árvore de novo ao SEI (sem recarregar a página), relê as pastas e confere de novo SOF, NE, LE e OB,
  inclusive o que já tinha sido tentado nesta abertura.
- Cartão novo "Atribuir Processo" (liga/desliga no painel): usa a tela "Atribuir Processo" do SEI
  (`procedimento_atribuicao_cadastrar`, link dos scripts da árvore). A lista é a do SEI, com os usuários
  da unidade ativa. Só grava com o clique em "Atribuir" e lê a tela de novo para confirmar.
  Ainda não validado num SEI real.

## Configuração por ambiente

| Onde | O quê | Quando mexer |
|---|---|---|
| `manifest.json` → `host_permissions` / `content_scripts` | `https://sei.pe.gov.br/*`, `https://efisco.sefaz.pe.gov.br/*` | Se o SEI ou o E-fisco mudarem de domínio |
| `manifest.json` → `externally_connectable` e `content_scripts` (content-app.js); `background.js` → `URLS_APP_GAOCG_` e `URL_APP_GAOCG_` | `https://andersong2021.github.io/*`, `https://dgmcg-ses-pe.github.io/*`, `https://gaocg.netlify.app/*` (Netlify desde v0.63.5: o firewall da SES bloqueia o github.io) | Se o GAOCG mudar de domínio. **Só origem — o Chrome ignora caminho aqui**, então não dá para restringir a `/APP-GAOCG/` |
| `content-sei.js` → `MAPA_TIPO_DOCUMENTO` | `sof: "SOF"` | O texto tem que ser **idêntico** ao tipo de documento cadastrado no SEI da sua unidade |
| `manifest.json` → `key` | Chave pública fixa (define o ID da extensão) | Só se precisar gerar uma chave nova - ver instalação acima |
| `js/sei-bridge.js` → `ID_PADRAO_` | ID da extensão (derivado da `key` acima) | Só junto com uma troca de `key` (ou use o `localStorage` como atalho sem deploy) |

## Ainda não validado num SEI real

O fluxo depende de seletores do formulário nativo do SEI, que variam entre
versões e customizações por órgão. Os pontos a conferir com o DevTools aberto,
na primeira vez:

- **Botão "Incluir Documento"** — procurado por `a[title="Incluir Documento"]`,
  `img[title="Incluir Documento"]` e `a[href*="documento_escolher_tipo"]`, em
  todos os frames de mesma origem.
- **Escolha do tipo** — suporta os dois formatos que o SEI usa: um
  `<select id="selSerie">` ou uma lista de links com o nome do tipo.
- **Campos do cadastro** — `#txtNumero`, `#txtDescricao`, `#txaObservacoes`,
  `input[name="rdoNivelAcesso"]`, dentro de `#frmDocumentoCadastro`.
- **Conteúdo do documento** — injetado na etapa 2, quando o editor abrir (ver
  "Por que em duas etapas" acima). Confirmado no teste real de 2026-08-10: o
  editor não existe na tela de cadastro.

## Licenciamento

Código escrito do zero, sem copiar trechos do SEI Pro (AGPL-3.0) — usa apenas
os IDs de campo do formulário nativo do SEI, que não são propriedade do SEI
Pro. Se algum dia reaproveitar código deles, a AGPL exigiria abrir o código
desta extensão também.

## Próximos passos sugeridos

- Enviar Notas de Empenho e Recibos (o `MAPA_TIPO_DOCUMENTO` já prevê os dois;
  falta o botão no app e o HTML do documento).
- Upload de arquivo (documento externo) em vez de HTML, para SOFs que já saem
  como PDF.
- Guardar no `chrome.storage.local` o último processo SEI usado por SOF.
