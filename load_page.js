const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

// Códigos de cores ANSI para o console, sem a necessidade de bibliotecas externas
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function savePagesAsHtml() {
  let browser;
  const outputDir = 'test/original'; // Define o nome do diretório de saída

  try {
    console.log(`${colors.blue}Lendo o arquivo urls.json...${colors.reset}`);
    const urlsFilePath = path.resolve('config/urls.json');
    const urlsFileContent = await fs.readFile(urlsFilePath, 'utf8');
    const pagesToScrape = JSON.parse(urlsFileContent);

    if (!Array.isArray(pagesToScrape) || pagesToScrape.length === 0) {
      console.error(`${colors.bright}${colors.red}O arquivo JSON está vazio ou não é um array. Encerrando.${colors.reset}`);
      return;
    }
    console.log(`${colors.blue}Encontradas ${colors.bright}${pagesToScrape.length}${colors.reset}${colors.blue} URLs para processar.${colors.reset}`);
    
    // Cria o diretório de saída se ele não existir
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`${colors.blue}Arquivos serão salvos no diretório: ${colors.bright}${outputDir}/${colors.reset}`);

    console.log(`${colors.blue}Iniciando o navegador Puppeteer...${colors.reset}`);
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-gpu',
        '--disable-dev-shm-usage'
      ]
    });

    for (const item of pagesToScrape) {
      const { description, url } = item;
      if (!url) {
        console.warn(`${colors.yellow}Item com descrição "${description}" não possui URL. Pulando.${colors.reset}`);
        continue;
      }
      
      let page;
      try {
        console.log(`\n${colors.cyan}Processando: "${colors.bright}${description}${colors.reset}${colors.cyan}"${colors.reset}`);
        
        const startTime = performance.now();
        
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1440, height: 900 });

        console.log(`${colors.gray}Navegando e esperando o carregamento completo...${colors.reset}`);
        // Alterado para 'networkidle2' para ser menos rigoroso e evitar timeouts
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
        
        const loadTime = performance.now();
        const loadDuration = (loadTime - startTime) / 1000;
        
        const htmlContent = await page.content();
        // Cria o caminho completo do arquivo, incluindo o diretório de saída
        const filename = `${description.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
        const filePath = path.join(outputDir, filename);
        
        await fs.writeFile(filePath, htmlContent, 'utf8');
        
        const endTime = performance.now();
        const totalDuration = (endTime - startTime) / 1000;
        
        const sizeInBytes = Buffer.byteLength(htmlContent, 'utf8');
        
        const absolutePath = path.resolve(filePath);
        const fileLinkText = '[Abrir arquivo]';
        const fileClickableLink = `\u001B]8;;file://${absolutePath}\u001B\\${fileLinkText}\u001B]8;;\u001B\\`;

        const urlLinkText = '[Link da url]';
        const urlClickableLink = `\u001B]8;;${url}\u001B\\${urlLinkText}\u001B]8;;\u001B\\`;

        console.log(`${colors.green}-> Arquivo salvo: "${colors.bright}${filePath}${colors.reset}${colors.green}"${colors.reset} ${fileClickableLink} ${urlClickableLink} ${colors.gray}(${formatBytes(sizeInBytes)})${colors.reset} ${colors.white}| Carregamento: ${loadDuration.toFixed(2)}s | Extração e salvamento: ${totalDuration.toFixed(2)}s${colors.reset}`);

      } catch (error) {
        console.error(`${colors.red}Ocorreu um erro ao processar "${colors.bright}${description}${colors.reset}${colors.red}": ${error.message}${colors.reset}`);
      } finally {
        if (page) {
          await page.close();
        }
      }
    }

  } catch (error) {
    console.error(`${colors.bright}${colors.red}Ocorreu um erro fatal no script: ${error}${colors.reset}`);
  } finally {
    if (browser) {
      console.log(`\n${colors.bright}${colors.blue}Todos os itens processados. Fechando o navegador.${colors.reset}`);
      await browser.close();
    }
  }
}

savePagesAsHtml();
