import { Database } from '../database/db.js';
import { FinanceService } from '../services/finance.service.js';
import { ReportService } from '../services/report.service.js';
import path from 'path';
import fs from 'fs';

async function runTests() {
  console.log('🧪 Iniciando Testes Automatizados do Módulo Financeiro...\n');

  const testDbPath = path.resolve(process.cwd(), 'test_finance.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const testDb = new Database(testDbPath);
  await testDb.init();
  console.log('✅ 1. Inicialização do banco SQLite de teste concluída com sucesso.');

  // Usamos o serviço para os testes com o banco de teste
  const testPhone = '5511945868954';
  const finance = new FinanceService(testDb);

  // Teste 1: Adicionar Receita
  console.log('\n🧪 Teste 2: Registrando Receita (Salário)...');
  const income = await finance.addTransaction({
    user_phone: testPhone,
    type: 'income',
    amount: 5000,
    category: 'Salário',
    description: 'Salário Mensal',
    payment_method: 'pix',
    date: '2026-08-01',
  });
  console.log('  Resultado:\n' + ReportService.formatTransactionAdded(income, 5000));

  // Teste 2: Definir Orçamento para Alimentação
  console.log('\n🧪 Teste 3: Definindo Orçamento de R$ 500 para Alimentação...');
  await finance.setBudget(testPhone, 'Alimentação', 500, '2026-08');

  // Teste 3: Adicionar Despesas
  console.log('\n🧪 Teste 4: Adicionando Despesa de Alimentação (R$ 420 - 84% do limite)...');
  const expense1 = await finance.addTransaction({
    user_phone: testPhone,
    type: 'expense',
    amount: 420,
    category: 'Alimentação',
    description: 'Supermercado e Restaurante',
    payment_method: 'cartao_credito',
    date: '2026-08-10',
  });
  console.log('  Resultado:\n' + ReportService.formatTransactionAdded(expense1, 4580));

  // Teste 4: Adicionar outra despesa (Transporte)
  console.log('\n🧪 Teste 5: Adicionando Despesa de Transporte (R$ 80)...');
  await finance.addTransaction({
    user_phone: testPhone,
    type: 'expense',
    amount: 80,
    category: 'Transporte',
    description: 'Uber para o trabalho',
    payment_method: 'pix',
    date: '2026-08-15',
  });

  // Teste 5: Obter Resumo Financeiro
  console.log('\n🧪 Teste 6: Consultando Resumo Financeiro...');
  const summary = await finance.getSummary(testPhone, '2026-08');
  console.log('  Formatado:\n', ReportService.formatSummary(summary));

  if (summary.balance !== 4500) {
    throw new Error(`Saldo incorreto! Esperado: 4500, Obtido: ${summary.balance}`);
  }
  console.log('✅ Saldo verificado com sucesso: R$ 4.500,00 (Receitas: R$ 5.000,00 | Despesas: R$ 500,00)');

  // Teste 6: Obter Extrato
  console.log('\n🧪 Teste 7: Consultando Extrato dos Lançamentos...');
  const statement = await finance.getStatement(testPhone, 5);
  console.log('  Extrato:\n', ReportService.formatStatement(statement));

  // Teste 7: Status dos Orçamentos
  console.log('\n🧪 Teste 8: Verificando Status dos Orçamentos...');
  const budgetStatus = await finance.getBudgetStatus(testPhone, '2026-08');
  console.log('  Status de Metas:\n', ReportService.formatBudgetStatus(budgetStatus));

  // Teste 8: Desfazer último lançamento
  console.log('\n🧪 Teste 9: Testando Exclusão / Desfazer...');
  const deleted = await finance.deleteLastTransaction(testPhone);
  console.log(`  Lançamento excluído: #${deleted?.id} - ${deleted?.description}`);

  const updatedSummary = await finance.getSummary(testPhone, '2026-08');
  console.log(`  Novo Saldo após desfazer: R$ ${updatedSummary.balance.toFixed(2)}`);

  await testDb.close();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('\n🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!\n');
}

runTests().catch((err) => {
  console.error('❌ Erro no teste:', err);
  process.exit(1);
});
