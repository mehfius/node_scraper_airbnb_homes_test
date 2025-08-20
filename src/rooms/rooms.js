const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

// ANSI escape codes for colors
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function extractValue(htmlContent, startMarker, endMarker) {
  const startIndex = htmlContent.indexOf(startMarker);
  if (startIndex === -1) {
    return null;
  }

  const valueStart = startIndex + startMarker.length;
  const valueEnd = htmlContent.indexOf(endMarker, valueStart);

  if (valueEnd === -1) {
    return null;
  }

  return htmlContent.substring(valueStart, valueEnd);
}

async function processRoomsFromSupabase() {
  const startTime = new Date();
  let successfulCount = 0;
  let failedCount = 0;
  const successfulIdsList = [];
  const failedIdsList = [];

  try {
    const { data, error } = await supabase
      .from('view_except_rooms')
      .select('id:room::text');

    if (error) {
      throw error;
    }

    const ids = data.map(record => String(record.id));
    console.log(`${colors.blue}Encontrados ${ids.length} quartos para processar.${colors.reset}`);
    const totalBatches = Math.ceil(ids.length / 4);

    for (let i = 0; i < ids.length; i += 4) {
      const idBatch = ids.slice(i, i + 4);
      const currentBatchNumber = Math.floor(i / 4) + 1;
      console.log(`${colors.yellow}\nProcessando lote ${currentBatchNumber} de ${totalBatches} com ${idBatch.length} quartos.${colors.reset}`);

      const batchPromises = idBatch.map(async (id) => {
        try {
          const url = `https://www.airbnb.com.br/rooms/${id}`;
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'curl/8.5.0'
            }
          });

          if (!response.ok) {
            console.error(`${colors.red}Erro ao fazer o fetch para o quarto ${id}: ${response.statusText}${colors.reset}`);
            failedCount++;
            failedIdsList.push(id);
            return null;
          }

          const htmlContent = await response.text();

          const extractedData = {};
          extractedData.id = id;
          extractedData.title = extractValue(htmlContent, '"PdpTitleSection","title":"', '"');
          extractedData.tiny_description = extractValue(htmlContent, '"PdpSharingConfig","title":"', '"');
          
          const latitudeString = extractValue(htmlContent, '"latitude":', ',');
          extractedData.latitude = latitudeString ? parseFloat(latitudeString) : null;
          
          const longitudeString = extractValue(htmlContent, '"longitude":', ',');
          extractedData.longitude = longitudeString ? parseFloat(longitudeString) : null;
          
          extractedData.host = extractValue(htmlContent, '"hostId":"', '"');
          
          const favoriteString = extractValue(htmlContent, '"isGuestFavorite":', ',');
          extractedData.favorite = favoriteString === 'true';

          const superhostString = extractValue(htmlContent, '"isSuperhost":', ',');
          extractedData.superhost = superhostString === 'true';
          
          let description = extractValue(htmlContent, '"description":"', '","');
          if (description) {
            extractedData.description = description.replace(/\\n/g, '');
          } else {
            extractedData.description = null;
          }

          const imageRegex = /"ImageEntity","uri":"(.*?)"/g;
          const imageMatches = [...htmlContent.matchAll(imageRegex)];
          extractedData.images = imageMatches.map(match => match[1]);
          
          const { error: upsertError } = await supabase
            .from('rooms')
            .upsert(extractedData, { onConflict: 'id' });

          if (upsertError) {
            console.error(`${colors.red}Erro ao inserir/atualizar o quarto ${id}: ${upsertError.message}${colors.reset}`);
            failedCount++;
            failedIdsList.push(id);
            return null;
          }
          
          successfulCount++;
          successfulIdsList.push(id);
          return id;

        } catch (fetchError) {
          console.error(`${colors.red}Falha ao fazer o fetch para o quarto ${id}: ${fetchError}${colors.reset}`);
          failedCount++;
          failedIdsList.push(id);
          return null;
        }
      });
      
      const results = await Promise.all(batchPromises);
      const successfulIdsInBatch = results.filter(result => result !== null);

      if (successfulIdsInBatch.length > 0) {
        console.log(`${colors.green}Sucesso no lote ${currentBatchNumber}: ${successfulIdsInBatch.join(', ')}${colors.reset}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
  } catch (error) {
    console.error(`${colors.red}Falha ao processar os quartos do Supabase: ${error.message}${colors.reset}`);
  } finally {
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;

    console.log(`${colors.cyan}\n--- Relatório Final ---${colors.reset}`);
    console.log(`${colors.cyan}Tempo total de execução: ${duration.toFixed(2)} segundos${colors.reset}`);
    console.log(`${colors.green}Total de sucessos: ${successfulCount}${colors.reset}`);
    if (successfulCount > 0) {
        console.log(`${colors.green}IDs com sucesso: ${successfulIdsList.join(', ')}${colors.reset}`);
    }
    console.log(`${colors.red}Total de falhas: ${failedCount}${colors.reset}`);
    if (failedCount > 0) {
        console.log(`${colors.red}IDs com falha: ${failedIdsList.join(', ')}${colors.reset}`);
    }
    console.log(`${colors.cyan}--- Fim do Relatório ---\n${colors.reset}`);
    console.log('Processamento concluído!');
  }
}

processRoomsFromSupabase();
