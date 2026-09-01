import { Summary, Transaction, FinancialGoal, Investment, NetWorth, FinancialScore } from './finance.service.js';

export class ReportService {
  // Formata moeda brasileira sem caracteres especiais
  public static formatCurrency(val: number): string {
    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
    const isNegative = num < 0;
    const absVal = Math.abs(num);
    const [int, dec] = absVal.toFixed(2).split('.');
    const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${isNegative ? '-' : ''}R$ ${intFormatted},${dec}`;
  }

  public static formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  public static formatPercent(val: number): string {
    return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
  }

  // Menu de acoes rapidas (sempre limpo e sem caracteres especiais)
  public static getFinancialOptionsFooter(): string {
    return [
      '',
      '------------------------------',
      '>> ACOES RAPIDAS <<',
      '1 - Saldo e Resumo',
      '2 - Extrato Detalhado',
      '3 - Metas & Orcamentos',
      '4 - Score Financeiro (Open Finance)',
      '5 - Patrimonio Liquido',
      '6 - Dica com IA',
      '7 - Desfazer Lancamento',
    ].join('\n');
  }

  // ─── CONFIRMACAO DE TRANSACAO ─────────────────────────────────────────────

  public static formatTransactionAdded(tx: Transaction & { id: number; budgetWarning?: string }, currentBalance: number): string {
    const isIncome = tx.type === 'income';
    const icon = isIncome ? '[+]' : '[-]';
    const typeLabel = isIncome ? 'Receita Registrada' : 'Despesa Registrada';
    let msg = `${icon} *${typeLabel}*\n`;
    msg += `------------------------------\n`;
    msg += `Valor:    *${this.formatCurrency(tx.amount)}*\n`;
    msg += `Categ:    ${tx.category}\n`;
    if (tx.description) msg += `Descr:    ${tx.description}\n`;
    if (tx.payment_method && tx.payment_method !== 'outro') msg += `Pagam:    ${tx.payment_method.toUpperCase()}\n`;
    msg += `Data:     ${this.formatDate(tx.date)}\n`;
    msg += `ID:       #${tx.id}\n`;
    msg += `------------------------------\n`;
    msg += `Saldo:    *${this.formatCurrency(currentBalance)}*`;
    if (tx.budgetWarning) msg += `\n\n⚠️ ${tx.budgetWarning}`;
    return msg;
  }

  // ─── RESUMO FINANCEIRO ────────────────────────────────────────────────────

  public static formatSummary(summary: Summary): string {
    const isPositive = summary.balance >= 0;
    const balanceSign = isPositive ? '[+]' : '[-]';

    let msg = `📊 *RESUMO FINANCEIRO*\n`;
    msg += `Periodo: ${summary.period}\n`;
    msg += `------------------------------\n`;
    msg += `Receitas:   *${this.formatCurrency(summary.totalIncome)}*\n`;
    msg += `Despesas:   *${this.formatCurrency(summary.totalExpense)}*\n`;
    msg += `Saldo:      ${balanceSign} *${this.formatCurrency(Math.abs(summary.balance))}*\n`;
    msg += `Poupanca:   ${summary.savingsRate}% da renda\n`;
    msg += `Lancamentos: ${summary.transactionCount}\n`;

    if (summary.byCategory.length > 0) {
      msg += `\n🏷️ *Por Categoria:*\n`;
      for (const cat of summary.byCategory.slice(0, 6)) {
        const bar = '|'.repeat(Math.round(cat.percentage / 10));
        msg += `${cat.category.padEnd(14)} ${this.formatCurrency(cat.amount)} (${cat.percentage}%)\n`;
      }
    }
    return msg.trimEnd();
  }

  // ─── EXTRATO ──────────────────────────────────────────────────────────────

  public static formatStatement(transactions: Transaction[]): string {
    if (transactions.length === 0) {
      return `📑 *EXTRATO*\n------------------------------\nNenhum lancamento registrado.`;
    }
    let msg = `📑 *EXTRATO — Ultimos Lancamentos*\n`;
    msg += `------------------------------\n`;
    for (const tx of transactions) {
      const isIncome = tx.type === 'income';
      const prefix = isIncome ? '[+]' : '[-]';
      const desc = tx.description ? ` ${tx.description}` : '';
      msg += `${prefix} *${this.formatCurrency(tx.amount)}* - ${tx.category}${desc}\n`;
      msg += `    ${this.formatDate(tx.date)} | #${tx.id}\n`;
    }
    return msg.trimEnd();
  }

  // ─── ORÇAMENTOS ───────────────────────────────────────────────────────────

  public static formatBudgetStatus(budgets: any[]): string {
    if (budgets.length === 0) {
      let msg = `🎯 *METAS & ORCAMENTOS*\n`;
      msg += `------------------------------\n`;
      msg += `Nenhum limite definido ainda.\n\n`;
      msg += `Exemplo: _"Limite de R$ 500 para Alimentacao"_`;
      return msg;
    }
    let msg = `🎯 *METAS & ORCAMENTOS*\n`;
    msg += `Periodo: ${budgets[0]?.period || 'Mes atual'}\n`;
    msg += `------------------------------\n`;
    for (const b of budgets) {
      const status = b.isExceeded ? '[EXCEDIDO]' : b.percent >= 80 ? '[ATENCAO]' : '[OK]';
      msg += `${status} *${b.category}*\n`;
      msg += `  Gasto: ${this.formatCurrency(b.spent)} / Limite: ${this.formatCurrency(b.limit)} (${b.percent}%)\n`;
      msg += `  Disponivel: *${this.formatCurrency(b.remaining)}*\n`;
    }
    return msg.trimEnd();
  }

  // ─── METAS DE VIDA ────────────────────────────────────────────────────────

  public static formatGoals(goals: FinancialGoal[]): string {
    if (goals.length === 0) {
      let msg = `🏆 *METAS FINANCEIRAS DE VIDA*\n`;
      msg += `------------------------------\n`;
      msg += `Nenhuma meta criada ainda.\n\n`;
      msg += `Exemplo: _"Meta de R$ 10.000 para reserva de emergencia ate dezembro"_`;
      return msg;
    }
    const priorities: Record<number, string> = { 1: '[ALTA]', 2: '[MEDIA]', 3: '[BAIXA]' };
    let msg = `🏆 *METAS FINANCEIRAS DE VIDA*\n------------------------------\n`;
    for (const g of goals) {
      const progress = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
      const bar = '#'.repeat(Math.round(progress / 10)) + '.'.repeat(10 - Math.round(progress / 10));
      msg += `${priorities[g.priority] || '[MEDIA]'} *${g.name}*\n`;
      msg += `  Meta:     ${this.formatCurrency(g.target_amount)}\n`;
      msg += `  Guardado: ${this.formatCurrency(g.current_amount)} (${progress.toFixed(0)}%)\n`;
      msg += `  [${bar}]\n`;
      if (g.deadline) msg += `  Prazo: ${this.formatDate(g.deadline)}\n`;
    }
    return msg.trimEnd();
  }

  // ─── PATRIMÔNIO LÍQUIDO ───────────────────────────────────────────────────

  public static formatNetWorth(nw: NetWorth): string {
    const sign = nw.netWorth >= 0 ? '[+]' : '[-]';
    let msg = `💎 *PATRIMONIO LIQUIDO*\n`;
    msg += `------------------------------\n`;
    msg += `Total de Ativos:   *${this.formatCurrency(nw.totalAssets)}*\n`;
    msg += `  Saldo Contas:    ${this.formatCurrency(nw.accountsBalance)}\n`;
    msg += `  Investimentos:   ${this.formatCurrency(nw.totalInvestments)}`;
    if (nw.investmentReturn !== 0) msg += ` (${this.formatPercent(nw.investmentReturn)})`;
    msg += `\nDividas Ativas:    *${this.formatCurrency(nw.totalDebts)}*\n`;
    msg += `------------------------------\n`;
    msg += `Patrimonio:  ${sign} *${this.formatCurrency(Math.abs(nw.netWorth))}*`;
    return msg;
  }

  // ─── SCORE FINANCEIRO OPEN FINANCE ────────────────────────────────────────

  public static formatFinancialScore(score: FinancialScore): string {
    const stars = Math.round(score.score / 200);
    const starBar = '*'.repeat(stars) + '.'.repeat(5 - stars);
    let msg = `📈 *SCORE FINANCEIRO — OPEN FINANCE*\n`;
    msg += `------------------------------\n`;
    msg += `Score: *${score.score}/1000* — ${score.label}\n`;
    msg += `[${starBar}]\n\n`;
    msg += `Componentes:\n`;
    msg += `  Poupanca:     ${score.breakdown.savingsRate}/250\n`;
    msg += `  Orcamentos:   ${score.breakdown.budgetAdherence}/250\n`;
    msg += `  Metas:        ${score.breakdown.goalProgress}/200\n`;
    msg += `  Dividas:      ${score.breakdown.debtRatio}/200\n`;
    msg += `  Consistencia: ${score.breakdown.consistency}/100\n`;
    msg += `\n💡 *Recomendacoes:*\n`;
    for (const tip of score.tips.slice(0, 3)) {
      msg += `• ${tip}\n`;
    }
    return msg.trimEnd();
  }
}
