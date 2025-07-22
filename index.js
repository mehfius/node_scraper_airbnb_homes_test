require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const { exec } = require('child_process');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE;

function connectSupabase() {
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  const subscription = supabase
    .channel('jobs_changes')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs'
      },
      async (payload) => {

        if (payload.eventType === 'UPDATE' && payload.new.status === 'start') {
          console.log(`[${new Date().toLocaleString('pt-BR')}] Registro ID: ${payload.new.id} teve o status alterado para 'start'. Atualizando para 'working'...`);

          const { data, error } = await supabase
            .from('jobs')
            .update({ status: 'working' })
            .eq('id', payload.new.id);

          if (error) {
            console.error(`[${new Date().toLocaleString('pt-BR')}] Erro ao atualizar o status para working:`, error);
          } else {
            console.log(`[${new Date().toLocaleString('pt-BR')}] Status do registro ID: ${payload.new.id} atualizado com sucesso para 'working'.`);

            const jobId = payload.new.id;
            exec(`npm run save_jobs ${jobId}`, async (execError, stdout, stderr) => {
              if (execError) {
                console.error(`[${new Date().toLocaleString('pt-BR')}] Erro ao executar o comando 'npm run save_jobs ${jobId}': ${execError}`);
                return;
              }
              if (stdout) {
                console.log(`[${new Date().toLocaleString('pt-BR')}] Saída do comando 'npm run save_jobs ${jobId}':\n${stdout}`);
              }
              if (stderr) {
                console.error(`[${new Date().toLocaleString('pt-BR')}] Erro no comando 'npm run save_jobs ${jobId}' (stderr):\n${stderr}`);
              }

              const { error: updateOptimizingError } = await supabase
                .from('jobs')
                .update({ status: 'optimizing' })
                .eq('id', jobId);

              if (updateOptimizingError) {
                console.error(`[${new Date().toLocaleString('pt-BR')}] Erro ao atualizar o status para 'optimizing' antes de clear_jobs:`, updateOptimizingError);
              } else {
                console.log(`[${new Date().toLocaleString('pt-BR')}] Status do registro ID: ${jobId} atualizado com sucesso para 'optimizing'.`);
              }

              exec('npm run clear_jobs', (clearError, clearStdout, clearStderr) => {
                if (clearError) {
                  console.error(`[${new Date().toLocaleString('pt-BR')}] Erro ao executar o comando 'npm run clear_jobs': ${clearError}`);
                  return;
                }
                if (clearStdout) {
                  console.log(`[${new Date().toLocaleString('pt-BR')}] Saída do comando 'npm run clear_jobs':\n${clearStdout}`);
                }
                if (clearStderr) {
                  console.error(`[${new Date().toLocaleString('pt-BR')}] Erro no comando 'npm run clear_jobs' (stderr):\n${clearStderr}`);
                }

                // Atualiza o status para 'saving_history' antes de executar load_jobs
                supabase
                  .from('jobs')
                  .update({ status: 'saving_history' })
                  .eq('id', jobId)
                  .then(({ error: updateSavingError }) => {
                    if (updateSavingError) {
                      console.error(`[${new Date().toLocaleString('pt-BR')}] Erro ao atualizar o status para 'saving_history' antes de load_jobs:`, updateSavingError);
                    } else {
                      console.log(`[${new Date().toLocaleString('pt-BR')}] Status do registro ID: ${jobId} atualizado com sucesso para 'saving_history'.`);
                    }

                    // Executa load_jobs com o jobId após clear_jobs
                    exec(`npm run load_jobs ${jobId}`, async (loadError, loadStdout, loadStderr) => { // Adicionado 'async' aqui
                      if (loadError) {
                        console.error(`[${new Date().toLocaleString('pt-BR')}] Erro ao executar o comando 'npm run load_jobs ${jobId}': ${loadError}`);
                        return;
                      }
                      if (loadStdout) {
                        console.log(`[${new Date().toLocaleString('pt-BR')}] Saída do comando 'npm run load_jobs ${jobId}':\n${loadStdout}`);
                      }
                      if (loadStderr) {
                        console.error(`[${new Date().toLocaleString('pt-BR')}] Erro no comando 'npm run load_jobs ${jobId}' (stderr):\n${loadStderr}`);
                      }

                      // Atualiza o status para 'saved_history_successfully' após load_jobs
                      const { error: updateSavedError } = await supabase
                        .from('jobs')
                        .update({ status: 'saved_history_successfully' })
                        .eq('id', jobId);

                      if (updateSavedError) {
                        console.error(`[${new Date().toLocaleString('pt-BR')}] Erro ao atualizar o status para 'saved_history_successfully':`, updateSavedError);
                      } else {
                        console.log(`[${new Date().toLocaleString('pt-BR')}] Status do registro ID: ${jobId} atualizado com sucesso para 'saved_history_successfully'.`);
                      }
                    });
                  });
              });
            });
          }
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[${new Date().toLocaleString('pt-BR')}] Conectado ao canal do Supabase para a tabela jobs`);
      } else {
        console.warn(`[${new Date().toLocaleString('pt-BR')}] Estado da assinatura para tabela jobs:`, status);
      }
    });

  supabase
    .channel('jobs_changes')
    .on('REALTIME_SUBSCRIPTION_UPDATE', (update) => {
      console.log(`[${new Date().toLocaleString('pt-BR')}] Atualização de subscrição para tabela jobs:`, update);
    });
}

connectSupabase();