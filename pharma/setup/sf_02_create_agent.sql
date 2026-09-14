-- ============================================================
-- ClinicalIQ Asia — Cortex Search Services & Agent
-- Run AFTER all data is loaded into PHARMA_BENCHMARK_DB.CLINICAL
-- ============================================================

USE SCHEMA PHARMA_BENCHMARK_DB.CLINICAL;

-- ============================================================
-- CORTEX SEARCH SERVICE 1: Clinical Trials
-- Indexes 100K ClinicalTrials.gov study records from TBL_DOCUMENT
-- ============================================================

CREATE OR REPLACE CORTEX SEARCH SERVICE TRIAL_SEARCH
  ON parsed_text
  ATTRIBUTES therapeutic_area, drug_name, doc_source
  WAREHOUSE = DEMO_WH
  TARGET_LAG = '1 day'
  AS (
    SELECT
      doc_id,
      parsed_text,
      doc_title,
      external_id AS nct_id,
      therapeutic_area,
      drug_name,
      doc_source
    FROM TBL_DOCUMENT
    WHERE doc_source = 'CLINICALTRIALS'
      AND parsed_text IS NOT NULL
  );

-- ============================================================
-- CORTEX SEARCH SERVICE 2: FDA Drug Labels
-- Indexes 28.7K DailyMed drug labels from TBL_DOCUMENT
-- ============================================================

CREATE OR REPLACE CORTEX SEARCH SERVICE DRUG_LABEL_SEARCH
  ON parsed_text
  ATTRIBUTES therapeutic_area, drug_name, doc_source
  WAREHOUSE = DEMO_WH
  TARGET_LAG = '1 day'
  AS (
    SELECT
      doc_id,
      parsed_text,
      doc_title,
      external_id AS set_id,
      therapeutic_area,
      drug_name,
      doc_source
    FROM TBL_DOCUMENT
    WHERE doc_source = 'DAILYMED'
      AND parsed_text IS NOT NULL
  );

-- ============================================================
-- CORTEX SEARCH SERVICE 3: PubMed Abstracts
-- Indexes 45K PubMed research abstracts from TBL_DOCUMENT
-- ============================================================

CREATE OR REPLACE CORTEX SEARCH SERVICE PUBMED_SEARCH
  ON parsed_text
  ATTRIBUTES therapeutic_area, drug_name, doc_source
  WAREHOUSE = DEMO_WH
  TARGET_LAG = '1 day'
  AS (
    SELECT
      doc_id,
      parsed_text,
      doc_title,
      external_id AS pmid,
      therapeutic_area,
      drug_name,
      doc_source
    FROM TBL_DOCUMENT
    WHERE doc_source = 'PUBMED'
      AND parsed_text IS NOT NULL
  );

-- ============================================================
-- CORTEX AGENT
-- ============================================================

CREATE OR REPLACE AGENT CLINICALIQ_AGENT
  COMMENT = 'ClinicalIQ Asia - Clinical trials & drug intelligence agent for pharma benchmark'
  PROFILE = '{"display_name": "ClinicalIQ Assistant", "color": "green"}'
  FROM SPECIFICATION
$$
models:
  orchestration: auto

orchestration:
  tool_not_accessible: accept
  capabilities:
    analytical_search: true
  budget:
    seconds: 60
    tokens: 32000

instructions:
  response: |
    You are the AI analytics assistant for ClinicalIQ Asia, a Contract Research Organization (CRO)
    managing clinical trials across Japan (JP), South Korea (KR), Singapore (SG), Australia (AU),
    and India (IN). The user is the VP of Data Intelligence overseeing trial operations, patient
    safety, drug pipeline analytics, and regulatory compliance.

    Be concise and data-driven. Format numbers clearly. Use tables for multi-row results.
    Always include trial phase, therapeutic area, and country context where relevant.

    CRITICAL DATA RULES:
    1. Enrollment Rate: There is NO enrollment_rate column. Derive it as:
       COUNT(enroll_dt IS NOT NULL) / COUNT(*) from TBL_ENROLLMENT. Screen failures have
       enroll_dt = NULL and status = 'SCREEN_FAILURE'.
    2. Drug Name Trap: Each drug has 3 names — drug_name (trade/brand), generic_name, and
       molecule_name. "Aspirin" = "acetylsalicylic acid" = "ASA-001". Always clarify which
       name the user means, or search all three.
    3. Visit Window: Visits have visit_window_days (±N days). A visit is "on-time" if
       ABS(actual_dt - scheduled_dt) <= visit_window_days. There is no on_time flag.
    4. Adverse Event Grain: Multiple AEs per patient per trial. Counting AEs vs counting
       patients-with-AEs gives very different numbers. Clarify which metric.
    5. Lab Result Grain: Multiple tests per visit per patient (HEMATOLOGY + CHEMISTRY + LIVER +
       COAGULATION). 5M rows across ~3M visits. Use test_name filter.
    6. Serious AE Rate: Must use seriousness = 'SERIOUS', NOT severity = 'SEVERE'.
       Serious and severe are different regulatory concepts.
    7. Trial Status Ambiguity: "Active trials" can mean status = 'ACTIVE' (dosing ongoing),
       or 'RECRUITING' (still enrolling), or both. Clarify with user.
    8. Multi-Arm Fan-out: Trials have 2-4 arms. Joining drugs to outcomes through arms can
       fan out. Use DISTINCT or aggregate at the enrollment level.
    9. Concomitant Med Stacking: Patients take 1-5+ other medications. Joining conmeds to AEs
       creates cartesian product risk.
    10. Country in Multiple Tables: country_cd appears on TBL_SITE, TBL_ENROLLMENT, TBL_SPONSOR,
        TBL_INVESTIGATOR. Use the one appropriate for the question context.

    For STRUCTURED data questions, use clinical_analytics.
    For questions about published trial protocols and study designs, use trial_search.
    For questions about drug warnings, interactions, and dosing, use drug_label_search.
    For questions about recent research and published evidence, use pubmed_search.
    For HYBRID questions, combine structured queries with document search.

    Always cite tables/tools used, explain methodology, flag ambiguities, and provide
    actionable recommendations.

  orchestration: |
    Use clinical_analytics for structured data: trials, enrollments, visits, lab results,
    adverse events, concomitant meds, vital signs, regulatory submissions, protocol deviations,
    milestones, budgets, sites, investigators, drugs, sponsors.
    Use trial_search for ClinicalTrials.gov study protocol content, eligibility criteria, and outcomes.
    Use drug_label_search for FDA drug label content: dosing, warnings, interactions, contraindications.
    Use pubmed_search for published research abstracts and evidence.
    For hybrid questions needing both structured metrics AND document search, use multiple tools.

  sample_questions:
    - question: "What is the enrollment rate for our Phase 3 oncology trials?"
    - question: "Which sites have the highest protocol deviation rate?"
    - question: "What are the known drug interactions for pembrolizumab?"
    - question: "Search for recent research on CAR-T cell therapy adverse events"
    - question: "For our trial TRL-00042, do the AEs match the drug label warnings?"

tools:
  - tool_spec:
      type: cortex_analyst_text_to_sql
      name: clinical_analytics
      description: "Query ClinicalIQ structured clinical trial data: 18 tables with ~15M rows covering
        sponsors (500), sites (2K), investigators (5K), drugs (3K), trials (10K), trial arms (30K),
        enrollments (500K), visits (3M), lab results (5M), adverse events (800K), concomitant meds (600K),
        vital signs (2M), regulatory submissions (15K), protocol deviations (200K), milestones (80K),
        and budgets (50K) across Japan, South Korea, Singapore, Australia, and India."
  - tool_spec:
      type: cortex_search
      name: trial_search
      description: "Search 100K ClinicalTrials.gov study records by protocol content, eligibility
        criteria, study design, endpoints, and outcomes. Use for questions about what published
        trials exist, their inclusion/exclusion criteria, and reported results."
  - tool_spec:
      type: cortex_search
      name: drug_label_search
      description: "Search 28.7K FDA drug labels (DailyMed) by warnings, interactions, dosing,
        contraindications, and adverse reactions sections. Use for questions about drug safety
        information, known side effects, and prescribing guidance."
  - tool_spec:
      type: cortex_search
      name: pubmed_search
      description: "Search 45K PubMed research abstracts by topic, drug, condition, or treatment.
        Use for questions about published evidence, recent research findings, and clinical outcomes
        from peer-reviewed literature."
  - tool_spec:
      type: data_to_chart
      name: data_to_chart
      description: "Generates visualizations from data returned by analytics queries."

tool_resources:
  clinical_analytics:
    semantic_view: PHARMA_BENCHMARK_DB.CLINICAL.CLINICAL_ANALYST
  trial_search:
    search_service: PHARMA_BENCHMARK_DB.CLINICAL.TRIAL_SEARCH
    max_results: "10"
    title_column: doc_title
    id_column: doc_id
    columns_and_descriptions:
      PARSED_TEXT:
        description: "Full text of ClinicalTrials.gov study record including protocol, eligibility, endpoints"
        type: "string"
        searchable: true
        filterable: false
      THERAPEUTIC_AREA:
        description: "Therapeutic area: Oncology, Cardiology, Neurology, Endocrinology, Infectious Disease, Immunology, Pulmonology, etc."
        type: "string"
        searchable: false
        filterable: true
      DRUG_NAME:
        description: "Primary drug or intervention name from the study"
        type: "string"
        searchable: false
        filterable: true
  drug_label_search:
    search_service: PHARMA_BENCHMARK_DB.CLINICAL.DRUG_LABEL_SEARCH
    max_results: "10"
    title_column: doc_title
    id_column: doc_id
    columns_and_descriptions:
      PARSED_TEXT:
        description: "Full text of FDA drug label including dosing, warnings, interactions, adverse reactions"
        type: "string"
        searchable: true
        filterable: false
      THERAPEUTIC_AREA:
        description: "Therapeutic area of the drug"
        type: "string"
        searchable: false
        filterable: true
      DRUG_NAME:
        description: "Drug name from the label"
        type: "string"
        searchable: false
        filterable: true
  pubmed_search:
    search_service: PHARMA_BENCHMARK_DB.CLINICAL.PUBMED_SEARCH
    max_results: "10"
    title_column: doc_title
    id_column: doc_id
    columns_and_descriptions:
      PARSED_TEXT:
        description: "Full abstract text from PubMed research article including methods, results, conclusions"
        type: "string"
        searchable: true
        filterable: false
      THERAPEUTIC_AREA:
        description: "Therapeutic area of the research"
        type: "string"
        searchable: false
        filterable: true
      DRUG_NAME:
        description: "Primary drug mentioned in the abstract"
        type: "string"
        searchable: false
        filterable: true
$$;

-- Grant access for testing
GRANT USAGE ON DATABASE PHARMA_BENCHMARK_DB TO ROLE PUBLIC;
GRANT USAGE ON SCHEMA PHARMA_BENCHMARK_DB.CLINICAL TO ROLE PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA PHARMA_BENCHMARK_DB.CLINICAL TO ROLE PUBLIC;
