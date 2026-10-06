# Fluxograma GAOCG

Modelagem dos processos da GAOCG exportada pelo Bizagi Modeler, exibida na aba
"Fluxograma GAOCG" do app (`js/fluxograma.js`).

Só estas partes da exportação são usadas:

- `files/diagrams/*.svg`: o desenho de cada diagrama;
- `libs/js/json/configuration.json.js`: o modelo (processos, elementos,
  descrições e qual subprocesso cada bloco chama).

## Como atualizar

1. No Bizagi: Publicar > Web, gerando a pasta exportada.
2. Apague `files/` daqui e copie a pasta `files/` da exportação no lugar.
3. Substitua `libs/js/json/configuration.json.js` pelo da exportação.
4. Faça o commit/push normalmente.

Não precisa mexer no código: processos, subprocessos e vínculos são lidos do
modelo. O resto da exportação (`index.html`, `libs/js/app`, `libs/css`, imagens)
é o visualizador do próprio Bizagi e não é usado.
