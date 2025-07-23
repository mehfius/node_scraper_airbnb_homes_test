const path = require('path');
const fs = require('fs');
const JSDOM = require('jsdom').JSDOM;
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const reset = '\x1b[0m';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function countElementsInHtmlFiles(startPath, jobValue) {
    if (!fs.existsSync(startPath)) {
        console.log("Diretório não encontrado:", startPath);
        return;
    }

    const files = fs.readdirSync(startPath);
    let globalPosition = 0;
    let currentDayFolder = '';

    for (const file of files) {
        const filename = path.join(startPath, file);
        const stat = fs.lstatSync(filename);

        if (stat.isDirectory()) {
            const dayFolder = path.basename(filename);
            if (dayFolder !== currentDayFolder) {
                console.log(`\n--- Processando pasta do dia: ${dayFolder} ---`); // Quebra de linha e título
                currentDayFolder = dayFolder;
            }
            await countElementsInHtmlFiles(filename, jobValue); // Chamada recursiva para pastas
        } else if (filename.endsWith('.html')) {
            let logStatus = '';
            let logColor = reset;
            let insertedCount = 0;
            const shortFilename = path.basename(filename); // Obtém apenas o nome do arquivo

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
                const recordsToInsert = [];

                for (const [index, element] of elements.entries()) {
                    globalPosition++;
                    
                    try {
                        const priceElement = element.querySelectorAll('button')[3]?.querySelectorAll('span')[0] ||
                                             element.querySelectorAll('button')[4]?.querySelectorAll('span')[0] ||
                                             element.querySelectorAll('button')[1]?.querySelectorAll('span')[0];
                        const urlRoomElement = element.querySelector('meta[itemprop="url"]').getAttribute('content') || 'URL não encontrada';
                        const room = urlRoomElement.match(/\/rooms\/(\d+)/)?.[1] || null;

                        const urlParams = new URLSearchParams(urlRoomElement.split('?')[1]);
                        const checkin = urlParams.get('check_in') || 'Não encontrado';
                        const checkout = urlParams.get('check_out') || 'Não encontrado';

                        const position = String(globalPosition).padStart(2, '0');
                        const job = jobValue;
                        const price = priceElement ? priceElement.textContent.trim().replace(/\D/g, '') : null;

                        const historyData = {
                            room,
                            position,
                            job,
                            checkin,
                            checkout,
                            price
                        };
                        recordsToInsert.push(historyData);
                    } catch (e) {
                        console.error(`${yellow}Erro ao extrair dados de um item no arquivo ${shortFilename}: ${e.message}${reset}`);
                    }
                }

                if (recordsToInsert.length > 0) {
                    const { data, error } = await supabase
                        .from('history')
                        .insert(recordsToInsert);

                    if (error) {
                        logStatus = 'Falho';
                        logColor = red;
                        console.error(`${red}Erro no Supabase para o arquivo ${shortFilename}:`, error.message, `${reset}`);
                    } else {
                        logStatus = 'Sucesso';
                        logColor = green;
                        insertedCount = recordsToInsert.length;
                    }
                } else {
                    logStatus = 'Sem registro';
                    logColor = yellow;
                }

            } catch (error) {
                logStatus = 'Falho';
                logColor = red;
                console.error(`Erro ao processar o arquivo ${shortFilename}: ${error.message}`);
            } finally {
                // Obtém o nome da pasta pai para usar como "dia"
                const parentFolder = path.basename(path.dirname(filename));
                console.log(`${logColor}${parentFolder} - ${logStatus} - Registros inseridos: ${insertedCount} - Arquivo: ${shortFilename}${reset}`);
            }
        }
    }
}

async function runScript() {
    const jobsPath = path.join(process.cwd(), 'html/jobs/optimized');
    const specificJobId = process.argv[2]; 

    if (specificJobId) {
        console.log(`Processando apenas o job com ID: ${specificJobId}`);
    }

    if (!fs.existsSync(jobsPath)) {
        console.log(`Diretório de jobs não encontrado: ${jobsPath}`);
        return;
    }

    let jobDirectories = fs.readdirSync(jobsPath).filter(file => {
        return fs.lstatSync(path.join(jobsPath, file)).isDirectory();
    });

    if (specificJobId) {
        jobDirectories = jobDirectories.filter(job => job === specificJobId);
        if (jobDirectories.length === 0) {
            console.log(`Nenhum diretório encontrado para o job ID: ${specificJobId}`);
            return;
        }
    }

    for (const jobValue of jobDirectories) {
        console.log(`\n### Iniciando processamento para o Job: ${jobValue} ###`);

        const { error: deleteError } = await supabase
            .from('history')
            .delete()
            .eq('job', jobValue);

        if (deleteError) {
            console.error(`${red}Erro ao limpar registros anteriores do job '${jobValue}':`, deleteError.message, `${reset}`);
            continue;
        } else {
            console.log(`${green}Registros anteriores do job '${jobValue}' limpos com sucesso!${reset}`);
        }

        const directoryPath = path.join(jobsPath, jobValue);
        await countElementsInHtmlFiles(directoryPath, jobValue);
        console.log(`\n### Finalizado processamento para o Job: ${jobValue} ###`);
    }

    if (jobDirectories.length === 0 && !specificJobId) {
        console.log('Nenhum diretório de job encontrado na pasta html/jobs/optimized/.');
    }
}

runScript();