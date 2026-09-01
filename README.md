# 🏦 Open Finance IA — Consultor Financeiro Pessoal no WhatsApp & Web

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![NodeJS](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google%20Gemini%203.6%20Flash-8E75B2?style=for-the-badge&logo=google&logoColor=white)
![WhatsApp](https://img.shields.io/badge/WhatsApp%20API-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite3-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA%20Ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)

Assistente financeiro pessoal de nível executivo integrado ao **WhatsApp** e compatível com as diretrizes do **Open Finance Brasil (Banco Central)**. Utiliza Inteligência Artificial Multimodal com **Google Gemini 3.6 Flash** (Function Calling), transcrição de áudio de voz, reconhecimento OCR de comprovantes e painel web responsivo em tempo real.

---

## ✨ Principais Destaques & Funcionalidades

### 📈 1. Algoritmo de Score Open Finance (0–1000)
- Cálculo em tempo real da pontuação financeira com base em 5 pilares: Taxa de Poupança, Aderência ao Orçamento, Progresso em Metas de Vida, Ratio de Dívidas e Consistência.
- Recomendações personalizadas geradas por IA para elevar a saúde financeira.

### 💎 2. Patrimônio Líquido Consolidado
- Consolidação de saldo em contas bancárias, carteira de investimentos (CDB, Tesouro Direto, Ações, FIIs) e passivos/dívidas ativas.
- Projeção de rentabilidade e evolução patrimonial.

### 🎙️ 3. Interação Multimodal por Voz e Foto (WhatsApp)
- **Mensagens de Áudio**: Fale naturalmente (*"Gastei R$ 45 no almoço no débito"* ou *"Recebi R$ 1.500 no Pix"*) e a IA transcreve, interpreta a intenção e registra automaticamente.
- **Cupons e Comprovantes (OCR)**: Tire foto da nota fiscal; a visão computacional do Gemini extrai valor, estabelecimento, data e categoria.

### 🎯 4. Metas Financeiras de Vida & Orçamentos
- Gestão de metas com prazos e valor necessário mensal (*"Reserva de Emergência de R$ 10.000 até Dezembro"*).
- Alertas automáticos ao atingir 80% ou 100% dos limites estabelecidos por categoria.

### 📱 5. Dashboard Executivo & App Mobile (PWA)
- Interface web com tema escuro profissional em `http://localhost:3333`.
- Anéis visuais de Score, Gráficos de Pizza por categoria (Chart.js), WebSockets para atualização instantânea e simulador de chat.
- **PWA (Progressive Web App)**: Instalável nativamente no Android (Poco, Samsung, Xiaomi) e iPhone.

---

## 🛠️ Arquitetura & Tecnologias

```text
├── src/
│   ├── config/             # Configurações globais e variáveis de ambiente
│   ├── database/           # SQLite (Schemas Open Finance: accounts, goals, investments, debts)
│   ├── services/
│   │   ├── finance.service.ts   # Motor financeiro (Score, Patrimônio, Dívidas, Metas)
│   │   ├── gemini.service.ts    # Engine Gemini 3.6 Flash com 10 Function Declarations
│   │   └── report.service.ts    # Formatador de mensagens limpas (ASCII) para WhatsApp
│   ├── whatsapp/
│   │   ├── client.ts            # Socket Baileys com gerenciamento de sessão QR Code
│   │   └── message-handler.ts   # Listener de áudios, imagens e notas de voz (Self-chat)
│   └── web/
│       ├── server.ts            # API REST + Servidor de WebSockets (ws)
│       └── public/              # Dashboard PWA (index.html, manifest.json, sw.js)
```

---

## 🚀 Como Executar Localmente

### 1. Clonar o repositório
```bash
git clone https://github.com/seu-usuario/finance-bot-whatsapp.git
cd finance-bot-whatsapp
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente (`.env`)
```env
PORT=3333
GEMINI_API_KEY=sua_chave_gemini_aqui
GEMINI_MODEL=gemini-3.6-flash
DEFAULT_USER_PHONE=5511945868954
```

### 4. Iniciar o servidor
```bash
npm run dev
```

### 5. Conectar no WhatsApp
- Abra `http://localhost:3333` no navegador e escaneie o **QR Code**.

---

## 🧪 Testes Automatizados

Para rodar a suíte completa de testes automatizados unitários e de integração:
```bash
npx tsx src/tests/finance.test.ts
```

---

## 📲 Atalhos Rápidos no WhatsApp

| Número | Ação |
|---|---|
| **1** | 📊 Saldo e Resumo do Mês |
| **2** | 📑 Extrato Detalhado |
| **3** | 🎯 Metas & Orçamentos |
| **4** | 📈 Score Financeiro (Open Finance) |
| **5** | 💎 Patrimônio Líquido |
| **6** | 💡 Consultoria Financeira IA |
| **7** | ↩️ Desfazer Último Lançamento |

---

## 📄 Licença

Este projeto está sob a licença [MIT](./LICENSE).
