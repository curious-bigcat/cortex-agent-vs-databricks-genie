export interface AgentTextItem {
  type: "text"
  text: string
  citations?: { doc_title: string; text: string }[]
}

export interface AgentTableItem {
  type: "table"
  title?: string
  columns: string[]
  rows: string[][]
}

export interface AgentChartItem {
  type: "chart"
  chartSpec: string
}

export interface AgentToolStep {
  type: "tool_step"
  toolName: string
  toolType: string
  sql?: string
  status: string
}

export interface AgentThinkingItem {
  type: "thinking"
  text: string
}

export interface AgentStatusItem {
  type: "status"
  message: string
}

export type AgentContentItem =
  | AgentTextItem
  | AgentTableItem
  | AgentChartItem
  | AgentToolStep
  | AgentThinkingItem
  | AgentStatusItem

export interface AgentResponse {
  content: AgentContentItem[]
  plainText: string
  fullTextForScoring: string
  error?: string
  toolCalls?: number
  failures?: number
  tokens?: number
}
