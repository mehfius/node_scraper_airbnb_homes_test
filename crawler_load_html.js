const path = require('path');
const fs = require('fs');
const JSDOM = require('jsdom').JSDOM;
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function cleanLogDirectory(logPath) {
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

async function countElementsInHtmlFiles(startPath, jobValue) {
    if (!fs.existsSync(startPath)) {
        console.log("Diretório não encontrado:", startPath);
        return;
    }

    const baseLogDirPath = './log';
    const relativeStartPath = path.relative('./html/optimized', startPath);
    const jobLogDirPath = path.join(baseLogDirPath, relativeStartPath);

    await cleanLogDirectory(jobLogDirPath);

    const files = fs.readdirSync(startPath);
    let globalPosition = 0;

    for (const file of files) {
        const filename = path.join(startPath, file);
        const stat = fs.lstatSync(filename);

        if (stat.isDirectory()) {
            await countElementsInHtmlFiles(filename, jobValue);
        } else if (filename.endsWith('.html')) {
            try {
                const htmlContent = fs.readFileSync(filename, 'utf-8');
                const dom = new JSDOM(htmlContent);
                const doc = dom.window.document;
                const availablesElement = doc.querySelector('main h1 span:nth-child(2)');
                let availables = 'Não encontrado';

                if (availablesElement) {
                    const numbers = availablesElement.textContent.match(/\d+/g);
                    if (numbers && numbers.length > 0) {
                        availables = numbers.join('');
                    } else {
                        availables = '1000';
                    }
                }

                const elements = doc.querySelectorAll('div[itemprop="itemListElement"]');
                console.log(`Arquivo: ${filename} - Quantidade de elementos: ${elements.length}`);

                for (const [index, element] of elements.entries()) {
                    globalPosition++;
                    const relativeFilePath = path.relative('./html/optimized', filename);
                    const fileLogDirPath = path.join(baseLogDirPath, path.dirname(relativeFilePath), path.basename(filename, '.html'));

                    if (!fs.existsSync(fileLogDirPath)) {
                        fs.mkdirSync(fileLogDirPath, { recursive: true });
                    }

                    try {
                        const priceElement = element.querySelectorAll('button')[3].querySelectorAll('span')[0];
                        const urlRoomElement = element.querySelector('meta[itemprop="url"]').getAttribute('content') || 'URL não encontrada';
                        const room = urlRoomElement.match(/\/rooms\/(\d+)/)?.[1] || null;

                        const urlParams = new URLSearchParams(urlRoomElement.split('?')[1]);
                        const checkin = urlParams.get('check_in') || 'Não encontrado';
                        const checkout = urlParams.get('check_out') || 'Não encontrado';

                        const position = String(globalPosition).padStart(2, '0');
                        const datesFormatted = `${checkin} até ${checkout}`;
                        const job = jobValue;
                        const price = priceElement ? priceElement.textContent.trim().replace(/\D/g, '') : null;

                        const historyData = {
                            room,
                            position,
                            availables,
                            job,
                            checkin,
                            checkout,
                            price
                        };
                        const { data, error } = await supabase
                            .from('history')
                            .insert([historyData]);

                        if (error) {
                            console.error(`${red}Erro ao inserir dados no Supabase:`, error.message, `${reset}`);
                        } else {
                            console.log(`${green}Dados inseridos no Supabase com sucesso!`, historyData.room, `${reset}`);
                        }

                        if (priceElement) {
                            console.log(`   ${green}Position ${position} - ${datesFormatted} - Price: ${price} - Room: ${room} - Availables: ${availables}${reset}`);
                        } else {
                            const logFileName = path.join(fileLogDirPath, `${String(index + 1).padStart(2, '0')}_error.html`);
                            fs.writeFileSync(logFileName, element.outerHTML, 'utf-8');
                            console.log(`   ${red}Position ${position} - ${datesFormatted} - Price não encontrado. \x1b]8;;file://${logFileName}\x1b\\[link]\x1b]8;;\x1b\\${reset}`);
                        }
                    } catch (e) {
                        const logFileName = path.join(fileLogDirPath, `${String(index + 1).padStart(2, '0')}_error.html`);
                        fs.writeFileSync(logFileName, element.outerHTML, 'utf-8');
                        console.log(`   ${red}Position ${String(globalPosition).padStart(2, '0')} - Erro ao extrair dados. \x1b]8;;file://${logFileName}\x1b\\[link]\x1b]8;;\x1b\\${reset}`);
                    }
                }
            } catch (error) {
                console.error(`Erro ao processar o arquivo ${filename}: ${error.message}`);
            }
        }
    }
}

async function runScript() {
    const args = process.argv;
    const jobValue = args[2];

    if (jobValue) {
        console.log(`Valor recebido para o job: ${jobValue}`);

        const { error: deleteError } = await supabase
            .from('history')
            .delete()
            .eq('job', jobValue);

        if (deleteError) {
            console.error(`${red}Erro ao limpar registros anteriores do job '${jobValue}':`, deleteError.message, `${reset}`);
            return;
        } else {
            console.log(`${green}Registros anteriores do job '${jobValue}' limpos com sucesso!${reset}`);
        }

        const directoryPath = `./html/optimized/jobs/${jobValue}`;
        await countElementsInHtmlFiles(directoryPath, jobValue);
    } else {
        console.log('Nenhum valor para o job foi passado. Por favor, forneça um valor como argumento.');
    }
}

runScript();