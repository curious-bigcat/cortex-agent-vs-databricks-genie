import { NextRequest, NextResponse } from "next/server"
import { DATABRICKS_ENDPOINT } from "@/lib/constants"
import { createStream, updateStream, completeStream, failStream, getStream } from "@/lib/stream-store"
import type { AgentContentItem, AgentResponse } from "@/lib/agent-types"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function getDatabricksPat(): string {
  const pat = process.env.DATABRICKS_PAT
  if (pat) return pat
  throw new Error("DATABRICKS_PAT env var is not set")
}

// POST: start Databricks request in background, return requestId
export async function POST(request: NextRequest) {
  try {
    const { questionText } = await request.json()
    if (!questionText) {
      return NextResponse.json({ error: "questionText is required" }, { status: 400 })
    }

    const requestId = `dbx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    createStream(requestId)

    // Show a status while waiting
    updateStream(requestId, {
      content: [{ type: "status", message: "Sending request to Databricks..." }],
      plainText: "",
      fullTextForScoring: "",
    })

    processDbx(requestId, questionText)

    return NextResponse.json({ requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET: poll for current state
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

async function processDbx(requestId: string, questionText: string) {
  try {
    const pat = getDatabricksPat()
    const body = { input: [{ role: "user", content: questionText }] }

    // Update status with elapsed time while waiting
    const startTime = Date.now()
    const ticker = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      updateStream(requestId, {
        content: [{ type: "status", message: `Waiting for Databricks response... (${elapsed}s)` }],
        plainText: "",
        fullTextForScoring: "",
      })
    }, 2000)

    let res: Response
    try {
      res = await fetch(DATABRICKS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pat}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(600_000),
      })
    } finally {
      clearInterval(ticker)
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      failStream(requestId, `Databricks returned ${res.status}: ${errText.slice(0, 500)}`)
      return
    }

    const data = await res.json()
    const parsed = parseDatabricksResponse(data)

    completeStream(requestId, parsed)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    failStream(requestId, msg)
  }
}

/** Parse a Databricks multi-turn conversation array into structured content items. */
function parseDatabricksResponse(data: unknown): AgentResponse {
  // If the response is already a simple string or has a known shape, handle it
  if (typeof data === "string") {
    return { content: [{ type: "text", text: data }], plainText: data, fullTextForScoring: data }
  }

  // Handle standard single-response shapes
  const simple =
    (data as any)?.output?.content ||
    (data as any)?.choices?.[0]?.message?.content ||
    (data as any)?.result?.content ||
    (data as any)?.result
  if (typeof simple === "string") {
    return { content: [{ type: "text", text: simple }], plainText: simple, fullTextForScoring: simple }
  }

  // Handle the multi-turn conversation array (what the agent actually returns)
  const messages = Array.isArray(data) ? data : (data as any)?.output
  if (!Array.isArray(messages)) {
    const fallback = JSON.stringify(data)
    return { content: [{ type: "text", text: fallback }], plainText: fallback, fullTextForScoring: fallback }
  }

  const contentItems: AgentContentItem[] = []
  const textParts: string[] = []
  let stepNum = 0

  for (const msg of messages) {
    const msgType = msg?.type
    const role = msg?.role

    // Function call → tool step
    if (msgType === "function_call") {
      stepNum++
      const toolName = msg.name || "tool"
      const args = msg.arguments
      let query = ""
      try {
        const parsed = typeof args === "string" ? JSON.parse(args) : args
        query = parsed?.genie_query || parsed?.ka_query || parsed?.query || ""
      } catch { /* ignore */ }

      contentItems.push({
        type: "tool_step",
        toolName,
        toolType: toolName.startsWith("genie") ? "Data Query" : toolName.startsWith("ka-") ? "Knowledge Search" : "Tool",
        sql: query || undefined,
        status: "invoked",
      })
      continue
    }

    // Skip intermediate system messages (tool name echoes like "<name>ClinicalIQ</name>")
    if (role === "assistant" && msg.content) {
      const items = Array.isArray(msg.content) ? msg.content : [{ text: msg.content }]
      for (const item of items) {
        const text = item?.text || (typeof item === "string" ? item : "")
        if (!text) continue

        // Skip tool-name echo messages
        if (/^<name>.+<\/name>$/.test(text.trim())) continue
        if (text.trim() === "EMPTY") continue

        // Check if this is a pipe-delimited table from a tool result
        if (text.includes("|-|") && text.includes("|")) {
          const table = parseMarkdownTable(text)
          if (table) {
            contentItems.push(table)
            // Build plain text from table for scoring
            const tableText = table.rows.map(r => r.join(", ")).join("\n")
            textParts.push(tableText)
            continue
          }
        }

        // Check if this is a tool result with status="completed" — the main knowledge answer
        if (msg.status === "completed" || (msg.call_id && role === "assistant")) {
          // This is a tool result — render as text with citations
          const cleaned = cleanCitations(text)
          contentItems.push({ type: "text", text: cleaned })
          textParts.push(cleaned)
          continue
        }

        // Regular assistant text (intermediate thinking or final answer)
        contentItems.push({ type: "text", text })
        textParts.push(text)
      }
    }
  }

  // If we got nothing useful, fallback
  if (contentItems.length === 0) {
    const fallback = JSON.stringify(data)
    return { content: [{ type: "text", text: fallback }], plainText: fallback, fullTextForScoring: fallback }
  }

  // Mark all tool steps as success (since the whole response completed)
  for (const item of contentItems) {
    if (item.type === "tool_step") item.status = "success"
  }

  const fullText = textParts.join("\n\n")
  return { content: contentItems, plainText: fullText, fullTextForScoring: fullText }
}

/** Parse a Databricks pipe-delimited markdown table into a structured table item. */
function parseMarkdownTable(text: string): AgentContentItem | null {
  const lines = text.trim().split("\n").filter(l => l.includes("|"))
  if (lines.length < 3) return null

  const parseRow = (line: string) =>
    line.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1)

  const headerRow = parseRow(lines[0])
  // Skip separator line (line[1] is |-|-|-|...)
  // Skip the index column (first column) if it's just row numbers
  const hasIndexCol = headerRow[0] === ""
  const columns = hasIndexCol ? headerRow.slice(1) : headerRow

  const rows: string[][] = []
  for (let i = 2; i < lines.length; i++) {
    const cells = parseRow(lines[i])
    rows.push(hasIndexCol ? cells.slice(1) : cells)
  }

  if (columns.length === 0 || rows.length === 0) return null
  return { type: "table", columns, rows }
}

/** Clean footnote-style citation markers like [^k8vK-1] into readable footnote numbers. */
function cleanCitations(text: string): string {
  // Collect unique citation keys
  const keys: string[] = []
  text.replace(/\[\^([^\]]+)\]/g, (_, key) => {
    if (!keys.includes(key)) keys.push(key)
    return ""
  })

  // Replace inline refs with numbered superscripts
  let cleaned = text
  keys.forEach((key, i) => {
    const num = i + 1
    cleaned = cleaned.replace(new RegExp(`\\[\\^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, "g"), `[${num}]`)
  })

  return cleaned
}
