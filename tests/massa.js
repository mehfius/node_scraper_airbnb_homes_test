const { format, addDays } = require('date-fns');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

dotenv.config();

const API_URL = 'https://vercel-airbnb-test.vercel.app/api/airbnb';

// Função para adicionar um atraso entre as tentativas
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função para fazer a requisição com tentativas
async function fetchWithRetry(url, pageNumber, jobConfig) {
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Erro na resposta da API: ${response.statusText}`);
            }

            const data = await response.json();
            const bytesDownloaded = JSON.stringify(data).length;

            const kBytes = (bytesDownloaded / 1024).toFixed(2);
            console.log(`        \x1b[32mBytes baixados para a página ${pageNumber + 1}:\x1b[0m ${kBytes} KB`);

            const roomIds = data?.simplifiedResults?.map(room => room.roomId) || [];

            if (roomIds.length > 0) {
                console.log(`        \x1b[33mRoom IDs encontrados:\x1b[0m ${roomIds.join(', ')}`);
                return { success: true, roomIds };
            } else {
                if (attempt < MAX_RETRIES) {
                    console.log(`        \x1b[31mTentativa ${attempt} falhou. Nenhum Room ID encontrado na URL:\x1b[0m ${url}`);
                    console.log(`        \x1b[31mAguardando 2 segundos para tentar novamente...\x1b[0m`);
                    await delay(2000); // Aguarda 2 segundos antes de tentar novamente
                }
            }

        } catch (error) {
            console.error(`        Erro na tentativa ${attempt} para a URL: ${url}`, error.message);
            if (attempt < MAX_RETRIES) {
                console.log(`        \x1b[31mAguardando 2 segundos para tentar novamente...\x1b[0m`);
                await delay(2000);
            }
        }
    }

    console.log(`        \x1b[31mTodas as ${MAX_RETRIES} tentativas falharam para a URL:\x1b[0m ${url}`);
    return { success: false, roomIds: [] };
}


async function processJobsWithFetch() {
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

    for (const jobConfig of jobs) {
        console.log(`\n--- Processando Job ID: ${jobConfig.id} ---`);

        const today = new Date();
        const initialCheckinDate = addDays(today, 1);
        const initialCheckinStr = format(initialCheckinDate, 'yyyy-MM-dd');

        const fetchPromises = [];

        for (let dayOffset = 0; dayOffset < jobConfig.days; dayOffset++) {
            const checkinDate = addDays(today, (1 + dayOffset));
            const checkoutDate = addDays(checkinDate, jobConfig.nights);
            const checkinStr = format(checkinDate, 'yyyy-MM-dd');
            const checkoutStr = format(checkoutDate, 'yyyy-MM-dd');

            console.log(`\n        \x1b[36m[${checkinStr}]\x1b[0m`);

            for (let pageNumber = 0; pageNumber < jobConfig.pages; pageNumber++) {
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

                const fullApiUrl = `${API_URL}?url=${encodeURIComponent(airbnbUrl)}`;

                fetchPromises.push(fetchWithRetry(fullApiUrl, pageNumber, jobConfig));
            }
        }
        
        console.log(`\n\x1b[35mExecutando ${fetchPromises.length} requisições em paralelo.\x1b[0m`);
        await Promise.all(fetchPromises);
    }
}

processJobsWithFetch();