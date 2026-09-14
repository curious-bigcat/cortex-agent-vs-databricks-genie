# ClinicalIQ Benchmark — 30 Hybrid Questions (Hardened)

**Benchmark for:** Snowflake Cortex Agent vs Databricks Supervisor Agent
**Design:** Every question is hybrid (structured + document search). Questions exploit known Databricks Genie/Supervisor weaknesses: multi-hop joins, derived metrics, ambiguous columns, negation logic, multi-step orchestration, and what-if simulation.

**Tier Key:** [3] Multi-table hybrid | [4] Derived metric + search | [5] Multi-step chain | [6] Synthesis/simulation
**Trap Key:** E=Enrollment derived, X=Serious vs Severe, W=Visit window, G=AE grain, N=Drug name, F=Status ambiguity, A=Arm fan-out, C=Conmed stacking, K=Country source, J=Multi-hop join, Q=Subquery/CTE, T=Temporal, R=Negation/exclusion

---

## Q01 [Tier 3, E, J]
> What percentage of patients are actually enrolled in our Phase 3 oncology trials running in Japan — based on where patients are physically located, not where the sponsor is headquartered? What do published studies say about oncology recruitment challenges specific to Japan?

**Why DBX fails:** Requires 3-table join (enrollment + trial + site/enrollment country). "Japan" is ambiguous — country_cd exists on TBL_SITE, TBL_ENROLLMENT, TBL_SPONSOR. Must use enrollment.country_cd. Enrollment rate must be derived.
**Expected:** ~80% for JP Phase 3 oncology + Japan recruitment literature. Must derive rate and use correct country source.
**Traps:** E, J, K | **Key numbers:** JP Phase3 oncology enrollment rate ~80%
**5/5:** Correct derived rate from enrollment.country_cd for JP, correct 3-table join, plus Japan oncology recruitment literature
**3/5:** Gets rate approximately right but uses site or sponsor country
**1/5:** Claims enrollment_rate column, wrong country source, no search

---

## Q02 [Tier 3, X, G, R]
> How many patients experienced an adverse event that was medically serious but NOT clinically severe? What percentage of all patients is this? Search for FDA drug label examples where an AE can be serious from a regulatory standpoint but mild in terms of patient symptoms.

**Why DBX fails:** Requires understanding that serious != severe (different columns). Must use seriousness='SERIOUS' AND severity != 'SEVERE'. Negation pattern.
**Expected:** 135,587 patients had serious-but-not-severe AEs (27.1% of 500K). Drug label evidence of mild-but-serious AEs.
**Traps:** X, G, R | **Key numbers:** 135587 patients, 27.1%
**5/5:** Correct count using both columns correctly with NOT logic, explains the distinction, plus label examples
**3/5:** Gets the concept but wrong column usage
**1/5:** Conflates serious and severe, no negation logic

---

## Q03 [Tier 3, F, T]
> How many trials are currently in the recruiting phase versus those already actively dosing patients, broken down by therapeutic area? Which therapeutic areas have the biggest imbalance between recruitment and active treatment? What does published literature show about recruitment timelines in those areas?

**Why DBX fails:** Must correctly distinguish RECRUITING vs ACTIVE status values. Requires computing a gap (RECRUITING count - ACTIVE count per area). Temporal comparison pattern.
**Expected:** Status breakdown by area with gap calculation + ClinicalTrials.gov timeline evidence.
**Traps:** F, T | **Key numbers:** ACTIVE=1957, RECRUITING=1490, gap varies by area
**5/5:** Both status counts per area, gap calculated, plus recruitment timeline literature
**3/5:** Counts correct but no gap analysis or no search
**1/5:** Combines ACTIVE+RECRUITING into one count

---

## Q04 [Tier 3, J, K]
> Across our five APAC markets, how do site quality scores compare? Which country has the most underperforming sites — specifically those rated below 3 out of 5? What does published research say about clinical trial site quality standards in Asia-Pacific?

**Why DBX fails:** Must aggregate quality_score from TBL_SITE by country_cd, then count sites below threshold. Two aggregations in one query.
**Expected:** Average quality per country + count of low-quality sites + APAC site quality literature.
**Key numbers:** Average quality scores per country, low-quality site counts
**5/5:** Both aggregations correct, identifies worst country, plus APAC quality literature
**3/5:** One aggregation correct, no threshold count
**1/5:** Wrong table for country, no search

---

## Q05 [Tier 4, E, J, Q]
> For trials that are struggling to enroll — say, below 70% of target — what does their budget situation look like? Are under-enrolling trials also the ones blowing their budgets? Search for published research on the financial consequences of under-enrollment in clinical trials.

**Why DBX fails:** Requires a subquery/CTE: first compute enrollment rate per trial (derived), then filter <70%, then join to budget data. Genie can't handle nested derived metric -> aggregation.
**Expected:** Trials with <70% enrollment rate -> their avg budget overrun + literature on under-enrollment cost impact.
**Traps:** E, J, Q | **Key numbers:** Under-enrolled trials' budget overrun
**5/5:** Correct CTE/subquery with derived enrollment rate, joined to budget, plus cost literature
**3/5:** Gets concept but wrong enrollment derivation
**1/5:** Can't construct the subquery pattern

---

## Q06 [Tier 4, W, Q]
> Beyond just being slightly outside the visit window, what percentage of patient visits are severely late — more than a week past the allowed window for that specific visit type? Which sites have the worst track record for severely late visits? What does published research say about how missed visit windows affect data quality?

**Why DBX fails:** Two-level derivation: first compute if visit is out of window (ABS(actual-scheduled) > visit_window_days), then filter for severely late (> visit_window_days + 7). Double-derived metric.
**Expected:** Severely late rate + worst sites + visit window literature.
**Traps:** W, Q | **Key numbers:** Severely late visit percentage
**5/5:** Correct double derivation using per-visit window_days, worst sites, plus impact literature
**3/5:** Uses fixed 7-day window ignoring visit_window_days
**1/5:** Looks for a late_visit column

---

## Q07 [Tier 4, X, G, J]
> Across our therapeutic areas, what is the ratio of medically serious adverse events to non-serious ones? Which therapeutic area has the highest proportion of serious events? For the worst area, look up the FDA drug labels for the drug classes we're using there — do the labels warn about high rates of serious events?

**Why DBX fails:** Must compute conditional ratio: COUNT(seriousness='SERIOUS') / COUNT(seriousness='NON_SERIOUS') per therapeutic area. Requires joining AE -> enrollment -> trial for therapeutic_area. TRAP: using severity instead of seriousness.
**Expected:** Ratio per area, highest area identified, plus drug label evidence.
**Traps:** X, G, J | **Key numbers:** Serious/non-serious ratio per area
**5/5:** Correct ratio with seriousness column, 3-table join, identifies highest area, plus label evidence
**3/5:** Uses severity instead, or wrong join path
**1/5:** Confuses columns, no ratio calculation

---

## Q08 [Tier 4, N, J]
> Which of our drugs have already received regulatory approval somewhere AND still have active clinical trials underway? List them by their generic names rather than brand names. Then search PubMed for recent publications about any of these drugs.

**Why DBX fails:** Requires joining TBL_DRUG -> TBL_REGULATORY_SUBMISSION (status='APPROVED') AND TBL_DRUG -> TBL_TRIAL (status IN ('ACTIVE','RECRUITING')). Intersection logic. Must return generic_name not drug_name.
**Expected:** Drugs meeting both criteria with generic names + PubMed evidence.
**Traps:** N, J | **Key numbers:** Drug count meeting both criteria
**5/5:** Correct intersection join, returns generic_name, plus PubMed publications
**3/5:** Gets drugs but uses trade name, or misses intersection
**1/5:** Wrong join, no name distinction

---

## Q09 [Tier 4, A, J, R]
> In our trials that have more than three treatment arms, what is the average number of patients enrolled per treatment arm — excluding the placebo groups? How do our multi-arm designs compare to what published trial design guidelines recommend?

**Why DBX fails:** Must count arms per trial (HAVING COUNT > 3), then average enrollment excluding arm_type='PLACEBO'. Requires GROUP BY -> HAVING -> filtered aggregation. Negation/exclusion pattern.
**Expected:** Average enrollment per non-placebo arm in multi-arm trials + protocol design evidence.
**Traps:** A, J, R | **Key numbers:** Avg enrollment per non-placebo arm in 4+ arm trials
**5/5:** Correct HAVING filter, excludes placebo, correct average, plus protocol evidence
**3/5:** Gets multi-arm filter but includes placebo
**1/5:** No HAVING clause, cartesian product

---

## Q10 [Tier 4, C, G, Q]
> Are patients who are on three or more concomitant medications experiencing more serious adverse events than those on fewer medications? What does the published literature say about polypharmacy risks in clinical trial settings?

**Why DBX fails:** Must first count conmeds per patient (GROUP BY enrollment_id HAVING COUNT >= 3), then compare SAE rates between groups. Subquery + conditional aggregation + conmed stacking trap.
**Expected:** SAE rate comparison between high vs low conmed patients + polypharmacy literature.
**Traps:** C, G, Q | **Key numbers:** SAE rates for 3+ conmeds vs <3
**5/5:** Correct subquery, avoids cartesian, compares groups correctly, plus polypharmacy literature
**3/5:** Gets concept but cartesian product inflates counts
**1/5:** Can't construct the comparison pattern

---

## Q11 [Tier 5, E, J, T, Q]
> Split our trial portfolio in half chronologically — the older half versus the newer half by when trials started. Are we getting better or worse at enrolling patients over time? What do published studies show about global enrollment trends over the past decade?

**Why DBX fails:** Must split trials by median start_dt (requires NTILE or subquery), compute enrollment rate for each half, then compare. Temporal + derived metric + subquery.
**Expected:** First-half vs second-half enrollment rates + global enrollment trend literature.
**Traps:** E, J, T, Q | **Key numbers:** Enrollment rate for early vs late trials
**5/5:** Correct temporal split, derived rates for both halves, trend comparison, plus literature
**3/5:** Gets rates but wrong split methodology
**1/5:** Can't construct temporal comparison

---

## Q12 [Tier 5, X, G, J, R]
> Which of our investigators have a completely clean safety record — zero serious adverse events across every trial they've led? How many patients have these investigators enrolled? Should we be impressed, or is their patient volume too small to draw conclusions? Search for research about how much investigators vary in their AE reporting patterns.

**Why DBX fails:** Requires LEFT JOIN from investigators -> trials -> enrollments -> AEs with IS NULL filter (negation). Must use seriousness='SERIOUS'. Must check if patient count is too low to be meaningful.
**Expected:** Zero-SAE investigators with patient counts + AE reporting variability literature.
**Traps:** X, G, J, R | **Key numbers:** Investigators with zero SAEs + their patient counts
**5/5:** Correct LEFT JOIN with NULL filter, uses seriousness, contextualizes patient count, plus reporting literature
**3/5:** Finds zero-AE investigators but uses severity, or doesn't contextualize
**1/5:** Can't construct the negation join

---

## Q13 [Tier 5, W, E, J, T]
> How has our visit compliance rate changed quarter over quarter? Are patients showing up for their scheduled visits on time more often or less often as our portfolio matures? What published studies exist about the factors that drive visit adherence in long-running clinical trials?

**Why DBX fails:** Must derive quarter from enroll_dt, compute visit compliance per quarter (using visit_window_days), and show trend. Temporal + derived metric + multi-table join.
**Expected:** Quarterly compliance rates showing trend + visit adherence literature.
**Traps:** W, E, J, T | **Key numbers:** Quarterly visit compliance rates
**5/5:** Correct quarterly derivation, window-based compliance, trend analysis, plus adherence literature
**3/5:** Gets compliance but wrong temporal grouping
**1/5:** Uses fixed window, no temporal analysis

---

## Q14 [Tier 5, J, Q, R]
> Are there any sites in our network that are actively running trials for drugs that have never been submitted to any regulatory authority? Does this represent a regulatory gap we should worry about? Search for what the regulatory requirements are in the countries where these sites operate.

**Why DBX fails:** Requires chaining: site -> trial -> trial_arm -> drug -> regulatory_submission, then finding sites where the drug has no submission. NOT EXISTS / LEFT JOIN IS NULL across 5 tables.
**Expected:** Sites with regulatory gaps identified + country regulatory requirement literature.
**Traps:** J, Q, R | **Key numbers:** Sites with no regulatory submission for their drugs
**5/5:** Correct 5-table chain with NOT EXISTS, identifies gap, plus regulatory requirement literature
**3/5:** Finds some gaps but wrong join path
**1/5:** Can't construct the multi-hop negation

---

## Q15 [Tier 5, G, J, Q]
> Which therapeutic areas carry the heaviest combined safety burden when you look at both serious adverse events and critical protocol deviations together, normalized per 100 enrolled patients? What do published benchmarks say about acceptable safety burden thresholds?

**Why DBX fails:** Must compute a composite metric from TWO source tables (AEs + deviations), each joined through different paths to therapeutic area, then normalize by enrollment. Complex multi-source aggregation.
**Expected:** Combined safety burden per area + published threshold benchmarks.
**Traps:** G, J, Q | **Key numbers:** Safety burden per therapeutic area
**5/5:** Correct composite from both AE and deviation tables, normalized per 100 patients, plus threshold literature
**3/5:** Gets one component but not the composite
**1/5:** Can't combine two sources into one metric

---

## Q16 [Tier 5, N, J, Q]
> How many of our drugs have a brand name that differs from their generic name, and of those, how many are in active trials right now? Search PubMed specifically for the generic names of these drugs — are they well-represented in the scientific literature?

**Why DBX fails:** Must filter drugs where drug_name != generic_name, join to active trials, then use the generic_name for document search. Name disambiguation + cross-tool handoff with specific field.
**Expected:** Drug count + PubMed search results using generic names specifically.
**Traps:** N, J, Q | **Key numbers:** Drugs with different trade/generic names in active trials
**5/5:** Correct name comparison, active trial join, searches PubMed by generic name, well-connected
**3/5:** Finds drugs but searches by trade name
**1/5:** No name distinction, no cross-tool handoff

---

## Q17 [Tier 5, E, K, J, T]
> Looking at our earliest 2,500 trials versus our most recent 2,500, which country has shown the biggest improvement in enrollment rates? What might explain that improvement? Search for any regulatory changes or infrastructure investments in that country that could account for the gains.

**Why DBX fails:** Must split trials into earliest and latest 2,500 (ROW_NUMBER or LIMIT+OFFSET), compute enrollment rate per country for each group, then calculate delta. Complex temporal windowing.
**Expected:** Country with biggest improvement + literature about what changed.
**Traps:** E, K, J, T | **Key numbers:** Enrollment rate improvement by country
**5/5:** Correct temporal split with window function, per-country rates, identifies biggest improver, plus contextual literature
**3/5:** Gets rates but wrong split
**1/5:** Can't construct windowed comparison

---

## Q18 [Tier 5, G, X, J, Q]
> When a patient has a serious adverse event that leads to them being taken off treatment, how many visits had they typically completed before that happened? How does that compare to patients who made it all the way through the trial? Search for research about whether visit patterns can predict early safety signals.

**Why DBX fails:** Must join AE (seriousness='SERIOUS', action_taken='DISCONTINUED') -> enrollment -> visits, count visits before AE onset_dt. Then separately count visits for completed patients. Two parallel aggregation paths.
**Expected:** Avg visits before SAE-discontinuation vs avg visits for completers + early detection literature.
**Traps:** G, X, J, Q | **Key numbers:** Avg visits before discontinuation vs completion
**5/5:** Correct join chain with date filtering, both groups compared, plus detection literature
**3/5:** Gets one group but not the comparison
**1/5:** Wrong AE filter, can't construct the before-date logic

---

## Q19 [Tier 5, J, Q, R]
> Do we have any trials where not a single patient has any lab results on file? Is that because those trials don't require labs by design, or is it a data quality issue? Search for the study designs of these trials to determine if labs were expected.

**Why DBX fails:** Requires LEFT JOIN from trials -> enrollments -> lab_results, then filtering trials where ALL patients have NULL labs. NOT EXISTS at the trial level across 3 tables.
**Expected:** Trials with no lab data + ClinicalTrials.gov protocol evidence about their design.
**Traps:** J, Q, R | **Key numbers:** Trials with zero lab results
**5/5:** Correct LEFT JOIN with aggregate NULL check, identifies trials, searches their specific protocols
**3/5:** Finds some trials but wrong approach (checks individual patients not all)
**1/5:** Can't construct trial-level absence check

---

## Q20 [Tier 5, A, G, J, Q]
> In how many of our trials does the experimental treatment arm have a higher serious AE rate than the placebo arm? Which drugs are the worst offenders? Search the drug labels for those drugs — do the labels warn about these safety signals?

**Why DBX fails:** Must compute SAE rate per arm per trial (4-table join), then compare experimental vs placebo within each trial. PIVOT-like logic within groups. Arm fan-out trap.
**Expected:** Per-trial arm comparison + drug label evidence for worst performers.
**Traps:** A, G, J, Q | **Key numbers:** Count of trials where experimental > placebo SAE rate
**5/5:** Correct per-arm SAE rate, within-trial comparison, identifies worst, plus drug label evidence
**3/5:** Gets SAE rates but doesn't compare within trial
**1/5:** Cartesian product from arm fan-out

---

## Q21 [Tier 6, E, W, X, G, J, Q]
> Build a composite risk score for each trial by combining five factors: how far behind they are on enrollment targets, their visit compliance rate, whether their serious AE rate is above the portfolio average, how much they've exceeded their budget, and how many days their milestones are delayed. Which trials are the riskiest overall? For the top 3, search their published protocols for indicators of design complexity that might explain the problems.

**Why DBX fails:** Five derived metrics, each from different tables, must be computed per trial, normalized, and composited. This is essentially a 5-CTE query that Genie cannot construct.
**Expected:** Composite risk scores + protocol evidence for top 3 riskiest.
**Traps:** E, W, X, G, J, Q | **Key numbers:** Five metrics composited, top 3 riskiest trials
**5/5:** All 5 metrics correctly derived and composited, top 3 ranked, plus protocol evidence
**3/5:** Gets 3+ metrics but composite is wrong
**1/5:** Fewer than 3 metrics, no composite

---

## Q22 [Tier 6, J, Q, T, R]
> Which investigators have the best and worst track records in terms of bringing trials to successful completion versus having them terminated or withdrawn? Only consider investigators who have led at least 3 trials so we have a meaningful sample. Who are our top 5 and bottom 5? For the bottom 5, search PubMed for their publication history — are they publishing despite poor trial outcomes?

**Why DBX fails:** Requires GROUP BY investigator with HAVING COUNT >= 3, conditional aggregation (CASE WHEN status = 'COMPLETED'), then ranking. Plus NOT IN exclusion + TOP/BOTTOM selection.
**Expected:** Success rates with exclusion filter, ranked, plus publication search for bottom performers.
**Traps:** J, Q, R | **Key numbers:** Top 5 and bottom 5 investigators by success rate
**5/5:** Correct conditional aggregation, HAVING filter, both top and bottom, plus PubMed author search
**3/5:** Gets success rate but no minimum threshold
**1/5:** Wrong aggregation, no ranking

---

## Q23 [Tier 6, X, G, C, J, Q]
> Among our patients on immunotherapy drugs who are also taking anticoagulant medications concurrently, is their serious AE rate higher than immunotherapy patients who are NOT on anticoagulants? What does the published literature say about known interactions between immunotherapy and anticoagulants?

**Why DBX fails:** Requires: drug -> trial_arm -> enrollment -> conmeds (filter anticoagulant) -> AEs. Must compare two groups (with vs without anticoagulants). 5-table join + conditional grouping + conmed stacking trap.
**Expected:** SAE rate comparison between groups + interaction literature.
**Traps:** X, G, C, J, Q | **Key numbers:** SAE rates for immunotherapy + anticoagulant vs without
**5/5:** Correct multi-table join, avoids conmed cartesian, compares groups with seriousness, plus interaction literature
**3/5:** Gets concept but cartesian inflates numbers
**1/5:** Wrong join path, confuses severity/seriousness

---

## Q24 [Tier 6, J, Q, T]
> How many of our trials have been running for more than two years past their planned end date and still haven't completed? How much of our total portfolio budget is tied up in these zombie trials? Search for published guidance on when sponsors should pull the plug on under-performing trials.

**Why DBX fails:** Must compute DATEDIFF(CURRENT_DATE, target_end_dt) > 730 AND status != 'COMPLETED'. Then aggregate budget for these trials as a percentage of total portfolio budget. Temporal filtering + percentage-of-total pattern.
**Expected:** Zombie trial count + budget percentage + termination guidance literature.
**Traps:** J, Q, T | **Key numbers:** Zombie trial count, % of total budget
**5/5:** Correct temporal filter, budget as percentage of total, plus termination literature
**3/5:** Finds overdue trials but wrong budget calculation
**1/5:** Can't construct the temporal + budget comparison

---

## Q25 [Tier 6, E, X, G, K, J, Q]
> Rank our APAC countries by overall site performance, combining enrollment rates, visit compliance, and safety record (where fewer serious AEs is better) into a single normalized index. Which country has the best-performing sites? How does this compare to published benchmarks for site performance in Asia-Pacific clinical trials?

**Why DBX fails:** Three derived metrics per country, each requiring different multi-table joins, then normalization to 0-1 range (MIN-MAX scaling), then composite. Inverse metric (lower = better) adds complexity.
**Expected:** Country-level composite index + APAC benchmark literature.
**Traps:** E, X, G, K, J, Q | **Key numbers:** Normalized site performance index per country
**5/5:** All 3 metrics correctly derived, normalized 0-1, inverse SAE handled, plus benchmarks
**3/5:** Gets raw metrics but no normalization
**1/5:** Fewer than 2 metrics correct

---

## Q26 [Tier 6, J, Q, R, T]
> Are there any drugs in our active trial portfolio that have never been mentioned in any PubMed abstract in our document collection? Are these truly novel compounds, or are they just under-studied? What is their regulatory submission status?

**Why DBX fails:** Must join structured drug data to document search results — check which drugs from TBL_DRUG have NO matching PubMed documents. This requires the agent to query structured data, search documents, then compute the SET DIFFERENCE. True cross-tool synthesis.
**Expected:** Drugs with no PubMed mentions + regulatory status context.
**Traps:** J, Q, R | **Key numbers:** Count of drugs with no PubMed presence
**5/5:** Correctly identifies drugs from structured data, searches PubMed for each, finds gaps, cross-references regulatory
**3/5:** Searches PubMed but doesn't systematically identify gaps
**1/5:** Only uses one tool, no cross-reference

---

## Q27 [Tier 6, E, G, X, J, Q, T]
> For trials that transitioned from the recruiting phase into active treatment, how did enrollment metrics, adverse event rates, and visit compliance change before versus after that transition? Are the early months of active treatment riskier than the recruitment phase? Search for research about transition period risks in clinical trials.

**Why DBX fails:** Must partition data by time (before/after status change), compute 3 metrics for each period per trial. Requires understanding trial lifecycle temporal boundaries. Extremely complex temporal partitioning.
**Expected:** Before/after metrics for the transition period + transition risk literature.
**Traps:** E, G, X, J, Q, T | **Key numbers:** Metrics before vs after transition
**5/5:** Correct temporal partitioning, all 3 metrics for both periods, plus transition risk literature
**3/5:** Gets concept but wrong temporal boundaries
**1/5:** Can't construct the temporal partition

---

## Q28 [Tier 6, all traps]
> Prepare a red-flag report for our portfolio. I need three things: (1) which sites have both poor enrollment — below 60% of target — and excessive protocol deviations, more than 50 per 100 patients? (2) which drugs have a serious adverse event rate above 40% of patients AND have had regulatory submissions rejected? (3) which trials have both a budget overrun exceeding 20% and more than 3 milestones delayed? For each category of red flags, search published literature for remediation strategies.

**Why DBX fails:** Three parallel complex queries, each with compound AND conditions across multiple tables, then results from all three synthesized with document search. This is 3 CTEs + 3 document searches in one answer.
**Expected:** Three red flag lists + remediation literature for each.
**Traps:** E, X, G, J, Q, R | **Key numbers:** Counts for each red flag category
**5/5:** All 3 red flag queries correct, compound conditions right, plus targeted remediation literature
**3/5:** Gets 1-2 categories right
**1/5:** Can't construct compound conditions

---

## Q29 [Tier 6, all traps]
> Here's a what-if scenario: if we took the wasted budget from our 10 most over-budget terminated trials and reinvested it into additional patient enrollment at our 10 best-performing sites, how many extra patients could we realistically enroll based on the per-patient cost at those sites? Would that meaningfully move the needle on our overall portfolio enrollment rate? Search for published case studies about budget reallocation and portfolio optimization in clinical development.

**Why DBX fails:** Pure what-if simulation requiring: (1) identify 10 most over-budget terminated trials + their excess spend, (2) identify top 10 sites by performance, (3) compute cost-per-patient at those sites, (4) divide excess budget by cost-per-patient for additional patients, (5) recalculate portfolio enrollment rate. Five sequential computations.
**Expected:** Quantified what-if with specific numbers + portfolio optimization literature.
**Traps:** E, J, Q, T | **Key numbers:** Excess budget, additional patients, new enrollment rate
**5/5:** All 5 computation steps correct, quantified impact, plus optimization case studies
**3/5:** Gets budget and sites but simulation incomplete
**1/5:** Can't handle the what-if chain

---

## Q30 [Tier 6, all traps]
> Prepare a board-level executive summary of our clinical portfolio with hard numbers, not just narratives. Cover: (1) portfolio health — enrollment rates by phase and country with trends over time, (2) safety — our serious AE rates versus what published drug labels cite as expected, (3) operations — which sites are performing best and worst based on quality scores and protocol adherence, (4) regulatory pipeline — what percentage of our submissions are getting approved and how long is the process taking, (5) research intelligence — the most important findings from published research relevant to our therapeutic areas. Give me specific numbers for everything.

**Why DBX fails:** Requires 5 parallel complex queries each requiring derived metrics and multi-table joins, PLUS multi-source document search, all synthesized into executive format. This is the ultimate stress test — no agent should get a perfect score.
**Expected:** All 5 sections with specific numbers + grounded research insights.
**Traps:** ALL | **Key numbers:** All major metrics from the portfolio
**5/5:** All 5 sections with correct derived metrics, specific numbers, published evidence, executive format
**3/5:** Covers 3 sections well
**1/5:** Shallow summary without specific numbers

---

## Databricks Failure Pattern Map

| Pattern | Questions That Exploit It |
|---------|--------------------------|
| **Multi-hop join (3+ tables)** | Q01, Q05, Q07, Q08, Q14, Q15, Q18, Q20, Q21, Q23, Q25, Q28, Q30 |
| **Derived metric (CASE WHEN)** | Q01, Q02, Q05, Q06, Q07, Q11, Q13, Q15, Q21, Q25, Q27, Q28 |
| **Subquery/CTE required** | Q05, Q06, Q10, Q11, Q14, Q15, Q17, Q18, Q19, Q20, Q21, Q22, Q23, Q24, Q25, Q28, Q29 |
| **Negation/exclusion** | Q02, Q09, Q12, Q14, Q19, Q22, Q26, Q28 |
| **Temporal comparison** | Q03, Q11, Q13, Q17, Q24, Q27 |
| **Ambiguous column resolution** | Q01, Q03, Q04, Q07, Q17, Q25 |
| **Cross-tool synthesis** | ALL (every question is hybrid) |
| **What-if simulation** | Q29 |
| **Composite/normalized metrics** | Q15, Q21, Q25, Q28, Q30 |
