const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config(); // Adicionado para carregar variáveis de ambiente

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function processRoomJsonFiles(startPath) {
    if (!fs.existsSync(startPath)) {
        console.error(`${red}Erro: Diretório não encontrado: ${startPath}${reset}`);
        return;
    }

    try {
        const files = fs.readdirSync(startPath);

        for (const file of files) {
            const filePath = path.join(startPath, file);

            try {
                const stat = fs.lstatSync(filePath);

                if (stat.isDirectory()) {
                    await processRoomJsonFiles(filePath);
                } else if (file.endsWith('.json')) {
                    const roomID = path.basename(file, '.json');

                    try {
                        const jsonData = fs.readFileSync(filePath, 'utf-8');
                        const roomData = JSON.parse(jsonData);

                        let htmlDescription = findAttributeInObject(roomData, 'htmlDescription');

                        if (!htmlDescription) {
                            console.error(`${red}Erro [${roomID}]: 'htmlDescription' não encontrado no arquivo JSON. Todo o processamento para este ID pode estar incorreto.${reset}`);
                            continue;
                        }

                        let previewImages = findAttributeInObject(roomData, 'previewImages');

                        let tiny_description = roomData.niobeClientData?.[0]?.[1]?.data?.presentation?.stayProductDetailPage?.sections?.metadata?.seoFeatures?.ogTags?.ogTitle;
                        let title = roomData.niobeClientData?.[0]?.[1]?.data?.presentation?.stayProductDetailPage?.sections?.metadata?.seoFeatures?.ogTags?.ogDescription;
                        let description = htmlDescription.htmlText;
                        let favorite = Boolean(findAttributeInObject(roomData, 'isGuestFavorite'));
                        let superhost = Boolean(findAttributeInObject(roomData, 'isSuperhost'));
                        let images = previewImages ? previewImages.map(img => img.baseUrl) : [];
                        let host = findAttributeInObject(roomData, 'hostId');

                        const payloadToUpsert = {
                            id: roomID,
                            tiny_description,
                            title,
                            description,
                            favorite,
                            superhost,
                            images,
                            host
                        };

                        const { error: upsertError } = await supabase
                            .from('rooms')
                            .upsert(payloadToUpsert, { onConflict: 'id', ignoreDuplicates: false });

                        if (upsertError) {
                            console.error(`${red}Erro [${roomID}] ao realizar upsert no Supabase: ${upsertError.message}${reset}`);
                        } else {
                            console.log(`${green}Sucesso: arquivo [${roomID}.json] processado e upsert realizado.${reset}`);
                        }

                    } catch (jsonError) {
                        console.error(`${red}Erro [${roomID}] ao processar o arquivo JSON: ${jsonError.message}${reset}`);
                    }
                }
            } catch (fileStatError) {
                const roomID = path.basename(file, '.json');
                console.error(`${red}Erro [${roomID}] ao obter informações do arquivo: ${fileStatError.message}${reset}`);
            }
        }
    } catch (readDirError) {
        console.error(`${red}Erro ao ler o diretório ${startPath}: ${readDirError.message}${reset}`);
    }
}

function findAttributeInObject(obj, attributeName) {
    if (typeof obj !== 'object' || obj === null) {
        return null;
    }

    if (obj.hasOwnProperty(attributeName)) {
        return obj[attributeName];
    }

    for (const key in obj) {
        if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
            const result = findAttributeInObject(obj[key], attributeName);
            if (result !== null) {
                return result;
            }
        }
    }

    return null;
}

processRoomJsonFiles('./html/rooms/optimized/');