# ClinicalIQ Benchmark — 30 Hybrid Questions (Hardened)

**Benchmark for:** Snowflake Cortex Agent vs Databricks Supervisor Agent
**Design:** Every question is hybrid (structured + document search). No VQRs or sample queries on either side. Questions exploit known Databricks Genie/Supervisor weaknesses.

## Difficulty Design

### Tier Distribution
| Tier | Questions | Difficulty |
|------|-----------|------------|
| 3 | Q01-Q04 | Multi-table hybrid |
| 4 | Q05-Q10 | Derived metric + search |
| 5 | Q11-Q20 | Multi-step chain |
| 6 | Q21-Q30 | Synthesis / simulation |

### Exploit Pattern Map

| Weakness | Questions | Why Snowflake Wins |
|---|---|---|
| **3 Cortex Search services vs 1 Knowledge Assistant** | ALL Q01-Q30 | Every question requires document search; Snowflake routes to dedicated trial/drug/pubmed services while DBX has single Knowledge Assistant |
| **Deep multi-table joins (4-5 hops)** | Q01, Q05, Q07, Q08, Q14, Q15, Q18, Q20, Q21, Q23, Q25, Q28, Q30 | Typed relationships in semantic view name every join hop explicitly |
| **Multi-step CTE composition** | Q05, Q06, Q10, Q11, Q14, Q15, Q17, Q18, Q19, Q20, Q21, Q22, Q23, Q24, Q25, Q28, Q29 | Pre-defined metrics compose into CTEs; DBX must reconstruct from comment text |
| **Column traps under pressure** | Q01, Q02, Q05, Q06, Q07, Q11, Q13, Q15, Q21, Q25, Q27, Q28 | Structured facts (is_serious_ae, budget_overrun_rate) prevent column confusion |
| **Cross-tool synthesis** (SQL result to search) | ALL Q01-Q30 | Every question is hybrid; agent must orchestrate structured + document tools |
| **Negation patterns** (NOT EXISTS, exclusion) | Q02, Q09, Q12, Q14, Q19, Q22, Q26, Q28 | Labeled filters make negation clearer than parsing comment text |
| **Temporal comparison** | Q03, Q11, Q13, Q17, Q24, Q27 | Pre-defined temporal facts (is_compliant_visit, days_to_ae_resolution) |
| **Ambiguous column resolution** | Q01, Q03, Q04, Q07, Q17, Q25 | Dimensions are typed per-table; DBX has same column name on multiple tables |
| **Composite / normalized metrics** | Q15, Q21, Q25, Q28, Q30 | Multiple pre-defined metrics compose cleanly |
| **What-if simulation** | Q29 | Requires 5 sequential computations from different tables |

### Scoring Dimensions (1-5 each, max 30)
1. **Accuracy** - key numbers correct (within 5% tolerance)
2. **Groundedness** - grounded in data/documents, not hallucinated
3. **Relevance** - addresses the question asked
4. **Usefulness** - actionable and well-formatted
5. **Correctness** - methodology correct, traps avoided
6. **Decision Consequences** - safe for a decision-maker to act on

### Key Data Conventions
- **Enrolled-only denominator**: All patient-level analyses use ENROLL_DT IS NOT NULL (400,023 patients), not total screened (500,000)
- **Enrollment rate**: Derived from TBL_ENROLLMENT, never from TBL_TRIAL.ACTUAL_ENROLLMENT/TARGET_ENROLLMENT
- **Serious vs Severe**: seriousness='SERIOUS' (regulatory) vs severity='SEVERE' (clinical) - two different columns
- **Budget columns**: "spent/consumed" = ACTUAL_USD, "planned/budgeted" = PLANNED_USD
- **Protocol deviations**: "critical" = severity IN ('CRITICAL', 'MAJOR'), not just 'CRITICAL'
- **Visit compliance**: Per-visit visit_window_days, not a fixed window

---

## Questions

See TBL_EXPECTED_ANSWERS in PHARMA_BENCHMARK_DB.CLINICAL for full question text, expected answers, key numbers, and scoring rubrics.

| Q | Tier | Traps | Topic |
|---|------|-------|-------|
| Q01 | 3 | E,J,K | Phase 3 oncology enrollment in Japan + recruitment literature |
| Q02 | 3 | X,G,R | Serious-but-not-severe AEs + drug label examples |
| Q03 | 3 | F,T | Recruiting vs Active by therapeutic area + timeline literature |
| Q04 | 3 | J,K | Site quality across APAC + quality standards literature |
| Q05 | 4 | E,J,Q | Under-enrolled trials budget + under-enrollment cost literature |
| Q06 | 4 | W,Q | Severely late visits + data quality impact literature |
| Q07 | 4 | X,G,J | Serious/non-serious ratio by area + drug label warnings |
| Q08 | 4 | N,J | Approved drugs in active trials by generic name + PubMed |
| Q09 | 4 | A,J,R | Multi-arm non-placebo enrollment + design guidelines |
| Q10 | 4 | C,G,Q | Conmed polypharmacy SAE comparison + polypharmacy literature |
| Q11 | 5 | E,J,T,Q | Chronological portfolio split enrollment + trend literature |
| Q12 | 5 | X,G,J,R | Zero-SAE investigators + AE reporting variability literature |
| Q13 | 5 | W,E,J,T | Quarterly visit compliance trend + adherence literature |
| Q14 | 5 | J,Q,R | Sites with unsubmitted drugs (5-table NOT EXISTS) + regulatory lit |
| Q15 | 5 | G,J,Q | Combined safety burden (AE + deviations) + threshold benchmarks |
| Q16 | 5 | N,J,Q | Brand vs generic name + PubMed search by generic |
| Q17 | 5 | E,K,J,T | Country enrollment improvement (2500 vs 2500) + regulatory changes |
| Q18 | 5 | G,X,J,Q | Visits before SAE discontinuation vs completers + early signals |
| Q19 | 5 | J,Q,R | Trials with zero lab results + protocol design evidence |
| Q20 | 5 | A,G,J,Q | Experimental vs placebo SAE per trial + drug label warnings |
| Q21 | 6 | E,W,X,G,J,Q | 5-factor composite trial risk score + protocol complexity |
| Q22 | 6 | J,Q,T,R | Investigator top/bottom 5 completion + PubMed author search |
| Q23 | 6 | X,G,C,J,Q | Immunotherapy + corticosteroid interaction + literature |
| Q24 | 6 | J,Q,T | Zombie trials budget % of portfolio + termination guidance |
| Q25 | 6 | E,X,G,K,J,Q | Normalized APAC country site performance index + benchmarks |
| Q26 | 6 | J,Q,R | Drugs with no PubMed presence + regulatory cross-reference |
| Q27 | 6 | E,G,X,J,Q,T | Recruiting-to-active transition metrics + transition risk lit |
| Q28 | 6 | ALL | Triple red-flag report + remediation strategies |
| Q29 | 6 | ALL | What-if budget reallocation simulation + optimization cases |
| Q30 | 6 | ALL | Board-level executive summary (5 sections) + research intelligence |
