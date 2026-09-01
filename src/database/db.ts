import sqlite3 from 'sqlite3';
import { CONFIG } from '../config/index.js';

export class Database {
  private db: sqlite3.Database;

  constructor(dbPath: string = CONFIG.DATABASE_PATH) {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Erro ao conectar ao banco SQLite:', err.message);
      } else {
        console.log(`📦 Banco SQLite conectado em: ${dbPath}`);
      }
    });
    // Habilita WAL mode para melhor performance em concorrência
    this.db.run('PRAGMA journal_mode=WAL');
    this.db.run('PRAGMA foreign_keys=ON');
  }

  public async init(): Promise<void> {
    // ─── TABELA: Usuários ───────────────────────────────────────────────
    await this.run(`
      CREATE TABLE IF NOT EXISTS users (
        phone TEXT PRIMARY KEY,
        name TEXT,
        monthly_budget REAL DEFAULT 0,
        currency TEXT DEFAULT 'BRL',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ─── TABELA: Categorias padrão ──────────────────────────────────────
    await this.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        type TEXT CHECK(type IN ('income', 'expense')),
        icon TEXT
      );
    `);

    // ─── TABELA: Transações ─────────────────────────────────────────────
    await this.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'transfer')),
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        payment_method TEXT DEFAULT 'pix',
        account_id INTEGER,
        date TEXT NOT NULL,
        raw_input TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_phone) REFERENCES users(phone)
      );
    `);

    // ─── TABELA: Orçamentos / Limites por categoria ─────────────────────
    await this.run(`
      CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone TEXT NOT NULL,
        category TEXT NOT NULL,
        amount_limit REAL NOT NULL,
        period TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_phone, category, period),
        FOREIGN KEY (user_phone) REFERENCES users(phone)
      );
    `);

    // ─── TABELA: Contas Bancárias (Open Finance) ────────────────────────
    await this.run(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone TEXT NOT NULL,
        institution TEXT NOT NULL,
        account_type TEXT NOT NULL CHECK(account_type IN ('checking','savings','credit_card','investment','wallet')),
        name TEXT NOT NULL,
        balance REAL DEFAULT 0,
        credit_limit REAL DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        color TEXT DEFAULT '#4CAF50',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_phone) REFERENCES users(phone)
      );
    `);

    // ─── TABELA: Investimentos e Patrimônio ─────────────────────────────
    await this.run(`
      CREATE TABLE IF NOT EXISTS investments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        institution TEXT,
        amount_invested REAL NOT NULL DEFAULT 0,
        current_value REAL NOT NULL DEFAULT 0,
        purchase_date TEXT,
        maturity_date TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_phone) REFERENCES users(phone)
      );
    `);

    // ─── TABELA: Metas Financeiras de Vida ─────────────────────────────
    await this.run(`
      CREATE TABLE IF NOT EXISTS financial_goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        target_amount REAL NOT NULL,
        current_amount REAL DEFAULT 0,
        deadline TEXT,
        priority INTEGER DEFAULT 1 CHECK(priority IN (1,2,3)),
        status TEXT DEFAULT 'active' CHECK(status IN ('active','completed','paused','cancelled')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_phone) REFERENCES users(phone)
      );
    `);

    // ─── TABELA: Dívidas e Passivos ─────────────────────────────────────
    await this.run(`
      CREATE TABLE IF NOT EXISTS debts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone TEXT NOT NULL,
        name TEXT NOT NULL,
        institution TEXT,
        total_amount REAL NOT NULL,
        remaining_amount REAL NOT NULL,
        monthly_payment REAL DEFAULT 0,
        interest_rate REAL DEFAULT 0,
        due_date TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_phone) REFERENCES users(phone)
      );
    `);

    // ─── TABELA: Contas Recorrentes ─────────────────────────────────────
    await this.run(`
      CREATE TABLE IF NOT EXISTS recurring_bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        due_day INTEGER NOT NULL,
        category TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_phone) REFERENCES users(phone)
      );
    `);

    // ─── TABELA: Histórico de Chat ──────────────────────────────────────
    await this.run(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'model')),
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ─── ÍNDICES para performance ───────────────────────────────────────
    await this.run(`CREATE INDEX IF NOT EXISTS idx_tx_phone_date ON transactions(user_phone, date);`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_tx_phone_type ON transactions(user_phone, type);`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_goals_phone ON financial_goals(user_phone, status);`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_chat_phone ON chat_history(user_phone);`);

    // ─── Categorias Padrão ──────────────────────────────────────────────
    const defaultCategories = [
      { name: 'Alimentacao', type: 'expense', icon: '🍔' },
      { name: 'Mercado', type: 'expense', icon: '🛒' },
      { name: 'Transporte', type: 'expense', icon: '🚗' },
      { name: 'Moradia', type: 'expense', icon: '🏠' },
      { name: 'Saude', type: 'expense', icon: '💊' },
      { name: 'Lazer', type: 'expense', icon: '🎉' },
      { name: 'Educacao', type: 'expense', icon: '📚' },
      { name: 'Assinaturas', type: 'expense', icon: '📱' },
      { name: 'Compras', type: 'expense', icon: '🛍️' },
      { name: 'Contas', type: 'expense', icon: '📄' },
      { name: 'Outros', type: 'expense', icon: '💸' },
      { name: 'Salario', type: 'income', icon: '💰' },
      { name: 'Investimentos', type: 'income', icon: '📈' },
      { name: 'Freelance', type: 'income', icon: '💼' },
      { name: 'Vendas', type: 'income', icon: '🏷️' },
      { name: 'Outros Receita', type: 'income', icon: '💵' },
    ];

    for (const cat of defaultCategories) {
      await this.run(
        `INSERT OR IGNORE INTO categories (name, type, icon) VALUES (?, ?, ?)`,
        [cat.name, cat.type, cat.icon]
      );
    }
  }

  public run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  public get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row as T);
      });
    });
  }

  public all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve((rows || []) as T[]);
      });
    });
  }

  public async addChatMessage(userPhone: string, role: 'user' | 'model', content: string): Promise<void> {
    await this.run(
      'INSERT INTO chat_history (user_phone, role, content) VALUES (?, ?, ?)',
      [userPhone, role, content]
    );
    // Manter apenas as últimas 30 mensagens por usuário para controlar tamanho
    await this.run(
      `DELETE FROM chat_history WHERE user_phone = ? AND id NOT IN (
        SELECT id FROM chat_history WHERE user_phone = ? ORDER BY id DESC LIMIT 30
      )`,
      [userPhone, userPhone]
    );
  }

  public async getRecentChatHistory(userPhone: string, limit: number = 6): Promise<{ role: 'user' | 'model'; content: string }[]> {
    const rows = await this.all<{ role: 'user' | 'model'; content: string }>(
      'SELECT role, content FROM chat_history WHERE user_phone = ? ORDER BY id DESC LIMIT ?',
      [userPhone, limit]
    );
    return rows.reverse();
  }

  public close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}

export const db = new Database();
