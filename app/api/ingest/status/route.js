// ─── Ingestion Status API ───────────────────────────────
// GET /api/ingest/status?jobId=xxx
// Poll this to check indexing progress.

import { getSupabase } from '@/lib/supabase';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const projectId = searchParams.get('projectId');

    const supabase = getSupabase();

    if (jobId) {
      const { data, error } = await supabase
        .from('ingestion_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) throw error;
      return Response.json(data);
    }

    if (projectId) {
      // Get the latest job for this project
      const { data, error } = await supabase
        .from('ingestion_jobs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      // Also get count of indexed files
      const { count } = await supabase
        .from('code_architecture')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId);

      return Response.json({
        job: data,
        indexedFiles: count || 0,
      });
    }

    return Response.json({ error: 'Provide jobId or projectId' }, { status: 400 });
  } catch (error) {
    console.error('Ingest status error:', error);
    return Response.json(
      { error: error.message || 'Failed to get status' },
      { status: 500 }
    );
  }
}
