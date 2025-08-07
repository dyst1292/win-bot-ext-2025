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

/**
 * =================================================================
 * FUNCIÓN MODIFICADA: Compara Spreads usando la "palabra más larga"
 * =================================================================
 * Implementa la estrategia de buscar la palabra más larga del nombre del equipo
 * para manejar abreviaturas de forma mucho más robusta y fiable.
 */
function isMatchingSpreadBet(description, parsedPick) {
  const { team: pickTeamName, handicap: pickHandicap } = parsedPick;

  // --- PASO 1: ENCONTRAR LA PALABRA CLAVE (la más larga del nombre del pick) ---
  const teamWords = pickTeamName.trim().toLowerCase().split(/\s+/);
  if (teamWords.length === 0) return false;

  // Usamos 'reduce' para encontrar la palabra más larga de forma concisa.
  // Compara cada palabra con la "más larga hasta ahora" y la va reemplazando.
  const longestWord = teamWords.reduce((longest, current) => {
    return current.length > longest.length ? current : longest;
  }, '');

  if (!longestWord) return false; // Comprobación de seguridad

  // --- PASO 2: NORMALIZAR DATOS Y PREPARAR VARIACIONES DEL HANDICAP ---
  const normalizedDesc = description.trim().toLowerCase();
  const normalizedPickHandicap = pickHandicap
    ? pickHandicap.trim().toLowerCase()
    : '';

  if (!normalizedPickHandicap) return false; // El pick debe tener un hándicap

  // Creamos variaciones del hándicap para asegurar la coincidencia (ej: "-0.5" y "- 0.5")
  const handicapVariations = [
    normalizedPickHandicap,
    normalizedPickHandicap.replace(/\s+/g, ''),
    normalizedPickHandicap.replace('-', '- '),
    normalizedPickHandicap.replace('+', '+ '),
  ];

  // --- PASO 3: REALIZAR LAS COMPROBACIONES ---
  // Comprobación A: ¿El texto del botón contiene nuestra palabra clave?
  const hasLongestWord = normalizedDesc.includes(longestWord);

  // Comprobación B: ¿El texto del botón contiene alguna de las variaciones del hándicap?
  const hasHandicap = handicapVariations.some((variation) =>
    normalizedDesc.includes(variation),
  );

  // Si AMBAS comprobaciones son verdaderas, hemos encontrado nuestra apuesta.
  if (hasLongestWord && hasHandicap) {
    logMessage(
      `✅ Coincidencia por palabra clave [${longestWord}] y hándicap [${normalizedPickHandicap}] en "${description}"`,
      'SUCCESS',
    );
    return true;
  }

  return false;
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

/**
 * =================================================================
 * NUEVA FUNCIÓN CORREGIDA: Limpia el boleto de apuestas de forma precisa
 * =================================================================
 * 1. Lee el número de selecciones.
 * 2. Si es mayor que 0, busca y hace clic en el SVG de la papelera.
 */
async function clearBetSlipIfNeeded() {
  try {
    logMessage('🗑️ Verificando el estado del boleto de apuestas...', 'INFO');

    // Paso 1: Localizar el SPAN que contiene el número de selecciones.
    // Selector: <span class="sc-kXSgjd ghJQHK">
    const selectionCountElement = document.querySelector('.sc-kXSgjd.ghJQHK');

    if (!selectionCountElement) {
      logMessage(
        '⚠️ No se pudo encontrar el contador de selecciones del boleto. Asumiendo que está vacío.',
        'WARN',
      );
      return; // Salimos de la función si no encontramos el contador.
    }

    // Paso 2: Leer el número y convertirlo a un entero.
    const selectionCount = parseInt(selectionCountElement.textContent, 10) || 0;

    // Paso 3: Decidir si actuar basado en el número de selecciones.
    if (selectionCount > 0) {
      logMessage(
        `🚮 El boleto contiene ${selectionCount} selección(es). Procediendo a limpiar...`,
        'WARN',
      );

      // Paso 4: Localizar el icono SVG de la papelera. Es el elemento correcto para el clic.
      // Selector: <svg class="sc-ekXCdx dRNLRj">
      const trashCanIcon = document.querySelector('svg.sc-ekXCdx.dRNLRj');

      if (trashCanIcon && isElementVisible(trashCanIcon)) {
        await clickElement(trashCanIcon);
        await wait(1500); // Damos un poco más de tiempo para que la UI se actualice completamente.
        logMessage('✅ Boleto limpiado con éxito.', 'SUCCESS');
      } else {
        logMessage(
          '❌ No se encontró el icono de la papelera para hacer clic, aunque el boleto no está vacío.',
          'ERROR',
        );
      }
    } else {
      logMessage('👍 El boleto de apuestas ya está vacío.', 'INFO');
    }
  } catch (error) {
    logMessage(
      `❌ Error crítico al intentar limpiar el boleto de apuestas: ${error.message}`,
      'ERROR',
    );
  }
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

    await clearBetSlipIfNeeded();

    if (!isValidWinamaxPage()) {
      throw new Error('No estamos en una página válida de evento de Winamax');
    }

    // const menuFound = await navigateToBetTypeMenu(
    //   betData.betType,
    //   betData.sport,
    // );
    // if (!menuFound) {
    //   throw new Error(
    //     `No se encontró el submenú apropiado para ${betData.betType}.`,
    //   );
    // }

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

// =================================================================
// FUNCIÓN MODIFICADA: Navega al menú correcto según el tipo de apuesta
// =================================================================
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
    } else if (betType === 'MONEYLINE') {
      // <-- NUEVA CONDICIÓN
      keyword = 'resultado';
    } else {
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
 * FUNCIÓN DE BÚSQUEDA DE SECCIONES DE APUESTA (Versión Limpia)
 * =================================================================
 *
 * Busca los títulos de las secciones de apuesta (ej. "Hándicap de puntos")
 * de manera precisa y segura.
 * - Utiliza `startsWith()` para que el texto del elemento COMIENCE con el
 * título buscado, evitando así coincidencias parciales como "1er set - ...".
 * - Es compatible con Fútbol, Baloncesto y Voleibol.
 * - Prioriza los títulos en el orden definido en `sectionTitlesToSearch`.
 */
async function findBetSections(betType, sport) {
  try {
    logMessage(
      `🎯 Iniciando búsqueda ELEGANTE de secciones para TIPO: ${betType}, DEPORTE: ${
        sport || 'No especificado'
      }...`,
      'INFO',
    );
    const foundSections = [];
    const allElements = document.querySelectorAll(
      'div, span, h1, h2, h3, h4, h5, h6',
    );
    const addedContainers = new Set();

    let sectionTitlesToSearch = [];
    if (betType === 'SPREADS') {
      if (sport === 'FOOTBALL') {
        sectionTitlesToSearch = [
          'hándicap asiático (handicap)',
          'hándicap asiático',
        ];
      } else if (sport === 'BASKETBALL' || sport === 'VOLLEYBALL') {
        sectionTitlesToSearch = [
          'hándicap de puntos (handicap)',
          'hándicap de puntos',
        ];
      }
    } else if (betType === 'TOTALS') {
      if (sport === 'FOOTBALL') {
        sectionTitlesToSearch = ['número total de goles'];
      } else if (sport === 'BASKETBALL' || sport === 'VOLLEYBALL') {
        sectionTitlesToSearch = ['número total de puntos'];
      }
    } else if (betType === 'MONEYLINE') {
      if (sport === 'VOLLEYBALL') {
        sectionTitlesToSearch = ['ganador del partido', 'resultado'];
      } else {
        sectionTitlesToSearch = ['resultado'];
      }
    }

    if (sectionTitlesToSearch.length === 0) {
      logMessage(
        `⚠️ No hay configuración de búsqueda para ${betType} y ${
          sport || 'desconocido'
        }`,
        'WARN',
      );
      return false;
    }

    logMessage(
      `📋 Títulos a buscar: ${JSON.stringify(sectionTitlesToSearch)}`,
      'INFO',
    );

    for (const element of allElements) {
      const text = (element.textContent || '')
        .replace(/\u00A0/g, ' ')
        .trim()
        .toLowerCase();

      if (!text) continue;

      // Solución limpia usando startsWith()
      const isMatch = sectionTitlesToSearch.some((title) =>
        text.startsWith(title),
      );

      if (isMatch) {
        const sectionContainer = element.closest(
          '.sc-kJCCEd, [class*="sc-jwunkD"], [class*="section"], .bet-group-template',
        );

        if (sectionContainer && !addedContainers.has(sectionContainer)) {
          const uniqueTitle = element.textContent.trim();
          logMessage(
            `✅ Sección de PARTIDO COMPLETO encontrada: "${uniqueTitle}"`,
            'SUCCESS',
          );
          foundSections.push({
            container: sectionContainer,
            title: uniqueTitle,
          });
          addedContainers.add(sectionContainer);
        }
      }
    }

    if (foundSections.length > 0) {
      logMessage(
        `✅ Encontradas ${foundSections.length} secciones de partido completo.`,
        'SUCCESS',
      );
      globalState.betSections = foundSections;
      return true;
    }

    logMessage(
      '❌ No se encontró ninguna de las secciones requeridas para partido completo.',
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
    let parsedPick; // Para SPREADS y TOTALS

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
    } else if (betType === 'MONEYLINE') {
      // Para MONEYLINE, el pick es el nombre del equipo/jugador. No se necesita parseo complejo.
      logMessage(`🔍 Buscando ganador: "${pick}"`, 'INFO');
      parsedPick = pick; // No se necesita un objeto complejo
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

/**
 * =================================================================
 * NUEVA FUNCIÓN: Comprobar si un botón coincide con un pick de MONEYLINE
 * =================================================================
 * Comprueba si el nombre del equipo/jugador coincide con la descripción.
 */
function isMatchingMoneylineBet(description, pick) {
  // En MONEYLINE, el pick es directamente el nombre del equipo o jugador.
  const normalizedDesc = description.toLowerCase().trim();
  const normalizedPick = pick.toLowerCase().trim();

  // Comprueba si la descripción del botón es exactamente el nombre del pick.
  // Esto evita falsos positivos (p.ej. "Manchester" vs "Manchester United").
  return normalizedDesc === normalizedPick;
}

async function findBetInVisibleButtons(section, parsedPick, targetOdds) {
  try {
    const betButtons = section.container.querySelectorAll(SELECTORS.BET_BUTTON);
    let bestInvalidOddsCandidate = null;
    const betType = globalState.currentBet.betType;
    const originalPick = globalState.currentBet.pick; // Necesitamos el pick original para MONEYLINE

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
      } else if (betType === 'MONEYLINE') {
        // Para MONEYLINE, no usamos `parsedPick`, sino el pick original.
        isMatch = isMatchingMoneylineBet(description, originalPick);
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

/**
 * =================================================================
 * FUNCIÓN FINAL: Ejecuta la secuencia completa de la apuesta en el boleto.
 * =================================================================
 * 1. Añade la selección al boleto.
 * 2. Introduce el importe.
 * 3. Hace clic en el botón final para apostar.
 */
async function executeBet(element, amount, messageId) {
  try {
    // --- PASO 1: AÑADIR LA SELECCIÓN AL BOLETO ---
    logMessage(
      `🖱️ Paso 1/3: Añadiendo "${globalState.currentBet.pick}" al boleto...`,
      'INFO',
    );
    await clickElement(element);
    await wait(2000); // Esperamos a que la animación del boleto termine y esté listo.

    // --- PASO 2: INTRODUCIR EL IMPORTE DE LA APUESTA ---
    logMessage(
      `💰 Paso 2/3: Buscando el campo para introducir ${amount}€...`,
      'INFO',
    );
    const stakeInput = document.querySelector('input.sc-gppfCo.fHJcOI');

    if (!stakeInput || !isElementVisible(stakeInput)) {
      throw new Error(
        'No se encontró el campo de importe en el boleto de apuestas.',
      );
    }

    // Simulamos la entrada de texto como lo haría un usuario.
    // Esto es importante para que frameworks como React/Vue detecten el cambio.
    stakeInput.value = amount.toString().replace('.', ','); // Winamax usa comas para decimales.
    stakeInput.dispatchEvent(new Event('input', { bubbles: true }));
    stakeInput.dispatchEvent(new Event('change', { bubbles: true }));
    logMessage(`✅ Importe de ${amount}€ introducido.`, 'SUCCESS');
    await wait(500); // Pequeña pausa para que la UI se actualice con la ganancia potencial.

    // --- PASO 3: CONFIRMAR LA APUESTA FINAL ---
    logMessage(
      '🚀 Paso 3/3: Buscando el botón final para confirmar la apuesta...',
      'INFO',
    );
    const finalBetButton = document.querySelector(
      'button[data-testid="basket-submit-button"]',
    );

    if (!finalBetButton || !isElementVisible(finalBetButton)) {
      throw new Error('No se encontró el botón final para apostar.');
    }

    // =======================================================================
    // === ¡¡¡ATENCIÓN!!! ESTA LÍNEA REALIZARÁ UNA APUESTA CON DINERO REAL ===
    // === Mantenla comentada durante las pruebas. Descoméntala solo cuando ===
    // === estés 100% seguro de que todo el proceso funciona correctamente. ===
    // =======================================================================

    await clickElement(finalBetButton);
    await wait(3000); // Esperamos la confirmación de la apuesta

    // Por ahora, simulamos que la apuesta fue exitosa sin hacer el clic final.
    logMessage(
      `🏆 ¡APUESTA REALIZADA (SIMULADO)! ${amount}€ en "${globalState.currentBet.pick}"`,
      'SUCCESS',
    );
    sendBetResult(true, null, messageId, amount);
  } catch (error) {
    logMessage(
      `❌ Error durante la ejecución final en el boleto: ${error.message}`,
      'ERROR',
    );
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

  if (message.action === 'arbitrageBet') {
    const supportedTypes = ['SPREADS', 'TOTALS', 'MONEYLINE'];
    if (supportedTypes.includes(message.betData.betType)) {
      // No necesitas 'await' aquí, ya que el resultado se enviará
      // con otro mensaje ('betResult').
      processBet(message.betData);
      sendResponse({ received: true }); // Informa al background que el mensaje fue recibido.
    } else {
      sendResponse({
        error: `Tipo de apuesta no soportado: ${message.betData.betType}`,
      });
    }
  } else if (message.action === 'ping') {
    sendResponse({ status: 'ready', url: window.location.href });
  }

  // Devuelve true solo si vas a llamar a sendResponse de forma asíncrona,
  // lo cual no haces aquí (el resultado final se envía con otro mensaje).
  // En este caso, puede que no sea estrictamente necesario, pero es una buena práctica
  // mantenerlo por si acaso.
  return true;
});
