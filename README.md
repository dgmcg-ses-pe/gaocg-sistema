# GAOCG App

Aplicação web interna da Gerência Administrativa Orçamentária dos Contratos de Gestão (GAOCG), da Secretaria de Saúde do Estado de Pernambuco. Substitui as planilhas soltas antes usadas para acompanhar o ciclo de pagamento dos Contratos de Gestão das unidades de saúde geridas por OSS (UPAs, UPAEs, Hospitais etc.) — do pedido orçamentário até o pagamento efetivo — com login por perfil, autopreenchimento por unidade e log de auditoria completo de edições.

**O que o app cobre hoje, ponta a ponta:**
- **Unidades** — cadastro mestre (OSS, CNPJ, contrato de gestão, classificação orçamentária) com Valor do Contrato de Gestão + Termos Aditivos, dos quais deriva a "Parcela mensal" de cada unidade.
- **SOF** (Solicitação de Ordem Financeira) — processo com múltiplas fontes de recurso, andamento em 13 etapas fixas (stepper) e anexo obrigatório de Nota de Empenho para avançar à etapa "NE EMITIDA".
- **Notas de Empenho** — vinculadas a uma fonte específica do SOF, com reforços agrupados sob o número original e alerta automático quando o valor atual cai abaixo da parcela mensal contratada.
- **Recibos** — pagamento por unidade/objeto, com parcela dividida (documentos diferentes por parcela), fluxo de status ramificado por fonte (SUS/TESOURO), e **leitura automática por OCR** da Nota de Liquidação e da Ordem Bancária anexadas (extrai o valor e confere que a Nota de Empenho citada no documento é a mesma do processo).
- **Listas Personalizadas** — OSS, Objeto, Andamento (SOF) e Status (Recibo) são listas globais geridas pela própria equipe, não hardcoded.
- **Dashboard, Log de Auditoria e aviso de edição simultânea** (dois usuários no mesmo processo).

Todos os perfis (analista/gerente) trabalham de forma transversal — qualquer analista edita qualquer processo; só a criação/gestão de usuários é exclusiva do gerente. O histórico completo de decisões de produto e mudanças está em [`PROGRESS.md`](PROGRESS.md).

- **Frontend:** HTML + CSS + JavaScript vanilla, sem build, publicado via GitHub Pages.
- **Backend:** Google Apps Script, publicado como Web App (API JSON).
- **Banco de dados:** Google Sheets (uma aba por "tabela").

A especificação original (documento de requisitos e modelo de dados que orientaram a primeira versão) está em [`docs/`](docs). **Aviso:** esses documentos descrevem o MVP inicial e estão desatualizados em vários pontos — por exemplo, o conceito de "frente" (segmentação por perfil/unidade) neles descrito foi removido do produto real; para o estado atual, confie em [`PROGRESS.md`](PROGRESS.md) e no código, não nesses documentos.

## Estrutura do repositório

```
/css/style.css       Estilos (CSS puro, sem framework), layout responsivo
/js                  Um módulo por tela + api.js/auth.js/app.js/edicao-simultanea.js
index.html           Shell da SPA
manifest.json        App instalável (PWA leve, sem modo offline - ver PROGRESS.md)
sw.js                Service worker mínimo (só instalabilidade, não cacheia nada)

/docs                Especificação original do MVP (ver aviso de desatualização acima)
PROGRESS.md          Histórico real de decisões e mudanças - fonte da verdade sobre o estado atual
RELATORIO_LENTIDAO_SOF.md   Diagnóstico de performance (referenciado a partir do PROGRESS.md)
```

### Onde fica o backend

**O código do backend não está neste repositório.** Os arquivos `.gs` do Apps Script (roteamento, regras de negócio, autenticação, OCR) ficam num repositório **privado** separado, por decisão de segurança: este repositório é público e é servido pelo GitHub Pages, que entregaria os `.gs` como arquivo bruto para qualquer um — expondo lógica de negócio e regras de autorização.

Quem precisa mexer no backend precisa de acesso a esse repositório privado **e** ao projeto do Apps Script vinculado à planilha. A fonte da verdade sobre o que roda de verdade é sempre o editor do Apps Script.

Para quem só quer **consumir os dados**, não é preciso nada disso: existe uma API de leitura pública documentada em [`docs/API_CONSULTA_EXTERNA.md`](docs/API_CONSULTA_EXTERNA.md) (ver seção abaixo).

**Desvio documentado em relação à estrutura sugerida na especificação original:** os arquivos de frontend ficam na raiz do repositório (`index.html`, `css/`, `js/`) em vez de dentro de `/frontend`, para manter continuidade com o layout já publicado no GitHub Pages deste repositório. Também foram adicionados módulos de frontend não previstos na especificação original (`js/usuarios.js`, `js/listas.js`, `js/edicao-simultanea.js`, `js/dashboard.js`, `js/log-auditoria.js`, `js/unidades.js`, `js/metas-processos.js`), um por tela/funcionalidade.

## API de consulta externa

O backend expõe endpoints de **leitura** autenticados por **chave de API** (separada do login de usuário), pensados para consumo por ferramentas externas — Power BI, Excel, outro sistema. São quatro: `api_recibos`, `api_sof`, `api_unidades` e `api_notasEmpenho`, com os mesmos filtros e a mesma paginação das telas correspondentes do app.

```bash
curl -L "<URL_DO_WEB_APP>/exec?action=api_recibos&chave=SUA_CHAVE&competencia=2026-09&pageSize=100000"
```

Só leitura — não existe endpoint de escrita por chave de API, de propósito. As chaves são geradas, listadas e revogadas pelo perfil **Administrador do Aplicativo**.

📄 **Documentação completa em [`docs/API_CONSULTA_EXTERNA.md`](docs/API_CONSULTA_EXTERNA.md)**: como gerar/revogar chave, campos devolvidos por cada endpoint, formato de resposta e erros, e como ligar no Power BI/Excel.

## Passo a passo de implantação

> As etapas 1, 2 e 2.1 abaixo são de implantação do **backend** e pressupõem acesso ao repositório privado onde os `.gs` vivem (ver "Onde fica o backend"). Para só rodar/servir o frontend, vá direto para a etapa 3.

### 1. Criar e configurar a planilha (Fase 0)

1. Crie uma planilha Google Sheets nova e vazia (ex.: "GAOCG - Banco de Dados").
2. Menu **Extensões > Apps Script**. Isso cria um projeto de script vinculado (bound script) à planilha.
3. Apague o conteúdo padrão de `Code.gs` do editor do Apps Script e cole, em arquivos `.gs` separados, o conteúdo de cada arquivo do **repositório privado do backend** (um arquivo de script por `.gs`: `Code`, `Utils`, `Auth`, `Usuarios`, `Unidades`, `ListasPersonalizadas`, `Sof`, `NotasEmpenho`, `Recibos`, `LogAuditoria`, `EdicoesEmAndamento`, `Dashboard`, `MetasProcessos`, `Contadores`, `Seed`, `Relatorios`, `Sugestoes`, `MetasProcessos`, `Versoes`, `Api`). Mais rápido: pule a colagem manual e use o `clasp` (seção 2.1), que envia todos de uma vez.
4. Copie também o conteúdo de `appsscript.json` (mesmo repositório) para o manifesto do projeto (no editor: ícone de engrenagem > "Mostrar arquivo de manifesto `appsscript.json`"); habilite o serviço avançado **Drive API** (Serviços (+) → Drive API), usado pela leitura por OCR dos anexos de Recibo.
5. `Contadores.gs` precisa de uma entrada no mapa `PREFIXOS_ID` por aba com id sequencial (`SOF`, `Recibos`, `Unidades`, `NotasEmpenho`, `SofFontes`, `UnidadesTA`, `Usuarios`, `ListasPersonalizadas`, `LogAuditoria`, `Sugestoes`, `ApiKeys`, entre outras — ver `proximoId_` em `Utils.gs`). **Esquecer um prefixo aqui já quebrou três funcionalidades** — a criação falha com "Prefixo de ID não definido para a aba X". Ao criar uma aba nova, adicione o prefixo antes de escrever o código que a usa.
6. Rode a rotina de bootstrap (cria as abas do `modelo_dados_gaocg.md` com os cabeçalhos corretos, a aba de controle `Contadores` e um usuário gerente inicial) e depois **troque a senha desse usuário inicial no primeiro acesso** (crie um usuário definitivo e inative o inicial, ou redefina a senha dele pela tela de Usuários). Depois de colar `ListasPersonalizadas.gs`, rode também `semearListaOSS()` e `semearListaObjetos()` uma vez, pra popular as listas de OSS/Objeto a partir do que já estiver cadastrado em Unidades/SOF/Recibos (sem isso, o campo Objeto — obrigatório — aparece vazio nos formulários).

### 2. Publicar o backend como Web App

1. No editor do Apps Script: **Implantar > Nova implantação**.
2. Tipo: **Aplicativo da Web**.
3. "Executar como": **Eu** (o usuário que está implantando) — assim o script sempre acessa a planilha com a permissão de quem publicou, independentemente de quem está usando o app.
4. "Quem tem acesso": **Qualquer pessoa**.
5. Clique em **Implantar** e copie a URL gerada (termina em `/exec`).
6. Sempre que o código do backend for alterado, é preciso criar uma **nova versão** da implantação (Implantar > Gerenciar implantações > editar > Nova versão) para que as mudanças entrem em vigor na URL publicada — ou use o `clasp` (seção 2.1), que faz os passos 5-6 por linha de comando.

### 2.1. Atualizações seguintes via `clasp` (opcional, mais rápido que colar no editor)

Depois da configuração inicial acima (que só acontece uma vez), toda alteração *seguinte* no backend pode ser publicada sem abrir o editor do Apps Script, usando o [`clasp`](https://github.com/google/clasp) (CLI oficial do Google):

1. `npm install -g @google/clasp` (precisa de Node.js).
2. `clasp login` — abre o navegador para autorizar com a conta Google que tem acesso ao projeto do Apps Script.
3. No clone do **repositório privado do backend**, copie `.clasp.json.example` para `.clasp.json` (fica de fora do git — é config de máquina/pessoa, não do projeto) e cole o **Script ID** do projeto (`script.google.com`, projeto aberto → ⚙️ Configurações do projeto → seção IDs).
4. `clasp deployments` lista as implantações existentes — identifique a que corresponde à URL publicada (o trecho depois de `/macros/s/` e antes de `/exec` na URL é o ID da implantação, começa com `AKfycb...`). Normalmente há duas: uma `@HEAD` e a de produção, fixada numa versão numerada.
5. Pra publicar uma alteração (todos os comandos de dentro do repositório do backend):
   ```
   clasp pull                     # confira primeiro se o editor divergiu do repo
   clasp push
   clasp version "descrição da mudança"
   clasp deploy --deploymentId <ID_DA_IMPLANTACAO> --versionNumber <número da versão criada acima>
   ```
   O `push` sozinho só atualiza o conteúdo "HEAD" (visível no editor) — sem `version` + `deploy`, a URL publicada continua servindo a versão antiga.
6. Confira que entrou no ar: `curl -L "<URL_DO_WEB_APP>/exec?action=ping"` deve responder `{"ok":true,"data":{"pong":true}}`. O `-L` é obrigatório — a URL `/exec` responde com redirect.

### 3. Configurar o frontend

1. Abra `js/api.js` e substitua `COLOQUE_AQUI_A_URL_DO_WEB_APP/exec` pela URL copiada no passo anterior.
2. Publique o repositório no GitHub Pages (Settings > Pages > Branch `main`, pasta raiz).
3. Acesse a URL do GitHub Pages e faça login com o usuário gerente criado no passo 1.

### 4. Cadastrar as Unidades (Fase 1)

Antes de qualquer SOF ou Recibo, cadastre as unidades pela tela **Unidades** (CNPJ + contrato de gestão não podem se repetir).

### 5. Migração do histórico de Recibos (Fase 3)

O módulo de Recibo deve nascer com o histórico já existente; o de SOF nasce vazio (decisão de negócio original). Não há tela de migração pronta (execução única e pontual) — rode a função `migrarRecibosHistorico(session, linhas)` diretamente pelo editor do Apps Script (ou via uma chamada de API autenticada como gerente), montando `linhas` a partir do histórico existente, com:

- `unidade_id` já resolvido contra o cadastro de `Unidades` (por isso a Fase 1 precisa estar concluída antes).
- Linhas da mesma parcela dividida compartilhando o mesmo `parcela_dividida_grupo_id` (renomeado de `rateio_grupo_id` na Fase 5 - ver `PROGRESS.md`).
- Os demais campos de `Recibos` (ver `modelo_dados_gaocg.md` para os campos originais e `PROGRESS.md` para os que foram adicionados/renomeados depois).

Essa rotina grava `origem = 'importacao_inicial'` e **não** gera entradas em `LogAuditoria` (decisão de negócio já fechada).

## Segurança (spike da Fase 0)

- **CORS:** o Apps Script Web App não responde de forma confiável a um preflight OPTIONS (a URL `/exec` redireciona e o navegador rejeita). A solução adotada foi **evitar completamente o preflight**: o frontend só faz `GET` (nunca gera preflight) ou `POST` com `Content-Type: text/plain` (um content-type "simples" para CORS). Ver comentários em `Utils.gs` (`jsonOut_`, no repositório do backend) e `js/api.js`.
- **Autenticação:** todo endpoint exige um token válido, exceto `ping` e `login`. O token é assinado com HMAC-SHA256 (segredo gerado automaticamente em Script Properties na primeira execução, nunca no código-fonte) e não expira por tempo (requisito de negócio) — mas cada requisição revalida o usuário contra a aba `Usuarios` (perfil/`ativo` atuais, cache de 30s), então inativar um usuário efetiva o bloqueio em até 30s.
- **Senhas:** hash SHA-256 com salt por usuário (`Auth.gs`). Apps Script não tem bibliotecas de hashing robustas como bcrypt/argon2 nativamente; isso é um trade-off conhecido do ambiente de baixo custo, documentado aqui conforme pedido.
- **Spreadsheet ID:** nunca exposto ao frontend; fica em Script Properties (`SPREADSHEET_ID`, opcional — se vazio, o script usa a planilha ativa/vinculada).
- **Sanitização:** toda entrada recebida pela Web App passa por `sanitizeString_`/`toNumber_`/`toBool_` antes de ser gravada; nunca se confia em dados vindos do cliente.

## Decisões de produto que mudaram desde o MVP original

A especificação em `docs/` (Seção 8 do prompt de construção original) descrevia um MVP segmentado por "frente" (SOF-UPA, Recibo-Hospital etc.). Essa segmentação **foi removida do produto real** (Fase 3.2, ver `PROGRESS.md`): hoje qualquer analista edita/exclui qualquer processo de SOF ou Recibo, sem trava cruzada — só a distinção analista×gerente permanece. O indicador do dashboard que antes era "edições fora da frente" virou "edições fora do dono" (`edicoes_fora_do_dono`, dono = quem criou o processo). Opções de `ListasPersonalizadas` (Andamento, Status, OSS, Objeto) são globais, geridas pela própria equipe pela tela — sem seed fixo neste repositório além das rotinas pontuais `semearListaOSS()`/`semearListaObjetos()` (ver passo 6 da implantação).

## Limitações conhecidas

- Migração de Recibos históricos não tem tela própria; é uma rotina de backend executada uma única vez no lançamento (ver passo 5 acima).
- Locale da planilha: recomenda-se pt-BR para que os booleans nativos do Sheets sejam exibidos como VERDADEIRO/FALSO (o app grava/lê `true`/`false` normalmente; a exibição no Sheets segue o locale da planilha).
- Trocar a Nota de Empenho de um Recibo *depois* de já ter anexado/validado uma Nota de Liquidação ou Ordem Bancária (OCR) não reavalia automaticamente a validação - é preciso remover e reanexar o documento.
- Fora de escopo: geração automática de documentos, calendário de prazos por e-mail, checklist digital de anexos, relatórios avançados além do CSV simples, login via Google OAuth, telas dedicadas para RPA/Diária/Emenda Parlamentar.
