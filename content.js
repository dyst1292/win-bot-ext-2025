// content.js - Sistema de apuestas SPREAD para Winamax MEJORADO
console.log('🎰 Winamax Bot Content Script cargado en:', window.location.href);

// Configuración y constantes
const CONFIG = {
  SLIDER_STEP_DELAY: 200,
  MAX_SLIDER_ATTEMPTS: 50,
  ELEMENT_WAIT_TIMEOUT: 10000,
  CLICK_DELAY: 500,
};

const SELECTORS = {
  // Selectores existentes...
  FILTER_BUTTON: '.sc-gplwa-d.bIHQDs.filter-button',
  LIST_VIEW_BUTTON: '.sc-bXxnNr.cokPNx',
  GRID_VIEW_SVG: 'svg rect[x="10"][y="10"]',
  MORE_SELECTIONS_BUTTON: '.sc-fNZVXS.cwIfgf.expand-button',
  MORE_SELECTIONS_TEXT: '.sc-cWKVQc.bGBBfC',
  BET_BUTTON: '.sc-lcDspb.hvhzTf.sc-fIyekj.kMmmnL.odd-button-wrapper',
  BET_DESCRIPTION: '.sc-eHVZpS.byWUOZ',
  BET_ODDS: '.sc-eIGzw.jphTtc',
  // =================================================================
  // NUEVO SELECTOR PARA PARTIDO NO DISPONIBLE
  // =================================================================
  MATCH_NOT_AVAILABLE_LABEL: '.sc-bqZonL.hzUuFV', // El div que contiene "Partido no disponible"
};

// Estado global
let spreadState = {
  currentBet: null,
  isProcessing: false,
  spreadSections: [],
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
// NUEVA FUNCIÓN DE VERIFICACIÓN
// ========================================

/**
 * Verifica de forma rápida si la página muestra "Partido no disponible".
 * Se ejecuta al principio para evitar procesamientos innecesarios.
 * @returns {boolean} - Devuelve 'false' si el partido NO está disponible, 'true' si lo está.
 */
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
    return false; // El partido NO está disponible.
  }

  return true; // El partido SÍ está disponible (o el mensaje no se encontró).
}

// ========================================
// FUNCIONES PRINCIPALES PARA SPREAD
// ========================================

async function processSpreadBet(betData) {
  try {
    logMessage('🎯 Iniciando procesamiento de apuesta SPREAD...', 'INFO');
    logMessage(`📊 Pick: ${betData.pick}`, 'INFO');
    logMessage(`💰 Cuota objetivo: ${betData.targetOdds}`, 'INFO');
    logMessage(`⚽ Deporte: ${betData.sport || 'No especificado'}`, 'INFO');

    spreadState.isProcessing = true;
    spreadState.currentBet = betData;

    // =================================================================
    // PASO 0: VERIFICACIÓN RÁPIDA DE DISPONIBILIDAD DEL EVENTO
    // Esta es la primera comprobación para fallar rápido.
    // =================================================================
    if (!isMatchAvailable()) {
      throw new Error(
        'El evento no está disponible en Winamax (mensaje: "Partido no disponible").',
      );
    }
    // =================================================================

    if (!isValidWinamaxPage()) {
      throw new Error('No estamos en una página válida de evento de Winamax');
    }

    // El resto del flujo continúa como antes...
    const spreadMenuFound = await navigateToSpreadMenu(betData.sport);
    if (!spreadMenuFound) {
      throw new Error('No se encontró el submenú de Hándicap apropiado.');
    }

    const spreadSectionsFound = await findSpreadSections(betData.sport);
    if (!spreadSectionsFound) {
      throw new Error('No se encontraron las secciones de SPREAD requeridas.');
    }

    const betFound = await searchSpreadBetInAllSections(
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
    logMessage(`❌ Error procesando SPREAD: ${error.message}`, 'ERROR');
    sendBetResult(false, error.message, betData.messageId);
  } finally {
    spreadState.isProcessing = false;
  }
}

async function navigateToSpreadMenu(sport) {
  try {
    logMessage(
      `🔍 Buscando submenú de SPREAD (Deporte: ${
        sport || 'No especificado'
      })...`,
      'INFO',
    );
    const filterButtons = Array.from(
      document.querySelectorAll(SELECTORS.FILTER_BUTTON),
    );
    logMessage(
      `📋 Encontrados ${filterButtons.length} botones de filtro`,
      'INFO',
    );

    let prioritizedButtons = [];
    const keywords = {
      football: 'diferencia de goles',
      generic: ['diferencia de puntos', 'handicap', 'hándicap', 'spread'],
    };

    if (sport === 'FOOTBALL') {
      logMessage(
        '⚽ Es FÚTBOL. Buscando prioritariamente: "' + keywords.football + '"',
        'INFO',
      );
      const footballButton = filterButtons.find((btn) =>
        (btn.textContent?.trim().toLowerCase() || '').includes(
          keywords.football,
        ),
      );
      if (footballButton) {
        prioritizedButtons.push(footballButton);
      }
    }

    filterButtons.forEach((btn) => {
      const buttonText = btn.textContent?.trim().toLowerCase() || '';
      if (
        keywords.generic.some((term) => buttonText.includes(term)) &&
        !prioritizedButtons.includes(btn)
      ) {
        prioritizedButtons.push(btn);
      }
    });

    if (prioritizedButtons.length > 0) {
      const buttonToClick = prioritizedButtons[0];
      logMessage(
        `✅ Submenú SPREAD seleccionado: "${buttonToClick.textContent.trim()}"`,
        'SUCCESS',
      );
      buttonToClick.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(CONFIG.CLICK_DELAY);
      await clickElement(buttonToClick);
      await wait(2000);
      return true;
    }

    logMessage(
      '❌ No se encontró submenú de SPREAD (Diferencia de puntos/goles)',
      'ERROR',
    );
    return false;
  } catch (error) {
    logMessage(`❌ Error navegando al submenú: ${error.message}`, 'ERROR');
    return false;
  }
}

async function findSpreadSections(sport) {
  try {
    logMessage(
      `🔍 Buscando secciones de SPREAD (Deporte: ${
        sport || 'No especificado'
      })...`,
      'INFO',
    );
    const foundSections = [];
    const allElements = document.querySelectorAll('*');

    let sectionTitlesToSearch = [];

    if (sport === 'FOOTBALL') {
      logMessage(
        '⚽ Es FÚTBOL: Buscando secciones en orden de prioridad.',
        'INFO',
      );
      sectionTitlesToSearch = [
        'hándicap asiático (handicap)',
        'hándicap asiático',
        '1ª mitad - hándicap asiático (handicap)',
        '1ª mitad - hándicap asiático',
      ];
    } else {
      logMessage(
        '🏀 Es otro deporte: Buscando secciones genéricas de Hándicap.',
        'INFO',
      );
      sectionTitlesToSearch = [
        'hándicap de puntos (handicap)',
        'hándicap de puntos',
      ];
    }

    const addedTitles = new Set();

    for (const titleToSearch of sectionTitlesToSearch) {
      for (const element of allElements) {
        const text = element.textContent?.trim().toLowerCase() || '';
        if (text === titleToSearch) {
          const uniqueTitle = element.textContent.trim();
          if (addedTitles.has(uniqueTitle)) continue;

          logMessage(
            `✅ Sección SPREAD encontrada: "${uniqueTitle}"`,
            'SUCCESS',
          );
          addedTitles.add(uniqueTitle);

          let sectionContainer = null;
          const containers = [
            element.closest('.sc-kJCCEd'),
            element.closest('[class*="sc-jwunkD"]'),
            element.closest('[class*="section"]'),
            element.closest('.bet-group-template'),
          ];
          for (const container of containers) {
            if (container) {
              sectionContainer = container;
              break;
            }
          }
          if (!sectionContainer) {
            let parent = element.parentElement,
              attempts = 0;
            while (parent && attempts < 8) {
              if (parent.querySelectorAll(SELECTORS.BET_BUTTON).length > 0) {
                sectionContainer = parent;
                break;
              }
              parent = parent.parentElement;
              attempts++;
            }
          }

          if (sectionContainer) {
            const buttonCount = sectionContainer.querySelectorAll(
              SELECTORS.BET_BUTTON,
            ).length;
            logMessage(
              `🎲 Contenedor encontrado con ${buttonCount} botones potenciales`,
              'INFO',
            );
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
        `✅ Encontradas ${foundSections.length} secciones SPREAD en orden de prioridad.`,
        'SUCCESS',
      );
      spreadState.spreadSections = foundSections;
      return true;
    }

    logMessage(
      '❌ No se encontró ninguna de las secciones de SPREAD requeridas.',
      'ERROR',
    );
    return false;
  } catch (error) {
    logMessage(`❌ Error buscando secciones: ${error.message}`, 'ERROR');
    return false;
  }
}

async function searchSpreadBetInAllSections(pick, targetOdds) {
  try {
    logMessage(
      `🎯 Buscando pick "${pick}" en ${spreadState.spreadSections.length} secciones...`,
      'INFO',
    );
    const { team, handicap } = parseSpreadPick(pick);
    logMessage(
      `🔍 Buscando equipo: "${team}" con handicap: "${handicap}"`,
      'INFO',
    );

    const foundCandidatesWithInsufficientOdds = [];
    const sectionsChecked = [];

    for (let i = 0; i < spreadState.spreadSections.length; i++) {
      const section = spreadState.spreadSections[i];
      sectionsChecked.push(section.title);

      logMessage(
        `📋 Procesando sección ${i + 1}/${
          spreadState.spreadSections.length
        }: "${section.title}"`,
        'INFO',
      );
      spreadState.currentSectionIndex = i;

      const searchResult = await searchSpreadBetInSection(
        section,
        team,
        handicap,
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
    if (
      error.message.includes('cuotas insuficientes') ||
      error.message.includes('no encontrado en las secciones')
    ) {
      throw error;
    }
    logMessage(`❌ Error buscando en secciones: ${error.message}`, 'ERROR');
    throw new Error(`Error buscando pick "${pick}": ${error.message}`);
  }
}

async function searchSpreadBetInSection(section, team, handicap, targetOdds) {
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
    const searchResult = await findSpreadBetInVisibleButtons(
      section,
      team,
      handicap,
      targetOdds,
    );

    return searchResult;
  } catch (error) {
    logMessage(
      `❌ Error crítico procesando sección "${section.title}": ${error.message}`,
      'ERROR',
    );
    return {
      found: false,
      validOdds: false,
      bet: null,
      message: `Error al buscar en sección "${section.title}": ${error.message}`,
    };
  }
}

async function findSpreadBetInVisibleButtons(
  section,
  team,
  handicap,
  targetOdds,
) {
  try {
    const betButtons = section.container.querySelectorAll(SELECTORS.BET_BUTTON);
    logMessage(
      `🎲 Encontrados ${betButtons.length} botones en esta sección para escanear`,
      'INFO',
    );

    let bestInvalidOddsCandidate = null;

    for (const button of betButtons) {
      if (!isElementVisible(button)) continue;

      const descriptionElement = button.querySelector(
        SELECTORS.BET_DESCRIPTION,
      );
      const oddsElement = button.querySelector(SELECTORS.BET_ODDS);
      if (!descriptionElement || !oddsElement) continue;

      const description = descriptionElement.textContent?.trim() || '';
      const oddsText = oddsElement.textContent?.trim() || '';
      const odds = parseFloat(oddsText.replace(',', '.'));

      if (isMatchingSpreadBet(description, team, handicap)) {
        const candidate = {
          element: button,
          description,
          odds: odds || 0,
          team,
          handicap,
          section: section.title,
        };
        logMessage(
          `✅ Candidato encontrado: "${description}" @ ${odds}`,
          'SUCCESS',
        );

        if (odds >= targetOdds) {
          return {
            found: true,
            validOdds: true,
            bet: candidate,
            message: `Pick válido encontrado.`,
          };
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

    if (bestInvalidOddsCandidate) {
      return {
        found: true,
        validOdds: false,
        bet: bestInvalidOddsCandidate,
        message: `Cuota insuficiente.`,
      };
    } else {
      return {
        found: false,
        validOdds: false,
        bet: null,
        message: `Pick no encontrado.`,
      };
    }
  } catch (error) {
    logMessage(
      `❌ Error buscando en botones de "${section.title}": ${error.message}`,
      'ERROR',
    );
    return {
      found: false,
      validOdds: false,
      bet: null,
      message: `Error en búsqueda.`,
    };
  }
}

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
      '⚠️ No se encontró botón de "Modo Lista" en esta sección (puede que ya esté activo o no exista).',
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
    const moreButtons = section.container.querySelectorAll(
      SELECTORS.MORE_SELECTIONS_BUTTON,
    );
    for (const button of moreButtons) {
      const buttonText =
        button
          .querySelector(SELECTORS.MORE_SELECTIONS_TEXT)
          ?.textContent?.trim()
          .toLowerCase() || '';
      if (buttonText.includes('más selecciones')) {
        if (isElementVisible(button)) {
          await clickElement(button);
          logMessage('✅ "Más selecciones" expandido.', 'SUCCESS');
          return true;
        }
      }
    }
    logMessage(
      '⚠️ No se encontró botón "Más selecciones" en esta sección (puede que no exista).',
      'WARN',
    );
    return false;
  } catch (error) {
    logMessage(`❌ Error expandiendo selecciones: ${error.message}`, 'ERROR');
    return false;
  }
}

function parseSpreadPick(pick) {
  const parts = pick.trim().split(/\s+/);
  if (parts.length < 2) return { team: pick, handicap: null };
  const handicap = parts[parts.length - 1];
  const team = parts.slice(0, -1).join(' ');
  return { team, handicap };
}

function isMatchingSpreadBet(description, team, handicap) {
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
  if (!element) return false;
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
  return true;
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📩 Mensaje recibido:', message.action);
  try {
    switch (message.action) {
      case 'ping':
        sendResponse({ status: 'ready', url: window.location.href });
        break;
      case 'arbitrageBet':
        if (
          message.betData.betType === 'SPREADS' ||
          message.betData.betType.includes('SPREAD')
        ) {
          processSpreadBet(message.betData);
          sendResponse({ received: true });
        } else {
          sendResponse({ error: 'Tipo de apuesta no soportado.' });
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
