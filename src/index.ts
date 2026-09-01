import { CONFIG } from './config/index.js';
import { db } from './database/db.js';
import { whatsAppClient } from './whatsapp/client.js';
import { MessageHandler } from './whatsapp/message-handler.js';
import { createWebServer } from './web/server.js';

async function main() {
  console.log('======================================================');
  console.log('🚀 INICIANDO IA DE CONTROLE FINANCEIRO - WHATSAPP');
  console.log('======================================================');

  // 1. Inicializa o Banco de Dados SQLite
  console.log('📦 Inicializando banco de dados...');
  await db.init();
  console.log('✅ Banco de dados pronto.');

  // 2. Registra o Handler de Mensagens do WhatsApp
  whatsAppClient.onMessage(async (msg) => {
    await MessageHandler.handleMessage(msg);
  });

  // 3. Inicia o Servidor Web e Dashboard
  const { server } = createWebServer();
  server.listen(CONFIG.PORT, () => {
    console.log(`🌐 Painel Web disponível em: http://localhost:${CONFIG.PORT}`);
  });

  // 4. Inicia a conexão WhatsApp
  console.log(`📲 Iniciando conexão WhatsApp...`);
  await whatsAppClient.start(false);
}

main().catch((err) => {
  console.error('❌ Erro fatal ao iniciar o aplicativo:', err);
  process.exit(1);
});
