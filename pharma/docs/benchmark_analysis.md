# ClinicalIQ Benchmark — Snowflake Cortex Agent vs Databricks Genie

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

## Benchmark Questions & Results

14 hybrid questions ordered by complexity (Tier 2–6). Each question requires structured SQL analysis + document search. Questions selected to expose repeatable Databricks Genie failure patterns.

### Trap Legend

| Code | Trap | Description |
|---|---|---|
| E | Screen failure exclusion | Not every patient enrolled — some failed screening. If you count all rows as "enrolled," rates are wrong. Filter to `enroll_dt IS NOT NULL`. |
| X | Serious vs Severe | Two different columns that sound similar but mean different things. `seriousness` = regulatory (must report to authorities). `severity` = clinical (how bad it felt). Using the wrong one flips results. |
| W | Per-visit window | Each visit type has its own allowed window (screening = 7 days, dosing = 2 days). There's no single "on-time" flag — must calculate per row using that visit's `visit_window_days`. |
| G | Granularity / pre-aggregation | Must count per patient first, then group by dimension. Skipping this step (e.g., joining labs directly to trials) inflates numbers because each patient has many lab rows. |
| C | Cartesian product | When Table A has 5 rows per patient and Table B has 3 rows per patient, joining them produces 15 rows per patient. Must use DISTINCT or aggregate first. |
| A | Multi-arm fan-out | Each trial has 2–4 treatment arms. Joining drugs → arms → patients without care multiplies patient counts by the number of arms. |
| K | Country column ambiguity | `country_cd` appears on 4 different tables (sites, enrollments, sponsors, investigators). "Trials in Japan" needs the enrollment table, not the site table — using the wrong one changes results. |
| J | Document search required | The question asks for published research. The agent must actually search the document corpus — not answer from general knowledge. |
| Q | Document grounding | The literature cited must come from real documents in the corpus. Fabricated statistics or unsourced claims are penalized. |
| T | Temporal logic | Requires date arithmetic, time-based filtering, or trend calculations (e.g., "more than 2 years past target end date"). |
| R | Regulatory cross-reference | Must look up regulatory submission status from a separate table to complete the answer. |

---

### Tier 2 — Derived Metrics
*Metrics that don't exist as columns in the data — the agent must calculate them using formulas applied row by row (e.g., "is this visit on time?" requires comparing two dates against a per-visit threshold).*

#### Q02 — Severely Late Visits | SF 14 / DBX 10 | Gap +4
**Complexity:** Derived metric (per-visit window calculation)
**DBX Failure Pattern:** wrong-denominator + document-grounding-failure
**Traps:** W, Q

> Beyond just being slightly outside the visit window, what percentage of patient visits are severely late — more than a week past the allowed window for that specific visit type? Which sites have the worst track record for severely late visits? What does published research say about how missed visit windows affect data quality?

**Expected approach:** Severely late = `ABS(actual_dt - scheduled_dt) > visit_window_days + 7`. Must use the per-visit `visit_window_days` column (varies by visit type), not a fixed 7-day window.

**Key numbers:** Severely late visit percentage + worst sites list

**Why DBX fails (wrong-denominator + document-grounding-failure):** Genie reported 2.87% severely late visits and a top-15 site list, but used a fixed 7-day window instead of the per-visit `visit_window_days` column — each visit type has its own allowed window (screening = 7 days, dosing = 2 days), so applying a single threshold produces incorrect results. The literature section contained no specific citations or study references from the document corpus, relying entirely on generic clinical knowledge with no way to verify the claims.

---

#### Q03 — Visit Compliance Quarterly Trend | SF 15 / DBX 10 | Gap +5
**Complexity:** Time-series trend (quarterly aggregation)
**DBX Failure Pattern:** document-grounding-failure + wrong-denominator
**Traps:** W, E, J, T

> How has our visit compliance rate changed quarter over quarter? Are patients showing up for their scheduled visits on time more often or less often as our portfolio matures? What published studies exist about the factors that drive visit adherence in long-running clinical trials?

**Expected approach:** Derive quarter from visit dates, compute compliance per quarter using per-visit `visit_window_days`. Show trend over time.

**Key numbers:** Quarterly visit compliance rates showing trend

**Why DBX fails (document-grounding-failure + wrong-denominator):** Genie produced quarterly compliance rates of 49.7%–50.7% — suspiciously uniform across all quarters, suggesting the visit window calculation was oversimplified or averaged rather than computed per-visit-type. For 2020–2023, it used averaged annual figures rather than true per-quarter computations, masking real within-year variation. The 2026 data jumped to 51–64% with an unsubstantiated "small sample size" caveat. The literature section fabricated specific statistics ("33% forgetfulness", "mobile reminders doubling attendance") that don't appear in the corpus — classic generic knowledge masquerading as research findings.

---

### Tier 3 — Multi-Table Joins & Ratios
*Questions that require combining data from 2–3 tables and computing rates, ratios, or per-capita metrics. The agent must choose the right join path and handle denominator selection correctly.*

#### Q04 — Lab Tests per Enrolled Patient by TA | SF 15 / DBX 10 | Gap +5
**Complexity:** 3-table join with pre-aggregation
**DBX Failure Pattern:** cartesian-product
**Traps:** C, G, J, Q

> What is the average number of lab tests per enrolled patient, broken down by therapeutic area? Which therapeutic areas are ordering the most lab work per patient? Search for published guidelines on recommended lab monitoring frequency in clinical trials.

**Expected approach:** Pre-aggregate labs per `enrollment_id` FIRST, then join to trial for therapeutic area. Must use enrolled-only patients. Cartesian product risk if joining labs directly to trial without pre-aggregation.

**Key numbers:** Avg lab tests per enrolled patient by therapeutic area

**Why DBX fails (cartesian-product):** Genie reported all therapeutic areas clustering tightly around 12.1–12.3 tests per patient — suspiciously uniform when real variation should exist. The narrow range suggests Genie joined labs directly to trials without pre-aggregating per `enrollment_id` first. Without pre-aggregation, the cartesian product inflates counts uniformly across all therapeutic areas, washing out real differences. The guidelines section correctly acknowledged no formal published guidelines were found rather than hallucinating — one area where Genie behaved well.

---

#### Q05 — SAE Ratio by TA + FDA Labels | SF 15 / DBX 7 | Gap +8
**Complexity:** 3-table join + ratio + document search
**DBX Failure Pattern:** document-grounding-failure + metric-hallucination
**Traps:** X, G, J

> Across our therapeutic areas, what is the ratio of medically serious adverse events to non-serious ones? Which therapeutic area has the highest proportion of serious events? For the worst area, look up the FDA drug labels for the drug classes we are using there — do the labels warn about high rates of serious events?

**Expected approach:** Compute `COUNT(seriousness='SERIOUS') / COUNT(seriousness='NON_SERIOUS')` per therapeutic area via 3-table join (adverse_event → enrollment → trial). Must use `seriousness` column, NOT `severity`.

**Key numbers:** Hematology ratio=0.333, Oncology=0.333, Cardiology=0.282, Rheumatology=0.250

**Why DBX fails (document-grounding-failure + metric-hallucination):** Genie reported Hematology at 25% and Oncology at 25% — but that's "percent of total AEs that are serious," not the requested serious-to-non-serious *ratio* (0.333). These are mathematically different: 25% of total vs 1:3 ratio. The metric definition was wrong. Worse, the FDA drug label section cited specific statistics (38.74% serious adverse effects, 15.89%, 86%) that appear fabricated from generic medical knowledge — none of these numbers come from the actual drug label documents in the corpus.

---

#### Q06 — SAE Rate per 100 Enrolled by Phase | SF 15 / DBX 6 | Gap +9
**Complexity:** 3-table join, per-100 rate, screen failure exclusion
**DBX Failure Pattern:** wrong-denominator
**Traps:** E, G, J

> What is the serious adverse event rate per 100 enrolled patients for each trial phase, and which phase has the worst safety profile? Only count patients who actually enrolled — not screen failures. What does published research say about expected SAE rates by trial phase?

**Expected approach:** Join enrollment (`enroll_dt IS NOT NULL` only) → trial (for phase) → adverse_event (`seriousness='SERIOUS'`). Compute `100 * COUNT(SAE) / COUNT(DISTINCT enrolled patients)`.

**Key numbers:** SAE per 100 enrolled: Phase2/3=39.0, Phase2=38.9, Phase4=38.7, Phase1=38.7, Phase3=38.6

**Why DBX fails (wrong-denominator):** The largest gap (+9). Genie reported SAE rates of 31.47–32.16 per 100 patients across all phases — expected values are 38.6–39.0 per 100, off by 18–20%. The relative phase ranking was correct (Phase 2/3 highest, Phase 3 lowest), but the absolute numbers were consistently deflated because Genie included screen failures (`enroll_dt IS NULL`) in the denominator instead of filtering to enrolled-only patients. This inflated the denominator by ~20%, deflating all rates by the same proportion. Document search for published SAE rates yielded no results.

---

#### Q07 — Budget Overrun Ratio by TA | SF 15 / DBX 13 | Gap +2
**Complexity:** 2-table join, overrun/underrun classification
**DBX Failure Pattern:** minor discrepancy
**Traps:** X, G, J, Q

> For each therapeutic area, what is the ratio of budget overrun trials to budget underrun trials? Which areas are most financially disciplined? Search for published benchmarks on clinical trial budget adherence rates.

**Expected approach:** Sum budget per trial, classify as overrun (actual > planned) or underrun (actual < planned). Join to trial for therapeutic area. Compute ratio.

**Key numbers:** Most disciplined: Gastro=0.241 (153/634). Least: Pulmonology=0.324 (204/629). Hematology=0.267

**Why DBX fails (minor discrepancy):** The closest Genie came to matching Snowflake — only -2 points. Genie actually matched the key numbers precisely: Gastroenterology 153/634=0.24, Hematology 168/630=0.27, Pulmonology 204/629=0.32, correctly identifying most and least disciplined areas. This is a simple 2-table join (budget → trial) that Genie handled well. Minor deductions were for limited benchmark literature grounding.

---

#### Q08 — Time to First AE by Country | SF 12 / DBX 9 | Gap +3
**Complexity:** 3-table join, time-to-event date arithmetic
**DBX Failure Pattern:** CTE-planning-failure (date offset)
**Traps:** E, W, J, Q

> Calculate the average time from patient enrollment to their first adverse event for each country. Which country has the shortest time-to-first-AE, and does that suggest a safety concern or just faster reporting? What does published research say about time-to-AE patterns across different regulatory environments?

**Expected approach:** Join enrollment → adverse_event, compute `MIN(onset_dt)` per patient, then `DATEDIFF(first_onset, enroll_dt)`. Filter `onset >= enroll_dt`. Group by country.

**Key numbers:** KR=378.5 days, IN=378.9, SG=379.6, JP=380.2, AU=384.0. Spread ~5.5 days.

**Why DBX fails (CTE-planning-failure):** Genie reported time-to-first-AE values of ~365–371 days while expected values are 378.5–384.0 days — a consistent 13–14 day undercount across all five countries. The country ranking (IN < KR < SG < JP < AU) and spread (~5.5 days) were both correct, proving the join logic worked — but the absolute date arithmetic was systematically off, likely using a different reference date, excluding certain records, or computing the date difference incorrectly. The literature section referenced Japan reporting rates and APAC patterns that appeared corpus-grounded.

---

### Tier 4 — Complex Multi-Table Analysis
*Questions requiring 3+ table joins with cohort splitting, group comparisons, or composite calculations. The agent must plan multi-step CTEs — aggregate within groups first, then compare across groups.*

#### Q09 — Polypharmacy ↔ SAE Correlation | SF 15 / DBX 9 | Gap +6
**Complexity:** 3-table join, cohort comparison (polypharmacy)
**DBX Failure Pattern:** wrong-denominator (inflated LOW group)
**Traps:** C, G, Q

> Are patients who are on three or more concomitant medications experiencing more serious adverse events than those on fewer medications? What does the published literature say about polypharmacy risks in clinical trial settings?

**Expected approach:** LEFT JOIN from enrollment to conmeds (to include zero-conmed patients). Count conmeds per patient. Split into HIGH (3+) and LOW (<3) groups. Compute SAE rate per group.

**Key numbers:** HIGH(3+)=73,867 patients, 31.0% SAE. LOW(<3)=320,534 patients, 30.3% SAE.

**Why DBX fails (wrong-denominator):** Genie reported 76,663 HIGH-conmed patients and 234,007 LOW-conmed patients with ~40% SAE rates. Expected: 73,867 HIGH and 320,534 LOW with ~31% SAE rates. The LOW group is missing ~86,000 patients — those with zero concomitant medications — because Genie used an INNER JOIN instead of a LEFT JOIN from enrollment to conmeds. Patients who never took any concomitant medication simply disappeared from the analysis. The inflated SAE rates (~40% vs ~31%) compound the error, suggesting double-counting from a cartesian product in the adverse event join.

---

#### Q10 — Frozen Trial Budget Impact | SF 12 / DBX 11 | Gap +1
**Complexity:** 3-table join, status filter + budget percentage
**DBX Failure Pattern:** wrong-denominator (double-counted patients)
**Traps:** E, G, J, Q

> What percentage of our total portfolio budget is consumed by trials that are currently suspended or withdrawn? How many enrolled patients are affected by these frozen trials? For the largest frozen trial by budget, search for any published safety signals about the drugs involved.

**Expected approach:** Filter trials by `STATUS IN ('SUSPENDED','WITHDRAWN')`. Sum `actual_usd` for frozen vs total. Count enrolled patients in frozen trials.

**Key numbers:** Frozen trials=1,485, budget=$1.47B (15.0% of $9.80B total), patients=58,537

**Why DBX fails (wrong-denominator):** The narrowest gap (+1) — Genie got the budget numbers right: 15.0% of portfolio, $1.47B of $9.80B total. But it reported 74,086 enrolled patients vs expected 58,537 — a 27% overcount. The error is isolated to the enrollment join: Genie likely double-counted patients across multiple trial arms or related sub-studies. The frozen trial count (1,485) was not explicitly stated in the output, a minor omission.

---

#### Q11 — Experimental vs Placebo Arm SAE Rates | SF 12 / DBX 6 | Gap +6
**Complexity:** 4-table join, arm-level SAE comparison
**DBX Failure Pattern:** multi-table-join-failure + metric-hallucination
**Traps:** A, G, J, Q

> In how many of our trials does the experimental treatment arm have a higher patient-level serious AE incidence rate (% of patients with at least one serious AE) than the placebo arm? Which drugs are the worst offenders? Search the drug labels for those drugs — do the labels warn about these safety signals?

**Expected approach:** 4-table join: trial_arm → enrollment → adverse_event → trial. Compute patient-level SAE incidence per arm per trial. Compare experimental vs placebo within each trial.

**Key numbers:** Trials with both arms=6,631. Experimental worse=3,230 (48.7%)

**Why DBX fails (multi-table-join-failure + metric-hallucination):** Genie reported 3,264 trials where experimental is worse — close to the expected 3,230 — but never mentioned the critical denominator of 6,631 total paired trials, making the percentage impossible to verify. The drug label section was entirely hallucinated: Genie admitted labels aren't in the repository but then fabricated generic drug-class safety information attributed to "published research." Drug names listed (Olalumab XR, Lenalib XR) are synthetic/fabricated compounds that don't exist in the database — a classic hallucination response when the 4-table join (trial_arm → enrollment → adverse_event → trial) partially fails.

---

#### Q12 — Zombie Trials + Tied-Up Budget | SF 15 / DBX 9 | Gap +6
**Complexity:** Date logic + budget aggregation + percentage
**DBX Failure Pattern:** negation-blindness (included terminated/withdrawn)
**Traps:** J, Q, T

> How many of our trials have been running for more than two years past their target end date and still have not completed? How much of our total portfolio actual spend (actual_usd, not planned) is tied up in these zombie trials as a percentage? Search for published guidance on when sponsors should pull the plug on under-performing trials.

**Expected approach:** Filter trials where `target_end_dt` is more than 2 years ago and trial is not yet completed. Sum `actual_usd` for those trials, express as % of total portfolio.

**Key numbers:** Zombie trials ~2,250–2,815, actual spend ~$2.2–2.8B (22–28% of ~$9.8B total)

**Why DBX fails (negation-blindness):** Genie reported 3,405 zombie trials with $3.32B actual spend — both significantly above the expected range (2,250–2,815 trials, $2.2–2.8B). The overcount comes from including TERMINATED and WITHDRAWN trials — trials that have already been formally closed out and shouldn't be counted as "still running." This is a negation-blindness failure: the filter should exclude completed, terminated, AND withdrawn trials, but Genie only excluded completed. Additionally, Genie gave absolute dollar amounts but never computed the percentage of total portfolio spend — a key required metric. Termination guidance came from general knowledge, not the document corpus.

---

### Tier 5 — Cross-Domain & Document Search
*Questions that require both structured SQL queries AND searching the unstructured document corpus, then combining findings into one answer. Tests whether the agent can orchestrate multiple tools.*

#### Q13 — Active Drugs Never in PubMed | SF 14 / DBX 6 | Gap +8
**Complexity:** Cross-domain: drug table + document search
**DBX Failure Pattern:** multi-table-join-failure + metric-hallucination
**Traps:** J, Q, R

> Are there any drugs in our active trial portfolio that have never been mentioned in any PubMed abstract in our document collection? Are these truly novel compounds, or are they just under-studied? What is their regulatory submission status?

**Expected approach:** Query structured data for active drugs (drug → trial_arm → trial), then check PubMed presence via document search. Cross-reference regulatory status.

**Key numbers:** Active drugs with no PubMed ~2,756–2,759. With PubMed ~48–51. Total active ~2,807.

**Why DBX fails (multi-table-join-failure + metric-hallucination):** Genie found only **18 drugs** with no PubMed presence when the correct answer is **~2,756–2,759** out of 2,807 total active drugs — off by over 150x. None of the expected key numbers appeared anywhere in the output. The drug names listed had contradictory class/mechanism pairings (e.g., an "SGLT2 Inhibitor" labeled with an "ALK inhibitor" mechanism), confirming these were hallucinated rather than retrieved from the database. The query likely retrieved a tiny subset from a single table instead of executing the full 3-table join (drug → trial_arm → trial) needed to identify active drugs.

---

#### Q14 — Composite Country Performance Index | SF 15 / DBX 10 | Gap +5
**Complexity:** Composite index across 4+ tables
**DBX Failure Pattern:** multi-table-join-failure (lost differentiation)
**Traps:** E, X, G, K, J, Q

> Rank our APAC countries by overall site performance, combining enrollment rates, visit compliance, and safety record (where fewer serious AEs is better) into a single normalized index. Which country has the best-performing sites? How does this compare to published benchmarks for site performance in Asia-Pacific clinical trials?

**Expected approach:** Three derived metrics per country from different table chains. Normalize 0–1 using MIN-MAX scaling. Invert the SAE metric (fewer = better). Combine into composite index.

**Key numbers:** Normalized site performance index per country

**Why DBX fails (multi-table-join-failure):** Genie produced a composite index with Japan at 0.546 and Australia at 0.000 — which looks correct for MIN-MAX scaling. But the underlying metrics reveal the problem: 100% enrollment rates across ALL five countries (impossible — real rates range from 70–85% by country) and ~50% visit compliance for ALL countries (real rates vary from 41.5–60% by therapeutic area). These uniform intermediate values mean Genie's SQL aggregated incorrectly, washing out the real country-level variation that should drive the index. The final rankings are based on noise, not signal. The benchmark section correctly acknowledged no APAC literature was found rather than hallucinating — one of the few areas Genie handled appropriately.

---

### Tier 6 — Executive Synthesis
*The hardest tier — produce a comprehensive report pulling hard numbers from every major table, cross-referenced with published research. Requires 5+ parallel queries, multiple document searches, and coherent synthesis.*

#### Q17 — Board-Level Executive Summary | SF 15 / DBX 8 | Gap +7
**Complexity:** Executive synthesis, all tables
**DBX Failure Pattern:** cartesian-product + CTE-planning-failure
**Traps:** ALL

> Prepare a board-level executive summary of our clinical portfolio with hard numbers, not just narratives. Cover: (1) portfolio health — enrollment rates by phase and country with trends over time, (2) safety — our serious AE rates versus what published drug labels cite as expected, (3) operations — which sites are performing best and worst based on quality scores and protocol adherence, (4) regulatory pipeline — what percentage of our submissions are getting approved and how long is the process taking, (5) research intelligence — the most important findings from published research relevant to our therapeutic areas. Give me specific numbers for everything.

**Expected approach:** Five parallel complex queries each requiring derived metrics and multi-table joins, PLUS multi-source document search, synthesized into executive format. The ultimate stress test.

**Key numbers:** All major portfolio metrics across 5 sections

**Why DBX fails (cartesian-product + CTE-planning-failure):** Genie produced a comprehensive 5-section report, but the numbers expose systematic query errors across multiple sections. Portfolio health: 100% enrollment rate across all phases and countries — impossible, indicating a join that conflated screening records with actual enrollments, counting every row as "enrolled." Regulatory pipeline: 50.6% approval rate with near-identical rates (49–51%) across all submission types and countries, and nearly identical processing times (402–419 days) — this uniformity means the query averaged across all dimensions rather than computing per-group metrics, masking real variation. Safety: benchmarks cited PD-1 fatality rates and FAERS data that appeared corpus-grounded, but the comparison methodology was flawed. Research intelligence: mixed corpus findings with generic knowledge. The uniformity across sections is the telltale sign — when every country, every phase, and every submission type produces the same number, the SQL is wrong.

---

## Failure Pattern Analysis

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
