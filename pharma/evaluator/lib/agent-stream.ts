import type { AgentResponse, AgentContentItem } from "./agent-types"

export function parseCortexResponse(data: any): AgentResponse {
  const content: AgentContentItem[] = []
  const textParts: string[] = []
  const scoringParts: string[] = []

  if (!data?.content || !Array.isArray(data.content)) {
    return { content: [], plainText: data?.content?.[0]?.text || "", fullTextForScoring: "", error: "Unexpected response format" }
  }

  for (const item of data.content) {
    switch (item.type) {
      case "text": {
        const text = item.text || ""
        textParts.push(text)
        scoringParts.push(`ANSWER: ${text}`)
        const citations = item.annotations?.map((a: any) => ({
          doc_title: a.doc_title || "",
          text: a.text || "",
        }))
        if (citations?.length) {
          scoringParts.push(`CITATIONS: ${citations.map((c: any) => `[${c.doc_title}] ${c.text}`).join("; ")}`)
        }
        content.push({ type: "text", text, citations })
        break
      }
      case "table": {
        const tbl = item.table
        if (tbl?.result_set) {
          const columns = tbl.result_set.resultSetMetaData?.rowType?.map((r: any) => r.name) || []
          const rows = tbl.result_set.data || []
          content.push({ type: "table", title: tbl.title, columns, rows })
          textParts.push(`[Table: ${tbl.title || "Results"} — ${rows.length} rows, ${columns.length} columns]`)
          const header = columns.join(" | ")
          const dataRows = rows.slice(0, 20).map((r: string[]) => r.join(" | ")).join("\n")
          scoringParts.push(`TABLE (${tbl.title || "Results"}):\n${header}\n${dataRows}${rows.length > 20 ? `\n... (${rows.length} total rows)` : ""}`)
        }
        break
      }
      case "chart": {
        const chart = item.chart
        if (chart?.chart_spec) {
          content.push({ type: "chart", chartSpec: chart.chart_spec })
          textParts.push("[Chart generated]")
        }
        break
      }
      case "tool_use": {
        const tu = item.tool_use
        content.push({
          type: "tool_step",
          toolName: tu?.name || "unknown",
          toolType: tu?.type || "unknown",
          sql: tu?.input?.sql,
          status: "invoked",
        })
        scoringParts.push(`TOOL USED: ${tu?.type || "unknown"} → ${tu?.name || "unknown"}`)
        if (tu?.input?.sql) scoringParts.push(`SQL: ${tu.input.sql}`)
        break
      }
      case "tool_result": {
        const tr = item.tool_result
        if (tr?.content) {
          for (const c of tr.content) {
            if (c.type === "json" && c.json) {
              if (c.json.result_set) {
                const rs = c.json.result_set
                const columns = rs.resultSetMetaData?.rowType?.map((r: any) => r.name) || []
                const rows = rs.data || []
                content.push({ type: "table", title: tr.name, columns, rows })
                textParts.push(`[SQL Result: ${rows.length} rows]`)
                const header = columns.join(" | ")
                const dataRows = rows.slice(0, 20).map((r: string[]) => r.join(" | ")).join("\n")
                scoringParts.push(`SQL RESULT (${tr.name}):\n${header}\n${dataRows}`)
              }
              if (c.json.sql) {
                const lastStep = [...content].reverse().find(
                  (i) => i.type === "tool_step" && i.toolName === tr.name
                )
                if (lastStep && lastStep.type === "tool_step") {
                  lastStep.sql = c.json.sql
                  lastStep.status = tr.status || "success"
                }
              }
            }
            if (c.type === "text" && c.text) {
              textParts.push(c.text)
            }
          }
        }
        break
      }
      case "thinking": {
        const text = item.thinking?.text || ""
        if (text) {
          scoringParts.push(`REASONING: ${text.slice(0, 500)}`)
          content.push({ type: "thinking", text })
        }
        break
      }
    }
  }

  const toolCalls = content.filter(c => c.type === "tool_step").length
  const failures = content.filter(c => c.type === "tool_step" && c.status === "error").length

  // Extract token usage from API response if available
  const usage = data?.usage || data?.model_usage
  const tokens = usage?.total_tokens || usage?.completion_tokens || undefined

  return { content, plainText: textParts.join("\n\n"), fullTextForScoring: scoringParts.join("\n\n"), toolCalls, failures, tokens }
}
