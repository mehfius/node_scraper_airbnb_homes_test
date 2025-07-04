const puppeteer = require('puppeteer');
const fs = require('fs');
const path =require('path');

async function getAirbnbListingDetails(airbnbUrl) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-gpu', '--enable-logging', '--disable-dev-shm-usage', '--incognito']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1440, height: 900 });

        await page.goto(airbnbUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

        const noResultsSelector = 'main div div div div div div div div div div div section h1';
        const availableCountSelector = 'h1 span:nth-child(2)';

        await page.waitForFunction(
            (noResSel, countSel) => {
                return document.querySelector(noResSel) || document.querySelector(countSel);
            },
            { timeout: 60000 },
            noResultsSelector,
            availableCountSelector
        );

        const noResultsElement = await page.$(noResultsSelector);
        if (noResultsElement) {
            const noResultsText = await page.evaluate(el => el.textContent.trim(), noResultsElement);
            console.log(`Nenhuma acomodação encontrada. Mensagem: "${noResultsText}".`);
            return { availableCount: 0 };
        }

        let avaliablesCount = 0;
        const availableElement = await page.$(availableCountSelector);
        if (availableElement) {
            const avaliablesText = await page.evaluate(el => el.textContent.trim(), availableElement);
            const numberMatch = avaliablesText.match(/\d+/g);
            if (numberMatch) {
                avaliablesCount = parseInt(numberMatch[0], 10);
                console.log(`Seletor encontrou ${avaliablesCount} acomodações disponíveis.`);
            } else {
                console.warn('Seletor de contagem encontrado, mas não foi possível extrair um número.');
            }
        } else {
            console.warn('Seletor de contagem de acomodações não encontrado.');
        }

        return { availableCount: avaliablesCount };

    } catch (error) {
        console.error(`Erro ao obter detalhes da listagem do Airbnb: ${error.message}`);
        return { availableCount: 0, error: error.message };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function scrapeAirbnbPage(baseAirbnbUrl, pageNumber) {
    let airbnbUrl = baseAirbnbUrl;
    if (pageNumber > 0) {
       console.warn("A paginação não se aplica, pois não estamos extraindo itens de uma lista.");
    }
    
    const result = await getAirbnbListingDetails(airbnbUrl);

    return result;
}

async function main() {
    try {
        const configPath = path.join(__dirname, 'config', 'urls.json');
        const urlsFileContent = fs.readFileSync(configPath, 'utf8');
        const urlsData = JSON.parse(urlsFileContent);

        if (!urlsData || !Array.isArray(urlsData) || urlsData.length === 0 || !urlsData[0].url) {
            console.error('Erro: O arquivo config/urls.json não foi encontrado, está vazio ou não está no formato correto.');
            console.error('Formato esperado: [{"url": "https://..."}]');
            return;
        }
        
        const airbnbUrl = urlsData[0].url;
        const pageToScrape = 0;

        console.log(`Iniciando a verificação para a URL: ${airbnbUrl}`);
        console.log('--------------------------------------------------');

        const result = await scrapeAirbnbPage(airbnbUrl, pageToScrape);

        console.log('--------------------------------------------------');
        console.log('Verificação finalizada. Resultado:');
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error('Erro: O diretório "config" ou o arquivo "urls.json" não foi encontrado.');
        } else if (error instanceof SyntaxError) {
            console.error('Erro: O arquivo "urls.json" contém um JSON inválido.');
        } else {
            console.error(`Ocorreu um erro no processo principal: ${error.message}`);
        }
    }
}

main();
