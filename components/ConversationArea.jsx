'use client';

import { useState, useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';

export default function ConversationArea({
  messages,
  loading,
  mode,
  onModeChange,
  onSendMessage,
  onSaveDecision,
  onNewConversation,
  onStartArchitectureSession,
  onExplainArchitecture,
  projectName,
  agentSteps = [],
  indexingStatus,
  codeContext = '',
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || loading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-zinc-300">🏗️ Architect</h2>
          <span className="text-xs text-zinc-600">|</span>
          <span className="text-xs text-zinc-500">
            {messages.length === 0 ? 'Start a conversation' : `${messages.length} messages`}
          </span>
          {indexingStatus?.status === 'done' && (
            <span className="text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
              🧠 {indexingStatus.repoName ? indexingStatus.repoName : 'Repo'} indexed
              {indexingStatus.indexedFiles ? ` · ${indexingStatus.indexedFiles} files` : ''}
            </span>
          )}
          {codeContext && indexingStatus?.status !== 'done' && (
            <span className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
              📄 Manual context loaded
            </span>
          )}
        </div>
        <button
          onClick={onNewConversation}
          className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded-lg
                     px-3 py-1.5 hover:bg-zinc-800 transition-colors"
        >
          + New Conversation
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="text-4xl mb-4">🏗️</div>
            <h3 className="text-lg font-semibold text-zinc-300 mb-2">
              Ready to architect
            </h3>
            <p className="text-sm text-zinc-500 max-w-md mb-5">
              Attach your GitHub repo, describe a design problem, or ask for a codebase review.
              I&apos;ll think through it with you like a senior engineer.
            </p>

            {/* Context status pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-7">
              {indexingStatus?.status === 'done' ? (
                <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 rounded-full px-3 py-1.5">
                  <span className="text-purple-400 text-sm">🧠</span>
                  <span className="text-xs text-purple-300 font-medium">
                    {indexingStatus.repoName || 'Repo'} deeply indexed
                    {indexingStatus.indexedFiles ? ` (${indexingStatus.indexedFiles} files)` : ''}
                  </span>
                  <span className="text-xs text-purple-500">· Agent will investigate automatically</span>
                </div>
              ) : codeContext ? (
                <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-3 py-1.5">
                  <span className="text-blue-400 text-sm">📄</span>
                  <span className="text-xs text-blue-300 font-medium">Manual code context loaded</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1.5">
                  <span className="text-zinc-500 text-sm">📂</span>
                  <span className="text-xs text-zinc-500">No code context — open Code Context to attach repo</span>
                </div>
              )}
            </div>

            {/* Quick start prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {[
                { emoji: '🔍', text: 'Review my codebase architecture', mode: 'analyze' },
                { emoji: '🆕', text: 'Design architecture for a new feature', mode: 'feature' },
                { emoji: '📐', text: 'Is this the right design pattern for my use case?', mode: 'feature' },
                { emoji: '⚡', text: 'Where are the bottlenecks in my system?', mode: 'analyze' },
              ].map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onModeChange(prompt.mode);
                    onSendMessage(prompt.text);
                  }}
                  className="text-left bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2.5
                             text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600
                             transition-all duration-200 flex items-center gap-2"
                >
                  <span>{prompt.emoji}</span>
                  <span>{prompt.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onSaveDecision={msg.role === 'assistant' ? onSaveDecision : null}
            onExplainArchitecture={msg.role === 'assistant' ? onExplainArchitecture : null}
            projectName={projectName}
          />
        ))}

        {loading && (
          <div className="flex justify-start mb-6">
            <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-2xl rounded-bl-md px-5 py-4 max-w-lg w-full">
              <div className="text-xs font-medium text-amber-400 mb-3">🏗️ Architect</div>

              {/* Agent thinking steps */}
              {agentSteps.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {agentSteps.map((step, i) => {
                    const toolIcons = {
                      find_related_components: '🔍',
                      understand_structure: '📐',
                      analyze_data_flow: '🔀',
                      detect_patterns: '🧩',
                      search_community: '🌐',
                      recall_past_decisions: '📋',
                    };
                    const icon = toolIcons[step.tool] || '🔧';
                    const isLatest = i === agentSteps.length - 1;

                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-2 text-xs transition-opacity duration-300 ${
                          isLatest ? 'text-zinc-300' : 'text-zinc-600'
                        }`}
                      >
                        <span className="shrink-0">{icon}</span>
                        <span>
                          {step.tool === 'find_related_components' && `Searching codebase: "${step.input?.query || '...'}"` }
                          {step.tool === 'understand_structure' && 'Mapping project architecture...'}
                          {step.tool === 'analyze_data_flow' && `Tracing data flow: ${step.input?.from_concept || '?'} → ${step.input?.to_concept || '?'}`}
                          {step.tool === 'detect_patterns' && `Detecting patterns in: ${step.input?.area || 'codebase'}`}
                          {step.tool === 'search_community' && `Researching: "${step.input?.topic || '...'}"` }
                          {step.tool === 'recall_past_decisions' && 'Reviewing past decisions...'}
                          {!['find_related_components','understand_structure','analyze_data_flow','detect_patterns','search_community','recall_past_decisions'].includes(step.tool) && `Using ${step.tool}...`}
                        </span>
                        {!isLatest && <span className="text-green-500 ml-auto shrink-0">✓</span>}
                        {isLatest && (
                          <div className="w-3 h-3 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin ml-auto shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-zinc-500">
                  {agentSteps.length > 0
                    ? `Agent investigating (step ${agentSteps.length})...`
                    : mode === 'analyze'
                      ? 'Analyzing your code and architecture...'
                      : 'Thinking through the design...'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-zinc-800 bg-zinc-900/50 px-6 py-4">
        {/* Mode toggle */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-zinc-500">Mode:</span>
          <button
            onClick={() => onModeChange('feature')}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              mode === 'feature'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-zinc-500 hover:text-zinc-300 border border-zinc-700 hover:bg-zinc-800'
            }`}
          >
            <span>🆕</span> Design new feature
          </button>
          <button
            onClick={() => onModeChange('analyze')}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              mode === 'analyze'
                ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                : 'text-zinc-500 hover:text-zinc-300 border border-zinc-700 hover:bg-zinc-800'
            }`}
          >
            <span>🔍</span> Review codebase
          </button>
          {onStartArchitectureSession && (
            <button
              onClick={onStartArchitectureSession}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5
                         text-purple-400 border border-purple-500/30 bg-purple-600/10
                         hover:bg-purple-600/20"
            >
              <span>🧠</span> Full Architecture Session
            </button>
          )}
        </div>

        {/* Input */}
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={
              mode === 'analyze'
                ? 'What should I review in your code? Or ask "is this architecture right?"...'
                : 'Describe the feature or design problem...'
            }
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm
                       text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500
                       resize-none max-h-[200px]"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="bg-blue-600 text-white px-5 py-3 rounded-xl text-sm font-medium
                       hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors shrink-0"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Thinking
              </span>
            ) : (
              'Ask Architect'
            )}
          </button>
        </div>

        <p className="text-xs text-zinc-600 mt-2">
          Enter to send · Shift+Enter for new line · Add code via the 📂 Code Context panel
        </p>
      </div>
    </div>
  );
}
