const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Servidor web simples
app.use(express.json());
app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        bot: 'Vex',
        message: 'Em modo de diagnóstico'
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor web na porta ${PORT}`);
});

// Configuração do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "vex-bot-debug"
    }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
    }
});

// Variável para debug
let messageCount = 0;

client.on('qr', (qr) => {
    console.log('📱 QR CODE - Escaneie:');
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    console.log('✅✅✅ BOT PRONTO - Agora deve funcionar!');
    console.log('🔍 Modo diagnóstico ativado');
});

client.on('message', async (message) => {
    messageCount++;
    console.log(`📨 MENSAGEM #${messageCount} RECEBIDA:`);
    console.log(`   De: ${message.from}`);
    console.log(`   Texto: "${message.body}"`);
    console.log(`   É grupo: ${message.from.includes('@g.us')}`);
    console.log(`   Tipo: ${message.type}`);
    
    // Responder a QUALQUER mensagem para testar
    try {
        await message.reply(`🤖 Vex recebeu: "${message.body}" - Mensagem #${messageCount}`);
        console.log('   ✅ Resposta enviada com sucesso!');
    } catch (error) {
        console.log('   ❌ Erro ao responder:', error.message);
    }
});

client.on('auth_failure', (error) => {
    console.log('❌ FALHA NA AUTENTICAÇÃO:', error);
});

client.on('disconnected', (reason) => {
    console.log('❌ DESCONECTADO:', reason);
});

// Inicializar
client.initialize();

console.log('🔄 Iniciando Vex em modo diagnóstico...');