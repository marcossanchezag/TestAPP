let preguntas = [],
        preguntasFiltradas = [],
        preguntaActual = 0,
        aciertos = 0,
        totalRespondidas = 0;
    let quizActivo = false;
    let historialTests = {};
    let temasSeleccionados = [];
    
    // Cloud storage - USUARIO ÚNICO AUTOMÁTICO
    const USUARIO_UNICO = 'quiz_user_default_2024';
    let currentUserId = USUARIO_UNICO;
    let cloudConnected = false;
    let cloudSyncing = false;
    let syncInterval = null;
    const API_BASE = 'https://api.jsonbin.io/v3';
    const API_KEY = '$2a$10$qlkYxA87hxHkgvd.ttxT6.p1RWi2f7LHfNboODExO/Sm0k.QrlF76';

    // FUNCIÓN PRINCIPAL: Conectar automáticamente a la nube
    async function conectarNubeAutomatico() {
      if (cloudSyncing) return;
      
      cloudSyncing = true;
      updateCloudStatus('syncing', '🔄 Conectando...');
      
      try {
        console.log(`Conectando con usuario único: ${USUARIO_UNICO}`);
        
        // Intentar cargar datos desde la nube
        const cloudData = await cargarDesdeNube(USUARIO_UNICO);
        
        if (cloudData && cloudData.preguntas && cloudData.preguntas.length > 0) {
          console.log(`✅ Datos encontrados en la nube: ${cloudData.preguntas.length} preguntas`);
          
          // Aplicar datos de la nube
          preguntas = [...cloudData.preguntas];
          historialTests = { ...cloudData.historialTests } || {};
          
          await guardarDatosLocal();
          mostrarTemasUnicos();
          updateStorageIndicator();
          
          showNotification(`☁️ ${cloudData.preguntas.length} preguntas cargadas desde la nube`, 'success');
        } else {
          console.log('📦 No hay datos en la nube aún');
          
          // Si hay datos locales, subirlos
          if (preguntas.length > 0) {
            console.log(`Subiendo ${preguntas.length} preguntas locales a la nube`);
            await guardarEnNube();
            showNotification('☁️ Datos locales sincronizados con la nube', 'success');
          } else {
            showNotification('☁️ Conectado - Listo para usar', 'success');
          }
        }
        
        cloudConnected = true;
        updateCloudStatus('connected', '☁️ Conectado');
        iniciarSincronizacionAutomatica();
        
      } catch (error) {
        console.error('Error al conectar:', error);
        cloudConnected = false;
        updateCloudStatus('disconnected', '❌ Error');
        showNotification('⚠️ Error de conexión - usando datos locales', 'warning');
      } finally {
        cloudSyncing = false;
      }
    }

    // Cargar desde la nube
    async function cargarDesdeNube(userId) {
      try {
        const binId = localStorage.getItem(`binId_${userId}`);
        
        if (!binId || binId === 'undefined' || binId === 'null') {
          console.log('No hay binId válido');
          return null;
        }

        const url = `${API_BASE}/b/${binId}/latest`;
        const response = await fetch(url, {
          headers: { 'X-Master-Key': API_KEY }
        });

        if (response.ok) {
          const result = await response.json();
          console.log(`Cargados: ${result.record.preguntas?.length || 0} preguntas`);
          return result.record;
        } else {
          if (response.status === 404) {
            localStorage.removeItem(`binId_${userId}`);
          }
          return null;
        }
      } catch (error) {
        console.error('Error al cargar:', error);
        return null;
      }
    }

    // Guardar en la nube
    async function guardarEnNube() {
      if (!cloudConnected || cloudSyncing) {
        console.log('No se puede guardar ahora');
        return false;
      }

      try {
        console.log('💾 Guardando en la nube...');
        
        const datosCompletos = {
          preguntas: preguntas,
          historialTests: historialTests,
          timestamp: Date.now(),
          userId: USUARIO_UNICO
        };

        let binId = localStorage.getItem(`binId_${USUARIO_UNICO}`);
        let response;

        if (binId && binId !== 'undefined' && binId !== 'null') {
          // Actualizar bin existente
          response = await fetch(`${API_BASE}/b/${binId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-Master-Key': API_KEY
            },
            body: JSON.stringify(datosCompletos)
          });

          if (!response.ok) {
            console.log('Error al actualizar, creando nuevo bin...');
            binId = null;
          }
        }

        // Crear nuevo bin si es necesario
        if (!binId || binId === 'undefined' || binId === 'null') {
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
            localStorage.setItem(`binId_${USUARIO_UNICO}`, binId);
            console.log(`✅ Nuevo bin creado: ${binId}`);
          }
        }

        if (response.ok) {
          console.log('✅ Guardado exitoso en la nube');
          updateStorageIndicator();
          return true;
        } else {
          throw new Error(`Error HTTP ${response.status}`);
        }

      } catch (error) {
        console.error('❌ Error al guardar:', error);
        showNotification('⚠️ Error al sincronizar con la nube', 'warning');
        return false;
      }
    }

    // Sincronización automática
    async function sincronizarDatos() {
      if (!cloudConnected || cloudSyncing) return;
      
      cloudSyncing = true;
      updateCloudStatus('syncing', '🔄 Sincronizando...');
      
      try {
        const cloudData = await cargarDesdeNube(USUARIO_UNICO);
        
        if (cloudData && cloudData.preguntas) {
          const localCount = preguntas.length;
          const cloudCount = cloudData.preguntas.length;
          
          if (cloudCount > localCount) {
            // Hay más datos en la nube
            preguntas = [...cloudData.preguntas];
            historialTests = { ...cloudData.historialTests } || {};
            await guardarDatosLocal();
            mostrarTemasUnicos();
            updateStorageIndicator();
            console.log('📥 Datos actualizados desde la nube');
          } else if (localCount > cloudCount) {
            // Hay más datos locales
            await guardarEnNube();
            console.log('📤 Datos locales enviados a la nube');
          } else {
            console.log('✅ Datos sincronizados');
          }
        } else {
          if (preguntas.length > 0) {
            await guardarEnNube();
          }
        }
        
        updateCloudStatus('connected', '☁️ Conectado');
        
      } catch (error) {
        console.error('Error en sincronización:', error);
        updateCloudStatus('disconnected', '❌ Error');
      } finally {
        cloudSyncing = false;
      }
    }

    function iniciarSincronizacionAutomatica() {
      if (syncInterval) clearInterval(syncInterval);
      
      console.log('🔄 Sincronización automática activada');
      syncInterval = setInterval(async () => {
        if (cloudConnected && !cloudSyncing) {
          await sincronizarDatos();
        }
      }, 30000); // Cada 30 segundos
    }

    // Guardar datos localmente
    async function guardarDatosLocal() {
      const datosCompletos = {
        preguntas: preguntas,
        historialTests: historialTests,
        timestamp: Date.now()
      };

      try {
        localStorage.setItem('quizData', JSON.stringify(datosCompletos));
        localStorage.setItem('lastLocalUpdate', Date.now().toString());
      } catch (e) {
        console.error('Error al guardar localmente:', e);
      }
    }

    // Guardar datos (local + nube)
    async function guardarDatos() {
      await guardarDatosLocal();
      
      if (cloudConnected && !cloudSyncing) {
        await guardarEnNube();
      }
      
      updateStorageIndicator();
    }

    function cargarPreguntasGuardadas() {
      try {
        const storedData = localStorage.getItem('quizData');
        if (storedData) {
          const data = JSON.parse(storedData);
          if (data && data.preguntas && data.preguntas.length > 0) {
            preguntas = data.preguntas;
            historialTests = data.historialTests || {};
            mostrarTemasUnicos();
            updateStorageIndicator();
            console.log(`${preguntas.length} preguntas cargadas localmente`);
            return true;
          }
        }
      } catch (e) {
        console.error('Error al cargar datos locales:', e);
      }
      return false;
    }

    function updateCloudStatus(status, text) {
      const cloudStatus = document.getElementById('cloudStatus');
      const cloudStatusText = document.getElementById('cloudStatusText');
      
      if (cloudStatus) {
        cloudStatus.className = `cloud-status ${status}`;
      }
      if (cloudStatusText) {
        cloudStatusText.textContent = text;
      }
    }

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
    }

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
      if (!confirm('⚠️ ¿Estás seguro? Esto eliminará TODOS los datos locales y de la nube.')) {
        return;
      }
      
      preguntas = [];
      preguntasFiltradas = [];
      historialTests = {};

      localStorage.removeItem('quizData');
      localStorage.removeItem('lastLocalUpdate');

      if (cloudConnected) {
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

      if (indicator && status) {
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
    }

    function preguntaExiste(nuevaPregunta) {
      return preguntas.some(p => 
        p.tema === nuevaPregunta.tema && 
        p.pregunta === nuevaPregunta.pregunta &&
        JSON.stringify(p.opciones) === JSON.stringify(nuevaPregunta.opciones)
      );
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

      let totalNewQuestions = 0;
      let duplicatesSkipped = 0;
      let processedFiles = 0;

      for (const file of files) {
        const reader = new FileReader();
        const tema = file.name.replace(/\.[^/.]+$/, "");

        reader.onload = async e => {
          try {
            const content = e.target.result;
            const lines = content.split(/\r?\n/).filter(line => line.trim());

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
                continue;
              }

              if (!preguntaText || opciones.some(op => !op)) continue;

              const correctaNum = parseInt(correctaStr);
              if (isNaN(correctaNum) || correctaNum < 1 || correctaNum > 4) continue;

              const preguntaObj = {
                tema: tema,
                pregunta: preguntaText,
                opciones: opciones,
                correcta: correctaNum - 1
              };

              if (preguntaExiste(preguntaObj)) {
                duplicatesSkipped++;
                continue;
              }

              preguntas.push(preguntaObj);
              newQuestions++;
            }

            totalNewQuestions += newQuestions;
            processedFiles++;

            if (processedFiles === files.length) {
              if (totalNewQuestions === 0) {
                if (duplicatesSkipped > 0) {
                  showNotification(`⚠️ ${duplicatesSkipped} preguntas duplicadas omitidas`, 'warning');
                } else {
                  showNotification('❌ No se encontraron preguntas válidas', 'error');
                }
                return;
              }

              await guardarDatos();
              mostrarTemasUnicos();
              document.getElementById('quiz').classList.add('hidden');

              let message = `✅ ${totalNewQuestions} preguntas cargadas`;
              if (duplicatesSkipped > 0) {
                message += ` (${duplicatesSkipped} duplicadas omitidas)`;
              }
              showNotification(message, 'success');
            }

          } catch (error) {
            console.error(`Error processing file ${file.name}:`, error);
            processedFiles++;
          }
        };

        reader.readAsText(file, 'UTF-8');
      }
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
      actualizarEstadisticas();
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

      document.querySelectorAll('input[name="opcion"]').forEach(r => r.disabled = true);

      if (valor === correcta) {
        aciertos++;
        seleccionada.parentElement.classList.add('bg-green-100', 'border-2', 'border-green-500');
        seleccionada.parentElement.classList.remove('bg-gray-50');
        showNotification('🎉 ¡Correcto!', 'success');
      } else {
        seleccionada.parentElement.classList.add('bg-red-100', 'border-2', 'border-red-500');
        seleccionada.parentElement.classList.remove('bg-gray-50');
        const correctOption = document.querySelector(`input[value='${correcta}']`);
        if (correctOption) {
          correctOption.parentElement.classList.add('bg-green-100', 'border-2', 'border-green-500');
          correctOption.parentElement.classList.remove('bg-gray-50');
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
      document.getElementById('preguntasContestadas').textContent = totalRespondidas;
      document.getElementById('respuestasCorrectas').textContent = aciertos;
      const percent = totalRespondidas > 0 ? (aciertos / totalRespondidas * 100).toFixed(1) : 0;
      document.getElementById('porcentajeAciertos').textContent = `${percent}%`;
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

    // FUNCIONES DE DEBUG (útiles para verificar sincronización)
    window.estadoApp = function() {
      console.log('=== ESTADO DE LA APLICACIÓN ===');
      console.log(`Usuario: ${USUARIO_UNICO}`);
      console.log(`Conectado a nube: ${cloudConnected}`);
      console.log(`Preguntas: ${preguntas.length}`);
      console.log(`Temas: ${[...new Set(preguntas.map(p => p.tema))].length}`);
      console.log(`Historiales: ${Object.keys(historialTests).length}`);
      const totalTests = Object.values(historialTests).reduce((sum, tests) => sum + tests.length, 0);
      console.log(`Total tests: ${totalTests}`);
      
      const binId = localStorage.getItem(`binId_${USUARIO_UNICO}`);
      console.log(`Bin ID: ${binId || 'No creado aún'}`);
    }

    window.forzarSincronizacion = async function() {
      console.log('🔄 Forzando sincronización...');
      await sincronizarDatos();
      console.log('✅ Sincronización completada');
    }

    window.resetearNube = async function() {
      if (!confirm('⚠️ Esto eliminará la referencia al bin en la nube. ¿Continuar?')) {
        return;
      }
      localStorage.removeItem(`binId_${USUARIO_UNICO}`);
      cloudConnected = false;
      updateCloudStatus('disconnected', '❌ Desconectado');
      console.log('🧹 Referencia de nube eliminada. Reconecta para crear un nuevo bin.');
      showNotification('🧹 Listo para reconectar', 'info');
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

    // INICIALIZACIÓN AUTOMÁTICA AL CARGAR
    window.addEventListener('load', async () => {
      console.log('🚀 Iniciando aplicación...');
      
      // Cargar datos locales primero
      cargarPreguntasGuardadas();
      
      // Conectar automáticamente a la nube
      await conectarNubeAutomatico();
      
      console.log('✅ Aplicación lista');
    });

    // Sincronizar antes de cerrar
    window.addEventListener('beforeunload', async () => {
      if (cloudConnected && !cloudSyncing) {
        await guardarEnNube();
      }
    });

    // Sincronizar cuando vuelve la conexión
    window.addEventListener('online', async () => {
      console.log('🌐 Conexión restaurada');
      if (!cloudConnected) {
        await conectarNubeAutomatico();
      }
    });

    window.addEventListener('offline', () => {
      console.log('📴 Sin conexión - usando datos locales');
      updateCloudStatus('disconnected', '📴 Sin conexión');
    });
            