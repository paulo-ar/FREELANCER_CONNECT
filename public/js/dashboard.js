function dashboardProposalBadge(status) {
  return `<span class="badge ${proposalStatusClass(status)}" data-proposal-status-badge>${proposalStatusLabel(status)}</span>`;
}

function dashboardReceivedProposal(proposal) {
  return `
    <div class="row-item" data-proposal-row="${proposal.id}">
      <div class="stack">
        <div>
          ${userIdentity(proposal.users, 'Freelancer')}
          <p class="muted">${proposal.projects?.project_title || 'Proyecto'}</p>
        </div>
        <div class="inline">
          ${dashboardProposalBadge(proposal.proposal_status)}
          <span>${money(proposal.proposed_budget_amount)}</span>
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

function dashboardProjectRow(project) {
  return `
    <div class="row-item" data-project-row="${project.id}">
      <div>
        <strong>${project.project_title}</strong>
        <p class="muted">${project.project_status}</p>
      </div>
      <div class="inline">
        <a class="btn btn-outline" href="/project-details.html?id=${project.id}">Abrir</a>
        <button class="btn btn-danger" type="button" data-delete-project="${project.id}">Eliminar</button>
      </div>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', async () => {
  await requireAuth();
  const profile = await loadProfile();
  const dashboard = await apiFetch('/api/dashboard');
  const root = document.querySelector('[data-dashboard]');

  setText('[data-display-name]', profile.display_name);

  if (dashboard.role === 'client') {
    root.innerHTML = `
      <section class="grid-3">
        <div class="stat-card"><span class="muted">Proyectos abiertos</span><h2>${dashboard.openProjects || 0}</h2></div>
        <div class="stat-card"><span class="muted">Propuestas recibidas</span><h2>${dashboard.proposalsCount || 0}</h2></div>
        <div class="stat-card"><span class="muted">Accion principal</span><p><a class="btn btn-primary" href="/create-project.html">Publicar Proyecto</a></p></div>
      </section>
      <section class="card stack">
        <div class="section-head"><h2>Mis Proyectos</h2><a class="btn btn-outline" href="/projects.html">Explorar</a></div>
        <div class="list" data-client-projects>${dashboard.projects.map(dashboardProjectRow).join('') || '<div class="empty-state">Aun no hay proyectos publicados.</div>'}</div>
      </section>
      <section class="card stack">
        <div class="section-head"><h2>Propuestas recibidas</h2><p class="muted" data-proposal-status></p></div>
        <div class="list" data-received-proposals>${(dashboard.receivedProposals || []).map(dashboardReceivedProposal).join('') || '<div class="empty-state">Aun no has recibido propuestas.</div>'}</div>
      </section>
    `;

    root.querySelector('[data-client-projects]')?.addEventListener('click', async (event) => {
      const deleteButton = event.target.closest('[data-delete-project]');
      if (!deleteButton) return;

      const confirmed = window.confirm('Eliminar este proyecto tambien eliminara sus propuestas, conversaciones y mensajes. Esta accion no se puede deshacer.');
      if (!confirmed) return;

      deleteButton.disabled = true;
      try {
        await deleteProject(deleteButton.dataset.deleteProject);
        const row = deleteButton.closest('[data-project-row]');
        if (row) row.remove();
        if (!root.querySelector('[data-client-projects] [data-project-row]')) {
          root.querySelector('[data-client-projects]').innerHTML = '<div class="empty-state">Aun no hay proyectos publicados.</div>';
        }
      } catch (error) {
        alert(error.message);
        deleteButton.disabled = false;
      }
    });

    root.querySelector('[data-received-proposals]')?.addEventListener('click', async (event) => {
      const actionButton = event.target.closest('[data-proposal-action]');
      const chatButton = event.target.closest('[data-open-chat]');
      const status = root.querySelector('[data-proposal-status]');

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
          row.querySelector('[data-proposal-status-badge]').outerHTML = dashboardProposalBadge(updatedProposal.proposal_status);
          (updatedProposal.rejectedProposalIds || []).forEach((proposalId) => {
            const rejectedRow = root.querySelector(`[data-proposal-row="${proposalId}"]`);
            if (rejectedRow) rejectedRow.querySelector('[data-proposal-status-badge]').outerHTML = dashboardProposalBadge('rejected');
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
    return;
  }

  root.innerHTML = `
    <section class="grid-3">
      <div class="stat-card"><span class="muted">Propuestas enviadas</span><h2>${dashboard.proposalsSent || 0}</h2></div>
      <div class="stat-card"><span class="muted">Proyectos activos</span><h2>${dashboard.activeProjects || 0}</h2></div>
      <div class="stat-card"><span class="muted">Ganancias</span><h2>${money(dashboard.earnings)}</h2></div>
    </section>
    <section class="grid-2">
      <div class="card stack">
        <h2>Propuestas Recientes</h2>
        <div class="list">${dashboard.proposals.map((proposal) => `<div class="row-item"><div><strong>${proposal.projects?.project_title || 'Proyecto'}</strong><p class="muted">${userIdentity(proposal.projects?.users, 'Cliente')}</p></div><div class="inline">${dashboardProposalBadge(proposal.proposal_status)}<span>${money(proposal.proposed_budget_amount)}</span></div></div>`).join('') || '<div class="empty-state">No has enviado propuestas.</div>'}</div>
      </div>
      <div class="card stack">
        <h2>Proyectos Recomendados</h2>
        <div class="list">${dashboard.recommended.map((project) => `<div class="row-item"><div><strong>${project.project_title}</strong>${userIdentity(project.users, 'Cliente')}<p class="muted">${money(project.project_budget_minimum)} - ${money(project.project_budget_maximum)}</p></div><a class="btn btn-outline" href="/project-details.html?id=${project.id}">Ver</a></div>`).join('') || '<div class="empty-state">No hay recomendaciones disponibles.</div>'}</div>
      </div>
    </section>
  `;
});
