import { PluggyClient } from 'pluggy-sdk';
import { CONFIG } from '../config/index.js';
import { db } from '../database/db.js';
import { financeService } from './finance.service.js';

export interface BankConnection {
  itemId: string;
  institutionName: string;
  institutionLogo?: string;
  status: string;
  accountsCount: number;
  lastSyncAt: string;
}

export class OpenFinanceService {
  private client: PluggyClient | null = null;

  constructor() {
    this.initClient();
  }

  private initClient() {
    if (CONFIG.PLUGGY_CLIENT_ID && CONFIG.PLUGGY_CLIENT_SECRET) {
      try {
        this.client = new PluggyClient({
          clientId: CONFIG.PLUGGY_CLIENT_ID,
          clientSecret: CONFIG.PLUGGY_CLIENT_SECRET,
        });
        console.log('🏦 Pluggy Open Finance Client inicializado com sucesso.');
      } catch (err: any) {
        console.error('Erro ao inicializar Pluggy Client:', err?.message || err);
      }
    }
  }

  public isConfigured(): boolean {
    return !!(CONFIG.PLUGGY_CLIENT_ID && CONFIG.PLUGGY_CLIENT_SECRET && this.client);
  }

  // Gera token de conexão segura para o widget do Open Finance
  public async createConnectToken(options?: { itemId?: string }): Promise<string> {
    if (!this.client) {
      throw new Error('Pluggy Open Finance não está configurado. Insira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env.');
    }
    const tokenResponse = await this.client.createConnectToken(options?.itemId);
    return tokenResponse.accessToken;
  }

  // Sincroniza contas e transações reais de uma conexão bancária
  public async syncItem(userPhone: string, itemId: string): Promise<{ accountsUpdated: number; transactionsSynced: number }> {
    if (!this.client) {
      throw new Error('Pluggy não está configurado.');
    }

    await financeService.ensureUser(userPhone);

    const accountsResponse = await this.client.fetchAccounts(itemId);
    const accounts = accountsResponse.results || [];
    let accountsUpdated = 0;
    let transactionsSynced = 0;

    for (const acc of accounts) {
      const typeMap: Record<string, string> = {
        CHECKING: 'checking',
        SAVINGS: 'savings',
        CREDIT: 'credit_card',
        INVESTMENT: 'investment',
      };
      const accountType = typeMap[acc.type] || 'checking';

      // Atualiza ou insere conta no banco local
      await db.run(
        `INSERT INTO accounts (user_phone, institution, account_type, name, balance, credit_limit, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [
          userPhone,
          acc.name || 'Banco Conectado',
          accountType,
          `${acc.name} (${acc.number || '0001'})`,
          acc.balance || 0,
          (acc as any).creditData?.creditLimit || 0,
        ]
      );
      accountsUpdated++;

      // Busca transações recentes dessa conta
      try {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 30);
        const fromIso = fromDate.toISOString().split('T')[0];

        const txsResponse = await this.client.fetchTransactions(acc.id, { from: fromIso, pageSize: 50 });
        const transactions = txsResponse.results || [];

        for (const tx of transactions) {
          const isExpense = tx.amount < 0;
          const absAmount = Math.abs(tx.amount);
          const txType = isExpense ? 'expense' : 'income';
          const txDate = tx.date ? new Date(tx.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

          await db.run(
            `INSERT INTO transactions (user_phone, type, amount, category, description, payment_method, date, raw_input)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userPhone,
              txType,
              absAmount,
              tx.category || 'Outros',
              tx.description || 'Transação Bancária',
              'Open Finance',
              txDate,
              `Pluggy TX: ${tx.id}`,
            ]
          );
          transactionsSynced++;
        }
      } catch (txErr) {
        console.warn(`Aviso ao buscar transações da conta ${acc.id}:`, txErr);
      }
    }

    return { accountsUpdated, transactionsSynced };
  }

  // Lista os conectores disponíveis no Brasil (Nubank, Itaú, etc)
  public async getAvailableConnectors(search?: string): Promise<any[]> {
    if (!this.client) {
      // Retorna lista padrão dos principais bancos brasileiros se ainda não tiver chave
      const defaultBanks = [
        { id: 1, name: 'Nubank', primaryColor: '#820AD1', institutionUrl: 'https://nubank.com.br' },
        { id: 2, name: 'Itaú Unibanco', primaryColor: '#EC7000', institutionUrl: 'https://itau.com.br' },
        { id: 3, name: 'Banco Bradesco', primaryColor: '#CC092F', institutionUrl: 'https://bradesco.com.br' },
        { id: 4, name: 'Banco Santander', primaryColor: '#CC0000', institutionUrl: 'https://santander.com.br' },
        { id: 5, name: 'Banco do Brasil', primaryColor: '#003DA5', institutionUrl: 'https://bb.com.br' },
        { id: 6, name: 'Banco Inter', primaryColor: '#FF7A00', institutionUrl: 'https://inter.co' },
        { id: 7, name: 'C6 Bank', primaryColor: '#242424', institutionUrl: 'https://c6bank.com.br' },
        { id: 8, name: 'XP Investimentos', primaryColor: '#000000', institutionUrl: 'https://xpi.com.br' },
        { id: 9, name: 'BTG Pactual', primaryColor: '#001E62', institutionUrl: 'https://btgpactual.com' },
      ];
      if (search) {
        return defaultBanks.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));
      }
      return defaultBanks;
    }

    const res = await this.client.fetchConnectors({ name: search, countries: ['BR'] });
    return res.results || [];
  }
}

export const openFinanceService = new OpenFinanceService();
