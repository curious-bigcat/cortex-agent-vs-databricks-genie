# Databricks Genie — Agent Setup

## 1. Data Infrastructure

- **Catalog**: `dbx-bsuresh-catalog`
- **Schema**: `clinical`
- **Volume**: `/Volumes/dbx-bsuresh-catalog/clinical/clinical` (CSV upload target)
- **Tables**: 16 structured tables + 1 document table (tbl_document)

### Data Load

Two load paths available (see `dbx_01_load_data.ipynb`):

1. **Volume path** (recommended — no storage key needed):
   - Upload CSVs to `/Volumes/dbx-bsuresh-catalog/clinical/clinical/`
   - Read with `spark.read.csv(f"/Volumes/dbx-bsuresh-catalog/clinical/clinical/{csv_file}")`

2. **Blob path** (requires Azure storage key on cluster):
   - `abfss://data@blobsuresh.dfs.core.windows.net/clinical/csv_files/`

### Reload Modified Tables Only

When only specific tables have changed (e.g., after data skewing):

```python
volume_path = "/Volumes/dbx-bsuresh-catalog/clinical/clinical"

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
    df.write.mode("overwrite").saveAsTable(f"`dbx-bsuresh-catalog`.clinical.{table}")
    print(f"Reloaded: {table} ({df.count():,} rows)")
```

---

## 2. Genie Agent — General Instructions

Paste this into the Genie Space **General Instructions** field:

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

---

## 3. Metric Views

16 metric views are configured in the Genie Space (one per table). Each metric view defines per-table dimensions and measures that Genie uses for query generation. The full YAML definitions are in [`mv.md`](mv.md).

**Key limitation**: Metric views are per-table only. They cannot express:
- Cross-table joins or composite metrics (e.g., SAE rate = AE table ÷ enrollment table)
- Negation patterns (e.g., "patients WITHOUT adverse events")
- Subquery-based derived flags

This is a structural weakness — questions requiring multi-table reasoning must rely on Genie's SQL generation rather than metric view definitions.

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
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_adverse_event;
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_budget;
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_conmed;
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_drug;
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_enrollment;
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_investigator;
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_lab_result;
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_milestone;
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_protocol_deviation;
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_regulatory_submission;
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_site;
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_sponsor;
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_trial;
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_trial_arm;
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_visit;
DROP VIEW IF EXISTS `dbx-bsuresh-catalog`.clinical.mv_vital_sign;

-- Drop tables
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_adverse_event;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_budget;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_conmed;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_drug;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_enrollment;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_investigator;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_lab_result;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_milestone;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_protocol_deviation;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_regulatory_submission;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_site;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_sponsor;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_trial;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_trial_arm;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_visit;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_vital_sign;
DROP TABLE IF EXISTS `dbx-bsuresh-catalog`.clinical.tbl_document;
```
