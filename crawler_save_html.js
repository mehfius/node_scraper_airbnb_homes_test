const { format, addDays } = require('date-fns');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
const puppeteer = require('puppeteer');

dotenv.config();

async function printJobDatesAndCreateFolders(jobId) {
    if (!jobId) {
        console.error("É necessário fornecer um ID de job como argumento.");
        return;
    }

    const totalStartTime = performance.now();

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
        console.error("Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE são obrigatórias.");
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: jobs, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .order('id', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Erro ao buscar o último job:', error.message);
        return;
    }

    const jobConfig = jobs[0];
    if (!jobConfig) {
        console.log(`Nenhum job encontrado com o ID ${jobId}.`);
        return;
    }

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
        return;
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
        console.log(`Navegador Puppeteer iniciado.`);

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

            console.log(`\n  \x1b[36m[${checkinStr}]\x1b[0m`);

            const pagePromisesForCurrentDay = [];
            for (let pageNumber = 0; pageNumber < numPagesPerDay; pageNumber++) {
                let airbnbUrl = `${jobConfig.url}${jobConfig.amenities.map(amenity => `&selected_filter_order%5B%5D=amenities%3A${amenity}`).join('')}${jobConfig.amenities.map(amenity => `&amenities%5B%5D=${amenity}`).join('')}&adults=${jobConfig.adults}&min_bedrooms=${jobConfig.min_bedrooms}&selected_filter_order%5B%5D=min_bedrooms%3A${jobConfig.min_bedrooms}&checkin=${checkinStr}&checkout=${checkoutStr}&price_max=${jobConfig.price_max}&price_filter_input_type=${jobConfig.price_filter_input_type}`;

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
                        console.log(`    \x1b[33mProcessando\x1b[0m: \x1b]8;;${airbnbUrl}\x1b\\${pageDescription}\x1b]8;;\x1b\\`);
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
                        console.log(`    \x1b[32mProcessado em ${durationInSeconds} segundos.\x1b[0m`);
                    } catch (error) {
                        console.error(`    Erro ao processar "${pageDescription}":`, error.message);
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
        console.error(`Erro ao iniciar ou usar o navegador Puppeteer:`, browserError.message);
    } finally {
        if (browser) {
            await browser.close();
            console.log(`Navegador Puppeteer fechado.`);
        }
    }

    const totalEndTime = performance.now();
    const totalDurationInSeconds = ((totalEndTime - totalStartTime) / 1000).toFixed(2);
    console.log(`\nTempo total gasto: ${totalDurationInSeconds} segundos.`);
}

const jobIdFromArgs = process.argv[2];
printJobDatesAndCreateFolders(jobIdFromArgs);