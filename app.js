function () {
  const cfg = window.PORTAL_CONFIG || {};
  let sb = null;
  let desiredRole = 'administrador';

  const $ = (id) => document.getElementById(id);

  const configured = () =>
    !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);

  const client = () => {
    if (!configured()) return null;

    if (!sb) {
      sb = window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY
      );
    }

    return sb;
  };

  async function showLogin(role = 'administrador') {

    const normalized = {
      reader: 'lector',
      author: 'autor',
      admin: 'administrador'
    };

    desiredRole = normalized[role] || role;

    const titles = {
      lector: 'Acceso de lector',
      autor: 'Acceso de autor',
      administrador: 'Acceso administrativo'
    };

    document.getElementById('secureLoginTitle').textContent =
      titles[desiredRole] || 'Acceso seguro';

    document.getElementById('secureLoginMessage').textContent =
      configured()
        ? 'Ingresa con tu correo electrónico, NIP y contraseña.'
        : 'Falta conectar Supabase en config.js.';

    document
      .getElementById('secureLoginModal')
      .classList.add('open');

    document.body.style.overflow = 'hidden';
  }

  function closeLogin() {
    document
      .getElementById('secureLoginModal')
      .classList.remove('open');

    document.body.style.overflow = '';
  }

  async function login() {

    if (!configured()) {
      alert('Falta conectar Supabase en config.js.');
      return;
    }

    const email =
      document.getElementById('loginEmail').value.trim();

    const pin =
      document.getElementById('loginPin').value.trim();

    const password =
      document.getElementById('loginPassword').value;

    if (!email || !pin || !password) {
      alert('Captura correo, NIP y contraseña.');
      return;
    }

    const c = client();

    const { data, error } =
      await c.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      alert(
        'No fue posible iniciar sesión: ' +
        error.message
      );
      return;
    }

    const { data: nipOk, error: nipError } =
      await c.rpc(
        'verificar_nip',
        { p_nip: pin }
      );

    if (nipError || !nipOk) {

      await c.auth.signOut();

      alert('NIP incorrecto.');

      return;
    }

    const { data: perfil, error: perfilError } =
      await c
        .from('perfiles')
        .select(
          'id,email,nombre,tipo_usuario,activo'
        )
        .eq('id', data.user.id)
        .single();

    if (perfilError || !perfil) {

      await c.auth.signOut();

      alert(
        'No se pudo consultar tu perfil.'
      );

      return;
    }

    if (perfil.tipo_usuario !== desiredRole) {

      await c.auth.signOut();

      alert(
        'Esta cuenta no corresponde al tipo de acceso seleccionado.'
      );

      return;
    }

    if (!perfil.activo) {

      await c.auth.signOut();

      alert('Tu cuenta no está activa.');

      return;
    }

    closeLogin();

    renderPanel(perfil);
  }

  async function logout() {

    if (configured()) {
      await client().auth.signOut();
    }

    document.getElementById(
      'panel-usuario'
    ).style.display = 'none';
  }

  function renderPanel(perfil) {

    document.getElementById(
      'panel-usuario'
    ).style.display = 'block';

    document.getElementById(
      'panelTitle'
    ).textContent =
      perfil.tipo_usuario === 'administrador'
        ? 'Panel administrativo'
        : perfil.tipo_usuario === 'autor'
        ? 'Panel del autor'
        : 'Panel del lector';

    document.getElementById(
      'panelSubtitle'
    ).textContent =
      'Sesión de ' +
      (perfil.nombre ||
        perfil.email ||
        'usuario');

    location.hash = 'panel-usuario';
  }

  window.PortalAuth = {
    showLogin,
    closeLogin,
    login,
    logout
  };

  document.addEventListener(
    'DOMContentLoaded',
    async () => {

      const oldLoginButton =
        document.querySelector(
          '[data-open="login"]'
        );

      if (oldLoginButton) {

        oldLoginButton.removeAttribute(
          'data-open'
        );

        oldLoginButton.addEventListener(
          'click',
          () =>
            showLogin(
              'administrador'
            )
        );
      }

      document
        .querySelectorAll('button')
        .forEach((btn) => {

          if (
            btn.textContent.trim() ===
            'Ver acceso administrativo'
          ) {

            btn.onclick = () =>
              showLogin(
                'administrador'
              );
          }
        });

      if (!configured()) return;

      const { data: sessionData } =
        await client()
          .auth
          .getSession();

      if (!sessionData.session) return;

      const { data: perfil } =
        await client()
          .from('perfiles')
          .select(
            'id,email,nombre,tipo_usuario,activo'
          )
          .eq(
            'id',
            sessionData.session.user.id
          )
          .single();

      if (
        perfil &&
        perfil.activo
      ) {
        renderPanel(perfil);
      }
    }
  );
})();
