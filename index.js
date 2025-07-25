require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const { exec } = require('child_process');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE;

let supabaseClient = null; // Variável para armazenar a instância do cliente Supabase

function connectSupabase() {
  // Se o cliente já existe, reutilize-o. Caso contrário, crie um novo.
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    console.log(`[${new Date().toLocaleString('pt-BR')}] Cliente Supabase inicializado.`);
  }

  function subscribeJobsChannel() {
    // Certifique-se de que o cliente Supabase esteja disponível
    if (!supabaseClient) {
      console.error(`[${new Date().toLocaleString('pt-BR')}] Cliente Supabase não está disponível para iniciar a assinatura.`);
      // Tenta reconectar a conexão principal se o cliente não estiver pronto
      setTimeout(connectSupabase, 5000);
      return;
    }

    const channel = supabaseClient
      .channel('jobs_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
        },
        async (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new.status === 'start') {
            console.log(`[${new Date().toLocaleString('pt-BR')}] Registro ID: ${payload.new.id} teve o status alterado para 'start'. Atualizando para 'working'...`);

            const { data, error } = await supabaseClient
              .from('jobs')
              .update({ status: 'working' })
              .eq('id', payload.new.id);

            if (error) {
              console.error(`[${new Date().toLocaleString('pt-BR')}] Erro ao atualizar o status para working:`, error);
              // Considerar uma estratégia de retry ou notificação aqui
            } else {
              console.log(`[${new Date().toLocaleString('pt-BR')}] Status do registro ID: ${payload.new.id} atualizado com sucesso para 'working'.`);

              const jobId = payload.new.id;
              exec(`npm run save_jobs ${jobId}`, async (execError, stdout, stderr) => {
                if (execError) {
                  console.error(`[${new Date().toLocaleString('pt-BR')}] Erro ao executar o comando 'npm run save_jobs ${jobId}': ${execError}`);
                  // Se save_jobs falha, talvez atualizar o status do job para 'failed'
                  await supabaseClient.from('jobs').update({ status: 'failed_save_jobs' }).eq('id', jobId);
                  return;
                }
                if (stdout) {
                  console.log(`[${new Date().toLocaleString('pt-BR')}] Saída do comando 'npm run save_jobs ${jobId}':\n${stdout}`);
                }
                if (stderr) {
                  console.error(`[${new Date().toLocaleString('pt-BR')}] Erro no comando 'npm run save_jobs ${jobId}' (stderr):\n${stderr}`);
                }

                const { error: updateOptimizingError } = await supabaseClient
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
                    // Se clear_jobs falha, talvez atualizar o status do job para 'failed'
                    supabaseClient.from('jobs').update({ status: 'failed_clear_jobs' }).eq('id', jobId);
                    return;
                  }
                  if (clearStdout) {
                    console.log(`[${new Date().toLocaleString('pt-BR')}] Saída do comando 'npm run clear_jobs':\n${clearStdout}`);
                  }
                  if (clearStderr) {
                    console.error(`[${new Date().toLocaleString('pt-BR')}] Erro no comando 'npm run clear_jobs' (stderr):\n${clearStderr}`);
                  }

                  supabaseClient
                    .from('jobs')
                    .update({ status: 'saving_history' })
                    .eq('id', jobId)
                    .then(({ error: updateSavingError }) => {
                      if (updateSavingError) {
                        console.error(`[${new Date().toLocaleString('pt-BR')}] Erro ao atualizar o status para 'saving_history' antes de load_jobs:`, updateSavingError);
                      } else {
                        console.log(`[${new Date().toLocaleString('pt-BR')}] Status do registro ID: ${jobId} atualizado com sucesso para 'saving_history'.`);
                      }

                      exec(`npm run load_jobs ${jobId}`, async (loadError, loadStdout, loadStderr) => {
                        if (loadError) {
                          console.error(`[${new Date().toLocaleString('pt-BR')}] Erro ao executar o comando 'npm run load_jobs ${jobId}': ${loadError}`);
                          // Se load_jobs falha, talvez atualizar o status do job para 'failed'
                          await supabaseClient.from('jobs').update({ status: 'failed_load_jobs' }).eq('id', jobId);
                          return;
                        }
                        if (loadStdout) {
                          console.log(`[${new Date().toLocaleString('pt-BR')}] Saída do comando 'npm run load_jobs ${jobId}':\n${loadStdout}`);
                        }
                        if (loadStderr) {
                          console.error(`[${new Date().toLocaleString('pt-BR')}] Erro no comando 'npm run load_jobs ${jobId}' (stderr):\n${loadStderr}`);
                        }

                        const { error: updateSavedError } = await supabaseClient
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
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn(`[${new Date().toLocaleString('pt-BR')}] Canal caiu (${status}), tentando reconectar em 5s...`);
          // Limpa o cliente Supabase para forçar uma nova inicialização na próxima tentativa
          supabaseClient = null;
          setTimeout(() => {
            console.log(`[${new Date().toLocaleString('pt-BR')}] Tentando reconectar ao Supabase...`);
            connectSupabase(); // Chama a função principal de conexão que irá recriar o cliente e a assinatura
          }, 5000);
        } else {
          console.warn(`[${new Date().toLocaleString('pt-BR')}] Estado da assinatura para tabela jobs:`, status);
        }
      });
  }

  subscribeJobsChannel();
}

connectSupabase();