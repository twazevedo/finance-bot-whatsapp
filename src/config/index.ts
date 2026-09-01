import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const CONFIG = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3333,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  DATABASE_PATH: process.env.DATABASE_PATH || path.resolve(process.cwd(), 'finance.db'),
  AUTH_FOLDER: process.env.AUTH_FOLDER || path.resolve(process.cwd(), 'auth_info_baileys'),
  DEFAULT_USER_PHONE: process.env.DEFAULT_USER_PHONE || '5511945868954',
  CURRENCY_SYMBOL: 'R$',
  TIMEZONE: 'America/Sao_Paulo',
  PLUGGY_CLIENT_ID: process.env.PLUGGY_CLIENT_ID || '',
  PLUGGY_CLIENT_SECRET: process.env.PLUGGY_CLIENT_SECRET || '',
};
