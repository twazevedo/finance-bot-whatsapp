import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config/index.js';

export type WhatsAppConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'qr_ready';

export class WhatsAppClient {
  private sock: WASocket | null = null;
  private status: WhatsAppConnectionStatus = 'disconnected';
  private qrCodeRaw: string | null = null;
  private qrCodeDataUrl: string | null = null;
  private statusListeners: ((status: WhatsAppConnectionStatus, qrDataUrl?: string | null) => void)[] = [];
  private messageListeners: ((msg: proto.IWebMessageInfo) => Promise<void>)[] = [];
  public botSentMessageIds = new Set<string>();

  public getStatus(): WhatsAppConnectionStatus {
    return this.status;
  }

  public getQRDataUrl(): string | null {
    return this.qrCodeDataUrl;
  }

  public onStatusChange(callback: (status: WhatsAppConnectionStatus, qrDataUrl?: string | null) => void) {
    this.statusListeners.push(callback);
  }

  public onMessage(callback: (msg: proto.IWebMessageInfo) => Promise<void>) {
    this.messageListeners.push(callback);
  }

  private notifyStatus(status: WhatsAppConnectionStatus, qrDataUrl?: string | null) {
    this.status = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status, qrDataUrl);
      } catch (err) {
        console.error('Erro no listener de status:', err);
      }
    }
  }

  public clearAuthFolder() {
    try {
      if (fs.existsSync(CONFIG.AUTH_FOLDER)) {
        fs.rmSync(CONFIG.AUTH_FOLDER, { recursive: true, force: true });
        console.log('🧹 Pasta de autenticação limpa para nova sessão.');
      }
    } catch (e) {
      console.error('Erro ao limpar pasta de auth:', e);
    }
  }

  public async start(forceClean: boolean = false): Promise<void> {
    if (forceClean) {
      this.clearAuthFolder();
    }

    const logger = pino({ level: 'silent' });
    const { state, saveCreds } = await useMultiFileAuthState(CONFIG.AUTH_FOLDER);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`📱 Iniciando cliente WhatsApp (Baileys v${version.join('.')}, isLatest: ${isLatest})...`);
    this.notifyStatus('connecting');

    try {
      this.sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: ['Finanças IA', 'Chrome', '1.0.0'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrCodeRaw = qr;
          try {
            this.qrCodeDataUrl = await QRCode.toDataURL(qr);
          } catch (e) {
            this.qrCodeDataUrl = null;
          }

          console.log('\n======================================================');
          console.log('📷 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP:');
          console.log('======================================================');
          qrcodeTerminal.generate(qr, { small: true });
          console.log(`Ou acesse pelo navegador: http://localhost:${CONFIG.PORT}`);
          console.log('======================================================\n');

          this.notifyStatus('qr_ready', this.qrCodeDataUrl);
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401;
          console.log(`🔌 Conexão fechada (código: ${statusCode}), Reconectando?: ${shouldReconnect}`);
          this.notifyStatus('disconnected');

          if (shouldReconnect) {
            setTimeout(() => this.start(false), 3000);
          } else {
            console.log('🔄 Sessão expirada ou resetada. Recriando QR Code limpo...');
            setTimeout(() => this.start(true), 2000);
          }
        } else if (connection === 'open') {
          console.log('✅ WhatsApp conectado com sucesso!');
          this.qrCodeRaw = null;
          this.qrCodeDataUrl = null;
          this.notifyStatus('connected');
        }
      });

      this.sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify' && m.type !== 'append') return;

        for (const msg of m.messages) {
          // Ignora apenas se a mensagem foi disparada pelo próprio robô (evita loop)
          if (msg.key.id && this.botSentMessageIds.has(msg.key.id)) {
            continue;
          }

          for (const listener of this.messageListeners) {
            try {
              await listener(msg);
            } catch (err) {
              console.error('Erro ao processar mensagem no handler:', err);
            }
          }
        }
      });
    } catch (err) {
      console.error('Erro ao inicializar makeWASocket:', err);
    }
  }

  public async sendTextMessage(toJid: string, text: string): Promise<any> {
    if (!this.sock) {
      throw new Error('Cliente WhatsApp não está inicializado.');
    }
    const jid = toJid.includes('@s.whatsapp.net') ? toJid : `${toJid.replace(/\D/g, '')}@s.whatsapp.net`;
    const sent = await this.sock.sendMessage(jid, { text });
    if (sent?.key?.id) {
      this.botSentMessageIds.add(sent.key.id);
    }
    return sent;
  }

  public getSocket(): WASocket | null {
    return this.sock;
  }
}

export const whatsAppClient = new WhatsAppClient();
