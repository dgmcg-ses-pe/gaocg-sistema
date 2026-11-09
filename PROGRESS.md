# GAOCG App — Progresso das mudanças (plano em fases)

## Objetivo do app

Aplicação interna da Gerência Administrativa Orçamentária dos Contratos de Gestão (GAOCG),
Secretaria de Saúde de Pernambuco. Substitui planilhas soltas no acompanhamento do ciclo de
pagamento dos Contratos de Gestão das unidades de saúde geridas por OSS (UPAs, UPAEs,
Hospitais etc.): **Unidades** (cadastro mestre + Valor do C.G./Termos Aditivos) → **SOF**
(pedido orçamentário, múltiplas fontes, andamento em 13 etapas) → **Notas de Empenho**
(vinculadas a uma fonte do SOF, com alerta de saldo) → **Recibos** (pagamento, parcela
dividida, leitura por OCR de Nota de Liquidação/Ordem Bancária). Complementado por Listas
Personalizadas (OSS/Objeto/Andamento/Status geridos pela equipe), Dashboard, Log de
Auditoria e aviso de edição simultânea. Qualquer analista opera qualquer processo
(sem segmentação por "frente" - removida na Fase 3.2); só a gestão de usuários é exclusiva
do gerente. Ver [`README.md`](README.md) pra visão geral de arquitetura/deploy.

> Este arquivo existe para permitir retomar o trabalho em qualquer computador: basta clonar
> este repositório e pedir para o Claude Code ler este arquivo. O backend real vive só no
> editor do Google Apps Script vinculado à planilha (git não implanta nada sozinho) — mas a
> pasta `/backend` deste repositório guarda **cópias de referência** do estado atual esperado
> de cada arquivo `.gs`, pra nunca depender só do histórico de chat pra saber o que já foi
> colado. **Sempre que um arquivo `.gs` mudar, atualize a cópia correspondente em `/backend`
> no mesmo commit.** Se `/backend/X.gs` e o que está colado no editor do Apps Script
> divergirem, o editor do Apps Script é que manda (é o que roda de verdade) — mas isso deveria
> ser raro se a cópia for sempre atualizada junto.

## Ordem combinada das fases
Bugs → UX global → SOF → Notas de Empenho → Recibos.

## Fase 1 — Bugs (CONCLUÍDA)
- Cache em memória no `js/api.js` (`Api.chamar(action, payload, { cache: true })` + `Api.invalidarCache(action)`) para `listarUnidades` e `listarOpcoes`, eliminando buscas repetidas ao trocar de aba.
- Proteção contra clique duplo em "+ Novo processo" (SOF/Recibos) e nas linhas da tabela.
- **Causa raiz real do bug "Selecione a unidade":** não era código — era a coluna `id` vazia na aba **Unidades** da planilha (cadastradas direto no Sheets, sem passar pelo app). Corrigido preenchendo os IDs manualmente (`UNI-000001`, etc.).
- **Lição importante:** o ZIP baixado originalmente estava desatualizado em relação ao GitHub real. O repositório remoto é `https://github.com/AndersonG2021/APP-GAOCG.git`, branch `main`. Sempre trabalhar a partir de um clone real desse repositório, nunca de um ZIP solto.
- Lentidão residual de 1-3s ao trocar de aba é latência inerente do Google Apps Script por requisição (não é mais bug).

## Fase 2 — UX Global (CONCLUÍDA)
- Animação de clique em todos os botões (`.botao:active` em `css/style.css`).
- `UI.mostrarErro(elementoOuId, mensagem)` em `js/app.js`: mostra erro e "pisca" (classe `.piscar-erro` + `@keyframes piscarErro`) se a mesma mensagem repetir. Todos os pontos de erro do app foram migrados para usar esse helper.
- Área do usuário (clicar no nome/perfil no canto superior direito) abre modal com Login, Frente, e formulário de troca de senha (exige senha atual).
- Backend: função `alterarMinhaSenha` adicionada em `Auth.gs` + `case 'alterarMinhaSenha'` em `Code.gs`. Já colada e implantada pelo usuário — funcionando.

## Fase 3 — SOF completo (CÓDIGO CONCLUÍDO, TESTES PARCIAIS)
Mudanças em `js/sof.js` + `css/style.css`:
- Campo "Tipo" removido.
- DEA virou dropdown (SIM/NÃO).
- Período virou duas datas (`periodo_inicio`/`periodo_fim`, `<input type="date">`), substituindo o campo texto único.
- Checkbox "Cadastro completo" removido; todos os campos são obrigatórios exceto T.A., CEO e Observação (validação client-side em `validarCamposObrigatorios()`).
- Andamento virou um **Stepper visual fixo de 13 etapas** (`ETAPAS_ANDAMENTO` em `js/sof.js`), substituindo o dropdown customizável por frente. **Navegação é livre** (qualquer nó, frente ou trás) — única trava: o nó "NE EMITIDA" só fica clicável depois que o SOF tiver uma Nota de Empenho anexada (`sof.possui_ne`).
- Anexo de arquivo obrigatório ao adicionar qualquer Nota de Empenho (seção dentro do SOF em edição), convertido para base64 no navegador e enviado ao backend, que salva no Google Drive.

Backend (colado pelo usuário no editor do Apps Script, **já implantado**):
- `Sof.gs`: `criarSof`/`atualizarSof` usam `periodo_inicio`/`periodo_fim` no lugar de `periodo`.
- `NotasEmpenho.gs`: `criarNotaEmpenho` agora exige `arquivoBase64`/`arquivoNome`, salva o arquivo em uma pasta do Drive (`DriveApp.getFolderById(...)`) e grava `arquivo_drive_id`/`arquivo_url` na planilha.

**Colunas novas que o usuário já deveria ter criado na planilha** (necessárias para os dados acima não serem descartados silenciosamente):
- Aba **SOF**: `periodo_inicio`, `periodo_fim`.
- Aba **NotasEmpenho**: `arquivo_drive_id`, `arquivo_url`.

**IDs das pastas do Google Drive usadas/reservadas para anexos:**
- Notas de Empenho: `1f10o-GB3hFQsWXqes2kPZymhuDCeMY2c` (em uso desde a Fase 3)
- Notas de Liquidação: `1szdIJMxBvIL5BU-ZbTWJh6AAN_tjxTyl` (reservada para a Fase 5 — Recibos)
- Ordens Bancárias: `1BtvWiTqnwxOS52SZZCpvC1HjGbWSDaoN` (reservada para a Fase 5 — Recibos)

**Testado e confirmado pelo usuário:** navegação livre do stepper (frente/trás) funcionando, trava do "NE EMITIDA" funcionando.
**Ainda não testado pelo usuário:**
- Anexo de Nota de Empenho realmente salvando no Google Drive e o link "Ver arquivo" abrindo certo.
- Validação de campos obrigatórios bloqueando corretamente ao faltar algum.

### Fase 3.1 — Bugs de dados (G.D./período) + redesenho do painel de SOF (sessão 2026-07-09)

**Bugs relatados pelo usuário:** G.D. aparecendo como data (`1950-03-03T00:00:00`) e Período início/fim nunca persistindo (campo sempre voltava vazio ao reabrir).

**Causa raiz encontrada:** `aplicarFormatoTexto_` (`Utils.gs`) decidia quais colunas proteger contra a auto-conversão texto→data do Sheets usando uma constante `HEADERS.SOF` desatualizada (ainda tinha o campo antigo `periodo` em vez de `periodo_inicio`/`periodo_fim`, que foram criados direto na planilha na Fase 3 sem atualizar o código). Isso deixou essas duas colunas sem proteção → o Sheets convertia a data digitada num objeto `Date` real → a leitura devolvia ISO com hora (`...T00:00:00`), que um `<input type="date">` rejeita silenciosamente. O mesmo mecanismo corrompeu o G.D.: o valor `"3.3.50"` da unidade (texto legítimo, é o G.D. padrão usado em várias unidades) foi interpretado como data dd.mm.aa (`03/03/1950`) no momento em que foi copiado pro `gd_snapshot` do SOF, porque essa coluna também ficou sem proteção.

**Fix aplicado (`Utils.gs`):** `aplicarFormatoTexto_`/nova `protegerFormatoLinha_` passaram a ler o cabeçalho real da planilha (`getHeaders_`) em vez de uma lista hardcoded, e a proteção passou a ser aplicada a cada escrita (`appendObjectRow_`/`updateObjectRow_`), não só uma vez no setup. Nova função de manutenção `corrigirFormatoTexto()` para reaplicar em massa.

**Regressão descoberta durante o teste do fix acima:** a primeira versão do fix forçava texto (`'@'`) em **todas** as colunas não-numéricas, inclusive as booleanas (`possui_ne`, `completo`, `excluido` etc.). Isso fazia esses campos virarem string `"true"`/`"false"` — e qualquer checagem direta tipo `sof.possui_ne ? ... : ...` no frontend passa a ser sempre verdadeira (string não vazia é truthy em JS), então **toda SOF passou a aparecer com NE "Emitida"**, mesmo sem nota anexada. Corrigido adicionando `COLUNAS_BOOLEANAS` (mesmo princípio de `COLUNAS_NUMERICAS`) e fazendo as duas funções **restaurarem** o formato `General` nessas colunas (não bastava só pular — o `'@'` de uma rodada anterior de `corrigirFormatoTexto()` ficava "preso" na coluna até ser explicitamente revertido).

- **CONFIRMADO (sessão 2026-07-10):** usuário rodou `corrigirFormatoTexto()`, corrigiu manualmente as células corrompidas, reimplantou, e validou visualmente: G.D. não aparece mais como data, período (início/fim) persiste ao reabrir um SOF, e o selo de NE só mostra "Emitida" pra quem realmente tem Nota de Empenho anexada. Este bloco de bugs está resolvido.

**Redesenho do painel de SOF (pedido do usuário, feito junto):** tabela virou cards (`renderCards()` em `js/sof.js`, classes `.cartao-sof`/`.grade-cards-sof` em `css/style.css`). Cada card mostra: unidade, objeto, Nº SOF, total solicitado, andamento com barra de progresso (%), número(s) de NE emitida(s) ou selo "pendente", selo "Parado", e dois botões à esquerda (editar = lápis, excluir = lixeira vermelha). Botão "+ Novo processo" virou "+ Nova SOF". Novos filtros: OSS, Objeto, Tipo de unidade (dinâmico a partir das unidades carregadas), DEA — além dos que já existiam (Unidade/Fonte/Frente).

- **Exclusão de SOF é lógica** (soft delete): marca `excluido = true` na aba SOF, mantém linha e log de auditoria. Podem excluir: gerente ou analista da frente responsável pelo processo (mais restrito que a edição cruzada, que permite qualquer analista mediante confirmação).
- Backend: nova função `excluirSof` (`Sof.gs`), novo `case 'excluirSof'` em `Code.gs`, `listarSof` ganhou filtros `objeto`/`dea`/`tipo_unidade` e passou a agregar `notas_empenho_numeros` por SOF (pra mostrar o(s) número(s) de NE no card).
- **Coluna nova que o usuário já deveria ter criado na planilha:** aba **SOF**: `excluido` (booleano).
- Frontend (`js/sof.js`/`css/style.css`) commitado neste repositório. Backend (`/backend/Utils.gs`, `/backend/Sof.gs`, `/backend/Code.gs`) colado pelo usuário e implantado, **mas ver bloco de bugs acima — ainda tem passos de correção manual pendentes antes de considerar essa parte 100% validada**.
- **Ainda não testado:** botão de excluir (lixeira) ponta a ponta; filtros novos (OSS/Objeto/Tipo de unidade/DEA) retornando os resultados certos; cards no site publicado de verdade (só foi validado localmente com dados mockados, sem o backend real).

### Fase 3.2 — SOF com múltiplas fontes/parcelas + remover "frente" (CÓDIGO CONCLUÍDO, sessão 2026-07-09, aguardando o usuário colar/implantar e ajustar a planilha)

Decisões tomadas com o usuário (sessão de plan mode antes de implementar):
1. Remover `frente` de **SOF e Recibos juntos**, numa fase só.
2. Multi-fonte do SOF: dentro do mesmo formulário, linhas repetíveis de Fonte/Parcela Mensal/Total Solicitado (botão "+ Adicionar fonte"), aviso (não bloqueante) se a fonte repetir numa linha nova. Card mostra o total de cada fonte + o total geral (soma) em destaque.
3. Permissão sem frente: qualquer analista pode editar/excluir qualquer SOF ou Recibo (sem confirmação cruzada) — só analista x gerente.
4. Auditoria/dashboard: indicador "fora da frente" vira "fora do dono" (dono = `criado_por` de quem criou o processo).

**Feito nesta sessão:**
- `backend/Utils.gs`: `HEADERS`/`COLUNAS_NUMERICAS`/`COLUNAS_BOOLEANAS` atualizados (frente removida de Usuarios/ListasPersonalizadas/SOF/Recibos/LogAuditoria; nova aba `SofFontes`; `LogAuditoria` ganha `dono_processo`/`fora_do_dono` no lugar de `frente_usuario`/`frente_processo`/`fora_da_frente`). Constante `FRENTES` removida.
- `backend/Sof.gs`: reescrito. `SOF_FRENTES`/`frenteDoSof_` removidos; `atualizarSof`/`excluirSof` não têm mais trava de frente (qualquer perfil edita/exclui). Novo modelo: `dados.fontes = [{fonte, parcela_mensal, total_solicitado}, ...]` em `criarSof`/`atualizarSof` (substituição completa da lista a cada save via `substituirFontesDoSof_`); `obterSof`/`listarSof` anexam `sof.fontes` e `sof.total_solicitado` (calculado = soma). Filtro `fonte` em `listarSof` agora verifica qualquer fonte do SOF.
- `js/sof.js`: formulário com seção de linhas de fonte dinâmica (`renderFontesFormulario`/`lerLinhasFontesDoDom_`), aviso de fonte duplicada, soma ao vivo, cards com total geral + breakdown por fonte (`.cartao-sof-fontes`), CSV com coluna `fontes` flatten (`FONTE:valor;FONTE:valor`). Filtro/campo/coluna de Frente removidos. Bloco de confirmação cruzada (`precisaConfirmacao`/`frente_processo`) removido.
- `css/style.css`: estilos novos `.linhas-fonte`/`.linha-fonte`/`.linha-fonte-remover` (form) e `.cartao-sof-fontes`/`.cartao-sof-fonte-linha` (card).
- `js/recibos.js`, `js/usuarios.js`, `js/listas.js`: frente removida (filtros, campos de formulário, colunas de tabela, CSV, confirmação cruzada em Recibos). Em `js/listas.js`, as opções de Andamento(SOF)/Status(Recibo) passam a ser globais (não mais por frente).
- `js/log-auditoria.js`: filtro/coluna "fora da frente" vira "fora do dono" (`fora_do_dono`).
- `js/dashboard.js`: indicador `edicoes_fora_da_frente` vira `edicoes_fora_do_dono`; colunas "Frente" das tabelas de SOF pendente/processos parados viram "Criado por".
- `js/auth.js`: função `frenteDoUsuario()` removida (não tinha mais uso). `js/app.js`: topo mostra só "Analista"/"Gerente" (sem frente); modal de perfil troca o campo "Frente" por "Perfil".
- `js/notas-empenho.js`: coluna "Frente" da listagem trocada por "Criado por" (`n.sof_criado_por` no lugar de `n.sof_frente`) — **isso exige que o backend `NotasEmpenho.gs` (`listarNotasEmpenho`) pare de juntar `sof_frente` e passe a juntar `sof_criado_por`**; ver bloco de pendências abaixo.

**Backend concluído e commitado** (o usuário colou o conteúdo atual de todos em `/backend`, o que permitiu editar sem risco de perder funcionalidade já implantada; falta só o usuário colar/reimplantar no editor do Apps Script - ver "Próximo passo" abaixo):
- `Auth.gs`: `login_` para de devolver `frente` no objeto `user`.
- `Usuarios.gs`: `criarUsuario`/`atualizarUsuario` não leem/gravam mais `frente`, nem validam contra `FRENTES`.
- `ListasPersonalizadas.gs`: `criarOpcao`/`atualizarOpcao`/`listarOpcoes` viram globais (sem `frente`); `opcaoTemPausaContagem_(tipoLista, valor)` perdeu o parâmetro de frente (assinatura já usada assim em `Sof.gs`/`Recibos.gs`).
- `LogAuditoria.gs`: `registrarLog_`/`registrarDiferencas_` recebem `donoProcesso` no lugar do parâmetro de frente; grava `dono_processo`/`fora_do_dono` (calculado como `session.id !== donoProcesso`); `listarLogAuditoria` filtra por `fora_do_dono`; `contarEdicoesForaFrente_` virou `contarEdicoesForaDono_`.
- `Recibos.gs`: `RECIBO_FRENTES`/`frenteDoRecibo_` removidos; `atualizarRecibo` sem trava de edição cruzada (livre pra qualquer perfil); logs usam `criado_por` como dono.
- `Dashboard.gs`: removida a segmentação por frente nas 3 funções de indicador (`dashboardRecibos_`/`dashboardSofPendenteNe_`/`dashboardParados_`) — **decisão tomada nesta sessão sem confirmação explícita do usuário:** como não sobrou nenhuma dimensão pra segmentar por perfil, o dashboard passou a mostrar os mesmos números pra analista e gerente (antes o analista só via a própria frente). `edicoes_fora_da_frente` → `edicoes_fora_do_dono`.
- `NotasEmpenho.gs`: `criarNotaEmpenho`/`listarNotasEmpenho` usam `sof.criado_por`/`sof_criado_por` no lugar de `sof.frente`/`sof_frente`; a listagem também deixou de filtrar por frente do analista (vira transversal, mesmo princípio já usado em `listarSof`).

**Pendência nova, pequena, fora do escopo original do plano:** `backend/Contadores.gs` (não coletado nesta sessão) precisa ganhar uma entrada nova no mapa `PREFIXOS_ID` pra gerar id da aba `SofFontes`, por exemplo `SofFontes: 'SFT'`. Sem isso, `proximoId_('SofFontes')` (usado em `Sof.gs`) lança erro "Prefixo de ID não definido".

**CONFIRMADO (sessão 2026-07-10):** usuário concluiu os 5 passos (colar/implantar os `.gs`, `SofFontes` em `PREFIXOS_ID`, aba `SofFontes` criada com migração dos dados, coluna `frente` removida de Usuarios/ListasPersonalizadas/SOF/Recibos, colunas de LogAuditoria renomeadas) e validou: criar SOF com 2+ fontes funciona sem erro de prefixo de ID. Ainda não confirmado explicitamente: aviso de fonte duplicada, edição/exclusão cruzada sem trava, indicador novo no dashboard/log de auditoria, e se a visibilidade do dashboard (analista vendo os mesmos números do gerente) ficou aceitável — perguntar ao usuário se algo aí precisa de ajuste.

### Performance — lentidão ao abrir card de SOF (sessão 2026-07-09)

Usuário relatou 8-15s ao clicar num card de SOF. Diagnóstico completo e mitigações aplicadas em `RELATORIO_LENTIDAO_SOF.md` (na raiz do repo) — resumo: cadeia de 4 chamadas de rede sequenciais ao abrir um card, `protegerFormatoLinha_` fazendo uma chamada de `setNumberFormat` por coluna em toda escrita (inclusive `marcarSofVisualizado`), releituras completas de planilha sem cache, e N+1 em `opcaoTemPausaContagem_`.

**Aplicado nesta sessão (sem exigir mudança nenhuma na planilha):**
- `Utils.gs`: `protegerFormatoLinha_` em lote (uma chamada por linha escrita, não uma por coluna).
- `js/sof.js`/`js/recibos.js`: `marcarSofVisualizado`/`marcarReciboVisualizado` viraram fire-and-forget; em `sof.js`, `listarNotasEmpenhoPorSof` passou a rodar em paralelo com `obterSof` em vez de depois. Feedback visual (`.carregando`) no card/linha clicada.
- `Auth.gs`/`Usuarios.gs`: cache de 30s (`CacheService`) pro usuário autenticado, invalidado nas escritas (`atualizarUsuario`/`inativarUsuario`/`redefinirSenha`/`alterarMinhaSenha`).
- `ListasPersonalizadas.gs`: cache de 30s pra aba inteira, invalidado em `criarOpcao`/`atualizarOpcao`.
- `Sof.gs`/`Recibos.gs`/`Dashboard.gs`: `opcaoTemPausaContagem_` aceita lista pré-carregada; `listarSof`/`listarRecibos`/`dashboardParados_` carregam `ListasPersonalizadas` uma única vez por chamada em vez de uma vez por linha; o cálculo de "parado" em `listarSof`/`listarRecibos` passou a rodar só na página visível, não em todas as linhas filtradas.

**Pendência nova, pequena:** `backend/Contadores.gs` ainda precisa da entrada `SofFontes: 'SFT'` em `PREFIXOS_ID` (ver bloco da Fase 3.2 acima) — não é da performance, mas é bloqueante pra `criarSof` funcionar.

**Não feito (não tinha o arquivo atual pra editar com segurança):** cache de leitura pra aba Unidades, otimização de `abrirEdicao`/`EdicoesEmAndamento.gs`. Ver seção 5 do relatório.

**Próximo passo ao retomar:** colar/implantar de novo `Utils.gs`, `Auth.gs`, `Usuarios.gs`, `ListasPersonalizadas.gs`, `Sof.gs`, `Recibos.gs`, `Dashboard.gs`; medir se a lentidão melhorou de fato ao abrir um card de SOF.

## Fase 4 — Notas de Empenho (CONCLUÍDA, testada e confirmada pelo usuário)

Decisões tomadas antes de implementar (a Fase 3.2 tinha mudado o SOF pra múltiplas fontes, o que tornou o pedido original ambíguo):
1. Cada Nota de Empenho fica vinculada a **uma fonte específica** do SOF — o alerta vermelho compara o valor atual com a parcela mensal *dessa* fonte (soma de `SofFontes` filtrada por fonte).
2. O Recibo mantém um campo numérico `valor_liquidado` (já existia antes desta fase) **junto** com o futuro anexo de Nota de Liquidação (Fase 5) — é esse número que alimenta a subtração, já que o OCR segue adiado.

**Backend (`backend/NotasEmpenho.gs`, colado e implantado):**
- `criarNotaEmpenho`: `numero_ne` agora obrigatório também pra `reforco` (usado pra agrupar sob o mesmo card); reforço exige que já exista uma NE `original` com esse número no mesmo SOF; novo campo obrigatório `fonte`.
- Nova `valorLiquidadoPorNe_(numeroNe)`: soma `valor_liquidado` de `Recibos` cujo `nota_empenho` bate com o número da NE (mesma convenção de texto livre já usada no autopreenchimento do Recibo — sem FK nova).
- `listarNotasEmpenho` reescrita: agora agrupa por `numero_ne` (um card = original + todos os reforços), calcula `valor_bruto`, `valor_liquidado`, `valor_atual`, `parcela_mensal_referencia` (da fonte, via `agruparFontesPorSof_` de `Sof.gs`) e `alerta` (valor atual abaixo da parcela mensal); alertas vêm primeiro na ordenação. `listarNotasEmpenhoPorSof` (usada dentro do card de SOF) não mudou.
- **Coluna nova na planilha, aba NotasEmpenho:** `fonte` (já criada pelo usuário).

**Frontend:**
- `js/sof.js` (mini-formulário "Adicionar Nota de Empenho" dentro do SOF): novo campo obrigatório Fonte (`<select>` a partir de `sof.fontes`); campo Número vira `<select>` com os números de NE originais existentes quando `tipo = reforco` (evita reforço órfão por erro de digitação).
- `js/app.js`: `lerArquivoBase64` virou `UI.lerArquivoBase64` (estava duplicada, centralizada pra ser reaproveitada por `sof.js` e `notas-empenho.js`).
- `js/notas-empenho.js`: reescrita completa — grade de cards (`.cartao-ne`, reaproveitando o padrão visual de `.cartao-sof`), valor atual em destaque (verde/vermelho), detalhamento bruto−liquidado, links pros arquivos anexados, botão "+ Reforço" que abre um modal pequeno (valor + arquivo) sem precisar abrir o SOF. Filtros: Unidade e Fonte.
- `css/style.css`: `.cartao-ne`, `.cartao-ne.alerta`, `.cartao-ne-valor(.vermelho)`, `.cartao-ne-detalhe`, `.cartao-ne-rodape`.

**Testado e confirmado pelo usuário:** NE original com fonte → reforço (seleção do número) → card com valor bruto certo → Recibo com `nota_empenho`/`valor_liquidado` reduzindo o valor atual do card → alerta vermelho + destaque no topo quando abaixo da parcela mensal → botão "+ Reforço" direto pelo card.

## Fase 5 — Recibos (CONCLUÍDA, implantada e testada pelo usuário — sessão 2026-07-13)

Do pedido original do usuário:
- Filtros para todos os campos + cards de indicadores (pendentes, total pago no ano, total a pagar).
- Autopreenchimento por unidade+objeto (parcela contratual, fonte, NE) baseado no último lançamento — **já existe** em `js/recibos.js` (`historicoRecibosUnidade`, no listener de `recObjeto`/`change`), parece cobrir o pedido — só validar se falta algum campo.
- Novo fluxo de status (com ramificação por fonte SUS/TESOURO): ENVIADO DE VOLTA A UNIDADE PARA CORREÇÃO → AGUARDANDO ASSINATURA DO ATESTO → AGUARDANDO LIBERAÇÃO LIQUIDAÇÃO (CLSUS ou CLTESOURO conforme fonte) → AGUARDANDO ASSINATURA DA LIQUIDAÇÃO → ENVIADO AO SETOR DE PAGAMENTO (CPAG_TESOURO ou CPAG_SUS) → PAGO.
- Renomear "Este pagamento é feito por rateio (2+ parcelas)" → "Este pagamento é feito por mais de uma parcela?" com o checkbox ao lado do texto (hoje o checkbox já vem antes do texto no HTML, mas o rótulo precisa mudar).
- Trocar campos de "valor liquidado"/"valor pago" por anexos de Nota de Liquidação e Ordem Bancária (mesma mecânica de upload da Fase 3), que alimentam a subtração de valor da NE (Fase 4).
- Botão "X" pra remover parcela extra quando o rateio estiver marcado (hoje `adicionarLinhaRateio` em `js/recibos.js` não tem botão de remover linha).
- (Bug de "Selecione a unidade" no Recibo já resolvido na Fase 1.)

**Análise já feita (código atual lido, `js/recibos.js` e `backend/Recibos.gs` completos) — retomar planejamento a partir daqui:**
- O fluxo de status novo tem a mesma tensão arquitetural que o Andamento do SOF teve na Fase 3: hoje o Status do Recibo vem de `ListasPersonalizadas` (`STATUS_RECIBO`, customizável, `js/listas.js`/`TelaListas.obterOpcoes`). Virar um fluxo fixo com ramificação por fonte (SUS/TESOURO) provavelmente aposenta esse uso de Listas Personalizadas (mesma decisão tomada pro Andamento na Fase 3.1) — **perguntar ao usuário se confirma isso antes de implementar** (pergunta estava a caminho quando a sessão foi interrompida).
- **Tensão real a resolver com o usuário:** o pedido original quer *trocar* (remover) os campos numéricos `valor_liquidado`/`valor_pago` por anexos de arquivo. Mas: (a) a Fase 4 já depende de `valor_liquidado` numérico pra abater da Nota de Empenho (`valorLiquidadoPorNe_` em `backend/NotasEmpenho.gs`, decisão tomada explicitamente nessa fase de manter o número até o OCR existir); (b) os cards de indicador desta própria Fase 5 ("total pago no ano", "total a pagar") também precisam de um número pra somar. **Recomendação a validar com o usuário:** manter os dois campos numéricos só que agora lado a lado com o upload dos respectivos documentos (Nota de Liquidação anexa ao lado do número de Valor Liquidado; Ordem Bancária anexa ao lado do número de Valor Pago), em vez de removê-los — mesmo princípio já usado na Fase 4.
- Falta decidir com o usuário: (1) status fixo substitui Listas Personalizadas — sim/não; (2) o que fazer com as duas etapas do fluxo que dependem da fonte quando `fonte` for "Outra"/vazia (bloquear até definir SUS/TESOURO, ou usar rótulo genérico); (3) confirmar manter valor_liquidado/valor_pago numéricos junto dos anexos; (4) critério de "total pago no ano"/"a pagar" nos cards — por ano da competência (mais simples, já existe como campo) ou por uma data real de pagamento (exigiria campo novo).
- Campos/estrutura atual de Recibo (`backend/Recibos.gs`, `montarLinhaRecibo_`): `unidade_id, oss_snapshot, cnpj_snapshot, tipo_unidade, objeto, instrumento, parcela_contratual, fonte, nota_empenho, competencia, valor_liquidado, valor_pago, ordem_bancaria (texto livre, só o número), numero_processo, observacao, status, rateio_grupo_id, percentual_rateio, completo`. Sem coluna de frente (já removida na Fase 3.2). Pastas do Drive já reservadas (ver seção de referências): Notas de Liquidação e Ordens Bancárias.
- Rateio: `criarGrupoRateioRecibo`/`recalcularAlertaRecibo_` já existem e funcionam por `rateio_grupo_id`; o botão de remover linha é só frontend (`adicionarLinhaRateio` em `js/recibos.js`), sem mudança de backend necessária pra isso.

**Decisões tomadas com o usuário (sessão 2026-07-12):**
1. **Status NÃO vira fluxo fixo no código** — continua vindo de Listas Personalizadas (`STATUS_RECIBO`), só que as opções disponíveis passam a refletir o novo fluxo ramificado por fonte (ENVIADO DE VOLTA A UNIDADE PARA CORREÇÃO → AGUARDANDO ASSINATURA DO ATESTO → AGUARDANDO LIBERAÇÃO LIQUIDAÇÃO CLSUS/CLTESOURO → AGUARDANDO ASSINATURA DA LIQUIDAÇÃO → ENVIADO AO SETOR DE PAGAMENTO CPAG_TESOURO/CPAG_SUS → PAGO), cadastradas como valores de lista, não hardcoded.
2. **Fonte "Outra"/vazia:** usa o ramo TESOURO como padrão nas etapas que dependem da fonte (CLTESOURO/CPAG_TESOURO), em vez de bloquear ou usar rótulo genérico.
3. **Mantém `valor_liquidado`/`valor_pago` numéricos** lado a lado com os novos anexos (Nota de Liquidação / Ordem Bancária) — mesmo princípio da Fase 4, não remove os campos numéricos do pedido original.
4. **"Total pago no ano"/"total a pagar" nos cards de indicador: por competência** (campo `competencia` já existente), não por data real de pagamento.

**Decisões adicionais tomadas durante o refinamento do plano (sessão 2026-07-12):**
5. **Renomear "rateio" → "parcela dividida" em tudo** (rótulos visíveis E nomes internos: coluna da planilha, funções do backend, IDs do frontend) — "Rateio" já é o nome de outro objeto no domínio do sistema, então manter o termo aqui causaria ambiguidade permanente.
6. **Anexo por parcela, não por grupo:** quando um pagamento é dividido em parcelas, cada parcela tem sua própria Nota de Liquidação e sua própria Ordem Bancária (mesmo processo, documentos diferentes por parcela).
7. **Anexos opcionais**, sem trava no backend (Recibo é criado antes desses documentos existirem; anexo entra depois, na edição).
8. **Cards de indicador reativos aos filtros** da tela de Recibos (mesmos parâmetros de `listarRecibos`).
9. **Card "total a pagar" adiado** — depende de uma feature futura (tabela de valores mensais recebidos por unidade, pra calcular o total dos 12 meses de NEs recorrentes que não geram Termo Aditivo) fora do escopo desta fase. Só entraram nesta fase os cards "pendentes" e "total pago no ano".

**Implementado nesta sessão (frontend `js/recibos.js` reescrito; backend `backend/Recibos.gs` reescrito, `backend/Utils.gs`/`backend/Code.gs`/`backend/Dashboard.gs` ajustados):**
- Rename completo de "rateio" → "parcela dividida": coluna da planilha `rateio_grupo_id`→`parcela_dividida_grupo_id` e `percentual_rateio`→`percentual_parcela_dividida`; função `criarGrupoRateioRecibo`→`criarGrupoParcelaDivididaRecibo` (e o `case` correspondente em `Code.gs`); IDs/classes do frontend (`recTemParcelaDividida`, `blocoParcelaUnica`/`blocoComParcelaDividida`, `linhasParcelaDividida`, `.linha-parcela-dividida`); coluna da tabela "Rateio"→"Parcela dividida"; checkbox com o novo texto "Este pagamento é feito por mais de uma parcela?".
- Filtros novos na tela de Recibos: Status, Objeto, Instrumento, Nota de Empenho, Nº Processo (o filtro de Status já tinha suporte no backend, só faltava a UI). Backend: `listarRecibos` ganhou filtros por `objeto`/`instrumento`/`nota_empenho`/`numero_processo` (substring, mesmo padrão do SOF), extraídos pra um helper compartilhado `filtrarLinhasRecibos_`.
- Fluxo de Status ramificado por fonte: `opcoesStatus(statusAtual, fonte)` em `js/recibos.js` esconde as opções que mencionam SUS/TESOURO conforme a fonte escolhida (regex com word-boundary, pra não colidir com um status futuro tipo "SUSPENSO"); fonte "Outra"/vazia mostra o ramo TESOURO (D2). Reavaliado sempre que o campo Fonte muda (criação e edição) ou quando o autopreenchimento por Objeto define a fonte. O filtro da barra de busca (`opcoesStatusFiltro`) não aplica esse recorte — lista qualquer status já salvo.
- Anexos de Nota de Liquidação / Ordem Bancária: 4 colunas novas (`nota_liquidacao_drive_id`, `nota_liquidacao_url`, `ordem_bancaria_arquivo_drive_id`, `ordem_bancaria_arquivo_url`), upload em base64 igual ao padrão das Notas de Empenho (`anexarArquivoRecibo_` em `backend/Recibos.gs`, pastas do Drive já reservadas desde a Fase 3), campos de arquivo opcionais no formulário de criar (parcela única e cada linha de parcela dividida) e no de editar (com link "Ver arquivo atual"). O campo de texto livre `ordem_bancaria` (número da OB) continua existindo, sem conflito de nome com o anexo.
- Cards de indicador "Pendentes" (status ≠ PAGO) e "Total pago no ano" (soma de `valor_pago` das linhas cuja `competencia` cai no ano atual), reativos aos filtros ativos — nova função `indicadoresRecibos` em `backend/Recibos.gs` (`case` novo em `Code.gs`), chamada em paralelo com `listarRecibos`.
- Botão de remover parcela extra (`.linha-parcela-dividida-remover`, mesmo padrão visual do `.linha-fonte-remover` do SOF) — só aparece quando há mais de 2 parcelas, já que `criarGrupoParcelaDivididaRecibo` exige no mínimo 2.

**CONFIRMADO (sessão 2026-07-13):** usuário concluiu os 4 passos manuais (renomear colunas `rateio_grupo_id`/`percentual_rateio`, criar as 4 colunas de anexo, confirmar acesso de escrita do Drive, cadastrar os 8 valores novos de Status) e colou/reimplantou `Recibos.gs`, `Utils.gs`, `Code.gs`, `Dashboard.gs`. Testado e funcionando: criação de Recibo com parcela dividida (2+ parcelas, cada uma com seu próprio anexo); edição de Recibo adicionando anexo sem apagar um já existente; dropdown de Status oferecendo só o ramo certo por fonte; `valorLiquidadoPorNe_` (Fase 4) continuando a somar certo depois do rename; cards "Pendentes"/"Total pago no ano"; botão de remover parcela extra.

**Fora do escopo desta fase (adiado, ver decisão 9):** card "total a pagar" — depende de uma tabela futura de valores mensais recebidos por unidade (NEs recorrentes que não geram Termo Aditivo, reforçadas todo início de ano) ainda não implementada.

## Melhorias fora da sequência de fases (sessão 2026-07-12)

### Recibos — reordenação da tabela
Pedido do usuário: tabela de Recibos não deveria mostrar mais o campo Origem;
no lugar, Nº Processo e Valor Liquidado, na ordem Unidade, Nº Processo,
Competência, Valor Liquidado, Valor Pago, Ordem Bancária, Status.
`renderTabela` em `js/recibos.js` ajustada (só frontend, sem mudança de
backend — os campos já existiam). O selo de "Parcela dividida" que antes tinha
coluna própria saiu da tabela (não fazia parte da lista pedida); o dado
continua existindo no backend, só não é mais mostrado ali.

### Unidades — Valor do C.G. + Termos Aditivos = "Parcela mensal" (CONCLUÍDA, implantada e testada pelo usuário — sessão 2026-07-13)

Redesenho pedido pelo usuário: cada unidade passa a ter um **Valor do C.G.**
(campo numérico único, ao lado do `contrato_gestao` de texto que já existia) e
uma lista de **Termos Aditivos (T.A.)** — cada um com Objeto do T.A., Nº do
T.A. (texto livre, ex. "1º") e Valor do T.A. A listagem deixa de mostrar o
campo Ativo e passa a mostrar **"Parcela mensal"** = Valor do C.G. + soma de
todos os T.A.s cadastrados. Essa é a base de dados que faltava pro indicador
"total a pagar" que ficou adiado na Fase 5 de Recibos (ver decisão 9 acima) —
**não foi ligado a nenhum indicador ainda**, só a base de dados/UI de cadastro.

Decisões tomadas com o usuário antes de implementar:
1. Valor do C.G. é único por unidade (não repetido por T.A.) — mora no
   cadastro principal.
2. O botão "+ Adicionar parcela mensal" adiciona só T.A.s (Objeto/Nº/Valor),
   numa lista repetível — mesmo padrão de "Fontes" do SOF (`js/sof.js`).
3. Exclusão de unidade reaproveita o `ativo`/`inativarUnidade` que já
   existia — sem campo novo de exclusão lógica. Só muda a confirmação
   (mensagem grande em destaque) e a UI (ícone de lixeira no cartão em vez do
   botão dentro do modal).

**`backend/Unidades.gs` nunca tinha sido coletado neste repositório** — o
usuário colou o conteúdo atual nesta sessão, que virou a base da reescrita e
já está salvo em `/backend/Unidades.gs`.

**Backend (`backend/Unidades.gs` reescrito, `backend/Utils.gs` ajustado):**
- Novo `SHEETS.UNIDADES_TA`/`HEADERS.UnidadesTA`/`COLUNAS_NUMERICAS.UnidadesTA`
  (`Utils.gs`); `HEADERS.Unidades`/`COLUNAS_NUMERICAS.Unidades` ganham
  `valor_contrato_gestao`.
- Mesmo padrão de SOF↔SofFontes (`agruparFontesPorSof_`/`substituirFontesDoSof_`
  em `backend/Sof.gs`): novos helpers `listarTasPorUnidade_`,
  `agruparTasPorUnidade_` (leitura em lote pra `listarUnidades`, evita N+1),
  `parcelaMensalTotal_`, `substituirTasDaUnidade_`. T.A.s viajam dentro de
  `dados.tas` em `criarUnidade`/`atualizarUnidade` — sem endpoint novo, sem
  `case` novo em `Code.gs`. Diferença do SOF: T.A.s são **opcionais** (lista
  pode ficar vazia), Fontes do SOF são obrigatórias.
- `inativarUnidade`/`reativarUnidade` **sem mudança nenhuma** — só passaram a
  ser chamadas de um lugar novo no frontend (ícone de lixeira/restaurar).

**Frontend (`js/unidades.js` reescrito, `css/style.css` com bloco novo
`.cartao-unidade`/`.grade-cards-unidade`/`.aviso-exclusao`):**
- Listagem virou cartões (mesmo padrão visual de `.cartao-sof`): ícones de
  editar (lápis) e excluir/restaurar (lixeira quando ativa, ícone de restaurar
  quando inativa) à esquerda; corpo clicável mostra Nome/Tipo/OSS/CNPJ e o
  selo "Parcela mensal: R$ X".
- Clicar no corpo do cartão expande um bloco (sem chamada de rede, dado já
  carregado) com "Valor do C.G." + a lista de T.A.s, somente leitura.
- Editar (lápis) abre o modal de sempre, agora com o campo "Valor do C.G." e
  uma seção "Termos Aditivos" com lista repetível (reaproveita as classes CSS
  `.linhas-fonte`/`.linha-fonte`/`.linha-fonte-remover` já existentes do SOF,
  sem CSS novo pra isso) e botão "**+ Adicionar parcela mensal**" (nome exato
  pedido pelo usuário, mesmo a ação sendo adicionar um T.A.).
- Excluir (lixeira) abre um modal com o aviso grande e em destaque pedido
  ("TEM CERTEZA QUE QUER EXCLUIR ESSA UNIDADE E TODOS OS SEUS DADOS?..."),
  classe CSS nova `.aviso-exclusao` (texto grande, vermelho, negrito) — não é
  o `confirm()` nativo do navegador. Confirmar chama `inativarUnidade`
  (existente); a unidade some da listagem padrão ("Somente ativas") mas
  continua no banco.

**CONFIRMADO (sessão 2026-07-13):** usuário criou a coluna `valor_contrato_gestao`
e a aba **UnidadesTA** na planilha, adicionou `UnidadesTA: 'UTA'` ao mapa
`PREFIXOS_ID` em `Contadores.gs`, colou `backend/Unidades.gs`/`backend/Utils.gs`
atualizados e reimplantou. Testado e funcionando: criar unidade com Valor do
C.G. + 2 T.A.s e conferir a "Parcela mensal" no cartão; expandir/recolher o
cartão; editar pra adicionar/remover T.A.; excluir com o aviso grande;
`criarSof`/`criarRecibo` continuam funcionando depois da mudança de schema.

**Nota de deploy (sessão 2026-07-12):** o usuário reportou "nada mudou no
visual" depois do push — verificado via `curl` direto no GitHub Pages que
`js/unidades.js`, `js/recibos.js` e `css/style.css` publicados **já eram os
novos** (conteúdo confirmado, headers `Cache-Control: max-age=600`). Era cache
do navegador, não problema de deploy — resolvido com hard refresh
(Ctrl+Shift+R) / aba anônima. Se isso se repetir em sessões futuras, checar o
deploy direto (`curl` nos arquivos publicados) antes de investigar código.

## Leitura automática (OCR) de Nota de Liquidação / Ordem Bancária no Recibo (LEITURA BÁSICA CONFIRMADA, sessão 2026-07-13 - faltam testar os cenários de borda)

Pedido do usuário: ao anexar uma Nota de Liquidação ou Ordem Bancária no
Recibo (documentos oficiais do e-fisco/PE, formato fixo), ler o documento via
OCR e preencher automaticamente `valor_liquidado`/`valor_pago`, validando que
a Nota de Empenho citada no documento é a mesma do Recibo.

Decisões tomadas com o usuário antes de implementar:
1. A leitura acontece **ao anexar o arquivo** (não só ao salvar o Recibo).
2. Se a NE do documento não bater com a NE do Recibo, o sistema **bloqueia**
   (nem preenche, nem deixa o anexo "pegar").
3. Depois de lido, o campo de valor **trava (somente leitura)** - só o
   documento manda no valor - com um link **"Remover anexo"** que libera o
   campo de novo (e desanexa, sem apagar o arquivo do Drive).

**Backend:**
- `backend/Utils.gs`: `extrairTextoOcr_` (sobe o anexo como Google Doc
  convertido com OCR via Advanced Drive Service, lê o texto, descarta o Doc) e
  `normalizarValorMonetarioBr_` (converte "1.053.812,42" pra número - `toNumber_`
  existente não serve, não remove separador de milhar).
  **Bug corrigido (sessão 2026-07-13):** primeira versão usava a sintaxe da
  Drive API v2 (`Drive.Files.insert`, `resource.title`, `ocr:true`), mas o
  "Serviços (+)" do editor do Apps Script hoje adiciona a **v3** por padrão,
  cujo método é `Drive.Files.create` (`resource.name` no lugar de `title`,
  `ocrLanguage` sem o `ocr:true` separado) - erro em produção:
  `Drive.Files.insert is not a function`. Corrigido para a sintaxe v3.
- `backend/Recibos.gs`: nova `lerAnexoRecibo(session, params)` - extrai a NE do
  documento pelo próprio formato (`\d{4}NE\d{6}`, ex: "2026NE000418" - mais
  robusto que amarrar ao rótulo "EMPENHO:", que também aparece dentro de
  "DATA DO EMPENHO:" nos mesmos documentos), compara com a NE do Recibo, e
  extrai o valor pelo rótulo certo ("VALOR LIQUIDADO:" ou "VALOR LÍQUIDO:").
  `atualizarRecibo` ganhou suporte a `removerNotaLiquidacaoArquivo`/
  `removerOrdemBancariaArquivo` (zera só a referência, não apaga do Drive).
- `backend/Code.gs`: novo `case 'lerAnexoRecibo'`.

**Frontend (`js/recibos.js`):** novo helper `ligarAnexoComOcr_` (liga um
`<input type="file">` de anexo à leitura automática, trava/destrava o campo
de valor correspondente, mostra o link de remover) aplicado nos 3 contextos:
Recibo novo (parcela única), cada linha de parcela dividida, e edição de
Recibo existente (nesse último, se já havia um anexo salvo, o campo já nasce
travado ao abrir o formulário). `lerAnexoDoInput_` passou a reaproveitar o
`{base64,nome,tipo}` já validado no momento do anexo, sem reler o arquivo no
submit.

**Limitação conhecida:** trocar a Nota de Empenho *depois* de já ter
anexado/validado um documento não reavalia automaticamente - precisa remover
e reanexar. Fora de escopo desta primeira versão.

**Passos manuais concluídos pelo usuário (sessão 2026-07-13):**
1. Ativou o Advanced Drive Service (`Serviços (+)` → Drive API).
2. Colou `backend/Utils.gs`, `backend/Recibos.gs`, `backend/Code.gs` e
   reimplantou (nova versão).
3. **Autorização OAuth (bloqueio real encontrado):** a autorização do projeto
   (concedida em 7 de julho, antes desta funcionalidade existir) cobria só
   Planilhas e Drive - faltava o escopo de Google Docs
   (`https://www.googleapis.com/auth/documents`), exigido por
   `DocumentApp.openById` em `extrairTextoOcr_`. Rodar uma função no editor não
   disparava a tela de autorização sozinho (a autorização parcial já existente
   parece ter impedido o fluxo incremental de pedir só o escopo que faltava).
   **Fix:** o usuário removeu todo o acesso do projeto em
   [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
   e autorizou de novo do zero (rodando uma função no editor), dessa vez
   incluindo Google Docs no consentimento.

**CONFIRMADO (sessão 2026-07-13):** anexou um documento de exemplo e o valor
foi lido/preenchido corretamente - leitura básica de OCR funcionando de
ponta a ponta (upload → conversão → extração de NE/valor → preenchimento do
campo).

**Ainda não testado:** bloqueio ao anexar documento de NE diferente da do
Recibo; travar/destravar (link "Remover anexo") tanto num Recibo novo quanto
numa edição com anexo pré-existente; o mesmo fluxo dentro de uma linha de
parcela dividida; leitura do segundo tipo de documento (só um dos dois -
Nota de Liquidação ou Ordem Bancária - foi testado até agora).

**Bug real corrigido (sessão 2026-08-06):** ao anexar uma Ordem Bancária real
em "Editar Recibo", o sistema dava "Não foi possível identificar o valor no
documento anexado." O rótulo usado em `REGEX_VALOR_LIQUIDO_OB_DOCUMENTO`
("VALOR LÍQUIDO:") era um chute de quando essa leitura foi implementada - só
a Nota de Liquidação havia sido confirmada contra um documento real (ver
nota logo acima, "Ainda não testado"). O usuário anexou uma OB real
(2026OB010537) e o rótulo verdadeiro do documento é **"VALOR DA ORDEM
BANCÁRIA:"**. Corrigido em `backend/Recibos.gs`: constante renomeada para
`REGEX_VALOR_ORDEM_BANCARIA_DOCUMENTO` com o rótulo certo. **Falta o usuário
colar a nova versão de `Recibos.gs` no editor do Apps Script e reimplantar**
para o fix valer em produção.

## Layout responsivo (CONCLUÍDO, testado e confirmado pelo usuário — sessão 2026-07-14)

Pedido do usuário: o site precisava funcionar bem em qualquer tamanho de tela, de celular a monitor ultrawide. Mudança só de frontend (`index.html`, `js/app.js`, `css/style.css`), sem tocar em backend.

- **Menu lateral retrátil no mobile** (abaixo de 860px): `#barraLateral` vira uma gaveta off-canvas (`transform: translateX(-100%)` / `.aberta`), aberta por um botão hambúrguer novo (`#btnMenuMobile`) em `#barraTopo`, com um fundo escurecido (`#fundoMenuMobile`) que fecha ao clicar fora; fecha também ao navegar pra qualquer tela. Lógica em `js/app.js` (`fecharMenuMobile()` + listeners em `init()`).
- **Grids de formulário empilham** (abaixo de 640px): `.grade-2`/`.grade-3`/`.linha-fonte` viram 1 coluna; `.linha-parcela-dividida` empilha; padding de `#conteudo`/`.painel`/`.modal-corpo` reduz.
- **Cards nunca estouram a largura:** `.grade-cards-sof`/`.grade-cards-unidade`/`.grade-indicadores` usam `minmax(min(Npx, 100%), 1fr)` (CSS moderno, sem precisar de media query dedicada).
- **Tabelas com rolagem própria:** `.painel { overflow-x: auto }` + `table.tabela th/td { white-space: nowrap }` — sem isso as células só espremiam/quebravam o texto de forma feia em vez de rolar (bug encontrado no primeiro teste do usuário, corrigido na mesma sessão).
- **Ultrawide:** `#conteudo { max-width: 1600px; margin: 0 auto }` — centraliza o conteúdo em telas muito largas em vez de esticar tabelas/formulários de ponta a ponta.
- Ajustes pontuais: `#containerToasts` com `width: min(320px, calc(100vw - 32px))`; `.cartao-login` com padding reduzido abaixo de 400px; `.modal-rodape` com `flex-wrap: wrap` (corrigido também no primeiro teste — o botão "Inativar" do modal de Usuário estava sendo cortado da tela em vez de quebrar linha).

**Nota sobre o teste do usuário:** o dropdown nativo de `<select>` (ex.: Status do Recibo) apareceu "vazando" da tela no modo responsivo do DevTools do Chrome desktop — isso é uma limitação da simulação (o Chrome desktop não reproduz o seletor nativo de verdade), não um bug do CSS. Num celular real, esse campo abre o picker nativo do sistema operacional. Vale confirmar em um aparelho de verdade se possível, mas não é motivo de preocupação.

## Listas de OSS/Objeto + filtros consistentes (CONCLUÍDO, testado e confirmado pelo usuário — sessão 2026-07-14)

Pedido do usuário: os filtros de OSS e Objeto (texto livre) deviam virar dropdowns alimentados por listas cadastradas, com uma nova categoria "Objeto" em Listas Personalizadas; o mesmo padrão nos campos Objeto de criação (mantendo o autopreenchimento já existente); e o conjunto completo de filtros do SOF (Busca livre, Unidade, OSS, Objeto, Tipo de unidade, DEA, Fonte) replicado em Notas de Empenho e Recibos.

Decisões tomadas com o usuário antes de implementar:
1. **OSS** virou lista gerenciada em Listas Personalizadas — categoria própria (`OSS`), separada do campo OSS já existente em Unidades.
2. **Objeto** virou lista fechada (categoria `OBJETO`): só aceita valores já cadastrados — criar um SOF/Recibo com um Objeto novo exige cadastrá-lo em Listas Personalizadas primeiro (sem auto-cadastro on-the-fly).
3. Nos formulários de criação/edição de SOF e Recibo, Objeto virou `<select>` (SOF era `<textarea>`; Recibo era `<input>` com `datalist`), mantendo o autopreenchimento por unidade+objeto que já existia no Recibo.
4. **DEA em Notas de Empenho e Recibos não ganhou coluna própria** — o usuário esclareceu que é um atributo que se propaga do SOF (`sof.dea`) para a NE (via `sof_id`) e desta para o Recibo (via `nota_empenho` = `numero_ne`); o filtro resolve isso via join, sem duplicar dado.

**Backend:**
- `ListasPersonalizadas.gs`: `TIPOS_LISTA` ganhou `'OSS'`/`'OBJETO'` (toda a infraestrutura de `listarOpcoes`/`criarOpcao`/`atualizarOpcao` já era genérica). Duas funções de carga única (mesmo padrão de `corrigirFormatoTexto()`): `semearListaOSS()` (a partir dos valores já cadastrados em Unidades) e `semearListaObjetos()` (a partir dos valores já usados em SOF e Recibos) — necessárias porque as listas nasceram vazias.
- `NotasEmpenho.gs` (`listarNotasEmpenho`): passou a juntar Unidades também (além de SOF), anexando `sof_oss`/`sof_dea`/`sof_tipo_unidade` a cada card agrupado; novos filtros `oss`/`objeto`/`tipo_unidade`/`dea`/`busca`.
- `Recibos.gs` (`filtrarLinhasRecibos_`): novo filtro `tipo_unidade` (campo já existia em Recibo); novo filtro `dea` via `mapaDeaPorNumeroNe_()` (join `nota_empenho` → NE → SOF, só executado quando o filtro é realmente usado).

**Frontend:**
- `js/listas.js`: 4 abas (Andamento, Status, OSS, Objeto); o conceito de "pausa contagem parado" (checkbox + coluna) só aparece pras duas primeiras.
- `js/sof.js`: filtros OSS/Objeto viraram `<select>`; campo Objeto na criação/edição virou `<select>` obrigatório (era textarea livre).
- `js/recibos.js`: filtros novos (OSS, Tipo de unidade, DEA); Objeto (filtro e criação/edição) virou `<select>` a partir da lista global — a lógica de autopreenchimento por `historicoRecibosUnidade` (parcela contratual/fonte/NE do último lançamento) continua igual.
- `js/notas-empenho.js`: ganhou os 7 filtros completos (Busca livre, Unidade, OSS, Objeto, Tipo de unidade, DEA, Fonte — antes só tinha Unidade/Fonte).

**Nota operacional importante:** essa mudança é mais bloqueante que as anteriores — até o backend estar implantado e as duas funções de semeadura rodadas, o campo Objeto (obrigatório) aparece vazio nos formulários de SOF/Recibo, impedindo criar processos novos. Por isso o push do frontend foi segurado até o usuário confirmar os 4 passos manuais (colar os 3 `.gs`, reimplantar, rodar `semearListaOSS()`/`semearListaObjetos()`, conferir as listas na planilha).

**Testado e confirmado pelo usuário:** listas OSS/Objeto semeadas corretamente; filtros novos funcionando nas 3 telas (SOF, Notas de Empenho, Recibos); seleção de Objeto na criação/edição com autopreenchimento preservado.

## Nome exibido editável pelo próprio usuário (CONCLUÍDO, sessão 2026-07-14)
Cada usuário agora pode editar como o próprio nome aparece na aplicação (não o login), pelo modal "Minha conta" (clicar no nome/perfil no canto superior direito). Backend: nova `alterarMeuNome(session, novoNome)` em `Auth.gs` (mesmo padrão de `alterarMinhaSenha`) + `case 'alterarMeuNome'` em `Code.gs`. Frontend: campo + botão "Salvar nome" em `abrirModalPerfil` (`js/app.js`); `Auth.atualizarNomeLocal(novoNome)` (`js/auth.js`) atualiza a sessão em memória/`sessionStorage` na hora, sem exigir novo login. Testado e confirmado.

## Fechar modal de edição (X/clique fora) libera a trava de edição simultânea (CONCLUÍDO, sessão 2026-07-14)
Bug encontrado: nos formulários de edição de SOF e Recibo, só o botão "Cancelar" liberava a trava de edição simultânea (`EdicaoSimultanea.sairDaEdicao`, Funcionalidade 10) — fechar pelo X ou clicando fora do modal deixava a trava presa (sem expiração automática por tempo), fazendo outros usuários continuarem vendo "está sendo editado por você" indefinidamente. Só frontend, sem mudança de backend.

Fix: novo mecanismo `UI.aoFecharModal(callback)` em `js/app.js` — registra uma função a ser chamada sempre que `UI.fecharModal()` rodar, por qualquer caminho (Cancelar, X, clique fora, ou fechamento programático após salvar); zerado a cada `abrirModal()` e após disparar uma vez. `js/sof.js`/`js/recibos.js` passaram a registrar `sairDaEdicao` uma única vez ao abrir a edição, em vez de duplicar a chamada manualmente no Cancelar e no sucesso do Salvar. Testado e confirmado pelo usuário.

## Performance — lentidão ao trocar de aba (sessão 2026-07-17)

Usuário relatou 2-3s de atraso ao trocar de aba, mais perceptível em **SOF**
e depois **Recibos**. Revisão completa do roteamento (`js/app.js`) e das 8
telas + todo o backend de leitura. O "1-3s inerente ao Apps Script Web App"
(já documentado desde a Fase 1) continua existindo e não é eliminável, mas a
revisão achou gordura real e específica em cima desse piso, explicando por
que SOF/Recibos pioram mais que as outras telas:

- **SOF era a pior porque `listarSof` fazia 3 leituras completas de abas
  diferentes numa chamada só:** SOF + **SofFontes** (`agruparFontesPorSof_`)
  + **NotasEmpenho** (números de NE nos cards). As outras telas simples
  fazem só 1 leitura.
- **Recibos era a 2ª pior porque a tela disparava 2 requisições HTTP
  separadas** (`listarRecibos` + `indicadoresRecibos`), **cada uma lendo a
  aba Recibos inteira de novo** - a mesma aba lida duas vezes, em duas
  execuções completas do Apps Script.
- **Achado extra (não citado pelo usuário, mas real):** `listarNotasEmpenho`
  tinha um **N+1** - pra cada número de NE distinto, chamava
  `valorLiquidadoPorNe_()`, que lia a aba **Recibos inteira** de novo. Com N
  NEs cadastradas, isso lia Recibos N vezes numa chamada só - piora sozinho
  conforme mais NEs são cadastradas (mesma classe de bug já corrigida pra
  `opcaoTemPausaContagem_` na Fase de Performance anterior, ver
  `RELATORIO_LENTIDAO_SOF.md` item 2.5).
- **Achado extra no Dashboard:** `obterDashboard` lia a aba **SOF duas vezes**
  (`dashboardSofPendenteNe_` + `dashboardParados_`) e a aba **Recibos duas
  vezes** (`dashboardRecibos_` + `dashboardParados_`) numa única chamada.

**Correções aplicadas (mesmo padrão de cache de 30s via `CacheService` já
usado em `Usuarios`/`ListasPersonalizadas`, invalidado na escrita - nenhuma
coluna nova, nenhuma mudança visual, nenhuma mudança de contrato dos dados
já entregues ao frontend):**
- `backend/Sof.gs`: nova `todasFontesComCache_()` (30s), invalidada em
  `substituirFontesDoSof_`. `agruparFontesPorSof_`/`listarFontesPorSof_` usam
  o cache em vez de reler a aba.
- `backend/NotasEmpenho.gs`: nova `todasNotasEmpenhoComCache_()` (30s),
  invalidada em `criarNotaEmpenho`. Usada por `listarSof` (números de NE),
  `listarNotasEmpenhoPorSof`, `listarNotasEmpenho` e `totalEmpenhadoSof_`.
  N+1 corrigido: nova `valorLiquidadoAgrupadoPorNe_()` agrupa Recibos por
  `nota_empenho` numa única leitura, substituindo as N chamadas de
  `valorLiquidadoPorNe_(numeroNe)` (função removida, só era usada ali).
- `backend/Recibos.gs`: `listarRecibos` agora calcula e devolve os
  indicadores (`indicadores: { pendentes, total_pago_ano }`) na mesma
  resposta, reaproveitando a mesma leitura/filtro (`calcularIndicadoresRecibos_`,
  extraída como helper compartilhado). `indicadoresRecibos` continua
  existindo como ação separada (não foi removida do `Code.gs`), só deixou de
  ser chamada em conjunto pela tela de Recibos.
- `js/recibos.js`: `carregar()` faz 1 chamada (`listarRecibos`) em vez de 2
  (`Promise.all` com `indicadoresRecibos`), lendo `resposta.indicadores` em
  vez de uma segunda resposta.
- `backend/Dashboard.gs`: `obterDashboard` lê SOF e Recibos **uma vez cada**
  e repassa pros 3 indicadores (`dashboardRecibos_`/`dashboardSofPendenteNe_`/
  `dashboardParados_`, todos com um novo parâmetro opcional de linhas
  pré-carregadas, mesmo princípio do `listasCarregadas` já usado em
  `listarSof`/`listarRecibos`).
- `backend/Unidades.gs`: novas `todasUnidadesComCache_()`/`todasTasComCache_()`
  (30s cada), invalidadas em `criarUnidade`/`atualizarUnidade`/
  `inativarUnidade`/`reativarUnidade` (Unidades) e em `substituirTasDaUnidade_`
  (UnidadesTA). Item que já estava pendente desde o relatório de performance
  anterior ("cache de leitura pra aba Unidades" - RELATORIO_LENTIDAO_SOF.md,
  seção 5).

**Escopo do que NÃO foi mexido, de propósito:** os `findById_` avulsos que
buscam uma única Unidade/SOF/Recibo por id (usados em `criarSof`, `criarRecibo`,
etc.) continuam lendo a aba direto, sem cache - mudar isso exigiria alterar
o helper genérico `findById_` (usado por praticamente todo o backend), risco
maior pra um ganho que não afeta diretamente a troca de aba (o problema
relatado). `Contadores.gs`/`EdicoesEmAndamento.gs` seguem fora deste
repositório, não mexidos.

**Risco a observar conforme a planilha cresce:** `CacheService` tem limite de
~100KB por chave. Com o volume atual de dados (app no ar há poucos dias)
isso não deve ser problema, mas se `SofFontes`/`NotasEmpenho`/`Unidades`
crescerem muito, o cache dessas abas pode passar do limite e silenciosamente
parar de funcionar (a chamada simplesmente volta a ler a aba direto - sem
erro, só sem o ganho). Se a lentidão voltar mais pra frente, checar isso
primeiro.

**Passos manuais do usuário antes de testar:** colar `backend/Sof.gs`,
`backend/NotasEmpenho.gs`, `backend/Recibos.gs`, `backend/Dashboard.gs`,
`backend/Unidades.gs` atualizados no editor do Apps Script e reimplantar.
Nenhuma coluna/aba nova na planilha.

**Ainda não testado:** medir se a troca de aba (SOF principalmente, depois
Recibos) ficou perceptivelmente mais rápida; conferir que os dados exibidos
continuam corretos (Fontes do SOF, números de NE, indicadores de Recibos,
Dashboard) depois das mudanças de leitura; conferir que a invalidação de
cache funciona (ex.: criar uma Nota de Empenho e ver se o card de SOF já
reflete na hora, sem esperar os 30s).

**Complemento (mesma sessão, depois do merge com o trabalho de OSS/Objeto):**
o merge trouxe duas leituras novas que também liam abas sem usar o cache já
criado - corrigidas: `listarNotasEmpenho` (`unidadesPorId`, em
`NotasEmpenho.gs`) e `mapaDeaPorNumeroNe_` (em `Recibos.gs`, usado pelo
filtro DEA de Recibos) agora usam `todasUnidadesComCache_()`/
`todasNotasEmpenhoComCache_()` em vez de reler a aba direto.

### Complemento 2 — números reais do usuário revelam 3 problemas a mais (sessão 2026-07-17)

Usuário testou e relatou números concretos: troca de aba 2-3s (igual, sem
mudança perceptível), **abrir edição de SOF 6-7s**, **trocar andamento 4-5s**,
**fechar edição 4-5s**. Isso levou a coletar `backend/EdicoesEmAndamento.gs`
(nunca estava neste repositório - agora está, ver seção de Referências) pra
investigar, e a achar 3 problemas novos, dois deles fora do que já tinha sido
mapeado:

1. **`findById_(getSheet_(SHEETS.UNIDADES), id)` nos caminhos de escrita** -
   a rodada anterior deixou esses `findById_` avulsos de propósito fora do
   cache (risco vs. ganho), mas isso explicava sozinho boa parte dos 4-5s de
   "trocar andamento": toda chamada de `atualizarSof` faz
   `recalcularDivergenciaSof_`, que lia a aba **Unidades inteira** de novo, além
   da leitura/escrita da própria SOF. **Corrigido:** nova
   `buscarUnidadePorId_(id)` (`backend/Unidades.gs`) usa o cache de 30s já
   existente; troca aplicada nos 5 pontos que faziam esse lookup somente-leitura
   (`Sof.gs`: `recalcularDivergenciaSof_`, `criarSof`; `Recibos.gs`: `criarRecibo`,
   `criarGrupoParcelaDivididaRecibo`, `atualizarRecibo`).
2. **`obterSof` era uma requisição redundante** - `listarSof` já calcula fontes,
   total e destaque de "parado" pra montar cada card (os mesmos dados que
   `obterSof` busca de novo). `js/sof.js` (`abrirSofExistente`) passou a
   reaproveitar `itens.find(s => s.id === id)`, mesmo padrão que
   `abrirReciboExistente` já usava (`itens.find`, sem `obterRecibo`). Isso
   elimina uma requisição inteira do caminho de abrir a edição de SOF -
   provavelmente a explicação principal pros 6-7s (2 chamadas sequenciais em
   vez de 1, cada uma com um piso de latência considerável do Apps Script Web
   App).
3. **Achado mais importante: o spinner global bloqueava a tela em chamadas que
   o código já tratava como "fire and forget".** `Api.chamar` (`js/api.js`)
   sempre mostrava/escondia o spinner (`UI.mostrarCarregando`/`esconderCarregando`),
   **mesmo quando o chamador não esperava (`await`) a resposta** - então
   `marcarSofVisualizado`/`marcarReciboVisualizado` (já "fire and forget" desde
   a rodada anterior) e a limpeza de `liberarEdicao` ao fechar um modal (que já
   tinha sumido da tela) travavam a interface do mesmo jeito, pelo tempo que a
   requisição levasse - isso era a causa direta dos "fechar edição: 4-5s"
   relatados (o modal já tinha fechado, mas o spinner global ficava por cima
   até `liberarEdicao` terminar).
   **Corrigido:** `UI.mostrarCarregando`/`esconderCarregando` (`js/app.js`)
   viraram um contador em vez de um toggle simples (pra chamadas concorrentes
   não se atropelarem escondendo o spinner uma da outra); `Api.chamar` ganhou
   `opcoes.silencioso` pra pular o spinner por completo - aplicado em
   `sairDaEdicao` (`js/edicao-simultanea.js`, usado tanto por SOF quanto
   Recibo) e nos dois `marcarXVisualizado`.

**Isso também revela algo mais amplo:** o piso de latência de uma chamada ao
Apps Script Web App hoje parece estar mais perto de **4-5s** do que os 1-3s
estimados no relatório original (`RELATORIO_LENTIDAO_SOF.md`) - mesmo
`liberarEdicao`, que só lê/escreve uma aba pequena de 5 colunas, levava esse
tempo. Com esse piso mais alto, a alavanca que mais importa é **reduzir a
quantidade de requisições por ação** (itens 2 e 3 acima), já que otimizar o
conteúdo de uma chamada individual (item 1, cache) ajuda menos proporcionalmente
do que cortar uma chamada inteira.

**Passos manuais do usuário antes de testar:** colar `backend/Sof.gs`,
`backend/Recibos.gs`, `backend/Unidades.gs` atualizados (mudou de novo depois
do complemento 1) e reimplantar. Frontend (`js/sof.js`, `js/recibos.js`,
`js/api.js`, `js/app.js`, `js/edicao-simultanea.js`) só precisa do push
(GitHub Pages).

**Ainda não testado:** medir os 4 tempos de novo (troca de aba, abrir edição
de SOF, trocar andamento, fechar edição) depois de colar/reimplantar e do
GitHub Pages atualizar; confirmar que `buscarUnidadePorId_` não quebrou
nenhuma validação de divergência/snapshot; confirmar que abrir um SOF pela
lista continua mostrando os dados certos sem o `obterSof`.

### Complemento 3 — abrir edição vira otimista, sem esperar a checagem de conflito (sessão 2026-07-17)

Depois do complemento 2, sobrou só uma chamada bloqueante no caminho de abrir
uma edição: `abrirEdicao` (checagem de conflito de edição simultânea). Ela é
leve (lê/escreve uma aba de 5 colunas), então o tempo que ainda levava era o
piso de latência do Apps Script Web App em si - não dava mais pra cortar via
cache. A solução foi arquitetural, não de otimização de conteúdo:

**Antes:** espera `abrirEdicao` responder → só depois mostra o formulário (ou
o aviso de conflito).
**Agora:** mostra o formulário **na hora** (dado já local, via `itens.find` -
zero espera de rede) e roda `abrirEdicao` **em paralelo**, em segundo plano.
Se vier conflito, um aviso aparece alguns instantes depois, **dentro do
formulário já aberto** (não substitui o modal) - o usuário decide "Sair" ou
"Continuar mesmo assim", igual já funcionava antes, só que sem bloquear a
abertura no caso comum (ninguém mais editando).

- `js/edicao-simultanea.js`: reescrito. `entrarEmEdicao` (bloqueante, com seu
  próprio modal interno) virou duas funções: `iniciarEdicao` (dispara
  `abrirEdicao` e devolve a promise crua, sem esperar) e `tratarConflito`
  (chamada depois que o formulário já abriu; se a promise voltar com
  conflito, injeta um aviso - `.aviso-edicao-simultanea`, novo em
  `css/style.css` - no topo do `#modalCorpo` já visível, com os botões
  Sair/Continuar).
- **Cuidado de correção que essa mudança exigiu:** no clique de "Sair", o
  código zera o callback de `UI.aoFecharModal` antes de fechar (`UI.aoFecharModal(() => {})`).
  Motivo: esse callback já tinha sido registrado ao abrir o formulário
  (assumindo que a edição seria nossa), mas em caso de conflito a trava
  nunca chegou a ser assumida por nós (`abrirEdicao` não sobrescreve a linha
  quando detecta que é de outro usuário) - sem esse cuidado, fechar chamaria
  `liberarEdicao` e apagaria a trava de edição **de outra pessoa**, que
  continua editando de verdade.
- `js/sof.js` (`abrirSofExistente`) e `js/recibos.js` (`abrirReciboExistente`):
  passam a chamar `EdicaoSimultanea.iniciarEdicao(...)` sem `await` antes de
  abrir o formulário, e `EdicaoSimultanea.tratarConflito(...)` (também sem
  `await`) depois - o formulário abre imediatamente com o dado de `itens`.

**Passos manuais do usuário antes de testar:** nenhum novo no backend (só
frontend: `js/edicao-simultanea.js`, `js/sof.js`, `js/recibos.js`,
`css/style.css` - GitHub Pages).

**Ainda não testado:** abrir uma edição e sentir se ficou instantâneo;
simular o conflito de verdade (dois logins/abas editando o mesmo SOF ou
Recibo) e conferir que o aviso aparece corretamente dentro do formulário já
aberto, que "Continuar mesmo assim" assume a trava e some com o aviso, e que
"Sair" fecha sem apagar a trava do outro usuário.

**Bug corrigido no mesmo complemento (usuário testou e só sentiu 1-2s de
ganho, não o esperado):** `iniciarEdicao` (a chamada de `abrirEdicao`) e
`listarNotasEmpenhoPorSof` (SOF) foram disparadas **sem** `opcoes.silencioso`.
Como `#sobreposicaoCarregando` (spinner global, `z-index: 70`) fica **acima**
de `#sobreposicaoModal` (`z-index: 40`), o formulário renderizava por baixo
instantaneamente, mas o spinner continuava cobrindo a tela até essas duas
chamadas responderem - na prática anulando quase todo o ganho da abertura
otimista. Corrigido: as duas passaram a usar `{ silencioso: true }`.

## Sessão 2026-07-18 — Excluir Recibo, editar/excluir em Listas Personalizadas, Nova Nota de Empenho (em andamento)

Pedido do usuário com 3 itens. Decisões tomadas antes de implementar:
1. Nova Nota de Empenho (item 3) continua vinculada a um SOF (selecionado no formulário) — não vira uma NE avulsa sem SOF.
2. O cronograma de desembolso (valores mensais extraídos por OCR) é só informativo por enquanto — não substitui a `parcela_mensal` da fonte do SOF no cálculo do alerta "abaixo da parcela mensal" (Fase 4).
3. Campos lidos por OCR (Número, cronograma, Preço Total) travam (somente leitura) depois da leitura, com link "Remover anexo" pra refazer — mesmo padrão já usado nos anexos de Recibo.

### Item 1 — Excluir Recibo (CÓDIGO CONCLUÍDO, aguardando o usuário colar/implantar e ajustar a planilha)
Mesmo padrão de exclusão lógica já usado em SOF (`excluirSof`)/Unidades: ícone de lixeira no canto esquerdo de cada linha da tabela de Recibos; ao clicar, abre modal com aviso vermelho em caixa alta ("TEM CERTEZA QUE QUER EXCLUIR ESSE PROCESSO?", reaproveitando a classe `.aviso-exclusao` já existente) antes de confirmar.
- `backend/Utils.gs`: `HEADERS.Recibos` ganha `excluido`/`excluido_por`/`excluido_em`; `COLUNAS_BOOLEANAS.Recibos` ganha `excluido`.
- `backend/Recibos.gs`: nova `excluirRecibo(session, id)` (qualquer perfil, mesmo princípio de `excluirSof` — sem trava de dono); `criarRecibo`/`criarGrupoParcelaDivididaRecibo` inicializam `excluido: false`; `filtrarLinhasRecibos_` (usada por `listarRecibos` e `indicadoresRecibos`) passa a esconder linhas excluídas por padrão, sem opção de "mostrar excluídos" (mesmo comportamento do SOF — sem restaurar).
- `backend/Code.gs`: novo `case 'excluirRecibo'`.
- `js/recibos.js`: nova coluna de ícone (lixeira) na tabela; `confirmarExclusaoRecibo`.

**Passo manual pendente do usuário:** na aba **Recibos** da planilha, criar as colunas `excluido`, `excluido_por`, `excluido_em`; colar `backend/Utils.gs`, `backend/Recibos.gs`, `backend/Code.gs` no editor do Apps Script e reimplantar.
**Ainda não testado.**

### Item 3 — Listas Personalizadas: editar/excluir por item (CÓDIGO CONCLUÍDO, aguardando o usuário colar/implantar)
Substituiu os botões "Alternar pausa"/"Alternar ativa" e as colunas "Ativa"/"Ações" por ícones de lápis (editar) e lixeira (excluir) por linha, mesmo padrão visual de `js/unidades.js`. Editar abre o mesmo modal de criação, pré-preenchido, reaproveitando `atualizarOpcao`. Excluir é **exclusão física** (`deleteRow_`, não lógica) — decisão: como SOF/Recibo guardam o texto da opção direto na própria linha (não uma FK), remover uma opção da lista não deixa nada órfão em processos já existentes, só deixa de aparecer para novos cadastros.
- `backend/ListasPersonalizadas.gs`: nova `excluirOpcao(session, id)` (gerente, `deleteRow_` + invalida cache).
- `backend/Code.gs`: novo `case 'excluirOpcao'`.
- `js/listas.js`: `abrirFormulario` aceita `opcaoExistente` opcional (edição); `renderTabela` sem colunas Ativa/Ações, com ícones lápis/lixeira (gerente); `confirmarExclusaoOpcao`.
- `css/style.css`: `.tabela-acoes` (novo, só layout dos dois ícones lado a lado).

**Passo manual pendente do usuário:** colar `backend/ListasPersonalizadas.gs`, `backend/Code.gs` no editor do Apps Script e reimplantar. Nenhuma coluna/aba nova na planilha.
**Ainda não testado.**

### Item 2 — Nova Nota de Empenho com OCR (CÓDIGO CONCLUÍDO, regex NÃO calibrado contra o OCR real — aguardando o usuário colar/implantar e testar)

Botão "Nova Nota de Empenho" na tela de Notas de Empenho: usuário escolhe Unidade → SOF → Fonte, anexa o documento da NE já existente, e o OCR preenche Número/cronograma de desembolso (valores por mês)/Preço Total, travando os campos com link "Remover anexo" pra refazer (mesmo padrão de `ligarAnexoComOcr_` já usado em Recibos).

O usuário forneceu um documento de exemplo real (Nota de Empenho do e-fisco/PE) usado para desenhar os regex de extração. **Atenção:** diferente do OCR de Recibo (já validado em produção), estes regex foram calibrados a partir do texto extraído do PDF por uma ferramenta externa (não pelo pipeline real do backend - Advanced Drive Service/`extrairTextoOcr_`), que pode preservar a ordem de leitura do documento de um jeito diferente do OCR real. **Se o número/cronograma/preço total vier errado no primeiro teste, é o próximo passo a corrigir antes de qualquer outra coisa** (mesmo processo que já aconteceu com o OCR de Recibo, que precisou de um ajuste de sintaxe da Drive API v2→v3 depois do primeiro teste real).

**Dados:**
- Nova aba **NotasEmpenhoCronograma** (`id, nota_empenho_id, mes, valor, criado_por, data_criacao`) — mesmo padrão child-table de SofFontes/UnidadesTA. Cronograma é só informativo (decisão do usuário) — não altera o cálculo do alerta "abaixo da parcela mensal" (que continua comparando com `parcela_mensal` da fonte do SOF, Fase 4).
- `backend/Contadores.gs` (cópia local): novo `NotasEmpenhoCronograma: 'NEC'` em `PREFIXOS_ID`.

**Backend (`backend/NotasEmpenho.gs`):**
- `MESES_CRONOGRAMA` (12 regex, um por mês, ex. `JANEIRO\s*:?\s*([\d.,]+)`, com `MAR[ÇC]O` pra tolerar OCR sem cedilha) + `REGEX_PRECO_TOTAL_NE_DOCUMENTO` (usa lookbehind `(?<!PRE[ÇC]O\s)\bTOTAL...` pra distinguir do cabeçalho "PREÇO TOTAL" da tabela de itens e casar só com o rodapé "TOTAL" perto de "LOCALIDADE DE ENTREGA").
- Nova `lerAnexoNotaEmpenho(session, params)`: reaproveita `extrairTextoOcr_`/`normalizarValorMonetarioBr_` (Utils.gs) e `REGEX_NUMERO_NE_DOCUMENTO` (já existente em Recibos.gs, mesmo formato de número em qualquer documento do e-fisco/PE); devolve `{ numero_ne, cronograma: [{mes,rotulo,valor}], preco_total, cronograma_diverge_do_total }` — a divergência é só um aviso não bloqueante no frontend (o preço total oficial impresso manda, o cronograma é informativo).
- `criarNotaEmpenho`: aceita `dados.cronograma` opcional (só quando `tipo === 'original'`) e grava cada mês em `NotasEmpenhoCronograma`.
- `listarNotasEmpenho`: cada grupo (card) passa a expor `cronograma` (do `nota_empenho_id` da NE "original" do grupo, via novo `agruparCronogramaPorNotaEmpenho_`/cache de 30s `todoCronogramaComCache_`).
- `backend/Code.gs`: novo `case 'lerAnexoNotaEmpenho'`.

**Frontend (`js/notas-empenho.js`):** botão "+ Nova Nota de Empenho"; modal com Unidade→SOF→Fonte em cascata (`listarSof` filtrado por unidade) e anexo com OCR; card ganha link "Ver cronograma de desembolso" (expansível, só aparece se houver cronograma salvo).
**CSS:** `.cartao-ne-cronograma`/`.cronograma-ne-grade` (novo).

**Passos manuais pendentes do usuário antes de testar:**
1. Criar a aba **NotasEmpenhoCronograma** na planilha com cabeçalho `id, nota_empenho_id, mes, valor, criado_por, data_criacao`.
2. No editor do Apps Script, adicionar `NotasEmpenhoCronograma: 'NEC'` ao mapa `PREFIXOS_ID` em `Contadores.gs`.
3. Colar `backend/NotasEmpenho.gs`, `backend/Code.gs`, `backend/Utils.gs` e reimplantar.

**Ainda não testado** (nenhum teste real feito ainda): leitura OCR do documento de exemplo ponta a ponta; se número/cronograma/preço total vêm certos; aviso de divergência cronograma×total; card mostrando o cronograma corretamente.

## Sessão 2026-07-20 (parte 2) — Reconciliação do `/backend` local com o editor real do Apps Script

O usuário colou aqui o conteúdo real e atual de **todos** os arquivos do
editor do Apps Script (incluindo `Contadores.gs`, `Seed.gs` e
`appsscript.json`, que nunca tinham sido versionados neste repositório).
Comparação com o que estava no `/backend` local:

- **Idênticos, sem nenhuma mudança necessária:** `Auth.gs`, `Dashboard.gs`,
  `EdicoesEmAndamento.gs`, `Unidades.gs`, `Usuarios.gs`, `LogAuditoria.gs`,
  `Sof.gs`, `Code.gs`, `ListasPersonalizadas.gs`, `Recibos.gs` — a
  reconstrução da sessão anterior (parte 1) bateu exatamente com o que já
  estava implantado.
- **Adicionados ao repositório** (existiam só no editor, nunca tinham cópia
  local): `backend/Contadores.gs`, `backend/Seed.gs`, `backend/appsscript.json`.
  `Contadores.gs` confirma que `PREFIXOS_ID` **já tem** `NotasEmpenhoCronograma: 'NEC'`
  — a pendência registrada na sessão de 2026-07-18 (item "adicionar NEC ao
  mapa") **já estava resolvida**, não precisa de ação.
- **Divergências reais, corrigidas em `backend/Utils.gs`:**
  `HEADERS.NotasEmpenho` no repositório estava incompleto (`['id', 'sof_id',
  'tipo', 'numero_ne', 'valor', 'periodo', 'criado_por', 'data_criacao']`,
  faltando `fonte`/`arquivo_drive_id`/`arquivo_url`, que `criarNotaEmpenho`
  já grava há tempo na aba real). Isso nunca quebrou nada em produção porque
  `appendObjectRow_`/`updateObjectRow_` usam o cabeçalho **real** da planilha,
  não essa constante — só importa se alguém rodar `configurarPlanilha()` numa
  planilha nova do zero. Corrigido, e adicionado `mes_referencia` (novo campo
  desta sessão, ver abaixo).
- **Divergência real, corrigida em `backend/NotasEmpenho.gs`:** a versão
  reconstruída na sessão anterior tinha ficado **mais permissiva** do que a
  real em dois pontos de `lerAnexoNotaEmpenho` — a versão real **exige** que
  os 12 meses do cronograma sejam identificados no documento (falha se
  faltar qualquer um) e **exige** o Preço Total (falha se não achar), sem a
  tolerância que eu tinha adicionado. Também corrigido:
  `REGEX_PRECO_TOTAL_NE_DOCUMENTO` voltou para o padrão exato real (sem o
  `R?\$?\s*` que eu tinha acrescentado sem necessidade), e a pasta do Drive
  da NE voltou a ser referenciada como literal inline (não uma variável nova
  que eu tinha introduzido). Nenhuma dessas correções muda comportamento já
  implantado — só faz o arquivo local bater com o que roda de verdade antes
  de eu empilhar as mudanças novas (mes_referencia + situação do cronograma,
  descritas na seção anterior) por cima.

**Conclusão prática:** dos 5 arquivos que a sessão anterior listou pra colar,
só **`backend/Utils.gs`** e **`backend/NotasEmpenho.gs`** de fato mudaram
(agora corretos, reconciliados com o real). `Code.gs`, `ListasPersonalizadas.gs`
e `Recibos.gs` já estavam certos — não precisam ser recolados. Os passos
manuais continuam os mesmos da seção anterior (coluna `mes_referencia` em
NotasEmpenho; confirmar `excluido`/`excluido_por`/`excluido_em` em Recibos),
**exceto** o item do prefixo `NEC` em `Contadores.gs`, que já está lá.

## Sessão 2026-07-20 — Dropdown pesquisável, redesenho de SOF/NE, situação do cronograma (CÓDIGO CONCLUÍDO, aguardando o usuário colar/implantar e testar)

Pedido do usuário com vários itens. Antes de implementar, foi confirmado com o usuário: o campo "Número do Processo" pedido como obrigatório no SOF é o campo **SEI** já existente (só mudou o rótulo exibido).

**Achado nesta sessão, corrigido como pré-requisito:** o mirror local `/backend` estava desatualizado em relação ao que o usuário confirmou já estar rodando de verdade no editor do Apps Script - `excluirOpcao` (Listas Personalizadas), `excluirRecibo` e `lerAnexoNotaEmpenho`/cronograma de desembolso (Notas de Empenho), todos com UI no frontend já prontos desde a sessão de 2026-07-18, mas sem `case` correspondente em `Code.gs` nem função nos `.gs` deste repositório. Reconstruído aqui a partir da especificação detalhada já registrada na sessão de 2026-07-18 (regexes de OCR, `NotasEmpenhoCronograma`, etc.) - **se o que está rodando de verdade no Apps Script divergir do que foi colado aqui, avisar pra ajustar.**

### 1. Dropdown pesquisável em todo o app
`js/app.js` (`UI.tornarPesquisavel`): novo componente que transforma qualquer `<select>` num combo com busca (progressive enhancement - o `<select>` original continua a fonte de verdade de `.value`/`change`, só fica escondido). Aplicado em todo `<select>` alimentado por lista dinâmica (Unidade, OSS, Objeto, Tipo de unidade, Status, Competência, SOF, Nota de Empenho, Mês) nas telas de SOF, Notas de Empenho, Recibos e Dashboard - não aplicado aos selects de 2-4 opções fixas (Fonte, DEA, perfil, tipo de NE).
**CSS:** `.select-pesquisavel*` (novo).

### 2. SOF - formulário e card (`js/sof.js`, `css/style.css`)
- Campo **OSS** virou `<select>` (lista `ListasPersonalizadas` tipo OSS), pesquisável; se o snapshot atual não estiver na lista, entra como opção extra pra não perder dado.
- Rótulo do campo SEI virou **"Número do Processo"** (mesmo campo/validação, só o texto exibido).
- Nº SOF, DEA e Período (início/fim) já eram obrigatórios antes desta sessão - confirmado, sem mudança de comportamento aí.
- **Stepper de Andamento saiu do modal de edição e foi pro próprio card da listagem** - as 13 etapas ficam à mostra e são clicáveis direto na lista, sem precisar abrir "Editar SOF" (mesma regra de antes: nó "NE EMITIDA" só libera com `possui_ne`).
- **Botão "Adicionar Nota de Empenho" foi removido** - o mini-formulário de NE dentro da edição de SOF continua existindo, mas só é salvo/criado junto com o clique em "Salvar" do formulário principal (se todos os campos da NE ficarem vazios, nenhuma NE é criada nesse Salvar).
- Tabela de NE dentro do SOF: coluna "Valor" renomeada para **"Valor Empenhado"**.
- **Card de SOF redesenhado**, maior e mais espaçado: id do processo + pill de dias parado + lixeira no topo; Nº SOF como título grande; unidade como subtítulo; caixa de informações (Número do Processo/Objeto/Fonte/Total Solicitado); andamento com stepper embutido; rodapé com selo de NE + botão "Abrir processo".

### 3. Notas de Empenho (`js/notas-empenho.js`, `css/style.css`, `backend/NotasEmpenho.gs`)
- Modal "Nova Nota de Empenho": ao escolher tipo **Reforço**, os campos Unidade/SOF somem e aparece só um combo pesquisável **"Nota de Empenho a Reforçar"** (busca em todas as NEs do sistema, não só de uma unidade - `sof_id`/`fonte` são resolvidos a partir da NE escolhida).
- Reforço (tanto no botão "+ Reforço" do card quanto no modal "Nova Nota de Empenho") ganhou o campo obrigatório **"Mês de referência do reforço"** (novo campo `mes_referencia` em `NotasEmpenho`, só gravado pra linhas `tipo=reforco`).
- Card de NE redesenhado: cabeçalho com ícone+fonte/SOF, número grande, unidade, grid 2x2 (Valor bruto/Liquidado/Saldo atual/Parcela de referência), rodapé com "Ver cronograma"/arquivos + botão "+ Reforço".
- Cronograma expandido: caixa com cabeçalho "CRONOGRAMA DE DESEMBOLSO" + badge de meses, tabela Mês/Valor previsto/**Situação** (pill colorida), rodapé com total.
- **Situação por mês** (`Previsto`/`Em processamento`/`Liquidado`/`Pago`), calculada no backend (`listarNotasEmpenho`/`situacaoCronogramaMes_`): compara o mês do cronograma (+ ano tirado dos 4 primeiros dígitos do `numero_ne`) contra `Recibos.competencia` de recibos com aquele `nota_empenho` - sem Recibo = Previsto; `status=PAGO` = Pago; status contendo "LIQUID" = Liquidado; qualquer outro status = Em processamento. **Suposição assumida** (avisar se o fluxo real de status não usar a palavra "LIQUID" em nenhuma opção): pode precisar ajustar esse critério depois de testar com os status reais cadastrados em Listas Personalizadas.
- Reforços com `mes_referencia` aparecem como uma etiqueta "+ reforço" no mês correspondente do cronograma (só informativo, não muda a Situação).

### Passos manuais pendentes do usuário antes de testar
1. Na planilha, aba **NotasEmpenho**: adicionar a coluna `mes_referencia` (se ainda não existir) - além de já ter `fonte`, `arquivo_drive_id`, `arquivo_url` (Fase anterior).
2. Confirmar que a aba **NotasEmpenhoCronograma** existe (`id, nota_empenho_id, mes, valor, criado_por, data_criacao`) e que `NotasEmpenhoCronograma: 'NEC'` já está no mapa `PREFIXOS_ID` de `Contadores.gs` - segundo a sessão de 2026-07-18 isso já foi feito, só confirmar.
3. Na planilha, aba **Recibos**: confirmar que as colunas `excluido`, `excluido_por`, `excluido_em` existem (pendência também da sessão de 2026-07-18).
4. Colar `backend/Utils.gs`, `backend/Code.gs`, `backend/ListasPersonalizadas.gs`, `backend/Recibos.gs`, `backend/NotasEmpenho.gs` no editor do Apps Script e reimplantar - **revisar o diff contra o que já está lá antes de colar**, já que parte deste commit reconstrói funcionalidade que o usuário confirmou já estar rodando (ver "Achado nesta sessão" acima).

**Ainda não testado** (nenhum teste real feito ainda nesta sessão): dropdown pesquisável em uso real; autopreenchimento de OSS via Unidade com o campo agora sendo select; stepper clicável direto no card; Salvar de SOF criando a NE junto; combo de busca de "Nota de Empenho a Reforçar" cruzando unidades; cálculo de Situação do cronograma contra Recibos reais.

## OCR de Nota de Empenho - bug real de cronograma + Fonte automática + ligado no mini-formulário do SOF (sessão 2026-07-21)

Usuário reportou que o OCR de NE "não funciona" no mini-formulário de NE embutido na edição de SOF, e enviou um documento real (`2026NE000078...pdf`) que expôs um bug de verdade, além de pedir que Número/Fonte/Valor Empenhado sejam preenchidos automaticamente ali (esse mini-formulário nunca tinha tido OCR - só o botão separado "Nova Nota de Empenho", ver sessão 2026-07-18, tinha).

**Bug real encontrado com o documento de exemplo:** o texto extraído desse layout lista os **12 rótulos dos meses primeiro** ("JANEIRO: FEVEREIRO: MARÇO: ABRIL:" em blocos de linha, cabeçalho da tabela) **e só depois os 12 valores**, um por linha, na mesma ordem - nunca "MÊS: valor" adjacentes como o regex por mês (`/JANEIRO\s*:?\s*([\d.,]+)/i`) exigia. Isso fazia `lerAnexoNotaEmpenho` falhar sempre no primeiro mês, antes mesmo de chegar em Número/Preço Total - exatamente a causa do "não está funcionando" relatado (mesma classe de problema já prevista no aviso da sessão de 2026-07-18: "NÃO calibrado ainda contra o OCR real").

**Corrigido (`backend/NotasEmpenho.gs`):**
- Nova `extrairCronogramaDesembolso_`: em vez de casar rótulo+valor por mês, isola a seção entre "CRONOGRAMA DE DESEMBOLSO" e o próximo cabeçalho conhecido, e pega os 12 valores monetários que aparecem nela, na ordem (Janeiro a Dezembro é a ordem sempre impressa) - robusto ao formato real de extração observado.
- Cronograma virou **best-effort**: se não achar os 12 valores, `lerAnexoNotaEmpenho` não falha mais por causa disso (antes, qualquer mês não encontrado derrubava a leitura inteira, mesmo Número/Preço Total já tendo sido lidos) - só Número e Preço Total continuam obrigatórios.
- **Fonte automática (pedido novo do usuário):** o documento não traz a categoria TESOURO/SUS/Outra usada pelo app, só um código orçamentário de 10 dígitos (`FONTE: 0605000000` no exemplo). Nova `REGEX_CODIGO_FONTE_NE_DOCUMENTO` (único campo do documento com exatamente 10 dígitos sem separador) + `classificarFonteDoCodigoOrcamentario_`, com a convenção **confirmada com o usuário**: prefixo `500` = TESOURO, `600` ou `605` = SUS, `754` = Operação de Crédito (sem categoria própria no app - cai em "Outra"). Prefixo não reconhecido devolve `null` (campo fica sem sugestão, não arrisca uma classificação errada). `lerAnexoNotaEmpenho` passou a devolver `fonte`/`fonte_codigo`.

**Ligado no mini-formulário de NE do SOF (`js/sof.js`):** nova `ligarOcrMiniFormularioNe_` - ao anexar o arquivo em `neArquivo`, chama `lerAnexoNotaEmpenho` e preenche/trava Número (só quando Tipo = original - em Reforço o Número já vem de um `<select>` de números existentes), Fonte (só trava se o código foi classificado E a categoria existir nas opções daquele SOF) e Valor Empenhado, com link "Remover anexo" pra refazer - mesmo padrão visual (`.anexo-ocr-status`/`.anexo-ocr-remover`) já usado em Recibos/Notas de Empenho, sem CSS novo.

**Passos manuais do usuário antes de testar:** colar `backend/NotasEmpenho.gs` atualizado e reimplantar. Nenhuma coluna/aba nova.

**Ainda não testado:** reler o documento de exemplo (ou outro real) no mini-formulário do SOF e conferir se Número/Fonte/Valor vêm certos; conferir que o cronograma (usado pelo botão "Nova Nota de Empenho" separado) passa a extrair os 12 meses corretamente com esse mesmo documento; testar um código de Fonte de cada categoria (500/600 ou 605/754) pra confirmar a classificação.

**Nota de reconciliação:** em paralelo a esta correção, o repositório também recebeu (de outra sessão/cópia real do Apps Script) o trabalho de performance e filtros multi-seleção descrito nas duas seções abaixo ("Sessão 2026-07-22" e "Lentidão ao trocar andamento no SOF"). Durante essa reconciliação, `backend/Recibos.gs` chegou a ficar temporariamente com o conteúdo errado (uma cópia de `backend/NotasEmpenho.gs` por cima do próprio) - percebido e corrigido antes de qualquer commit ou de ir pro Apps Script real, então nada em produção foi afetado.

## Sessão 2026-07-22 — Ajustes de UX nos filtros (CONCLUÍDO, só frontend/backend leve, sem passo manual)

Três pedidos pequenos do usuário, todos já colados/reimplantados quando aplicável e testados:

- **Visual dos filtros de múltipla escolha** (`css/style.css`): `.campo input` estava vazando `width:100%`/padding pros checkboxes das listas suspensas (empilhava o checkbox em cima do texto em vez de lado a lado) — corrigido excluindo `[type=checkbox]`/`[type=radio]` dessa regra (efeito colateral bom: também corrige a aparência de *todo* checkbox dentro de um `.campo` no app inteiro, não só os das listas). `.campo-filtro-multiplo` virou grid de 2 linhas (rótulo em cima, dropdown+botão "x" embaixo) em vez do flex desalinhado anterior. Botão "x" reduzido de 34px para 26px.
- **Recarregamento desnecessário** (`js/sof.js`, `js/recibos.js`, `js/notas-empenho.js`): "Filtrar"/Enter, "Limpar filtros" e o "x" individual de cada filtro disparavam `carregar()` (spinner + chamada à API) mesmo sem nenhuma mudança real nos filtros. Cada tela agora guarda o último filtro carregado (`ultimoFiltroJson`) e só recarrega se o snapshot atual diverge dele. `notas-empenho.js` ganhou uma `filtrosAtuais()` própria (antes os parâmetros eram montados direto dentro de `carregar()`) pra poder reaproveitar a comparação.
- **Filtros na tela de Unidades** (`js/unidades.js`, `backend/Unidades.gs`): não existiam (só o checkbox "Somente ativas"). Adicionados Busca livre (substring em todos os campos, mesmo padrão das outras telas), **Unidade** (múltipla escolha por nome — pedido à parte, adicionado depois; usa uma segunda leitura sem filtro, `todasUnidades`, só pra popular esse dropdown, separada da lista já filtrada exibida nos cartões), Tipo (múltipla escolha, mesma lista fixa `OPCOES_TIPO` já usada no formulário) e OSS (múltipla escolha, mesma lista de Listas Personalizadas usada em SOF/Recibos/NE), com os mesmos botões "Filtrar"/"Limpar filtros" e a mesma otimização de "só recarrega se mudou" acima. `listarUnidades` (`backend/Unidades.gs`) ganhou os parâmetros `busca`/`unidade_id`/`tipo`/`oss`, reaproveitando `paraArrayFiltro_` (`Utils.gs`) já usado em `listarSof`. Chamadas existentes de `listarUnidades` sem esses parâmetros (SOF/Recibos/NE carregando a lista de unidades pros próprios formulários) continuam funcionando sem filtro, como antes.

**Passo manual pendente:** colar `backend/Unidades.gs` atualizado no editor do Apps Script e reimplantar (só esse arquivo mudou no backend; os outros dois itens são só frontend).

### Lentidão ao trocar andamento no SOF (2-7s) — investigado e corrigido (aguardando o usuário colar/implantar e medir)

Usuário relatou 2-7s ao clicar num nó do stepper direto no card (fluxo introduzido na sessão de 2026-07-20, quando o stepper saiu do modal e foi pro card da lista). O frontend (`avancarEtapaCartao`, `js/sof.js`) já fazia só 1 chamada (`atualizarSof`) sem recarregar a lista - o problema estava inteiro no backend, em `registrarDiferencas_` (log de auditoria):

- Uma troca de andamento muda `andamento` **e também** dois campos derivados automaticamente (`data_ultima_alteracao_andamento`, `visualizado_apos_alerta`) - `registrarDiferencas_` gravava **uma linha de log por campo mudado**, ou seja, até 3 linhas pra uma ação que o usuário só vê como "mudei o andamento".
- Cada linha de log chamava `proximoId_('LogAuditoria')`, que faz `LockService.getScriptLock()` + leitura + escrita na aba **Contadores** - um lock completo só pra gerar 1 ID. 3 campos mudando = 3 ciclos de lock, cada um podendo esperar por outros usuários/chamadas concorrentes.
- Cada linha de log também era `appendObjectRow_` isolado (sua própria leitura de cabeçalho + `setNumberFormats` + `setValues`).

Ou seja, uma troca de andamento podia disparar até **3 locks + 3 escritas de log**, além da própria leitura/escrita do SOF - explica bem a variação de 2 a 7s (pior quando havia outro usuário disputando o lock).

**Corrigido:**
1. `data_ultima_alteracao_andamento`/`visualizado_apos_alerta` (SOF) e o par equivalente `data_ultima_alteracao_status`/`visualizado_apos_alerta` (Recibo) saem do escopo do log de auditoria (`camposIgnorados` em `atualizarSof`/`atualizarRecibo`) - são campos derivados/internos, não uma edição real do usuário, e não deveriam gerar linha de auditoria mesmo (efeito colateral bom: log fica mais limpo, sem essas 2 linhas técnicas por edição).
2. Nova `proximosIds_(nomeAba, quantidade)` (`backend/Contadores.gs`) reserva vários IDs de uma vez com **um único** lock/leitura/escrita na aba Contadores, em vez de um ciclo por ID. `proximoId_` (já usada em todo o resto do backend) vira só `proximosIds_(nomeAba, 1)[0]` - comportamento idêntico pra quem já chama com 1.
3. Nova `appendObjectRows_(sheet, objs)` (`backend/Utils.gs`) grava várias linhas numa única chamada (`setNumberFormats`/`setValues` em lote), reaproveitando o cálculo de formato já usado por `protegerFormatoLinha_` (extraído pra `formatoColunas_`).
4. `registrarDiferencas_` (`backend/LogAuditoria.gs`) agora monta todas as linhas de diferença primeiro, reserva todos os IDs de uma vez (`proximosIds_`) e grava tudo com uma única `appendObjectRows_` - pro caso comum de trocar só o andamento (depois do item 1), isso já vira **1 lock + 1 escrita** de log, igual a uma edição de campo único.

Efeito esperado: pra uma troca de andamento pura, a chamada `atualizarSof` cai de "leitura do SOF + escrita do SOF + até 3 ciclos de lock/escrita de log" pra "leitura do SOF + escrita do SOF + 1 ciclo de lock/escrita de log". Continua existindo 1 leitura não-cacheada da aba SOF inteira (`findById_`) no início de `atualizarSof` - decisão deliberada de não mexer nisso ainda (ver sessão de performance de 2026-07-17: cache pra SOF/Recibo tem risco maior de introduzir bug de dado desatualizado, ao contrário do que já foi feito pra Unidades via `buscarUnidadePorId_`); se a lentidão persistir depois desta correção, esse é o próximo suspeito.

**Passos manuais pendentes do usuário:** colar `backend/Contadores.gs`, `backend/Utils.gs`, `backend/LogAuditoria.gs`, `backend/Sof.gs`, `backend/Recibos.gs` no editor do Apps Script e reimplantar. Nenhuma coluna/aba nova na planilha.

**Ainda não testado:** medir o tempo de trocar andamento de novo depois de colar/reimplantar; conferir que o Log de Auditoria continua registrando corretamente mudanças reais de `andamento`/`status` (só sem as 2 linhas derivadas a mais); conferir que criar/editar SOF ou Recibo com múltiplos campos alterados de uma vez (ex.: editar o formulário inteiro) continua gerando uma linha de log por campo realmente mudado, só que numa escrita em lote.

**Bug encontrado e corrigido no mesmo dia (ainda não testado):** o "x" individual de um campo (múltipla escolha) disparava recarregamento mesmo quando esse campo específico já estava vazio - por causa da otimização "recarregar só se mudou" (acima), qualquer seleção *pendente* (marcada mas ainda sem clicar em "Filtrar") em **outro** campo fazia o "x" de um campo vazio aplicar essa seleção pendente sem querer. Corrigido em `ligarLimpezaFiltros` (`js/app.js`, usado pelas 4 telas com filtro): o "x" individual só recarrega se o campo que ele mesmo limpa tinha alguma seleção antes do clique - `js/app.js` é o único arquivo que muda, o fix vale pra SOF/Recibos/Notas de Empenho/Unidades ao mesmo tempo.

## Auto-avançar andamento do SOF para "NE EMITIDA" ao anexar Nota de Empenho (sessão 2026-07-23, aguardando o usuário colar/implantar e testar)

Pedido do usuário: ao anexar a Nota de Empenho no SOF, se o andamento estiver em qualquer etapa antes de "NE EMITIDA" (das 13 do stepper), avançar sozinho pra lá — hoje o nó só desbloqueava (`sof.possui_ne`), mas ninguém clicava por conta própria. (`docs/ESPECIFICACAO_ATUAL_COMPLETA.md` já descrevia esse comportamento como existente — não estava; este é o que faltava pra doc bater com o código.)

- **`backend/Sof.gs`:** nova constante `ETAPAS_ANDAMENTO_`, espelhando `ETAPAS_ANDAMENTO` de `js/sof.js` (mesma ordem das 13 etapas) — o backend não tinha nenhuma noção de ordem até agora; duplicada porque não há import entre arquivos `.gs`/`.js`.
- **`backend/NotasEmpenho.gs`:** o bloco final de `criarNotaEmpenho` que só marcava `possui_ne = true` na primeira NE original agora também compara `sof.andamento` contra `ETAPAS_ANDAMENTO_.indexOf('NE EMITIDA')`; se estiver antes (incluindo andamento desconhecido/legado, que cai em `indexOf === -1`), avança pra "NE EMITIDA" na mesma escrita da linha (1 só `updateObjectRow_`), replicando o mesmo efeito colateral que uma troca manual já tem em `atualizarSof` (`data_ultima_alteracao_andamento`/`visualizado_apos_alerta`) e logando a mudança normalmente. Só avança pra frente — nunca recua um andamento já igual ou posterior a "NE EMITIDA". Gate em `tipo === 'original'` (reforço nunca aciona, já que só é aceito se a NE original já existir).
- **`js/sof.js`:** o patch otimista local que `salvarSof` já fazia (`resposta.possui_ne = true` depois de criar a NE pelo mini-formulário) ganhou o mesmo cálculo client-side pra refletir o andamento na hora, sem esperar recarregar.

**Passos manuais pendentes do usuário:** colar `backend/Sof.gs` e `backend/NotasEmpenho.gs` atualizados no editor do Apps Script e reimplantar. Nenhuma coluna/aba nova na planilha.

**Ainda não testado:** anexar a primeira NE original num SOF com andamento antes de "NE EMITIDA" (pelo mini-formulário do SOF e pela tela "Nova Nota de Empenho") e conferir que o card mostra "NE EMITIDA" na hora; conferir no Log de Auditoria que ficou registrada a mudança de `andamento`; anexar um reforço ou uma NE original num SOF cujo andamento já esteja em "NE EMITIDA" ou depois e confirmar que nada muda.

## Paginação em Unidades e Notas de Empenho (sessão 2026-07-23, aguardando o usuário colar/implantar e testar)

Pedido do usuário: aplicar a técnica de paginação no app inteiro pra deixar mais fluido. SOF, Recibos e Log de Auditoria já paginavam (backend fatiando os resultados + botões Anterior/Próxima no frontend) desde fases anteriores — só **Unidades** e **Notas de Empenho** ainda carregavam a lista inteira de uma vez (sem paginar), gerando telas com todos os cards renderizados de uma vez só. Esta sessão estende o mesmo padrão já existente (`listarSof`/`js/sof.js`) pra essas duas telas.

- **`backend/Unidades.gs` (`listarUnidades`):** passou a ordenar por `nome` e paginar (`page`/`pageSize`, padrão 20 por página) igual a `listarSof`, retornando `{ items, total, page, pageSize }` em vez do array direto. O cálculo de T.A./parcela mensal (que antes rodava pra toda a lista filtrada) agora roda só nos itens da página exibida.
- **`backend/NotasEmpenho.gs` (`listarNotasEmpenho`):** mesma mudança de formato (`{ items, total, page, pageSize }`), paginando depois de já ter agrupado/ordenado os cards (o agrupamento por `numero_ne` continua precisando processar todas as linhas antes de paginar — a paginação aqui economiza no tamanho da resposta e na renderização, não na leitura da planilha).
- **`js/unidades.js`/`js/notas-empenho.js`:** ganharam paginação de verdade na tela (mesmo padrão visual/de código de `js/sof.js`: `paginaAtual`/`totalRegistros`/`TAMANHO_PAGINA = 20`, `renderPaginacao()`, reseta pra página 1 ao aplicar/limpar filtro).
- **Como `listarUnidades`/`listarNotasEmpenho` também são usadas em outros lugares só pra popular dropdowns (não pra exibir uma lista paginada)** — unidades ativas em SOF/Recibos/Notas de Empenho, todas as unidades no filtro de Unidades, todos os números de NE no combo de reforço — essas chamadas passaram a enviar `pageSize: 100000` explicitamente (mesmo truque que `listarSof`/`listarRecibos` já usavam pra isso) e a ler `.items` da resposta, em vez do array direto.

**Passos manuais pendentes do usuário:** colar `backend/Unidades.gs` e `backend/NotasEmpenho.gs` atualizados no editor do Apps Script e reimplantar. Nenhuma coluna/aba nova na planilha.

**Ainda não testado:** abrir Unidades e Notas de Empenho com mais de 20 registros e conferir que só 20 aparecem por vez, com "Anterior"/"Próxima" funcionando; conferir que os dropdowns que dependem da lista completa (unidade em SOF/Recibos/NE, "Nota de Empenho a Reforçar") continuam trazendo todos os registros, não só os 20 da primeira página; conferir que aplicar um filtro em Unidades/Notas de Empenho volta pra página 1.

## Botão "Criar SOF - SEI" — gera documento de Solicitação Orçamentária e Financeira (sessão 2026-07-23, aguardando o usuário criar as colunas/colar/implantar e testar)

Usuário enviou um documento real do SEI/GOVPE ("Solicitação Orçamentária e Financeira", modelo padrão da SES-PE) e pediu um botão dentro da edição de um SOF que abre um formulário com os campos desse documento (os que já existem no SOF e os que não existem) e gera, ao final, um arquivo HTML no mesmo formato — sem o timbre (imagem do brasão) e sem o rodapé de endereço da Secretaria. Decisões confirmadas com o usuário: os dados ficam salvos no SOF (editáveis depois); o botão só aparece editando um SOF existente; o número do documento é digitado manualmente; o documento gerado abre em nova aba **e** é baixado como `.html`.

- **`backend/Sof.gs` (`atualizarSof`):** `camposEditaveis` ganhou 28 campos novos, todos opcionais e sem validação de formato (documento administrativo, não usado em cálculo/filtro em nenhum outro lugar do app) — identificação (`sei_numero_documento`, `sei_data`), tipo de solicitação/pleito (`sei_tipo_solicitacao`, `sei_previsto_pca`, `sei_numero_pca`, `sei_numero_dfd`, `sei_tipo_pleito`, `sei_justificativa_pleito`), contexto (`sei_area_setor_solicitante`, `sei_tema_poas`, `sei_objeto_despesa`), destinação/credor (`sei_destinacao`, `sei_credor`, `sei_credor_cnpj`, `sei_acao`, `sei_subacao`, `sei_grupo_despesa`), `sei_medida_compensatoria_poas`, `sei_manutencao_linhas` (única exceção ao padrão de colunas planas do resto do app — linhas repetíveis Código/Elemento/Valor guardadas como JSON num só campo, já que é puramente apresentacional neste documento, sem leitura em nenhum outro lugar), convênio/portaria (7 campos), solicitante/ordenador (5 campos) e assinaturas de Nota de Empenho/Nota de Liquidação (4 campos). `criarSof` não precisou mudar — esses campos só são gravados depois, pelo formulário SEI. `HEADERS.SOF` (`backend/Utils.gs`) atualizado com a mesma lista (documentacional).
- **Campos reaproveitados do SOF já existente** (não viraram campo novo): Ação/Subação (`acao_snapshot`/`subacao_snapshot`), CPF/CNPJ (`cnpj_snapshot`), Destinação (prefill de `unidade.tipo`), Credor (prefill de `unidade.nome`), Número do Contrato e CEO E-fisco (seção "Para os casos de LICITAÇÕES" reaproveita `sof.contrato`/`sof.ceo`, mostrados como somente leitura no formulário SEI, com nota pra editar no formulário principal).
- **Simplificação deliberada:** a tabela "Valor total com cronograma de desembolso (mensal)" do documento é montada com as Fontes já cadastradas no SOF (fonte + total solicitado) — as 12 colunas de mês saem em branco no documento gerado pra preenchimento manual depois, já que o SOF não rastreia em qual mês cada valor cai (diferente do cronograma de Nota de Empenho, que é mês a mês). Não virou campo novo de formulário.
- **`js/sof.js`:** botão "Criar SOF - SEI" no rodapé do modal de edição (só aparece editando, mesmo gate já usado pra seção de Notas de Empenho) → `abrirFormularioSeiSof_` abre um segundo modal (`opcoes.grande`, novo `.modal.grande { max-width:900px }` em `css/style.css` + suporte em `UI.abrirModal`/`js/app.js`) com todos os campos, pré-preenchido com valores já salvos ou defaults derivados (Destinação/Credor/CNPJ/Ação/Subação/Data). Seção de "Manutenção de Geres..." usa o mesmo padrão de linhas dinâmicas já usado em "Fontes de recurso" (`linhaManutencaoSeiHtml_`/`renderManutencaoSeiFormulario_`, análogo a `linhaFonteHtml`/`renderFontesFormulario`). Ao salvar: chama `atualizarSof` (reaproveita o endpoint genérico, ganha log de auditoria de graça), monta o HTML (`montarDocumentoSeiHtml_`) e chama as duas saídas: `baixarArquivo` (generalizada com um 3º parâmetro `mimeType`, antes só usada por `exportarCsv` fixo em CSV) e a nova `abrirDocumentoEmNovaAba_` (Blob + `URL.createObjectURL` + `window.open`, padrão inédito no app — revoga a URL depois de 60s, não na hora, pra não quebrar a aba antes de carregar).

**Passos manuais pendentes do usuário:**
1. Na aba **SOF** da planilha, criar as 28 colunas novas (nomes exatos: `sei_numero_documento`, `sei_data`, `sei_tipo_solicitacao`, `sei_previsto_pca`, `sei_numero_pca`, `sei_numero_dfd`, `sei_tipo_pleito`, `sei_justificativa_pleito`, `sei_area_setor_solicitante`, `sei_tema_poas`, `sei_objeto_despesa`, `sei_destinacao`, `sei_credor`, `sei_credor_cnpj`, `sei_acao`, `sei_subacao`, `sei_grupo_despesa`, `sei_medida_compensatoria_poas`, `sei_manutencao_linhas`, `sei_convenio_numero`, `sei_convenio_efisco`, `sei_convenio_conta`, `sei_convenio_banco`, `sei_contrapartida_convenio`, `sei_contrapartida_conta`, `sei_contrapartida_banco`, `sei_solicitante_nome`, `sei_solicitante_cargo`, `sei_ordenador_nome`, `sei_ordenador_cargo`, `sei_ordenador_setor`, `sei_assinatura_ne_nome`, `sei_assinatura_ne_cargo`, `sei_assinatura_nl_nome`, `sei_assinatura_nl_cargo`).
2. Colar `backend/Sof.gs` e `backend/Utils.gs` atualizados no editor do Apps Script e reimplantar.

**Ainda não testado:** o fluxo inteiro (abrir "Criar SOF - SEI", conferir prefill, salvar, conferir a aba nova + o download do `.html`, reabrir e conferir persistência, conferir log de auditoria).

## "Criar SOF - SEI" virou o próprio formulário de criação (sessão 2026-07-23, backend colado/planilha ajustada e frontend publicado — aguardando teste real do usuário)

O usuário testou a sessão anterior ("Criar SOF - SEI" como modal separado, só na edição) e pediu para inverter: o formulário do documento SEI passa a ser o próprio "+ Nova SOF", disponível já na criação, não um passo extra depois. Junto vieram 4 ajustes, alinhados em plan mode antes de implementar (duas perguntas de esclarecimento feitas ao usuário, respostas abaixo já incorporadas):

1. Cada Fonte ganha **12 campos mensais (Jan-Dez)**, preenchidos manualmente (pode ser só 1 mês, pagamento único, ou vários, recorrente) — a soma vira o Total Solicitado (deixou de ser digitado). Mantido um campo **Parcela Mensal separado**, que não entra no documento e continua sendo só a base do alerta da Nota de Empenho.
2. **Ajuste pedido durante a revisão do plano:** o alerta "abaixo do previsto" da NE só dispara quando a Fonte tiver **mais de 1 mês preenchido** no cronograma — SOF de pagamento único (só 1 mês) nunca aciona o alerta, mesmo com valor abaixo da Parcela Mensal.
3. "Número do Contrato" e "CEO E-fisco" (seção Licitações) viraram campos editáveis de verdade (antes eram somente-leitura). Achado durante o plano: o backend (`criarSof`/`atualizarSof`) já aceitava `sof.contrato` há tempo — o campo aparecer sempre vazio era só falta de `<input>` no formulário, não um problema de backend.
4. "Setor" do Solicitante virou campo próprio e editável (`sei_solicitante_setor`, novo) — antes era um espelho somente-leitura de "Área/setor solicitante" (campo diferente, seção Contexto). Pré-preenchido a partir desse valor ao abrir o formulário, mas editável e gravado à parte depois disso.
5. A seção "Destinação e classificação" passou a incluir o campo **OSS** (reaproveitando o `oss_snapshot` que já existia solto no topo do formulário — sem duplicar dado, só mudou de lugar no layout).
6. Autopreenchimento ao escolher a Unidade continua funcionando (OSS/CNPJ/Contrato de Gestão/Ação/Subação/G.D., mais Destinação/Credor/CPF-CNPJ/Ação/Subação do documento).

**Dados novos:**
- Aba **SofFontes**: nova coluna `codigo_poas` (opcional, texto — coluna "CÓDIGO POAS" do documento real, sem entrar em nenhum cálculo).
- Nova aba **SofFontesCronograma** (`id, sof_fonte_id, mes, valor, criado_por, data_criacao`) — mesmo padrão child-table de `NotasEmpenhoCronograma`. `total_solicitado` (em SofFontes) passa a ser calculado no backend como soma dessas linhas, nunca mais confiado como veio do frontend.
- Aba **SOF**: nova coluna `sei_solicitante_setor`.
- `backend/Contadores.gs`: novo `SofFontesCronograma: 'SFC'` em `PREFIXOS_ID`.

**Backend (`backend/Sof.gs`):**
- Novo bloco de cache de 30s pro cronograma (`todasFontesCronogramaComCache_`/`invalidarCacheFontesCronograma_`/`agruparCronogramaPorFonte_`), mesmo padrão de `todoCronogramaComCache_` em `NotasEmpenho.gs`. Novo `fontesComCronograma_()` — ponto único que junta `SofFontes` com o cronograma, usado tanto por `agruparFontesPorSof_` (listagem) quanto por `listarFontesPorSof_` (obter um SOF), pra nunca haver dois lugares que podem divergir sobre isso — importante porque `listarSof` precisa trazer o cronograma: `abrirSofExistente` (frontend) reaproveita o item já carregado por `listarSof` pra reabrir a edição sem chamar `obterSof` de novo (otimização de performance de uma sessão anterior).
- `validarFontes_`: `fonte`/`parcela_mensal` continuam obrigatórios; `total_solicitado` saiu da validação (calculado); nova regra — soma do cronograma da linha precisa ser `> 0`.
- `substituirFontesDoSof_`: além de recriar as linhas de `SofFontes`, agora também recria o cronograma de cada uma (apagar-e-recriar, mesmo princípio de sempre) e calcula `total_solicitado` como soma dos meses. Meses em branco não geram linha.
- Nova constante `CAMPOS_LIVRES_SOF_` (~40 campos: os de sempre + `contrato`/`ceo` + todos os `sei_*`, agora com `sei_solicitante_setor`), reaproveitada por `criarSof` **e** `atualizarSof` — antes só `atualizarSof` tinha essa lista; `criarSof` nunca gravava nenhum campo `sei_*`. `criarSof` filtra os campos snapshot (`oss_snapshot` etc.) desse array antes de usar o loop genérico, porque esses continuam com a lógica própria de autopreenchimento-a-partir-da-unidade-com-override-manual (sem mudança nessa parte).

**Backend (`backend/NotasEmpenho.gs`):** `listarNotasEmpenho` — o cálculo de `alerta` ganhou a condição extra `mesesPreenchidosFonte > 1` (conta quantos meses do cronograma daquela fonte têm valor `> 0`), implementando o ajuste 2 acima. `parcela_mensal` continua sendo o valor de referência, sem mudança.

**Frontend (`js/sof.js`):**
- `abrirFormularioSeiSof_` (modal separado) deixou de existir — suas seções (`<h4 class="sei-secao-titulo">`) entraram dentro de `abrirFormulario`, sempre visíveis (criação e edição), modal sempre `{ grande: true }`. `coletarDadosFormularioSei_`/`salvarEGerarDocumentoSei_` foram absorvidas por `coletarDadosFormulario()`/`salvarSof(sofExistente, opcoes)`.
- Nova organização: Unidade → Dados do cadastro (CNPJ/Contrato de Gestão/Ação/Subação/G.D./T.A.) → Identificação do processo (Número do Processo/Nº SOF/DEA/Período + campos SEI de identificação) → Pleito → Contexto → Destinação e classificação (com OSS) → Fontes de recurso (grade de 12 meses) → Medida compensatória POAS → Manutenção de Geres... → Despesas SUS/Portaria ou Convênio → Licitações (Número do Contrato/CEO, agora editáveis) → Solicitante (com Setor editável) → Ordenador → Assinatura NE → Assinatura NL → Observação.
- Rodapé com duas ações de salvar, as duas disponíveis em criação e edição: "Salvar" (sem gerar documento) e "Salvar e gerar documento SEI" (salva e baixa/abre o HTML na sequência — exige "Número do documento (SEI)" preenchido).
- Linha de Fonte (`linhaFonteHtml`/`renderFontesFormulario`/`lerLinhasFontesDoDom_`) reescrita: Fonte + Código POAS + Parcela Mensal numa linha, 12 campos mensais (Jan-Dez, grid de 6 colunas) embaixo, Total Solicitado virou somente leitura (soma ao vivo). Ganhou classe própria `linha-fonte-cronograma` (em vez de reaproveitar `.linha-fonte`, que continua servindo só as linhas de Manutenção — CSS novo em `css/style.css`).
- `montarDocumentoSeiHtml_`: a tabela de fontes do documento agora imprime os valores reais dos 12 meses e o Código POAS (antes sempre em branco); "SETOR" do Solicitante no documento passou a ler `sei_solicitante_setor` (antes lia `sei_area_setor_solicitante` por engano/limitação).

**CONFIRMADO (sessão 2026-07-23):** usuário concluiu os passos manuais - criou a coluna `sei_solicitante_setor` (aba SOF), a coluna `codigo_poas` (aba SofFontes), a aba nova **SofFontesCronograma** e a linha de prefixo `SFC` em Contadores, colou `backend/Sof.gs`/`backend/Utils.gs`/`backend/Contadores.gs`/`backend/NotasEmpenho.gs` e reimplantou.

**Incidente no meio do caminho:** depois de colar o backend, o usuário testou e "não apareceu o botão" - causa raiz era mais simples que parecia: o frontend (`js/sof.js`/`css/style.css`) só tinha sido editado localmente neste repositório, nunca commitado nem enviado ao GitHub, então o GitHub Pages ainda servia a versão antiga do site (só o backend, no Apps Script, já estava atualizado). Corrigido com `git commit` + `git push` (commit `2e139fb`, branch `main`). **Lição reforçada:** diferente do backend (que precisa de colar manual + reimplantar), o frontend só atualiza no site publicado depois de commitado e enviado ao GitHub - uma sessão só editar os arquivos locais não é suficiente, e o cache do GitHub Pages (`max-age=600`, já visto antes) pode atrasar a atualização em até ~10 minutos mesmo depois do push.

**Ainda não testado** (nenhum teste real confirmado ainda, mas backend + frontend já publicados): criar uma SOF do zero com o formulário completo, incluindo 2-3 meses de cronograma numa Fonte, e conferir persistência ao reabrir; "Salvar e gerar documento SEI" gerando o HTML com os meses/Código POAS reais e os campos de Licitações/Setor preenchidos; alerta da NE aparecendo só quando a fonte tem 2+ meses preenchidos (e não aparecendo com só 1 mês); abrir um SOF criado antes desta sessão (sem os campos novos) sem erro.

## Cache-first com revalidação por versão em todas as abas (sessão 2026-07-26, testado e publicado)

Usuário pediu para investigar se dava pra carregar tudo do banco de uma vez na abertura do app, pra trocar de aba parecer instantâneo depois. Avaliado e descartado um "carregar tudo": o backend é Google Sheets via Apps Script Web App sem estado entre requisições (relê a aba inteira em toda chamada), e a app tinha acabado de ganhar paginação em Unidades/Notas de Empenho (sessão 2026-07-23) justamente porque carregar tudo de uma vez já tinha ficado pesado — pré-carregar tudo no login reintroduziria o mesmo problema, só que concentrado na abertura, e pioraria sozinho conforme os dados crescem. Também arriscaria mostrar dado desatualizado numa aplicação que já tem Edição Simultânea e alertas de saldo — o tipo de erro que o app foi desenhado pra evitar.

Direção escolhida em vez disso: **cache-first com revalidação por versão**, generalizando o padrão de UI otimista que `abrirSofExistente`/`abrirReciboExistente` (`js/sof.js`/`js/recibos.js`) já usavam (mostrar dado já em memória, reconciliar depois) — só que aplicado à navegação entre abas, não só à abertura de um card.

**Backend — novo `backend/Versoes.gs`:** `bumpVersao_(recursos)`/`getVersoes(session, params)`, contador por recurso (`sof`, `recibos`, `notasEmpenho`, `unidades`, `logAuditoria`, `listas`, `usuarios`, `dashboard`) via `PropertiesService` (não `CacheService`: o contador precisa sobreviver além do TTL de 30s já usado nos caches de leitura existentes). Sem `LockService` de propósito — mesmo padrão "sem lock" já usado no resto do código; numa escrita simultânea rara no mesmo recurso um incremento pode se perder, mas isso só atrasa uma revalidação em mais um ciclo, nunca gera dado incorreto mostrado como definitivo. Novo `case 'getVersoes'` em `backend/Code.gs`. Toda função de escrita relevante em `Sof.gs`, `Recibos.gs`, `NotasEmpenho.gs`, `Unidades.gs`, `LogAuditoria.gs`, `ListasPersonalizadas.gs`, `Usuarios.gs` e `Auth.gs` ganhou uma chamada a `bumpVersao_(...)`, no mesmo ponto onde cada uma já invalidava o `CacheService` (ou logo após o `appendObjectRow_`/`updateObjectRow_`, nos casos sem cache de leitura próprio).

**Frontend — novo `js/cache-abas.js`:** módulo `CacheAbas` com `comRevalidacao(recurso, params, carregarFn, aoRevalidar)` (mostra o snapshot em memória na hora, se existir, e confere a versão em paralelo — só refaz a chamada pesada se mudou) e `invalidar(recurso)` (limpa o snapshot logo após uma escrita do próprio usuário, pra refletir na hora sem esperar o round-trip de `getVersoes`). Integrado em `js/sof.js`, `js/recibos.js`, `js/notas-empenho.js`, `js/unidades.js`, `js/log-auditoria.js`, `js/listas.js`, `js/usuarios.js` e `js/dashboard.js` — cada `carregar()` passou a chamar `CacheAbas.comRevalidacao(...)` em vez de `Api.chamar(...)` direto, e os pontos de escrita (criar/atualizar/excluir) ganharam `CacheAbas.invalidar(recurso)`. Fora de escopo, deliberadamente: o cache de referência que já existia em `Api` (`{cache:true}`, usado só pra popular dropdowns de filtro) não foi tocado.

**Incidente durante o teste (mesma lição da sessão de 2026-07-23, reforçada de novo):** o primeiro teste do usuário não mostrou nenhuma melhora — commit feito, mas ainda sem `git push`, então o GitHub Pages continuava servindo o frontend antigo (sem `cache-abas.js`). Corrigido com `git push` (commit `f2326c7` + merge `d644b61`, branch `main`).

**CONFIRMADO (2026-07-26):** backend colado/reimplantado, frontend commitado e enviado, testado pelo usuário — troca de aba mostra o cache instantaneamente e revalida sozinha em segundo plano.

## Formulário de SOF: campos duplicados removidos e obrigatoriedade ampliada (sessão 2026-07-26, publicado)

Pedido do usuário: "Número do documento (SEI)" e "Nº SOF" eram o mesmo dado digitado duas vezes — removido o primeiro, `sof_numero` passou a ser a única fonte (inclusive no título do documento SEI gerado). CNPJ, Ação, Subação e G.D. também apareciam duas vezes (uma em "Dados do cadastro", outra — exceto G.D. — em "Destinação e classificação"); ficou só um campo de cada, na seção "Destinação e classificação", alimentando ao mesmo tempo o par de colunas do backend (`cnpj_snapshot`/`sei_credor_cnpj`, `acao_snapshot`/`sei_acao`, `subacao_snapshot`/`sei_subacao`) sem precisar mexer no schema. "Assinalar o pleito" migrou para "Identificação do processo" e "Justificativa do pleito para a CPF/SAD" para "Contexto" — a seção "Pleito", que ficou vazia, foi removida. Lista de campos obrigatórios (`CAMPOS_OBRIGATORIOS`, `js/sof.js`) ampliada bastante: Unidade, CNPJ, Contrato de Gestão, Ação, Subação, G.D., T.A., Solicito, Assinalar o pleito, Área/setor solicitante, Tema POAS, Objeto da despesa (texto completo), Destinação, Credor, e todos os campos de Solicitante/Ordenador/Assinatura da NE/Assinatura da NL, além dos que já eram obrigatórios.

Só `js/sof.js` mudou — sem alteração de backend (os campos removidos simplesmente deixam de ser enviados; `criarSof`/`atualizarSof` continuam aceitando-os se algum dia voltarem).

## Campo "Tipo de SOF" com autopreenchimento destacado (sessão 2026-07-26, publicado, backend precisa reimplantar)

Pedido do usuário: um campo "Tipo de SOF" (Emenda Parlamentar Federal/Estadual, Investimento, Pagamentos Regulares) e, ao escolher um tipo na criação, autopreencher o formulário inteiro com os dados do último SOF daquele tipo, destacando em amarelo tudo que foi preenchido assim, pra usuário revisar o que não deve se repetir.

- **Reaproveitado, não criado do zero:** a coluna `tipo` já existia no schema do SOF (`HEADERS.SOF`/`CAMPOS_LIVRES_SOF_` em `backend/Sof.gs`) desde sessões anteriores, mas nenhuma tela nunca a expunha - virou a base do campo novo, sem precisar de coluna nova na planilha.
- **`backend/Sof.gs` (`listarSof`):** novo filtro `tipo` (mesmo padrão `paraArrayFiltro_` dos outros filtros). O frontend usa isso pra buscar `{ tipo: [valor], page: 1, pageSize: 1 }` (já ordenado por mais recente) e achar o "SOF modelo".
- **`js/sof.js`:** `CAMPOS_TEMPLATE_SOF_` mapeia todo campo simples do formulário pra sua chave no SOF; `aplicarTemplateSof_` aplica um SOF "modelo" nos campos, aplica a classe `.destaque-repeticao` (borda/fundo amarelo, `css/style.css`) em cada um, e copia também Fontes de recurso e Manutenção SEI (arrays dinâmicos, sem destaque nesses por ora). O destaque de um campo some sozinho na primeira vez que o usuário mexe nele. Só dispara na criação (não na edição).

**Passo manual pendente:** colar `backend/Sof.gs` atualizado (novo filtro `tipo` em `listarSof`) e reimplantar - sem isso o autopreenchimento não encontra nada (falha silenciosa, formulário só fica sem preencher).

## Objeto reposicionado + cadastro inline, e correção do "x" individual dos filtros (sessão 2026-07-26, publicado)

Dois pedidos separados do usuário, ambos só em frontend:

**Objeto (`js/sof.js`):** o campo "Objeto (lista)" saiu de dentro de "Contexto" (no meio do formulário) e foi para o topo, logo abaixo de "Tipo de SOF". Ganhou também uma opção "+ Adicionar novo objeto..." no fim do `<select>` (`selectObjetoHtml_`/`NOVO_OBJETO_VALOR_`) - ao escolhê-la, um prompt pede o texto novo, que vira uma opção local imediatamente selecionável, mas **só é gravado em Listas Personalizadas depois que o SOF é salvo com sucesso** (`criarOpcao` chamado logo após `criarSof`/`atualizarSof` retornar, dentro do mesmo `try`) - se o SOF falhar na validação ou na gravação, o objeto novo nunca chega a ser criado na lista; se só a gravação do objeto falhar (rede etc.), o SOF já salvo não é afetado.

**Bug nos filtros de múltipla escolha, achado pelo usuário ao testar** (`js/app.js` + `js/sof.js`/`js/recibos.js`/`js/notas-empenho.js`/`js/unidades.js`): o "x" individual de um filtro (ex.: OSS) recarregava a lista lendo o estado *ao vivo* de **todos** os campos da barra - se outro campo (ex.: Objeto) tinha uma seleção feita mas ainda não confirmada em "Filtrar", ela era aplicada sem querer só por limpar um campo diferente.

- **Primeira tentativa (errada, corrigida na hora pelo usuário testando localmente):** fazer o "x" individual "restaurar" todos os outros campos pro último valor aplicado antes de zerar o campo clicado - só que isso *revertia visualmente* as seleções pendentes dos outros campos (o usuário via suas marcações em OSS/Objeto somem, não só o campo que ele clicou o "x").
- **Correção final:** `ligarLimpezaFiltros` (`js/app.js`) ganhou um 4º parâmetro opcional, `aoLimparIndividual(idCampo)`, chamado só no "x" individual (nunca no "Limpar filtros" geral). Cada tela implementa `aoLimparFiltroIndividual_` usando um mapa `CHAVE_POR_FILTRO_` (id do widget → chave de `filtrosAtuais()`) pra recarregar com `Object.assign({}, ultimoFiltroAplicado, { [chave]: [] })` - **sem ler nem tocar em nenhum outro campo da tela**. Os outros widgets continuam exatamente como o usuário deixou, prontos pra ele clicar "Filtrar" quando quiser. De brinde, o campo de busca por texto (e, em Recibos, Instrumento/Nota de Empenho/Nº Processo) parou de ser limpo nesse fluxo - só o "Limpar filtros" geral faz isso agora.

Sem alteração de backend nesta seção - só frontend.

## Coluna "Objeto" na tabela de Recibos (sessão 2026-07-27, publicado)

Pedido do usuário: ver o Objeto do Recibo direto na listagem, sem precisar abrir cada um. `objeto` já existia no schema de Recibos e já era usado nos filtros/formulário - só faltava exibir na tabela. `js/recibos.js` (`renderTabela`): nova coluna "Objeto" entre Unidade e Nº Processo. Sem alteração de backend.

## Dashboard gerencial de verdade (sessão 2026-07-27, aguardando o usuário colar/implantar e testar)

Usuário reportou o card "Edições em processo de outro usuário (histórico)" como se fosse um indicador de trava em tempo real - **achado real**: era uma contagem histórica desde sempre, sem filtro de data (`contarEdicoesForaDono_(params.data_inicio, params.data_fim)` era chamada, mas o frontend nunca enviava `data_inicio`/`data_fim`). A partir disso, pediu pra remover esse card e repensar a aba inteira, alinhada ao objetivo real do app (acompanhar SOF, saldo de Notas de Empenho, recibos pendentes de pagamento, valores mensais por unidade), sem contar nada excluído. Depois enviou uma referência visual (mockup: legenda + título, 4 cartões com ícone/seta/variação, dois painéis lado a lado com linhas clicáveis navegando pra Recibos já filtrado por status) e pediu mais indicadores por conta própria - mantida a paleta/componentes já existentes do app em vez da paleta do mockup.

**Achados que motivaram mudança de backend, não só o card removido:**
- Nem `dashboardRecibos_` nem `dashboardSofPendenteNe_` filtravam `excluido` - o dashboard antigo já misturava SOF/Recibo excluídos nos números. Corrigido filtrando uma única vez em `obterDashboard`.
- `listarNotasEmpenho` juntava com **todos** os SOFs, inclusive excluídos - uma NE de um SOF já excluído continuava aparecendo normalmente na tela de Notas de Empenho. A parte de agrupamento foi extraída pra `montarGruposNotasEmpenho_` (nova, `backend/NotasEmpenho.gs`), que agora exclui grupos de SOF excluído/inexistente - conserta a tela de NE e alimenta o indicador novo de saldo do dashboard com o mesmo código, sem duplicar a lógica.
- Não existia em lugar nenhum resolução de `criado_por` (guarda o `id` do usuário, ex. `USR-000123`) pra nome amigável - painéis novos do dashboard resolvem isso via `listarUsuarios` (só funciona pra perfil gerente, que é quem já tinha acesso a essa lista - analista vê o id cru como fallback, degrada sem quebrar).
- Navegação entre abas (`js/app.js`, `TELAS`/`navegarPara`) nunca aceitava parâmetro nenhum - agora aceita um `opts` opcional, repassado pra tela de destino.

**Backend:**
- `backend/Dashboard.gs`: `obterDashboard` filtra `excluido` uma vez (SOF e Recibos) e não tem mais o bloco de `edicoes_fora_do_dono`. `dashboardRecibos_` ganhou `total_recibos_competencia_anterior` (nova `competenciaAnterior_`, "jul.26" → "jun.26"), reaproveitando o mesmo array já carregado. `dashboardSofPendenteNe_` cada item ganha `dias_aguardando` (`diasSemAlteracao_`, já existia), lista cortada nos 8 mais antigos. `dashboardParados_` ganhou `novos_hoje` (heurístico: `dias_parado === 6`, ou seja "hoje é o primeiro dia que conta como parado" - **não é um evento armazenado de verdade**, só uma aproximação; se o usuário ficar mais de um dia sem abrir o dashboard, itens que cruzaram o limite "ontem" não aparecem mais aqui - vale confirmar com o usuário se essa aproximação é aceitável no uso real). Novo `dashboardNotasEmpenho_` (soma valor_bruto/valor_liquidado/valor_atual de todos os grupos via `montarGruposNotasEmpenho_`, separa os com `valor_atual <= 0` como "sem saldo" - mais crítico que o `alerta` que já existia, que dispara antes disso). Novo `dashboardUnidades_` (soma `parcelaMensalTotal_` de todas as unidades ativas).
- `backend/NotasEmpenho.gs`: `montarGruposNotasEmpenho_` extraída de dentro de `listarNotasEmpenho` (mesmo cálculo de sempre, só que antes dos filtros de `params`/paginação), excluindo grupos cujo SOF esteja excluído ou não exista mais.
- `backend/Sof.gs` (`listarSof`): novo filtro `semNe` (`!possui_ne`) - só usado programaticamente pelo indicador do dashboard, não vira widget na barra de filtros da tela.
- `backend/LogAuditoria.gs`: `contarEdicoesForaDono_` removida (sem chamador depois da remoção do card).

**Frontend:**
- `js/app.js`: `navegarPara(tela, opts)` repassa `opts` pra `TELAS[tela](opts)` (`sof`/`recibos` passam a aceitar; as demais telas continuam sem parâmetro). Novo `UI.definirValoresFiltroMultiplo(id, valores)`, expondo o `definirValores` que o widget de filtro múltiplo já tinha internamente.
- `js/recibos.js`: `render(filtroInicial)` - pré-seleciona Competência/Status (`UI.definirValoresFiltroMultiplo`) antes da primeira carga se vierem em `filtroInicial`, e abre um Recibo direto (`abrirReciboExistente`) se vier `filtroInicial.abrirId`.
- `js/sof.js`: `render(opts)` - primeira carga inclui `semNe: true` se `opts.semNe`, e abre um SOF direto (`abrirSofExistente`) se vier `opts.abrirId`.
- `js/dashboard.js` (reescrito): legenda + título + subtítulo; grade de 6 cartões clicáveis (Recibos na competência, Valor pago, SOFs sem NE, Processos parados, Saldo em Notas de Empenho, Total mensal de Unidades), cada um navegando pra aba certa já filtrada ou dando scroll até o painel correspondente; dois painéis lado a lado (Recibos por status com barra de progresso e linhas clicáveis; SOFs pendentes de NE com lista compacta clicável) e um painel de Processos parados (tabela completa, linhas clicáveis abrindo o SOF/Recibo direto).
- `css/style.css`: `.cartao-indicador` ganhou ícone/seta/variação/estado clicável (extensão, não substituição); novo `.dash-etiqueta`/`.dash-subtitulo`/`.dash-grade-paineis`/`.dash-painel-cabecalho`/`.dash-lista`/`.dash-item-lista`, com breakpoint responsivo em 900px pros painéis colapsarem pra 1 coluna. Barra de progresso reaproveita `.barra-progresso` que já existia (andamento do SOF) - sem CSS novo pra ela.

**Passos manuais pendentes do usuário:** colar `backend/Dashboard.gs`, `backend/NotasEmpenho.gs`, `backend/Sof.gs` e `backend/LogAuditoria.gs` atualizados no editor do Apps Script e reimplantar. Nenhuma coluna/aba nova na planilha.

**Ainda não testado:** o dashboard inteiro (os 6 cartões, os cliques de navegação com filtro pré-aplicado, abrir um SOF/Recibo direto da lista de parados/pendentes, excluir um SOF/Recibo e confirmar que some dos números, uma NE de um SOF excluído sumindo também da tela de Notas de Empenho); validar com o usuário se o heurístico de "novos hoje" (processos parados) faz sentido no uso real, já que não é um evento armazenado.

## Lentidão ao salvar Unidades (até ~20s) — corrigido (sessão 2026-07-27, aguardando o usuário colar/implantar e medir)

Usuário relatou até 20s pra salvar uma edição em Unidades, travando o app nesse meio tempo. Achado real, mesma classe de bug já corrigida antes pro log de auditoria (ver "Lentidão ao trocar andamento no SOF" acima): `substituirTasDaUnidade_` (`backend/Unidades.gs`) gerava o ID de cada Termo Aditivo novo com `proximoId_` isolado (1 ciclo de lock+leitura+escrita na aba Contadores **por T.A.**) e gravava cada um com `appendObjectRow_` isolado (1 escrita própria por T.A.) - uma unidade com vários T.A.s virava vários ciclos de lock+escrita sequenciais só nessa etapa, além da própria atualização da linha da Unidade.

**Corrigido:** `substituirTasDaUnidade_` agora reserva todos os IDs de uma vez (`proximosIds_('UnidadesTA', quantidade)`, já existia, criada na correção anterior) e grava todas as linhas novas numa única chamada (`appendObjectRows_`, idem) - vira 1 ciclo de lock + 1 escrita, não importa quantos T.A.s a unidade tenha. As exclusões das linhas antigas (`deleteRow_`) continuam uma por uma (sem lote nativo do Sheets pra linhas não-contíguas) - normalmente poucas por unidade, não deveria ser o gargalo principal depois desta correção.

**Achado relacionado, não corrigido ainda (fora do pedido original):** `substituirFontesDoSof_` (`backend/Sof.gs`, Fontes de recurso do SOF) tem exatamente o mesmo padrão não-lotado - pior ainda, já que cada Fonte também gera até 12 linhas de cronograma mensal, cada uma com seu próprio `proximoId_`/`appendObjectRow_`. Se o usuário confirmar lentidão parecida ao salvar SOF (com várias fontes/meses preenchidos), a mesma correção se aplica lá.

**Passo manual pendente:** colar `backend/Unidades.gs` atualizado no editor do Apps Script e reimplantar. Nenhuma coluna/aba nova na planilha.

**Ainda não testado:** medir o tempo de salvar uma Unidade com vários T.A.s antes/depois da correção.

## Unidades: C.G. por fonte (Tesouro/SUS), T.A. sazonal com vencimento, e "Gerar PDF" (sessão 2026-07-27, aguardando o usuário criar as colunas/colar/implantar e testar)

Três pedidos do usuário pra tela de Unidades: (1) algumas unidades têm repasse mensal recorrente em Tesouro e SUS, outras só numa fonte - "Valor do C.G." precisava virar dois campos; (2) Termos Aditivos precisavam de um tipo de pagamento (Regular/Sazonal) - se sazonal, o analista informa até quando aquele pagamento é feito, e quando essa data passa o card deve mostrar um aviso (o valor continua contando na Parcela Mensal normalmente, só o aviso é novo - o analista decide remover manualmente); (3) um botão "Gerar PDF" que lista as unidades atualmente filtradas (todas, se nenhum filtro aplicado).

**Sem migração de dado:** `valor_contrato_gestao` (já existia) passou a significar "Valor do C.G. — TESOURO" - mesmo nome de campo, só reinterpretado na tela, nenhum dado existente perdido. Nova coluna `valor_contrato_gestao_sus`.

**Backend (`backend/Unidades.gs`):**
- `parcelaMensalTotal_(valorTesouro, valorSus, tas)` - assinatura mudou de 2 pra 3 parâmetros (Tesouro + SUS + soma dos T.A.s), atualizada nos 3 pontos que chamam (`criarUnidade`, `atualizarUnidade`, `listarUnidades`). Um T.A. sazonal vencido continua entrando nessa soma - só o aviso é novo, o cálculo de dinheiro não muda (pedido explícito do usuário).
- Nova `anotarVencimentoTas_(tas)`: calcula `vencido` em cada T.A. (`tipo_pagamento === 'sazonal' && data_vencimento` no passado) - **campo calculado, nunca gravado**, mesmo princípio de `dias_parado`/`destacar_parado` (SOF), nunca fica desatualizado.
- `substituirTasDaUnidade_`: cada T.A. grava também `tipo_pagamento` ('regular'/'sazonal', valor antigo/em branco vira 'regular' automaticamente - T.A.s já cadastrados continuam funcionando sem mudança) e `data_vencimento` (só gravada quando sazonal - some se o analista trocar pra regular sem limpar o campo, evita lixo órfão). Continua usando `proximosIds_`/`appendObjectRows_` em lote (correção da sessão anterior).
- `criarUnidade`/`atualizarUnidade`: passam a ler `valor_contrato_gestao_sus` também.

**Dados novos:**
- Aba **Unidades**: nova coluna `valor_contrato_gestao_sus`.
- Aba **UnidadesTA**: novas colunas `tipo_pagamento`, `data_vencimento`.
- `backend/Utils.gs`: `HEADERS.Unidades`/`HEADERS.UnidadesTA`/`COLUNAS_NUMERICAS.Unidades` atualizados.

**Frontend (`js/unidades.js`):**
- Card: "Valor do C.G." virou duas linhas (Tesouro/SUS, sempre as duas, mesmo quando uma é R$ 0,00). T.A. vencido ganha um aviso vermelho "⚠ Pagamento sazonal encerrado em DD/MM/AAAA - remova este T.A. se não for mais válido".
- Formulário: campo único de C.G. virou dois lado a lado. Linha de T.A. ganhou "Tipo de pagamento" (select) + "Data limite" (só aparece quando Sazonal é selecionado) - classe própria `.linha-ta` (não reaproveita `.linha-fonte`, que continua servindo só as linhas de Manutenção do SEI - mesmo princípio de `.linha-fonte-cronograma` quando a Fonte do SOF cresceu antes).
- Novo botão "Gerar PDF" na barra de filtros: busca todas as unidades que batem com o filtro atual (`pageSize: 100000`, mesmo padrão de `exportarCsv` em SOF/Recibos - não só a página de 20 visível), monta uma página HTML limpa própria pra impressão (`montarPdfUnidadesHtml_` - tabela Nome/Tipo/OSS/CNPJ/C.G. Tesouro/C.G. SUS/Total T.A.s/Parcela Mensal + total geral) e abre em nova aba. **Sem biblioteca externa** (decisão confirmada com o usuário, já que o app é 100% vanilla até hoje) - a própria página aciona `window.print()` sozinha (`<body onload="window.print()">`), o usuário só escolhe "Salvar como PDF" no diálogo do navegador.

**Passos manuais pendentes do usuário:**
1. Na aba **Unidades**, criar a coluna `valor_contrato_gestao_sus`.
2. Na aba **UnidadesTA**, criar as colunas `tipo_pagamento` e `data_vencimento`.
3. Colar `backend/Unidades.gs` e `backend/Utils.gs` atualizados no editor do Apps Script e reimplantar.

**Ainda não testado:** salvar uma unidade com C.G. Tesouro e SUS preenchidos separadamente e conferir a soma na Parcela Mensal; T.A. sazonal com data no passado mostrando o aviso (e continuando somado); T.A. sazonal com data futura sem aviso; T.A. regular nunca avisando; "Gerar PDF" sem filtro (todas as unidades) e com filtro aplicado (só as filtradas, mesmo passando de 20).

## Ajustes rápidos: layout do T.A. e novo painel "Situação das NE's" no Dashboard (sessão 2026-07-27, publicado)

Dois pedidos do usuário depois de testar a sessão anterior:

**Layout do T.A. (`js/unidades.js`/`css/style.css`):** "Tipo de pagamento"/"Data limite" ficavam espremidos numa grade única de 5 colunas junto com Objeto/Nº/Valor. Virou 2 linhas dentro da mesma linha de T.A.: `.linha-ta-campos` (Objeto/Nº/Valor, 3 colunas) em cima, `.linha-ta-pagamento` (Tipo de pagamento/Data limite, 2 colunas) embaixo — mesmo princípio de `.linha-fonte-cronograma` (separar em blocos quando uma linha cresce demais pra um grid só).

**Painel "Situação das NE's" substitui "SOFs pendentes de NE" no Dashboard** (o painel da lista, não o cartão indicador "SOFs sem NE emitida" no topo, que continua igual): mostra **todas** as Notas de Empenho (não só um recorte de 8), com número da NE, unidade, objeto, total solicitado, total atendido (liquidado) e saldo atual — rolável (`.dash-lista-rolavel`, `max-height` + `overflow-y:auto`) e com campo de busca (filtro por texto client-side, em número/unidade/objeto, sem chamada nova ao backend por busca). Linha fica vermelha quando `alerta` é `true` (mesmo critério já usado na tela de Notas de Empenho: saldo atual abaixo da parcela mensal de referência da fonte).

- **Backend (`backend/Dashboard.gs`):** `dashboardNotasEmpenho_` ganhou `itens` (lista completa dos grupos de `montarGruposNotasEmpenho_`, ordenada com `alerta` primeiro) - os campos agregados (`total_empenhado`, `saldo_disponivel`, `itens_sem_saldo` etc.) continuam iguais.
- **Frontend (`js/dashboard.js`):** nova `renderNeLista_(itens, filtroTexto)`, chamada uma vez no carregamento e de novo a cada tecla no campo de busca - só reconstrói a lista, não o dashboard inteiro. Clicar numa NE navega pra aba Notas de Empenho (sem filtro específico - a tela já ordena os alertas primeiro).

**Passo manual pendente:** colar `backend/Dashboard.gs` atualizado no editor do Apps Script e reimplantar. Nenhuma coluna/aba nova.

**Ainda não testado:** o painel novo (rolagem, busca, cor vermelha em NEs com saldo abaixo da parcela mensal); o layout novo da linha de T.A. em telas estreitas.

## Filtros de Unidade/Tipo de unidade/OSS em cascata, nas 4 telas (sessão 2026-07-27, publicado, só frontend)

Usuário mostrou um caso real: em Recibos, filtrando "Tipo de unidade = UPA", o dropdown Unidade continuava oferecendo Carretas e Hospitais. Pedido pra valer em todas as telas - escopo confirmado com o usuário: só entre os 3 filtros que são atributos da própria Unidade (Unidade/Tipo de unidade/OSS), não os outros (Objeto/DEA/Status/Fonte/Competência ficam de fora, já que cascatear esses exigiria o backend calcular valores possíveis a cada mudança - essas telas só carregam uma página por vez).

**Tudo no cliente, em tempo real, sem tocar no backend** - as 4 telas (SOF, Recibos, Notas de Empenho, Unidades) já carregavam a lista completa de unidades só pra popular esses 3 dropdowns.

- **`js/app.js` (`criarFiltroMultiplo`):** ganhou um 3º parâmetro opcional `aoMudar`, chamado a cada marcar/desmarcar de checkbox - `atualizarOpcoes` (já existia) continua sendo o que troca a lista de opções de um widget e poda sozinho qualquer seleção que não exista mais nela; chamar `atualizarOpcoes` programaticamente não dispara `aoMudar` de novo (sem risco de loop entre os 3 widgets). Novo `UI.atualizarOpcoesFiltroMultiplo(id, novasOpcoes)`, espelhando os wrappers que já existiam.
- **Novo `UI.recalcularFiltrosCruzadosUnidade(cfg)`** (`js/app.js`): função única reaproveitada pelas 4 telas - lê a seleção atual dos 3 filtros, e pra cada um calcula as opções que ainda fazem sentido dado os OUTROS dois (nunca o dele mesmo). Quando os outros dois estão vazios, cada dropdown volta pra lista original completa (evita esconder uma OSS cadastrada em Listas Personalizadas mas ainda sem nenhuma unidade usando).
- **`js/sof.js`/`js/recibos.js`/`js/notas-empenho.js`/`js/unidades.js`:** cada uma só passou a chamar `UI.recalcularFiltrosCruzadosUnidade` como `aoMudar` dos 3 `UI.criarFiltroMultiplo(...)` já existentes (Unidade/Tipo de unidade ou Tipo/OSS) - sem mudar `filtrosAtuais()`/"Filtrar"/"Limpar filtros"/paginação, que continuam exigindo o clique em "Filtrar" pra de fato recarregar a lista.

Sem alteração de backend, sem coluna/aba nova - nada a colar no Apps Script.

**Ainda não testado:** marcar Tipo de unidade e ver Unidade estreitar sem clicar em Filtrar (nas 4 telas); desmarcar e ver voltar a lista completa; marcar uma Unidade específica e ver Tipo/OSS estreitarem; uma seleção que deixou de fazer sentido sumir sozinha do outro campo sem erro.

## Filtro "Sem NE emitida" do Dashboard virou visível na tela de SOF (sessão 2026-07-27, publicado, só frontend)

Usuário reportou que, ao clicar num link do Dashboard que leva pra outra aba com um filtro já aplicado, nada na barra de filtros dessa aba mostrava qual filtro estava ativo. Investigado: os widgets de Competência/Status em Recibos já mostravam a seleção corretamente (`UI.definirValoresFiltroMultiplo`, sessão anterior) - o gap real era só o clique em "SOFs sem NE emitida" (Dashboard) → aba SOF: esse filtro (`semNe`) era aplicado por baixo dos panos (`listarSof`), sem nenhum campo na tela indicando isso.

**Corrigido (`js/sof.js`):** "Sem NE emitida" virou um checkbox de verdade na barra de filtros de SOF (mesmo padrão do "Somente ativas" em Unidades) - participa de `filtrosAtuais()`/"Filtrar"/"Limpar filtros" como qualquer outro filtro, recarrega sozinho ao marcar/desmarcar. O clique vindo do Dashboard (`App.navegarPara('sof', { semNe: true })`) agora só marca esse checkbox antes da primeira carga, em vez de aplicar o filtro escondido - fica visível e o usuário pode desmarcar quando quiser. Sem alteração de backend (`listarSof` já aceitava `semNe` desde a sessão anterior).

Sem alteração de backend, sem coluna/aba nova.

## Reforço visual — cores de status e cards com mais destaque (sessão 2026-07-27, publicado, só CSS/frontend)

Usuário pediu explicitamente uma mudança **só visual** ("não estou falando de features apenas a questão visual"): o app estava "tudo branco no branco", queria os cards com mais destaque e os status de Recibo coloridos, usando como exemplo uma imagem de referência com 14 status coloridos.

- **Cores por status de Recibo (`js/app.js`):** novo mapa `CORES_STATUS_RECIBO_` (14 status → cor de fundo/texto, batendo com a imagem de referência do usuário) + `seloStatusReciboHtml(status)` (gera `<span class="selo selo-status" style="background:...;color:...">`), exportado em `UI`. A chave é comparada por string exata (maiúsculo/sem espaço nas pontas) — **se algum status não aparecer colorido, é porque o texto exato cadastrado em Listas Personalizadas não bate com nenhuma chave do mapa; o usuário precisa reportar a grafia exata pra eu ajustar**, já que status são texto livre configurável, não um enum fixo.
  - Usado em `js/recibos.js` (coluna Status da tabela) e `js/dashboard.js` (painel "Recibos por status").
- **Cards com mais presença (`css/style.css`):**
  - `--sombra` ficou mais profunda; nova `--sombra-forte` (usada no hover) e novos tokens de cor `--roxo`/`--roxo-claro`/`--ciano`/`--ciano-claro` (pra dar mais variedade aos indicadores do Dashboard).
  - `.cartao-sof`, `.cartao-ne` e `.cartao-unidade` ganharam uma borda esquerda colorida por padrão (antes só apareciam coloridas em estado de alerta/parado — `.cartao-sof.parado`, `.cartao-ne.alerta`, `.cartao-unidade.inativa` continuam sobrescrevendo pra amarelo/vermelho/cinza) e sombra mais forte no hover.
  - `.cartao-indicador` (cartões do Dashboard) ganhou uma barra colorida no topo e o ícone ganhou fundo colorido — `cartaoIndicadorHtml_` (`js/dashboard.js`) agora recebe um 6º parâmetro `cor` (azul/verde/amarelo/vermelho/roxo/ciano), um por cartão, pra cada um ter uma identidade visual própria em vez de todos azuis.

Sem alteração de backend, sem coluna/aba nova, sem mudança de lógica/comportamento — só cor e sombra.

**Ainda não testado:** conferir visualmente todas as 14 cores de status batendo com a imagem de referência; conferir que os 6 cartões do Dashboard aparecem com cores diferentes; conferir em telas estreitas que nada quebrou.

## Redesenho do Dashboard (3 cards, gráficos, gerador de relatório) + padronização "Atendido" + ajustes no SOF (sessão 2026-07-28, frontend publicado; backend pendente de colar)

Sessão grande, **entregue por partes**, com o desenho fechado com o usuário **antes de codar** (documento completo em [`docs/ESPECIFICACAO_NOVO_DASHBOARD.md`](docs/ESPECIFICACAO_NOVO_DASHBOARD.md)).

### Parte 1 — Cards do topo do Dashboard (`js/dashboard.js`, `backend/Dashboard.gs`, `backend/NotasEmpenho.gs`)
- **Card Recibos:** valor = nº de recibos criados na competência + linha "X pago(s) · Y não pago(s)" (compara criados vs pagos). Clique leva a Recibos com a competência + **todos os status exceto PAGO** (o filtro múltiplo é "incluir X", então o Dashboard manda `statusExceto: ['PAGO']` e a tela seleciona todos menos PAGO — `js/recibos.js`).
- **Card Atendido × Solicitado** (substitui "Valor pago"): % do total empenhado (= atendido) sobre o total solicitado das SOFs não excluídas (**acumulado geral**, não filtra pela competência), com barra + "R$ atendido de R$ solicitado" + "Falta ser atendido: R$". Card **só informativo** (sem clique).
- **Card NEs com saldo baixo** (substitui "SOFs sem NE emitida"): nº de NEs com saldo atual < 20% da parcela mensal de referência. Clique leva a Notas de Empenho já filtrado (novo `opts.saldoBaixo` + checkbox "Somente saldo < 20% da parcela" em `js/notas-empenho.js`; filtro `saldoBaixo` em `listarNotasEmpenho`, com o helper compartilhado `grupoNeComSaldoBaixo_`).
- **2ª linha de cards (Processos parados / Saldo em NE / Total mensal comprometido) MANTIDA.** (Numa 1ª versão desta sessão eu removi por engano de interpretação; o usuário esclareceu que quer os 3 de volta.) O card "Processos parados" ficou **informativo** — o painel-lista que ele abria virou o painel de gráficos.
- **Backend (`Dashboard.gs`):** `dashboardRecibos_` ganhou `total_recibos_pagos`; novo `dashboardSofAtendido_` (total_solicitado × total_empenhado das SOFs não excluídas); `dashboardNotasEmpenho_` ganhou `total_saldo_abaixo_20`; `obterDashboard` inclui `sof_atendido`. Os campos dos 3 cards da 2ª linha continuam vindo (nunca foram removidos do backend).

### Parte 2 — Painel de gráficos (substitui os 3 painéis inferiores) (`js/dashboard.js`, `backend/Dashboard.gs`, `backend/Code.gs`, `css/style.css`)
- Substitui "Recibos por status" / "Situação das NE's" / "Processos parados" por **um painel de gráficos configurável**: Métrica (pago/liquidado/atendido(NE)/nº de recibos) × Agrupar por (OSS/Unidade/Fonte/Status/Mês) × Tipo (barras V/H, pizza-rosca, linha) + **período próprio** (competência de/até). "Linha" só habilita com Agrupar=Mês; "Status" some quando a métrica é atendido (NE não tem status).
- **Gráficos SVG próprios** (zero dependência externa, no estilo vanilla do app), seguindo o guia de dataviz: **hue único** nas barras/linha (é uma métrica só), **paleta categórica validada (colorblind-safe)** nas fatias da pizza, com teto de itens (top N + "Outros"). Cada gráfico vem com uma **tabela de valores** recolhível (números exatos + acessibilidade).
- **Backend:** novo `obterGraficoDashboard(session, params)` + `case` em `Code.gs`. "Atendido (empenhado) por Mês" usa o cronograma de desembolso da NE (senão o mês de `data_criacao`).

### Parte 3 — Gerador de relatório (novo `backend/Relatorios.gs`, novo `js/relatorios.js`, `backend/Code.gs`, `backend/Utils.gs`, `backend/Contadores.gs`, `index.html`, `css/style.css`)
- Botão **"Gerar relatório"** no Dashboard abre um assistente (modal): Fonte (Recibos/Notas de Empenho/SOF/Unidades) → Filtros (competência/OSS/Unidade/Fonte/Status, conforme a fonte) → Colunas (checkbox) → Agrupar (OSS/Unidade/Fonte, com subtotais + total geral) → Gráfico embutido (opcional) → Formato.
- **Saídas:** Visualizar/PDF (janela de impressão via `window.print()`), Excel/CSV (download client-side, `;` + BOM), Google Sheets (backend cria a planilha e move pra pasta compartilhada dos anexos de NE, devolve o link).
- **Modelos de relatório COMPARTILHADOS** (todos veem todos): salvar/carregar/excluir. Nova aba **`RelatoriosModelos`** (criada sob demanda por `getSheetModelosRelatorio_`; entrada em `SHEETS`/`HEADERS` no `Utils.gs`, prefixo de ID `RPT` em `Contadores.gs`). Só o criador ou o gerente pode excluir.

### Padronização de nomenclatura financeira: "Atendido" (= empenhado) (`backend/NotasEmpenho.gs`, `backend/Relatorios.gs`, `js/dashboard.js`, `js/notas-empenho.js`, `js/sof.js`)
- A pedido do usuário, os valores de interesse de uma NE são unificados em **Total Solicitado** (soma de `SofFontes.total_solicitado` da fonte da NE), **Total Atendido** (= empenhado, NE mãe + reforços), **Saldo Atual** (atendido − liquidado) e **Falta ser Atendido** (Solicitado − Atendido). A palavra "empenhado" some dos rótulos.
- `montarGruposNotasEmpenho_` ganhou `total_solicitado`/`total_atendido`/`saldo_atual`/`falta_atendido` (mantidos `valor_bruto`/`valor_liquidado`/`valor_atual` por compatibilidade). Relatório de NE, card da tela de NE, card do Dashboard, métrica do gráfico e rótulos da tela de SOF ("Valor Empenhado" → "Valor Atendido") atualizados.

### Ajustes no formulário de criação de SOF (`js/sof.js`, `css/style.css`, só frontend)
- **T.A.** deixou de ser obrigatório; **Assinatura da NE** e **Assinatura da NL** (Nome/Cargo) deixaram de ser obrigatórias (removidos de `CAMPOS_OBRIGATORIOS` e o `*` dos rótulos).
- **"G.D." e "Grupo de despesa" unificados** num único campo **"Grupo de despesa"**, agora **obrigatório** — alimenta tanto `gd_snapshot` quanto `sei_grupo_despesa`. Autopreenchido com o G.D. da unidade ao trocar a unidade.
- **"Objeto da despesa" com negrito:** virou um mini-editor `contenteditable` com botão **N** (+ Ctrl+B). Armazenado como **texto puro com marcador markdown `**negrito**`** (nada de HTML na célula do Sheets, sem risco de XSS); o negrito é reconstruído só na exibição por `objetoDespesaParaHtml_` (editor, documento SEI e template de repetição). `serializarObjetoDespesa_` converte o conteúdo do editor de volta pra esse texto.

**Passo manual pendente (backend):** colar no editor do Apps Script e reimplantar (Nova versão) — `Dashboard.gs`, `NotasEmpenho.gs`, `Code.gs`, `Utils.gs`, `Contadores.gs` e o **novo** `Relatorios.gs`. A aba **`RelatoriosModelos`** é criada sozinha no 1º uso (não precisa criar à mão); **nenhuma outra coluna/aba nova**. As mudanças só de frontend (cards, gráficos, relatório-UI, ajustes do SOF) já estão publicadas via Pages.

**Ainda não testado pelo usuário (frontend rodou; backend ainda não colado quando isto foi escrito):** dados reais nos 3 cards novos; gráficos (rótulos/escala em cada tipo/agrupamento); o assistente de relatório nas 4 saídas (em especial o acesso ao link do Google Sheets); os 4 valores padronizados batendo com o esperado; e o formulário de SOF (T.A./assinaturas opcionais salvando; "Grupo de despesa" bloqueando quando vazio; negrito colando no documento SEI).

**Pontos em aberto conhecidos:** (1) "Total Solicitado" por NE usa o solicitado **da fonte** — se um SOF tiver 2 NEs originais na mesma fonte, o solicitado se repete (raro); (2) "Falta ser Atendido" pode ficar negativo se a NE foi atendida acima do solicitado (no card do Dashboard é limitado em 0; no relatório e na tela de NE fica o valor real).

## Unidades: "Não Regular" no lugar de "Sazonal", card com 2 divisões, "Parcela Mensal Regular" e remoção de "Classificação Orçamentária" (sessão 2026-07-29, backend pendente de colar)

Três pedidos do usuário sobre a tela de Unidades, a partir de screenshots anotados à mão.

- **"Sazonal" virou "Não Regular" (só o rótulo — `js/unidades.js`):** o `<select>` de "Tipo de pagamento" no formulário de T.A. agora mostra "Regular"/"Não Regular". O valor interno continua `'sazonal'` (não renomeado) — os dados já salvos na aba `UnidadesTA` continuam válidos sem precisar de migração; é puramente rótulo visível.
- **Card com 2 divisões ao expandir (`js/unidades.js`, `css/style.css`):** `detalheTasHtml` agora separa em **"Pagamentos Regulares"** (sempre traz Valor do C.G. - Tesouro e Valor do C.G. - SUS, que são recorrentes por definição, + os T.A.s marcados "Regular") e **"Pagamentos Não Regulares"** (só os T.A.s marcados "Não Regular", com mensagem "Nenhum pagamento não regular cadastrado." quando vazio) — separadas por uma linha divisória tracejada (`.cartao-unidade-detalhe-secao.cartao-unidade-detalhe-divisor`).
- **Nova linha "Parcela mensal regular" no cabeçalho do card:** abaixo de "Parcela mensal" (que continua somando tudo). Novo `parcelaMensalRegular_` (`backend/Unidades.gs`) = Valor do C.G. Tesouro + Valor do C.G. SUS + soma só dos T.A.s "Regular" (exclui os "Não Regular"). Calculado e devolvido como `parcela_mensal_regular` em `listarUnidades`, `criarUnidade` e `atualizarUnidade` — mesmo padrão já usado para `parcela_mensal_total`.
- **"Classificação Orçamentária" removida do formulário de Unidade** (tanto "Nova unidade" quanto "Editar unidade" — é o mesmo formulário/modal para as duas ações, então não dá pra tirar só de um). O campo continua existindo no modelo de dados (`classificacao_orcamentaria` na aba `Unidades`) e continua sendo usado no autopreenchimento ao criar um SOF (`classificacao_orcamentaria_snapshot`, `js/sof.js`) — só não tem mais como editá-lo pela tela de Unidades. **Efeito colateral aceito:** unidades novas criadas a partir de agora nascem com esse campo em branco (autopreenchendo em branco no SOF, mas o analista pode digitar direto no campo do SOF, que já é editável independente da unidade); unidades já cadastradas mantêm o valor que já tinham, intocado.

**Passo manual pendente (backend):** colar `backend/Unidades.gs` atualizado no editor do Apps Script e reimplantar (Nova versão) — **some junto** aos arquivos já pendentes de colar da sessão anterior (`Dashboard.gs`, `NotasEmpenho.gs`, `Code.gs`, `Utils.gs`, `Contadores.gs`, `Relatorios.gs`). Nenhuma coluna/aba nova.

**Ainda não testado:** o rótulo "Não Regular" aparecendo certo no formulário (e T.A.s antigos marcados "sazonal" continuando a cair nessa opção); as 2 divisões do card mostrando os T.A.s certos em cada uma; "Parcela mensal regular" batendo com a soma esperada (Tesouro + SUS + só os T.A.s Regular); criar uma unidade nova e confirmar que ela salva normalmente sem o campo de Classificação Orçamentária.

### "Gerar PDF" virou "Gerar Relatório" (escolha de colunas + as 4 saídas do Dashboard)

Pedido do usuário: o botão da tela de Unidades deve deixar escolher **quais colunas entram** (mantendo as **colunas de valor sempre por último**, como já estavam) e oferecer os **mesmos tipos de documento** do botão "Gerar relatório" do Dashboard.

Em vez de um segundo gerador, a tela de Unidades passou a ser **um atalho pré-filtrado para o gerador que já existe** — sem duplicar renderização/CSV/Sheets:

- **`js/relatorios.js`:** o `gerar_` interno (que lia o assistente do DOM) virou **`gerarComConfig(config)` público** — recebe a config pronta e devolve `true` só quando gerou de fato (pra quem chama de um modal próprio não fechar e perder a seleção quando dá erro). O botão do assistente agora chama `gerarComConfig(lerConfigAtual_())`.
- **`js/unidades.js`:** botão renomeado (`btnGerarPdfUni` → `btnGerarRelatorioUni`, "Gerar PDF" → "Gerar Relatório"); abre um modal enxuto com **checkboxes de colunas** (vindas do catálogo do backend) + **radio de formato** (Visualizar na tela / PDF / Excel-CSV / Google Sheets, exatamente os 4 do Dashboard) e chama `TelaRelatorios.gerarComConfig` passando `filtrosAtuais()` da tela. **Removidos** `gerarPdf`, `montarPdfUnidadesHtml_` e `abrirDocumentoEmNovaAba_` (a tabela HTML de impressão própria virou código morto — quem imprime agora é o gerador de relatórios). *Obs.: `abrirDocumentoEmNovaAba_` em `js/sof.js` é uma cópia separada, usada pelo documento SEI, e continua intacta.*
- **`backend/Relatorios.gs`:** a fonte `unidades` ganhou as colunas de valor — **C.G. Tesouro, C.G. SUS, Total T.A.s, Parcela Mensal Regular, Parcela Mensal** — declaradas **depois** das de texto, porque `gerarRelatorio` projeta preservando a ordem do catálogo (não a ordem em que o analista marcou), que é o que garante "valores sempre por último". `montarLinhasUnidades_` passou a aceitar também `unidade_id`/`tipo`/`busca`/`somenteAtivas`, **espelhando as semânticas de `listarUnidades`** (OSS por "contém", busca livre varrendo todos os campos) pro relatório trazer exatamente as unidades que estão na tela. Filtros ausentes não filtram nada — o assistente do Dashboard, que só oferece OSS, continua funcionando igual (e de brinde ganhou as 5 colunas de valor na fonte Unidades).

**Passo manual pendente (backend):** `backend/Relatorios.gs` entra na lista de arquivos a colar/reimplantar. Nenhuma coluna/aba nova.

**Ainda não testado:** as 4 saídas a partir da tela de Unidades (em especial Google Sheets); o relatório respeitando busca/Unidade/Tipo/OSS/"Somente ativas" da tela; desmarcar colunas e conferir que as de valor continuam por último; totais batendo com os da tela.

### Card de Unidade: valor em destaque virou o "Repasse Mensal Regular" (`js/unidades.js`, `css/style.css`, só CSS/frontend)

Pedido do usuário: no cabeçalho do card, o valor em destaque (verde, negrito) deve ser o **regular**, não o total. Trocada a ordem e os rótulos: **"Repasse Mensal Regular"** (valor em destaque, primeiro) e **"Repasse Mensal Total"** (linha secundária, embaixo) — mesmos dois valores de antes (`parcela_mensal_regular`/`parcela_mensal_total`, já vindos do backend), só invertida a ênfase visual e renomeados os rótulos ("Parcela mensal"/"Parcela mensal regular" → "Repasse Mensal Total"/"Repasse Mensal Regular"). Classes CSS renomeadas de `.cartao-unidade-parcela`/`.cartao-unidade-parcela-regular` para `.cartao-unidade-repasse-regular`/`.cartao-unidade-repasse-total`, pra bater com qual delas é a de destaque.

### Cards de Unidade mais largos - linha de T.A. deixa de quebrar (`css/style.css`, `js/unidades.js`, só CSS/frontend)

Usuário reportou que, com objetos de T.A. mais longos (ex.: "Tratamento de AVC com ALTEPLASE (T.A. 19º Termo Aditivo)"), o rótulo quebrava em 2 linhas e o valor caía pra linha de baixo, alinhado à esquerda em vez de ficar ao lado do rótulo - ficava difícil de ler.

- **`.grade-cards-unidade`:** largura mínima do card subiu de 340px para 480px (`minmax(min(480px, 100%), 1fr)`) - a grade continua responsiva (menos cards por linha em telas largas, 1 por linha em telas estreitas), só que cada card agora tem espaço de sobra pra esses rótulos mais longos.
- **`.cartao-unidade-detalhe-linha`:** `flex-wrap` virou `nowrap` (era `wrap`) - rótulo e valor de cada T.A. agora ficam **garantidamente na mesma linha**, nunca mais o valor cai pra uma linha própria.
- **Rótulo do T.A. (span do objeto):** em vez de quebrar (`overflow-wrap: break-word`), agora trunca com reticências (`text-overflow: ellipsis`) se ainda assim não couber - com `title` (tooltip ao passar o mouse) mostrando o texto completo, pra nenhuma informação se perder mesmo no caso raro de um objeto excepcionalmente longo.

**Ainda não testado:** conferir visualmente com T.A.s de objeto bem longo se o rótulo trunca (e o tooltip mostra o texto completo) em vez de quebrar linha; conferir o comportamento responsivo em tela estreita/celular.

### Modal "Gerar Relatório de Unidades": remove coluna "Ativa" e adiciona marcar/desmarcar todas (`js/unidades.js`, só frontend)

- **Coluna "Ativa" removida** da lista de checkboxes desse modal - filtrada só no `abrirGerarRelatorio` (`colunas.filter(c => c.key !== 'ativo')`), **sem tirar do catálogo compartilhado** (`backend/Relatorios.gs`), então o assistente do Dashboard continua oferecendo essa coluna normalmente pra quem quiser.
- **Botão "Marcar/desmarcar todas"** ao lado do rótulo "Colunas": alterna todos os checkboxes de uma vez - se alguma estiver desmarcada, marca todas; se todas já estiverem marcadas, desmarca todas.

**Bug reportado e corrigido na sequência (`css/style.css`, só CSS):** ao expandir um card de Unidade, todos os outros cards **da mesma linha da grade** também "esticavam" (ficavam mais altos, com espaço em branco embaixo), mesmo sem mostrar nenhuma informação a mais. Causa: `.grade-cards-unidade` é um grid sem `align-items` definido, que por padrão (`stretch`) estica todo item da grade pra ocupar a altura do maior item da mesma linha — ao expandir um card, ele virava o mais alto da linha e "puxava" a altura dos vizinhos. Corrigido com `align-items: start` no grid, pra cada card ter só a altura do seu próprio conteúdo.
## Lentidão ao SALVAR SOF/NE (30-60s) — escrita das fontes em lote (sessão 2026-07-28, só backend, pendente de colar)

Usuário reportou 30-60s para salvar uma SOF (após criada) e para salvar uma SOF após anexar uma NE, travando o app nesse tempo. Diagnóstico: o gargalo é `substituirFontesDoSof_` (`backend/Sof.gs`) no "apagar-e-recriar" das fontes/cronograma. Para uma SOF com 2 fontes × 12 meses (~26 linhas), ele fazia **~26 ciclos de `LockService`** (um `proximoId_` por linha, cada um com `waitLock` + leitura/escrita da aba Contadores), **~26 appends individuais** e **~26 `deleteRow`** (cada `deleteRow` desloca a planilha) — dezenas de round-trips ao serviço de Sheets por salvamento. (O `RELATORIO_LENTIDAO_SOF.md` anterior tratava só do **abrir** card; este é o caminho de **escrita**.)

Correções (só backend, sem mudança de planilha):
- **`backend/Utils.gs`:** novo `deleteRowsEmLote_(sheet, rowIndices)` — agrupa índices contíguos e apaga com `deleteRows(inicio, qtd)` de baixo pra cima, 1-2 chamadas em vez de uma por linha.
- **`backend/Sof.gs` (`substituirFontesDoSof_`):** reserva **todos** os IDs de SofFontes/SofFontesCronograma de uma vez (`proximosIds_`, um lock por aba em vez de um por linha), grava tudo com `appendObjectRows_` (1 escrita por aba) e apaga o antigo com `deleteRowsEmLote_`. De ~26 ciclos de lock + ~26 appends + ~26 deletes para ~2 + 2 + ~2.
- **`backend/NotasEmpenho.gs` (`criarNotaEmpenho`):** o cronograma de desembolso da NE (até 12 meses) também passou a reservar IDs em lote + `appendObjectRows_`, em vez de `proximoId_`/append por mês. (A criação do arquivo no Drive continua sendo o custo inerente restante ao anexar NE, ~2-5s.)

**Passo manual pendente (backend):** colar e reimplantar `Utils.gs`, `Sof.gs`, `NotasEmpenho.gs`. Sem coluna/aba nova. Esperado: salvar SOF cair de 30-60s para poucos segundos.

**Ainda não testado pelo usuário:** medir o tempo real de salvar uma SOF (com fontes) e de salvar após anexar NE, depois de reimplantar.

## Bug corrigido: card "Atendido x Solicitado" do Dashboard mostrava R$ 0,00 solicitado (sessão 2026-07-29, só backend, pendente de colar)

Usuário reportou (com print) que o card mostrava algo como "R$ 85.134.581,03 atendido de R$ 0,00 solicitado" — o solicitado nunca aparecia. Causa raiz: `SOF.total_solicitado` **nunca é persistido** na aba SOF — é sempre recalculado a partir de `SofFontes` (`totalSolicitadoDeFontes_`, `backend/Sof.gs`) e devolvido só na resposta da API (`criarSof`/`atualizarSof`/`obterSof`), nunca gravado na célula. `dashboardSofAtendido_` (`backend/Dashboard.gs`, Parte 1 do redesign) somava `s.total_solicitado` direto das linhas da aba SOF — sempre 0.

**Corrigido:** `dashboardSofAtendido_` agora soma o `total_solicitado` de cada linha da aba **SofFontes** (via `todasFontesComCache_()`, que É persistida de verdade por `substituirFontesDoSof_`), filtrando pelas SOFs não excluídas — a mesma fonte de dado que o resto do app já usa.

**Passo manual pendente (backend):** colar `Dashboard.gs` atualizado e reimplantar. Sem coluna/aba nova.

**Ainda não testado:** conferir que o card do Dashboard passa a mostrar um valor de solicitado condizente com a soma real das SOFs (não mais R$ 0,00).

## Objeto por fonte (SOF→NE→Recibo associados) + cronogramas verde/vermelho + botão TES+SUS (sessão 2026-07-29, backend pendente de colar, ALTERAÇÃO DE PLANILHA NECESSÁRIA)

Pedido grande do usuário: cada SOF costuma solicitar o orçamento do ano pra 2 objetos numa fonte cada (Contrato de Gestão TES + Contrato de Gestão SUS); ele quer o app rastreando o valor **atendido por objeto específico**, não só por fonte — a cadeia SOF (fonte+objeto) → NE (fonte+objeto) → Recibo precisa ficar amarrada de ponta a ponta. Fechado em rodada de perguntas antes de codar (decisões: objeto **adicionado** a SofFontes, sem substituir o Objeto geral do SOF; NE casada por **fonte+objeto**, não só fonte; Recibo com Nota de Empenho virando autocomplete + objeto sugerido; destaque verde/vermelho tanto no cronograma da própria SOF quanto num quadro novo no card da NE).

### Modelo de dados (⚠️ requer 2 colunas novas na planilha, ver "Passo manual" abaixo)
- **`SofFontes` ganha a coluna `objeto`** (ex.: "CONTRATO DE GESTÃO (TES)") - cada linha de fonte tem seu próprio objeto, coexistindo com o Objeto geral do SOF (que continua existindo, sem mudança).
- **`NotasEmpenho` ganha a coluna `objeto`** - a NE original é associada a um par fonte+objeto específico do SOF; **o reforço nunca escolhe de novo, sempre herda fonte/objeto da NE original correspondente** (backend ignora o que vier do frontend pra reforço e busca a original pelo `numero_ne`).

### Backend
- **`Sof.gs`**: `validarFontes_` agora exige `objeto` em toda linha de fonte (⚠️ ver nota de migração abaixo). `substituirFontesDoSof_` persiste o campo. `obterSof` ganhou `fonte.total_atendido` por linha (soma do valor de NE mãe+reforços casadas por fonte+objeto) - alimenta o destaque verde/vermelho do cronograma da própria SOF no frontend.
- **`NotasEmpenho.gs`**: `criarNotaEmpenho` valida fonte+objeto contra as linhas de fonte do SOF (não permite NE "órfã", sem fonte+objeto solicitado de verdade); reforço herda da original. `montarGruposNotasEmpenho_` casa por **fonte+objeto** em vez de só fonte (`parcela_mensal_referencia`/`total_solicitado`/`mesesPreenchidosFonte` agora corretos mesmo com 2 linhas da mesma fonte e objetos diferentes no mesmo SOF) e ganhou `cronograma_solicitado` (meses da SOF, com `atendido: true/false` por acumulado). Novo `listarNotasEmpenhoPorUnidade` (+ `case` no `Code.gs`) pro autocomplete do Recibo.
- **Alerta do card de NE unificado em 20%** (achado real: o destaque vermelho do card hoje dispara com saldo < 100% da parcela, enquanto o card "saldo baixo" do Dashboard usa 20% - o usuário descreveu os dois como se fossem o mesmo critério. Corrigido: `alerta` agora usa a mesma `FRACAO_SALDO_BAIXO_NE_ = 0.20`. **Efeito colateral esperado:** menos NEs vão aparecer com o card vermelho do que antes - só as realmente abaixo de 20%, não mais as abaixo de 100%.
- **`Relatorios.gs`**: coluna "Objeto" do relatório de Notas de Empenho corrigida pra usar o objeto específico da fonte (`g.objeto`) em vez do Objeto geral do SOF (`g.sof_objeto`) - achado ao revisar, mais preciso pro que o usuário pediu.

### Frontend
- **`js/sof.js`**: cada linha de fonte ganha um campo **Objeto** (texto com `<datalist>` de sugestões, aceita livre); novo botão **"+ TES+SUS"** que adiciona (ou substitui a linha em branco inicial) duas linhas prontas: TESOURO/"CONTRATO DE GESTÃO (TES)" e SUS/"CONTRATO DE GESTÃO (SUS)". Cronograma da própria fonte (grid de 12 meses) ganha destaque **verde** (mês já coberto pelo acumulado atendido) / **vermelho** (ainda não) quando o SOF já tem NE anexada - só aparece editando um SOF existente com empenho. Mini-formulário de anexar NE (dentro da edição de SOF) ganha um `<select>` de **Objeto** em cascata com Fonte (some as opções que não existem pra aquela fonte); reforço trava Fonte/Objeto mostrando os da NE original (somente informativo - backend ignora e herda de qualquer forma).
- **`js/notas-empenho.js`**: modal "Nova Nota de Empenho" (original) ganha o mesmo `<select>` de Objeto em cascata. Card da NE ganha um **novo quadro "CRONOGRAMA SOLICITADO (SOF)"**, dentro do mesmo toggle "Ver cronograma" já existente - mostra os meses que a SOF pediu (fonte+objeto casada), em verde os já cobertos pelo total atendido acumulado (mãe+reforços) e vermelho os que faltam, **sem depender de recibo/pagamento** (diferente do cronograma já existente, que é lido por OCR do documento e mostra Situação Previsto/Liquidado/Pago via Recibos).
- **`js/recibos.js`**: campo "Nota de Empenho" (novo Recibo e Editar Recibo) vira um `<input>` com `<datalist>` das NEs cadastradas na unidade escolhida (autocomplete, mas continua aceitando texto livre pra dado histórico sem NE rastreada) - ao digitar/escolher uma NE que bate exatamente, sugere automaticamente o campo Objeto (e Fonte) a partir dela. Novo endpoint `listarNotasEmpenhoPorUnidade`.

### ⚠️ Passo manual pendente
1. **Criar 2 colunas novas na planilha** (senão os dados são descartados silenciosamente, mesmo mecanismo de sempre): coluna `objeto` na aba **SofFontes**, coluna `objeto` na aba **NotasEmpenho**.
2. Colar e reimplantar (Nova versão): `Utils.gs`, `Sof.gs`, `NotasEmpenho.gs`, `Code.gs`, `Relatorios.gs` (esses 5 mudaram nesta sessão; os já pendentes de sessões anteriores - `Dashboard.gs`, `Contadores.gs`, `Unidades.gs` - continuam na lista se ainda não foram colados).
3. **⚠️ Migração de dados existentes:** SOFs **já cadastradas antes desta sessão** têm linhas de `SofFontes` sem `objeto` preenchido. Como o campo passou a ser **obrigatório** (`validarFontes_`), a partir de agora **qualquer SOF existente que for reaberta e salva de novo (mesmo sem mudar nada) vai exigir que o Objeto de cada fonte seja preenchido antes de conseguir salvar** - não é um bug, é o novo campo obrigatório pedindo pra ser preenchido na primeira vez que a SOF antiga é tocada. Avisar a equipe.

**Ainda não testado:** criar uma SOF nova com "+ TES+SUS" e conferir que salva com as 2 linhas certas; anexar uma NE mãe e ver o cronograma da SOF ficar verde/vermelho; abrir o card da NE na tela de Notas de Empenho e ver o quadro "CRONOGRAMA SOLICITADO"; criar um Recibo escolhendo uma NE existente e ver o Objeto ser sugerido; reabrir uma SOF antiga (pré-migração) e confirmar a mensagem pedindo Objeto; conferir que menos NEs aparecem com o card vermelho agora (critério 20%, não mais 100%).

## Reforço com OCR (meses + valor automáticos) + bug real corrigido (destaque da SOF nunca aparecia) (sessão 2026-07-29, backend pendente de colar)

Pedido do usuário: ao adicionar um reforço, o OCR deve identificar sozinho quais meses foram reforçados e o valor, sem o analista digitar nada - e verificar se o cronograma da NE e da SOF atualizam depois de anexar o reforço.

### Bug real encontrado ao verificar (corrigido)
O destaque verde/vermelho do cronograma da SOF (implementado na sessão anterior) **nunca aparecia na prática**: `total_atendido` por linha de fonte só era calculado em `obterSof`, mas o fluxo real de abrir um card de SOF (`abrirSofExistente`, `js/sof.js`) **nunca chama `obterSof`** - reaproveita a linha já carregada por `listarSof` (otimização de performance de uma sessão anterior, ver `RELATORIO_LENTIDAO_SOF.md`), que não calculava esse campo. **Corrigido:** novo helper `agruparValorAtendidoPorSofFonteObjeto_` (`NotasEmpenho.gs`, uma única leitura da aba agrupada por `sof_id|fonte|objeto`), usado agora tanto por `obterSof` quanto por `listarSof` (`Sof.gs`), pra nunca mais divergir.

### OCR automático no reforço (assunção a confirmar: reforço usa o mesmo formato de documento da NE original)
Reaproveita o **mesmo** `lerAnexoNotaEmpenho` (que já extrai o "Cronograma de Desembolso" pra NE original) nos 3 pontos onde um reforço pode ser adicionado - **assumindo que o documento de reforço tem a mesma tabela de cronograma da original** (não confirmado com um documento real; se não tiver esse formato, cai no plano B abaixo):
- Se o documento tem a tabela: cada mês com valor > 0 vira um reforço próprio automaticamente - **1 mês = 1 reforço, 2+ meses = vários reforços de uma vez**, todos compartilhando o mesmo arquivo anexado (novo `criarReforcosEmLote`, `NotasEmpenho.gs` - reserva os IDs em lote, sobe o arquivo ao Drive **uma única vez**, grava todas as linhas de uma vez). Nenhum campo manual aparece nesse caso.
- Se o documento **não** tem essa tabela (formato mais simples): cai pro Preço Total lido como valor único, sem mês associado - mensagem avisa que o mês não foi identificado. Só nesse caso residual (ou se a leitura falhar) os campos manuais de Mês/Valor ficam disponíveis, como rede de segurança - não é mais o caminho principal.
- **`criarNotaEmpenho`**: refatorado - lookup da NE original virou helper `buscarNotaEmpenhoOriginal_` (compartilhado com `criarReforcosEmLote`).

**Os 3 pontos de entrada de reforço, todos com o mesmo comportamento agora:**
- **`js/notas-empenho.js`** `abrirModalReforco` (botão "+ Reforço" no card da NE) - reescrito.
- **`js/notas-empenho.js`** `abrirModalNovaNe`, branch reforço (modal "Nova Nota de Empenho") - reescrito.
- **`js/sof.js`** mini-formulário de NE embutido na edição de SOF - esse ponto **nunca teve** campo de mês pra reforço antes (lacuna pré-existente); agora tem detecção automática (sem campo manual de mês nesse ponto específico - só o "Remover anexo" como escape).

**Atualização do cronograma após reforço (parte "verifique" do pedido):** confirmado que a tela de NE já recarregava certo (`CacheAbas.invalidar('notasEmpenho')` + `carregar()`); **faltava** invalidar o cache `'sof'` nos 2 pontos de `notas-empenho.js` (agora adicionado) - sem isso, a tela de SOF podia mostrar o cronograma desatualizado se aberta logo depois de reforçar pela tela de NE. O mini-formulário embutido no `sof.js` já invalidava `'sof'` (parte do fluxo normal de salvar SOF).

**Passo manual pendente (backend):** colar e reimplantar `NotasEmpenho.gs`, `Sof.gs`, `Code.gs`. Sem coluna/aba nova.

**⚠️ Ponto em aberto - precisa ser confirmado testando com um documento real:** a suposição-chave desta sessão é que um documento de **reforço** tem a mesma tabela "CRONOGRAMA DE DESEMBOLSO" que o documento de NE original usa. Se isso não for verdade (reforços podem ser documentos mais simples, sem essa tabela), o sistema vai cair automaticamente no plano B (Preço Total, sem mês) - funciona, mas sem a detecção de mês. Se o formato real dos documentos de reforço for diferente disso, avisar pra eu ajustar a extração.

**Ainda não testado:** anexar um reforço com um documento que tenha 1 mês só; anexar um com 2+ meses (confirmar que cria vários reforços de uma vez); anexar um documento sem a tabela de cronograma (confirmar o plano B); reabrir a SOF depois de reforçar pela tela de NE e ver o cronograma verde/vermelho atualizado; reabrir o card da NE e ver o quadro "CRONOGRAMA SOLICITADO" refletindo o novo total atendido.

## Bug corrigido: card do Dashboard "Atendido x Solicitado" (backend desatualizado, não código) + excluir NE mãe/reforço (sessão 2026-07-29)

**Card do Dashboard:** o usuário reportou o card continuando em R$ 0,00 solicitado mesmo após a correção anterior. Código conferido e estava correto - a causa era `Dashboard.gs` não ter sido recolado no Apps Script naquela rodada (só os arquivos citados na mensagem anterior tinham sido colados). Resolvido pelo usuário recolando o arquivo. **Lição registrada:** daqui pra frente, ao pedir pra colar/reimplantar, recomendar colar **todos** os `.gs` de uma vez (não só os citados na sessão), pra evitar esse tipo de lacuna entre sessões diferentes.

**Objeto no lugar da Fonte no card de NE:** o badge do topo do card (antes "TESOURO · SOF X") passou a mostrar o Objeto específico da NE em vez da Fonte - `g.objeto` já existia no dado desde a sessão anterior, só não estava sendo usado ali (`js/notas-empenho.js`, só frontend).

### Excluir uma NE mãe ou reforço já anexada (pedido do usuário)

Duas opções de exclusão, cada uma no lugar certo:
- **Card de NE (tela Notas de Empenho):** lista os reforços já lançados (com mês e valor) logo abaixo dos totais, cada um com um botão de excluir. **Só reforços aparecem aqui** - a NE mãe não se exclui por este card (o card inteiro representa aquele número de NE).
- **Tabela de NE dentro da edição de SOF:** ganhou uma coluna de excluir - aqui dá pra excluir **tanto a mãe quanto qualquer reforço**, ação imediata (não espera o "Salvar" da SOF, mesmo padrão do "+Reforço").

**Backend (exclusão lógica, mesmo padrão de SOF/Recibos - `excluido`/`excluido_por`/`excluido_em`):**
- **`Utils.gs`:** 3 colunas novas em `HEADERS.NotasEmpenho` (⚠️ precisa criar na planilha) + registrado em `COLUNAS_BOOLEANAS.NotasEmpenho`.
- **`NotasEmpenho.gs`:** `todasNotasEmpenhoComCache_()` agora filtra excluídas **na fonte** (diferente do padrão de SOF/Recibos, que filtra em cada ponto de uso - aqui, com tantos consumidores dessa função, filtrar uma vez só evita esquecer de filtrar em algum lugar). Nova `excluirNotaEmpenho`: **bloqueia excluir a NE original enquanto ela tiver reforços ativos** (evita órfãos - pede pra excluir os reforços primeiro); se era a última NE original ativa do SOF, `possui_ne` volta a `false` (o SOF reaparece no filtro "Sem NE emitida"); andamento (stepper) não é revertido automaticamente. `montarGruposNotasEmpenho_` ganhou `linhas` (mãe + cada reforço com id/tipo/valor/mês próprios) - é o que alimenta as duas listas de exclusão no frontend.
- **`Code.gs`:** novo `case 'excluirNotaEmpenho'`.

**Passo manual pendente (backend):** **criar as 3 colunas novas na aba NotasEmpenho** (`excluido`, `excluido_por`, `excluido_em`) antes de colar o código, senão a planilha não tem onde gravar a exclusão. Colar e reimplantar `Utils.gs`, `NotasEmpenho.gs`, `Code.gs` (e, por segurança, recomendado colar **todos** os `.gs` juntos desta vez, ver lição acima).

**Ainda não testado:** excluir um reforço pelo card de NE e ver o total atendido do card cair; tentar excluir a NE mãe com reforços ainda ativos e ver a mensagem de bloqueio; excluir todos os reforços e então a mãe, e ver `possui_ne` voltar a false (SOF reaparece em "Sem NE emitida"); excluir pela tabela dentro da edição de SOF e ver a lista atualizar sem fechar o formulário.

## BUG REAL confirmado e corrigido: cronograma de desembolso lia os meses errados + Nº da NE de referência (sessão 2026-07-30)

Usuário enviou um documento real de reforço (a pedido feito na sessão anterior, quando eu tinha marcado como "suposição não confirmada" que reforço usa o mesmo formato de cronograma da NE original). Isso permitiu **confirmar duas coisas de uma vez**: (1) reforço usa sim o mesmo layout/tabela; (2) só que a extração dos VALORES do cronograma sempre esteve com um bug real, não só nos reforços.

### O bug: valores do cronograma lidos em ordem de LINHA, mas o PDF os imprime em ordem de COLUNA
`extrairCronogramaDesembolso_` (`NotasEmpenho.gs`) isola a seção "CRONOGRAMA DE DESEMBOLSO" e pega os 12 valores monetários que aparecem nela, mapeando `valores[0]→Jan, valores[1]→Fev, ..., valores[11]→Dez` (ordem de linha do grid 3x4 impresso: Jan/Fev/Mar/Abr, Mai/Jun/Jul/Ago, Set/Out/Nov/Dez). Essa suposição ("Janeiro a Dezembro é a ordem sempre impressa") nunca tinha sido verificada com um documento real que tivesse valores diferentes em meses não-adjacentes.

Com o documento enviado (reforço do Hospital Dom Malan, nome do arquivo "REF. OUT A DEZ 26"), os valores não-zero apareciam nas posições 6, 9 e 12 da sequência extraída. Mapeando por LINHA (como o código fazia), isso caía em **Junho/Setembro/Dezembro** - errado. O nome do arquivo e o grid visual do PDF confirmam que o reforço é de **Outubro/Novembro/Dezembro**. Mapeando por **COLUNA** (Jan,Mai,Set → Fev,Jun,Out → Mar,Jul,Nov → Abr,Ago,Dez), as posições 6/9/12 caem exatamente em Out/Nov/Dez - bate certinho. Era isso que o usuário via como "o app não conseguiu identificar os meses do reforço": a extração rodava e achava 12 valores, só que jogava os certos nos meses errados.

**Corrigido:** novo `ORDEM_MESES_VALORES_CRONOGRAMA_` (mapa de posição→mês em ordem de coluna) usado por `extrairCronogramaDesembolso_`. Como esse é o **mesmo** extrator usado tanto pra NE original quanto pra reforço (e pro cronograma da SOF que alimenta o destaque verde/vermelho), a correção vale pros três de uma vez.

**⚠️ Dado histórico:** NEs cadastradas ANTES desta correção podem ter o cronograma salvo com os meses trocados (a extração de novos anexos já sai certa; dados já gravados não são corrigidos retroativamente - precisaria de ajuste manual na planilha se algum cronograma antigo estiver claramente errado).

### Novo: conferência do "Nº DA N.E. DE REFERÊNCIA:" (pedido do usuário)
Documentos de reforço têm um campo `Nº DA N.E. DE REFERÊNCIA:` apontando pra NE "mãe" - o usuário pediu pra conferir esse número contra a NE que o analista selecionou pra reforçar, evitando reforçar a NE errada por engano.

- **`NotasEmpenho.gs`:** novo `extrairNeReferencia_` (mesmo padrão "rótulo antes, valor mais adiante" do cronograma - acha o rótulo, procura o próximo número em formato de NE no trecho seguinte, limitado até a próxima seção "CRONOGRAMA DE DESEMBOLSO" ou 600 caracteres). `lerAnexoNotaEmpenho` devolve `numero_ne_referencia` (null em NE original, que tem o rótulo mas sem valor).
- **Frontend (3 pontos de reforço):** depois do OCR, compara o número lido contra a NE selecionada - **não bloqueia** (o OCR pode errar a leitura de um campo secundário), só mostra um aviso amarelo bem visível quando não bate ("O documento indica reforço da NE X, mas você está reforçando a NE Y - confira antes de salvar").

**Passo manual pendente (backend):** colar e reimplantar `NotasEmpenho.gs`. Sem coluna/aba nova.

**Ainda não testado:** reprocessar o mesmo documento de reforço enviado e conferir que os meses Out/Nov/Dez aparecem certos (não mais Jun/Set/Dez); testar com uma NE original de verdade pra confirmar que o cronograma dela também sai correto agora; testar o aviso de "Nº DA N.E. DE REFERÊNCIA" com um número que não bate de propósito.

### A correção da ordem coluna/linha NÃO resolveu de fato - achado real, ainda em aberto

Usuário testou com o mesmo documento real e o app caiu no plano B ("Valor lido do documento (R$ 6.911.986,59) - não foi possível identificar o mês"), ou seja, `extrairCronogramaDesembolso_` achou **menos de 12 valores monetários** na seção do cronograma - um problema diferente (e anterior) do que eu tinha corrigido (mapeamento errado assumia que os 12 valores existiam; agora nem os 12 estão sendo encontrados).

**Causa provável identificada:** o texto que eu analisei pra descobrir a ordem "coluna, não linha" veio da MINHA PRÓPRIA leitura do PDF (Claude lendo o documento anexado no chat) - não é o mesmo texto que `extrairTextoOcr_` (`Utils.gs`) produz de verdade. Essa função usa o **OCR do Google Drive** (`Drive.Files.create(..., { ocrLanguage: 'pt' })` convertendo o PDF pra Google Doc, depois lendo o texto desse Doc) - um pipeline de reconhecimento de imagem, bem diferente e menos confiável que a extração de texto que eu fiz. É plausível que o OCR do Google leia algum "0,00" errado (ex.: como "O,OO" com letra, ou grude com texto vizinho na tabela densa do formulário), o que faria a contagem de valores encontrados cair abaixo de 12 e a função inteira devolver `[]` (nenhum mês identificado) - o sintoma bate exatamente com isso.

**Decisão tomada:** em vez de continuar adivinhando qual é a ordem/formatação real que o OCR devolve, adicionei um **modo de diagnóstico**: `lerAnexoNotaEmpenho` agora devolve `texto_ocr_debug` (texto bruto lido pelo OCR, truncado em 6000 caracteres) - nos 4 pontos onde o app lê um anexo de NE (card "+Reforço", modal "Nova Nota de Empenho" original e reforço, mini-formulário da SOF), um `<details>` recolhido "Ver texto lido do documento (diagnóstico)" mostra esse texto bruto, pra o usuário copiar e mandar de volta - só assim dá pra ver o que o OCR do Google realmente devolveu pra esse documento, em vez de eu continuar simulando com uma leitura minha que não é equivalente.

**Passo manual pendente (backend):** colar e reimplantar `NotasEmpenho.gs` (a mudança de `texto_ocr_debug` está no mesmo arquivo do fix anterior, ainda não confirmado se já foi colado).

**Próximo passo:** usuário vai reabrir o modal de reforço com o mesmo documento, abrir "Ver texto lido do documento (diagnóstico)" e mandar o texto de volta - só com o texto real extraído dá pra ajustar `extrairCronogramaDesembolso_`/regex de forma confiável, em vez de mais uma suposição não verificada.

### Diagnóstico real recebido - bug de verdade era outro (truncagem, não ordem) - CORRIGIDO

Usuário mandou o texto bruto real (lido pelo OCR do Google Drive via `extrairTextoOcr_`). Isso revelou que **a correção anterior (ordem de coluna) estava errada** - baseada numa leitura minha do PDF que não equivale ao texto real do OCR - e que **o bug de verdade sempre foi outro**:

- No texto real, cada LINHA do grid (4 meses) sai com seus rótulos e valores juntos, um bloco de cada vez - e dentro de cada linha, os valores **já saem na ordem certa** (não é "coluna", é linha mesmo, 1 pra 1 com Jan..Dez). A hipótese inicial ("todos os 12 rótulos primeiro, depois todos os 12 valores") também estava errada - só coincidiu de "parecer" bater no documento que eu tinha lido por conta própria.
- **O bug real:** o cabeçalho "ITENS DO EMPENHO" (da PRÓXIMA seção do documento) aparecia, no texto do OCR, **intercalado entre os rótulos Set/Out/Nov/Dez e os 4 valores correspondentes a eles** (posição física do PDF, não da tabela). O código cortava o trecho no primeiro "ITENS DO EMPENHO" encontrado (pra isolar só a seção do cronograma) - só que aqui isso cortava ANTES dos 4 últimos valores existirem no trecho, sobrando só 8 dos 12 valores exigidos, e a função devolvia vazio. Era isso que o usuário via como "não identificou o mês" - nunca foi um problema de mapeamento, sempre foi truncagem prematura.

**Corrigido:** removida a truncagem por cabeçalho de seção (`fimMatch`) - agora pega os 12 primeiros valores monetários que aparecem depois de "CRONOGRAMA DE DESEMBOLSO", ignorando qualquer texto de outro campo intercalado no meio, e mapeia 1 pra 1 com Janeiro..Dezembro (ordem de linha, confirmada correta com o texto real). Removida também `ORDEM_MESES_VALORES_CRONOGRAMA_` (a suposição de coluna, revertida).

**Lição registrada no código:** a extração por regex desse app depende do texto exato que `extrairTextoOcr_` (OCR do Google Drive) devolve - **nunca simular/assumir esse texto a partir de uma leitura própria do PDF**; sempre pedir o texto real via o modo de diagnóstico (`texto_ocr_debug`, já implementado) antes de mexer nos regexes de extração.

**Passo manual pendente (backend):** colar e reimplantar `NotasEmpenho.gs`.

**Ainda não testado:** reprocessar o mesmo documento e confirmar que os 12 meses saem certos agora (Set=0, Out/Nov/Dez=2.303.995,53, resto 0) e que o cronograma não diverge mais do Preço Total.

## Tabela "Reforços Lançados" agrupada por documento, não mais por mês (sessão 2026-07-30, ALTERAÇÃO DE PLANILHA NECESSÁRIA)

Pedido do usuário, a partir de um print do card de NE: a NE de reforço estava aparecendo "como se fosse um arquivo pra cada mês" — um documento de reforço que cobre 3 meses (ex.: Out/Nov/Dez) virava 3 linhas soltas na lista "Reforços lançados", cada uma com seu próprio botão de excluir, e o card ainda tinha "Ver arquivo 1/2/3" repetidos no rodapé (o mesmo arquivo, um link por mês). O usuário quer: uma **tabela** "Reforços Lançados" com 1 linha por **documento** de reforço (não por mês), colunas Número da NE de reforço / Meses / Valor por mês, **um único botão de excluir** por documento (exclui todos os meses daquele reforço de uma vez) e o link "Ver arquivo" **dentro da própria linha da tabela**, não mais solto no rodapé do card.

### Causa raiz
Cada mês de um reforço multi-mês sempre foi salvo como uma **linha própria** na aba `NotasEmpenho` (`criarReforcosEmLote` grava 1 linha por item do cronograma detectado) — correto para o modelo de dados (cada mês precisa da própria `mes_referencia`/`valor` para o cálculo de saldo), mas **nunca havia um jeito de saber, só olhando a planilha, quais linhas vieram do mesmo documento** — o frontend simplesmente listava todas as linhas `tipo='reforco'` soltas.

### Modelo de dados (⚠️ requer 1 coluna nova na planilha, ver "Passo manual" abaixo)
- **`NotasEmpenho` ganha a coluna `numero_ne_reforco`**: o próprio número da NE de reforço (lido do documento pelo mesmo OCR que já lê `numero_ne` da NE original), gravado em **todas** as linhas/meses criados a partir do mesmo documento. É a chave de agrupamento.

### Backend
- **`Utils.gs`**: `numero_ne_reforco` adicionado a `HEADERS.NotasEmpenho`.
- **`NotasEmpenho.gs`**:
  - `criarNotaEmpenho`/`criarReforcosEmLote` passam a gravar `numero_ne_reforco` em toda linha de reforço criada (vazio/ignorado para `tipo='original'`).
  - Novo `agruparReforcosPorNumero_(linhasReforco)`: agrupa as linhas de reforço de uma NE por `numero_ne_reforco` — linhas com o mesmo número viram **1 item** (`{ numero_ne_reforco, ids: [...], meses: [{mes, valor}, ...], valor_total, arquivo_url }`). Linhas sem `numero_ne_reforco` (reforço lançado manualmente, sem o documento ter sido lido com sucesso pelo OCR) **não são agrupadas entre si** — cada uma vira seu próprio item, chaveada pelo próprio `id`, já que não há garantia de que duas linhas manuais sem número sejam do mesmo documento.
  - `montarGruposNotasEmpenho_` ganhou `reforcos_agrupados` (resultado do agrupamento acima) no retorno de cada card; `arquivos` (usado para o(s) link(s) "Ver arquivo" do rodapé do card) agora só recebe a linha `original` — os arquivos de reforço saem só de dentro da tabela agrupada, não duplicados no rodapé.
  - Novo `excluirNotasEmpenhoEmLote(session, ids)`: exclusão lógica em lote, defensivamente restrita a linhas `tipo='reforco'` (ignora silenciosamente qualquer id que não seja reforço, mesma cautela de nunca deixar excluir a mãe por essa via) — usada pelo botão único de excluir de um grupo inteiro.
- **`Code.gs`**: novo `case 'excluirNotasEmpenhoEmLote'`.

### Frontend
- **`js/notas-empenho.js`**:
  - `linhasReforcoHtml_` reescrita: consome `g.reforcos_agrupados` em vez de `g.linhas.filter(tipo==='reforco')` — agora renderiza uma **tabela** (`.tabela-reforcos`) com 1 linha por documento de reforço, colunas Nº da NE de reforço / Meses (lista) / Valor por mês (lista, paralela à de meses) / Arquivo (link "Ver arquivo" da própria linha) / Excluir (1 botão, `data-ids` com todos os ids do grupo separados por vírgula).
  - `excluirReforcoClique_` passa a receber uma **lista de ids** (não mais um id só) e chama `excluirNotasEmpenhoEmLote` — 1 única confirmação, mensagem ajustada para citar quantos meses serão excluídos juntos quando for mais de 1.
  - Os 3 pontos que criam reforço (`abrirModalReforco`, `abrirModalNovaNe` branch reforço, e o mini-formulário em `js/sof.js`) agora capturam `resultado.numero_ne` (do retorno de `lerAnexoNotaEmpenho`) numa variável própria e passam `numero_ne_reforco` no payload de `criarReforcosEmLote`/`criarNotaEmpenho` — resetada em todos os mesmos pontos onde `itensDetectados`/`arquivoLido` já eram resetados (troca de arquivo, "Remover anexo", erro de leitura).
  - `cartaoNeHtml_` não precisou de mudança no rodapé — como `arquivos` já vem filtrado só para a original (backend), o(s) link(s) "Ver arquivo" duplicados por mês somem sozinhos.
- **`js/sof.js`**: mini-formulário de NE embutido na edição de SOF também captura e envia `numero_ne_reforco` (mesma variável/padrão), para consistência de dado mesmo que a exibição desse formulário específico não tenha sido pedida para mudar (continua mostrando linhas individuais ali, sem agrupamento — o pedido do usuário era especificamente sobre o card da tela de Notas de Empenho).
- **`css/style.css`**: `.cartao-ne-linha-item` (lista solta antiga) removida; nova `.tabela-reforcos`/`.tabela-reforcos-lista` estilizando a tabela (reaproveita a classe `.tabela` já usada no resto do app, com `white-space: normal` para caber listas de meses/valores dentro da célula).

### ⚠️ Passo manual pendente
1. **Criar a coluna `numero_ne_reforco` na aba `NotasEmpenho`** (senão o dado é descartado silenciosamente, mesmo mecanismo de sempre) — reforços já cadastrados **antes** desta sessão vão continuar aparecendo (cada um em seu próprio item, chaveado pelo id, já que não têm esse número gravado) — só não ficam agrupados entre si mesmo que sejam do mesmo documento original; não há como recuperar esse agrupamento retroativamente sem reprocessar os anexos antigos.
2. Colar e reimplantar (Nova versão): `Utils.gs`, `NotasEmpenho.gs`, `Code.gs` — recomendado colar **todos** os `.gs` de uma vez (lição já registrada acima).
3. Frontend (`js/notas-empenho.js`, `js/sof.js`, `css/style.css`) atualiza sozinho no GitHub Pages depois do `git push` (até ~10 min de propagação).

**Ainda não testado:** anexar um reforço com 2+ meses e conferir que aparece **1 linha só** na tabela "Reforços Lançados" (com todos os meses/valores listados); clicar "Ver arquivo" dentro dessa linha; excluir esse grupo e confirmar que **todos** os meses somem juntos (1 clique, 1 confirmação); lançar um reforço manualmente (sem OCR reconhecer o documento) e confirmar que ele aparece como item isolado, sem se misturar com outros; conferir que o rodapé do card volta a mostrar só 1 "Ver arquivo" (o da NE mãe).

## "Falta ser Atendido" mostra mensagem de concluído quando zerado (sessão 2026-07-30, só frontend)

Pedido do usuário: quando o Total Atendido bate com o Total Solicitado (`falta_atendido` chega a 0, ou ligeiramente negativo se atendido passar do solicitado), o card de NE deve trocar o valor em R$ por **"O total solicitado já foi atendido!"**, em **verde** — no lugar de mostrar "R$ 0,00" (ou um valor negativo).

- **`js/notas-empenho.js`** (`cartaoNeHtml_`): `g.falta_atendido <= 0.005` (pequena margem pra arredondamento de ponto flutuante) troca o `<strong>` de valor pela mensagem, com a classe `verde`.
- **`css/style.css`**: nova `.cartao-ne-infogrid-item strong.verde` (mesmo padrão de `strong.vermelho`, já usado no Saldo Atual quando em alerta).

Só frontend — nenhuma mudança de backend/planilha, atualiza sozinho pelo GitHub Pages depois do push.

## Tabela "Reforços Lançados" transbordava do card (sessão 2026-07-30, só frontend)

Usuário reportou (com print) que a tabela nova (ver seção acima) ultrapassava a borda direita do card — as colunas "Arquivo" e o botão de excluir ficavam fora do card em vez de se ajustarem à largura disponível.

- **`css/style.css`**: `.tabela-reforcos` ganhou `table-layout: fixed` com larguras proporcionais por coluna (nth-child) em vez de largura automática por conteúdo (que deixava o número da NE de reforço, a lista de meses e o link "Ver arquivo" empurrarem a tabela pra além do card); `word-break: break-word` evita que um número de NE longo force a coluna a alargar. Breakpoint `@media (max-width: 480px)` reduz fonte/padding em telas bem estreitas.
- **`js/notas-empenho.js`**: a tabela passou a ficar dentro de um `.tabela-reforcos-wrap { overflow-x: auto }` — rede de segurança: com as larguras fixas a tabela cabe na maioria dos casos, mas se ainda assim não couber (tela muito estreita ou conteúdo incomum), ela ganha scroll horizontal **dentro do próprio card**, em vez de vazar visualmente por cima do resto da página.

Só frontend — atualiza sozinho pelo GitHub Pages depois do push.

## Lentidão de 10-15s ao selecionar a Unidade em "Novo processo de Recibo" (sessão 2026-07-30, só backend, pendente de colar)

Usuário reportou 10-15s de carregamento ao selecionar a Unidade no formulário de novo Recibo. Esse `change` dispara **duas chamadas em paralelo** (`js/recibos.js`, `Promise.all`): `listarRecibos` (histórico da unidade) e `listarNotasEmpenhoPorUnidade` (autocomplete de NE) - analisando as duas, **ambas** tinham uma causa raiz real de desperdício de processamento no Apps Script (não é rede/frontend):

### Causa 1 (a maior): `listarNotasEmpenhoPorUnidade` reaproveitava `montarGruposNotasEmpenho_` inteira, só pra jogar fora quase tudo
`montarGruposNotasEmpenho_` monta o card **completo** de **toda NE da empresa inteira** - cronograma (OCR), cronograma_solicitado (SOF), valor liquidado por NE (relendo Recibos), reforços agrupados por documento, alerta de saldo baixo etc. (é a função por trás da tela inteira de Notas de Empenho). `listarNotasEmpenhoPorUnidade` chamava essa função inteira, geral, sem nenhum filtro prévio, só pra no final extrair **4 campos** (`numero_ne`, `objeto`, `fonte`, `sof_id`) de UMA unidade - todo aquele cálculo (que cresce com o número total de NEs/reforços/recibos do sistema inteiro, não só da unidade escolhida) era descartado.

**Corrigido:** reescrita para filtrar SOF por `unidade_id` primeiro (pega os `sof_id` da unidade) e depois filtrar `NotasEmpenho` (via `todasNotasEmpenhoComCache_`, já cacheada) só pelas linhas `tipo='original'` desses SOFs - a NE original já tem `numero_ne`/`fonte`/`objeto`/`sof_id` direto na própria linha, sem precisar de nenhum agrupamento (reforços herdam esses mesmos valores da original na criação, então nunca precisaram entrar nessa lista).

### Causa 2: `listarRecibos`/`indicadoresRecibos` liam a aba Recibos inteira, sem cache nenhum
Diferente de NotasEmpenho/SofFontes/Unidades/ListasPersonalizadas (que já têm cache de 30s server-side, `*ComCache_`), a aba **Recibos nunca teve esse cache** - toda chamada (mesmo repetida em segundos, ex. trocar de unidade duas vezes seguidas) relia a aba inteira do zero. Se a aba tiver crescido bastante (anos de histórico de pagamento), isso pesa a cada leitura.

**Corrigido:** novo `todasRecibosComCache_()` (mesmo padrão de 30s dos outros), usado por `listarRecibos`/`indicadoresRecibos` (só pontos de LEITURA - os pontos de escrita continuam lendo a aba direto via `findById_`, porque precisam do `_row` pra saber onde escrever, e o cache não guarda isso). `invalidarCacheRecibos_()` adicionado em todo ponto de escrita (`criarRecibo`, `criarGrupoParcelaDivididaRecibo`, `atualizarRecibo`, `excluirRecibo`, `marcarReciboVisualizado`, `migrarRecibosHistorico`), ao lado do `bumpVersao_` já existente em cada um - sem isso, uma edição de Recibo poderia não aparecer refletida por até 30s pra quem reabrisse a tela de Recibos/o formulário de Novo Recibo.

**Passo manual pendente (backend):** colar e reimplantar `NotasEmpenho.gs`, `Recibos.gs`. Sem coluna/aba nova.

**Ainda não testado:** medir o tempo real de selecionar a unidade em "Novo processo de Recibo" depois de reimplantar (esperado: cair de 10-15s pra o tempo normal de requisição, ~1-3s); confirmar que o autocomplete de NE continua sugerindo as mesmas NEs de antes; confirmar que editar/excluir/criar um Recibo continua refletindo imediatamente na lista (sem esperar até 30s pelo cache).

## Autopreenchimento por Objeto no Novo Recibo: fallback direto da SOF/NE (sessão 2026-07-30)

Usuário pediu (com print do formulário "Novo processo de Recibo"): ao escolher o Objeto, se já houver SOF/Nota de Empenho pra esse Objeto, os campos Parcela Contratual, Fonte e Nota de Empenho (se já existir) devem ser preenchidos automaticamente, continuando editáveis - pediu pra eu **verificar se isso já acontecia** antes de implementar.

**Verificado: já acontecia, mas só parcialmente.** O `change` de Objeto (`js/recibos.js`) já preenchia esses campos - mas só a partir do **último Recibo já lançado** com aquele Objeto (`historicoRecibosUnidade`). Funciona bem quando a unidade já tem histórico de pagamento pra aquele Objeto, mas **não cobria o caso de uma SOF/NE nova, recém-cadastrada, sem nenhum Recibo lançado ainda** - exatamente o que o usuário descreveu ("se já houver uma SOF/NE"). Faltava mesmo esse pedaço.

**Implementado (fallback, sem tirar o que já existia):**
- **`NotasEmpenho.gs`**: novo `listarObjetosSofPorUnidade(session, unidadeId)` - 1 item por Objeto já usado em alguma linha de `SofFontes` de algum SOF ativo da unidade, com `fonte`/`parcela_mensal` (a "Parcela Contratual" vem daqui - é o mesmo valor usado no cronograma/alerta da SOF) e `numero_ne` (preenchido só se existir uma NE original com aquele Objeto **no mesmo SOF** que "venceu" a disputa por Objeto - evita puxar a NE de um SOF antigo já superado). Quando a unidade tem 2+ SOFs com o mesmo Objeto (ex.: renovação anual), o mais recente vence.
- **`Code.gs`**: novo `case 'listarObjetosSofPorUnidade'`.
- **`js/recibos.js`** (só "Novo processo de Recibo" - o pedido/print era especificamente desse formulário, não do de Editar Recibo): terceira chamada em paralelo no `change` de Unidade, junto das outras duas já existentes. No `change` de Objeto: se não achar um "último lançamento" no histórico de Recibos, cai pro resultado desta nova função (Parcela/Fonte/Nota de Empenho, quando existirem) - tudo continua em campos normais, editáveis manualmente. Texto de ajuda abaixo do campo Objeto atualizado pra citar as duas fontes.

**Passo manual pendente (backend):** colar e reimplantar `NotasEmpenho.gs`, `Code.gs`. Sem coluna/aba nova.

**Ainda não testado:** criar uma SOF+NE nova (sem nenhum Recibo lançado ainda) e conferir que escolher aquele Objeto no Novo Recibo preenche Parcela Contratual/Fonte/Nota de Empenho sozinho; confirmar que o comportamento anterior (preencher a partir do último Recibo, quando existir) continua igual; testar uma unidade com 2 SOFs pro mesmo Objeto (ano anterior + atual) e conferir que preenche com os dados do SOF mais recente.

## Parcela dividida também na edição de Recibo (sessão 2026-07-30)

Pedido do usuário: depois de criar um Recibo (sem parcela dividida) e reabri-lo pra editar, quer poder marcar "Este pagamento é feito por mais de uma parcela?" ali também - até então essa opção só existia em "Novo processo de Recibo"; "Editar Recibo" nunca teve essa opção, então converter um Recibo avulso em parcela dividida (ou adicionar mais uma parcela a um grupo já existente) não era possível depois de criado.

### Backend (`Recibos.gs`)
- Novo `listarRecibosPorGrupo(session, grupoId)`: todas as linhas (não excluídas) de um mesmo `parcela_dividida_grupo_id` - usado pra popular a edição já com todas as parcelas do grupo.
- Novo `atualizarParcelasDivididasRecibo(session, id, dadosBase, parcelas)`: cria OU atualiza um grupo de parcela dividida a partir de um Recibo já existente, reaproveitando `montarLinhaRecibo_` (mesmo helper de `criarRecibo`/`criarGrupoParcelaDivididaRecibo`). Duas situações, mesma lógica: (a) Recibo ainda avulso → vira a 1ª parcela de um grupo novo (a própria linha, atualizada); (b) Recibo já pertence a um grupo → cada parcela com `id` atualiza a linha correspondente (o frontend sempre manda **todas** as linhas do grupo, não só as alteradas), e cada parcela sem `id` vira uma parcela nova no mesmo grupo. Por segurança, um `id` que não pertença nem ao grupo-alvo nem seja a própria linha base é ignorado silenciosamente.
- `Code.gs`: novos `case 'listarRecibosPorGrupo'` e `case 'atualizarParcelasDivididasRecibo'`.

### Frontend (`js/recibos.js`)
- `adicionarLinhaParcelaDividida`/`atualizarBotoesRemoverParcelaDividida_` **parametrizadas** (`containerId`, `obterNotaEmpenho`, `dadosExistentes` opcional) pra serem reaproveitadas tanto em "Novo processo de Recibo" (só linhas novas) quanto em "Editar Recibo" (pode pré-popular linhas com dado já salvo). **Uma linha já salva (com `id`) não pode ser removida por essa tela** - o backend só cria/atualiza o que for enviado, então remover do formulário sem de fato excluir deixaria a linha "esquecida" na planilha; por isso o botão de remover só aparece em linhas novas, ainda não salvas (exclusão de uma parcela específica não foi pedida nesta sessão).
- "Editar Recibo": novo checkbox "Este pagamento é feito por mais de uma parcela?" + os mesmos blocos de "Novo Recibo". Se o Recibo **já** pertence a um grupo, o checkbox nasce marcado e travado (não dá pra "desfazer" por aqui) e a tabela já nasce com **todas** as parcelas do grupo (`listarRecibosPorGrupo`), cada uma com seu "Ver arquivo atual"/anexo próprio. Se marcado pela primeira vez (Recibo ainda avulso), a própria linha em edição vira a 1ª parcela (com o que já tinha) + 1 linha nova em branco, completando o mínimo de 2.
- `salvarReciboEdicao`: passou a ramificar como o "Novo Recibo" - com o checkbox marcado, chama `atualizarParcelasDivididasRecibo` (uma linha por parcela, com/sem `id`); sem marcar, continua chamando `atualizarRecibo` como sempre.

**Passo manual pendente (backend):** colar e reimplantar `Recibos.gs`, `Code.gs`. Sem coluna/aba nova.

**Ainda não testado:** editar um Recibo avulso, marcar o checkbox e salvar com 2+ parcelas (confirmar que a linha original vira a 1ª parcela do grupo, não duplica); reabrir esse mesmo Recibo depois (deve nascer já com o checkbox travado e a tabela cheia); adicionar mais uma parcela a um grupo já existente e conferir que as demais linhas não perdem dado; anexar Nota de Liquidação/Ordem Bancária em cada parcela e conferir que cada uma salva o próprio arquivo.

## Parcela dividida vira exclusiva de Contrato de Gestão (TES), split fixo 70%/30%, múltiplas OBs na parcela de 70% (sessão 2026-08-06, ⚠️ ALTERAÇÃO DE PLANILHA NECESSÁRIA)

Pedido do usuário: a opção "mais de uma parcela" (sessão 2026-07-30, item acima)
era genérica demais - percentual livre, N parcelas livres, 1 OB por parcela.
Pedido: (1) só aparece pra Recibos de Objeto **"CONTRATO DE GESTÃO (TES)"**;
(2) quando marcada, divide **sempre** em 70%/30% (não editável); (3) a parcela
de 70% pode ter **mais de uma** Ordem Bancária (botão "+ Adicionar OB"); (4)
uma tabelinha (inspirada em "Reforços Lançados" da NE) mostra **LE + cada
OB** com número e valor de cada documento. Antes de implementar, revisei o
pedido com o usuário (perguntas) e pedi 2 documentos reais (Ordem Bancária
2026OB010537 e Nota de Liquidação 2026LE000755) pra confirmar os rótulos/
formato de número antes de escrever regex - mesma lição do bug de
"VALOR LÍQUIDO"/"VALOR DA ORDEM BANCÁRIA" corrigido nesta mesma sessão (ver
item anterior "Bug real corrigido").

Decisões tomadas com o usuário:
1. Gatilho: Objeto **igual exatamente** ao valor escolhido "CONTRATO DE GESTÃO
   (TES)" (não é um "contém" nem uma nova categoria - Objeto continua texto
   livre gerenciado em Listas Personalizadas).
2. Número de cada OB (e da LE): **OCR automático**, extraído do próprio PDF
   (mesmo princípio de REGEX_NUMERO_NE_DOCUMENTO - formato do número, não o
   rótulo que o precede).
3. Valor Pago da parcela de 70%: **soma automática** (somente leitura) das
   OBs anexadas.
4. Recibos antigos com parcela dividida que não sejam TES: não é uma
   preocupação real - simplificado sem tratar esse caso especialmente (a
   tabela deles continua aparecendo normalmente ao reabrir, só não ganha o
   split fixo/tabela de OBs).
5. Feito de propósito fácil de mudar no futuro: percentuais e a regra do
   objeto-gatilho isolados em constantes nomeadas (`PARCELA_DIVIDIDA_TES_
   PERCENTUAIS`, `OBJETO_CONTRATO_GESTAO_TES`, `js/recibos.js`), não
   espalhados pelo código.

### Modelo de dados (⚠️ requer 1 coluna nova na planilha - aba nova é automática, ver "Passo manual" abaixo)
- **`Recibos` ganha a coluna `nota_liquidacao_numero`** (texto): número do
  próprio documento de Nota de Liquidação (ex. "2026LE000755"), extraído por
  OCR junto com o valor - gravado pra **qualquer** Recibo com NL lida (não só
  os TES), mas hoje só é mostrado na tabela "Documentos anexados" da parcela
  de 70%.
- **Nova aba `RecibosOrdensBancarias`** (`id, recibo_id, numero_ob, valor,
  arquivo_drive_id, arquivo_url, criado_por, data_criacao`) - child-table de
  `Recibos` (mesmo padrão de `SofFontesCronograma`/`NotasEmpenhoCronograma`),
  1 linha por Ordem Bancária anexada na parcela de 70%. **Criada sozinha no
  1º uso** (`getSheetOrdensBancariasRecibo_`, mesmo mecanismo de
  `RelatoriosModelos`/`getSheetModelosRelatorio_`) - não precisa criar à mão.

### Backend (`Recibos.gs`)
- `REGEX_NUMERO_LE_DOCUMENTO` (`\d{4}LE\d{6}`) e `REGEX_NUMERO_OB_DOCUMENTO`
  (`\d{4}OB\d{6}`) - confirmados contra os 2 documentos reais anexados pelo
  usuário antes de implementar.
- `lerAnexoRecibo` passa a devolver também `numero_documento` - **best-effort**
  (não bloqueia o anexo se não achar, ao contrário da NE/do valor - só deixa
  de mostrar o número na tabela).
- `getSheetOrdensBancariasRecibo_`: cria a aba sob demanda (ver acima).
- `somaOrdensBancarias_`/`substituirOrdensBancariasParcela_`: "apagar e
  recriar" as OBs de UMA parcela (mesmo padrão de `substituirFontesDoSof_`,
  Sof.gs) - cada item pode trazer um arquivo novo (sobe pro Drive agora) ou
  já ter vindo de uma OB salva antes e não mexida (só recria a linha do
  banco, sem reenviar o arquivo).
- `montarLinhaRecibo_` ganha `nota_liquidacao_numero`.
- `criarGrupoParcelaDivididaRecibo`/`atualizarParcelasDivididasRecibo`: se a
  parcela trouxer `ordens_bancarias`, `valor_pago` é recalculado como a soma
  ANTES de montar a linha (servidor manda, nunca confia no que o frontend
  mostrava), e `substituirOrdensBancariasParcela_` é chamada depois de saber
  o id da linha (existente ou recém-criada).
- `listarRecibosPorGrupo` passa a embutir `ordens_bancarias` em cada linha
  devolvida - reidrata a tabela ao reabrir um Recibo dividido de TES pra
  editar.
- `atualizarRecibo` (Recibo avulso, não dividido) ganha `nota_liquidacao_numero`
  na lista de campos de texto simples.

### Frontend (`js/recibos.js`)
- `OBJETO_CONTRATO_GESTAO_TES`, `PARCELA_DIVIDIDA_TES_PERCENTUAIS = [70, 30]`,
  `PARCELA_DIVIDIDA_TES_PERCENTUAL_MULTI_OB` (= maior do array) - constantes
  isoladas, fácil de mudar depois. `ehObjetoContratoGestaoTes_`.
- Checkbox "mais de uma parcela" (Novo e Editar Recibo) agora fica dentro de
  um bloco (`#recBlocoTemParcelaDividida`/`#recEdBlocoTemParcelaDividida`)
  escondido por padrão, só aparece quando o Objeto escolhido é TES -
  `atualizarVisibilidadeParcelaDivididaTes_`. Se o Objeto deixar de ser TES
  com o checkbox marcado, desmarca sozinho e volta pro modo parcela única
  (evita estado inconsistente). Recibo que **já** pertence a um grupo sempre
  mostra a tabela, independente do Objeto atual (grupo existente nunca
  "some" - ver decisão 4 acima).
- `semearParcelasTes_`: substitui o antigo "+ Adicionar parcela" (removido
  do fluxo de criação - split agora é sempre as N parcelas fixas do array).
  `btnAddParcelaDivididaEd` (edição) só continua visível pra grupos
  **legados não-TES** (`ehObjetoContratoGestaoTes_(recibo.objeto)` decide).
- `adicionarLinhaParcelaDividida_` ganhou `opts.percentualFixo`: percentual
  vira somente leitura, nunca mostra botão de remover; se for o MAIOR
  percentual do split (`PARCELA_DIVIDIDA_TES_PERCENTUAL_MULTI_OB`), a linha
  troca o campo único "Ordem Bancária (anexo)" por uma tabela "Documentos
  anexados" (`renderTabelaOrdensBancariasParcela_`, reaproveita o estilo
  `.tabela-reforcos` das NE) + botão "+ Adicionar OB" (input de arquivo
  escondido, clicado programaticamente, resetado após cada leitura pra
  aceitar o próximo anexo) + Valor Pago somente leitura, somado
  automaticamente (`atualizarValorPagoComputado_`).
- `ligarAnexoComOcr_` ganhou `aoAtualizar` (callback opcional, chamado
  sempre que o anexo muda) e `travar()` passou a guardar
  `inputEl._numeroDocumentoLido` - usado tanto pra montar o payload de
  `nota_liquidacao_numero` quanto pra alimentar a linha "LE" da tabela.
- Compatibilidade: convertendo um Recibo avulso que já tinha UMA Ordem
  Bancária no formato antigo (campo único) pra TES dividido, essa OB entra
  como item "herdado" na tabela (número em branco, valor da linha antiga),
  em vez de simplesmente desaparecer da tela.
- `salvarReciboNovo`/`salvarReciboEdicao`: linhas com `dataset.multiOb='1'`
  mandam `ordens_bancarias` (via `montarPayloadOrdensBancarias_`) em vez do
  anexo único de OB; todas as linhas (e o Recibo avulso) mandam
  `nota_liquidacao_numero`.

### CSS (`style.css`)
- `.pd-ob-bloco`/`.pd-ob-tabela-wrap`: só espaçamento - a tabela em si
  reaproveita `.tabela-reforcos`/`.tabela-reforcos-wrap` (já existentes, das
  Notas de Empenho) sem alteração.

### ⚠️ Passo manual pendente
1. **Criar a coluna `nota_liquidacao_numero` na aba `Recibos`** (senão o dado
   é descartado silenciosamente, mesmo mecanismo de sempre).
2. Colar e reimplantar (Nova versão): `Utils.gs`, `Recibos.gs`. `Code.gs`
   **não mudou** nesta sessão (os 3 endpoints tocados já existiam e já
   repassam `parcelas`/`dadosBase` genericamente). A aba
   `RecibosOrdensBancarias` **não precisa ser criada à mão** - nasce sozinha
   no 1º uso.
3. Frontend (`js/recibos.js`, `css/style.css`) atualiza sozinho no GitHub
   Pages depois do `git push` (até ~10 min de propagação).

**Ainda não testado:** criar um Recibo novo com Objeto "CONTRATO DE GESTÃO
(TES)", marcar o checkbox, conferir que nasce com 70%/30% travados e sem
botão de remover; anexar a LE e 2+ OBs na parcela de 70%, conferir a tabela
(número/valor de cada uma) e que Valor Pago soma sozinho; salvar e reabrir
pra editar, conferir que a tabela reidrata com os itens salvos; remover uma
OB já salva e salvar de novo, conferir que ela some da planilha
(`RecibosOrdensBancarias`) e a soma recalcula; trocar o Objeto de/para TES
num Recibo avulso ainda não salvo, conferir que o checkbox aparece/some e
desmarca sozinho; converter um Recibo avulso TES que já tinha uma OB antiga
(campo único) e conferir que ela aparece como item herdado na tabela.

## Status editável direto na listagem + parcelas divididas em destaque (sessão 2026-08-07, só frontend)

Pedido do usuário, a partir de um print da listagem de Recibos: (1) poder
mudar o Status direto na tela de Recibos, sem abrir "Editar Recibo"; (2)
quando o pagamento tem parcela dividida (ex. 70%/30% de Contrato de Gestão),
as parcelas aparecerem "em destaque, algo como uma tabelinha com as duas
linhas... para não se confundir os outros pagamento". Revisado com o usuário
antes de implementar (pergunta com preview de 2 leiautes) - escolhido "card
com cabeçalho compartilhado".

**Sem alteração de backend** - as duas coisas reaproveitam endpoints já
existentes (`atualizarRecibo` pro status; `listarRecibos` já trazia
`parcela_dividida_grupo_id`/`percentual_parcela_dividida` em cada linha, só
não eram exibidos).

### Status editável inline
- `js/app.js`: nova `UI.corStatusReciboEstilo(status)` - mesma tabela de
  cores de `seloStatusReciboHtml`, mas devolve só o CSS (`background:...;
  color:...`) pra aplicar num `<select>` em vez de um `<span>`.
- `js/recibos.js`: `celulaStatusHtml_(r)` monta um `<select class="select-
  status-recibo">` colorido igual ao selo de sempre, com as opções já
  filtradas pela Fonte da linha (`filtrarOpcoesStatusPorFonte_`, mesma regra
  do formulário de edição) via `opcoesStatusHtml_` (reaproveitados, sem
  duplicar lista). `aoMudarStatusInline_`: salva na hora ao trocar (sem
  confirmação - é reversível escolhendo outro status de novo), mandando só
  `{status: novoValor}` pro `atualizarRecibo` existente (não toca em mais
  nada do Recibo); trava o `<select>` enquanto salva (`statusSalvandoIds`
  evita 2 gravações simultâneas na mesma linha); erro reverte o valor
  visualmente; sucesso invalida o cache e recarrega a lista inteira (mesmo
  padrão de excluir/editar - o indicador "Pendentes" e o destaque "Parado"
  podem mudar junto). Clicar/mudar o select nunca abre o modal de edição
  (`e.stopPropagation()`).

### Parcelas divididas em destaque
- `agruparItensParaTabela_`: agrupa os itens da PÁGINA ATUAL por
  `parcela_dividida_grupo_id`, preservando a ordem - vale pra qualquer
  grupo (não só TES). Limitação aceita: só agrupa se as parcelas caírem na
  mesma página (raríssimo isso não acontecer, dado que nascem juntas).
- `renderTabela()` reescrita: linhas avulsas consecutivas continuam numa
  tabela só (cabeçalho normal, sem repetir); um grupo interrompe e vira um
  `cartaoGrupoReciboHtml_` - card com borda azul à esquerda, cabeçalho
  mostrando Unidade/Objeto/Processo/Competência (compartilhados) 1x só, e
  uma tabelinha embaixo só com o que muda por parcela: Percentual, Valor
  Liquidado, Valor Pago, Ordem Bancária, Status (cada linha com seu próprio
  `<select>` de status - parcelas do mesmo pagamento podem estar em etapas
  diferentes do fluxo). Clicar numa linha do card abre a edição daquele
  Recibo específico, igual a antes (o modal de edição já sabe mostrar o
  grupo inteiro).
- `css/style.css`: `.select-status-recibo` (select com cara de selo) e
  `.cartao-grupo-recibo`/`.cartao-grupo-recibo-cabecalho` (o card).

### Passo manual
Nenhum - é só frontend (`js/app.js`, `js/recibos.js`, `css/style.css`),
atualiza sozinho no GitHub Pages depois do `git push`.

**Ainda não testado:** mudar o status de uma linha avulsa direto na lista e
conferir que salva sem abrir modal; conferir que as opções aparecem certas
pra Fonte SUS x TESOURO; forçar um erro (ex. sem internet) e conferir que o
select volta pro valor antigo; abrir a listagem com um grupo de parcela
dividida (70%/30% TES) e conferir o card - cabeçalho certo, as 2 linhas
certas, status editável em cada uma; um grupo cujas 2 parcelas caiam em
páginas diferentes (casos de borda, provavelmente raro de reproduzir).

## Reforço multi-mês agrupado também no mini-formulário de NE da edição de SOF (sessão 2026-08-07, só frontend)

Pedido do usuário, a partir de um print da edição de SOF: um documento de
reforço que cobre vários meses aparecia "como se fosse mais de um documento
para cada mês" - mesmo bug já corrigido na tela de Notas de Empenho em
2026-07-30 ("Tabela Reforços Lançados agrupada por documento", ver acima),
mas que **nunca tinha sido replicado** aqui - registrado explicitamente como
decisão consciente naquela sessão ("o pedido do usuário era especificamente
sobre o card da tela de Notas de Empenho"). Agora replicado.

**Sem alteração de backend** - `excluirNotasEmpenhoEmLote` já existia (usado
pelo card de NE desde 2026-07-30); a lógica de agrupamento
(`agruparReforcosPorNumero_`, `backend/NotasEmpenho.gs`) foi **duplicada em
JS** (`agruparReforcosPorNumeroSof_`, `js/sof.js`) em vez de expor pelo
backend, seguindo o padrão já estabelecido neste mesmo arquivo pra
`conferirNeReferencia_`/`mostrarDiagnosticoOcr_` ("duplicada aqui por serem
módulos/DOMs separados") - evita mudar o formato de retorno de
`listarNotasEmpenhoPorSof` (usado também por `camposNumeroNeHtml`/
`sincronizarFonteObjetoReforco_` como lista plana) e não precisa de passo
manual de backend pra esse fix.

- `js/sof.js`: `agruparReforcosPorNumeroSof_` (mesmo algoritmo do backend,
  chaveado por `numero_ne_reforco`) + `linhasNotasEmpenhoHtml_` (nova) -
  linhas não-reforço continuam 1 por 1; reforços são agrupados por
  `numero_ne` e, dentro de cada um, por documento - 1 linha por documento,
  com os meses cobertos (ex. "Out/Nov/Dez") e o valor **total**, 1 único
  link "Ver arquivo" e 1 único botão de excluir (`data-acao="excluir-ne-
  lote"`, `data-ids` com todos os ids do grupo) que chama
  `excluirNotasEmpenhoEmLote` - mesmo endpoint/confirmação do card de NE.
- Reforços sem `numero_ne_reforco` (lançados manualmente, sem o OCR
  reconhecer o documento) não são agrupados entre si - cada um continua
  aparecendo isolado, mesma regra de sempre.

**Passo manual:** nenhum - só frontend (`js/sof.js`), atualiza sozinho no
GitHub Pages depois do `git push`.

**Ainda não testado:** reabrir um SOF com um reforço multi-mês já existente
(como o do print) e conferir que vira 1 linha só, com os meses certos e o
valor total certo; excluir esse reforço agrupado e conferir que os 3 meses
somem juntos da planilha; anexar um reforço novo multi-mês direto por aqui
(não pela tela de NE) e conferir que também agrupa; SOF com 2 Notas de
Empenho originais (TESOURO + SUS) cada uma com seus próprios reforços,
conferir que cada grupo mostra a Fonte/Objeto certos (não mistura entre as
duas NEs).

## Bug real corrigido: prefixo de ID faltando pra RecibosOrdensBancarias (sessão 2026-08-07)

Ao testar a criação de um Recibo dividido de Contrato de Gestão (TES) com
uma Ordem Bancária anexada na parcela de 70%, o usuário recebeu "Erro
interno no servidor: Prefixo de ID não definido para a aba
'RecibosOrdensBancarias'." ao salvar. Investigação inicial (comigo) chutou
que fosse `Utils.gs` desatualizado, mas o usuário confirmou que a aba e a
coluna já existiam - a causa real era outra.

**Causa raiz:** ao criar a aba `RecibosOrdensBancarias` (sessão 2026-08-06),
ela foi registrada em `SHEETS`/`HEADERS` (`Utils.gs`), mas **esqueci de
adicionar um prefixo pra ela em `PREFIXOS_ID`** (`Contadores.gs`) -
`substituirOrdensBancariasParcela_` chama `proximosIds_('RecibosOrdensBanca
rias', ...)` sempre que a parcela de 70% traz 1+ Ordens Bancárias, e essa
função lança erro se o prefixo não existe (`proximosIds_`, Contadores.gs).
Como o array vem vazio quando nenhuma OB é anexada, o erro só aparecia
depois que o usuário efetivamente testou anexando uma OB - por isso não foi
pego nos testes anteriores (sem anexo).

**Efeito colateral:** como o erro acontece DEPOIS que a linha da parcela de
70% já foi gravada (`appendObjectRow_`), mas ANTES do log/checkout final, a
linha de 70% fica na planilha "órfã" (sem a de 30%, que nunca é processada -
o loop já tinha quebrado). Isso reproduziu exatamente o sintoma relatado
antes ("a parcela de 30% sumiu") - **duas causas empilhadas**: o teste
anterior (sem OB anexada) provavelmente foi outro problema de deploy
(Utils.gs desatualizado na época), e este (com OB anexada) é este bug real.

**Correção:** `backend/Contadores.gs` - `RecibosOrdensBancarias: 'ROB'`
adicionado a `PREFIXOS_ID`.

**Passo manual concluído (confirmado pelo usuário, sessão 2026-08-08):** `Contadores.gs`
colado no editor do Apps Script e reimplantado (Nova versão).

**Limpeza necessária:** os grupos de teste já criados com a parcela de 70%
órfã (sem a de 30%) continuam na planilha - precisam ser apagados
manualmente (linha na aba Recibos) ou pela lixeira da tela antes de testar
de novo, senão viram lixo permanente na listagem.

## Varredura de performance do projeto inteiro (sessão 2026-08-07)

**Pedido:** "repasse por todo o projeto, buscando possíveis falhas ou locais
que possam ser otimizados, com foco de deixar o app o mais rápido e fluido
possível mas sem prejudicar as features". Depois: implementar tudo que fosse
seguro.

### Bug real encontrado (número errado na tela, não performance)

`dashboardUnidades_` (`Dashboard.gs`) chamava `parcelaMensalTotal_` com a
**assinatura antiga, de 2 parâmetros**. Quando `valor_contrato_gestao_sus`
nasceu (sessão 2026-07-27), a função virou `(valorTesouro, valorSus, tas)` e
este PROGRESS registrou a atualização "nos 3 pontos que chamam (criarUnidade,
atualizarUnidade, listarUnidades)" — o Dashboard era o 4º ponto e passou
batido. O array de T.A.s entrava na posição do SUS (`toNumber_` de array =
NaN = 0) e `tas` chegava `undefined` (soma 0): o card "Total mensal
comprometido" mostrava **só o Tesouro**, ignorando o C.G. SUS e todos os
T.A.s. Corrigido.

### Risco de quebra futura eliminado (o achado mais importante)

O `CacheService` do Apps Script tem limite de **100KB por chave**, e os 8
helpers `*ComCache_` serializavam a aba inteira numa chave só, sem nenhuma
proteção. Acima do limite o `put` lança exceção, ela sobe até
`handleRequest_` e o usuário vê "Erro interno no servidor" com a tela sem
carregar. Estimativa: a aba Recibos (35 colunas) cruza esse limite por volta
de **120-150 linhas**; a SOF (60+ colunas), bem antes. Era uma quebra marcada
pra acontecer sozinha conforme a base cresce, sem nenhuma mudança de código.

Novo `cachePut_` (`Utils.gs`): valor grande demais simplesmente não é
cacheado (quem chamou continua recebendo o dado lido da planilha) e um
`try/catch` cobre qualquer outra falha do serviço. Degrada pra "mais lento",
nunca pra "quebrado". Todos os 8 helpers passaram a usar.

### Performance — o que foi corrigido

1. **`getSS_` reabria a planilha em toda chamada** (maior ganho do lote).
   `getSheet_` fazia `PropertiesService.getProperty` + `SpreadsheetApp.openById`
   a cada uso, e há ~100 pontos de `getSheet_`/`sheetToObjects_` no backend —
   uma escrita típica abria a MESMA planilha 10-15 vezes na mesma requisição.
   `openById` é chamada de API de verdade. Agora há memo por execução
   (`_ssMemo_`/`_sheetsMemo_`/`_headersMemo_`, `Utils.gs`) — cada `doGet`/`doPost`
   roda em contexto novo, então não há risco de servir dado velho entre
   requisições. `getHeaders_` também entrou no memo: era 2 chamadas de API por
   LINHA gravada.
2. **Faltava cache da aba SOF** — a mais larga do projeto (60+ colunas) era a
   única grande sem cache de leitura. Novo `todosSofComCache_`/`invalidarCacheSof_`
   (`Sof.gs`), com invalidação nos **6** pontos de escrita (criarSof,
   atualizarSof, marcarSofVisualizado, excluirSof, criarNotaEmpenho,
   excluirNotaEmpenho). 8 pontos de leitura convertidos.
3. **`obterDashboard` lia a aba Recibos 3x na mesma requisição** —
   `valorLiquidadoAgrupadoPorNe_` e `recibosPorNeECompetencia_` liam cru, além da
   leitura que `obterDashboard` já fazia. Passaram a usar `todasRecibosComCache_`.
4. **`recalcularAlertaRecibo_(null)` lia a aba Recibos inteira e jogava fora** —
   caía direto no `if (!linhas.length) return`. Acontecia em 100% das edições de
   Recibo avulso, inclusive em toda troca de status pela listagem. Removido; o
   alerta avulso agora é calculado ANTES da gravação, o que também eliminou o
   **segundo `updateObjectRow_`** na mesma linha.
5. **`bumpVersao_`**: era `getProperty` + `setProperty` por recurso (6 chamadas
   numa escrita de Recibo). Agora 1 `getProperties` + 1 `setProperties`.
6. **`substituirTasDaUnidade_`**: último ponto do backend que ainda apagava
   linha a linha — passou a usar `deleteRowsEmLote_`.
7. **Revalidação do cache travava a tela** (`js/cache-abas.js`): `carregarFn`
   rodava sem `{ silencioso: true }`, então a conferência "em segundo plano"
   acendia o spinner global bloqueante — anulando exatamente o que o cache
   cache-first existe pra entregar. Agora a revalidação é silenciosa e a
   primeira carga continua com spinner. Os 8 pontos de chamada repassam `opcoes`.
8. **`index.html`**: `defer` nos 14 `<script>` — baixam em paralelo durante o
   parse em vez de um bloqueante atrás do outro; ordem de execução preservada.

### Deliberadamente NÃO implementado (risco > ganho)

- **`findById_` otimizado** (ler só a coluna id e depois a linha): toca todo
  caminho de escrita do app; ganho pequeno depois do item 1.
- **Projeção de colunas** (`sheetToObjectsCampos_`): se um campo não for
  projetado, vira `undefined` silenciosamente — bug invisível.
- **Escrita em lote no grupo de parcela dividida**: é o código recém
  estabilizado (prefixo `ROB`); não vale a churn agora.
- **Update otimista do status inline**: mudaria semântica de UI (indicadores e
  "Parado" ficariam defasados) — decisão do usuário, não técnica.
- **Endpoint enxuto pro dropdown de reforço** (`js/notas-empenho.js:688` chama
  `listarNotasEmpenho` com `pageSize: 100000`, executando `montarGruposNotasEmpenho_`
  inteiro só pra preencher um `<select>`): mesma classe de problema já corrigida
  em `listarNotasEmpenhoPorUnidade`. Vale fazer, mas exige conferir todos os
  usos de `gruposTodos` antes.

### Verificação feita

Sem Node na máquina: validação de sintaxe dos 16 `.gs` via JScript/`cscript`
(`new Function(fonte)`). 15 OK; `NotasEmpenho.gs` acusa erro apenas por causa
do lookbehind `(?<!PREÇO\s)` em `REGEX_PRECO_TOTAL_NE_DOCUMENTO` — válido no
V8 do Apps Script, não no JScript (ES3). Recompilado com o lookbehind
neutralizado: OK. **Nada foi testado em execução real** — ver passo manual.

**Passo manual concluído (confirmado pelo usuário, sessão 2026-08-08):** os
**10** arquivos alterados (`Utils.gs`, `Sof.gs`, `Dashboard.gs`,
`NotasEmpenho.gs`, `Recibos.gs`, `Unidades.gs`, `Versoes.gs`, `Auth.gs`,
`ListasPersonalizadas.gs`, `Relatorios.gs`) foram colados no editor do Apps
Script e reimplantados (Nova versão). **Ainda não testado em uso real** — ver
lista de pontos a conferir na seção acima (ex.: card "Total mensal
comprometido" com C.G. SUS/T.A.s, telas não travando mais acima de
~120-150 linhas nas abas largas).

## BUG REAL corrigido: campos de valor rejeitavam o formato brasileiro (sessão 2026-08-08)

**Pedido:** "teste todos os botões e campos editáveis, colocando entradas
estranhas tentando quebrar o app". Fuzzing dirigido, com harness no navegador.

**Bug encontrado (o mais grave até agora em valores):** os **18** campos
monetários do app eram `type="number"`, que por especificação HTML só aceita
ponto como separador decimal - mas a tela EXIBE tudo em pt-BR via
`formatarMoeda` ("R$ 1.234,56"). **O app mostrava um formato que não aceitava de
volta.** Confirmado com digitação real (tecla por tecla, locale pt-BR):

| Usuário digita | Antes salvava | Aparecia |
|---|---|---|
| `1.000` (mil reais) | `1` | R$ 1,00 (**1000x menor**) |
| `12.500` | `12.5` | R$ 12,50 (**1000x menor**) |
| `10,50` | `0` | R$ 0,00 |
| `1.234,56` | `0` | R$ 0,00 |

O agravante: nos dois modos o campo reportava `checkValidity() === true` e
`badInput === false` - se declarava **válido e vazio**, então nenhuma validação
HTML5 pegava. E só **1 dos 18** campos tinha `required` (`reforcoValor`), então
parcela contratual, valor liquidado e valor pago gravavam em silêncio.

**Causa raiz secundária, no backend:** `toNumber_` (`Utils.gs`) usava
`.replace(',', '.')`, que troca só a PRIMEIRA vírgula - `toNumber_("1.234,56")`
virava `Number("1.234.56")` = NaN = **0**. Mesma classe de "zero mudo" já
registrada neste PROGRESS (`toNumber_` de array = NaN = 0, sessão de
performance). Alcançável por importação de histórico e por célula editada à mão
na planilha (colunas não numéricas são texto por causa de `aplicarFormatoTexto_`).

**Correção:**
- `UI.parseValorBr` (`js/app.js`): parser com desambiguação - havendo vírgula,
  ela é o decimal e os pontos são milhar; sem vírgula, ponto seguido de
  exatamente 3 dígitos é milhar (`1.000` -> 1000), qualquer outro ponto é
  decimal (`1234.56` -> 1234.56, o formato antigo continua valendo). Devolve
  `null` (não 0) em entrada inválida, pra quem chama poder recusar.
- `UI.validarCamposMoeda` (`js/app.js`): portão único antes de todo Salvar -
  recusa, marca o campo em vermelho e diz qual é, em vez de gravar R$ 0,00.
  Ligado em `salvarSof`, `salvarReciboNovo`, `salvarReciboEdicao` e no
  `btnSalvarUnidade`.
- Os 18 campos viraram `type="text" inputmode="decimal" class="campo-moeda"`
  (`inputmode` mantém o teclado numérico no celular).
- `backend/Utils.gs`: `toNumber_` trata a vírgula como decimal e os pontos como
  milhar; sem vírgula nada muda (um "1.000" lido da planilha continua 1, porque
  aí o ponto veio de número de verdade, não de formatação).
- `normalizarOpcoesFiltro_` (`js/app.js`): descarta item nulo antes do `.map`.
  Um único elemento nulo fazia `o.valor` lançar dentro do `carregar()` da tela,
  virava unhandled rejection e a barra de filtros **derrubava a lista da aba
  inteira, sem mensagem**. NÃO é alcançável pelo backend atual
  (`sheetToObjects_` sempre devolve todas as colunas), foi achado com mock -
  blindado porque custa uma linha.

**Verificação feita (sem tocar na planilha):** stub de `Api.chamar` com dados
sintéticos hostis gerados a partir do `HEADERS` real de cada aba (`<script>`,
`"><img onerror=...`, unicode RTL, strings de 3000 chars, `1e308`, nulos,
colunas faltando) + sessão sintética via `Auth.salvarSessao`. Resultado: **8/8
abas renderizaram, 0 erros, 0 script injetado, 0 `onerror` no DOM** - o payload
aparece como texto literal (escaping sólido). O portão foi testado ponta a
ponta: com lixo no campo, **zero chamadas ao backend**; com `1.234,56`,
`criarUnidade` dispara normal. `parseValorBr`: 15/15 casos.

**Descartado em vez de reportado** (verificado, não era bug): injeção de fórmula
do Sheets (`=1+1`) é neutralizada pelo formato `'@'` de `aplicarFormatoTexto_`;
`1e308` só entra por atribuição programática, o navegador bloqueia na digitação;
`escaparHtml` está completo (`& < > " '`).

**Passo manual concluído (confirmado pelo usuário, sessão 2026-08-08):**
`Utils.gs` colado no editor do Apps Script e reimplantado.

**Ainda não testado:** salvar de verdade um Recibo/SOF/Unidade digitando valor em
formato BR e conferir na planilha o número gravado; o cronograma de 12 meses da
SOF (também virou `.campo-moeda`) somando certo; a soma automática do valor pago
na parcela de 70% com múltiplas Ordens Bancárias; e os fluxos que exigem backend
real (OCR de anexo, documento SEI, relatórios, edição simultânea).

## Relatórios nas telas de Recibos e Notas de Empenho (sessão 2026-08-08)

**Pedido:** "criar relatórios nas abas de recibo e de Notas de Empenho tbm.
Reaproveite o máximo possível do que já existe. Focando em otimização."

O backend **já tinha** `recibos` e `notasEmpenho` no `RELATORIO_CATALOGO_`
(usados pelo assistente do Dashboard desde 2026-07-28) — faltava só o botão
nas telas. Mas copiar o padrão da tela de Unidades ia produzir **relatório com
dado errado**, por causa do item abaixo.

### Achado: os montadores ignoravam a maioria dos filtros, em silêncio

`montarLinhasRecibos_` reimplementava só 5 filtros (`competenciaInicio/Fim`,
`oss`, `unidade_id`, `fonte`, `status`). A tela de Recibos tem 12. Passar
`filtrosAtuais()` direto faria os outros 7 (`competencia` como multi-seleção,
`objeto`, `tipo_unidade`, `dea`, `instrumento`, `nota_empenho`,
`numero_processo`, `busca`) serem **descartados sem nenhum aviso** — o
analista filtraria "jul.26" na tela e receberia todos os meses no relatório.
`montarLinhasNe_` tinha o mesmo problema: 3 dos 8 filtros da tela de NE.

A tela de Unidades nunca sofreu disso porque `montarLinhasUnidades_` foi
escrita espelhando `listarUnidades` de propósito (o comentário dela diz isso).

**Correção — o reuso de verdade:** os montadores passaram a chamar as MESMAS
funções de filtro das telas, em vez de reimplementar um subconjunto:
- `montarLinhasRecibos_` → `filtrarLinhasRecibos_` (`Recibos.gs`), a mesma de
  `listarRecibos`. A faixa `competenciaInicio/Fim` (exclusiva do assistente do
  Dashboard) continua aplicada por cima; os dois formatos coexistem.
- Nova `filtrarGruposNotasEmpenho_` (`NotasEmpenho.gs`), extraída de dentro de
  `listarNotasEmpenho` → usada pelos dois.

Efeito colateral bom: qualquer filtro novo que uma tela ganhar passa a valer no
relatório automaticamente, sem ninguém lembrar de replicar.

### Frontend — um modal só para as 3 telas

O modal "Gerar Relatório" estava embutido em `js/unidades.js` (~55 linhas de
HTML + wiring). Copiar pras outras duas daria 3 cópias quase idênticas.
Extraído para **`TelaRelatorios.abrirParaTela(opcoes)`** (`js/relatorios.js`):
`{ fonte, titulo, obterFiltros, colunasOcultas, ajuda }`. As 3 telas chamam
essa função; `js/unidades.js` encolheu ~50 linhas.

Ganhos que vieram junto, por ser compartilhado:
- **Agrupamento + subtotais** agora existe também nas telas (antes só no
  assistente do Dashboard). As opções são derivadas da fonte — Unidades só
  oferece "Por OSS", porque não tem coluna `unidade`/`fonte`.
- `obterFiltros` é a FUNÇÃO, não o resultado: os filtros são lidos no clique em
  "Gerar", então mexer num filtro com o modal aberto vale.

### Colunas novas no catálogo

- **Recibos:** `dea`, `percentual_parcela_dividida` ("70%"/"30%", vazio em
  linha avulsa) e `parcela_contratual`. As de valor foram movidas para o fim,
  seguindo a convenção já documentada em `unidades`.
- **Notas de Empenho:** `tipo_unidade`, `sei`, `sof_numero`, `dea`, `alerta`
  ("Saldo baixo": Sim/Não), `valor_liquidado`, `parcela_mensal_referencia`.

Modelos de relatório já salvos continuam funcionando (`gerarRelatorio` descarta
key desconhecida); só não trazem as colunas novas, que não estavam na lista
deles. A ordem das colunas de Recibos muda um pouco nos modelos antigos
(valores por último) — cosmético.

### Verificação feita

Sintaxe dos 16 `.gs` via JScript/`cscript`: OK (só o lookbehind pré-existente
de `NotasEmpenho.gs`, como sempre). **Bug pego na revisão do próprio código:**
eu tinha usado `RELATORIO_CAMPO_GRUPO_` no frontend, mas essa constante só
existe no backend — daria `ReferenceError` e o modal não abriria. Corrigido
para derivar de `ROTULO_DIMENSAO_`.

**Nada testado em execução real.** O frontend não tem como ser validado por
sintaxe aqui (JScript não parseia ES6).

**Passo manual pendente:** colar `Relatorios.gs` e `NotasEmpenho.gs` no editor
do Apps Script e reimplantar (Nova versão). Nenhuma coluna ou aba nova.

## Envio da SOF ao SEI pela extensão-ponte (sessão 2026-08-08)

**Pedido:** "conseguir enviar para um processo aberto no SEI uma SOF que foi
criada no app GAOCG através da Extensão" + corrigir as ressalvas levantadas na
revisão da extensão recém-adicionada.

**Como funciona:** não há API do SEI nem servidor no meio. A extensão automatiza
o DOM do formulário nativo "Incluir Documento", sobre a sessão que o próprio
usuário já tem aberta e autenticada no `sei.pe.gov.br`. Só funciona no mesmo
navegador, com o processo aberto numa aba.

### Correções na extensão (v0.1.0 → v0.2.0)

1. **ID da extensão com espaço à esquerda** no snippet do README
   (`" jcnnmpp..."`) — fazia `chrome.runtime.sendMessage` falhar em silêncio.
2. **`externally_connectable` com caminho** (`.../APP-GAOCG/`) — esse campo
   trabalha por ORIGEM e o Chrome ignora/rejeita caminho. Corrigido para
   `https://andersong2021.github.io/*`. Consequência inevitável: qualquer página
   do mesmo usuário no GitHub Pages pode falar com a extensão — limitação do
   Chrome, documentada no README.
3. **`host_permissions` amplas** (`*://*.br/*controlador*.php?acao=*` etc., que
   davam acesso a praticamente qualquer site `.br`) → `https://sei.pe.gov.br/*`
   apenas (domínio confirmado com o usuário). `activeTab` também saiu, virou
   desnecessário.
4. **Pasta duplicada** `gaocg-sei-bridge/gaocg-sei-bridge/` achatada.
   ⚠️ Como o Chrome deriva o ID de extensão sem compactação do CAMINHO no
   disco, **isso muda o ID** — por isso `js/sei-bridge.js` aceita override via
   `localStorage.gaocg_sei_extension_id`, sem exigir novo deploy.
5. **Chave não-padrão** `"//_comment_..."` no manifest (gerava aviso de "chave
   não reconhecida" no Chrome) — movida para o README.

### Bug real encontrado no código da extensão

`abrirIncluirDocumento` procurava o botão em `document` (frame do topo), mas no
SEI a barra de ações do processo fica dentro do iframe `ifrVisualizacao` — **o
botão nunca seria encontrado** e o fluxo sempre morreria em "não encontrei o
botão Incluir Documento".

`content-sei.js` foi reescrito: varre o documento do topo + todos os iframes de
mesma origem (`documentosDisponiveis_`/`acharEm_`), e deixou de depender do
`window.jQuery` do topo (usa DOM puro, e só aproveita o jQuery da janela do
próprio elemento quando existe, que é o necessário pro componente "chosen" do
dropdown de tipo reagir). Também passou a suportar os DOIS formatos de escolha
de tipo que o SEI usa entre versões (`<select id="selSerie">` ou lista de links).

Outros ajustes: só o frame do topo registra o listener (com `all_frames`, vários
frames responderiam à mesma mensagem e o primeiro `sendResponse` venceria); e
`background.js` injeta o content script sob demanda quando a aba do SEI já
estava aberta ANTES da extensão ser instalada/recarregada (caso comum, que dava
"Could not establish connection").

### Integração no app

- Novo **`js/sei-bridge.js`**: wrapper Promise de `chrome.runtime.sendMessage`
  (lendo `chrome.runtime.lastError`, senão o Chrome loga "Unchecked
  runtime.lastError") + timeout próprio, porque quando a extensão não existe o
  callback às vezes simplesmente nunca é chamado.
- **Reaproveita `montarDocumentoSeiHtml_`** (`js/sof.js`) inteiro: o que vai ao
  SEI é o MESMO documento que o botão "Salvar e gerar documento SEI" já baixa.
  Como aquele HTML é um documento completo com `<style>` e o CKEditor do SEI
  descarta folha de estilo, `prepararHtmlParaEditor_` extrai o `<body>` e
  converte as regras em `style` inline (+ `border="1"` de reforço) — sem isso o
  documento chegaria no SEI sem nenhuma borda de tabela, que é o grosso do
  layout da SOF (cronograma, assinaturas).
- Novo botão **"Salvar e enviar ao SEI"** no formulário de SOF → salva primeiro
  (pra o que vai ao processo ser o que ficou gravado) e então envia.
- O processo de destino é achado pelo número SEI da própria SOF (campo `sei`),
  comparado com título/URL das abas do `sei.pe.gov.br`.
- **`autoEnviar` é sempre `false`.** O analista revisa e clica em "Confirmar
  Dados" no SEI. Confirmar automaticamente um documento num sistema de
  processos oficial não é decisão que o app deva tomar sozinho.

### Limitação conhecida (não é bug)

No SEI, o editor de texto normalmente só abre DEPOIS de "Confirmar Dados" — na
tela de cadastro ele ainda não existe. Quando isso acontece, a extensão preenche
o cadastro (tipo, número, descrição, nível de acesso) e o app avisa que o corpo
precisa ser colado no editor que abrir, em vez de falhar. Se o editor já estiver
presente, o conteúdo entra direto.

### Verificação feita

`manifest.json` validado (JSON + campos conferidos). **Nada foi testado num SEI
real** — os seletores do formulário nativo variam entre versões e customizações
por órgão, e é exatamente esse o ponto mais frágil do fluxo. O README lista, um
a um, os seletores a confirmar com o DevTools na primeira execução. O JS da
extensão e do app é ES6 e não tem como ser validado por sintaxe nesta máquina
(sem Node; JScript não parseia ES6).

## 1º teste real do envio ao SEI: documento saía vazio (sessão 2026-08-10)

**Sintoma:** a extensão levou o usuário para a aba do SEI, mas o SEI pediu que
ele escolhesse o tipo de documento e preenchesse o cadastro na mão; ao final, o
documento ("ANEXO") foi criado **sem conteúdo nenhum**.

### Duas causas

**1. O editor do SEI não existe na tela de cadastro.** Ele só abre DEPOIS de
"Confirmar Dados", normalmente numa janela nova. A v0.2.0 tentava injetar o
conteúdo durante o cadastro, encontrava `iframe.cke_wysiwyg_frame` inexistente e
seguia adiante - documento vazio. Isso estava previsto como "limitação
conhecida" na sessão anterior, mas tratado só como aviso ao usuário; na prática
inviabiliza o recurso, porque colar o documento à mão é justamente o trabalho
que o botão deveria eliminar.

**2. Erro meu de arquitetura: isolated world.** `content-sei.js` tinha um
`jqueryDoElemento_` que lia `window.jQuery` da página para disparar
`chosen:updated`. Content script roda em contexto JS **isolado**: compartilha o
DOM, mas não enxerga variáveis da página - aquele helper devolvia `null` sempre
e era código morto, com um comentário afirmando que funcionava. Removido.
Eventos nativos (`new Event('change', {bubbles:true})`) acionam normalmente os
handlers da página, inclusive os registrados por jQuery, então bastam.

**3. Tipo "SOF" não existe na unidade.** `MAPA_TIPO_DOCUMENTO` apontava para um
único nome e a extensão lançava erro quando não achava. O usuário acabou
escolhendo "Anexo" manualmente.

### Correção (v0.3.0) - envio em duas etapas independentes

- **Etapa 1 (best-effort):** abre "Incluir Documento", tenta escolher o tipo e
  preencher o cadastro. Nada mais lança erro: cada parte que falha é apenas
  reportada, e o usuário completa na mão.
- **Etapa 2 (a que importa):** o HTML é gravado em `chrome.storage.local` como
  *pendente* logo no início, ANTES de qualquer automação. Toda página do SEI que
  carregar procura um editor vazio e injeta o conteúdo ali, mostrando um aviso
  verde na própria tela do SEI (o app pode nem estar visível nesse momento).

Com isso o conteúdo chega ao documento **mesmo que o cadastro inteiro seja feito
manualmente** - que é exatamente o cenário do teste que falhou.

**Duas salvaguardas no pendente:**
- expira em 15 minutos;
- só entra em editor **VAZIO**. Sem essa regra, abrir um documento já existente
  dentro da janela de 15 min faria a extensão **sobrescrever o conteúdo dele** -
  destruição de trabalho num sistema de processos oficial.

`MAPA_TIPO_DOCUMENTO` virou lista ordenada de candidatos
(`sof: ["SOF", "Solicitação Orçamentária e Financeira", "Anexo"]`) - usa o
primeiro que existir na unidade; se nenhum existir, deixa a escolha para o
usuário em vez de falhar.

As mensagens no app foram reescritas para deixar explícito que o trabalho **não
acabou** quando o toast aparece: o conteúdo entra ao clicar em "Confirmar Dados".
A mensagem anterior ("cole o conteúdo no editor que abrir") descrevia justamente
o comportamento que agora foi eliminado.

**Passo manual:** recarregar a extensão em `chrome://extensions` (mudou
`manifest.json`, `content-sei.js`, `background.js`). O ID **não** muda - a pasta
continua a mesma. Nenhum `.gs` alterado.

## 2º teste real do envio ao SEI: modelo do SEI bloqueava a injeção (2026-08-10)

**Sintoma:** ao escolher o tipo de documento, o editor abriu com **o modelo
padrão de SOF do próprio SEI, com todos os campos vazios** - o conteúdo do GAOCG
não entrou.

**Causa: a salvaguarda da v0.3.0.** O tipo "SOF" tem MODELO próprio cadastrado
no SEI; ao escolher o tipo, o editor já nasce preenchido com esse template em
branco. Como a v0.3.0 só injetava em editor **vazio** (regra criada para não
sobrescrever documento existente), ela encontrava o template, concluía "já tem
conteúdo" e não fazia nada.

**Por que não dá pra resolver com heurística:** pelo DOM, "modelo em branco de um
documento novo" e "documento oficial já preenchido" são a mesma coisa - HTML no
corpo do editor. Qualquer tentativa de adivinhar erra num dos dois lados, e um
dos erros é apagar documento oficial sem aviso.

**Correção (v0.4.0):** a decisão passou para o usuário, na própria tela do SEI.
- Editor **vazio** → injeta direto, como antes (não há o que perder).
- Editor **com conteúdo** → barra azul no canto: *"este editor já tem conteúdo
  (provavelmente o modelo do SEI). Substituir pelo documento da SOF X?"* com
  **"Substituir"** e **"Agora não"**.

A assimetria é proposital: "Agora não" só esconde a barra e mantém o pendente
válido (a barra reaparece no próximo documento aberto, dentro dos 15 min),
porque deixar de inserir é reversível e inserir por engano não é.

**Passo manual:** recarregar a extensão em `chrome://extensions`. ID não muda,
nenhum `.gs` alterado.

**Ainda não verificado (perguntar no próximo teste):** se o conteúdo PERSISTE
depois de salvar o documento no SEI. A injeção é feita no DOM do editor; o
CKEditor normalmente serializa a partir daí, mas se ele salvar vazio será
preciso chamar a API `CKEDITOR.instances[...].setData()`, o que exige injetar
script no *main world* (content script roda em contexto isolado e não enxerga
`window.CKEDITOR`). Também falta confirmar se as bordas das tabelas
sobreviveram - se não, o SEI está higienizando os `style` inline.

## 3º teste + estudo do SEI Pro: vigilância morria cedo (2026-08-10)

**Sintoma:** nenhuma barra/aviso do GAOCG aparecia quando o editor do SEI abria.
A etapa 2 nunca rodava.

### Causa raiz: a vigilância era disparada uma única vez, no load

Sequência real:
1. página do processo carrega → vigia roda, **ainda não há pendente**, encerra;
2. usuário clica em "Enviar ao SEI" → pendente é gravado;
3. o SEI abre o cadastro e depois o editor **dentro de iframes**, sem recarregar
   o documento do topo → o content script não roda de novo;
4. ninguém mais procura o editor.

Somado a isso, o laço esperava só 45s — menos do que o tempo real de preencher o
cadastro à mão.

**Correção:** a vigilância virou idempotente (`iniciarVigilancia_`) e é ligada em
três momentos: no load, logo após gravar o pendente, e por
`chrome.storage.onChanged` (cobre inclusive pendente criado por outra aba).
O laço agora dura até o pendente expirar (15 min), com intervalo de 600ms.

### Estudo do repositório SEI Pro (github.com/SEI-Pro/sei-pro)

Extensão MV3, ~3,5 MB de JS, ~60 funções no SEI, tudo client-side. Empacota
jQuery/chosen/moment/pdf.js/DOMPurify próprios. Três achados relevantes:

1. **Como alcança o CKEditor:** declara `web_accessible_resources` com CKEditor e
   jQuery (match `*://*.br/*`) — isso existe para o content script injetar um
   `<script src="chrome-extension://…">` na página e escapar do *isolated
   world*. Confirma que escrever `innerHTML` no corpo editável **não basta**: o
   CKEditor grava a partir de `getData()`, do modelo interno, não do DOM.
2. **Bloco de content script dedicado** a `controlador.php?acao=editor_montar`
   com `run_at: document_end` — confirma que o editor é página própria e valida
   a arquitetura em duas etapas.
3. **Não tem `externally_connectable` nem background service worker.** Nenhum
   site externo consegue falar com ele: a integração GAOCG→extensão, que é o
   objetivo do usuário, o SEI Pro **não faz**. Não há o que copiar ali.

**Licença:** AGPL-3.0. Estudar arquitetura/técnica é livre (técnica não é
protegida por direito autoral); copiar trechos obrigaria esta extensão a virar
AGPL, com publicação de código. Nada do que foi implementado aqui saiu do código
deles.

**Melhoria sobre a técnica do SEI Pro (v0.5.0):** em vez de
`web_accessible_resources` (padrão MV2), usamos
`chrome.scripting.executeScript({ world: "MAIN", func, args })` — alcança
`window.CKEDITOR` sem expor recurso nenhum da extensão a páginas de terceiros.
`aplicarConteudo_` tenta `CKEDITOR.instances[...].setData(html)` primeiro e só
cai para `innerHTML` se não houver CKEditor; o aviso na tela indica qual caminho
foi usado ("modo DOM" = fallback).

**Passo manual:** recarregar a extensão em `chrome://extensions`. ID não muda,
nenhum `.gs` alterado.

### v0.5.1 - Temporal Dead Zone derrubava o content script inteiro

A v0.5.0 quebrou com `Cannot access 'vigilanciaAtiva_' before initialization`.
Eu tinha declarado `let vigilanciaAtiva_` **abaixo** do bloco que chama
`iniciarVigilancia_()` na carga. `function` é içada e pode ser chamada de
qualquer lugar, mas `let`/`const` ficam na Temporal Dead Zone até a linha da
declaração executar - a chamada estourava e o content script morria **antes de
registrar qualquer listener**, então nem a etapa 1 funcionava.

**Correção estrutural, não pontual:** todo o código que executa na carga foi
movido para o FIM do arquivo, depois de todas as declarações. Assim nenhuma
ordem de declaração acima consegue quebrá-lo de novo - antes bastava alguém
acrescentar uma constante no meio do arquivo para reintroduzir o mesmo bug, com
o sintoma "nada acontece" e nenhuma pista na tela.

**Limitação de verificação (registrada de propósito):** esse erro é de
EXECUÇÃO, não de sintaxe - nenhuma checagem disponível nesta máquina o pegaria
(não há Node; o JScript do `cscript` nem parseia ES6). A convenção "inicialização
por último" é a mitigação estrutural adotada no lugar do teste que não existe.

## 4º teste: conteúdo ia para a seção errada do documento (2026-08-10)

**Sintoma:** o botão funcionou, mas o editor do SEI tem **três áreas** (cima,
meio, baixo) e só a do meio aceita edição - o conteúdo não foi para lá.

**Causa:** um documento do SEI é dividido em seções pré-definidas -
**cabeçalho, principal, rodapé e assinatura** (documentação oficial do SEI) - e
cada uma é uma instância separada do CKEditor. O SEI trava cabeçalho/rodapé
como read-only. Meu código errava nas duas pontas:

- **caminho DOM** (`corpoDoEditor_`): pegava o PRIMEIRO
  `iframe.cke_wysiwyg_frame` encontrado, que é o cabeçalho;
- **caminho API** (`aplicarViaCkeditor_`): chamava `setData` em **todas** as
  instâncias, ou seja, escrevia o documento inteiro por cima do cabeçalho e do
  rodapé também.

**Correção (v0.6.0):** os dois caminhos passam a escolher UMA seção, pelo mesmo
critério - descarta as read-only (é como o próprio SEI protege
cabeçalho/rodapé, e foi exatamente o que o usuário descreveu), prefere nome que
remeta ao corpo (`principal|conteudo|corpo|texto`) e, empatando, fica com a de
maior altura visível.

**Diagnóstico embutido:** `aplicarViaCkeditor_` roda no main world, então
`console.log` sai no console DA PÁGINA DO SEI - lista nome, `readOnly` e altura
de cada instância, e qual foi escolhida. O aviso verde na tela passou a mostrar
a seção usada (`(seção X)`), ou `(modo DOM)` quando caiu no fallback. Se a
heurística errar, os nomes reais ficam visíveis sem precisar de mais um ciclo às
cegas.

**Sobre o SEI Pro:** o `init.js` dele (entrada da página do editor) não trata
disso - a lógica está em `sei-pro-editor.js`, 440 KB minificados. Não foi
necessário: o discriminador confiável (read-only) veio da documentação do SEI e
do relato do usuário, não do código deles.

**Passo manual:** recarregar a extensão em `chrome://extensions` **e** dar F5 na
aba do SEI. ID não muda, nenhum `.gs` alterado.

## Verificação estrita do processo de destino (v0.7.0, 2026-08-10)

Envio ao SEI **funcionando de ponta a ponta** a partir da v0.6.0 (confirmado
pelo usuário). Esta sessão fecha um risco que sobrava.

### O risco

`findMelhorAbaSei` tinha um fallback: não achando o número, usava "qualquer aba
do SEI aberta". Ou seja, com outro processo em foco, **o documento da SOF seria
criado no processo errado** - sem nenhum aviso, num sistema de processos
oficial. Pedido do usuário: conferir o número e, não achando, recusar.

### Como a conferência é feita

Perguntando a cada aba do SEI **quais números de processo ela exibe**
(`CONFERIR_PROCESSO` → `conferirProcesso_`), varrendo o texto do documento do
topo + iframes de mesma origem com o padrão `\d{5,10}\.\d{6}/\d{4}-\d{2}`, e
comparando só os dígitos (ignora diferença de formatação).

**Por que pelo texto e não pela URL:** a URL do `procedimento_trabalhar` traz
`id_procedimento`, um id interno do banco - não tem relação com o número que o
analista digitou na SOF. Não dá para casar os dois.

Entre as abas que batem, prefere a que está de fato com a árvore do processo
aberta (`ehPaginaDeProcesso`) - só nela existe o botão "Incluir Documento".

### Não achou: abre a pesquisa

`abrirPesquisaDoProcesso_` grava o número em `chrome.storage.local` e abre uma
aba **nova** em `sei.pe.gov.br` (nova de propósito: não mexe no que o analista
já tem aberto). O content script daquela aba consome o número e preenche a
pesquisa do SEI.

⚠️ **Parte não confirmada no ambiente da SES-PE:** o seletor do campo de
pesquisa. São tentados `#txtPesquisaRapida`, `input[name=txtPesquisaRapida]`,
`#txtInfraPesquisar` e `input[type=search]`; se nenhum casar, mostra o número na
tela para o usuário colar à mão, em vez de falhar em silêncio. É o único ponto
desta versão que ainda depende de validação real.

**Passo manual:** recarregar a extensão em `chrome://extensions` **e** F5 na aba
do SEI. ID não muda, nenhum `.gs` alterado.

## Cadastro do documento 100% automático no SEI (v0.8.0, 2026-08-10)

**Pedido:** automatizar também os dois passos manuais que sobravam - escolher o
tipo ("SES - SOF - Solicitação Orçamentária e Financeira") e o Nível de Acesso
(Restrito + Hipótese Legal "Controle Interno") - e já abrir o editor.

### O que as telas enviadas revelaram (e eu não tinha)

1. **A escolha do tipo NÃO é um `<select>`.** É um campo de filtro + lista de
   sugestões, e o item traz a sigla da unidade na frente: *"SES - SOF -
   Solicitação Orçamentária e Financeira"*. O código comparava por igualdade
   exata com `"SOF"` - nunca casaria. Agora digita o filtro, espera a lista e
   casa por **"contém"**.
2. **Existe "Texto Inicial: Nenhum".** Marcando essa opção, o editor abre
   **vazio** - então o conteúdo entra sozinho, sem a barra de confirmação (que
   só existe para não sobrescrever o modelo do SEI). Elimina um clique e a
   ambiguidade toda.
3. **O botão é "Salvar"**, não "Confirmar Dados" como em outras versões do SEI.
   Os dois passaram a ser aceitos.

### Campos localizados por RÓTULO, não por id

Os ids do formulário do SEI variam por versão/customização e nunca foram
confirmados aqui - já erramos com `#txtNumero`/`#txtDescricao`. Os **rótulos**,
por outro lado, estão na tela e são estáveis: "Descrição:", "Nome na Árvore:",
"Observações desta unidade:", "Hipótese Legal:", "Restrito", "Nenhum". Novos
helpers `campoPorRotulo_`, `marcarOpcaoPorRotulo_` e `selecionarOpcaoPorTexto_`
procuram por texto visível e caem no campo seguinte na ordem do documento (ou
usam `label[for]` quando existe).

A Hipótese Legal só é preenchida **depois** de marcar Restrito - o SEI só
mostra esse `<select>` nesse momento.

### Padrões ficam no APP, não na extensão

`PADRAO_DOCUMENTO_SOF_` (`js/sei-bridge.js`) concentra tipo, texto inicial,
nível de acesso e hipótese legal. São decisão de negócio da GAOCG, não detalhe
de automação - e assim mudam com um deploy do app, sem reinstalar a extensão em
cada máquina.

### autoEnviar passou a ser true

Decisão explícita do usuário. Eu havia mantido manual por cautela; registrando o
raciocínio de que a cautela continua válida onde importa: o documento é apenas
**criado**, nunca assinado, e permanece removível pelo próprio SEI. A assinatura
segue 100% manual.

**Passo manual:** recarregar a extensão em `chrome://extensions` **e** F5 na aba
do SEI. ID não muda, nenhum `.gs` alterado.

## Retomada automática do envio ao abrir o processo (v0.9.0, 2026-08-10)

**Relato:** "está abrindo o processo corretamente, mas só está buscando anexar a
SOF quando eu solicito novamente no app".

Comportamento por desenho da v0.7/0.8 - eu **exigia** o segundo clique ("abra o
processo e clique em enviar de novo"). Na prática é um passo a mais sem
necessidade: a intenção já foi declarada no primeiro clique.

**Correção:** quando o processo não está aberto, o background passa a guardar o
envio INTEIRO (`envioPendente` = documento + número do processo) junto do
`processoParaAbrir`. Ao carregar qualquer página `procedimento_trabalhar`, o
content script chama `retomarEnvioPendente_`, espera a árvore montar (o número
só aparece no texto depois disso), confere o número e, batendo, executa
`preencherDocumento` sozinho.

**Salvaguardas mantidas:** abrir um processo DIFERENTE não dispara nada - a
conferência de número continua valendo e o pendente fica esperando; expira em 15
min; e `retomandoEnvio_` evita que duas abas retomem o mesmo envio ao mesmo
tempo.

**No app:** "processo não aberto" deixou de ser toast vermelho quando o envio foi
agendado (`envioAgendado`) - virou informativo, porque não há nada a refazer.

**Passo manual:** recarregar a extensão em `chrome://extensions` **e** F5 na aba
do SEI. ID não muda, nenhum `.gs` alterado.

## 5º teste: filtro do tipo na caixa errada + número da SOF do SEI (v0.10.0)

Fluxo funcionando de ponta a ponta, com dois ajustes.

### 1. Escolha do tipo continuava manual - eu digitava na caixa errada

`escolherTipoDocumento_` procurava "o primeiro input de texto visível" varrendo
**todos** os documentos acessíveis. O primeiro é o da **busca da barra superior
do SEI**, que fica no documento do TOPO - a tela de escolha do tipo fica dentro
de um iframe de conteúdo. Ou seja: a extensão digitava "SOF" na pesquisa do SEI
e a lista de tipos nunca filtrava.

**Correção:** novo `documentoComTexto_("Escolha o Tipo do Documento")` escopa a
busca ao documento certo antes de procurar o filtro e o item da lista. Também
passou a disparar `keydown`/`keypress`/`keyup` (o autocomplete do SEI reage a
keyup, não a `input`).

### 2. Número da SOF gerado pelo SEI

Achado do usuário: mesmo com "Texto Inicial: Nenhum", o editor abre com o modelo
padrão de SOF - e esse modelo **já traz o número novo da SOF** (ex.: "173/2026"),
sequencial, gerado pelo SEI no momento da criação. O app não tem como saber esse
número de antemão.

**Solução:** `numeroSofNoModelo_` lê o número do modelo ANTES de substituir o
conteúdo (depois o modelo já era) e troca, no HTML vindo do app, o
`marcadorNumeroSof` (o `sof_numero` do app) pelo número oficial do SEI. O aviso
na tela mostra o número detectado, para conferência.

Heurística da leitura: primeiro um número colado à sigla "SOF"
(`/SOF[^\d]{0,20}(\d{1,4}\/\d{4})/i`); se não achar, o primeiro `NNN/AAAA` nos
1000 primeiros caracteres (o cabeçalho) - assim não captura data ou valor solto
no meio do texto.

**Em aberto:** o número lido fica só no documento do SEI; **não** volta para o
registro da SOF no app. Fazer isso exigiria a extensão escrever na página do
GAOCG (host permission nova para github.io) - não implementado, o analista
copia manualmente se quiser.

**Passo manual:** recarregar a extensão em `chrome://extensions` **e** F5 na aba
do SEI. ID não muda, nenhum `.gs` alterado.

## 6º teste: seleção do tipo por teclado, sem confirmação e com salvamento (v0.11.0)

Confirmado funcionando: a troca do número da SOF pelo que o SEI gera. Dois
ajustes restantes.

### 1. O filtro era digitado, mas o item não era selecionado

O SEI usa **autocomplete do jQuery UI**. Um `.click()` no item praticamente
nunca seleciona: o widget age no `mousedown`/`menuselect`, não no `click`.

**Correção:** passou a usar o caminho nativo do componente - **ArrowDown +
Enter** no próprio campo de filtro. Detalhe que faz isso funcionar: o construtor
de `KeyboardEvent` não permite definir `keyCode`/`which` (são getters
derivados), e é exatamente por eles que o jQuery normaliza a tecla - sem
`Object.defineProperty` para forjá-los, o handler da página recebe keyCode 0 e
ignora o evento. Novo helper `teclar_`.

Se o teclado não avançar, cai para clique com a **sequência completa de mouse**
(`mouseover`→`mousedown`→`mouseup`→`click`, novo `clicarComoUsuario_`), e a
escolha do item passou a pegar o elemento **mais profundo** que contém o rótulo
- os ancestrais também "contêm" o texto e clicar neles não faz nada.

### 2. Substituição automática e salvamento

Pedido explícito do usuário: substituir sem perguntar e salvar sozinho ("posso
depois reabrir e editar sem problema").

A barra de confirmação da v0.4.0 foi **removida** (junto com o código, para não
ficar morto). Justificativa registrada: ela existia porque o DOM não distingue
"modelo em branco" de "documento preenchido" - mas como o tipo "SOF" SEMPRE abre
com o modelo do SEI, a pergunta aparecia em 100% dos envios e virou atrito puro.

Novo `salvarNoEditor_` clica no Salvar do editor (vários candidatos: `#cmdSalvar`,
`input[value=Salvar]`, `a[title=Salvar]`, `.cke_button__save`). Há uma pausa de
800ms antes: o CKEditor precisa terminar de processar o `setData`, senão o
salvamento pega o conteúdo antigo. Não achando o botão, o aviso na tela **pede o
salvamento manual** em vez de dar a impressão de que ficou tudo pronto.

**Risco aceito, registrado:** sem a confirmação, um pendente não consumido pode,
em tese, sobrescrever um documento aberto dentro da janela de 15 min. O que
limita: o pendente só nasce de um envio explícito do GAOCG, é consumido uma
única vez, expira em 15 min, e o documento criado **nunca é assinado**.

**Passo manual:** recarregar a extensão em `chrome://extensions` **e** F5 na aba
do SEI. ID não muda, nenhum `.gs` alterado.

## 7º teste: pesquisa na aba atual + "listado" não é "aberto" (v0.12.0)

**Relato:** sem nenhum processo aberto (tela "Controle de Processos"), a
extensão dizia que não havia processo aberto e abria aba nova - mas a barra
"Pesquisar..." do canto superior é a mesma em qualquer tela do SEI.

### 1. Reaproveita a aba do SEI já aberta

`agendarEnvioEAbrirPesquisa_` agora, antes de criar aba, procura uma aba do SEI
existente, traz para frente e manda `PESQUISAR_PROCESSO` para o content script
dela - que pesquisa ali mesmo. Aba nova virou fallback (nenhuma aba do SEI
aberta, ou o content script não respondeu).

Consequência boa: nesse caminho o `processoParaAbrir` nem chega a ser gravado.
Ele só existe para o fluxo da aba nova, onde a pesquisa precisa esperar a
próxima carga de página.

**Seletor do campo de pesquisa:** a tela enviada mostrou o placeholder
"Pesquisar...", então entrou `input[placeholder*="Pesquisar" i]` como primeiro
candidato - o mais confiável da lista, agora baseado na tela real e não em
chute. Os ids antigos continuam como alternativa.

### 2. Bug sutil: "listado" não é "aberto"

A tela "Controle de Processos" **lista** números de processo. `conferirProcesso_`
varre o texto da página, então se o processo alvo estivesse nessa lista a aba
seria dada como válida - mas ali não há árvore nem botão "Incluir Documento", e
a criação quebraria logo depois.

`acharAbaDoProcesso_` passou a **exigir** `ehPaginaDeProcesso` (URL com
`procedimento_trabalhar`), não só a presença do número. Achar o número numa
listagem agora cai corretamente no fluxo de pesquisa.

**Passo manual:** recarregar a extensão em `chrome://extensions` **e** F5 na aba
do SEI. ID não muda, nenhum `.gs` alterado.

## 8º teste: corrida com o carregamento do modelo do SEI (v0.13.0)

**Sintoma:** tudo funciona até a colagem - o conteúdo do app não entra e o
modelo padrão de SOF do SEI permanece no editor.

### Causa: corrida, não falha de seletor

O corpo do editor existe no DOM **antes** de o CKEditor terminar de carregar o
modelo do documento. A extensão injetava nesse intervalo e o modelo era
carregado **por cima** logo depois - resultado idêntico a "não fez nada".

Por que só apareceu agora: até a v0.6.0 havia a barra de confirmação, e o tempo
até o usuário clicar em "Substituir" já servia de espera. Ao remover a pergunta
(v0.11.0, a pedido do usuário), a corrida ficou exposta. **A funcionalidade não
regrediu por um bug novo - a espera acidental é que sumiu.**

### Correções

1. **`aguardarEditorEstabilizar_`** - só injeta depois que o `innerHTML` do
   editor para de mudar por 1,5s (limite de 20s). É o sinal de que o modelo
   terminou de carregar.
2. **`conteudoConfere_` + até 3 tentativas** - depois de injetar, confere se o
   que está no editor tem pelo menos metade do tamanho do que foi enviado
   (folga para o CKEditor reescrever a marcação). Não conferindo, reinjeta.
   Sem isso a extensão anunciava "inserido" com o modelo na tela - foi
   exatamente o que o usuário viu.
3. **`status === "ready"`** no main world - instância ainda em "loaded"/
   "unloaded" descarta o `setData` quando termina de carregar. Agora só
   instâncias prontas são consideradas, e "não está pronto" vira um motivo
   explícito de nova tentativa.
4. Falhando as 3 tentativas, o aviso na tela **diz que não colou** e manda usar
   "Salvar e gerar documento SEI" - em vez de dar a impressão de sucesso.

O número da SOF passou a ser lido depois da estabilização, o que também torna
essa leitura mais confiável.

**Passo manual:** recarregar a extensão em `chrome://extensions` **e** F5 na aba
do SEI. ID não muda, nenhum `.gs` alterado.

## 9º teste: FLUXO COMPLETO FUNCIONANDO + limpeza de erros de console (v0.13.1)

**Envio da SOF ao SEI validado de ponta a ponta, duas vezes seguidas.** Restaram
erros no console - nenhum impedia o funcionamento, mas os dois tinham causa real
na extensão.

### 1. `TypeError: Cannot read properties of null (reading 'executar')`

Erro do **código do próprio SEI** (`alterarNivelAcesso`, em `controlador.php`),
disparado pela nossa automação: `marcarOpcaoPorRotulo_` acionava o mesmo radio
**três vezes** - `checked = true`, `.click()` (que já emite `change` nativamente)
e ainda `dispararChange_`. O handler do SEI rodava repetido e, na segunda
execução, encontrava um elemento que a primeira ainda não tinha terminado de
montar.

**Correção:** um único disparo. E, se o campo já estiver marcado - caso de
"Restrito" e "Nenhum", que são o padrão da tela -, não mexe: reprocessar uma
mudança que não houve é o que causava o erro.

### 2. "message channel closed before a response was received" (22x e 15x)

Ruído da própria extensão: a página navega (o clique em "Salvar") e mata o
content script enquanto uma resposta assíncrona ainda estava pendente. O
trabalho já tinha terminado - por isso tudo funcionava -, mas o console dava a
impressão de falha.

**Correções:**
- o handler de `PREENCHER_DOCUMENTO` responde **uma única vez** e no máximo em
  10s (timeout), então o canal nunca fica aberto esperando algo que não virá;
- novo `paginaSaindo_` (via `pagehide`/`beforeunload`): com a página saindo,
  `pedirInjecaoNoMainWorld_` nem tenta a mensagem e cai direto no modo DOM.

**Honestidade sobre esta segunda correção:** ela é defensiva. A causa descrita
(navegação com mensagem em voo) explica bem o sintoma, mas não foi reproduzida
de forma isolada - se os erros persistirem, o diagnóstico precisa ser refeito.

**Passo manual:** recarregar a extensão em `chrome://extensions` **e** F5 na aba
do SEI. ID não muda, nenhum `.gs` alterado.

## Espera adaptativa na escolha do tipo (v0.14.0, 2026-08-10)

**Relato:** a automação demora alguns segundos entre digitar o filtro e apertar
seta-baixo + Enter.

Não era proposital: era um `esperar_(700)` fixo "por garantia" antes da seta,
mais 250ms antes do Enter, e polling de 300ms em todas as esperas do caminho.
Somando, quase 1,3s de espera cega.

**Correção:** a espera virou **adaptativa** - novo `itemDaLista_` detecta a
sugestão assim que ela aparece e a extensão age em seguida (80ms de folga), com
polling de 80-120ms em vez de 300ms. Só quando a lista NÃO aparece é que sobra
um respiro fixo de 400ms, para não desistir cedo demais numa rede lenta. Na
prática deve cair para ~200-300ms.

`itemDaLista_` também eliminou a duplicação: a mesma busca de item servia à
detecção da lista e ao fallback de clique, escrita duas vezes.

### As duas esperas que NÃO foram reduzidas (de propósito)

- `esperar_(1200)` na verificação da injeção;
- `esperar_(800)` antes de salvar.

Essas são **load-bearing**: a de 1200ms é uma janela de acomodação para
detectar o modelo do SEI sobrescrevendo o conteúdo DEPOIS da injeção (foi
exatamente o bug da v0.13.0). Torná-la adaptativa - "para assim que o conteúdo
bater" - reintroduziria o bug, porque a sobrescrita chega depois do primeiro
acerto. A de 800ms dá tempo do CKEditor processar o `setData` antes do salvamento.

**Passo manual:** recarregar a extensão em `chrome://extensions` **e** F5 na aba
do SEI. ID não muda, nenhum `.gs` alterado.

## Legenda do cronograma + lentidão ao escolher o tipo de SOF (2026-08-12)

### 1. Legenda (pedido do usuário)

No card de NE, "CRONOGRAMA SOLICITADO (SOF)": verde passou a ser **"Atendido"** e
vermelho **"Falta atender"** (antes: "já coberto pelo total atendido" / "ainda
não atendido"). Mesma troca nos `title` de cada mês e na legenda equivalente
dentro do formulário de SOF (`js/sof.js`), para as duas telas não divergirem.

**Bug corrigido junto:** a legenda escrevia `R$ ${UI.formatarMoeda(...)}` e
`formatarMoeda` já inclui o símbolo - saía **"R$ R$ 27.647.946,37"**, visível no
print enviado.

### 2. Escolher o tipo de SOF demorava 20 a 45 segundos

**Causa raiz:** o autopreenchimento (`change` de `sofTipoSof`, js/sof.js) chamava
`listarSof({ tipo: [tipo], page: 1, pageSize: 1 })`. Pedia UMA linha, mas
`listarSof` calcula o universo inteiro antes de paginar:

- anexa fontes + `total_solicitado` a **todas** as SOFs
  (`agruparFontesPorSof_`, que lê SofFontes + SofFontesCronograma);
- monta `agruparValorAtendidoPorSofFonteObjeto_`, lendo NotasEmpenho inteira;
- lê ListasPersonalizadas para o destaque de "parado";
- filtra, ordena e só então corta em 1 registro.

4-5 leituras de aba e trabalho O(n) sobre todas as SOFs para devolver 1 linha.

É a **mesma classe de problema** já corrigida em `listarNotasEmpenhoPorUnidade`
(NotasEmpenho.gs), que reaproveitava `montarGruposNotasEmpenho_` para usar 4
campos - o comentário de lá documenta o achado original.

**Correção:** novo `obterTemplateSof(session, tipo)` (`Sof.gs`) - uma varredura
da aba SOF (cacheada) pegando o mais recente do tipo, e as fontes só dessa
linha. `total_atendido` não é calculado de propósito: o frontend descarta esse
campo mesmo (é o empenhado da SOF de origem, não da nova).

No frontend, a chamada usa `{ cache: true }` (trocar de tipo repetidamente vira
instantâneo) e `salvarSof` faz `Api.invalidarCache('obterTemplateSof')`, porque
o "último SOF do tipo" muda quando um novo é criado.

**Se ainda estiver lento, verificar:** `cachePut_` (Utils.gs) ignora valores
acima de ~90 mil caracteres. Com 60+ colunas, a aba SOF cruza isso por volta de
100-150 linhas - a partir daí `todosSofComCache_` **nunca** cacheia e toda
leitura vai à planilha. É degradação proposital (melhor lento que quebrado, ver
sessão 2026-08-07), mas seria o próximo gargalo, e a solução seria projeção de
colunas.

**Passo manual:** colar `backend/Sof.gs` e `backend/Code.gs` no editor do Apps
Script e reimplantar (Nova versão). Nenhuma coluna ou aba nova.

## Filtros de Ano/Competência + "Falta atender" por mês no relatório (2026-08-12)

### Filtros novos, com a semântica definida pelo usuário

"Competência" não existe como campo em SOF nem em NE - precisava ser derivada, e
derivar do campo errado devolveria subconjunto errado em silêncio. Consultado, o
usuário definiu:

| Tela | Competência | Ano |
|---|---|---|
| SOF | **não se aplica** | do Nº SOF (`173/2026`); sem Nº SOF, cai para o ano da `data_criacao` (`anoDoSof_`) |
| Notas de Empenho | meses do **cronograma de desembolso** | 4 primeiros dígitos do nº da NE (já era `g.ano`) |
| Recibos | mantida como estava | derivado da competência (`jul.26` → `2026`, `anoDaCompetencia_`) |
| Unidades | não recebe nada | não recebe nada (cadastro sem dimensão temporal) |

`competenciaDoMes_` foi extraída de `situacaoCronogramaMes_` para o filtro de NE
usar **exatamente** a mesma conversão mês+ano → "mmm.aa" que resolve a Situação
exibida. Se as duas divergissem, o filtro traria meses que a tela mostra como
outra competência.

**Além de filtrar, mostrar** (pedido explícito): com filtro de Competência ativo
na tela de NE, o cronograma do card **abre expandido** e o(s) mês(es) filtrado(s)
ficam destacados (`.linha-mes-filtrado` + selo "filtrado"), para a Situação
daquele mês ficar visível sem abrir card por card. `competenciaDoMesNe_`
(frontend) espelha a função do backend - o comentário marca essa dependência.

`UI.listaAnos()` (js/app.js): do próximo ano até 2021, intervalo fixo de
propósito - derivar dos dados custaria mais uma chamada ao backend só para
montar um dropdown.

### Relatório de NE: "Falta atender" por mês

Pedido: saber **quanto** falta atender em cada mês, não só o total.

Novo `faltaAtenderPorMes_` (`Relatorios.gs`): o `atendido` que já existia por mês
é acumulado (o empenhado cobre os meses em ordem até acabar); aqui a mesma lógica
vira **valor**, então o mês parcialmente coberto aparece com o pedaço que resta:

```
acumulado até o mês i = C_i ; total atendido = A
C_i <= A       -> falta 0            (mês inteiro coberto)
C_(i-1) >= A   -> falta o valor do mês (nada coberto)
no meio        -> falta C_i - A       (parcial)
```

Vira 12 colunas planas `falta_mes_1..12` ("Falta Jan"... "Falta Dez"), geradas
por `colunasFaltaPorMes_` em vez de escritas à mão. Sendo colunas de moeda, os
subtotais por grupo e o total geral do relatório funcionam sozinhos. Ficam por
último no catálogo (a ordem do catálogo é a ordem do relatório), para não
empurrar as colunas principais de quem não marcar essas.

**Passo manual:** colar `backend/Sof.gs`, `backend/NotasEmpenho.gs`,
`backend/Recibos.gs` e `backend/Relatorios.gs` no Apps Script e reimplantar
(Nova versão). Nenhuma coluna ou aba nova.

## Filtros facetados: cada filtro só oferece o que leva a resultado (2026-08-12)

**Pedido:** "quando eu escolher um filtro e filtrar, os outros filtros só devem
mostrar opções equivalentes... e isso deve valer em todo app".

### Por que precisou ir para o backend

Já existia `recalcularFiltrosCruzadosUnidade` (js/app.js), mas ela só cobria o
trio Unidade/Tipo de unidade/OSS - justamente as três listas que o frontend
tinha **inteiras** em memória. As demais dimensões (Objeto, DEA, Fonte, Status,
Competência, Ano) não davam: a tela só tem a página atual (20 linhas), não há
como derivar dela quais valores existem no conjunto todo.

Por isso o cálculo passou para o backend: novo `calcularFacetas_` (Utils.gs),
que devolve, junto com a página, os valores ainda possíveis de cada dimensão.

**A regra que faz funcionar:** a faceta de cada dimensão é calculada **excluindo
o filtro dela mesma**. Se a própria dimensão entrasse na conta, escolher
"TESOURO" em Fonte deixaria a lista de Fonte só com "TESOURO" - e não haveria
como marcar uma segunda fonte. Cada dimensão é calculada com os outros filtros
aplicados e o seu próprio removido.

`filtrarFn` recebida é sempre a MESMA função que filtra a listagem, para faceta
e resultado nunca discordarem - senão a lista ofereceria um filtro que não
existe, ou esconderia um que existe.

### Refatorações que isso exigiu (e que pagam por si)

`listarSof` e `listarUnidades` tinham a cadeia de filtros **inline**. Foram
extraídas para `filtrarLinhasSof_` e `filtrarLinhasUnidades_`, seguindo o que já
tinha sido feito em `filtrarLinhasRecibos_` e `filtrarGruposNotasEmpenho_`. Agora
as quatro telas têm o mesmo formato, e a extração do SOF abre caminho para o
relatório de SOF respeitar todos os filtros da tela (hoje `montarLinhasSof_`
ainda só entende oss/unidade - **pendência conhecida**).

### Frontend

Novo `UI.aplicarFacetas(facetas, cfg)`: cada tela declara um mapa
`id do widget -> { chave, rotulo }` (`FACETAS_SOF_`, `FACETAS_NE_`,
`FACETAS_REC_`, `FACETAS_UNI_`) e aplica na resposta de cada carga.

**A seleção atual é sempre mantida na lista**, mesmo que a faceta não a traga.
Sem isso, uma combinação que zera resultados faria a opção escolhida sumir e ser
descartada em silêncio - o usuário veria a lista mudar sozinha e ficaria sem
como desmarcar o que causou aquilo.

`recalcularFiltrosCruzadosUnidade` foi **removida**. Manter as duas seria pior
que escolher uma: a versão local reescrevia as opções a cada clique de checkbox,
desfazendo o que as facetas tinham acabado de definir.

**Mudança de comportamento consciente:** o estreitamento agora acontece ao clicar
em **Filtrar** (quando a resposta chega), não no instante do clique no checkbox,
como era para o trio. Foi o momento descrito no pedido ("quando eu escolher um
filtro **e filtrar**").

### Custo

`calcularFacetas_` roda o filtro uma vez por dimensão - até 9 passagens em
Recibos - mas tudo **em memória**, sobre linhas já carregadas, sem leitura extra
de planilha. `mapaDeaPorNumeroNe_` ganhou memo por execução porque, com o filtro
de DEA ativo, seria remontado em quase todas as passagens (cada uma reparseando
SOF + NE do CacheService).

**Passo manual:** colar `backend/Utils.gs`, `backend/Sof.gs`,
`backend/NotasEmpenho.gs`, `backend/Recibos.gs` e `backend/Unidades.gs` no Apps
Script e reimplantar (Nova versão). Nenhuma coluna ou aba nova.

## Backfill do Cronograma de Desembolso das NEs já cadastradas (2026-08-12)

Pedido: "adicione as NEs já cadastradas à aba NotasEmpenhoCronograma" -
`NotasEmpenhoCronograma` só passou a ser preenchida a partir da sessão
2026-07-18 (ver seção acima na data correspondente); NEs originais lançadas
antes disso, ou lançadas pelo mini-formulário embutido no SOF (que não pede
cronograma), ficaram sem essas linhas mesmo já tendo o PDF anexado com a
tabela "CRONOGRAMA DE DESEMBOLSO" nele.

Nova rotina `migrarCronogramaNotasEmpenhoExistentes()` (`backend/NotasEmpenho.gs`) -
mesmo padrão manual de `semearListaOSS`/`semearListaObjetos`
(`ListasPersonalizadas.gs`): sem `session`, **não** passa por `Code.gs`, roda
uma única vez direto pelo editor do Apps Script (selecionar a função no
dropdown → Executar). Não é uma tela nem um endpoint - reprocessamento pesado
(um OCR por documento) não deve ficar exposto a chamada de API repetida.

**O que faz:** para cada NE `tipo === 'original'` que ainda não tem nenhuma
linha em `NotasEmpenhoCronograma`, reabre o próprio arquivo já anexado
(`arquivo_drive_id`) e reaplica exatamente o mesmo OCR + regex da leitura
original (`extrairTextoOcr_` + `extrairCronogramaDesembolso_`, as mesmas
usadas por `lerAnexoNotaEmpenho` na hora do cadastro) - não pede upload de
nada de novo. Grava os 12 meses com `criado_por: 'rotina_migracao_cronograma'`
(mesmo espírito de `origem: 'importacao_inicial'` em `migrarRecibosHistorico`
- rastreável como carga em lote, não lançamento manual de um analista).

**Idempotente e resumível:** só entra na lista quem ainda não tem cronograma,
então rodar de novo (ex.: se o lote for grande e bater no limite de 6 min de
execução do Apps Script) simplesmente continua de onde parou - nunca duplica
linha. Erro num arquivo (OCR fora do ar, PDF sem a tabela, etc.) fica
registrado no objeto de retorno (`sem_arquivo`, `sem_cronograma_no_documento`,
`com_erro`) e não interrompe os demais.

**Fora do escopo, por decisão de dado:** NE `reforço` nunca entra aqui -
reforço não tem cronograma próprio (tem `mes_referencia`, já existente).

**Passo manual:** colar `backend/NotasEmpenho.gs` no Apps Script, reimplantar
(Nova versão) e então, no próprio editor do Apps Script, selecionar
`migrarCronogramaNotasEmpenhoExistentes` no dropdown de funções e clicar
Executar. Olhar o retorno no log de execução (View → Logs, ou o painel de
execução) para conferir `preenchidas`/`sem_cronograma_no_documento`/
`sem_arquivo`/`com_erro`.

## Metas Mensais de Processos - painel "Processos do mês" no Dashboard (2026-08-24)

Pedido: uma forma de ver, no Dashboard, quantos processos são esperados por
mês (separados por unidade e objeto) já chegaram e quantos ainda faltam,
filtrável por unidade/objeto/estado - alimentada por uma meta que é um
**padrão mensal recorrente** (cadastra uma vez, vale todo mês até editar),
não um lançamento por competência. Desenho fechado antes de codar (a pedido
do usuário) em `docs/ESPECIFICACAO_METAS_PROCESSOS.md` - ver esse documento
para o detalhe completo do modelo de dados/cálculo/interação; aqui só o
resumo do que foi implementado e os desvios do desenho original (seção 10
do documento).

**Modelo de dados (nova aba `MetasProcessos`):** uma linha por combinação
Unidade+Objeto (`unidade_id`, `objeto`, `quantidade_esperada`, `ativo`,
`criado_por`, `data_criacao` - sem competência própria, sem
`alterado_por`/`data_alteracao`: seguiu o mesmo padrão de auditoria de
`Unidades`/`ListasPersonalizadas`, não o de `LogAuditoria`, que hoje só cobre
SOF/Recibo). Restrição de unicidade: não pode haver duas metas **ativas**
para a mesma combinação Unidade+Objeto. Aba **criada sob demanda** na
primeira escrita (`getSheetMetasProcessos_`, `backend/MetasProcessos.gs`),
mesmo padrão de `RecibosOrdensBancarias`/`RelatoriosModelos`/`Sugestoes` - não
precisa ser criada à mão, e a leitura (`obterDashboard`) não quebra se ela
ainda não existir.

**Cálculo (`dashboardMetasProcessos_`, `backend/Dashboard.gs`):** para a
competência selecionada, por meta ativa - `chegado` = contagem de Recibos não
excluídos da mesma competência+unidade+objeto (independente do status de
pagamento); `falta` = `max(esperado-chegado,0)`; `excedente` =
`max(chegado-esperado,0)`. Devolve TODOS os itens de uma vez (sem filtro
server-side de unidade/objeto/estado) mais `sem_meta` (combinações com Recibo
na competência mas sem meta ativa correspondente - aviso, não entra nos
totais).

**Dashboard (`js/dashboard.js`):** 6º card na grade de indicadores
("Processos do mês", cor roxo, antes sem uso). Diferente dos outros cards
clicáveis, este **não navega pra outra tela** - clique expande/recolhe (com
um chevron que gira, `.cartao-indicador-seta.aberta`) um painel no próprio
Dashboard com filtros de Unidade/Objeto (múltipla escolha) + Estado
(Chegado/Falta) e uma tabela ordenada por Falta decrescente. Os filtros
operam **só no cliente** (sobre o array já carregado, sem round-trip) - lista
pequena o bastante (uma linha por combinação Unidade+Objeto) pra não valer a
complexidade de mandar os filtros pro backend. Painel recolhido por padrão a
cada `carregar()` (troca de competência/"Atualizar"). Clique numa linha da
tabela navega pra Recibos já filtrado por Unidade+Objeto+Competência - exigiu
estender `js/recibos.js` (`filtroInicial.unidade_id`/`objeto`, que antes só
existia pra competência/status).

**Tela de manutenção (`js/metas-processos.js`, novo menu "Metas de
Processos"):** CRUD completo (criar/editar/pausar/reativar, mesmo padrão de
`js/unidades.js`/`js/listas.js`) **e** importação em lote (botão "Importar
lista": cola `Unidade;Objeto;Quantidade` uma combinação por linha, aceita `;`
ou tab; faz upsert por combinação - atualiza se já existe meta ativa, cria se
não existe; mostra o resultado linha a linha antes do usuário confiar - ver
`importarMetasProcessosLote`, `backend/MetasProcessos.gs`). Pedido do usuário:
as duas formas de cadastro (manual e lote) disponíveis permanentemente, não
só numa carga inicial.

**Desvios do desenho original decididos ao codar** (ver seção 10 do
documento de especificação para o detalhe completo): filtros do painel do
Dashboard viraram client-side (o desenho original previa parâmetros
`unidadeIds`/`objetos`/`estado` em `obterDashboard`); `MetasProcessos` não
tem `alterado_por`/`data_alteracao` (nenhuma outra aba auxiliar do app tem
esse par); a aba é criada sob demanda em vez de exigir criação manual.

**Passo manual:** colar `backend/MetasProcessos.gs` (novo) + a versão
atualizada de `backend/Utils.gs`, `backend/Contadores.gs`,
`backend/Versoes.gs`, `backend/Dashboard.gs` e `backend/Code.gs` no editor do
Apps Script, reimplantar (Nova versão). A aba `MetasProcessos` nasce sozinha
na primeira meta cadastrada - não precisa criar à mão.

## Fase — Cadastro de usuários revisado (sessão 2026-08-26, pedido do usuário)
Só Gerente/Administrador já criava/gerenciava usuários (`requireGerente_`) — isso não mudou.
O que mudou foi o *fluxo* de criação e troca de senha:
- **Criar usuário** (`js/usuarios.js`, `criarUsuario`/`backend/Usuarios.gs`): modal passou a pedir só
  **Nome completo** + **Tipo de usuário** (Gerente ou Analista — conceder Administrador continua
  exclusivo da edição, por um Administrador). Login e senha **não são mais digitados**: login é
  gerado no backend como `primeironome.ultimonome` (`gerarLoginUnico_` — acentos removidos, e se
  colidir com um já existente vira `primeironome.ultimonome2`, `...3` etc.), senha sempre a
  padrão `"123456"` (`SENHA_PADRAO_`). Depois de salvar, um modal mostra o login gerado pro
  Gerente/Administrador repassar ao novo usuário (`mostrarCredenciaisGeradas_`).
- **Troca de senha obrigatória no primeiro login** (`precisa_trocar_senha`, coluna nova em
  `Usuarios` — **precisa ser criada à mão na planilha real**, mesma pegadinha já documentada
  pras 3 colunas de Prazos Contratuais): fica `true` em todo `criarUsuario` e em todo
  `redefinirSenha`. `login_` devolve essa flag (`user.precisaTrocarSenha`); `mostrarApp`
  (`js/app.js`) trava a tela num overlay fixo sem X/sem clicar-fora-fecha
  (`#sobreposicaoTrocaSenhaObrigatoria`, `index.html`) até a pessoa salvar uma senha nova
  (`trocarSenhaPrimeiroLogin`, `backend/Auth.gs` — não pede senha atual, a sessão já provou que
  ela entrou com a padrão). Overlay avisa que a senha é pessoal e que só um
  Gerente/Administrador pode resetá-la (o que devolve pro padrão e reexibe o mesmo overlay no
  próximo login).
- **Redefinir senha** (botão no modal de edição): não pede mais senha digitada pelo
  Gerente/Administrador — sempre reseta pro padrão `"123456"` e marca `precisa_trocar_senha`,
  com confirmação grande em vez do antigo `prompt()` nativo.
- **Nome exibido**: o modal de edição (Gerente/Administrador) agora mostra o nome completo só
  pra CONSULTA (campo desabilitado) — só o próprio dono da conta muda como o nome aparece no
  app, em "Minha conta" (`alterarMeuNome`, já existia). Editar continua só mexendo no perfil.
- **Lista de usuários**: checkbox "Mostrar usuários desativados" (desmarcado por padrão, esconde
  inativos) + botão de lápis por linha pra editar (mesmo ícone/padrão de `js/listas.js`),
  substituindo o clique na linha inteira.
- **Passo manual:** criar a coluna `precisa_trocar_senha` na aba `Usuarios` da planilha real
  (cabeçalho exatamente esse) — sem ela a escrita cai em silêncio e o modal de primeiro login
  nunca aparece. Depois, colar `backend/Auth.gs`, `backend/Usuarios.gs`, `backend/Code.gs` e
  `backend/Utils.gs` no editor do Apps Script e reimplantar.

## Fase — Observações de Recibo viram comentários com autor+data (sessão 2026-08-26, pedido do usuário)
O campo único "Observação" de Recibos (um texto só, sem saber quem escreveu
nem quando) virou uma thread de comentários - aba nova `RecibosObservacoes`
(`id, recibo_ref_id, texto, criado_por, data_criacao, data_edicao`), **criada
sob demanda** (`getSheetObservacoesRecibo_`, `backend/Recibos.gs`) - não
precisa criar à mão na planilha.
- `recibo_ref_id` é o `parcela_dividida_grupo_id` quando o Recibo faz parte
  de um grupo (parcela dividida), senão o próprio `id` da linha
  (`chaveObservacaoRecibo_`) - mesma chave que já unia as parcelas de um
  processo dividido num card só, então todas elas compartilham a mesma
  thread de observações (comentário sobre o processo, não sobre uma parcela
  isolada).
- Qualquer usuário autenticado cria uma observação nova; só o próprio autor
  OU um Gerente/Administrador pode editar/excluir uma já existente
  (`podeGerenciarObservacaoRecibo_`) - o backend recalcula isso a cada
  leitura (`pode_editar`), então o botão de editar/excluir já nasce
  escondido pra quem não pode.
- O antigo campo `observacao` de `Recibos` **continua na planilha, intocado,
  só como histórico** - `montarLinhaRecibo_` parou de escrever nele (chave
  omitida, não mais `''`, pra nunca sobrescrever o texto antigo à toa) e
  `atualizarRecibo` tirou `observacao` da lista de campos editáveis. Não foi
  feita migração pro texto antigo virar uma "observação" com autor - ele só
  não aparece mais em lugar nenhum da tela.
- **Frontend (`js/recibos.js`):** o formulário de "Novo processo" ganhou
  "Observação inicial" (opcional) - vira a 1ª observação da thread logo
  depois do Recibo ser criado (só depois de existir um id pra vincular). O
  modal de "Editar Recibo" trocou o textarea único por uma lista de
  comentários (autor, data, "(editado)" se aplicável) + campo pra adicionar
  um novo - cada ação (criar/editar/excluir observação) chama o backend na
  hora, sem esperar o "Salvar" do formulário (mesmo padrão de "Redefinir
  senha" em `js/usuarios.js`). A listagem/cards de Recibos trocaram o texto
  cru por uma contagem ("💬 3") - a lista completa mora só no modal de
  edição, pra não pesar a leitura em lote (`observacoes_count`, calculado
  uma vez por página em `listarRecibos`/`listarRecibosPorGrupo`, cache de
  30s igual `todasOrdensBancariasComCache_`).
- **Passo manual:** nenhum na planilha (aba nasce sozinha). Só implantar o
  backend novo (`backend/Recibos.gs`, `backend/Code.gs`, `backend/Utils.gs`).

## Fase — Indicador "Total a pagar no ano" em Recibos (sessão 2026-09-01, pedido do usuário)
Ficou adiado desde a Fase 5 de Recibos (2026-07-12, decisão 9) por depender
de uma base de dados que só passou a existir na Fase seguinte (Valor do
C.G. + T.A. de Unidades) e nunca chegou a ser ligada a um indicador.
Definição fechada com o usuário nesta sessão:
```
Total a pagar no ano = (parcela mensal REGULAR de toda unidade ATIVA, soma × 12)
                        − Total pago no ano
```
- **"Regular"** já existia como conceito pronto (`parcelaMensalRegular_`,
  `backend/Unidades.gs`, sessão 2026-07-29) - exclui T.A.s marcados como
  "Não Regular"/sazonais (`tipo_pagamento === 'sazonal'`), já mostrado no
  card de Unidades como "Repasse Mensal Regular". Não foi preciso inventar
  campo novo nenhum.
- **× 12 sempre** (o usuário escolheu ano inteiro, não só os meses já
  decorridos) - representa o orçamento do ano inteiro, não um indicador de
  atraso.
- Novo helper `totalParcelaMensalRegularAtivas_()` (`backend/Unidades.gs`)
  soma isso pra toda unidade ativa. Chamado por
  `calcularIndicadoresRecibos_` (`backend/Recibos.gs`), que já calculava
  "Pendentes"/"Total pago no ano".
- **De propósito NÃO filtrado** pelos filtros da tela de Recibos (ao
  contrário dos outros 2 cards) - representa o compromisso orçamentário da
  gestão como um todo. Só o lado "já pago" (reaproveita `totalPagoAno`)
  continua respeitando os filtros ativos - então filtrar por Unidade faz o
  "a pagar" parecer maior que o real daquela unidade isolada (aceito, ver
  comentário em `calcularIndicadoresRecibos_`).
- Pode dar **negativo** (já pago mais que o esperado no ano) - mostrado
  assim mesmo, sem esconder ou zerar.
- Frontend: 3º card em `renderIndicadores` (`js/recibos.js`), mesmo padrão
  visual dos outros dois, com `title` explicando a conta no hover.

## Fase — App instalável (PWA leve, sessão 2026-09-01, pedido do usuário)
`manifest.json` + `sw.js` novos (raiz do repo), `index.html` referenciando os
dois. Só cuida de "Adicionar à tela inicial" no celular/desktop - SEM modo
offline de propósito (o app inteiro depende do Apps Script respondendo, não
existe "offline" que faça sentido aqui). `sw.js` é passthrough puro (não
cacheia nada) justamente pra não criar uma nova camada de staleness em cima
do cache HTTP normal do navegador - a mesma classe de bug real já vista
nesta sessão (usuário relatou o anel de carregamento preso em 0% por causa
de `js/app.js` desatualizado em cache do navegador, "O carregamento só fica
em 0%"). Ícone usa o `favicon.svg` já existente (SVG funciona bem como ícone
de instalação no Chrome/Android; `apple-touch-icon` do iOS Safari prefere
PNG - fica como limitação conhecida até existir um PNG quadrado pra
substituir).

## Fase — Seções de Ação (Ação/Subação/G.D.) por Unidade + exceções por Objeto (sessão 2026-09-03, pedido do usuário)
Trocou os 3 campos fixos "Ação"/"Subação"/"G.D." do card de Unidade (um
único valor cada) por uma lista repetível de **seções de ação** com título
configurável (ex.: "Pagamentos Regulares", "Investimento" - viram os 2
padrões automáticos ao criar uma unidade nova, mas o usuário pode
adicionar/renomear/remover seções livremente). Cada seção guarda seu
próprio Ação/Subação/G.D., e pode ter **exceções de Subação por Objeto**
(botão "Adicionar Exceção" ao lado do campo Subação, abre a lista de
Objetos já cadastrados) - 1 objeto por exceção, exceção troca só a
Subação (Ação e G.D. continuam os da seção).
- **Decisões fechadas com o usuário** (2 rodadas de pergunta): manter 1
  valor por SOF por vez (como hoje, não lista histórico); G.D. faz parte
  de cada seção (não é fixo por unidade); ao criar unidade nova, as 2
  seções padrão já entram prontas; unidade existente sem seção nenhuma
  fica de fora (não migra sozinha); exceção liga 1 objeto por exceção;
  exceção sobrescreve só a Subação.
- **Estrutura nova (2 níveis, apaga-e-recria)** - primeira estrutura
  aninhada em 2 níveis do app (Unidade → Seção de Ação → Exceção):
  - Abas novas `UnidadesAcoes` (id, unidade_id, titulo, acao, subacao, gd,
    criado_por, data_criacao) e `UnidadesAcaoExcecoes` (id,
    unidade_acao_id, objeto, subacao, criado_por, data_criacao) -
    nascem sozinhas (`getSheetAcoesUnidade_`/`getSheetExcecoesAcao_`).
  - Prefixos `UAC`/`UAE` em `PREFIXOS_ID` (`backend/Contadores.gs`)
    adicionados **antes** de escrever qualquer código que chamasse
    `proximosIds_` nelas - already 2ª vez que esse bug (prefixo faltando)
    tinha mordido nesta sessão (RecibosOrdensBancarias,
    RecibosObservacoes), evitado de propósito desta vez.
  - `substituirAcoesDaUnidade_` (`backend/Unidades.gs`) faz apaga-e-recria
    em 2 níveis: deleta exceções antes das seções (ordem por causa de FK),
    2 ciclos de lock no total (não 1 por item), e só regrava se mudou de
    fato (`acoesIguaisAsSalvas_`, mesmo padrão já usado pra T.A./Fontes/
    Ordens Bancárias) - compara JSON normalizado incluindo as exceções
    aninhadas.
  - Colunas antigas `acao`/`subacao`/`gd` da aba `Unidades` continuam
    existindo (não apagadas), só nunca mais escritas por
    `criarUnidade`/`atualizarUnidade` - dado velho fica só de arquivo.
- **Resolução de Ação/Subação/G.D. efetivos** -
  `resolverAcaoSubacaoGdDaUnidade_(unidade, tipo, objeto)`
  (`backend/Unidades.gs`, espelhado no frontend em
  `resolverAcaoSubacaoGd_`, `js/sof.js` - **manter os dois em sincronia
  exata** se mexer num, mexer no outro): acha a seção cujo `titulo` bate
  (case-insensitive) com o `tipo` recebido; se o `objeto` recebido bater
  com alguma exceção daquela seção, usa a Subação da exceção; senão usa a
  Subação da seção; sem seção correspondente, devolve tudo vazio.
- **Integração com SOF** (pedido feito no meio da implementação, depois
  de eu já ter perguntado sobre o resto): o campo "Tipo de SOF" existente
  (`sofTipoSof`, valores fixos `Emenda Parlamentar Federal/Estadual` /
  `Investimento` / `Pagamentos Regulares`) é o elo com o `titulo` da
  seção. Trocar o Tipo ou o Objeto no formulário de SOF agora recalcula
  Ação/Subação/G.D. na hora (`atualizarAcaoSubacaoGdPreenchidos_`,
  `js/sof.js`, plugado nos listeners de `sofTipoSof` e `sofObjeto`) via
  o resolver acima. Isso é só o preenchimento automático de baseline -
  `buscarTemplateSof_`/`aplicarTemplateSof_` (SOF anterior igual
  tipo+unidade) continua tendo prioridade quando existir template,
  disparando depois de forma assíncrona, sem mudança de comportamento aí.
  No backend, `aplicarSnapshotUnidadeSof_`/`recalcularDivergenciaSof_`
  (`backend/Sof.gs`) também passaram a usar o resolver pra
  acao/subacao/gd (os outros 4 campos diretos - oss/cnpj/contrato_gestao/
  classificacao_orcamentaria - continuam via cópia direta, agora isolados
  em `SOF_SNAPSHOT_FIELDS_DIRETOS_`).
- **Passo manual obrigatório:** rodar `migrarAcoesUnidadesExistentes()`
  uma vez pelo editor do Apps Script (selecionar a função e dar "Executar")
  depois de implantado - cria uma seção "Pagamentos Regulares" pra cada
  unidade que já tinha acao/subacao/gd antigos e ainda não tem seção
  nenhuma. Idempotente (roda de novo sem duplicar), mesmo padrão de
  `bootstrapPrimeiroAdministrador`/`backfillContratoCeoUnidades`. Loga no
  editor a lista de unidades migradas/já tinha seção/sem dado antigo.
- **Bug achado e corrigido na revisão própria (antes de qualquer teste):**
  a regra CSS `.linha-acao .linha-fonte-remover` (posicionamento do botão
  de remover seção) também batia sem querer no botão de remover exceção
  (ambos descendem de `.linha-acao`, já que a exceção é aninhada dentro
  da seção). Corrigido restringindo pra
  `.linha-acao-cabecalho .linha-fonte-remover`, que não é ancestral dos
  botões de exceção - seletores agora mutuamente exclusivos, sem depender
  de ordem no CSS.

## Fase — Importação real de Ação/Subação por Unidade (sessão 2026-09-03, pedido do usuário)
O usuário mandou a tabela real de códigos (3 planilhas: "14 C.G UPA", "34
C.G HOSPITAIS", "8 C.G UPAEs") pra popular de vez as Seções de Ação recém-
criadas ([[Seções de Ação]] acima), em vez de depender só da migração
automática do dado antigo (`migrarAcoesUnidadesExistentes`).
- Nova função `importarSecoesAcaoReal2026_09()` (`backend/Unidades.gs`,
  fim do arquivo, rodar 1x manualmente no editor do Apps Script) - tabela
  hardcoded (`IMPORT_SECOES_ACAO_REAL_2026_09_`) com Custeio=seção
  "Pagamentos Regulares" (Ação 4610), Investimento=seção "Investimento"
  (Ação 4553), G.D. fixo `3.3.50` em ambas (não vinha na tabela recebida -
  decisão do usuário). Casa unidade por nome com o mesmo normalizador
  (acento/caixa/espaço-insensível) de `backfillContratoCeoUnidades`.
- Exceções por Objeto: "Sazonalidade" (código `+3926/0000` ou `+4799/0000`
  na coluna Investimento de várias UPAs/Hospitais) e "TEA"/"BERA"/"Ostomia"
  (UPAEs, coluna Custeio) - `garantirOpcaoObjeto_` cria essas 4 opções na
  lista OBJETO se ainda não existirem (senão o analista não conseguiria
  nem selecionar esse Objeto na tela de SOF pra a exceção valer).
- Só substitui as seções tituladas exatamente "Pagamentos Regulares"/
  "Investimento" de cada unidade - preserva qualquer outra seção que já
  exista (idempotente, seguro rodar de novo).
- **Casos deixados de fora de propósito** (pedido do usuário: "pular por
  enquanto" - célula ambígua/com nota na tabela original, não dava pra
  importar sem adivinhar): UPA Imbiribeira, UPA São Lourenço, Hospital Dom
  Malan, Hospital Silvio Magalhães, Hospital Mestre Vitalino (todos com 2
  códigos ou nota de rodapé não fornecida na coluna Investimento),
  Hospital Regional Emilia Câmara (célula ambígua), UPAE Grande Recife
  (código de Investimento já cancelado, "Operação de Crédito, cancelada").
  Ficam com a seção Investimento intocada - preencher à mão pelo card da
  unidade quando o usuário decidir o valor certo.
- Nomes de Hospital na tabela recebida vieram "informais" (ex. "Hospital
  Fernando Bezerra") - usada a grafia real já cadastrada (conferida contra
  `MAPA_CONTRATO_CEO_`, `backfillContratoCeoUnidades`), ex. "Hospital
  Regional Fernando Bezerra". Nome que não bater com nenhuma unidade
  cadastrada aparece em "NÃO encontradas" no log, sem travar o resto da
  importação.

## Documento da SOF reestruturado conforme o modelo do SEI (sessão 2026-11-06, publicado, aguardando teste real no SEI)

O usuário enviou telas do modelo "SES - SOF" do SEI e do documento que o app estava gerando. `montarDocumentoSeiHtml_` (`js/sof.js`) e `prepararHtmlParaEditor_` (`js/sei-bridge.js`) foram ajustados para seguir o modelo:

- **Entrou:** data à direita ("Em, 06 de novembro de 2026", a partir de `sei_data`), `@nome_destinatario@`, quadro do PCA/DFD (centralizado, em Times e negrito como no modelo; os campos já existiam no formulário, mas não saíam no documento), "CEO E-fisco" em Licitações, e `@nome_interessado@`/`@cargo_interessado@` ao final.
- **Saiu do documento:** quadros de Assinatura da Nota de Empenho e de Liquidação, linha TOTAL do cronograma, "Contrato CEO" solto após Grupo de despesa e a sigla "SOF" antes do número no título. Os campos de assinatura continuam no formulário e na planilha, mas não são mais impressos.
- **Mudou:** tabela do pleito com as células mescladas do modelo; cronograma com mínimo de 3 linhas e manutenção sempre visível com mínimo de 10 linhas e "R$" nas vazias; rótulos NOME/CARGO/SETOR em negrito.
- **Medidas:** texto 12pt, título/data 11pt, tabelas 11pt com 900px de largura. Calculado medindo Calibri no navegador contra as telas enviadas, que estavam em 90% de zoom. O cronograma pode passar de 900px quando há valores muito altos.
- **Variáveis `@...@`:** mantidas literais como aparecem no modelo. Falta confirmar no SEI real se elas são resolvidas ou se ficam como texto no documento salvo.

**Testado:** HTML gerado com o código real, passando por `prepararHtmlParaEditor_` e `sanitizarHtmlDocumento_`, em SOF vazia e preenchida. **Não testado:** envio real ao SEI (CKEditor pode alterar parte dos estilos).

## NE do Recibo só por seleção, filtrada pelo Objeto (sessão 2026-11-06, frontend publicado, backend implantado na versão 109)

Pedido do usuário: no formulário de Recibo (novo e edição) a NE não é mais digitada; só se escolhe uma NE já existente do objeto do recibo. Substitui a decisão de 2026-07-29 ("continua aceitando texto livre").

- **Relação usada:** cada linha de fonte da SOF tem seu Objeto, e a NE guarda o Objeto da linha a que foi associada. A lista é `listarNotasEmpenhoPorUnidade` (NEs originais da unidade, sem SOF excluída) filtrada por `objeto`, ignorando caixa e espaços. Reforço usa o número da original, então não entra separado.
- **`js/recibos.js`:** `<input>` + `<datalist>` viraram `<select>` nativo, controlado por `criarSeletorNe_`. Sem unidade, carregando, sem objeto, objeto sem NE ou falha de carga: campo desabilitado com mensagem. Trocar o objeto refaz a lista e limpa a NE que não pertence a ele, com aviso. Escolher a NE preenche a Fonte. Saiu `ligarAutopreenchimentoNe_`, porque o caminho agora é Objeto → NE. O autopreenchimento do formulário novo só aceita a NE do histórico ou da SOF se ela estiver na lista do objeto.
- **NE antiga na edição:** NE salva fora da lista aparece como opção "(NE atual, fora da lista)" e é mantida enquanto o objeto não mudar, com aviso. Trocar o objeto a remove; voltar ao objeto salvo a restaura. Decisão: bloquear impediria editar qualquer outro campo de recibo histórico.
- **Sem NE continua permitido** (rascunho e recibos gerados da meta). Consequência: anexar LE/OB exige NE selecionada, então objeto sem NE cadastrada não aceita anexo até a NE existir.
- **Ajustes necessários no caminho:** Objeto fora da lista global agora aparece no select da edição (antes abria vazio e era apagado ao salvar); trocar a unidade limpa também o texto visível do Objeto; resposta atrasada de outra unidade é descartada.
- **`backend/Recibos.gs` (implantado via clasp, versão 109; para voltar, reimplantar a 108):** `erroNeDoRecibo_` e `erroNeNaEdicaoRecibo_`, chamadas em `criarRecibo`, `criarGrupoParcelaDivididaRecibo`, `atualizarRecibo` e `atualizarParcelasDivididasRecibo`. Troca de status na listagem não é afetada. Só `Recibos.gs` mudou; nada de `Code.gs` ou planilha.

**Testado:** app real em localhost com `Api.chamar` simulada e `fetch` ao Apps Script bloqueado: criar, editar, trocar objeto, objeto sem NE, NE antiga (manter, trocar, remover), NE injetada no DOM recusada, corrida entre unidades, falha de carga, parcela dividida, anexo. `Recibos.gs` real executado no navegador com planilha simulada: casos inválidos recusados antes de qualquer escrita, válidos chegando à escrita. **Não testado:** Apps Script real e dados reais. Não foi medido quantas NEs antigas têm `objeto` vazio na planilha; essas nunca aparecem na lista até serem corrigidas. **Follow-up conhecido, não alterado:** LE/OB validada por OCR contra uma NE continua no formulário se a NE mudar depois.

## NE concluída e NEs que sumiam da tela de Notas de Empenho (sessão 2026-11-08, frontend publicado, backend implantado na versão 110)

> **Nota de 2026-11-09:** esta seção veio de uma sessão na nuvem (branch `claude/elegant-thompson-f0n8xo`) que propôs uma versão própria de `NotasEmpenho.gs`/`Dashboard.gs`. O que foi implantado na versão 110 é outra implementação, do commit `d84d795` do backend, e só mexe em `NotasEmpenho.gs`:
> - `concluida = neConcluida_(total solicitado, falta atender, saldo)`: total solicitado > 0, falta atender <= 0,005 e saldo <= 0,005.
> - `alerta` (`saldoAbaixoDaParcela_`) passa a exigir **falta atender > 0**. Por isso o caso "tudo atendido, saldo > 0 mas menor que a parcela" **não** tem mais alerta, ao contrário do que diz o último item abaixo.
> - `grupoNeComSaldoBaixo_` recalcula pela mesma regra (com `falta_atendido`), sem ler o `alerta` do grupo. `Dashboard.gs` não mudou.
> - A correção da causa (2) (linhas de SOF excluído saem antes de agrupar, `sof_id` do grupo vem da linha original) é a mesma.
>
> Os itens abaixo descrevem a proposta da sessão na nuvem, mantidos como registro do diagnóstico.

Relato do usuário (UPA Barra de Jangada): (1) a NE da SOF de janeiro (2026NE000759), com o solicitado todo atendido e todo liquidado, aparecia como "Saldo abaixo da parcela" com saldo R$ 0,00; (2) as NEs 2026NE000430/431, lançadas na SOF de fevereiro a dezembro, aparecem dentro da SOF mas não na tela de Notas de Empenho.

- **Causa (2):** `montarGruposNotasEmpenho_` agrupa por `numero_ne` e só depois descarta o grupo cujo SOF está excluído, usando o `sof_id` da **primeira** linha encontrada. Excluir um SOF não exclui as NEs dele. Se o mesmo número já tinha sido lançado num SOF depois excluído, essa linha antiga vinha primeiro e o card inteiro sumia, levando junto a NE nova do SOF ativo. Hipótese reproduzida com dados simulados; não conferida na planilha real. **Correção:** linhas de SOF excluído/inexistente saem antes do agrupamento, e o `sof_id` do grupo passa a vir da linha original.
- **Causa (1) e regra nova:** `concluida = total solicitado > 0 && falta ser atendido <= 0 && saldo atual = 0` (tolerância de 0,005; saldo negativo não conta). NE concluída nunca dispara `alerta`. `grupoNeComSaldoBaixo_` passa a devolver o `alerta` já calculado, para filtro, relatório e Dashboard não divergirem. No Dashboard, NE concluída não conta como "sem saldo".
- **`js/notas-empenho.js`:** selo verde "Concluída" no topo do card (só aparece com o backend novo).
- Caso não coberto, de propósito: tudo atendido, saldo > 0 mas menor que a parcela continua com alerta.

**Testado:** `NotasEmpenho.gs` real em Node com abas simuladas: código antigo reproduz os dois sintomas; código novo mostra as duas NEs e marca a 759 como concluída, sem alerta. **Não testado:** Apps Script real e planilha real.

## Recibo excluído deixa de contar como liquidado na NE (sessão 2026-11-09, backend `c151f52`, implantado via clasp na versão 111; para voltar, reimplantar a 110)

Achado ao revisar a regra de NE concluída: `valorLiquidadoAgrupadoPorNe_` (`NotasEmpenho.gs`) somava `valor_liquidado` de todos os Recibos, inclusive os excluídos (exclusão lógica, `excluido = true`). Um Recibo liquidado e depois excluído continuava abatendo o saldo da NE, podendo marcá-la como "Concluída" ou mostrar saldo menor que o real. As outras leituras de Recibos (Dashboard, relatórios, listagem, `recibosPorNeECompetencia_`) já filtravam.

- **Correção:** a função ignora Recibos com `excluido`. Só `NotasEmpenho.gs` mudou; nada de frontend ou planilha.
- **Efeito esperado em produção:** NEs com Recibo liquidado excluído passam a mostrar saldo maior, podem perder o selo "Concluída" e podem voltar a ter alerta.

**Testado:** `valorLiquidadoAgrupadoPorNe_` real em Node com Recibos simulados (`excluido` como `true`, `'TRUE'`, `false` e vazio). Após implantar: código do Apps Script conferido igual ao local e URL de produção respondendo (HTTP 200). **Não testado:** tela de Notas de Empenho com dados reais. Não foi medido quantos Recibos excluídos têm `valor_liquidado` preenchido na planilha.

## Dashboard: NE concluída fora do "sem saldo", painel "Saldo das Notas de Empenho" e colunas Liquidado/Pago em "Processos do mês" (sessão 2026-11-09, backend `98dc1c4` + `23c5bb8` implantado via clasp na versão 112, para voltar reimplantar a 111; frontend publicado)

Pedidos do usuário: (1) a NE concluída aparecia como "1 sem saldo" no card "Saldo disponível em Notas de Empenho"; (2) clicar nesse card deve abrir uma seção como as outras, com o saldo de todas as NEs, Unidade e Objeto, e clicar numa NE deve levar à aba Notas de Empenho.

- **`backend/Dashboard.gs` (`dashboardNotasEmpenho_`):** "sem saldo" agora é `valor_atual <= 0` **e não concluída**. NE esgotada que ainda tem falta a atender continua contando. O valor do saldo disponível não muda.
- **`js/dashboard.js`:** o card deixou de navegar e passou a expandir/recolher o painel "Saldo das Notas de Empenho" (chevron, mesmo padrão dos cards "Saldo abaixo da parcela" e "Processos do mês"). Usa os `notas_empenho.itens` que já vinham no `obterDashboard`, sem chamada nova. Colunas: Nº da NE, Unidade, Objeto, Fonte, Saldo e Situação, com linha de total. Filtros em memória: Unidade, Objeto e Situação (Concluída > Sem saldo > Abaixo da parcela > Com saldo, nessa prioridade). Ordem: Unidade, Objeto, Nº da NE.
- **`js/notas-empenho.js`:** `render(opts)` aceita `busca`, que preenche a busca livre. Clicar numa linha do painel abre a tela já buscando pelo número da NE. Com `busca` ou `saldoBaixo` a tela volta para a página 1 (antes `paginaAtual` sobrevivia entre visitas e podia mostrar uma página vazia).
- **`css/style.css`:** cor do saldo negativo/abaixo e borda da linha de total.

**Colunas Liquidado e Pago no painel "Processos do mês" (mesma sessão, mesma versão 112):**
- **`backend/Dashboard.gs` (`dashboardMetasProcessos_`):** cada item ganhou `liquidado` e `pago`, contados entre os Recibos já recebidos (com Nº Processo). Liquidado: `valor_liquidado > 0` (vem da LE). Pago: `valor_pago > 0` (vem da OB) ou status `PAGO`.
- **`js/dashboard.js`:** colunas Liquidado e Pago entre Recebido e Falta, com legenda acima da tabela. Check verde: todos os processos da linha passaram pela etapa. Relógio amarelo: processo recebido, aguardando a etapa. X vermelho: nenhum processo recebido. A base é o maior entre esperado e recebido; com mais de um processo aparece a contagem (ex.: 1/2), e o `title` explica. Com o backend antigo (sem os campos) a célula mostra "-".
- **Testado:** `dashboardMetasProcessos_` real em Node (recibo sem Nº Processo não conta; status " pago " conta como pago) e a tabela no app em localhost com dados simulados.
- **Ajuste seguinte (mesma sessão, só frontend):** a pedido do usuário saíram as colunas Esperado e Falta. A tabela ficou Unidade, Objeto, Liquidado, Pago e Recebido (no lugar da antiga Falta). Recebido mostra "Sim" (selo verde) quando chegou tudo o que a meta espera e "Não" (selo vermelho) quando não chegou nada. Meta com mais de um processo e só parte recebida mostra "1 de 2" em amarelo, para não esconder o que falta. A opção "Falta" do filtro Estado virou "Não recebido". Testado no app em localhost com dados simulados.
- **Títulos e recolher em todas as seções do Dashboard (mesma sessão, só frontend):** a pedido do usuário, toda seção tem título e um botão de chevron no cabeçalho (`cabecalhoPainelHtml_`, `js/dashboard.js`). "Processos do mês" ganhou o título "Processos do mês <competência>", e o link "Gerenciar metas →" subiu para o cabeçalho. Nas seções abertas por card (Saldo abaixo da parcela, Saldo das NEs, Processos do mês) o botão fecha a seção e acerta o chevron do card. Em Gráficos e Prazos contratuais ele recolhe até o título; a escolha fica no `localStorage` do navegador (`gaocg_dash_paineis_recolhidos`) e sobrevive ao "Atualizar" e a novas visitas. Testado no app em localhost com dados simulados.
- **Parcela Contratual e ordem das colunas (mesma sessão, só frontend):** o painel "Saldo das Notas de Empenho" ganhou a coluna "Parcela Contratual" entre Fonte e Saldo, com o `parcela_mensal_referencia` de cada NE (soma da parcela mensal das fontes do SOF com a mesma fonte e objeto, o mesmo valor do "Valor da Parcela" do painel de saldo abaixo da parcela; "-" quando não há). Em "Processos do mês" a coluna Recebido passou para antes de Liquidado (Unidade, Objeto, Recebido, Liquidado, Pago). Testado no app em localhost com dados simulados.

**Testado:** `dashboardNotasEmpenho_` real em Node com grupos simulados (concluída fora, esgotadas não concluídas dentro). App real em localhost com `fetch` simulado e chamadas ao Apps Script bloqueadas: abrir/fechar o painel, os 4 filtros de Situação, filtro de Unidade com total, limpar filtro, nome com HTML escapado, clique na NE abrindo Notas de Empenho com a busca e página 1, largura de celular (tabela rola dentro do painel, sem rolagem lateral da página). **Não testado:** dados reais.

## Sugestões: contraste no modo escuro e fotos anexadas (sessão 2026-11-09, backend `b2bf93f` implantado via clasp na versão 113, para voltar reimplantar a 112; frontend publicado)

Pedidos do usuário: (1) no modo escuro o texto das sugestões ficava ilegível; (2) poder anexar fotos ao fazer uma sugestão.

- **Contraste (`css/tema-novo.css`):** `.cartao-sugestao` usava `background: var(--branco)`, que não muda no modo escuro, enquanto o texto segue o tema. Agora usa `--superficie-2` com borda, como os outros cards. Conferido nos modos claro e escuro. Não foi feita uma varredura dos outros `var(--branco)` do `style.css`.
- **Backend (`Sugestoes.gs`, `Utils.gs`, `Code.gs`):**
  - `criarSugestao` aceita `fotos: [{nome, tipo, base64}]`: até 5, JPG/PNG/WEBP/GIF, até 4 MB cada. Valida tudo antes de gravar; as fotos sobem antes da linha e, se alguma falhar, as já criadas vão para a lixeira e nada é gravado.
  - Pasta do Drive "GAOCG App - Fotos das Sugestões", criada na primeira foto ao lado da planilha; o id fica na Script Property `PASTA_FOTOS_SUGESTOES_ID`.
  - Coluna `fotos` (JSON `[{id, nome, tipo}]`) acrescentada sozinha ao cabeçalho da aba Sugestoes na primeira sugestão com foto. `HEADERS.Sugestoes` também ganhou a coluna.
  - Ação nova `obterFotoSugestao(id, foto_id)`: devolve a imagem em base64 só para o autor e o Administrador, e só se a foto pertence àquela sugestão. O frontend nunca recebe link do Drive.
  - O e-mail de nova sugestão leva as fotos anexadas.
  - `listarSugestoes`, `atualizarSugestao` e `responderSugestao` devolvem `fotos` como lista `[{id, nome}]`.
- **Frontend (`js/sugestoes.js`, `css/style.css`, `js/api.js`):** botão "Anexar fotos" e colar print (Ctrl+V) no formulário, com miniaturas e remoção. Imagens maiores que 1600 px (ou PNG acima de 1,5 MB) são reduzidas e convertidas em JPEG no navegador; PNG pequeno e GIF vão como estão. O card mostra "N fotos anexadas"; o detalhe carrega as miniaturas, e clicar abre a foto em tamanho real em outra aba. `obterFotoSugestao` entrou na lista de ações repetíveis.
- **Ordem de publicação:** implantar o backend antes do frontend. Com o backend antigo, `criarSugestao` ignoraria as fotos sem avisar.
- **Fora do escopo:** anexar ou remover fotos ao editar uma sugestão já enviada.

**Testado:** `Sugestoes.gs` real em Node com Drive, planilha e e-mail simulados (20 casos: com e sem foto, cabeçalho antigo, pasta reaproveitada, limites, PDF, base64 inválido, falha no meio do upload, permissões de autor/Administrador/outro, foto de outra sugestão). App em localhost com `fetch` simulado: indicador no card, miniaturas no detalhe (incluindo foto que falha), anexar pelo botão, PDF recusado, colar print, remover, limite de 5, conteúdo enviado (JPEG 3000x2000 reduzido para 1600x1067; PNG mantido). **Não testado:** Drive, e-mail e Apps Script reais.

## Recibos: "Total pago no período" (sessão 2026-11-09, backend `fba1471` implantado via clasp na versão 114, para voltar reimplantar a 113; frontend publicado)

Pedido do usuário: trocar o rótulo "Total pago no ano" por "Total pago no período", para refletir o período selecionado.

- **Achado:** só trocar o texto deixaria o card errado. `calcularIndicadoresRecibos_` (`Recibos.gs`) somava `valor_pago` apenas das linhas filtradas com competência do ano atual; filtrando dez.25 ou o ano de 2025, o card mostrava R$ 0,00.
- **Backend:** novo `total_pago_periodo` = soma de `valor_pago` de todas as linhas filtradas (competência, ano e demais filtros da tela). `total_pago_ano` continua igual, porque é a base do "Total a pagar no ano".
- **Frontend (`js/recibos.js`):** card "Total pago no período" com o período abaixo do rótulo (as competências filtradas, "N competências", "Ano 2025" ou "Todas as competências"). Com o backend antigo (sem o campo) o card continua "Total pago no ano".
- **Publicação:** backend implantado antes do frontend.

**Testado:** `filtrarLinhasRecibos_` + `calcularIndicadoresRecibos_` reais em Node (dez.25: antes 0, agora o pago; nov.26: igual ao anual; sem filtro: soma tudo; "Total a pagar" inalterado) e o card na tela de Recibos em localhost com dados simulados. **Não testado:** dados reais.

**Ajustes seguintes (mesma sessão, só frontend):**
- **Sem filtro de período o padrão é o ano atual** (pedido do usuário): sem Competência nem Ano filtrados, o card "Total pago no período" mostra `total_pago_ano` (competências do ano corrente, com os demais filtros), com a legenda "Ano 2026 (sem filtro de período)". Com filtro de período continua `total_pago_periodo`.
- **Card "Atendido do total solicitado" em 0% com valor atendido:** o código estava certo; o total solicitado de R$ 18,5 bi vinha de uma SOF de teste ainda ativa na planilha: **SOF-000023** (Nº 36/2026, unidade HTRI, contrato "TESTE/2026", CNPJ 11.222.333/0001-81), com uma fonte "PÉ DIABÉTICO" de total solicitado R$ 18.478.488.634 (parcela R$ 6.521.819.518). As cópias SOF-000024 e SOF-000028 já estavam excluídas. Sem ela, o solicitado das SOFs ativas fica em ~R$ 17,3 mi e o card mostraria ~75%. **Pendente com o usuário:** excluir a SOF-000023 pelo app (não mexi em dados de produção). No código, o card passa a mostrar "<1%" quando há valor atendido e a porcentagem arredonda para 0.
- **Testado:** no app em localhost com dados simulados (atendido "<1%" com o dado de teste, 75% sem ele; card de Recibos com filtro do mês e sem filtro de período).

## Log de Auditoria: nome do usuário (sessão 2026-11-09, ⚠️ backend pendente de implantar, frontend pendente de publicar)

Pedido do usuário: mostrar o nome do usuário em vez do código na coluna Usuário.

- **Backend (`LogAuditoria.gs`):** `listarLogAuditoria` acrescenta `usuario_nome` aos itens da página, lido da aba Usuarios. Feito no backend porque `listarUsuarios` exige Gerente (Analista não pode chamar) e esconde o Administrador dos Gerentes. Observação: o Gerente passa a ver o nome do Administrador nas linhas dele; o perfil "(administrador)" já aparecia antes.
- **Frontend (`js/log-auditoria.js`):** mostra "Nome (perfil)", com o código no `title`. Id sem cadastro (ex.: `rotina_importacao_inicial`) ou backend antigo: mostra o código como antes.

**Testado:** `listarLogAuditoria` real em Node (Gerente vê nomes de todos, Analista só o próprio, id sem cadastro sem nome) e a tabela no app em localhost com dados simulados. **Não testado:** dados reais.

## Referências úteis
- Repositório: `https://github.com/AndersonG2021/APP-GAOCG.git`, branch `main`, publicado via GitHub Pages.
- Backend roda só no Apps Script; **sempre que um `.gs` mudar, colar manualmente, reimplantar (Implantar → Gerenciar implantações → editar → Nova versão) E atualizar a cópia correspondente em `/backend` neste repositório**, no mesmo commit.
- Frontend (`js/`, `css/`, `index.html`) só atualiza no site publicado depois de **commitado e enviado (`git push`) pro GitHub** - editar os arquivos locais não é suficiente (incidente real: sessão 2026-07-23, usuário testou o formulário novo de SOF e "não apareceu nada" porque o commit/push ainda não tinha sido feito, só o backend já estava colado/reimplantado). Depois do push, o GitHub Pages ainda pode levar até ~10 min pra refletir (`Cache-Control: max-age=600`) - hard refresh (Ctrl+Shift+R) ajuda a confirmar se já propagou.
- Padrão de trabalho: planejar cada fase (plan mode) → implementar frontend → passar trecho de backend pronto pro usuário colar → usuário testa → ajustar.
- `/backend` tem cópia de referência de `Auth.gs`, `Code.gs`, `Contadores.gs`, `Dashboard.gs`, `EdicoesEmAndamento.gs`, `ListasPersonalizadas.gs`, `LogAuditoria.gs`, `MetasProcessos.gs`, `NotasEmpenho.gs`, `Recibos.gs`, `Relatorios.gs`, `Sof.gs`, `Unidades.gs`, `Usuarios.gs`, `Utils.gs` — todos os `.gs` do backend agora estão cobertos (`MetasProcessos.gs` é novo, sessão 2026-08-24, ainda a ser colado pelo usuário; `Relatorios.gs` novo desde 2026-07-28; `Contadores.gs` coletado pela primeira vez em 2026-07-18). Sempre que precisar editar um `.gs`, conferir se a cópia local está atualizada antes (cópias antigas do histórico do git podem estar desatualizadas).
