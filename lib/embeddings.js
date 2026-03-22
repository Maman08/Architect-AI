// ─── Embeddings via OpenAI ───────────────────────────────
// Uses text-embedding-3-small (cheapest, 1536 dims)
// We embed ARCHITECTURAL SUMMARIES, not raw code.

import OpenAI from 'openai';

let _client = null;

function getClient() {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set in .env.local');
  _client = new OpenAI({ apiKey });
  return _client;
}

/**
 * Generate embedding for a single text string.
 * Returns a 1536-dimension float array.
 */
export async function embed(text) {
  const client = getClient();
  const res = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000), // model limit safety
  });
  return res.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in one batch.
 * OpenAI supports up to 2048 inputs per call.
 * Returns array of { text, embedding } in same order.
 */
export async function embedBatch(texts) {
  const client = getClient();
  const trimmed = texts.map((t) => t.slice(0, 8000));

  // Batch in chunks of 100 to stay safe
  const results = [];
  for (let i = 0; i < trimmed.length; i += 100) {
    const batch = trimmed.slice(i, i + 100);
    const res = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    });
    for (let j = 0; j < res.data.length; j++) {
      results.push({
        text: texts[i + j],
        embedding: res.data[j].embedding,
      });
    }
  }

  return results;
}
