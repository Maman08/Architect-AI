'use client';

import { useState } from 'react';

export default function SaveDecisionModal({ onSave, onClose, architectResponse }) {
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');

  const handleSave = () => {
    if (!decision.trim()) return;
    onSave(decision, reason);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-zinc-200 mb-1">Save Decision</h3>
        <p className="text-sm text-zinc-500 mb-4">
          Record this decision so the Architect remembers it in future conversations.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">What was decided?</label>
            <input
              type="text"
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              placeholder="e.g. Use event-driven architecture for notifications"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm
                         text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Why?</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Better decoupling, easier to add new notification channels later"
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm
                         text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500
                         resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors px-4 py-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!decision.trim()}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-500
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Save to Project Memory
          </button>
        </div>
      </div>
    </div>
  );
}
