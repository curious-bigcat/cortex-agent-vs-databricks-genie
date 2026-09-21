# Snowflake Cortex Agent vs Databricks Genie — Benchmark

A head-to-head benchmark comparing **Snowflake Cortex Agent** vs **Databricks Genie** across two domains: **clinical trials (pharma)** and **APAC retail operations**. Tests both platforms' ability to handle multi-table SQL queries, document search, structural data gap detection, and hybrid orchestration — then scores every answer with an automated LLM judge.

## Results

### Pharma (Clinical Trials)

| Metric | Snowflake Cortex Agent | Databricks Genie |
|---|---|---|
| **Total Score** | **197 / 210** (93.8%) | **124 / 210** (59.0%) |
| **Average per Question** | **14.1 / 15** | **8.9 / 15** |
| **SF Wins** | **14** | **0** |
| **Point Gap** | **+73 points** | |

The gap widens with complexity: +4.5 pts on derived metrics, **+7.0 pts on executive synthesis**.

### Retail (APAC Operations)

| Metric | Snowflake Cortex Agent | Databricks Genie |
|---|---|---|
| **Total Score** | **195 / 210** (92.9%) | **101 / 210** (48.1%) |
| **Average per Question** | **13.9 / 15** | **7.2 / 15** |
| **SF Wins** | **12** | **2** (by 1 pt each) |
| **Point Gap** | **+94 points** | |

Structural gap detection is the strongest differentiator: SF correctly identifies missing data segments while DBX hallucinates values.

See [`pharma/docs/benchmark_analysis.md`](pharma/docs/benchmark_analysis.md) for the full 14-question breakdown with failure patterns.

## How It Works

### 1. Clinical Trial Data Model

A realistic clinical trial data model spanning **16 structured tables** (~15M rows) with complex inter-table relationships, plus **173K unstructured documents** (ClinicalTrials.gov protocols, FDA drug labels, PubMed abstracts).

| Layer | Tables | Rows | Complexity |
|---|---|---|---|
| **Core entities** | `tbl_trial` (clinical studies with phase, status, therapeutic area), `tbl_sponsor` (funding organizations), `tbl_drug` (pharmaceuticals with 3 name columns: brand, generic, molecule), `tbl_investigator` (principal investigators with specialty and experience), `tbl_site` (hospital/clinic locations with quality scores and capacity) | ~13K | Reference data with multi-column lookup traps (3 drug name columns, country_cd on 4 tables) |
| **Transactional** | `tbl_enrollment` (patient screening and enrollment with status and country), `tbl_visit` (scheduled and actual patient visits with per-visit window days), `tbl_adverse_event` (safety events with severity vs seriousness distinction), `tbl_lab_result` (clinical test results ~5M rows), `tbl_conmed` (concomitant medications per patient), `tbl_vital_sign` (blood pressure, heart rate, temperature readings) | ~14M | High-volume 1:many relationships requiring pre-aggregation before cross-table joins |
| **Operational** | `tbl_trial_arm` (treatment groups: experimental, placebo, active comparator), `tbl_milestone` (timeline targets with delay tracking), `tbl_protocol_deviation` (compliance violations by category and severity), `tbl_budget` (planned vs actual spend by cost category), `tbl_regulatory_submission` (approval applications with status and review timelines) | ~120K | Multi-arm fan-out risk, planned vs actual columns, status-based filtering with negation traps |
| **Documents** | `tbl_document` — three real-world clinical research document sources: **ClinicalTrials.gov protocols** (100K trial registrations with study design, eligibility criteria, endpoints, and status updates scraped from clinicaltrials.gov), **FDA DailyMed drug labels** (28.7K official prescribing information documents including boxed warnings, adverse reactions, drug interactions, and dosing from dailymed.nlm.nih.gov), **PubMed research abstracts** (45K peer-reviewed publication abstracts covering clinical outcomes, safety signals, and treatment efficacy from pubmed.ncbi.nlm.nih.gov). Each document includes metadata (doc_id, source, title, publication date) and full parsed text for semantic search. | 173K | Every benchmark question requires searching these documents alongside structured data — the agent must orchestrate SQL queries AND document retrieval, then synthesize findings. Tests whether the platform searches the actual corpus or falls back to generic knowledge. |

**Data traps embedded in the schema** — these are realistic patterns found in production clinical data that cause AI agents to produce wrong answers:

- **Screen failure trap**: Not every patient in `tbl_enrollment` actually enrolled — some failed screening and have `enroll_dt IS NULL`. If the agent counts all rows as "enrolled patients," enrollment rates and per-patient metrics will be wrong. The correct approach is to filter to `enroll_dt IS NOT NULL`.

- **Serious vs Severe confusion**: `tbl_adverse_event` has two separate columns — `seriousness` (a regulatory classification: does the event require mandatory reporting to authorities?) and `severity` (clinical intensity: how bad was it physically?). A mild skin rash can be "serious" if it causes hospitalization, while a severe headache may not be "serious" at all. Agents that confuse these produce completely wrong safety metrics.

- **Planned vs Actual budget**: `tbl_budget` has both `planned_usd` (what was budgeted) and `actual_usd` (what was actually spent). They look interchangeable but tell very different stories. Asking "how much are we spending" should use actual; asking "how much did we plan" should use planned. Agents that pick the wrong column report numbers that are off by millions.

- **Variable visit windows**: Each visit type in `tbl_visit` has its own `visit_window_days` column — a screening visit might allow a 7-day window while a dosing visit allows only 2 days. There is no single "on-time" flag; the agent must calculate `ABS(actual_dt - scheduled_dt) <= visit_window_days` per row. Agents that use a fixed window (e.g., always 7 days) get the compliance rate wrong.

- **Country column on multiple tables**: `country_cd` appears on `tbl_site`, `tbl_enrollment`, `tbl_sponsor`, and `tbl_investigator`. "Trials in Japan" means patients enrolled in Japan (`tbl_enrollment.country_cd`), not sites located in Japan or sponsors headquartered there. Using the wrong table's country column changes the results entirely.

- **Trial arm fan-out**: Each trial has 2–4 treatment arms (experimental, placebo, active comparator) in `tbl_trial_arm`. Joining `tbl_drug → tbl_trial_arm → tbl_enrollment` without careful aggregation multiplies patient counts by the number of arms, producing inflated numbers. The agent must use `DISTINCT` or pre-aggregate to avoid this cartesian product.

### 2. Hybrid Questions

Every question in the benchmark has two parts: a **data analysis** part that requires writing SQL against the structured tables, and a **research** part that requires searching the document corpus for published evidence. For example: *"What is the serious adverse event rate per 100 enrolled patients by trial phase?"* (SQL) + *"What does published research say about expected SAE rates by phase?"* (document search).

The question never tells the agent which tool to use — the agent must figure out on its own that it needs to run a SQL query first, then search published literature, and combine the findings into a coherent answer. This tests the agent's ability to **orchestrate multiple tools**, not just execute a single query.

Questions are ordered by complexity across 5 tiers — each tier adds a new layer of difficulty that tests whether the agent can handle increasingly realistic analytical workloads:

| Tier | What it tests | Example | Why Genie struggles |
|---|---|---|---|
| **Tier 2** | Can the agent compute a metric that doesn't exist as a column? It must derive values using formulas and per-row logic across 1-2 tables. | *"What % of visits are severely late?"* — requires calculating `ABS(actual_dt - scheduled_dt) > visit_window_days + 7` per row, not using a fixed threshold | Genie uses a fixed 7-day window instead of the per-visit `visit_window_days` column |
| **Tier 3** | Can the agent join 2-3 tables correctly and compute rates, ratios, or per-capita metrics? Must handle screen failure exclusion and denominator selection. | *"SAE rate per 100 enrolled patients by trial phase"* — join adverse_events → enrollments → trials, exclude screen failures, compute rate per 100 | Genie includes screen failures in the denominator, deflating rates by ~18% across all phases |
| **Tier 4** | Can the agent compare two groups across 3+ tables? Must split data into cohorts, compute separate metrics, and draw comparisons — without creating cartesian products. | *"Do patients on 3+ concomitant meds have more serious AEs?"* — join conmeds → enrollments → adverse_events, split into HIGH/LOW groups, compare SAE rates | Genie inflates patient counts by failing the LEFT JOIN, misses zero-conmed patients entirely |
| **Tier 5** | Can the agent combine structured SQL results with document corpus search? Must query the database AND search published literature, then synthesize both into one answer. | *"Which drugs in active trials have never appeared in any PubMed abstract?"* — join drugs → trials, then cross-reference against document search results | Genie finds only 18 drugs instead of 2,759 and fabricates drug names with contradictory properties |
| **Tier 6** | Can the agent produce a comprehensive executive report pulling numbers from every major table, with literature context? Must orchestrate 5+ queries and multiple searches. | *"Board-level portfolio summary with hard numbers across enrollment, safety, operations, regulatory, and research"* | Genie reports 100% enrollment rate (impossible), uniform 50% approval rates across all countries — numbers are obviously fabricated |

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

**Architecture:**
```
Cortex Agent
  ├── Cortex Analyst + Semantic View (cross-table facts, relationships, column descriptions)
  ├── Cortex Search — trial protocols (100K documents)
  ├── Cortex Search — FDA drug labels (28.7K documents)
  ├── Cortex Search — PubMed abstracts (45K documents)
  └── data_to_chart
```

The **semantic view** is the key differentiator — it defines cross-table relationships, derived metrics, and join paths that guide the agent to the correct SQL. The agent doesn't have to figure out how tables connect; the semantic view tells it.

### Databricks

**Architecture:**
```
Supervisor Agent
  ├── Genie Space (16 tables + 16 per-table metric views)
  └── Knowledge Assistant (document corpus in UC Volume)
```

**Key limitation:** Metric views are per-table only. Cannot express cross-table joins, composite metrics, or negation patterns. All cross-table reasoning depends on Genie's SQL generation, which fails on 3+ table joins.

### Configuration Parity

Both platforms have equivalent metadata where their architectures allow:

| Snowflake | Databricks Equivalent |
|---|---|
| Semantic view column descriptions | Metric view dimensions/measures + AI-generated metadata from Unity Catalog |
| Cortex Search (3 services) | Knowledge Assistant (1 index) |
| Agent instructions | Genie General Instructions (10 data rules) |

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

retail/
├── data/v2/                           # Compressed data files
│   ├── *.csv.gz                       # 12 gzipped CSV tables (~300MB total)
│   ├── docs_batched.tar.gz            # 200 batched .txt document files
│   └── ground_truth.json              # Computed ground truth for all 14 questions
└── setup/
    ├── sf_01_create_schema_v2.sql     # Snowflake DDL + CSV loading
    ├── sf_02_upload_docs.sql          # Document ingestion into DOC_DOCUMENT
    ├── sf_03_cortex_search.sql        # Cortex Search service creation
    ├── sf_04_agent_instructions.md    # Semantic view + agent setup guide
    ├── dbx_01_load_data.ipynb         # Databricks data loading notebook
    └── dbx_02_agent_setup.md          # Genie + Knowledge Assistant setup

BENCHMARK_PLAYBOOK.md                  # Project-specific playbook with results
BENCHMARK_PLAYBOOK_v2.html             # Generalized playbook for any SE (print to PDF)
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

1. Upload CSVs to a Unity Catalog volume
2. Run `setup/dbx_01_load_data.ipynb` to create tables
3. Add 16 metric views to Genie Space (YAML in `setup/dbx_02_agent_setup.md`)
4. Paste General Instructions into Genie Space (in `setup/dbx_02_agent_setup.md`)

### Retail Domain

#### Data

Decompress the retail data files:
```bash
cd retail/data/v2
gunzip *.csv.gz
# For fact_order_line (split into 2 parts):
# Concatenate parts: head -1 fact_order_line_part_aa.csv > fact_order_line.csv
# tail -n +2 fact_order_line_part_aa.csv >> fact_order_line.csv
# tail -n +2 fact_order_line_part_ab.csv >> fact_order_line.csv
tar xzf docs_batched.tar.gz
```

#### Snowflake
Run `retail/setup/sf_01` through `sf_04` SQL scripts in order, then apply structural gap DELETEs (see `retail/setup/sf_04_agent_instructions.md`).

#### Databricks
Run `retail/setup/dbx_01_load_data.ipynb`, then follow `retail/setup/dbx_02_agent_setup.md`. Apply the same structural gap DELETEs.

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
4. Results saved to Snowflake automatically
