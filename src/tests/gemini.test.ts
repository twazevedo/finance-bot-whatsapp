import { geminiService } from '../services/gemini.service.js';
import { db } from '../database/db.js';

async function test() {
  console.log('🤖 Testando chamada com a chave do Gemini configurada...\n');
  await db.init();

  const prompt = 'Gastei 45 reais no almoço no cartão de crédito';
  console.log(`📤 Enviando prompt para a IA: "${prompt}"`);

  const response = await geminiService.processMessage({
    userPhone: '5511945868954',
    text: prompt,
  });

  console.log('\n📥 Resposta formatada recebida da IA:');
  console.log(response);

  // Teste 2: Consultar Saldo
  console.log('\n📤 Testando consulta de saldo: "Qual meu saldo atual?"');
  const balanceResponse = await geminiService.processMessage({
    userPhone: '5511945868954',
    text: 'Qual meu saldo atual?',
  });

  console.log('\n📥 Resposta de Saldo:');
  console.log(balanceResponse);

  await db.close();
}

test().catch(err => {
  console.error('❌ Erro no teste do Gemini:', err);
});
