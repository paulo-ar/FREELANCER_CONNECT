const appState = {
  config: null,
  supabase: null,
  user: null,
  profile: null
};

async function loadConfig() {
  if (appState.config) return appState.config;
  const response = await fetch('/api/config');
  appState.config = await response.json();
  if (appState.config.supabaseUrl && appState.config.supabaseAnonKey && window.supabase) {
    appState.supabase = window.supabase.createClient(appState.config.supabaseUrl, appState.config.supabaseAnonKey);
  } else if (appState.config.supabaseUrl && appState.config.supabaseAnonKey) {
    console.error('No se cargo el SDK de Supabase. Revisa la conexion al CDN.');
  }
  return appState.config;
}

async function getSession() {
  await loadConfig();
  if (!appState.supabase) return null;
  const { data } = await appState.supabase.auth.getSession();
  appState.user = data.session?.user || null;
  return data.session;
}

async function apiFetch(path, options = {}) {
  const session = await getSession();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Request failed');
  return data;
}

function money(value) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value)) : '';
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
}

function profileUrl(userId) {
  return userId ? `/profile.html?id=${userId}` : '/profile.html';
}

function avatarUrl(user) {
  return user?.profile_picture_url || 'https://placehold.co/96x96/111827/f1f5f9?text=FC';
}

function userIdentity(user, fallback = 'Usuario') {
  return `
    <a class="user-link" href="${profileUrl(user?.id)}">
      <img class="avatar avatar-sm" src="${avatarUrl(user)}" alt="Foto de perfil de ${user?.display_name || fallback}">
      <span>${user?.display_name || fallback}</span>
    </a>
  `;
}

function proposalStatusLabel(status) {
  const labels = {
    accepted: 'Aceptada',
    rejected: 'Denegada',
    shortlisted: 'En espera',
    submitted: 'En espera'
  };

  return labels[status] || 'En espera';
}

function proposalStatusClass(status) {
  const classes = {
    accepted: 'badge-success',
    rejected: 'badge-danger',
    shortlisted: 'badge-warning',
    submitted: 'badge-warning'
  };

  return classes[status] || 'badge-warning';
}

function renderNav() {
  const nav = document.querySelector('[data-nav]');
  if (!nav) return;

  const authed = Boolean(appState.user);
  const role = appState.profile?.user_role;
  const createLink = role === 'client' ? '<a class="btn btn-primary" href="/create-project.html">Publicar</a>' : '';
  nav.innerHTML = `
    <a href="/projects.html">Proyectos</a>
    ${authed ? `${createLink}<a href="/dashboard.html">Dashboard${role ? ` ${role === 'client' ? 'Cliente' : 'Freelancer'}` : ''}</a><a href="/profile.html">Perfil</a><a href="/messages.html">Mensajes</a><button type="button" data-logout>Salir</button>` : '<a href="/login.html">Ingresar</a><a class="btn btn-primary" href="/register.html">Registrarse</a>'}
  `;

  nav.querySelector('[data-logout]')?.addEventListener('click', async () => {
    await appState.supabase.auth.signOut();
    window.location.href = '/login.html';
  });
}

function applyRoleVisibility() {
  const role = appState.profile?.user_role;
  document.querySelectorAll('[data-client-only]').forEach((node) => {
    node.hidden = role !== 'client';
  });
  document.querySelectorAll('[data-freelancer-only]').forEach((node) => {
    node.hidden = role !== 'freelancer';
  });
}

async function requireAuth() {
  const session = await getSession();
  if (session && !appState.profile) {
    await loadProfile().catch(() => null);
  }
  renderNav();
  applyRoleVisibility();
  if (!session) window.location.href = '/login.html';
  return session;
}

async function loadProfile() {
  if (appState.profile) return appState.profile;
  appState.profile = await apiFetch('/api/me');
  return appState.profile;
}

async function refreshProfile() {
  appState.profile = null;
  return loadProfile();
}

async function redirectToDashboard() {
  const profile = await refreshProfile();
  window.location.href = profile.user_role === 'client' ? '/dashboard.html?role=client' : '/dashboard.html?role=freelancer';
}

function canManageProject(project) {
  return appState.profile?.user_role === 'client' && project.client_id === appState.user?.id;
}

async function deleteProject(projectId) {
  return apiFetch(`/api/projects/${projectId}`, {
    method: 'DELETE',
    body: JSON.stringify({})
  });
}

function projectCard(project) {
  const skills = (project.project_skills_required || []).slice(0, 4).map((skill) => `<span class="badge">${skill}</span>`).join('');
  const deleteButton = canManageProject(project)
    ? `<button class="btn btn-danger" type="button" data-delete-project="${project.id}">Eliminar</button>`
    : '';

  return `
    <article class="project-card" data-project-card="${project.id}">
      <div class="stack">
        <div class="inline">
          <span class="badge badge-success">${project.project_status || 'open'}</span>
          <span class="badge">${project.project_budget_type}</span>
        </div>
        <div>
          <h3>${project.project_title}</h3>
          ${userIdentity(project.users, 'Cliente')}
          <p class="muted">${project.project_description}</p>
        </div>
      </div>
      <div class="stack">
        <div class="inline">${skills}</div>
        <div class="row-item">
          <strong>${money(project.project_budget_minimum)} - ${money(project.project_budget_maximum)}</strong>
          <div class="inline">
            <a class="btn btn-outline" href="/project-details.html?id=${project.id}">Ver</a>
            ${deleteButton}
          </div>
        </div>
      </div>
    </article>
  `;
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  await getSession();
  if (appState.user) {
    await loadProfile().catch(() => null);
  }
  renderNav();
  applyRoleVisibility();
});
