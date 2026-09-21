/** Domain type for switching between benchmark datasets */
export type Domain = "pharma" | "retail"

/** Per-domain configuration */
export interface DomainConfig {
  label: string
  dbSchema: string
  agentPath: string
  dbxEndpoint: string
  scoringContext: string
}

export const DOMAIN_CONFIG: Record<Domain, DomainConfig> = {
  pharma: {
    label: "ClinicalIQ (Pharma)",
    dbSchema: "PHARMA_BENCHMARK_DB.CLINICAL",
    agentPath: "/api/v2/databases/PHARMA_BENCHMARK_DB/schemas/CLINICAL/agents/CLINICALIQ_AGENT:run",
    dbxEndpoint:
      "https://adb-4021515458947188.8.azuredatabricks.net/serving-endpoints/mas-f5eeff62-endpoint/invocations",
    scoringContext: "clinical trial AI agent",
  },
  retail: {
    label: "RetailIQ (Retail)",
    dbSchema: "RETAIL_BENCHMARK_DB.ANALYTICS",
    agentPath: "/api/v2/databases/RETAIL_BENCHMARK_DB/schemas/ANALYTICS/agents/RETAILIQ_AGENT:run",
    dbxEndpoint: "https://adb-4021515458947188.8.azuredatabricks.net/serving-endpoints/mas-4adcd74d-endpoint/invocations",
    scoringContext: "retail analytics AI agent",
  },
}

export function getDomainConfig(domain?: string | null): DomainConfig {
  if (domain === "retail") return DOMAIN_CONFIG.retail
  return DOMAIN_CONFIG.pharma
}

/** App title — displayed in the nav header and browser tab */
export const APP_TITLE = "Benchmark Evaluator"

/** Path to the logo in /public (used in the header and as favicon) */
export const LOGO_SRC = "/icon.svg"

/** Database and schema for the benchmark data (default: pharma) */
export const DB_SCHEMA = DOMAIN_CONFIG.pharma.dbSchema

/** Cortex model for AI scoring */
export const SCORING_MODEL = "claude-sonnet-4-6"

/** Cortex Agent REST API path — default pharma */
export const CORTEX_AGENT_PATH = DOMAIN_CONFIG.pharma.agentPath

/** Databricks Supervisor Agent serving endpoint — default pharma */
export const DATABRICKS_ENDPOINT = DOMAIN_CONFIG.pharma.dbxEndpoint
