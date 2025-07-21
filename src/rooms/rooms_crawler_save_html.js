require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function main() {
    // Variáveis para cores ANSI
    const ANSI_COLOR_YELLOW = '\x1b[33m';
    const ANSI_COLOR_RED = '\x1b[31m';
    const ANSI_COLOR_RESET = '\x1b[0m';
    const ANSI_COLOR_BLUE = '\x1b[34m';
    const ANSI_COLOR_GREEN = '\x1b[32m';

    // Variável para controle de concorrência
    const concurrencyLimit = 4;
    // Variável de espera entre os lotes (em milissegundos)
    const delayBetweenBatchesMs = 2000; // 2 segundos

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;
    const supabase = createClient(supabaseUrl, supabaseServiceRole);

    const startTime = Date.now();

    let browser;

    // Função para adicionar um atraso
    const delay = ms => new Promise(res => setTimeout(res, ms));

    try {
        const { data: roomsToProcess, error: viewError } = await supabase
            .from('view_except_rooms')
            .select('room::text');

        if (viewError) {
            throw new Error(`Erro ao buscar rooms da view_except_rooms: ${viewError.message}`);
        }

        console.log(`Serão processadas ${roomsToProcess.length} novas rooms (da view_except_rooms).`);

        if (roomsToProcess.length === 0) {
            console.log("Nenhuma nova room encontrada na view_except_rooms para processar.");
            return;
        }

        const roomIdsFound = roomsToProcess.map(room => room.room).join(', ');
        console.log(`${ANSI_COLOR_YELLOW}Rooms encontradas na view_except_rooms: ${roomIdsFound}${ANSI_COLOR_RESET}`);

        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-gpu',
                '--enable-logging',
                '--disable-dev-shm-usage',
                '--incognito'
            ]
        });

        let processedCount = 0;
        const totalRooms = roomsToProcess.length;

        // A forma mais confiável de obter a raiz do projeto é usar process.cwd()
        // que retorna o diretório de trabalho atual onde o comando Node.js foi executado.
        const projectRoot = process.cwd();

        for (let i = 0; i < totalRooms; i += concurrencyLimit) {
            const batch = roomsToProcess.slice(i, i + concurrencyLimit);
            console.log(`\n${ANSI_COLOR_BLUE}Processando lote ${Math.floor(i / concurrencyLimit) + 1} de ${Math.ceil(totalRooms / concurrencyLimit)} (${batch.length} rooms)...${ANSI_COLOR_RESET}`);

            const promises = batch.map(async (entry) => {
                const currentRoomId = String(entry.room);
                const airbnbUrl = `https://www.airbnb.com.br/rooms/${currentRoomId}?source_impression_id=p3_1749777157_P3alvyrQd2n8MOmW&modal=PHOTO_TOUR_SCROLLABLE`;

                try {
                    const page = await browser.newPage();
                    await page.goto(airbnbUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

                    const htmlContent = await page.content();
                    await page.close();

                    // Define o caminho para salvar na estrutura base do projeto
                    const folderPath = path.join(projectRoot, 'html', 'rooms', 'original', currentRoomId);
                    if (!fs.existsSync(folderPath)) {
                        fs.mkdirSync(folderPath, { recursive: true });
                    }
                    const filePath = path.join(folderPath, `${currentRoomId}.html`);
                    fs.writeFileSync(filePath, htmlContent);

                    console.log(`${ANSI_COLOR_GREEN}HTML da room ${currentRoomId} salvo em ${filePath}${ANSI_COLOR_RESET}`);
                    processedCount++;

                } catch (scrapeError) {
                    console.error(`${ANSI_COLOR_RED}Erro ao baixar HTML da sala ${currentRoomId}: ${scrapeError.message}${ANSI_COLOR_RESET}`);
                }
            });
            await Promise.allSettled(promises);

            // Adiciona atraso entre os lotes, se não for o último lote
            if (i + concurrencyLimit < totalRooms) {
                console.log(`Aguardando ${delayBetweenBatchesMs / 1000} segundos antes do próximo lote...`);
                await delay(delayBetweenBatchesMs);
            }
        }

        console.log(`\nProcessamento concluído. Total de rooms processadas: ${processedCount}.`);

        const endTime = Date.now();
        const totalTimeInSeconds = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`Tempo total gasto: ${totalTimeInSeconds} segundos.`);

    } catch (mainError) {
        console.error(`${ANSI_COLOR_RED}Erro fatal no processo principal: ${mainError.message}${ANSI_COLOR_RESET}`);
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
main();