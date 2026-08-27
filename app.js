(function () {
  const cfg = window.PORTAL_CONFIG || {};
  let sb = null;
  let desiredRole = 'acceso';
  let perfilActual = null;
  let credenciales = null;
  let libroActual = null;
  let paginaActual = 1;
  let imagenPaginaData = null;

  // Lector continuo de libros (Web Speech API).
  let lecturaChunks = [];
  let lecturaIndice = 0;
  let lecturaPausada = false;
  let lecturaActiva = false;
  let lecturaVelocidad = 1;
  let lecturaLibroClave = '';
  let lecturaPaginaMarcada = null;

  const get = (id) => document.getElementById(id);

  function configured() {
    return Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  }

  function client() {
    if (!configured()) return null;
    if (!sb) sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    return sb;
  }

  function normalizeRole(role) {
    return { admin:'administrador', author:'autor', reader:'lector', acceso:'acceso' }[role] || role;
  }

  function hidePasswordField() {
    const password = get('loginPassword');
    if (password) {
      const wrapper = password.parentElement;
      if (wrapper) wrapper.style.display = 'none';
      password.value = '';
      password.removeAttribute('required');
    }
  }

  function showLogin(role = 'administrador') {
    desiredRole = normalizeRole(role);

    const modal = get('secureLoginModal');
    if (!modal) {
      alert('No se encontró el formulario seguro en index.html.');
      return;
    }

    const title = get('secureLoginTitle');
    const message = get('secureLoginMessage');

    if (title) {
      title.textContent =
        desiredRole === 'administrador' ? 'Acceso administrativo' :
        desiredRole === 'autor' ? 'Acceso de autor' :
        desiredRole === 'lector' ? 'Acceso de lector' : 'Acceso al portal';
    }

    if (message) {
      message.textContent = configured()
        ? 'Ingresa con tu correo electrónico y NIP.'
        : 'La conexión con Supabase no está disponible. Revisa config.js.';
    }

    hidePasswordField();
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    const email = get('loginEmail');
    if (email) email.focus();
  }

  function closeLogin() {
    const modal = get('secureLoginModal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  async function login() {
    if (!configured()) {
      alert('No se pudo conectar con Supabase. Revisa config.js.');
      return;
    }

    const email = (get('loginEmail')?.value || '').trim().toLowerCase();
    const pin = (get('loginPin')?.value || '').trim();

    if (!email || !pin) {
      alert('Captura correo electrónico y NIP.');
      return;
    }

    const { data: acceso, error } = await client().rpc(
      'acceso_por_correo_nip',
      { p_email: email, p_nip: pin }
    );

    if (error) {
      alert('No fue posible validar el acceso: ' + error.message);
      return;
    }

    const perfil = Array.isArray(acceso) ? acceso[0] : acceso;

    if (!perfil) {
      alert('Correo o NIP incorrectos.');
      return;
    }

    if (!perfil.activo) {
      alert('Esta cuenta no está activa.');
      return;
    }

    // Enrutamiento automático por el rol real de la cuenta.
    // El acceso general detecta si la persona es administrador, autor o lector.
    let modoFinal = desiredRole;

    if (desiredRole === 'acceso') {
      modoFinal = perfil.tipo_usuario;
    } else if (perfil.tipo_usuario === 'administrador') {
      // El administrador puede usar cualquiera de los tres paneles.
      modoFinal = desiredRole;
    } else if (perfil.tipo_usuario === desiredRole) {
      modoFinal = desiredRole;
    } else if (perfil.tipo_usuario === 'autor') {
      modoFinal = 'autor';
    } else if (perfil.tipo_usuario === 'lector') {
      modoFinal = 'lector';
    } else {
      alert('El tipo de cuenta no tiene un panel habilitado.');
      return;
    }

    perfilActual = perfil;
    credenciales = { email, pin };
    closeLogin();
    renderPanel(perfil, modoFinal);
  }

  function logout() {
    perfilActual = null;
    credenciales = null;
    libroActual = null;

    const panel = get('panel-usuario');
    if (panel) panel.style.display = 'none';
    if (get('loginEmail')) get('loginEmail').value = '';
    if (get('loginPin')) get('loginPin').value = '';
  }

  function renderPanel(perfil, modoAcceso = perfil.tipo_usuario) {
    const panel = get('panel-usuario');
    if (!panel) return;

    panel.style.display = 'block';

    const title = get('panelTitle');
    if (title) {
      title.textContent =
        modoAcceso === 'administrador' ? 'Panel administrativo' :
        modoAcceso === 'autor' ? 'Panel del autor' : 'Panel del lector';
    }

    const subtitle = get('panelSubtitle');
    if (subtitle) {
      subtitle.textContent = 'Sesión de ' + (perfil.nombre || perfil.email || 'usuario');
    }

    const content = get('panelContent');

    if (content) {
      if (modoAcceso === 'administrador') {
        content.innerHTML = `
          <div class="cards">
            <article class="book-card"><div class="card-body">
              <h3>Editor general de libros</h3>
              <p>Puedes modificar cualquier libro, editar cualquier página e insertar páginas antes o después.</p>
              <button class="btn navy" onclick="PortalBooks.abrirEditor()">Abrir editor</button>
            </div></article>
            <article class="book-card"><div class="card-body">
              <h3>Visitantes del portal</h3>
              <p>Consulta visitantes únicos, visitas totales y procedencia geográfica aproximada.</p>
              <button class="btn navy" onclick="PortalAnalytics.mostrar()">Ver visitantes</button>
            </div></article>
            <article class="book-card"><div class="card-body">
              <h3>Comentarios de lectores</h3>
              <p>Revisa comentarios pendientes, publica los que autorices o elimina los que no desees conservar.</p>
              <button class="btn gold" onclick="PortalComments.mostrar()">Administrar comentarios</button>
            </div></article>
            <article class="book-card"><div class="card-body">
              <h3>Entrar como autor</h3>
              <p>Usa la misma cuenta para escribir, editar y publicar tus libros.</p>
              <button class="btn navy" onclick="PortalAuth.cambiarModo('autor')">Panel de autor</button>
            </div></article>
            <article class="book-card"><div class="card-body">
              <h3>Entrar como lector</h3>
              <p>Usa la misma cuenta para consultar las obras como cualquier lector.</p>
              <button class="btn outline" onclick="PortalAuth.cambiarModo('lector')">Panel de lector</button>
            </div></article>
          </div>`;
      } else if (modoAcceso === 'autor') {
        content.innerHTML = `
          <div class="cards">
            <article class="book-card"><div class="card-body">
              <h3>Mis libros</h3>
              <p>Puedes leer y editar tus libros completos desde la página 1 hasta el final.</p>
              <button class="btn navy" onclick="PortalBooks.abrirEditor()">Abrir mis libros</button>
            </div></article>
            ${perfil.tipo_usuario === 'administrador' ? `
            <article class="book-card"><div class="card-body">
              <h3>Volver a administración</h3>
              <button class="btn outline" onclick="PortalAuth.cambiarModo('administrador')">Panel administrativo</button>
            </div></article>` : ''}
          </div>`;
      } else {
        content.innerHTML = `
          <div class="cards">
            <article class="book-card"><div class="card-body">
              <h3>Biblioteca del lector</h3>
              <p>Las primeras 5 páginas de cada libro están disponibles gratuitamente para cualquier visitante.</p>
              <button class="btn navy" onclick="document.getElementById('libros')?.scrollIntoView({behavior:'smooth'})">Ver biblioteca</button>
            </div></article>
            ${perfil.tipo_usuario === 'administrador' ? `
            <article class="book-card"><div class="card-body">
              <h3>Volver a administración</h3>
              <button class="btn outline" onclick="PortalAuth.cambiarModo('administrador')">Panel administrativo</button>
            </div></article>` : ''}
          </div>`;
      }
    }

    panel.scrollIntoView({ behavior:'smooth' });
  }

  function cambiarModo(modo) {
    if (!perfilActual) {
      alert('Primero inicia sesión.');
      return;
    }

    const permitido =
      perfilActual.tipo_usuario === modo ||
      perfilActual.tipo_usuario === 'administrador';

    if (!permitido) {
      alert('Tu cuenta no tiene permiso para este acceso.');
      return;
    }

    renderPanel(perfilActual, modo);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'","&#039;");
  }

  function ensureBookModal() {
    if (get('portalBookModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal" id="portalBookModal">
        <div class="backdrop" onclick="PortalBooks.cerrarLibro()"></div>
        <div class="modal-card" style="max-width:900px;max-height:90vh;overflow:auto">
          <button class="close" onclick="PortalBooks.cerrarLibro()">×</button>
          <h2 id="portalBookTitle">Libro</h2>
          <p class="legal" id="portalBookNotice"></p>
          <div id="portalAudioReader" style="position:sticky;top:0;z-index:4;background:#fffdf8;border:1px solid #d6c39b;border-radius:10px;padding:14px;margin:14px 0 18px;box-shadow:0 4px 14px rgba(0,0,0,.08)">
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <button class="btn navy" id="audioPlayBtn" onclick="PortalBooks.leerLibro()">🔊 Escuchar libro</button>
              <button class="btn outline" id="audioPauseBtn" onclick="PortalBooks.pausarLectura()">⏸ Pausar</button>
              <button class="btn outline" id="audioResumeBtn" onclick="PortalBooks.continuarLectura()">▶ Continuar</button>
              <button class="btn outline" id="audioStopBtn" onclick="PortalBooks.detenerLectura()">⏹ Detener</button>
              <label for="audioRate" style="font-size:14px;margin-left:auto">Velocidad</label>
              <select id="audioRate" onchange="PortalBooks.cambiarVelocidad(this.value)" style="padding:9px;border:1px solid #d6d2c8;border-radius:7px;background:white">
                <option value="0.8">0.8×</option>
                <option value="1" selected>1×</option>
                <option value="1.2">1.2×</option>
                <option value="1.5">1.5×</option>
              </select>
            </div>
            <div id="audioReaderStatus" role="status" aria-live="polite" style="font-size:13px;color:#6d7480;margin-top:9px">Lectura por voz lista.</div>
          </div>
          <div id="portalBookPages"></div>
        </div>
      </div>
    `);
  }

  function lectorDisponible() {
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  function actualizarEstadoLectura(texto) {
    const el = get('audioReaderStatus');
    if (el) el.textContent = texto;
  }

  function claveProgresoLectura() {
    return 'portal_audio_progreso_' + lecturaLibroClave;
  }

  function guardarProgresoLectura() {
    if (!lecturaLibroClave || !lecturaChunks.length) return;
    try { localStorage.setItem(claveProgresoLectura(), String(lecturaIndice)); } catch (_) {}
  }

  function cargarProgresoLectura() {
    if (!lecturaLibroClave || !lecturaChunks.length) return 0;
    try {
      const n = Number(localStorage.getItem(claveProgresoLectura()) || 0);
      return Number.isInteger(n) && n >= 0 && n < lecturaChunks.length ? n : 0;
    } catch (_) { return 0; }
  }

  function dividirParaVoz(texto, max = 220) {
    const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
    if (!limpio) return [];
    const oraciones = limpio.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [limpio];
    const salida = [];
    let actual = '';
    for (const oracion of oraciones) {
      const parte = oracion.trim();
      if (!parte) continue;
      if ((actual + ' ' + parte).trim().length <= max) {
        actual = (actual + ' ' + parte).trim();
      } else {
        if (actual) salida.push(actual);
        if (parte.length <= max) {
          actual = parte;
        } else {
          const palabras = parte.split(/\s+/);
          actual = '';
          for (const palabra of palabras) {
            if ((actual + ' ' + palabra).trim().length > max) {
              if (actual) salida.push(actual);
              actual = palabra;
            } else {
              actual = (actual + ' ' + palabra).trim();
            }
          }
        }
      }
    }
    if (actual) salida.push(actual);
    return salida;
  }

  function prepararLectura(paginas) {
    lecturaChunks = [];
    lecturaActiva = false;
    lecturaPausada = false;
    lecturaPaginaMarcada = null;

    (paginas || []).forEach(p => {
      const partes = [];
      if (p.titulo) partes.push(...dividirParaVoz(p.titulo));
      partes.push(...dividirParaVoz(p.contenido || ''));
      partes.forEach(texto => lecturaChunks.push({ texto, pagina: p.numero }));
    });

    lecturaLibroClave = encodeURIComponent((get('portalBookTitle')?.textContent || 'libro').trim().toLowerCase());
    lecturaIndice = cargarProgresoLectura();

    if (!lectorDisponible()) {
      actualizarEstadoLectura('Este navegador no ofrece lectura por voz. Prueba con Chrome, Edge o Safari actualizado.');
      return;
    }

    if (!lecturaChunks.length) {
      actualizarEstadoLectura('Este libro todavía no tiene texto disponible para escuchar.');
    } else if (lecturaIndice > 0) {
      const pag = lecturaChunks[lecturaIndice]?.pagina || '';
      actualizarEstadoLectura('Listo para continuar desde la página ' + pag + '.');
    } else {
      actualizarEstadoLectura('Lectura por voz lista. Presiona “Escuchar libro”.');
    }
  }

  function marcarPaginaLectura(numero) {
    if (lecturaPaginaMarcada === numero) return;
    document.querySelectorAll('#portalBookPages article[data-page-number]').forEach(el => {
      el.style.outline = '';
      el.style.boxShadow = '';
    });
    const actual = document.querySelector('#portalBookPages article[data-page-number="' + numero + '"]');
    if (actual) {
      actual.style.outline = '3px solid #d6c39b';
      actual.style.boxShadow = '0 0 0 4px rgba(214,195,155,.18)';
    }
    lecturaPaginaMarcada = numero;
  }

  function elegirVozEspanol() {
    const voces = window.speechSynthesis.getVoices() || [];
    return voces.find(v => /^es-MX$/i.test(v.lang)) ||
      voces.find(v => /^es(-|_)/i.test(v.lang)) || null;
  }

  function hablarSiguiente() {
    if (!lecturaActiva || lecturaPausada) return;
    if (lecturaIndice >= lecturaChunks.length) {
      lecturaActiva = false;
      lecturaPausada = false;
      lecturaIndice = 0;
      try { localStorage.removeItem(claveProgresoLectura()); } catch (_) {}
      actualizarEstadoLectura('Lectura terminada.');
      marcarPaginaLectura(null);
      return;
    }

    const item = lecturaChunks[lecturaIndice];
    marcarPaginaLectura(item.pagina);
    actualizarEstadoLectura('Leyendo página ' + item.pagina + '…');

    const utterance = new SpeechSynthesisUtterance(item.texto);
    utterance.lang = 'es-MX';
    utterance.rate = lecturaVelocidad;
    const voz = elegirVozEspanol();
    if (voz) utterance.voice = voz;

    utterance.onend = () => {
      if (!lecturaActiva || lecturaPausada) return;
      lecturaIndice += 1;
      guardarProgresoLectura();
      setTimeout(hablarSiguiente, 60);
    };

    utterance.onerror = (e) => {
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      lecturaActiva = false;
      actualizarEstadoLectura('La lectura se interrumpió. Presiona “Continuar” para reanudar.');
    };

    window.speechSynthesis.speak(utterance);
  }

  function leerLibro() {
    if (!lectorDisponible()) {
      alert('Este navegador no ofrece lectura por voz. Prueba con Chrome, Edge o Safari actualizado.');
      return;
    }
    if (!lecturaChunks.length) {
      actualizarEstadoLectura('Este libro todavía no tiene texto disponible para escuchar.');
      return;
    }
    if (lecturaPausada) {
      continuarLectura();
      return;
    }
    if (lecturaActiva && window.speechSynthesis.speaking) return;
    window.speechSynthesis.cancel();
    lecturaActiva = true;
    lecturaPausada = false;
    hablarSiguiente();
  }

  function pausarLectura() {
    if (!lectorDisponible() || !lecturaActiva) return;
    window.speechSynthesis.pause();
    lecturaPausada = true;
    guardarProgresoLectura();
    const pag = lecturaChunks[lecturaIndice]?.pagina || '';
    actualizarEstadoLectura('Lectura pausada' + (pag ? ' en la página ' + pag : '') + '.');
  }

  function continuarLectura() {
    if (!lectorDisponible() || !lecturaChunks.length) return;
    if (lecturaPausada && window.speechSynthesis.paused) {
      lecturaPausada = false;
      lecturaActiva = true;
      window.speechSynthesis.resume();
      const pag = lecturaChunks[lecturaIndice]?.pagina || '';
      actualizarEstadoLectura('Continuando' + (pag ? ' desde la página ' + pag : '') + '…');
      return;
    }
    lecturaPausada = false;
    lecturaActiva = true;
    window.speechSynthesis.cancel();
    setTimeout(hablarSiguiente, 80);
  }

  function detenerLectura() {
    if (!lectorDisponible()) return;
    guardarProgresoLectura();
    window.speechSynthesis.cancel();
    lecturaActiva = false;
    lecturaPausada = false;
    const pag = lecturaChunks[lecturaIndice]?.pagina || '';
    actualizarEstadoLectura('Lectura detenida' + (pag ? '. Podrás continuar desde la página ' + pag : '') + '.');
  }

  function cambiarVelocidad(valor) {
    const nueva = Number(valor);
    if (!Number.isFinite(nueva) || nueva <= 0) return;
    lecturaVelocidad = nueva;
    if (lecturaActiva && !lecturaPausada && lectorDisponible()) {
      window.speechSynthesis.cancel();
      setTimeout(hablarSiguiente, 80);
    } else {
      actualizarEstadoLectura('Velocidad seleccionada: ' + nueva + '×.');
    }
  }

  function renderPaginasLectura(paginas) {
    const cont = get('portalBookPages');
    if (!cont) return;

    if (!paginas.length) {
      cont.innerHTML = '<p>Este libro todavía no tiene contenido publicado.</p>';
      return;
    }

    cont.innerHTML = paginas.map(p => {
      const imagen = p.imagen_data ? `
        <figure style="margin:20px 0;text-align:center">
          <img src="${p.imagen_data}" alt="${escapeHtml(p.imagen_pie || 'Imagen del libro')}"
               style="max-width:100%;max-height:520px;object-fit:contain;border-radius:8px">
          ${p.imagen_pie ? `<figcaption style="font-size:13px;color:#6d7480;margin-top:8px">${escapeHtml(p.imagen_pie)}</figcaption>` : ''}
        </figure>` : '';

      const texto = `<div style="white-space:pre-wrap;line-height:1.8;font-family:Georgia,serif;font-size:18px;color:#29251f">${escapeHtml(p.contenido || '') || '<em>Página en preparación.</em>'}</div>`;

      return `
        <article data-page-number="${p.numero}" style="background:#fffdf8;border:1px solid #e5dfd2;border-radius:10px;padding:28px;margin:18px 0;min-height:320px;transition:outline .2s,box-shadow .2s">
          <div style="font-size:12px;letter-spacing:.12em;color:#9b7a37;text-transform:uppercase;margin-bottom:10px">Página ${p.numero}</div>
          ${p.titulo ? `<h3 style="font-family:Georgia,serif;color:#0b1b36">${escapeHtml(p.titulo)}</h3>` : ''}
          ${p.imagen_posicion === 'arriba' ? imagen : ''}
          ${texto}
          ${p.imagen_posicion === 'abajo' ? imagen : ''}
        </article>`;
    }).join('');
    prepararLectura(paginas);
  }

  async function abrirLibroPublicoPorTitulo(titulo) {
    ensureBookModal();

    const { data: libros, error } = await client().rpc('portal_listar_libros');
    if (error) {
      alert('No fue posible abrir el catálogo: ' + error.message);
      return;
    }

    const libro = (libros || []).find(x => x.titulo.trim() === titulo.trim());
    if (!libro) {
      alert('Este libro todavía no está vinculado a la base de datos.');
      return;
    }

    const { data: paginas, error: errPag } = await client().rpc(
      'portal_leer_muestra',
      { p_libro_id: libro.id }
    );

    if (errPag) {
      alert('No fue posible abrir el libro: ' + errPag.message);
      return;
    }

    get('portalBookTitle').textContent = libro.titulo;
    get('portalBookNotice').textContent = libro.lectura_gratuita
      ? 'Lectura completa gratuita.'
      : 'Muestra gratuita: páginas 1 a 5. Para continuar se requiere acceso de pago.';
    renderPaginasLectura(paginas || []);

    if (libro.precio_descarga) {
      get('portalBookPages').insertAdjacentHTML('beforeend', `
        <div style="margin-top:20px;padding:18px;border:1px solid #d6c39b;border-radius:8px;background:#fffaf0">
          <b>Descarga digital del libro completo: $${Number(libro.precio_descarga).toFixed(0)} MXN</b>
          <p style="margin:8px 0 0">La lectura en línea es gratuita; la descarga digital tiene costo.</p>
        </div>
      `);
    }
    get('portalBookModal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function cerrarLibro() {
    if (lectorDisponible() && (lecturaActiva || lecturaPausada)) detenerLectura();
    get('portalBookModal')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  function ensureEditorModal() {
    if (get('portalEditorModal')) return;

    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal" id="portalEditorModal">
        <div class="backdrop" onclick="PortalBooks.cerrarEditor()"></div>
        <div class="modal-card" style="max-width:1100px;max-height:94vh;overflow:auto">
          <button class="close" onclick="PortalBooks.cerrarEditor()">×</button>
          <h2>Editor de libros</h2>
          <p class="legal">Administrador: puede modificar cualquier libro. Autor: puede ver y modificar sus libros completos.</p>

          <div class="grid-form" style="margin-bottom:18px">
            <div class="wide">
              <label>Libro</label>
              <select id="editorLibroSelect" style="width:100%;padding:12px;border:1px solid #d6d2c8;border-radius:7px"></select>
            </div>
            <div>
              <label>Página</label>
              <input id="editorNumero" type="number" min="1" value="1">
            </div>
            <div style="display:flex;align-items:end">
              <button class="btn outline" style="width:100%" onclick="PortalBooks.cargarPagina()">Ir a página</button>
            </div>
            <div class="wide">
              <label>Título de la página</label>
              <input id="editorTituloPagina" type="text" placeholder="Título opcional">
            </div>
            <div class="wide">
              <label>Contenido</label>
              <textarea id="editorContenidoPagina" rows="16" style="width:100%;padding:14px;border:1px solid #d6d2c8;border-radius:7px;font:17px/1.7 Georgia,serif" placeholder="Escribe aquí..."></textarea>
            </div>

            <div class="wide" style="border-top:1px solid #e5e0d5;padding-top:16px">
              <label>Imagen de esta página</label>
              <input id="editorImagenArchivo" type="file" accept="image/*">
              <div id="editorImagenPreview" style="margin-top:12px"></div>
            </div>
            <div>
              <label>Posición de la imagen</label>
              <select id="editorImagenPosicion">
                <option value="arriba">Arriba del texto</option>
                <option value="abajo">Abajo del texto</option>
              </select>
            </div>
            <div>
              <label>Pie de imagen</label>
              <input id="editorImagenPie" type="text" placeholder="Descripción opcional">
            </div>
            <div class="wide">
              <button type="button" class="btn outline" onclick="PortalBooks.quitarImagen()">Quitar imagen de esta página</button>
            </div>
          </div>

          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn navy" onclick="PortalBooks.guardarPagina()">Guardar página</button>
            <button class="btn outline" onclick="PortalBooks.insertarAntes()">Insertar antes</button>
            <button class="btn outline" onclick="PortalBooks.insertarDespues()">Insertar después</button>
            <button class="btn outline" onclick="PortalBooks.anterior()">← Anterior</button>
            <button class="btn outline" onclick="PortalBooks.siguiente()">Siguiente →</button>
            <button class="btn outline" onclick="PortalBooks.eliminarPagina()" style="border-color:#b84b45;color:#8f302b">Eliminar página</button>
          </div>

          <p id="editorEstado" class="legal" style="margin-top:12px"></p>

          <hr style="margin:24px 0;border:0;border-top:1px solid #ddd">
          <h3>Crear un libro nuevo</h3>
          <div class="grid-form">
            <div><input id="nuevoLibroTitulo" placeholder="Título del libro"></div>
            <div><input id="nuevoLibroEdad" placeholder="Edad recomendada"></div>
            <div class="wide"><button class="btn navy" onclick="PortalBooks.crearLibro()">Crear libro</button></div>
          </div>
        </div>
      </div>
    `);

    get('editorLibroSelect').addEventListener('change', async () => {
      libroActual = get('editorLibroSelect').value || null;
      paginaActual = 1;
      get('editorNumero').value = 1;
      await cargarPagina();
    });

    get('editorImagenArchivo').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        imagenPaginaData = await comprimirImagen(file);
        mostrarPreviewImagen();
      } catch (err) {
        alert('No fue posible procesar la imagen: ' + err.message);
      }
    });
  }

  function comprimirImagen(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
        img.onload = () => {
          const max = 1000;
          let w = img.width;
          let h = img.height;
          const scale = Math.min(1, max / Math.max(w, h));
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.76));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function mostrarPreviewImagen() {
    const box = get('editorImagenPreview');
    if (!box) return;
    box.innerHTML = imagenPaginaData
      ? `<img src="${imagenPaginaData}" alt="Vista previa" style="max-width:100%;max-height:300px;object-fit:contain;border:1px solid #ddd;border-radius:8px">`
      : '<span class="legal">Esta página no tiene imagen.</span>';
  }

  function quitarImagen() {
    imagenPaginaData = null;
    if (get('editorImagenArchivo')) get('editorImagenArchivo').value = '';
    if (get('editorImagenPie')) get('editorImagenPie').value = '';
    mostrarPreviewImagen();
  }

  async function abrirEditor() {
    if (!perfilActual || !credenciales) {
      alert('Primero inicia sesión como administrador o autor.');
      return;
    }

    ensureEditorModal();

    const { data, error } = await client().rpc('portal_libros_editor', {
      p_email: credenciales.email,
      p_nip: credenciales.pin
    });

    if (error) {
      alert('No fue posible cargar los libros: ' + error.message);
      return;
    }

    const select = get('editorLibroSelect');
    select.innerHTML = (data || []).map(l =>
      `<option value="${l.id}">${escapeHtml(l.titulo)} (${l.total_paginas || 0} páginas)</option>`
    ).join('');

    if (!data || !data.length) {
      select.innerHTML = '<option value="">No hay libros asignados</option>';
      libroActual = null;
    } else {
      libroActual = data[0].id;
      paginaActual = 1;
      get('editorNumero').value = 1;
      await cargarPagina();
    }

    get('portalEditorModal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function cerrarEditor() {
    get('portalEditorModal')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  async function obtenerLibroCompleto() {
    if (!libroActual) return [];
    const { data, error } = await client().rpc('portal_leer_libro_completo', {
      p_email: credenciales.email,
      p_nip: credenciales.pin,
      p_libro_id: libroActual
    });
    if (error) throw error;
    return data || [];
  }

  async function cargarPagina() {
    if (!libroActual) return;

    const n = Math.max(1, parseInt(get('editorNumero').value || '1', 10));
    paginaActual = n;
    get('editorNumero').value = n;

    try {
      const paginas = await obtenerLibroCompleto();
      const p = paginas.find(x => Number(x.numero) === n);
      get('editorTituloPagina').value = p?.titulo || '';
      get('editorContenidoPagina').value = p?.contenido || '';
      imagenPaginaData = p?.imagen_data || null;
      if (get('editorImagenPie')) get('editorImagenPie').value = p?.imagen_pie || '';
      if (get('editorImagenPosicion')) get('editorImagenPosicion').value = p?.imagen_posicion || 'arriba';
      if (get('editorImagenArchivo')) get('editorImagenArchivo').value = '';
      mostrarPreviewImagen();
      get('editorEstado').textContent = p
        ? `Página ${n} cargada.`
        : `La página ${n} aún no existe. Escribe contenido y pulsa Guardar página.`;
    } catch (e) {
      alert('No fue posible cargar la página: ' + e.message);
    }
  }

  async function guardarPagina() {
    if (!libroActual) return;

    const numero = Math.max(1, parseInt(get('editorNumero').value || '1', 10));

    const { error } = await client().rpc('portal_guardar_pagina', {
      p_email: credenciales.email,
      p_nip: credenciales.pin,
      p_libro_id: libroActual,
      p_numero: numero,
      p_titulo: get('editorTituloPagina').value || '',
      p_contenido: get('editorContenidoPagina').value || '',
      p_imagen_data: imagenPaginaData || '',
      p_imagen_pie: get('editorImagenPie')?.value || '',
      p_imagen_posicion: get('editorImagenPosicion')?.value || 'arriba'
    });

    if (error) {
      alert('No fue posible guardar: ' + error.message);
      return;
    }

    paginaActual = numero;
    get('editorEstado').textContent = `Página ${numero} guardada correctamente.`;
  }

  async function insertarEn(numero) {
    if (!libroActual) return;

    const { error } = await client().rpc('portal_insertar_pagina', {
      p_email: credenciales.email,
      p_nip: credenciales.pin,
      p_libro_id: libroActual,
      p_numero: numero,
      p_titulo: '',
      p_contenido: ''
    });

    if (error) {
      alert('No fue posible insertar la página: ' + error.message);
      return;
    }

    paginaActual = numero;
    get('editorNumero').value = numero;
    await cargarPagina();
  }

  async function insertarAntes() {
    await insertarEn(Math.max(1, paginaActual));
  }

  async function insertarDespues() {
    await insertarEn(paginaActual + 1);
  }

  async function eliminarPagina() {
    if (!libroActual) return;
    if (!confirm(`¿Eliminar la página ${paginaActual}?`)) return;

    const { error } = await client().rpc('portal_eliminar_pagina', {
      p_email: credenciales.email,
      p_nip: credenciales.pin,
      p_libro_id: libroActual,
      p_numero: paginaActual
    });

    if (error) {
      alert('No fue posible eliminar: ' + error.message);
      return;
    }

    await cargarPagina();
  }

  async function anterior() {
    get('editorNumero').value = Math.max(1, paginaActual - 1);
    await cargarPagina();
  }

  async function siguiente() {
    get('editorNumero').value = paginaActual + 1;
    await cargarPagina();
  }

  async function crearLibro() {
    const titulo = (get('nuevoLibroTitulo').value || '').trim();
    const edad = (get('nuevoLibroEdad').value || '').trim();

    if (!titulo) {
      alert('Escribe el título del libro.');
      return;
    }

    const { error } = await client().rpc('portal_crear_libro', {
      p_email: credenciales.email,
      p_nip: credenciales.pin,
      p_titulo: titulo,
      p_edad: edad
    });

    if (error) {
      alert('No fue posible crear el libro: ' + error.message);
      return;
    }

    get('nuevoLibroTitulo').value = '';
    get('nuevoLibroEdad').value = '';
    alert('Libro creado correctamente.');
    await abrirEditor();
  }

  function getVisitorId() {
    let id = localStorage.getItem('portal_visitante_id');
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() :
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      localStorage.setItem('portal_visitante_id', id);
    }
    return id;
  }

  async function detectarUbicacionAproximada() {
    const fallback = {
      pais: '',
      region: '',
      ciudad: '',
      zona_horaria: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      idioma: navigator.language || ''
    };

    try {
      const r = await fetch('https://ipapi.co/json/', { cache:'no-store' });
      if (!r.ok) return fallback;
      const g = await r.json();

      return {
        pais: g.country_name || '',
        region: g.region || '',
        ciudad: g.city || '',
        zona_horaria: g.timezone || fallback.zona_horaria,
        idioma: navigator.language || ''
      };
    } catch (_) {
      return fallback;
    }
  }

  async function registrarVisita() {
    if (!configured()) return;

    try {
      const geo = await detectarUbicacionAproximada();

      await client().rpc('portal_registrar_visita', {
        p_visitante_id: getVisitorId(),
        p_pagina: location.pathname + location.hash,
        p_pais: geo.pais,
        p_region: geo.region,
        p_ciudad: geo.ciudad,
        p_zona_horaria: geo.zona_horaria,
        p_idioma: geo.idioma
      });
    } catch (_) {}
  }

  async function mostrarAnalitica() {
    if (!perfilActual || perfilActual.tipo_usuario !== 'administrador' || !credenciales) {
      alert('Acceso administrativo requerido.');
      return;
    }

    const { data, error } = await client().rpc('portal_resumen_visitas', {
      p_email: credenciales.email,
      p_nip: credenciales.pin
    });

    if (error) {
      alert('No fue posible consultar las visitas: ' + error.message);
      return;
    }

    const content = get('panelContent');
    if (!content) return;

    content.innerHTML = `
      <div class="cards">
        <article class="book-card"><div class="card-body">
          <h3>${data?.visitantes_unicos || 0}</h3>
          <p>Visitantes únicos</p>
        </div></article>
        <article class="book-card"><div class="card-body">
          <h3>${data?.visitas_totales || 0}</h3>
          <p>Visitas totales</p>
        </div></article>
        <article class="book-card"><div class="card-body">
          <h3>${data?.hoy || 0}</h3>
          <p>Visitas de hoy</p>
        </div></article>
        <article class="book-card"><div class="card-body">
          <h3>${data?.ultimos_30_dias || 0}</h3>
          <p>Visitas últimos 30 días</p>
        </div></article>
      </div>
      <p class="legal" style="margin-top:16px">La procedencia geográfica se registra de forma aproximada. El portal no almacena la dirección IP.</p>
      <button class="btn outline" style="margin-top:12px" onclick="PortalAuth.cambiarModo('administrador')">Volver al panel administrativo</button>
    `;
  }


  async function mostrarComentariosAdmin(filtro='pendiente') {
    if (!perfilActual || perfilActual.tipo_usuario !== 'administrador' || !credenciales) {
      alert('Primero inicia sesión como administrador.');
      return;
    }

    const { data, error } = await client().rpc('portal_admin_comentarios', {
      p_email: credenciales.email,
      p_nip: credenciales.pin,
      p_estado: filtro
    });

    if (error) {
      alert('No fue posible cargar los comentarios: ' + error.message);
      return;
    }

    const panel = get('panel-usuario');
    const content = get('panelContent');
    if (!panel || !content) return;
    panel.style.display='block';
    get('panelTitle').textContent='Comentarios de lectores';
    get('panelSubtitle').textContent='Moderación administrativa';

    const rows = data || [];
    content.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
        <button class="btn ${filtro==='pendiente'?'navy':'outline'}" onclick="PortalComments.mostrar('pendiente')">Pendientes</button>
        <button class="btn ${filtro==='publicado'?'navy':'outline'}" onclick="PortalComments.mostrar('publicado')">Publicados</button>
        <button class="btn ${filtro==='todos'?'navy':'outline'}" onclick="PortalComments.mostrar('todos')">Todos</button>
      </div>
      ${rows.length ? rows.map(r => `
        <article class="book-card" style="margin-bottom:14px">
          <div class="card-body">
            <div class="meta"><span>${escapeHtml(r.libro_titulo)}</span><span>${new Date(r.creado).toLocaleString('es-MX')}</span></div>
            <h3>${escapeHtml(r.nombre)}</h3>
            <p>${escapeHtml(r.comentario)}</p>
            <p class="legal">Estado: <b>${escapeHtml(r.estado)}</b></p>
            <div class="card-actions">
              ${r.estado!=='publicado' ? `<button class="btn navy" onclick="PortalComments.publicar('${r.id}')">Publicar</button>` : `<button class="btn outline" onclick="PortalComments.ocultar('${r.id}')">Retirar de publicación</button>`}
              <button class="btn outline" onclick="PortalComments.eliminar('${r.id}')">Eliminar</button>
            </div>
          </div>
        </article>`).join('') : '<p>No hay comentarios en esta categoría.</p>'}
      <button class="btn outline" onclick="PortalAuth.cambiarModo('administrador')">Volver al panel administrativo</button>
    `;
  }

  async function publicarComentario(id) {
    if (!confirm('¿Publicar este comentario?')) return;
    const { error } = await client().rpc('portal_admin_publicar_comentario', {
      p_email: credenciales.email, p_nip: credenciales.pin, p_id:id
    });
    if (error) return alert('No se pudo publicar: '+error.message);
    mostrarComentariosAdmin('pendiente');
  }

  async function ocultarComentario(id) {
    if (!confirm('¿Retirar este comentario de la vista pública?')) return;
    const { error } = await client().rpc('portal_admin_ocultar_comentario', {
      p_email: credenciales.email, p_nip: credenciales.pin, p_id:id
    });
    if (error) return alert('No se pudo retirar: '+error.message);
    mostrarComentariosAdmin('publicado');
  }

  async function eliminarComentario(id) {
    if (!confirm('¿Eliminar definitivamente este comentario?')) return;
    const { error } = await client().rpc('portal_admin_eliminar_comentario', {
      p_email: credenciales.email, p_nip: credenciales.pin, p_id:id
    });
    if (error) return alert('No se pudo eliminar: '+error.message);
    mostrarComentariosAdmin('todos');
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function conectarTarjetasCatalogo() {
    document.querySelectorAll('#bookGrid .book-card').forEach(card => {
      const titulo = card.querySelector('h3')?.textContent.trim();
      if (!titulo) return;

      card.querySelectorAll('button').forEach(btn => {
        const texto = btn.textContent.trim().toLowerCase();
        if (texto === 'ver libro' || texto === 'leer lo nuevo') {
          btn.removeAttribute('data-read');
          btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            abrirLibroPublicoPorTitulo(titulo);
          };
        }
      });
    });
  }

  window.PortalAuth = { showLogin, closeLogin, login, logout, cambiarModo };

  window.PortalBooks = {
    abrirLibroPublicoPorTitulo,
    cerrarLibro,
    leerLibro,
    pausarLectura,
    continuarLectura,
    detenerLectura,
    cambiarVelocidad,
    abrirEditor,
    cerrarEditor,
    cargarPagina,
    guardarPagina,
    insertarAntes,
    insertarDespues,
    eliminarPagina,
    anterior,
    siguiente,
    crearLibro,
    quitarImagen
  };

  window.PortalAnalytics = { mostrar: mostrarAnalitica };
  window.PortalComments = {
    mostrar: mostrarComentariosAdmin,
    publicar: publicarComentario,
    ocultar: ocultarComentario,
    eliminar: eliminarComentario
  };

  document.addEventListener('DOMContentLoaded', function () {
    hidePasswordField();
    registrarVisita();

    const top = get('topSecureLogin');
    if (top) top.onclick = () => showLogin('acceso');

    document.querySelectorAll('button').forEach(function (btn) {
      const t = btn.textContent.trim();
      if (t === 'Acceso administrativo' || t === 'Ver acceso administrativo') {
        btn.onclick = () => showLogin('administrador');
      }
    });

    setTimeout(conectarTarjetasCatalogo, 100);
  });
})();