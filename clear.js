const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// --- Vetor de atributos para MANTER ---
// Todos os outros atributos serão removidos.
const attributesToKeep = [
    'id',
    'itemprop'
];

// Define os caminhos para os arquivos de entrada e saída
const inputFile = path.join(__dirname, 'test', 'original.html');
const outputFile = path.join(__dirname, 'test', 'new.html');
const outputDir = path.dirname(outputFile);

try {
    // Garante que o diretório de saída exista
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Lê o conteúdo do arquivo HTML original
    const htmlContent = fs.readFileSync(inputFile, 'utf8');
    const originalSize = htmlContent.length;

    // Carrega o HTML no Cheerio para manipulação
    const $ = cheerio.load(htmlContent);

    // --- Nova lógica para manter apenas a tag <main> e seu conteúdo ---
    // Encontra a tag <main>
    const $mainTag = $('main');

    // Se a tag <main> não for encontrada, ou se estiver vazia, pode lidar com isso aqui
    if ($mainTag.length === 0) {
        console.warn("A tag <main> não foi encontrada no arquivo original. Nenhum arquivo será gerado.");
        // Você pode optar por criar um arquivo vazio, ou outra lógica.
        fs.writeFileSync(outputFile, '', 'utf8');
        return; // Sai da execução
    }

    // Remove todas as tags <script> e <style> DENTRO da tag <main>
    $mainTag.find('script, style, link, svg').remove();

    // Itera sobre todos os elementos DENTRO da tag <main> para remover os atributos indesejados
    $mainTag.find('*').each(function() {
        const element = $(this); // Use a instância '$' principal para manipular o elemento
        const attrs = { ...element.attr() };

        for (const attrName in attrs) {
            if (!attributesToKeep.includes(attrName)) {
                element.removeAttr(attrName);
            }
        }
    });

    // Agora, queremos que o HTML final contenha APENAS a tag <main> (já limpa)
    // Para isso, vamos obter o HTML da $mainTag e encapsulá-la, se necessário.
    // O .html() do Cheerio no objeto '$' original já vai incluir a tag <main>
    // Se quisermos apenas a tag <main> e seu conteúdo limpos, o ideal é pegar seu outerHTML.
    let cleanedHtml = $.html($mainTag); // Isso pega o HTML externo da tag <main>

    // --- Linhas para remover quebras de linha e espaços múltiplos ---
    cleanedHtml = cleanedHtml.replace(/[\r\n]+/g, '');
    cleanedHtml = cleanedHtml.replace(/\s{2,}/g, ' ');
    cleanedHtml = cleanedHtml.trim();
    // --- Fim das linhas ---

    const cleanedSize = cleanedHtml.length;

    // Escreve o HTML limpo no novo arquivo
    fs.writeFileSync(outputFile, cleanedHtml, 'utf8');

    console.log(`Arquivo HTML limpo com sucesso! Verifique o arquivo: ${outputFile}`);
    console.log(`Atributos mantidos: ${attributesToKeep.join(', ')}`);
    console.log(`Tamanho do arquivo original: ${originalSize} caracteres`);
    console.log(`Tamanho do arquivo limpo (apenas <main> com seu conteúdo): ${cleanedSize} caracteres`);
    console.log(`Economia de caracteres: ${originalSize - cleanedSize} caracteres`);

} catch (error) {
    console.error('Ocorreu um erro durante o processo:', error);
}