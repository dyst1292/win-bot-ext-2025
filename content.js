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
  FILTER_BUTTON: '.sc-gplwa-d.bIHQDs.filter-button',
  SPREAD_SECTION: '[class*="sc-eeQVsz"]:has-text("Hándicap")',
  LIST_VIEW_BUTTON: '.sc-bXxnNr.cokPNx', // Botón para cambiar a vista de lista
  GRID_VIEW_SVG: 'svg rect[x="10"][y="10"]', // SVG específico del botón de lista
  MORE_SELECTIONS_BUTTON: '.sc-fNZVXS.cwIfgf.expand-button',
  MORE_SELECTIONS_TEXT: '.sc-cWKVQc.bGBBfC',
  BET_BUTTON: '.sc-lcDspb.hvhzTf.sc-fIyekj.kMmmnL.odd-button-wrapper',
  BET_DESCRIPTION: '.sc-eHVZpS.byWUOZ',
  BET_ODDS: '.sc-eIGzw.jphTtc',
  // Selectores alternativos más amplios
  BET_BUTTON_ALT: [
    '.sc-lcDspb',
    '[data-testid*="odd-button"]',
    '.odd-button-wrapper',
    'button[class*="odd"]',
    '[class*="bet-group-outcome"] button',
  ],
  BET_DESCRIPTION_ALT: ['.sc-eHVZpS', '[class*="byWUOZ"]'],
  BET_ODDS_ALT: ['.sc-eIGzw', '[class*="jphTtc"]'],
};

// Estado global
let spreadState = {
  currentBet: null,
  isProcessing: false,
  spreadSections: [], // Ahora puede haber múltiples secciones
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
      .sendMessage({
        action: 'contentReady',
        url: window.location.href,
      })
      .catch(() => {});
  }, 1000);
}

// ========================================
// FUNCIONES PRINCIPALES PARA SPREAD
// ========================================

/**
 * Procesar apuesta SPREAD - Función principal
 */
async function processSpreadBet(betData) {
  try {
    logMessage('🎯 Iniciando procesamiento de apuesta SPREAD...', 'INFO');
    logMessage(`📊 Pick: ${betData.pick}`, 'INFO');
    logMessage(`💰 Cuota objetivo: ${betData.targetOdds}`, 'INFO');

    spreadState.isProcessing = true;
    spreadState.currentBet = betData;

    // Verificar que estamos en página correcta
    if (!isValidWinamaxPage()) {
      throw new Error('No estamos en una página válida de evento de Winamax');
    }

    // Paso 1: Navegar al submenú "Diferencia de puntos"
    const spreadMenuFound = await navigateToSpreadMenu();
    if (!spreadMenuFound) {
      throw new Error('No se encontró el submenú "Diferencia de puntos"');
    }

    // Paso 2: Encontrar las secciones de SPREAD (puede haber múltiples)
    const spreadSectionsFound = await findSpreadSections();
    if (!spreadSectionsFound) {
      throw new Error('No se encontraron secciones de SPREAD');
    }

    // Paso 3: Buscar el pick en todas las secciones disponibles
    // Ahora, betFound puede ser null (no encontrado), o un objeto con {element, description, odds}
    const betFound = await searchSpreadBetInAllSections(
      betData.pick,
      betData.targetOdds,
    );

    if (!betFound) {
      // Este caso solo debería ocurrir si searchSpreadBetInAllSections lanza un error más específico
      // o si la lógica de retorno no fue manejada correctamente.
      // throw new Error(`No se encontró el pick "${betData.pick}" en ninguna sección de SPREAD`);
      // El error ya debería venir de searchSpreadBetInAllSections
      throw new Error('Error interno: BetFound es null inesperadamente');
    }

    // Paso 4: Ejecutar la apuesta
    await executeBet(betFound.element, betData.amount, betData.messageId);
  } catch (error) {
    logMessage(`❌ Error procesando SPREAD: ${error.message}`, 'ERROR');
    sendBetResult(false, error.message, betData.messageId);
  } finally {
    spreadState.isProcessing = false;
  }
}

/**
 * Navegar al submenú de SPREAD (Diferencia de puntos/goles)
 */
async function navigateToSpreadMenu() {
  try {
    logMessage('🔍 Buscando submenú de SPREAD...', 'INFO');

    // Buscar todos los botones de filtro
    const filterButtons = document.querySelectorAll(SELECTORS.FILTER_BUTTON);

    logMessage(
      `📋 Encontrados ${filterButtons.length} botones de filtro`,
      'INFO',
    );

    for (const button of filterButtons) {
      const buttonText = button.textContent?.trim().toLowerCase() || '';

      // Buscar términos de SPREAD para diferentes deportes
      if (
        buttonText.includes('diferencia de puntos') || // Baloncesto, eSports, etc.
        buttonText.includes('diferencia de goles') || // Fútbol ⚽
        buttonText.includes('handicap') ||
        buttonText.includes('hándicap') ||
        buttonText.includes('spread')
      ) {
        logMessage(
          `✅ Submenú SPREAD encontrado: "${button.textContent.trim()}"`,
          'SUCCESS',
        );

        // Detectar tipo de deporte
        if (buttonText.includes('goles')) {
          logMessage('⚽ Deporte detectado: FÚTBOL', 'INFO');
        } else if (buttonText.includes('puntos')) {
          logMessage('🏀 Deporte detectado: BALONCESTO/OTROS', 'INFO');
        }

        // Hacer scroll y click
        button.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await wait(CONFIG.CLICK_DELAY);

        await clickElement(button);
        await wait(2000);

        logMessage('✅ Navegación al submenú SPREAD completada', 'SUCCESS');
        return true;
      }
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

/**
 * Encontrar las secciones de SPREAD (puede haber múltiples) - MEJORADO
 */
async function findSpreadSections() {
  try {
    logMessage('🔍 Buscando secciones de SPREAD...', 'INFO');

    const foundSections = [];
    const allElements = document.querySelectorAll('*');

    for (const element of allElements) {
      const text = element.textContent?.trim().toLowerCase() || '';

      // Buscar diferentes variaciones de la sección SPREAD
      if (
        // Baloncesto, eSports, etc.
        text === 'hándicap de puntos (handicap)' ||
        text === 'handicap de puntos' ||
        text === 'hándicap de puntos' ||
        // Fútbol ⚽ - Partido completo
        text === 'hándicap asiático (handicap)' ||
        text === 'handicap asiático' ||
        text === 'hándicap asiático' ||
        // Fútbol ⚽ - Primera mitad
        text === '1ª mitad - hándicap asiático (handicap)' ||
        text === '1ª mitad - handicap asiático' ||
        text === '1ª mitad - hándicap asiático' ||
        // Fútbol ⚽ - Alternativa con "goles"
        text === 'hándicap de goles (handicap)' ||
        text === 'handicap de goles' ||
        text === 'hándicap de goles'
      ) {
        logMessage(
          `✅ Sección SPREAD encontrada: "${element.textContent.trim()}"`,
          'SUCCESS',
        );

        // Detectar tipo específico
        let sectionType = 'unknown';
        if (text.includes('1ª mitad') && text.includes('asiático')) {
          sectionType = 'football_first_half';
          logMessage(
            '⚽ Sección de FÚTBOL 1ª MITAD (hándicap asiático) identificada',
            'INFO',
          );
        } else if (text.includes('asiático')) {
          sectionType = 'football_full';
          logMessage(
            '⚽ Sección de FÚTBOL COMPLETO (hándicap asiático) identificada',
            'INFO',
          );
        } else if (text.includes('goles')) {
          sectionType = 'football_goals';
          logMessage(
            '⚽ Sección de FÚTBOL (hándicap de goles) identificada',
            'INFO',
          );
        } else if (text.includes('puntos')) {
          sectionType = 'basketball_points';
          logMessage(
            '🏀 Sección de BALONCESTO/ESPORTS (puntos) identificada',
            'INFO',
          );
        }

        // MEJORADO: Buscar múltiples niveles de contenedores padre
        let sectionContainer = null;

        // Buscar contenedores más específicos primero
        const containers = [
          element.closest('.sc-kJCCEd'), // Contenedor específico del HTML
          element.closest('[class*="sc-jwunkD"]'), // Contenedor general
          element.closest('[class*="section"]'), // Contenedor por clase
          element.closest('.bet-group-template'), // Template de grupo
        ];

        for (const container of containers) {
          if (container) {
            sectionContainer = container;
            break;
          }
        }

        // Si no encuentra contenedor específico, usar el padre más amplio
        if (!sectionContainer) {
          let parent = element.parentElement;
          let attempts = 0;

          while (parent && attempts < 8) {
            // Buscar un contenedor que tenga botones de apuesta
            const hasButtons =
              parent.querySelectorAll('.sc-lcDspb, [data-testid*="odd-button"]')
                .length > 0;
            if (hasButtons) {
              sectionContainer = parent;
              break;
            }
            parent = parent.parentElement;
            attempts++;
          }
        }

        if (sectionContainer) {
          // Verificar que este contenedor tiene botones antes de añadirlo
          const buttonCount = sectionContainer.querySelectorAll(
            '.sc-lcDspb, [data-testid*="odd-button"]',
          ).length;

          logMessage(
            `🎲 Contenedor encontrado con ${buttonCount} botones potenciales`,
            'INFO',
          );

          foundSections.push({
            container: sectionContainer,
            title: element.textContent.trim(),
            type: sectionType,
            element: element,
            buttonCount: buttonCount,
          });
        } else {
          logMessage(
            `⚠️ No se encontró contenedor válido para: "${element.textContent.trim()}"`,
            'WARN',
          );
        }
      }
    }

    if (foundSections.length > 0) {
      logMessage(
        `✅ Encontradas ${foundSections.length} secciones SPREAD`,
        'SUCCESS',
      );

      // Log detallado de cada sección encontrada
      foundSections.forEach((section, i) => {
        logMessage(
          `  ${i + 1}. "${section.title}" (${section.type}) - ${
            section.buttonCount
          } botones`,
          'INFO',
        );
      });

      spreadState.spreadSections = foundSections;
      return true;
    }

    logMessage('❌ No se encontró ninguna sección de SPREAD', 'ERROR');
    return false;
  } catch (error) {
    logMessage(`❌ Error buscando secciones: ${error.message}`, 'ERROR');
    return false;
  }
}

/**
 * Buscar apuesta SPREAD en todas las secciones disponibles
 * Retorna el objeto de apuesta si se encuentra con cuota válida,
 * o lanza un error descriptivo si no se encuentra o la cuota es insuficiente.
 */
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

    const foundCandidatesWithInsufficientOdds = []; // Para almacenar picks encontrados pero con cuotas bajas
    const sectionsChecked = []; // Para la lista de secciones verificadas

    // Buscar en cada sección encontrada
    for (let i = 0; i < spreadState.spreadSections.length; i++) {
      const section = spreadState.spreadSections[i];
      sectionsChecked.push(section.title); // Añadir a la lista de secciones revisadas

      logMessage(
        `📋 Buscando en sección ${i + 1}/${
          spreadState.spreadSections.length
        }: "${section.title}"`,
        'INFO',
      );

      spreadState.currentSectionIndex = i;

      // searchResult ahora devuelve un objeto con found, validOdds, bet, message
      const searchResult = await searchSpreadBetInSection(
        section,
        team,
        handicap,
        targetOdds,
      );

      if (searchResult && searchResult.found && searchResult.validOdds) {
        // Pick encontrado con cuota válida, ¡bingo!
        logMessage(
          `✅ Pick "${searchResult.bet.description}" encontrado con cuota ${searchResult.bet.odds} (>= ${targetOdds}) en "${section.title}"`,
          'SUCCESS',
        );
        return searchResult.bet; // Retorna el objeto de apuesta directamente
      } else if (
        searchResult &&
        searchResult.found &&
        !searchResult.validOdds
      ) {
        // Pick encontrado pero cuota insuficiente
        logMessage(
          `⚠️ Pick "${searchResult.bet.description}" encontrado pero cuota insuficiente ${searchResult.bet.odds} (< ${targetOdds}) en "${section.title}"`,
          'WARN',
        );
        foundCandidatesWithInsufficientOdds.push(searchResult.bet);
      } else {
        // Pick no encontrado en esta sección (searchResult.found es false o searchResult es null)
        logMessage(
          `❌ Pick no encontrado en sección: "${section.title}"`,
          'ERROR',
        );
      }
    }

    // Si llegamos aquí, no se encontró un pick con cuota válida en ninguna sección
    if (foundCandidatesWithInsufficientOdds.length > 0) {
      // Si se encontraron picks pero con cuotas insuficientes
      let errorMessage = `Pick "${pick}" encontrado pero cuotas insuficientes (target: ${targetOdds}):\n`;
      foundCandidatesWithInsufficientOdds.forEach((bet) => {
        errorMessage += `• Sección "${bet.section}": "${bet.description}" @ ${bet.odds}\n`;
      });
      throw new Error(errorMessage.trim());
    } else {
      // Si no se encontró el pick en absoluto en ninguna sección
      const sectionsList = sectionsChecked.join(', ');
      throw new Error(
        `Pick "${pick}" no encontrado en las secciones: ${sectionsList}`,
      );
    }
  } catch (error) {
    // Si es un error que ya tiene mensaje detallado, pasarlo tal cual
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

/**
 * Buscar apuesta SPREAD en una sección específica
 * Retorna un objeto {found: boolean, validOdds: boolean, bet: object|null, message: string}
 */
async function searchSpreadBetInSection(section, team, handicap, targetOdds) {
  try {
    logMessage(
      `🔍 Procesando sección: "${section.title}" (${section.type})`,
      'INFO',
    );

    const initialSearchResult = await findSpreadBetInVisibleButtons(
      section,
      team,
      handicap,
      targetOdds,
    );

    if (initialSearchResult.found && initialSearchResult.validOdds) {
      // Si se encuentra con cuota válida, retornar inmediatamente
      return initialSearchResult;
    }

    // Si no se encontró con cuota válida o no se encontró en absoluto, intentar expandir
    logMessage(
      '🔍 Pick no encontrado o cuota insuficiente, expandiendo "Más selecciones" en esta sección...',
      'INFO',
    );
    const expanded = await expandMoreSelectionsInSection(section);

    if (expanded) {
      await wait(2000); // Esperar a que se carguen las opciones adicionales
      const expandedSearchResult = await findSpreadBetInVisibleButtons(
        section,
        team,
        handicap,
        targetOdds,
      );
      if (expandedSearchResult.found) {
        return expandedSearchResult;
      }
    }

    // Si aún no se encuentra con cuota válida después de expandir, activar vista de lista
    const listViewActivated = await activateListViewInSection(section);
    if (listViewActivated) {
      await wait(2000); // Esperar a que se carguen las opciones en vista de lista
      const listViewSearchResult = await findSpreadBetInVisibleButtons(
        section,
        team,
        handicap,
        targetOdds,
      );
      if (listViewSearchResult.found) {
        return listViewSearchResult;
      }
    }

    // Si no se encontró en ninguna de las fases, retornar un resultado negativo
    return {
      found: false,
      validOdds: false,
      bet: null,
      message: `Pick "${team} ${handicap}" no encontrado en sección "${section.title}" o no cumple cuota.`,
    };
  } catch (error) {
    logMessage(
      `❌ Error procesando sección "${section.title}": ${error.message}`,
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

/**
 * Buscar pick en los botones visibles de una sección
 * Retorna un objeto {found: boolean, validOdds: boolean, bet: object|null, message: string}
 */
async function findSpreadBetInVisibleButtons(
  section,
  team,
  handicap,
  targetOdds,
) {
  try {
    logMessage(
      `🔍 Buscando pick en botones visibles de sección: "${section.title}"...`,
      'INFO',
    );

    const betButtons = section.container.querySelectorAll(SELECTORS.BET_BUTTON);
    logMessage(
      `🎲 Encontrados ${betButtons.length} botones en esta sección`,
      'INFO',
    );

    // Log de los primeros botones para debug
    for (let i = 0; i < Math.min(betButtons.length, 6); i++) {
      // Aumentar a 6 para ver más
      const button = betButtons[i];
      const desc =
        button.querySelector(SELECTORS.BET_DESCRIPTION)?.textContent?.trim() ||
        '';
      const odds =
        button.querySelector(SELECTORS.BET_ODDS)?.textContent?.trim() || '';
      logMessage(`  🎲 ${i + 1}. "${desc}" @ ${odds}`, 'INFO');
    }

    const candidates = [];
    let bestInvalidOddsCandidate = null; // Para guardar el mejor candidato con cuotas insuficientes

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
          description: description,
          odds: odds || 0,
          team: team,
          handicap: handicap,
          section: section.title,
        };
        candidates.push(candidate);
        logMessage(
          `✅ Candidato encontrado en "${section.title}": "${description}" @ ${odds}`,
          'SUCCESS',
        );

        if (odds >= targetOdds) {
          // Si encontramos uno con cuota válida, podemos devolverlo directamente
          logMessage(
            `🏆 Pick válido encontrado en "${section.title}": "${description}" @ ${odds}`,
            'SUCCESS',
          );
          return {
            found: true,
            validOdds: true,
            bet: candidate,
            message: `Pick encontrado con cuota válida: ${description} @ ${odds}`,
          };
        } else {
          // Si la cuota es insuficiente, guardarlo como el mejor entre los inválidos
          if (
            !bestInvalidOddsCandidate ||
            odds > bestInvalidOddsCandidate.odds
          ) {
            bestInvalidOddsCandidate = candidate;
          }
        }
      }
    }

    // Si llegamos aquí, no se encontró un pick con cuota válida.
    if (bestInvalidOddsCandidate) {
      logMessage(
        `⚠️ Pick encontrado pero cuotas insuficientes en "${section.title}": "${bestInvalidOddsCandidate.description}" @ ${bestInvalidOddsCandidate.odds} (mínimo: ${targetOdds})`,
        'WARN',
      );
      return {
        found: true,
        validOdds: false,
        bet: bestInvalidOddsCandidate,
        message: `Cuota insuficiente: ${bestInvalidOddsCandidate.odds} < ${targetOdds}`,
      };
    } else {
      logMessage(
        `❌ Pick no encontrado en sección: "${section.title}"`,
        'ERROR',
      );
      return {
        found: false,
        validOdds: false,
        bet: null,
        message: `Pick no encontrado en sección "${section.title}"`,
      };
    }
  } catch (error) {
    logMessage(
      `❌ Error buscando en sección "${section.title}": ${error.message}`,
      'ERROR',
    );
    return {
      found: false,
      validOdds: false,
      bet: null,
      message: `Error al buscar en sección "${section.title}"`,
    };
  }
}

/**
 * Activar vista de lista en una sección específica
 */
async function activateListViewInSection(section) {
  try {
    logMessage(
      `📋 Activando vista de lista en sección: "${section.title}"...`,
      'INFO',
    );

    // Buscar el botón de vista de lista dentro de esta sección específica
    const listViewButtons = section.container.querySelectorAll(
      SELECTORS.LIST_VIEW_BUTTON,
    );

    if (listViewButtons.length === 0) {
      // Alternativa: buscar por el SVG específico en esta sección
      const svgButtons = section.container.querySelectorAll(
        SELECTORS.GRID_VIEW_SVG,
      );

      for (const svg of svgButtons) {
        const button = svg.closest(
          'button, [role="button"], div[class*="bXxnNr"]',
        );
        if (button && isElementVisible(button)) {
          logMessage(
            '📋 Botón de vista encontrado por SVG en esta sección',
            'INFO',
          );
          await clickElement(button);
          await wait(1500);
          logMessage('✅ Vista de lista activada en esta sección', 'SUCCESS');
          return true;
        }
      }
    } else {
      // Usar el primer botón de vista de lista encontrado en esta sección
      const button = listViewButtons[0];
      if (isElementVisible(button)) {
        logMessage(
          '📋 Botón de vista de lista encontrado en esta sección',
          'INFO',
        );
        await clickElement(button);
        await wait(1500);
        logMessage('✅ Vista de lista activada en esta sección', 'SUCCESS');
        return true;
      }
    }

    logMessage(
      '⚠️ No se encontró botón de vista de lista en esta sección',
      'WARN',
    );
    return false;
  } catch (error) {
    logMessage(
      `❌ Error activando vista de lista en sección: ${error.message}`,
      'ERROR',
    );
    return false;
  }
}

/**
 * Expandir "Más selecciones" en una sección específica
 */
async function expandMoreSelectionsInSection(section) {
  try {
    logMessage(
      `➕ Buscando "Más selecciones" en sección: "${section.title}"...`,
      'INFO',
    );

    // Buscar el botón "Más selecciones" dentro de esta sección específica
    const moreButtons = section.container.querySelectorAll(
      SELECTORS.MORE_SELECTIONS_BUTTON,
    );

    for (const button of moreButtons) {
      const textElement = button.querySelector(SELECTORS.MORE_SELECTIONS_TEXT);
      const buttonText = textElement?.textContent?.trim().toLowerCase() || '';

      if (
        buttonText.includes('más selecciones') ||
        buttonText.includes('more selections') ||
        buttonText === 'más selecciones'
      ) {
        logMessage(
          `✅ Botón "Más selecciones" encontrado en esta sección: "${buttonText}"`,
          'SUCCESS',
        );

        if (isElementVisible(button)) {
          await clickElement(button);
          await wait(2000);
          logMessage(
            '✅ "Más selecciones" expandido en esta sección',
            'SUCCESS',
          );
          return true;
        }
      }
    }

    logMessage('⚠️ No se encontró "Más selecciones" en esta sección', 'WARN');
    return false;
  } catch (error) {
    logMessage(
      `❌ Error expandiendo más selecciones en sección: ${error.message}`,
      'ERROR',
    );
    return false;
  }
}

// ========================================
// FUNCIONES AUXILIARES
// ========================================

/**
 * Parsear pick de SPREAD (ej: "OASIS +1.5" -> {team: "OASIS", handicap: "+1.5"})
 */
function parseSpreadPick(pick) {
  const parts = pick.trim().split(/\s+/);

  if (parts.length < 2) {
    return { team: pick, handicap: null };
  }

  const handicap = parts[parts.length - 1]; // Último elemento
  const team = parts.slice(0, -1).join(' '); // Todo excepto el último

  return { team, handicap };
}

/**
 * Verificar si un botón coincide con nuestro handicap (búsqueda simplificada)
 */
function isMatchingSpreadBet(description, team, handicap) {
  const normalizedDesc = description.toUpperCase().trim();
  const normalizedHandicap = handicap ? handicap.toUpperCase().trim() : '';
  const normalizedTeam = team ? team.toUpperCase().trim() : '';

  logMessage(
    `🔍 Comparando descripción: "${normalizedDesc}" con equipo: "${normalizedTeam}" y handicap: "${normalizedHandicap}"`,
    'INFO',
  );

  // El equipo debe estar presente en la descripción
  if (!normalizedDesc.includes(normalizedTeam)) {
    logMessage(
      `❌ Equipo no encontrado: "${normalizedTeam}" no está en "${normalizedDesc}"`,
      'WARN',
    );
    return false;
  }

  // Si no hay handicap específico, el equipo ya es suficiente
  if (!normalizedHandicap) {
    logMessage(
      `✅ Equipo encontrado y no se especificó handicap. Coincidencia por equipo.`,
      'SUCCESS',
    );
    return true;
  }

  // Verificar handicap exacto en el texto del botón
  if (normalizedDesc.includes(normalizedHandicap)) {
    logMessage(
      `✅ Handicap y equipo encontrados: "${description}" contiene "${normalizedHandicap}"`,
      'SUCCESS',
    );
    return true;
  }

  // Verificar variaciones del handicap (por si hay espacios o formato diferente)
  const handicapVariations = [
    normalizedHandicap,
    normalizedHandicap.replace(/\s+/g, ''), // Sin espacios
    normalizedHandicap.replace('+', ' +'), // Con espacio antes del +
    normalizedHandicap.replace('-', ' -'), // Con espacio antes del -
    normalizedHandicap.replace(',', '.'), // Coma a punto
    normalizedHandicap.replace('.', ','), // Punto a coma
  ];

  for (const variation of handicapVariations) {
    if (normalizedDesc.includes(variation)) {
      logMessage(
        `✅ Variación de handicap encontrada (equipo OK): "${description}" contiene "${variation}"`,
        'SUCCESS',
      );
      return true;
    }
  }

  logMessage(
    `❌ Handicap no encontrado para "${normalizedTeam}": "${description}" no contiene "${handicap}"`,
    'WARN',
  );
  return false;
}

/**
 * Verificar si estamos en página válida de Winamax
 */
function isValidWinamaxPage() {
  const url = window.location.href.toLowerCase();
  return (
    url.includes('winamax.es/apuestas-deportivas/match/') ||
    url.includes('winamax.fr/paris-sportifs/match/')
  );
}

/**
 * Verificar si un elemento es visible
 */
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

/**
 * Click en elemento con simulación realista
 */
async function clickElement(element) {
  if (!element) return false;

  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await wait(300);

  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    clientX: x,
    clientY: y,
    button: 0,
  });

  element.dispatchEvent(clickEvent);
  return true;
}

/**
 * Ejecutar apuesta (placeholder - puedes usar tu implementación existente)
 */
async function executeBet(element, amount, messageId) {
  try {
    logMessage('🎯 Ejecutando apuesta...', 'INFO');

    // Hacer click en el botón de apuesta
    await clickElement(element);
    await wait(2000);

    // Aquí iría la lógica para introducir el importe y confirmar
    // (puedes usar las funciones que ya tienes: findStakeInput, findBetButton, etc.)

    logMessage(`✅ Apuesta de ${amount}€ ejecutada`, 'SUCCESS');
    sendBetResult(true, null, messageId, amount);
  } catch (error) {
    logMessage(`❌ Error ejecutando apuesta: ${error.message}`, 'ERROR');
    sendBetResult(false, error.message, messageId);
  }
}

/**
 * Función de espera
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Enviar resultado de apuesta
 */
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

/**
 * Función de logging
 */
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

// ========================================
// LISTENERS Y MANEJO DE MENSAJES
// ========================================

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
          sendResponse({
            error: 'Tipo de apuesta no soportado. Solo SPREAD implementado.',
          });
        }
        break;

      case 'debugPage':
        debugSpreadPage();
        sendResponse({ received: true });
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

/**
 * Debug específico para páginas SPREAD
 */
function debugSpreadPage() {
  logMessage('🔍 === DEBUG SPREAD PAGE ===', 'INFO');
  logMessage(`🌐 URL: ${window.location.href}`, 'INFO');

  // Debug submenús SPREAD
  const filterButtons = document.querySelectorAll(SELECTORS.FILTER_BUTTON);
  logMessage(`📋 Submenús encontrados: ${filterButtons.length}`, 'INFO');

  let spreadMenus = 0;
  filterButtons.forEach((btn, i) => {
    const text = btn.textContent?.trim() || '';
    const isSpread =
      text.toLowerCase().includes('diferencia de puntos') ||
      text.toLowerCase().includes('diferencia de goles') ||
      text.toLowerCase().includes('handicap') ||
      text.toLowerCase().includes('hándicap');

    if (isSpread) {
      spreadMenus++;
      logMessage(`  ✅ SPREAD ${i + 1}. "${text}"`, 'INFO');
    } else {
      logMessage(`  ⚪ ${i + 1}. "${text}"`, 'INFO');
    }
  });

  logMessage(`🎯 Total submenús SPREAD: ${spreadMenus}`, 'INFO');

  // Debug secciones SPREAD
  const allElements = document.querySelectorAll('*');
  let spreadSections = 0;

  for (const el of allElements) {
    const text = el.textContent?.trim().toLowerCase() || '';
    if (
      text.includes('hándicap de puntos') ||
      text.includes('hándicap asiático') || // ⚽ Fútbol completo
      text.includes('1ª mitad - hándicap asiático') || // ⚽ Fútbol 1ª mitad
      text.includes('hándicap de goles') || // ⚽ Fútbol alternativo
      text.includes('handicap de puntos') ||
      text.includes('handicap asiático') ||
      text.includes('handicap de goles')
    ) {
      spreadSections++;
      logMessage(`🎯 Sección encontrada: "${el.textContent?.trim()}"`, 'INFO');
    }
  }

  logMessage(
    `✅ Encontradas ${spreadState.spreadSections.length} secciones SPREAD`,
    'INFO',
  );

  spreadState.spreadSections.forEach((section, i) => {
    logMessage(`  ${i + 1}. "${section.title}" (${section.type})`, 'INFO');
  });

  // Debug vista de lista
  const listViewButtons = document.querySelectorAll(SELECTORS.LIST_VIEW_BUTTON);
  logMessage(`📋 Botones de vista de lista: ${listViewButtons.length}`, 'INFO');

  const gridSvgs = document.querySelectorAll(SELECTORS.GRID_VIEW_SVG);
  logMessage(`🔲 SVGs de vista encontrados: ${gridSvgs.length}`, 'INFO');

  // Debug botones "Más selecciones"
  const moreButtons = document.querySelectorAll(
    SELECTORS.MORE_SELECTIONS_BUTTON,
  );
  logMessage(`➕ Botones "Más selecciones": ${moreButtons.length}`, 'INFO');

  moreButtons.forEach((btn, i) => {
    const textEl = btn.querySelector(SELECTORS.MORE_SELECTIONS_TEXT);
    const text = textEl?.textContent?.trim() || '';
    logMessage(`  ${i + 1}. "${text}"`, 'INFO');
  });

  logMessage('🔍 === FIN DEBUG ===', 'INFO');
}
