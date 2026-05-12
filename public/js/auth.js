document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  const missingConfig = !appState.supabase;

  const loginForm = document.querySelector('[data-login-form]');
  const registerForm = document.querySelector('[data-register-form]');
  const forgotForm = document.querySelector('[data-forgot-form]');
  const roleInput = document.querySelector('[name="user_role"]');

  document.querySelectorAll('[data-role-card]').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('[data-role-card]').forEach((item) => item.setAttribute('aria-pressed', 'false'));
      card.setAttribute('aria-pressed', 'true');
      roleInput.value = card.dataset.roleCard;
    });
  });

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('[data-status]');
    if (missingConfig) {
      status.textContent = 'Configura SUPABASE_URL y SUPABASE_ANON_KEY en .env para autenticar.';
      status.className = 'error';
      return;
    }
    const form = new FormData(loginForm);
    const { error } = await appState.supabase.auth.signInWithPassword({
      email: form.get('email'),
      password: form.get('password')
    });

    if (error) {
      status.textContent = error.message;
      status.className = 'error';
      return;
    }
    try {
      await redirectToDashboard();
    } catch (error) {
      status.textContent = error.message;
      status.className = 'error';
    }
  });

  registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('[data-status]');
    if (missingConfig) {
      status.textContent = 'Configura SUPABASE_URL y SUPABASE_ANON_KEY en .env para registrar usuarios.';
      status.className = 'error';
      return;
    }
    const form = new FormData(registerForm);

    if (form.get('password') !== form.get('confirm_password')) {
      status.textContent = 'Las contrasenas no coinciden.';
      status.className = 'error';
      return;
    }

    const { error } = await appState.supabase.auth.signUp({
      email: form.get('email'),
      password: form.get('password'),
      options: {
        data: {
          display_name: form.get('display_name'),
          user_role: form.get('user_role')
        }
      }
    });

    if (error) {
      status.textContent = error.message;
      status.className = 'error';
      return;
    }

    const session = await getSession();
    if (session) {
      await redirectToDashboard();
      return;
    }

    status.textContent = 'Cuenta creada. Revisa tu correo si Supabase requiere confirmacion.';
    status.className = 'success';
  });

  forgotForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('[data-status]');
    if (missingConfig) {
      status.textContent = 'Configura SUPABASE_URL y SUPABASE_ANON_KEY en .env para recuperar contrasenas.';
      status.className = 'error';
      return;
    }
    const form = new FormData(forgotForm);
    const { error } = await appState.supabase.auth.resetPasswordForEmail(form.get('email'), {
      redirectTo: `${window.location.origin}/login.html`
    });

    status.textContent = error ? error.message : 'Correo de recuperacion enviado.';
    status.className = error ? 'error' : 'success';
  });
});
