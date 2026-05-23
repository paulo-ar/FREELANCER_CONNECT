require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROFILE_BUCKET = process.env.SUPABASE_PROFILE_BUCKET || 'profile-pictures';
let profileBucketReady = false;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Missing Supabase environment variables. Copy .env.example to .env and configure keys.');
}

const supabaseAdmin = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_SERVICE_ROLE_KEY || 'missing-key', {
  auth: { persistSession: false }
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function getUserClient(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false }
  });
}

async function requireUser(req, res, next) {
  const client = getUserClient(req);
  if (!client) return res.status(401).json({ error: 'Missing bearer token' });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return res.status(401).json({ error: 'Invalid session' });

  req.supabase = client;
  req.user = data.user;
  next();
}

async function getAppUser(userId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, user_role, display_name, profile_picture_url, account_status')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

function proposalDecisionMessage(status) {
  if (status === 'rejected') {
    return 'Gracias por tu participacion en el proceso. En esta ocasion se eligio otra propuesta, pero valoramos el tiempo que dedicaste a postularte.';
  }

  return null;
}

async function sendProposalDecisionMessage({ proposal, clientId, messageText }) {
  if (!messageText) return null;

  const conversationPayload = {
    project_id: proposal.project_id,
    freelancer_id: proposal.freelancer_id,
    client_id: clientId
  };

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from('conversations')
    .upsert(conversationPayload, { onConflict: 'project_id,freelancer_id,client_id' })
    .select()
    .single();

  if (conversationError) throw conversationError;

  const { error: messageError } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_id: clientId,
      message_text: messageText
    });

  if (messageError) throw messageError;

  await supabaseAdmin
    .from('conversations')
    .update({ last_message_date: new Date().toISOString() })
    .eq('id', conversation.id);

  return conversation;
}

function sanitizeProfileUpdate(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

function normalizeTextArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function sanitizeProjectPayload(body) {
  return {
    project_title: String(body.project_title || '').trim(),
    project_description: String(body.project_description || '').trim(),
    project_category_identifier: String(body.project_category_identifier || '').trim(),
    project_budget_type: body.project_budget_type,
    project_budget_minimum: Number(body.project_budget_minimum),
    project_budget_maximum: Number(body.project_budget_maximum),
    project_duration_estimate: String(body.project_duration_estimate || '').trim() || null,
    project_experience_level: body.project_experience_level,
    project_skills_required: normalizeTextArray(body.project_skills_required)
  };
}

function validateProjectPayload(payload) {
  if (!payload.project_title) return 'El titulo del proyecto es obligatorio.';
  if (!payload.project_description) return 'La descripcion del proyecto es obligatoria.';
  if (!payload.project_category_identifier) return 'La categoria del proyecto es obligatoria.';
  if (!['fixed', 'hourly'].includes(payload.project_budget_type)) return 'Tipo de presupuesto invalido.';
  if (!Number.isFinite(payload.project_budget_minimum) || payload.project_budget_minimum <= 0) return 'El presupuesto minimo debe ser mayor a 0.';
  if (!Number.isFinite(payload.project_budget_maximum) || payload.project_budget_maximum <= 0) return 'El presupuesto maximo debe ser mayor a 0.';
  if (payload.project_budget_maximum < payload.project_budget_minimum) return 'El presupuesto maximo no puede ser menor al minimo.';
  if (!['entry', 'intermediate', 'expert'].includes(payload.project_experience_level)) return 'Nivel de experiencia invalido.';
  return null;
}

async function ensureProfileBucket() {
  if (profileBucketReady) return;

  const { data: bucket, error: getError } = await supabaseAdmin.storage.getBucket(PROFILE_BUCKET);
  if (!getError) {
    if (bucket && bucket.public === false) {
      await supabaseAdmin.storage.updateBucket(PROFILE_BUCKET, { public: true }).catch(() => null);
    }
    profileBucketReady = true;
    return;
  }

  const { error: createError } = await supabaseAdmin.storage.createBucket(PROFILE_BUCKET, {
    public: true,
    fileSizeLimit: 3 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  });

  if (createError && !/already exists/i.test(createError.message)) {
    throw createError;
  }

  profileBucketReady = true;
}

app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    profileBucket: PROFILE_BUCKET
  });
});

app.get('/api/me', requireUser, async (req, res) => {
  const { data, error } = await req.supabase
    .from('users')
    .select('*, freelancer_profiles(*), client_profiles(*)')
    .eq('id', req.user.id)
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.get('/api/users/:id', requireUser, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*, freelancer_profiles(*), client_profiles(*)')
    .eq('id', req.params.id)
    .eq('account_status', 'active')
    .single();

  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

app.get('/api/dashboard', requireUser, async (req, res) => {
  const user = await getAppUser(req.user.id).catch((error) => {
    res.status(400).json({ error: error.message });
    return null;
  });
  if (!user) return;

  if (user.user_role === 'client') {
    const [{ count: openProjects }, { data: projects, error: projectsError }, { data: allProjectIds, error: idsError }] = await Promise.all([
      supabaseAdmin.from('projects').select('*', { count: 'exact', head: true }).eq('client_id', req.user.id).eq('project_status', 'open'),
      supabaseAdmin.from('projects').select('*').eq('client_id', req.user.id).order('created_at', { ascending: false }).limit(6),
      supabaseAdmin.from('projects').select('id').eq('client_id', req.user.id)
    ]);

    if (projectsError) return res.status(400).json({ error: projectsError.message });
    if (idsError) return res.status(400).json({ error: idsError.message });

    const projectIds = (allProjectIds || []).map((project) => project.id);
    const [{ count: proposalsCount, error: proposalsError }, { data: receivedProposals, error: receivedError }] = projectIds.length
      ? await Promise.all([
        supabaseAdmin.from('proposals').select('*', { count: 'exact', head: true }).in('project_id', projectIds),
        supabaseAdmin
          .from('proposals')
          .select('*, projects(project_title), users(id, display_name, profile_picture_url)')
          .in('project_id', projectIds)
          .order('created_at', { ascending: false })
          .limit(8)
      ])
      : [{ count: 0, error: null }, { data: [], error: null }];

    if (proposalsError) return res.status(400).json({ error: proposalsError.message });
    if (receivedError) return res.status(400).json({ error: receivedError.message });
    return res.json({ role: 'client', openProjects, proposalsCount, projects: projects || [], receivedProposals: receivedProposals || [] });
  }

  const [{ count: proposalsSent }, { count: activeProjects }, { data: proposals }, { data: recommended }] = await Promise.all([
    supabaseAdmin.from('proposals').select('*', { count: 'exact', head: true }).eq('freelancer_id', req.user.id),
    supabaseAdmin.from('proposals').select('*', { count: 'exact', head: true }).eq('freelancer_id', req.user.id).eq('proposal_status', 'accepted'),
    supabaseAdmin.from('proposals').select('*, projects(project_title, project_budget_type, users(id, display_name, profile_picture_url))').eq('freelancer_id', req.user.id).order('created_at', { ascending: false }).limit(5),
    supabaseAdmin.from('projects').select('*, users(id, display_name, profile_picture_url)').eq('project_status', 'open').order('created_at', { ascending: false }).limit(6)
  ]);

  res.json({ role: 'freelancer', proposalsSent, activeProjects, earnings: 0, proposals: proposals || [], recommended: recommended || [] });
});

app.get('/api/projects', async (req, res) => {
  const { q, category, minBudget, maxBudget } = req.query;

  let query = supabaseAdmin
    .from('projects')
    .select('*, users(id, display_name, profile_picture_url)')
    .eq('project_status', 'open')
    .order('created_at', { ascending: false });

  if (q) query = query.or(`project_title.ilike.%${q}%,project_description.ilike.%${q}%`);
  if (category) query = query.eq('project_category_identifier', category);
  if (minBudget) query = query.gte('project_budget_maximum', Number(minBudget));
  if (maxBudget) query = query.lte('project_budget_minimum', Number(maxBudget));

  const { data, error } = await query.limit(50);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.post('/api/projects', requireUser, async (req, res) => {
  const appUser = await getAppUser(req.user.id).catch((error) => {
    res.status(400).json({ error: error.message });
    return null;
  });
  if (!appUser) return;
  if (appUser.account_status !== 'active') {
    return res.status(403).json({ error: 'Tu cuenta no esta activa para publicar proyectos.' });
  }
  if (appUser.user_role !== 'client') {
    return res.status(403).json({ error: 'Solo los clientes pueden publicar proyectos.' });
  }

  const payload = { ...sanitizeProjectPayload(req.body), client_id: req.user.id, project_status: 'open' };
  const validationError = validateProjectPayload(payload);
  if (validationError) return res.status(400).json({ error: validationError });

  const { data: createdProject, error } = await supabaseAdmin
    .from('projects')
    .insert(payload)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  const { data: consolidatedProject, error: readError } = await supabaseAdmin
    .from('projects')
    .select('*, users(id, display_name, profile_picture_url)')
    .eq('id', createdProject.id)
    .single();

  if (readError) return res.status(201).json(createdProject);
  res.status(201).json(consolidatedProject);
});

app.delete('/api/projects/:id', requireUser, async (req, res) => {
  const appUser = await getAppUser(req.user.id).catch((error) => {
    res.status(400).json({ error: error.message });
    return null;
  });
  if (!appUser) return;
  if (appUser.user_role !== 'client') {
    return res.status(403).json({ error: 'Solo los clientes pueden eliminar proyectos.' });
  }

  const { data: project, error: readError } = await supabaseAdmin
    .from('projects')
    .select('id, client_id')
    .eq('id', req.params.id)
    .single();

  if (readError) return res.status(404).json({ error: readError.message });
  if (project.client_id !== req.user.id) {
    return res.status(403).json({ error: 'Solo el cliente dueno del proyecto puede eliminarlo.' });
  }

  const { error: deleteError } = await supabaseAdmin
    .from('projects')
    .delete()
    .eq('id', req.params.id)
    .eq('client_id', req.user.id);

  if (deleteError) return res.status(400).json({ error: deleteError.message });
  res.json({ id: req.params.id, deleted: true });
});

app.get('/api/projects/:id', requireUser, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*, users(id, display_name, profile_picture_url), proposals(*, users(id, display_name, profile_picture_url))')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

app.post('/api/proposals', requireUser, async (req, res) => {
  const appUser = await getAppUser(req.user.id).catch((error) => {
    res.status(400).json({ error: error.message });
    return null;
  });
  if (!appUser) return;
  if (appUser.user_role !== 'freelancer') {
    return res.status(403).json({ error: 'Solo los freelancers pueden enviar propuestas.' });
  }

  const payload = { ...req.body, freelancer_id: req.user.id, proposal_status: 'submitted' };
  const { data, error } = await req.supabase.from('proposals').insert(payload).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/api/proposals/:id/status', requireUser, async (req, res) => {
  const { status } = req.body;
  if (!['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Estado de propuesta invalido.' });
  }

  const { data: proposal, error: proposalError } = await supabaseAdmin
    .from('proposals')
    .select('id, project_id, freelancer_id, proposal_status, projects(client_id)')
    .eq('id', req.params.id)
    .single();

  if (proposalError) return res.status(404).json({ error: proposalError.message });
  if (proposal.projects?.client_id !== req.user.id) {
    return res.status(403).json({ error: 'Solo el cliente dueno del proyecto puede actualizar esta propuesta.' });
  }

  if (status === 'accepted') {
    const { data: acceptedProposal, error } = await supabaseAdmin
      .from('proposals')
      .update({ proposal_status: 'accepted' })
      .eq('id', req.params.id)
      .select('*, users(id, display_name, profile_picture_url)')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    const { data: rejectedProposals, error: rejectError } = await supabaseAdmin
      .from('proposals')
      .update({ proposal_status: 'rejected' })
      .eq('project_id', proposal.project_id)
      .neq('id', req.params.id)
      .select('id, project_id, freelancer_id');

    if (rejectError) return res.status(400).json({ error: rejectError.message });

    try {
      await Promise.all((rejectedProposals || []).map((rejectedProposal) => sendProposalDecisionMessage({
        proposal: rejectedProposal,
        clientId: req.user.id,
        messageText: proposalDecisionMessage('rejected')
      })));
    } catch (messageError) {
      return res.status(400).json({ error: messageError.message });
    }

    return res.json({
      ...acceptedProposal,
      rejectedProposalIds: (rejectedProposals || []).map((rejectedProposal) => rejectedProposal.id)
    });
  }

  const { data, error } = await supabaseAdmin
    .from('proposals')
    .update({ proposal_status: status })
    .eq('id', req.params.id)
    .select('*, users(id, display_name, profile_picture_url)')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  try {
    await sendProposalDecisionMessage({
      proposal,
      clientId: req.user.id,
      messageText: proposalDecisionMessage(status)
    });
  } catch (messageError) {
    return res.status(400).json({ error: messageError.message });
  }
  res.json(data);
});

app.post('/api/proposals/:id/conversation', requireUser, async (req, res) => {
  const { data: proposal, error: proposalError } = await supabaseAdmin
    .from('proposals')
    .select('id, project_id, freelancer_id, projects(client_id)')
    .eq('id', req.params.id)
    .single();

  if (proposalError) return res.status(404).json({ error: proposalError.message });
  if (proposal.projects?.client_id !== req.user.id) {
    return res.status(403).json({ error: 'Solo el cliente dueno del proyecto puede abrir chat desde esta propuesta.' });
  }

  const conversationPayload = {
    project_id: proposal.project_id,
    freelancer_id: proposal.freelancer_id,
    client_id: req.user.id
  };

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from('conversations')
    .upsert(conversationPayload, { onConflict: 'project_id,freelancer_id,client_id' })
    .select()
    .single();

  if (conversationError) return res.status(400).json({ error: conversationError.message });

  const { count: messagesCount, error: countError } = await supabaseAdmin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id);

  if (countError) return res.status(400).json({ error: countError.message });

  if (!messagesCount) {
    const { error: messageError } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        sender_id: req.user.id,
        message_text: 'Hola, recibi tu propuesta'
      });

    if (messageError) return res.status(400).json({ error: messageError.message });
  }

  const { data: hydratedConversation, error: readError } = await supabaseAdmin
    .from('conversations')
    .select('*, projects(project_title), messages(*)')
    .eq('id', conversation.id)
    .single();

  if (readError) return res.status(201).json(conversation);
  res.status(201).json(hydratedConversation);
});

app.patch('/api/profile', requireUser, async (req, res) => {
  const { display_name, profile_picture_url, freelancer_profile, client_profile } = req.body;
  const updates = [];

  if (display_name !== undefined || profile_picture_url !== undefined) {
    updates.push(supabaseAdmin.from('users').update(sanitizeProfileUpdate({ display_name, profile_picture_url })).eq('id', req.user.id));
  }
  if (freelancer_profile) {
    updates.push(supabaseAdmin.from('freelancer_profiles').upsert({ ...freelancer_profile, user_id: req.user.id }, { onConflict: 'user_id' }));
  }
  if (client_profile) {
    updates.push(supabaseAdmin.from('client_profiles').upsert({ ...client_profile, user_id: req.user.id }, { onConflict: 'user_id' }));
  }

  const results = await Promise.all(updates);
  const error = results.find((result) => result.error)?.error;
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

app.post('/api/profile/photo', requireUser, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Photo file is required' });

  try {
    await ensureProfileBucket();
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const extension = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
  const filePath = `${req.user.id}/${Date.now()}.${extension}`;
  const { error } = await supabaseAdmin.storage
    .from(PROFILE_BUCKET)
    .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

  if (error) return res.status(400).json({ error: error.message });

  const { data } = supabaseAdmin.storage.from(PROFILE_BUCKET).getPublicUrl(filePath);
  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({ profile_picture_url: data.publicUrl })
    .eq('id', req.user.id);

  if (updateError) return res.status(400).json({ error: updateError.message });
  res.json({ url: data.publicUrl });
});

app.get('/api/conversations', requireUser, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('*, projects(project_title), messages(*)')
    .or(`freelancer_id.eq.${req.user.id},client_id.eq.${req.user.id}`)
    .order('last_message_date', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/messages', requireUser, async (req, res) => {
  const messageText = String(req.body.message_text || '').trim();
  if (!messageText) return res.status(400).json({ error: 'El mensaje no puede estar vacio.' });

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from('conversations')
    .select('id, freelancer_id, client_id')
    .eq('id', req.body.conversation_id)
    .single();

  if (conversationError) return res.status(404).json({ error: conversationError.message });
  if (![conversation.freelancer_id, conversation.client_id].includes(req.user.id)) {
    return res.status(403).json({ error: 'No puedes enviar mensajes en esta conversacion.' });
  }

  const payload = { conversation_id: conversation.id, message_text: messageText, sender_id: req.user.id };
  const { data, error } = await supabaseAdmin.from('messages').insert(payload).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await supabaseAdmin.from('conversations').update({ last_message_date: new Date().toISOString() }).eq('id', conversation.id);
  res.status(201).json(data);
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Freelancer Conect running at http://localhost:${PORT}`);
});
