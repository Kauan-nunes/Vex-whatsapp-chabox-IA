const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "vex-bot"
    }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
    }
});

// Configuração da API DeepSeek
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

// Banco de dados em memória
let groupData = {};
let authorizedGroups = new Set();

// ✅ SERVIDOR WEB PARA O RENDER
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ 
        status: 'online',
        bot: 'Vex',
        message: 'Bot WhatsApp está funcionando!'
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        authorizedGroups: authorizedGroups.size
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor web rodando na porta ${PORT}`);
});

// EVENTOS DO WHATSAPP
client.on('qr', (qr) => {
    console.log('📱 QR Code para conexão:');
    qrcode.generate(qr, {small: true});
    console.log('💡 Escaneie este QR code no WhatsApp');
});

client.on('ready', () => {
    console.log('✅ Vex Bot com IA conectado!');
    console.log('🧠 Usando DeepSeek para categorização inteligente');
    console.log('🔒 Vex só responderá em grupos autorizados com "/adicionar vex"');
    console.log(`🌐 Servidor health: http://localhost:${PORT}/health`);
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

// 🔥 ADICIONE ESTA PARTE CRÍTICA PARA EVITAR MEMÓRIA
client.on('disconnected', (reason) => {
    console.log('❌ Bot desconectado:', reason);
    console.log('🔄 Reiniciando em 5 segundos...');
    setTimeout(() => {
        client.initialize();
    }, 5000);
});

// FUNÇÃO PRINCIPAL DO VEX (MANTENHA TODO O CÓDIGO ANTERIOR AQUI)
async function processVexMessage(message) {
    const groupId = message.from;
    const userMessage = message.body.trim();
    const isGroup = groupId.includes('@g.us');
    
    if (!userMessage) return null;
    
    console.log(`💬 Mensagem de ${getSenderName(message)}: ${userMessage}`);

    // Comando para adicionar Vex ao grupo
    if (userMessage.toLowerCase() === '/adicionar vex') {
        authorizedGroups.add(groupId);
        console.log(`✅ Vex autorizado no grupo: ${groupId}`);
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
        console.log('⚠️ API Key do DeepSeek não configurada');
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

// 🎯 FUNÇÕES SIMPLIFICADAS PARA TESTE
async function processEntertainmentItemWithAI(message, groupId) {
    if (message.length < 2) return null;
    
    try {
        const category = await callDeepSeekAI(`Categorize: "${message}" - Responda com: filme, série, desenho, documentário, anime, livro, outros.`);
        
        if (!groupData[groupId].items) groupData[groupId].items = [];
        
        groupData[groupId].items.push({
            name: message,
            category: category.toLowerCase(),
            added: new Date().toLocaleDateString('pt-BR')
        });
        
        return `🎬 "${message}" adicionado como ${category}!`;
        
    } catch (error) {
        return `🎬 "${message}" adicionado à lista!`;
    }
}

async function processExpenseItemWithAI(message, groupId) {
    try {
        const aiResponse = await callDeepSeekAI(`Extraia: "${message}" - Formato: descricao|valor|categoria`);
        
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
            date: new Date().toLocaleDateString('pt-BR')
        });
        
        return `✅ ${description} - R$ ${value.toFixed(2)} (${category})`;
        
    } catch (error) {
        return "💰 Formato: 'descrição valor' - Ex: 'uber 15'";
    }
}

async function processShoppingItemWithAI(message, groupId) {
    if (message.toLowerCase().includes('mostrar')) {
        return getShoppingList(groupId);
    }
    
    try {
        const aiResponse = await callDeepSeekAI(`Liste itens: "${message}" - Separe por vírgula.`);
        
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
        return "🛒 Use: 'item1, item2'";
    }
}

// 🔄 FUNÇÕES AUXILIARES
async function detectGroupTypeWithAI(message) {
    try {
        const aiResponse = await callDeepSeekAI(`Categorize: "${message}" - Responda: entretenimento, gastos ou compras.`);
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

function getShoppingList(groupId) {
    const items = groupData[groupId].items;
    if (!items || items.length === 0) return "🛒 Lista vazia!";
    
    let response = `🛒 LISTA (${items.length} itens):\n\n`;
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
            return `🎬 ${count} itens na lista`;
        case 'gastos':
            const total = items ? items.reduce((sum, item) => sum + item.value, 0) : 0;
            return `💰 ${count} gastos - Total: R$ ${total.toFixed(2)}`;
        case 'compras':
            return `🛒 ${count} itens na lista`;
        default:
            return `📊 ${count} itens`;
    }
}

function getVexInfo(groupId) {
    const groupType = groupData[groupId] ? groupData[groupId].type : 'não definido';
    const itemsCount = groupData[groupId] && groupData[groupId].items ? groupData[groupId].items.length : 0;
    
    return `🤖 *VEX INFO*
• Tipo: ${groupType}
• Itens: ${itemsCount}
• Autorizado: ✅ Sim
• IA: ${DEEPSEEK_API_KEY ? '✅' : '❌'}`;
}

function getSenderName(message) {
    return message._data?.notifyName || message.from.split('@')[0];
}

function getVexHelpMessage(groupType) {
    return `🤖 *VEX BOT - AJUDA*

*Ativar:* \`/adicionar vex\`
*Remover:* \`/remover vex\`

*Comandos:*
!ajuda - Esta mensagem
!status - Status das listas  
!limpar - Limpa dados
!vexinfo - Info do Vex

*Uso automático:*
🎬 Filmes/séries
💰 "descrição valor"
🛒 "itens, separados"`;
}

// INICIALIZAR
client.initialize();

console.log('🔄 Vex Bot iniciando...');