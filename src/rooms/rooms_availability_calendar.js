const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

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
    const result = await response.json();
    const calendarMonths = result?.data?.merlin?.pdpAvailabilityCalendar?.calendarMonths;
    if (calendarMonths) {
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
        const { error } = await supabase
          .from('availability_calendar')
          .insert(recordsToInsert);

        if (error) {
          console.error(`Error inserting data for listing ${listingId}:`, error);
        }
      }
    } else {
      console.log(`Could not find calendarMonths for listing ${listingId}.`);
    }
    return result;
  } catch (error) {
    console.error(`Error fetching availability for listing ${listingId}:`, error);
  }
}

async function getRoomsAndFetchAvailability() {
  console.log('Iniciando o script de busca de disponibilidade...');
  const startTime = new Date();
  let processedRoomCount = 0;

  try {
    let { data: maxBatchData, error: maxBatchError } = await supabase
        .from('availability_calendar')
        .select('batch_id')
        .not('batch_id', 'is', null)
        .order('batch_id', { ascending: false })
        .limit(1);

    if (maxBatchError) {
        console.error("Error fetching max batch_id:", maxBatchError);
        throw maxBatchError;
    }

    const nextBatchId = (maxBatchData[0]?.batch_id || 0) + 1;
    console.log(`Executando com o ID de lote (batch_id): ${nextBatchId}`);

    const { data, error } = await supabase
      .from('rooms')
      .select('id')
     // .limit(10);

    if (error) {
      console.error("Error fetching rooms:", error);
      throw error;
    }

    const ids = data.map(room => room.id);
    processedRoomCount = ids.length;

    const totalRooms = ids.length;
    let processedCount = 0;
    for (const id of ids) {
      await fetchAvailability(String(id), nextBatchId);
      processedCount++;
      const percentage = Math.round((processedCount / totalRooms) * 100);
      const progressText = `Processando quartos: ${percentage}% (${processedCount}/${totalRooms})`;
      process.stdout.write(`\r${progressText}`);
    }
    process.stdout.write('\n');

  } catch (error) {
    console.error('Erro geral durante a execução:', error.message);
  } finally {
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;

    console.log('\n--- Resumo da Execução ---');
    console.log(`Tempo total: ${duration.toFixed(2)} segundos`);
    console.log(`Número de quartos processados: ${processedRoomCount}`);
    console.log('--- Fim do Resumo ---\n');
  }
}

getRoomsAndFetchAvailability();
