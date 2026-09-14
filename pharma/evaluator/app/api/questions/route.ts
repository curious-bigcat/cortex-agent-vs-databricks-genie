import { NextResponse } from "next/server"
import { querySnowflake } from "@/lib/snowflake"
import { DB_SCHEMA } from "@/lib/constants"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const rows = await querySnowflake(
      `SELECT question_id, tier, traps, question_text, expected_answer, key_numbers,
              scoring_5, scoring_3, scoring_1
       FROM ${DB_SCHEMA}.TBL_EXPECTED_ANSWERS
       ORDER BY question_id`
    )
    return NextResponse.json(rows)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
