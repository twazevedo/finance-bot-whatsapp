import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { CONFIG } from '../config/index.js';
import { whatsAppClient, WhatsAppConnectionStatus } from '../whatsapp/client.js';
import { financeService } from '../services/finance.service.js';
import { geminiService } from '../services/gemini.service.js';

export function createWebServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.static(path.resolve(process.cwd(), 'src', 'web', 'public')));

  function broadcastStatus(status: WhatsAppConnectionStatus, qrDataUrl?: string | null) {
    const message = JSON.stringify({
      type: 'STATUS_UPDATE',
      data: { status, qrCode: qrDataUrl || whatsAppClient.getQRDataUrl() },
    });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  }

  whatsAppClient.onStatusChange((status, qrDataUrl) => broadcastStatus(status, qrDataUrl));

  // ─── GET /api/status ───────────────────────────────────────────────────────
  app.get('/api/status', (req, res) => {
    res.json({
      status: whatsAppClient.getStatus(),
      qrCode: whatsAppClient.getQRDataUrl(),
      defaultPhone: CONFIG.DEFAULT_USER_PHONE,
      model: CONFIG.GEMINI_MODEL,
      hasApiKey: !!CONFIG.GEMINI_API_KEY,
    });
  });

  // ─── GET /api/summary ──────────────────────────────────────────────────────
  app.get('/api/summary', async (req, res) => {
    try {
      const phone = (req.query.phone as string) || CONFIG.DEFAULT_USER_PHONE;
      const period = (req.query.period as string) || 'this_month';
      const summary = await financeService.getSummary(phone, period);
      res.json(summary);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── GET /api/transactions ─────────────────────────────────────────────────
  app.get('/api/transactions', async (req, res) => {
    try {
      const phone = (req.query.phone as string) || CONFIG.DEFAULT_USER_PHONE;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const category = req.query.category as string | undefined;
      const transactions = await financeService.getStatement(phone, limit, category);
      res.json(transactions);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── GET /api/budgets ──────────────────────────────────────────────────────
  app.get('/api/budgets', async (req, res) => {
    try {
      const phone = (req.query.phone as string) || CONFIG.DEFAULT_USER_PHONE;
      const period = req.query.period as string | undefined;
      const budgets = await financeService.getBudgetStatus(phone, period);
      res.json(budgets);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── GET /api/net-worth ────────────────────────────────────────────────────
  app.get('/api/net-worth', async (req, res) => {
    try {
      const phone = (req.query.phone as string) || CONFIG.DEFAULT_USER_PHONE;
      const [netWorth, investments] = await Promise.all([
        financeService.getNetWorth(phone),
        financeService.getInvestments(phone),
      ]);
      res.json({ ...netWorth, investments });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── GET /api/financial-score ──────────────────────────────────────────────
  app.get('/api/financial-score', async (req, res) => {
    try {
      const phone = (req.query.phone as string) || CONFIG.DEFAULT_USER_PHONE;
      const score = await financeService.getFinancialScore(phone);
      res.json(score);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── GET /api/goals ────────────────────────────────────────────────────────
  app.get('/api/goals', async (req, res) => {
    try {
      const phone = (req.query.phone as string) || CONFIG.DEFAULT_USER_PHONE;
      const goals = await financeService.getGoals(phone);
      res.json(goals);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── GET /api/openfinance/summary ─────────────────────────────────────────
  app.get('/api/openfinance/summary', async (req, res) => {
    try {
      const phone = (req.query.phone as string) || CONFIG.DEFAULT_USER_PHONE;
      const [summary, score, netWorth, goals, investments] = await Promise.all([
        financeService.getSummary(phone, 'this_month'),
        financeService.getFinancialScore(phone),
        financeService.getNetWorth(phone),
        financeService.getGoals(phone),
        financeService.getInvestments(phone),
      ]);
      res.json({
        openFinance: {
          version: '1.0',
          standard: 'BACEN-Open-Finance-Brasil',
          generatedAt: new Date().toISOString(),
        },
        profile: { phone },
        cashflow: summary,
        score,
        patrimony: { ...netWorth, investments },
        goals,
      });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── OPEN FINANCE / PLUGGY BANCOS REAIS ──────────────────────────────────
  // 1. Status da integração Open Finance
  app.get('/api/openfinance/status', (req, res) => {
    const { openFinanceService } = require('../services/openfinance.service.js');
    res.json({
      configured: openFinanceService.isConfigured(),
      hasClientId: !!CONFIG.PLUGGY_CLIENT_ID,
    });
  });

  // 2. Criar token de conexão segura para o widget
  app.post('/api/openfinance/connect-token', async (req, res) => {
    try {
      const { openFinanceService } = await import('../services/openfinance.service.js');
      const token = await openFinanceService.createConnectToken();
      res.json({ success: true, accessToken: token });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. Listar bancos brasileiros disponíveis
  app.get('/api/openfinance/banks', async (req, res) => {
    try {
      const { openFinanceService } = await import('../services/openfinance.service.js');
      const search = req.query.search as string | undefined;
      const banks = await openFinanceService.getAvailableConnectors(search);
      res.json(banks);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Sincronizar dados bancários após conexão
  app.post('/api/openfinance/sync', async (req, res) => {
    try {
      const { itemId, phone } = req.body;
      if (!itemId) return res.status(400).json({ error: 'itemId é obrigatório' });
      const userPhone = phone || CONFIG.DEFAULT_USER_PHONE;
      const { openFinanceService } = await import('../services/openfinance.service.js');
      const result = await openFinanceService.syncItem(userPhone, itemId);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── POST /api/chat ────────────────────────────────────────────────────────
  app.post('/api/chat', async (req, res) => {
    try {
      const { text, phone, name } = req.body;
      const response = await geminiService.processMessage({
        userPhone: phone || CONFIG.DEFAULT_USER_PHONE,
        userName: name || 'Usuario Web',
        text,
      });
      res.json({ response });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── POST /api/send-test-whatsapp ─────────────────────────────────────────
  app.post('/api/send-test-whatsapp', async (req, res) => {
    try {
      const { phone, message } = req.body;
      const targetPhone = phone || CONFIG.DEFAULT_USER_PHONE;
      const text = message || 'Ola! Este e seu Consultor Financeiro Pessoal. Envie "menu" para comecar.';
      if (whatsAppClient.getStatus() !== 'connected') {
        return res.status(400).json({ success: false, error: 'WhatsApp nao conectado. Escaneie o QR Code.' });
      }
      await whatsAppClient.sendTextMessage(targetPhone, text);
      res.json({ success: true, message: `Mensagem enviada para ${targetPhone}` });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
  });

  // ─── POST /api/set-api-key ─────────────────────────────────────────────────
  app.post('/api/set-api-key', async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey) return res.status(400).json({ error: 'Chave nao informada' });
      CONFIG.GEMINI_API_KEY = apiKey.trim();
      process.env.GEMINI_API_KEY = apiKey.trim();
      const fs = await import('fs');
      const envPath = path.resolve(process.cwd(), '.env');
      let envContent = fs.readFileSync(envPath, 'utf8');
      envContent = envContent.replace(/GEMINI_API_KEY=.*/g, `GEMINI_API_KEY=${apiKey.trim()}`);
      fs.writeFileSync(envPath, envContent);
      res.json({ success: true, message: 'Chave do Gemini atualizada!' });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── POST /api/request-pairing-code ───────────────────────────────────────
  app.post('/api/request-pairing-code', async (req, res) => {
    try {
      const { phone } = req.body;
      const cleanPhone = (phone || CONFIG.DEFAULT_USER_PHONE).replace(/\D/g, '');
      const sock = whatsAppClient.getSocket();
      if (!sock) return res.status(400).json({ error: 'Socket nao inicializado.' });
      const code = await sock.requestPairingCode(cleanPhone);
      res.json({ success: true, code });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  return { app, server };
}
