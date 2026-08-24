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

  function renderPages(paginas) {
    const cont = document.getElementById('catalogReaderPages');

    if (!paginas || !paginas.length) {
      cont.innerHTML =
        '<p>Este libro todavía no tiene contenido publicado.</p>';
      return;
    }

    cont.innerHTML = paginas.map(p => {

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
    const cont = document.getElementById('catalogReaderPages');

    if (!cont) return;

    let html = `
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
            src="./${archivo}"
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
            alt="Portada de ${esc(libro.titulo)}"
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

        <h3>${esc(libro.titulo)}</h3>

        <span class="pseud">
          por ${esc(libro.autor_nombre || 'Autor')}
        </span>

      </div>
    `;
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

      const estado =
        libro.terminado
          ? 'Libro terminado'
          : (
              libro.estado === 'terminado'
                ? 'Libro terminado'
                : 'Escribiéndose actualmente'
            );

      const lectura =
        libro.lectura_gratuita
          ? 'Lectura completa gratuita'
          : '5 páginas gratis';

      const download =
        libro.precio_descarga
          ? ` · Descarga $${Number(libro.precio_descarga).toFixed(0)} MXN`
          : '';

      const readLabel =
        libro.lectura_gratuita
          ? 'Leer gratis'
          : 'Leer 5 páginas gratis';

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
                ${esc(libro.titulo)}
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
    registrarLectura
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
