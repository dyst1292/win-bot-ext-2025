// content.js - Sistema de apuestas SPREAD y TOTALS para Winamax MEJORADO
console.log('🎰 Winamax Bot Content Script cargado en:', window.location.href);

// Configuración y constantes
const CONFIG = {
  SLIDER_STEP_DELAY: 200,
  MAX_SLIDER_ATTEMPTS: 50,
  ELEMENT_WAIT_TIMEOUT: 10000,
  CLICK_DELAY: 500,
};

const SELECTORS = {
  FILTER_BUTTON: '.sc-gplwa-d.bIHQDs.filter-button',
  LIST_VIEW_BUTTON: '.sc-bXxnNr.cokPNx',
  GRID_VIEW_SVG: 'svg rect[x="10"][y="10"]',
  MORE_SELECTIONS_BUTTON: '.sc-fNZVXS.cwIfgf.expand-button',
  MORE_SELECTIONS_TEXT: '.sc-cWKVQc.bGBBfC',
  BET_BUTTON: '.sc-lcDspb.hvhzTf.sc-fIyekj.kMmmnL.odd-button-wrapper',
  BET_DESCRIPTION: '.sc-eHVZpS.byWUOZ',
  BET_ODDS: '.sc-eIGzw.jphTtc',
  MATCH_NOT_AVAILABLE_LABEL: '.sc-bqZonL.hzUuFV',
};

// Estado global
let globalState = {
  currentBet: null,
  isProcessing: false,
  betSections: [],
  currentSectionIndex: 0,
};

// Inicialización
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
  initializeContentScript();
}

function initializeContentScript() {
  console.log('🚀 Inicializando content script...');
  setTimeout(() => {
    chrome.runtime
      .sendMessage({ action: 'contentReady', url: window.location.href })
      .catch(() => {});
  }, 1000);
}

// ========================================
// FUNCIONES DE VERIFICACIÓN Y PARSEO
// ========================================

function isMatchAvailable() {
  const notAvailableElement = document.querySelector(
    SELECTORS.MATCH_NOT_AVAILABLE_LABEL,
  );
  if (
    notAvailableElement &&
    notAvailableElement.textContent?.trim() === 'Partido no disponible'
  ) {
    logMessage(
      '❌ Detectado mensaje "Partido no disponible". El evento ha sido cancelado o no existe.',
      'ERROR',
    );
    return false;
  }
  return true;
}

function parseSpreadPick(pick) {
  const parts = pick.trim().split(/\s+/);
  if (parts.length < 2) return { team: pick, handicap: null };
  const handicap = parts[parts.length - 1];
  const team = parts.slice(0, -1).join(' ');
  return { team, handicap };
}

/**
 * =================================================================
 * NUEVA FUNCIÓN: Parsear pick de TOTALS
 * =================================================================
 * Convierte "OVER 2.5" en { type: 'OVER', value: '2.5' }
 */
function parseTotalPick(pick) {
  const parts = pick.trim().toUpperCase().split(/\s+/);
  if (parts.length !== 2) return null;
  return { type: parts[0], value: parts[1] };
}

function isMatchingSpreadBet(description, parsedPick) {
  const { team, handicap } = parsedPick;
  const normalizedDesc = description.toUpperCase().trim();
  const normalizedHandicap = handicap ? handicap.toUpperCase().trim() : '';
  const normalizedTeam = team ? team.toUpperCase().trim() : '';
  if (!normalizedDesc.includes(normalizedTeam)) return false;
  if (!normalizedHandicap) return true;
  const handicapVariations = [
    normalizedHandicap,
    normalizedHandicap.replace(/\s+/g, ''),
    normalizedHandicap.replace('+', ' +'),
    normalizedHandicap.replace('-', ' -'),
  ];
  return handicapVariations.some((variation) =>
    normalizedDesc.includes(variation),
  );
}

/**
 * =================================================================
 * NUEVA FUNCIÓN: Comprobar si un botón coincide con un pick de TOTALS
 * =================================================================
 */
function isMatchingTotalBet(description, parsedPick) {
  const { type, value } = parsedPick;
  const normalizedDesc = description.toLowerCase().trim();
  const normalizedValue = value.replace('.', ','); // Winamax usa comas

  const isOver =
    type === 'OVER' &&
    (normalizedDesc.startsWith('más de') || normalizedDesc.startsWith('+'));
  const isUnder =
    type === 'UNDER' &&
    (normalizedDesc.startsWith('menos de') || normalizedDesc.startsWith('-'));

  if ((isOver || isUnder) && normalizedDesc.includes(normalizedValue)) {
    return true;
  }
  return false;
}

// ========================================
// FUNCIONES PRINCIPALES (AHORA GENÉRICAS)
// ========================================

/**
 * =================================================================
 * FUNCIÓN MODIFICADA: Ahora es un procesador genérico de apuestas
 * =================================================================
 */
async function processBet(betData) {
  try {
    logMessage(
      `🎯 Iniciando procesamiento de apuesta TIPO: ${betData.betType}...`,
      'INFO',
    );
    logMessage(`📊 Pick: ${betData.pick}`, 'INFO');
    logMessage(`💰 Cuota objetivo: ${betData.targetOdds}`, 'INFO');
    logMessage(`⚽ Deporte: ${betData.sport || 'No especificado'}`, 'INFO');

    globalState.isProcessing = true;
    globalState.currentBet = betData;

    if (!isMatchAvailable()) {
      throw new Error(
        'El evento no está disponible en Winamax (mensaje: "Partido no disponible").',
      );
    }

    if (!isValidWinamaxPage()) {
      throw new Error('No estamos en una página válida de evento de Winamax');
    }

    const menuFound = await navigateToBetTypeMenu(
      betData.betType,
      betData.sport,
    );
    if (!menuFound) {
      throw new Error(
        `No se encontró el submenú apropiado para ${betData.betType}.`,
      );
    }

    const sectionsFound = await findBetSections(betData.betType, betData.sport);
    if (!sectionsFound) {
      throw new Error(
        `No se encontraron las secciones requeridas para ${betData.betType}.`,
      );
    }

    const betFound = await searchBetInAllSections(
      betData.pick,
      betData.targetOdds,
    );
    if (!betFound) {
      throw new Error(
        `Pick "${betData.pick}" no encontrado con cuota válida tras revisar todas las secciones.`,
      );
    }

    await executeBet(betFound.element, betData.amount, betData.messageId);
  } catch (error) {
    logMessage(`❌ Error procesando apuesta: ${error.message}`, 'ERROR');
    sendBetResult(false, error.message, betData.messageId);
  } finally {
    globalState.isProcessing = false;
  }
}

/**
 * =================================================================
 * FUNCIÓN MODIFICADA: Navega al menú correcto según el tipo de apuesta
 * =================================================================
 */
async function navigateToBetTypeMenu(betType, sport) {
  try {
    logMessage(
      `🔍 Buscando submenú para TIPO: ${betType} (Deporte: ${
        sport || 'No especificado'
      })...`,
      'INFO',
    );
    const filterButtons = Array.from(
      document.querySelectorAll(SELECTORS.FILTER_BUTTON),
    );

    let keyword = '';
    if (betType === 'SPREADS' && sport === 'FOOTBALL') {
      keyword = 'diferencia de goles';
    } else if (betType === 'SPREADS') {
      keyword = 'diferencia de puntos';
    } else if (betType === 'TOTALS' && sport === 'FOOTBALL') {
      keyword = 'total de goles';
    } else {
      // Añadir más lógicas para otros deportes/tipos aquí
      keyword = 'total'; // fallback genérico
    }

    logMessage(`📋 Buscando botón con la palabra clave: "${keyword}"`, 'INFO');
    const targetButton = filterButtons.find((btn) =>
      (btn.textContent?.trim().toLowerCase() || '').includes(keyword),
    );

    if (targetButton) {
      logMessage(
        `✅ Submenú seleccionado: "${targetButton.textContent.trim()}"`,
        'SUCCESS',
      );
      targetButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(CONFIG.CLICK_DELAY);
      await clickElement(targetButton);
      await wait(2000);
      return true;
    }

    logMessage(`❌ No se encontró submenú para "${keyword}"`, 'ERROR');
    return false;
  } catch (error) {
    logMessage(`❌ Error navegando al submenú: ${error.message}`, 'ERROR');
    return false;
  }
}

/**
 * =================================================================
 * FUNCIÓN MODIFICADA: Encuentra las secciones correctas según el tipo de apuesta
 * =================================================================
 */
async function findBetSections(betType, sport) {
  try {
    logMessage(
      `🔍 Buscando secciones para TIPO: ${betType} (Deporte: ${
        sport || 'No especificado'
      })...`,
      'INFO',
    );
    const foundSections = [];
    const allElements = document.querySelectorAll('*');

    let sectionTitlesToSearch = [];

    if (betType === 'SPREADS' && sport === 'FOOTBALL') {
      sectionTitlesToSearch = [
        'hándicap asiático (handicap)',
        'hándicap asiático',
        '1ª mitad - hándicap asiático (handicap)',
        '1ª mitad - hándicap asiático',
      ];
    } else if (betType === 'TOTALS' && sport === 'FOOTBALL') {
      sectionTitlesToSearch = [
        'número total de goles', // Prioridad 1
        '1ª mitad - número total de goles', // Prioridad 2
      ];
    } else if (betType === 'SPREADS') {
      // SPREADS para otros deportes
      sectionTitlesToSearch = [
        'hándicap de puntos (handicap)',
        'hándicap de puntos',
      ];
    }
    // Añadir más lógicas aquí

    if (sectionTitlesToSearch.length === 0) {
      logMessage(
        `⚠️ No hay una configuración de búsqueda de secciones para ${betType} y ${sport}`,
        'WARN',
      );
      return false;
    }

    const addedTitles = new Set();
    for (const titleToSearch of sectionTitlesToSearch) {
      for (const element of allElements) {
        const text = element.textContent?.trim().toLowerCase() || '';
        if (text === titleToSearch) {
          const uniqueTitle = element.textContent.trim();
          if (addedTitles.has(uniqueTitle)) continue;

          logMessage(`✅ Sección encontrada: "${uniqueTitle}"`, 'SUCCESS');
          addedTitles.add(uniqueTitle);

          let sectionContainer = element.closest(
            '.sc-kJCCEd, [class*="sc-jwunkD"], [class*="section"], .bet-group-template',
          );
          if (sectionContainer) {
            foundSections.push({
              container: sectionContainer,
              title: uniqueTitle,
            });
          } else {
            logMessage(
              `⚠️ No se encontró contenedor válido para: "${uniqueTitle}"`,
              'WARN',
            );
          }
        }
      }
    }

    if (foundSections.length > 0) {
      logMessage(
        `✅ Encontradas ${foundSections.length} secciones en orden de prioridad.`,
        'SUCCESS',
      );
      globalState.betSections = foundSections;
      return true;
    }

    logMessage(
      '❌ No se encontró ninguna de las secciones requeridas.',
      'ERROR',
    );
    return false;
  } catch (error) {
    logMessage(`❌ Error buscando secciones: ${error.message}`, 'ERROR');
    return false;
  }
}

async function searchBetInAllSections(pick, targetOdds) {
  try {
    logMessage(
      `🎯 Buscando pick "${pick}" en ${globalState.betSections.length} secciones...`,
      'INFO',
    );

    const betType = globalState.currentBet.betType;
    let parsedPick;

    // Parsear el pick según el tipo de apuesta
    if (betType === 'SPREADS') {
      parsedPick = parseSpreadPick(pick);
      logMessage(
        `🔍 Buscando equipo: "${parsedPick.team}" con handicap: "${parsedPick.handicap}"`,
        'INFO',
      );
    } else if (betType === 'TOTALS') {
      parsedPick = parseTotalPick(pick);
      logMessage(
        `🔍 Buscando total: "${parsedPick.type} ${parsedPick.value}"`,
        'INFO',
      );
    }

    if (!parsedPick)
      throw new Error(
        `El formato del pick "${pick}" no es válido para el tipo de apuesta ${betType}.`,
      );

    const foundCandidatesWithInsufficientOdds = [];
    const sectionsChecked = [];

    for (let i = 0; i < globalState.betSections.length; i++) {
      const section = globalState.betSections[i];
      sectionsChecked.push(section.title);

      logMessage(
        `📋 Procesando sección ${i + 1}/${globalState.betSections.length}: "${
          section.title
        }"`,
        'INFO',
      );
      globalState.currentSectionIndex = i;

      const searchResult = await searchBetInSection(
        section,
        parsedPick,
        targetOdds,
      );

      if (searchResult && searchResult.found && searchResult.validOdds) {
        logMessage(
          `🏆 Pick "${searchResult.bet.description}" encontrado con cuota ${searchResult.bet.odds} (>= ${targetOdds}) en "${section.title}"`,
          'SUCCESS',
        );
        return searchResult.bet;
      } else if (
        searchResult &&
        searchResult.found &&
        !searchResult.validOdds
      ) {
        logMessage(
          `⚠️ Pick "${searchResult.bet.description}" encontrado pero cuota insuficiente ${searchResult.bet.odds} (< ${targetOdds}) en "${section.title}"`,
          'WARN',
        );
        foundCandidatesWithInsufficientOdds.push(searchResult.bet);
      } else {
        logMessage(
          `❌ Pick no encontrado en sección: "${section.title}". Pasando a la siguiente.`,
          'INFO',
        );
      }
    }

    if (foundCandidatesWithInsufficientOdds.length > 0) {
      let errorMessage = `Pick "${pick}" encontrado pero cuotas insuficientes (target: ${targetOdds}):\n`;
      foundCandidatesWithInsufficientOdds.forEach((bet) => {
        errorMessage += `• Sección "${bet.section}": "${bet.description}" @ ${bet.odds}\n`;
      });
      throw new Error(errorMessage.trim());
    } else {
      const sectionsList = sectionsChecked.join(' -> ');
      throw new Error(
        `Pick "${pick}" no encontrado en las secciones revisadas: ${sectionsList}`,
      );
    }
  } catch (error) {
    logMessage(`❌ Error buscando en secciones: ${error.message}`, 'ERROR');
    throw error;
  }
}

async function searchBetInSection(section, parsedPick, targetOdds) {
  try {
    logMessage(
      `(1/3) 📋 Activando MODO LISTA en sección: "${section.title}"...`,
      'INFO',
    );
    await activateListViewInSection(section);
    await wait(1500);

    logMessage(
      `(2/3) ➕ Expandiendo "MÁS SELECCIONES" en sección: "${section.title}"...`,
      'INFO',
    );
    await expandMoreSelectionsInSection(section);
    await wait(2000);

    logMessage(
      `(3/3) 🔍 Escaneando botones en sección: "${section.title}"...`,
      'INFO',
    );
    const searchResult = await findBetInVisibleButtons(
      section,
      parsedPick,
      targetOdds,
    );

    return searchResult;
  } catch (error) {
    logMessage(
      `❌ Error crítico procesando sección "${section.title}": ${error.message}`,
      'ERROR',
    );
    return { found: false, validOdds: false, bet: null };
  }
}

async function findBetInVisibleButtons(section, parsedPick, targetOdds) {
  try {
    const betButtons = section.container.querySelectorAll(SELECTORS.BET_BUTTON);
    let bestInvalidOddsCandidate = null;
    const betType = globalState.currentBet.betType;

    for (const button of betButtons) {
      if (!isElementVisible(button)) continue;

      const descriptionElement = button.querySelector(
        SELECTORS.BET_DESCRIPTION,
      );
      const oddsElement = button.querySelector(SELECTORS.BET_ODDS);
      if (!descriptionElement || !oddsElement) continue;

      const description = descriptionElement.textContent?.trim() || '';
      const odds = parseFloat(
        oddsElement.textContent?.trim().replace(',', '.'),
      );

      let isMatch = false;
      if (betType === 'SPREADS') {
        isMatch = isMatchingSpreadBet(description, parsedPick);
      } else if (betType === 'TOTALS') {
        isMatch = isMatchingTotalBet(description, parsedPick);
      }

      if (isMatch) {
        const candidate = {
          element: button,
          description,
          odds: odds || 0,
          section: section.title,
        };
        logMessage(
          `✅ Candidato encontrado: "${description}" @ ${odds}`,
          'SUCCESS',
        );

        if (odds >= targetOdds) {
          return { found: true, validOdds: true, bet: candidate };
        } else {
          if (
            !bestInvalidOddsCandidate ||
            odds > bestInvalidOddsCandidate.odds
          ) {
            bestInvalidOddsCandidate = candidate;
          }
        }
      }
    }

    if (bestInvalidOddsCandidate)
      return { found: true, validOdds: false, bet: bestInvalidOddsCandidate };
    return { found: false, validOdds: false, bet: null };
  } catch (error) {
    logMessage(
      `❌ Error buscando en botones de "${section.title}": ${error.message}`,
      'ERROR',
    );
    return { found: false, validOdds: false, bet: null };
  }
}

// ========================================
// FUNCIONES AUXILIARES Y DE INFRAESTRUCTURA (Sin cambios)
// ========================================

async function activateListViewInSection(section) {
  try {
    const listViewButton =
      section.container.querySelector(SELECTORS.LIST_VIEW_BUTTON) ||
      section.container
        .querySelector(SELECTORS.GRID_VIEW_SVG)
        ?.closest('button');
    if (listViewButton && isElementVisible(listViewButton)) {
      await clickElement(listViewButton);
      logMessage('✅ Modo lista activado en esta sección.', 'SUCCESS');
      return true;
    }
    logMessage(
      '⚠️ No se encontró botón de "Modo Lista" (puede que ya esté activo o no exista).',
      'WARN',
    );
    return false;
  } catch (error) {
    logMessage(`❌ Error activando vista de lista: ${error.message}`, 'ERROR');
    return false;
  }
}

async function expandMoreSelectionsInSection(section) {
  try {
    const moreButton = Array.from(
      section.container.querySelectorAll(SELECTORS.MORE_SELECTIONS_BUTTON),
    ).find((btn) =>
      btn
        .querySelector(SELECTORS.MORE_SELECTIONS_TEXT)
        ?.textContent?.trim()
        .toLowerCase()
        .includes('más selecciones'),
    );
    if (moreButton && isElementVisible(moreButton)) {
      await clickElement(moreButton);
      logMessage('✅ "Más selecciones" expandido.', 'SUCCESS');
      return true;
    }
    logMessage(
      '⚠️ No se encontró botón "Más selecciones" (puede que no exista).',
      'WARN',
    );
    return false;
  } catch (error) {
    logMessage(`❌ Error expandiendo selecciones: ${error.message}`, 'ERROR');
    return false;
  }
}

function isValidWinamaxPage() {
  const url = window.location.href.toLowerCase();
  return (
    url.includes('winamax.es/apuestas-deportivas/match/') ||
    url.includes('winamax.fr/paris-sportifs/match/')
  );
}

function isElementVisible(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

async function clickElement(element) {
  if (!element) return;
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await wait(300);
  const rect = element.getBoundingClientRect();
  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    button: 0,
  });
  element.dispatchEvent(clickEvent);
}

async function executeBet(element, amount, messageId) {
  try {
    logMessage('🎯 Ejecutando apuesta...', 'INFO');
    await clickElement(element);
    await wait(2000);
    logMessage(`✅ Apuesta de ${amount}€ ejecutada (simulado)`, 'SUCCESS');
    sendBetResult(true, null, messageId, amount);
  } catch (error) {
    logMessage(`❌ Error ejecutando apuesta: ${error.message}`, 'ERROR');
    sendBetResult(false, error.message, messageId);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendBetResult(success, error, messageId, amount = null) {
  chrome.runtime
    .sendMessage({ action: 'betResult', success, error, messageId, amount })
    .catch(() => {});
}

function logMessage(message, level = 'INFO') {
  const timestamp = new Date().toLocaleTimeString();
  const logText = `[${timestamp}] ${message}`;
  console.log(logText);
  chrome.runtime
    .sendMessage({ action: 'detailedLog', message: logText, level })
    .catch(() => {});
}

// ========================================
// LISTENER DE MENSAJES (MODIFICADO)
// ========================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📩 Mensaje recibido:', message.action);
  try {
    switch (message.action) {
      case 'ping':
        sendResponse({ status: 'ready', url: window.location.href });
        break;
      case 'arbitrageBet':
        const supportedTypes = ['SPREADS', 'TOTALS'];
        if (supportedTypes.includes(message.betData.betType)) {
          processBet(message.betData); // Llamada a la función genérica
          sendResponse({ received: true });
        } else {
          sendResponse({
            error: `Tipo de apuesta no soportado: ${message.betData.betType}`,
          });
        }
        break;
      default:
        sendResponse({ error: 'Acción no reconocida' });
    }
  } catch (error) {
    console.error('❌ Error procesando mensaje:', error);
    sendResponse({ error: error.message });
  }
  return true;
});
