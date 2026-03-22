import { getSupabase } from './supabase';

// ─── Architecture Sessions ──────────────────────────────

export async function getSession(sessionId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('architecture_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) throw error;
  return data;
}

export async function getSessionByConversation(conversationId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('architecture_sessions')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createSession(projectId, conversationId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('architecture_sessions')
    .insert({
      project_id: projectId,
      conversation_id: conversationId,
      state: 'GATHERING_INFO',
      questions_asked: [],
      user_answers: [],
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSession(sessionId, fields) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('architecture_sessions')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function appendQuestion(sessionId, question) {
  const session = await getSession(sessionId);
  const questions = [...(session.questions_asked || []), question];
  return updateSession(sessionId, { questions_asked: questions });
}

export async function appendAnswer(sessionId, answer) {
  const session = await getSession(sessionId);
  const answers = [...(session.user_answers || []), answer];
  return updateSession(sessionId, { user_answers: answers });
}

export async function setReady(sessionId) {
  return updateSession(sessionId, { state: 'GENERATING' });
}

export async function saveFinalArchitecture(sessionId, architecture) {
  return updateSession(sessionId, {
    state: 'DONE',
    final_architecture: architecture,
  });
}
