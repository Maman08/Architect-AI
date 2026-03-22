# 🏗️ Architect AI

**Your senior engineer thinking partner.** A personal tool that helps you solve design and architecture problems in your projects — like having a senior engineer sitting next to you.

## What This Does

You give it:
1. **Project context** — PRD, tech stack, past decisions
2. **Code** — via GitHub PAT, file upload, or paste
3. **A design question or problem**

It responds like a senior engineer + patient teacher. Discussion continues until you're satisfied. Every meaningful decision gets saved to project memory.

## Tech Stack

- **Next.js 16** (App Router) + **Tailwind CSS**
- **Anthropic API** (claude-sonnet-4-20250514)
- **Mermaid.js** for architecture diagrams
- **React Markdown** for rendering responses
- **Supabase** for persistent storage
- Ready for **Vercel** deployment

## Setup

### 1. Supabase

1. Create a [Supabase](https://supabase.com) project
2. Go to the SQL Editor and run the schema from `lib/supabase-schema.sql`
3. Copy your project URL and anon key

### 2. Environment Variables

Copy `.env.local` and fill in your keys:

```
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 3. Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment (Vercel)

1. Push to GitHub
2. Import in [Vercel](https://vercel.com)
3. Add environment variables:
   - `ANTHROPIC_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

## Project Structure

```
app/
├── page.js                          ← Home (project list)
├── project/[id]/page.js             ← Project dashboard
├── api/architect/route.js            ← Anthropic API call
├── api/github/tree/route.js          ← Fetch repo file tree
└── api/github/files/route.js         ← Fetch file contents
components/
├── ProjectCard.jsx                   ← Project card on home
├── ContextSidebar.jsx                ← PRD, tech stack, decisions
├── CodePanel.jsx                     ← GitHub + Upload + Paste
├── ConversationArea.jsx              ← Chat UI
├── MessageBubble.jsx                 ← Single message render
├── ResultRenderer.jsx                ← Markdown + Mermaid
├── FileTree.jsx                      ← GitHub file tree selector
└── SaveDecisionModal.jsx             ← Save decision from response
lib/
├── supabase.js                       ← Supabase client
├── supabase-schema.sql               ← Database schema
├── storage.js                        ← Data access layer
├── prompts.js                        ← System prompt + builder
├── github.js                         ← GitHub API helpers
└── utils.js                          ← Utility functions
```

## Key Architecture Notes

- `lib/prompts.js` is the brain — the system prompt is carefully crafted. Do not rephrase or shorten it.
- Full context (PRD + tech stack + decisions + code + conversation history) is sent on every API call — Claude has no memory between calls.
- GitHub PAT is stored in the browser only. It gets sent to the GitHub API and included in Anthropic context — never stored server-side.
- Mermaid diagrams render inline inside markdown via `ResultRenderer.jsx`.
- All text fields auto-save with 500ms debounce.
