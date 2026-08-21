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

  function showLogin(role = 'administrador') {
    desiredRole = normalizeRole(role);
    const modal = get('secureLoginModal');
    if (!modal) { alert('No se encontró el formulario seguro en index.html.'); return; }

    const title = get('secureLoginTitle');
    const message = get('secureLoginMessage');
    if (title) title.textContent =
      desiredRole === 'administrador' ? 'Acceso administrativo' :
      desiredRole === 'autor' ? 'Acceso de autor' : 'Acceso de lector';

    if (message) message.textContent = configured()
      ? 'Ingresa con tu correo electrónico, NIP y contraseña.'
      : 'La conexión con Supabase no está disponible. Revisa config.js.';

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
    if (!configured()) { alert('No se pudo conectar con Supabase. Revisa config.js.'); return; }

    const email = (get('loginEmail')?.value || '').trim();
    const pin = (get('loginPin')?.value || '').trim();
    const password = get('loginPassword')?.value || '';

    if (!email || !pin || !password) {
      alert('Captura correo electrónico, NIP y contraseña.');
      return;
    }

    const c = client();

    const { data: authData, error: authError } =
      await c.auth.signInWithPassword({ email, password });

    if (authError) {
      alert('No fue posible iniciar sesión: ' + authError.message);
      return;
    }

    const { data: nipOk, error: nipError } =
      await c.rpc('verificar_nip', { p_nip: pin });

    if (nipError) {
      await c.auth.signOut();
      alert('No fue posible verificar el NIP: ' + nipError.message);
      return;
    }

    if (!nipOk) {
      await c.auth.signOut();
      alert('NIP incorrecto.');
      return;
    }

    const { data: perfil, error: perfilError } =
      await c.from('perfiles')
        .select('id,email,nombre,tipo_usuario,activo')
        .eq('id', authData.user.id)
        .single();

    if (perfilError || !perfil) {
      await c.auth.signOut();
      alert('La contraseña y el NIP fueron aceptados, pero no se pudo leer el perfil: ' +
            (perfilError ? perfilError.message : 'perfil no encontrado'));
      return;
    }

    if (!perfil.activo) {
      await c.auth.signOut();
      alert('Esta cuenta no está activa.');
      return;
    }

    if (perfil.tipo_usuario !== desiredRole) {
      await c.auth.signOut();
      alert('Esta cuenta corresponde a "' + perfil.tipo_usuario +
            '" y no al acceso "' + desiredRole + '".');
      return;
    }

    closeLogin();
    renderPanel(perfil);
  }

  async function logout() {
    if (configured()) await client().auth.signOut();
    const panel = get('panel-usuario');
    if (panel) panel.style.display = 'none';
  }

  function renderPanel(perfil) {
    const panel = get('panel-usuario');
    if (!panel) return;
    panel.style.display = 'block';

    const title = get('panelTitle');
    if (title) title.textContent =
      perfil.tipo_usuario === 'administrador' ? 'Panel administrativo' :
      perfil.tipo_usuario === 'autor' ? 'Panel del autor' : 'Panel del lector';

    const subtitle = get('panelSubtitle');
    if (subtitle) subtitle.textContent = 'Sesión de ' + (perfil.nombre || perfil.email || 'usuario');

    const content = get('panelContent');
    if (content && perfil.tipo_usuario === 'administrador') {
      content.innerHTML = `
        <div class="cards">
          <article class="book-card"><div class="card-body"><h3>Administración activa</h3><p>Tu acceso de Administradora Principal fue validado correctamente.</p></div></article>
          <article class="book-card"><div class="card-body"><h3>Usuarios</h3><p>Desde aquí integraremos lectores, autores y los otros cuatro administradores.</p></div></article>
          <article class="book-card"><div class="card-body"><h3>Autores y pagos</h3><p>Este panel incorporará las participaciones del 20% y las liquidaciones bimestrales.</p></div></article>
        </div>`;
    }

    panel.scrollIntoView({ behavior:'smooth' });
  }

  window.PortalAuth = { showLogin, closeLogin, login, logout };

  document.addEventListener('DOMContentLoaded', async function () {
    const top = get('topSecureLogin');
    if (top) top.onclick = () => showLogin('administrador');

    document.querySelectorAll('button').forEach(function (btn) {
      const t = btn.textContent.trim();
      if (t === 'Acceso administrativo' || t === 'Ver acceso administrativo') {
        btn.onclick = () => showLogin('administrador');
      }
    });

    if (!configured()) return;

    const { data } = await client().auth.getSession();
    if (!data.session) return;

    const { data: perfil } =
      await client().from('perfiles')
        .select('id,email,nombre,tipo_usuario,activo')
        .eq('id', data.session.user.id)
        .single();

    if (perfil && perfil.activo) renderPanel(perfil);
  });
})();