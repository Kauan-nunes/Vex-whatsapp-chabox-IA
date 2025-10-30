const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

// Servidor web
app.use(express.json());
app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        bot: 'Vex - IA Inteligente',
        features: 'Linguagem natural, listas permanentes'
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor web na porta ${PORT}`);
});

// ✅ SESSÃO PERSISTENTE
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "vex-bot-permanent-v2"
    }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

// ✅ BANCO DE DADOS SIMPLES
let lists = {
    entretenimento: [], // 🎬 NUNCA reseta
    compras: [],        // 🛒 Reseta manualmente
    gastos: []          // 💰 Reseta mensalmente
};

let lastReset = {
    compras: new Date(),
    gastos: new Date()
};

let authorizedGroups = new Set();

client.on('qr', (qr) => {
    console.log('📱 QR Code para conexão INICIAL:');
    qrcode.generate(qr, {small: true});
    console.log('💡 Escaneie UMA VEZ - sessão permanente');
});

client.on('authenticated', () => {
    console.log('✅ SESSÃO SALVA - Reconexão automática ativa');
});

client.on('ready', () => {
    console.log('🚀 VEX CONECTADO PERMANENTEMENTE!');
    console.log('🧠 Modo: Linguagem natural com IA');
    console.log('💾 Listas: Entretenimento (permanente), Compras/Gastos (resetáveis)');
});

// ✅ PROCESSAMENTO DE MENSAGENS
client.on('message', async (message) => {
    if (message.from === 'status@broadcast') return;
    
    const isGroup = message.from.includes('@g.us');
    const shouldProcess = !isGroup || authorizedGroups.has(message.from);
    
    if (!shouldProcess) return;
    
    console.log(`💬 Mensagem: "${message.body}"`);
    
    try {
        const response = await processWithAI(message.body, message.from);
        if (response) {
            await message.reply(response);
        }
    } catch (error) {
        console.error('❌ Erro:', error);
        message.reply('🤖 Desculpe, tive um problema. Tente novamente.');
    }
});

// ✅ IA PARA PROCESSAMENTO DE LINGUAGEM NATURAL
async function processWithAI(userMessage, context) {
    try {
        const prompt = `Analise esta mensagem e determine a ação. Opções:

ENTRETENIMENTO - Adicionar filme/série/livro (lista PERMANENTE)
COMPRAS - Adicionar item à lista de compras (lista TEMPORÁRIA) 
GASTOS - Registrar gasto financeiro (lista TEMPORÁRIA)
CONSULTA - Mostrar listas
REMOVER - Remover item específico (só entretenimento)
RESET - Limpar lista de compras ou gastos
AJUDA - Ajuda geral

Mensagem: "${userMessage}"

Responda em JSON:
{
  "acao": "ENTRETENIMENTO|COMPRAS|GASTOS|CONSULTA|REMOVER|RESET|AJUDA",
  "dados": {dados relevantes},
  "resposta": "resposta em português"
}`;

        const aiResponse = await callDeepSeekAI(prompt, "Você é o Vex, um assistente inteligente para organizar listas.");
        
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return await fallbackProcessing(userMessage);
        }
        
        const actionData = JSON.parse(jsonMatch[0]);
        return await executeAction(actionData, userMessage, context);
        
    } catch (error) {
        console.error('Erro na IA:', error);
        return await fallbackProcessing(userMessage);
    }
}

// ✅ EXECUTAR AÇÃO DA IA
async function executeAction(actionData, originalMessage, context) {
    switch(actionData.acao) {
        case 'ENTRETENIMENTO':
            return await addEntertainment(originalMessage);
            
        case 'COMPRAS':
            return await addShoppingItem(originalMessage);
            
        case 'GASTOS':
            return await addExpense(originalMessage);
            
        case 'CONSULTA':
            return showAllLists();
            
        case 'REMOVER':
            return await removeEntertainmentItem(originalMessage);
            
        case 'RESET':
            return resetLists(originalMessage);
            
        case 'AJUDA':
            return getSmartHelp();
            
        default:
            return await fallbackProcessing(originalMessage);
    }
}

// ✅ ADICIONAR ENTRETENIMENTO (PERMANENTE)
async function addEntertainment(message) {
    try {
        const prompt = `Extraia o nome do conteúdo de entretenimento e categorize. Mensagem: "${message}" - Formato: nome|categoria`;
        
        const response = await callDeepSeekAI(prompt, "Você identifica conteúdos de entretenimento.");
        const [name, category] = response.split('|');
        
        if (!name) return "🎬 Não identifiquei o que quer adicionar. Ex: 'Quero assistir Interestelar'";
        
        // Verificar se já existe
        const exists = lists.entretenimento.find(item => 
            item.name.toLowerCase().includes(name.toLowerCase()) || 
            name.toLowerCase().includes(item.name.toLowerCase())
        );
        
        if (exists) {
            return `🎬 "${exists.name}" já está na lista como ${exists.category}!`;
        }
        
        lists.entretenimento.push({
            name: name.trim(),
            category: (category || 'filme').trim().toLowerCase(),
            added: new Date().toLocaleDateString('pt-BR'),
            watched: false
        });
        
        return `🎬 "${name}" adicionado como ${category || 'filme'}! Lista atual: ${lists.entretenimento.length} itens.`;
        
    } catch (error) {
        // Fallback simples
        lists.entretenimento.push({
            name: message,
            category: 'entretenimento',
            added: new Date().toLocaleDateString('pt-BR'),
            watched: false
        });
        return `🎬 "${message}" adicionado à lista!`;
    }
}

// ✅ ADICIONAR COMPRAS
async function addShoppingItem(message) {
    try {
        const prompt = `Extraia os itens de compra desta mensagem: "${message}" - Responda com lista separada por vírgulas.`;
        
        const response = await callDeepSeekAI(prompt, "Você identifica itens de lista de compras.");
        const items = response.split(',').map(item => item.trim()).filter(item => item);
        
        if (items.length === 0) {
            return "🛒 Não identifiquei itens. Ex: 'Preciso comprar leite e pão'";
        }
        
        let added = 0;
        items.forEach(item => {
            if (!lists.compras.find(i => i.toLowerCase() === item.toLowerCase())) {
                lists.compras.push(item);
                added++;
            }
        });
        
        return `🛒 ${added} item(s) adicionado(s)! Lista de compras: ${lists.compras.length} itens.`;
        
    } catch (error) {
        // Fallback
        if (!lists.compras.includes(message)) {
            lists.compras.push(message);
        }
        return `🛒 "${message}" adicionado às compras!`;
    }
}

// ✅ ADICIONAR GASTOS
async function addExpense(message) {
    try {
        const prompt = `Extraia descrição e valor deste gasto: "${message}" - Formato: descricao|valor`;
        
        const response = await callDeepSeekAI(prompt, "Você extrai informações financeiras.");
        const [description, valueStr] = response.split('|');
        
        if (!description || !valueStr) {
            return "💰 Não entendi o gasto. Ex: 'Gastei 25 reais no uber'";
        }
        
        const value = parseFloat(valueStr.replace(',', '.'));
        
        lists.gastos.push({
            description: description.trim(),
            value: value,
            date: new Date().toLocaleDateString('pt-BR'),
            category: await categorizeExpense(description)
        });
        
        const total = lists.gastos.reduce((sum, item) => sum + item.value, 0);
        return `✅ ${description.trim()} - R$ ${value.toFixed(2)} registrado! Total do mês: R$ ${total.toFixed(2)}`;
        
    } catch (error) {
        return "💰 Formato: 'descrição valor'. Ex: 'jantar 80' ou 'uber 25'";
    }
}

// ✅ CATEGORIZAR GASTOS COM IA
async function categorizeExpense(description) {
    try {
        const prompt = `Categorize este gasto: "${description}" - Opções: alimentação, transporte, lazer, casa, saúde, outros`;
        const category = await callDeepSeekAI(prompt, "Você categoriza gastos financeiros.");
        return category.toLowerCase();
    } catch (error) {
        return 'outros';
    }
}

// ✅ REMOVER ENTRETENIMENTO (APENAS MARCA COMO ASSISTIDO)
async function removeEntertainmentItem(message) {
    try {
        const prompt = `Qual conteúdo foi assistido/lido? Mensagem: "${message}" - Responda com o nome exato.`;
        
        const itemName = await callDeepSeekAI(prompt, "Você identifica conteúdos de entretenimento.");
        
        const item = lists.entretenimento.find(item => 
            item.name.toLowerCase().includes(itemName.toLowerCase()) ||
            itemName.toLowerCase().includes(item.name.toLowerCase())
        );
        
        if (item) {
            item.watched = true;
            item.watchedDate = new Date().toLocaleDateString('pt-BR');
            return `✅ "${item.name}" marcado como assistido! 🎉`;
        } else {
            const suggestions = lists.entretenimento.filter(item => !item.watched).slice(0, 3);
            if (suggestions.length > 0) {
                return `❌ Não encontrei "${itemName}". Itens na lista: ${suggestions.map(i => i.name).join(', ')}`;
            }
            return "❌ Não encontrei na lista. Use 'mostrar lista' para ver todos.";
        }
        
    } catch (error) {
        return "❌ Não consegui identificar o que quer remover. Ex: 'Já assisti Interestelar'";
    }
}

// ✅ RESET DE LISTAS
function resetLists(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('compra') || lowerMessage.includes('mercado')) {
        const count = lists.compras.length;
        lists.compras = [];
        lastReset.compras = new Date();
        return `🗑️ Lista de compras limpa! ${count} itens removidos.`;
    }
    
    if (lowerMessage.includes('gasto') || lowerMessage.includes('dinheiro')) {
        const count = lists.gastos.length;
        const total = lists.gastos.reduce((sum, item) => sum + item.value, 0);
        lists.gastos = [];
        lastReset.gastos = new Date();
        return `🗑️ Gastos do mês resetados! ${count} gastos (R$ ${total.toFixed(2)}) removidos.`;
    }
    
    return "❌ Especifique: 'limpar compras' ou 'resetar gastos'";
}

// ✅ MOSTRAR TODAS AS LISTAS
function showAllLists() {
    const entretenimentoAtivos = lists.entretenimento.filter(item => !item.watched);
    const entretenimentoAssistidos = lists.entretenimento.filter(item => item.watched);
    const totalGastos = lists.gastos.reduce((sum, item) => sum + item.value, 0);
    
    let response = `📊 *LISTAS DO VEX*\n\n`;
    
    // 🎬 Entretenimento
    response += `🎬 *Para Assistir/Ler* (${entretenimentoAtivos.length}):\n`;
    if (entretenimentoAtivos.length > 0) {
        entretenimentoAtivos.forEach((item, index) => {
            response += `${index + 1}. ${item.name} (${item.category})\n`;
        });
    } else {
        response += `Nada na lista 🎉\n`;
    }
    
    response += `\n✅ *Já Vistos* (${entretenimentoAssistidos.length}):\n`;
    if (entretenimentoAssistidos.length > 0) {
        response += entretenimentoAssistidos.map(item => `• ${item.name}`).join('\n');
    } else {
        response += `Nada ainda\n`;
    }
    
    // 🛒 Compras
    response += `\n🛒 *Compras* (${lists.compras.length}):\n`;
    if (lists.compras.length > 0) {
        lists.compras.forEach((item, index) => {
            response += `${index + 1}. ${item}\n`;
        });
    } else {
        response += `Lista vazia 🛍️\n`;
    }
    
    // 💰 Gastos
    response += `\n💰 *Gastos do Mês* (${lists.gastos.length}):\n`;
    if (lists.gastos.length > 0) {
        const byCategory = {};
        lists.gastos.forEach(item => {
            byCategory[item.category] = (byCategory[item.category] || 0) + item.value;
        });
        
        Object.entries(byCategory).forEach(([category, total]) => {
            response += `• ${category}: R$ ${total.toFixed(2)}\n`;
        });
        response += `Total: R$ ${totalGastos.toFixed(2)}\n`;
    } else {
        response += `Nenhum gasto registrado 💵\n`;
    }
    
    return response;
}

// ✅ AJUDA INTELIGENTE
function getSmartHelp() {
    return `🤖 *VEX - AJUDA INTELIGENTE*

*Fale naturalmente!* Exemplos:

🎬 *Entretenimento (PERMANENTE):*
"Quero assistir Interestelar"
"Adiciona Stranger Things na lista"
"Já assisti Oppenheimer" ✅

🛒 *Compras (resetável):*
"Preciso comprar leite e pão"
"Adiciona café na lista do mercado"
"limpar lista de compras" 🗑️

💰 *Gastos (resetável):*
"Gastei 25 no uber"
"Almoço 45 reais"
"resetar gastos do mês" 🗑️

📊 *Consultas:*
"mostrar todas as listas"
"o que tem pra assistir?"

*Lembre: Entretenimento fica pra sempre, compras/gastos podem ser resetados!*`;
}

// ✅ FALLBACK PARA IA
async function fallbackProcessing(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('ajuda') || lowerMessage === '?') {
        return getSmartHelp();
    }
    
    if (lowerMessage.includes('lista') || lowerMessage.includes('mostrar') || lowerMessage.includes('ver ')) {
        return showAllLists();
    }
    
    if (lowerMessage.includes('limpar') || lowerMessage.includes('reset')) {
        return resetLists(message);
    }
    
    if (lowerMessage.includes('assisti') || lowerMessage.includes('vi ') || lowerMessage.includes('já ')) {
        return await removeEntertainmentItem(message);
    }
    
    if (/\d/.test(message) && (lowerMessage.includes('r$') || lowerMessage.includes('real') || lowerMessage.includes('gastei'))) {
        return await addExpense(message);
    }
    
    if (lowerMessage.includes('compr') || lowerMessage.includes('mercado') || lowerMessage.includes('super')) {
        return await addShoppingItem(message);
    }
    
    // Padrão fallback - assume entretenimento
    return await addEntertainment(message);
}

// ✅ IA DEEPSEEK
async function callDeepSeekAI(prompt, systemMessage = "Você é um assistente útil.") {
    if (!DEEPSEEK_API_KEY) {
        throw new Error('API não configurada');
    }
    
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
}

// ✅ INICIALIZAÇÃO
client.initialize();

console.log('🔄 Vex Bot - Versão Definitiva Iniciando...');
console.log('🧠 IA: ' + (DEEPSEEK_API_KEY ? '✅ Conectada' : '❌ Offline'));