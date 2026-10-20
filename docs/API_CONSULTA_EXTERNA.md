# API de consulta externa (GAOCG App)

Endpoints de **leitura** do backend (Google Apps Script), autenticados por uma **chave de API** própria - separada do login de usuário do app. Pensada para consumo por ferramentas externas (Power BI, Excel, outro sistema), não pelo próprio frontend do GAOCG.

URL base: a mesma do app - `https://script.google.com/macros/s/AKfycbzbLozyF4h0HLbCeJdWyj1skAmxgrUhjV17FvKzXKVqF9l3gIAnS6ufmvj-PvjAOv4ZTg/exec`

## Gerando uma chave (Administrador do Aplicativo)

Só o perfil Administrador pode gerar/listar/revogar chaves. Mais fácil pelo Console do navegador, logado no app (o módulo `Api` já fica global):

```js
Api.chamar('gerarChaveApi', { descricao: 'Power BI - relatório mensal' }).then(r => console.log(r));
```

A resposta traz o valor da chave **uma única vez** (`gaocg_...`) - guarde-o assim que aparecer, não tem como recuperar depois (só revogar e gerar outra). Na planilha fica guardado apenas o hash SHA-256 da chave mais os 4 últimos caracteres (para identificação visual), nunca o valor cru.

> ⚠️ **Chaves geradas antes de 29/09/2026 pararam de funcionar.** Até essa data a chave era guardada em texto puro na planilha; a correção de segurança que passou a guardar o hash invalidou as antigas. Se uma integração sua começou a receber "Chave de API ausente, inválida ou revogada." sem ninguém ter mexido nela, é isso: gere uma chave nova e revogue a antiga.

Listar chaves existentes (mostra os valores mascarados, só os 4 últimos caracteres):
```js
Api.chamar('listarChavesApi').then(r => console.log(r));
```

Revogar uma chave:
```js
Api.chamar('revogarChaveApi', { id: 'API-000001' }).then(r => console.log(r));
```

## Chamando a API

`GET` (mais simples) ou `POST` (`Content-Type: text/plain`, corpo JSON) com `action` + `chave`. Exemplo via `curl`:

```bash
curl "https://script.google.com/macros/s/AKfycbzbLozyF4h0HLbCeJdWyj1skAmxgrUhjV17FvKzXKVqF9l3gIAnS6ufmvj-PvjAOv4ZTg/exec?action=api_recibos&chave=SUA_CHAVE_AQUI&pageSize=100&competencia=2026-09"
```

Resposta sempre no formato `{"ok": true, "data": {...}}` ou `{"ok": false, "error": "..."}`.

> **Atenção ao redirect:** a URL `/exec` responde com um redirect HTTP para `script.googleusercontent.com`. Qualquer cliente precisa seguir redirects — no `curl` isso exige `-L`, senão você recebe o corpo vazio do redirect em vez do JSON. No Power BI / Excel isso é automático.

## Formato da resposta

Todos os quatro endpoints devolvem a mesma estrutura paginada dentro de `data`:

```json
{
  "ok": true,
  "data": {
    "items": [ /* os registros - campos de cada um na seção "Campos" abaixo */ ],
    "total": 137,
    "page": 1,
    "pageSize": 20,
    "facetas": { "oss": ["..."], "fonte": ["..."] }
  }
}
```

- `total` é a contagem **após os filtros**, não o total da base — use-o para paginar (`page` de 1 até `ceil(total / pageSize)`).
- `pageSize` sem valor explícito é **20**. Para puxar tudo de uma vez, mande um valor alto (ex.: `pageSize=100000`).
- `facetas` existe para a interface do app montar os filtros em cascata. **Consumidor externo pode ignorar.**
- `api_recibos` traz também `indicadores` (totais agregados da consulta), usado pelos cartões da tela de Recibos.

### Erros

Sempre HTTP 200 com `ok: false` — confira o campo `ok`, não o status HTTP.

| Situação | Resposta |
|---|---|
| Chave ausente, inválida ou revogada | `{"ok": false, "error": "Chave de API ausente, inválida ou revogada."}` |
| `action` não enviada | `{"ok": false, "error": "Parâmetro \"action\" ausente."}` |
| `action` desconhecida | `{"ok": false, "error": "Ação desconhecida: xxx"}` |
| Erro inesperado no servidor | `{"ok": false, "error": "Erro interno no servidor: ..."}` |

## Endpoints disponíveis

| `action` | Equivalente interno | Filtros aceitos (principais) |
|---|---|---|
| `api_recibos` | `listarRecibos` | `competencia`, `unidade_id`, `status`, `oss`, `fonte`, `tipo_unidade`, `dea`, `ano`, `busca`, `pageSize`, `page` |
| `api_sof` | `listarSof` | `unidade_id`, `andamento`, `tipo`, `objeto`, `oss`, `fonte`, `tipo_unidade`, `dea`, `ano`, `semNe`, `busca`, `pageSize`, `page` |
| `api_unidades` | `listarUnidades` | `unidade_id`, `tipo`, `oss`, `somenteAtivas`, `busca`, `pageSize`, `page` |
| `api_notasEmpenho` | `listarNotasEmpenho` | `unidade_id`, `competencia`, `objeto`, `oss`, `fonte`, `tipo_unidade`, `dea`, `ano`, `saldoBaixo`, `busca`, `pageSize`, `page` |

Cada endpoint reaproveita a mesma função que o frontend do app usa, então os campos são exatamente os mesmos que a tela correspondente exibe.

## Campos de cada `item`

Valores monetários vêm como **número** (não string formatada). Datas vêm como texto ISO (`2026-09-04T10:32:00`). Campos marcados com ⚙️ são **calculados na hora**, não existem como coluna na planilha.

### `api_unidades`

`id`, `nome`, `tipo`, `oss`, `cnpj`, `contrato_gestao`, `contrato_ceo`, `situacao_contrato`, `data_inicial_instrumento`, `data_final_instrumento`, `valor_contrato_gestao`, `valor_contrato_gestao_sus`, `classificacao_orcamentaria`, `ativo`, `criado_por`, `data_criacao`

- ⚙️ `tas` — lista dos Termos Aditivos: `{ objeto_ta, numero_ta, valor_ta, tipo_pagamento, data_vencimento }`
- ⚙️ `parcela_mensal_total` — repasse mensal somando tudo (C.G. + SUS + T.A.s)
- ⚙️ `parcela_mensal_regular` — só o que é recorrente (exclui T.A. marcado como sazonal/"Não Regular")
- ⚙️ `acoes` — Seções de Ação: `{ titulo, acao, subacao, gd, excecoes: [{ objeto, subacao }] }`

> Os campos soltos `acao`/`subacao`/`gd` ainda existem na planilha mas estão **obsoletos** — foram substituídos por `acoes`. Não use.

### `api_sof`

`id`, `unidade_id`, `tipo`, `sei`, `sof_numero`, `periodo_inicio`, `periodo_fim`, `andamento`, `dea`, `objeto`, `ta`, `observacao`, `ceo`, `contrato`, `completo`, `possui_ne`, `criado_por`, `data_criacao`, `data_ultima_alteracao_andamento`

- Campos `*_snapshot` (`oss_snapshot`, `cnpj_snapshot`, `contrato_snapshot`, `acao_snapshot`, `subacao_snapshot`, `gd_snapshot`, `classificacao_orcamentaria_snapshot`) — valores da Unidade **congelados no momento em que o SOF foi criado**. É isso que você quer para relatório histórico; o valor atual da Unidade pode ter mudado desde então.
- `divergente_da_unidade` — booleano: indica que algum snapshot acima já não bate com o cadastro atual da Unidade.
- ⚙️ `notas_empenho_numeros` — números das NEs emitidas para este SOF (lista vazia se `possui_ne` for falso).

### `api_notasEmpenho`

⚠️ **Este endpoint não devolve linhas da planilha — devolve NEs já agrupadas por número**, com os reforços consolidados na mesma entrada. Uma NE original com 3 reforços é **um** item, não quatro.

`numero_ne`, `sof_id`, `fonte`, `objeto`, `ano`

- Do SOF de origem: `sof_sei`, `sof_numero`, `sof_objeto`, `sof_unidade_id`, `sof_oss`, `sof_dea`, `sof_tipo_unidade`, `unidade_nome`
- ⚙️ Valores: `valor_bruto` (NE original), `valor_atual` (original + reforços), `valor_liquidado`, `total_solicitado`, `total_atendido`, `saldo_atual`, `falta_atendido`, `parcela_mensal_referencia`
- ⚙️ `alerta` — sinalização de saldo abaixo da parcela mensal
- ⚙️ `cronograma` — desembolso lido do documento: `{ mes, valor, ... }`
- ⚙️ `cronograma_solicitado` — meses pedidos pelo SOF: `{ mes, valor, atendido }`
- ⚙️ `linhas` / `reforcos_agrupados` — as NEs individuais que compõem o grupo
- ⚙️ `arquivos` — links dos anexos no Drive

### `api_recibos`

`id`, `unidade_id`, `objeto`, `contrato_gestao`, `parcela_contratual`, `fonte`, `nota_empenho`, `competencia`, `valor_liquidado`, `valor_pago`, `nota_liquidacao_numero`, `nota_liquidacao_url`, `ordem_bancaria`, `ordem_bancaria_arquivo_url`, `numero_processo`, `observacao`, `status`, `origem`, `tipo_unidade`, `completo`, `criado_por`, `data_criacao`

- `oss_snapshot`, `cnpj_snapshot`, `divergente_da_unidade` — mesma lógica de snapshot descrita em `api_sof`.
- `parcela_dividida_grupo_id`, `percentual_parcela_dividida` — parcela dividida entre fontes (Tesouro/SUS). Recibos com o mesmo `parcela_dividida_grupo_id` são partes da **mesma** parcela: ao somar valores, cuidado para não contar em duplicidade.
- `alerta_divergencia_valores` — booleano: `valor_pago` não bate com `valor_liquidado`.
- ⚙️ `ordens_bancarias` — lista: `{ numero_ob, valor, arquivo_url }` (uma parcela pode ter várias OBs).
- ⚙️ `observacoes_count` e ⚙️ `ultima_observacao` (`{ texto, autor_nome, data }`).

> Registros excluídos no app são exclusão lógica (coluna `excluido`) e **já saem filtrados** da API — você não precisa tratar isso.

## Consumindo no Power BI / Excel

Em **Obter Dados → Da Web**, cole a URL completa com `action`, `chave` e `pageSize` alto (a API não pagina sozinha para o cliente):

```
https://script.google.com/macros/s/AKfycbzbLozyF4h0HLbCeJdWyj1skAmxgrUhjV17FvKzXKVqF9l3gIAnS6ufmvj-PvjAOv4ZTg/exec?action=api_recibos&chave=SUA_CHAVE&pageSize=100000
```

O Power Query recebe o JSON inteiro; navegue até `data` → `items` e clique em **Para a tabela**. Os campos ⚙️ que são listas (`tas`, `acoes`, `ordens_bancarias`, `cronograma`) chegam como registros aninhados — expanda ou descarte conforme o relatório.

A chave fica salva dentro do arquivo do relatório. Trate esse arquivo como um arquivo com credencial: não publique em local aberto e, se precisar tirar o acesso de alguém, **revogue a chave** (`revogarChaveApi`) e gere outra — cada consumidor com a própria chave facilita isso.

## O que NÃO existe (de propósito)

Só leitura. Não há endpoint de escrita/criação/exclusão por chave de API - reduz a superfície de risco de expor dados a um consumidor externo. Se algum dia precisar de escrita externa, é uma decisão separada (endpoints próprios, mais guardados).

## Limites a considerar

Conta gratuita do Apps Script (a em uso): cota diária de chamadas e ~30 execuções simultâneas. Para uso interno/pontual (Power BI atualizando a cada X horas, por exemplo) isso não chega perto de ser um problema; só vira relevante com tráfego alto/contínuo.
