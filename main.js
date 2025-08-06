
    let preguntas = [],
        preguntasFiltradas = [],
        preguntaActual = 0,
        aciertos = 0,
        totalRespondidas = 0;
    let quizActivo = false;
    let historialTests = {};
    let temasSeleccionados = [];
    
    // Cloud storage variables
    let currentUserId = null;
    let cloudConnected = false;
    let syncInterval = null;
    const API_BASE = 'https://api.jsonbin.io/v3';
    const API_KEY = '$2a$10$qlkYxA87hxHkgvd.ttxT6.p1RWi2f7LHfNboODExO/Sm0k.QrlF76'; // API key pública para demo

    // Cloud Storage Functions
    window.generarNuevoId = function () {
      const newId = 'quiz_' + Math.random().toString(36).substr(2) + Date.now().toString(36);
      document.getElementById('userIdInput').value = newId;
      showNotification(`🆔 Nuevo ID generado: ${newId}`, 'success');
    }

   // Variables globales (mantener las existentes)
let cloudSyncing = false; // Prevenir múltiples sincronizaciones simultáneas

// Función corregida para conectar a la nube
async function conectarNube() {
  if (cloudSyncing) {
    console.log('Sincronización ya en progreso, cancelando...');
    return;
  }

  const userIdInput = document.getElementById('userIdInput');
  let userId = userIdInput.value.trim();
  
  if (!userId) {
    userId = 'quiz_' + Math.random().toString(36).substr(2) + Date.now().toString(36);
    userIdInput.value = userId;
  }
  
  cloudSyncing = true;
  updateCloudStatus('syncing', '🔄 Conectando...');
  
  try {
    // PASO 1: Intentar cargar datos desde la nube
    console.log(`Intentando conectar con usuario: ${userId}`);
    const cloudData = await cargarDesdeNube(userId);
    
    currentUserId = userId;
    localStorage.setItem('quizUserId', userId);
    
    // PASO 2: Determinar qué datos usar
    if (cloudData && cloudData.preguntas && cloudData.preguntas.length > 0) {
      // HAY DATOS EN LA NUBE
      console.log(`Datos encontrados en la nube: ${cloudData.preguntas.length} preguntas`);
      
      // Comparar timestamps si hay datos locales
      const localData = localStorage.getItem('quizData');
      let useCloudData = true;
      
      if (localData) {
        const localParsed = JSON.parse(localData);
        const localTimestamp = localParsed.timestamp || 0;
        const cloudTimestamp = cloudData.timestamp || 0;
        
        console.log(`Timestamp local: ${localTimestamp}, nube: ${cloudTimestamp}`);
        
        if (localTimestamp > cloudTimestamp && localParsed.preguntas.length > 0) {
          useCloudData = false;
          console.log('Datos locales más recientes, se usarán los locales');
        }
      }
      
      if (useCloudData) {
        // Usar datos de la nube
        preguntas = cloudData.preguntas || [];
        historialTests = cloudData.historialTests || {};
        showNotification('☁️ Datos cargados desde la nube', 'success');
      } else {
        // Subir datos locales más recientes
        await guardarEnNube();
        showNotification('☁️ Conectado - Datos locales más recientes subidos', 'success');
      }
      
    } else {
      // NO HAY DATOS EN LA NUBE
      console.log('No hay datos en la nube');
      
      // Verificar si hay datos locales para subir
      const localData = localStorage.getItem('quizData');
      if (localData && preguntas.length > 0) {
        console.log(`Subiendo ${preguntas.length} preguntas locales a la nube`);
        await guardarEnNube();
        showNotification('☁️ Conectado - Datos locales subidos a la nube', 'success');
      } else {
        showNotification('☁️ Conectado - Perfil nuevo creado', 'success');
      }
    }
    
    // PASO 3: Finalizar conexión
    cloudConnected = true;
    updateCloudStatus('connected', '☁️ Conectado');
    document.getElementById('userIdDisplay').textContent = userId;
    
    const syncButton = document.getElementById('syncButton');
    if (syncButton) syncButton.disabled = false;
    
    // Actualizar UI
    mostrarTemasUnicos();
    updateStorageIndicator();
    
    // Iniciar sincronización automática
    //iniciarSincronizacionAutomatica();
    
  } catch (error) {
    console.error('Error al conectar con la nube:', error);
    cloudConnected = false;
    updateCloudStatus('disconnected', '❌ Error de conexión');
    showNotification('❌ Error al conectar con la nube: ' + error.message, 'error');
  } finally {
    cloudSyncing = false;
  }
}
  
// Función mejorada para cargar desde la nube
window.cargarDesdeNube = async function (userId) {
  try {
    const binId = localStorage.getItem(`binId_${userId}`);
    
    if (!binId || binId === 'undefined' || binId === 'null') {
      console.log('No hay binId válido para este usuario');
      return null;
    }

    const url = `${API_BASE}/b/${binId}/latest`;
    console.log(`Cargando desde: ${url}`);

    const response = await fetch(url, {
      headers: {
        'X-Master-Key': API_KEY
      }
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`Datos cargados desde la nube: ${result.record.preguntas?.length || 0} preguntas`);
      return result.record;
    } else {
      console.log(`Error al cargar: ${response.status}`);
      if (response.status === 404) {
        // Bin no existe, limpiar referencia
        localStorage.removeItem(`binId_${userId}`);
      }
      return null;
    }

  } catch (error) {
    console.error('Error al cargar desde la nube:', error);
    return null;
  }
}

// Función corregida para guardar en la nube
window.guardarEnNube = async function () {
  if (!currentUserId || !cloudConnected) {
    console.log('No se puede guardar: usuario no conectado');
    return false;
  }

  if (cloudSyncing) {
    console.log('Sincronización en progreso, saltando guardado...');
    return false;
  }

  try {
    const datosCompletos = {
      preguntas: preguntas,
      historialTests: historialTests,
      timestamp: Date.now(),
      userId: currentUserId
    };

    console.log(`Guardando en la nube: ${preguntas.length} preguntas`);

    let binId = localStorage.getItem(`binId_${currentUserId}`);
    let response;

    if (binId && binId !== 'undefined' && binId !== 'null') {
      // Intentar actualizar bin existente
      console.log(`Actualizando bin existente: ${binId}`);
      response = await fetch(`${API_BASE}/b/${binId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': API_KEY
        },
        body: JSON.stringify(datosCompletos)
      });

      if (!response.ok) {
        console.log(`Error al actualizar bin (${response.status}), creando nuevo...`);
        binId = null;
      }
    }

    // Crear nuevo bin si es necesario
    if (!binId || binId === 'undefined' || binId === 'null') {
      console.log('Creando nuevo bin...');
      response = await fetch(`${API_BASE}/b`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': API_KEY
        },
        body: JSON.stringify(datosCompletos)
      });

      if (response.ok) {
        const result = await response.json();
        binId = result.metadata.id;
        localStorage.setItem(`binId_${currentUserId}`, binId);
        console.log(`Nuevo bin creado: ${binId}`);
      }
    }

    if (response.ok) {
      console.log('Datos guardados correctamente en la nube');
      updateStorageIndicator();
      return true;
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

  } catch (error) {
    console.error('Error al guardar en la nube:', error);
    showNotification('⚠️ Error al sincronizar con la nube', 'warning');
    return false;
  }
}


// Función de sincronización mejorada
window.sincronizarDatos = async function () {
  if (!cloudConnected || !currentUserId) {
    showNotification('❌ No estás conectado a la nube', 'error');
    return;
  }
  
  if (cloudSyncing) {
    console.log('Sincronización ya en progreso...');
    return;
  }
  
  cloudSyncing = true;
  updateCloudStatus('syncing', '🔄 Sincronizando...');
  
  try {
    // Cargar datos desde la nube
    const cloudData = await cargarDesdeNube(currentUserId);
    
    if (cloudData && cloudData.preguntas) {
      // Comparar timestamps
      const localTimestamp = parseInt(localStorage.getItem('lastLocalUpdate') || '0');
      const cloudTimestamp = cloudData.timestamp || 0;
      
      console.log(`Sync - Local: ${localTimestamp}, Nube: ${cloudTimestamp}`);
      
      if (cloudTimestamp > localTimestamp) {
        // Datos de la nube son más recientes
        preguntas = cloudData.preguntas || [];
        historialTests = cloudData.historialTests || {};
        mostrarTemasUnicos();
        updateStorageIndicator();
        showNotification('📥 Datos actualizados desde la nube', 'success');
      } else {
        // Datos locales son más recientes o iguales
        await guardarEnNube();
        showNotification('📤 Datos enviados a la nube', 'success');
      }
    } else {
      // No hay datos en la nube, subir los locales
      await guardarEnNube();
      showNotification('📤 Datos guardados en la nube', 'success');
    }
    
    updateCloudStatus('connected', '☁️ Conectado');
    
  } catch (error) {
    console.error('Error en sincronización:', error);
    updateCloudStatus('disconnected', '❌ Error');
    showNotification('❌ Error al sincronizar', 'error');
  } finally {
    cloudSyncing = false;
  }
}


    // Función corregida para generar BinID consistente
window.generateBinId = function (userId) {
  // Crear un hash más estable y consistente
  const str = `quiz-${userId}`;
  let hash = 0;
  
  // Algoritmo de hash más robusto
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convertir a positivo y generar ID hexadecimal de exactamente 24 caracteres
  const positiveHash = Math.abs(hash);
  let binId = positiveHash.toString(16);
  
  // Rellenar con ceros hasta tener 24 caracteres
  while (binId.length < 24) {
    binId = '0' + binId;
  }
  
  // Si es más largo de 24, truncar
  binId = binId.substring(0, 24);
  
  console.log(`Generated bin ID for userId "${userId}": ${binId}`);
  return binId;
}

    function updateCloudStatus(status, text) {
      const cloudStatus = document.getElementById('cloudStatus');
      const cloudStatusText = document.getElementById('cloudStatusText');
      
      cloudStatus.className = `cloud-status ${status}`;
      cloudStatusText.textContent = text;
    }

    // Función para verificar si una pregunta ya existe
    function preguntaExiste(nuevaPregunta) {
      return preguntas.some(p => 
        p.tema === nuevaPregunta.tema && 
        p.pregunta === nuevaPregunta.pregunta &&
        JSON.stringify(p.opciones) === JSON.stringify(nuevaPregunta.opciones)
      );
    }

    // Sistema de almacenamiento mejorado con soporte para nube
    window.guardarDatos = async function () {
      const datosCompletos = {
        preguntas: preguntas,
        historialTests: historialTests,
        timestamp: Date.now()
      };

      // Guardar localmente primero
      try {
        localStorage.setItem('quizData', JSON.stringify(datosCompletos));
        localStorage.setItem('lastLocalUpdate', Date.now().toString());
        console.log('Datos guardados localmente.');
      } catch (e) {
        console.error('Error al guardar localmente:', e);
      }

      // Guardar en la nube si está conectado
      if (cloudConnected) {
        await guardarEnNube();
      }

      updateStorageIndicator();
    }

    function cargarPreguntasGuardadas() {
      let loaded = false;

      try {
        const storedData = localStorage.getItem('quizData');
        if (storedData) {
          const data = JSON.parse(storedData);
          if (data && data.preguntas && data.preguntas.length > 0) {
            preguntas = data.preguntas;
            historialTests = data.historialTests || {};
            loaded = true;
          }
        }
      } catch (e) {
        console.error('Error al cargar datos locales:', e);
      }

      if (loaded) {
        mostrarTemasUnicos();
        updateStorageIndicator();
        console.log(`${preguntas.length} preguntas cargadas localmente`);
      }

      // Intentar cargar ID de usuario guardado
      const savedUserId = localStorage.getItem('quizUserId');
      if (savedUserId) {
        document.getElementById('userIdInput').value = savedUserId;
        document.getElementById('userIdDisplay').textContent = savedUserId;
      }

      return loaded;
    }

    // Función para determinar el estado de un tema
    function obtenerEstadoTema(tema) {
      const historial = historialTests[tema];
      if (!historial || historial.length === 0) {
        return 'neutral';
      }

      const ultimoTest = historial[historial.length - 1];
      const fechaUltimoTest = new Date(ultimoTest.fecha);
      const ahora = new Date();
      const diasTranscurridos = Math.floor((ahora - fechaUltimoTest) / (1000 * 60 * 60 * 24));

      const notaMedia = historial.reduce((sum, test) => sum + test.nota, 0) / historial.length;

      if (diasTranscurridos > 6 || notaMedia < 7) {
        return 'rojo';
      } else {
        return 'verde';
      }
    }

    function mostrarTemasUnicos() {
      const temas = [...new Set(preguntas.map(p => p.tema))].sort();
      const select = document.getElementById('temaSelect');
      
      select.innerHTML = temas.map(tema => {
        const estado = obtenerEstadoTema(tema);
        const historial = historialTests[tema];
        
        let claseCSS = 'p-2 ';
        let emoji = '';
        let infoAdicional = '';
        
        switch(estado) {
          case 'verde':
            claseCSS += 'tema-option-verde';
            emoji = '✅ ';
            if (historial && historial.length > 0) {
              const notaMedia = (historial.reduce((sum, test) => sum + test.nota, 0) / historial.length).toFixed(1);
              infoAdicional = ` (${notaMedia}/10)`;
            }
            break;
          case 'rojo':
            claseCSS += 'tema-option-rojo';
            emoji = '⚠️ ';
            if (historial && historial.length > 0) {
              const notaMedia = (historial.reduce((sum, test) => sum + test.nota, 0) / historial.length).toFixed(1);
              const ultimoTest = historial[historial.length - 1];
              const diasDesdeUltimo = Math.floor((new Date() - new Date(ultimoTest.fecha)) / (1000 * 60 * 60 * 24));
              infoAdicional = ` (${notaMedia}/10, ${diasDesdeUltimo}d)`;
            }
            break;    
          default:
            claseCSS += 'tema-option-neutral';
            emoji = '➖ ';
            infoAdicional = ' (Sin evaluar)';
        }
        
        return `<option value="${tema}" class="${claseCSS}">${emoji}${tema}${infoAdicional}</option>`;
      }).join('');

      console.log('Temas únicos encontrados:', temas);
    }

    // Función para guardar el resultado de un test
    async function guardarResultadoTest(temasUsados, nota) {
      const fecha = new Date().toISOString();
      
      temasUsados.forEach(tema => {
        if (!historialTests[tema]) {
          historialTests[tema] = [];
        }
        
        historialTests[tema].push({
          fecha: fecha,
          nota: parseFloat(nota),
          totalPreguntas: preguntasFiltradas.filter(p => p.tema === tema).length
        });
      });
      
      await guardarDatos();
      mostrarTemasUnicos();
    }

    function exportarPreguntas() {
      if (preguntas.length === 0) {
        showNotification('❌ No hay preguntas para exportar', 'warning');
        return;
      }

      let csvContent = 'Tema,Pregunta,Opcion1,Opcion2,Opcion3,Opcion4,RespuestaCorrecta\n';
      preguntas.forEach(p => {
        const row = [
          `"${p.tema}"`,
          `"${p.pregunta}"`,
          `"${p.opciones[0]}"`,
          `"${p.opciones[1]}"`,
          `"${p.opciones[2]}"`,
          `"${p.opciones[3]}"`,
          p.correcta + 1
        ].join(',');
        csvContent += row + '\n';
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `quiz_questions_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();

      showNotification('📤 Preguntas exportadas correctamente', 'success');
    }

    async function limpiarDatos() {
      preguntas = [];
      preguntasFiltradas = [];
      historialTests = {};

      localStorage.removeItem('quizData');
      localStorage.removeItem('lastLocalUpdate');

      // También limpiar de la nube si está conectado
      if (cloudConnected && currentUserId) {
        await guardarEnNube();
        showNotification('🗑️ Datos eliminados localmente y en la nube', 'info');
      } else {
        showNotification('🗑️ Datos eliminados localmente', 'info');
      }

      document.getElementById('temaSelect').innerHTML = '';
      document.getElementById('quiz').classList.add('hidden');
      updateStorageIndicator();
    }

    function updateStorageIndicator() {
      const indicator = document.getElementById('storageIndicator');
      const status = document.getElementById('storageStatus');

      if (preguntas.length > 0) {
        const temas = [...new Set(preguntas.map(p => p.tema))];
        const testsRealizados = Object.keys(historialTests).reduce((sum, tema) => sum + historialTests[tema].length, 0);
        
        let statusText = `💾 ${preguntas.length} preguntas, ${temas.length} temas, ${testsRealizados} tests`;
        if (cloudConnected) {
          statusText += ' ☁️';
        }
        
        status.textContent = statusText;
        indicator.classList.add('active');
      } else {
        status.textContent = '💾 Sin datos guardados';
        indicator.classList.remove('active');
      }
    }

    function parseCSVLine(text) {
      const result = [];
      let current = "";
      let insideQuotes = false;

      for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '"' && (i === 0 || text[i - 1] !== '\\')) {
          insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
          result.push(current.trim().replace(/^"|"$/g, ''));
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^"|"$/g, ''));

      return result;
    }

    async function handleFile(event) {
      const files = Array.from(event.target.files);
      if (files.length === 0) return;

      console.log('Processing', files.length, 'files');

      let processedFiles = 0;
      let totalNewQuestions = 0;
      let duplicatesSkipped = 0;

      files.forEach(file => {
        const reader = new FileReader();
        const tema = file.name.replace(/\.[^/.]+$/, "");

        reader.onload = async e => {
          try {
            const content = e.target.result;
            console.log(`Processing file: ${file.name} as tema: ${tema}`);

            const lines = content.split(/\r?\n/).filter(line => line.trim());
            console.log(`Lines found in ${file.name}:`, lines.length);

            let newQuestions = 0;
            let skippedHeader = false;

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;

              if (!skippedHeader && (
                line.toLowerCase().includes('tema') ||
                line.toLowerCase().includes('pregunta') ||
                line.toLowerCase().includes('question')
              )) {
                console.log(`Skipping header in ${file.name}`);
                skippedHeader = true;
                continue;
              }
              skippedHeader = true;

              const parts = parseCSVLine(line);

              let preguntaText, opciones, correctaStr;

              if (parts.length >= 7) {
                preguntaText = parts[1].trim();
                opciones = [parts[2], parts[3], parts[4], parts[5]].map(op => op.trim());
                correctaStr = parts[6].trim();
              } else if (parts.length >= 6) {
                preguntaText = parts[0].trim();
                opciones = [parts[1], parts[2], parts[3], parts[4]].map(op => op.trim());
                correctaStr = parts[5].trim();
              } else {
                console.log(`Line ${i + 1} in ${file.name}: Not enough columns (${parts.length})`);
                continue;
              }

              if (!preguntaText) {
                console.log(`Line ${i + 1} in ${file.name}: Missing pregunta`);
                continue;
              }

              if (opciones.some(op => !op)) {
                console.log(`Line ${i + 1} in ${file.name}: Some options are empty`);
                continue;
              }

              const correctaNum = parseInt(correctaStr);
              if (isNaN(correctaNum) || correctaNum < 1 || correctaNum > 4) {
                console.log(`Line ${i + 1} in ${file.name}: Invalid answer number: ${correctaStr}`);
                continue;
              }

              const preguntaObj = {
                tema: tema,
                pregunta: preguntaText,
                opciones: opciones,
                correcta: correctaNum - 1
              };

              if (preguntaExiste(preguntaObj)) {
                console.log(`Duplicate question skipped: ${preguntaText}`);
                duplicatesSkipped++;
                continue;
              }

              preguntas.push(preguntaObj);
              newQuestions++;
            }

            console.log(`Added ${newQuestions} questions from ${file.name}`);
            totalNewQuestions += newQuestions;
            processedFiles++;

            if (processedFiles === files.length) {
              console.log(`Total new questions added: ${totalNewQuestions}`);
              console.log(`Duplicates skipped: ${duplicatesSkipped}`);

              if (totalNewQuestions === 0) {
                if (duplicatesSkipped > 0) {
                  showNotification(`⚠️ ${duplicatesSkipped} preguntas duplicadas fueron omitidas. No se agregaron preguntas nuevas.`, 'warning');
                } else {
                  showNotification('❌ No se encontraron preguntas válidas en los archivos. Revisa el formato del CSV.', 'error');
                }
                return;
              }

              await guardarDatos();
              mostrarTemasUnicos();
              document.getElementById('quiz').classList.add('hidden');

              let message = `✅ ${totalNewQuestions} preguntas cargadas desde ${processedFiles} archivos`;
              if (duplicatesSkipped > 0) {
                message += ` (${duplicatesSkipped} duplicadas omitidas)`;
              }
              showNotification(message, 'success');
            }

          } catch (error) {
            console.error(`Error processing file ${file.name}:`, error);
            processedFiles++;
            if (processedFiles === files.length) {
              showNotification('❌ Error al procesar algunos archivos', 'error');
            }
          }
        };

        reader.readAsText(file, 'UTF-8');
      });
    }

    function aplicarFiltroTemas() {
      const seleccionados = Array.from(document.getElementById('temaSelect').selectedOptions).map(o => o.value);
      if (seleccionados.length === 0) {
        showNotification('⚠️ Selecciona al menos un tema', 'warning');
        return;
      }
      
      temasSeleccionados = seleccionados;
      preguntasFiltradas = preguntas.filter(p => seleccionados.includes(p.tema));
      
      if (preguntasFiltradas.length === 0) {
        showNotification('⚠️ No hay preguntas para los temas seleccionados', 'warning');
        return;
      }
      iniciarQuiz();
    }

    function iniciarQuiz() {
      preguntaActual = 0;
      aciertos = 0;
      totalRespondidas = 0;
      quizActivo = true;
      preguntasFiltradas = preguntasFiltradas.sort(() => Math.random() - 0.5);
      document.getElementById('quiz').classList.remove('hidden');
      document.getElementById('quiz').scrollIntoView({ behavior: 'smooth' });
      document.getElementById('siguiente').disabled = true;
      mostrarPregunta();
      showNotification('🎉 ¡Quiz iniciado! ¡Buena suerte!', 'success');
    }

    function mostrarPregunta() {
      if (!quizActivo) return;

      const p = preguntasFiltradas[preguntaActual];
      document.getElementById('pregunta').textContent = p.pregunta;

      const opcionesContainer = document.getElementById('opciones');
      opcionesContainer.innerHTML = p.opciones.map((op, i) => `
        <label class="option-card flex items-center p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-all">
          <input type="radio" name="opcion" value="${i}" class="mr-4 w-5 h-5 text-blue-600">
          <span class="text-lg">${op}</span>
        </label>`).join('');

      document.querySelectorAll('input[name="opcion"]').forEach(radio => {
        radio.addEventListener('change', handleAnswerSelection);
      });

      document.getElementById('siguiente').disabled = true;
      document.querySelectorAll('input[name="opcion"]').forEach(r => {
        r.disabled = false;
        r.parentElement.classList.remove('bg-green-100', 'border-2', 'border-green-500', 'bg-red-100', 'border-red-500');
        r.parentElement.classList.add('bg-gray-50');
      });

      actualizarEstadisticas();
      console.log('Mostrando pregunta', preguntaActual + 1, 'de', preguntasFiltradas.length);

      setTimeout(() => {
        document.querySelectorAll('.option-card').forEach((card, index) => {
          card.style.animationDelay = `${index * 0.1}s`;
          card.classList.add('fade-in');
        });
      }, 100);
    }

    function handleAnswerSelection(event) {
      if (!quizActivo) return;

      const seleccionada = event.target;
      const valor = parseInt(seleccionada.value);
      const correcta = preguntasFiltradas[preguntaActual].correcta;

      if (!seleccionada.dataset.answered) {
        totalRespondidas++;
        seleccionada.dataset.answered = true;
      }

      console.log('Total respondidas:', totalRespondidas);
      console.log('Valor seleccionado:', valor, 'Correcta:', correcta);

      document.querySelectorAll('input[name="opcion"]').forEach(r => r.disabled = true);

      if (valor === correcta) {
        aciertos++;
        console.log('¡Correcto! Aciertos:', aciertos);
        seleccionada.parentElement.classList.add('bg-green-100', 'border-2', 'border-green-500');
        seleccionada.parentElement.classList.remove('bg-gray-50', 'hover:bg-gray-100');
        showNotification('🎉 ¡Correcto!', 'success');
      } else {
        console.log('Incorrecto. Aciertos:', aciertos);
        seleccionada.parentElement.classList.add('bg-red-100', 'border-2', 'border-red-500');
        seleccionada.parentElement.classList.remove('bg-gray-50', 'hover:bg-gray-100');
        const correctOption = document.querySelector(`input[value='${correcta}']`);
        if (correctOption) {
          correctOption.parentElement.classList.add('bg-green-100', 'border-2', 'border-green-500');
          correctOption.parentElement.classList.remove('bg-gray-50', 'hover:bg-gray-100');
        }
        showNotification('❌ Incorrecto', 'error');
      }

      document.getElementById('siguiente').disabled = false;
      actualizarEstadisticas();
    }

    async function siguientePregunta() {
      if (!quizActivo) return;

      preguntaActual++;
      if (preguntaActual < preguntasFiltradas.length) {
        document.querySelectorAll('input[name="opcion"]').forEach(radio => {
          delete radio.dataset.answered;
        });
        mostrarPregunta();
        document.getElementById('siguiente').disabled = true;
      } else {
        quizActivo = false;
        const notaFinal = totalRespondidas > 0 ? (aciertos / totalRespondidas * 10).toFixed(1) : 0;
        
        await guardarResultadoTest(temasSeleccionados, notaFinal);
        
        showNotification(`🎉 Quiz completado! Nota: ${notaFinal}/10`, 'success');
        document.getElementById('quiz').classList.add('hidden');
      }
    }

    function actualizarEstadisticas() {
      const preguntasContestadasSpan = document.getElementById('preguntasContestadas');
      const respuestasCorrectasSpan = document.getElementById('respuestasCorrectas');
      const porcentajeAciertosSpan = document.getElementById('porcentajeAciertos');

      preguntasContestadasSpan.textContent = totalRespondidas;
      respuestasCorrectasSpan.textContent = aciertos;
      const percent = totalRespondidas > 0 ? (aciertos / totalRespondidas * 100).toFixed(1) : 0;
      porcentajeAciertosSpan.textContent = `${percent}%`;
    }

    function verHistorial() {
      const modal = document.getElementById('historialModal');
      const content = document.getElementById('historialContent');
      
      if (Object.keys(historialTests).length === 0) {
        showNotification('📊 No hay historial de tests disponible', 'info');
        return;
      }
      
      let html = '';
      
      Object.keys(historialTests).sort().forEach(tema => {
        const tests = historialTests[tema];
        const notaMedia = (tests.reduce((sum, test) => sum + test.nota, 0) / tests.length).toFixed(1);
        const ultimoTest = tests[tests.length - 1];
        const fechaUltimo = new Date(ultimoTest.fecha).toLocaleDateString('es-ES');
        const diasDesdeUltimo = Math.floor((new Date() - new Date(ultimoTest.fecha)) / (1000 * 60 * 60 * 24));
        
        const estado = obtenerEstadoTema(tema);
        const colorClase = estado === 'verde' ? 'text-green-600' : estado === 'rojo' ? 'text-red-600' : 'text-gray-600';
        const estadoTexto = estado === 'verde' ? '✅ Bien preparado' : estado === 'rojo' ? '⚠️ Necesita repaso' : '➖ Sin evaluar';
        
        html += `
          <div class="mb-6 p-4 border rounded-lg ${estado === 'verde' ? 'bg-green-50 border-green-200' : estado === 'rojo' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}">
            <div class="flex justify-between items-start mb-3">
              <h4 class="text-lg font-semibold text-gray-800">${tema}</h4>
              <span class="${colorClase} font-medium">${estadoTexto}</span>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
              <div class="text-center p-2 bg-white rounded">
                <div class="text-2xl font-bold text-blue-600">${notaMedia}</div>
                <div class="text-sm text-gray-600">Nota Media</div>
              </div>
              <div class="text-center p-2 bg-white rounded">
                <div class="text-2xl font-bold text-purple-600">${tests.length}</div>
                <div class="text-sm text-gray-600">Tests Realizados</div>
              </div>
              <div class="text-center p-2 bg-white rounded">
                <div class="text-2xl font-bold text-orange-600">${diasDesdeUltimo}</div>
                <div class="text-sm text-gray-600">Días desde último</div>
              </div>
            </div>
            
            <div class="text-sm text-gray-600">
              <strong>Último test:</strong> ${fechaUltimo} - Nota: ${ultimoTest.nota}/10
            </div>
            
            <div class="mt-3">
              <div class="text-sm font-medium text-gray-700 mb-2">Historial de notas:</div>
              <div class="flex flex-wrap gap-1">
                ${tests.map(test => {
                  const fecha = new Date(test.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
                  const colorNota = test.nota >= 7 ? 'bg-green-100 text-green-800' : test.nota >= 5 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
                  return `<span class="px-2 py-1 rounded text-xs ${colorNota}">${fecha}: ${test.nota}</span>`;
                }).join('')}
              </div>
            </div>
          </div>
        `;
      });
      
      content.innerHTML = html;
      modal.classList.remove('hidden');
    }

    function cerrarHistorial() {
      document.getElementById('historialModal').classList.add('hidden');
    }

    function showNotification(message, type = 'info') {
      const notification = document.createElement('div');
      notification.className = `fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg max-w-sm transform transition-all duration-300 translate-x-full`;

      const colors = {
        success: 'bg-green-500 text-white',
        error: 'bg-red-500 text-white',
        warning: 'bg-yellow-500 text-white',
        info: 'bg-blue-500 text-white'
      };

      notification.className += ` ${colors[type] || colors.info}`;
      notification.innerHTML = `
        <div class="flex items-center">
          <span class="flex-1 font-medium whitespace-pre-line">${message}</span>
          <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      `;

      document.body.appendChild(notification);

      setTimeout(() => {
        notification.classList.remove('translate-x-full');
      }, 100);

      setTimeout(() => {
        notification.classList.add('translate-x-full');
        setTimeout(() => notification.remove(), 300);
      }, 5000);
    }

    // Event listeners
    document.getElementById('fileInput').addEventListener('change', handleFile);
    document.getElementById('siguiente').addEventListener('click', siguientePregunta);
    document.getElementById('filtrarTemas').addEventListener('click', aplicarFiltroTemas);

    // Cerrar modal al hacer clic fuera
    document.getElementById('historialModal').addEventListener('click', function(e) {
      if (e.target === this) {
        cerrarHistorial();
      }
    });

    // Auto-conectar si hay un ID guardado
    window.addEventListener('load', async () => {
      cargarPreguntasGuardadas();
      
      const savedUserId = localStorage.getItem('quizUserId');
      if (savedUserId) {
        document.getElementById('userIdInput').value = savedUserId;
        // Auto-conectar después de un pequeño delay
        setTimeout(() => {
          conectarNube();
        }, 1000);
      }
    });

    // Detectar si el usuario se va de la página para sincronizar
    window.addEventListener('beforeunload', async () => {
      if (cloudConnected) {
        await guardarEnNube();
      }
    });


// Función para limpiar datos de la nube problemáticos
window.limpiarDatosNube = function() {
  if (!currentUserId) {
    showNotification('❌ No hay usuario conectado', 'error');
    return;
  }
  
  // Limpiar binId problemático
  localStorage.removeItem(`binId_${currentUserId}`);
  console.log('BinId limpiado para el usuario:', currentUserId);
  showNotification('🧹 Datos de nube limpiados. Reconecta para crear un nuevo bin.', 'info');
}

