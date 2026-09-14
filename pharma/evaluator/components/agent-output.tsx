"use client"

import type { AgentResponse } from "@/lib/agent-types"
import { useState, useRef, useEffect } from "react"
import ReactMarkdown from "react-markdown"

function TextBlock({ text, citations }: { text: string; citations?: { doc_title: string; text: string }[] }) {
  return (
    <div className="space-y-1">
      <div className="prose prose-sm dark:prose-invert max-w-none text-base leading-relaxed
        prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1
        prose-li:my-0 prose-table:my-2 prose-pre:my-2 prose-pre:bg-muted prose-pre:text-foreground
        prose-th:px-3 prose-th:py-1.5 prose-th:border prose-th:bg-muted/50 prose-th:font-medium
        prose-td:px-3 prose-td:py-1 prose-td:border">
        <ReactMarkdown>{text}</ReactMarkdown>
      </div>
      {citations && citations.length > 0 && (
        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
          {citations.map((c, i) => (
            <div key={i} className="border-l-2 border-muted pl-2">
              <span className="font-medium">[{i + 1}] {c.doc_title}</span>
              {c.text && <span className="ml-1">— {c.text.slice(0, 150)}{c.text.length > 150 ? "…" : ""}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TableBlock({ title, columns, rows }: { title?: string; columns: string[]; rows: string[][] }) {
  const maxRows = 50
  const truncated = rows.length > maxRows
  const displayRows = truncated ? rows.slice(0, maxRows) : rows
  return (
    <div className="space-y-1">
      {title && <p className="text-sm font-semibold">{title}</p>}
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              {columns.map((col, i) => (
                <th key={i} className="text-left px-3 py-1.5 font-medium border-b whitespace-nowrap">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, ri) => (
              <tr key={ri} className="border-b last:border-b-0 hover:bg-muted/30">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1 whitespace-nowrap">{cell ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && (
        <p className="text-xs text-muted-foreground">Showing {maxRows} of {rows.length} rows</p>
      )}
    </div>
  )
}

function ChartBlock({ chartSpec }: { chartSpec: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    async function render() {
      try {
        const vegaEmbed = (await import("vega-embed")).default
        const spec = typeof chartSpec === "string" ? JSON.parse(chartSpec) : chartSpec
        spec.width = "container"
        spec.height = 300
        if (!cancelled && containerRef.current) {
          await vegaEmbed(containerRef.current, spec, {
            actions: false,
            renderer: "svg",
            theme: "dark",
          })
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }

    render()
    return () => { cancelled = true }
  }, [chartSpec])

  if (error) {
    return (
      <div className="border rounded p-3 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
        Chart render error: {error}
      </div>
    )
  }

  return <div ref={containerRef} className="border rounded p-2 w-full" />
}

function ToolStepBlock({ toolName, toolType, sql, status }: { toolName: string; toolType: string; sql?: string; status: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border rounded px-3 py-2 bg-muted/20 text-sm">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <span className={`w-2 h-2 rounded-full ${status === "success" ? "bg-green-500" : status === "invoked" ? "bg-yellow-500" : "bg-red-500"}`} />
        <span className="font-medium">{toolType}</span>
        <span className="text-muted-foreground">→ {toolName}</span>
        {sql && <span className="text-xs text-muted-foreground ml-auto">{expanded ? "▼" : "▶"} SQL</span>}
      </div>
      {expanded && sql && (
        <pre className="mt-2 text-xs bg-background p-2 rounded overflow-x-auto whitespace-pre-wrap">{sql}</pre>
      )}
    </div>
  )
}

function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border rounded px-3 py-2 bg-muted/10 text-sm">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <span className="text-muted-foreground">Agent reasoning</span>
        <span className="text-xs text-muted-foreground ml-auto">{expanded ? "▼" : "▶"}</span>
      </div>
      {expanded && (
        <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{text}</pre>
      )}
    </div>
  )
}

function StatusBlock({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
      <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
      {message}
    </div>
  )
}

export default function AgentOutputPanel({ response }: { response: AgentResponse }) {
  if (response.error) {
    return (
      <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-3 rounded text-sm">
        {response.error}
      </div>
    )
  }

  if (response.content.length === 0) {
    return <p className="text-muted-foreground text-sm">No response from agent.</p>
  }

  return (
    <div className="space-y-3">
      {response.content.map((item, i) => {
        switch (item.type) {
          case "text":
            return <TextBlock key={i} text={item.text} citations={item.citations} />
          case "table":
            return <TableBlock key={i} title={item.title} columns={item.columns} rows={item.rows} />
          case "chart":
            return <ChartBlock key={i} chartSpec={item.chartSpec} />
          case "tool_step":
            return <ToolStepBlock key={i} toolName={item.toolName} toolType={item.toolType} sql={item.sql} status={item.status} />
          case "thinking":
            return <ThinkingBlock key={i} text={item.text} />
          case "status":
            return <StatusBlock key={i} message={item.message} />
          default:
            return null
        }
      })}
    </div>
  )
}
