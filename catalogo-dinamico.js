(function () {
  let sbCatalogo = null;

  const esc = (v) => String(v ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");

  function client() {
    const cfg = window.PORTAL_CONFIG || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) return null;

    if (!sbCatalogo) {
      sbCatalogo = window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY
      );
    }

    return sbCatalogo;
  }

  function esCuentoManuel(titulo) {
    return String(titulo || '')
      .trim()
      .toLowerCase()
      .includes('cuento para manuel');
  }

  function esEdithAmigoEspecial(titulo) {
    const t = String(titulo || '').trim().toLowerCase();
    return t.includes('edith y su amigo especial') ||
           t.includes('nicolás y su amigo especial') ||
           t.includes('nicolas y su amigo especial');
  }

  function tituloPublico(titulo) {
    const t = String(titulo || '');
    if (esEdithAmigoEspecial(t)) return 'La tecnología en tiempos de postpandemia';
    if (t.trim().toLowerCase() === 'cuentos cortos') return 'Relatos Cortos';
    return t;
  }


  function getVisitorId() {
    let id = localStorage.getItem('portal_visitante_id');
    if (!id) {
      id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
      localStorage.setItem('portal_visitante_id', id);
    }
    return id;
  }

  function textoLecturas(total) {
    const n = Number(total || 0);
    return n === 1
      ? 'Este libro ha sido leído 1 vez'
      : `Este libro ha sido leído ${n.toLocaleString('es-MX')} veces`;
  }

  function actualizarContadorVisual(libroId, total) {
    document
      .querySelectorAll(`[data-reading-count-for="${libroId}"]`)
      .forEach(el => { el.textContent = textoLecturas(total); });
  }

  async function obtenerLecturas(libroId) {
    const c = client();
    if (!c || !libroId) return 0;

    const { data, error } = await c.rpc('obtener_lecturas', {
      p_libro_id: libroId
    });

    if (error) {
      console.warn('No fue posible consultar lecturas del libro', libroId, error);
      return 0;
    }

    return Number(data || 0);
  }

  async function registrarLectura(libroId) {
    const c = client();
    if (!c || !libroId) return null;

    const { data, error } = await c.rpc('registrar_lectura', {
      p_libro_id: libroId,
      p_visitante_id: getVisitorId()
    });

    if (error) {
      console.warn('No fue posible registrar la lectura del libro', libroId, error);
      return null;
    }

    const total = Number(data || 0);
    actualizarContadorVisual(libroId, total);
    return total;
  }

  function ensureReaderModal() {
    if (document.getElementById('catalogReaderModal')) return;

    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal" id="catalogReaderModal">
        <div class="backdrop" onclick="PortalCatalogo.cerrarLectura()"></div>

        <div class="modal-card"
             style="
               max-width:1000px;
               max-height:94vh;
               overflow:auto;
             ">

          <button class="close"
                  onclick="PortalCatalogo.cerrarLectura()">×</button>

          <h2 id="catalogReaderTitle">Libro</h2>

          <p class="legal"
             id="catalogReaderNotice"></p>

          <div id="catalogReaderPages"></div>
        </div>
      </div>
    `);
  }

  // Lector de voz continuo para cualquier libro abierto desde el catálogo.
  let audioPaginas = [];
  let audioIndice = 0;
  let audioActivo = false;
  let audioPausado = false;
  let audioVelocidad = 1;

  function limpiarTextoAudio(texto) {
    return String(texto || '').replace(/\s+/g, ' ').trim();
  }

  function prepararAudio(paginas) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    audioActivo = false;
    audioPausado = false;
    audioIndice = 0;
    audioPaginas = (paginas || [])
      .sort((a,b) => Number(a.numero || 0) - Number(b.numero || 0))
      .map(p => [p.titulo, p.contenido].map(limpiarTextoAudio).filter(Boolean).join('. '))
      .filter(Boolean);
  }

  function vozEspanol() {
    const voces = window.speechSynthesis.getVoices();
    return voces.find(v => /^es-MX/i.test(v.lang)) ||
           voces.find(v => /^es/i.test(v.lang)) || null;
  }

  function hablarSiguiente() {
    if (!audioActivo || audioPausado) return;
    if (audioIndice >= audioPaginas.length) {
      audioActivo = false;
      audioPausado = false;
      actualizarEstadoAudio('Lectura terminada');
      return;
    }
    const u = new SpeechSynthesisUtterance(audioPaginas[audioIndice]);
    u.lang = 'es-MX';
    u.rate = audioVelocidad;
    const v = vozEspanol(); if (v) u.voice = v;
    u.onend = () => { if (audioActivo && !audioPausado) { audioIndice++; hablarSiguiente(); } };
    u.onerror = () => { if (audioActivo && !audioPausado) { audioIndice++; hablarSiguiente(); } };
    actualizarEstadoAudio(`Escuchando · página ${audioIndice + 1} de ${audioPaginas.length}`);
    window.speechSynthesis.speak(u);
  }

  function iniciarAudio() {
    if (!('speechSynthesis' in window)) { alert('Este navegador no dispone de lectura por voz.'); return; }
    if (!audioPaginas.length) { alert('No hay texto disponible para escuchar.'); return; }
    window.speechSynthesis.cancel();
    audioIndice = 0; audioActivo = true; audioPausado = false;
    hablarSiguiente();
  }

  function pausarAudio() {
    if (!audioActivo) return;
    window.speechSynthesis.pause(); audioPausado = true; actualizarEstadoAudio('Lectura pausada');
  }

  function continuarAudio() {
    if (!audioActivo) { iniciarAudio(); return; }
    window.speechSynthesis.resume(); audioPausado = false;
    actualizarEstadoAudio(`Escuchando · página ${audioIndice + 1} de ${audioPaginas.length}`);
  }

  function detenerAudio() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    audioActivo = false; audioPausado = false; audioIndice = 0; actualizarEstadoAudio('Listo para escuchar');
  }

  function cambiarVelocidadAudio(valor) {
    audioVelocidad = Number(valor) || 1;
    if (audioActivo) { window.speechSynthesis.cancel(); audioPausado = false; hablarSiguiente(); }
  }

  function actualizarEstadoAudio(texto) {
    const el = document.getElementById('catalogAudioStatus'); if (el) el.textContent = texto;
  }

  function controlesAudio() {
    if (!('speechSynthesis' in window)) return '<p class="legal">La lectura por voz no está disponible en este navegador.</p>';
    return `<div id="catalogAudioControls" style="position:sticky;top:0;z-index:5;background:#f7f2e8;border:1px solid #d6c39b;border-radius:10px;padding:14px;margin:12px 0 20px;box-shadow:0 3px 12px rgba(0,0,0,.08)">
      <div style="font-weight:700;color:#0b1b36;margin-bottom:9px">🔊 Audiolibro · lectura continua</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn navy" onclick="PortalCatalogo.iniciarAudio()">🔊 Escuchar libro</button>
        <button class="btn outline" onclick="PortalCatalogo.pausarAudio()">⏸ Pausar</button>
        <button class="btn outline" onclick="PortalCatalogo.continuarAudio()">▶ Continuar</button>
        <button class="btn outline" onclick="PortalCatalogo.detenerAudio()">⏹ Detener</button>
        <label style="font-size:13px;color:#465064">Velocidad <select onchange="PortalCatalogo.cambiarVelocidadAudio(this.value)" style="padding:7px;border-radius:6px"><option value="0.8">0.8×</option><option value="1" selected>1×</option><option value="1.2">1.2×</option><option value="1.5">1.5×</option></select></label>
      </div><div id="catalogAudioStatus" style="font-size:12px;color:#6d7480;margin-top:8px">Listo para escuchar</div></div>`;
  }

  function renderPages(paginas) {
    const cont = document.getElementById('catalogReaderPages');

    if (!paginas || !paginas.length) {
      cont.innerHTML =
        '<p>Este libro todavía no tiene contenido publicado.</p>';
      return;
    }

    prepararAudio(paginas);
    cont.innerHTML = controlesAudio() + paginas.map(p => {

      const imagen = p.imagen_data ? `
        <figure style="
          margin:20px 0;
          text-align:center;
        ">

          <img
            src="${p.imagen_data}"
            alt="${esc(p.imagen_pie || 'Imagen del libro')}"
            style="
              max-width:100%;
              max-height:520px;
              object-fit:contain;
              border-radius:8px;
            ">

          ${
            p.imagen_pie
              ? `
                <figcaption style="
                  font-size:13px;
                  color:#6d7480;
                  margin-top:8px;
                ">
                  ${esc(p.imagen_pie)}
                </figcaption>
              `
              : ''
          }

        </figure>
      ` : '';

      const texto = `
        <div style="
          white-space:pre-wrap;
          line-height:1.8;
          font-family:Georgia,serif;
          font-size:18px;
          color:#29251f;
        ">
          ${
            esc(p.contenido || '') ||
            '<em>Página en preparación.</em>'
          }
        </div>
      `;

      return `
        <article style="
          background:#fffdf8;
          border:1px solid #e5dfd2;
          border-radius:10px;
          padding:28px;
          margin:18px 0;
          min-height:300px;
        ">

          <div style="
            font-size:12px;
            letter-spacing:.12em;
            color:#9b7a37;
            text-transform:uppercase;
            margin-bottom:10px;
          ">
            Página ${p.numero}
          </div>

          ${
            p.titulo
              ? `
                <h3 style="
                  font-family:Georgia,serif;
                  color:#0b1b36;
                ">
                  ${esc(p.titulo)}
                </h3>
              `
              : ''
          }

          ${p.imagen_posicion === 'arriba' ? imagen : ''}

          ${texto}

          ${p.imagen_posicion === 'abajo' ? imagen : ''}

        </article>
      `;
    }).join('');
  }

  function renderCuentoManuel(paginasBD) {
    const textoOriginal = Array.isArray(window.CUENTO_MANUEL_TEXTO)
      ? window.CUENTO_MANUEL_TEXTO
      : [];
    const continuacion = (paginasBD || []).filter(p => Number(p.numero) >= 62);
    prepararAudio([...textoOriginal, ...continuacion]);
    const cont = document.getElementById('catalogReaderPages');

    if (!cont) return;

    let html = controlesAudio() + `
      <div style="
        padding:16px 18px;
        margin-bottom:22px;
        background:#eef5f8;
        border:1px solid #bfd5df;
        border-radius:8px;
      ">

        <b>Edición original protegida</b>

        <p style="margin:7px 0 0">
          Las páginas 1 a 61 corresponden a la edición original
          y se muestran sin modificar su composición.
        </p>

        <p style="margin:7px 0 0">
          La continuación editable comienza en la página 62.
        </p>
      </div>
    `;

    for (let numero = 1; numero <= 61; numero++) {

      const archivo =
        `pagina_${String(numero).padStart(3, '0')}.webp`;

      html += `
        <article style="
          background:#ece7dc;
          border:1px solid #d5cec0;
          border-radius:10px;
          padding:16px;
          margin:24px auto;
          text-align:center;
        ">

          <div style="
            font-size:12px;
            letter-spacing:.12em;
            color:#8a6d32;
            text-transform:uppercase;
            margin-bottom:12px;
          ">
            Página ${numero}
          </div>

          <img
            src="./${archivo}?v=word-20260903"
            alt="Cuento para Manuel página ${numero}"
            loading="lazy"
            style="
              display:block;
              width:100%;
              max-width:820px;
              height:auto;
              margin:0 auto;
              background:white;
              box-shadow:0 5px 18px rgba(0,0,0,.15);
            ">
          <div class="sr-only" aria-label="Texto de la página ${numero}">${(textoOriginal.find(x => Number(x.numero) === numero)?.contenido || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>

        </article>
      `;
    }

    const nuevas = (paginasBD || [])
      .filter(p => Number(p.numero) >= 62)
      .sort((a,b) => Number(a.numero) - Number(b.numero));

    if (nuevas.length) {

      html += `
        <div style="
          margin:40px 0 20px;
          padding:18px;
          background:#0b1b36;
          color:white;
          border-radius:8px;
        ">
          <b>Continuación de la obra</b>
        </div>
      `;

      nuevas.forEach(p => {

        const imagen = p.imagen_data ? `
          <figure style="
            margin:20px 0;
            text-align:center;
          ">

            <img
              src="${p.imagen_data}"
              alt="${esc(p.imagen_pie || 'Imagen del cuento')}"
              style="
                max-width:100%;
                max-height:520px;
                object-fit:contain;
                border-radius:8px;
              ">

            ${
              p.imagen_pie
                ? `
                  <figcaption style="
                    font-size:13px;
                    color:#6d7480;
                    margin-top:8px;
                  ">
                    ${esc(p.imagen_pie)}
                  </figcaption>
                `
                : ''
            }

          </figure>
        ` : '';

        html += `
          <article style="
            background:#fffdf8;
            border:1px solid #e5dfd2;
            border-radius:10px;
            padding:28px;
            margin:18px 0;
            min-height:300px;
          ">

            <div style="
              font-size:12px;
              letter-spacing:.12em;
              color:#9b7a37;
              text-transform:uppercase;
              margin-bottom:10px;
            ">
              Página ${p.numero}
            </div>

            ${
              p.titulo
                ? `
                  <h3 style="
                    font-family:Georgia,serif;
                    color:#0b1b36;
                  ">
                    ${esc(p.titulo)}
                  </h3>
                `
                : ''
            }

            ${p.imagen_posicion === 'arriba' ? imagen : ''}

            <div style="
              white-space:pre-wrap;
              line-height:1.8;
              font-family:Georgia,serif;
              font-size:18px;
              color:#29251f;
            ">
              ${
                esc(p.contenido || '') ||
                '<em>Página en preparación.</em>'
              }
            </div>

            ${p.imagen_posicion === 'abajo' ? imagen : ''}

          </article>
        `;
      });
    }

    cont.innerHTML = html;
  }

  async function leerLibro(
    libroId,
    titulo,
    gratis,
    precioDescarga
  ) {

    const c = client();

    if (!c) {
      alert('No se pudo conectar con Supabase.');
      return;
    }

    ensureReaderModal();

    if (esEdithAmigoEspecial(titulo)) {
      document.getElementById('catalogReaderTitle').textContent = 'La tecnología en tiempos de postpandemia';
      document.getElementById('catalogReaderNotice').textContent =
        'EXCLUSIVO · EN CONSTRUCCIÓN · El contenido de esta obra no está disponible para lectura y no tiene muestra de 5 páginas.';
      document.getElementById('catalogReaderPages').innerHTML =
        '<div style="padding:24px;border:1px solid #d6c39b;border-radius:10px;background:#fffaf0"><b>Obra de acceso exclusivo.</b><p>Actualmente se encuentra en construcción. Nadie puede leer su contenido ni sus primeras páginas.</p></div>';
      document.getElementById('catalogReaderModal').classList.add('open');
      document.body.style.overflow = 'hidden';
      return;
    }

    let data = [];
    let error = null;

    if (esCuentoManuel(titulo)) {

      const resultado = await c.rpc(
        'portal_leer_libro_completo_publico',
        {
          p_libro_id: libroId
        }
      );

      if (resultado.error) {

        const respaldo = await c.rpc(
          'portal_leer_muestra',
          {
            p_libro_id: libroId
          }
        );

        data = respaldo.data || [];
        error = respaldo.error;

      } else {

        data = resultado.data || [];
        error = resultado.error;
      }

    } else {

      const resultado = await c.rpc(
        'portal_leer_muestra',
        {
          p_libro_id: libroId
        }
      );

      data = resultado.data || [];
      error = resultado.error;
    }

    if (error) {
      alert(
        'No fue posible abrir el libro: ' +
        error.message
      );
      return;
    }

    // Cuenta una lectura real sólo cuando el contenido pudo abrirse.
    // Supabase evita duplicar la lectura del mismo visitante durante el mismo día.
    await registrarLectura(libroId);

    document.getElementById(
      'catalogReaderTitle'
    ).textContent = titulo;

    if (esCuentoManuel(titulo)) {

      document.getElementById(
        'catalogReaderNotice'
      ).textContent =
        'Lectura completa gratuita · Edición original de 61 páginas.';

      renderCuentoManuel(data);

    } else {

      document.getElementById(
        'catalogReaderNotice'
      ).textContent = gratis
        ? 'Lectura completa gratuita.'
        : 'Muestra gratuita: primeras 5 páginas. Para continuar se requiere acceso de pago.';

      renderPages(data);
    }

    if (precioDescarga) {

      document.getElementById(
        'catalogReaderPages'
      ).insertAdjacentHTML(
        'beforeend',
        `
          <div style="
            margin-top:25px;
            padding:20px;
            border:1px solid #d6c39b;
            border-radius:8px;
            background:#fffaf0;
          ">

            <b>
              Comprar la versión actual:
              $${Number(precioDescarga).toFixed(0)} MXN
            </b>

            <p style="margin:8px 0 0">
              La lectura en línea es gratuita.
              La compra corresponde a la versión
              existente de la obra en el momento
              de realizarla.
            </p>

          </div>
        `
      );
    }

    document
      .getElementById('catalogReaderModal')
      .classList
      .add('open');

    document.body.style.overflow = 'hidden';
  }

  function cerrarLectura() {
    detenerAudio();
    document
      .getElementById('catalogReaderModal')
      ?.classList
      .remove('open');

    document.body.style.overflow = '';
  }

  function makeCover(libro) {

    if (libro.portada_url) {

      const badge = libro.terminado
        ? 'LIBRO TERMINADO'
        : (
            libro.lectura_gratuita
              ? 'LECTURA GRATUITA'
              : 'ESCRIBIÉNDOSE AHORA'
          );

      return `
        <div
          class="cover image-cover"
          style="
            padding:0;
            position:relative;
            background:#f4f1e9;
            overflow:hidden;
          "
        >

          <span style="
            position:absolute;
            top:14px;
            left:14px;
            z-index:2;
            background:${
              libro.terminado
                ? '#2e7d5b'
                : 'rgba(11,27,54,.92)'
            };
            color:white;
            padding:8px 12px;
            border-radius:6px;
            font-size:11px;
            font-weight:800;
            letter-spacing:.11em;
          ">
            ${badge}
          </span>

          <img
            src="${esc(libro.portada_url)}"
            alt="Portada de ${esc(tituloPublico(libro.titulo))}"
            style="
              width:100%;
              height:100%;
              object-fit:cover;
              display:block;
            "
          >

        </div>
      `;
    }

    const label = libro.terminado
      ? 'LIBRO TERMINADO'
      : (
          libro.lectura_gratuita
            ? 'LECTURA GRATUITA'
            : 'ESCRIBIÉNDOSE AHORA'
        );

    return `
      <div class="cover">

        <small>${label}</small>

        <h3>${esc(tituloPublico(libro.titulo))}</h3>

        <span class="pseud">
          por ${esc(libro.autor_nombre || 'Autor')}
        </span>

      </div>
    `;
  }


  async function cargarComentariosPublicos(libroId, box) {
    const c=client(); if(!c || !box) return;
    const cont=box.querySelector('.comentarios-publicados');
    const {data,error}=await c.rpc('portal_comentarios_publicados',{p_libro_id:libroId});
    if(error){cont.innerHTML='<span class="legal">Comentarios disponibles próximamente.</span>';return;}
    cont.innerHTML=(data||[]).length ? data.map(x=>`
      <div style="background:#faf8f2;border-radius:8px;padding:10px;margin:7px 0">
        <b>${esc(x.nombre)}</b>
        <span class="legal"> · ${new Date(x.creado).toLocaleDateString('es-MX')}</span>
        <p style="margin:5px 0">${esc(x.comentario)}</p>
      </div>`).join('') : '<span class="legal">Aún no hay comentarios publicados.</span>';
  }

  async function enviarComentario(libroId, box) {
    const c=client(); if(!c) return;
    const nombre=box.querySelector('.comentario-nombre').value.trim();
    const comentario=box.querySelector('.comentario-texto').value.trim();
    const estado=box.querySelector('.comentario-estado');
    if(nombre.length<2 || comentario.length<3){estado.textContent='Escribe tu nombre o seudónimo y un comentario.';return;}
    estado.textContent='Enviando…';
    const {error}=await c.rpc('portal_enviar_comentario',{p_libro_id:libroId,p_nombre:nombre,p_comentario:comentario});
    if(error){estado.textContent='No fue posible enviar el comentario.';return;}
    box.querySelector('.comentario-texto').value='';
    estado.textContent='Comentario enviado. Quedará visible cuando la administración lo apruebe.';
  }

  async function cargarCatalogo() {

    const grid =
      document.getElementById('bookGrid');

    const c = client();

    if (!grid || !c) return;

    const {
      data: libros,
      error
    } = await c.rpc(
      'portal_listar_libros'
    );

    if (error) {
      console.error(
        'No fue posible cargar el catálogo:',
        error
      );
      return;
    }

    if (!libros || !libros.length) return;

    grid.innerHTML = '';

    libros.forEach(libro => {

      const totalBD =
        Number(libro.total_paginas || 0);

      const total =
        esCuentoManuel(libro.titulo)
          ? Math.max(
              61,
              totalBD
            )
          : totalBD;

      const edad =
        libro.edad_recomendada
          ? ` · Edad recomendada: ${esc(libro.edad_recomendada)}`
          : '';

      const exclusivo = esEdithAmigoEspecial(libro.titulo);

      const estado =
        exclusivo ? 'EXCLUSIVO · EN CONSTRUCCIÓN' : libro.terminado
          ? 'Libro terminado'
          : (
              libro.estado === 'terminado'
                ? 'Libro terminado'
                : 'Escribiéndose actualmente'
            );

      const lectura =
        exclusivo
          ? 'Sin acceso de lectura'
          : (libro.lectura_gratuita
              ? 'Lectura completa gratuita'
              : '5 páginas gratis');

      const download =
        libro.precio_descarga
          ? ` · Descarga $${Number(libro.precio_descarga).toFixed(0)} MXN`
          : '';

      const readLabel =
        exclusivo
          ? 'Ver estado de la obra'
          : (libro.lectura_gratuita
              ? 'Leer gratis'
              : 'Leer 5 páginas gratis');

      grid.insertAdjacentHTML(
        'beforeend',
        `
          <article
            class="book-card"
            data-libro-id="${libro.id}"
          >

            ${makeCover(libro)}

            <div class="card-body">

              <h3 style="
                font-family:Georgia,serif;
                color:var(--navy);
                margin:0 0 8px;
              ">
                ${esc(tituloPublico(libro.titulo))}
              </h3>

              <p style="
                margin:0 0 10px;
                color:#465064;
              ">
                <b>
                  por ${esc(libro.autor_nombre || 'Autor')}
                </b>
              </p>

              <p
                data-reading-count-for="${libro.id}"
                style="
                  margin:0 0 12px;
                  color:#8a6a2c;
                  font-size:13px;
                  font-weight:700;
                "
              >
                Cargando lecturas…
              </p>

              <div class="meta">

                <span>
                  ${estado}
                  ·
                  ${lectura}
                  ${download}
                  ${edad}
                </span>

                <span>
                  ${total}
                  página${total === 1 ? '' : 's'}
                </span>

              </div>

              <div class="progress">

                <i style="
                  width:${
                    libro.terminado
                      ? 100
                      : Math.min(
                          100,
                          Math.max(
                            5,
                            total
                          )
                        )
                  }%
                "></i>

              </div>

              <div class="comentarios-libro" data-comments-for="${libro.id}" style="margin-top:18px;padding-top:16px;border-top:1px solid #e5dfd2">
                <h4 style="margin:0 0 8px;color:#0b1b36">Comentarios de lectores</h4>
                <div class="comentarios-publicados" style="margin-bottom:12px"><span class="legal">Cargando comentarios…</span></div>
                <input class="comentario-nombre" maxlength="80" placeholder="Nombre o seudónimo" style="width:100%;padding:9px;margin:5px 0;border:1px solid #d9d2c5;border-radius:7px">
                <textarea class="comentario-texto" maxlength="1200" placeholder="Escribe tu comentario..." style="width:100%;min-height:90px;padding:9px;margin:5px 0;border:1px solid #d9d2c5;border-radius:7px"></textarea>
                <button class="btn outline js-enviar-comentario">Enviar comentario</button>
                <p class="legal comentario-estado" style="margin-top:7px">Los comentarios se publican después de ser revisados por la administración.</p>
              </div>

              <div class="card-actions">

                <button
                  class="btn navy js-leer-libro"
                >
                  ${readLabel}
                </button>

                <button
                  class="btn outline js-ver-libro"
                >
                  Ver libro
                </button>

              </div>

            </div>

          </article>
        `
      );

      const card =
        grid.lastElementChild;

      const abrir = () =>
        leerLibro(
          libro.id,
          libro.titulo,
          Boolean(
            libro.lectura_gratuita
          ),
          libro.precio_descarga
        );

      card
        .querySelector(
          '.js-leer-libro'
        )
        .onclick = abrir;

      card
        .querySelector(
          '.js-ver-libro'
        )
        .onclick = abrir;

      const commentsBox = card.querySelector('[data-comments-for]');
      cargarComentariosPublicos(libro.id, commentsBox);
      card.querySelector('.js-enviar-comentario').onclick = () =>
        enviarComentario(libro.id, commentsBox);
    });

    // Carga los contadores después de pintar las tarjetas para no retrasar el catálogo.
    Promise.all(
      libros.map(async libro => {
        const total = await obtenerLecturas(libro.id);
        actualizarContadorVisual(libro.id, total);
      })
    ).catch(err => console.warn('No fue posible cargar contadores de lectura', err));
  }

  window.PortalCatalogo = {
    cargarCatalogo,
    leerLibro,
    cerrarLectura,
    obtenerLecturas,
    registrarLectura,
    iniciarAudio, pausarAudio, continuarAudio, detenerAudio, cambiarVelocidadAudio
  };

  document.addEventListener(
    'DOMContentLoaded',
    () => {
      setTimeout(
        cargarCatalogo,
        250
      );
    }
  );

})();
