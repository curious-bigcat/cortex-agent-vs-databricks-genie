# Databricks Genie — Agent Setup

## 1. Data Infrastructure

- **Catalog**: `<YOUR_CATALOG>`
- **Schema**: `clinical`
- **Volume**: `/Volumes/<YOUR_CATALOG>/clinical/<YOUR_VOLUME>` (CSV upload target)
- **Tables**: 16 structured tables + 1 document table (tbl_document)

### Data Load

Two load paths available (see `dbx_01_load_data.ipynb`):

1. **Volume path** (recommended — no storage key needed):
   - Upload CSVs to `/Volumes/<YOUR_CATALOG>/clinical/<YOUR_VOLUME>/`
   - Read with `spark.read.csv(f"/Volumes/<YOUR_CATALOG>/clinical/<YOUR_VOLUME>/{csv_file}")`

2. **Blob path** (requires Azure storage key on cluster):
   - `abfss://data@<YOUR_STORAGE_ACCOUNT>.dfs.core.windows.net/clinical/csv_files/`

### Reload Modified Tables Only

When only specific tables have changed (e.g., after data skewing):

```python
volume_path = "/Volumes/<YOUR_CATALOG>/clinical/<YOUR_VOLUME>"

modified_tables = [
    ("adverse_events.csv", "tbl_adverse_event"),
    ("enrollments.csv", "tbl_enrollment"),
    ("sites.csv", "tbl_site"),
    ("visits.csv", "tbl_visit"),
    ("budgets.csv", "tbl_budget"),
]

for csv_file, table in modified_tables:
    file_path = f"{volume_path}/{csv_file}"
    df = (spark.read
          .option("header", "true")
          .option("inferSchema", "true")
          .option("nullValue", "None")
          .option("emptyValue", "")
          .csv(file_path))
    df.write.mode("overwrite").saveAsTable(f"`<YOUR_CATALOG>`.clinical.{table}")
    print(f"Reloaded: {table} ({df.count():,} rows)")
```

---

## 2. Genie Agent — General Instructions

Paste this into the Genie Space **General Instructions** field:

```
You are the data analytics assistant for ClinicalIQ Asia, a Contract Research
Organization (CRO) running clinical trials across 5 APAC markets: Japan (JP),
South Korea (KR), Singapore (SG), Australia (AU), and India (IN).

Your job is to answer analytical questions by querying the clinical trial
database and searching published research documents. Always show your work —
explain how you derived metrics and flag any assumptions.

DATA RULES — these prevent the most common analytical errors in this dataset:

1. ENROLLMENT RATE — There is no enrollment_rate column. You must derive it:
   COUNT(enrolled patients) / COUNT(all screening records)
   A patient is enrolled only if enroll_dt IS NOT NULL. Rows with enroll_dt = NULL
   are screen failures — patients who were screened but never enrolled. Including
   them inflates the denominator and makes enrollment rates look artificially low.

2. DRUG NAMES — Each drug in tbl_drug has three different name columns:
   drug_name (the brand name), generic_name, and molecule_name. When a user
   asks about a drug by name, search all three columns — the same compound
   may be referred to by any of its names depending on context.

3. VISIT COMPLIANCE — A visit is "on-time" when:
   ABS(DATEDIFF(actual_dt, scheduled_dt)) <= visit_window_days
   Each visit type has its own visit_window_days value (e.g., screening = 7 days,
   dosing = 2 days). There is no on_time flag in the data — you must calculate
   it per row using that visit's specific window.

4. ADVERSE EVENT COUNTING — tbl_adverse_event has multiple rows per patient
   (one row per event, not per patient). "AE rate" is ambiguous:
   - Total AE count / total patients = average events per patient
   - Patients with at least one AE / total patients = incidence rate
   These produce very different numbers. State which one you are computing.

5. SERIOUS vs SEVERE — These are distinct regulatory concepts on the same table:
   - seriousness column = 'SERIOUS' → regulatory classification (requires
     mandatory reporting to health authorities — hospitalization, death, etc.)
   - severity column = 'SEVERE' → clinical intensity (how bad it felt physically)
   A mild skin rash can be "serious" if it causes hospitalization. A severe
   headache may not be "serious" at all. Never use one when the other is meant.

6. LAB RESULTS — tbl_lab_result contains ~5 million rows with multiple test
   types per visit per patient (CBC, liver panel, chemistry, etc.). Always
   filter by test_name or test_category before aggregating — otherwise you
   are averaging across unrelated lab tests.

7. TRIAL STATUS — "Active trials" is ambiguous in this dataset:
   - status = 'ACTIVE' means dosing/treatment is ongoing
   - status = 'RECRUITING' means the trial is still enrolling new patients
   If the user says "active," clarify which they mean or state your assumption.
   Exclude 'COMPLETED', 'TERMINATED', and 'WITHDRAWN' unless asked otherwise.

8. MULTI-ARM FAN-OUT — Each trial has 2–4 treatment arms in tbl_trial_arm
   (experimental, placebo, active comparator). Joining drugs → trial_arms →
   enrollments without aggregation will multiply patient counts by the number
   of arms. Always use DISTINCT or pre-aggregate to avoid inflated numbers.

9. CONCOMITANT MEDICATION STACKING — Patients take 1–5+ concomitant
   medications in tbl_conmed. Joining conmeds directly to adverse_events
   creates a cartesian product (every med × every AE for each patient).
   Pre-aggregate conmed counts per patient before joining.

10. COUNTRY COLUMN AMBIGUITY — country_cd appears on four different tables:
    tbl_site, tbl_enrollment, tbl_sponsor, and tbl_investigator. Each means
    something different:
    - "Trials in Japan" → use tbl_enrollment.country_cd (where patients enrolled)
    - "Japanese sites" → use tbl_site.country_cd (where the facility is located)
    - "Japanese sponsors" → use tbl_sponsor.country_cd (sponsor headquarters)
    Using the wrong table's country column changes results significantly.

PRESENTATION GUIDELINES:
- Include trial phase and therapeutic area context when relevant
- Show your methodology — explain how derived metrics were calculated
- Flag data quality concerns, ambiguities, or assumptions made
- Provide actionable recommendations based on the findings
```

---

## 3. Metric Views

16 metric views are configured in the Genie Space (one per table). Each metric view defines per-table dimensions and measures that Genie uses for query generation.


| Metric View | Source Table | Dimensions | Measures |
|---|---|---|---|
| mv_adverse_event | tbl_adverse_event | severity, seriousness, ae_category, causality, outcome | ae_count, unique_subjects, unique_trials, avg_duration_days |
| mv_budget | tbl_budget | cost_category, trial_id, site_id, currency_local, period_start_month | total_planned_usd, total_actual_usd, budget_variance_usd, budget_entry_count |
| mv_conmed | tbl_conmed | med_class, indication, is_ongoing, start_month | medication_count, unique_subjects, unique_medications |
| mv_drug | tbl_drug | drug_class, therapeutic_area, route, approval_status, mechanism | drug_count, unique_sponsors, unique_molecules |
| mv_enrollment | tbl_enrollment | status, country_cd, withdrawal_reason, enroll_month | enrollment_count, unique_patients, unique_trials, unique_sites |
| mv_investigator | tbl_investigator | specialty, credential, country_cd | investigator_count, avg_years_experience, total_trials_led, total_publications, avg_publications |
| mv_lab_result | tbl_lab_result | test_name, test_category, is_abnormal, result_unit | lab_result_count, avg_result_value, unique_subjects, abnormal_count |
| mv_milestone | tbl_milestone | milestone_type, status, trial_id | milestone_count, avg_delay_days, total_delay_days, delayed_milestones |
| mv_protocol_deviation | tbl_protocol_deviation | category, severity, site_id, deviation_month | deviation_count, unique_subjects, unique_trials, avg_resolution_days |
| mv_regulatory_submission | tbl_regulatory_submission | submission_type, status, country_cd, submission_month | submission_count, unique_drugs, avg_review_days |
| mv_site | tbl_site | country_cd, city, site_type, is_active | site_count, total_bed_count, total_annual_capacity, avg_quality_score |
| mv_sponsor | tbl_sponsor | sponsor_type, country_cd, therapeutic_focus, is_active | sponsor_count, total_rd_budget_usd, avg_rd_budget_usd |
| mv_trial | tbl_trial | phase, status, therapeutic_area, study_design, is_randomized | trial_count, total_target_enrollment, total_actual_enrollment, avg_sites_per_trial, avg_countries_per_trial |
| mv_trial_arm | tbl_trial_arm | arm_type, dose, frequency, trial_id | arm_count, total_target_n, total_actual_n, unique_drugs |
| mv_visit | tbl_visit | visit_name, visit_status, trial_id, scheduled_month | visit_count, unique_subjects, avg_window_days, avg_schedule_variance |
| mv_vital_sign | tbl_vital_sign | measure_type, measure_unit, collected_month | vital_sign_count, avg_value, min_value, max_value, unique_subjects |

---

## 4. Teardown Commands

To drop all metric views and tables (run in DBX SQL):

```sql
-- Drop metric views
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_adverse_event;
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_budget;
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_conmed;
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_drug;
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_enrollment;
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_investigator;
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_lab_result;
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_milestone;
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_protocol_deviation;
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_regulatory_submission;
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_site;
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_sponsor;
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_trial;
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_trial_arm;
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_visit;
DROP VIEW IF EXISTS `<YOUR_CATALOG>`.clinical.mv_vital_sign;

-- Drop tables
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_adverse_event;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_budget;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_conmed;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_drug;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_enrollment;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_investigator;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_lab_result;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_milestone;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_protocol_deviation;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_regulatory_submission;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_site;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_sponsor;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_trial;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_trial_arm;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_visit;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_vital_sign;
DROP TABLE IF EXISTS `<YOUR_CATALOG>`.clinical.tbl_document;
```
