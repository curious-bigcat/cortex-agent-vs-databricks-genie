import { NextRequest, NextResponse } from "next/server"
import { querySnowflake } from "@/lib/snowflake"
import { getDomainConfig } from "@/lib/constants"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const domain = request.nextUrl.searchParams.get("domain")
    const { dbSchema } = getDomainConfig(domain)

    const rows = await querySnowflake(
      `SELECT question_id, traps, question_text, expected_answer, key_numbers,
              scoring_5, scoring_3, scoring_1, complexity_type, dbx_failure_pattern,
              sf_tool_calls, sf_failures, dbx_tool_calls, dbx_failures
       FROM ${dbSchema}.TBL_EXPECTED_ANSWERS
       ORDER BY question_id`
    )
    return NextResponse.json(rows)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
