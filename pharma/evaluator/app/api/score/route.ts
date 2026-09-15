import { NextRequest, NextResponse } from "next/server"
import { querySnowflakeLongRunning } from "@/lib/snowflake"
import { DB_SCHEMA, SCORING_MODEL } from "@/lib/constants"

export const dynamic = "force-dynamic"

const SCORING_PROMPT = `You are a benchmark judge scoring a clinical trial AI agent's answer.
Score on 3 dimensions (1-5 each). Be lenient on formatting and presentation — focus on substance.

1. ACCURACY — Are the numbers right? (5 = all match, 1 = fabricated)
2. GROUNDEDNESS — Is it grounded in data? (5 = fully grounded, 1 = hallucinated)
3. RELEVANCE — Does it answer what was asked? (5 = fully addressed, 1 = off-topic)

RULES:
- Compare agent output against the expected answer and key numbers. Numbers within 5% are fine.
- Do NOT penalize for caveats, disclaimers, presentation style, table vs prose, or rounding differences.
- DO penalize for wrong numbers, hallucinated claims, and missed question parts.
- For document/literature questions: answer must come from corpus search, not generic knowledge.

Return ONLY valid JSON:
{
  "accuracy": <1-5>,
  "groundedness": <1-5>,
  "relevance": <1-5>,
  "rationale": "<2-3 sentences explaining scores, referencing specific numbers that matched or didn't>",
  "failure_pattern": "<Always provide 2-3 lines identifying what went wrong or what challenge this question poses. Name the root cause pattern: wrong-join-path, wrong-denominator, metric-hallucination, multi-table-join-failure, negation-blindness, cartesian-product, document-grounding-failure, CTE-planning-failure, or describe a new one. If the answer is perfect (all 5s), write 'none'.>"
}`


function buildMessages(promptText: string, images?: string[]) {
  // Cortex COMPLETE vision requires images on a Snowflake stage (TO_FILE).
  // Base64 images from the browser can't be passed directly.
  // Instead, we describe the screenshots in text for the LLM and note
  // that visual-only content (charts) should be described by the user in the text field.
  if (images && images.length > 0) {
    return promptText + `\n\n[NOTE: ${images.length} screenshot(s) were provided but cannot be processed visually. The scoring is based on the text output above. If charts or tables contain numbers not in the text, they may be missed.]`
  }
  return promptText
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { questionId, questionText, expectedAnswer, keyNumbers, traps, agentOutput, images, platform, runId } = body

    if (!questionId || (!agentOutput && (!images || images.length === 0))) {
      return NextResponse.json({ error: "questionId and agentOutput or images are required" }, { status: 400 })
    }

    const combinedOutput = agentOutput || "[No text output — only screenshots provided]"

    const promptText = `${SCORING_PROMPT}

QUESTION: ${questionText}

EXPECTED ANSWER: ${expectedAnswer}

KEY NUMBERS THAT MUST APPEAR: ${keyNumbers}

AGENT OUTPUT TO SCORE:
${combinedOutput}

Score this output now. Return only the JSON object.`

    const finalPrompt = buildMessages(promptText, images)

    const sql = `SELECT SNOWFLAKE.CORTEX.COMPLETE('${SCORING_MODEL}', ?) AS result`
    const rows = await querySnowflakeLongRunning(sql, {
      binds: [finalPrompt],
      maxWaitMs: 120_000,
    })

    const raw = rows[0]?.RESULT || rows[0]?.result || ""
    let scores
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      scores = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: "Failed to parse scoring response", raw }, { status: 500 })
    }

    const total = Number(scores.accuracy || 0) + Number(scores.groundedness || 0) +
      Number(scores.relevance || 0)

    const failurePattern = (scores.failure_pattern && scores.failure_pattern !== 'none') ? scores.failure_pattern : null

    const resultId = crypto.randomUUID()
    const outputForStorage = agentOutput
      ? agentOutput.substring(0, 16000)
      : `[${images?.length || 0} screenshot(s)]`

    const insertSql = `
      INSERT INTO ${DB_SCHEMA}.TBL_BENCHMARK_RESULTS
      (result_id, question_id, platform, agent_output,
       score_accuracy, score_groundedness, score_relevance,
       score_usefulness, score_correctness, score_consequences,
       score_total, scoring_rationale, run_id, dbx_failure_pattern)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?)`

    await querySnowflakeLongRunning(insertSql, {
      binds: [
        resultId, questionId, platform || "UNKNOWN", outputForStorage,
        scores.accuracy, scores.groundedness, scores.relevance,
        total, scores.rationale || "", runId || null, failurePattern,
      ],
    })

    return NextResponse.json({ ...scores, total, platform, questionId, failure_pattern: failurePattern })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
