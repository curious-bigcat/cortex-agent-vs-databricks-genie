import { NextRequest, NextResponse } from "next/server"
import { querySnowflakeLongRunning } from "@/lib/snowflake"
import { getDomainConfig, SCORING_MODEL } from "@/lib/constants"

export const dynamic = "force-dynamic"

function buildScoringPrompt(scoringContext: string) {
  return `You are a benchmark judge scoring a ${scoringContext}'s answer.
Score on 3 dimensions (1-5 each). Be lenient on formatting and presentation — focus on substance.

1. ACCURACY — Are the numbers right? (5 = all key numbers match within 5%, 1 = fabricated/hallucinated numbers)
2. GROUNDEDNESS — Is it grounded in actual data and corpus? (5 = fully grounded with citations, 1 = hallucinated from training data)
3. RELEVANCE — Does it answer what was asked? (5 = fully addressed all parts, 1 = off-topic or missing key parts)

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
  "rationale": "<Structured rationale with these sections — Accuracy: [which key numbers matched or didn't, by how much]. Groundedness: [was the answer grounded in actual data queries and corpus, or hallucinated from training knowledge?]. Relevance: [did it answer all parts of the question?]. Keep each section 1-2 sentences.>",
  "failure_pattern": "<Always provide a structured failure analysis: (1) Name the root cause pattern: wrong-join-path, wrong-denominator, metric-hallucination, multi-table-join-failure, negation-blindness, cartesian-product, document-grounding-failure, CTE-planning-failure, or describe a new one. (2) Explain what the agent did wrong technically (e.g., used INNER JOIN instead of LEFT JOIN, included screen failures in denominator, joined on wrong key). (3) State the impact: how far off the numbers are from correct (e.g., '2x inflation', '45% relative error', 'inverted ranking'). If the answer is perfect (all 5s), write 'none'.>"
}`
}


function buildMessages(promptText: string, images?: string[]) {
  if (images && images.length > 0) {
    return promptText + `\n\n[NOTE: ${images.length} screenshot(s) were provided but cannot be processed visually. The scoring is based on the text output above. If charts or tables contain numbers not in the text, they may be missed.]`
  }
  return promptText
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { questionId, questionText, expectedAnswer, keyNumbers, traps, agentOutput, images, platform, runId, domain } = body
    const config = getDomainConfig(domain)

    if (!questionId || (!agentOutput && (!images || images.length === 0))) {
      return NextResponse.json({ error: "questionId and agentOutput or images are required" }, { status: 400 })
    }

    const combinedOutput = agentOutput || "[No text output — only screenshots provided]"
    const scoringPrompt = buildScoringPrompt(config.scoringContext)

    const promptText = `${scoringPrompt}

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
      ? agentOutput.substring(0, 64000)
      : `[${images?.length || 0} screenshot(s)]`

    const insertSql = `
      INSERT INTO ${config.dbSchema}.TBL_BENCHMARK_RESULTS
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
