import puppeteer from 'puppeteer';
import { promises as fs } from 'fs';
import path from 'path';

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
  try {
    console.log('Lendo o arquivo urls.json...');
    const urlsFilePath = path.resolve('urls.json');
    const urlsFileContent = await fs.readFile(urlsFilePath, 'utf8');
    const pagesToScrape = JSON.parse(urlsFileContent);

    if (!Array.isArray(pagesToScrape) || pagesToScrape.length === 0) {
      console.error('O arquivo JSON está vazio ou não é um array. Encerrando.');
      return;
    }
    console.log(`Encontradas ${pagesToScrape.length} URLs para processar.`);

    console.log('Iniciando o navegador Puppeteer...');
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
        console.warn(`Item com descrição "${description}" não possui URL. Pulando.`);
        continue;
      }
      
      let page;
      try {
        console.log(`\nProcessando: "${description}"`);
        
        const startTime = performance.now();
        
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1440, height: 900 });

        console.log('Navegando e esperando o carregamento completo...');
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });
        
        const loadTime = performance.now();
        const loadDuration = (loadTime - startTime) / 1000;
        
        const htmlContent = await page.content();
        const filename = `${description.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
        
        await fs.writeFile(filename, htmlContent, 'utf8');
        
        const endTime = performance.now();
        const totalDuration = (endTime - startTime) / 1000;
        
        const sizeInBytes = Buffer.byteLength(htmlContent, 'utf8');
        console.log(`-> Arquivo salvo: "${filename}" (${formatBytes(sizeInBytes)}) | Carregamento: ${loadDuration.toFixed(2)}s | Extração e salvamento: ${totalDuration.toFixed(2)}s`);

      } catch (error) {
        console.error(`Ocorreu um erro ao processar "${description}":`, error.message);
      } finally {
        if (page) {
          await page.close();
        }
      }
    }

  } catch (error) {
    console.error('Ocorreu um erro fatal no script:', error);
  } finally {
    if (browser) {
      console.log('\nTodos os itens processados. Fechando o navegador.');
      await browser.close();
    }
  }
}

savePagesAsHtml();
