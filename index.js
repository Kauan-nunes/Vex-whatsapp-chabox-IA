const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Configuração da API DeepSeek
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

// Banco de dados em memória
let groupData = {};
let authorizedGroups = new Set(); // Grupos onde Vex está autorizado

client.on('qr', (qr) => {
    console.log('📱 Escaneie este QR code com seu WhatsApp:');
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    console.log('✅ Vex Bot com IA conectado!');
    console.log('🧠 Usando DeepSeek para categorização inteligente');
    console.log('🔒 Vex só responderá em grupos autorizados com "/adicionar vex"');
});

client.on('message', async (message) => {
    if (message.from === 'status@broadcast' || message.from === 'broadcast') return;
    if (message.type === 'broadcast') return;
    
    try {
        const response = await processVexMessage(message);
        if (response) {
            message.reply(response);
        }
    } catch (error) {
        console.error('Erro:', error);
    }
});

// Função principal do Vex
async function processVexMessage(message) {
    const groupId = message.from;
    const userMessage = message.body.trim();
    const isGroup = groupId.includes('@g.us');
    
    if (!userMessage) return null;
    
    console.log(`💬 Mensagem de ${getSenderName(message)}: ${userMessage}`);

    // Comando para adicionar Vex ao grupo
    if (userMessage.toLowerCase() === '/adicionar vex') {
        authorizedGroups.add(groupId);
        return `🤖 *Vex ativado!* 
        
Agora estou pronto para ajudar neste grupo! 

*Comandos disponíveis:*
🎬 Entretenimento: Envie nomes de filmes/séries
💰 Gastos: "descrição valor" (ex: uber 25)
🛒 Compras: "itens" (ex: leite, pão, ovos)

*Comandos especiais:*
!ajuda - Mostra ajuda completa
!status - Status das listas
!limpar - Limpa todos os dados
!vexinfo - Informações do Vex`;
    }

    // Se não for grupo ou grupo não autorizado, ignorar
    if (!isGroup || !authorizedGroups.has(groupId)) {
        return null;
    }

    // Inicializar grupo se não existir
    if (!groupData[groupId]) {
        groupData[groupId] = await detectGroupTypeWithAI(userMessage);
    }
    
    const groupType = groupData[groupId].type;
    
    // Comandos especiais do Vex
    if (userMessage.toLowerCase() === '!ajuda') {
        return getVexHelpMessage(groupType);
    }
    
    if (userMessage.toLowerCase() === '!limpar') {
        return clearGroupData(groupId);
    }
    
    if (userMessage.toLowerCase() === '!status') {
        return getGroupStatus(groupId, groupType);
    }
    
    if (userMessage.toLowerCase() === '!vexinfo') {
        return getVexInfo(groupId);
    }

    // Se for comando de remover Vex
    if (userMessage.toLowerCase() === '/remover vex') {
        authorizedGroups.delete(groupId);
        return '🤖 Vex removido deste grupo. Use "/adicionar vex" para me ativar novamente.';
    }

    // Processamento com IA para grupos autorizados
    switch(groupType) {
        case 'entretenimento':
            return await processEntertainmentItemWithAI(userMessage, groupId);
        case 'gastos':
            return await processExpenseItemWithAI(userMessage, groupId);
        case 'compras':
            return await processShoppingItemWithAI(userMessage, groupId);
        default:
            return await processEntertainmentItemWithAI(userMessage, groupId);
    }
}

// 🧠 FUNÇÃO PRINCIPAL DE IA
async function callDeepSeekAI(prompt, systemMessage = "Você é um assistente útil.") {
    if (!DEEPSEEK_API_KEY) {
        throw new Error('API Key do DeepSeek não configurada');
    }
    
    try {
        const response = await axios.post(DEEPSEEK_URL, {
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: prompt }
            ],
            max_tokens: 500,
            temperature: 0.3
        }, {
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Erro na API DeepSeek:', error.response?.data || error.message);
        throw new Error('Falha na comunicação com IA');
    }
}

// 🎬 ENTERTENIMENTO COM IA
async function processEntertainmentItemWithAI(message, groupId) {
    if (message.length < 2) return null;
    
    try {
        const categoryPrompt = `Categorize este conteúdo em: filme, série, desenho, documentário, anime, livro, outros. Conteúdo: "${message}" - Responda APENAS com o nome da categoria.`;
        
        const category = await callDeepSeekAI(categoryPrompt, "Você categoriza conteúdos de entretenimento.");
        
        if (!groupData[groupId].items) groupData[groupId].items = [];
        
        const existingItem = groupData[groupId].items.find(i => 
            i.name.toLowerCase() === message.toLowerCase()
        );
        
        if (!existingItem) {
            groupData[groupId].items.push({
                name: message,
                category: category.toLowerCase(),
                added: new Date().toLocaleDateString('pt-BR'),
                addedBy: getSenderName(message)
            });
            
            return `🎬 "${message}" adicionado como ${category}!`;
        }
        
        return `ℹ️ "${message}" já está na lista.`;
        
    } catch (error) {
        return `🎬 "${message}" adicionado à lista!`;
    }
}

// 💰 GASTOS COM IA
async function processExpenseItemWithAI(message, groupId) {
    try {
        const expensePrompt = `Extraia descrição e valor deste gasto e categorize em: mercado, transporte, lazer, comida, saúde, educação, contas, outros. Mensagem: "${message}" - Responda no formato: descricao|valor|categoria`;

        const aiResponse = await callDeepSeekAI(expensePrompt, "Você extrai informações de gastos financeiros.");
        
        const parts = aiResponse.split('|');
        if (parts.length !== 3) throw new Error('Formato inválido');
        
        const description = parts[0].trim();
        const value = parseFloat(parts[1]);
        const category = parts[2].trim().toLowerCase();
        
        if (!groupData[groupId].items) groupData[groupId].items = [];
        
        groupData[groupId].items.push({
            description: description,
            value: value,
            category: category,
            date: new Date().toLocaleDateString('pt-BR'),
            addedBy: getSenderName(message)
        });
        
        const itemCount = groupData[groupId].items.length;
        if (itemCount % 3 === 0) {
            return getExpensesSummary(groupId);
        }
        
        return `✅ ${description} - R$ ${value.toFixed(2)} (${category})`;
        
    } catch (error) {
        return "💰 Formato: 'descrição valor' - Ex: 'uber 15' ou 'mercado 150'";
    }
}

// 🛒 COMPRAS COM IA
async function processShoppingItemWithAI(message, groupId) {
    if (message.toLowerCase().includes('mostrar')) {
        return getShoppingList(groupId);
    }
    
    try {
        const shoppingPrompt = `Liste os itens de compra desta mensagem: "${message}" - Responda com os itens separados por vírgula.`;

        const aiResponse = await callDeepSeekAI(shoppingPrompt, "Você identifica itens de lista de compras.");
        
        const items = aiResponse.split(',').map(item => item.trim()).filter(item => item);
        
        if (!groupData[groupId].items) groupData[groupId].items = [];
        
        let addedCount = 0;
        items.forEach(item => {
            if (!groupData[groupId].items.find(i => i.toLowerCase() === item.toLowerCase())) {
                groupData[groupId].items.push(item);
                addedCount++;
            }
        });
        
        return `🛒 ${addedCount} item(s) adicionado(s)!`;
        
    } catch (error) {
        return "🛒 Use: 'item1, item2' ou 'mostrar lista'";
    }
}

// 🧠 DETECÇÃO DE TIPO COM IA
async function detectGroupTypeWithAI(message) {
    try {
        const detectionPrompt = `Esta mensagem é sobre entretenimento, gastos ou compras? Mensagem: "${message}" - Responda APENAS com: entretenimento, gastos ou compras.`;

        const aiResponse = await callDeepSeekAI(detectionPrompt);
        
        const validTypes = ['entretenimento', 'gastos', 'compras'];
        const detectedType = aiResponse.toLowerCase().trim();
        
        return { 
            type: validTypes.includes(detectedType) ? detectedType : 'compras', 
            items: [] 
        };
        
    } catch (error) {
        return { type: 'compras', items: [] };
    }
}

// 📊 FUNÇÕES AUXILIARES DO VEX
function getExpensesSummary(groupId) {
    const items = groupData[groupId].items;
    if (!items || items.length === 0) return "💰 Nenhum gasto registrado!";
    
    const byCategory = {};
    let total = 0;
    
    items.forEach(item => {
        if (!byCategory[item.category]) {
            byCategory[item.category] = { total: 0, items: [] };
        }
        byCategory[item.category].total += item.value;
        byCategory[item.category].items.push(item);
        total += item.value;
    });
    
    let response = `💰 *RESUMO DE GASTOS* - Total: R$ ${total.toFixed(2)} (${items.length} gastos)\n\n`;
    
    Object.keys(byCategory).forEach(category => {
        const catData = byCategory[category];
        const percentage = ((catData.total / total) * 100).toFixed(1);
        response += `📁 ${category.toUpperCase()}: R$ ${catData.total.toFixed(2)} (${percentage}%)\n`;
    });
    
    return response;
}

function getShoppingList(groupId) {
    const items = groupData[groupId].items;
    if (!items || items.length === 0) return "🛒 Lista vazia!";
    
    let response = `🛒 *LISTA DE COMPRAS* (${items.length} itens):\n\n`;
    items.forEach((item, index) => {
        response += `${index + 1}. ${item}\n`;
    });
    return response;
}

function clearGroupData(groupId) {
    const count = groupData[groupId].items ? groupData[groupId].items.length : 0;
    groupData[groupId].items = [];
    return `🗑️ ${count} itens removidos.`;
}

function getGroupStatus(groupId, groupType) {
    const items = groupData[groupId].items;
    const count = items ? items.length : 0;
    
    switch(groupType) {
        case 'entretenimento':
            return `🎬 ${count} itens na lista para assistir/ler`;
        case 'gastos':
            const total = items ? items.reduce((sum, item) => sum + item.value, 0) : 0;
            return `💰 ${count} gastos - Total: R$ ${total.toFixed(2)}`;
        case 'compras':
            return `🛒 ${count} itens na lista de compras`;
        default:
            return `📊 ${count} itens no grupo`;
    }
}

function getVexInfo(groupId) {
    const groupType = groupData[groupId] ? groupData[groupId].type : 'não definido';
    const itemsCount = groupData[groupId] && groupData[groupId].items ? groupData[groupId].items.length : 0;
    const authorizedGroupsCount = authorizedGroups.size;
    
    return `🤖 *INFORMAÇÕES DO VEX*
    
📊 *Status deste grupo:*
• Tipo: ${groupType}
• Itens: ${itemsCount}
• Autorizado: ✅ Sim

🌐 *Status global:*
• Grupos autorizados: ${authorizedGroupsCount}
• IA: ${DEEPSEEK_API_KEY ? '✅ Conectada' : '❌ Desconectada'}

💡 Use !ajuda para ver todos os comandos`;
}

function getSenderName(message) {
    return message._data?.notifyName || message.author || message.from.split('@')[0];
}

function getVexHelpMessage(groupType) {
    const baseHelp = `🤖 *VEX BOT - AJUDA*

*Para me ativar em um grupo:*
\`/adicionar vex\`

*Para me remover:*
\`/remover vex\`

*Comandos do sistema:*
!ajuda - Mostra esta mensagem
!status - Status das listas
!limpar - Limpa todos os dados
!vexinfo - Informações do Vex

*Funcionalidades automáticas:*
🎬 *Entretenimento* - Envie nomes de filmes/séries
💰 *Gastos* - "descrição valor" (ex: uber 25)
🛒 *Compras* - "itens" (ex: leite, pão, ovos)`;

    return baseHelp;
}

client.initialize();