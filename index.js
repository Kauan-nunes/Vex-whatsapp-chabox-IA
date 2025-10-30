const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ CONFIGURAÇÃO GEMINI (GRATUITA)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Sua chave do Google AI Studio
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent`;

// Servidor web
app.get('/', (req, res) => res.json({ status: 'online', bot: 'Vex Gemini' }));
app.listen(PORT, () => console.log(`🌐 Servidor porta ${PORT}`));

// ✅ CONFIGURAÇÃO ESTÁVEL DO WHATSAPP
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "vex-gemini-permanent",
        dataPath: "./sessions"
    }),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote'
        ],
        headless: true
    },
    // ✅ RECONEXÃO AUTOMÁTICA
    restartOnAuthFail: true,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 15000
});

// ✅ BANCO DE DADOS
let lists = {
    entretenimento: [],
    compras: [], 
    gastos: []
};

let authorizedGroups = new Set();
let isConnected = false;

// ✅ EVENTOS MELHORADOS
client.on('qr', (qr) => {
    console.log('📱 QR Code para conexão INICIAL:');
    qrcode.generate(qr, {small: true});
    console.log('💡 Escaneie UMA VEZ - sessão será salva');
});

client.on('authenticated', () => {
    console.log('✅ Autenticado - Sessão salva!');
});

client.on('auth_failure', (msg) => {
    console.log('❌ Falha na autenticação:', msg);
});

client.on('ready', () => {
    isConnected = true;
    console.log('🚀 VEX GEMINI CONECTADO!');
    console.log('🔒 Sessão permanente ativa');
    console.log('🧠 Gemini: ' + (GEMINI_API_KEY ? '✅ Conectado' : '❌ Usando modo local'));
});

// ✅ RECONEXÃO AUTOMÁTICA
client.on('disconnected', (reason) => {
    isConnected = false;
    console.log('❌ Desconectado:', reason);
    console.log('🔄 Reconectando em 10 segundos...');
    
    setTimeout(() => {
        console.log('🔄 Tentando reconectar...');
        client.initialize().catch(err => {
            console.log('❌ Erro na reconexão:', err);
        });
    }, 10000);
});

// ✅ PROCESSAMENTO ESTÁVEL
client.on('message', async (message) => {
    if (!isConnected) {
        console.log('⏳ Bot desconectado, ignorando mensagem...');
        return;
    }
    
    if (message.from === 'status@broadcast') return;
    
    const isGroup = message.from.includes('@g.us');
    const shouldProcess = !isGroup || authorizedGroups.has(message.from);
    
    if (!shouldProcess) return;
    
    console.log(`💬 Mensagem: "${message.body}"`);
    
    try {
        const response = await processWithGemini(message.body);
        if (response) {
            await message.reply(response);
            console.log('✅ Resposta enviada');
        }
    } catch (error) {
        console.error('❌ Erro no processamento:', error.message);
        // ✅ NÃO PARA O BOT SE HOUVER ERRO
        try {
            await message.reply('🤖 Tive um problema, mas estou funcionando! Tente novamente.');
        } catch (e) {
            console.log('❌ Erro ao enviar mensagem de erro:', e);
        }
    }
});

// ✅ GEMINI API (GRATUITA)
async function callGeminiAI(prompt) {
    if (!GEMINI_API_KEY) {
        throw new Error('Gemini API Key não configurada');
    }
    
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 500,
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text.trim();
}

// ✅ PROCESSAMENTO COM GEMINI
async function processWithGemini(userMessage) {
    // Comando especial de ativação
    if (userMessage.toLowerCase() === '/adicionar vex') {
        authorizedGroups.add(message.from);
        return `🤖 *Vex Gemini Ativado!*
        
Fale naturalmente:
🎬 "Quero assistir Interestelar"
💰 "Gastei 25 no uber"  
🛒 "Preciso comprar pão e leite"
📊 "Mostrar minhas listas"

*Comandos:*
"Já assisti NOME" → Marca como visto
"Limpar compras" → Reseta lista
"Resetar gastos" → Zera gastos`;
    }

    try {
        const prompt = `Você é o Vex, um assistente para organizar listas. 

LISTAS:
- ENTRETENIMENTO: filmes, séries, livros (NUNCA reseta)
- COMPRAS: itens de mercado (reseta com "limpar compras")  
- GASTOS: despesas financeiras (reseta com "resetar gastos")

Analise a mensagem e responda em JSON:

MENSAGEM: "${userMessage}"

JSON:
{
  "acao": "ADICIONAR_ENTRETENIMENTO|ADICIONAR_COMPRAS|ADICIONAR_GASTOS|CONSULTAR|MARCAR_VISTO|RESETAR|AJUDA",
  "dados": {"item": "nome", "valor": número, "categoria": "tipo"},
  "resposta": "resposta amigável em português"
}`;

        const aiResponse = await callGeminiAI(prompt);
        
        // Extrair JSON da resposta
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return await processFallback(userMessage);
        }
        
        const actionData = JSON.parse(jsonMatch[0]);
        return await executeGeminiAction(actionData, userMessage);
        
    } catch (error) {
        console.log('❌ Gemini falhou, usando fallback:', error.message);
        return await processFallback(userMessage);
    }
}

// ✅ EXECUTAR AÇÃO DO GEMINI
async function executeGeminiAction(actionData, originalMessage) {
    switch(actionData.acao) {
        case 'ADICIONAR_ENTRETENIMENTO':
            return addEntertainment(actionData.dados?.item || originalMessage);
            
        case 'ADICIONAR_COMPRAS':
            return addShopping(actionData.dados?.item || originalMessage);
            
        case 'ADICIONAR_GASTOS':
            return addExpense(actionData.dados || originalMessage);
            
        case 'CONSULTAR':
            return showAllLists();
            
        case 'MARCAR_VISTO':
            return markAsWatched(actionData.dados?.item || originalMessage);
            
        case 'RESETAR':
            return resetLists(originalMessage);
            
        case 'AJUDA':
            return getHelp();
            
        default:
            return await processFallback(originalMessage);
    }
}

// ✅ FUNÇÕES PRINCIPAIS
function addEntertainment(item) {
    const entertainmentItem = {
        name: item,
        category: 'filme/série',
        added: new Date().toLocaleDateString('pt-BR'),
        watched: false
    };
    
    // Verificar duplicata
    const exists = lists.entretenimento.find(i => 
        i.name.toLowerCase().includes(item.toLowerCase()) ||
        item.toLowerCase().includes(i.name.toLowerCase())
    );
    
    if (exists) {
        return `🎬 "${exists.name}" já está na lista!`;
    }
    
    lists.entretenimento.push(entertainmentItem);
    return `🎬 "${item}" adicionado! Lista: ${lists.entretenimento.length} itens`;
}

function addShopping(item) {
    const items = item.split(',').map(i => i.trim()).filter(i => i);
    
    let added = 0;
    items.forEach(singleItem => {
        if (!lists.compras.find(i => i.toLowerCase() === singleItem.toLowerCase())) {
            lists.compras.push(singleItem);
            added++;
        }
    });
    
    return `🛒 ${added} item(s) adicionado(s)! Lista: ${lists.compras.length} itens`;
}

function addExpense(dados) {
    let description, value;
    
    if (typeof dados === 'string') {
        const match = dados.match(/(.+?)\s+([\d,\.]+)/) || dados.match(/([\d,\.]+)\s+(.+)/);
        if (match) {
            description = match[1] ? match[1].trim() : match[2].trim();
            value = parseFloat((match[2] || match[1]).replace(',', '.'));
        }
    } else {
        description = dados.item || 'Gasto';
        value = dados.valor || 0;
    }
    
    if (!description || !value) {
        return "💰 Não entendi o gasto. Ex: 'Gastei 25 no uber'";
    }
    
    lists.gastos.push({
        description: description,
        value: value,
        date: new Date().toLocaleDateString('pt-BR')
    });
    
    const total = lists.gastos.reduce((sum, item) => sum + item.value, 0);
    return `✅ ${description} - R$ ${value.toFixed(2)} registrado! Total: R$ ${total.toFixed(2)}`;
}

function markAsWatched(itemName) {
    const item = lists.entretenimento.find(item => 
        !item.watched && 
        item.name.toLowerCase().includes(itemName.toLowerCase())
    );
    
    if (item) {
        item.watched = true;
        return `✅ "${item.name}" marcado como assistido! 🎉`;
    }
    
    return "❌ Não encontrei na lista. Use 'mostrar listas' para ver todos.";
}

function resetLists(message) {
    const lower = message.toLowerCase();
    
    if (lower.includes('compra')) {
        const count = lists.compras.length;
        lists.compras = [];
        return `🛒 Lista de compras limpa! ${count} itens removidos.`;
    }
    
    if (lower.includes('gasto')) {
        const count = lists.gastos.length;
        const total = lists.gastos.reduce((sum, item) => sum + item.value, 0);
        lists.gastos = [];
        return `💰 Gastos resetados! ${count} gastos (R$ ${total.toFixed(2)}) removidos.`;
    }
    
    return "❌ Especifique: 'limpar compras' ou 'resetar gastos'";
}

function showAllLists() {
    const ativos = lists.entretenimento.filter(item => !item.watched);
    const assistidos = lists.entretenimento.filter(item => item.watched);
    const totalGastos = lists.gastos.reduce((sum, item) => sum + item.value, 0);
    
    return `📊 *LISTAS DO VEX*

🎬 *Para Ver* (${ativos.length}):
${ativos.map(item => `• ${item.name}`).join('\n') || 'Nada 🎉'}

✅ *Assistidos* (${assistidos.length}):
${assistidos.map(item => `• ${item.name}`).join('\n') || 'Nada ainda'}

🛒 *Compras* (${lists.compras.length}):
${lists.compras.map(item => `• ${item}`).join('\n') || 'Lista vazia'}

💰 *Gastos*: R$ ${totalGastos.toFixed(2)} (${lists.gastos.length})`;
}

function getHelp() {
    return `🤖 *VEX GEMINI - AJUDA*

Fale naturalmente:
🎬 "Interestelar" → Adiciona filme
💰 "Gastei 25 no uber" → Registra gasto  
🛒 "Pão, leite" → Adiciona compras

Comandos:
"Já assisti NOME" → Marca como visto
"Limpar compras" → Esvazia lista
"Resetar gastos" → Zera gastos
"Mostrar listas" → Ver tudo

💡 *Entretenimento fica pra sempre!*`;
}

// ✅ FALLBACK ESTÁVEL (SE GEMINI FALHAR)
async function processFallback(message) {
    const lower = message.toLowerCase();
    
    if (lower.includes('ajuda') || lower === '?') return getHelp();
    if (lower.includes('lista') || lower.includes('mostrar')) return showAllLists();
    if (lower.includes('limpar') || lower.includes('reset')) return resetLists(message);
    if (lower.includes('assisti') || lower.includes('já vi')) return markAsWatched(message);
    
    if (/\d/.test(message) && lower.includes('gastei')) return addExpense(message);
    if (lower.includes('compr') || message.includes(',')) return addShopping(message);
    
    return addEntertainment(message);
}

// ✅ INICIALIZAÇÃO SEGURA
client.initialize().catch(error => {
    console.error('❌ Erro fatal na inicialização:', error);
});

console.log('🔄 Vex Gemini Iniciando...');
console.log('🔧 Configurado para reconexão automática');