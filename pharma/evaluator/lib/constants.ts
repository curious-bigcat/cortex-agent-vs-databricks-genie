/** App title — displayed in the nav header and browser tab */
export const APP_TITLE = "ClinicalIQ Benchmark Evaluator"

/** Path to the logo in /public (used in the header and as favicon) */
export const LOGO_SRC = "/icon.svg"

/** Database and schema for the benchmark data */
export const DB_SCHEMA = "PHARMA_BENCHMARK_DB.CLINICAL"

/** Cortex model for AI scoring */
export const SCORING_MODEL = "claude-sonnet-4-6"

/** Cortex Agent REST API path (relative to account URL) */
export const CORTEX_AGENT_PATH =
  "/api/v2/databases/PHARMA_BENCHMARK_DB/schemas/CLINICAL/agents/CLINICALIQ_AGENT:run"

/** Databricks Supervisor Agent serving endpoint */
export const DATABRICKS_ENDPOINT =
  "https://adb-4021515458947188.8.azuredatabricks.net/serving-endpoints/mas-f5eeff62-endpoint/invocations"
