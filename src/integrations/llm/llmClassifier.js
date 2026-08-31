const config = require('../../config/env');
const { CLASSIFIER_LABELS } = require('../../classifier/labels');
const { getHistory } = require('../../db/transactionStore');

// Switched to Gemini (Day 6): the configured LLM_API_KEY doesn't match
// Anthropic's sk-ant- format, and a real call to api.anthropic.com
// confirmed a 401 invalid x-api-key. Not confirmed to be a genuine
// Google API key either (those are normally AIzaSy...), but this is
// cheap to verify empirically against the real endpoint rather than
// argue about the key's format further.
// gemini-2.0-flash returned 404 "no longer available" from a real call;
// this is Google's own suggested replacement from that error response.
const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_TOKENS = 300;
const MAX_HISTORY_IN_PROMPT = 5;

const VALID_LABELS = new Set(Object.values(CLASSIFIER_LABELS));

/**
 * LLM-assisted classification for transactions the deterministic filter
 * can't confidently label. Without LLM_API_KEY configured, transactions
 * are held at needs_review for manual triage rather than guessed at.
 */
async function classifyWithLLM(transaction) {
  if (!config.llm.apiKey) {
    return {
      label: CLASSIFIER_LABELS.NEEDS_REVIEW,
      confidence: 0,
      path: 'llm_unavailable',
      reason: 'LLM_API_KEY not configured - held for manual review',
    };
  }

  const prompt = buildPrompt(transaction);
  const startedAt = Date.now();

  let response;
  try {
    response = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(config.llm.apiKey)}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: MAX_TOKENS },
      }),
    });
  } catch (err) {
    return {
      label: CLASSIFIER_LABELS.NEEDS_REVIEW,
      confidence: 0,
      path: 'llm_assisted',
      latency_ms: Date.now() - startedAt,
      parse_error: true,
      reason: `LLM request failed: ${err.message}`,
    };
  }

  const latency_ms = Date.now() - startedAt;

  if (!response.ok) {
    const errorBody = await safeReadText(response);
    return {
      label: CLASSIFIER_LABELS.NEEDS_REVIEW,
      confidence: 0,
      path: 'llm_assisted',
      latency_ms,
      parse_error: true,
      reason: `LLM API error ${response.status}: ${errorBody}`,
    };
  }

  const body = await response.json();
  const rawText = body?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return parseModelResponse(rawText, latency_ms);
}

function buildPrompt(transaction) {
  const history = getHistory(transaction?.rail_id).slice(-MAX_HISTORY_IN_PROMPT);

  const historyLines = history.length
    ? history
        .map((t, i) => `${i + 1}. amount=${t.amount}, note="${t.note || ''}", credited_at=${t.credited_at}`)
        .join('\n')
    : '(no prior transactions on this rail)';

  return `You are classifying a single payment transaction for a gig-worker income verification system.

Categories (use EXACTLY one of these label strings): recurring_wage, gig_payout, advance, transfer, needs_review.

Current transaction:
- amount: ${transaction?.amount}
- note: "${transaction?.note || ''}"
- credited_at: ${transaction?.credited_at}

Up to ${MAX_HISTORY_IN_PROMPT} prior transactions on the same payment rail, most recent last:
${historyLines}

Respond with ONLY a single JSON object, no markdown, no code fences, no extra text, in exactly this shape:
{"label": "<one of the category strings above>", "confidence": <number between 0 and 1>, "reasoning": "<one sentence>"}`;
}

function parseModelResponse(rawText, latency_ms) {
  const stripped = rawText
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    return {
      label: CLASSIFIER_LABELS.NEEDS_REVIEW,
      confidence: 0,
      path: 'llm_assisted',
      latency_ms,
      parse_error: true,
      reason: `Failed to parse LLM response as JSON: ${err.message}`,
    };
  }

  if (!parsed || !VALID_LABELS.has(parsed.label) || typeof parsed.confidence !== 'number') {
    return {
      label: CLASSIFIER_LABELS.NEEDS_REVIEW,
      confidence: 0,
      path: 'llm_assisted',
      latency_ms,
      parse_error: true,
      reason: 'LLM response JSON did not match the expected shape',
    };
  }

  return {
    label: parsed.label,
    confidence: parsed.confidence,
    path: 'llm_assisted',
    latency_ms,
    reason: parsed.reasoning || null,
  };
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch (err) {
    return '(failed to read error body)';
  }
}

module.exports = { classifyWithLLM };
