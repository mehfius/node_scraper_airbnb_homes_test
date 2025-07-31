
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const { execSync } = require('child_process');

async function getTestJobIds() {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('id')
      .eq('test', true);

    if (error) {
      throw error;
    }

    if (data) {
      for (const job of data) {
        const clearCacheCommand = `rm -rf /home/m/node/node_scraper_airbnb_homes_test/browser_cache`;
        console.log(`Executing: ${clearCacheCommand}`);
        try {
          execSync(clearCacheCommand, { encoding: 'utf-8' });
        } catch (e) {
          console.error(`Error executing command for job ${job.id}:`, e.stderr);
        }

        const commands = [
          `npm run save_jobs ${job.id}`,
          `npm run clear_jobs ${job.id}`,
          `npm run load_jobs ${job.id}`
        ];

        for (const command of commands) {
          console.log(`Executing: ${command}`);
          try {
            const output = execSync(command, { encoding: 'utf-8' });
            console.log(`Output for job ${job.id}:\n${output}`);
          } catch (e) {
            console.error(`Error executing command for job ${job.id}:`, e.stderr);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching job IDs:', error);
  }
}

getTestJobIds();
