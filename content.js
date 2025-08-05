// content.js - Sistema de arbitraje para Winamax MEJORADO
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

    // Procesar según el tipo de apuesta (SIN expandir vista global)
    if (betData.betType === 'TENNIS_MONEYLINE') {
      await processTennisMoneyline(betData);
    } else if (
      betData.betType === 'TOTALS' ||
      betData.betType === 'FOOTBALL_TOTALS'
    ) {
      await processFootballTotals(betData);
    } else if (betData.betType === 'ESPORTS_SPREAD') {
      await processEsportsSpread(betData);
    } else {
      await processOtherSports(betData);
    }
  } catch (error) {
    logMessage(`❌ Error procesando arbitraje: ${error.message}`, 'ERROR');
    sendBetResult(false, error.message, betData.messageId);
  }
}

// NUEVA FUNCIÓN: Navegar específicamente a la sección "Número total de goles"
async function navigateToTotalsSection() {
  try {
    logMessage('🎯 Buscando sección "Número total de goles"...', 'INFO');

    // Buscar elementos que contengan "Número total de goles"
    const sectionElements = document.querySelectorAll(
      [
        '.sc-eeQVsz',
        '.sc-cvnYLt',
        '[class*="section"]',
        '[class*="market"]',
        'div',
        'span',
      ].join(', '),
    );

    for (const element of sectionElements) {
      const text = element.textContent?.trim().toLowerCase() || '';

      if (
        text.includes('número total de goles') ||
        text.includes('total goles') ||
        text.includes('total de goles') ||
        text.includes('over/under') ||
        text.includes('más/menos')
      ) {
        logMessage(
          `✅ Sección encontrada: "${element.textContent?.trim()}"`,
          'SUCCESS',
        );

        // Hacer clic en la sección para expandirla/activarla
        const clickableElement =
          element.closest('button, [role="button"], [onclick], .clickable') ||
          element;

        if (isElementUsable(clickableElement)) {
          logMessage('🖱️ Haciendo clic en la sección...', 'INFO');
          await clickElement(clickableElement);
          await wait(2000);
          return true;
        }
      }
    }

    logMessage('❌ No se encontró la sección "Número total de goles"', 'ERROR');
    return false;
  } catch (error) {
    logMessage(
      `❌ Error navegando a sección de totales: ${error.message}`,
      'ERROR',
    );
    return false;
  }
}

// NUEVA FUNCIÓN: Cambiar a modo lista dentro de la sección actual
async function expandToListViewInSection() {
  try {
    logMessage('📋 Cambiando a modo lista en la sección actual...', 'INFO');

    // Esperar un poco después de haber navegado a la sección
    await wait(1000);

    // Buscar botones de vista específicamente en el contexto actual
    const viewButtons = document.querySelectorAll(
      [
        '.sc-bXxnNr',
        '.sc-fDpJdc button',
        '.tabs-wrapper button',
        '[class*="tab"] button',
        '[class*="view"] button',
      ].join(', '),
    );

    logMessage(`🔍 Encontrados ${viewButtons.length} botones de vista`, 'INFO');

    // Buscar el botón de vista de lista (normalmente el segundo)
    for (let i = 0; i < viewButtons.length; i++) {
      const button = viewButtons[i];

      // Intentar el segundo botón (vista de lista)
      if (i === 1 && isElementUsable(button)) {
        logMessage('📋 Cambiando a vista de lista...', 'INFO');
        await clickElement(button);
        await wait(2000);
        logMessage('✅ Vista de lista activada', 'SUCCESS');
        return true;
      }
    }

    // Alternativa: buscar por SVG de lista
    const listViewButtons = document.querySelectorAll('svg rect[x="1"][y="2"]');
    for (const svg of listViewButtons) {
      const button = svg.closest('button, [role="button"]');
      if (button && isElementUsable(button)) {
        logMessage('📋 Botón de lista encontrado por SVG', 'INFO');
        await clickElement(button);
        await wait(2000);
        return true;
      }
    }

    logMessage('⚠️ No se pudo cambiar a vista de lista', 'WARN');
    return false;
  } catch (error) {
    logMessage(`⚠️ Error cambiando a vista de lista: ${error.message}`, 'WARN');
    return false;
  }
}

// NUEVA FUNCIÓN: Expandir "Más selecciones" específicamente en la sección de totales
async function expandMoreSelectionsInTotalsSection() {
  try {
    logMessage(
      '➕ Buscando "Más selecciones" en la sección de totales...',
      'INFO',
    );

    // Buscar elementos "Más selecciones" que estén cerca de elementos de totales
    const expandButtons = document.querySelectorAll(
      [
        '.expand-button',
        '.sc-fNZVXS',
        '.sc-aeBcf',
        '[class*="expand"]',
        '[class*="more"]',
      ].join(', '),
    );

    for (const button of expandButtons) {
      const text = button.textContent?.toLowerCase().trim() || '';

      // Verificar que es un botón de "más selecciones"
      if (
        text.includes('más selecciones') ||
        text.includes('more selections') ||
        text.includes('más') ||
        text.includes('more')
      ) {
        // Verificar que está en el contexto de la sección actual
        const parentSection = button.closest(
          '[class*="section"], [class*="market"], .sc-jwunkD',
        );
        if (parentSection) {
          const sectionText = parentSection.textContent?.toLowerCase() || '';

          // Solo expandir si está en una sección relacionada con totales
          if (
            sectionText.includes('total') ||
            sectionText.includes('goles') ||
            sectionText.includes('más de') ||
            sectionText.includes('menos de')
          ) {
            logMessage(
              `✅ Botón "Más selecciones" encontrado en sección de totales`,
              'SUCCESS',
            );
            await clickElement(button);
            await wait(2000);
            logMessage(
              '✅ Más opciones expandidas en sección de totales',
              'SUCCESS',
            );
            return true;
          }
        }
      }
    }

    logMessage(
      '⚠️ No se encontró "Más selecciones" en sección de totales',
      'WARN',
    );
    return false;
  } catch (error) {
    logMessage(
      `⚠️ Error expandiendo más selecciones: ${error.message}`,
      'WARN',
    );
    return false;
  }
}

// NUEVA FUNCIÓN: Procesar FOOTBALL TOTALS
async function processFootballTotals(betData) {
  try {
    logMessage('⚽ Procesando FOOTBALL TOTALS...', 'INFO');
    logMessage(`🎯 Buscando: ${betData.pick}`, 'INFO');

    // Paso 1: Ir específicamente a la sección "Número total de goles"
    const totalsSection = await navigateToTotalsSection();

    if (!totalsSection) {
      throw new Error('No se encontró la sección "Número total de goles"');
    }

    // Paso 2: Cambiar a modo lista dentro de esa sección
    await expandToListViewInSection();

    // Paso 3: Buscar la apuesta específica
    let foundBet = await searchTotalsBet(betData.pick, betData.targetOdds);

    // Paso 4: Si no se encuentra, expandir "Más selecciones" de esa sección
    if (!foundBet) {
      logMessage(
        '🔍 No encontrado, expandiendo más selecciones de la sección...',
        'INFO',
      );
      const expanded = await expandMoreSelectionsInTotalsSection();

      if (expanded) {
        await wait(2000);
        foundBet = await searchTotalsBet(betData.pick, betData.targetOdds);
      }
    }

    if (foundBet) {
      logMessage(`✅ Apuesta encontrada: ${foundBet.description}`, 'SUCCESS');
      logMessage(`💰 Cuota: ${foundBet.odds}`, 'INFO');

      if (foundBet.odds >= betData.targetOdds) {
        logMessage('✅ Cuota válida, realizando apuesta...', 'SUCCESS');
        await executeBet(foundBet.element, betData.amount, betData.messageId);
      } else {
        throw new Error(
          `Cuota insuficiente: ${foundBet.odds} < ${betData.targetOdds}`,
        );
      }
    } else {
      throw new Error(`Apuesta "${betData.pick}" no encontrada`);
    }
  } catch (error) {
    throw error;
  }
}

// NUEVA FUNCIÓN: Buscar apuestas de totales específicamente
async function searchTotalsBet(pick, minOdds) {
  try {
    logMessage(`🔍 Buscando total: "${pick}"`, 'INFO');

    // Normalizar el pick (ej: "OVER 2.5" -> "más de 2,5")
    const normalizedPick = normalizeTotalsPick(pick);
    logMessage(`🔄 Pick normalizado: "${normalizedPick}"`, 'INFO');

    // Buscar elementos de apuesta
    const betElements = document.querySelectorAll(
      [
        'button[class*="odd"]',
        '.sc-meaPv button',
        '.sc-lcDspb button',
        '[data-testid*="odd-button"]',
        '.odd-button-wrapper button',
        '[class*="bet-group-outcome"] button',
      ].join(', '),
    );

    logMessage(`🎲 Elementos encontrados: ${betElements.length}`, 'INFO');

    const candidates = [];

    for (const element of betElements) {
      if (!isElementUsable(element)) continue;

      const elementText = element.textContent?.trim() || '';
      const odds = extractOdds(element);

      if (!odds || odds < 1.01 || odds > 50) continue;

      // Calcular similitud para totales
      const similarity = calculateTotalsSimilarity(normalizedPick, elementText);

      if (similarity > 0.6) {
        candidates.push({
          element: element,
          odds: odds,
          description: elementText,
          similarity: similarity,
        });

        logMessage(
          `⚽ Candidato total: "${elementText}" - Cuota: ${odds} - Similitud: ${similarity.toFixed(
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
    logMessage(`❌ Error buscando total: ${error.message}`, 'ERROR');
    return null;
  }
}

// NUEVA FUNCIÓN: Normalizar picks de totales
function normalizeTotalsPick(pick) {
  let normalized = pick.toUpperCase().trim();

  // Convertir OVER/UNDER a español
  normalized = normalized.replace(/^OVER\s+/, 'MÁS DE ');
  normalized = normalized.replace(/^UNDER\s+/, 'MENOS DE ');

  // Convertir puntos decimales a comas (formato español)
  normalized = normalized.replace(/(\d)\.(\d)/g, '$1,$2');

  return normalized;
}

// NUEVA FUNCIÓN: Calcular similitud para totales
function calculateTotalsSimilarity(targetPick, elementText) {
  const normalizedElement = elementText.toUpperCase().trim();

  // Coincidencia exacta
  if (normalizedElement === targetPick) {
    return 1.0;
  }

  // Contiene el texto completo
  if (normalizedElement.includes(targetPick)) {
    return 0.9;
  }

  // Extraer número del pick objetivo
  const targetNumber = targetPick.match(/(\d+,\d+|\d+\.\d+)/);
  if (targetNumber) {
    const number = targetNumber[1];

    // Buscar el mismo número en el elemento
    if (
      normalizedElement.includes(number) ||
      normalizedElement.includes(number.replace(',', '.'))
    ) {
      // Verificar tipo (MÁS/MENOS vs OVER/UNDER)
      if (
        (targetPick.includes('MÁS') && normalizedElement.includes('MÁS')) ||
        (targetPick.includes('MENOS') && normalizedElement.includes('MENOS')) ||
        (targetPick.includes('OVER') && normalizedElement.includes('MÁS')) ||
        (targetPick.includes('UNDER') && normalizedElement.includes('MENOS'))
      ) {
        return 0.8;
      }
    }
  }

  return 0.0;
}

// NUEVA FUNCIÓN: Procesar E-SPORTS SPREAD
async function processEsportsSpread(betData) {
  try {
    logMessage('🎮 Procesando E-SPORTS SPREAD...', 'INFO');

    // Navegar a sección de spreads/handicaps
    const spreadSection = await navigateToCorrectSubmenu('ESPORTS_SPREAD');

    if (!spreadSection) {
      logMessage('⚠️ No se encontró sección específica de e-sports', 'WARN');
    }

    // Buscar la apuesta específica
    let foundBet = await searchSpecificBet(betData.pick);

    // Si no se encuentra, expandir más selecciones
    if (!foundBet) {
      logMessage('🔍 No encontrado, expandiendo más selecciones...', 'INFO');
      const expanded = await expandMoreSelections();

      if (expanded) {
        await wait(1000);
        foundBet = await searchSpecificBet(betData.pick);
      }
    }

    if (foundBet && foundBet.odds >= betData.targetOdds) {
      await executeBet(foundBet.element, betData.amount, betData.messageId);
    } else {
      throw new Error('Apuesta de e-sports no encontrada o cuota insuficiente');
    }
  } catch (error) {
    throw error;
  }
}

// Procesar TENNIS MONEYLINE (mantenido)
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
    let playerBet = await findTennisPlayer(betData.pick, betData.targetOdds);

    // Paso 3: Si no se encuentra, expandir más selecciones
    if (!playerBet) {
      logMessage(
        '🔍 Jugador no encontrado, expandiendo más selecciones...',
        'INFO',
      );
      const expanded = await expandMoreSelections();

      if (expanded) {
        await wait(1000);
        playerBet = await findTennisPlayer(betData.pick, betData.targetOdds);
      }
    }

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

// Navegar al submenú correcto según el tipo de apuesta MEJORADO
async function navigateToCorrectSubmenu(betType) {
  try {
    logMessage(`🎯 Navegando a submenú para: ${betType}`, 'INFO');

    // Mapeo de tipos de apuesta a submenús ACTUALIZADO
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
      ESPORTS_SPREAD: [
        'handicap',
        'spread',
        'hándicap',
        'diferencia',
        'advantage',
      ], // ✅ AÑADIDO
      TOTALS: [
        'total de goles',
        'total',
        'over/under',
        'más/menos',
        'número total',
      ], // ✅ MEJORADO
      FOOTBALL_TOTALS: [
        'total de goles',
        'total',
        'over/under',
        'más/menos',
        'número total',
      ], // ✅ AÑADIDO
      MONEYLINE: ['resultado', 'ganador', 'winner', '1x2'],
    };

    // Obtener términos de búsqueda para este tipo
    const searchTerms = submenuMapping[betType] || ['resultado'];

    logMessage(`🔍 Buscando submenús: ${searchTerms.join(', ')}`, 'INFO');

    // Selectores actualizados para los botones de filtro
    const filterButtons = document.querySelectorAll(
      [
        '.filter-button',
        '.sc-gplwa-d',
        'div[class*="filter-button"]',
        'div[data-testid*="filter"]',
        'button[data-testid*="filter"]',
        // Nuevos selectores basados en el HTML
        '.sc-eeQVsz', // Para "Número total de goles"
        '[class*="tabs-wrapper"] div',
        '.sc-cvnYLt div',
      ].join(', '),
    );

    logMessage(
      `📋 Encontrados ${filterButtons.length} botones de filtro`,
      'INFO',
    );

    // Filtrar solo elementos válidos
    const validFilterButtons = Array.from(filterButtons).filter((button) => {
      const text = button.textContent?.trim() || '';
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
          await wait(3000);
          return true;
        }
      }
    }

    // Listar botones disponibles para debug
    logMessage('📋 Botones disponibles:', 'INFO');
    validFilterButtons.slice(0, 10).forEach((button, index) => {
      const text = button.textContent?.trim();
      if (text && text.length > 0) {
        logMessage(`  ${index + 1}. "${text}"`, 'INFO');
      }
    });

    logMessage('❌ No se encontró submenú específico', 'WARN');
    return false;
  } catch (error) {
    logMessage(`⚠️ Error navegando a submenú: ${error.message}`, 'WARN');
    return false;
  }
}

// Buscar jugador de tenis (mantenido igual)
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

// Procesar otros deportes (mantenido pero mejorado)
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
    let foundBet = await searchSpecificBet(betData.pick);

    // Si no se encuentra, expandir más selecciones
    if (!foundBet) {
      logMessage('🔍 No encontrado, expandiendo más selecciones...', 'INFO');
      const expanded = await expandMoreSelections();

      if (expanded) {
        await wait(1000);
        foundBet = await searchSpecificBet(betData.pick);
      }
    }

    if (foundBet && foundBet.odds >= betData.targetOdds) {
      await executeBet(foundBet.element, betData.amount, betData.messageId);
    } else {
      throw new Error('Apuesta no encontrada o cuota insuficiente');
    }
  } catch (error) {
    throw error;
  }
}

// Resto de funciones mantenidas igual...
// (calculateSimilarity, searchSpecificBet, executeBet, etc.)

// Calcular similitud entre nombres (mantenido)
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

// Buscar apuesta específica (mejorado)
async function searchSpecificBet(pick) {
  try {
    logMessage(`🔍 Buscando apuesta: "${pick}"`, 'INFO');

    // Selectores específicos actualizados
    const betElements = document.querySelectorAll(
      [
        'button[class*="odd"]:not([class*="video"])',
        'button[class*="bet"]:not([class*="video"])',
        'div[class*="market"] button',
        'div[class*="selection"] button',
        'button[data-testid*="selection"]',
        'button[data-testid*="odd"]',
        '.sc-iHbSHJ button',
        '.sc-meaPv button',
        '.odd-button-wrapper button',
        '.sc-lcDspb button', // ✅ AÑADIDO basado en HTML
        '[data-testid*="odd-button"] button', // ✅ AÑADIDO
      ].join(', '),
    );

    // Filtrar elementos válidos
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

      // Para SPREAD: buscar equipo + handicap (ej: "OASIS +1.5")
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
      // Para MONEYLINE: buscar nombre del equipo
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
      return candidates[0];
    }

    logMessage('❌ No se encontró la apuesta específica', 'ERROR');
    return null;
  } catch (error) {
    logMessage(`❌ Error buscando apuesta: ${error.message}`, 'ERROR');
    return null;
  }
}

// Normalizar nombres de equipos
function normalizeTeamName(name) {
  return name
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s+\-\.]/g, ''); // Mantener +, -, .
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
    element.querySelector('.sc-eIGzw')?.textContent?.trim() || '', // ✅ AÑADIDO específico
  ];

  for (const text of texts) {
    // Buscar formato decimal: 2.15, 1.95, etc.
    const match = text.match(/\b(\d{1,2}[\.,]\d{1,3})\b/);
    if (match) {
      const oddsStr = match[1].replace(',', '.'); // Normalizar comas a puntos
      const odds = parseFloat(oddsStr);
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

  // Debug específico para vista de lista
  const tabButtons = document.querySelectorAll('.sc-bXxnNr, .sc-ksJxCS');
  logMessage(`📋 Botones de vista encontrados: ${tabButtons.length}`, 'INFO');

  // Debug específico para botones "Más selecciones"
  const expandButtons = document.querySelectorAll('.expand-button, .sc-fNZVXS');
  logMessage(
    `➕ Botones de expansión encontrados: ${expandButtons.length}`,
    'INFO',
  );

  expandButtons.forEach((btn, i) => {
    const text = btn.textContent?.trim() || '';
    logMessage(`  ${i + 1}. "${text}"`, 'INFO');
  });

  logMessage('🔍 === FIN DEBUG ===', 'INFO');
}
