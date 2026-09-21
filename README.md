# Gerador de Etiquetas com QR Code

Aplicação web estática para montar folhas de etiquetas a partir de dados digitados ou importados de um PDF. Cada etiqueta usa o modelo visual em `assets/Template.svg` e pode apresentar um QR Code extraído do documento de origem.

## Como abrir

Não há instalação, servidor ou banco de dados. Abra o arquivo `index.html` em um navegador atualizado.

Para importar PDFs e ler QR Codes, é recomendável usar Chrome ou Edge com acesso à internet.

## Como gerar etiquetas

1. Em **Folha de impressão**, escolha o formato do papel e ajuste as margens horizontal e vertical do grid.
2. Em **Dados das etiquetas**, informe um item por linha no formato abaixo:

   ```text
   número curto; número longo; conteúdo do QR (opcional)
   ```

   Exemplo:

   ```text
   3;7191492063323003
   20;7191492063323020;https://exemplo.com/ativo/20
   100;7191492063323100
   ```

3. Clique em **Gerar etiquetas** para atualizar a pré-visualização.
4. Revise o resultado e clique em **Imprimir / salvar em PDF**.

Os campos podem ser separados por ponto e vírgula (`;`), vírgula (`,`) ou tabulação.

## Regras de validação e ordenação

Uma etiqueta só é gerada quando os dois primeiros campos contêm somente algarismos. Linhas vazias, incompletas ou com letras/símbolos nesses campos são ignoradas e exibidas no aviso de erros.

As etiquetas válidas são organizadas em ordem numérica crescente pelo número curto. Se houver números curtos iguais, o número longo é usado como critério de desempate. Identificadores extensos são preservados sem perda de precisão.

## Importar dados de PDF

1. Selecione o arquivo em **Importar do PDF**.
2. Clique em **Extrair do PDF e preencher**.
3. O sistema procura os campos `Nome do equipamento` e `Identificador`.
4. Quando encontrados, os dados são preenchidos no campo de etiquetas e os QR Codes visíveis no PDF são associados às respectivas etiquetas.
5. Gere e confira a pré-visualização antes de imprimir.

A extração funciona melhor em PDFs que possuem texto selecionável e usam esses rótulos. PDFs digitalizados como imagem, protegidos ou com layout muito diferente podem não ser reconhecidos. Nesses casos, informe os dados manualmente.

## Configuração da folha

- **A4, Ofício, Carta e A3:** tamanhos predefinidos.
- **Personalizado:** permite informar largura e altura em milímetros.
- **Margens:** definem a distância entre a borda da folha e o início do grid.
- **Grade visual:** mostra as linhas de corte na pré-visualização.

O tamanho da etiqueta é fixo em **28 × 40 mm**. A quantidade por folha é calculada automaticamente conforme a folha e as margens selecionadas.

## Imprimir ou salvar em PDF

O sistema envia somente as páginas de etiquetas para a impressão. O tamanho da página e a margem são definidos automaticamente para corresponder à pré-visualização.

Na janela de impressão do navegador:

- use escala **100%**;
- mantenha as margens como **Nenhuma** quando essa opção estiver disponível;
- desative cabeçalhos e rodapés, se o navegador os oferecer;
- confirme que o tamanho do papel selecionado corresponde ao configurado na aplicação.

## Estrutura do projeto

```text
index.html                 Interface principal
styles/style.css           Estilos da aplicação e regras de impressão
scripts/app.js             Eventos da interface e fluxo de importação
scripts/data-parser.js     Validação, filtro e ordenação dos dados
scripts/label-renderer.js  Montagem das etiquetas e páginas de impressão
scripts/pdf-importer.js    Leitura de texto e QR Codes de PDFs
assets/Template.svg        Arte-base da etiqueta
```

## Testes

Os testes de regressão disponíveis são:

```text
test-pdf-importer.mjs
test-data-parser.mjs
```

Com o Node.js instalado, execute:

```bash
node test-pdf-importer.mjs
node test-data-parser.mjs
```

## Limitações conhecidas

- Os dados não são salvos automaticamente ao fechar ou recarregar a página.
- A importação depende da estrutura do PDF e pode falhar em arquivos escaneados.
- A leitura do QR Code depende de ele estar visível e nítido no PDF original.
