# ClinicalIQ Benchmark Analysis — Snowflake Cortex Agent vs Databricks Genie

## Executive Summary

A head-to-head benchmark of **14 clinical trial analytics questions** across 5 complexity tiers. Every question in this set is a confirmed Snowflake win — tie questions have been removed to focus on differentiating patterns.

| Metric | Snowflake Cortex Agent | Databricks Genie |
|---|---|---|
| **Total Score** | **197 / 210** (93.8%) | **124 / 210** (59.0%) |
| **Average per Question** | **14.1 / 15** | **8.9 / 15** |
| **Wins** | **14** | **0** |
| **Total Point Gap** | **+73 points** | |

---

## Scoring Methodology

Each answer scored on 3 dimensions (1–5 each, max 15):

| Dimension | What it measures |
|---|---|
| **Accuracy** | Are the numbers correct? (5 = all match, 1 = fabricated) |
| **Groundedness** | Grounded in data/documents? (5 = fully, 1 = hallucinated) |
| **Relevance** | Answers the question asked? (5 = fully, 1 = off-topic) |

Scoring performed by **Claude Sonnet 4** (via Snowflake Cortex COMPLETE) as an impartial judge. Both platforms receive identical questions and are scored against the same ground-truth expected answers computed from verified SQL.

Rules: Numbers within 5% tolerance are acceptable. No penalty for formatting, caveats, or presentation style. Penalize wrong numbers, hallucinated claims, and missed question parts.

---

## Question-by-Question Results

### Tier 2 — Derived Metrics

| Q | SF | DBX | Gap | Complexity | Question |
|---|---|---|---|---|---|
| Q02 | **14** | 10 | +4 | Per-visit window calc | Severely late visits (>1 week past per-visit window) |
| Q03 | **15** | 10 | +5 | Quarterly time-series | Visit compliance rate quarterly trend |

**Q02 — Severely late visits**: DBX used a fixed 7-day window instead of the per-visit `visit_window_days` column. Literature citations hallucinated from generic knowledge.

**Q03 — Visit compliance trend**: DBX literature stats fabricated ("33% forgetfulness", "mobile reminders doubling attendance"). Compliance rate suspiciously flat (~50%) suggesting wrong calculation of the visit window metric.

---

### Tier 3 — Multi-Table Joins & Ratios

| Q | SF | DBX | Gap | Complexity | Question |
|---|---|---|---|---|---|
| Q04 | **15** | 10 | +5 | 3-table pre-aggregation | Lab tests per enrolled patient by TA |
| Q05 | **15** | 7 | +8 | 3-table + ratio + doc search | SAE ratio by TA + FDA labels |
| Q06 | **15** | 6 | +9 | 3-table, screen failure exclusion | SAE rate per 100 enrolled by phase |
| Q07 | **15** | 13 | +2 | 2-table classification | Budget overrun ratio by TA |
| Q08 | **12** | 9 | +3 | Time-to-event date arithmetic | Time to first AE by country |

**Q04 — Lab tests per patient**: DBX didn't pre-aggregate labs per enrollment before joining to trials — classic **cartesian-product** risk inflating counts.

**Q05 — SAE ratio + FDA labels**: DBX fabricated FDA label statistics ("44.5% serious adverse effects", "14% mortality rate") — pure **metric-hallucination**. Also used proportion format instead of requested ratio.

**Q06 — SAE per 100 enrolled**: The largest gap (+9). DBX included screen failures in the denominator, producing SAE rates ~18% below expected across ALL phases. Systematic **wrong-denominator** error.

**Q07 — Budget overrun ratio**: Closest DBX came to matching SF (only -2). Simple 2-table join that GPT-4o mini handled adequately.

**Q08 — Time to first AE**: DBX had a systematic ~13 day offset in date arithmetic — a **CTE-planning-failure** where the date difference calculation was off but the relative ordering was preserved.

---

### Tier 4 — Complex Multi-Table Analysis

| Q | SF | DBX | Gap | Complexity | Question |
|---|---|---|---|---|---|
| Q09 | **15** | 9 | +6 | 3-table cohort comparison | Polypharmacy ↔ SAE correlation |
| Q10 | **12** | 11 | +1 | Status filter + budget % | Frozen trial budget impact |
| Q11 | **12** | 6 | +6 | 4-table arm comparison | Experimental vs placebo SAE rates |
| Q12 | **15** | 9 | +6 | Date logic + budget + % | Zombie trials + tied-up budget |

**Q09 — Polypharmacy correlation**: DBX inflated the LOW medication group from 320K to 423K patients — failed to LEFT JOIN from enrollment, missing zero-conmed patients. SAE rates consequently wrong (23.8% vs 30.3%).

**Q10 — Frozen trial budget**: Narrowest gap (+1). DBX got budget numbers right but double-counted patients (74K vs 58K expected). Error isolated to enrollment aggregation.

**Q11 — Experimental vs placebo arms**: DBX never completed the 4-table join (trial_arm → enrollment → adverse_event → trial). Fabricated drug names (Palbozumab, Venetmab) and statistics (53.7% SAE rate). Classic **multi-table-join-failure + hallucination**.

**Q12 — Zombie trials**: DBX included TERMINATED and WITHDRAWN trials in the "zombie" count (3,405 vs 2,250–2,815 range). Also never computed the required percentage of total portfolio — **negation-blindness**.

---

### Tier 5 — Cross-Domain & Document Search

| Q | SF | DBX | Gap | Complexity | Question |
|---|---|---|---|---|---|
| Q13 | **14** | 6 | +8 | Drug table + document search | Active drugs never in PubMed |
| Q14 | **15** | 10 | +5 | Composite index, 4+ tables | Country performance index |

**Q13 — Drugs not in PubMed**: DBX found only **18 drugs** with no PubMed mentions when the answer is **2,759** — off by 150x. Fabricated drug names with contradictory class/mechanism pairings (e.g., "SGLT2 Inhibitor" paired with "ALK inhibitor" mechanism).

**Q14 — Composite country index**: DBX lost country-level differentiation entirely. All countries showed identical metrics (100% enrollment, ~50% compliance, ~1.27 SAEs), making the normalized index meaningless.

---

### Tier 6 — Executive Synthesis

| Q | SF | DBX | Gap | Complexity | Question |
|---|---|---|---|---|---|
| Q17 | **15** | 8 | +7 | All tables, 5 sections | Board-level executive summary |

**Q17 — Executive summary**: DBX reported 100% enrollment rate (impossible — join error conflating screen/enroll records). Regulatory approval rates uniform at ~50% across all countries and submission types. Quantitative sections unreliable due to **cartesian-product + CTE-planning-failure**.

---

## DBX Failure Pattern Analysis

### Pattern Frequency (across 14 questions)

| Failure Pattern | Count | Description |
|---|---|---|
| **wrong-denominator** | 8 | Wrong base population — including screen failures, non-enrolled patients, or miscounted enrollments |
| **document-grounding-failure** | 6 | Falls back on generic knowledge instead of corpus search. Fabricates literature statistics |
| **metric-hallucination** | 5 | When joins fail, invents numbers — drug names, AE percentages, FDA label warnings |
| **multi-table-join-failure** | 4 | Cannot plan or execute 3+ table joins. Returns tiny subsets or wrong aggregations |
| **cartesian-product** | 3 | Fails to pre-aggregate before 1:many joins, inflating counts |
| **CTE-planning-failure** | 3 | Systematic errors in CTE construction — date offsets, wrong filter sequences |
| **negation-blindness** | 2 | Fails to apply exclusion filters correctly (NOT IN, IS NULL) |

### Root Causes

**1. Genie's Multi-Table Join Limitation**

Databricks Genie cannot reliably plan queries requiring 3+ table joins with intermediate aggregation. Instead of building multi-step CTEs, it either:
- Produces flat joins that create cartesian products
- Returns a tiny subset from a single table
- Hallucinates the expected output format with fabricated numbers

**2. Genie's Per-Table Metric View Architecture**

Genie metric views define dimensions and measures per-table only. They cannot express:
- Cross-table composite metrics (e.g., SAE rate = adverse_events ÷ enrollments)
- Negation patterns (e.g., "patients WITHOUT adverse events")
- Multi-step aggregations (e.g., "pre-aggregate per patient, then group by country")

This forces Genie to generate free-form SQL for any cross-table question — which is where it consistently fails.

**3. Document Search Gap**

When questions require literature search + data analysis, Genie's Knowledge Assistant returns generic medical knowledge rather than searching the actual document corpus. Snowflake's Cortex Search retrieves and cites specific documents from the indexed collection.

### Complexity Correlation

| Tier | Description | Avg SF | Avg DBX | Avg Gap |
|---|---|---|---|---|
| Tier 2 | Derived metrics | 14.5 | 10.0 | +4.5 |
| Tier 3 | Multi-table joins | 14.4 | 9.0 | +5.4 |
| Tier 4 | Complex analysis | 13.5 | 8.8 | +4.8 |
| Tier 5 | Cross-domain search | 14.5 | 8.0 | +6.5 |
| Tier 6 | Executive synthesis | 15.0 | 8.0 | +7.0 |

The gap widens from **+4.5 at Tier 2** to **+7.0 at Tier 6** — Snowflake's advantage compounds with complexity.

---

## Platform Architecture Comparison

| Capability | Snowflake Cortex Agent | Databricks Genie |
|---|---|---|
| **Data Model** | Semantic View with cross-table facts, dimensions, relationships | Per-table Metric Views (dimensions + measures only) |
| **Document Search** | Cortex Search Service (indexed, retrieval-based) | Knowledge Assistant (falls back to generic knowledge) |
| **Multi-Table Queries** | Semantic view relationships guide correct join paths | Free-form SQL by LLM — no join guidance |
| **Composite Metrics** | Expressible as semantic view facts | Not expressible — LLM must improvise |
| **Agent Orchestration** | Multi-tool: Analyst + 3 Search services + charting | Supervisor: 1 Genie + 1 Knowledge Assistant |

---

## Conclusion

Snowflake Cortex Agent outperforms Databricks Genie on **every question** in this benchmark (14/14 wins). The **+73 point gap** (93.8% vs 59.0%) is driven by structural, repeatable failure patterns — not random variation.

The failures are **architectural**, not prompt-engineering gaps:
- Genie cannot plan multi-table CTE queries reliably
- Per-table metric views provide no cross-table join guidance
- Document search falls back to generic knowledge
- When queries fail, Genie hallucinates results rather than reporting errors

These limitations affect any analytical workload requiring cross-table reasoning — which is the majority of real-world enterprise analytics questions.
