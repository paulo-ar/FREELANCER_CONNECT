async function loadProjects() {
  const list = document.querySelector('[data-project-list]');
  if (!list) return;

  const params = new URLSearchParams();
  const q = document.querySelector('[name="q"]')?.value.trim();
  const category = document.querySelector('[name="category"]')?.value.trim();
  const maxBudget = document.querySelector('[name="maxBudget"]')?.value.trim();

  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (maxBudget) params.set('maxBudget', maxBudget);

  const projects = await apiFetch(`/api/projects?${params.toString()}`);
  list.innerHTML = projects.length ? projects.map(projectCard).join('') : '<div class="empty-state">No se encontraron proyectos.</div>';
}

async function handleProjectDelete(projectId, { redirect = false } = {}) {
  if (!projectId) return;
  const confirmed = window.confirm('Eliminar este proyecto tambien eliminara sus propuestas, conversaciones y mensajes. Esta accion no se puede deshacer.');
  if (!confirmed) return;

  await deleteProject(projectId);

  if (redirect) {
    window.location.href = '/dashboard.html';
    return;
  }

  const card = document.querySelector(`[data-project-card="${projectId}"]`);
  if (card) card.remove();

  if (document.querySelector('[data-project-list]')) {
    await loadProjects();
  }
}

function ensureProjectPopup() {
  let popup = document.querySelector('[data-project-popup]');
  if (popup) {
    bindProjectPopupClose(popup);
    return popup;
  }

  popup = document.createElement('div');
  popup.className = 'modal-backdrop';
  popup.hidden = true;
  popup.dataset.projectPopup = '';
  popup.innerHTML = `
    <section class="modal stack" role="dialog" aria-modal="true" aria-labelledby="project-popup-title">
      <div class="inline">
        <div class="modal-status" data-project-popup-icon></div>
        <div>
          <h2 id="project-popup-title" data-project-popup-title></h2>
          <p class="muted" data-project-popup-message></p>
        </div>
      </div>
      <div class="inline" data-project-popup-actions></div>
    </section>
  `;
  document.body.appendChild(popup);
  bindProjectPopupClose(popup);

  return popup;
}

function bindProjectPopupClose(popup) {
  if (popup.dataset.bound === 'true') return;

  popup.addEventListener('click', (event) => {
    if (event.target === popup) popup.hidden = true;
  });
  popup.dataset.bound = 'true';
}

function showProjectPopup({ type, title, message, projectId }) {
  const popup = ensureProjectPopup();
  const icon = popup.querySelector('[data-project-popup-icon]');
  const actions = popup.querySelector('[data-project-popup-actions]');

  icon.textContent = type === 'success' ? 'OK' : '!';
  icon.className = `modal-status ${type}`;
  popup.querySelector('[data-project-popup-title]').textContent = title;
  popup.querySelector('[data-project-popup-message]').textContent = message;

  actions.innerHTML = type === 'success'
    ? `
      <a class="btn btn-primary" href="/project-details.html?id=${projectId}">Ver proyecto</a>
      <a class="btn btn-outline" href="/dashboard.html">Mis proyectos</a>
      <button class="btn btn-outline" type="button" data-close-popup>Cerrar</button>
    `
    : '<button class="btn btn-primary" type="button" data-close-popup>Entendido</button>';

  actions.querySelector('[data-close-popup]')?.addEventListener('click', () => {
    popup.hidden = true;
  });
  popup.hidden = false;
}

function buildProjectPayload(form) {
  return {
    project_title: String(form.get('project_title') || '').trim(),
    project_description: String(form.get('project_description') || '').trim(),
    project_category_identifier: String(form.get('project_category_identifier') || '').trim(),
    project_budget_type: form.get('project_budget_type'),
    project_budget_minimum: Number(form.get('project_budget_minimum')),
    project_budget_maximum: Number(form.get('project_budget_maximum')),
    project_duration_estimate: String(form.get('project_duration_estimate') || '').trim(),
    project_experience_level: form.get('project_experience_level'),
    project_skills_required: String(form.get('project_skills_required') || '')
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean)
  };
}

function validateProjectPayload(payload) {
  if (!payload.project_title) return 'Escribe el titulo del proyecto.';
  if (!payload.project_description) return 'Escribe la descripcion del proyecto.';
  if (!payload.project_category_identifier) return 'Indica una categoria.';
  if (!['fixed', 'hourly'].includes(payload.project_budget_type)) return 'Selecciona un tipo de presupuesto valido.';
  if (!Number.isFinite(payload.project_budget_minimum) || payload.project_budget_minimum <= 0) return 'El presupuesto minimo debe ser mayor a 0.';
  if (!Number.isFinite(payload.project_budget_maximum) || payload.project_budget_maximum <= 0) return 'El presupuesto maximo debe ser mayor a 0.';
  if (payload.project_budget_maximum < payload.project_budget_minimum) return 'El presupuesto maximo no puede ser menor al minimo.';
  if (!['entry', 'intermediate', 'expert'].includes(payload.project_experience_level)) return 'Selecciona un nivel de experiencia valido.';
  if (!payload.project_skills_required.length) return 'Agrega al menos una skill requerida.';
  return null;
}

function setProjectSubmitting(form, isSubmitting) {
  const submitButton = form.querySelector('button[type="submit"]');
  if (!submitButton) return;

  submitButton.disabled = isSubmitting;
  submitButton.textContent = isSubmitting ? 'Publicando...' : 'Publicar';
}

function proposalStatusBadge(status) {
  return `<span class="badge ${proposalStatusClass(status)}" data-proposal-status-badge>${proposalStatusLabel(status)}</span>`;
}

function proposalReceivedCard(proposal) {
  return `
    <div class="row-item" data-proposal-row="${proposal.id}">
      <div class="stack">
        <div>
          ${userIdentity(proposal.users, 'Freelancer')}
          <p class="muted">${proposal.proposal_cover_letter}</p>
        </div>
        <div class="inline">
          ${proposalStatusBadge(proposal.proposal_status)}
          <span>${money(proposal.proposed_budget_amount)}</span>
          <span class="muted">${proposal.proposed_duration_days} dias</span>
        </div>
      </div>
      <div class="inline">
        <button class="btn btn-outline" type="button" data-proposal-action="accepted" data-proposal-id="${proposal.id}">Aceptar</button>
        <button class="btn btn-outline" type="button" data-proposal-action="rejected" data-proposal-id="${proposal.id}">Denegar</button>
        <button class="btn btn-primary" type="button" data-open-chat data-proposal-id="${proposal.id}">Abrir chat</button>
      </div>
    </div>
  `;
}

function setProjectStatus(message, className) {
  const status = document.querySelector('[data-status]');
  if (!status) return;

  status.textContent = message;
  status.className = className;
}

async function handleCreateProjectSubmit(event) {
  event.preventDefault();
  const formNode = event.currentTarget;

  try {
    await loadConfig();
    if (!appState.supabase) {
      const message = 'No se cargo Supabase. Revisa tu conexion o la etiqueta del SDK en el HTML.';
      setProjectStatus(message, 'error');
      showProjectPopup({ type: 'error', title: 'Configuracion incompleta', message });
      return;
    }

    const session = await requireAuth();
    if (!session) return;

    const profile = await loadProfile();
    if (profile.user_role !== 'client') {
      const message = 'Solo las cuentas de cliente pueden publicar proyectos.';
      setProjectStatus(message, 'error');
      showProjectPopup({
        type: 'error',
        title: 'Accion no permitida',
        message
      });
      return;
    }

    const form = new FormData(formNode);
    const payload = buildProjectPayload(form);
    const validationError = validateProjectPayload(payload);

    if (validationError) {
      setProjectStatus(validationError, 'error');
      showProjectPopup({
        type: 'error',
        title: 'Datos incompletos',
        message: validationError
      });
      return;
    }

    setProjectSubmitting(formNode, true);
    setProjectStatus('', '');
    const project = await apiFetch('/api/projects', { method: 'POST', body: JSON.stringify(payload) });
    formNode.reset();
    setProjectStatus('Proyecto publicado y guardado.', 'success');

    if (document.querySelector('[data-project-list]')) {
      await loadProjects();
    }

    showProjectPopup({
      type: 'success',
      title: 'Proyecto publicado',
      message: 'El proyecto se guardo correctamente en la base de datos y ya puede verse en Proyectos.',
      projectId: project.id
    });
  } catch (error) {
    setProjectStatus(error.message, 'error');
    showProjectPopup({
      type: 'error',
      title: 'No se pudo publicar',
      message: error.message || 'Revisa los datos del proyecto e intentalo de nuevo.'
    });
  } finally {
    setProjectSubmitting(formNode, false);
  }
}

function bindCreateProjectForm() {
  const createForm = document.querySelector('[data-create-project-form]');
  if (!createForm || createForm.dataset.bound === 'true') return;

  createForm.addEventListener('submit', handleCreateProjectSubmit);
  document.querySelector('[data-publish-project]')?.addEventListener('click', () => {
    setProjectStatus('', '');
  });
  createForm.dataset.bound = 'true';
}

document.addEventListener('DOMContentLoaded', async () => {
  bindCreateProjectForm();

  try {
    await getSession();
    if (appState.user) {
      await loadProfile().catch(() => null);
      renderNav();
      applyRoleVisibility();
    }

    if (document.querySelector('[data-project-list]')) {
      await loadProjects();
    }

    document.querySelector('[data-project-list]')?.addEventListener('click', async (event) => {
      const deleteButton = event.target.closest('[data-delete-project]');
      if (!deleteButton) return;

      deleteButton.disabled = true;
      try {
        await handleProjectDelete(deleteButton.dataset.deleteProject);
      } catch (error) {
        alert(error.message);
        deleteButton.disabled = false;
      }
    });

    document.querySelector('[data-project-filters]')?.addEventListener('keyup', loadProjects);
    document.querySelector('[data-project-filters]')?.addEventListener('change', loadProjects);
  } catch (error) {
    if (document.querySelector('[data-create-project-form]')) {
      setProjectStatus(error.message, 'error');
    }
  }

  const createForm = document.querySelector('[data-create-project-form]');

  if (createForm) {
    const session = await getSession().catch(() => null);
    const profile = session ? await loadProfile().catch(() => null) : null;

    if (!session) {
      setProjectStatus('Inicia sesion como cliente para publicar proyectos.', 'error');
    } else if (profile?.user_role !== 'client') {
      setProjectStatus('Solo las cuentas de cliente pueden publicar proyectos.', 'error');
    }
  }

  const detailRoot = document.querySelector('[data-project-detail]');
  if (detailRoot) {
    await requireAuth();
    const profile = await loadProfile();
    const project = await apiFetch(`/api/projects/${getQueryParam('id')}`);
    const isOwner = project.client_id === appState.user.id;
    const isFreelancer = profile.user_role === 'freelancer';
    const ownProposal = (project.proposals || []).find((proposal) => proposal.freelancer_id === appState.user.id);

    detailRoot.innerHTML = `
      <section class="card stack">
        <div class="section-head">
          <div>
            <span class="badge badge-success">${project.project_status}</span>
            <h1>${project.project_title}</h1>
            <div class="inline project-owner">
              ${userIdentity(project.users, 'Cliente')}
              <span class="muted">Publicado el ${formatDate(project.created_at)}</span>
            </div>
          </div>
          <div class="stack">
            <strong>${money(project.project_budget_minimum)} - ${money(project.project_budget_maximum)}</strong>
            ${isOwner ? `<button class="btn btn-danger" type="button" data-delete-project="${project.id}">Eliminar proyecto</button>` : ''}
          </div>
        </div>
        <p>${project.project_description}</p>
        <div class="inline">${(project.project_skills_required || []).map((skill) => `<span class="badge">${skill}</span>`).join('')}</div>
      </section>
      ${isFreelancer && !isOwner && ownProposal ? `
        <section class="card stack">
          <div class="section-head">
            <div>
              <h2>Tu propuesta</h2>
              <p class="muted">${ownProposal.proposal_cover_letter}</p>
            </div>
            ${proposalStatusBadge(ownProposal.proposal_status)}
          </div>
          <div class="inline">
            <span>${money(ownProposal.proposed_budget_amount)}</span>
            <span class="muted">${ownProposal.proposed_duration_days} dias</span>
          </div>
        </section>` : ''}
      ${isFreelancer && !isOwner && !ownProposal ? `
        <section class="card stack">
          <h2>Enviar Propuesta</h2>
          <form class="stack" data-proposal-form>
            <input type="hidden" name="project_id" value="${project.id}">
            <div class="grid-2">
              <label>Presupuesto propuesto<input class="input-dark" name="proposed_budget_amount" type="number" min="1" required></label>
              <label>Dias estimados<input class="input-dark" name="proposed_duration_days" type="number" min="1" required></label>
            </div>
            <label>Carta de presentacion<textarea class="input-dark" name="proposal_cover_letter" required></textarea></label>
            <button class="btn btn-primary" type="submit">Enviar propuesta</button>
            <p data-status></p>
          </form>
        </section>` : ''}
      ${isOwner ? `
        <section class="card stack">
          <div class="section-head">
            <h2>Propuestas recibidas</h2>
            <p class="muted" data-proposal-status></p>
          </div>
          <div class="list" data-proposals-list>${(project.proposals || []).map(proposalReceivedCard).join('') || '<div class="empty-state">Aun no hay propuestas.</div>'}</div>
        </section>` : ''}
    `;

    detailRoot.querySelector('[data-delete-project]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await handleProjectDelete(button.dataset.deleteProject, { redirect: true });
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    });

    detailRoot.querySelector('[data-proposals-list]')?.addEventListener('click', async (event) => {
      const actionButton = event.target.closest('[data-proposal-action]');
      const chatButton = event.target.closest('[data-open-chat]');
      const status = detailRoot.querySelector('[data-proposal-status]');

      if (actionButton) {
        const row = actionButton.closest('[data-proposal-row]');
        const action = actionButton.dataset.proposalAction;
        status.textContent = action === 'accepted' ? 'Aceptando propuesta...' : 'Denegando propuesta...';
        status.className = 'muted';

        try {
          const updatedProposal = await apiFetch(`/api/proposals/${actionButton.dataset.proposalId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: action })
          });
          row.querySelector('[data-proposal-status-badge]').outerHTML = proposalStatusBadge(updatedProposal.proposal_status);
          (updatedProposal.rejectedProposalIds || []).forEach((proposalId) => {
            const rejectedRow = detailRoot.querySelector(`[data-proposal-row="${proposalId}"]`);
            if (rejectedRow) rejectedRow.querySelector('[data-proposal-status-badge]').outerHTML = proposalStatusBadge('rejected');
          });
          status.textContent = action === 'accepted' ? 'Propuesta aceptada.' : 'Propuesta denegada.';
          status.className = 'success';
        } catch (error) {
          status.textContent = error.message;
          status.className = 'error';
        }
        return;
      }

      if (chatButton) {
        status.textContent = 'Creando conversacion...';
        status.className = 'muted';

        try {
          const conversation = await apiFetch(`/api/proposals/${chatButton.dataset.proposalId}/conversation`, {
            method: 'POST',
            body: JSON.stringify({})
          });
          window.location.href = `/messages.html?conversation=${conversation.id}`;
        } catch (error) {
          status.textContent = error.message;
          status.className = 'error';
        }
      }
    });

    document.querySelector('[data-proposal-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = document.querySelector('[data-status]');
      const form = new FormData(event.currentTarget);
      try {
        await apiFetch('/api/proposals', {
          method: 'POST',
          body: JSON.stringify({
            project_id: form.get('project_id'),
            proposed_budget_amount: Number(form.get('proposed_budget_amount')),
            proposed_duration_days: Number(form.get('proposed_duration_days')),
            proposal_cover_letter: form.get('proposal_cover_letter')
          })
        });
        status.textContent = 'Propuesta enviada.';
        status.className = 'success';
      } catch (error) {
        status.textContent = error.message;
        status.className = 'error';
      }
    });
  }
});
