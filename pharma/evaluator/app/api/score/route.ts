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
  "rationale": "<2-3 sentences explaining scores, referencing specific numbers that matched or didn't>"
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
      (scores.relevance || 0)

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
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`

    await querySnowflakeLongRunning(insertSql, {
      binds: [
        resultId, questionId, platform || "UNKNOWN", outputForStorage,
        scores.accuracy, scores.groundedness, scores.relevance,
        total, scores.rationale || "", runId || null,
      ],
    })

    return NextResponse.json({ ...scores, total, platform, questionId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
