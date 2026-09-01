// Formatação de Moeda
function formatCurrency(num) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num || 0);
}

// Atualização de Status
function updateStatusBadge(status) {
  const badge = document.getElementById('statusBadge');
  const text = document.getElementById('statusText');
  const qrSection = document.getElementById('qrSection');
  const connectedSection = document.getElementById('connectedSection');

  badge.className = `status-badge ${status}`;

  if (status === 'connected') {
    text.textContent = 'WhatsApp Conectado';
    qrSection.style.display = 'none';
    connectedSection.style.display = 'block';
  } else if (status === 'qr_ready') {
    text.textContent = 'Aguardando Leitura do QR';
    qrSection.style.display = 'block';
    connectedSection.style.display = 'none';
  } else if (status === 'connecting') {
    text.textContent = 'Conectando ao WhatsApp...';
  } else {
    text.textContent = 'Desconectado';
    qrSection.style.display = 'block';
    connectedSection.style.display = 'none';
  }
}

// Carregar Dados Financeiros
async function loadFinancialData() {
  try {
    const summaryRes = await fetch('/api/summary');
    if (summaryRes.ok) {
      const summary = await summaryRes.json();
      document.getElementById('statIncome').textContent = formatCurrency(summary.totalIncome);
      document.getElementById('statExpense').textContent = formatCurrency(summary.totalExpense);
      document.getElementById('statBalance').textContent = formatCurrency(summary.balance);
    }

    const txRes = await fetch('/api/transactions?limit=10');
    if (txRes.ok) {
      const txs = await txRes.json();
      const txList = document.getElementById('txList');

      if (!txs || txs.length === 0) {
        txList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Nenhum lançamento registrado ainda.</div>';
        return;
      }

      txList.innerHTML = txs.map(tx => {
        const isIncome = tx.type === 'income';
        const color = isIncome ? 'var(--success)' : 'var(--danger)';
        const sign = isIncome ? '+' : '-';
        return `
          <div class="tx-item">
            <div>
              <div class="tx-category">${tx.category}</div>
              <div class="tx-desc">${tx.description || 'Sem descrição'} • ${tx.date} • ${tx.payment_method || 'outro'}</div>
            </div>
            <div class="tx-amount" style="color: ${color};">
              ${sign} ${formatCurrency(tx.amount)}
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Erro ao carregar dados:', err);
  }
}

// Polling e Status Inicial
async function checkStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    updateStatusBadge(data.status);

    if (data.qrCode) {
      const img = document.getElementById('qrImage');
      img.src = data.qrCode;
      img.style.display = 'inline-block';
      document.getElementById('qrLoading').style.display = 'none';
    }
  } catch (err) {
    console.error('Erro ao verificar status:', err);
  }
}

// WebSocket para atualizações em tempo real
function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'STATUS_UPDATE') {
        updateStatusBadge(msg.data.status);
        if (msg.data.qrCode) {
          const img = document.getElementById('qrImage');
          img.src = msg.data.qrCode;
          img.style.display = 'inline-block';
          document.getElementById('qrLoading').style.display = 'none';
        }
      }
    } catch (e) {}
  };

  ws.onclose = () => {
    setTimeout(setupWebSocket, 3000);
  };
}

// Enviar Mensagem no Chat Simulador
async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  const chatMessages = document.getElementById('chatMessages');

  // Adiciona mensagem do usuário
  const userMsgEl = document.createElement('div');
  userMsgEl.className = 'chat-msg user';
  userMsgEl.textContent = text;
  chatMessages.appendChild(userMsgEl);

  input.value = '';
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Mostra indicador de carregamento
  const loadingEl = document.createElement('div');
  loadingEl.className = 'chat-msg bot';
  loadingEl.textContent = 'Pensando... 🤔';
  chatMessages.appendChild(loadingEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    const data = await res.json();
    loadingEl.textContent = data.response || 'Erro ao obter resposta.';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Recarrega dados financeiros
    loadFinancialData();
  } catch (err) {
    loadingEl.textContent = '❌ Erro ao se comunicar com o servidor.';
  }
}

function handleChatKeyPress(e) {
  if (e.key === 'Enter') {
    sendChatMessage();
  }
}

function fillAndSend(text) {
  document.getElementById('chatInput').value = text;
  sendChatMessage();
}

// Enviar mensagem de teste para o WhatsApp real
async function sendTestToWhatsApp() {
  const phone = document.getElementById('testPhoneInput').value.trim();
  if (!phone) {
    alert('Informe o número de telefone.');
    return;
  }

  try {
    const res = await fetch('/api/send-test-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        message: '👋 *Olá! Aqui é o seu Assistente Financeiro Pessoal!*\n\nSeu robô está 100% ativo e pronto para registrar suas receitas, despesas, áudios e comprovantes!',
      }),
    });

    const data = await res.json();
    if (data.success) {
      alert('✅ Mensagem de teste enviada com sucesso para ' + phone);
    } else {
      alert('❌ Erro: ' + (data.error || 'Não foi possível enviar'));
    }
  } catch (e) {
    alert('❌ Erro ao enviar mensagem de teste');
  }
}

// Atualizar QR Code sob demanda
async function refreshQR() {
  document.getElementById('qrLoading').style.display = 'block';
  document.getElementById('qrImage').style.display = 'none';
  try {
    await fetch('/api/refresh-qr', { method: 'POST' });
    setTimeout(checkStatus, 1500);
  } catch (e) {
    alert('Erro ao solicitar novo QR Code');
  }
}

// Salvar chave do Gemini diretamente pela interface
async function saveGeminiKey() {
  const input = document.getElementById('geminiKeyInput');
  const key = input.value.trim();
  if (!key) {
    alert('Por favor, informe a chave.');
    return;
  }

  try {
    const res = await fetch('/api/set-api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key }),
    });
    const data = await res.json();
    if (data.success) {
      alert('✅ Chave Gemini salva com sucesso! Agora você pode testar o chat.');
      input.value = '';
    } else {
      alert('❌ Erro: ' + (data.error || 'Não foi possível salvar a chave'));
    }
  } catch (e) {
    alert('❌ Erro ao salvar chave');
  }
}

// Inicialização
window.addEventListener('DOMContentLoaded', () => {
  checkStatus();
  loadFinancialData();
  setupWebSocket();
  setInterval(checkStatus, 5000);
});
