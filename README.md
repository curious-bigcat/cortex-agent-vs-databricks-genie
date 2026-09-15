# Snowflake Cortex Agent vs Databricks Genie — Benchmark

A head-to-head benchmark comparing **Snowflake Cortex Agent** vs **Databricks Genie** on complex clinical trial analytics. Tests both platforms' ability to handle multi-table SQL queries, document search, and hybrid orchestration — then scores every answer with an automated LLM judge.

## Results

| Metric | Snowflake Cortex Agent | Databricks Genie |
|---|---|---|
| **Total Score** | **197 / 210** (93.8%) | **124 / 210** (59.0%) |
| **Average per Question** | **14.1 / 15** | **8.9 / 15** |
| **SF Wins** | **14** | **0** |
| **Point Gap** | **+73 points** | |

The gap widens with complexity: +4.5 pts on derived metrics, **+7.0 pts on executive synthesis**.

See [`pharma/docs/benchmark_analysis.md`](pharma/docs/benchmark_analysis.md) for the full 14-question breakdown with failure patterns.

## How It Works

### 1. Data with Skewed Distributions

16 structured tables (~15M rows) + 173K documents. Five key tables have intentionally skewed distributions (SAE rates by TA, enrollment by country, quality scores by country, visit compliance by TA, budget overrun by phase) to ensure cross-table questions produce meaningfully different results.

### 2. Hybrid Questions

Every question requires structured data analysis AND document search. The agent decides the orchestration. Questions are ordered by complexity (Tier 2–6) and selected to expose repeatable Databricks failure patterns.

### 3. Automated LLM Scoring

Claude Sonnet 4 (via Cortex COMPLETE) scores each output on 3 dimensions (1–5 each, max 15):

| Dimension | What it measures |
|---|---|
| **Accuracy** | Are the numbers correct? |
| **Groundedness** | Grounded in data, not hallucinated? |
| **Relevance** | Addresses the question asked? |

Each score also includes a **failure pattern analysis** identifying the root cause when DBX scores low.

### 4. Evaluator App

A Next.js app deployed on Snowflake SPCS with:
- Side-by-side scoring of both platform outputs
- Previous run analysis with failure patterns per question
- Complexity type and DBX failure pattern metadata per question
- Results persisted to Snowflake

## Platform Configurations

### Snowflake

| Component | Configuration |
|---|---|
| **Account** | SFSEAPAC-BSURESH |
| **Database** | PHARMA_BENCHMARK_DB.CLINICAL |
| **Agent** | CLINICALIQ_AGENT (Cortex Agent) |
| **Semantic View** | CLINICAL_ANALYST (DDL-based, cross-table facts + relationships) |

**Architecture:**
```
CLINICALIQ_AGENT (Cortex Agent)
  ├── clinical_analytics (Cortex Analyst + Semantic View)
  ├── trial_search (Cortex Search — 100K trials)
  ├── drug_label_search (Cortex Search — 28.7K labels)
  ├── pubmed_search (Cortex Search — 45K abstracts)
  └── data_to_chart
```

### Databricks

| Component | Configuration |
|---|---|
| **Catalog** | dbx-bsuresh-catalog |
| **Schema** | clinical |
| **Volume** | /Volumes/dbx-bsuresh-catalog/clinical/clinical |
| **Agent** | Supervisor Agent (Databricks Playground) |
| **Genie Space** | Clinical Trials Data Hub |

**Architecture:**
```
Supervisor Agent
  ├── ClinicalIQ Structured (Genie — 16 tables + 16 metric views)
  └── ClinicalIQ Documents (Knowledge Assistant — UC Volume)
```

**Key limitation:** Metric views are per-table only. Cannot express cross-table joins, composite metrics, or negation patterns. All cross-table reasoning depends on Genie's SQL generation, which fails on 3+ table joins.

### Configuration Parity

Both platforms have equivalent metadata where their architectures allow:

| Snowflake | Databricks Equivalent |
|---|---|
| Semantic view column descriptions | Metric view dimensions/measures |
| Cross-table relationships & facts | Not expressible in metric views |
| Cortex Search (3 services) | Knowledge Assistant (1 index) |
| Agent instructions | Genie General Instructions (10 data rules) |
| Verified queries (VQRs) | Not available in Genie |

## Project Structure

```
pharma/
├── data/                              # CSV data files (16 structured tables)
├── docs/
│   └── benchmark_analysis.md          # Full benchmark analysis with failure patterns
├── evaluator/                         # Benchmark Evaluator App (Next.js on SPCS)
│   ├── app/                           # Pages and API routes
│   │   ├── api/agent/                 # Snowflake + Databricks agent endpoints
│   │   ├── api/questions/             # Questions API
│   │   ├── api/results/               # Results API
│   │   └── api/score/                 # Scoring endpoint (Cortex COMPLETE)
│   ├── components/                    # Evaluator UI
│   └── lib/                           # Snowflake connection, agent streaming, constants
├── questions/
│   └── benchmark_questions_v3.md      # Question catalog (historical)
└── setup/
    ├── sf_01_create_schema.sql        # Snowflake DDL (tables + stages + data load)
    ├── sf_02_create_agent.sql         # Cortex Search services + Semantic View + Agent
    ├── dbx_01_load_data.ipynb         # Databricks data loading notebook
    └── dbx_02_agent_setup.md          # Genie setup: instructions, metric views, teardown
```

## Setup

### Snowflake

```sql
-- 1. Create schema and load data
-- Run setup/sf_01_create_schema.sql

-- 2. Create search services, semantic view, and agent
-- Run setup/sf_02_create_agent.sql
```

### Databricks

1. Upload CSVs to volume `/Volumes/dbx-bsuresh-catalog/clinical/clinical/`
2. Run `setup/dbx_01_load_data.ipynb` to create tables
3. Add 16 metric views to Genie Space (YAML in `setup/dbx_02_agent_setup.md`)
4. Paste General Instructions into Genie Space (in `setup/dbx_02_agent_setup.md`)

### Evaluator App

```bash
cd pharma/evaluator
npm install
snow app deploy
# App available at https://<your-app-url>.snowflakecomputing.app
```

## Running the Benchmark

1. Open the Evaluator app
2. For each question Q02–Q17:
   - Ask the question in both platforms (Snowflake CoWork + Databricks Genie)
   - Paste each output into the Evaluator
   - Click "Score Both Platforms"
3. Previous run analysis shows automatically for each question
4. Results saved to `PHARMA_BENCHMARK_DB.CLINICAL.TBL_BENCHMARK_RESULTS`
