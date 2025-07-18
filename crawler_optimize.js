const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const attributesToKeep = [
    'id',
    'itemprop',
    'content'
];

const elementsToRemove = [
    {
        name: 'Próximos dias 1',
        selector: 'div[class="f1rykmw3 atm_da_cbdd7d dir dir-ltr"]'
    },
    {
        name: 'Proximos dias box',
        selector: 'div[class="f1szzjq8 atm_gq_dnsvzo atm_h3_1od0ugv dir dir-ltr"]'
    },
    /*
        {
            name: 'Main Last Child',
            selector: 'main > :nth-child(2) > :last-child'
        },
    */

];

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

                const $mainTag = $('main');

                let cleanedHtml = '';
                if ($mainTag.length > 0) {
                    elementsToRemove.forEach(elementToRemove => {
                        const elementsRemoved = $(elementToRemove.selector).remove();
                        if (elementsRemoved.length > 0) {
                            console.log(`Removed ${elementsRemoved.length} elements matching "${elementToRemove.name}" from ${filePath}`);
                        }
                    });

                    $mainTag.find('script, style, link, svg').remove();

                    $mainTag.find('*').each(function() {
                        const element = $(this);
                        const attrs = { ...element.attr() };

                        for (const attrName in attrs) {
                            if (!attributesToKeep.includes(attrName)) {
                                element.removeAttr(attrName);
                            }
                        }
                    });

                    cleanedHtml = $.html($mainTag);
                    cleanedHtml = cleanedHtml.replace(/[\r\n]+/g, '');
                    cleanedHtml = cleanedHtml.replace(/\s{2,}/g, ' ');
                    cleanedHtml = cleanedHtml.trim();
                }

                const outputFilePath = path.join(outputBasePath, file);
                fs.writeFileSync(outputFilePath, cleanedHtml, 'utf8');
            }
        });
    } catch (error) {
        console.error(`Error processing directory ${directoryPath}:`, error);
    }
};

const startingBaseDir = path.join(__dirname, 'html/original/jobs');
const outputRoot = path.join(__dirname, 'html/optimized');

try {
    if (fs.existsSync(outputRoot)) {
        fs.rmSync(outputRoot, { recursive: true, force: true });
        console.log(`Pasta existente removida: ${outputRoot}`);
    }
    fs.mkdirSync(outputRoot, { recursive: true });

    const jobFolders = fs.readdirSync(startingBaseDir).filter(file => {
        return fs.statSync(path.join(startingBaseDir, file)).isDirectory();
    });

    jobFolders.forEach(jobFolder => {
        const currentStartingDir = path.join(startingBaseDir, jobFolder);
        const currentOutputStartingDir = path.join(outputRoot, `jobs/${jobFolder}`);
        fs.mkdirSync(currentOutputStartingDir, { recursive: true });
        processDirectory(currentStartingDir, currentOutputStartingDir);
    });

} catch (error) {
    console.error(`Erro ao processar o diretório base:`, error);
    process.exit(1);
}