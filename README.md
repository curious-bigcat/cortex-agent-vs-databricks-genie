# Snowflake Cortex Agent vs Databricks Genie — Benchmark

A head-to-head benchmark framework comparing **Snowflake Cortex Agent** vs **Databricks Genie** on complex analytical questions. Tests both platforms' ability to handle structured SQL queries, unstructured document search, and hybrid orchestration — then scores every answer with an automated LLM judge.

The included sample benchmark uses a **clinical trials dataset** (pharma/life sciences), but the framework and methodology apply to any domain.

## Why This Benchmark

Enterprise AI agents are moving beyond simple chatbots. Both Snowflake and Databricks now offer multi-tool AI agents that can query structured data via text-to-SQL AND search unstructured documents via RAG — then orchestrate between them to answer complex business questions.

But how well do they actually work? Marketing demos use cherry-picked questions on clean data. This benchmark uses **messy, realistic data with embedded traps** that test whether the agent truly understands the data model or just pattern-matches SQL.

## Results (Clinical Trial Sample)

| Metric | Snowflake Cortex Agent | Databricks Genie |
|--------|----------------------|-----------------|
| **Average Score** | **26.2 / 30** | **19.5 / 30** |
| **Wins** | **25** | **2** |
| **Ties** | 3 | 3 |
| **Perfect Scores (30/30)** | 11 | 2 |
| **Critical Failures (<15)** | 0 | 5 |

The gap widens with complexity: +1.8 pts on basic queries, **+9.0 pts on multi-table joins**, +8.4 pts on complex derivations.

See [`pharma/BENCHMARK_ANALYSIS.md`](pharma/BENCHMARK_ANALYSIS.md) for the full 30-question breakdown with failure patterns, and [`pharma/Benchmark_Evaluator.pdf`](pharma/Benchmark_Evaluator.pdf) for the exported evaluator report.

## How It Works

### 1. Data with Embedded Traps

The benchmark uses synthetic structured data with deliberate traps — columns that look similar but mean different things, metrics that must be derived rather than read, and join paths that can silently produce wrong results. These aren't trick questions; they're patterns that cause wrong answers in production.

### 2. Hybrid Questions

Every question requires BOTH structured data analysis AND document search. No labels hint which tools to use. The agent must decide the orchestration itself.

### 3. Automated LLM Scoring

An AI judge (Cortex AI_COMPLETE with claude-sonnet-4-6) scores each platform's output on 6 dimensions (1–5 each, max 30):

1. **Accuracy** — are the numbers correct?
2. **Groundedness** — grounded in data/documents, not hallucinated?
3. **Relevance** — addresses the question asked?
4. **Usefulness** — actionable and well-formatted?
5. **Correctness** — methodology correct, traps avoided?
6. **Decision Consequences** — safe for a decision-maker to act on this answer?

### 4. Evaluator Dashboard

A Snowflake App Runtime (SAR) Next.js app with:
- Side-by-side scoring of Snowflake and Databricks agent outputs
- Analytics dashboard with per-question breakdown, dimension charts, and failure analysis
- Results persisted to Snowflake for historical tracking

## Key Findings

### 7 Recurring Databricks Failure Patterns

1. **Data Trap Blindness** — picks the wrong column when two look similar (e.g., severity vs seriousness, planned vs actual budget). Snowflake's semantic view steers the agent to the right one.
2. **Broken JOINs & Wrong Denominators** — wrong patient counts that flip conclusions entirely.
3. **Shallow Analysis** — stops at the first answer instead of digging deeper when results are surprising.
4. **Document Search Weakness** — frequently returns empty results, falls back on generic knowledge, or hallucinates citations.
5. **Events vs Patients Confusion** — counts events-per-patient as a percentage, producing nonsensical rates like 600%.
6. **Budget Column Confusion** — reports $12.6B spending when the actual figure is $9.9B.
7. **Temporal Windowing Failures** — can't split data by time periods correctly, producing identical numbers for both groups.

### Why Snowflake Wins — Three Structural Layers

1. **Base semantic view** (zero tuning) — column descriptions, relationships, and sample values prevent ~15 questions' worth of errors out of the box.
2. **Iterative feedback loop** — `sql_generation` rules and verified queries let you teach the agent domain expertise. Each fix is permanent and compounds across similar questions. Databricks has no equivalent.
3. **Cortex Search + orchestration** — 3 dedicated search services with typed, filterable attributes, plus explicit multi-tool routing for hybrid questions.

## Sample Benchmark: Clinical Trials (Pharma)

### Data

| Layer | Content | Volume |
|-------|---------|--------|
| Structured | 17 tables (trials, enrollments, adverse events, labs, budgets, etc.) | ~15M rows |
| Documents | ClinicalTrials.gov protocols, FDA drug labels, PubMed abstracts | 173K docs |

### Architecture

**Snowflake:**
```
CLINICALIQ_AGENT (Cortex Agent)
  |-- clinical_analytics (Cortex Analyst + Semantic View)
  |-- trial_search (Cortex Search — 100K trials)
  |-- drug_label_search (Cortex Search — 28.7K labels)
  |-- pubmed_search (Cortex Search — 45K abstracts)
  |-- data_to_chart
```

**Databricks:**
```
Supervisor Agent
  |-- ClinicalIQ Structured (Genie Agent — 17 tables)
  |-- ClinicalIQ Documents (Knowledge Assistant — UC Volume)
```

## Project Structure

```
pharma/
|-- setup/
|   |-- sf_01_create_schema.sql        # Snowflake DDL (17 tables + stages)
|   |-- sf_02_create_agent.sql         # Cortex Search services + Agent
|   |-- dbx_01_load_data.ipynb         # Databricks data loading notebook
|   |-- dbx_02_agent_setup.md          # Genie + Knowledge Assistant + Supervisor
|
|-- questions/
|   |-- benchmark_questions.md         # 30 hybrid questions with expected answers
|
|-- evaluator/                         # Benchmark Evaluator App (Next.js on SPCS)
|   |-- app/                           # Pages and API routes
|   |-- components/                    # Evaluator UI + Analytics Dashboard
|   |-- lib/                           # Snowflake connection, constants
|
|-- BENCHMARK_ANALYSIS.md             # Full analysis with patterns and findings
```

## Setup

### Snowflake

```sql
-- Run setup/sf_01_create_schema.sql (creates tables, stages, loads data)
-- Run setup/sf_02_create_agent.sql (creates search services, semantic view, agent)
```

### Databricks

1. Load data using `setup/dbx_01_load_data.ipynb`
2. Follow `setup/dbx_02_agent_setup.md` for Genie + Knowledge Assistant + Supervisor

### Evaluator App

```bash
cd pharma/evaluator
npm install
snow app deploy
```

## Running the Benchmark

1. Open both agents: Snowflake (Snowsight) and Databricks (Playground)
2. Open the Evaluator app
3. For each question Q01–Q30:
   - Ask the question in both platforms
   - Paste each output into the Evaluator
   - Click "Score Both Platforms"
4. Switch to Analytics tab for charts, failure analysis, and per-question breakdown
5. Results saved automatically to Snowflake
