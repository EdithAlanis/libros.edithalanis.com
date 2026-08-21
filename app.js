(function () {
  const cfg = window.PORTAL_CONFIG || {};
  let sb = null;
  let desiredRole = 'administrador';

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
    return { admin:'administrador', author:'autor', reader:'lector' }[role] || role;
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
        desiredRole === 'autor' ? 'Acceso de autor' : 'Acceso de lector';
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

    if (perfil.tipo_usuario !== desiredRole) {
      alert(
        'Esta cuenta corresponde a "' +
        perfil.tipo_usuario +
        '" y no al acceso "' +
        desiredRole +
        '".'
      );
      return;
    }

    closeLogin();
    renderPanel(perfil);
  }

  function logout() {
    const panel = get('panel-usuario');
    if (panel) panel.style.display = 'none';
    if (get('loginEmail')) get('loginEmail').value = '';
    if (get('loginPin')) get('loginPin').value = '';
  }

  function renderPanel(perfil) {
    const panel = get('panel-usuario');
    if (!panel) return;

    panel.style.display = 'block';

    const title = get('panelTitle');
    if (title) {
      title.textContent =
        perfil.tipo_usuario === 'administrador' ? 'Panel administrativo' :
        perfil.tipo_usuario === 'autor' ? 'Panel del autor' : 'Panel del lector';
    }

    const subtitle = get('panelSubtitle');
    if (subtitle) {
      subtitle.textContent = 'Sesión de ' + (perfil.nombre || perfil.email || 'usuario');
    }

    const content = get('panelContent');

    if (content && perfil.tipo_usuario === 'administrador') {
      content.innerHTML = `
        <div class="cards">
          <article class="book-card"><div class="card-body">
            <h3>Administración activa</h3>
            <p>Tu acceso de Administradora Principal fue validado correctamente mediante correo y NIP.</p>
          </div></article>
          <article class="book-card"><div class="card-body">
            <h3>Usuarios</h3>
            <p>Desde aquí integraremos lectores, autores y los demás administradores.</p>
          </div></article>
          <article class="book-card"><div class="card-body">
            <h3>Autores y pagos</h3>
            <p>Este panel incorporará las participaciones del 20% y las liquidaciones bimestrales.</p>
          </div></article>
        </div>`;
    }

    panel.scrollIntoView({ behavior:'smooth' });
  }

  window.PortalAuth = { showLogin, closeLogin, login, logout };

  document.addEventListener('DOMContentLoaded', function () {
    hidePasswordField();

    const top = get('topSecureLogin');
    if (top) top.onclick = () => showLogin('administrador');

    document.querySelectorAll('button').forEach(function (btn) {
      const t = btn.textContent.trim();
      if (t === 'Acceso administrativo' || t === 'Ver acceso administrativo') {
        btn.onclick = () => showLogin('administrador');
      }
    });
  });
})();