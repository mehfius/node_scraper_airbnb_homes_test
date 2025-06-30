const fs = require('fs').promises;
const path = require('path'); // Adicionado o módulo 'path'
const cheerio = require('cheerio');

// Define códigos de cores ANSI para uma saída de console mais legível.
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  fg: {
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    blue: "\x1b[34m"
  }
};

/**
 * Traça o caminho de um nó inicial até um seletor pai, retornando os índices de cada nível.
 * @param {cheerio.Cheerio} startNode - O elemento cheerio inicial.
 * @param {string} stopSelector - O seletor do elemento pai onde a travessia deve parar.
 * @returns {{path: number[] | null, root: cheerio.Cheerio | null}} - Um objeto contendo o caminho como um array de índices e o elemento raiz encontrado.
 */
function tracePath(startNode, stopSelector) {
  const path = [];
  let currentNode = startNode;

  while (currentNode.length && !currentNode.is(stopSelector)) {
    const parent = currentNode.parent();
    if (!parent.length) {
      return { path: null, root: null };
    }
    const index = parent.children().index(currentNode);
    path.unshift(index);
    currentNode = parent;
  }

  if (!currentNode.is(stopSelector)) {
      return { path: null, root: null };
  }
  
  return { path, root: currentNode };
}

/**
 * Processa um arquivo HTML para encontrar elementos específicos e gerar seus seletores de acesso.
 */
async function processHtmlFile() {
  const outputLog = []; // Array para armazenar os resultados detalhados
  const outputFileName = 'output_paths.log'; // Nome do arquivo de saída

  try {
    // --- Variáveis de configuração para facilitar a manutenção ---
    const searchItems = [
      { name: "Descrição da Casa", text: "Linda Casa 7 Em Porto Seguro C/4 quartos e Piscina" },
      { name: "Preço", text: "R$2.092" }
    ];
    const rootSelector = 'div[itemprop="itemListElement"]';
    // -----------------------------------------------------------

    const htmlContent = await fs.readFile('test/original.html', 'utf-8');
    const $ = cheerio.load(htmlContent);
    const allRootDivs = $(rootSelector);

    console.log(`${colors.bright}Iniciando busca por ${searchItems.length} termos definidos...${colors.reset}\n`);
    outputLog.push(`Resultados da busca em: ${new Date().toLocaleString()}\n`);

    // Itera sobre cada item de busca definido no array
    searchItems.forEach(searchItem => {
        const sectionHeader = `--- Buscando por: "${searchItem.name}" (Texto: "${searchItem.text}") ---`;
        console.log(`${colors.bright}${colors.fg.cyan}${sectionHeader}${colors.reset}`);
        outputLog.push(sectionHeader);
        
        const elements = $('*').filter((i, el) => {
            const $el = $(el);
            return $el.children().length === 0 && $el.text().trim() === searchItem.text;
        });

        if (elements.length === 0) {
          const notFoundMsg = `-> Nenhum elemento encontrado.`;
          console.log(`${colors.fg.yellow}${notFoundMsg}${colors.reset}\n`);
          outputLog.push(notFoundMsg + "\n");
          return;
        }

        const foundMsg = `-> Encontrados ${elements.length} elementos.`;
        console.log(`${colors.fg.green}${foundMsg}${colors.reset}`);
        outputLog.push(foundMsg);

        elements.each((index, element) => {
          const { path, root } = tracePath($(element), rootSelector);

          if (!path || !root) {
            outputLog.push(`-> Ocorrência ${index + 1}: Não foi possível construir o caminho.`);
            return; 
          }

          const rootIndex = allRootDivs.index(root);

          if (rootIndex === -1) {
              outputLog.push(`-> Ocorrência ${index + 1}: Elemento raiz não foi encontrado na lista principal.`);
              return;
          }

          const cheerioSelector = path.reduce(
            (acc, childIndex) => `${acc}.children().eq(${childIndex})`,
            `$('${rootSelector}').eq(${rootIndex})`
          );

          const browserSelector = path.reduce(
            (acc, childIndex) => `${acc}.children[${childIndex}]`,
            `document.querySelectorAll('${rootSelector}')[${rootIndex}]`
          );
          
          outputLog.push(`-> Ocorrência ${index + 1}:`);
          outputLog.push(`Cheerio: ${cheerioSelector}`);
          outputLog.push(`Navegador: ${browserSelector}`);
        });
        outputLog.push("\n"); // Adiciona uma linha em branco para separar os resultados
    });

  } catch (error) {
    console.error(`${colors.fg.red}Erro ao processar o arquivo HTML: ${error.message}${colors.reset}`);
    outputLog.push(`\n!!! ERRO: ${error.message}`);
  } finally {
    // Escreve o log no arquivo e exibe o link no console
    if (outputLog.length > 0) {
      await fs.writeFile(outputFileName, outputLog.join('\n'), 'utf-8');
      const fullPath = path.resolve(outputFileName);
      console.log(`\n${colors.bright}Busca finalizada. Os resultados detalhados foram salvos em:${colors.reset}`);
      // A linha abaixo cria um link clicável no terminal do VS Code
      console.log(`${colors.fg.blue}file://${fullPath}${colors.reset}`);
    }
  }
}

processHtmlFile();
