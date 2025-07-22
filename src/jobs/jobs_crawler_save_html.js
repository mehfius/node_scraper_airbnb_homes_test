const { format, addDays } = require('date-fns');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
const puppeteer = require('puppeteer');

dotenv.config();

const USER_DATA_DIR = path.join(process.cwd(), 'browser_cache');

const PAGE_LOAD_DELAY_SECONDS = 2;


async function printJobDatesAndCreateFolders() {
    const totalStartTime = performance.now();

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
        console.error("Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE são obrigatórias.");
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const jobIdToExecute = process.argv[2];

    let query = supabase
        .from('jobs')
        .select('*')
        .order('id', { ascending: false });

    if (jobIdToExecute) {
        query = query.eq('id', parseInt(jobIdToExecute, 10));
        console.log(`Executando apenas o Job ID: ${jobIdToExecute}`);
    } else {
        console.log("Executando todos os jobs.");
    }

    const { data: jobs, error } = await query;

    if (error) {
        console.error('Erro ao buscar jobs:', error.message);
        return;
    }

    if (!jobs || jobs.length === 0) {
        console.log(`Nenhum job encontrado na tabela ${jobIdToExecute ? `com o ID ${jobIdToExecute}` : ''}.`);
        return;
    }

    const pageProcessingTimeEstimate = 3;

    try {
        await fs.mkdir(USER_DATA_DIR, { recursive: true });
        console.log(`Diretório de cache do navegador criado/verificado: ${USER_DATA_DIR}`);
    } catch (err) {
        console.error(`Erro ao criar diretório de cache do navegador:`, err.message);
        return;
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            userDataDir: USER_DATA_DIR,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-gpu',
                '--disable-dev-shm-usage'
            ]
        });
        console.log(`Navegador Puppeteer iniciado com cache persistente em ${USER_DATA_DIR}.`);

        for (const jobConfig of jobs) {
            console.log(`\n--- Processando Job ID: ${jobConfig.id} ---`);

            const numPagesPerDay = jobConfig.pages;
            const estimatedRemainingSeconds = jobConfig.days * numPagesPerDay * pageProcessingTimeEstimate;

            try {
                await supabase
                    .from('jobs')
                    .update({ status: 'extracting_html', remaining_seconds: estimatedRemainingSeconds })
                    .eq('id', jobConfig.id);
                console.log(`Job ID ${jobConfig.id} atualizado para status 'extracting_html' com ${estimatedRemainingSeconds} segundos estimados.`);
            } catch (updateError) {
                console.error(`Erro ao atualizar status do Job ID ${jobConfig.id}:`, updateError.message);
            }

            // O caminho base para os arquivos HTML, incluindo 'html/jobs/original/ID_DO_JOB/'
            const jobSpecificBaseFolderPath = path.join(process.cwd(), 'html', 'jobs', 'original', jobConfig.id.toString());

            try {
                // Remove a pasta do job (ID_DO_JOB) se existir, para garantir uma limpeza antes de recriar
                await fs.rm(jobSpecificBaseFolderPath, { recursive: true, force: true });
                console.log(`Pasta existente de arquivos HTML para o job ${jobConfig.id} removida.`);
            } catch (err) {
                console.error(`Erro ao remover pasta existente de arquivos HTML para job ${jobConfig.id}:`, err.message);
            }

            try {
                // Cria a pasta do job (ID_DO_JOB)
                await fs.mkdir(jobSpecificBaseFolderPath, { recursive: true });
                console.log(`Diretório ${jobSpecificBaseFolderPath} criado/verificado.`);
            } catch (err) {
                console.error(`Erro ao criar pasta para o job ${jobConfig.id}:`, err.message);
                continue;
            }

            const today = new Date();
            const initialCheckinDate = addDays(today, 1);
            const initialCheckinStr = format(initialCheckinDate, 'yyyy-MM-dd');
            console.log(`\x1b[35mVerificando a partir de [${initialCheckinStr}] por ${jobConfig.days} dias.\x1b[0m`);

            let totalBytesDownloadedForJob = 0;

            for (let dayOffset = 0; dayOffset < jobConfig.days; dayOffset++) {
                const checkinDate = addDays(today, (1 + dayOffset));
                const checkoutDate = addDays(checkinDate, jobConfig.nights);
                const checkinStr = format(checkinDate, 'yyyy-MM-dd');
                const checkoutStr = format(checkoutDate, 'yyyy-MM-dd');

                // A pasta da data agora fica dentro da pasta ID_DO_JOB
                const dateSpecificFolderPath = path.join(jobSpecificBaseFolderPath, checkinStr);
                try {
                    await fs.mkdir(dateSpecificFolderPath, { recursive: true });
                } catch (err) {
                    console.error(`Erro ao criar pasta para data ${checkinStr} do job ${jobConfig.id}:`, err.message);
                    continue;
                }

                console.log(`\n        \x1b[36m[${checkinStr}]\x1b[0m`);

                const pagePromisesForCurrentDay = [];
                for (let pageNumber = 0; pageNumber < numPagesPerDay; pageNumber++) {
                    let airbnbUrl = `https://www.airbnb.com.br/s/${jobConfig.tag}/homes?${jobConfig.amenities.map(amenity => `&selected_filter_order%5B%5D=amenities%3A${amenity}`).join('')}${jobConfig.amenities.map(amenity => `&amenities%5B%5D=${amenity}`).join('')}&adults=${jobConfig.adults}&min_bedrooms=${jobConfig.min_bedrooms}&selected_filter_order%5B%5D=min_bedrooms%3A${jobConfig.min_bedrooms}&checkin=${checkinStr}&checkout=${checkoutStr}&price_max=${jobConfig.price_max}&price_filter_input_type=${jobConfig.price_filter_input_type}`;

                    if (pageNumber > 0) {
                        const offset = 18 * pageNumber;
                        const cursorObject = {
                            section_offset: 0,
                            items_offset: offset,
                            version: 1
                        };
                        const cursor = Buffer.from(JSON.stringify(cursorObject)).toString('base64');
                        airbnbUrl = `${airbnbUrl}&cursor=${encodeURIComponent(cursor)}`;
                    }

                    const pageDescription = `Página ${pageNumber + 1}`;
                    const fileName = `${(pageNumber + 1).toString().padStart(2, '0')}.html`;
                    const filePath = path.join(dateSpecificFolderPath, fileName);

                    pagePromisesForCurrentDay.push((async () => {
                        let page;
                        let bytesDownloadedForPage = 0;
                        const requestsForPage = [];
                        try {
                            console.log(`        \x1b[33mProcessando\x1b[0m: \x1b]8;;${airbnbUrl}\x1b\\${pageDescription}\x1b]8;;\x1b\\`);
                            const startTime = performance.now();

                            page = await browser.newPage();
                            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                            await page.setViewport({ width: 1440, height: 900 });

                            page.on('request', request => {
                                requestsForPage.push(request);
                            });

                            page.on('response', async (response) => {
                                try {
                                    const buffer = await response.buffer();
                                    bytesDownloadedForPage += buffer.length;
                                } catch (e) {

                                }
                            });

                            await page.goto(airbnbUrl, { waitUntil: 'networkidle2', timeout: 90000 });

                            const content = await page.content();
                            await fs.writeFile(filePath, content);

                            const endTime = performance.now();
                            const durationInSeconds = ((endTime - startTime) / 1000).toFixed(2);
                            console.log(`        \x1b[32mProcessado em ${durationInSeconds} segundos. Bytes baixados para a página: ${(bytesDownloadedForPage / 1024).toFixed(2)} KB\x1b[0m`);
                            totalBytesDownloadedForJob += bytesDownloadedForPage;

                        } catch (error) {
                            console.error(`        Erro ao processar "${pageDescription}" para Job ID ${jobConfig.id}:`, error.message);
                        } finally {
                            if (page) {
                                await page.close();
                            }
                        }
                    })());
                }
                await Promise.all(pagePromisesForCurrentDay);

                if (numPagesPerDay > 0 && dayOffset < jobConfig.days - 1) {
                    console.log(`        Aguardando ${PAGE_LOAD_DELAY_SECONDS} segundos antes de processar a próxima data...`);
                    await new Promise(resolve => setTimeout(resolve, PAGE_LOAD_DELAY_SECONDS * 1000));
                }

                const remainingSecondsAfterDay = estimatedRemainingSeconds - ((dayOffset + 1) * numPagesPerDay * pageProcessingTimeEstimate);
                try {
                    await supabase
                        .from('jobs')
                        .update({ remaining_seconds: Math.max(0, remainingSecondsAfterDay) })
                        .eq('id', jobConfig.id);
                    console.log(`Job ID ${jobConfig.id}: Tempo restante atualizado para ${Math.max(0, remainingSecondsAfterDay)} segundos.`);
                } catch (updateError) {
                    console.error(`Erro ao atualizar tempo restante do Job ID ${jobConfig.id}:`, updateError.message);
                }
            }
            console.log(`\x1b[34mTotal de KB baixados para o Job ID ${jobConfig.id}: ${(totalBytesDownloadedForJob / 1024).toFixed(2)} KB\x1b[0m`);
        }

    } catch (browserError) {
        console.error(`Erro ao iniciar ou usar o navegador Puppeteer:`, browserError.message);
    } finally {
        if (browser) {
            await browser.close();
            console.log(`Navegador Puppeteer fechado.`);
        }
        for (const jobConfig of jobs) {
            try {
                await supabase
                    .from('jobs')
                    .update({ status: 'completed', remaining_seconds: 0 })
                    .eq('id', jobConfig.id);
                console.log(`Job ID ${jobConfig.id} concluído. Status atualizado para 'completed'.`);
            } catch (updateError) {
                console.error(`Erro ao finalizar status do Job ID ${jobConfig.id}:`, updateError.message);
            }
        }
    }

    const totalEndTime = performance.now();
    const totalDurationInSeconds = ((totalEndTime - totalStartTime) / 1000).toFixed(2);
    console.log(`\nTempo total gasto para todos os jobs: ${totalDurationInSeconds} segundos.`);
}

printJobDatesAndCreateFolders();