-- ============================================================
-- ClinicalIQ Asia — Pharma & Clinical Trials Benchmark
-- Database: PHARMA_BENCHMARK_DB.CLINICAL
-- Tables: 16 structured + 1 document table = 17
-- Target: ~11.8M structured rows + 173K real public documents
-- ============================================================

CREATE DATABASE IF NOT EXISTS PHARMA_BENCHMARK_DB;
CREATE SCHEMA IF NOT EXISTS PHARMA_BENCHMARK_DB.CLINICAL;
USE SCHEMA PHARMA_BENCHMARK_DB.CLINICAL;

-- Stages
CREATE STAGE IF NOT EXISTS CSV_LOAD
  FILE_FORMAT = (TYPE=CSV FIELD_OPTIONALLY_ENCLOSED_BY='"' SKIP_HEADER=1 NULL_IF=('None','NULL',''));

CREATE STAGE IF NOT EXISTS CLINICAL_DOCS
  DIRECTORY = (ENABLE = TRUE)
  ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
  COMMENT = 'ClinicalTrials.gov studies, DailyMed drug labels, PubMed abstracts';

-- ============================================================
-- ORGANIZATIONAL
-- ============================================================

CREATE OR REPLACE TABLE TBL_SPONSOR (
    sponsor_id      VARCHAR(10)   PRIMARY KEY,    -- SPO-0001
    sponsor_name    VARCHAR(200)  NOT NULL,       -- TRAP: same company has multiple names (trade vs legal vs abbreviation)
    sponsor_type    VARCHAR(20)   NOT NULL,       -- PHARMA, BIOTECH, CRO, ACADEMIC, GOVERNMENT
    country_cd      VARCHAR(2)    NOT NULL,       -- JP, KR, SG, AU, IN
    city            VARCHAR(100),
    therapeutic_focus VARCHAR(50),                 -- primary therapeutic area
    annual_rd_budget_usd NUMBER(14,2),
    founded_yr      INT,
    is_active       BOOLEAN       DEFAULT TRUE
);

CREATE OR REPLACE TABLE TBL_SITE (
    site_id         VARCHAR(10)   PRIMARY KEY,    -- SIT-0001
    site_name       VARCHAR(200)  NOT NULL,
    institution     VARCHAR(200),                 -- hospital/university name
    country_cd      VARCHAR(2)    NOT NULL,
    city            VARCHAR(100),
    site_type       VARCHAR(20),                  -- HOSPITAL, CLINIC, ACADEMIC_CENTER, COMMUNITY
    bed_count       INT,
    annual_capacity_patients INT,
    quality_score   NUMBER(3,1),                  -- 1.0 - 5.0 (latest audit)
    is_active       BOOLEAN       DEFAULT TRUE
);

CREATE OR REPLACE TABLE TBL_INVESTIGATOR (
    investigator_id VARCHAR(10)   PRIMARY KEY,    -- INV-0001
    investigator_name VARCHAR(100) NOT NULL,
    credential      VARCHAR(20),                  -- MD, PhD, MD/PhD, PharmD
    specialty       VARCHAR(50),                  -- Oncology, Cardiology, Neurology, etc.
    site_id         VARCHAR(10),
    country_cd      VARCHAR(2)    NOT NULL,
    years_experience INT,
    trials_led      INT           DEFAULT 0,
    publications    INT           DEFAULT 0
);

CREATE OR REPLACE TABLE TBL_DRUG (
    drug_id         VARCHAR(10)   PRIMARY KEY,    -- DRG-0001
    drug_name       VARCHAR(200)  NOT NULL,       -- TRAP: trade name (brand)
    generic_name    VARCHAR(200),                 -- TRAP: same drug, different name
    molecule_name   VARCHAR(200),                 -- TRAP: third name variant
    drug_class      VARCHAR(50)   NOT NULL,       -- Immunotherapy, Chemotherapy, Small Molecule, Biologic, etc.
    mechanism       VARCHAR(100),                 -- PD-1 inhibitor, EGFR inhibitor, etc.
    therapeutic_area VARCHAR(50)  NOT NULL,        -- Oncology, Cardiology, Neurology, Infectious Disease, etc.
    route           VARCHAR(20),                  -- ORAL, IV, SC, IM, TOPICAL
    approval_status VARCHAR(20)   NOT NULL,       -- APPROVED, INVESTIGATIONAL, PHASE1, PHASE2, PHASE3, WITHDRAWN
    sponsor_id      VARCHAR(10),
    first_approval_dt DATE,
    nct_id          VARCHAR(20)                   -- links to ClinicalTrials.gov
);

-- ============================================================
-- TRIAL MANAGEMENT
-- ============================================================

CREATE OR REPLACE TABLE TBL_TRIAL (
    trial_id        VARCHAR(15)   PRIMARY KEY,    -- TRL-00001
    nct_id          VARCHAR(20),                  -- NCT number (links to ClinicalTrials.gov docs)
    trial_title     VARCHAR(500)  NOT NULL,
    phase           VARCHAR(10)   NOT NULL,       -- PHASE1, PHASE1_2, PHASE2, PHASE2_3, PHASE3, PHASE4
    status          VARCHAR(20)   NOT NULL,       -- RECRUITING, ACTIVE, COMPLETED, TERMINATED, SUSPENDED, WITHDRAWN
    therapeutic_area VARCHAR(50)  NOT NULL,
    indication      VARCHAR(200),                 -- specific disease target
    sponsor_id      VARCHAR(10)   NOT NULL,
    lead_investigator_id VARCHAR(10),
    start_dt        DATE          NOT NULL,
    target_end_dt   DATE,
    actual_end_dt   DATE,
    target_enrollment INT,
    actual_enrollment INT,
    num_sites       INT,
    num_countries   INT,
    is_randomized   BOOLEAN       DEFAULT TRUE,
    is_blinded      VARCHAR(20),                  -- OPEN, SINGLE_BLIND, DOUBLE_BLIND
    primary_endpoint VARCHAR(500),
    study_design    VARCHAR(100)                  -- PARALLEL, CROSSOVER, SINGLE_ARM
);

CREATE OR REPLACE TABLE TBL_TRIAL_ARM (
    arm_id          VARCHAR(15)   PRIMARY KEY,    -- ARM-00001
    trial_id        VARCHAR(15)   NOT NULL,
    arm_name        VARCHAR(100)  NOT NULL,       -- Treatment A, Placebo, Standard of Care
    arm_type        VARCHAR(20)   NOT NULL,       -- EXPERIMENTAL, ACTIVE_COMPARATOR, PLACEBO, SOC
    drug_id         VARCHAR(10),                  -- NULL for placebo arms
    dose            VARCHAR(50),                  -- 200mg, 10mg/kg, etc.
    frequency       VARCHAR(50),                  -- QD, BID, Q2W, Q3W, etc.
    target_n        INT,
    actual_n        INT
);

CREATE OR REPLACE TABLE TBL_ENROLLMENT (
    enrollment_id   VARCHAR(15)   PRIMARY KEY,    -- ENR-000001
    trial_id        VARCHAR(15)   NOT NULL,
    arm_id          VARCHAR(15)   NOT NULL,
    site_id         VARCHAR(10)   NOT NULL,
    patient_id      VARCHAR(15)   NOT NULL,       -- PAT-000001
    screen_dt       DATE          NOT NULL,
    enroll_dt       DATE,                         -- NULL = screen failure (TRAP: must derive enrollment rate)
    randomize_dt    DATE,
    withdrawal_dt   DATE,                         -- NULL = still active
    withdrawal_reason VARCHAR(50),                -- AE, CONSENT_WITHDRAWN, LOST_TO_FOLLOW_UP, PHYSICIAN_DECISION, PROTOCOL_VIOLATION
    status          VARCHAR(20)   NOT NULL,       -- SCREENED, ENROLLED, RANDOMIZED, COMPLETED, WITHDRAWN, SCREEN_FAILURE
    country_cd      VARCHAR(2)    NOT NULL
);

CREATE OR REPLACE TABLE TBL_VISIT (
    visit_id        VARCHAR(15)   PRIMARY KEY,    -- VIS-0000001
    enrollment_id   VARCHAR(15)   NOT NULL,
    trial_id        VARCHAR(15)   NOT NULL,
    visit_name      VARCHAR(50)   NOT NULL,       -- Screening, Day 1, Week 4, Week 8, End of Treatment, Follow-up
    visit_number    INT           NOT NULL,
    scheduled_dt    DATE          NOT NULL,
    actual_dt       DATE,                         -- NULL = missed visit
    visit_status    VARCHAR(20)   NOT NULL,       -- SCHEDULED, COMPLETED, MISSED, CANCELLED
    visit_window_days INT         DEFAULT 3        -- TRAP: ±N days defines "on time" vs "out of window"
);

-- ============================================================
-- CLINICAL DATA
-- ============================================================

CREATE OR REPLACE TABLE TBL_LAB_RESULT (
    lab_id          VARCHAR(20)   PRIMARY KEY,    -- LAB-00000001
    visit_id        VARCHAR(15)   NOT NULL,
    enrollment_id   VARCHAR(15)   NOT NULL,
    test_name       VARCHAR(50)   NOT NULL,       -- ALT, AST, Creatinine, WBC, Hemoglobin, Platelets, etc.
    test_category   VARCHAR(30),                  -- HEMATOLOGY, CHEMISTRY, LIVER, RENAL, COAGULATION
    result_value    NUMBER(12,4),
    result_unit     VARCHAR(20),                  -- mg/dL, U/L, cells/uL, g/dL, etc.
    ref_range_low   NUMBER(12,4),
    ref_range_high  NUMBER(12,4),
    is_abnormal     BOOLEAN,                      -- TRAP: must derive from value vs ref range, OR use this flag
    is_clinically_significant BOOLEAN DEFAULT FALSE,
    collected_dt    DATE          NOT NULL
);

CREATE OR REPLACE TABLE TBL_ADVERSE_EVENT (
    ae_id           VARCHAR(15)   PRIMARY KEY,    -- AE-000001
    enrollment_id   VARCHAR(15)   NOT NULL,
    trial_id        VARCHAR(15)   NOT NULL,
    drug_id         VARCHAR(10),
    ae_term         VARCHAR(200)  NOT NULL,       -- MedDRA preferred term
    ae_category     VARCHAR(50),                  -- SOC: Gastrointestinal, Nervous system, Skin, etc.
    severity        VARCHAR(10)   NOT NULL,       -- MILD, MODERATE, SEVERE
    seriousness     VARCHAR(20)   NOT NULL,       -- SERIOUS, NON_SERIOUS
    causality       VARCHAR(20)   NOT NULL,       -- RELATED, POSSIBLY_RELATED, UNLIKELY, NOT_RELATED
    outcome         VARCHAR(20)   NOT NULL,       -- RECOVERED, RECOVERING, NOT_RECOVERED, FATAL, UNKNOWN
    onset_dt        DATE          NOT NULL,
    resolved_dt     DATE,                         -- NULL = ongoing
    action_taken    VARCHAR(30),                  -- DOSE_REDUCED, DOSE_INTERRUPTED, DISCONTINUED, NONE
    description     VARCHAR(2000)                 -- UNSTRUCTURED: narrative description
);

CREATE OR REPLACE TABLE TBL_CONMED (
    conmed_id       VARCHAR(15)   PRIMARY KEY,    -- CMD-000001
    enrollment_id   VARCHAR(15)   NOT NULL,
    med_name        VARCHAR(200)  NOT NULL,       -- medication name
    med_class       VARCHAR(50),                  -- ATC classification
    indication      VARCHAR(200),                 -- why the patient takes it
    start_dt        DATE,
    end_dt          DATE,                         -- NULL = ongoing
    is_ongoing      BOOLEAN       DEFAULT FALSE
);

CREATE OR REPLACE TABLE TBL_VITAL_SIGN (
    vital_id        VARCHAR(20)   PRIMARY KEY,    -- VIT-00000001
    visit_id        VARCHAR(15)   NOT NULL,
    enrollment_id   VARCHAR(15)   NOT NULL,
    measure_type    VARCHAR(30)   NOT NULL,       -- SYSTOLIC_BP, DIASTOLIC_BP, HEART_RATE, TEMPERATURE, WEIGHT, HEIGHT, BMI, SPO2
    measure_value   NUMBER(8,2)   NOT NULL,
    measure_unit    VARCHAR(20),                  -- mmHg, bpm, °C, kg, cm, %, kg/m²
    collected_dt    DATE          NOT NULL
);

-- ============================================================
-- REGULATORY & OPERATIONS
-- ============================================================

CREATE OR REPLACE TABLE TBL_REGULATORY_SUBMISSION (
    submission_id   VARCHAR(15)   PRIMARY KEY,    -- REG-00001
    drug_id         VARCHAR(10)   NOT NULL,
    country_cd      VARCHAR(2)    NOT NULL,
    submission_type VARCHAR(20)   NOT NULL,       -- IND, NDA, ANDA, BLA, MAA, PMDA_APPROVAL, TGA_CTN
    submission_dt   DATE          NOT NULL,
    status          VARCHAR(20)   NOT NULL,       -- SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, WITHDRAWN
    approval_dt     DATE,
    reviewer_notes  VARCHAR(2000)                 -- UNSTRUCTURED
);

CREATE OR REPLACE TABLE TBL_PROTOCOL_DEVIATION (
    deviation_id    VARCHAR(15)   PRIMARY KEY,    -- DEV-000001
    trial_id        VARCHAR(15)   NOT NULL,
    site_id         VARCHAR(10)   NOT NULL,
    enrollment_id   VARCHAR(15),
    deviation_dt    DATE          NOT NULL,
    category        VARCHAR(30)   NOT NULL,       -- CONSENT, ELIGIBILITY, VISIT_SCHEDULE, DOSING, SAFETY_REPORTING, PROCEDURE
    severity        VARCHAR(10)   NOT NULL,       -- MINOR, MAJOR, CRITICAL
    description     VARCHAR(2000) NOT NULL,       -- UNSTRUCTURED
    corrective_action VARCHAR(1000),
    reported_dt     DATE,
    resolved_dt     DATE
);

CREATE OR REPLACE TABLE TBL_MILESTONE (
    milestone_id    VARCHAR(15)   PRIMARY KEY,    -- MIL-000001
    trial_id        VARCHAR(15)   NOT NULL,
    milestone_type  VARCHAR(30)   NOT NULL,       -- FSFV (first patient), LSLV (last patient), DBL (database lock), CSR (clinical study report), REGULATORY_SUB
    planned_dt      DATE          NOT NULL,
    actual_dt       DATE,                         -- NULL = not yet reached
    status          VARCHAR(20)   NOT NULL,       -- ON_TRACK, DELAYED, COMPLETED, AT_RISK
    delay_days      INT,                          -- actual - planned
    notes           VARCHAR(500)
);

CREATE OR REPLACE TABLE TBL_BUDGET (
    budget_id       VARCHAR(15)   PRIMARY KEY,    -- BUD-00001
    trial_id        VARCHAR(15)   NOT NULL,
    site_id         VARCHAR(10),                  -- NULL = trial-level cost
    cost_category   VARCHAR(30)   NOT NULL,       -- SITE_FEES, DRUG_SUPPLY, MONITORING, LAB, REGULATORY, OVERHEAD, PATIENT_STIPEND
    planned_usd     NUMBER(12,2)  NOT NULL,
    actual_usd      NUMBER(12,2),                 -- NULL = not yet incurred
    period_start    DATE,
    period_end      DATE,
    currency_local  VARCHAR(3),
    fx_rate         NUMBER(10,4)
);

-- ============================================================
-- DOCUMENT TABLE
-- Unstructured docs stored as individual .txt files on @CLINICAL_DOCS stage.
-- Metadata (without text) stored here for structured queries & joins.
-- Cortex Search indexes the .txt files directly from the stage.
-- ============================================================

CREATE OR REPLACE TABLE TBL_DOCUMENT (
    doc_id          VARCHAR(20)   PRIMARY KEY,    -- DOC-CT-000001, DOC-PM-000001, DOC-DM-000001
    doc_source      VARCHAR(20)   NOT NULL,       -- CLINICALTRIALS, DAILYMED, PUBMED
    external_id     VARCHAR(50),                  -- NCT ID, DailyMed SET_ID (UUID), PMID
    doc_title       VARCHAR(500),
    doc_type        VARCHAR(30),                  -- STUDY_RECORD, DRUG_LABEL, RESEARCH_ABSTRACT
    therapeutic_area VARCHAR(50),
    drug_name       VARCHAR(200),                 -- for linking to TBL_DRUG
    download_ts     TIMESTAMP_NTZ,
    doc_length_chars INT,
    doc_file_path   VARCHAR(500),                 -- relative path on @CLINICAL_DOCS (e.g., clinicaltrials/NCT00000106.txt)
    parsed_text     VARCHAR                       -- full document text for Cortex Search indexing
);
-- Actual: 173,699 rows (100K ClinicalTrials.gov + 45K PubMed + 28.7K DailyMed)
-- Each row has parsed_text for Cortex Search indexing + doc_file_path for .txt on @CLINICAL_DOCS
-- No separate TBL_PARSED_DOCUMENT — everything in one table.

-- ============================================================
-- DATA LOADING SUMMARY
-- ============================================================
--
-- STRUCTURED DATA (16 tables):
--   Pre-generated CSVs in data/
--   Uploaded to:   @CSV_LOAD/<table_name>/
--   Loaded via:    COPY INTO TBL_xxx FROM @CSV_LOAD/<table_name>/
--
-- UNSTRUCTURED DOCUMENTS (173K documents):
--   Pre-downloaded from ClinicalTrials.gov, DailyMed, PubMed APIs
--   Stored as:     parsed_text column in TBL_DOCUMENT (100K ClinicalTrials + 45K PubMed + 28.7K DailyMed)
--   Loaded via:    COPY INTO TBL_DOCUMENT FROM @CSV_LOAD/document/
--
-- CORTEX SEARCH indexes parsed_text column in TBL_DOCUMENT directly.
-- Cortex Agent (sf_02_create_agent.sql) uses 3 search services + semantic view.
