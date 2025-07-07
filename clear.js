const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const attributesToKeep = [
    'id',
    'itemprop',
    'content'
];

const elementsToRemoveSelector = 'div[class="f1rykmw3 atm_da_cbdd7d dir dir-ltr"]';

const processDirectory = (directoryPath) => {
    try {
        const files = fs.readdirSync(directoryPath);

        files.forEach(file => {
            const filePath = path.join(directoryPath, file);
            const stats = fs.statSync(filePath);

            if (stats.isDirectory()) {
                processDirectory(filePath);
            } else if (stats.isFile() && path.extname(file).toLowerCase() === '.html') {
                const htmlContent = fs.readFileSync(filePath, 'utf8');
                const $ = cheerio.load(htmlContent);

                const $mainTag = $('main');

                if ($mainTag.length === 0) {
                    fs.writeFileSync(filePath, '', 'utf8');
                    return;
                }
                $(elementsToRemoveSelector).remove();
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

                let cleanedHtml = $.html($mainTag);

                cleanedHtml = cleanedHtml.replace(/[\r\n]+/g, '');
                cleanedHtml = cleanedHtml.replace(/\s{2,}/g, ' ');
                cleanedHtml = cleanedHtml.trim();

                fs.writeFileSync(filePath, cleanedHtml, 'utf8');
            }
        });
    } catch (error) {
        // Handle error, e.g., log it
    }
};

const jobArg = process.argv[2]; 
const startingDir = path.join(__dirname, `test/jobs/${jobArg}`);
processDirectory(startingDir);