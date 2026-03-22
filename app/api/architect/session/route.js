import Anthropic from '@anthropic-ai/sdk';
import { QUESTIONING_SYSTEM_PROMPT } from '@/lib/prompts';
import {
  getSession,
  createSession,
  appendQuestion,
  appendAnswer,
  setReady,
  saveFinalArchitecture,
} from '@/lib/sessions';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Helper: build full message array from session Q&A history
// Sends rich project context as the first exchange, then real Q&A turns
function buildMessages(projectContext, questions, answers) {
  const messages = [];

  // ── Rich project context ──────────────────────────────
  const contextParts = ['## PROJECT CONTEXT FOR ARCHITECTURE DISCOVERY\n'];

  if (projectContext?.prd) {
    contextParts.push(`### PRD / Product Requirements:\n${projectContext.prd.slice(0, 3000)}`);
  } else {
    contextParts.push('### PRD: Not provided — discover through questions');
  }

  if (projectContext?.techStack) {
    contextParts.push(`### Tech Stack:\n${projectContext.techStack}`);
  }

  if (projectContext?.pastDecisions?.length) {
    contextParts.push(
      `### Past Architectural Decisions:\n${projectContext.pastDecisions
        .slice(0, 15)
        .map((d) => `- **${d.decision}** — ${d.reason}`)
        .join('\n')}`
    );
  }

  if (projectContext?.codeContext) {
    contextParts.push(`### Codebase Snapshot (developer-selected files):\n${projectContext.codeContext.slice(0, 15000)}`);
  }

  contextParts.push('\nPlease start the architecture discovery session.');

  messages.push({ role: 'user', content: contextParts.join('\n\n') });

  // ── Replay Q&A turns as proper multi-turn ─────────────
  for (let i = 0; i < questions.length; i++) {
    messages.push({ role: 'assistant', content: questions[i] });
    if (answers[i]) {
      messages.push({ role: 'user', content: answers[i] });
    }
  }
  return messages;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { sessionId, projectContext, answer, isFirst, projectId, conversationId } = body;

    // ── Start a new session ────────────────────────────
    if (isFirst) {
      const session = await createSession(projectId, conversationId);

      const messages = buildMessages(projectContext, [], []);

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: QUESTIONING_SYSTEM_PROMPT,
        messages,
      });

      const question = response.content[0].text.trim();
      await appendQuestion(session.id, question);

      return Response.json({
        sessionId: session.id,
        state: 'GATHERING_INFO',
        question,
        questionNumber: 1,
      });
    }

    // ── Continue existing session ──────────────────────
    if (!sessionId) {
      return Response.json({ error: 'sessionId is required' }, { status: 400 });
    }

    let session = await getSession(sessionId);
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    // If already done, return final architecture
    if (session.state === 'DONE' && session.final_architecture) {
      return Response.json({
        sessionId: session.id,
        state: 'DONE',
        architecture: session.final_architecture,
      });
    }

    // If still generating (background job running), tell client to keep polling
    if (session.state === 'GENERATING') {
      return Response.json({ sessionId: session.id, state: 'GENERATING' });
    }

    // Save user's answer
    await appendAnswer(sessionId, answer);
    session = await getSession(sessionId);

    const questions = session.questions_asked || [];
    const answers = session.user_answers || [];
    const messages = buildMessages(projectContext, questions, answers);

    // Ask next question or detect __READY__
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: QUESTIONING_SYSTEM_PROMPT,
      messages,
    });

    const aiResponse = response.content[0].text.trim();

    if (aiResponse.includes('__READY__')) {
      // Mark as GENERATING immediately so the client knows to poll
      await setReady(sessionId);

      // Fire-and-forget: generate architecture in background
      // Do NOT await — return immediately so request doesn't time out
      generateArchitectureBackground(sessionId, messages, projectContext).catch(err => {
        console.error('Background architecture generation failed:', err.message);
      });

      return Response.json({
        sessionId: session.id,
        state: 'GENERATING',
      });
    }

    // Otherwise, it's the next question
    await appendQuestion(sessionId, aiResponse);

    return Response.json({
      sessionId: session.id,
      state: 'GATHERING_INFO',
      question: aiResponse,
      questionNumber: questions.length + 1,
    });

  } catch (error) {
    console.error('Session API error:', error?.status, error?.message, error?.error);
    return Response.json(
      { error: error?.error?.message || error?.message || 'Session failed' },
      { status: error?.status || 500 }
    );
  }
}

// Runs in background after route returns — generates full architecture
async function generateArchitectureBackground(sessionId, messages, projectContext) {
  const archMessages = [
    ...messages,
    { role: 'assistant', content: '__READY__' },
    {
      role: 'user',
      content: `You now have full context from this discovery session. Generate the COMPLETE architecture document.

Requirements:
1. **System Overview** — high-level what this is and why it's built this way
2. **Architecture Diagram** — mermaid flowchart showing all major components and how they connect
3. **Data Model** — mermaid ER diagram with actual fields, types, and relationships
4. **API Design** — key endpoints/interfaces with request/response shapes
5. **Sequence Diagrams** — mermaid sequence diagrams for the 2-3 most critical user flows
6. **Technology Decisions** — what to use and WHY (not just a list)
7. **Risks & Mitigations** — what could go wrong and how to handle it
8. **Implementation Roadmap** — phased approach with clear milestones

Every mermaid diagram must be rich and self-explanatory — someone should understand the system just from the diagrams. Use real names, not generic labels.`,
    },
  ];

  const archClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const archResponse = await archClient.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 12000,
    system: QUESTIONING_SYSTEM_PROMPT,
    messages: archMessages,
  });

  const architecture = archResponse.content[0].text;
  await saveFinalArchitecture(sessionId, architecture);
}
