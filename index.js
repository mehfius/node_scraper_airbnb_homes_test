require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function getTestJobIds() {
    console.log(`Script iniciado em: ${new Date().toLocaleString()}`);
    try {
        const { data, error } = await supabase
            .from('jobs')
            .select('id')
            .eq('a', true);

        if (error) {
            throw error;
        }

        if (data && data.length > 0) {
            for (const job of data) {
                const clearCacheCommand = `rm -rf /home/m/node/node_scraper_airbnb_homes_test/browser_cache`;
                console.log(`Executing: ${clearCacheCommand}`);
                try {
                    execSync(clearCacheCommand, { encoding: 'utf-8' });
                } catch (e) {
                    console.error(`Error executing command for job ${job.id}:`, e.stderr);
                }

                const jobCommands = [
                    `npm run save_jobs ${job.id}`,
                    `npm run clear_jobs ${job.id}`,
                    `npm run load_jobs ${job.id}`
                ];

                for (const command of jobCommands) {
                    console.log(`Executing: ${command}`);
                    try {
                        const output = execSync(command, { encoding: 'utf-8' });
                        console.log(`Output for job ${job.id}:\n${output}`);
                    } catch (e) {
                        console.error(`Error executing command for job ${job.id}:`, e.stderr);
                    }
                }

                const roomCommands = [
                    `npm run save_rooms ${job.id}`,
                    `npm run clear_rooms ${job.id}`,
                    `npm run load_rooms ${job.id}`
                ];

                for (const command of roomCommands) {
                    console.log(`Executing: ${command}`);
                    try {
                        const output = execSync(command, { encoding: 'utf-8' });
                        console.log(`Output for job ${job.id}:\n${output}`);
                    } catch (e) {
                        console.error(`Error executing command for job ${job.id}:`, e.stderr);
                    }
                }
            }
        } else {
            console.log('Nenhum job com test=true encontrado.');
        }
    } catch (error) {
        console.error('Error fetching job IDs:', error);
    }
    console.log(`Script finalizado em: ${new Date().toLocaleString()}`);
}

// Executa a função imediatamente ao iniciar
getTestJobIds();

// Define para executar a cada 5 horas (5 horas * 60 minutos/hora * 60 segundos/minuto * 1000 ms/segundo)
setInterval(getTestJobIds, 5 * 60 * 60 * 1000);

console.log('O script será executado a cada 5 horas.');