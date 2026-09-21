-- ============================================================
-- RetailIQ Asia v2 — Cortex Search Service
-- ============================================================
-- Creates a Cortex Search service on DOC_DOCUMENT for the agent
-- to use for unstructured data retrieval.
-- ============================================================

USE DATABASE <YOUR_DATABASE>;
USE SCHEMA ANALYTICS;
USE WAREHOUSE <YOUR_WAREHOUSE>;

-- ============================================================
-- DROP EXISTING SEARCH SERVICE
-- ============================================================
DROP CORTEX SEARCH SERVICE IF EXISTS RETAIL_DOC_SEARCH;

-- ============================================================
-- CREATE CORTEX SEARCH SERVICE
-- ============================================================
CREATE OR REPLACE CORTEX SEARCH SERVICE RETAIL_DOC_SEARCH
    ON parsed_text
    ATTRIBUTES doc_type, category, doc_source
    WAREHOUSE = <YOUR_WAREHOUSE>
    TARGET_LAG = '1 hour'
AS (
    SELECT
        doc_id,
        doc_title,
        doc_type,
        category,
        brand,
        doc_source,
        parsed_text
    FROM DOC_DOCUMENT
);

-- ============================================================
-- VERIFY
-- ============================================================
SHOW CORTEX SEARCH SERVICES IN SCHEMA ANALYTICS;

-- Test query
-- SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
--     '<YOUR_DATABASE>.ANALYTICS.RETAIL_DOC_SEARCH',
--     '{ "query": "return rate benchmarks by category", "columns": ["doc_title", "doc_type", "parsed_text"], "limit": 3 }'
-- );
