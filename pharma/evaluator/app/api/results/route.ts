import { NextRequest, NextResponse } from "next/server"
import { querySnowflake } from "@/lib/snowflake"
import { getDomainConfig } from "@/lib/constants"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const runId = request.nextUrl.searchParams.get("runId")
    const domain = request.nextUrl.searchParams.get("domain")
    const { dbSchema } = getDomainConfig(domain)

    let sql: string
    if (runId) {
      sql = `SELECT r.result_id, r.question_id, r.platform,
                    r.score_accuracy, r.score_groundedness, r.score_relevance,
                    r.score_total, r.scoring_rationale, r.scored_at, r.run_id,
                    r.dbx_failure_pattern,
                    e.traps, e.question_text
             FROM ${dbSchema}.TBL_BENCHMARK_RESULTS r
             JOIN ${dbSchema}.TBL_EXPECTED_ANSWERS e ON r.question_id = e.question_id
             WHERE r.run_id = '${runId.replace(/'/g, "''")}'
             ORDER BY r.question_id, r.platform`
    } else {
      sql = `WITH latest AS (
               SELECT *, ROW_NUMBER() OVER (PARTITION BY question_id, platform ORDER BY scored_at DESC) AS rn
               FROM ${dbSchema}.TBL_BENCHMARK_RESULTS
             )
             SELECT r.result_id, r.question_id, r.platform,
                    r.score_accuracy, r.score_groundedness, r.score_relevance,
                    r.score_total, r.scoring_rationale, r.scored_at, r.run_id,
                    r.dbx_failure_pattern,
                    e.traps, e.question_text
             FROM latest r
             JOIN ${dbSchema}.TBL_EXPECTED_ANSWERS e ON r.question_id = e.question_id
             WHERE r.rn = 1
             ORDER BY r.question_id, r.platform`
    }

    const rows = await querySnowflake(sql)

    const runs = await querySnowflake(
      `SELECT DISTINCT run_id, MIN(scored_at) as started_at, COUNT(*) as num_scores
       FROM ${dbSchema}.TBL_BENCHMARK_RESULTS
       WHERE run_id IS NOT NULL
       GROUP BY run_id
       ORDER BY started_at DESC
       LIMIT 20`
    )

    return NextResponse.json({ results: rows, runs })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
