# Cortex Agent vs Databricks Genie — Competitive Benchmark Playbook

## Purpose
Guide for Snowflake SEs to build a competitive demo or PoC comparing **Snowflake Cortex Agent** against **Databricks Genie** using benchmark evaluations. Based on hard-won lessons from pharma (ClinicalIQ) and retail (RetailIQ) benchmarks.

---

## 1. What You Need

### 1.1 Structured Data (SQL Tables)
- **Minimum 8-12 tables** across dimension and fact tables
- **Minimum 5M+ total rows** (enough that agents can't brute-force scan)
- **Star or snowflake schema** with clear FK relationships — this is critical because multi-table joins are DBX Genie's weakest area

**Required table patterns:**
| Type | Example | Why |
|------|---------|-----|
| Dimension tables (3-4) | DIM_STORE, DIM_PRODUCT, DIM_SUPPLIER | Force joins to get attributes like country, category, quality |
| Core fact table | FACT_ORDER | Hub table connecting customers, stores, products |
| Detail fact table | FACT_ORDER_LINE | Line-level detail that must be joined to orders |
| Secondary fact tables (3-4) | FACT_RETURN, FACT_REVIEW, FACT_LOYALTY_TXN, FACT_INVENTORY | Require multi-hop joins to reach dimensions |
| Bridge/association table | FACT_PROMOTION (links products + stores) | Creates cartesian risk when joined naively |

### 1.2 Unstructured Data (Documents)
- **Minimum 3 document collections** with different content types
- **1,000+ documents minimum** (enough to need search, not just scan)
- **Must contain specific numbers/benchmarks** that questions reference

**Recommended collections:**
| Collection | Content | Purpose |
|------------|---------|---------|
| Product/entity descriptions | Detailed specs, features, ingredients | Tests entity-level document retrieval |
| Audit/compliance reports | Quality scores, findings, recommendations | Tests correlation between structured metrics and document findings |
| Industry research/benchmarks | Market data, KPIs, trends with specific numbers | Tests whether agent grounds answer in documents vs hallucinating benchmarks |

**Document format:** Plain .txt files work best. Each document should be 200-1000 words with specific numbers that can be verified. Batch into ~100-200 files for manageable upload.

### 1.3 Data Skew Requirements (CRITICAL)

**This is the #1 lesson: uniform data makes ALL benchmark questions useless.** When distributions are flat, the "wrong approach" gives the same answer as the correct one — there's nothing to differentiate.

**Required skews:**
| Dimension | What to Skew | Example | Why |
|-----------|-------------|---------|-----|
| Category-level rates | Return rates, defect rates | Apparel 30% vs Food 1% | Wrong joins produce category-average (~12%), huge gap from truth |
| Country-level penetration | Membership rates, completion rates | JP 95% vs IN 50% | Wrong-denominator error is 5% in JP but 50% in IN |
| Quality tiers | Supplier quality scores | 40% of suppliers below 2.0 | Tests multi-hop joins to reach supplier attributes |
| Transaction type mix | Loyalty txn types by country | Redemption: AU 43% vs IN 9% | Tests filtering + grouping accuracy |

**How to generate skewed data:** Use Python with numpy to control distributions per segment. Never use `random.choice()` with equal weights — always use `np.random.choice(p=[...])` with explicit probability vectors per country/category.

### 1.4 Structural Data Gaps (CRITICAL — #2 Lesson)

**Real-world data has holes.** Programs launch at different times in different markets. Systems aren't uniform. Regulations differ. Your benchmark data MUST have these gaps or agents will never be tested on them.

**Why gaps matter:** When a table has zero rows for a specific segment, an agent that blindly aggregates across all segments will produce wrong answers. An agent that understands the data gap will either flag it or exclude that segment correctly. This is the #1 proven differentiator from pharma benchmarks (+9 point gaps).

**Real-world examples and how to create them:**

| Gap | Real-World Reason | How to Create | Benchmark Impact |
|-----|-------------------|---------------|------------------|
| **Loyalty program not in all markets** | Bonus/referral programs launch market by market | Delete BONUS txn type for 2 countries | Agent includes zeros → deflates per-member averages |
| **No reviews for perishable products** | Review systems don't cover food/beverages | Delete reviews where category = Food | Agent counts 0 reviews as "no data" vs "bad product" |
| **Manual inventory in some markets** | Newer markets haven't digitized inventory | Delete inventory for 1 country | Agent includes that country with 0 inventory → wrong turnover |
| **Promo types vary by market** | BOGO not available in all countries | Delete BOGO promos for 2 countries | Agent averages promo effectiveness across markets with different type mix |
| **Return reason not tracked everywhere** | Some markets don't capture return reason | NULL out return_reason for 1 country | Agent's "top return reason" analysis excludes or miscounts that market |
| **Product lines not sold everywhere** | Regional product restrictions | Delete order lines for specific category+country | Agent's category revenue by country has zeros |
| **Different payment methods by market** | COD only in India, BNPL only in AU/SG | Already exists naturally | Agent must handle different payment mix |

**How to verify gaps work:** For each gap, compute the answer with and without the missing data. The "with gap" answer should differ by >20% from the "ignoring gap" answer. If the gap doesn't create a meaningful difference, it won't differentiate agents.

**Critical rule:** Gaps must be REALISTIC. An auditor or customer should look at the data and say "yes, this is how our data looks." Artificial/random deletions look fake and undermine credibility.

---

## 2. Proven DBX Failure Patterns

Ranked by reliability (most to least consistent):

### Tier 0 — Most Reliable (from pharma, +9 point gaps)

**0. Structural Data Gaps + Aggregation**
- When a table has ZERO rows for a specific segment (country, category, etc.)
- Agent that blindly aggregates includes zeros → wrong averages, wrong rankings
- Agent that understands gaps flags them or excludes correctly
- **Pharma proof:** Q02 (+9 gap) — some countries had zero lab results; Q04 (+9 gap) — double negation across tables with gaps
- **Retail example:** "What is the average review rating by category?" — Food & Beverage has zero reviews. Agent that includes it gets wrong category count. Agent that flags it scores higher.
- **Key requirement:** The gap must affect the ANSWER, not just be a missing data point nobody asks about
- **Observed gap:** +9 points (strongest pattern)

### Tier 1 — Reliable Failures (use these first)

**1. Multi-Table Join Failure (3+ hops)**
- DBX Genie struggles when the answer requires joining 3+ tables
- Example: "Return rate by product category" needs RETURN → ORDER_LINE → PRODUCT (3 hops)
- Example: "Supplier return cost" needs RETURN → ORDER_LINE → PRODUCT → SUPPLIER (4 hops)
- **Best results:** Questions where the join path isn't obvious from the question phrasing
- **Observed gap:** +7 points (SF 15, DBX 8)

**2. Document Grounding + Structured Data**
- Questions that need BOTH a SQL query AND a document search
- DBX has separate Genie (SQL) and Knowledge Assistant (docs) tools — combining results is weak
- Snowflake Cortex Agent natively combines Cortex Analyst (SQL) + Cortex Search (docs)
- **Best results:** "Calculate X from data, then search our research for industry benchmarks to compare"
- **Observed gap:** +5-7 points

**3. Cartesian Product Trap**
- When two metrics share a dimension key but come from different fact tables
- Example: "Promo spend per return by category" — must pre-aggregate promos and returns SEPARATELY, then join on category
- DBX may join raw tables, creating M×N cartesian explosion
- **Best results:** When the data skew makes cartesian answers obviously inflated (10-100x)
- **Observed gap:** +4-6 points

### Tier 2 — Sometimes Works

**4. Wrong Denominator**
- Agent uses total count instead of filtered subset
- Example: "Revenue per loyalty member" using all customers instead of only members
- **Only works if penetration varies significantly by segment** (e.g., IN 50% vs JP 95%)
- If penetration is uniform, wrong denominator gives same ranking — no trap
- **Observed gap:** +2-4 points (inconsistent)

**5. CTE Planning Failure**
- Questions requiring 4+ independent calculations combined into one summary
- Executive summary questions with multiple sub-queries
- **Works better** when each sub-query touches different tables
- **Observed gap:** +2-5 points

### Tier 3 — Unreliable

**6. Negation Blindness**
- "Customers who NEVER did X AND NEVER did Y"
- DBX often handles this by splitting into sub-queries
- **Only works** with double-negation (two NOT conditions)
- **Observed gap:** +0-2 points (DBX often gets this right)

**7. Metric Hallucination**
- Agent invents a formula instead of computing correctly
- Example: "Inventory turnover = COGS / avg inventory" — agent may use retail price instead of cost price
- **Unreliable** because both platforms may hallucinate
- **Observed gap:** +0-3 points

---

## 3. Question Phrasing That Creates Gaps

The exact wording of a question determines whether Snowflake wins, ties, or loses. Here are the proven phrasing patterns from live benchmark testing.

### Phrasing Patterns That Snowflake WINS (use these)

**Pattern A: "Are there any [entities] where [metric] CANNOT be calculated — and why?"**
- Forces the agent to detect structural data gaps (zero rows)
- Snowflake's Cortex Analyst uses LEFT JOINs guided by semantic view → detects zeros
- DBX Genie tends to use INNER JOINs → silently drops missing entities, or hallucinates values
- Example: "Are there any countries where inventory turnover CANNOT be calculated?"
- Example: "Are there any categories with NO customer reviews at all?"
- **Observed gap: +5 to +8 points**

**Pattern B: "Search our [research topic] for industry benchmarks to compare"**
- Forces the agent to combine structured SQL + unstructured document search
- Snowflake natively combines Cortex Analyst + Cortex Search in one agent context
- DBX routes to separate Genie + Knowledge Assistant sub-agents → loses coherence
- Example: "What is the return rate by category? Search our Return Rate Analysis research for industry benchmarks."
- **Observed gap: +5 to +7 points**

**Pattern C: Multi-table computation with pre-aggregation requirement**
- Questions where naive joins create cartesian products
- Snowflake's semantic view relationships guide correct join paths
- DBX Genie may join raw tables → inflated or deflated values (often exactly 3x off)
- Example: "Calculate promotion spend per returned item by category" (needs separate aggregation of promos and returns before dividing)
- **Observed gap: +6 to +8 points**

**Pattern D: Double negation across tables**
- "Members who NEVER did X AND NEVER did Y" where X and Y are in different tables
- Requires NOT EXISTS / LEFT JOIN IS NULL on two separate fact tables
- Works best when structural gaps make some segments have zero rows in one table
- Example: "Members who never redeemed points AND never wrote a review" (especially after deleting Food reviews)
- **Observed gap: +4 to +9 points (pharma)**

### Phrasing Patterns That TIE (avoid these)

**Anti-pattern 1: Explicit computation recipes**
- "Calculate X by dividing SUM(A) by COUNT(B) grouped by C"
- Both platforms follow explicit instructions well → tie
- Instead: phrase as business question — "What is the cost efficiency of our promotions?"

**Anti-pattern 2: Simple aggregation with obvious join**
- "What is the order completion rate by country?"
- Single join, single aggregation → DBX handles fine
- Instead: add a structural gap or document search component

**Anti-pattern 3: Questions where data is uniform**
- If return rates are 12% in every country, wrong-denominator trap produces same ranking
- The data MUST have skew for the trap to create different answers

### Phrasing Patterns That Snowflake LOSES (avoid these)

**Lose pattern 1: Ambiguous metric definition**
- "What is the average revenue per member?" — could mean per-row avg vs SUM/COUNT(DISTINCT)
- "Profitability = revenue - COGS - refunds" — multiple valid computation paths (which table for revenue? order-level or line-level? which refund statuses?)
- Semantic view guides agent to ONE approach; ground truth may assume a DIFFERENT valid approach
- Both produce defensible numbers but scorer penalizes the 5-10% difference
- **Real example (Q08):** SF computed store profit as $1.34M (JP), ground truth was $1.33M — only 1% off but other countries 5-10% off due to different aggregation order
- **Real example (Q06):** Question said "low vs high quality suppliers" — both platforms did binary split instead of 4 tiers because the phrasing was ambiguous
- Fix: be hyper-explicit in the question — "SUM of line_total", "simple average of cost_value across all rows", specify exact tier boundaries
- Fix: compute ground truth using the SAME approach the semantic view metrics would produce
- Fix: set scoring tolerance to 10% for complex multi-component calculations, not 5%

**Lose pattern 2: Missing semantic view relationships**
- If the semantic view lacks a join path, Cortex Analyst blocks the query entirely → scores 1
- DBX Genie infers joins from column names → scores higher
- **Real example:** SV had no relationships defined → SF scored 5/15 while DBX scored 15/15
- Fix: verify ALL required join paths exist before running benchmark
- Fix: run `GET_DDL('SEMANTIC VIEW', ...)` and check relationships section is not empty

**Lose pattern 3: Missing metrics in semantic view**
- If no SUM(LINE_TOTAL) metric exists, agent defaults to AVG → wrong by 80x
- If no COUNT(RETURN_ID) metric exists, agent can't compute return rates
- **Real example (Q03):** No SUM metric → agent computed $180/member instead of $12,700/member
- Fix: add SUM metrics for all key measures (revenue, refunds, quantity, points)
- Fix: add COUNT metrics for returns, reviews, loyalty transactions

**Lose pattern 4: Ground truth computed before data modifications**
- When structural gaps are added (deleting rows), ground truth for ALL questions shifts
- Scorer compares agent output against stale expected values → false failures
- **Real example (Q04):** Deleted Food reviews → dormant member count increased → SF was correct but scored 2 against stale ground truth
- Fix: recompute ALL ground truth after ANY data modification, not just affected questions

---

## 4. Question Design Principles

### DO:
- **Frame as business questions**, not computation recipes
  - Good: "Which categories are bleeding the most revenue to returns?"
  - Bad: "Compute SUM(refund_amount) / SUM(line_total) grouped by category"
- **Require both structured data AND document search** in the same question
  - Add: "Search our [topic] research for industry benchmarks to compare"
- **Target 3+ hop joins** — the farther the join path, the more likely DBX fails
- **Include data that has real skew** — flat data = no differentiation
- **Ask for rankings** — even if individual numbers are close, getting the order wrong is penalized

### DON'T:
- Don't ask explicit computation recipes — DBX follows instructions well
- Don't use simple negation (single NOT) — DBX splits into two queries
- Don't expect negative ground truth values — both platforms filter these as "bad data"
- Don't make questions so complex that BOTH platforms fail — the goal is differentiation
- Don't use VQRs/metric views that pre-compute the answer — tests raw capability

---

## 4. Scoring Framework

### Dimensions (each 1-5, total /15):
| Dimension | What It Measures |
|-----------|-----------------|
| **Accuracy** | Are the numbers correct? Within 5% of ground truth? |
| **Groundedness** | Did the agent use actual data (SQL queries, doc search) or hallucinate? |
| **Relevance** | Did the agent answer the actual question asked? |

### Scoring via LLM:
- Use Snowflake Cortex COMPLETE with Claude Sonnet for automated scoring
- Provide the question, expected answer with key numbers, agent output, and scoring rubric
- Score each dimension independently

### Ground Truth:
- **Always compute from the actual data** — never assume expected values
- Run the exact SQL query to verify before setting expected answers
- Include both "correct approach" and "wrong approach" values so the scorer can identify which path the agent took
- **Recompute after any data changes** — stale ground truth causes false failures

---

## 5. Platform Setup Checklist

### Snowflake Cortex Agent
1. Load structured data into tables
2. Upload documents to internal stage
3. Populate DOC_DOCUMENT table (read .txt files directly, skip PARSE_DOCUMENT for plain text)
4. Create Cortex Search service on DOC_DOCUMENT
5. Create Semantic View via Autopilot — then manually add:
   - All join relationships (especially multi-hop paths)
   - Key metrics: SUM(line_total), COUNT(DISTINCT customer_id), COUNT(return_id), SUM(refund_amount)
   - Descriptive comments on key columns (ORDER_STATUS values, SIGNUP_DT meaning)
6. Create Cortex Agent with both Analyst (semantic view) and Search tools
7. Add general instructions with data rules (COMPLETED filter, member definition, etc.)
8. **Do NOT add VQRs** — tests raw agent capability

### Databricks Genie
1. Load structured data into Unity Catalog tables
2. Load documents into a doc_document table
3. Create Genie Space with all tables
4. Add general instructions (same data rules as Snowflake)
5. Create metric views for pre-computed KPIs (Genie uses these for guidance)
6. Create Knowledge Assistant agent for document search
7. Create Supervisor agent that routes between Genie (SQL) and Knowledge Assistant (docs)
8. **Do NOT add sample queries** — tests raw agent capability

### Key Differences:
| Aspect | Snowflake | Databricks |
|--------|-----------|------------|
| SQL tool | Cortex Analyst (semantic view) | Genie (SQL space) |
| Doc search | Cortex Search (native) | Knowledge Assistant (separate agent) |
| Integration | Single agent, both tools | Supervisor routes between two sub-agents |
| Join guidance | Semantic view relationships | Metric views + instructions |

---

## 6. Retail Benchmark Results (Live Run — Sep 2026)

### Final Scorecard: Snowflake 195/210 (92.9%) vs Databricks 101/210 (48.1%)

| Q | SF | DBX | Gap | Pattern | What Happened |
|---|:---:|:---:|:---:|---------|---------------|
| Q01 | **15** | 7 | **+8** | structural gap | Food=0 reviews. SF detected with LEFT JOIN. DBX hallucinated rating of 3 for Food. |
| Q02 | 14 | **15** | -1 | multi-table + doc | DBX won. Both got return rates right; DBX had stronger doc grounding. |
| Q03 | **15** | 8 | **+7** | structural gap | SG=0 inventory. SF flagged correctly. DBX hallucinated turnover value for SG. |
| Q04 | **15** | 9 | **+6** | double negation | Never redeemed AND never reviewed. SF exact match. DBX stale data. |
| Q05 | **15** | 7 | **+8** | cartesian | Promo spend per return by category. DBX values 3x off (cartesian denominator). |
| Q06 | **15** | 6 | **+9** | structural gap | SG=0 inventory records. SF detected. DBX fabricated $273M for SG. |
| Q07 | **14** | 6 | **+8** | structural gap | Food=0 review coverage. SF identified. DBX missed the gap. |
| Q08 | **15** | 6 | **+9** | NULL detection | IN=100% NULL return reasons. SF detected. DBX hallucinated reasons for IN. |
| Q09 | **15** | 5 | **+10** | structural gap | SG=0 stockout data. SF flagged. DBX excluded SG silently. |
| Q10 | **15** | 5 | **+10** | NULL detection | IN NULL return reasons (explicit). SF detected. DBX fabricated breakdown. |
| Q11 | 9 | **10** | -1 | CTE planning | DBX won. SF confused two revenue sources ($72M vs $5B). |
| Q12 | **14** | 7 | **+7** | doc grounding | Supplier ratings + audit search. SF found audits. DBX returned "unable to find." |
| Q13 | **11** | 7 | **+4** | structural gap | SG/IN=0 BONUS txns. SF detected. DBX showed old data. |
| Q14 | **13** | 5 | **+8** | structural gap | IN/KR=0 BOGO promos. SF identified gap. DBX missed it. |

### Key Findings:
1. **Snowflake won 12 of 14 questions.** Average gap: +6.7 points per question.
2. **Structural gap detection was the strongest pattern** — Q06, Q09, Q10 scored +9 to +10 gaps.
3. **DBX's main failures:** Hallucinating data for missing segments (fabricating values instead of detecting zeros), cartesian joins (3x errors), and weak document grounding integration.
4. **SF's two losses (Q02, Q11)** were by only 1 point each — non-deterministic agent reasoning, not systemic weakness.
5. **DBX never scored above 10** on structural gap questions. SF scored 15 on 8 of 14 questions.

### Where SF Lost Points:
- **Q11 (9/15):** Agent computed correct $5B revenue but then used wrong $72M figure — confused `SUM(line_total)` with `SUM(total_amount)`. Also response truncated at 16K chars.
- **Q13 (11/15):** Correctly detected SG/IN missing BONUS but table data was empty in output.
- **Q14 (13/15):** Detected IN/KR missing BOGO but accuracy on spend figures was ~3pp off.

---

## 7. Running the Benchmark

### Evaluator App
- Next.js app deployed to Snowflake SPCS
- Domain switcher (pharma/retail) via query params
- Sends questions to both platforms in parallel
- Scores via Claude Sonnet through Cortex COMPLETE
- Stores results in TBL_BENCHMARK_RESULTS

### Recommended Flow:
1. Run all questions once on both platforms
2. Review results — identify where SF scored low
3. Tune semantic view (add metrics, fix join descriptions)
4. Re-run failed questions
5. Present final scorecard showing per-question gaps

### What to Present:
- Total score comparison (SF vs DBX out of N×15)
- Per-question breakdown highlighting failure patterns
- 2-3 side-by-side examples of "same question, different quality"
- Focus on: multi-table joins, document grounding, cartesian avoidance

---

## 7. Common Pitfalls

| Pitfall | How to Avoid |
|---------|-------------|
| Flat/uniform data distributions | Always verify skew before designing questions |
| Ground truth doesn't match actual data | Compute from SQL, not from Python generator assumptions |
| **Ground truth stale after data mods** | **Recompute ALL answers after ANY delete/update — cascading effects are real** |
| Semantic view missing joins | Run `GET_DDL('SEMANTIC VIEW', ...)` and verify relationships section |
| Semantic view missing SUM metrics | Add SUM(line_total), SUM(refund_amount), COUNT(return_id) explicitly |
| **Missing DIM_PRODUCT→DIM_SUPPLIER join** | **Most commonly forgotten — needed for all supplier analysis** |
| DBX Genie "no tables available" | Verify tables are added to Genie space after data reload |
| **DBX has stale data** | **Apply same structural gap DELETEs to both platforms before benchmarking** |
| Both platforms fail | Question is too hard — simplify or add hints in phrasing |
| Both platforms succeed | Add structural gap or doc search component to create differentiation |
| **Agent output truncated at 16K** | **Set column to VARCHAR(65000) and app substring to 64000** |
| **SF picks wrong revenue source** | **Both total_amount and SUM(line_total) exist — be explicit in question** |
| Scoring too strict/lenient | Calibrate: 5pp for percentages, 10% for dollars, accept tie-breaking in rankings |
| **Ambiguous metric definition** | **Be hyper-explicit: "SUM of line_total", "simple average of cost_value across all rows"** |

---

## 8. Extending to New Domains

This playbook works for any domain. The key ingredients are:

1. **Star schema with 3-4 hop join paths** (fact → detail → dimension → parent dimension)
2. **Unstructured corpus with verifiable numbers** (not generic text)
3. **Controlled data skew** on the dimensions that questions target
4. **Business-framed questions** that don't give away the computation method
5. **Ground truth computed from actual loaded data** (not assumed)

### Suggested domains:
- **Healthcare/Pharma**: Clinical trials, adverse events, drug efficacy (proven)
- **Retail/E-commerce**: Orders, returns, suppliers, inventory (proven)
- **Financial Services**: Transactions, risk scores, compliance, portfolio
- **Manufacturing**: Quality control, supply chain, defect rates, maintenance
- **Telecom**: Usage, churn, network events, customer service tickets
