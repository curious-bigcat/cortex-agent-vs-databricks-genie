import { NextRequest, NextResponse } from "next/server"
import { querySnowflakeLongRunning } from "@/lib/snowflake"
import { DB_SCHEMA, SCORING_MODEL } from "@/lib/constants"

export const dynamic = "force-dynamic"

const SCORING_PROMPT = `You are a benchmark scoring judge for a clinical trial AI agent.

Score the agent's output on 6 dimensions (1-5 each):
1. ACCURACY: Are the numbers and facts correct?
2. GROUNDEDNESS: Is the answer grounded in the actual data/documents, not hallucinated?
3. RELEVANCE: Does the answer address the question asked?
4. USEFULNESS: Is the answer actionable and well-formatted?
5. CORRECTNESS: Is the SQL/search methodology correct? Did it avoid data traps?
6. DECISION_CONSEQUENCES: If a decision-maker acted on this answer, would the outcome be correct?

CRITICAL TRAP RULES:
- seriousness='SERIOUS' is CORRECT for serious AEs. severity='SEVERE' is WRONG (different concept).
- Enrollment rate must be DERIVED (no column exists). Screen failures must be in denominator.
- Visit on-time must use visit_window_days per visit, not a fixed window.
- AE grain: count events vs count patients — agent must clarify which.
- For document questions: answer must be grounded in corpus, not generic knowledge.
- EVERY question is hybrid: the agent must use BOTH structured data AND document search.

Return ONLY valid JSON (no markdown, no explanation):
{
  "accuracy": <1-5>,
  "groundedness": <1-5>,
  "relevance": <1-5>,
  "usefulness": <1-5>,
  "correctness": <1-5>,
  "decision_consequences": <1-5>,
  "rationale": "<2-3 sentences explaining the scores>",
  "consequences_detail": "<Detailed explanation: What would happen if a VP/board member acted on this answer? What decisions would go wrong? What patient safety, financial, or regulatory risks arise from any errors in this output? Be specific about the real-world impact.>"
}`


async function extractTextFromImages(images: string[]): Promise<string> {
  // Cortex COMPLETE vision needs TO_FILE from a stage.
  // Since we can't PUT files from an API route easily,
  // we describe the screenshots as "[Screenshot provided]" markers
  // and rely on the text output for scoring.
  // The images serve as visual evidence for the human reviewer.
  return images.map((_, i) => `[Screenshot ${i + 1} attached as visual evidence]`).join("\n")
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { questionId, questionText, expectedAnswer, keyNumbers, traps, agentOutput, images, platform, runId } = body

    if (!questionId || (!agentOutput && (!images || images.length === 0))) {
      return NextResponse.json({ error: "questionId and agentOutput or images are required" }, { status: 400 })
    }

    // Build combined output text
    let combinedOutput = agentOutput || ""
    if (images && images.length > 0) {
      const imageNote = await extractTextFromImages(images)
      if (combinedOutput) {
        combinedOutput += "\n\n" + imageNote
      } else {
        combinedOutput = imageNote
      }
    }

    const prompt = `${SCORING_PROMPT}

QUESTION: ${questionText}

EXPECTED ANSWER: ${expectedAnswer}

KEY NUMBERS THAT MUST APPEAR: ${keyNumbers}

DATA TRAPS TO CHECK: ${traps || "None"}

AGENT OUTPUT TO SCORE:
${combinedOutput}

Score this output now. Return only the JSON object.`

    const sql = `SELECT SNOWFLAKE.CORTEX.COMPLETE('${SCORING_MODEL}', ?) AS result`
    const rows = await querySnowflakeLongRunning(sql, {
      binds: [prompt],
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

    const total = (scores.accuracy || 0) + (scores.groundedness || 0) +
      (scores.relevance || 0) + (scores.usefulness || 0) +
      (scores.correctness || 0) + (scores.decision_consequences || 0)

    const resultId = crypto.randomUUID()
    const outputForStorage = agentOutput
      ? agentOutput.substring(0, 16000)
      : `[${images?.length || 0} screenshot(s)]`

    const insertSql = `
      INSERT INTO ${DB_SCHEMA}.TBL_BENCHMARK_RESULTS
      (result_id, question_id, platform, agent_output,
       score_accuracy, score_groundedness, score_relevance,
       score_usefulness, score_correctness, score_consequences,
       score_total, scoring_rationale, run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

    await querySnowflakeLongRunning(insertSql, {
      binds: [
        resultId, questionId, platform || "UNKNOWN", outputForStorage,
        scores.accuracy, scores.groundedness, scores.relevance,
        scores.usefulness, scores.correctness, scores.decision_consequences,
        total, scores.rationale || "", runId || null,
      ],
    })

    return NextResponse.json({ ...scores, total, platform, questionId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
