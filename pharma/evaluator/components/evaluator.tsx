"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import AgentOutputPanel from "@/components/agent-output"
import type { AgentResponse } from "@/lib/agent-types"

interface Question {
  QUESTION_ID: string
  TIER: number
  TRAPS: string
  QUESTION_TEXT: string
  EXPECTED_ANSWER: string
  KEY_NUMBERS: string
  SCORING_5: string
  SCORING_3: string
  SCORING_1: string
}

interface Scores {
  accuracy: number
  groundedness: number
  relevance: number
  total: number
  rationale: string
}

const DIMENSIONS = [
  { key: "accuracy", label: "Accuracy" },
  { key: "groundedness", label: "Groundedness" },
  { key: "relevance", label: "Relevance" },
] as const

function scoreColor(score: number): string {
  if (score >= 4) return "text-green-600 dark:text-green-400"
  if (score >= 3) return "text-yellow-600 dark:text-yellow-400"
  return "text-red-600 dark:text-red-400"
}

function scoreBg(score: number): string {
  if (score >= 4) return "bg-green-100 dark:bg-green-900/30"
  if (score >= 3) return "bg-yellow-100 dark:bg-yellow-900/30"
  return "bg-red-100 dark:bg-red-900/30"
}

function scorePill(score: number | undefined, size: "sm" | "md" = "sm") {
  if (score === undefined) return <span className="text-muted-foreground">-</span>
  const colors: Record<number, string> = {
    5: "bg-green-500 text-white",
    4: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
    3: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
    2: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300",
    1: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  }
  const cls = colors[score] || colors[1]
  const sizeClass = size === "md" ? "px-2.5 py-1 text-sm font-bold min-w-[36px]" : "px-1.5 py-0.5 text-xs font-semibold min-w-[24px]"
  return <span className={`inline-block rounded-md text-center ${cls} ${sizeClass}`}>{score}</span>
}

function totalPill(score: number | undefined, platform: "sf" | "dbx") {
  if (score === undefined) return <span className="text-muted-foreground">-</span>
  const avg = score / 3
  let bg = "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300"
  if (avg >= 4) bg = "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/40 dark:border-green-800 dark:text-green-300"
  else if (avg >= 3) bg = "bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-950/40 dark:border-yellow-800 dark:text-yellow-300"
  return <span className={`inline-block rounded-lg border px-3 py-1 text-base font-black min-w-[48px] text-center ${bg}`}>{score}</span>
}

function deltaBadge(delta: number | null) {
  if (delta === null) return <span className="text-muted-foreground">-</span>
  if (delta === 0) return <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">0</span>
  const cls = delta > 0
    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
    : "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300"
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${cls}`}>{delta > 0 ? `+${delta}` : delta}</span>
}

function winnerBadge(winner: string) {
  if (winner === "SF") return <span className="inline-block rounded-md bg-blue-600 text-white px-2 py-0.5 text-xs font-bold">SF</span>
  if (winner === "DBX") return <span className="inline-block rounded-md bg-orange-500 text-white px-2 py-0.5 text-xs font-bold">DBX</span>
  if (winner === "TIE") return <span className="inline-block rounded-md border border-muted-foreground/30 text-muted-foreground px-2 py-0.5 text-xs font-semibold">TIE</span>
  return null
}

function tierBadge(tier: number) {
  const colors: Record<number, string> = {
    3: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    4: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    5: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    6: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[tier] || ""}`}>
      Tier {tier}
    </span>
  )
}

/** Convert HTML tables from clipboard into pipe-delimited text. */
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  // Convert each <table> to pipe-delimited text
  doc.querySelectorAll("table").forEach((table) => {
    const rows: string[] = []
    table.querySelectorAll("tr").forEach((tr) => {
      const cells: string[] = []
      tr.querySelectorAll("th, td").forEach((cell) => {
        cells.push((cell.textContent || "").trim())
      })
      rows.push("| " + cells.join(" | ") + " |")
      // Add separator after header row
      if (tr.querySelectorAll("th").length > 0) {
        rows.push("| " + cells.map(() => "---").join(" | ") + " |")
      }
    })
    const pre = doc.createElement("pre")
    pre.textContent = "\n" + rows.join("\n") + "\n"
    table.replaceWith(pre)
  })
  return (doc.body.textContent || "").trim()
}

function OutputPanel({
  label,
  color,
  placeholder,
  text,
  images,
  agentResponse,
  onTextChange,
  onImagesChange,
  onAskAgent,
  onScore,
  loading,
  agentLoading,
  loadingLabel,
}: {
  label: string
  color: string
  placeholder: string
  text: string
  images: string[]
  agentResponse: AgentResponse | null
  onTextChange: (v: string) => void
  onImagesChange: (v: string[]) => void
  onAskAgent: () => void
  onScore: () => void
  loading: boolean
  agentLoading: boolean
  loadingLabel: string
}) {
  const dropRef = useRef<HTMLDivElement>(null)
  const [showAgent, setShowAgent] = useState(false)

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      // Check for images first
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault()
          const file = item.getAsFile()
          if (!file) continue
          const reader = new FileReader()
          reader.onload = () => {
            const base64 = reader.result as string
            onImagesChange([...images, base64])
          }
          reader.readAsDataURL(file)
          return
        }
      }

      // Check for HTML with tables — extract structured text
      const html = e.clipboardData?.getData("text/html")
      if (html && html.includes("<t")) {
        e.preventDefault()
        const extracted = htmlToText(html)
        if (extracted) {
          onTextChange(text ? text + "\n\n" + extracted : extracted)
          return
        }
      }
      // Otherwise let default text paste happen
    },
    [images, onImagesChange, text, onTextChange]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const files = e.dataTransfer.files
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          const reader = new FileReader()
          reader.onload = () => {
            const base64 = reader.result as string
            onImagesChange([...images, base64])
          }
          reader.readAsDataURL(file)
        }
      }
    },
    [images, onImagesChange]
  )

  const removeImage = (idx: number) => {
    onImagesChange(images.filter((_, i) => i !== idx))
  }

  const hasContent = text.trim().length > 0 || images.length > 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${color} inline-block`} />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Primary: paste area */}
        <div
          ref={dropRef}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="space-y-2"
        >
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onPaste={handlePaste}
            placeholder={placeholder}
            className="w-full h-48 p-3 border rounded bg-background text-foreground text-sm font-mono resize-y"
          />
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={img}
                    alt={`Screenshot ${idx + 1}`}
                    className="max-h-48 rounded border object-contain"
                  />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
          {!hasContent && (
            <p className="text-xs text-muted-foreground text-center">
              Paste text, tables, or drop screenshots above
            </p>
          )}
        </div>

        {/* Score button */}
        <Button
          onClick={onScore}
          disabled={loading || !hasContent}
          className="w-full"
          variant="default"
        >
          {loading ? "Scoring..." : loadingLabel}
        </Button>

        {/* Secondary: ask agent */}
        <div className="border-t pt-2">
          <button
            onClick={() => setShowAgent(!showAgent)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {showAgent ? "Hide agent" : "Or ask agent directly..."}
          </button>
          {showAgent && (
            <div className="mt-2 space-y-2">
              <Button
                onClick={onAskAgent}
                disabled={agentLoading || loading}
                className="w-full"
                variant="outline"
                size="sm"
              >
                {agentLoading ? "Asking Agent..." : "Ask Agent"}
              </Button>
              {agentResponse && (
                <div className="border rounded p-3 max-h-[400px] overflow-y-auto">
                  <AgentOutputPanel response={agentResponse} />
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function Evaluator() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [snowflakeOutput, setSnowflakeOutput] = useState("")
  const [databricksOutput, setDatabricksOutput] = useState("")
  const [snowflakeImages, setSnowflakeImages] = useState<string[]>([])
  const [databricksImages, setDatabricksImages] = useState<string[]>([])
  const [snowflakeAgent, setSnowflakeAgent] = useState<AgentResponse | null>(null)
  const [databricksAgent, setDatabricksAgent] = useState<AgentResponse | null>(null)
  const [snowflakeScores, setSnowflakeScores] = useState<Scores | null>(null)
  const [databricksScores, setDatabricksScores] = useState<Scores | null>(null)
  const [loading, setLoading] = useState<"snowflake" | "databricks" | "both" | null>(null)
  const [agentLoading, setAgentLoading] = useState<"snowflake" | "databricks" | "both" | null>(null)
  const [error, setError] = useState("")
  const [runId] = useState(() => {
    const now = new Date()
    return `run-${now.toISOString().slice(0, 10)}-${now.toISOString().slice(11, 19).replace(/:/g, "")}`
  })

  // Results dashboard state
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
    TIER: number
    QUESTION_TEXT: string
  }
  const [results, setResults] = useState<ResultRow[]>([])
  const [showResults, setShowResults] = useState(true)

  useEffect(() => {
    fetch("/api/questions")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setQuestions(data)
          if (data.length > 0) setSelectedId(data[0].QUESTION_ID)
        }
      })
      .catch((e) => setError(e.message))
  }, [])

  const selected = questions.find((q) => q.QUESTION_ID === selectedId)

  async function pollAgent(requestId: string, platform: string, setAgent: (r: AgentResponse) => void, setOutput: (s: string) => void): Promise<void> {
    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/agent/${platform}?id=${requestId}`)
          const state = await res.json()
          if (state.error && !state.response) {
            setError(state.error)
            clearInterval(interval)
            resolve()
            return
          }
          if (state.response) {
            setAgent({ ...state.response })
            if (state.response.fullTextForScoring || state.response.plainText) {
              setOutput(state.response.fullTextForScoring || state.response.plainText)
            }
          }
          if (state.error) {
            setError(state.error)
          }
          if (state.done) {
            clearInterval(interval)
            resolve()
          }
        } catch {
          clearInterval(interval)
          resolve()
        }
      }, 500)
    })
  }

  async function askAgent(platform: "snowflake" | "databricks") {
    if (!selected) return
    setError("")
    setAgentLoading(platform)
    const setAgent = platform === "snowflake" ? setSnowflakeAgent : setDatabricksAgent
    const setOutput = platform === "snowflake" ? setSnowflakeOutput : setDatabricksOutput
    try {
      const res = await fetch(`/api/agent/${platform}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionText: selected.QUESTION_TEXT }),
      })
      const { requestId, error } = await res.json()
      if (error) throw new Error(error)
      await pollAgent(requestId, platform, setAgent, setOutput)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAgentLoading(null)
    }
  }

  async function askBothAgents() {
    if (!selected) return
    setError("")
    setAgentLoading("both")
    try {
      const [sfRes, dbxRes] = await Promise.all([
        fetch("/api/agent/snowflake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionText: selected.QUESTION_TEXT }),
        }),
        fetch("/api/agent/databricks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionText: selected.QUESTION_TEXT }),
        }),
      ])
      const [sfData, dbxData] = await Promise.all([sfRes.json(), dbxRes.json()])
      if (sfData.error) throw new Error(`Snowflake: ${sfData.error}`)
      if (dbxData.error) throw new Error(`Databricks: ${dbxData.error}`)
      await Promise.all([
        pollAgent(sfData.requestId, "snowflake", setSnowflakeAgent, setSnowflakeOutput),
        pollAgent(dbxData.requestId, "databricks", setDatabricksAgent, setDatabricksOutput),
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAgentLoading(null)
    }
  }

  function buildScoreBody(platform: "SNOWFLAKE" | "DATABRICKS") {
    if (!selected) return null
    const text = platform === "SNOWFLAKE" ? snowflakeOutput : databricksOutput
    const images = platform === "SNOWFLAKE" ? snowflakeImages : databricksImages
    if (!text.trim() && images.length === 0) return null
    return {
      questionId: selected.QUESTION_ID,
      questionText: selected.QUESTION_TEXT,
      expectedAnswer: selected.EXPECTED_ANSWER,
      keyNumbers: selected.KEY_NUMBERS,
      traps: selected.TRAPS,
      agentOutput: text,
      images: images.length > 0 ? images : undefined,
      platform,
      runId,
    }
  }

  async function scoreOutput(platform: "SNOWFLAKE" | "DATABRICKS") {
    const body = buildScoreBody(platform)
    if (!body) {
      setError(`No output for ${platform} — ask the agent or paste manually first`)
      return
    }
    setError("")
    setLoading(platform === "SNOWFLAKE" ? "snowflake" : "databricks")
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (platform === "SNOWFLAKE") setSnowflakeScores(data)
      else setDatabricksScores(data)
      loadResults()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(null)
    }
  }

  async function scoreBoth() {
    const sfBody = buildScoreBody("SNOWFLAKE")
    const dbxBody = buildScoreBody("DATABRICKS")
    if (!sfBody || !dbxBody) {
      setError("Need output from both platforms before scoring — ask agents or paste manually")
      return
    }
    setError("")
    setLoading("both")
    try {
      const [sfRes, dbxRes] = await Promise.all([
        fetch("/api/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sfBody) }),
        fetch("/api/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dbxBody) }),
      ])
      const sfData = await sfRes.json()
      const dbxData = await dbxRes.json()
      if (sfData.error) throw new Error(`Snowflake: ${sfData.error}`)
      if (dbxData.error) throw new Error(`Databricks: ${dbxData.error}`)
      setSnowflakeScores(sfData)
      setDatabricksScores(dbxData)
      loadResults()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(null)
    }
  }

  async function loadResults() {
    try {
      const res = await fetch(`/api/results`)
      const data = await res.json()
      if (data.results) setResults(data.results)
    } catch { /* ignore */ }
  }

  useEffect(() => { loadResults() }, [])

  function clearAll() {
    setSnowflakeScores(null)
    setDatabricksScores(null)
    setSnowflakeOutput("")
    setDatabricksOutput("")
    setSnowflakeImages([])
    setDatabricksImages([])
    setSnowflakeAgent(null)
    setDatabricksAgent(null)
    setError("")
  }

  return (
    <main className="w-full py-8 px-6 max-w-[1600px] mx-auto space-y-8">
      {/* Question Selector */}
      <Card className="border-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-bold tracking-tight">Select Question</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <select
            value={selectedId}
            onChange={(e) => { setSelectedId(e.target.value); clearAll() }}
            className="w-full p-3 border-2 rounded-lg bg-background text-foreground text-base font-medium"
          >
            {questions.map((q) => (
              <option key={q.QUESTION_ID} value={q.QUESTION_ID}>
                {q.QUESTION_ID} [Tier {q.TIER}] — {q.QUESTION_TEXT.substring(0, 80)}...
              </option>
            ))}
          </select>
          {selected && (
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                {tierBadge(selected.TIER)}
                {selected.TRAPS && selected.TRAPS.split(",").map((t) => (
                  <Badge key={t} variant="outline" className="text-xs">{t.trim()}</Badge>
                ))}
              </div>
              <p className="text-base font-semibold leading-relaxed">{selected.QUESTION_TEXT}</p>
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer font-semibold">Expected Answer</summary>
                <pre className="mt-2 whitespace-pre-wrap bg-muted p-3 rounded-lg text-sm leading-relaxed">
                  {selected.EXPECTED_ANSWER}
                </pre>
                <p className="mt-2"><strong>Key numbers:</strong> {selected.KEY_NUMBERS}</p>
              </details>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Output Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OutputPanel
          label="Snowflake (CoWork)"
          color="bg-blue-500"
          placeholder="Paste output from CoWork / Snowflake Cortex Agent here...&#10;&#10;Supports: text, tables (Ctrl+V from browser), screenshots (Ctrl+V / drag-drop)"
          text={snowflakeOutput}
          images={snowflakeImages}
          agentResponse={snowflakeAgent}
          onTextChange={setSnowflakeOutput}
          onImagesChange={setSnowflakeImages}
          onAskAgent={() => askAgent("snowflake")}
          onScore={() => scoreOutput("SNOWFLAKE")}
          loading={loading === "snowflake" || loading === "both"}
          agentLoading={agentLoading === "snowflake" || agentLoading === "both"}
          loadingLabel="Score Snowflake"
        />
        <OutputPanel
          label="Databricks Supervisor Agent"
          color="bg-orange-500"
          placeholder="Paste output from Databricks Agent here...&#10;&#10;Supports: text, tables (Ctrl+V from browser), screenshots (Ctrl+V / drag-drop)"
          text={databricksOutput}
          images={databricksImages}
          agentResponse={databricksAgent}
          onTextChange={setDatabricksOutput}
          onImagesChange={setDatabricksImages}
          onAskAgent={() => askAgent("databricks")}
          onScore={() => scoreOutput("DATABRICKS")}
          loading={loading === "databricks" || loading === "both"}
          agentLoading={agentLoading === "databricks" || agentLoading === "both"}
          loadingLabel="Score Databricks"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4">
        <Button
          onClick={() => askBothAgents()}
          disabled={agentLoading !== null || loading !== null}
          size="lg"
          variant="outline"
          className="px-8 text-base font-semibold h-12"
        >
          {agentLoading === "both" ? "Asking Both Agents..." : "Ask Both Agents"}
        </Button>
        <Button
          onClick={scoreBoth}
          disabled={loading !== null || (!snowflakeOutput.trim() && snowflakeImages.length === 0) || (!databricksOutput.trim() && databricksImages.length === 0)}
          size="lg"
          className="px-8 text-base font-semibold h-12"
        >
          {loading === "both" ? "Scoring Both Platforms..." : "Score Both Platforms"}
        </Button>
      </div>

      {error && (
        <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-3 rounded text-sm">
          {error}
        </div>
      )}

      {/* Score Comparison */}
      {(snowflakeScores || databricksScores) && (
        <Card className="border-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl font-bold tracking-tight">Score Comparison — {selectedId}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b-2">
                    <th className="text-left py-3 pr-6 font-semibold">Dimension</th>
                    <th className="text-center py-3 px-6 font-semibold text-blue-600">Snowflake</th>
                    <th className="text-center py-3 px-6 font-semibold text-orange-600">Databricks</th>
                    <th className="text-center py-3 px-6 font-semibold">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {DIMENSIONS.map(({ key, label }) => {
                    const sf = snowflakeScores?.[key as keyof Scores] as number | undefined
                    const dbx = databricksScores?.[key as keyof Scores] as number | undefined
                    const delta = sf !== undefined && dbx !== undefined ? sf - dbx : null
                    return (
                      <tr key={key} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="py-3 pr-6 font-semibold text-base">{label}</td>
                        <td className="text-center py-3 px-6">
                          {sf !== undefined ? (
                            <span className={`font-bold text-2xl ${scoreColor(sf)}`}>{sf}</span>
                          ) : <span className="text-muted-foreground text-lg">-</span>}
                        </td>
                        <td className="text-center py-3 px-6">
                          {dbx !== undefined ? (
                            <span className={`font-bold text-2xl ${scoreColor(dbx)}`}>{dbx}</span>
                          ) : <span className="text-muted-foreground text-lg">-</span>}
                        </td>
                        <td className="text-center py-3 px-6">
                          {delta !== null ? (
                            <span className={`font-bold text-xl ${delta > 0 ? "text-blue-600" : delta < 0 ? "text-orange-600" : "text-muted-foreground"}`}>
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                          ) : <span className="text-muted-foreground text-lg">-</span>}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="font-bold border-t-2 bg-muted/20">
                    <td className="py-4 pr-6 text-lg">TOTAL</td>
                    <td className="text-center py-4 px-6">
                      {snowflakeScores ? (
                        <span className={`text-3xl font-black ${scoreBg(snowflakeScores.total / 3)} px-3 py-1.5 rounded-lg`}>
                          {snowflakeScores.total}/15
                        </span>
                      ) : "-"}
                    </td>
                    <td className="text-center py-4 px-6">
                      {databricksScores ? (
                        <span className={`text-3xl font-black ${scoreBg(databricksScores.total / 3)} px-3 py-1.5 rounded-lg`}>
                          {databricksScores.total}/15
                        </span>
                      ) : "-"}
                    </td>
                    <td className="text-center py-4 px-6">
                      {snowflakeScores && databricksScores ? (
                        <span className={`text-2xl font-black ${snowflakeScores.total > databricksScores.total ? "text-blue-600" : snowflakeScores.total < databricksScores.total ? "text-orange-600" : ""}`}>
                          {snowflakeScores.total > databricksScores.total ? `+${snowflakeScores.total - databricksScores.total}` : snowflakeScores.total - databricksScores.total}
                        </span>
                      ) : "-"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Rationales */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
              {snowflakeScores?.rationale && (
                <div className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-950/30 p-5 rounded">
                    <p className="font-bold text-lg mb-3">Snowflake Rationale:</p>
                    <p className="text-base leading-relaxed">{snowflakeScores.rationale}</p>
                  </div>
                </div>
              )}
              {databricksScores?.rationale && (
                <div className="space-y-4">
                  <div className="bg-orange-50 dark:bg-orange-950/30 p-5 rounded">
                    <p className="font-bold text-lg mb-3">Databricks Rationale:</p>
                    <p className="text-base leading-relaxed">{databricksScores.rationale}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      {/* Results Dashboard */}
      <Card className="border-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold tracking-tight">Benchmark Results</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadResults}>Refresh</Button>
              <Button variant="outline" size="sm" onClick={() => setShowResults(!showResults)}>
                {showResults ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
        </CardHeader>
        {showResults && (
          <CardContent>
            {results.length === 0 ? (
              <p className="text-base text-muted-foreground">No results yet. Score questions above to populate.</p>
            ) : (
              <>
                {/* Summary stats */}
                {(() => {
                  const sfResults = results.filter(r => r.PLATFORM === "SNOWFLAKE")
                  const dbxResults = results.filter(r => r.PLATFORM === "DATABRICKS")
                  const sfAvg = sfResults.length ? (sfResults.reduce((s, r) => s + r.SCORE_TOTAL, 0) / sfResults.length).toFixed(1) : "-"
                  const dbxAvg = dbxResults.length ? (dbxResults.reduce((s, r) => s + r.SCORE_TOTAL, 0) / dbxResults.length).toFixed(1) : "-"
                  const sfWins = sfResults.filter((r) => {
                    const dbx = dbxResults.find(d => d.QUESTION_ID === r.QUESTION_ID)
                    return dbx && r.SCORE_TOTAL > dbx.SCORE_TOTAL
                  }).length
                  const dbxWins = dbxResults.filter((r) => {
                    const sf = sfResults.find(s => s.QUESTION_ID === r.QUESTION_ID)
                    return sf && r.SCORE_TOTAL > sf.SCORE_TOTAL
                  }).length
                  const ties = sfResults.filter((r) => {
                    const dbx = dbxResults.find(d => d.QUESTION_ID === r.QUESTION_ID)
                    return dbx && r.SCORE_TOTAL === dbx.SCORE_TOTAL
                  }).length
                  return (
                    <div className="grid grid-cols-3 gap-6 mb-8">
                      <div className="bg-blue-50 dark:bg-blue-950/30 p-5 rounded-xl border border-blue-200 dark:border-blue-800 text-center">
                        <div className="text-4xl font-black text-blue-600">{sfAvg}</div>
                        <div className="text-sm font-semibold text-blue-600/70 mt-1">Snowflake Avg</div>
                      </div>
                      <div className="bg-orange-50 dark:bg-orange-950/30 p-5 rounded-xl border border-orange-200 dark:border-orange-800 text-center">
                        <div className="text-4xl font-black text-orange-600">{dbxAvg}</div>
                        <div className="text-sm font-semibold text-orange-600/70 mt-1">Databricks Avg</div>
                      </div>
                      <div className="bg-muted/50 p-5 rounded-xl border text-center">
                        <div className="text-4xl font-black">
                          <span className="text-blue-600">{sfWins}</span>
                          <span className="text-muted-foreground mx-1">-</span>
                          <span className="text-orange-600">{dbxWins}</span>
                          <span className="text-muted-foreground mx-1">-</span>
                          <span className="text-muted-foreground">{ties}</span>
                        </div>
                        <div className="text-sm font-semibold text-muted-foreground mt-1">SF Wins - DBX Wins - Ties</div>
                      </div>
                    </div>
                  )
                })()}

                <div className="overflow-auto max-h-[800px] rounded-lg border">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-10 bg-background shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                      <tr className="border-b-2 border-foreground/20">
                        <th className="py-2 px-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider" rowSpan={2}>Q#</th>
                        <th className="py-2 px-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider" rowSpan={2}>Tier</th>
                        <th className="py-2 px-1 text-center text-xs font-semibold uppercase tracking-wider border-l border-foreground/10" colSpan={2}>Total</th>
                        <th className="py-2 px-1 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-l border-foreground/10 bg-muted/20" colSpan={2}>Acc</th>
                        <th className="py-2 px-1 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-l border-foreground/10" colSpan={2}>Gnd</th>
                        <th className="py-2 px-1 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-l border-foreground/10 bg-muted/20" colSpan={2}>Rel</th>
                        <th className="py-2 px-2 text-center text-lg font-bold text-muted-foreground border-l border-foreground/10" rowSpan={2}>&Delta;</th>
                        <th className="py-2 px-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider" rowSpan={2}>W</th>
                      </tr>
                      <tr className="border-b border-foreground/10 bg-background">
                        {[false, true, false, true].map((alt, i) => (
                          <React.Fragment key={i}>
                            <th className={`py-1.5 px-1 text-center border-l border-foreground/10 ${alt ? "bg-muted/20" : ""}`} title="Snowflake">
                              <img src="/snowflake-logo.svg" alt="SF" width="20" height="20" className="inline-block" />
                            </th>
                            <th className={`py-1.5 px-1 text-center ${alt ? "bg-muted/20" : ""}`} title="Databricks">
                              <img src="/databricks-logo.svg" alt="DBX" width="20" height="20" className="inline-block" />
                            </th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {questions.map((q, qIdx) => {
                        const sf = results.find(r => r.QUESTION_ID === q.QUESTION_ID && r.PLATFORM === "SNOWFLAKE")
                        const dbx = results.find(r => r.QUESTION_ID === q.QUESTION_ID && r.PLATFORM === "DATABRICKS")
                        const delta = sf && dbx ? sf.SCORE_TOTAL - dbx.SCORE_TOTAL : null
                        const winner = delta === null ? "" : delta > 0 ? "SF" : delta < 0 ? "DBX" : "TIE"
                        const prevTier = qIdx > 0 ? questions[qIdx - 1].TIER : q.TIER
                        const tierBreak = q.TIER !== prevTier
                        const dimPairs: { sfVal: number | undefined; dbxVal: number | undefined; alt: boolean }[] = [
                          { sfVal: sf?.SCORE_ACCURACY, dbxVal: dbx?.SCORE_ACCURACY, alt: true },
                          { sfVal: sf?.SCORE_GROUNDEDNESS, dbxVal: dbx?.SCORE_GROUNDEDNESS, alt: false },
                          { sfVal: sf?.SCORE_RELEVANCE, dbxVal: dbx?.SCORE_RELEVANCE, alt: true },
                        ]
                        return (
                          <tr
                            key={q.QUESTION_ID}
                            className={`hover:bg-blue-50/50 dark:hover:bg-blue-950/20 cursor-pointer transition-colors ${tierBreak ? "border-t-2 border-foreground/15" : "border-t border-foreground/5"} ${qIdx % 2 === 0 ? "" : "bg-muted/10"}`}
                            onClick={() => { setSelectedId(q.QUESTION_ID); clearAll() }}
                          >
                            <td className="py-2 px-2 font-mono font-bold text-sm">{q.QUESTION_ID}</td>
                            <td className="py-2 px-2">{tierBadge(q.TIER)}</td>
                            <td className="py-2 px-1 text-center border-l border-foreground/10">
                              {totalPill(sf?.SCORE_TOTAL, "sf")}
                            </td>
                            <td className="py-2 px-1 text-center">
                              {totalPill(dbx?.SCORE_TOTAL, "dbx")}
                            </td>
                            {dimPairs.map((pair, idx) => (
                              <React.Fragment key={idx}>
                                <td className={`py-2 px-1 text-center border-l border-foreground/10 ${pair.alt ? "bg-muted/20" : ""}`}>
                                  {scorePill(pair.sfVal)}
                                </td>
                                <td className={`py-2 px-1 text-center ${pair.alt ? "bg-muted/20" : ""}`}>
                                  {scorePill(pair.dbxVal)}
                                </td>
                              </React.Fragment>
                            ))}
                            <td className="py-2 px-2 text-center border-l border-foreground/10">
                              {deltaBadge(delta)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              {winnerBadge(winner)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>
    </main>
  )
}
