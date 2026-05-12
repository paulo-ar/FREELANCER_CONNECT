document.addEventListener('DOMContentLoaded', async () => {
  await requireAuth();
  const ownProfile = await loadProfile();
  const requestedProfileId = getQueryParam('id');
  const isOwnProfile = !requestedProfileId || requestedProfileId === appState.user.id;
  const profile = isOwnProfile ? ownProfile : await apiFetch(`/api/users/${requestedProfileId}`);
  const root = document.querySelector('[data-profile]');
  const freelancer = profile.freelancer_profiles?.[0] || profile.freelancer_profiles || {};
  const client = profile.client_profiles?.[0] || profile.client_profiles || {};

  if (!isOwnProfile) {
    root.innerHTML = `
      <section class="profile-grid">
        <aside class="card stack">
          <img class="avatar" src="${avatarUrl(profile)}" alt="Foto de perfil de ${profile.display_name || 'Usuario'}">
          <div>
            <h1>${profile.display_name || 'Usuario'}</h1>
            <p class="muted">${profile.user_role === 'client' ? 'Cliente' : 'Freelancer'}</p>
          </div>
        </aside>
        <section class="card stack">
          ${profile.user_role === 'client' ? `
            <div class="section-head">
              <div>
                <h2>${client.company_name || 'Cliente'}</h2>
                <p class="muted">${client.company_industry || ''}</p>
              </div>
            </div>
            <p>${client.company_description || 'Este cliente aun no ha agregado una descripcion.'}</p>
            ${client.company_size ? `<span class="badge">${client.company_size}</span>` : ''}
          ` : `
            <div class="section-head">
              <div>
                <h2>${freelancer.professional_title || 'Freelancer'}</h2>
                <p class="muted">${freelancer.location_country_city || ''}</p>
              </div>
              ${freelancer.hourly_rate ? `<strong>${money(freelancer.hourly_rate)} / hora</strong>` : ''}
            </div>
            <p>${freelancer.biography || 'Este freelancer aun no ha agregado una biografia.'}</p>
            <div class="inline">${(freelancer.skills || []).map((skill) => `<span class="badge">${skill}</span>`).join('')}</div>
            <span class="badge">${freelancer.availability_status || 'available'}</span>
          `}
        </section>
      </section>
    `;
    return;
  }

  root.innerHTML = `
    <section class="profile-grid">
      <aside class="card stack">
        <img class="avatar" src="${profile.profile_picture_url || 'https://placehold.co/160x160/111827/f1f5f9?text=FC'}" alt="Foto de perfil">
        <form class="stack" data-photo-form>
          <label>Foto de perfil<input class="input-dark" type="file" name="photo" accept="image/*"></label>
          <button class="btn btn-outline" type="submit">Subir foto</button>
          <p data-photo-status></p>
        </form>
      </aside>
      <form class="card stack" data-profile-form>
        <div class="section-head">
          <div>
            <h1>Perfil</h1>
            <p class="muted">${profile.user_role === 'client' ? 'Cliente' : 'Freelancer'}</p>
          </div>
          <button class="btn btn-primary" type="submit">Guardar cambios</button>
        </div>
        <label>Nombre visible<input class="input-dark" name="display_name" value="${profile.display_name || ''}" required></label>
        ${profile.user_role === 'client' ? `
          <div class="grid-2">
            <label>Empresa<input class="input-dark" name="company_name" value="${client.company_name || ''}"></label>
            <label>Industria<input class="input-dark" name="company_industry" value="${client.company_industry || ''}"></label>
          </div>
          <label>Tamano
            <select class="input-dark" name="company_size">
              ${['startup', 'small', 'medium', 'large'].map((item) => `<option value="${item}" ${client.company_size === item ? 'selected' : ''}>${item}</option>`).join('')}
            </select>
          </label>
          <label>Descripcion<textarea class="input-dark" name="company_description">${client.company_description || ''}</textarea></label>
        ` : `
          <div class="grid-2">
            <label>Titulo profesional<input class="input-dark" name="professional_title" value="${freelancer.professional_title || ''}"></label>
            <label>Tarifa por hora<input class="input-dark" name="hourly_rate" type="number" value="${freelancer.hourly_rate || ''}"></label>
          </div>
          <div class="grid-2">
            <label>Disponibilidad
              <select class="input-dark" name="availability_status">
                ${['available', 'busy', 'unavailable'].map((item) => `<option value="${item}" ${freelancer.availability_status === item ? 'selected' : ''}>${item}</option>`).join('')}
              </select>
            </label>
            <label>Ubicacion<input class="input-dark" name="location_country_city" value="${freelancer.location_country_city || ''}"></label>
          </div>
          <label>Skills separadas por coma<input class="input-dark" name="skills" value="${(freelancer.skills || []).join(', ')}"></label>
          <label>Biografia<textarea class="input-dark" name="biography">${freelancer.biography || ''}</textarea></label>
        `}
        <p data-status></p>
      </form>
    </section>
  `;

  async function uploadSelectedPhoto() {
    const photoForm = document.querySelector('[data-photo-form]');
    const form = new FormData(photoForm);
    const file = form.get('photo');
    const status = document.querySelector('[data-photo-status]');

    if (!file || !file.size) return null;

    const session = await getSession();
    const response = await fetch('/api/profile/photo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: form
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo subir la imagen.');

    document.querySelector('.avatar').src = data.url;
    appState.profile = { ...appState.profile, profile_picture_url: data.url };
    photoForm.reset();
    status.textContent = 'Imagen actualizada y guardada.';
    status.className = 'success';
    renderNav();
    return data.url;
  }

  document.querySelector('[data-profile-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { display_name: form.get('display_name') };

    if (profile.user_role === 'client') {
      payload.client_profile = {
        company_name: form.get('company_name'),
        company_industry: form.get('company_industry'),
        company_size: form.get('company_size'),
        company_description: form.get('company_description')
      };
    } else {
      payload.freelancer_profile = {
        professional_title: form.get('professional_title'),
        hourly_rate: Number(form.get('hourly_rate') || 0),
        availability_status: form.get('availability_status'),
        location_country_city: form.get('location_country_city'),
        skills: form.get('skills').split(',').map((skill) => skill.trim()).filter(Boolean),
        biography: form.get('biography')
      };
    }

    const status = document.querySelector('[data-status]');
    try {
      await uploadSelectedPhoto();
      await apiFetch('/api/profile', { method: 'PATCH', body: JSON.stringify(payload) });
      await refreshProfile();
      renderNav();
      status.textContent = 'Perfil actualizado.';
      status.className = 'success';
    } catch (error) {
      status.textContent = error.message;
      status.className = 'error';
    }
  });

  document.querySelector('[data-photo-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('[data-photo-status]');
    const file = new FormData(event.currentTarget).get('photo');

    if (!file || !file.size) {
      status.textContent = 'Selecciona una imagen.';
      status.className = 'error';
      return;
    }

    try {
      await uploadSelectedPhoto();
    } catch (error) {
      status.textContent = error.message;
      status.className = 'error';
    }
  });
});
