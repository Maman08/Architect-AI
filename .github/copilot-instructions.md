# Architect AI — Copilot Instructions

## Project Overview
Architect AI is a senior engineer thinking partner — a web app that helps solve design and architecture problems. It uses Anthropic's Claude API, renders Mermaid diagrams, and stores everything in Supabase.

## Tech Stack
- Next.js 16 (App Router) with JavaScript (not TypeScript)
- Tailwind CSS (v4, dark theme, zinc palette)
- Supabase for database (projects, decisions, conversations, messages)
- Anthropic SDK for AI responses
- Mermaid.js for architecture diagrams inside markdown
- React Markdown + remark-gfm for rendering

## Architecture Rules
- `lib/prompts.js` is the brain — DO NOT modify the system prompt
- Full context (PRD + tech stack + decisions + code + conversation) is sent on EVERY API call
- Supabase client is lazy-initialized via `getSupabase()` to avoid build-time errors
- All storage functions are in `lib/storage.js` — the single data access layer
- GitHub PAT is never stored server-side
- Components are client-side (`'use client'`)
- API routes are server-side (Next.js route handlers)

## Conventions
- Use functional components with hooks
- Use `useCallback` for handlers passed to children
- Auto-save text fields with 500ms debounce
- Dark theme only (zinc-950 background, zinc-900 cards)
- All Supabase queries go through `lib/storage.js`, never directly in components
