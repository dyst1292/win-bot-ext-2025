// content.js - Sistema avanzado de arbitraje para Winamax
console.log('🎰 Winamax Bot Content Script cargado en:', window.location.href);

// Variables globales para el estado
let loginState = {
  isWaitingForManualLogin: false,
  credentials: null,
  checkInterval: null,
};

// Variables para arbitraje
let arbitrageState = {
  currentBet: null,
  searchTimeout: null,
  isSearching: false,
};

// Esperar a que la página esté completamente cargada
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
  initializeContentScript();
}

function initializeContentScript() {
  console.log('🚀 Inicializando content script para Winamax...');

  // Indicar que el content script está listo
  setTimeout(() => {
    chrome.runtime
      .sendMessage({
        action: 'contentReady',
        url: window.location.href,
        timestamp: Date.now(),
      })
      .catch((error) => {
        console.log('Background script no disponible:', error);
      });
  }, 1000);
}

// Función principal para procesar apuestas de arbitraje
async function processArbitrageBet(betData) {
  try {
    logWithTimestamp('🎯 Procesando apuesta de arbitraje...', 'INFO');
    logWithTimestamp(`📊 Datos: ${JSON.stringify(betData)}`, 'INFO');

    const currentUrl = window.location.href.toLowerCase();

    // Si ya estamos en la página del evento, procesar directamente
    if (currentUrl.includes('winamax.es/apuestas-deportivas/match/')) {
      logWithTimestamp(
        '✅ Ya estamos en página de evento, procesando...',
        'SUCCESS',
      );
      await processEventPage(betData);
    } else {
      logWithTimestamp('❌ No estamos en una página de evento válida', 'ERROR');
      chrome.runtime.sendMessage({
        action: 'betResult',
        success: false,
        error: 'No estamos en página de evento de Winamax',
        messageId: betData.messageId,
      });
    }
  } catch (error) {
    logWithTimestamp(
      `❌ Error procesando arbitraje: ${error.message}`,
      'ERROR',
    );
    chrome.runtime.sendMessage({
      action: 'betResult',
      success: false,
      error: error.message,
      messageId: betData.messageId,
    });
  }
}

// Procesar página de evento específico
async function processEventPage(betData) {
  try {
    logWithTimestamp('🔍 Analizando página de evento...', 'INFO');

    // Esperar a que cargue completamente
    await wait(3000);

    // Primero, navegar a la sección correcta
    await navigateToCorrectSection(betData.pick);

    // Buscar la apuesta específica
    const foundBet = await searchForSpecificBet(betData);

    if (foundBet) {
      logWithTimestamp(
        `✅ Apuesta encontrada: ${foundBet.description}`,
        'SUCCESS',
      );
      logWithTimestamp(
        `💰 Cuota encontrada: ${foundBet.odds} (mínima: ${betData.targetOdds})`,
        'INFO',
      );

      // Verificar si la cuota es válida
      if (foundBet.odds >= betData.targetOdds) {
        logWithTimestamp(
          '✅ Cuota válida, procediendo con la apuesta...',
          'SUCCESS',
        );
        await placeBetOnElement(foundBet.element, betData.amount);
      } else {
        logWithTimestamp(
          `❌ Cuota insuficiente: ${foundBet.odds} < ${betData.targetOdds}`,
          'ERROR',
        );
        chrome.runtime.sendMessage({
          action: 'betResult',
          success: false,
          error: `Cuota insuficiente: ${foundBet.odds} < ${betData.targetOdds}`,
          messageId: betData.messageId,
        });
      }
    } else {
      logWithTimestamp('❌ Apuesta no encontrada en la página', 'ERROR');
      chrome.runtime.sendMessage({
        action: 'betResult',
        success: false,
        error: 'Apuesta específica no encontrada',
        messageId: betData.messageId,
      });
    }
  } catch (error) {
    throw new Error(`Error en página de evento: ${error.message}`);
  }
}

// Navegar automáticamente a la sección correcta (actualizado para expansión)
async function navigateToCorrectSection(pick) {
  try {
    logWithTimestamp(
      `🧭 Determinando sección correcta para: "${pick}"`,
      'INFO',
    );

    // Detectar tipo de apuesta basado en el pick
    const sectionMap = detectBetSection(pick);

    logWithTimestamp(
      `🎯 Sección objetivo: "${sectionMap.section}" (${sectionMap.keywords.join(
        ', ',
      )})`,
      'INFO',
    );

    // Buscar y hacer click en la pestaña correcta
    const success = await clickCorrectTab(sectionMap);

    if (success) {
      logWithTimestamp('✅ Navegación a sección completada', 'SUCCESS');
      await wait(3000); // Esperar a que carguen las apuestas de la sección

      // Intentar expandir las opciones si hay botón "Más selecciones"
      await expandAllOptions();

      // Cambiar vista a tabla si está disponible
      await switchToTableView();
    } else {
      logWithTimestamp(
        '⚠️ No se pudo navegar a sección específica, buscando en todas',
        'WARN',
      );

      // Intentar expandir opciones en la sección actual
      await expandAllOptions();
      await switchToTableView();
    }
  } catch (error) {
    logWithTimestamp(`⚠️ Error navegando a sección: ${error.message}`, 'WARN');
    // Continuar sin error, buscar en la sección actual
    await expandAllOptions();
    await switchToTableView();
  }
}

// Expandir todas las opciones disponibles
async function expandAllOptions() {
  try {
    logWithTimestamp(
      '🔍 Buscando botones "Más selecciones" para expandir...',
      'INFO',
    );

    // Buscar botones de expansión específicos
    const expandButtons = document.querySelectorAll(
      '.expand-button, [class*="expand"], .sc-ePamRd.eobNuT, .sc-hOpgDU',
    );

    logWithTimestamp(
      `📋 Encontrados ${expandButtons.length} posibles botones de expansión`,
      'INFO',
    );

    let expandedCount = 0;

    for (const button of expandButtons) {
      const buttonText = button.textContent?.trim().toLowerCase() || '';

      // Verificar si es un botón de "Más selecciones"
      if (
        buttonText.includes('más') ||
        buttonText.includes('more') ||
        buttonText.includes('selecciones') ||
        buttonText.includes('options')
      ) {
        logWithTimestamp(`✅ Expandiendo: "${buttonText}"`, 'SUCCESS');

        await humanClick(button);
        await wait(2000); // Esperar a que se expanda
        expandedCount++;
      }
    }

    if (expandedCount > 0) {
      logWithTimestamp(
        `✅ Se expandieron ${expandedCount} secciones`,
        'SUCCESS',
      );
    } else {
      logWithTimestamp('ℹ️ No se encontraron secciones para expandir', 'INFO');
    }
  } catch (error) {
    logWithTimestamp(`⚠️ Error expandiendo opciones: ${error.message}`, 'WARN');
  }
}

// Cambiar a vista de tabla si está disponible
async function switchToTableView() {
  try {
    logWithTimestamp('🔍 Buscando botón de vista de tabla...', 'INFO');

    // Buscar botones de cambio de vista (iconos de tabla/lista)
    const viewButtons = document.querySelectorAll(
      '.tabs-wrapper svg, [class*="tabs"] svg, [class*="view"] button, .sc-fDpJdc button',
    );

    for (const button of viewButtons) {
      const parent = button.closest('button, .sc-bXxnNr, [class*="tab"]');
      if (
        parent &&
        !parent.classList.contains('selected') &&
        !parent.classList.contains('active')
      ) {
        // Buscar el icono de tabla (rectángulos)
        const hasTableIcon =
          button.querySelector('rect') ||
          button.textContent?.includes('tabla') ||
          button.getAttribute('class')?.includes('table');

        if (hasTableIcon) {
          logWithTimestamp('✅ Cambiando a vista de tabla...', 'SUCCESS');
          await humanClick(parent);
          await wait(2000);
          break;
        }
      }
    }
  } catch (error) {
    logWithTimestamp(`⚠️ Error cambiando vista: ${error.message}`, 'WARN');
  }
}

// Detectar qué sección de apuestas necesitamos (actualizado para 3 tipos principales)
function detectBetSection(pick) {
  const pickLower = pick.toLowerCase();

  // Mapear los 3 tipos principales de apuesta deportiva a secciones de Winamax
  const sectionMapping = [
    // === TOTALS (Over/Under) ===
    {
      section: '1ª mitad - Número total de goles',
      keywords: [
        '1ª mitad',
        'primera mitad',
        'half time',
        'ht',
        'over',
        'under',
        'total',
      ],
      patterns: [
        /over.*\d+\.5.*first/i,
        /under.*\d+\.5.*first/i,
        /over.*\d+\.5.*1.*mitad/i,
        /over.*\d+\.5.*half/i,
      ],
      priority: 25,
      aliases: [
        '1ª mitad - Número total de goles',
        '1ª mitad - Total de goles',
        'Primera mitad - Total',
      ],
      type: 'TOTALS',
    },
    {
      section: 'Número total de goles',
      keywords: ['over', 'under', 'total', 'más', 'menos', 'número'],
      patterns: [
        /over\s+\d+\.5/i,
        /under\s+\d+\.5/i,
        /más de\s+\d+/i,
        /menos de\s+\d+/i,
        /total.*\d+/i,
      ],
      priority: 23,
      aliases: ['Total de goles', 'Número total de goles', 'Total de puntos'],
      type: 'TOTALS',
    },

    // === SPREADS (Handicaps) ===
    {
      section: '1ª mitad - Hándicap asiático',
      keywords: [
        '1ª mitad',
        'primera mitad',
        'half',
        'ht',
        'hándicap',
        'handicap',
        'spread',
      ],
      patterns: [
        /.*[+-]\d+\.5.*first/i,
        /.*[+-]\d+\.5.*half/i,
        /.*[+-]\d+\.5.*1.*mitad/i,
      ],
      priority: 22,
      aliases: [
        '1ª mitad - Hándicap asiático (handicap)',
        '1ª mitad - Handicap asiático',
      ],
      type: 'SPREADS',
    },
    {
      section: 'Hándicap asiático',
      keywords: ['hándicap', 'handicap', 'asiático', 'spread'],
      patterns: [/.*[+-]\d+\.5/i, /.*[+-]\d+$/i, /spread/i],
      priority: 20,
      aliases: ['Hándicap asiático (handicap)', 'Handicap asiático'],
      type: 'SPREADS',
    },
    {
      section: 'Diferencia de goles',
      keywords: ['diferencia', 'goles', 'margen', 'spread'],
      patterns: [/diferencia/i, /margen/i, /spread/i],
      priority: 18,
      aliases: ['Margen de victoria', 'Diferencia de goles'],
      type: 'SPREADS',
    },

    // === MONEYLINE (Resultado directo) ===
    {
      section: 'Resultado',
      keywords: ['resultado', 'ganador', 'winner', 'moneyline', '1x2'],
      patterns: [
        /ganador/i,
        /winner/i,
        /resultado/i,
        /moneyline/i,
        /^(1|x|2)$/,
      ],
      priority: 15,
      aliases: ['Resultado final', '1X2', 'Ganador del partido'],
      type: 'MONEYLINE',
    },

    // === OTROS TIPOS ===
    {
      section: 'Hándicap texto',
      keywords: ['hándicap', 'texto', 'al menos'],
      patterns: [/al menos/i, /gana por/i],
      priority: 12,
      aliases: ['Hándicap texto'],
      type: 'SPREADS',
    },
  ];

  // Calcular puntuaciones para cada sección
  let bestMatch = {
    section: 'Resultado', // Por defecto
    keywords: ['resultado'],
    score: 0,
    aliases: ['Resultado final'],
    type: 'MONEYLINE',
  };

  for (const mapping of sectionMapping) {
    let score = 0;

    // Puntos por palabras clave
    for (const keyword of mapping.keywords) {
      if (pickLower.includes(keyword)) {
        score += 3;
      }
    }

    // Puntos por patrones
    for (const pattern of mapping.patterns) {
      if (pattern.test(pick)) {
        score += mapping.priority;
      }
    }

    // === BONUS ESPECÍFICOS POR TIPO ===

    // TOTALS: Over/Under con números
    if (mapping.type === 'TOTALS') {
      if (
        pickLower.includes('over') ||
        pickLower.includes('under') ||
        pickLower.includes('más') ||
        pickLower.includes('menos')
      ) {
        score += 15;

        // Extra bonus para totales con decimales
        if (pick.match(/\d+\.5/)) {
          score += 10;
        }

        // Extra bonus para primera mitad
        if (
          pickLower.includes('first') ||
          pickLower.includes('half') ||
          pickLower.includes('mitad') ||
          pickLower.includes('ht')
        ) {
          score += 8;
        }
      }
    }

    // SPREADS: Handicaps con +/-
    if (mapping.type === 'SPREADS') {
      if (pick.match(/[+-]\d+\.?\d*/)) {
        score += 12;

        // Extra bonus para spreads con decimales (.5)
        if (pick.match(/[+-]\d+\.5/)) {
          score += 8;
        }

        // Extra bonus para primera mitad
        if (
          pickLower.includes('first') ||
          pickLower.includes('half') ||
          pickLower.includes('mitad')
        ) {
          score += 6;
        }
      }
    }

    // MONEYLINE: Nombres de equipos sin números
    if (mapping.type === 'MONEYLINE') {
      // Si no tiene números de spread o total, probablemente es moneyline
      if (
        !pick.match(/[+-]?\d+\.?\d*/) &&
        !pickLower.includes('over') &&
        !pickLower.includes('under') &&
        !pickLower.includes('total')
      ) {
        score += 10;
      }
    }

    if (score > bestMatch.score) {
      bestMatch = {
        section: mapping.section,
        keywords: mapping.keywords,
        score: score,
        aliases: mapping.aliases || [mapping.section],
        type: mapping.type,
      };
    }
  }

  logWithTimestamp(
    `🎯 Tipo detectado: ${bestMatch.type} → "${bestMatch.section}" (puntuación: ${bestMatch.score})`,
    'INFO',
  );

  return bestMatch;
}

// Hacer click en la pestaña correcta (mejorado para Winamax)
async function clickCorrectTab(sectionMap) {
  try {
    logWithTimestamp(`🖱️ Buscando pestaña: "${sectionMap.section}"`, 'INFO');

    // Buscar pestañas/filtros específicos de Winamax
    const filterButtons = document.querySelectorAll(
      '.filter-button, .sc-bJoeBu, [class*="filter"], [class*="tab"], [class*="section"]',
    );

    logWithTimestamp(
      `📋 Encontradas ${filterButtons.length} pestañas disponibles`,
      'INFO',
    );

    let bestMatch = null;
    let bestScore = 0;

    // Incluir aliases en la búsqueda
    const searchTerms = [
      sectionMap.section,
      ...(sectionMap.aliases || []),
      ...sectionMap.keywords,
    ];

    for (const button of filterButtons) {
      const buttonText = button.textContent?.trim().toLowerCase() || '';

      // Calcular similitud con la sección objetivo
      let score = 0;

      // Buscar coincidencias con términos de búsqueda
      for (const term of searchTerms) {
        const termLower = term.toLowerCase();

        // Coincidencia exacta (alta puntuación)
        if (buttonText === termLower) {
          score += 20;
        }
        // Contiene el término completo
        else if (buttonText.includes(termLower)) {
          score += 15;
        }
        // Coincidencias parciales de palabras
        else {
          const termWords = termLower.split(' ');
          const buttonWords = buttonText.split(' ');

          for (const termWord of termWords) {
            if (termWord.length > 3) {
              // Solo palabras significativas
              for (const buttonWord of buttonWords) {
                if (
                  buttonWord.includes(termWord) ||
                  termWord.includes(buttonWord)
                ) {
                  score += 5;
                }
              }
            }
          }
        }
      }

      // Logging para debug
      if (score > 0) {
        logWithTimestamp(
          `🎯 Candidato: "${buttonText}" (puntuación: ${score})`,
          'INFO',
        );
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = button;
      }
    }

    if (bestMatch && bestScore >= 5) {
      const tabText = bestMatch.textContent?.trim();
      logWithTimestamp(
        `✅ Haciendo click en pestaña: "${tabText}" (puntuación: ${bestScore})`,
        'SUCCESS',
      );

      await humanClick(bestMatch);
      await wait(3000); // Más tiempo para que cargue la sección

      return true;
    } else {
      logWithTimestamp('❌ No se encontró pestaña compatible', 'ERROR');

      // Listar todas las pestañas disponibles para debug
      logWithTimestamp('📋 Pestañas disponibles:', 'INFO');
      filterButtons.forEach((button, index) => {
        const text = button.textContent?.trim();
        if (text && text.length > 0) {
          logWithTimestamp(`  ${index + 1}. "${text}"`, 'INFO');
        }
      });

      return false;
    }
  } catch (error) {
    logWithTimestamp(
      `❌ Error haciendo click en pestaña: ${error.message}`,
      'ERROR',
    );
    return false;
  }
}

// Buscar apuesta específica en la página
async function searchForSpecificBet(betData) {
  try {
    logWithTimestamp(
      `🔍 Buscando: "${betData.pick}" con cuota mínima ${betData.targetOdds}`,
      'INFO',
    );

    arbitrageState.isSearching = true;

    // Estrategias de búsqueda múltiples (en orden de prioridad)
    const searchStrategies = [
      () => searchByExactText(betData.pick),
      () => searchBySpreadPattern(betData.pick),
      () => searchByTeamAndHandicap(betData.pick),
      () => searchByPartialText(betData.pick),
      () => searchInCurrentSection(betData.pick),
      () => searchByAlternativePatterns(betData.pick),
    ];

    for (let i = 0; i < searchStrategies.length; i++) {
      logWithTimestamp(
        `🔄 Estrategia de búsqueda ${i + 1}/${searchStrategies.length}...`,
        'INFO',
      );

      const result = await searchStrategies[i]();
      if (result && result.odds) {
        arbitrageState.isSearching = false;
        logWithTimestamp(
          `✅ Encontrado con estrategia ${i + 1}: ${result.method}`,
          'SUCCESS',
        );
        return result;
      }

      await wait(1000);
    }

    arbitrageState.isSearching = false;
    return null;
  } catch (error) {
    arbitrageState.isSearching = false;
    throw error;
  }
}

// Buscar en la sección actual específicamente
async function searchInCurrentSection(pick) {
  logWithTimestamp(
    `🎯 Búsqueda específica en sección actual: "${pick}"`,
    'INFO',
  );

  // Buscar elementos de apuesta visibles en la sección actual
  const betElements = document.querySelectorAll(
    'button[class*="odd"], button[class*="bet"], [class*="market"] button, [class*="selection"] button, .sc-iHbSHJ button',
  );

  logWithTimestamp(
    `🎲 Elementos de apuesta encontrados: ${betElements.length}`,
    'INFO',
  );

  const candidates = [];

  for (const element of betElements) {
    // Verificar si el elemento es visible y usable
    if (!isElementUsable(element)) continue;

    const elementText = element.textContent?.trim() || '';
    const parentText =
      element
        .closest(
          '[class*="market"], [class*="bet-group"], [class*="selection"]',
        )
        ?.textContent?.trim() || '';
    const contextText = `${elementText} ${parentText}`.toLowerCase();

    // Calcular similitud
    const similarity = calculateTextSimilarity(pick.toLowerCase(), contextText);

    if (similarity > 0.3) {
      // Umbral de similitud
      const odds = extractOddsFromElement(element);
      if (odds) {
        candidates.push({
          element: element,
          odds: odds,
          description: elementText,
          similarity: similarity,
          context: parentText,
          method: 'current_section',
        });
      }
    }
  }

  // Ordenar por similitud
  candidates.sort((a, b) => b.similarity - a.similarity);

  if (candidates.length > 0) {
    logWithTimestamp(
      `✅ ${
        candidates.length
      } candidatos en sección, mejor similitud: ${candidates[0].similarity.toFixed(
        2,
      )}`,
      'SUCCESS',
    );
    logWithTimestamp(
      `🎯 Mejor candidato: "${candidates[0].description}"`,
      'INFO',
    );
    return candidates[0];
  }

  return null;
}

// Calcular similitud entre textos
function calculateTextSimilarity(text1, text2) {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);

  let matches = 0;

  for (const word1 of words1) {
    if (word1.length > 2) {
      // Ignorar palabras muy cortas
      for (const word2 of words2) {
        if (word2.includes(word1) || word1.includes(word2)) {
          matches++;
          break;
        }
      }
    }
  }

  return matches / Math.max(words1.length, words2.length);
}

// Búsqueda por texto exacto
async function searchByExactText(pick) {
  logWithTimestamp(`🎯 Búsqueda exacta: "${pick}"`, 'INFO');

  const allButtons = document.querySelectorAll(
    'button, .bet-button, [class*="odd"], [class*="bet"]',
  );

  for (const button of allButtons) {
    const text = button.textContent?.trim() || '';
    const parent = button.closest(
      '[class*="bet"], [class*="odd"], [class*="market"]',
    );
    const context = parent?.textContent?.trim() || '';

    if (text.includes(pick) || context.includes(pick)) {
      const odds = extractOddsFromElement(button);
      if (odds) {
        return {
          element: button,
          odds: odds,
          description: text || context,
          method: 'exact_text',
        };
      }
    }
  }

  return null;
}

// Búsqueda por texto parcial
async function searchByPartialText(pick) {
  logWithTimestamp(`🎯 Búsqueda parcial: "${pick}"`, 'INFO');

  // Extraer palabras clave del pick
  const keywords = extractKeywords(pick);
  logWithTimestamp(`🔑 Palabras clave: ${keywords.join(', ')}`, 'INFO');

  const allElements = document.querySelectorAll('*');
  const candidates = [];

  for (const element of allElements) {
    const text = element.textContent?.trim() || '';
    if (text.length > 0 && text.length < 200) {
      // Evitar textos muy largos
      const matchCount = keywords.filter((keyword) =>
        text.toLowerCase().includes(keyword.toLowerCase()),
      ).length;

      if (matchCount >= 2) {
        // Al menos 2 palabras clave coinciden
        const odds = extractOddsFromElement(element);
        if (odds) {
          candidates.push({
            element: element,
            odds: odds,
            description: text,
            matchCount: matchCount,
            method: 'partial_text',
          });
        }
      }
    }
  }

  // Ordenar por número de coincidencias
  candidates.sort((a, b) => b.matchCount - a.matchCount);

  if (candidates.length > 0) {
    logWithTimestamp(
      `✅ ${candidates.length} candidatos encontrados, mejor: ${candidates[0].description}`,
      'SUCCESS',
    );
    return candidates[0];
  }

  return null;
}

// Búsqueda por patrones de spread/handicap
async function searchBySpreadPattern(pick) {
  logWithTimestamp(`🎯 Búsqueda por spread: "${pick}"`, 'INFO');

  // Extraer información del spread (ej: "CRYSTAL PALACE -0.5")
  const spreadMatch = pick.match(/(.+?)\s*([+-]?\d+\.?\d*)/);
  if (!spreadMatch) return null;

  const team = spreadMatch[1].trim();
  const spread = spreadMatch[2];

  logWithTimestamp(`🏈 Equipo: "${team}", Spread: "${spread}"`, 'INFO');

  // Buscar elementos que contengan el equipo y el spread
  const allElements = document.querySelectorAll('*');

  for (const element of allElements) {
    const text = element.textContent?.trim() || '';

    // Verificar si contiene el equipo y el spread
    const hasTeam = text.toLowerCase().includes(team.toLowerCase());
    const hasSpread = text.includes(spread);

    if (hasTeam && hasSpread) {
      const odds = extractOddsFromElement(element);
      if (odds) {
        return {
          element: element,
          odds: odds,
          description: text,
          method: 'spread_pattern',
        };
      }
    }
  }

  return null;
}

// Búsqueda por equipo y handicap separados
async function searchByTeamAndHandicap(pick) {
  logWithTimestamp(`🎯 Búsqueda por equipo + handicap: "${pick}"`, 'INFO');

  const spreadMatch = pick.match(/(.+?)\s*([+-]?\d+\.?\d*)/);
  if (!spreadMatch) return null;

  const team = spreadMatch[1].trim();
  const handicap = spreadMatch[2];

  // Buscar secciones que contengan el equipo
  const teamElements = Array.from(document.querySelectorAll('*')).filter((el) =>
    el.textContent?.toLowerCase().includes(team.toLowerCase()),
  );

  for (const teamElement of teamElements) {
    // Buscar handicaps cerca de este equipo
    const parent =
      teamElement.closest(
        '[class*="match"], [class*="event"], [class*="game"]',
      ) || teamElement.parentElement;
    if (parent) {
      const handicapElements = parent.querySelectorAll('*');
      for (const handicapEl of handicapElements) {
        const text = handicapEl.textContent?.trim() || '';
        if (text.includes(handicap)) {
          const odds = extractOddsFromElement(handicapEl);
          if (odds) {
            return {
              element: handicapEl,
              odds: odds,
              description: `${team} ${handicap}`,
              method: 'team_handicap',
            };
          }
        }
      }
    }
  }

  return null;
}

// Búsqueda por patrones alternativos
async function searchByAlternativePatterns(pick) {
  logWithTimestamp(`🎯 Búsqueda alternativa: "${pick}"`, 'INFO');

  // Probar variaciones del nombre del equipo
  const teamVariations = generateTeamVariations(pick);

  for (const variation of teamVariations) {
    const elements = document.querySelectorAll('*');
    for (const element of elements) {
      const text = element.textContent?.trim() || '';
      if (text.toLowerCase().includes(variation.toLowerCase())) {
        const odds = extractOddsFromElement(element);
        if (odds) {
          return {
            element: element,
            odds: odds,
            description: text,
            method: 'alternative_pattern',
          };
        }
      }
    }
  }

  return null;
}

// Extraer palabras clave del pick
function extractKeywords(pick) {
  const words = pick.split(/\s+/);
  return words.filter(
    (word) =>
      word.length > 2 &&
      !['THE', 'AND', 'OR', 'VS', 'V'].includes(word.toUpperCase()),
  );
}

// Generar variaciones del nombre del equipo
function generateTeamVariations(pick) {
  const team = pick.split(/\s*[+-]\d/)[0].trim(); // Extraer solo el nombre del equipo

  const variations = [
    team,
    team.toUpperCase(),
    team.toLowerCase(),
    team.replace(/\s+/g, ''), // Sin espacios
    team.replace(/\s+/g, '_'), // Con guiones bajos
    team.split(' ')[0], // Solo primera palabra
    team.split(' ').pop(), // Solo última palabra
  ];

  return [...new Set(variations)]; // Eliminar duplicados
}

// Extraer cuota de un elemento
function extractOddsFromElement(element) {
  // Buscar en el elemento y sus hijos inmediatos
  const texts = [
    element.textContent?.trim() || '',
    element.getAttribute('data-odds') || '',
    element.querySelector('[class*="odd"]')?.textContent?.trim() || '',
    element.querySelector('[class*="price"]')?.textContent?.trim() || '',
  ];

  for (const text of texts) {
    // Patrones para detectar cuotas
    const oddsPatterns = [
      /\b(\d+\.?\d{1,3})\b/g, // Formato decimal: 2.17, 1.95, etc.
      /\b(\d+)\s*\/\s*(\d+)\b/g, // Formato fraccionario: 5/4, 3/2, etc.
    ];

    for (const pattern of oddsPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          const odds = parseFloat(match);
          // Validar que sea una cuota realista (entre 1.01 y 100)
          if (odds >= 1.01 && odds <= 100) {
            return odds;
          }
        }
      }
    }
  }

  return null;
}

// Realizar apuesta en elemento específico
async function placeBetOnElement(element, amount) {
  try {
    logWithTimestamp('🎯 Realizando apuesta en elemento encontrado...', 'INFO');

    // Click en el elemento de la apuesta
    await humanClick(element);
    await wait(2000);

    // Buscar y rellenar campo de importe
    const stakeInput = await findElement(
      [
        'input.sc-gppfCo.fHJcOI',
        'input[inputmode="none"]',
        '.sc-wkolL input[type="text"]',
        '.sc-sddJj input',
        '[data-testid*="basket"] input[type="text"]',
        '[class*="basket"] input[type="text"]',
        '.sc-gyoxqN input[type="text"]',
        '.sc-kKQKPC input[type="text"]',
        'input[type="number"]',
      ],
      5000,
    );

    await humanType(stakeInput, amount.toString());
    await wait(1000);

    // Click en botón de apostar
    const placeBetButton = await findElement(
      [
        'button[data-testid="basket-submit-button"]',
        'button.sc-kAyceB.ireRZ',
        '.sc-erjLUo button',
        'button:contains("Apostar")',
        'button:contains("Parier")',
        'button[type="submit"]',
      ],
      5000,
    );

    await humanClick(placeBetButton);
    await wait(1500);

    logWithTimestamp(
      '✅ Apuesta de arbitraje completada exitosamente',
      'SUCCESS',
    );

    chrome.runtime.sendMessage({
      action: 'betResult',
      success: true,
      amount: amount,
      messageId: arbitrageState.currentBet?.messageId,
    });
  } catch (error) {
    throw new Error(`Error realizando apuesta: ${error.message}`);
  }
}

// Funciones de login híbrido (sin cambios - mantener las anteriores)
// ... [código de login anterior] ...

// Detectar el tipo de página de Winamax
function detectPageType() {
  const url = window.location.href.toLowerCase();
  const bodyText = document.body.textContent.toLowerCase();

  // Verificar si es página de login
  const hasLoginIframe = !!document.querySelector(
    'iframe[name="login"], iframe[id="iframe-login"]',
  );
  const hasLoginForm = !!document.querySelector(
    'form[action*="login"], form[data-node*="login"]',
  );
  const hasPasswordField = !!document.querySelector('input[type="password"]');
  const hasLoginText =
    bodyText.includes('login') ||
    bodyText.includes('conectar') ||
    bodyText.includes('iniciar');

  // Verificar si es página de evento específico
  const isEventPage =
    url.includes('/apuestas-deportivas/match/') || url.includes('/match/');

  // Verificar si es página de apuestas general
  const hasStakeInput = !!document.querySelector(
    'input[type="number"], input[inputmode="none"]',
  );
  const hasBetButton = !!document.querySelector(
    'button[data-testid="basket-submit-button"]',
  );
  const hasBetText =
    bodyText.includes('apostar') ||
    bodyText.includes('parier') ||
    bodyText.includes('bet');

  // Verificar si ya está logueado
  const hasUserElements = !!document.querySelector(
    '.user, .account, [class*="user"], [class*="account"], [data-test*="user"]',
  );
  const hasLogoutButton = !!document.querySelector(
    'a[href*="logout"], button[onclick*="logout"], [data-test*="logout"]',
  );
  const hasMainContent = !!document.querySelector(
    '.content, .main, [class*="content"], [class*="main"], .dashboard',
  );
  const hasNavigation = !!document.querySelector(
    'nav, .nav, .navigation, [class*="nav"]',
  );

  const isAlreadyLoggedIn =
    (hasUserElements || hasLogoutButton) && hasMainContent && hasNavigation;

  return {
    isLogin:
      hasLoginIframe || hasLoginForm || (hasPasswordField && hasLoginText),
    isBetting: hasStakeInput && (hasBetText || hasBetButton),
    isEventPage: isEventPage,
    isAlreadyLoggedIn: isAlreadyLoggedIn,
    hasLoginIframe: hasLoginIframe,
    url: url,
    details: {
      hasLoginIframe,
      hasLoginForm,
      hasPasswordField,
      hasLoginText,
      hasStakeInput,
      hasBetText,
      hasUserElements,
      hasLogoutButton,
      hasMainContent,
      hasNavigation,
      isEventPage,
    },
  };
}

// Funciones de utilidad (mantener las anteriores)
function findElement(selectors, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

    function check() {
      for (const selector of selectorArray) {
        let element;

        if (selector.includes(':contains(')) {
          const text = selector.match(/:contains\("([^"]+)"\)/)?.[1];
          if (text) {
            const xpath = `//button[contains(text(), "${text}")]`;
            const result = document.evaluate(
              xpath,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            );
            element = result.singleNodeValue;
          }
        } else {
          element = document.querySelector(selector);
        }

        if (element && isElementUsable(element)) {
          logWithTimestamp(`✅ Elemento encontrado: "${selector}"`, 'SUCCESS');
          resolve(element);
          return;
        }
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error(`Elements not found: ${selectorArray.join(', ')}`));
      } else {
        setTimeout(check, 300);
      }
    }

    check();
  });
}

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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanClick(element) {
  return new Promise(async (resolve) => {
    try {
      if (!element) {
        logWithTimestamp('❌ humanClick: elemento es null', 'ERROR');
        resolve(false);
        return;
      }

      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(300);

      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const events = [
        'mouseover',
        'mouseenter',
        'mousemove',
        'mousedown',
        'mouseup',
        'click',
      ];

      for (const eventType of events) {
        const event = new MouseEvent(eventType, {
          bubbles: true,
          clientX: centerX,
          clientY: centerY,
          button: 0,
        });
        element.dispatchEvent(event);
        await wait(25 + Math.random() * 25);
      }

      logWithTimestamp('✅ humanClick: completado exitosamente', 'SUCCESS');
      resolve(true);
    } catch (error) {
      logWithTimestamp(`❌ humanClick error: ${error.message}`, 'ERROR');
      resolve(false);
    }
  });
}

function humanType(element, text) {
  return new Promise(async (resolve) => {
    try {
      if (!element || !text) {
        logWithTimestamp('❌ humanType: elemento o texto inválido', 'ERROR');
        resolve(false);
        return;
      }

      logWithTimestamp(`🔤 humanType: escribiendo "${text}"`, 'INFO');

      element.focus();
      await wait(100);

      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(100);

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const keyCode = char.charCodeAt(0);

        element.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: char,
            keyCode: keyCode,
            bubbles: true,
          }),
        );

        element.value += char;
        element.dispatchEvent(new Event('input', { bubbles: true }));

        element.dispatchEvent(
          new KeyboardEvent('keyup', {
            key: char,
            keyCode: keyCode,
            bubbles: true,
          }),
        );

        await wait(30 + Math.random() * 40);
      }

      element.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(50);

      logWithTimestamp(
        `✅ humanType: completado. Valor: "${element.value}"`,
        'SUCCESS',
      );
      resolve(true);
    } catch (error) {
      logWithTimestamp(`❌ humanType error: ${error.message}`, 'ERROR');
      resolve(false);
    }
  });
}

function logWithTimestamp(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [WINAMAX-${level}] ${message}`;
  console.log(logMessage);

  try {
    chrome.runtime
      .sendMessage({
        action: 'detailedLog',
        message: logMessage,
        level: level,
        timestamp: timestamp,
      })
      .catch(() => {});
  } catch (error) {}
}

// Función de debug mejorada
function debugCurrentPage() {
  logWithTimestamp('🔍 === DEBUG DE PÁGINA ACTUAL ===', 'INFO');

  const pageType = detectPageType();
  logWithTimestamp(
    `📊 Análisis completo: ${JSON.stringify(pageType, null, 2)}`,
    'INFO',
  );

  if (arbitrageState.isSearching) {
    logWithTimestamp('🔍 Estado: Buscando apuesta específica...', 'INFO');
  }

  // Debug específico para páginas de evento
  if (pageType.isEventPage) {
    logWithTimestamp('⚽ Página de evento detectada', 'SUCCESS');

    // Debug de pestañas/secciones disponibles
    logWithTimestamp(
      '📋 Analizando pestañas de apuestas disponibles...',
      'INFO',
    );
    const filterButtons = document.querySelectorAll(
      '.filter-button, [class*="filter"], [class*="tab"], [class*="section"]',
    );

    logWithTimestamp(
      `🗂️ ${filterButtons.length} pestañas encontradas:`,
      'INFO',
    );
    filterButtons.forEach((button, index) => {
      const text = button.textContent?.trim();
      const isActive =
        button.classList.contains('active') ||
        button.classList.contains('selected') ||
        button.getAttribute('aria-selected') === 'true';
      if (text && text.length > 0) {
        logWithTimestamp(
          `  ${index + 1}. "${text}" ${isActive ? '(ACTIVA)' : ''}`,
          'INFO',
        );
      }
    });

    // Debug de elementos de apuesta en la sección actual
    const betElements = document.querySelectorAll(
      'button[class*="odd"], button[class*="bet"], [class*="market"] button, [class*="selection"] button',
    );
    logWithTimestamp(
      `🎯 ${betElements.length} elementos de apuesta en sección actual`,
      'INFO',
    );

    // Mostrar primeros 10 elementos de apuesta
    const visibleBets = Array.from(betElements)
      .filter((el) => isElementUsable(el))
      .slice(0, 10);

    logWithTimestamp(
      `🎲 Primeras ${visibleBets.length} apuestas visibles:`,
      'INFO',
    );
    visibleBets.forEach((bet, index) => {
      const text = bet.textContent?.trim();
      const odds = extractOddsFromElement(bet);
      if (text && text.length > 0) {
        logWithTimestamp(
          `  ${index + 1}. "${text.substring(0, 50)}..." ${
            odds ? `(${odds})` : ''
          }`,
          'INFO',
        );
      }
    });

    // Buscar equipos mencionados
    const bodyText = document.body.textContent;
    const teamMatches = bodyText.match(
      /[A-Z][A-Z\s]+(?=\s+(?:vs?\.?|v\.?|-))/g,
    );
    if (teamMatches) {
      logWithTimestamp(
        `🏈 Equipos detectados: ${teamMatches.slice(0, 5).join(', ')}`,
        'INFO',
      );
    }
  }

  logWithTimestamp('🔍 === FIN DEBUG ===', 'INFO');
}

// Escuchar mensajes del background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📩 Content script recibió mensaje:', message.action);

  try {
    switch (message.action) {
      case 'ping':
        console.log('🏓 Ping recibido, respondiendo...');
        sendResponse({ status: 'ready', url: window.location.href });
        break;

      case 'arbitrageBet':
        console.log('🎯 Iniciando apuesta de arbitraje...');
        arbitrageState.currentBet = message.betData;
        processArbitrageBet(message.betData);
        sendResponse({ received: true, action: 'arbitrageBet' });
        break;

      case 'manualBet':
        console.log('🎯 Iniciando proceso de apuesta manual...');
        performWinamaxManualBet(message.amount, message.messageId);
        sendResponse({ received: true, action: 'manualBet' });
        break;

      case 'debugPage':
        debugCurrentPage();
        sendResponse({ received: true });
        break;

      default:
        console.log('❓ Acción desconocida:', message.action);
        sendResponse({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('❌ Error en content script:', error);
    sendResponse({ error: error.message });
  }

  return true;
});

// Función de apuesta manual (mantener la versión que funcionó)
async function performWinamaxManualBet(amount, messageId) {
  try {
    logWithTimestamp(`🎯 Iniciando apuesta manual de ${amount}€...`, 'INFO');

    await wait(1000);

    const currentUrl = window.location.href.toLowerCase();
    if (!currentUrl.includes('winamax')) {
      throw new Error('URL incorrecta: Debes estar en Winamax');
    }

    const stakeInput = await findElement(
      [
        'input.sc-gppfCo.fHJcOI',
        'input[inputmode="none"]',
        '.sc-wkolL input[type="text"]',
        '.sc-sddJj input',
        '[data-testid*="basket"] input[type="text"]',
        '[class*="basket"] input[type="text"]',
        '.sc-gyoxqN input[type="text"]',
        '.sc-kKQKPC input[type="text"]',
        'input[type="number"]',
      ],
      8000,
    );

    await humanType(stakeInput, amount.toString());
    await wait(1000);

    const placeBetButton = await findElement(
      [
        'button[data-testid="basket-submit-button"]',
        'button.sc-kAyceB.ireRZ',
        '.sc-erjLUo button',
        'button:contains("Apostar")',
        'button:contains("Parier")',
        'button[type="submit"]',
      ],
      5000,
    );

    await humanClick(placeBetButton);
    await wait(1500);

    chrome.runtime.sendMessage({
      action: 'betResult',
      success: true,
      amount: amount,
      messageId: messageId,
    });

    logWithTimestamp(`✅ Apuesta manual de ${amount}€ completada`, 'SUCCESS');
  } catch (error) {
    logWithTimestamp(`❌ Error en apuesta manual: ${error.message}`, 'ERROR');

    chrome.runtime.sendMessage({
      action: 'betResult',
      success: false,
      amount: amount,
      messageId: messageId,
      error: error.message,
    });
  }
}
