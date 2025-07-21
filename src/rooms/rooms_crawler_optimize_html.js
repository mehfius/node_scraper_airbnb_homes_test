const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const processDirectory = (directoryPath, outputBasePath) => {
    try {
        const files = fs.readdirSync(directoryPath);

        files.forEach(file => {
            const filePath = path.join(directoryPath, file);
            const stats = fs.statSync(filePath);

            if (stats.isDirectory()) {
                const newOutputDirectory = path.join(outputBasePath, file);
                fs.mkdirSync(newOutputDirectory, { recursive: true });
                processDirectory(filePath, newOutputDirectory);
            } else if (stats.isFile() && path.extname(file).toLowerCase() === '.html') {
                const htmlContent = fs.readFileSync(filePath, 'utf8');
                const $ = cheerio.load(htmlContent);

                const scriptTag = $('script#data-deferred-state-0');
                let scriptContent = '';

                if (scriptTag.length > 0) {
                    scriptContent = scriptTag.html();
                }

                // Altera a extensão do arquivo de saída para .json
                const outputFileName = path.basename(file, '.html') + '.json';
                const outputFilePath = path.join(outputBasePath, outputFileName);
                fs.writeFileSync(outputFilePath, scriptContent, 'utf8');
            }
        });
    } catch (error) {
        console.error(`Error processing directory ${directoryPath}:`, error);
    }
};

const projectRoot = process.cwd();
const startingBaseDir = path.join(projectRoot, 'html/rooms/original');
const outputRoot = path.join(projectRoot, 'html/rooms/optimized');

try {
    if (fs.existsSync(outputRoot)) {
        fs.rmSync(outputRoot, { recursive: true, force: true });
        console.log(`Pasta existente removida: ${outputRoot}`);
    }
    fs.mkdirSync(outputRoot, { recursive: true });

    processDirectory(startingBaseDir, outputRoot);
    console.log('Processamento concluído. Arquivos otimizados salvos em:', outputRoot);

} catch (error) {
    console.error(`Erro ao processar o diretório base:`, error);
    process.exit(1);
}