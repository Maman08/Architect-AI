import { SYSTEM_PROMPT, EXPLANATION_PROMPT } from '@/lib/prompts';
import { buildSmartCodeContext } from '@/lib/code-context';
import { runAgent } from '@/lib/agent/runner';

// ── Limits ──────────────────────────────────────────────
const MAX_HISTORY_MESSAGES = 16;
const MAX_PRD_CHARS = 3000;

export async function POST(request) {
  try {
    const body = await request.json();

    // ── Build smart code context (fallback when project is NOT indexed) ──
    const smartCodeContext = body.codeContext
      ? buildSmartCodeContext(body.codeContext, body.userMessage)
      : '';

    // ── Trim inputs ─────────────────────────────────────
    const trimmedPrd = (body.prd || '').slice(0, MAX_PRD_CHARS);
    const trimmedDecisions = (body.pastDecisions || []).slice(0, 15);
    const trimmedHistory = (body.conversationHistory || []).slice(-MAX_HISTORY_MESSAGES);

    // ── Build proper multi-turn messages ────────────────
    const messages = buildMultiTurnMessages({
      prd: trimmedPrd,
      techStack: body.techStack || '',
      pastDecisions: trimmedDecisions,
      codeContext: smartCodeContext,
      conversationHistory: trimmedHistory,
      userMessage: body.userMessage,
      mode: body.mode,
    });

    const systemPrompt = body.explanationMode
      ? SYSTEM_PROMPT + '\n\n---\n\n' + EXPLANATION_PROMPT
      : SYSTEM_PROMPT + AGENT_SYSTEM_ADDENDUM;

    // ── Run the agent (tool-use loop) ───────────────────
    const agentSteps = [];
    const { result, steps } = await runAgent({
      systemPrompt,
      messages,
      projectId: body.projectId,
      onThinkingStep: (step) => agentSteps.push(step),
    });

    return Response.json({
      result,
      agentSteps: agentSteps.map((s) => ({
        type: s.type,
        tool: s.tool,
        input: s.input ? JSON.stringify(s.input).slice(0, 200) : undefined,
      })),
    });
  } catch (error) {
    console.error('Architect API error:', error?.status, error?.message, error?.error);
    return Response.json(
      { error: error?.error?.message || error?.message || 'Failed to get response from Architect' },
      { status: error?.status || 500 }
    );
  }
}

// ── Extra system instructions for agent mode ────────────
const AGENT_SYSTEM_ADDENDUM = `

---

## TOOL USE INSTRUCTIONS

You have architecture investigation tools available. USE THEM.

Before answering any non-trivial question:
1. Call \`understand_structure\` to see the project layout (if this is your first question about the codebase)
2. Call \`find_related_components\` to find files relevant to the question
3. Call \`recall_past_decisions\` to check what was already decided
4. Call \`search_community\` ONLY if the question involves a choice between approaches

DO NOT just answer from the code pasted in context — investigate properly.
DO NOT call tools unnecessarily for simple follow-up questions.
DO NOT call more than 3 tools per question unless the question is very complex.

When you have enough context, give your final answer directly — do not say "I will now investigate" and then stop.
`;

// ── Multi-turn message builder ──────────────────────────
function buildMultiTurnMessages({
  prd,
  techStack,
  pastDecisions,
  codeContext,
  conversationHistory,
  userMessage,
  mode,
}) {
  const messages = [];

  // ── Build project context block ───────────────────────
  const contextParts = [];
  contextParts.push('## PROJECT CONTEXT\n');

  if (prd) {
    contextParts.push(`### PRD / Product Requirements:\n${prd}`);
  } else {
    contextParts.push('### PRD: Not provided yet');
  }

  if (techStack) {
    contextParts.push(`### Tech Stack:\n${techStack}`);
  }

  if (pastDecisions?.length) {
    contextParts.push(
      `### Past Architectural Decisions:\n${pastDecisions
        .map((d) => `- **${d.decision}** — ${d.reason}`)
        .join('\n')}`
    );
  }

  if (codeContext) {
    contextParts.push(`### Codebase (developer-selected files):\n${codeContext}`);
  }

  contextParts.push(
    `\n---\nMode: ${mode === 'feature' ? 'DESIGN SOMETHING NEW' : 'ANALYZE & IMPROVE CODEBASE'}`
  );

  const contextBlock = contextParts.join('\n\n');

  // ── Build message array ───────────────────────────────
  if (conversationHistory?.length > 0) {
    messages.push({ role: 'user', content: contextBlock });
    messages.push({
      role: 'assistant',
      content:
        "I've reviewed your complete project context — PRD, tech stack, past decisions, and the code you've shared. I have architecture investigation tools available and I'm ready to help. What would you like to work on?",
    });

    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    messages.push({ role: 'user', content: userMessage });
  } else {
    messages.push({
      role: 'user',
      content: contextBlock + `\n\n---\n\n## DEVELOPER ASKS:\n${userMessage}`,
    });
  }

  return messages;
}
