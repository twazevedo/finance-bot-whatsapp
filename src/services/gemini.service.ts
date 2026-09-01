import { GoogleGenAI, Type } from '@google/genai';
import { CONFIG } from '../config/index.js';
import { db } from '../database/db.js';
import { financeService, Transaction } from './finance.service.js';
import { ReportService } from './report.service.js';

export interface ProcessMessageOptions {
  userPhone: string;
  userName?: string;
  text?: string;
  mediaBuffer?: Buffer;
  mediaMimeType?: string;
}

export class GeminiService {
  private ai: GoogleGenAI;
  private model: string;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY });
    this.model = CONFIG.GEMINI_MODEL || 'gemini-3.6-flash';
  }

  private getSystemInstruction(): string {
    const today = new Date().toISOString().split('T')[0];
    return `Voce e um Consultor Financeiro Pessoal Premium integrado ao WhatsApp, compativel com o ecossistema Open Finance Brasil (Banco Central).

Data atual: ${today}. Moeda: BRL. Fuso: America/Sao_Paulo.

REGRAS CRITICAS:
1. NUNCA use caracteres especiais: sem emojis complexos, sem Unicode especial, sem caixas ou tabelas fancy.
2. Use apenas ASCII puro, asteriscos para negrito (*texto*) e underscore para italico (_texto_).
3. Seja direto, profissional e objetivo. Sem floreios.
4. Identifique automaticamente: estabelecimentos, valores, categorias e formas de pagamento.
5. Conheca marcas brasileiras: Nubank, Itau, Bradesco, XP, BTG, iFood, Uber, 99, Carrefour, Americanas.
6. Ao detectar qualquer gasto ou receita no texto, use a ferramenta 'add_transaction' imediatamente.
7. Formate valores sempre com virgula: R$ 1.500,00`;
  }

  private getTools() {
    return [{
      functionDeclarations: [
        {
          name: 'add_transaction',
          description: 'Registra despesa, receita ou transferencia financeira.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['expense', 'income', 'transfer'], description: 'Tipo da transacao' },
              amount: { type: Type.NUMBER, description: 'Valor positivo em reais' },
              category: { type: Type.STRING, description: 'Categoria (Alimentacao, Transporte, Moradia, Saude, Lazer, Assinaturas, Salario, Freelance, etc.)' },
              description: { type: Type.STRING, description: 'Nome do estabelecimento ou descricao' },
              payment_method: { type: Type.STRING, enum: ['pix', 'cartao_credito', 'cartao_debito', 'dinheiro', 'boleto', 'outro'], description: 'Forma de pagamento' },
              date: { type: Type.STRING, description: 'Data no formato YYYY-MM-DD' },
            },
            required: ['type', 'amount', 'category'],
          },
        },
        {
          name: 'get_financial_summary',
          description: 'Obtem resumo financeiro com saldo, receitas, despesas, taxa de poupanca e categorias.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              period: { type: Type.STRING, description: "Periodo: 'this_month', 'today', 'all' ou 'YYYY-MM'" },
            },
          },
        },
        {
          name: 'get_statement',
          description: 'Extrato detalhado dos lancamentos.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              limit: { type: Type.NUMBER, description: 'Quantidade de registros (padrao 10)' },
              category: { type: Type.STRING, description: 'Filtrar por categoria (opcional)' },
            },
          },
        },
        {
          name: 'delete_transaction',
          description: 'Desfaz ou remove um lancamento.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              is_last: { type: Type.BOOLEAN, description: 'True para remover o ultimo lancamento' },
              transaction_id: { type: Type.NUMBER, description: 'ID especifico do lancamento' },
            },
          },
        },
        {
          name: 'set_category_budget',
          description: 'Define limite de gastos mensal para uma categoria.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING, description: 'Nome da categoria' },
              amount_limit: { type: Type.NUMBER, description: 'Valor limite mensal' },
            },
            required: ['category', 'amount_limit'],
          },
        },
        {
          name: 'get_budget_status',
          description: 'Consulta status dos orcamentos definidos.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              period: { type: Type.STRING, description: 'Periodo YYYY-MM' },
            },
          },
        },
        {
          name: 'create_financial_goal',
          description: 'Cria uma meta financeira de vida (reserva de emergencia, viagem, aposentadoria, etc.).',
          parameters: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: 'Nome da meta' },
              target_amount: { type: Type.NUMBER, description: 'Valor total necessario' },
              current_amount: { type: Type.NUMBER, description: 'Valor ja guardado (padrao 0)' },
              deadline: { type: Type.STRING, description: 'Prazo no formato YYYY-MM-DD (opcional)' },
              description: { type: Type.STRING, description: 'Descricao da meta' },
              priority: { type: Type.NUMBER, description: '1=Alta, 2=Media, 3=Baixa' },
            },
            required: ['name', 'target_amount'],
          },
        },
        {
          name: 'add_investment',
          description: 'Registra um investimento no patrimonio (CDB, Tesouro Direto, acoes, fundos, criptomoedas).',
          parameters: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: 'Nome do investimento' },
              type: { type: Type.STRING, description: 'Tipo (CDB, LCI, LCA, Tesouro Direto, Acoes, FIIs, Cripto, Fundo)' },
              institution: { type: Type.STRING, description: 'Instituicao financeira' },
              amount_invested: { type: Type.NUMBER, description: 'Valor investido' },
              current_value: { type: Type.NUMBER, description: 'Valor atual (se diferente do investido)' },
              purchase_date: { type: Type.STRING, description: 'Data de compra YYYY-MM-DD' },
            },
            required: ['name', 'type', 'amount_invested'],
          },
        },
        {
          name: 'get_net_worth',
          description: 'Calcula e exibe o patrimonio liquido (ativos - passivos).',
          parameters: { type: Type.OBJECT, properties: {} },
        },
        {
          name: 'get_financial_score',
          description: 'Calcula o Score Financeiro Open Finance (0-1000) do usuario com recomendacoes.',
          parameters: { type: Type.OBJECT, properties: {} },
        },
        {
          name: 'add_debt',
          description: 'Registra uma divida, boleto ou financiamento (Bacen SCR / Serasa).',
          parameters: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: 'Nome da divida, boleto ou contrato' },
              institution: { type: Type.STRING, description: 'Banco, credor ou emissor (ex: Santander, Nubank, Caixa, Serasa)' },
              total_amount: { type: Type.NUMBER, description: 'Valor total da divida' },
              remaining_amount: { type: Type.NUMBER, description: 'Valor restante pendente' },
              monthly_payment: { type: Type.NUMBER, description: 'Valor da parcela mensal (se parcelado)' },
              interest_rate: { type: Type.NUMBER, description: 'Taxa de juros anual/mensal' },
              due_date: { type: Type.STRING, description: 'Data de vencimento YYYY-MM-DD' },
            },
            required: ['name', 'total_amount'],
          },
        },
        {
          name: 'pay_debt',
          description: 'Registra o pagamento ou abatimento de uma divida ou boleto cadastrado.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              debt_id: { type: Type.NUMBER, description: 'ID da divida a ser abatida' },
              payment_amount: { type: Type.NUMBER, description: 'Valor pago/abatido' },
            },
            required: ['debt_id', 'payment_amount'],
          },
        },
      ],
    }];
  }

  // ─── CONSULTORIA IA ────────────────────────────────────────────────────────

  private async generateAIAdvice(userPhone: string): Promise<string> {
    const [summary, score, netWorth, goals] = await Promise.all([
      financeService.getSummary(userPhone, 'this_month'),
      financeService.getFinancialScore(userPhone),
      financeService.getNetWorth(userPhone),
      financeService.getGoals(userPhone),
    ]);

    const prompt = `Analise esses dados financeiros reais e gere uma consultoria objetiva, pratica e motivadora em portugues. Use apenas texto simples sem emojis:

DADOS DO MES:
- Receitas: ${ReportService.formatCurrency(summary.totalIncome)}
- Despesas: ${ReportService.formatCurrency(summary.totalExpense)}
- Saldo: ${ReportService.formatCurrency(summary.balance)}
- Taxa de poupanca: ${summary.savingsRate}%
- Score Open Finance: ${score.score}/1000 (${score.label})
- Patrimonio liquido: ${ReportService.formatCurrency(netWorth.netWorth)}
- Metas ativas: ${goals.length}
- Maiores gastos: ${summary.byCategory.slice(0, 3).map(c => `${c.category} ${ReportService.formatCurrency(c.amount)}`).join(', ') || 'nenhum'}

Gere uma analise com: (1) Diagnostico do momento atual, (2) 2 acoes praticas imediatas, (3) Uma projecao de 6 meses no ritmo atual. Seja direto e sem floreios. Maximo 200 palavras.`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: [{ text: prompt }],
        config: { systemInstruction: this.getSystemInstruction(), temperature: 0.3 },
      });
      let reply = `💡 *CONSULTORIA FINANCEIRA COM IA*\n------------------------------\n`;
      reply += `Score: ${score.score}/1000 — ${score.label}\n------------------------------\n\n`;
      reply += response.text || 'Continue registrando seus lancamentos para analises mais precisas.';
      return reply;
    } catch {
      return `💡 *CONSULTORIA FINANCEIRA*\n------------------------------\n${ReportService.formatFinancialScore(score)}`;
    }
  }

  // ─── PROCESSADOR PRINCIPAL ─────────────────────────────────────────────────

  public async processMessage(options: ProcessMessageOptions): Promise<string> {
    const { userPhone, userName, text, mediaBuffer, mediaMimeType } = options;

    if (!CONFIG.GEMINI_API_KEY) {
      return `AVISO: Chave de API do Gemini nao configurada.\nAdicione no arquivo .env: GEMINI_API_KEY=sua_chave`;
    }

    await financeService.ensureUser(userPhone, userName);

    // Normaliza texto: remove acentos para comparacao de comandos
    const rawText = (text || '').trim();
    const normalized = rawText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '');

    const footer = ReportService.getFinancialOptionsFooter();

    const saveHistory = async (userMsg: string, botReply: string) => {
      await db.addChatMessage(userPhone, 'user', userMsg);
      await db.addChatMessage(userPhone, 'model', botReply);
    };

    // ── Comandos diretos (sem chamar Gemini) ──────────────────────────────────

    if (normalized === '1' || normalized.includes('saldo') || normalized.includes('resumo')) {
      const summary = await financeService.getSummary(userPhone, 'this_month');
      const reply = ReportService.formatSummary(summary) + footer;
      await saveHistory(rawText, reply);
      return reply;
    }

    if (normalized === '2' || normalized.includes('extrato') || normalized.includes('lancamentos') || normalized === 'ultimos gastos') {
      const txs = await financeService.getStatement(userPhone, 10);
      const reply = ReportService.formatStatement(txs) + footer;
      await saveHistory(rawText, reply);
      return reply;
    }

    if (normalized === '3' || normalized.includes('meta') || normalized.includes('orcamento') || normalized.includes('limite')) {
      const [budgets, goals] = await Promise.all([
        financeService.getBudgetStatus(userPhone),
        financeService.getGoals(userPhone),
      ]);
      let reply = ReportService.formatBudgetStatus(budgets);
      if (goals.length > 0) reply += '\n\n' + ReportService.formatGoals(goals);
      reply += footer;
      await saveHistory(rawText, reply);
      return reply;
    }

    if (normalized === '4' || normalized.includes('score') || normalized.includes('pontuacao') || normalized.includes('open finance')) {
      const score = await financeService.getFinancialScore(userPhone);
      const reply = ReportService.formatFinancialScore(score) + footer;
      await saveHistory(rawText, reply);
      return reply;
    }

    if (normalized === '5' || normalized.includes('patrimonio') || normalized.includes('liquido') || normalized.includes('investimento')) {
      const nw = await financeService.getNetWorth(userPhone);
      const invs = await financeService.getInvestments(userPhone);
      let reply = ReportService.formatNetWorth(nw);
      if (invs.length > 0) {
        reply += '\n\n*Carteira de Investimentos:*\n';
        for (const inv of invs) {
          const ret = inv.amount_invested > 0 ? ((inv.current_value - inv.amount_invested) / inv.amount_invested * 100).toFixed(1) : '0.0';
          reply += `- ${inv.name} (${inv.type}): ${ReportService.formatCurrency(inv.current_value)} (${parseFloat(ret) >= 0 ? '+' : ''}${ret}%)\n`;
        }
      }
      reply += footer;
      await saveHistory(rawText, reply);
      return reply;
    }

    if (normalized === '6' || normalized.includes('dica') || normalized.includes('conselho') || normalized.includes('coach') || normalized.includes('consultoria')) {
      const advice = await this.generateAIAdvice(userPhone);
      const reply = advice + footer;
      await saveHistory(rawText, reply);
      return reply;
    }

    if (normalized === '7' || normalized.includes('desfazer') || normalized.includes('apagar ultimo') || normalized.includes('cancelar ultimo')) {
      const deleted = await financeService.deleteLastTransaction(userPhone);
      const summary = await financeService.getSummary(userPhone, 'this_month');
      let reply: string;
      if (deleted) {
        const sign = deleted.type === 'income' ? '[+]' : '[-]';
        reply = `[DESFEITO] ${sign} *${ReportService.formatCurrency(deleted.amount)}* — ${deleted.category}\n${deleted.description || ''}\n\nSaldo atual: *${ReportService.formatCurrency(summary.balance)}*`;
      } else {
        reply = `Nenhum lancamento encontrado para desfazer.`;
      }
      reply += footer;
      await saveHistory(rawText, reply);
      return reply;
    }

    if (normalized === '8' || normalized.includes('divida') || normalized.includes('boleto') || normalized.includes('serasa') || normalized.includes('bacen') || normalized.includes('scr')) {
      const debts = await financeService.getDebts(userPhone);
      const reply = ReportService.formatDebts(debts) + footer;
      await saveHistory(rawText, reply);
      return reply;
    }

    if (['menu', 'ajuda', 'help', 'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'start', 'comecar'].includes(normalized)) {
      const [summary, score] = await Promise.all([
        financeService.getSummary(userPhone, 'this_month'),
        financeService.getFinancialScore(userPhone),
      ]);
      let reply = `Ola, *${userName || 'Investidor'}*! Consultor Financeiro ativo.\n`;
      reply += `------------------------------\n`;
      reply += `Saldo do mes: *${ReportService.formatCurrency(summary.balance)}*\n`;
      reply += `Score Open Finance: *${score.score}/1000* — ${score.label}`;
      reply += footer;
      reply += `\n\nExemplos do que posso fazer:\n- "Gastei R$ 50 no iFood"\n- "Recebi R$ 3.000 de salario no Pix"\n- "Meta de R$ 20.000 para reserva de emergencia"\n- "Investi R$ 500 em Tesouro Direto no BTG"`;
      await saveHistory(rawText, reply);
      return reply;
    }

    // ── Processamento com Gemini (função calling) ─────────────────────────────

    const history = await db.getRecentChatHistory(userPhone, 6);
    const contents: any[] = [];

    for (const h of history) {
      contents.push({ role: h.role, parts: [{ text: h.content }] });
    }

    const currentParts: any[] = [];
    if (mediaBuffer && mediaMimeType) {
      currentParts.push({ inlineData: { mimeType: mediaMimeType, data: mediaBuffer.toString('base64') } });
    }

    let userPrompt = rawText || '';
    if (mediaMimeType?.startsWith('audio/')) {
      userPrompt = `[Audio de voz recebido]. Transcreva e execute as ferramentas necessarias. ${userPrompt ? `Complemento: "${userPrompt}"` : ''}`;
    } else if (mediaMimeType?.startsWith('image/')) {
      userPrompt = `[Foto de comprovante recebida]. Extraia valor, local, data e registre a despesa. ${userPrompt ? `Complemento: "${userPrompt}"` : ''}`;
    }

    if (userPrompt) currentParts.push({ text: userPrompt });
    contents.push({ role: 'user', parts: currentParts });

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction: this.getSystemInstruction(),
          tools: this.getTools() as any,
          temperature: 0.1,
        },
      });

      const functionCalls = response.functionCalls;
      let finalReply = '';

      if (!functionCalls || functionCalls.length === 0) {
        finalReply = response.text || 'Como posso ajudar com suas financas hoje?';
      } else {
        const toolResponses: any[] = [];

        for (const call of functionCalls) {
          const name = call.name;
          const args: Record<string, any> = (call.args as Record<string, any>) || {};
          let functionResult: any = {};

          try {
            if (name === 'add_transaction') {
              const txData: Transaction = {
                user_phone: userPhone,
                type: args.type as any,
                amount: Number(args.amount),
                category: String(args.category),
                description: args.description ? String(args.description) : undefined,
                payment_method: args.payment_method ? String(args.payment_method) : 'outro',
                date: args.date ? String(args.date) : new Date().toISOString().split('T')[0],
                raw_input: rawText,
              };
              const created = await financeService.addTransaction(txData);
              const summary = await financeService.getSummary(userPhone, 'this_month');
              functionResult = {
                success: true,
                formattedMessage: ReportService.formatTransactionAdded(created, summary.balance),
              };
            } else if (name === 'get_financial_summary') {
              const summary = await financeService.getSummary(userPhone, args.period as string);
              functionResult = { success: true, formattedMessage: ReportService.formatSummary(summary) };
            } else if (name === 'get_statement') {
              const txs = await financeService.getStatement(userPhone, args.limit ? Number(args.limit) : 10, args.category);
              functionResult = { success: true, formattedMessage: ReportService.formatStatement(txs) };
            } else if (name === 'delete_transaction') {
              if (args.is_last) {
                const deleted = await financeService.deleteLastTransaction(userPhone);
                const summary = await financeService.getSummary(userPhone, 'this_month');
                const sign = deleted?.type === 'income' ? '[+]' : '[-]';
                const msg = deleted
                  ? `[DESFEITO] ${sign} *${ReportService.formatCurrency(deleted.amount)}* — ${deleted.category}\n\nSaldo: *${ReportService.formatCurrency(summary.balance)}*`
                  : 'Nenhum lancamento encontrado para desfazer.';
                functionResult = { success: !!deleted, formattedMessage: msg };
              } else if (args.transaction_id) {
                const ok = await financeService.deleteTransactionById(userPhone, Number(args.transaction_id));
                const summary = await financeService.getSummary(userPhone, 'this_month');
                functionResult = { success: ok, formattedMessage: ok ? `Lancamento #${args.transaction_id} removido.\nSaldo: *${ReportService.formatCurrency(summary.balance)}*` : `Lancamento #${args.transaction_id} nao encontrado.` };
              }
            } else if (name === 'set_category_budget') {
              const budget = await financeService.setBudget(userPhone, String(args.category), Number(args.amount_limit));
              functionResult = { success: true, formattedMessage: `[OK] Limite definido!\n${args.category}: *${ReportService.formatCurrency(args.amount_limit)}*/mes\nVoce recebera alertas ao atingir 80% do limite.` };
            } else if (name === 'get_budget_status') {
              const budgets = await financeService.getBudgetStatus(userPhone, args.period);
              functionResult = { success: true, formattedMessage: ReportService.formatBudgetStatus(budgets) };
            } else if (name === 'create_financial_goal') {
              const goal = await financeService.createGoal({
                user_phone: userPhone,
                name: String(args.name),
                description: args.description,
                target_amount: Number(args.target_amount),
                current_amount: Number(args.current_amount || 0),
                deadline: args.deadline,
                priority: (Number(args.priority) || 2) as 1 | 2 | 3,
                status: 'active',
              });
              const monthlyNeeded = goal.deadline
                ? ((goal.target_amount - goal.current_amount) / Math.max(1, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))).toFixed(2)
                : null;
              let msg = `[META CRIADA]\n*${goal.name}*\nObjetivo: *${ReportService.formatCurrency(goal.target_amount)}*`;
              if (goal.deadline) msg += `\nPrazo: ${ReportService.formatDate(goal.deadline)}`;
              if (monthlyNeeded) msg += `\nEconomia necessaria: *R$ ${monthlyNeeded}/mes*`;
              functionResult = { success: true, formattedMessage: msg };
            } else if (name === 'add_investment') {
              const inv = await financeService.addInvestment({
                user_phone: userPhone,
                name: String(args.name),
                type: String(args.type),
                institution: args.institution,
                amount_invested: Number(args.amount_invested),
                current_value: Number(args.current_value || args.amount_invested),
                purchase_date: args.purchase_date || new Date().toISOString().split('T')[0],
              });
              functionResult = { success: true, formattedMessage: `[INVESTIMENTO REGISTRADO]\n*${inv.name}* (${inv.type})\n${inv.institution ? `Instituicao: ${inv.institution}\n` : ''}Valor investido: *${ReportService.formatCurrency(inv.amount_invested)}*` };
            } else if (name === 'get_net_worth') {
              const nw = await financeService.getNetWorth(userPhone);
              functionResult = { success: true, formattedMessage: ReportService.formatNetWorth(nw) };
            } else if (name === 'get_financial_score') {
              const scoreData = await financeService.getFinancialScore(userPhone);
              functionResult = { success: true, formattedMessage: ReportService.formatFinancialScore(scoreData) };
            } else if (name === 'add_debt') {
              const debt = await financeService.addDebt({
                user_phone: userPhone,
                name: String(args.name),
                institution: args.institution,
                total_amount: Number(args.total_amount),
                remaining_amount: Number(args.remaining_amount || args.total_amount),
                monthly_payment: Number(args.monthly_payment || 0),
                interest_rate: Number(args.interest_rate || 0),
                due_date: args.due_date,
              });
              let msg = `[DIVIDA / BOLETO REGISTRADO]\n*${debt.name}* (${debt.institution || 'Bacen/Serasa'})\n`;
              msg += `Valor Total: *${ReportService.formatCurrency(debt.total_amount)}*\n`;
              if (debt.monthly_payment > 0) msg += `Parcela Mensal: *${ReportService.formatCurrency(debt.monthly_payment)}*\n`;
              if (debt.due_date) msg += `Vencimento: ${ReportService.formatDate(debt.due_date)}\n`;
              msg += `Cadastrado sob ID #${debt.id}.`;
              functionResult = { success: true, formattedMessage: msg };
            } else if (name === 'pay_debt') {
              const payRes = await financeService.payDebt(userPhone, Number(args.debt_id), Number(args.payment_amount));
              let msg = '';
              if (!payRes.debt) {
                msg = `Divida #${args.debt_id} nao encontrada.`;
              } else if (payRes.completed) {
                msg = `🎉 *PARABENS!* Divida #${args.debt_id} (${payRes.debt.name}) foi *TOTALMENTE QUITADA*!\nSeu Score Open Finance vai subir!`;
              } else {
                msg = `[PAGAMENTO REGISTRADO]\nDivida #${args.debt_id} (${payRes.debt.name})\nValor pago: *${ReportService.formatCurrency(args.payment_amount)}*\nSaldo devedor restante: *${ReportService.formatCurrency(payRes.remaining)}*`;
              }
              functionResult = { success: !!payRes.debt, formattedMessage: msg };
            }
          } catch (fnErr: any) {
            console.error(`Erro na tool ${name}:`, fnErr);
            functionResult = { error: fnErr.message };
          }
          toolResponses.push({ name, response: functionResult });
        }

        // Se só 1 tool com mensagem pronta, usa direto
        if (toolResponses.length === 1 && toolResponses[0].response?.formattedMessage) {
          finalReply = toolResponses[0].response.formattedMessage;
        } else {
          // Múltiplas tools: pede ao Gemini montar a resposta final
          const followContents = [
            ...contents,
            response.candidates?.[0]?.content,
            {
              role: 'user',
              parts: toolResponses.map((tr) => ({
                functionResponse: { name: tr.name, response: { result: tr.response } },
              })),
            },
          ];
          const followUp = await this.ai.models.generateContent({
            model: this.model,
            contents: followContents as any,
            config: { systemInstruction: this.getSystemInstruction(), temperature: 0.1 },
          });
          finalReply = followUp.text || toolResponses.map(t => t.response?.formattedMessage || '').join('\n');
        }
      }

      if (!finalReply.includes('ACOES RAPIDAS')) finalReply += footer;

      await saveHistory(rawText || '[midia]', finalReply);
      return finalReply;
    } catch (err: any) {
      console.error('Erro no Gemini Service:', err?.message || err);
      return `Ocorreu uma instabilidade momentanea. Por favor, tente novamente.${footer}`;
    }
  }
}

export const geminiService = new GeminiService();
