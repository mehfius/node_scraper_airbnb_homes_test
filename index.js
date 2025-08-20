const { execSync } = require('child_process');

async function runJobs() {
    console.log(`Script iniciado em: ${new Date().toLocaleString()}`);
    try {
        const commandJobs = `npm run jobs`;
        console.log(`Executing: ${commandJobs}`);
        execSync(commandJobs, { encoding: 'utf-8', stdio: 'inherit' });

        const commandRooms = `npm run rooms`;
        console.log(`Executing: ${commandRooms}`);
        execSync(commandRooms, { encoding: 'utf-8', stdio: 'inherit' });

        const commandHosts = `npm run hosts`;
        console.log(`Executing: ${commandHosts}`);
        execSync(commandHosts, { encoding: 'utf-8', stdio: 'inherit' });
    } catch (e) {
        console.error(`Error executing command:`, e);
    }
    console.log(`Script finalizado em: ${new Date().toLocaleString()}`);
}

runJobs();

setInterval(runJobs, 5 * 60 * 60 * 1000);

console.log('O script será executado a cada 5 horas.');