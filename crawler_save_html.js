const { format, addDays } = require('date-fns');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
const puppeteer = require('puppeteer');

dotenv.config();

async function printJobDatesAndCreateFolders() {
    const totalStartTime = performance.now();

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
        console.error("Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE são obrigatórias.");
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const jobIdToExecute = process.argv[2]; // Captura o terceiro argumento da linha de comando (índice 2)

    let query = supabase
        .from('jobs')
        .select('*')
        .order('id', { ascending: false });

    if (jobIdToExecute) {
        query = query.eq('id', parseInt(jobIdToExecute, 10)); // Adiciona filtro por ID se o argumento existir
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

    for (const jobConfig of jobs) {
        console.log(`\n--- Processando Job ID: ${jobConfig.id} ---`);

        const jobFolderPath = path.join(__dirname, 'test', 'jobs', jobConfig.id.toString());

        try {
            await fs.rm(jobFolderPath, { recursive: true, force: true });
            console.log(`Pasta existente do job ${jobConfig.id} removida.`);
        } catch (err) {
            console.error(`Erro ao remover pasta existente para job ${jobConfig.id}:`, err.message);
        }

        try {
            await fs.mkdir(jobFolderPath, { recursive: true });
        } catch (err) {
            console.error(`Erro ao criar pasta para job ${jobConfig.id}:`, err.message);
            continue;
        }

        const today = new Date();

        const initialCheckinDate = addDays(today, 1);
        const initialCheckinStr = format(initialCheckinDate, 'yyyy-MM-dd');
        console.log(`\x1b[35mVerificando a partir de [${initialCheckinStr}] por ${jobConfig.days} dias.\x1b[0m`);

        const numPagesPerDay = 2;

        let browser;
        try {
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
            console.log(`Navegador Puppeteer iniciado para Job ID ${jobConfig.id}.`);

            for (let dayOffset = 0; dayOffset < jobConfig.days; dayOffset++) {
                const checkinDate = addDays(today, (1 + dayOffset));
                const checkoutDate = addDays(checkinDate, jobConfig.nights);
                const checkinStr = format(checkinDate, 'yyyy-MM-dd');
                const checkoutStr = format(checkoutDate, 'yyyy-MM-dd');

                const dateFolderPath = path.join(jobFolderPath, checkinStr);
                try {
                    await fs.mkdir(dateFolderPath, { recursive: true });
                } catch (err) {
                    console.error(`Erro ao criar pasta para data ${checkinStr} do job ${jobConfig.id}:`, err.message);
                    continue;
                }

                console.log(`\n    \x1b[36m[${checkinStr}]\x1b[0m`);

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

                    pagePromisesForCurrentDay.push((async () => {
                        let page;
                        try {
                            console.log(`      \x1b[33mProcessando\x1b[0m: \x1b]8;;${airbnbUrl}\x1b\\${pageDescription}\x1b]8;;\x1b\\`);
                            const startTime = performance.now();

                            page = await browser.newPage();
                            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                            await page.setViewport({ width: 1440, height: 900 });

                            await page.goto(airbnbUrl, { waitUntil: 'networkidle2', timeout: 90000 });

                            const content = await page.content();
                            const filePath = path.join(dateFolderPath, fileName);
                            await fs.writeFile(filePath, content);

                            const endTime = performance.now();
                            const durationInSeconds = ((endTime - startTime) / 1000).toFixed(2);
                            console.log(`      \x1b[32mProcessado em ${durationInSeconds} segundos.\x1b[0m`);
                        } catch (error) {
                            console.error(`      Erro ao processar "${pageDescription}" para Job ID ${jobConfig.id}:`, error.message);
                        } finally {
                            if (page) {
                                await page.close();
                            }
                        }
                    })());
                }
                await Promise.all(pagePromisesForCurrentDay);
            }

        } catch (browserError) {
            console.error(`Erro ao iniciar ou usar o navegador Puppeteer para Job ID ${jobConfig.id}:`, browserError.message);
        } finally {
            if (browser) {
                await browser.close();
                console.log(`Navegador Puppeteer fechado para Job ID ${jobConfig.id}.`);
            }
        }
    }

    const totalEndTime = performance.now();
    const totalDurationInSeconds = ((totalEndTime - totalStartTime) / 1000).toFixed(2);
    console.log(`\nTempo total gasto para todos os jobs: ${totalDurationInSeconds} segundos.`);
}

printJobDatesAndCreateFolders();