require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE;

// Função principal de conexão com Supabase
function connectSupabase() {
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  const subscription = supabase
    .channel('jobs_changes')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE', // Monitorar apenas eventos de UPDATE
        schema: 'public',
        table: 'jobs'
      },
      async (payload) => {
        // Verifica se o campo 'status' foi alterado para 'start'
        // E se o payload.old está disponível para comparação (mesmo sem REPLICA IDENTITY FULL,
        // o Supabase pode enviar o campo antigo se ele for a PK ou se for um campo pequeno alterado)
        if (payload.eventType === 'UPDATE' && payload.new.status === 'start') {
          console.log(`[${new Date().toLocaleString('pt-BR')}] Registro ID: ${payload.new.id} teve o status alterado para 'start'. Atualizando para 'working'...`);

          const { data, error } = await supabase
            .from('jobs')
            .update({ status: 'working' })
            .eq('id', payload.new.id); // Certifique-se de que o ID do registro está sendo usado para a atualização

          if (error) {
            console.error(`[${new Date().toLocaleString('pt-BR')}] Erro ao atualizar o status para working:`, error);
          } else {
            console.log(`[${new Date().toLocaleString('pt-BR')}] Status do registro ID: ${payload.new.id} atualizado com sucesso para 'working'.`);
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

  // Evento de atualização em tempo real (para logs ou reconexão)
  supabase
    .channel('jobs_changes')
    .on('REALTIME_SUBSCRIPTION_UPDATE', (update) => {
      console.log(`[${new Date().toLocaleString('pt-BR')}] Atualização de subscrição para tabela jobs:`, update);
    });
}

connectSupabase();