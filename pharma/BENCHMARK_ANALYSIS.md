# ClinicalIQ Benchmark Analysis: Snowflake vs Databricks

## 30-Question Clinical Trial AI Agent Benchmark

**Dataset**: 17 clinical tables, ~15M rows across 10K trials, 500K enrollments, 800K adverse events, 5M lab results, plus 173K document corpus (ClinicalTrials.gov, DailyMed, PubMed)

**Scoring**: 6 dimensions x 5 points each = 30 points max per question. Scored by Claude Sonnet via structured rubric with expected answers, key numbers, and trap detection.

---

## Overall Results

| Metric | Snowflake | Databricks |
|--------|-----------|------------|
| **Average Score** | **26.2 / 30** | **19.2 / 30** |
| **Head-to-Head Wins** | **25** | **2** |
| **Ties** | 3 | 3 |
| **Perfect Scores (30/30)** | 10 | 2 |

### Score by Difficulty Tier

| Tier | Description | DBX Avg | SF Avg | Gap |
|------|-------------|---------|--------|-----|
| 3 | Basic queries | 24.5 | 26.2 | +1.8 |
| 4 | Multi-table joins + traps | 20.0 | 29.0 | **+9.0** |
| 5 | Complex derivations + hybrid | 16.8 | 25.2 | **+8.4** |
| 6 | Expert multi-step analytics | 18.9 | 25.5 | +6.6 |

Databricks keeps pace at Tier 3 (simple queries) but collapses at Tier 4-5 where precise methodology and data trap avoidance matter most. The gap is largest at Tier 4 (+9.0 points) where questions require exact join logic and column selection.

### Score by Dimension

| Dimension | SF Avg | DBX Avg | Gap | Interpretation |
|-----------|--------|---------|-----|----------------|
| Relevance | 4.70 | 4.13 | +0.57 | Both answer the right question |
| Accuracy | 4.20 | 3.10 | +1.10 | SF gets the numbers right more often |
| Groundedness | 4.27 | 3.13 | +1.13 | SF answers are grounded in actual data |
| Usefulness | 4.73 | 3.53 | +1.20 | SF produces more actionable output |
| **Correctness** | **4.17** | **2.77** | **+1.40** | **SF avoids methodology errors** |
| **Consequences** | **4.13** | **2.50** | **+1.63** | **DBX answers lead to wrong decisions** |

The two largest gaps -- Correctness (methodology) and Consequences (decision impact) -- are exactly the dimensions that semantic view guardrails address.

---

## Per-Question Scorecard

| Q | Tier | SF | DBX | Delta | Winner | Topic |
|---|------|-----|-----|-------|--------|-------|
| Q01 | 3 | 30 | 30 | 0 | TIE | Phase 3 enrollment rate in Japan |
| Q02 | 3 | 30 | 28 | +2 | SF | Serious but not severe AEs |
| Q03 | 3 | 15 | 14 | +1 | SF | Recruiting vs active by therapeutic area |
| Q04 | 3 | 30 | 26 | +4 | SF | Site quality scores across APAC |
| Q05 | 4 | 30 | 18 | +12 | SF | Under-enrolled trials budget impact |
| Q06 | 4 | 30 | 30 | 0 | TIE | Severely late visits |
| Q07 | 4 | 24 | 19 | +5 | SF | Serious AE ratio by therapeutic area |
| Q08 | 4 | 30 | 19 | +11 | SF | Drugs with regulatory approval |
| Q09 | 4 | 30 | 18 | +12 | SF | Avg patients per non-placebo arm |
| Q10 | 4 | 30 | 16 | +14 | SF | Concomitant meds and SAE correlation |
| Q11 | 5 | 27 | 18 | +9 | SF | Old vs new trials comparison |
| Q12 | 5 | 25 | 15 | +10 | SF | Investigators with clean safety records |
| Q13 | 5 | 30 | 24 | +6 | SF | Visit compliance QoQ trend |
| Q14 | 5 | 21 | 21 | 0 | TIE | Sites running trials for unsubmitted drugs |
| Q15 | 5 | 30 | 10 | +20 | SF | Safety burden by therapeutic area |
| Q16 | 5 | 26 | 14 | +12 | SF | Brand vs generic name differences |
| Q17 | 5 | 23 | 11 | +12 | SF | Earliest vs most recent 2,500 trials |
| Q18 | 5 | 27 | 17 | +10 | SF | Visits before SAE-driven discontinuation |
| Q19 | 5 | 17 | 20 | -3 | DBX | Trials with thin lab coverage |
| Q20 | 5 | 26 | 18 | +8 | SF | Experimental arm SAE vs comparator |
| Q21 | 6 | 26 | 18 | +8 | SF | Composite trial risk score |
| Q22 | 6 | 26 | 18 | +8 | SF | Best/worst investigator track records |
| Q23 | 6 | 23 | 24 | -1 | DBX | Immunotherapy + anticoagulant interaction |
| Q24 | 6 | 30 | 14 | +16 | SF | Zombie trials budget impact |
| Q25 | 6 | 26 | 18 | +8 | SF | APAC country site performance ranking |
| Q26 | 6 | 20 | 17 | +3 | SF | Drugs with no PubMed presence |
| Q27 | 6 | 26 | 13 | +13 | SF | Recruiting-to-active transition metrics |
| Q28 | 6 | 26 | 19 | +7 | SF | Red-flag portfolio report |
| Q29 | 6 | 26 | 24 | +2 | SF | What-if budget reallocation scenario |
| Q30 | 6 | 26 | 24 | +2 | SF | Board-level executive summary |

---

## The Semantic View Advantage: Questions Improved Through Iterative Tuning

A key differentiator in this benchmark is Snowflake's ability to **iteratively improve agent accuracy** through the semantic view layer -- specifically `module_custom_instructions` (SQL generation rules) and `verified_queries` (VQRs). Several questions initially scored poorly on the Snowflake side, but were fixed by adding targeted guidance to the semantic view. **This feedback loop is not possible in Databricks**, where the agent generates SQL without a guardrail layer.

### Questions Fixed via Semantic View Tuning

#### Q05: Enrollment Rate (18 -> 30, four iterations)
- **Problem**: Agent used `ACTUAL_ENROLLMENT / TARGET_ENROLLMENT` from TBL_TRIAL instead of deriving enrolled/screened from TBL_ENROLLMENT
- **Fix**: Added `module_custom_instructions.sql_generation` rule explicitly defining enrollment rate as `COUNT(CASE WHEN ENROLL_DT IS NOT NULL THEN 1 END) / COUNT(*)` from TBL_ENROLLMENT, with a prohibition on the wrong columns
- **Also added**: VQRs for `enrollment_rate_per_trial`, `under_enrolled_trials_budget_impact`, and `under_enrolled_trials_detail`
- **DBX score**: 18/30 -- falls into the same trap every time with no way to fix it

#### Q09: Arm-Level Patient Counts (18 -> 30)
- **Problem**: Agent used `TBL_TRIAL_ARM.ACTUAL_N` (sponsor aggregate, ~198.8 per arm) instead of counting patients from TBL_ENROLLMENT (~12.5 per arm)
- **Fix**: Added sql_generation rule: "JOIN TBL_ENROLLMENT to TBL_TRIAL_ARM on ARM_ID and COUNT(*). Do NOT use ACTUAL_N."
- **Also added**: VQR for `avg_patients_per_nonplacebo_arm_multiarm`
- **DBX score**: 18/30 -- uses ACTUAL_N and gets 10 patients/arm (close but wrong method)

#### Q15: Safety Burden by Therapeutic Area (10 -> 30, biggest single improvement)
- **Problem**: Agent used only `SEVERITY = 'CRITICAL'` for protocol deviations (missing MAJOR) and joined deviations through enrollment (missing site-level deviations with no enrollment_id)
- **Fix**: Added two sql_generation rules:
  1. "Critical protocol deviations" = `SEVERITY IN ('CRITICAL', 'MAJOR')`
  2. Protocol deviations must join via `pd.TRIAL_ID = t.TRIAL_ID`, not through enrollment
- **Also added**: VQR for `safety_burden_by_therapeutic_area` with the exact correct query
- **DBX score**: 10/30 -- Hematology at 45.6/100 vs correct 63.1/100. No way to guide the agent to use MAJOR deviations or the correct join path

#### Q24: Zombie Trials Budget (14 -> 30)
- **Problem**: Agent filtered on `ACTUAL_END_DT IS NULL` (excludes withdrawn trials with end dates) instead of `STATUS <> 'COMPLETED'`, AND used `PLANNED_USD` instead of `ACTUAL_USD`
- **Fix**: Added two sql_generation rules:
  1. "Not completed" = `STATUS <> 'COMPLETED'`, not `ACTUAL_END_DT IS NULL`
  2. "Budget spent/consumed/tied up" = `ACTUAL_USD`, not `PLANNED_USD`
- **DBX score**: 14/30 -- makes both errors with no way to provide corrective guidance

### The Feedback Loop That Databricks Cannot Match

```
Snowflake Iterative Improvement Cycle:
  
  1. Run question against agent
  2. Score reveals wrong methodology  
  3. Add sql_generation rule to semantic view (natural language guidance)
  4. Add VQR with exact correct SQL pattern
  5. Re-run -- agent now follows the correct methodology
  6. Score improves, fix is permanent for all similar future questions

Databricks:

  1. Run question against agent
  2. Score reveals wrong methodology
  3. No equivalent guardrail layer exists
  4. Cannot inject SQL generation rules or verified queries
  5. Re-run produces the same error
  6. No path to improvement without rebuilding the agent
```

The semantic view's `module_custom_instructions` and `verified_queries` act as a **persistent knowledge base** that teaches the agent how to handle domain-specific data traps. Each fix compounds: the enrollment rate rule (Q05) also improved Q11, Q17, Q25, Q28, Q29, and Q30 because they all involve enrollment calculations.

---

## 7 Recurring Databricks Failure Patterns

### 1. Data Trap Blindness

> **In plain English:** Clinical trial data has many columns that look similar but mean very different things. Snowflake's semantic view acts like a cheat sheet that tells the AI "use this column, not that one" -- Databricks has no such cheat sheet, so its AI picks the wrong column and gets wrong numbers.

Databricks consistently walks into data traps that Snowflake avoids. Importantly, these traps are addressed at **two different levels** of the semantic view -- some are caught by the base configuration alone (no manual tuning needed), while others required adding custom rules.

#### Traps caught by base semantic view (zero manual tuning)

> **In plain English:** Just by setting up the semantic view (a one-time configuration step), Snowflake's AI already understands the difference between similar-sounding columns, knows how tables connect to each other, and recognizes that each visit has its own compliance window. Databricks' AI has to guess all of this from raw table schemas.

The auto-generated semantic view includes column descriptions, sample values, data types, and defined relationships. This metadata alone steers Cortex Analyst away from common mistakes:

| Trap | What DBX Does Wrong | How Base Semantic View Prevents It |
|------|--------------------|------------------------------------|
| SERIOUSNESS vs SEVERITY confusion (Q02, Q07, Q20, Q21, Q25, Q28, Q30) | Confuses the two columns or uses `SEVERITY='SEVERE'` for serious AEs | Column descriptions + sample values make it clear: `SERIOUSNESS` has values `SERIOUS`/`NON_SERIOUS`, `SEVERITY` has `MILD`/`MODERATE`/`SEVERE`. The agent sees these are different concepts |
| Wrong JOIN paths (Q10, Q12, Q28) | Produces broken JOINs, wrong denominators, inverted filters | 27 pre-defined relationships with correct foreign keys. Cortex Analyst follows declared join paths instead of guessing |
| Visit compliance window (Q06, Q13, Q25) | Uses a hard-coded 7-day window | Column description for `VISIT_WINDOW_DAYS` explains "allowed window per visit". Sample values show varying windows |
| Temporal windowing (Q11, Q17) | Fails to partition trials chronologically, gets near-identical rates | Defined time dimensions and primary keys help the SQL generator understand table grain and ordering |
| Drug name ambiguity (Q08, Q16) | Confuses trade name, generic name, molecule name | Three separate columns with distinct descriptions and Cortex Search services on each |

These 15+ questions benefited from Snowflake's semantic view **without any manual rules or VQRs**. The base semantic view's metadata layer provides structural guidance that Databricks' agent simply doesn't have access to.

#### Traps caught by manual tuning (sql_generation rules + VQRs)

> **In plain English:** Some business rules aren't obvious from the data structure alone -- for example, "enrollment rate" could mean two different things depending on which table you use. Snowflake lets you write these rules in plain English ("always calculate enrollment rate this way") and the AI follows them. Databricks has no way to inject these rules.

Some domain-specific traps required explicit natural language rules because the correct methodology isn't obvious from column metadata alone:

| Trap | What DBX Does Wrong | What SF Rule Fixes It |
|------|--------------------|--------------------|
| Enrollment rate (Q05, Q11, Q17, Q25) | Uses `ACTUAL_ENROLLMENT / TARGET_ENROLLMENT` | sql_generation rule + VQR defining correct derivation from TBL_ENROLLMENT |
| Arm patient counts (Q09) | Uses `ACTUAL_N` aggregate | sql_generation rule: "Do NOT use ACTUAL_N" + VQR |
| Protocol deviation severity (Q15) | Uses only `CRITICAL` | sql_generation rule: "CRITICAL + MAJOR" |
| Deviation join path (Q15) | Joins through enrollment | sql_generation rule: "Join via TRIAL_ID directly" |
| Trial completion (Q24) | Uses `ACTUAL_END_DT IS NULL` | sql_generation rule: "STATUS <> 'COMPLETED'" |
| Budget column (Q24) | Confuses PLANNED_USD / ACTUAL_USD | sql_generation rule: "spent/consumed = ACTUAL_USD" |

**Combined impact**: The base semantic view provides a foundation of correct metadata that prevents ~15 questions worth of errors out of the box. The manual tuning layer then catches the remaining domain-specific traps that metadata alone can't solve. Databricks has neither layer.

### 2. Shallow Analysis (Q12, Q19, Q27)

> **In plain English:** When the obvious answer is "nothing found," a good analyst digs deeper. Snowflake's agent does this; Databricks' agent stops at the first answer. For example, when asked about trials with no lab data, both correctly found zero -- but only Snowflake went on to identify which trials had suspiciously thin lab coverage.

Databricks finds the surface-level answer and stops:
- Q19: Found "zero trials with no labs" (correct) but didn't compute labs-per-patient ratio for bottom 10
- Q12: Found no investigators with zero SAEs but didn't produce the required bottom-5 ranking
- Q27: Tool returned "status transition history not available" -- agent gave up and fabricated metrics

### 3. Broken JOINs and Wrong Denominators (Q10, Q12, Q28)

> **In plain English:** When combining data from multiple tables, getting the math wrong can completely flip the conclusion. In one case, Databricks counted the wrong group of patients and concluded "no difference in safety outcomes" when in reality there was a 7-point gap -- a finding that could change clinical decisions.

- Q10: Wrong denominator for <3 conmed group (234K vs correct 423K patients), **completely inverting the finding** -- concluded "no meaningful difference" when the real gap is 7.2 percentage points
- Q12: JOIN returned 670 investigators with zero patients -- a broken LEFT JOIN artifact the agent didn't catch
- Q28: Enrollment rate filter was inverted, returning sites ABOVE 60% instead of below

### 4. Document Search Weakness (Q07, Q15, Q20, Q22, Q26)

> **In plain English:** Every question requires both data analysis AND searching published literature (FDA labels, clinical trial protocols, research papers). Snowflake searches three purpose-built document indexes and returns verified, attributed results. Databricks' search often comes back empty or returns loosely matched content that the AI then misinterprets or presents as fact.

- Often returns "no relevant results" and falls back on generic knowledge
- Confuses synthetic drug names (Nivomab-376) with real drugs (nivolumab) -- hallucination risk
- Attributes papers to investigators without verification (Q22)
- Multiple questions acknowledge "limited grounded content" but present conclusions anyway

### 5. Metric Confusion: Events vs Patients (Q07, Q20, Q28)

> **In plain English:** "How many adverse events happened" and "how many patients had an adverse event" are very different numbers (one patient can have 5 events). Databricks frequently confuses the two, producing nonsensical results like a 600% safety rate -- a number that would alarm any executive reading the report.

- Q28: SAE rates exceeding 600% because events-per-patient was treated as a percentage
- Q07: Reports ratio as percentage (20.25%) vs expected ratio format (0.254)
- Q20: Doesn't clarify whether SAE rates are per-patient or per-event

### 6. Budget Column Confusion (Q05, Q24, Q29)

> **In plain English:** The data has two budget columns: what was planned to be spent, and what was actually spent. Databricks picks the wrong one, reporting $12.6B in total spending when the real figure is $9.9B -- a $2.7 billion error that would mislead any financial review.

- Q24: Used PLANNED_USD ($12.60B) instead of ACTUAL_USD ($9.94B) -- $2.66B overstatement
- Q05: Budget aggregation suspect (didn't sum per trial first)
- Q29: May conflate site-level with trial-level costs

### 7. Temporal / Windowing Failures (Q11, Q17, Q27)

> **In plain English:** Questions like "compare our oldest trials to our newest trials" require splitting data by time. Databricks fails to do this correctly, producing suspiciously identical numbers for both groups -- a clear sign the split didn't work. In one case, the agent couldn't figure out the time-based split at all and fabricated the comparison data.

- Q17: Failed to split earliest 2,500 vs most recent 2,500 trials -- produced near-identical rates (~80%) across all countries, an obvious artifact of incorrect partitioning
- Q11: Chronological split methodology was opaque, enrollment rates suspiciously uniform
- Q27: Couldn't compute before/after metrics for status transitions, fabricated data instead

---

## Where Databricks Performs Well

> **In plain English:** Databricks does well on straightforward questions where the answer comes from a single table with no traps, and on high-level analytical questions where the value is in the reasoning rather than precise data methodology.

- **Q01, Q06** (Tier 3-4): Simple, well-defined queries with clear single-table methodology -- DBX matches SF at 30/30 and 30/30
- **Q23, Q29, Q30** (Tier 6): Higher-tier analytical questions where the methodology is more about reasoning than trap avoidance -- DBX scores 24/30
- **Transparency about corpus gaps**: DBX is generally honest when document search fails, rather than hallucinating (except Q27)

---

## Cortex Search and Agent Orchestration Advantages

Beyond SQL generation, Snowflake's Cortex Agent architecture provides structural advantages in document search and multi-tool orchestration that Databricks cannot match.

### Cortex Search: Purpose-Built Document Retrieval

> **In plain English:** Snowflake has three separate "search engines" -- one for clinical trial protocols, one for FDA drug labels, and one for published research. Each one is indexed and filterable, so the AI can ask precise questions like "find oncology drug labels mentioning liver toxicity" instead of doing a generic web-style keyword search. Databricks uses a single, less structured search that frequently returns nothing useful.

The Snowflake agent uses three dedicated Cortex Search services, each indexed on a specific document corpus:

| Search Service | Corpus | Documents | Use Case |
|---------------|--------|-----------|----------|
| `trial_search` | ClinicalTrials.gov study records | 100K | Protocol designs, eligibility criteria, study endpoints |
| `drug_label_search` | FDA DailyMed drug labels | 28.7K | Warnings, interactions, dosing, contraindications |
| `pubmed_search` | PubMed research abstracts | 45K | Published evidence, clinical outcomes, benchmarks |

Each service has typed, filterable attributes (therapeutic_area, drug_name) that allow the agent to narrow searches before retrieving. This means the agent can issue targeted queries like "find oncology drug labels mentioning hepatotoxicity" rather than broad keyword searches.

**Where this matters in the benchmark:**

- **Q01, Q04, Q14**: Agent correctly combined structured queries with targeted document search -- for example, identifying 1,390 sites with regulatory gaps (structured) and then searching for PMDA/MFDS/CDSCO authorization requirements (document), producing a grounded regulatory analysis
- **Q08**: Agent found drugs with regulatory approval in structured data, then cross-referenced drug labels for safety profiles -- the drug_label_search service returned actual FDA label content, not generic knowledge
- **Q13, Q24, Q29**: Agent searched PubMed for published benchmarks (visit compliance thresholds, trial futility guidance, budget optimization case studies) and cited specific abstracts

**How Databricks struggles with the same questions:**

- **Q07, Q15, Q20, Q22, Q26**: DBX document search frequently returns "no relevant results" and falls back on generic LLM knowledge rather than corpus-grounded evidence
- **Q22**: DBX attributed a hepatitis C paper to an investigator without verification -- a hallucination caused by unstructured search returning loosely matched results
- **Q26**: DBX concluded drugs were "synthetic test data" rather than searching the corpus systematically -- speculative hallucination not grounded in document evidence
- **Q27**: DBX's search tool returned "not available" and the agent fabricated before/after metrics entirely

The core difference: Snowflake's Cortex Search returns **structured, attributed results** from a pre-indexed corpus with filterable metadata. Databricks' search produces less reliable retrieval, leading to either empty results or loosely matched content that the agent misinterprets.

### Agent Orchestration: Multi-Tool Coordination

> **In plain English:** A good analyst doesn't just run one query -- they combine data analysis with document research, validate surprising results with follow-up queries, and route each sub-question to the right source. Snowflake's agent does this naturally through its orchestration layer. Databricks' agent tends to run a single query and stop, or give up when one tool fails.

Every benchmark question is designed as a **hybrid question** requiring both structured data analysis and document search. The Snowflake agent's orchestration layer manages this through explicit tool routing:

- `clinical_analytics` (Cortex Analyst) for structured SQL queries
- `trial_search` / `drug_label_search` / `pubmed_search` for document retrieval
- `data_to_chart` for visualization

The agent instructions include explicit routing guidance: *"For HYBRID questions, combine structured queries with document search"* with specific tool assignments per question type.

**Orchestration patterns where Snowflake excels:**

1. **Parallel tool execution**: The Snowflake agent runs structured queries and document searches in parallel, then synthesizes results. For Q14, it simultaneously queried enrollment data for regulatory gaps AND searched for country-specific authorization requirements
2. **Iterative refinement**: When initial results are surprising, the agent runs follow-up queries. For Q05, after finding 462 under-enrolled trials, it queried budget data for those specific trials
3. **Tool-appropriate routing**: The agent consistently routes regulatory questions to trial_search, safety questions to drug_label_search, and benchmark questions to pubmed_search

**Orchestration patterns where Databricks fails:**

1. **Single-tool reliance**: DBX often runs only structured queries and skips document search entirely, or runs a perfunctory search that adds no value (Q15, Q17, Q25)
2. **Gives up on tool failures**: When a search returns empty results, DBX presents generic knowledge instead of trying alternative search terms or a different corpus (Q27: fabricated data after tool failure)
3. **No iterative follow-up**: DBX rarely runs a second query to validate or deepen its initial findings. When Q19 returned "zero trials with no labs," DBX stopped; Snowflake's agent would have been guided by orchestration instructions to dig deeper

---

## Conclusion

> **In plain English:** Snowflake's AI agent gets better answers because it has a "knowledge layer" (the semantic view) that teaches it the right way to query clinical trial data. This layer captures institutional expertise -- the kind of knowledge a senior data analyst would have after years of working with these tables. Databricks has no equivalent, so its AI starts from scratch every time and makes the same mistakes repeatedly. The gap widens as questions get harder, because harder questions have more ways to go wrong.

The 7-point overall gap (26.2 vs 19.2) is primarily driven by **SQL methodology correctness** -- Databricks generates plausible-looking SQL that walks into domain-specific data traps, while Snowflake's semantic view layer steers the agent toward correct methodology. The iterative improvement cycle (run -> score -> add rule -> re-run) is a structural advantage that compounds over time: each rule fix is permanent and often improves multiple questions simultaneously.

The semantic view's `module_custom_instructions` and `verified_queries` function as an **institutional knowledge layer** that captures how domain experts expect the data to be queried. This layer does not exist in the Databricks agent architecture, meaning every query is generated from scratch with no accumulated domain guidance.

Snowflake's advantages operate at three levels:

1. **Base semantic view** (zero tuning): Column descriptions, sample values, relationships, and data types prevent ~15 questions' worth of errors out of the box
2. **Custom rules and VQRs** (iterative tuning): Domain-specific sql_generation rules and verified queries catch traps that metadata alone can't solve, with a feedback loop that compounds improvements over time
3. **Cortex Search + orchestration**: Purpose-built document retrieval with typed, filterable attributes produces grounded hybrid answers, while explicit multi-tool routing ensures both structured and unstructured sources are used

Databricks has none of these layers. Its agent generates SQL from raw schema introspection, searches documents with weaker retrieval, and orchestrates tools without explicit domain routing -- resulting in plausible-looking answers that consistently miss the mark on methodology, grounding, and decision impact.
