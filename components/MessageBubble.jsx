'use client';

import { useState, useCallback } from 'react';
import ResultRenderer from './ResultRenderer';

export default function MessageBubble({ message, onSaveDecision, onExplainArchitecture, projectName }) {
  const isUser = message.role === 'user';
  const hasMermaid = !isUser && message.content && /```mermaid/i.test(message.content);
  const isLongResponse = !isUser && message.content && message.content.length > 800;
  const [copied, setCopied] = useState(false);

  const handleCopyAll = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6`}>
      <div
        className={`${
          isUser
            ? 'max-w-[80%] bg-blue-600/20 border border-blue-500/30 rounded-2xl rounded-br-md px-5 py-3'
            : `${isLongResponse ? 'max-w-[95%]' : 'max-w-[90%]'} bg-zinc-800/30 border border-zinc-700/50 rounded-2xl rounded-bl-md px-5 py-4`
        }`}
      >
        {/* Role label + actions row */}
        <div className="flex items-center justify-between mb-2">
          <div className={`text-xs font-medium ${isUser ? 'text-blue-400' : 'text-amber-400'}`}>
            {isUser ? 'You' : '🏗️ Architect'}
          </div>

          {/* Copy button for architect messages */}
          {!isUser && (
            <button
              onClick={handleCopyAll}
              className={`text-xs transition-all duration-200 flex items-center gap-1 ${
                copied ? 'text-green-400' : 'text-zinc-600 hover:text-zinc-400'
              }`}
              title="Copy full response"
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          )}
        </div>

        {/* Content */}
        {isUser ? (
          <p className="text-zinc-200 text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <ResultRenderer content={message.content} projectName={projectName} />
        )}

        {/* Action buttons for architect messages */}
        {!isUser && (
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-zinc-700/30 flex-wrap">
            {/* Save decision button */}
            {onSaveDecision && (
              <button
                onClick={() => onSaveDecision(message.content)}
                className="text-xs text-zinc-500 hover:text-amber-400 transition-colors
                           flex items-center gap-1.5 border border-zinc-700 rounded-lg px-3 py-1.5
                           hover:border-amber-500/30 hover:bg-amber-500/5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                Save as decision
              </button>
            )}

            {/* Explain Architecture button */}
            {hasMermaid && onExplainArchitecture && (
              <button
                onClick={() => onExplainArchitecture(message.content)}
                className="text-xs text-zinc-500 hover:text-purple-400 transition-colors
                           flex items-center gap-1.5 border border-zinc-700 rounded-lg px-3 py-1.5
                           hover:border-purple-500/30 hover:bg-purple-500/5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Explain architecture
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
