// ─── Agent Runner ───────────────────────────────────────
// The architect agent loop:
//   1. Claude sees the question + project context
//   2. Claude decides which tools to call (or answers directly)
//   3. We execute tools, send results back
//   4. Claude reasons with tool results, maybe calls more tools
//   5. Eventually Claude gives a final answer
//
// This is the REAL AI work — Claude decides what to investigate.

import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, executeTool } from '@/lib/agent/tools';
import { isProjectIndexed } from '@/lib/rag';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Guardrails ──────────────────────────────────────────
const MAX_ITERATIONS = 8;          // Max tool-use loops
const MAX_RESPONSE_TOKENS = 8192;  // Final answer can be long
const TOOL_CALL_TOKENS = 2048;     // Tool-calling steps are shorter

/**
 * Run the architect agent.
 *
 * @param {object} params
 * @param {string} params.systemPrompt - the system prompt
 * @param {Array} params.messages - multi-turn message array
 * @param {string} params.projectId - for tool context
 * @param {function} params.onThinkingStep - callback for each agent step (for streaming)
 *   Called with { type: 'tool_call'|'tool_result'|'thinking', tool?, input?, result? }
 * @returns {{ result: string, steps: Array }}
 */
export async function runAgent({ systemPrompt, messages, projectId, onThinkingStep }) {
  const steps = [];
  let iterations = 0;

  // Check if project is indexed (has RAG data)
  const indexed = await isProjectIndexed(projectId);

  // If not indexed, use a reduced tool set (only community search + decisions)
  const tools = indexed
    ? TOOL_DEFINITIONS
    : TOOL_DEFINITIONS.filter((t) =>
        ['search_community', 'recall_past_decisions'].includes(t.name)
      );

  // Clone messages to avoid mutating the original
  const agentMessages = [...messages];

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // Decide max_tokens: shorter for tool-calling steps, longer for final answer
    const isLikelyFinalStep = iterations > 1;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: isLikelyFinalStep ? MAX_RESPONSE_TOKENS : TOOL_CALL_TOKENS,
      system: systemPrompt,
      messages: agentMessages,
      tools: tools.length > 0 ? tools : undefined,
    });

    // Check what Claude returned
    const hasToolUse = response.content.some((b) => b.type === 'tool_use');
    const textBlocks = response.content.filter((b) => b.type === 'text');
    const toolBlocks = response.content.filter((b) => b.type === 'tool_use');

    if (!hasToolUse) {
      // Final answer — no more tools needed
      const finalText = textBlocks.map((b) => b.text).join('\n');

      steps.push({ type: 'final_answer', text: finalText });

      return { result: finalText, steps };
    }

    // Claude wants to use tools
    // Add Claude's response (with tool_use blocks) to messages
    agentMessages.push({ role: 'assistant', content: response.content });

    // Execute each tool call
    const toolResults = [];

    for (const toolBlock of toolBlocks) {
      const step = {
        type: 'tool_call',
        tool: toolBlock.name,
        input: toolBlock.input,
        id: toolBlock.id,
      };
      steps.push(step);

      // Notify caller (for streaming to UI)
      if (onThinkingStep) {
        onThinkingStep(step);
      }

      try {
        const result = await executeTool(toolBlock.name, toolBlock.input, { projectId });

        const resultStep = {
          type: 'tool_result',
          tool: toolBlock.name,
          result: result.slice(0, 5000), // Safety truncation
          id: toolBlock.id,
        };
        steps.push(resultStep);

        if (onThinkingStep) {
          onThinkingStep(resultStep);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: result.slice(0, 5000),
        });
      } catch (err) {
        console.error(`Tool ${toolBlock.name} failed:`, err.message);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: `Tool error: ${err.message}`,
          is_error: true,
        });
      }
    }

    // Send tool results back to Claude
    agentMessages.push({ role: 'user', content: toolResults });
  }

  // Exhausted iterations — force a final response
  agentMessages.push({
    role: 'user',
    content:
      'You have used all available investigation steps. Please provide your best answer now based on what you have gathered so far.',
  });

  const finalResponse = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: MAX_RESPONSE_TOKENS,
    system: systemPrompt,
    messages: agentMessages,
  });

  const finalText = finalResponse.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  steps.push({ type: 'final_answer', text: finalText });

  return { result: finalText, steps };
}
