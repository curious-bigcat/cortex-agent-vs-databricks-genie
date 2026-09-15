import type { AgentResponse, AgentContentItem } from "./agent-types"

interface StreamEntry {
  response: AgentResponse
  done: boolean
  error?: string
  startedAt: number
}

const streams = new Map<string, StreamEntry>()

const TTL_MS = 10 * 60 * 1000

function cleanup() {
  const now = Date.now()
  for (const [id, entry] of streams) {
    if (now - entry.startedAt > TTL_MS) streams.delete(id)
  }
}

export function createStream(id: string) {
  cleanup()
  streams.set(id, {
    response: { content: [], plainText: "", fullTextForScoring: "" },
    done: false,
    startedAt: Date.now(),
  })
}

export function updateStream(id: string, response: AgentResponse) {
  const entry = streams.get(id)
  if (entry) entry.response = response
}

export function completeStream(id: string, finalResponse?: AgentResponse) {
  const entry = streams.get(id)
  if (entry) {
    if (finalResponse) entry.response = finalResponse
    // Count tool calls and failures from content
    const toolSteps = entry.response.content.filter(c => c.type === "tool_step")
    entry.response.toolCalls = toolSteps.length
    entry.response.failures = toolSteps.filter(c => c.type === "tool_step" && c.status === "error").length
    entry.response.tokens = Math.round((entry.response.plainText?.length || 0) / 4)
    entry.done = true
  }
}

export function failStream(id: string, error: string) {
  const entry = streams.get(id)
  if (entry) {
    entry.error = error
    entry.done = true
  }
}

export function getStream(id: string): { response: AgentResponse; done: boolean; error?: string } | null {
  const entry = streams.get(id)
  if (!entry) return null
  return { response: entry.response, done: entry.done, error: entry.error }
}
