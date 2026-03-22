'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ResultRenderer from './ResultRenderer';

export default function ArchitectureSession({
  projectId,
  conversationId,
  projectContext,
  onSessionComplete,
  onCancel,
}) {
  const [sessionId, setSessionId] = useState(null);
  const [state, setState] = useState(null); // GATHERING_INFO | GENERATING | DONE
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [questionNumber, setQuestionNumber] = useState(0);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [architecture, setArchitecture] = useState('');
  const [history, setHistory] = useState([]); // { question, answer } pairs
  const [pollCount, setPollCount] = useState(0);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const pollTimerRef = useRef(null);
  const sessionIdRef = useRef(null); // stable ref for use in polling closure

  // Keep ref in sync
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Auto-focus input
  useEffect(() => {
    if (state === 'GATHERING_INFO' && !loading) {
      inputRef.current?.focus();
    }
  }, [state, loading, currentQuestion]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, currentQuestion, architecture, state]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollTimerRef.current) clearTimeout(pollTimerRef.current); };
  }, []);

  // Poll Supabase when in GENERATING state
  const pollForArchitecture = useCallback(async (sid) => {
    try {
      const res = await fetch('/api/architect/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, projectContext, answer: '' }),
      });
      const data = await res.json();

      if (data.state === 'DONE' && data.architecture) {
        setArchitecture(data.architecture);
        setState('DONE');
        setLoading(false);
        if (onSessionComplete) onSessionComplete(data.architecture);
      } else if (data.state === 'GENERATING') {
        // Still generating — poll again in 5s
        setPollCount(c => c + 1);
        pollTimerRef.current = setTimeout(() => pollForArchitecture(sid), 5000);
      }
    } catch (err) {
      console.error('Poll error:', err);
      pollTimerRef.current = setTimeout(() => pollForArchitecture(sid), 8000);
    }
  }, [projectContext, onSessionComplete]);

  // Start session on mount
  useEffect(() => {
    startSession();
  }, []);

  async function startSession() {
    setLoading(true);
    try {
      const res = await fetch('/api/architect/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isFirst: true,
          projectId,
          conversationId,
          projectContext,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setSessionId(data.sessionId);
      sessionIdRef.current = data.sessionId;
      setState(data.state);
      setCurrentQuestion(data.question);
      setQuestionNumber(data.questionNumber);
    } catch (err) {
      console.error('Failed to start session:', err);
      setCurrentQuestion('⚠️ Failed to start session: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAnswer() {
    if (!answer.trim() || loading) return;

    const currentAnswer = answer.trim();
    setHistory((prev) => [...prev, { question: currentQuestion, answer: currentAnswer }]);
    setAnswer('');
    setLoading(true);

    try {
      const res = await fetch('/api/architect/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          projectContext,
          answer: currentAnswer,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setState(data.state);

      if (data.state === 'DONE') {
        setArchitecture(data.architecture);
        setLoading(false);
        if (onSessionComplete) onSessionComplete(data.architecture);
      } else if (data.state === 'GENERATING') {
        // Architecture is being generated in background — start polling
        pollTimerRef.current = setTimeout(() => pollForArchitecture(sessionIdRef.current), 5000);
        // Keep loading=true, UI shows generating state
      } else {
        setCurrentQuestion(data.question);
        setQuestionNumber(data.questionNumber);
        setLoading(false);
      }
    } catch (err) {
      console.error('Session error:', err);
      setCurrentQuestion('⚠️ Error: ' + err.message);
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitAnswer();
    }
  }

  // ─── GENERATING state — background job running ─────
  if (state === 'GENERATING') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 gap-6 px-6">
        <div className="text-center">
          <div className="text-5xl mb-4">🏗️</div>
          <h2 className="text-lg font-semibold text-zinc-200 mb-2">
            Designing your architecture...
          </h2>
          <p className="text-sm text-zinc-500 max-w-sm">
            Generating detailed diagrams and component breakdown.
            This takes 1-2 minutes. You can wait — we&apos;ll show it when ready.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2.5 h-2.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2.5 h-2.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <p className="text-xs text-zinc-600">
          Checking for result{pollCount > 0 ? ` (checked ${pollCount} time${pollCount > 1 ? 's' : ''})` : ''}...
        </p>
        <button
          onClick={onCancel}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mt-4"
        >
          Cancel and go back
        </button>
      </div>
    );
  }

  // ─── DONE state — show architecture ────────────────
  if (state === 'DONE' && architecture) {
    return (
      <div className="flex-1 flex flex-col min-w-0 bg-zinc-950">
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-emerald-400">✅ Architecture Generated</h2>
            <span className="text-xs text-zinc-500">
              Based on {history.length} questions
            </span>
          </div>
          <button
            onClick={onCancel}
            className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded-lg
                       px-3 py-1.5 hover:bg-zinc-800 transition-colors"
          >
            ← Back to Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
          <div className="max-w-4xl mx-auto">
            <ResultRenderer content={architecture} />
          </div>
        </div>
      </div>
    );
  }

  // ─── GATHERING_INFO state — Q&A flow ───────────────
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-purple-400">🧠 Architecture Discovery</h2>
          <span className="text-xs text-zinc-600">|</span>
          <span className="text-xs text-zinc-500">
            Question {questionNumber} of ~8
          </span>
        </div>
        <button
          onClick={onCancel}
          className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded-lg
                     px-3 py-1.5 hover:bg-zinc-800 transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-6 pt-3">
        <div className="w-full bg-zinc-800 rounded-full h-1.5">
          <div
            className="bg-purple-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${Math.min((questionNumber / 8) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* History + Current Question */}
      <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Past Q&A pairs */}
          {history.map((item, i) => (
            <div key={i} className="space-y-3">
              {/* Question */}
              <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl px-5 py-4">
                <div className="text-xs font-medium text-purple-400 mb-2">
                  Question {i + 1}
                </div>
                <p className="text-zinc-200 text-sm">{item.question}</p>
              </div>
              {/* Answer */}
              <div className="flex justify-end">
                <div className="bg-blue-600/20 border border-blue-500/30 rounded-2xl rounded-br-md px-5 py-3 max-w-[85%]">
                  <p className="text-zinc-200 text-sm">{item.answer}</p>
                </div>
              </div>
            </div>
          ))}

          {/* Current question */}
          {currentQuestion && state === 'GATHERING_INFO' && (
            <div className="bg-zinc-800/50 border border-purple-500/30 rounded-2xl px-5 py-4">
              <div className="text-xs font-medium text-purple-400 mb-2">
                Question {questionNumber}
              </div>
              <p className="text-zinc-200 text-sm font-medium">{currentQuestion}</p>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl px-5 py-4">
              <div className="text-xs font-medium text-purple-400 mb-2">🧠 Thinking...</div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </div>

      {/* Input area */}
      {state === 'GATHERING_INFO' && !loading && (
        <div className="border-t border-zinc-800 bg-zinc-900/50 px-6 py-4">
          <div className="max-w-2xl mx-auto flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="Type your answer..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm
                         text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500
                         resize-none max-h-[150px]"
            />
            <button
              onClick={handleSubmitAnswer}
              disabled={!answer.trim()}
              className="bg-purple-600 text-white px-5 py-3 rounded-xl text-sm font-medium
                         hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed
                         transition-colors shrink-0"
            >
              Answer
            </button>
          </div>
          <p className="text-xs text-zinc-600 mt-2 max-w-2xl mx-auto">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      )}
    </div>
  );
}
