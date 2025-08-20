const { createClient } = require('@supabase/supabase-js');
const { format, addDays } = require('date-fns');
require('dotenv').config();

const buildAirbnbUrl = (jobConfig, checkinStr, checkoutStr, pageNumber) => {
    let url = `https://www.airbnb.com.br/s/${jobConfig.tag}/homes?${jobConfig.amenities.map(amenity => `&selected_filter_order%5B%5D=amenities%3A${amenity}`).join('')}${jobConfig.amenities.map(amenity => `&amenities%5B%5D=${amenity}`).join('')}&adults=${jobConfig.adults}&min_bedrooms=${jobConfig.min_bedrooms}&selected_filter_order%5B%5D=min_bedrooms%3A${jobConfig.min_bedrooms}&checkin=${checkinStr}&checkout=${checkoutStr}&price_max=${jobConfig.price_max}&price_filter_input_type=${jobConfig.price_filter_input_type}`;

    if (pageNumber > 0) {
        const offset = 18 * pageNumber;
        const cursorObject = { section_offset: 0, items_offset: offset, version: 1 };
        const cursor = Buffer.from(JSON.stringify(cursorObject)).toString('base64');
        url = `${url}&cursor=${encodeURIComponent(cursor)}`;
    }
    return url;
};

const scrapeUrl = async (url) => {
    try {
        const airbnbResponse = await fetch(url, { headers: { 'User-Agent': 'curl/8.5.0' } });
        if (!airbnbResponse.ok) {
            throw new Error(`Request failed with status ${airbnbResponse.statusText}`);
        }
        const htmlText = await airbnbResponse.text();
        const startString = 'www.airbnb.com.br/rooms/';
        const roomIds = [...htmlText.matchAll(new RegExp(`${startString}(\\d+)`, 'g'))].map(match => match[1]);
        const jsonStartString = '"StaysSearchResponse",';
        const jsonEndString = ',"paginationInfo"';
        const jsonStartIndex = htmlText.indexOf(jsonStartString);
        const jsonEndIndex = htmlText.indexOf(jsonEndString, jsonStartIndex);

        if (jsonStartIndex === -1 || jsonEndIndex === -1) {
            throw new Error("JSON markers not found in HTML");
        }

        const extractedContent = htmlText.substring(jsonStartIndex + jsonStartString.length, jsonEndIndex);
        const validJsonString = `{${extractedContent}}`;
        const jsonData = JSON.parse(validJsonString);
        const results = [];

        if (jsonData.searchResults && Array.isArray(jsonData.searchResults)) {
            for (let i = 0; i < jsonData.searchResults.length; i++) {
                const item = jsonData.searchResults[i];
                const roomId = roomIds[i] || null;
                let price = item.structuredDisplayPrice?.primaryLine?.price || null;

                if (!price) {
                    price = item.structuredDisplayPrice?.primaryLine?.discountedPrice || null;
                }
                if (price) {
                    price = price.replace(/\D/g, '');
                }

                if (roomId) {
                    results.push({ room: roomId, price: price });
                }
            }
        }
        return { success: true, data: results };
    } catch (error) {
        console.error(`Falha ao processar a URL ${url}:`, error.message);
        return { success: false, url: url, error: error.message };
    }
};

const main = async () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
        console.error('Variáveis de ambiente do Supabase não configuradas. Certifique-se de que os arquivos .env estão corretos e as variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE estão definidas.');
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    
    // Busca os jobs de teste.
    const { data: jobs, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('a', true);

    if (error) {
        console.error('Erro ao buscar jobs.', error.message);
        return;
    }
    
    if (!jobs || jobs.length === 0) {
        console.log('Nenhum job de teste encontrado.');
        return;
    }

    const today = new Date();

    const failedScrapes = [];
    let totalRecordsInserted = 0;
    const jobProcessingTimes = [];
    
    // Loop para processar cada job individualmente
    for (const job of jobs) {
        // Atualiza o status do job para 'starting' no banco de dados
        await supabase
            .from('jobs')
            .update({ status: 'starting' })
            .eq('id', job.id);

        // Marca o início do processamento para o job atual
        console.log(`Iniciando processamento do job: ${job.id}`);
        const jobStartTime = new Date();
        
        // Primeiro, deleta os registros de histórico apenas para o job atual.
        const { error: deleteError } = await supabase
            .from('history')
            .delete()
            .eq('job', job.id);
            
        if (deleteError) {
            console.error(`Erro ao deletar registros para o job ${job.id}:`, deleteError.message);
            // Continua para o próximo job mesmo se houver um erro de exclusão.
            continue;
        }

        const allResultsByDate = {};
        const jobFailedScrapes = [];
        for (let dayOffset = 0; dayOffset < job.days; dayOffset++) {
            const checkinDate = addDays(today, (1 + dayOffset));
            const checkoutDate = addDays(checkinDate, job.nights);
            const checkinStr = format(checkinDate, 'yyyy-MM-dd');
            const checkoutStr = format(checkoutDate, 'yyyy-MM-dd');

            if (!allResultsByDate[checkinStr]) {
                allResultsByDate[checkinStr] = {
                    url: '',
                    rooms: []
                };
            }

            const pagePromises = [];
            for (let pageNumber = 0; pageNumber < job.pages; pageNumber++) {
                const url = buildAirbnbUrl(job, checkinStr, checkoutStr, pageNumber);
                if (pageNumber === 0) {
                    allResultsByDate[checkinStr].url = url;
                }
                pagePromises.push(scrapeUrl(url));
            }

            const pagesResults = await Promise.all(pagePromises);
            let positionCounter = 1;

            pagesResults.forEach(pageResult => {
                if (pageResult.success) {
                    if (pageResult.data && pageResult.data.length > 0) {
                        const augmentedData = pageResult.data.map(item => ({
                            position: positionCounter++,
                            room: item.room,
                            price: item.price,
                            job: job.id,
                            checkin: checkinStr,
                            checkout: checkoutStr
                        }));
                        allResultsByDate[checkinStr].rooms.push(...augmentedData);
                    }
                } else {
                    jobFailedScrapes.push({ url: pageResult.url, error: pageResult.error });
                }
            });
        }
        
        const historyData = [];
        for (const date in allResultsByDate) {
            const rooms = allResultsByDate[date].rooms;
            for (const room of rooms) {
                historyData.push({
                    room: room.room,
                    price: room.price,
                    position: room.position,
                    job: room.job,
                    checkin: room.checkin,
                    checkout: room.checkout
                });
            }
        }
        
        // Insere os dados de um job de cada vez.
        const { error: insertError } = await supabase
            .from('history')
            .insert(historyData);

        if (insertError) {
                console.error(`Erro ao inserir dados para o job ${job.id}:`, insertError.message);
        } else {
                totalRecordsInserted += historyData.length;
        }
        
        // Marca o fim do processamento e calcula o tempo decorrido.
        const jobEndTime = new Date();
        const timeElapsed = jobEndTime - jobStartTime;
        jobProcessingTimes.push({ jobId: job.id, timeElapsedMs: timeElapsed });
        
        // Imprime o tempo gasto em segundos no console
        console.log(`Job ${job.id} processado em ${Math.floor(timeElapsed / 1000)} segundos.`);

        // Define o status final do job com base no resultado
        const finalStatus = jobFailedScrapes.length > 0 ? 'finished-with-errors' : 'finished-successfully';
        await supabase
            .from('jobs')
            .update({ status: finalStatus })
            .eq('id', job.id);
    }
    
    console.log('--- Resumo do Processamento ---');
    console.log('Dados processados com sucesso! Registros inseridos:', totalRecordsInserted);
};

main();
