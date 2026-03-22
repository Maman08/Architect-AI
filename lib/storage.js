import { getSupabase } from './supabase';

// ─── Projects ────────────────────────────────────────────

export async function getAllProjects() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getProject(id) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createProject(name, description = '') {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('projects')
    .insert({ name, description })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateProject(id, fields) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('projects')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteProject(id) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ─── Decisions ───────────────────────────────────────────

export async function getDecisions(projectId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('decisions')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function addDecision(projectId, decision, reason) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('decisions')
    .insert({ project_id: projectId, decision, reason })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteDecision(id) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('decisions')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function updateDecision(id, decision, reason) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('decisions')
    .update({ decision, reason })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Conversations ───────────────────────────────────────

export async function getConversations(projectId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createConversation(projectId, title) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('conversations')
    .insert({ project_id: projectId, title })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteConversation(id) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ─── Messages ────────────────────────────────────────────

export async function getMessages(conversationId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function addMessage(conversationId, role, content) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, role, content })
    .select()
    .single();

  if (error) throw error;
  return data;
}
