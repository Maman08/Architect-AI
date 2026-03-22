'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { formatDistanceToNow } from '@/lib/utils';

export default function ContextSidebar({
  project,
  decisions,
  conversations,
  onUpdateProject,
  onAddDecision,
  onDeleteDecision,
  onUpdateDecision,
  onSelectConversation,
  onDeleteConversation,
  activeConversationId,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [prd, setPrd] = useState(project?.prd || '');
  const [techStack, setTechStack] = useState(project?.tech_stack || '');
  const [editingDecision, setEditingDecision] = useState(null);
  const [newDecision, setNewDecision] = useState('');
  const [newReason, setNewReason] = useState('');
  const [showDecisionForm, setShowDecisionForm] = useState(false);

  const debounceRef = useRef(null);

  // Auto-save PRD with debounce
  const debounceSave = useCallback(
    (field, value) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onUpdateProject({ [field]: value });
      }, 500);
    },
    [onUpdateProject]
  );

  useEffect(() => {
    setPrd(project?.prd || '');
    setTechStack(project?.tech_stack || '');
  }, [project?.id]);

  const handleAddDecision = () => {
    if (!newDecision.trim()) return;
    onAddDecision(newDecision, newReason);
    setNewDecision('');
    setNewReason('');
    setShowDecisionForm(false);
  };

  if (collapsed) {
    return (
      <div className="w-12 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center pt-4">
        <button
          onClick={() => setCollapsed(false)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-2"
          title="Expand sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 bg-zinc-900 border-r border-zinc-800 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-300">Project Context</h2>
        <button
          onClick={() => setCollapsed(true)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Collapse sidebar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        {/* Project name */}
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Project Name</label>
          <p className="text-sm text-zinc-200 font-medium">{project?.name}</p>
        </div>

        {/* Description */}
        {project?.description && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Description</label>
            <p className="text-sm text-zinc-400">{project.description}</p>
          </div>
        )}

        {/* PRD */}
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            PRD / Product Requirements
          </label>
          <textarea
            value={prd}
            onChange={(e) => {
              setPrd(e.target.value);
              debounceSave('prd', e.target.value);
            }}
            rows={6}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm
                       text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500
                       resize-y"
            placeholder="Describe what you're building, the goals, user flows..."
          />
        </div>

        {/* Tech Stack */}
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Tech Stack</label>
          <input
            type="text"
            value={techStack}
            onChange={(e) => {
              setTechStack(e.target.value);
              debounceSave('tech_stack', e.target.value);
            }}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm
                       text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
            placeholder="e.g. Next.js, PostgreSQL, Redis"
          />
        </div>

        {/* Past Decisions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-zinc-500">Past Decisions</label>
            <button
              onClick={() => setShowDecisionForm(!showDecisionForm)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              {showDecisionForm ? 'Cancel' : '+ Add'}
            </button>
          </div>

          {showDecisionForm && (
            <div className="bg-zinc-800 rounded-lg p-3 mb-3 space-y-2">
              <input
                type="text"
                value={newDecision}
                onChange={(e) => setNewDecision(e.target.value)}
                placeholder="What was decided?"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm
                           text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              />
              <input
                type="text"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="Why?"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm
                           text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              />
              <button
                onClick={handleAddDecision}
                disabled={!newDecision.trim()}
                className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded
                           hover:bg-blue-500 disabled:opacity-40 transition-colors"
              >
                Save Decision
              </button>
            </div>
          )}

          <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
            {decisions.map((d) => (
              <div
                key={d.id}
                className="bg-zinc-800/50 border border-zinc-800 rounded-lg p-2.5 group"
              >
                {editingDecision === d.id ? (
                  <EditDecisionForm
                    decision={d}
                    onSave={(dec, reason) => {
                      onUpdateDecision(d.id, dec, reason);
                      setEditingDecision(null);
                    }}
                    onCancel={() => setEditingDecision(null)}
                  />
                ) : (
                  <>
                    <p className="text-sm text-zinc-300">{d.decision}</p>
                    <p className="text-xs text-zinc-500 mt-1">Reason: {d.reason}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-zinc-600">
                        {formatDistanceToNow(d.created_at)}
                      </span>
                      <div className="opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity">
                        <button
                          onClick={() => setEditingDecision(d.id)}
                          className="text-xs text-zinc-500 hover:text-zinc-300"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDeleteDecision(d.id)}
                          className="text-xs text-zinc-500 hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
            {decisions.length === 0 && (
              <p className="text-xs text-zinc-600 italic">No decisions recorded yet</p>
            )}
          </div>
        </div>

        {/* Conversation History */}
        <div>
          <label className="block text-xs text-zinc-500 mb-2">Past Conversations</label>
          <div className="space-y-1 max-h-[250px] overflow-y-auto custom-scrollbar">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors group ${
                  conv.id === activeConversationId
                    ? 'bg-blue-600/20 border border-blue-500/30'
                    : 'bg-zinc-800/30 border border-transparent hover:bg-zinc-800'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-300 truncate">{conv.title}</p>
                  <p className="text-xs text-zinc-600">{formatDistanceToNow(conv.created_at)}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400
                             transition-all ml-2 shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            {conversations.length === 0 && (
              <p className="text-xs text-zinc-600 italic">No conversations yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditDecisionForm({ decision, onSave, onCancel }) {
  const [dec, setDec] = useState(decision.decision);
  const [reason, setReason] = useState(decision.reason);

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={dec}
        onChange={(e) => setDec(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm
                   text-zinc-300 focus:outline-none focus:border-zinc-500"
      />
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm
                   text-zinc-300 focus:outline-none focus:border-zinc-500"
      />
      <div className="flex gap-2">
        <button
          onClick={() => onSave(dec, reason)}
          className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-500"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
