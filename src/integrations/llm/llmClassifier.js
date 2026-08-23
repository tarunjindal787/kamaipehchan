const config = require('../../config/env');
const { CLASSIFIER_LABELS } = require('../../classifier/labels');
const { getHistory } = require('../../db/transactionStore');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
// NOTE: not a currently-known Anthropic model ID as of this writing - verify
// against Anthropic's docs before relying on this. If it's wrong, the API
// call fails and is caught below, falling back to needs_review rather than
// silently misclassifying.
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_VERSION = '2023-06-01';
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
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.llm.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
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
  const rawText = body?.content?.[0]?.text || '';

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
