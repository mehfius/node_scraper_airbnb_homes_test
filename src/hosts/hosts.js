const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

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

async function processHostsFromSupabase() {
  const startTime = new Date();
  let successfulCount = 0;
  let failedCount = 0;
  const successfulIdsList = [];
  const failedIdsList = [];

  try {
    const { data, error } = await supabase
      .from('view_except_hosts')
      .select('id:host::text');

    if (error) {
      throw error;
    }

    const ids = data.map(record => String(record.id));
    console.log(`${colors.blue}Encontrados ${ids.length} anfitriões para processar.${colors.reset}`);
    const totalBatches = Math.ceil(ids.length / 4);

    for (let i = 0; i < ids.length; i += 4) {
      const idBatch = ids.slice(i, i + 4);
      const currentBatchNumber = Math.floor(i / 4) + 1;
      console.log(`${colors.yellow}\nProcessando lote ${currentBatchNumber} de ${totalBatches} com ${idBatch.length} anfitriões.${colors.reset}`);

      const batchPromises = idBatch.map(async (id) => {
        try {
          const url = `https://www.airbnb.com.br/users/show/${id}`;
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'curl/8.5.0'
            }
          });

          if (!response.ok) {
            console.error(`${colors.red}Erro ao fazer o fetch para o anfitrião ${id}: ${response.statusText}${colors.reset}`);
            failedCount++;
            failedIdsList.push(id);
            return null;
          }

          const htmlContent = await response.text();

          const extractedData = {};
          extractedData.id = id;
          extractedData.name = extractValue(htmlContent, '"smartName":"', '"');
          
          const ratingString = extractValue(htmlContent, '"ratingAverage":', '}');
          extractedData.rating = ratingString ? parseFloat(ratingString) : null;

          const reviewString = extractValue(htmlContent, '"UserProfileReviews","count":', ',');
          extractedData.reviews = reviewString ? parseInt(reviewString, 10) : null;

          extractedData.image = extractValue(htmlContent, '"pictureUrl":"', '"');

          const { error: upsertError } = await supabase
            .from('hosts')
            .upsert(extractedData, { onConflict: 'id' });

          if (upsertError) {
            console.error(`${colors.red}Erro ao inserir/atualizar o anfitrião ${id}: ${upsertError.message}${colors.reset}`);
            failedCount++;
            failedIdsList.push(id);
            return null;
          }

          successfulCount++;
          successfulIdsList.push(id);
          return id;

        } catch (fetchError) {
          console.error(`${colors.red}Falha ao fazer o fetch para o anfitrião ${id}: ${fetchError}${colors.reset}`);
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
    console.error(`${colors.red}Falha ao processar os anfitriões do Supabase: ${error.message}${colors.reset}`);
  } finally {
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;

    console.log(`${colors.cyan}\n--- Relatório Final ---${colors.reset}`);
    
    if (successfulCount > 0) {
      console.log(`${colors.green}Sucessos (${successfulCount}): ${successfulIdsList.join(', ')}${colors.reset}`);
    } else {
      console.log(`${colors.green}Total de sucessos: ${successfulCount}${colors.reset}`);
    }

    console.log(`${colors.red}Total de falhas: ${failedCount}${colors.reset}`);
    if (failedCount > 0) {
        console.log(`${colors.red}IDs com falha: ${failedIdsList.join(', ')}${colors.reset}`);
    }

    console.log(`${colors.cyan}Tempo total de execução: ${duration.toFixed(2)} segundos${colors.reset}`);
    console.log(`${colors.cyan}--- Fim do Relatório ---\n${colors.reset}`);
    console.log('Processamento concluído!');
  }
}

processHostsFromSupabase();
