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

const jobArg = process.argv[2];
if (!jobArg) {
    console.error('Please provide a job argument (e.g., node script.js your_job_name)');
    process.exit(1);
}

const startingDir = path.join(__dirname, `test/jobs/${jobArg}`);
const outputRoot = path.join(__dirname, 'html/optimized');
const outputStartingDir = path.join(outputRoot, `jobs/${jobArg}`);

if (fs.existsSync(outputStartingDir)) {
    fs.rmSync(outputStartingDir, { recursive: true, force: true });
    console.log(`Pasta existente removida: ${outputStartingDir}`);
}

fs.mkdirSync(outputStartingDir, { recursive: true });
processDirectory(startingDir, outputStartingDir);