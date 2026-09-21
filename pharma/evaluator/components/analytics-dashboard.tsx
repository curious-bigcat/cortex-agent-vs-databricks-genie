"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import type { Domain } from "@/lib/constants"

interface ResultRow {
  QUESTION_ID: string
  PLATFORM: string
  SCORE_TOTAL: number
  SCORE_ACCURACY: number
  SCORE_GROUNDEDNESS: number
  SCORE_RELEVANCE: number
  SCORING_RATIONALE: string
  SCORED_AT: string
  RUN_ID: string
  QUESTION_TEXT: string
  DBX_FAILURE_PATTERN?: string | null
}

const DIMS = ["ACCURACY", "GROUNDEDNESS", "RELEVANCE"] as const
const DIM_FULL = ["Accuracy", "Groundedness", "Relevance"]

function VegaChart({ spec, className }: { spec: object; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const render = useCallback(async () => {
    if (!ref.current) return
    const vegaEmbed = (await import("vega-embed")).default
    await vegaEmbed(ref.current, spec as never, { actions: false, renderer: "svg" })
  }, [spec])
  useEffect(() => { render() }, [render])
  return <div ref={ref} className={className} />
}

const SCORE_COLORS: Record<number, string> = {
  5: "#16a34a", 4: "#4ade80", 3: "#eab308", 2: "#f97316", 1: "#dc2626",
}


export default function AnalyticsDashboard({ domain = "pharma" }: { domain?: Domain }) {
  const [results, setResults] = useState<ResultRow[]>([])
  const [loading, setLoading] = useState(true)


  useEffect(() => {
    setLoading(true)
    fetch(`/api/results?domain=${domain}`)
      .then((r) => r.json())
      .then((data) => { if (data.results) setResults(data.results) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [domain])

  if (loading) return <main className="w-full py-8 px-4 text-center text-muted-foreground">Loading...</main>

  const sf = results.filter((r) => r.PLATFORM === "SNOWFLAKE")
  const dbx = results.filter((r) => r.PLATFORM === "DATABRICKS")
  const sfMap = Object.fromEntries(sf.map((r) => [r.QUESTION_ID, r]))
  const dbxMap = Object.fromEntries(dbx.map((r) => [r.QUESTION_ID, r]))
  const qids = [...new Set(results.map((r) => r.QUESTION_ID))].sort()

  const sfAvg = sf.length ? sf.reduce((s, r) => s + r.SCORE_TOTAL, 0) / sf.length : 0
  const dbxAvg = dbx.length ? dbx.reduce((s, r) => s + r.SCORE_TOTAL, 0) / dbx.length : 0
  const sfWins = qids.filter((q) => sfMap[q] && dbxMap[q] && sfMap[q].SCORE_TOTAL > dbxMap[q].SCORE_TOTAL).length
  const dbxWins = qids.filter((q) => sfMap[q] && dbxMap[q] && dbxMap[q].SCORE_TOTAL > sfMap[q].SCORE_TOTAL).length
  const ties = qids.filter((q) => sfMap[q] && dbxMap[q] && sfMap[q].SCORE_TOTAL === dbxMap[q].SCORE_TOTAL).length

  const dimAvgs = DIMS.map((dim, i) => {
    const key = `SCORE_${dim}` as keyof ResultRow
    const sfA = sf.length ? sf.reduce((s, r) => s + (r[key] as number), 0) / sf.length : 0
    const dbxA = dbx.length ? dbx.reduce((s, r) => s + (r[key] as number), 0) / dbx.length : 0
    return { dim: DIM_FULL[i], sfA, dbxA, gap: sfA - dbxA }
  })

  const gaps = qids
    .filter((q) => sfMap[q] && dbxMap[q])
    .map((q) => ({ q, delta: sfMap[q].SCORE_TOTAL - dbxMap[q].SCORE_TOTAL }))
    .sort((a, b) => b.delta - a.delta)

  // Bar chart: per-question comparison
  const barData = qids.flatMap((q) => {
    const out: object[] = []
    if (sfMap[q]) out.push({ question: q, platform: "Snowflake", score: sfMap[q].SCORE_TOTAL })
    if (dbxMap[q]) out.push({ question: q, platform: "Databricks", score: dbxMap[q].SCORE_TOTAL })
    return out
  })

  const barSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title: { text: "Snowflake Cortex Agent vs Databricks Genie — Total Score per Question (out of 30)", fontSize: 13, fontWeight: "bold", anchor: "start", offset: 10 },
    width: "container", height: 320,
    data: { values: barData },
    encoding: {
      x: { field: "question", type: "ordinal", sort: qids, title: "Question ID", axis: { labelFontSize: 9, labelFontWeight: 600, labelAngle: -45 } },
      y: { field: "score", type: "quantitative", title: "Total Score (6 dimensions, 5 pts each)", scale: { domain: [0, 33] }, axis: { grid: true, gridOpacity: 0.15, tickCount: 6, labelFontSize: 10 } },
      color: { field: "platform", type: "nominal", scale: { domain: ["Snowflake", "Databricks"], range: ["#29B5E8", "#FF3621"] }, legend: { orient: "top", title: null, labelFontSize: 11, symbolSize: 80 } },
      xOffset: { field: "platform" },
      tooltip: [{ field: "question" }, { field: "platform" }, { field: "score" }],
    },
    layer: [
      { mark: { type: "bar", cornerRadiusEnd: 2, width: 8 } },
      { mark: { type: "text", dy: -6, fontSize: 8, fontWeight: "bold" }, encoding: { text: { field: "score", type: "quantitative" }, color: { value: "#333" } } },
    ],
    config: { view: { stroke: null } },
  }

  // Dimension bar chart — horizontal
  const dimBarData = dimAvgs.flatMap((d) => [
    { dimension: d.dim, platform: "Snowflake", avg: +d.sfA.toFixed(2), dimShort: d.dim.slice(0, 3) },
    { dimension: d.dim, platform: "Databricks", avg: +d.dbxA.toFixed(2), dimShort: d.dim.slice(0, 3) },
  ])
  const dimBarSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title: { text: "Average Score by Evaluation Dimension (1–5 scale)", fontSize: 13, fontWeight: "bold", anchor: "start", offset: 10 },
    width: "container", height: 210,
    data: { values: dimBarData },
    encoding: {
      y: { field: "dimension", type: "ordinal", sort: DIM_FULL, title: "Evaluation Dimension", axis: { labelFontSize: 10, labelFontWeight: 600 } },
      x: { field: "avg", type: "quantitative", title: "Average Score (1–5)", scale: { domain: [0, 5.5] }, axis: { grid: true, gridOpacity: 0.15, tickCount: 5, labelFontSize: 10 } },
      color: { field: "platform", type: "nominal", scale: { domain: ["Snowflake", "Databricks"], range: ["#29B5E8", "#FF3621"] }, legend: { orient: "top", title: null, labelFontSize: 11, symbolSize: 80 } },
      yOffset: { field: "platform" },
      tooltip: [{ field: "dimension" }, { field: "platform" }, { field: "avg", format: ".2f" }],
    },
    layer: [
      { mark: { type: "bar", cornerRadiusEnd: 3, height: 12 } },
      { mark: { type: "text", dx: 14, fontSize: 9, fontWeight: "bold" }, encoding: { text: { field: "avg", type: "quantitative", format: ".1f" }, color: { value: "#333" } } },
    ],
    config: { view: { stroke: null } },
  }

  return (
    <main className="w-full py-4 px-4 max-w-[1800px] mx-auto space-y-3">
      {/* Row 1: KPIs + Dimension bars */}
      <div className="grid grid-cols-12 gap-3">
        {/* KPI strip */}
        <div className="col-span-4 grid grid-cols-2 gap-3">
          <div className="border rounded-lg p-3 text-center">
            <div className="text-3xl font-black text-blue-500">{sfAvg.toFixed(1)}</div>
            <div className="text-[11px] font-semibold text-blue-500/70 flex items-center justify-center gap-1 mt-0.5">
              <img src="/snowflake-logo.svg" alt="" width="14" height="14" /> Snowflake
            </div>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <div className="text-3xl font-black text-orange-500">{dbxAvg.toFixed(1)}</div>
            <div className="text-[11px] font-semibold text-orange-500/70 flex items-center justify-center gap-1 mt-0.5">
              <img src="/databricks-logo.svg" alt="" width="14" height="14" /> Databricks
            </div>
          </div>
          <div className="border rounded-lg p-3 text-center col-span-2">
            <div className="text-2xl font-black">
              <span className="text-blue-500">{sfWins}</span>
              <span className="text-muted-foreground/30 mx-1">:</span>
              <span className="text-orange-500">{dbxWins}</span>
              <span className="text-muted-foreground/30 mx-1">:</span>
              <span className="text-muted-foreground">{ties}</span>
            </div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">WIN : LOSS : TIE</div>
          </div>
          {/* Dimension gap table */}
          <div className="col-span-2 border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="py-1 px-2 text-left font-semibold">Dimension</th>
                  <th className="py-1 px-1 text-center font-semibold text-blue-500">SF</th>
                  <th className="py-1 px-1 text-center font-semibold text-orange-500">DBX</th>
                  <th className="py-1 px-1 text-center font-semibold">Gap</th>
                </tr>
              </thead>
              <tbody>
                {dimAvgs.sort((a, b) => b.gap - a.gap).map((d) => (
                  <tr key={d.dim} className="border-b border-foreground/5">
                    <td className="py-0.5 px-2 font-semibold">{d.dim}</td>
                    <td className="py-0.5 px-1 text-center">{d.sfA.toFixed(1)}</td>
                    <td className="py-0.5 px-1 text-center">{d.dbxA.toFixed(1)}</td>
                    <td className="py-0.5 px-1 text-center font-bold text-blue-600">+{d.gap.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dimension bar chart — horizontal */}
        <div className="col-span-8 border rounded-lg p-3">
          <VegaChart spec={dimBarSpec} />
        </div>
      </div>

      {/* Row 2: Benchmark Summary + Per-question bar chart */}
      <div className="grid grid-cols-12 gap-3">
        {/* Benchmark Summary */}
        <div className="col-span-5 border rounded-lg p-3 space-y-3">
          <div className="text-sm font-bold">Benchmark Summary</div>
          <div className="space-y-2 text-xs">
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-md p-2.5">
              <div className="font-bold text-blue-700 dark:text-blue-300 mb-1">Snowflake Cortex Agent</div>
              <ul className="space-y-1 text-foreground/70 list-disc list-inside">
                <li>Semantic View guardrails prevent wrong joins and column misuse</li>
                <li>Cortex Search excels at unstructured retrieval (protocols, SAEs)</li>
                <li>Agent orchestration chains SQL + search for multi-step reasoning</li>
                <li>Verified queries lock correct patterns for known question types</li>
              </ul>
            </div>
            <div className="bg-orange-50 dark:bg-orange-950/20 rounded-md p-2.5">
              <div className="font-bold text-orange-700 dark:text-orange-300 mb-1">Databricks Genie</div>
              <ul className="space-y-1 text-foreground/70 list-disc list-inside">
                <li>Strong on simple aggregations and direct table queries</li>
                <li>Struggles with multi-table joins and clinical domain traps</li>
                <li>No semantic guardrails — falls into STATUS vs date column traps</li>
                <li>No retrieval capability for unstructured protocol documents</li>
              </ul>
            </div>
            <div className="bg-muted/30 rounded-md p-2.5">
              <div className="font-bold text-foreground/80 mb-1">Exploit Pattern Map</div>
              <div className="space-y-1 text-foreground/70 text-[10px]">
                <div><span className="font-semibold">Cross-tool synthesis:</span> All Q01-Q14 (every question is hybrid SQL + search)</div>
                <div><span className="font-semibold">Negation / NOT EXISTS:</span> Q01, Q02, Q08, Q11</div>
                <div><span className="font-semibold">Cartesian product traps:</span> Q03, Q04, Q05, Q07</div>
                <div><span className="font-semibold">Multi-table joins (3-4 hops):</span> Q04, Q06, Q07, Q09, Q13</div>
                <div><span className="font-semibold">Wrong denominator traps:</span> Q03, Q04, Q05, Q10, Q14</div>
                <div><span className="font-semibold">Metric hallucination:</span> Q05, Q06, Q07, Q08</div>
                <div><span className="font-semibold">Temporal / date logic:</span> Q11, Q12</div>
              </div>
            </div>
            <div className="bg-muted/30 rounded-md p-2.5">
              <div className="font-bold text-foreground/80 mb-1">Key Patterns</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-foreground/70">
                <div>Perfect scores (15/15):</div><div className="font-semibold">{qids.filter(q => sfMap[q]?.SCORE_TOTAL === 15).length} SF / {qids.filter(q => dbxMap[q]?.SCORE_TOTAL === 15).length} DBX</div>
                <div>Critical fails (&lt;8):</div><div className="font-semibold">{qids.filter(q => sfMap[q] && sfMap[q].SCORE_TOTAL < 8).length} SF / {qids.filter(q => dbxMap[q] && dbxMap[q].SCORE_TOTAL < 8).length} DBX</div>
                <div>Biggest SF win:</div><div className="font-semibold text-blue-600">+{Math.max(...gaps.map(g => g.delta))} pts ({gaps.find(g => g.delta === Math.max(...gaps.map(g2 => g2.delta)))?.q})</div>
                <div>Biggest DBX win:</div><div className="font-semibold text-orange-600">{Math.min(...gaps.map(g => g.delta))} pts ({gaps.find(g => g.delta === Math.min(...gaps.map(g2 => g2.delta)))?.q})</div>
              </div>
            </div>
          </div>
        </div>

        {/* Per-question bar chart — vertical */}
        <div className="col-span-7 border rounded-lg p-3">
          <VegaChart spec={barSpec} />
        </div>
      </div>

      {/* Question-by-Question Analysis — fully expanded for print */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-muted/20 border-b">
          <span className="text-sm font-bold">Question-by-Question Analysis</span>
          <span className="text-[10px] text-muted-foreground ml-2">{qids.length} questions — sorted by Snowflake advantage</span>
        </div>
        <div className="divide-y divide-foreground/5">
          {gaps.map(({ q, delta }) => {
            const s = sfMap[q]; const d = dbxMap[q]
            if (!s || !d) return null
            return (
              <div key={q} className="px-3 py-3 space-y-2">
                {/* Header row */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-bold text-sm w-8">{q}</span>
                  <span className={`px-1.5 py-0.5 rounded font-bold text-white ${delta > 0 ? "bg-blue-500" : delta < 0 ? "bg-orange-500" : "bg-gray-400"}`}>
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                  <span className="text-blue-600 font-bold">SF {s.SCORE_TOTAL}</span>
                  <span className="text-muted-foreground">vs</span>
                  <span className="text-orange-600 font-bold">DBX {d.SCORE_TOTAL}</span>
                  <span className="text-muted-foreground ml-1 flex-1">{s.QUESTION_TEXT}</span>
                </div>
                {/* Dimension comparison bar */}
                <div className="flex gap-1">
                  {DIMS.map((dim, i) => {
                    const sv = s[`SCORE_${dim}` as keyof ResultRow] as number
                    const dv = d[`SCORE_${dim}` as keyof ResultRow] as number
                    const diff = sv - dv
                    return (
                      <div key={dim} className="flex-1 text-center">
                        <div className="text-[9px] font-semibold text-muted-foreground mb-1">{DIM_FULL[i]}</div>
                        <div className="flex justify-center gap-0.5">
                          <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-l" style={{ backgroundColor: SCORE_COLORS[sv] }}>{sv}</span>
                          <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-r" style={{ backgroundColor: SCORE_COLORS[dv] }}>{dv}</span>
                        </div>
                        {diff !== 0 && (
                          <div className={`text-[9px] font-bold mt-0.5 ${diff > 0 ? "text-blue-600" : "text-orange-600"}`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {/* Databricks failure analysis */}
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <img src="/databricks-logo.svg" alt="" width="14" height="14" />
                    <span className="text-[11px] font-bold text-orange-600">Databricks Genie ({d.SCORE_TOTAL}/15) — Where it fell short</span>
                  </div>
                  <div className="text-[11px] leading-relaxed bg-orange-50 dark:bg-orange-950/20 p-2 rounded text-foreground/80">{d.SCORING_RATIONALE}</div>
                  {d.DBX_FAILURE_PATTERN && (
                    <div className="text-[11px] leading-relaxed bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-2 rounded mt-1.5">
                      <span className="font-bold text-red-700 dark:text-red-400">Failure Pattern: </span>
                      <span className="text-red-800 dark:text-red-300">{d.DBX_FAILURE_PATTERN}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
