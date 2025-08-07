// background.js - Service Worker para Chrome con sistema de arbitraje mejorado
let botConfig = {
  // Valores por defecto (placeholder) - se sobreescriben desde storage
  token: '',
  chatId: '',
  email: 'your@email.com',
  password: 'your_password',
  active: false,
  loggedIn: false,
  lastUpdateId: 0,
  defaultBetAmount: 0.5,
};

let processedUpdateIds = new Set();
const MAX_PROCESSED_IDS = 100;

let persistentLogs = [];
const MAX_LOGS = 100;

// Configuración por defecto para primera instalación
const DEFAULT_CONFIG = {
  token: '',
  chatId: '',
  email: '',
  password: '',
  defaultBetAmount: 0.5,
};

chrome.runtime.onStartup.addListener(async () => {
  // Si el bot se reinicia, asumimos que cualquier apuesta en proceso falló.
  await chrome.storage.local.remove('currentlyProcessingId');
  sendLogToPopup('🧹 Limpiado el estado de procesamiento al reiniciar el bot.');

  // NUEVO: Cargar IDs previamente procesados para evitar duplicados tras un reinicio
  const { recentIds } = await chrome.storage.local.get('recentIds');
  const { storedLogs } = await chrome.storage.local.get('storedLogs');

  if (recentIds && Array.isArray(recentIds)) {
    processedUpdateIds = new Set(recentIds);
    sendLogToPopup(
      `📋 Cargados ${processedUpdateIds.size} IDs recientes desde storage.`,
    );
  }
  if (storedLogs && Array.isArray(storedLogs)) {
    persistentLogs = storedLogs;
  }
});

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

    // Inicializar timestamp de actividad
    botConfig.lastActivity = Date.now();

    // Auto-iniciar keep-alive si hay configuración válida
    if (botConfig.token && botConfig.chatId) {
      sendLogToPopup(
        '🟢 Configuración válida detectada - Iniciando keep-alive automático',
      );
      startKeepAlive();
    }
  })
  .catch((error) => {
    console.error('Error loading config:', error);
    sendLogToPopup(
      '⚠️ Error cargando configuración, usando valores por defecto',
    );
  });

let pollingInterval = null;
const POLL_INTERVAL = 5000;

// Sistema de keep-alive para mantener el service worker activo
let keepAliveInterval = null;
const KEEP_ALIVE_INTERVAL = 25000; // 25 segundos (antes de que Chrome lo suspenda)

function startKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  keepAliveInterval = setInterval(() => {
    // Ping silencioso para mantener activo el service worker
    chrome.runtime
      .getPlatformInfo()
      .then(() => {
        // Solo log cada 5 minutos para no saturar
        if (Date.now() % 300000 < KEEP_ALIVE_INTERVAL) {
          sendLogToPopup('🔄 Bot activo - Keep alive ejecutado');
        }
      })
      .catch(() => {
        // Ignorar errores de keep-alive
      });
  }, KEEP_ALIVE_INTERVAL);

  sendLogToPopup('🟢 Sistema keep-alive iniciado');
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  sendLogToPopup('🔴 Sistema keep-alive detenido');
}

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

// UN ÚNICO LISTENER PARA TODOS LOS MENSAJES
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Es crucial devolver true para respuestas asíncronas
  let isAsync = false;

  switch (message.action) {
    // --- Mensajes del Popup ---
    case 'updateConfig':
      updateConfig(message.config);
      sendResponse({ success: true });
      break;
    case 'startBot':
      startBot();
      sendResponse({ success: true });
      break;
    case 'getStatus':
      // Respondemos inmediatamente con el estado actual del bot.
      sendResponse({
        status: {
          active: botConfig.active,
          loggedIn: botConfig.loggedIn,
          // Comprobamos si hay algo en proceso consultando el ID guardado.
          processing: !!chrome.storage.local.get('currentlyProcessingId')
            .currentlyProcessingId,
          queueLength: messageQueue.length,
        },
      });
      // Como respondemos de forma síncrona, no es necesario devolver true.
      break;
    case 'getLogs':
      sendResponse({ logs: persistentLogs });
      // Devolvemos true porque la respuesta puede ser asíncrona
      isAsync = true;
      break;
    // --- Mensajes del Content Script ---
    case 'detailedLog':
      handleDetailedLog(message);
      // No necesitas sendResponse si el emisor no espera respuesta
      break;
    case 'loginResult':
      botConfig.loggedIn = message.success;
      sendLogToPopup(
        message.success ? '✅ Login exitoso' : '❌ Error en login',
      );
      if (message.success) {
        sendTelegramMessage('✅ Login exitoso en Winamax');
      }
      break;
    case 'betResult':
      // Este listener global solo debería manejar los resultados que NO
      // son de un arbitraje específico (ej: apuestas manuales)
      if (
        !message.messageId ||
        message.messageId.toString().startsWith('manual_')
      ) {
        const result = message.success
          ? `✅ Apuesta procesada exitosamente: ${
              message.amount || botConfig.defaultBetAmount
            }€`
          : `⚠️ Error en apuesta: ${message.error || 'Error desconocido'}`;
        sendLogToPopup(result);
      }
      // Los resultados de arbitraje son manejados por el listener temporal en processArbitrageMessage
      break;
    case 'contentReady':
      sendLogToPopup(
        `📱 Content script listo en: ${message.url || 'página desconocida'}`,
      );
      break;
  }

  // Si alguna de tus operaciones fuera asíncrona, deberías gestionar isAsync y devolverlo.
  // Por ahora, para estas acciones, no parece ser el caso.
  return isAsync;
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

  // Iniciar sistema keep-alive
  startKeepAlive();

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

  // Detener sistema keep-alive
  stopKeepAlive();

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

      // Actualizar timestamp de última actividad
      botConfig.lastActivity = Date.now();
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

    // Si hay error de conexión, intentar reconectar en 30 segundos
    if (botConfig.active) {
      setTimeout(() => {
        if (botConfig.active) {
          sendLogToPopup('🔄 Reintentando conexión con Telegram...');
        }
      }, 30000);
    }
  }
}

function addMessageToQueue(message, updateId) {
  // 1. VERIFICAR SI YA HEMOS VISTO ESTE ID
  if (processedUpdateIds.has(updateId)) {
    // Si ya está en el set, es un duplicado. Lo ignoramos.
    sendLogToPopup(`🛡️ Ignorando mensaje duplicado ID: ${updateId}`);
    return; // Salimos de la función inmediatamente
  }

  // 2. SI ES NUEVO, LO REGISTRAMOS INMEDIATAMENTE
  processedUpdateIds.add(updateId);
  // Opcional: Mantener el Set con un tamaño manejable
  if (processedUpdateIds.size > MAX_PROCESSED_IDS) {
    const oldestId = processedUpdateIds.values().next().value;
    processedUpdateIds.delete(oldestId);
  }

  const text = message.text || '';

  // Buscar patrones de arbitraje deportivo MEJORADO
  const arbitragePatterns = [
    // Patrones específicos de deportes
    /TENNIS.*MONEYLINE/i,
    /FOOTBALL.*SPREAD/i,
    /BASKETBALL.*SPREAD/i,
    /TENNIS.*SPREAD/i,
    /⚽.*SPREAD/i,
    /🏀.*SPREAD/i,
    /🎾.*SPREAD/i,
    /🎾.*MONEYLINE/i,
    // Patrones de cuotas y enlaces
    /\d+\.\d+\s*>>>\s*\d+\.\d+/,
    /\[\d+\.\d+%\]/,
    // Enlaces de Winamax ESPECÍFICOS
    /winamax\.es\/apuestas-deportivas\/match\/\d+/i,
    /winamax\.fr\/paris-sportifs\/match\/\d+/i,
    // Patrones generales de SureBet
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

  // NUEVO: Verificar si tiene enlace de Winamax (requerido)
  const hasWinamaxLink = /winamax\.es\/apuestas-deportivas\/match\/\d+/i.test(
    text,
  );

  if (isArbitrageMessage && hasWinamaxLink) {
    messageQueue.push({
      message: message,
      updateId: updateId,
      timestamp: Date.now(),
      type: 'arbitrage',
    });

    sendLogToPopup(
      `🎯 Mensaje de arbitraje añadido a la cola. Cola actual: ${messageQueue.length} mensajes`,
    );

    // Log del tipo de mensaje detectado
    if (/TENNIS.*MONEYLINE/i.test(text)) {
      sendLogToPopup('🎾 Tipo: TENNIS MONEYLINE detectado');
    } else if (/FOOTBALL.*SPREAD/i.test(text)) {
      sendLogToPopup('⚽ Tipo: FOOTBALL SPREAD detectado');
    } else if (/BASKETBALL.*SPREAD/i.test(text)) {
      sendLogToPopup('🏀 Tipo: BASKETBALL SPREAD detectado');
    }
  } else {
    if (Math.random() < 0.1) {
      sendLogToPopup(
        `📄 Mensaje ignorado: "${text.substring(0, 30)}..." ${
          !hasWinamaxLink ? '(sin enlace)' : ''
        }`,
      );
    }
  }
}

async function processMessageQueue() {
  // Comprueba si ya hay un mensaje en proceso según el storage
  const { currentlyProcessingId } = await chrome.storage.local.get(
    'currentlyProcessingId',
  );
  if (currentlyProcessingId || messageQueue.length === 0) {
    return;
  }

  const messageData = messageQueue.shift();

  try {
    // Guarda el ID del mensaje que vamos a procesar
    await chrome.storage.local.set({
      currentlyProcessingId: messageData.updateId,
    });

    sendLogToPopup(
      `🔄 Procesando mensaje de arbitraje ID: ${messageData.updateId} (${messageQueue.length} restantes en cola)`,
    );

    // Procesar el mensaje y ESPERAR a que termine completamente
    await processArbitrageMessage(messageData.message, messageData.updateId);

    sendLogToPopup(`✅ Mensaje ID: ${messageData.updateId} completado.`);
  } catch (error) {
    sendLogToPopup(
      `❌ Error procesando mensaje de cola ID ${messageData.updateId}: ${error.message}`,
    );
    console.error('Error processing queue message:', error);
  } finally {
    // MUY IMPORTANTE: Limpiar el ID del storage para que el siguiente pueda procesarse
    await chrome.storage.local.remove('currentlyProcessingId');

    await chrome.storage.local.set({
      recentIds: Array.from(processedUpdateIds),
    });

    // Llama al siguiente en la cola si hay
    if (messageQueue.length > 0) {
      sendLogToPopup(
        `⏳ Pasando al siguiente mensaje. Cola: ${messageQueue.length}`,
      );
      // Llama sin timeout para procesar inmediatamente el siguiente
      processMessageQueue();
    } else {
      sendLogToPopup('✅ Toda la cola de mensajes procesada.');
    }
  }
}

async function processArbitrageMessage(message, updateId) {
  const text = message.text || '';
  const messageId = message.message_id;

  sendLogToPopup(`📝 Procesando mensaje de arbitraje ID ${messageId}`);

  return new Promise(async (resolve, reject) => {
    try {
      // Parsear el mensaje de arbitraje MEJORADO
      const arbitrageData = parseArbitrageMessage(text, messageId);

      if (!arbitrageData) {
        sendLogToPopup('❌ No se pudo parsear el mensaje de arbitraje');
        reject(new Error('No se pudo parsear el mensaje'));
        return;
      }

      sendLogToPopup(`🎯 Pick: ${arbitrageData.pick}`);
      // MODIFICADO: Ahora el log mostrará la "Odds to beat"
      sendLogToPopup(
        `💰 Cuota objetivo (Odds to beat): ${arbitrageData.targetOdds}`,
      );
      sendLogToPopup(`🏆 Tipo: ${arbitrageData.betType}`);
      sendLogToPopup(`🔗 Link: ${arbitrageData.link}`);

      // Configurar timeout para este mensaje específico
      const messageTimeout = setTimeout(() => {
        sendLogToPopup(
          `⏰ Timeout para mensaje ${messageId} - Continuando con siguiente`,
        );
        cleanup();
        reject(new Error('Timeout procesando mensaje'));
      }, 60000); // 60 segundos máximo por mensaje

      // Configurar listener para el resultado de este mensaje específico
      const resultListener = (message, sender) => {
        if (message.action === 'betResult' && message.messageId === messageId) {
          clearTimeout(messageTimeout);

          const result = message.success
            ? `✅ Apuesta procesada exitosamente: ${
                message.amount || botConfig.defaultBetAmount
              }€`
            : `⚠️ Error en apuesta: ${message.error || 'Error desconocido'}`;

          sendLogToPopup(result);

          // Respuesta específica para arbitraje
          const telegramResponse = message.success
            ? `✅ Arbitraje ejecutado: ${
                message.amount || botConfig.defaultBetAmount
              }€`
            : `❌ Arbitraje falló: ${message.error || 'Error desconocido'}`;

          sendTelegramMessage(telegramResponse, messageId);

          cleanup();

          if (message.success) {
            resolve(`Apuesta completada: ${message.amount}€`);
          } else {
            reject(new Error(message.error || 'Error en apuesta'));
          }
        }
      };

      // Función de limpieza
      const cleanup = () => {
        chrome.runtime.onMessage.removeListener(resultListener);
        clearTimeout(messageTimeout);
      };

      // Añadir listener
      chrome.runtime.onMessage.addListener(resultListener);

      // Navegar al enlace de Winamax
      if (arbitrageData.link) {
        await navigateToArbitrageLink(arbitrageData);
      } else {
        cleanup();
        reject(new Error('No se encontró enlace de Winamax en el mensaje'));
      }
    } catch (error) {
      sendLogToPopup(`❌ Error procesando arbitraje: ${error.message}`);
      console.error('Error processing arbitrage:', error);
      reject(error);
    }
  });
}

function parseArbitrageMessage(text, messageId) {
  try {
    sendLogToPopup('🔍 Parseando mensaje de arbitraje...');

    const lines = text.split('\n');
    let pick = null;
    let targetOdds = null; // Esta es la que cambiaremos
    let link = null;
    let betType = null;
    let player = null;
    let sport = 'UNKNOWN';

    // Detectar tipo de apuesta del header MEJORADO
    if (text.includes('TENNIS') && text.includes('MONEYLINE')) {
      betType = 'TENNIS_MONEYLINE';
      sport = 'TENNIS'; // <-- Asignar deporte
      sendLogToPopup('🎾 Tipo detectado: TENNIS MONEYLINE', 'INFO');

      // Para tenis moneyline, buscar el jugador en formato **PLAYER**
      const playerMatch = text.match(/\*\*([^*]+)\*\*/);
      if (playerMatch) {
        player = playerMatch[1].trim();
        pick = player; // El pick es directamente el nombre del jugador
        sendLogToPopup(`🎾 Jugador detectado: ${player}`, 'INFO');
      }
    } else if (
      text.includes('FOOTBALL') &&
      (text.includes('(SPREAD)') || text.includes('SPREADS'))
    ) {
      betType = 'SPREADS';
      sport = 'FOOTBALL'; // <-- Asignar deporte
      sendLogToPopup('⚽ Tipo detectado: FOOTBALL SPREAD', 'INFO');
    } else if (
      text.includes('BASKETBALL') &&
      (text.includes('(SPREAD)') || text.includes('SPREADS'))
    ) {
      betType = 'SPREADS'; // Aunque la lógica del mensaje sea SPREAD, en la casa de apuestas es 'Hándicap de puntos'
      sport = 'BASKETBALL'; // <-- Asignar deporte
      sendLogToPopup('🏀 Tipo detectado: BASKETBALL SPREAD', 'INFO');
    } else if (text.includes('(TOTALS)') || text.includes('TOTALS')) {
      betType = 'TOTALS';
    } else if (text.includes('(SPREAD)') || text.includes('SPREADS')) {
      betType = 'SPREADS';
    } else if (text.includes('(MONEYLINE)') || text.includes('MONEYLINE')) {
      betType = 'MONEYLINE';
    }

    // Si no se detectó el deporte por el encabezado, intentar buscar emojis
    if (sport === 'UNKNOWN') {
      if (text.includes('⚽')) sport = 'FOOTBALL';
      else if (text.includes('🏀')) sport = 'BASKETBALL';
      else if (text.includes('🎾')) sport = 'TENNIS';
      if (sport !== 'UNKNOWN') {
        sendLogToPopup(`🔍 Deporte detectado por emoji: ${sport}`, 'INFO');
      }
    }

    // Si no se detectó pick con el método específico, usar método general
    if (!pick) {
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
          const spreadMatch = lineTrimmed.match(
            /^([A-Z\s]+)\s*([+-]\d+\.?\d*)$/,
          );
          if (spreadMatch) {
            pick = `${spreadMatch[1].trim()} ${spreadMatch[2]}`;
            break;
          }
        } else if (betType === 'MONEYLINE' || betType === 'TENNIS_MONEYLINE') {
          // Para moneyline: buscar nombre del equipo/jugador (sin números)
          // Excluir líneas que son claramente cuotas o enlaces
          if (
            lineTrimmed.length > 3 &&
            lineTrimmed.match(/^[A-Z\s]+$/) &&
            !lineTrimmed.includes('BASKETBALL') &&
            !lineTrimmed.includes('FOOTBALL') &&
            !lineTrimmed.includes('TENNIS') &&
            !lineTrimmed.match(/\d+\.\d+/) &&
            !lineTrimmed.includes('>>>')
          ) {
            pick = lineTrimmed;
            break;
          }
        }
      }
    }

    // **MODIFICACIÓN AQUÍ:** Extraer "Odds to beat" como targetOdds
    const oddsToBeatMatch = text.match(/Odds to beat:\s*(\d+\.\d+)/);
    if (oddsToBeatMatch) {
      targetOdds = parseFloat(oddsToBeatMatch[1]);
      sendLogToPopup(`💰 Odds to beat encontrada: ${targetOdds}`, 'INFO');
    } else {
      // Fallback: Si no se encuentra "Odds to beat", usar la primera cuota del >>>
      const oddsMatch = text.match(/(\d+\.\d+)\s*>>>\s*(\d+\.\d+)/);
      if (oddsMatch) {
        targetOdds = parseFloat(oddsMatch[1]);
        sendLogToPopup(
          `💰 No se encontró 'Odds to beat', usando la primera cuota del rango: ${targetOdds}`,
          'WARN',
        );
      }
    }

    // Extraer enlace de Winamax MEJORADO
    // Busca específicamente el enlace de Winamax en la sección "Enlaces de la Apuesta:"
    const winamaxLinkSectionMatch = text.match(
      /🔗 Enlaces de la Apuesta:([\s\S]*?)(?=\n\n|$)/,
    );
    if (winamaxLinkSectionMatch) {
      const winamaxLinkMatch = winamaxLinkSectionMatch[1].match(
        /https?:\/\/www\.winamax\.es\/apuestas-deportivas\/match\/\d+/,
      );
      if (winamaxLinkMatch) {
        link = winamaxLinkMatch[0];
        sendLogToPopup(
          `🔗 Enlace de Winamax (sección) encontrado: ${link}`,
          'INFO',
        );
      }
    }
    // Si no se encontró en la sección específica, buscar en todo el texto (fallback)
    if (!link) {
      const genericWinamaxLinkMatch = text.match(
        /https?:\/\/www\.winamax\.es\/apuestas-deportivas\/match\/\d+/,
      );
      if (genericWinamaxLinkMatch) {
        link = genericWinamaxLinkMatch[0];
        sendLogToPopup(
          `🔗 Enlace de Winamax (genérico) encontrado: ${link}`,
          'INFO',
        );
      }
    }

    // NUEVO: Extraer información adicional para tenis
    let matchInfo = null;
    if (betType === 'TENNIS_MONEYLINE') {
      // Buscar información del partido (ej: "Tristan Schoolkate v Colton Smith")
      const matchPattern =
        /([A-Z][a-z]+\s+[A-Z][a-z]+)\s+v\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/;
      const matchMatch = text.match(matchPattern);
      if (matchMatch) {
        matchInfo = {
          player1: matchMatch[1].trim(),
          player2: matchMatch[2].trim(),
          fullMatch: matchMatch[0],
        };
        sendLogToPopup(`🎾 Partido: ${matchInfo.fullMatch}`, 'INFO');
      }
    }

    // Validar datos mínimos
    if (!pick || !targetOdds || !link) {
      sendLogToPopup(
        `⚠️ Datos incompletos - Pick: ${pick}, Odds: ${targetOdds}, Link: ${!!link}, Type: ${betType}`,
      );
      sendLogToPopup(`🔍 Debug - Texto completo: ${text}`, 'INFO');
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
      player: player,
      matchInfo: matchInfo,
      originalText: text,
      sport: sport,
    };
  } catch (error) {
    sendLogToPopup(`❌ Error parseando mensaje: ${error.message}`);
    console.error('Error parsing message:', error);
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

    // Esperar a que cargue la página MEJORADO
    sendLogToPopup('⏳ Esperando a que cargue la página del evento...');
    await new Promise((resolve) => setTimeout(resolve, 6000)); // Más tiempo para cargar

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

async function sendLogToPopup(message) {
  // 1. Crear un objeto de log con timestamp
  const now = new Date().toLocaleTimeString('es-ES', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const logEntry = { time: now, text: message };

  // 2. Añadir al array y mantener el tamaño máximo de 100
  persistentLogs.push(logEntry);
  if (persistentLogs.length > MAX_LOGS) {
    persistentLogs.shift(); // Elimina el log más antiguo
  }

  // 3. Guardar en el almacenamiento local de forma asíncrona
  await chrome.storage.local.set({ storedLogs: persistentLogs });

  // 4. Intentar enviar al popup si está abierto
  try {
    // Ahora enviamos el objeto de log completo
    await chrome.runtime.sendMessage({
      action: 'log',
      log: logEntry,
    });
  } catch (error) {
    // Ignorar el error si el popup no está abierto. Es normal.
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
    // Solo procesar mensajes de betResult aquí si no tienen messageId específico
    // Los mensajes con messageId específico son manejados por el listener en processArbitrageMessage
    if (
      !message.messageId ||
      message.messageId.toString().startsWith('manual_')
    ) {
      const result = message.success
        ? `✅ Apuesta procesada exitosamente: ${
            message.amount || botConfig.defaultBetAmount
          }€`
        : `⚠️ Error en apuesta: ${message.error || 'Error desconocido'}`;

      sendLogToPopup(result);

      // Solo para apuestas manuales
      if (
        message.messageId &&
        message.messageId.toString().startsWith('manual_')
      ) {
        sendLogToPopup('✅ Apuesta manual completada');
      }
    }
    // Los mensajes de arbitraje con messageId específico son manejados por processArbitrageMessage
  } else if (message.action === 'contentReady') {
    sendLogToPopup(
      `📱 Content script listo en: ${message.url || 'página desconocida'}`,
    );
  }
});
