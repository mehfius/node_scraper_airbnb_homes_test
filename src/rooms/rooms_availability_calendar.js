const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const CONCURRENT_FETCHES = true;
const CONCURRENCY_LEVEL = 1;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function fetchAvailability(listingId, batchId) {
  const myHeaders = new Headers();
  myHeaders.append("X-Airbnb-API-Key", "d306zoyjsyarp7ifhu67rjxn52tv0t20");

  const requestOptions = {
    method: "GET",
    headers: myHeaders,
    redirect: "follow"
  };

  const variables = {
    request: {
      count: 12,
      listingId: listingId,
      month: 8,
      year: 2025
    }
  };

  const extensions = {
    persistedQuery: {
      version: 1,
      sha256Hash: "8f08e03c7bd16fcad3c92a3592c19a8b559a0d0855a84028d1163d4733ed9ade"
    }
  };

  const url = `https://www.airbnb.com.br/api/v3/PdpAvailabilityCalendar/8f08e03c7bd16fcad3c92a3592c19a8b559a0d0855a84028d1163d4733ed9ade?operationName=PdpAvailabilityCalendar&locale=pt&currency=BRL&variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify(extensions))}`;

  try {
    const response = await fetch(url, requestOptions);
    if (!response.ok) {
        return { success: false, error: `HTTP error! status: ${response.status}` };
    }

    const result = await response.json();
    const calendarMonths = result?.data?.merlin?.pdpAvailabilityCalendar?.calendarMonths;

    if (!calendarMonths) {
      return { success: false, error: "Could not find calendarMonths in API response." };
    }

    const recordsToInsert = [];
    calendarMonths.forEach(month => {
      month.days.forEach(day => {
        recordsToInsert.push({
          room: listingId,
          calendar_date: day.calendarDate,
          available: day.available,
          available_for_checkin: day.availableForCheckin,
          available_for_checkout: day.availableForCheckout,
          batch_id: batchId
        });
      });
    });

    if (recordsToInsert.length > 0) {
      const { error: dbError } = await supabase.from('availability_calendar').insert(recordsToInsert);
      if (dbError) {
        return { success: false, error: `Supabase insert error: ${dbError.message}` };
      }
    }

    return { success: true };
  } catch (error) {
    let errorMessage = error.message;
    if (error instanceof SyntaxError) {
        errorMessage = "Failed to parse JSON (likely an HTML block page from Airbnb).";
    }
    return { success: false, error: errorMessage };
  }
}

async function getRoomsAndFetchAvailability() {
  console.log('Iniciando o script de busca de disponibilidade...');
  const startTime = new Date();
  let processedRoomCount = 0;
  let errorCount = 0;
  const failedItems = [];

  try {
    let { data: maxBatchData, error: maxBatchError } = await supabase
        .from('availability_calendar')
        .select('batch_id')
        .not('batch_id', 'is', null)
        .order('batch_id', { ascending: false })
        .limit(1);

    if (maxBatchError) {
        console.error("\nError fetching max batch_id:", maxBatchError);
        throw maxBatchError;
    }

    const nextBatchId = (maxBatchData[0]?.batch_id || 0) + 1;
    console.log(`Executando com o ID de lote (batch_id): ${nextBatchId}`);

    const logFilePath = path.join('logs', 'rooms_rooms_availability_calendar', `${nextBatchId}.log`);
    const logDir = path.dirname(logFilePath);
    fs.mkdirSync(logDir, { recursive: true });

    const { data, error } = await supabase
      .from('rooms')
      .select('id::text')
      //.limit(100);

    if (error) {
      console.error("\nError fetching rooms:", error);
      throw error;
    }

    const ids = data.map(room => room.id);
    const totalRooms = ids.length;
    processedRoomCount = totalRooms;

    let internalProcessedCount = 0;
    const updateProgress = () => {
        internalProcessedCount++;
        const percentage = Math.round((internalProcessedCount / totalRooms) * 100);
        let progressText = `Processando quartos: ${percentage}% (${internalProcessedCount}/${totalRooms})`;
        if (errorCount > 0) {
            progressText += ` \x1b[31mErros: ${errorCount}\x1b[0m`;
        }
        process.stdout.write(`\r${progressText} `);
    };

    const handleResult = (result, id) => {
        if (!result.success) {
            errorCount++;
            failedItems.push({ id: id, reason: result.error });
        }
        updateProgress();
    };

    if (CONCURRENT_FETCHES) {
        console.log(`Executando com ${CONCURRENCY_LEVEL} buscas paralelas.`);
        for (let i = 0; i < totalRooms; i += CONCURRENCY_LEVEL) {
            const chunk = ids.slice(i, i + CONCURRENCY_LEVEL);
            const promises = chunk.map(id => 
                fetchAvailability(String(id), nextBatchId).then(result => handleResult(result, id))
            );
            await Promise.allSettled(promises);

            if (i + CONCURRENCY_LEVEL < totalRooms) {
                //console.log('\n\nAguardando 2 segundos antes do próximo lote...\n');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    } else {
        for (const id of ids) {
            const result = await fetchAvailability(String(id), nextBatchId);
            handleResult(result, id);
        }
    }

    process.stdout.write('\n');

    if (failedItems.length > 0) {
        const logContent = failedItems.map(item => 
            `ID: ${item.id}\nMotivo: ${item.reason}\n--------------------`
        ).join('\n\n');
        fs.writeFileSync(logFilePath, logContent);
        console.log(`\nLog de erros foi salvo em: ${logFilePath}`);
    }

  } catch (error) {
    console.error('\nErro geral durante a execução:', error.message);
  } finally {
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;

    console.log('\n--- Resumo da Execução ---');
    console.log(`Tempo total: ${duration.toFixed(2)} segundos`);
    console.log(`Número de quartos processados: ${processedRoomCount}`);
    if (errorCount > 0) {
        console.log(`\x1b[31mTotal de erros: ${errorCount}\x1b[0m`);
    }
    console.log('--- Fim do Resumo ---\n');
  }
}

getRoomsAndFetchAvailability();
