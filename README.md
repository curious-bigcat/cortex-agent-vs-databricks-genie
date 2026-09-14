# ClinicalIQ -- AI Agent Benchmark

A head-to-head benchmark comparing **Snowflake Cortex Agent** vs **Databricks Supervisor Agent** on clinical trial analytics. Tests both platforms' ability to handle structured SQL queries, unstructured document search, and hybrid orchestration across real pharmaceutical data.

## Why This Benchmark

Enterprise AI agents are moving beyond simple chatbots. Both Snowflake and Databricks now offer multi-tool AI agents that can query structured data via text-to-SQL AND search unstructured documents via RAG -- then orchestrate between them to answer complex business questions.

But how well do they actually work? Marketing demos use cherry-picked questions on clean data. This benchmark uses **messy, realistic data with embedded traps** that test whether the agent truly understands the data model or just pattern-matches SQL.

**The core question:** When a VP of Clinical Operations asks a complex question that spans structured trial data and published medical literature, which platform gives the more accurate, trustworthy, and actionable answer?

## The Scenario

**ClinicalIQ Asia** is a fictional Contract Research Organization (CRO) managing clinical trials across 5 APAC countries (Japan, South Korea, Singapore, Australia, India). The VP of Data Intelligence needs answers that combine:

- **Operational metrics** from internal trial databases (enrollments, adverse events, budgets, site performance)
- **Published evidence** from ClinicalTrials.gov protocols, FDA drug labels, and PubMed research abstracts

Neither source alone gives the full picture. The agent must orchestrate between structured SQL and document search to deliver complete answers.

## Data Design

### Structured Data (Synthetic, 11.8M rows)

16 interconnected tables modeling a realistic clinical trial operation:

| Category | Tables | Rows | Key Complexity |
|----------|--------|------|----------------|
| Organizations | sponsors, sites, investigators, drugs | 10.5K | Drug name 3-way ambiguity (trade/generic/molecule) |
| Trial Management | trials, trial_arms, enrollments, visits | 3M | Enrollment rate must be derived (no column), visit window per-visit |
| Clinical Data | lab_results, adverse_events, conmeds, vital_signs | 8.4M | Serious != severe (different columns), AE grain (events vs patients) |
| Operations | regulatory, deviations, milestones, budgets | 345K | NULL actuals in budgets, country_cd in 4 tables |

The data is **synthetic but structurally realistic** -- generated with the same distributions, cardinalities, and join patterns as real clinical trial databases. Data traps are embedded by design.

### Unstructured Documents (Real Public Data, 173K documents)

| Source | Documents | Avg Size | Content |
|--------|-----------|----------|---------|
| ClinicalTrials.gov | 100,032 | 4.5 KB | Trial protocols, eligibility criteria, study designs, endpoints |
| DailyMed (FDA) | 28,704 | 441 B | Drug labels, warnings, interactions, contraindications |
| PubMed | 44,963 | 2.1 KB | Research abstracts, clinical evidence, treatment outcomes |

All documents are **real public data** downloaded via official APIs -- not synthetic. This means document search questions have genuine, verifiable answers grounded in actual medical literature.

### The Gap Between Structured and Unstructured

A key design choice: the structured tables use **synthetic drug names** (Nivolib, Pembrotinib XR) while the documents contain **real drug names** (pembrolizumab/Keytruda, metformin). Hybrid questions that cross-reference both sources test whether the agent can bridge this gap or blindly tries to join on names that don't match.

## Testing Approach

### Every Question Is Hybrid

All 30 benchmark questions require BOTH structured data + document search. There are no pure-SQL or pure-search questions. This forces both platforms to orchestrate on every single question -- the core differentiator.

Questions are unlabeled -- they don't hint which tools to use. The agent must decide whether to query the database, search documents, or both.

### Embedded Data Traps

Each question embeds 1-6 data traps drawn from real-world clinical data challenges. These aren't trick questions -- they're patterns that cause wrong answers in production if the agent doesn't understand the data model:

- **Enrollment rate derivation**: No enrollment_rate column exists. Must compute from enroll_dt IS NOT NULL / total screened.
- **Serious vs Severe**: seriousness='SERIOUS' (regulatory consequence) != severity='SEVERE' (clinical intensity). Using the wrong column gives 19.9% instead of 25.1%.
- **NULL budget trap**: SUM(actual_usd) vs SUM(planned_usd) gives -19% "under budget" if NULLs aren't filtered. Correct answer is +6.1% over budget.
- **AE grain**: Counting AE events (40,131) vs counting patients-with-AEs (37,708) gives different rankings.
- **Visit window**: Each visit has its own visit_window_days. Using a fixed window gives wrong compliance rates.

### Difficulty Tiers

| Tier | Questions | What It Tests |
|------|-----------|---------------|
| 3 (Warm-up) | Q01-Q06 | Multi-table join + basic document search |
| 4 (Single trap) | Q07-Q14 | Data trap + targeted document retrieval |
| 5 (Multi-step) | Q15-Q24 | Subquery/CTE patterns + cross-tool chaining |
| 6 (Synthesis) | Q25-Q30 | Composite metrics + multi-source executive analysis |

### Scoring

An AI judge (Cortex AI_COMPLETE with claude-sonnet-4-6) scores each platform's output on 6 dimensions (1-5 each, max 30):

1. **Accuracy** -- are the numbers correct?
2. **Groundedness** -- grounded in data/documents, not hallucinated?
3. **Relevance** -- addresses the question asked?
4. **Usefulness** -- actionable and well-formatted?
5. **Correctness** -- methodology correct, traps avoided?
6. **Decision Consequences** -- safe for a VP to act on this answer?

The consequences dimension is weighted heavily in interpretation -- a numerically wrong answer that a board member acts on is worse than a correct answer that's poorly formatted.

## The Benchmark

**30 hybrid questions** -- every question requires both structured data analysis AND document search. No labels hint which tools to use. The agent must figure out the orchestration itself.

Questions are designed around known failure patterns:

| Pattern | Description | Example |
|---------|-------------|---------|
| Multi-hop joins | 3-5 table join chains | Site -> Trial -> Arm -> Drug -> Regulatory |
| Derived metrics | No column exists, must compute | Enrollment rate = COUNT(enroll_dt) / COUNT(*) |
| Serious vs Severe | Different regulatory columns | seriousness='SERIOUS' != severity='SEVERE' |
| NULL traps | Budget with NULL actuals | Must filter NULLs before aggregation, not after |
| Negation/exclusion | NOT EXISTS, IS NULL patterns | "Which investigators have ZERO serious AEs?" |
| AE grain | Events vs patients | 40K events but only 37K distinct patients |
| Visit window | Per-visit window derivation | ABS(actual - scheduled) <= visit_window_days |
| Cross-tool synthesis | Structured result feeds document search | "Find top AE from data, then search literature about it" |

## Data

**PHARMA_BENCHMARK_DB.CLINICAL** in Snowflake:

| Layer | Content | Volume |
|-------|---------|--------|
| Structured | 16 tables (sponsors, sites, drugs, trials, enrollments, visits, lab results, AEs, conmeds, vital signs, regulatory, deviations, milestones, budgets) | 11.8M rows |
| Documents | ClinicalTrials.gov study protocols | 100,032 |
| Documents | DailyMed FDA drug labels | 28,704 |
| Documents | PubMed research abstracts | 44,963 |
| **Total** | | **11.8M rows + 173K documents** |

All documents are real public data downloaded from ClinicalTrials.gov API v2, DailyMed JSON API, and PubMed E-utilities.

## Architecture

### Snowflake

```
CLINICALIQ_AGENT (Cortex Agent)
  |-- clinical_analytics (Cortex Analyst + Semantic View)
  |-- trial_search (Cortex Search -- 100K trials)
  |-- drug_label_search (Cortex Search -- 28.7K labels)
  |-- pubmed_search (Cortex Search -- 45K abstracts)
  |-- data_to_chart
```

### Databricks

```
Supervisor Agent
  |-- ClinicalIQ Structured (Genie Agent -- 16 tables)
  |-- ClinicalIQ Documents (Knowledge Assistant -- UC Volume with .txt files)
```

## Project Structure

```
pharma/
|-- setup/                          # All setup scripts (Snowflake + Databricks)
|   |-- sf_01_create_schema.sql       # Snowflake DDL (17 tables + 2 stages)
|   |-- sf_02_create_agent.sql        # Creates Cortex Search services + Agent
|   |-- dbx_01_load_data.ipynb         # Databricks data loading notebook (creates tables + loads data)
|   |-- dbx_02_agent_setup.md          # Genie + Knowledge Assistant + Supervisor setup
|
|-- questions/
|   |-- benchmark_questions.md      # 30 hybrid questions with expected answers and rubrics
|
|-- evaluator/                      # Benchmark Evaluator SAR App (Next.js)
    |-- app/
    |   |-- page.tsx                # Main evaluator UI
    |   |-- api/questions/route.ts  # Loads Q01-Q30 from TBL_EXPECTED_ANSWERS
    |   |-- api/score/route.ts      # AI scoring via Cortex AI_COMPLETE
    |   |-- api/results/route.ts    # Saved benchmark results
    |-- components/
    |   |-- evaluator.tsx           # Question selector, output panels, score comparison
    |-- lib/
        |-- snowflake.ts            # SPCS OAuth connection handling
        |-- constants.ts            # App config (model, database)
```

## Evaluator App

A Snowflake App Runtime (SAR) Next.js app deployed at the account's app URL.

**Features:**
- Dropdown of 30 benchmark questions loaded from Snowflake
- Side-by-side paste panels for Snowflake and Databricks agent outputs
- Screenshot paste support (Ctrl+V) for visual evidence
- AI scoring via Cortex AI_COMPLETE (claude-sonnet-4-6) on 6 dimensions
- Score comparison table with color-coded deltas
- Decision consequences detail for each scoring
- Results persisted to TBL_BENCHMARK_RESULTS

**Scoring dimensions (1-5 each, max 30):**
1. Accuracy -- are the numbers correct?
2. Groundedness -- grounded in data/documents, not hallucinated?
3. Relevance -- addresses the question asked?
4. Usefulness -- actionable and well-formatted?
5. Correctness -- methodology correct, traps avoided?
6. Decision Consequences -- safe to act on this answer?

## Setup

### Snowflake (data already loaded)

```sql
-- Database: PHARMA_BENCHMARK_DB.CLINICAL
-- 16 structured tables + TBL_DOCUMENT (173K docs with parsed_text)
-- 3 Cortex Search services: TRIAL_SEARCH, DRUG_LABEL_SEARCH, PUBMED_SEARCH
-- Semantic View: CLINICAL_ANALYST (created via Snowsight autopilot)
-- Agent: CLINICALIQ_AGENT
-- Tables: TBL_EXPECTED_ANSWERS (30 rows), TBL_BENCHMARK_RESULTS
```

### Databricks

1. Load data using `setup/dbx_01_load_data.ipynb`
2. Upload combined docs to UC Volume for Knowledge Assistant
3. Follow `setup/dbx_02_agent_setup.md` for:
   - Part 1: Genie Agent (structured)
   - Part 2: Knowledge Assistant (documents)
   - Part 3: Supervisor Agent (orchestrator)

### Evaluator App

```bash
cd pharma/evaluator
npm install
snow app deploy --entity-id="clinicaliq_evaluator"
```

## Running the Benchmark

1. Open both agents: Snowflake (Snowsight Agent page) and Databricks (Supervisor Agent)
2. Open the Evaluator app
3. For each question Q01-Q30:
   - Ask the question in both platforms
   - Copy/paste each output into the Evaluator
   - Click "Score Both Platforms"
4. Results saved automatically to TBL_BENCHMARK_RESULTS

## Embedded Data Traps

The synthetic structured data contains deliberate traps that test SQL precision:

| Trap | What goes wrong | Correct approach |
|------|----------------|-----------------|
| Enrollment rate | Agent looks for enrollment_rate column | Derive: COUNT(enroll_dt IS NOT NULL) / COUNT(*) |
| Serious vs Severe | Agent uses severity='SEVERE' | Must use seriousness='SERIOUS' (different concept) |
| Visit window | Agent uses fixed 3-day window | Must use per-visit visit_window_days column |
| AE grain | Counts AE events instead of patients | Must use COUNT(DISTINCT enrollment_id) |
| NULL budget | SUM includes NULL actuals vs planned | Filter WHERE actual_usd IS NOT NULL before SUM |
| Drug name 3-way | Searches only drug_name | Must check drug_name, generic_name, molecule_name |
| Country ambiguity | Uses sponsor country_cd | Must use enrollment.country_cd for patient location |
| Arm fan-out | JOIN through arms creates duplicates | Must aggregate at enrollment level with DISTINCT |
| Conmed stacking | JOIN conmeds creates cartesian product | Aggregate conmed count per patient first |
