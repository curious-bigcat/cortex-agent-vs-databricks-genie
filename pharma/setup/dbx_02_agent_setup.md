# ============================================================
# Databricks Agent Setup — Genie + Knowledge Base + Supervisor
# ClinicalIQ Asia Benchmark
# ============================================================

## Overview

This document covers the full Databricks agent setup equivalent to
Snowflake's CLINICALIQ_AGENT. The architecture has 3 layers:

1. **Genie Agent** — Structured SQL queries over 16 clinical trial tables (≈ Cortex Analyst)
2. **Knowledge Assistant** — RAG over 173K documents via AI Search (≈ Cortex Search)
3. **Supervisor Agent** — Orchestrates Genie + Knowledge Assistant + tools (≈ Cortex Agent)

| Snowflake Component | Databricks Equivalent |
|---|---|
| Cortex Analyst (semantic view) | Genie Agent (table instructions) |
| Cortex Search (3 services) | Knowledge Assistant (AI Search index) |
| Cortex Agent (orchestrator) | Supervisor Agent |
| data_to_chart | Code execution (built-in) |

## Prerequisites

1. Unity Catalog tables loaded via `02_dbx_load_clinical.ipynb`
2. SQL Warehouse running (Serverless or Pro)
3. AI Search endpoint available (Serverless)
4. Agent Bricks enabled on workspace

## Step-by-Step Setup

---

## PART 1: Genie Agent (Structured Data)

### 1.1 Create Genie Agent

In Databricks Workspace:
- Navigate to: **Agents** → **Create Agent** → **Genie Agent**
- Name: `ClinicalIQ Structured`
- Description: `Structured clinical trial data analytics — 16 tables, 11.8M rows across 5 APAC countries`
- SQL Warehouse: Select your serverless warehouse

### 1.2 Add Tables

Add ALL of these tables from `<YOUR_CATALOG>`.clinical:

**Core Entities:**
- `tbl_sponsor` — Pharmaceutical companies sponsoring trials
- `tbl_site` — Hospital/clinic trial sites across 5 APAC countries
- `tbl_investigator` — Principal investigators (doctors running trials)
- `tbl_drug` — Drug catalog with trade name, generic name, and molecule name

**Trial Management:**
- `tbl_trial` — Clinical trials with phase, status, therapeutic area
- `tbl_trial_arm` — Treatment arms (drug vs placebo groups)
- `tbl_enrollment` — Patient enrollments (screen date, enroll date, status)
- `tbl_visit` — Patient visit schedule and actuals

**Clinical Data:**
- `tbl_lab_result` — Lab test results (5M rows, multiple per visit)
- `tbl_adverse_event` — Adverse events / side effects (800K rows)
- `tbl_conmed` — Concomitant medications patients take
- `tbl_vital_sign` — Blood pressure, heart rate, temperature per visit

**Regulatory & Operations:**
- `tbl_regulatory_submission` — Drug approval filings by country
- `tbl_protocol_deviation` — Protocol violations at sites
- `tbl_milestone` — Trial milestone tracking
- `tbl_budget` — Trial budget planned vs actual

**Document Metadata:**
- `tbl_document` — 173.7K public documents with metadata + full text (parsed_text column)

### 1.3 General Instructions

Paste this into the Genie Space "General Instructions" field:

```
You are the data analytics assistant for ClinicalIQ Asia, a Contract Research
Organization managing clinical trials across Japan (JP), South Korea (KR),
Singapore (SG), Australia (AU), and India (IN).

CRITICAL DATA RULES — follow these to avoid common errors:

1. ENROLLMENT RATE: There is NO enrollment_rate column. Derive it as:
   COUNT(CASE WHEN enroll_dt IS NOT NULL THEN 1 END) / COUNT(*)
   from tbl_enrollment. Screen failures have enroll_dt = NULL.

2. DRUG NAME TRAP: Each drug has 3 names in tbl_drug — drug_name (brand),
   generic_name, and molecule_name. The same drug may be referenced by
   any of these names. Always search all three when matching.

3. VISIT WINDOW: A visit is "on-time" when
   ABS(DATEDIFF(actual_dt, scheduled_dt)) <= visit_window_days.
   There is no on_time flag — you must calculate it.

4. ADVERSE EVENT GRAIN: tbl_adverse_event has MULTIPLE rows per patient.
   "AE rate" can mean total AE count / patients, OR patients-with-AE / patients.
   These are very different numbers. Always clarify which you're computing.

5. SERIOUS vs SEVERE: These are DIFFERENT regulatory concepts.
   Serious = seriousness column = 'SERIOUS' (requires reporting to regulators).
   Severe = severity column = 'SEVERE' (clinical intensity).
   A mild AE can be serious (e.g., mild rash requiring hospitalization).
   Never confuse these.

6. LAB RESULT GRAIN: tbl_lab_result has ~5M rows — multiple tests per visit
   per patient. Always filter by test_name (e.g., 'ALT', 'Hemoglobin').

7. TRIAL STATUS: "Active trials" is ambiguous:
   - status = 'ACTIVE' means dosing is ongoing
   - status = 'RECRUITING' means still enrolling
   - Both? Ask the user or state your assumption.

8. MULTI-ARM FAN-OUT: Trials have 2-4 arms in tbl_trial_arm. Joining
   drugs → arms → enrollments can fan out. Use DISTINCT or aggregate.

9. CONMED STACKING: Patients take 1-5+ concomitant medications.
   Joining conmeds to adverse events creates cartesian product risk.

10. COUNTRY COLUMN: country_cd appears on tbl_site, tbl_enrollment,
    tbl_sponsor, tbl_investigator. Use the one appropriate for context:
    - "Trials in Japan" → tbl_enrollment.country_cd (where patients enrolled)
    - "Japanese sponsors" → tbl_sponsor.country_cd

When presenting results:
- Always include trial phase and therapeutic area context
- Explain your methodology for derived metrics
- Flag any data quality concerns or ambiguities
- Provide actionable recommendations
```

### 1.4 Table Descriptions

Add these descriptions per table in the Genie Space configuration:

| Table | Description |
|-------|-------------|
| tbl_sponsor | 500 pharma companies. sponsor_name is NOT unique — same company may appear with slightly different names. |
| tbl_site | 2,000 trial sites across JP, KR, SG, AU, IN. quality_score is 1.0-5.0 from latest audit. |
| tbl_drug | 3,000 drugs. IMPORTANT: Three name columns — drug_name (brand), generic_name, molecule_name. Same drug, three different identifiers. |
| tbl_trial | 10,000 trials. actual_enrollment may differ from target_enrollment. status values: RECRUITING, ACTIVE, COMPLETED, TERMINATED, SUSPENDED, WITHDRAWN. |
| tbl_enrollment | 500K enrollments. enroll_dt = NULL means screen failure. ENROLLMENT RATE must be derived from this. |
| tbl_visit | 3M visits. visit_window_days defines ±N days for on-time compliance. Must compute on-time from actual_dt vs scheduled_dt. |
| tbl_lab_result | 5M lab results. MULTIPLE rows per visit (one per test). Filter by test_name for specific analyses. |
| tbl_adverse_event | 800K AEs. seriousness (SERIOUS/NON_SERIOUS) != severity (MILD/MODERATE/SEVERE). causality indicates drug relatedness. |
| tbl_conmed | 600K concomitant medications. Multiple per patient — creates fan-out risk when joining to AE table. |
| tbl_vital_sign | 2M vital signs. Multiple measures per visit (BP, HR, temp, weight, SPO2). |
| tbl_protocol_deviation | 200K deviations. severity: MINOR/MAJOR/CRITICAL. Rate = deviations / patients per site. |
| tbl_milestone | 80K milestones. delay_days = actual - planned. status: ON_TRACK, DELAYED, COMPLETED, AT_RISK. |
| tbl_budget | 50K budget items. Overrun = actual_usd - planned_usd. actual_usd NULL = not yet incurred. |
| tbl_document | 173.7K documents (100K ClinicalTrials.gov + 45K PubMed + 28.7K DailyMed). Filter by doc_source. parsed_text has full text. |

### 1.5 Sample Questions

Add these to the Genie Space:
1. "What is the enrollment rate for our Phase 3 oncology trials?"
2. "Which sites have the highest protocol deviation rate?"
3. "What is the serious adverse event rate across all our trials?"
4. "Show me the top 10 drugs by number of active trials"
5. "What is the budget overrun by therapeutic area?"

---

## PART 2: Knowledge Assistant (Unstructured Documents)

The Knowledge Assistant provides RAG over the 173K clinical documents,
equivalent to Snowflake's 3 Cortex Search services. Point it directly at
.txt files in a UC Volume — it handles chunking, embedding, and search automatically.

### 2.1 Create a Volume and Upload Documents

The 173K individual .txt files have been merged into ~870 combined files
(200 docs/file) using `09_combine_docs.py` for easier upload. Each combined
file uses `===== DOCUMENT: <filename> =====` separators.

```python
%python
# Create volume for clinical documents
spark.sql("CREATE VOLUME IF NOT EXISTS `<YOUR_CATALOG>`.clinical.clinical_documents")

volume_path = "/Volumes/<YOUR_CATALOG>/clinical/clinical_documents"

# Upload combined .txt files from Azure blob storage
for source in ["clinicaltrials", "pubmed", "dailymed"]:
    blob_path = f"abfss://data@<YOUR_STORAGE_ACCOUNT>.dfs.core.windows.net/clinical/docs_combined/{source}"
    count = 0
    for f in dbutils.fs.ls(blob_path):
        if f.name.endswith('.txt'):
            dbutils.fs.cp(f.path, f"{volume_path}/{source}/{f.name}")
            count += 1
    print(f"{source}: {count} combined files uploaded")
```

### 2.2 Create Knowledge Assistant

In Databricks Workspace:
- Navigate to: **Agents** → **Create Agent** → **Knowledge Assistant**
- Name: `ClinicalIQ Documents`
- Knowledge source: **Unity Catalog files**
  - Source: `<YOUR_CATALOG>.clinical.clinical_documents` (the volume)
  - Name: `Clinical Documents`
  - Description: `173K clinical documents — 100K ClinicalTrials.gov study protocols, 28.7K DailyMed FDA drug labels, 45K PubMed research abstracts`

### 2.3 Knowledge Assistant Instructions

Paste this into the Instructions field:

```
You are a clinical document search assistant for ClinicalIQ Asia.
You search across 3 document collections:

1. ClinicalTrials.gov (100K studies) — trial protocols, eligibility criteria, endpoints, study designs
2. DailyMed FDA Drug Labels (28.7K) — dosing, warnings, interactions, contraindications, adverse reactions
3. PubMed Abstracts (45K) — published research, clinical evidence, treatment outcomes

When answering:
- Cite specific document titles and IDs (NCT numbers, PMIDs, DailyMed SET IDs)
- Distinguish between document sources (trial protocol vs drug label vs research)
- For drug safety questions, prioritize FDA drug label content
- For trial design questions, prioritize ClinicalTrials.gov content
- For evidence/research questions, prioritize PubMed content
- Synthesize across multiple documents when the question spans sources
```

Test with: "What are the known drug interactions for pembrolizumab?"
Note the Knowledge Assistant ID for the Supervisor setup.

---

## PART 3: Supervisor Agent (Orchestrator)

The Supervisor Agent coordinates the Genie Agent (structured) and
Knowledge Assistant (unstructured), equivalent to Snowflake's CLINICALIQ_AGENT.

### 3.1 Create Supervisor Agent

In Databricks Workspace:
- Navigate to: **Agents** → **Create Agent** → **Supervisor Agent**
- Name: `ClinicalIQ Asia`
- Description: `Clinical trial operations and drug intelligence agent for ClinicalIQ Asia CRO. Combines structured data analytics with 173K real public clinical documents.`

### 3.2 Add Tools / Sub-agents

In the **Tools and sub-agents** panel, add:

| Tool | Type | Description to provide |
|---|---|---|
| ClinicalIQ Structured | Genie Agent | `Query structured clinical trial data: 16 tables with 11.8M rows covering sponsors, sites, investigators, drugs, trials, enrollments, visits, lab results, adverse events, concomitant meds, vital signs, regulatory submissions, protocol deviations, milestones, and budgets across Japan, South Korea, Singapore, Australia, and India. Use for questions about trial metrics, patient safety rates, site performance, drug pipeline status, and financial data.` |
| ClinicalIQ Documents | Knowledge Assistant | `Search 173K real public clinical documents from ClinicalTrials.gov (100K trial protocols), DailyMed (28.7K FDA drug labels), and PubMed (45K research abstracts). Use for questions about published trial designs, drug warnings and interactions, eligibility criteria, and published research evidence.` |

### 3.3 Supervisor Instructions

Paste this into the **Instructions** field:

```
You are the AI analytics assistant for ClinicalIQ Asia, a Contract Research
Organization (CRO) managing clinical trials across Japan (JP), South Korea (KR),
Singapore (SG), Australia (AU), and India (IN). The user is the VP of Data
Intelligence overseeing trial operations, patient safety, drug pipeline analytics,
and regulatory compliance.

You have two specialized sub-agents:

1. ClinicalIQ Structured (Genie) — for querying structured clinical trial data
   (enrollments, adverse events, lab results, visits, budgets, etc.)
2. ClinicalIQ Documents (Knowledge Assistant) — for searching published clinical
   documents (trial protocols, FDA drug labels, PubMed research abstracts)

Routing guidelines:
- STRUCTURED questions (metrics, counts, rates, trends) → use Genie
- DOCUMENT questions (drug interactions, eligibility criteria, research evidence) → use Knowledge Assistant
- HYBRID questions (combine trial metrics with published evidence) → use BOTH tools
  Example: "Compare our AE rates for pembrolizumab against the FDA drug label warnings"
  → Query AEs from Genie + search drug label from Knowledge Assistant

CRITICAL DATA RULES (pass to Genie when relevant):
1. Enrollment Rate: Derive from enroll_dt IS NOT NULL / total in tbl_enrollment
2. Drug Name Trap: 3 names per drug — drug_name, generic_name, molecule_name
3. Serious ≠ Severe: seriousness='SERIOUS' vs severity='SEVERE' are different
4. Visit Window: On-time = ABS(actual_dt - scheduled_dt) <= visit_window_days
5. AE Grain: Count AEs vs count patients-with-AEs — always clarify

Be concise and data-driven. Format numbers clearly. Use tables for multi-row results.
Always cite which sub-agent provided the data.
```

### 3.4 Test the Supervisor

Test with these questions to verify routing:

| Question | Expected routing |
|---|---|
| "What is the enrollment rate for Phase 3 oncology trials?" | Genie only |
| "What are the known drug interactions for pembrolizumab?" | Knowledge Assistant only |
| "Compare our AE rates for immunotherapy drugs against their FDA label warnings" | Both (hybrid) |
| "Which sites have the highest protocol deviation rate?" | Genie only |
| "Search for recent research on CAR-T cell therapy" | Knowledge Assistant only |

### 3.5 Manage Permissions

- Click kebab menu → **Manage permissions**
- Grant **CAN QUERY** to benchmark test users
- Ensure users also have access to the underlying Genie Agent and Knowledge Assistant

---

## Capability Comparison

| Capability | Snowflake Cortex Agent | Databricks Supervisor Agent |
|---|---|---|
| Structured SQL | Cortex Analyst (semantic view) | Genie Agent (table instructions) |
| Unstructured search | Cortex Search (3 dedicated services) | Knowledge Assistant (1 AI Search index) |
| Document RAG | 173.7K docs indexed with arctic-embed | 173.7K docs indexed with gte-large-en |
| Hybrid queries | Single agent, multi-tool in one turn | Supervisor orchestrates sub-agents |
| Chart generation | data_to_chart tool | Code execution (built-in Python) |
| Setup complexity | SQL DDL (CREATE AGENT, CREATE CORTEX SEARCH) | UI-driven (Agents page) |
| Orchestration | Built-in tool routing | Supervisor pattern with feedback loop |

## Benchmark Scoring Approach

- **S01-S30 (Structured):** Score on BOTH platforms — Genie vs Cortex Analyst
- **U01-U15 (Unstructured):** Score on BOTH platforms — Knowledge Assistant vs Cortex Search
- **H01-H15 (Hybrid):** Score on BOTH platforms — Supervisor Agent vs Cortex Agent
- Report per-dimension scores (Accuracy, Groundedness, Relevance, Usefulness, Correctness, Decision Consequences)
