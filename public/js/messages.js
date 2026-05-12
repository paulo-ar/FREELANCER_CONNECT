document.addEventListener('DOMContentLoaded', async () => {
  await requireAuth();
  const conversations = await apiFetch('/api/conversations');
  const list = document.querySelector('[data-conversations]');
  const stream = document.querySelector('[data-message-stream]');
  const form = document.querySelector('[data-message-form]');
  const requestedConversationId = getQueryParam('conversation');
  let activeConversation = conversations.find((conversation) => conversation.id === requestedConversationId) || conversations[0] || null;

  function renderConversations() {
    list.innerHTML = conversations.length
      ? conversations.map((conversation) => `<button class="btn ${activeConversation?.id === conversation.id ? 'btn-primary' : 'btn-outline'}" type="button" data-conversation="${conversation.id}">${conversation.projects?.project_title || 'Conversacion'}</button>`).join('')
      : '<div class="empty-state">No hay conversaciones.</div>';
  }

  function renderMessages() {
    if (!activeConversation) {
      stream.innerHTML = '<div class="empty-state">Selecciona una conversacion.</div>';
      form.hidden = true;
      return;
    }
    form.hidden = false;
    const messages = [...(activeConversation.messages || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    stream.innerHTML = messages.map((message) => `<div class="message ${message.sender_id === appState.user.id ? 'mine' : ''}">${message.message_text}<br><small class="muted">${formatDate(message.created_at)}</small></div>`).join('');
    stream.scrollTop = stream.scrollHeight;
  }

  renderConversations();
  renderMessages();

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-conversation]');
    if (!button) return;
    activeConversation = conversations.find((conversation) => conversation.id === button.dataset.conversation);
    renderConversations();
    renderMessages();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeConversation) return;
    const input = form.querySelector('[name="message_text"]');
    if (!input.value.trim()) return;
    const message = await apiFetch('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: activeConversation.id, message_text: input.value.trim() })
    });
    activeConversation.messages = [...(activeConversation.messages || []), message];
    input.value = '';
    renderMessages();
  });

  await loadConfig();
  appState.supabase?.channel('custom-all-channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const target = conversations.find((conversation) => conversation.id === payload.new.conversation_id);
      if (!target) return;
      target.messages = [...(target.messages || []), payload.new];
      if (activeConversation?.id === target.id) renderMessages();
    })
    .subscribe();
});
