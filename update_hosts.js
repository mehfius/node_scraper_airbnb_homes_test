require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function main() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl) {
        console.error('Erro: SUPABASE_URL não está configurada no .env');
        process.exit(1);
    }
    if (!supabaseServiceRole) {
        console.error('Erro: SUPABASE_SERVICE_ROLE não está configurada no .env');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRole);

    const scrapeRoomEndpoint = process.env.SCRAPE_HOST_URL;

    console.log('Iniciando o processo de busca e atualização de host...');
    console.log('Conectado ao Supabase.');

    try {
        console.log('Buscando os 10 primeiros host da view_host no Supabase...');
        const { data: hosts, error: supabaseError } = await supabase
            .from('view_except_hosts')
            .select('host::text')


        if (supabaseError) {
            throw new Error(`Erro na consulta Supabase: ${supabaseError.message}`);
        }

        console.log('Consulta executada com sucesso. Dados retornados:');
        console.log(hosts);

        console.log('\nIniciando loop de requisições para o endpoint scrapeRoomEndpoint e realizando upsert...');
        for (const record of hosts) {
            const host = record.host;
            console.log(`\nFazendo requisição para ${scrapeRoomEndpoint} com host: ${host}`);
            try {
                const response = await fetch(scrapeRoomEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ host }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Erro HTTP! Status: ${response.status}, Resposta: ${errorText}`);
                }

                const responseData = await response.json();
                console.log('Resposta da requisição:');
                console.log(responseData);

                console.log(`Realizando upsert na tabela 'hosts' para o host: ${host}`);
                const { data: upsertData, error: upsertError } = await supabase
                    .from('hosts')
                    .upsert({ id: host, ...responseData }, { onConflict: 'id' });

                if (upsertError) {
                    throw new Error(`Erro ao realizar upsert: ${upsertError.message}`);
                }
                console.log('Upsert concluído com sucesso:', upsertData);

            } catch (fetchError) {
                console.error(`Erro ao fazer requisição ou upsert para o host ${host}: ${fetchError.message}`);

                // Se a requisição falhou, insere apenas o ID e define 'error' como true
                console.log(`Requisição falhou para o host ${host}. `);
/*                 const { data: upsertErrorData, error: upsertHostError } = await supabase
                    .from('hosts')
                    .upsert({ id: host, error: true }, { onConflict: 'id' }); */

                if (upsertHostError) {
                    console.error(`Erro ao registrar falha de requisição para o host ${host}: ${upsertHostError.message}`);
                } else {
                    console.log('Falha de requisição registrada com sucesso no Supabase.');
                }
            }
        }

    } catch (error) {
        console.error('Erro durante o processo:', error.message);
        process.exit(1);
    }
}

main();