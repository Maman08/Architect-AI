'use client';

import { formatDistanceToNow } from '@/lib/utils';

export default function ProjectCard({ project, onClick, onDelete }) {
  return (
    <div
      onClick={onClick}
      className="group relative bg-zinc-900 border border-zinc-800 rounded-xl p-6 cursor-pointer
                 hover:border-zinc-600 hover:bg-zinc-800/50 transition-all duration-200"
    >
      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete "${project.name}"? This cannot be undone.`)) {
            onDelete(project.id);
          }
        }}
        className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity
                   text-zinc-500 hover:text-red-400 p-1"
        title="Delete project"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>

      <h3 className="text-lg font-semibold text-white mb-1 pr-8">{project.name}</h3>

      {project.description && (
        <p className="text-sm text-zinc-400 mb-3 line-clamp-2">{project.description}</p>
      )}

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        {project.tech_stack && (
          <span className="bg-zinc-800 px-2 py-0.5 rounded-full truncate max-w-[200px]">
            {project.tech_stack}
          </span>
        )}
        <span className="ml-auto whitespace-nowrap">
          {formatDistanceToNow(project.updated_at)}
        </span>
      </div>
    </div>
  );
}
