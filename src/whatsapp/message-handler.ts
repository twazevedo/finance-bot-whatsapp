import { downloadMediaMessage, proto, WASocket } from '@whiskeysockets/baileys';
import { geminiService } from '../services/gemini.service.js';
import { whatsAppClient } from './client.js';

export class MessageHandler {
  public static async handleMessage(msg: proto.IWebMessageInfo): Promise<void> {
    const fromJid = msg.key.remoteJid;
    if (!fromJid || fromJid === 'status@broadcast') return;

    // Ignora mensagens de grupos, canais e newsletters
    if (fromJid.endsWith('@g.us') || fromJid.endsWith('@newsletter') || fromJid.endsWith('@broadcast')) {
      return;
    }

    const cleanPhone = fromJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    const userName = msg.pushName || 'Amigo(a)';
    const sock = whatsAppClient.getSocket();

    // Extração de conteúdo
    const messageContent = msg.message;
    if (!messageContent) return;

    let text: string | undefined;
    let mediaBuffer: Buffer | undefined;
    let mediaMimeType: string | undefined;

    // 1. Mensagem de texto simples ou estendida
    if (messageContent.conversation) {
      text = messageContent.conversation;
    } else if (messageContent.extendedTextMessage?.text) {
      text = messageContent.extendedTextMessage.text;
    }

    // 2. Mensagem de áudio / nota de voz
    if (messageContent.audioMessage) {
      try {
        console.log(`🎙️ Baixando áudio recebido de ${userName} (${cleanPhone})...`);
        const buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          {
            logger: undefined as any,
            reuploadRequest: sock?.updateMediaMessage as any,
          }
        );
        mediaBuffer = buffer as Buffer;
        mediaMimeType = messageContent.audioMessage.mimetype || 'audio/ogg; codecs=opus';
      } catch (err) {
        console.error('Erro ao baixar áudio:', err);
      }
    }

    // 3. Imagem / Foto de cupom ou recibo
    if (messageContent.imageMessage) {
      try {
        console.log(`📷 Baixando imagem recebida de ${userName} (${cleanPhone})...`);
        const buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          {
            logger: undefined as any,
            reuploadRequest: sock?.updateMediaMessage as any,
          }
        );
        mediaBuffer = buffer as Buffer;
        mediaMimeType = messageContent.imageMessage.mimetype || 'image/jpeg';
        if (messageContent.imageMessage.caption) {
          text = messageContent.imageMessage.caption;
        }
      } catch (err) {
        console.error('Erro ao baixar imagem:', err);
      }
    }

    if (!text && !mediaBuffer) {
      return;
    }

    console.log(`📩 Mensagem recebida de ${userName} (${cleanPhone}): ${text ? `"${text}"` : `[Mídia: ${mediaMimeType}]`}`);

    // Normaliza JID para envio
    let replyJid = fromJid;
    if (replyJid.includes(':')) {
      const [num] = replyJid.split(':');
      replyJid = `${num}@s.whatsapp.net`;
    }

    // Feedback visual de "Digitando..." no WhatsApp
    try {
      await sock?.sendPresenceUpdate('composing', replyJid);
    } catch (e) {}

    try {
      // Processamento com a IA Gemini
      const replyText = await geminiService.processMessage({
        userPhone: cleanPhone,
        userName,
        text,
        mediaBuffer,
        mediaMimeType,
      });

      // Envia a resposta no WhatsApp e rastreia o ID para não entrar em loop
      const sent = await sock?.sendMessage(replyJid, { text: replyText }, { quoted: msg });
      if (sent?.key?.id) {
        whatsAppClient.botSentMessageIds.add(sent.key.id);
      }

      console.log(`📤 Resposta enviada com sucesso para ${cleanPhone}`);
    } catch (err: any) {
      console.error(`Erro ao responder mensagem para ${cleanPhone}:`, err);
      const sentErr = await sock?.sendMessage(
        replyJid,
        {
          text: `❌ Ops! Tive um problema ao processar seu pedido. Por favor, tente novamente em instantes.`,
        },
        { quoted: msg }
      );
      if (sentErr?.key?.id) {
        whatsAppClient.botSentMessageIds.add(sentErr.key.id);
      }
    } finally {
      try {
        await sock?.sendPresenceUpdate('paused', replyJid);
      } catch (e) {}
    }
  }
}
