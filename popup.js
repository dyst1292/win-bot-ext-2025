// popup.js - Adaptado para Chrome y Winamax (Con debug de iframe)
document.addEventListener('DOMContentLoaded', function () {
  const elements = {
    status: document.getElementById('status'),
    botToken: document.getElementById('botToken'),
    chatId: document.getElementById('chatId'),
    email: document.getElementById('email'),
    password: document.getElementById('password'),
    saveConfig: document.getElementById('saveConfig'),
    loginBtn: document.getElementById('loginBtn'),
    startBot: document.getElementById('startBot'),
    stopBot: document.getElementById('stopBot'),
    testTelegram: document.getElementById('testTelegram'),
    logs: document.getElementById('logs'),
    betAmount: document.getElementById('betAmount'),
    placeBetBtn: document.getElementById('placeBetBtn'),
    debugTabs: document.getElementById('debugTabs'),
    debugPage: document.getElementById('debugPage'),
  };

  // Cargar configuración guardada
  loadConfig();

  // Event listeners
  if (elements.saveConfig) {
    elements.saveConfig.addEventListener('click', saveConfig);
  }

  if (elements.loginBtn) {
    elements.loginBtn.addEventListener('click', loginWinamax);
  }

  if (elements.startBot) {
    elements.startBot.addEventListener('click', startBot);
  }

  if (elements.stopBot) {
    elements.stopBot.addEventListener('click', stopBot);
  }

  if (elements.testTelegram) {
    elements.testTelegram.addEventListener('click', testTelegram);
  }

  if (elements.placeBetBtn) {
    elements.placeBetBtn.addEventListener('click', placeManualBet);
  }

  if (elements.debugTabs) {
    elements.debugTabs.addEventListener('click', debugTabs);
  }

  if (elements.debugPage) {
    elements.debugPage.addEventListener('click', debugPage);
  }

  // Validación del importe de apuesta
  if (elements.betAmount) {
    elements.betAmount.addEventListener('input', function () {
      const value = parseFloat(this.value);
      if (value < 1) {
        this.value = 1;
      } else if (value > 1000) {
        this.value = 1000;
      }
    });
  }

  // Actualizar estado cada 2 segundos
  setInterval(updateStatus, 2000);
  updateStatus();

  function loadConfig() {
    chrome.storage.local
      .get(['botToken', 'chatId', 'email', 'password', 'betAmount'])
      .then((result) => {
        if (elements.botToken && result.botToken) {
          elements.botToken.value = result.botToken;
        }
        if (elements.chatId && result.chatId) {
          elements.chatId.value = result.chatId;
        }
        if (elements.email && result.email) {
          elements.email.value = result.email;
        }
        if (elements.password && result.password) {
          elements.password.value = result.password;
        }
        if (elements.betAmount && result.betAmount) {
          elements.betAmount.value = result.betAmount;
        }

        if (!result.botToken || !result.chatId) {
          chrome.runtime
            .sendMessage({ action: 'loadDefaults' })
            .then(() => {
              setTimeout(loadConfig, 500);
            })
            .catch((error) => {
              console.error('Error loading defaults:', error);
            });
        }
      })
      .catch((error) => {
        console.error('Error loading config:', error);
        addLog('⚠️ Error cargando configuración');
      });
  }

  function saveConfig() {
    if (
      !elements.botToken ||
      !elements.chatId ||
      !elements.email ||
      !elements.password
    ) {
      addLog('❌ Elementos de configuración no encontrados');
      return;
    }

    const config = {
      botToken: elements.botToken.value,
      chatId: elements.chatId.value,
      email: elements.email.value,
      password: elements.password.value,
      betAmount: elements.betAmount ? elements.betAmount.value : '0.5',
    };

    chrome.storage.local
      .set(config)
      .then(() => {
        addLog('✅ Configuración guardada correctamente');
        return chrome.runtime.sendMessage({
          action: 'updateConfig',
          config: config,
        });
      })
      .then(() => {
        addLog('📡 Configuración sincronizada con el bot');
      })
      .catch((error) => {
        console.error('Error saving config:', error);
        addLog('❌ Error guardando configuración');
      });
  }

  function loginWinamax() {
    if (!elements.email || !elements.password) {
      addLog('❌ Campos de login no encontrados');
      return;
    }

    if (!elements.email.value || !elements.password.value) {
      addLog('❌ Email y contraseña requeridos');
      return;
    }

    addLog('🔄 Iniciando proceso de login en Winamax...');

    // Deshabilitar botón temporalmente
    if (elements.loginBtn) {
      elements.loginBtn.disabled = true;
      elements.loginBtn.textContent = '⏳ Conectando...';
    }

    chrome.runtime
      .sendMessage({
        action: 'loginWinamax',
        credentials: {
          email: elements.email.value,
          password: elements.password.value,
        },
      })
      .then(() => {
        addLog('📤 Solicitud de login enviada');
      })
      .catch((error) => {
        console.error('Error sending login request:', error);
        addLog('❌ Error enviando solicitud de login');
      })
      .finally(() => {
        // Rehabilitar botón después de 5 segundos
        setTimeout(() => {
          if (elements.loginBtn) {
            elements.loginBtn.disabled = false;
            elements.loginBtn.textContent = '🚀 Login Winamax';
          }
        }, 5000);
      });
  }

  function startBot() {
    if (!elements.botToken || !elements.chatId) {
      addLog('❌ Configuración incompleta');
      return;
    }

    if (!elements.botToken.value || !elements.chatId.value) {
      addLog('❌ Token y Chat ID requeridos');
      return;
    }

    addLog('🚀 Iniciando bot de Winamax...');

    chrome.runtime
      .sendMessage({ action: 'startBot' })
      .then(() => {
        addLog('📡 Comando de inicio enviado');
      })
      .catch((error) => {
        console.error('Error starting bot:', error);
        addLog('❌ Error iniciando bot');
      });
  }

  function stopBot() {
    addLog('🛑 Deteniendo bot...');

    chrome.runtime
      .sendMessage({ action: 'stopBot' })
      .then(() => {
        addLog('📡 Comando de parada enviado');
      })
      .catch((error) => {
        console.error('Error stopping bot:', error);
        addLog('❌ Error deteniendo bot');
      });
  }

  function testTelegram() {
    if (!elements.botToken) {
      addLog('❌ Campo de token no encontrado');
      return;
    }

    if (!elements.botToken.value) {
      addLog('❌ Token de bot requerido para el test');
      return;
    }

    addLog('🧪 Probando conexión con Telegram...');

    chrome.runtime
      .sendMessage({
        action: 'testTelegram',
        token: elements.botToken.value,
      })
      .then(() => {
        addLog('📡 Test de Telegram iniciado');
      })
      .catch((error) => {
        console.error('Error testing telegram:', error);
        addLog('❌ Error probando Telegram');
      });
  }

  function placeManualBet() {
    if (!elements.betAmount) {
      addLog('❌ Campo de importe no encontrado');
      return;
    }

    const amount = parseFloat(elements.betAmount.value);

    if (!amount || amount < 1) {
      addLog('❌ Importe de apuesta inválido (mínimo 1€)');
      return;
    }

    if (amount > 1000) {
      addLog('❌ Importe de apuesta demasiado alto (máximo 1000€)');
      return;
    }

    chrome.storage.local.set({ betAmount: amount.toString() });

    elements.placeBetBtn.disabled = true;
    elements.placeBetBtn.textContent = '⏳ Procesando...';

    addLog(`💰 Iniciando apuesta manual de ${amount}€ en Winamax...`);

    chrome.runtime
      .sendMessage({
        action: 'placeManualBet',
        amount: amount,
      })
      .then((response) => {
        if (response && response.success) {
          addLog('📡 Comando de apuesta manual enviado');
        } else {
          addLog('⚠️ Error enviando comando de apuesta');
        }
      })
      .catch((error) => {
        console.error('Error placing manual bet:', error);
        addLog('❌ Error enviando apuesta manual');
      })
      .finally(() => {
        setTimeout(() => {
          if (elements.placeBetBtn) {
            elements.placeBetBtn.disabled = false;
            elements.placeBetBtn.textContent = '🎯 Realizar Apuesta';
          }
        }, 3000);
      });
  }

  function debugTabs() {
    addLog('🔍 Iniciando debug de pestañas de Winamax...');

    chrome.runtime
      .sendMessage({
        action: 'debugTabs',
      })
      .then((response) => {
        if (response && response.success) {
          addLog('📡 Debug de pestañas iniciado');
        } else {
          addLog('⚠️ Error en debug de pestañas');
        }
      })
      .catch((error) => {
        console.error('Error debugging tabs:', error);
        addLog('❌ Error en debug de pestañas');
      });
  }

  function debugPage() {
    addLog('🔍 Iniciando debug de página actual...');

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) {
        chrome.tabs
          .sendMessage(tabs[0].id, {
            action: 'debugPage',
          })
          .then((response) => {
            if (response && response.received) {
              addLog('📡 Debug de página iniciado');
            } else {
              addLog('⚠️ Error en debug de página');
            }
          })
          .catch((error) => {
            console.error('Error debugging page:', error);
            addLog('❌ Error en debug de página - ¿Estás en Winamax?');
          });
      } else {
        addLog('❌ No se pudo acceder a la pestaña activa');
      }
    });
  }

  function updateStatus() {
    chrome.runtime
      .sendMessage({ action: 'getStatus' })
      .then((response) => {
        if (response && response.status && elements.status) {
          if (response.status.active) {
            elements.status.className = 'status active';
            elements.status.textContent = '✅ Bot Activo';

            // Mostrar información adicional si está disponible
            if (response.status.queueLength > 0) {
              elements.status.textContent += ` (${response.status.queueLength} en cola)`;
            }
            if (response.status.processing) {
              elements.status.textContent += ' - Procesando...';
            }
          } else {
            elements.status.className = 'status inactive';
            elements.status.textContent = '❌ Bot Inactivo';
          }
        }
      })
      .catch((error) => {
        if (elements.status) {
          elements.status.className = 'status inactive';
          elements.status.textContent = '❓ Estado Desconocido';
        }
      });
  }

  function addLog(message) {
    if (!elements.logs) return;

    const now = new Date().toLocaleTimeString('es-ES', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `<span class="log-time">[${now}]</span> ${message}`;

    elements.logs.appendChild(logEntry);
    elements.logs.scrollTop = elements.logs.scrollHeight;

    // Limitar a los últimos 50 logs
    const logs = elements.logs.children;
    if (logs.length > 50) {
      elements.logs.removeChild(logs[0]);
    }
  }

  // Escuchar mensajes del background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'log') {
      addLog(message.text);
    }
  });
});
