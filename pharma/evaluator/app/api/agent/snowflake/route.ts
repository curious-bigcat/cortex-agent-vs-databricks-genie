import { NextRequest, NextResponse } from "next/server"
import { getServiceToken } from "@/lib/snowflake"
import { CORTEX_AGENT_PATH } from "@/lib/constants"
import { parseCortexResponse } from "@/lib/agent-stream"
import { createStream, updateStream, completeStream, failStream, getStream } from "@/lib/stream-store"
import type { AgentContentItem } from "@/lib/agent-types"
import fs from "fs"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function getAccountUrl(): string {
  if (process.env.SNOWFLAKE_ACCOUNT_URL) return process.env.SNOWFLAKE_ACCOUNT_URL
  if (process.env.SNOWFLAKE_HOST) return `https://${process.env.SNOWFLAKE_HOST}`
  if (process.env.SNOWFLAKE_ACCOUNT) {
    return `https://${process.env.SNOWFLAKE_ACCOUNT}.snowflakecomputing.com`
  }
  throw new Error("Cannot determine Snowflake account URL")
}

function getAuthToken(): string {
  const spcsToken = getServiceToken()
  if (spcsToken) return spcsToken
  try {
    const { readTomlDefaultConnection } = require("@/lib/snowflake")
    const conn = readTomlDefaultConnection()
    if (conn?.token) return conn.token
    if (conn?.token_file_path) {
      return fs.readFileSync(conn.token_file_path, "utf8").trim()
    }
  } catch {}
  throw new Error("No auth token available for Cortex Agent API")
}

// POST: start the Cortex Agent stream in background, return requestId
export async function POST(request: NextRequest) {
  try {
    const { questionText } = await request.json()
    if (!questionText) {
      return NextResponse.json({ error: "questionText is required" }, { status: 400 })
    }

    const requestId = `sf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    createStream(requestId)

    const accountUrl = getAccountUrl()
    const token = getAuthToken()
    const url = `${accountUrl}${CORTEX_AGENT_PATH}`

    // Fire and forget — process stream in background
    processStream(requestId, url, token, questionText)

    return NextResponse.json({ requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET: poll for current stream state
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "id parameter required" }, { status: 400 })
  }
  const state = getStream(id)
  if (!state) {
    return NextResponse.json({ error: "Stream not found" }, { status: 404 })
  }
  return NextResponse.json(state)
}

async function processStream(requestId: string, url: string, token: string, questionText: string) {
  try {
    const body = {
      messages: [{ role: "user", content: [{ type: "text", text: questionText }] }],
      stream: true,
      orchestration: { budget: { seconds: 300, tokens: 32000 } },
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600_000),
    })

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => "")
      failStream(requestId, `Cortex Agent returned ${res.status}: ${errText.slice(0, 500)}`)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    // Incremental state
    const streamContent: AgentContentItem[] = []
    let textAccum = ""
    let thinkingAccum = ""

    function buildPartial() {
      const content = [...streamContent]
      if (thinkingAccum) {
        const existing = content.find((c) => c.type === "thinking")
        if (existing && existing.type === "thinking") existing.text = thinkingAccum
        else content.unshift({ type: "thinking", text: thinkingAccum })
      }
      if (textAccum) {
        const existing = content.find((c) => c.type === "text")
        if (existing && existing.type === "text") existing.text = textAccum
        else content.push({ type: "text", text: textAccum })
      }
      updateStream(requestId, { content, plainText: textAccum, fullTextForScoring: "" })
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split("\n\n")
      buffer = blocks.pop() || ""

      for (const block of blocks) {
        const trimmed = block.trim()
        if (!trimmed) continue

        let eventType = ""
        let dataStr = ""
        for (const line of trimmed.split("\n")) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim()
          else if (line.startsWith("data: ")) dataStr += line.slice(6)
          else if (line.startsWith("data:")) dataStr += line.slice(5)
        }

        if (!dataStr) continue
        let data: any
        try { data = JSON.parse(dataStr) } catch { continue }

        switch (eventType) {
          case "response.status": {
            const idx = streamContent.findIndex((c) => c.type === "status")
            const item = { type: "status" as const, message: data.message || data.status || "" }
            if (idx >= 0) streamContent[idx] = item
            else streamContent.push(item)
            buildPartial()
            break
          }
          case "response.thinking.delta": {
            thinkingAccum += data.text || ""
            buildPartial()
            break
          }
          case "response.thinking": {
            thinkingAccum = data.text || thinkingAccum
            buildPartial()
            break
          }
          case "response.text.delta": {
            textAccum += data.text || ""
            buildPartial()
            break
          }
          case "response.text": {
            textAccum = data.text || textAccum
            buildPartial()
            break
          }
          case "response.tool_use": {
            streamContent.push({
              type: "tool_step",
              toolName: data.name || "unknown",
              toolType: data.type || "unknown",
              sql: data.input?.sql,
              status: "invoked",
            })
            const statusIdx = streamContent.findIndex((c) => c.type === "status")
            if (statusIdx >= 0) streamContent.splice(statusIdx, 1)
            buildPartial()
            break
          }
          case "response.tool_result": {
            const toolStep = [...streamContent].reverse().find(
              (c) => c.type === "tool_step" && c.toolName === data.name
            )
            if (toolStep && toolStep.type === "tool_step") {
              toolStep.status = data.status || "success"
            }
            if (data.content) {
              for (const c of data.content) {
                if (c.type === "json" && c.json?.result_set) {
                  const rs = c.json.result_set
                  const columns = rs.resultSetMetaData?.rowType?.map((r: any) => r.name) || []
                  const rows = rs.data || []
                  streamContent.push({ type: "table", title: data.name, columns, rows })
                }
                if (c.type === "json" && c.json?.sql && toolStep && toolStep.type === "tool_step") {
                  toolStep.sql = c.json.sql
                }
              }
            }
            buildPartial()
            break
          }
          case "response.table": {
            const columns = data.result_set?.resultSetMetaData?.rowType?.map((r: any) => r.name) || []
            const rows = data.result_set?.data || []
            streamContent.push({ type: "table", title: data.title, columns, rows })
            buildPartial()
            break
          }
          case "response.chart": {
            if (data.chart_spec) {
              streamContent.push({ type: "chart", chartSpec: data.chart_spec })
              buildPartial()
            }
            break
          }
          case "response": {
            const finalParsed = parseCortexResponse(data)
            // Capture usage from the final response event
            if (data.usage) {
              finalParsed.tokens = data.usage.total_tokens || data.usage.completion_tokens
            }
            completeStream(requestId, finalParsed)
            return
          }
          case "error": {
            failStream(requestId, data.error || data.message || "Agent error")
            return
          }
        }
      }
    }

    // If we get here without a response event, mark done with what we have
    completeStream(requestId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    failStream(requestId, msg)
  }
}
