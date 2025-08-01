// background.js - Service Worker para Chrome con sistema de arbitraje
let botConfig = {
  // Valores por defecto (placeholder) - se sobreescriben desde storage
  token: process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE',
  chatId: process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID_HERE',
  email: process.env.WINAMAX_EMAIL || 'your@email.com',
  password: process.env.WINAMAX_PASSWORD || 'your_password',
  active: false,
  loggedIn: false,
  lastUpdateId: 0,
  defaultBetAmount: 30,
};

// Configuración por defecto para primera instalación
const DEFAULT_CONFIG = {
  token: '',
  chatId: '',
  email: '',
  password: '',
  defaultBetAmount: 30,
};

// Cargar configuración real desde storage al iniciar
chrome.storage.local
  .get(['botToken', 'chatId', 'email', 'password', 'lastUpdateId', 'betAmount'])
  .then((result) => {
    // Solo cargar si existen valores guardados
    if (result.botToken && result.botToken !== '') {
      botConfig.token = result.botToken;
    }

    if (result.chatId && result.chatId !== '') {
      botConfig.chatId = result.chatId;
    }

    if (result.email && result.email !== '') {
      botConfig.email = result.email;
    }

    if (result.password && result.password !== '') {
      botConfig.password = result.password;
    }

    if (result.betAmount) {
      botConfig.defaultBetAmount = parseFloat(result.betAmount);
    }

    if (result.lastUpdateId) {
      botConfig.lastUpdateId = result.lastUpdateId;
      sendLogToPopup(`📋 Configuración cargada desde storage`);
    }

    // Log de estado (sin mostrar valores sensibles)
    sendLogToPopup(
      `🔧 Configuración inicializada - Token: ${
        botConfig.token ? 'Configurado' : 'Pendiente'
      }`,
    );
  })
  .catch((error) => {
    console.error('Error loading config:', error);
    sendLogToPopup(
      '⚠️ Error cargando configuración, usando valores por defecto',
    );
  });

let pollingInterval = null;
const POLL_INTERVAL = 5000;

// Sistema de cola para procesar mensajes uno por uno
let messageQueue = [];
let isProcessingMessage = false;

// Cargar configuración al iniciar
chrome.storage.local
  .get(['botToken', 'chatId', 'email', 'password', 'lastUpdateId', 'betAmount'])
  .then((result) => {
    if (result.botToken) {
      botConfig.token = result.botToken;
    } else {
      chrome.storage.local.set({ botToken: botConfig.token });
    }

    if (result.chatId) {
      botConfig.chatId = result.chatId;
    } else {
      chrome.storage.local.set({ chatId: botConfig.chatId });
    }

    if (result.email) {
      botConfig.email = result.email;
    } else {
      chrome.storage.local.set({ email: botConfig.email });
    }

    if (result.password) {
      botConfig.password = result.password;
    } else {
      chrome.storage.local.set({ password: botConfig.password });
    }

    if (result.betAmount) {
      botConfig.defaultBetAmount = parseFloat(result.betAmount);
    } else {
      chrome.storage.local.set({
        betAmount: botConfig.defaultBetAmount.toString(),
      });
    }

    if (result.lastUpdateId) {
      botConfig.lastUpdateId = result.lastUpdateId;
      sendLogToPopup(
        `📋 Offset cargado desde storage: ${botConfig.lastUpdateId}`,
      );
    }
  });

// Escuchar mensajes del popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'updateConfig':
      updateConfig(message.config);
      sendResponse({ success: true });
      break;
    case 'loginWinamax':
      loginWinamax(message.credentials);
      sendResponse({ success: true });
      break;
    case 'startBot':
      startBot();
      sendResponse({ success: true });
      break;
    case 'stopBot':
      stopBot();
      sendResponse({ success: true });
      break;
    case 'getStatus':
      sendResponse({
        status: {
          active: botConfig.active,
          loggedIn: botConfig.loggedIn,
          queueLength: messageQueue.length,
          processing: isProcessingMessage,
        },
      });
      break;
    case 'loadDefaults':
      loadDefaultsToStorage();
      sendResponse({ success: true });
      break;
    case 'testTelegram':
      testTelegramConnection(message.token);
      sendResponse({ success: true });
      break;
    case 'placeManualBet':
      placeManualBet(message.amount);
      sendResponse({ success: true });
      break;
    case 'debugTabs':
      debugTabs();
      sendResponse({ success: true });
      break;
    case 'detailedLog':
      handleDetailedLog(message);
      sendResponse({ success: true });
      break;
  }
  return true;
});

function loadDefaultsToStorage() {
  chrome.storage.local.set({
    botToken: botConfig.token,
    chatId: botConfig.chatId,
    email: botConfig.email,
    password: botConfig.password,
    betAmount: botConfig.defaultBetAmount.toString(),
  });
  sendLogToPopup('✅ Valores por defecto cargados');
}

function updateConfig(config) {
  botConfig.token = config.botToken;
  botConfig.chatId = config.chatId;
  botConfig.email = config.email;
  botConfig.password = config.password;

  if (config.betAmount) {
    botConfig.defaultBetAmount = parseFloat(config.betAmount);
  }

  chrome.storage.local.set({
    botToken: config.botToken,
    chatId: config.chatId,
    email: config.email,
    password: config.password,
    betAmount: config.betAmount,
  });

  sendLogToPopup('✅ Configuración actualizada');
}

async function checkContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return response && response.status === 'ready';
  } catch (error) {
    return false;
  }
}

async function waitForContentScript(tabId, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    sendLogToPopup(
      `🔄 Verificando content script... (${i + 1}/${maxAttempts})`,
    );

    if (await checkContentScript(tabId)) {
      sendLogToPopup('✅ Content script listo');
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  sendLogToPopup('❌ Content script no responde después de múltiples intentos');
  return false;
}

async function loginWinamax(credentials) {
  try {
    sendLogToPopup('🔍 Buscando pestañas de Winamax...');

    const tabs = await chrome.tabs.query({
      url: [
        'https://www.winamax.es/*',
        'https://www.winamax.fr/*',
        'https://winamax.es/*',
        'https://winamax.fr/*',
      ],
    });

    if (tabs.length > 0) {
      const tab = tabs[0];
      sendLogToPopup(`🎯 Pestaña encontrada: ${tab.url}`);

      if (await waitForContentScript(tab.id)) {
        sendLogToPopup('📤 Enviando credenciales...');
        await chrome.tabs.sendMessage(tab.id, {
          action: 'login',
          credentials: credentials,
        });
      } else {
        sendLogToPopup('🔄 Recargando pestaña...');
        await chrome.tabs.reload(tab.id);

        await new Promise((resolve) => setTimeout(resolve, 3000));

        if (await waitForContentScript(tab.id)) {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'login',
            credentials: credentials,
          });
        } else {
          sendLogToPopup('❌ No se pudo establecer conexión con la pestaña');
        }
      }
    } else {
      sendLogToPopup('🆕 Creando nueva pestaña...');
      const tab = await chrome.tabs.create({
        url: 'https://www.winamax.es/account/login.php',
        active: true,
      });

      sendLogToPopup('⏳ Esperando a que cargue...');
      await new Promise((resolve) => setTimeout(resolve, 5000));

      if (await waitForContentScript(tab.id)) {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'login',
          credentials: credentials,
        });
      } else {
        sendLogToPopup(
          '❌ La nueva pestaña no está lista. Inténtalo manualmente.',
        );
      }
    }
  } catch (error) {
    sendLogToPopup(`❌ Error en loginWinamax: ${error.message}`);
    console.error('Error in loginWinamax:', error);
  }
}

async function startBot() {
  if (!botConfig.token || !botConfig.chatId) {
    sendLogToPopup('❌ Configuración incompleta');
    return;
  }

  if (pollingInterval) {
    clearInterval(pollingInterval);
  }

  botConfig.active = true;
  sendLogToPopup('🚀 Bot iniciado - Sistema de arbitraje activo');

  await initializeTelegramOffset();

  pollingInterval = setInterval(pollTelegramUpdates, POLL_INTERVAL);

  sendLogToPopup('📡 Conectando con Telegram...');
  sendLogToPopup(`📋 Iniciando desde offset: ${botConfig.lastUpdateId + 1}`);
}

async function initializeTelegramOffset() {
  try {
    sendLogToPopup('🔄 Inicializando offset de Telegram...');

    const url = `https://api.telegram.org/bot${botConfig.token}/getUpdates?limit=1&offset=-1`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.ok && data.result.length > 0) {
      botConfig.lastUpdateId = data.result[data.result.length - 1].update_id;
      await chrome.storage.local.set({ lastUpdateId: botConfig.lastUpdateId });
      sendLogToPopup(`📋 Offset inicializado en: ${botConfig.lastUpdateId}`);
      sendLogToPopup('✅ Solo se procesarán mensajes nuevos a partir de ahora');
    } else {
      sendLogToPopup('📭 No hay mensajes recientes, empezando desde 0');
      botConfig.lastUpdateId = 0;
      await chrome.storage.local.set({ lastUpdateId: 0 });
    }
  } catch (error) {
    sendLogToPopup('⚠️ Error inicializando offset, usando el último guardado');
    console.error('Error initializing offset:', error);
  }
}

async function testTelegramConnection(token) {
  try {
    sendLogToPopup('🧪 Probando getMe...');

    const getMeUrl = `https://api.telegram.org/bot${token}/getMe`;
    const getMeResponse = await fetch(getMeUrl);
    const getMeData = await getMeResponse.json();

    if (getMeData.ok) {
      sendLogToPopup(
        `✅ Bot conectado: ${getMeData.result.first_name} (@${getMeData.result.username})`,
      );
    } else {
      sendLogToPopup(`❌ Error getMe: ${getMeData.description}`);
      return;
    }

    sendLogToPopup('🧪 Probando getUpdates...');
    const getUpdatesUrl = `https://api.telegram.org/bot${token}/getUpdates?limit=5`;
    const updatesResponse = await fetch(getUpdatesUrl);
    const updatesData = await updatesResponse.json();

    if (updatesData.ok) {
      sendLogToPopup(
        `✅ GetUpdates OK: ${updatesData.result.length} mensajes recientes`,
      );

      updatesData.result.forEach((update, index) => {
        const message = update.channel_post || update.message;
        if (message) {
          const text = message.text || '[Sin texto]';
          sendLogToPopup(
            `📨 Mensaje ${index + 1}: "${text.substring(0, 50)}..."`,
          );
        }
      });

      if (updatesData.result.length === 0) {
        sendLogToPopup('📭 No hay mensajes recientes en este canal');
      }
    } else {
      sendLogToPopup(`❌ Error getUpdates: ${updatesData.description}`);
    }
  } catch (error) {
    sendLogToPopup(`❌ Error en test: ${error.message}`);
    console.error('Error testing Telegram:', error);
  }
}

function stopBot() {
  botConfig.active = false;
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  messageQueue = [];
  isProcessingMessage = false;

  sendLogToPopup('🛑 Bot detenido');
  sendLogToPopup('📋 Cola de mensajes limpiada');
}

async function pollTelegramUpdates() {
  if (!botConfig.active || !botConfig.token) return;

  try {
    const url = `https://api.telegram.org/bot${
      botConfig.token
    }/getUpdates?offset=${botConfig.lastUpdateId + 1}&timeout=5`;

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 409) {
        sendLogToPopup('⚠️ Conflicto: Otro bot está activo. Esperando...');
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.ok) {
      if (data.result.length > 0) {
        sendLogToPopup(`📨 ${data.result.length} mensajes nuevos recibidos`);

        for (const update of data.result) {
          botConfig.lastUpdateId = update.update_id;
          await chrome.storage.local.set({
            lastUpdateId: botConfig.lastUpdateId,
          });

          if (update.channel_post || update.message) {
            const message = update.channel_post || update.message;
            addMessageToQueue(message, update.update_id);
          }
        }

        processMessageQueue();
      }
    } else {
      sendLogToPopup(
        `❌ Error en respuesta de Telegram: ${
          data.description || 'Error desconocido'
        }`,
      );
    }
  } catch (error) {
    console.error('Error polling Telegram:', error);
    sendLogToPopup(`❌ Error Telegram: ${error.message}`);
  }
}

function addMessageToQueue(message, updateId) {
  const text = message.text || '';

  // Buscar patrones de arbitraje deportivo
  const arbitragePatterns = [
    // Patrones específicos de arbitraje
    /FOOTBALL.*SPREAD/i,
    /BASKETBALL.*SPREAD/i,
    /TENNIS.*SPREAD/i,
    /⚽.*SPREAD/i,
    /🏀.*SPREAD/i,
    /🎾.*SPREAD/i,
    // Patrones de cuotas
    /\d+\.\d+\s*>>>\s*\d+\.\d+/,
    /\[\d+\.\d+%\]/,
    // Enlaces de Winamax
    /winamax\.es\/apuestas-deportivas/i,
    /winamax\.fr\/paris-sportifs/i,
    // Patrones generales de SureBet
    '(SureBet)',
    'surebet',
    'arbitrage',
    'winamax',
  ];

  const isArbitrageMessage = arbitragePatterns.some((pattern) => {
    if (pattern instanceof RegExp) {
      return pattern.test(text);
    } else {
      return text.toLowerCase().includes(pattern.toLowerCase());
    }
  });

  if (isArbitrageMessage) {
    messageQueue.push({
      message: message,
      updateId: updateId,
      timestamp: Date.now(),
      type: 'arbitrage',
    });

    sendLogToPopup(
      `🎯 Mensaje de arbitraje añadido a la cola. Cola actual: ${messageQueue.length} mensajes`,
    );
  } else {
    if (Math.random() < 0.1) {
      sendLogToPopup(
        `📄 Mensaje normal ignorado: "${text.substring(0, 30)}..."`,
      );
    }
  }
}

async function processMessageQueue() {
  if (isProcessingMessage || messageQueue.length === 0) {
    return;
  }

  isProcessingMessage = true;

  try {
    const messageData = messageQueue.shift();

    sendLogToPopup(
      `🔄 Procesando mensaje de arbitraje. Restantes: ${messageQueue.length}`,
    );

    await processArbitrageMessage(messageData.message, messageData.updateId);
  } catch (error) {
    sendLogToPopup(`❌ Error procesando mensaje de cola: ${error.message}`);
    console.error('Error processing queue message:', error);
  } finally {
    isProcessingMessage = false;

    if (messageQueue.length > 0) {
      sendLogToPopup(
        `⏳ Esperando antes de procesar siguiente mensaje. Cola: ${messageQueue.length}`,
      );
      setTimeout(() => {
        processMessageQueue();
      }, 3000); // Más tiempo entre mensajes para arbitraje
    } else {
      sendLogToPopup('✅ Cola de mensajes procesada completamente');
    }
  }
}

async function processArbitrageMessage(message, updateId) {
  const text = message.text || '';
  const messageId = message.message_id;

  sendLogToPopup(`📝 Procesando mensaje de arbitraje ID ${messageId}`);

  try {
    // Parsear el mensaje de arbitraje
    const arbitrageData = parseArbitrageMessage(text, messageId);

    if (!arbitrageData) {
      sendLogToPopup('❌ No se pudo parsear el mensaje de arbitraje');
      return;
    }

    sendLogToPopup(`🎯 Pick: ${arbitrageData.pick}`);
    sendLogToPopup(`💰 Cuota objetivo: ${arbitrageData.targetOdds}`);
    sendLogToPopup(`🔗 Link: ${arbitrageData.link}`);

    // Navegar al enlace de Winamax
    if (arbitrageData.link) {
      await navigateToArbitrageLink(arbitrageData);
    } else {
      sendLogToPopup('❌ No se encontró enlace de Winamax en el mensaje');
    }
  } catch (error) {
    sendLogToPopup(`❌ Error procesando arbitraje: ${error.message}`);
    console.error('Error processing arbitrage:', error);
  }
}

function parseArbitrageMessage(text, messageId) {
  try {
    sendLogToPopup('🔍 Parseando mensaje de arbitraje...');

    const lines = text.split('\n');
    let pick = null;
    let targetOdds = null;
    let link = null;
    let betType = null;

    // Detectar tipo de apuesta del header
    if (text.includes('(TOTALS)') || text.includes('TOTALS')) {
      betType = 'TOTALS';
    } else if (text.includes('(SPREAD)') || text.includes('SPREADS')) {
      betType = 'SPREADS';
    } else if (text.includes('(MONEYLINE)') || text.includes('MONEYLINE')) {
      betType = 'MONEYLINE';
    }

    sendLogToPopup(`📊 Tipo detectado: ${betType || 'UNKNOWN'}`, 'INFO');

    // Extraer el pick según el tipo
    for (const line of lines) {
      const lineTrimmed = line.trim();

      if (betType === 'TOTALS') {
        // Para totales: buscar OVER/UNDER con números
        const totalMatch = lineTrimmed.match(/^(OVER|UNDER)\s+(\d+\.?\d*)$/i);
        if (totalMatch) {
          pick = `${totalMatch[1]} ${totalMatch[2]}`;
          break;
        }
      } else if (betType === 'SPREADS') {
        // Para spreads: buscar equipo con +/-
        const spreadMatch = lineTrimmed.match(/^([A-Z\s]+)\s*([+-]\d+\.?\d*)$/);
        if (spreadMatch) {
          pick = `${spreadMatch[1].trim()} ${spreadMatch[2]}`;
          break;
        }
      } else if (betType === 'MONEYLINE') {
        // Para moneyline: buscar nombre del equipo (sin números)
        if (
          lineTrimmed.length > 3 &&
          lineTrimmed.match(/^[A-Z\s]+$/) &&
          !lineTrimmed.includes('BASKETBALL') &&
          !lineTrimmed.includes('FOOTBALL') &&
          !lineTrimmed.match(/\d+\.\d+/) &&
          !lineTrimmed.includes('>>>')
        ) {
          pick = lineTrimmed;
          break;
        }
      } else {
        // Detección automática si no se especifica tipo
        // Primero intentar spread (equipo + número)
        const spreadMatch = lineTrimmed.match(/^([A-Z\s]+)\s*([+-]\d+\.?\d*)$/);
        if (spreadMatch) {
          pick = `${spreadMatch[1].trim()} ${spreadMatch[2]}`;
          betType = 'SPREADS';
          break;
        }

        // Luego intentar total (OVER/UNDER)
        const totalMatch = lineTrimmed.match(/^(OVER|UNDER)\s+(\d+\.?\d*)$/i);
        if (totalMatch) {
          pick = `${totalMatch[1]} ${totalMatch[2]}`;
          betType = 'TOTALS';
          break;
        }

        // Finalmente moneyline (solo nombre)
        if (
          lineTrimmed.length > 3 &&
          lineTrimmed.match(/^[A-Z\s]+$/) &&
          !lineTrimmed.includes('BASKETBALL') &&
          !lineTrimmed.includes('FOOTBALL') &&
          !lineTrimmed.match(/\d+\.\d+/) &&
          !lineTrimmed.includes('>>>')
        ) {
          pick = lineTrimmed;
          betType = 'MONEYLINE';
          break;
        }
      }
    }

    // Extraer cuota objetivo (primera cuota en formato X.XX >>> Y.YY)
    const oddsMatch = text.match(/(\d+\.\d+)\s*>>>\s*(\d+\.\d+)/);
    if (oddsMatch) {
      targetOdds = parseFloat(oddsMatch[1]); // Usar la primera cuota como objetivo
    }

    // Extraer enlace de Winamax
    const linkMatch = text.match(/WinamaxES\s*\((https?:\/\/[^\)]+)\)/);
    if (linkMatch) {
      link = linkMatch[1];
    }

    // Validar datos mínimos
    if (!pick || !targetOdds || !link) {
      sendLogToPopup(
        `⚠️ Datos incompletos - Pick: ${pick}, Odds: ${targetOdds}, Link: ${!!link}, Type: ${betType}`,
      );
      return null;
    }

    sendLogToPopup(
      `✅ Parseado exitoso: ${betType} - "${pick}" @ ${targetOdds}`,
    );

    return {
      pick: pick,
      targetOdds: targetOdds,
      link: link,
      amount: botConfig.defaultBetAmount,
      messageId: messageId,
      betType: betType,
      originalText: text,
    };
  } catch (error) {
    sendLogToPopup(`❌ Error parseando mensaje: ${error.message}`);
    return null;
  }
}

async function navigateToArbitrageLink(arbitrageData) {
  try {
    sendLogToPopup('🌐 Navegando al enlace de arbitraje...');

    const tabs = await chrome.tabs.query({
      url: [
        'https://www.winamax.es/*',
        'https://www.winamax.fr/*',
        'https://winamax.es/*',
        'https://winamax.fr/*',
      ],
    });

    let targetTab = null;

    if (tabs.length > 0) {
      // Usar pestaña existente de Winamax
      targetTab = tabs[0];
      sendLogToPopup(`🎯 Navegando en pestaña existente: ${targetTab.id}`);
      await chrome.tabs.update(targetTab.id, {
        url: arbitrageData.link,
        active: true,
      });
    } else {
      // Crear nueva pestaña
      sendLogToPopup('🆕 Creando nueva pestaña para arbitraje...');
      targetTab = await chrome.tabs.create({
        url: arbitrageData.link,
        active: true,
      });
    }

    // Esperar a que cargue la página
    sendLogToPopup('⏳ Esperando a que cargue la página del evento...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Enviar datos de arbitraje al content script
    if (await waitForContentScript(targetTab.id)) {
      sendLogToPopup('📤 Enviando datos de arbitraje al content script...');
      await chrome.tabs.sendMessage(targetTab.id, {
        action: 'arbitrageBet',
        betData: arbitrageData,
      });
    } else {
      sendLogToPopup('❌ Content script no disponible en la página del evento');
    }
  } catch (error) {
    sendLogToPopup(`❌ Error navegando al enlace: ${error.message}`);
    console.error('Error navigating to arbitrage link:', error);
  }
}

async function placeManualBet(amount) {
  try {
    sendLogToPopup(`💰 Iniciando apuesta manual de ${amount}€...`);

    const tabs = await chrome.tabs.query({
      url: [
        'https://www.winamax.es/*',
        'https://www.winamax.fr/*',
        'https://winamax.es/*',
        'https://winamax.fr/*',
      ],
    });

    if (tabs.length === 0) {
      sendLogToPopup('❌ No hay pestañas de Winamax abiertas');
      sendLogToPopup('🆕 Abre una página de apuestas en Winamax primero');
      return;
    }

    const tab = tabs[0];

    sendLogToPopup(`🎯 Usando pestaña: ${tab.url.substring(0, 60)}...`);

    if (await waitForContentScript(tab.id)) {
      sendLogToPopup('💸 Enviando orden de apuesta manual...');
      await chrome.tabs.sendMessage(tab.id, {
        action: 'manualBet',
        amount: amount,
        messageId: 'manual_' + Date.now(),
      });
    } else {
      sendLogToPopup('❌ Content script no disponible');
      sendLogToPopup('🔄 Intenta recargar la página de Winamax');
    }
  } catch (error) {
    sendLogToPopup(`❌ Error en apuesta manual: ${error.message}`);
    console.error('Error en placeManualBet:', error);
  }
}

function handleDetailedLog(logData) {
  const shortMessage =
    logData.message.length > 100
      ? logData.message.substring(0, 100) + '...'
      : logData.message;

  sendLogToPopup(shortMessage);
  console.log(`[DETAILED] ${logData.message}`);
}

async function debugTabs() {
  try {
    sendLogToPopup('🔍 === DEBUG DE PESTAÑAS WINAMAX ===');

    const allTabs = await chrome.tabs.query({});
    sendLogToPopup(`📑 Total de pestañas abiertas: ${allTabs.length}`);

    const winamaxTabs = allTabs.filter(
      (tab) =>
        tab.url &&
        (tab.url.toLowerCase().includes('winamax') ||
          tab.title?.toLowerCase().includes('winamax')),
    );

    if (winamaxTabs.length === 0) {
      sendLogToPopup('❌ No se encontraron pestañas de Winamax');
      sendLogToPopup(
        '💡 Abre www.winamax.es o www.winamax.fr en una nueva pestaña',
      );
    } else {
      sendLogToPopup(
        `✅ Encontradas ${winamaxTabs.length} pestañas de Winamax:`,
      );

      winamaxTabs.forEach((tab, index) => {
        sendLogToPopup(
          `📄 ${index + 1}: ${tab.title?.substring(0, 30) || 'Sin título'}...`,
        );
        sendLogToPopup(`🔗    URL: ${tab.url.substring(0, 60)}...`);
        sendLogToPopup(
          `🆔    ID: ${tab.id}, Activa: ${tab.active ? 'Sí' : 'No'}`,
        );

        // Detectar si es página de evento
        if (tab.url.includes('/apuestas-deportivas/match/')) {
          sendLogToPopup(`⚽    Tipo: Página de evento (arbitraje compatible)`);
        } else if (tab.url.includes('/login')) {
          sendLogToPopup(`🔐    Tipo: Página de login`);
        } else {
          sendLogToPopup(`📄    Tipo: Página general`);
        }
      });
    }

    sendLogToPopup('🔍 === FIN DEBUG ===');
  } catch (error) {
    sendLogToPopup(`❌ Error en debug: ${error.message}`);
    console.error('Error in debugTabs:', error);
  }
}

async function sendTelegramMessage(text, replyToMessageId = null) {
  if (!botConfig.token || !botConfig.chatId) return;

  try {
    const url = `https://api.telegram.org/bot${botConfig.token}/sendMessage`;
    const payload = {
      chat_id: botConfig.chatId,
      text: text,
    };

    if (replyToMessageId) {
      payload.reply_to_message_id = replyToMessageId;
    }

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Error enviando mensaje a Telegram:', error);
  }
}

function sendLogToPopup(message) {
  try {
    chrome.runtime
      .sendMessage({
        action: 'log',
        text: message,
      })
      .catch(() => {
        // El popup no está abierto, ignorar error
      });
  } catch (error) {
    // Ignorar errores de comunicación
  }
}

// Escuchar respuestas del content script
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'loginResult') {
    botConfig.loggedIn = message.success;
    sendLogToPopup(message.success ? '✅ Login exitoso' : '❌ Error en login');

    if (message.success) {
      sendTelegramMessage('✅ Login exitoso en Winamax');
    }
  } else if (message.action === 'betResult') {
    const result = message.success
      ? `✅ Apuesta procesada exitosamente: ${
          message.amount || botConfig.defaultBetAmount
        }€`
      : `⚠️ Error en apuesta: ${message.error || 'Error desconocido'}`;

    sendLogToPopup(result);

    // Respuesta específica para arbitraje
    if (
      message.messageId &&
      !message.messageId.toString().startsWith('manual_')
    ) {
      const telegramResponse = message.success
        ? `✅ Arbitraje ejecutado: ${
            message.amount || botConfig.defaultBetAmount
          }€`
        : `❌ Arbitraje falló: ${message.error || 'Error desconocido'}`;

      sendTelegramMessage(telegramResponse, message.messageId);
    }

    sendLogToPopup('✅ Mensaje procesado. Continuando con cola...');
  } else if (message.action === 'contentReady') {
    sendLogToPopup(
      `📱 Content script listo en: ${message.url || 'página desconocida'}`,
    );
  }
});
