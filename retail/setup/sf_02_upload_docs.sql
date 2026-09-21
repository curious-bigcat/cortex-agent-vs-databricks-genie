-- ============================================================
-- RetailIQ Asia v2 — Upload Documents to Stage + Populate DOC_DOCUMENT
-- ============================================================
-- STEP 1: Create stage for documents
-- STEP 2: Upload .txt files from CLI
-- STEP 3: Load metadata into DOC_DOCUMENT via directory listing + READ
-- ============================================================

USE DATABASE <YOUR_DATABASE>;
USE SCHEMA ANALYTICS;

-- ============================================================
-- STAGE FOR DOCUMENTS
-- ============================================================
CREATE OR REPLACE STAGE DOC_STAGE_V2
    DIRECTORY = (ENABLE = TRUE)
    ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE');

-- ============================================================
-- UPLOAD .txt FILES FROM CLI (run these commands in your terminal)
-- ============================================================
-- snow stage copy retail/data/v2/docs/products/ @<YOUR_DATABASE>.ANALYTICS.DOC_STAGE_V2/products/ --parallel 8 --overwrite
-- snow stage copy retail/data/v2/docs/supplier_audits/ @<YOUR_DATABASE>.ANALYTICS.DOC_STAGE_V2/supplier_audits/ --parallel 8 --overwrite
-- snow stage copy retail/data/v2/docs/industry_research/ @<YOUR_DATABASE>.ANALYTICS.DOC_STAGE_V2/industry_research/ --parallel 8 --overwrite

-- After upload, refresh directory:
ALTER STAGE DOC_STAGE_V2 REFRESH;

-- ============================================================
-- VERIFY UPLOAD
-- ============================================================
SELECT
    CASE
        WHEN RELATIVE_PATH LIKE 'products/%' THEN 'products'
        WHEN RELATIVE_PATH LIKE 'supplier_audits/%' THEN 'supplier_audits'
        WHEN RELATIVE_PATH LIKE 'industry_research/%' THEN 'industry_research'
        ELSE 'other'
    END AS collection,
    COUNT(*) AS file_count
FROM DIRECTORY(@DOC_STAGE_V2)
GROUP BY 1
ORDER BY 1;

-- ============================================================
-- POPULATE DOC_DOCUMENT TABLE
-- ============================================================
TRUNCATE TABLE IF EXISTS DOC_DOCUMENT;

-- Product descriptions (50,000)
INSERT INTO DOC_DOCUMENT (doc_id, doc_title, doc_type, category, brand, doc_source, parsed_text)
SELECT
    REPLACE(SPLIT_PART(d.RELATIVE_PATH, '/', -1), '.txt', '') AS doc_id,
    SPLIT_PART(d.RELATIVE_PATH, '/', -1) AS doc_title,
    'product_description' AS doc_type,
    NULL AS category,
    NULL AS brand,
    'products' AS doc_source,
    SNOWFLAKE.CORTEX.PARSE_DOCUMENT(
        @DOC_STAGE_V2,
        d.RELATIVE_PATH,
        {'mode': 'LAYOUT'}
    ):content::VARCHAR AS parsed_text
FROM DIRECTORY(@DOC_STAGE_V2) d
WHERE d.RELATIVE_PATH LIKE 'products/%.txt';

-- Supplier audit reports (5,000)
INSERT INTO DOC_DOCUMENT (doc_id, doc_title, doc_type, category, brand, doc_source, parsed_text)
SELECT
    REPLACE(SPLIT_PART(d.RELATIVE_PATH, '/', -1), '.txt', '') AS doc_id,
    SPLIT_PART(d.RELATIVE_PATH, '/', -1) AS doc_title,
    'supplier_audit' AS doc_type,
    NULL AS category,
    NULL AS brand,
    'supplier_audits' AS doc_source,
    SNOWFLAKE.CORTEX.PARSE_DOCUMENT(
        @DOC_STAGE_V2,
        d.RELATIVE_PATH,
        {'mode': 'LAYOUT'}
    ):content::VARCHAR AS parsed_text
FROM DIRECTORY(@DOC_STAGE_V2) d
WHERE d.RELATIVE_PATH LIKE 'supplier_audits/%.txt';

-- Industry research reports (10,000)
INSERT INTO DOC_DOCUMENT (doc_id, doc_title, doc_type, category, brand, doc_source, parsed_text)
SELECT
    REPLACE(SPLIT_PART(d.RELATIVE_PATH, '/', -1), '.txt', '') AS doc_id,
    SPLIT_PART(d.RELATIVE_PATH, '/', -1) AS doc_title,
    'industry_research' AS doc_type,
    NULL AS category,
    NULL AS brand,
    'industry_research' AS doc_source,
    SNOWFLAKE.CORTEX.PARSE_DOCUMENT(
        @DOC_STAGE_V2,
        d.RELATIVE_PATH,
        {'mode': 'LAYOUT'}
    ):content::VARCHAR AS parsed_text
FROM DIRECTORY(@DOC_STAGE_V2) d
WHERE d.RELATIVE_PATH LIKE 'industry_research/%.txt';

-- ============================================================
-- VERIFY DOC_DOCUMENT
-- ============================================================
SELECT doc_source, COUNT(*) AS cnt, AVG(LENGTH(parsed_text)) AS avg_len
FROM DOC_DOCUMENT
GROUP BY 1
ORDER BY 1;
