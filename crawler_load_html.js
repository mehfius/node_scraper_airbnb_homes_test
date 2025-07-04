const path = require('path');
const fs = require('fs');
const JSDOM = require('jsdom').JSDOM;

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';

function cleanLogDirectory(logPath) {
    if (fs.existsSync(logPath)) {
        fs.readdirSync(logPath).forEach(file => {
            const curPath = path.join(logPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                cleanLogDirectory(curPath);
                fs.rmdirSync(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
    }
}

function countElementsInHtmlFiles(startPath) {
    if (!fs.existsSync(startPath)) {
        console.log("Diretório não encontrado:", startPath);
        return;
    }

    const baseLogDirPath = './log';
    const relativeStartPath = path.relative('./test', startPath);
    const jobLogDirPath = path.join(baseLogDirPath, relativeStartPath);

    cleanLogDirectory(jobLogDirPath);

    const files = fs.readdirSync(startPath);
    
    for (const file of files) {
        const filename = path.join(startPath, file);
        const stat = fs.lstatSync(filename);

        if (stat.isDirectory()) {
            countElementsInHtmlFiles(filename);
        } else if (filename.endsWith('.html')) {
            try {
                const htmlContent = fs.readFileSync(filename, 'utf-8');
                const dom = new JSDOM(htmlContent);
                const doc = dom.window.document;
                const error = doc.querySelector('main div div div div div div div div div div section h1');
                const totalRoomsElement = doc.querySelector('main h1 span:nth-child(2)');
                let totalRooms = 'Não encontrado';

                if (totalRoomsElement) {
                    const numbers = totalRoomsElement.textContent.match(/\d+/g);
                    if (numbers && numbers.length > 0) {
                        totalRooms = numbers.join('');
                    } else {
                        totalRooms = '1000'; 
                    }
                }

                const elements = doc.querySelectorAll('div[itemprop="itemListElement"]');
                console.log(`Arquivo: ${filename} - Quantidade de elementos: ${elements.length}`);

                elements.forEach((element, index) => {
                    const relativeFilePath = path.relative('./test', filename);
                    const fileLogDirPath = path.join(baseLogDirPath, path.dirname(relativeFilePath), path.basename(filename, '.html'));

                    if (!fs.existsSync(fileLogDirPath)) {
                        fs.mkdirSync(fileLogDirPath, { recursive: true });
                    }

                    try {
                        const priceElement = element.querySelectorAll('button')[3].querySelectorAll('span')[0];
                        const titleElement = element.querySelector('meta[itemprop="name"]');
                        const title = titleElement ? titleElement.getAttribute('content') : 'Título não encontrado';
                        
                        if (priceElement) {
                            console.log(`  ${green}Elemento ${index + 1} - Título: ${title} - Preço: ${priceElement.textContent.trim()}${reset} - Total de quartos: ${totalRooms}`);
                        } else {
                            const logFileName = path.join(fileLogDirPath, `${String(index + 1).padStart(2, '0')}_error.html`);
                            fs.writeFileSync(logFileName, element.outerHTML, 'utf-8');
                            console.log(`  ${red}Elemento ${index + 1} - Título: ${title} - Preço não encontrado. \x1b]8;;file://${logFileName}\x1b\\[link]\x1b]8;;\x1b\\${reset}`);
                        }
                    } catch (e) {
                        const logFileName = path.join(fileLogDirPath, `${String(index + 1).padStart(2, '0')}_error.html`);
                        fs.writeFileSync(logFileName, element.outerHTML, 'utf-8');
                        console.log(`  ${red}Elemento ${index + 1} - Erro ao extrair dados. \x1b]8;;file://${logFileName}\x1b\\[link]\x1b]8;;\x1b\\${reset}`);
                    }
                });

            } catch (error) {
                console.error(`Erro ao processar o arquivo ${filename}: ${error.message}`);
            }
        }
    }
}

const directoryPath = './test/jobs/27';
countElementsInHtmlFiles(directoryPath);