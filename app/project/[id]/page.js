'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ContextSidebar from '@/components/ContextSidebar';
import CodePanel from '@/components/CodePanel';
import ConversationArea from '@/components/ConversationArea';
import ArchitectureSession from '@/components/ArchitectureSession';
import SaveDecisionModal from '@/components/SaveDecisionModal';
import {
  getProject,
  updateProject,
  getDecisions,
  addDecision,
  deleteDecision,
  updateDecision,
  getConversations,
  createConversation,
  deleteConversation,
  getMessages,
  addMessage,
} from '@/lib/storage';

export default function ProjectDashboard() {
  const { id } = useParams();
  const router = useRouter();

  // ─── State ─────────────────────────────────────────────
  const [project, setProject] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [codeContext, setCodeContext] = useState('');
  const [mode, setMode] = useState('feature');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [pendingArchitectResponse, setPendingArchitectResponse] = useState('');
  const [showArchitectureSession, setShowArchitectureSession] = useState(false);
  const [agentSteps, setAgentSteps] = useState([]);
  const [indexingStatus, setIndexingStatus] = useState(null); // { status, processed, total }

  // ─── Load project data ─────────────────────────────────
  useEffect(() => {
    if (!id) return;
    loadProjectData();
  }, [id]);

  async function loadProjectData() {
    try {
      const [proj, decs, convs] = await Promise.all([
        getProject(id),
        getDecisions(id),
        getConversations(id),
      ]);

      if (!proj) {
        router.push('/');
        return;
      }

      setProject(proj);
      setDecisions(decs);
      setConversations(convs);

      // If there are conversations, load the most recent one
      if (convs.length > 0) {
        const latest = convs[0];
        setActiveConversationId(latest.id);
        const msgs = await getMessages(latest.id);
        setMessages(msgs);
      }
    } catch (err) {
      console.error('Failed to load project:', err);
      router.push('/');
    } finally {
      setPageLoading(false);
    }
  }

  // ─── Project updates ──────────────────────────────────

  // Check indexing status on load
  useEffect(() => {
    if (!id) return;
    fetch(`/api/ingest/status?projectId=${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.job) {
          setIndexingStatus({
            status: data.job.status,
            processed: data.job.processed_files,
            total: data.job.total_files,
            indexedFiles: data.indexedFiles,
          });
        } else if (data.indexedFiles > 0) {
          setIndexingStatus({ status: 'done', indexedFiles: data.indexedFiles });
        }
      })
      .catch(() => {});
  }, [id]);

  // ── Index repo handler ────────────────────────────────
  const handleIndexRepo = useCallback(
    async (owner, repo, token) => {
      setIndexingStatus({ status: 'processing', processed: 0, total: 0, repoName: `${owner}/${repo}` });
      try {
        const res = await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: id, owner, repo, token }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // Poll for progress
        const jobId = data.jobId;
        const interval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/ingest/status?jobId=${jobId}`);
            const status = await statusRes.json();
            setIndexingStatus({
              status: status.status,
              processed: status.processed_files,
              total: status.total_files,
              repoName: `${owner}/${repo}`,
            });
            if (status.status === 'done' || status.status === 'failed') {
              clearInterval(interval);
            }
          } catch {
            clearInterval(interval);
          }
        }, 3000);
      } catch (err) {
        console.error('Indexing failed:', err);
        setIndexingStatus({ status: 'failed', error: err.message });
      }
    },
    [id]
  );

  const handleUpdateProject = useCallback(
    async (fields) => {
      try {
        const updated = await updateProject(id, fields);
        setProject(updated);
      } catch (err) {
        console.error('Failed to update project:', err);
      }
    },
    [id]
  );

  // ─── Decision handlers ────────────────────────────────

  const handleAddDecision = useCallback(
    async (decision, reason) => {
      try {
        const d = await addDecision(id, decision, reason);
        setDecisions((prev) => [d, ...prev]);
      } catch (err) {
        console.error('Failed to add decision:', err);
      }
    },
    [id]
  );

  const handleDeleteDecision = useCallback(async (decisionId) => {
    try {
      await deleteDecision(decisionId);
      setDecisions((prev) => prev.filter((d) => d.id !== decisionId));
    } catch (err) {
      console.error('Failed to delete decision:', err);
    }
  }, []);

  const handleUpdateDecision = useCallback(async (decisionId, decision, reason) => {
    try {
      const updated = await updateDecision(decisionId, decision, reason);
      setDecisions((prev) => prev.map((d) => (d.id === decisionId ? updated : d)));
    } catch (err) {
      console.error('Failed to update decision:', err);
    }
  }, []);

  // ─── Conversation handlers ────────────────────────────

  const handleSelectConversation = useCallback(async (convId) => {
    try {
      setActiveConversationId(convId);
      const msgs = await getMessages(convId);
      setMessages(msgs);
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  }, []);

  const handleDeleteConversation = useCallback(
    async (convId) => {
      try {
        await deleteConversation(convId);
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        if (convId === activeConversationId) {
          setActiveConversationId(null);
          setMessages([]);
        }
      } catch (err) {
        console.error('Failed to delete conversation:', err);
      }
    },
    [activeConversationId]
  );

  const handleNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
  }, []);

  // ─── Send message to Architect ────────────────────────

  const handleSendMessage = useCallback(
    async (userMessage) => {
      setLoading(true);
      setAgentSteps([]);

      try {
        // Create a conversation if we don't have one
        let convId = activeConversationId;
        if (!convId) {
          const title = userMessage.slice(0, 60) + (userMessage.length > 60 ? '...' : '');
          const conv = await createConversation(id, title);
          convId = conv.id;
          setActiveConversationId(convId);
          setConversations((prev) => [conv, ...prev]);
        }

        // Save user message
        const userMsg = await addMessage(convId, 'user', userMessage);
        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);

        // Build conversation history for context
        const conversationHistory = updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // Call the architect API
        const res = await fetch('/api/architect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: id,
            prd: project?.prd || '',
            techStack: project?.tech_stack || '',
            pastDecisions: decisions,
            codeContext,
            conversationHistory: conversationHistory.slice(0, -1), // exclude current message
            mode,
            userMessage,
          }),
        });

        const data = await res.json();

        if (data.error) {
          throw new Error(data.error);
        }

        // Store agent investigation steps (if any)
        if (data.agentSteps?.length) {
          setAgentSteps(data.agentSteps);
        }

        // Save assistant response
        const assistantMsg = await addMessage(convId, 'assistant', data.result);
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        console.error('Architect API error:', err);
        // Show error as a message
        const errorContent = `⚠️ **Error:** ${err.message || 'Failed to get response from Architect. Check your API key and try again.'}`;
        if (activeConversationId) {
          const errMsg = await addMessage(activeConversationId, 'assistant', errorContent);
          setMessages((prev) => [...prev, errMsg]);
        }
      } finally {
        setLoading(false);
      }
    },
    [activeConversationId, messages, project, decisions, codeContext, mode, id]
  );

  // ─── Save decision from architect response ────────────

  const handleSaveDecisionFromResponse = useCallback(
    (responseContent) => {
      setPendingArchitectResponse(responseContent);
      setShowDecisionModal(true);
    },
    []
  );

  const handleConfirmSaveDecision = useCallback(
    async (decision, reason) => {
      await handleAddDecision(decision, reason);
      setShowDecisionModal(false);
      setPendingArchitectResponse('');
    },
    [handleAddDecision]
  );

  // ─── Architecture session handlers ────────────────────

  const handleStartArchitectureSession = useCallback(async () => {
    // Create a new conversation for the session if needed
    let convId = activeConversationId;
    if (!convId) {
      const conv = await createConversation(id, '🧠 Architecture Discovery Session');
      convId = conv.id;
      setActiveConversationId(convId);
      setConversations((prev) => [conv, ...prev]);
    }
    setShowArchitectureSession(true);
  }, [activeConversationId, id]);

  const handleSessionComplete = useCallback(
    async (architecture) => {
      // Save the final architecture as a message in the conversation
      if (activeConversationId) {
        const userMsg = await addMessage(activeConversationId, 'user', '🧠 Design Architecture (guided session)');
        const assistantMsg = await addMessage(activeConversationId, 'assistant', architecture);
        setMessages((prev) => [...prev, userMsg, assistantMsg]);
      }
    },
    [activeConversationId]
  );

  const handleCancelSession = useCallback(() => {
    setShowArchitectureSession(false);
  }, []);

  // ─── Explain Architecture handler ─────────────────────

  const handleExplainArchitecture = useCallback(
    async (architectureContent) => {
      setLoading(true);
      try {
        let convId = activeConversationId;
        if (!convId) {
          const conv = await createConversation(id, 'Architecture Explanation');
          convId = conv.id;
          setActiveConversationId(convId);
          setConversations((prev) => [conv, ...prev]);
        }

        const explainMessage = 'Please explain this architecture from scratch using the 5-layer explanation format.';
        const userMsg = await addMessage(convId, 'user', explainMessage);
        setMessages((prev) => [...prev, userMsg]);

        const res = await fetch('/api/architect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: id,
            prd: project?.prd || '',
            techStack: project?.tech_stack || '',
            pastDecisions: decisions,
            codeContext,
            conversationHistory: messages.map((m) => ({ role: m.role, content: m.content })),
            mode,
            userMessage: explainMessage,
            explanationMode: true,
          }),
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const assistantMsg = await addMessage(convId, 'assistant', data.result);
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        console.error('Explain architecture error:', err);
        if (activeConversationId) {
          const errMsg = await addMessage(activeConversationId, 'assistant',
            `⚠️ **Error:** ${err.message || 'Failed to explain architecture.'}`);
          setMessages((prev) => [...prev, errMsg]);
        }
      } finally {
        setLoading(false);
      }
    },
    [activeConversationId, messages, project, decisions, codeContext, mode, id]
  );

  // ─── Loading state ─────────────────────────────────────

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Project not found</div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-zinc-950">
      {/* Top bar */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-2.5 flex items-center gap-4 shrink-0">
        <button
          onClick={() => router.push('/')}
          className="text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Projects
        </button>
        <span className="text-zinc-700">|</span>
        <span className="text-sm font-medium text-zinc-300">{project.name}</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowCodePanel(!showCodePanel)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              showCodePanel
                ? 'bg-amber-600/20 text-amber-400 border-amber-500/30'
                : 'text-zinc-500 hover:text-zinc-300 border-zinc-700 hover:bg-zinc-800'
            }`}
          >
            {showCodePanel ? '✕ Close Code Panel' : '📂 Code Context'}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Context Sidebar */}
        <ContextSidebar
          project={project}
          decisions={decisions}
          conversations={conversations}
          onUpdateProject={handleUpdateProject}
          onAddDecision={handleAddDecision}
          onDeleteDecision={handleDeleteDecision}
          onUpdateDecision={handleUpdateDecision}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          activeConversationId={activeConversationId}
        />

        {/* Center: Conversation or Code Panel */}
        <div className="flex-1 flex min-w-0">
          {showCodePanel ? (
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <div className="max-w-3xl mx-auto">
                <h2 className="text-lg font-semibold text-zinc-200 mb-4">Code Context</h2>
                <p className="text-sm text-zinc-500 mb-6">
                  Add code from GitHub, upload files, or paste code directly. Everything here
                  becomes context for the Architect.
                </p>
                <CodePanel
                  codeContext={codeContext}
                  onCodeContextChange={setCodeContext}
                  project={project}
                  onIndexRepo={handleIndexRepo}
                  indexingStatus={indexingStatus}
                />
              </div>
            </div>
          ) : showArchitectureSession ? (
            <ArchitectureSession
              projectId={id}
              conversationId={activeConversationId}
              projectContext={{
                prd: project?.prd || '',
                techStack: project?.tech_stack || '',
                pastDecisions: decisions,
              }}
              onSessionComplete={handleSessionComplete}
              onCancel={handleCancelSession}
            />
          ) : (
            <ConversationArea
              messages={messages}
              loading={loading}
              mode={mode}
              onModeChange={setMode}
              onSendMessage={handleSendMessage}
              onSaveDecision={handleSaveDecisionFromResponse}
              onNewConversation={handleNewConversation}
              onStartArchitectureSession={handleStartArchitectureSession}
              onExplainArchitecture={handleExplainArchitecture}
              projectName={project?.name}
              agentSteps={agentSteps}
              indexingStatus={indexingStatus}
              codeContext={codeContext}
            />
          )}
        </div>
      </div>

      {/* Save Decision Modal */}
      {showDecisionModal && (
        <SaveDecisionModal
          architectResponse={pendingArchitectResponse}
          onSave={handleConfirmSaveDecision}
          onClose={() => {
            setShowDecisionModal(false);
            setPendingArchitectResponse('');
          }}
        />
      )}
    </div>
  );
}
