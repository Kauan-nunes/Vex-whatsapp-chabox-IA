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
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-2cec3a55cf5645a283c9cc555b259cb6';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

// Banco de dados em memória
let groupData = {};

client.on('qr', (qr) => {
    console.log('📱 Escaneie este QR code com seu WhatsApp:');
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    console.log('✅ Bot com IA conectado!');
    console.log('🧠 Usando DeepSeek para categorização inteligente');
});

client.on('message', async (message) => {
    if (message.from === 'status@broadcast' || message.from === 'broadcast') return;
    if (message.type === 'broadcast') return;
    
    try {
        const response = await processSmartMessage(message);
        if (response) {
            message.reply(response);
        }
    } catch (error) {
        console.error('Erro:', error);
        message.reply('❌ Erro ao processar mensagem. Tente novamente.');
    }
});

// Função principal com IA
async function processSmartMessage(message) {
    const groupId = message.from;
    const userMessage = message.body.trim();
    
    if (!userMessage) return null;
    
    console.log(`💬 Mensagem de ${getSenderName(message)}: ${userMessage}`);

    // Inicializar grupo se não existir
    if (!groupData[groupId]) {
        groupData[groupId] = await detectGroupTypeWithAI(userMessage);
    }
    
    const groupType = groupData[groupId].type;
    
    // Comandos especiais
    if (userMessage.toLowerCase() === '!ajuda') {
        return getHelpMessage(groupType);
    }
    
    if (userMessage.toLowerCase() === '!limpar') {
        return clearGroupData(groupId);
    }
    
    if (userMessage.toLowerCase() === '!status') {
        return getGroupStatus(groupId, groupType);
    }
    
    if (userMessage.toLowerCase() === '!tipo') {
        return `📊 Este grupo está configurado como: *${groupType}*`;
    }

    // Processamento com IA baseado no tipo de grupo
    switch(groupType) {
        case 'entretenimento':
            return await processEntertainmentItemWithAI(userMessage, groupId);
        case 'gastos':
            return await processExpenseItemWithAI(userMessage, groupId);
        case 'compras':
            return await processShoppingItemWithAI(userMessage, groupId);
        default:
            const detectedType = await detectGroupTypeWithAI(userMessage);
            groupData[groupId].type = detectedType.type;
            return await processMessageByTypeWithAI(userMessage, groupId, detectedType.type);
    }
}

// 🧠 FUNÇÃO PRINCIPAL DE IA
async function callDeepSeekAI(prompt, systemMessage = "Você é um assistente útil.") {
    try {
        const response = await axios.post(DEEPSEEK_URL, {
            model: 'deepseek-chat',
            messages: [
                {
                    role: 'system',
                    content: systemMessage
                },
                {
                    role: 'user',
                    content: prompt
                }
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
        console.error('Erro na API DeepSeek:', error);
        throw new Error('Falha na comunicação com IA');
    }
}

// 🎬 PROCESSAMENTO DE ENTRETENIMENTO COM IA
async function processEntertainmentItemWithAI(message, groupId) {
    if (message.length < 2) return null;
    
    try {
        // Usar IA para categorizar o conteúdo
        const categoryPrompt = `Categorize este conteúdo de entretenimento em UMA destas categorias: filme, série, desenho, documentário, anime, livro, outros.

Conteúdo: "${message}"

Responda APENAS com o nome da categoria, sem explicações.`;
        
        const category = await callDeepSeekAI(categoryPrompt, "Você é um especialista em categorização de conteúdo de entretenimento.");
        
        // Adicionar à lista
        if (!groupData[groupId].items) groupData[groupId].items = [];
        
        const existingItem = groupData[groupId].items.find(i => 
            i.name.toLowerCase() === message.toLowerCase()
        );
        
        if (!existingItem) {
            groupData[groupId].items.push({
                name: message,
                category: category.toLowerCase(),
                added: new Date().toLocaleDateString('pt-BR'),
                addedBy: getSenderName({...message, _data: { notifyName: getSenderName(message) }})
            });
            
            return `🎬 "${message}" adicionado como ${category}!`;
        } else {
            return `ℹ️ "${message}" já está na lista como ${existingItem.category}.`;
        }
        
    } catch (error) {
        // Fallback para categorização manual se IA falhar
        return processEntertainmentItemFallback(message, groupId);
    }
}

// 💰 PROCESSAMENTO DE GASTOS COM IA
async function processExpenseItemWithAI(message, groupId) {
    try {
        // Usar IA para extrair valor e categorizar
        const expensePrompt = `Analise esta mensagem de gasto e extraia: descrição e valor. Também categorize em UMA destas: mercado, transporte, lazer, comida, saúde, educação, contas, outros.

Mensagem: "${message}"

Responda no formato JSON:
{
  "descricao": "descrição extraída",
  "valor": número,
  "categoria": "categoria"
}

Apenas o JSON, sem outros textos.`;

        const aiResponse = await callDeepSeekAI(expensePrompt, "Você é um especialista em análise de gastos financeiros.");
        
        // Extrair JSON da resposta
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Resposta da IA não contém JSON');
        
        const expenseData = JSON.parse(jsonMatch[0]);
        
        if (!expenseData.descricao || !expenseData.valor || !expenseData.categoria) {
            throw new Error('Dados incompletos da IA');
        }
        
        // Adicionar gasto
        if (!groupData[groupId].items) groupData[groupId].items = [];
        
        groupData[groupId].items.push({
            description: expenseData.descricao,
            value: parseFloat(expenseData.valor),
            category: expenseData.categoria.toLowerCase(),
            date: new Date().toLocaleDateString('pt-BR'),
            addedBy: getSenderName({...message, _data: { notifyName: getSenderName(message) }}),
            originalMessage: message
        });
        
        // Mostrar resumo a cada 3 gastos
        const itemCount = groupData[groupId].items.length;
        if (itemCount % 3 === 0 || itemCount === 1) {
            return getExpensesSummaryWithAI(groupId);
        } else {
            return `✅ Gasto registrado: ${expenseData.descricao} - R$ ${parseFloat(expenseData.valor).toFixed(2)} (${expenseData.categoria})`;
        }
        
    } catch (error) {
        console.error('Erro na categorização de gastos:', error);
        return processExpenseItemFallback(message, groupId);
    }
}

// 🛒 PROCESSAMENTO DE COMPRAS COM IA
async function processShoppingItemWithAI(message, groupId) {
    if (message.toLowerCase().includes('mostrar') || message.toLowerCase().includes('lista')) {
        return getShoppingList(groupId);
    }
    
    try {
        // Usar IA para identificar e organizar itens de compras
        const shoppingPrompt = `Esta é uma lista de compras. Identifique cada item individualmente. Se for uma lista com vírgulas, separe os itens. Se for uma frase, extraia os itens mencionados.

Mensagem: "${message}"

Responda com uma lista JSON de itens:
{
  "itens": ["item1", "item2", "item3"]
}

Apenas o JSON, sem outros textos.`;

        const aiResponse = await callDeepSeekAI(shoppingPrompt, "Você é um especialista em organização de listas de compras.");
        
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Resposta da IA não contém JSON');
        
        const shoppingData = JSON.parse(jsonMatch[0]);
        
        if (!shoppingData.itens || !Array.isArray(shoppingData.itens)) {
            throw new Error('Formato inválido da IA');
        }
        
        const items = shoppingData.itens.map(item => item.trim()).filter(item => item);
        
        if (items.length === 0) {
            return "🛒 Não identifiquei itens na sua mensagem. Tente: 'leite, pão, ovos'";
        }
        
        if (!groupData[groupId].items) groupData[groupId].items = [];
        
        let addedCount = 0;
        items.forEach(item => {
            if (!groupData[groupId].items.find(i => i.toLowerCase() === item.toLowerCase())) {
                groupData[groupId].items.push(item);
                addedCount++;
            }
        });
        
        if (addedCount === 0) {
            return "ℹ️ Todos os itens já estão na lista!";
        }
        
        return `🛒 ${addedCount} item(s) adicionado(s) pela IA! Lista atual: ${groupData[groupId].items.length} itens.`;
        
    } catch (error) {
        console.error('Erro na categorização de compras:', error);
        return processShoppingItemFallback(message, groupId);
    }
}

// 🧠 DETECÇÃO DE TIPO DE GRUPO COM IA
async function detectGroupTypeWithAI(message) {
    try {
        const detectionPrompt = `Analise esta mensagem e determine se é sobre:
1. "entretenimento" - filmes, séries, livros, coisas para assistir/ler
2. "gastos" - despesas, dinheiro, compras com valores
3. "compras" - lista de compras, mercado, itens para comprar

Mensagem: "${message}"

Responda APENAS com uma palavra: "entretenimento", "gastos" ou "compras".`;

        const aiResponse = await callDeepSeekAI(detectionPrompt, "Você é um especialista em categorização de conversas.");
        
        const detectedType = aiResponse.toLowerCase().trim();
        const validTypes = ['entretenimento', 'gastos', 'compras'];
        
        return { 
            type: validTypes.includes(detectedType) ? detectedType : 'compras', 
            items: [] 
        };
        
    } catch (error) {
        console.error('Erro na detecção de tipo:', error);
        // Fallback para detecção manual
        return detectGroupTypeFallback(message);
    }
}

// 📊 RESUMO DE GASTOS COM ANÁLISE IA
async function getExpensesSummaryWithAI(groupId) {
    const items = groupData[groupId].items;
    if (!items || items.length === 0) return "💰 Nenhum gasto registrado ainda!";
    
    // Calcular totais
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
    
    // Gerar análise com IA
    let analysis = "";
    try {
        const analysisPrompt = `Analise estes gastos e dê uma breve análise (máximo 2 frases):
Total: R$ ${total.toFixed(2)}
Categorias: ${Object.entries(byCategory).map(([cat, data]) => `${cat}: R$ ${data.total.toFixed(2)}`).join(', ')}

Dê uma análise objetiva.`;
        
        analysis = await callDeepSeekAI(analysisPrompt, "Você é um consultor financeiro.");
        analysis = `\n💡 ${analysis}`;
    } catch (error) {
        analysis = "";
    }
    
    let response = `💰 *RESUMO DE GASTOS* - Total: R$ ${total.toFixed(2)}\n`;
    response += `📊 ${items.length} gastos registrados\n\n`;
    
    // Ordenar categorias por valor gasto
    const sortedCategories = Object.keys(byCategory).sort((a, b) => 
        byCategory[b].total - byCategory[a].total
    );
    
    sortedCategories.forEach(category => {
        const catData = byCategory[category];
        const percentage = ((catData.total / total) * 100).toFixed(1);
        
        response += `📁 *${category.toUpperCase()}* - R$ ${catData.total.toFixed(2)} (${percentage}%)\n`;
    });
    
    response += analysis;
    response += `\n💡 Adicione gastos descrevendo o que foi e o valor`;
    
    return response;
}

// 🔄 FUNÇÕES FALLBACK (se IA falhar)
function processEntertainmentItemFallback(message, groupId) {
    const item = message.trim();
    if (item.length < 3) return null;
    
    const category = detectEntertainmentCategoryFallback(item);
    
    if (!groupData[groupId].items) groupData[groupId].items = [];
    
    const existingItem = groupData[groupId].items.find(i => i.name.toLowerCase() === item.toLowerCase());
    
    if (!existingItem) {
        groupData[groupId].items.push({
            name: item,
            category: category,
            added: new Date().toLocaleDateString('pt-BR'),
            addedBy: getSenderName({...message, _data: { notifyName: getSenderName(message) }})
        });
        
        return `🎬 "${item}" adicionado como ${category}! (fallback)`;
    }
    
    return `ℹ️ "${item}" já está na lista como ${existingItem.category}.`;
}

function processExpenseItemFallback(message, groupId) {
    let description, value;
    
    let match = message.match(/(.+?)\s+([\d,\.]+)$/);
    if (match) {
        description = match[1].trim();
        value = parseFloat(match[2].replace(',', '.'));
    } else {
        match = message.match(/([\d,\.]+)\s+(.+)$/);
        if (match) {
            value = parseFloat(match[1].replace(',', '.'));
            description = match[2].trim();
        }
    }
    
    if (!match || isNaN(value)) {
        return "💰 Formato: 'descrição valor' \nEx: 'uber 15' ou 'pizza 40,50'";
    }
    
    const category = detectExpenseCategoryFallback(description);
    
    if (!groupData[groupId].items) groupData[groupId].items = [];
    
    groupData[groupId].items.push({
        description: description,
        value: value,
        category: category,
        date: new Date().toLocaleDateString('pt-BR'),
        addedBy: getSenderName({...message, _data: { notifyName: getSenderName(message) }})
    });
    
    const itemCount = groupData[groupId].items.length;
    if (itemCount % 3 === 0 || itemCount === 1) {
        return getExpensesSummaryWithAI(groupId);
    } else {
        return `✅ Gasto registrado: ${description} - R$ ${value.toFixed(2)} (${category})`;
    }
}

function processShoppingItemFallback(message, groupId) {
    const items = message.split(',').map(item => item.trim()).filter(item => item);
    
    if (items.length === 0) {
        return "🛒 Formato: 'item1, item2, item3'";
    }
    
    if (!groupData[groupId].items) groupData[groupId].items = [];
    
    let addedCount = 0;
    items.forEach(item => {
        if (!groupData[groupId].items.find(i => i.toLowerCase() === item.toLowerCase())) {
            groupData[groupId].items.push(item);
            addedCount++;
        }
    });
    
    if (addedCount === 0) {
        return "ℹ️ Todos os itens já estão na lista!";
    }
    
    return `🛒 ${addedCount} item(s) adicionado(s)! Lista atual: ${groupData[groupId].items.length} itens.`;
}

function detectGroupTypeFallback(message) {
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.includes('assistir') || lowerMsg.includes('filme') || lowerMsg.includes('série') || lowerMsg.includes('serie')) {
        return { type: 'entretenimento', items: [] };
    }
    
    if (lowerMsg.includes('gasto') || lowerMsg.includes('gastar') || /\d+/.test(message)) {
        return { type: 'gastos', items: [] };
    }
    
    return { type: 'compras', items: [] };
}

// 🎯 FUNÇÕES DE CATEGORIZAÇÃO FALLBACK
function detectEntertainmentCategoryFallback(item) {
    const lowerItem = item.toLowerCase();
    
    if (lowerItem.includes('série') || lowerItem.includes('serie') || lowerItem.includes('temp') || lowerItem.includes('season')) {
        return 'série';
    }
    if (lowerItem.includes('filme') || lowerItem.includes('movie')) {
        return 'filme';
    }
    if (lowerItem.includes('desenho') || lowerItem.includes('anime')) {
        return 'desenho';
    }
    if (lowerItem.includes('doc') || lowerItem.includes('documentário')) {
        return 'documentário';
    }
    if (lowerItem.includes('livro') || lowerItem.includes('book')) {
        return 'livro';
    }
    
    return 'outros';
}

function detectExpenseCategoryFallback(description) {
    const desc = description.toLowerCase();
    
    if (desc.includes('uber') || desc.includes('táxi') || desc.includes('transporte')) {
        return 'transporte';
    }
    if (desc.includes('mercado') || desc.includes('super') || desc.includes('compras')) {
        return 'mercado';
    }
    if (desc.includes('restaurant') || desc.includes('comida') || desc.includes('pizza')) {
        return 'comida';
    }
    if (desc.includes('cinema') || desc.includes('lazer')) {
        return 'lazer';
    }
    if (desc.includes('farmacia') || desc.includes('saúde')) {
        return 'saúde';
    }
    if (desc.includes('curso') || desc.includes('livro') || desc.includes('educação')) {
        return 'educação';
    }
    
    return 'outros';
}

// 📋 FUNÇÕES AUXILIARES (mantidas do código anterior)
function getShoppingList(groupId) {
    const items = groupData[groupId].items;
    if (!items || items.length === 0) return "🛒 Lista de compras vazia!";
    
    let response = `🛒 *LISTA DE COMPRAS* (${items.length} itens)\n\n`;
    
    items.forEach((item, index) => {
        response += `${index + 1}. ${item}\n`;
    });
    
    return response;
}

function clearGroupData(groupId) {
    const count = groupData[groupId].items ? groupData[groupId].items.length : 0;
    groupData[groupId].items = [];
    return `🗑️ Lista limpa! ${count} itens removidos.`;
}

function getGroupStatus(groupId, groupType) {
    const items = groupData[groupId].items;
    const count = items ? items.length : 0;
    
    switch(groupType) {
        case 'entretenimento':
            // Agrupar por categoria para mostrar distribuição
            const categories = {};
            if (items) {
                items.forEach(item => {
                    categories[item.category] = (categories[item.category] || 0) + 1;
                });
            }
            const categoryStr = Object.entries(categories).map(([cat, qty]) => `${cat}: ${qty}`).join(', ');
            return `🎬 Status: ${count} itens (${categoryStr})`;
        case 'gastos':
            const total = items ? items.reduce((sum, item) => sum + item.value, 0) : 0;
            return `💰 Status: ${count} gastos - Total: R$ ${total.toFixed(2)}`;
        case 'compras':
            return `🛒 Status: ${count} itens na lista de compras`;
        default:
            return `📊 Status: ${count} itens no grupo`;
    }
}

function getSenderName(message) {
    return message._data?.notifyName || message.author || message.from.split('@')[0];
}

async function processMessageByTypeWithAI(message, groupId, type) {
    groupData[groupId].type = type;
    
    switch(type) {
        case 'entretenimento':
            return await processEntertainmentItemWithAI(message, groupId);
        case 'gastos':
            return await processExpenseItemWithAI(message, groupId);
        case 'compras':
            return await processShoppingItemWithAI(message, groupId);
        default:
            if (!groupData[groupId].items) groupData[groupId].items = [];
            groupData[groupId].items.push(message);
            return `✅ Adicionado: "${message}"`;
    }
}

function getHelpMessage(groupType) {
    const baseHelp = `🤖 *BOT COM IA* - Usa DeepSeek para categorização inteligente

Comandos:
!ajuda - Mostra esta mensagem
!limpar - Limpa os dados do grupo  
!status - Mostra status atual
!tipo - Mostra o tipo do grupo

💡 Funciona automaticamente - apenas envie suas mensagens!`;

    switch(groupType) {
        case 'entretenimento':
            return `${baseHelp}

🎬 *Entretenimento*: Envie nomes de filmes, séries, etc.
A IA categoriza automaticamente!`;
        case 'gastos':
            return `${baseHelp}

💰 *Gastos*: Descreva gastos com valores
Ex: "jantar 80", "uber 25", "mercado 150"`;
        case 'compras':
            return `${baseHelp}

🛒 *Compras*: Liste itens para comprar
Ex: "leite, pão, ovos" ou "preciso comprar café e açúcar"`;
        default:
            return baseHelp;
    }
}

client.initialize();