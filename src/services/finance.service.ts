import { Database, db } from '../database/db.js';

export interface Transaction {
  id?: number;
  user_phone: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category: string;
  description?: string;
  payment_method?: string;
  account_id?: number;
  date: string;
  raw_input?: string;
  created_at?: string;
}

export interface Budget {
  id?: number;
  user_phone: string;
  category: string;
  amount_limit: number;
  period: string;
}

export interface Summary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  transactionCount: number;
  period: string;
  savingsRate: number;
  byCategory: { category: string; amount: number; percentage: number }[];
}

export interface FinancialGoal {
  id?: number;
  user_phone: string;
  name: string;
  description?: string;
  target_amount: number;
  current_amount: number;
  deadline?: string;
  priority: 1 | 2 | 3;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
}

export interface Investment {
  id?: number;
  user_phone: string;
  name: string;
  type: string;
  institution?: string;
  amount_invested: number;
  current_value: number;
  purchase_date?: string;
}

export interface Debt {
  id?: number;
  user_phone: string;
  name: string;
  institution?: string;
  total_amount: number;
  remaining_amount: number;
  monthly_payment: number;
  interest_rate: number;
  due_date?: string;
}

export interface NetWorth {
  totalAssets: number;
  totalDebts: number;
  totalInvestments: number;
  accountsBalance: number;
  netWorth: number;
  investmentReturn: number;
}

export interface FinancialScore {
  score: number;
  label: string;
  breakdown: {
    savingsRate: number;
    budgetAdherence: number;
    goalProgress: number;
    debtRatio: number;
    consistency: number;
  };
  tips: string[];
}

export class FinanceService {
  constructor(private database: Database = db) {}

  public async ensureUser(phone: string, name?: string): Promise<void> {
    const existing = await this.database.get('SELECT phone FROM users WHERE phone = ?', [phone]);
    if (!existing) {
      await this.database.run('INSERT INTO users (phone, name) VALUES (?, ?)', [phone, name || 'Usuario']);
    } else if (name) {
      await this.database.run('UPDATE users SET name = ? WHERE phone = ?', [name, phone]);
    }
  }

  // ─── TRANSAÇÕES ────────────────────────────────────────────────────────────

  public async addTransaction(tx: Transaction): Promise<Transaction & { id: number; budgetWarning?: string }> {
    await this.ensureUser(tx.user_phone);
    const txDate = tx.date || new Date().toISOString().split('T')[0];

    const result = await this.database.run(
      `INSERT INTO transactions (user_phone, type, amount, category, description, payment_method, date, raw_input)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tx.user_phone,
        tx.type,
        tx.amount,
        tx.category,
        tx.description || '',
        tx.payment_method || 'outro',
        txDate,
        tx.raw_input || '',
      ]
    );

    let budgetWarning: string | undefined;
    if (tx.type === 'expense') {
      const period = txDate.substring(0, 7);
      const budget = await this.database.get<Budget>(
        'SELECT * FROM budgets WHERE user_phone = ? AND category = ? AND period = ?',
        [tx.user_phone, tx.category, period]
      );
      if (budget) {
        const spentRow = await this.database.get<{ total: number }>(
          `SELECT SUM(amount) as total FROM transactions WHERE user_phone = ? AND category = ? AND type = 'expense' AND date LIKE ?`,
          [tx.user_phone, tx.category, `${period}%`]
        );
        const totalSpent = spentRow?.total || 0;
        if (totalSpent > budget.amount_limit) {
          budgetWarning = `ALERTA: Limite de ${tx.category} ultrapassado! Gasto: R$ ${totalSpent.toFixed(2)} / Limite: R$ ${budget.amount_limit.toFixed(2)}`;
        } else if (totalSpent >= budget.amount_limit * 0.8) {
          const pct = ((totalSpent / budget.amount_limit) * 100).toFixed(0);
          budgetWarning = `ATENCAO: ${pct}% do limite de ${tx.category} utilizado (R$ ${totalSpent.toFixed(2)} de R$ ${budget.amount_limit.toFixed(2)})`;
        }
      }
    }

    return { ...tx, id: result.lastID, date: txDate, budgetWarning };
  }

  public async getStatement(user_phone: string, limit: number = 10, category?: string): Promise<Transaction[]> {
    await this.ensureUser(user_phone);
    let sql = 'SELECT * FROM transactions WHERE user_phone = ?';
    const params: any[] = [user_phone];
    if (category) { sql += ' AND category LIKE ?'; params.push(`%${category}%`); }
    sql += ' ORDER BY date DESC, id DESC LIMIT ?';
    params.push(limit);
    return this.database.all<Transaction>(sql, params);
  }

  public async deleteLastTransaction(user_phone: string): Promise<Transaction | null> {
    const last = await this.database.get<Transaction>(
      'SELECT * FROM transactions WHERE user_phone = ? ORDER BY id DESC LIMIT 1',
      [user_phone]
    );
    if (!last || !last.id) return null;
    await this.database.run('DELETE FROM transactions WHERE id = ?', [last.id]);
    return last;
  }

  public async deleteTransactionById(user_phone: string, id: number): Promise<boolean> {
    const res = await this.database.run('DELETE FROM transactions WHERE id = ? AND user_phone = ?', [id, user_phone]);
    return res.changes > 0;
  }

  // ─── RESUMO / SUMÁRIO ──────────────────────────────────────────────────────

  public async getSummary(user_phone: string, periodFilter?: string): Promise<Summary> {
    await this.ensureUser(user_phone);
    let dateCondition = '';
    const params: any[] = [user_phone];
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let labelPeriod = currentMonth;

    if (!periodFilter || periodFilter === 'this_month' || periodFilter === 'mes_atual') {
      dateCondition = 'AND date LIKE ?';
      params.push(`${currentMonth}%`);
      labelPeriod = `Mes ${currentMonth}`;
    } else if (periodFilter === 'today' || periodFilter === 'hoje') {
      const today = now.toISOString().split('T')[0];
      dateCondition = 'AND date = ?';
      params.push(today);
      labelPeriod = `Hoje`;
    } else if (periodFilter === 'all' || periodFilter === 'todos') {
      labelPeriod = 'Historico Completo';
    } else if (/^\d{4}-\d{2}$/.test(periodFilter)) {
      dateCondition = 'AND date LIKE ?';
      params.push(`${periodFilter}%`);
      labelPeriod = `Mes ${periodFilter}`;
    }

    const incomeRow = await this.database.get<{ total: number }>(
      `SELECT SUM(amount) as total FROM transactions WHERE user_phone = ? AND type = 'income' ${dateCondition}`, params
    );
    const expenseRow = await this.database.get<{ total: number }>(
      `SELECT SUM(amount) as total FROM transactions WHERE user_phone = ? AND type = 'expense' ${dateCondition}`, params
    );
    const countRow = await this.database.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM transactions WHERE user_phone = ? ${dateCondition}`, params
    );

    const totalIncome = incomeRow?.total || 0;
    const totalExpense = expenseRow?.total || 0;
    const balance = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? Number(((balance / totalIncome) * 100).toFixed(1)) : 0;

    const categoryRows = await this.database.all<{ category: string; total: number }>(
      `SELECT category, SUM(amount) as total FROM transactions WHERE user_phone = ? AND type = 'expense' ${dateCondition} GROUP BY category ORDER BY total DESC`,
      params
    );

    const byCategory = categoryRows.map((cat) => ({
      category: cat.category,
      amount: cat.total,
      percentage: totalExpense > 0 ? Number(((cat.total / totalExpense) * 100).toFixed(1)) : 0,
    }));

    return { totalIncome, totalExpense, balance, transactionCount: countRow?.count || 0, period: labelPeriod, savingsRate, byCategory };
  }

  // ─── ORÇAMENTOS ────────────────────────────────────────────────────────────

  public async setBudget(user_phone: string, category: string, amount_limit: number, period?: string): Promise<Budget> {
    await this.ensureUser(user_phone);
    const now = new Date();
    const budgetPeriod = period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await this.database.run(
      `INSERT INTO budgets (user_phone, category, amount_limit, period) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_phone, category, period) DO UPDATE SET amount_limit = excluded.amount_limit`,
      [user_phone, category, amount_limit, budgetPeriod]
    );
    return { user_phone, category, amount_limit, period: budgetPeriod };
  }

  public async getBudgetStatus(user_phone: string, period?: string): Promise<any[]> {
    await this.ensureUser(user_phone);
    const now = new Date();
    const budgetPeriod = period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const budgets = await this.database.all<Budget>(
      'SELECT * FROM budgets WHERE user_phone = ? AND period = ?',
      [user_phone, budgetPeriod]
    );
    const results = [];
    for (const b of budgets) {
      const spentRow = await this.database.get<{ total: number }>(
        `SELECT SUM(amount) as total FROM transactions WHERE user_phone = ? AND category = ? AND type = 'expense' AND date LIKE ?`,
        [user_phone, b.category, `${budgetPeriod}%`]
      );
      const spent = spentRow?.total || 0;
      const remaining = b.amount_limit - spent;
      const percent = b.amount_limit > 0 ? (spent / b.amount_limit) * 100 : 0;
      results.push({ category: b.category, limit: b.amount_limit, spent, remaining, percent: Number(percent.toFixed(1)), isExceeded: spent > b.amount_limit, period: b.period });
    }
    return results;
  }

  // ─── METAS FINANCEIRAS ─────────────────────────────────────────────────────

  public async createGoal(goal: Omit<FinancialGoal, 'id'>): Promise<FinancialGoal & { id: number }> {
    await this.ensureUser(goal.user_phone);
    const result = await this.database.run(
      `INSERT INTO financial_goals (user_phone, name, description, target_amount, current_amount, deadline, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [goal.user_phone, goal.name, goal.description || '', goal.target_amount, goal.current_amount || 0, goal.deadline || null, goal.priority || 2, goal.status || 'active']
    );
    return { ...goal, id: result.lastID };
  }

  public async updateGoalProgress(user_phone: string, goalId: number, amount: number): Promise<FinancialGoal | null> {
    const goal = await this.database.get<FinancialGoal>(
      'SELECT * FROM financial_goals WHERE id = ? AND user_phone = ?',
      [goalId, user_phone]
    );
    if (!goal) return null;
    const newAmount = Math.min((goal.current_amount || 0) + amount, goal.target_amount);
    const status = newAmount >= goal.target_amount ? 'completed' : goal.status;
    await this.database.run(
      'UPDATE financial_goals SET current_amount = ?, status = ? WHERE id = ?',
      [newAmount, status, goalId]
    );
    return { ...goal, current_amount: newAmount, status };
  }

  public async getGoals(user_phone: string): Promise<FinancialGoal[]> {
    return this.database.all<FinancialGoal>(
      `SELECT * FROM financial_goals WHERE user_phone = ? AND status IN ('active','paused') ORDER BY priority, created_at`,
      [user_phone]
    );
  }

  // ─── INVESTIMENTOS ─────────────────────────────────────────────────────────

  public async addInvestment(inv: Omit<Investment, 'id'>): Promise<Investment & { id: number }> {
    await this.ensureUser(inv.user_phone);
    const result = await this.database.run(
      `INSERT INTO investments (user_phone, name, type, institution, amount_invested, current_value, purchase_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [inv.user_phone, inv.name, inv.type, inv.institution || '', inv.amount_invested, inv.current_value || inv.amount_invested, inv.purchase_date || new Date().toISOString().split('T')[0]]
    );
    return { ...inv, id: result.lastID };
  }

  public async getInvestments(user_phone: string): Promise<Investment[]> {
    return this.database.all<Investment>(
      'SELECT * FROM investments WHERE user_phone = ? ORDER BY current_value DESC',
      [user_phone]
    );
  }

  // ─── PATRIMÔNIO LÍQUIDO ────────────────────────────────────────────────────

  public async getNetWorth(user_phone: string): Promise<NetWorth> {
    await this.ensureUser(user_phone);

    // Saldo total em contas bancárias
    const accountsRow = await this.database.get<{ total: number }>(
      `SELECT SUM(balance) as total FROM accounts WHERE user_phone = ? AND is_active = 1 AND account_type != 'credit_card'`,
      [user_phone]
    );

    // Soma dos investimentos (valor atual)
    const investmentsRow = await this.database.get<{ total: number; invested: number }>(
      `SELECT SUM(current_value) as total, SUM(amount_invested) as invested FROM investments WHERE user_phone = ?`,
      [user_phone]
    );

    // Dívidas ativas
    const debtsRow = await this.database.get<{ total: number }>(
      `SELECT SUM(remaining_amount) as total FROM debts WHERE user_phone = ? AND is_active = 1`,
      [user_phone]
    );

    const accountsBalance = accountsRow?.total || 0;
    const totalInvestments = investmentsRow?.total || 0;
    const amountInvested = investmentsRow?.invested || 0;
    const totalDebts = debtsRow?.total || 0;
    const totalAssets = accountsBalance + totalInvestments;
    const netWorth = totalAssets - totalDebts;
    const investmentReturn = amountInvested > 0 ? ((totalInvestments - amountInvested) / amountInvested) * 100 : 0;

    return { totalAssets, totalDebts, totalInvestments, accountsBalance, netWorth, investmentReturn: Number(investmentReturn.toFixed(2)) };
  }

  // ─── SCORE FINANCEIRO OPEN FINANCE ────────────────────────────────────────

  public async getFinancialScore(user_phone: string): Promise<FinancialScore> {
    const summary = await this.getSummary(user_phone, 'this_month');
    const budgets = await this.getBudgetStatus(user_phone);
    const goals = await this.getGoals(user_phone);
    const netWorth = await this.getNetWorth(user_phone);

    // 1. Taxa de poupança (0-25 pontos)
    const savingsScore = Math.min(25, Math.max(0, summary.savingsRate));

    // 2. Aderência ao orçamento (0-25 pontos)
    let budgetScore = 20; // padrão se não tiver orçamentos
    if (budgets.length > 0) {
      const exceeded = budgets.filter(b => b.isExceeded).length;
      budgetScore = Math.round(25 * (1 - exceeded / budgets.length));
    }

    // 3. Progresso nas metas (0-20 pontos)
    let goalScore = 0;
    if (goals.length > 0) {
      const avgProgress = goals.reduce((acc, g) => acc + (g.current_amount / g.target_amount), 0) / goals.length;
      goalScore = Math.round(20 * avgProgress);
    }

    // 4. Ratio de dívida sobre patrimônio (0-20 pontos)
    let debtScore = 20;
    if (netWorth.totalAssets > 0) {
      const debtRatio = netWorth.totalDebts / netWorth.totalAssets;
      debtScore = Math.round(20 * Math.max(0, 1 - debtRatio));
    }

    // 5. Consistência de registro (0-10 pontos)
    const txCount = summary.transactionCount;
    const consistencyScore = Math.min(10, txCount); // até 10 registros = 10 pontos

    const total = Math.min(1000, Math.round((savingsScore + budgetScore + goalScore + debtScore + consistencyScore) * 10));

    let label = 'Iniciante';
    if (total >= 800) label = 'Excelente';
    else if (total >= 600) label = 'Muito Bom';
    else if (total >= 400) label = 'Bom';
    else if (total >= 200) label = 'Em Desenvolvimento';

    const tips: string[] = [];
    if (summary.savingsRate < 10) tips.push('Tente poupar ao menos 10% da sua renda mensal');
    if (budgets.filter(b => b.isExceeded).length > 0) tips.push('Revise os limites de gastos que foram ultrapassados');
    if (goals.length === 0) tips.push('Defina pelo menos uma meta financeira de longo prazo');
    if (netWorth.totalInvestments === 0) tips.push('Comece a investir: mesmo R$ 100/mes faz diferenca no longo prazo');
    if (tips.length === 0) tips.push('Excelente disciplina financeira! Continue assim.');

    return {
      score: total,
      label,
      breakdown: {
        savingsRate: savingsScore * 10,
        budgetAdherence: budgetScore * 10,
        goalProgress: goalScore * 10,
        debtRatio: debtScore * 10,
        consistency: consistencyScore * 10,
      },
      tips,
    };
  }

  // ─── UTILITÁRIOS ───────────────────────────────────────────────────────────

  public async getAllTransactions(user_phone?: string): Promise<Transaction[]> {
    if (user_phone) {
      return this.database.all<Transaction>('SELECT * FROM transactions WHERE user_phone = ? ORDER BY date DESC, id DESC', [user_phone]);
    }
    return this.database.all<Transaction>('SELECT * FROM transactions ORDER BY date DESC, id DESC');
  }

  public async getCategories(): Promise<any[]> {
    return this.database.all('SELECT * FROM categories ORDER BY type, name');
  }
}

export const financeService = new FinanceService();
