# Instalar o GAOCG Conecta neste computador

Guia rápido - não precisa ler mais nada além disto pra instalar. É a
extensão que deixa o app GAOCG enviar SOFs direto pra dentro de um processo
já aberto no SEI.

## Passo a passo

1. Copie esta pasta inteira (`gaocg-sei-bridge`) pra algum lugar fixo deste
   computador - por exemplo `Documentos\gaocg-sei-bridge`. **Não edite nada
   dentro dela**, principalmente o arquivo `manifest.json`.
2. Abra o Chrome ou Edge e vá em `chrome://extensions` (ou `edge://extensions`).
3. Ative **"Modo do desenvolvedor"** - fica um interruptor no canto superior
   direito da tela.
4. Clique em **"Carregar sem compactação"** (ou "Load unpacked") e escolha a
   pasta que você copiou no passo 1 (a que tem o arquivo `manifest.json`
   dentro).
5. A extensão aparece na lista com o nome "GAOCG Conecta". Confira que o
   **ID** mostrado no card é:
   ```
   gmhefdeokoolgcpfohhkomgljndffnpi
   ```
   Se for esse, está tudo certo - **não precisa copiar ID nenhum, nem mexer em
   nenhuma configuração**. (Se vier um ID diferente desse, algo foi alterado
   no `manifest.json` ao copiar a pasta - volte ao passo 1 com uma cópia
   limpa.)

## Importante: deixe "Modo do desenvolvedor" sempre ligado

Se esse interruptor for desligado depois, o Chrome desativa a extensão
automaticamente (é assim que funciona qualquer extensão "carregada sem
compactação", fora da Chrome Web Store). Não precisa fazer mais nada além de
deixar ligado.

## Como testar

1. Abra o SEI, faça login, e deixe aberta a aba com o processo que vai
   receber o documento.
2. Abra o GAOCG App: `https://andersong2021.github.io/APP-GAOCG/`
3. Abra uma SOF que já tenha o Nº do Processo preenchido e clique em
   **"Salvar e enviar ao SEI"**.
4. A aba do SEI deve vir pra frente e o formulário de "Incluir Documento"
   começar a se preencher sozinho.

## Se der erro "Could not establish connection..."

Confirma de novo o ID no `chrome://extensions` (passo 5 acima). Se ainda
assim persistir, veja o `README.md` (na mesma pasta) - seção "Configuração
por ambiente" - ou fale com quem mantém o GAOCG App.
