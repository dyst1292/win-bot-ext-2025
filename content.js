// content.js - Sistema de arbitraje para Winamax
console.log('🎰 Winamax Bot Content Script cargado en:', window.location.href);

// Variables globales
let arbitrageState = {
  currentBet: null,
  isSearching: false,
};

// Inicializar cuando la página esté lista
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
  initializeContentScript();
}

function initializeContentScript() {
  console.log('🚀 Inicializando content script...');

  // Notificar que está listo
  setTimeout(() => {
    chrome.runtime
      .sendMessage({
        action: 'contentReady',
        url: window.location.href,
      })
      .catch(() => {});
  }, 1000);
}

// Función principal para procesar apuestas de arbitraje
async function processArbitrageBet(betData) {
  try {
    logMessage('🎯 Procesando apuesta de arbitraje...', 'INFO');
    logMessage(`📊 Tipo: ${betData.betType}`, 'INFO');
    logMessage(`🎾 Pick: ${betData.pick}`, 'INFO');
    logMessage(`💰 Cuota objetivo: ${betData.targetOdds}`, 'INFO');

    const currentUrl = window.location.href.toLowerCase();

    if (!currentUrl.includes('winamax.es/apuestas-deportivas/match/')) {
      throw new Error('No estamos en una página de evento de Winamax');
    }

    // Esperar a que cargue la página
    await wait(3000);

    if (betData.betType === 'TENNIS_MONEYLINE') {
      await processTennisMoneyline(betData);
    } else {
      await processOtherSports(betData);
    }
  } catch (error) {
    logMessage(`❌ Error procesando arbitraje: ${error.message}`, 'ERROR');
    sendBetResult(false, error.message, betData.messageId);
  }
}

// Procesar TENNIS MONEYLINE
async function processTennisMoneyline(betData) {
  try {
    logMessage('🎾 Procesando TENNIS MONEYLINE...', 'INFO');

    // Paso 1: Buscar sección de resultado
    const resultSectionFound = await navigateToCorrectSubmenu(
      'TENNIS_MONEYLINE',
    );

    if (!resultSectionFound) {
      logMessage(
        '⚠️ No se encontró sección específica, buscando en toda la página',
        'WARN',
      );
    }

    // Paso 2: Buscar al jugador
    const playerBet = await findTennisPlayer(betData.pick, betData.targetOdds);

    if (playerBet) {
      logMessage(`✅ Jugador encontrado: ${playerBet.description}`, 'SUCCESS');
      logMessage(`💰 Cuota: ${playerBet.odds}`, 'INFO');

      if (playerBet.odds >= betData.targetOdds) {
        logMessage('✅ Cuota válida, realizando apuesta...', 'SUCCESS');
        await executeBet(playerBet.element, betData.amount, betData.messageId);
      } else {
        throw new Error(
          `Cuota insuficiente: ${playerBet.odds} < ${betData.targetOdds}`,
        );
      }
    } else {
      throw new Error(`Jugador "${betData.pick}" no encontrado`);
    }
  } catch (error) {
    throw error;
  }
}

// Navegar a sección de resultado
async function navigateToResultSection() {
  // Esta función se mantiene para compatibilidad, pero ahora usa la nueva función
  return await navigateToCorrectSubmenu('TENNIS_MONEYLINE');
}

// Expandir secciones
async function expandSections() {
  try {
    const expandButtons = document.querySelectorAll(
      ['[class*="expand"]', '[class*="more"]', '[data-testid*="more"]'].join(
        ', ',
      ),
    );

    for (const button of expandButtons) {
      const text = button.textContent?.trim().toLowerCase() || '';
      if (
        text.includes('más') ||
        text.includes('more') ||
        text.includes('ver')
      ) {
        logMessage(`✅ Expandiendo: "${text}"`, 'SUCCESS');
        await clickElement(button);
        await wait(1000);
      }
    }
  } catch (error) {
    logMessage(`⚠️ Error expandiendo: ${error.message}`, 'WARN');
  }
}

// Buscar jugador de tenis
async function findTennisPlayer(playerName, minOdds) {
  try {
    logMessage(`🔍 Buscando jugador: "${playerName}"`, 'INFO');

    const normalizedName = playerName.toUpperCase().trim();
    const nameWords = normalizedName.split(/\s+/);

    logMessage(`🔑 Palabras clave: ${nameWords.join(', ')}`, 'INFO');

    // Buscar elementos de apuesta
    const betElements = document.querySelectorAll(
      [
        'button[class*="odd"]',
        'button[class*="bet"]',
        '[class*="market"] button',
        '[class*="selection"] button',
        '[data-testid*="selection"] button',
        '.sc-iHbSHJ button',
      ].join(', '),
    );

    logMessage(`🎲 Elementos encontrados: ${betElements.length}`, 'INFO');

    const candidates = [];

    for (const element of betElements) {
      if (!isElementUsable(element)) continue;

      const elementText = element.textContent?.trim() || '';
      const odds = extractOdds(element);

      if (!odds || odds < 1.01 || odds > 50) continue;

      // Calcular similitud con el nombre del jugador
      const similarity = calculateSimilarity(
        normalizedName,
        elementText.toUpperCase(),
        nameWords,
      );

      if (similarity > 0.4) {
        candidates.push({
          element: element,
          odds: odds,
          description: elementText,
          similarity: similarity,
        });

        logMessage(
          `🎾 Candidato: "${elementText}" - Cuota: ${odds} - Similitud: ${similarity.toFixed(
            2,
          )}`,
          'INFO',
        );
      }
    }

    // Ordenar por similitud
    candidates.sort((a, b) => b.similarity - a.similarity);

    if (candidates.length > 0) {
      logMessage(
        `✅ Mejor candidato: "${candidates[0].description}"`,
        'SUCCESS',
      );
      return candidates[0];
    }

    return null;
  } catch (error) {
    logMessage(`❌ Error buscando jugador: ${error.message}`, 'ERROR');
    return null;
  }
}

// Calcular similitud entre nombres
function calculateSimilarity(targetName, elementText, nameWords) {
  let score = 0;

  // Coincidencia exacta
  if (elementText.includes(targetName)) {
    return 1.0;
  }

  // Coincidencias por palabras
  const elementWords = elementText.split(/\s+/);
  let matches = 0;

  for (const nameWord of nameWords) {
    if (nameWord.length < 3) continue;

    for (const elementWord of elementWords) {
      if (elementWord === nameWord) {
        matches += 1;
        score += 0.5;
      } else if (
        elementWord.includes(nameWord) ||
        nameWord.includes(elementWord)
      ) {
        if (Math.abs(elementWord.length - nameWord.length) <= 2) {
          matches += 0.7;
          score += 0.3;
        }
      }
    }
  }

  // Bonus por múltiples coincidencias
  if (matches >= 1.5 && nameWords.length >= 2) {
    score += 0.2;
  }

  return Math.min(score, 1.0);
}

// Procesar otros deportes (mantener lógica original)
async function processOtherSports(betData) {
  try {
    logMessage(`⚽ Procesando ${betData.betType}...`, 'INFO');

    // Navegar al submenú correcto según el tipo de apuesta
    const submenuFound = await navigateToCorrectSubmenu(betData.betType);

    if (!submenuFound) {
      logMessage(
        '⚠️ No se encontró submenú específico, buscando en toda la página',
        'WARN',
      );
    }

    // Buscar la apuesta específica
    const foundBet = await searchSpecificBet(betData.pick);

    if (foundBet && foundBet.odds >= betData.targetOdds) {
      await executeBet(foundBet.element, betData.amount, betData.messageId);
    } else {
      throw new Error('Apuesta no encontrada o cuota insuficiente');
    }
  } catch (error) {
    throw error;
  }
}

// Navegar al submenú correcto según el tipo de apuesta
async function navigateToCorrectSubmenu(betType) {
  try {
    logMessage(`🎯 Navegando a submenú para: ${betType}`, 'INFO');

    // Mapeo de tipos de apuesta a submenús
    const submenuMapping = {
      TENNIS_MONEYLINE: [
        'resultado',
        'ganador',
        'winner',
        'match winner',
        'vencedor',
      ],
      SPREADS: [
        'diferencia de goles',
        'handicap',
        'spread',
        'hándicap',
        'diferencia',
      ],
      FOOTBALL_SPREAD: [
        'diferencia de goles',
        'handicap',
        'spread',
        'hándicap',
        'diferencia',
      ],
      BASKETBALL_SPREAD: [
        'diferencia de puntos',
        'handicap',
        'spread',
        'hándicap',
        'diferencia',
      ],
      TOTALS: ['total de goles', 'total', 'over/under', 'más/menos'],
      MONEYLINE: ['resultado', 'ganador', 'winner', '1x2'],
    };

    // Obtener términos de búsqueda para este tipo
    const searchTerms = submenuMapping[betType] || ['resultado'];

    logMessage(`🔍 Buscando submenús: ${searchTerms.join(', ')}`, 'INFO');

    // Selectores específicos para los botones de filtro de Winamax
    const filterButtons = document.querySelectorAll(
      [
        '.filter-button',
        '.sc-gplwa-d',
        'div[class*="filter-button"]',
        'div[data-testid*="filter"]',
        'button[data-testid*="filter"]',
      ].join(', '),
    );

    logMessage(
      `📋 Encontrados ${filterButtons.length} botones de filtro`,
      'INFO',
    );

    // Filtrar solo elementos que realmente son botones de filtro
    const validFilterButtons = Array.from(filterButtons).filter((button) => {
      const text = button.textContent?.trim() || '';
      // Excluir elementos que claramente no son botones de filtro
      return (
        text.length > 0 &&
        text.length < 100 &&
        !text.includes('video-js') &&
        !text.includes('{') &&
        !text.includes('width:') &&
        !text.includes('px')
      );
    });

    logMessage(
      `📋 Botones válidos filtrados: ${validFilterButtons.length}`,
      'INFO',
    );

    // Buscar el submenú correcto
    for (const button of validFilterButtons) {
      const buttonText = button.textContent?.trim().toLowerCase() || '';

      logMessage(`🔍 Revisando botón: "${buttonText}"`, 'INFO');

      for (const term of searchTerms) {
        if (buttonText.includes(term.toLowerCase())) {
          logMessage(
            `✅ Submenú encontrado: "${buttonText}" - Haciendo click...`,
            'SUCCESS',
          );

          // Scroll al elemento antes de hacer click
          button.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await wait(500);

          await clickElement(button);
          await wait(3000); // Más tiempo para que cargue el contenido
          await expandSections();
          return true;
        }
      }
    }

    // Listar todos los botones válidos para debug
    logMessage('📋 Botones disponibles:', 'INFO');
    validFilterButtons.forEach((button, index) => {
      const text = button.textContent?.trim();
      if (text && text.length > 0) {
        logMessage(`  ${index + 1}. "${text}"`, 'INFO');
      }
    });

    // Si no encuentra submenú específico, expandir las secciones actuales
    logMessage('❌ No se encontró submenú específico', 'WARN');
    await expandSections();
    return false;
  } catch (error) {
    logMessage(`⚠️ Error navegando a submenú: ${error.message}`, 'WARN');
    await expandSections();
    return false;
  }
}

// Buscar apuesta específica (para otros deportes) MEJORADO
async function searchSpecificBet(pick) {
  try {
    logMessage(`🔍 Buscando apuesta: "${pick}"`, 'INFO');

    // Selectores más específicos para elementos de apuesta
    const betElements = document.querySelectorAll(
      [
        'button[class*="odd"]:not([class*="video"])',
        'button[class*="bet"]:not([class*="video"])',
        'div[class*="market"] button',
        'div[class*="selection"] button',
        'button[data-testid*="selection"]',
        'button[data-testid*="odd"]',
        '.sc-iHbSHJ button',
        '.sc-meaPv button', // Clase específica del HTML que mostraste
        '.odd-button-wrapper button',
      ].join(', '),
    );

    // Filtrar elementos que realmente contienen cuotas
    const validBetElements = Array.from(betElements).filter((element) => {
      const text = element.textContent?.trim() || '';
      const odds = extractOdds(element);

      return (
        text.length > 0 &&
        text.length < 200 &&
        !text.includes('video-js') &&
        !text.includes('{') &&
        !text.includes('width:') &&
        odds !== null
      );
    });

    logMessage(`🎲 Elementos encontrados: ${validBetElements.length}`, 'INFO');

    // Mostrar algunos elementos para debug
    if (validBetElements.length > 0) {
      logMessage('📋 Primeros elementos encontrados:', 'INFO');
      validBetElements.slice(0, 8).forEach((element, index) => {
        const text = element.textContent?.trim() || '';
        const odds = extractOdds(element);
        logMessage(`  ${index + 1}. "${text}" - Cuota: ${odds}`, 'INFO');
      });
    }

    const candidates = [];

    for (const element of validBetElements) {
      if (!isElementUsable(element)) continue;

      const elementText = element.textContent?.trim() || '';
      const odds = extractOdds(element);

      if (!odds) continue;

      let similarity = 0;
      let matchType = '';

      // Para SPREAD: buscar equipo + handicap (ej: "BRISBANE CITY -3.5")
      if (pick.includes('-') || pick.includes('+')) {
        const pickParts = pick.split(/\s+/);
        const teamName = pickParts.slice(0, -1).join(' '); // Todos excepto último elemento
        const handicap = pickParts[pickParts.length - 1]; // Último elemento

        // Normalizar nombre del equipo
        const normalizedTeamName = normalizeTeamName(teamName);
        const normalizedElementText = normalizeTeamName(elementText);

        logMessage(
          `🔍 SPREAD - Comparando equipo: "${normalizedTeamName}" con "${normalizedElementText}" + handicap "${handicap}"`,
          'INFO',
        );

        if (
          normalizedElementText.includes(normalizedTeamName) &&
          elementText.includes(handicap)
        ) {
          similarity = 1.0;
          matchType = 'spread_exact';
        } else if (normalizedElementText.includes(normalizedTeamName)) {
          similarity = 0.7;
          matchType = 'spread_team_only';
        }
      }
      // Para MONEYLINE: buscar nombre del equipo (ej: "PAKHTAKOR TASHKENT")
      else {
        const normalizedPick = normalizeTeamName(pick);
        const normalizedElementText = normalizeTeamName(elementText);
        const pickWords = normalizedPick.split(/\s+/);

        logMessage(
          `🔍 MONEYLINE - Comparando: "${normalizedPick}" con "${normalizedElementText}"`,
          'INFO',
        );

        similarity = calculateSimilarity(
          normalizedPick,
          elementText,
          pickWords,
        );
        matchType = similarity > 0.8 ? 'moneyline_exact' : 'moneyline_partial';
      }

      if (similarity > 0.5) {
        // Umbral más bajo para mayor flexibilidad
        candidates.push({
          element: element,
          odds: odds,
          description: elementText,
          similarity: similarity,
          matchType: matchType,
        });

        logMessage(
          `✅ Candidato encontrado: "${elementText}" - Cuota: ${odds} - Similitud: ${similarity.toFixed(
            2,
          )} (${matchType})`,
          'SUCCESS',
        );
      }
    }

    // Ordenar por similitud
    candidates.sort((a, b) => b.similarity - a.similarity);

    if (candidates.length > 0) {
      logMessage(
        `✅ Mejor candidato: "${candidates[0].description}" (${candidates[0].matchType})`,
        'SUCCESS',
      );

      // Mostrar top 3 candidatos
      candidates.slice(0, 3).forEach((candidate, index) => {
        logMessage(
          `  ${index + 1}. "${candidate.description}" - Cuota: ${
            candidate.odds
          } - Similitud: ${candidate.similarity.toFixed(2)}`,
          'INFO',
        );
      });

      return candidates[0];
    }

    logMessage('❌ No se encontró la apuesta específica', 'ERROR');
    return null;
  } catch (error) {
    logMessage(`❌ Error buscando apuesta: ${error.message}`, 'ERROR');
    return null;
  }
}

// Ejecutar apuesta
async function executeBet(element, amount, messageId) {
  try {
    logMessage('🎯 Ejecutando apuesta...', 'INFO');

    // Click en la selección
    await clickElement(element);
    await wait(2000);

    // Buscar campo de importe
    const stakeInput = await findStakeInput();
    if (!stakeInput) {
      throw new Error('Campo de importe no encontrado');
    }

    // Introducir cantidad
    await typeInElement(stakeInput, amount.toString());
    await wait(1000);

    // Buscar botón de apostar
    const betButton = await findBetButton();
    if (!betButton) {
      throw new Error('Botón de apostar no encontrado');
    }

    // Hacer click en apostar
    await clickElement(betButton);
    await wait(1500);

    logMessage(`✅ Apuesta de ${amount}€ ejecutada correctamente`, 'SUCCESS');
    sendBetResult(true, null, messageId, amount);
  } catch (error) {
    logMessage(`❌ Error ejecutando apuesta: ${error.message}`, 'ERROR');
    sendBetResult(false, error.message, messageId);
  }
}

// Buscar campo de importe
async function findStakeInput() {
  const selectors = [
    'input[inputmode="none"]',
    'input[inputmode="decimal"]',
    'input[type="number"]',
    '[data-testid*="stake"] input',
    '[class*="stake"] input',
    '[class*="basket"] input[type="text"]',
    '.sc-gppfCo input',
    '.sc-wkolL input',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && isElementUsable(element)) {
      logMessage(`✅ Campo de importe encontrado: ${selector}`, 'SUCCESS');
      return element;
    }
  }

  return null;
}

// Buscar botón de apostar
async function findBetButton() {
  const selectors = [
    'button[data-testid="basket-submit-button"]',
    'button[data-testid*="place-bet"]',
    'button[type="submit"]',
    '.sc-erjLUo button',
    '[class*="place-bet"] button',
    '[class*="submit-bet"] button',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && isElementUsable(element)) {
      const text = element.textContent?.toLowerCase() || '';
      if (
        text.includes('apostar') ||
        text.includes('parier') ||
        text.includes('bet')
      ) {
        logMessage(`✅ Botón de apostar encontrado: ${selector}`, 'SUCCESS');
        return element;
      }
    }
  }

  return null;
}

// Extraer cuotas de un elemento
function extractOdds(element) {
  const texts = [
    element.textContent?.trim() || '',
    element.getAttribute('data-odds') || '',
    element.querySelector('[class*="odd"]')?.textContent?.trim() || '',
  ];

  for (const text of texts) {
    // Buscar formato decimal: 2.15, 1.95, etc.
    const match = text.match(/\b(\d{1,2}\.\d{1,3})\b/);
    if (match) {
      const odds = parseFloat(match[1]);
      if (odds >= 1.01 && odds <= 100) {
        return odds;
      }
    }
  }

  return null;
}

// Verificar si un elemento es usable
function isElementUsable(element) {
  if (!element) return false;

  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    !element.disabled
  );
}

// Click en elemento con simulación humana
async function clickElement(element) {
  if (!element) return false;

  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await wait(300);

  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  const events = ['mouseover', 'mousedown', 'mouseup', 'click'];

  for (const eventType of events) {
    const event = new MouseEvent(eventType, {
      bubbles: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    element.dispatchEvent(event);
    await wait(50);
  }

  return true;
}

// Escribir en elemento
async function typeInElement(element, text) {
  if (!element || !text) return false;

  element.focus();
  await wait(100);

  // Limpiar campo
  element.value = '';
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(100);

  // Escribir carácter por carácter
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    element.value += char;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(50);
  }

  element.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Función de espera
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Enviar resultado de apuesta
function sendBetResult(success, error, messageId, amount = null) {
  chrome.runtime
    .sendMessage({
      action: 'betResult',
      success: success,
      error: error,
      messageId: messageId,
      amount: amount,
    })
    .catch(() => {});
}

// Función de logging
function logMessage(message, level = 'INFO') {
  const timestamp = new Date().toLocaleTimeString();
  const logText = `[${timestamp}] ${message}`;

  console.log(logText);

  chrome.runtime
    .sendMessage({
      action: 'detailedLog',
      message: logText,
      level: level,
    })
    .catch(() => {});
}

// Función de apuesta manual
async function performManualBet(amount, messageId) {
  try {
    logMessage(`💰 Apuesta manual de ${amount}€...`, 'INFO');

    const stakeInput = await findStakeInput();
    if (!stakeInput) {
      throw new Error('Campo de importe no encontrado');
    }

    await typeInElement(stakeInput, amount.toString());
    await wait(1000);

    const betButton = await findBetButton();
    if (!betButton) {
      throw new Error('Botón de apostar no encontrado');
    }

    await clickElement(betButton);
    await wait(1500);

    sendBetResult(true, null, messageId, amount);
    logMessage(`✅ Apuesta manual completada`, 'SUCCESS');
  } catch (error) {
    logMessage(`❌ Error en apuesta manual: ${error.message}`, 'ERROR');
    sendBetResult(false, error.message, messageId);
  }
}

// Escuchar mensajes del background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📩 Mensaje recibido:', message.action);

  try {
    switch (message.action) {
      case 'ping':
        sendResponse({ status: 'ready', url: window.location.href });
        break;

      case 'arbitrageBet':
        arbitrageState.currentBet = message.betData;
        processArbitrageBet(message.betData);
        sendResponse({ received: true });
        break;

      case 'manualBet':
        performManualBet(message.amount, message.messageId);
        sendResponse({ received: true });
        break;

      case 'debugPage':
        debugCurrentPage();
        sendResponse({ received: true });
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('❌ Error:', error);
    sendResponse({ error: error.message });
  }

  return true;
});

// Debug de página
function debugCurrentPage() {
  logMessage('🔍 === DEBUG DE PÁGINA ===', 'INFO');
  logMessage(`🌐 URL: ${window.location.href}`, 'INFO');

  const betElements = document.querySelectorAll(
    'button[class*="odd"], button[class*="bet"]',
  );
  logMessage(`🎲 Elementos de apuesta: ${betElements.length}`, 'INFO');

  // Mostrar primeros 5 elementos
  Array.from(betElements)
    .slice(0, 5)
    .forEach((el, i) => {
      const text = el.textContent?.trim() || '';
      const odds = extractOdds(el);
      logMessage(
        `  ${i + 1}. "${text.substring(0, 30)}..." ${odds ? `(${odds})` : ''}`,
        'INFO',
      );
    });

  logMessage('🔍 === FIN DEBUG ===', 'INFO');
}
