-- ============================================================
-- RetailIQ Asia v2 — Schema + Data Load
-- Run in Snowflake. Uses internal stage for CSV upload.
-- ============================================================

USE DATABASE <YOUR_DATABASE>;
CREATE SCHEMA IF NOT EXISTS ANALYTICS;
USE SCHEMA ANALYTICS;

-- ============================================================
-- DROP OLD TABLES (v1)
-- ============================================================
DROP TABLE IF EXISTS TBL_LOYALTY_TXN;
DROP TABLE IF EXISTS TBL_REVIEW;
DROP TABLE IF EXISTS TBL_INVENTORY;
DROP TABLE IF EXISTS TBL_PROMOTION;
DROP TABLE IF EXISTS TBL_RETURN;
DROP TABLE IF EXISTS TBL_ORDER_LINE;
DROP TABLE IF EXISTS TBL_ORDER;
DROP TABLE IF EXISTS TBL_CUSTOMER;
DROP TABLE IF EXISTS TBL_PRODUCT;
DROP TABLE IF EXISTS TBL_EMPLOYEE;
DROP TABLE IF EXISTS TBL_STORE;
DROP TABLE IF EXISTS TBL_SUPPLIER;
DROP TABLE IF EXISTS TBL_DOCUMENT;

-- ============================================================
-- CREATE TABLES (v2 naming: dim_ and fact_ prefixes)
-- ============================================================

CREATE OR REPLACE TABLE DIM_SUPPLIER (
    supplier_id VARCHAR(10) PRIMARY KEY,
    supplier_name VARCHAR(100),
    country_cd VARCHAR(5),
    city VARCHAR(50),
    supplier_type VARCHAR(20),
    lead_time_days INTEGER,
    quality_score FLOAT,
    annual_volume_usd FLOAT,
    is_active BOOLEAN
);

CREATE OR REPLACE TABLE DIM_STORE (
    store_id VARCHAR(10) PRIMARY KEY,
    store_name VARCHAR(100),
    country_cd VARCHAR(5),
    city VARCHAR(50),
    store_type VARCHAR(20),
    open_date DATE,
    sqft INTEGER,
    annual_rent_usd FLOAT,
    is_active BOOLEAN
);

CREATE OR REPLACE TABLE DIM_EMPLOYEE (
    employee_id VARCHAR(10) PRIMARY KEY,
    employee_name VARCHAR(100),
    store_id VARCHAR(10),
    role VARCHAR(30),
    hire_date DATE,
    hourly_rate FLOAT,
    is_active BOOLEAN
);

CREATE OR REPLACE TABLE DIM_PRODUCT (
    product_id VARCHAR(10) PRIMARY KEY,
    product_name VARCHAR(100),
    category VARCHAR(30),
    subcategory VARCHAR(30),
    brand VARCHAR(50),
    supplier_id VARCHAR(10),
    cost_price FLOAT,
    retail_price FLOAT,
    weight_kg FLOAT,
    launch_date DATE,
    is_active BOOLEAN
);

CREATE OR REPLACE TABLE FACT_CUSTOMER (
    customer_id VARCHAR(12) PRIMARY KEY,
    customer_name VARCHAR(100),
    country_cd VARCHAR(5),
    city VARCHAR(50),
    gender VARCHAR(10),
    age_band VARCHAR(10),
    loyalty_tier VARCHAR(10),
    signup_dt DATE,
    is_active BOOLEAN
);

CREATE OR REPLACE TABLE FACT_ORDER (
    order_id VARCHAR(15) PRIMARY KEY,
    customer_id VARCHAR(12),
    store_id VARCHAR(10),
    order_dt DATE,
    order_status VARCHAR(12),
    payment_method VARCHAR(20),
    total_amount FLOAT,
    discount_amount FLOAT
);

CREATE OR REPLACE TABLE FACT_ORDER_LINE (
    line_id VARCHAR(15) PRIMARY KEY,
    order_id VARCHAR(15),
    product_id VARCHAR(10),
    quantity INTEGER,
    unit_price FLOAT,
    discount_amount FLOAT,
    line_total FLOAT
);

CREATE OR REPLACE TABLE FACT_RETURN (
    return_id VARCHAR(15) PRIMARY KEY,
    line_id VARCHAR(15),
    return_dt DATE,
    return_reason VARCHAR(20),
    refund_amount FLOAT,
    return_status VARCHAR(10)
);

CREATE OR REPLACE TABLE FACT_PROMOTION (
    promo_id VARCHAR(10) PRIMARY KEY,
    promo_name VARCHAR(100),
    product_id VARCHAR(10),
    store_id VARCHAR(10),
    promo_type VARCHAR(20),
    discount_pct INTEGER,
    start_dt DATE,
    end_dt DATE,
    budget_usd FLOAT,
    actual_spend_usd FLOAT
);

CREATE OR REPLACE TABLE FACT_INVENTORY (
    inventory_id VARCHAR(15) PRIMARY KEY,
    product_id VARCHAR(10),
    store_id VARCHAR(10),
    snapshot_dt DATE,
    stock_qty INTEGER,
    reorder_point INTEGER,
    days_on_hand INTEGER,
    cost_value FLOAT
);

CREATE OR REPLACE TABLE FACT_REVIEW (
    review_id VARCHAR(15) PRIMARY KEY,
    customer_id VARCHAR(12),
    product_id VARCHAR(10),
    rating INTEGER,
    review_text VARCHAR(500),
    review_date DATE,
    is_verified BOOLEAN
);

CREATE OR REPLACE TABLE FACT_LOYALTY_TXN (
    txn_id VARCHAR(15) PRIMARY KEY,
    customer_id VARCHAR(12),
    order_id VARCHAR(15),
    txn_type VARCHAR(10),
    points INTEGER,
    txn_date DATE
);

-- Document table (populated separately by sf_03)
CREATE TABLE IF NOT EXISTS DOC_DOCUMENT (
    doc_id VARCHAR(20) PRIMARY KEY,
    doc_title VARCHAR(200),
    doc_type VARCHAR(30),
    category VARCHAR(30),
    brand VARCHAR(50),
    doc_source VARCHAR(50),
    parsed_text VARCHAR(16000000)
);

-- Benchmark tables
CREATE TABLE IF NOT EXISTS TBL_EXPECTED_ANSWERS (
    question_id VARCHAR(10) PRIMARY KEY,
    question_text VARCHAR(2000),
    expected_answer VARCHAR(4000),
    key_numbers VARCHAR(2000),
    traps VARCHAR(50),
    dbx_failure_pattern VARCHAR(200),
    complexity_type VARCHAR(20),
    scoring_5 VARCHAR(500),
    scoring_3 VARCHAR(500),
    scoring_1 VARCHAR(500),
    sf_tool_calls INTEGER,
    sf_failures INTEGER,
    dbx_tool_calls INTEGER,
    dbx_failures INTEGER
);

CREATE TABLE IF NOT EXISTS TBL_BENCHMARK_RESULTS (
    result_id VARCHAR(50) PRIMARY KEY,
    question_id VARCHAR(10),
    platform VARCHAR(20),
    agent_output VARCHAR(16000),
    score_accuracy INTEGER,
    score_groundedness INTEGER,
    score_relevance INTEGER,
    score_usefulness INTEGER DEFAULT 0,
    score_correctness INTEGER DEFAULT 0,
    score_consequences INTEGER DEFAULT 0,
    score_total INTEGER,
    scoring_rationale VARCHAR(4000),
    scored_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    run_id VARCHAR(100),
    dbx_failure_pattern VARCHAR(2000)
);

-- ============================================================
-- STAGE + LOAD DATA
-- ============================================================

CREATE OR REPLACE STAGE CSV_LOAD_V2
    FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' SKIP_HEADER = 1 NULL_IF = (''));

-- Upload CSVs: run from CLI:
-- snow stage copy retail/data/v2/*.csv @<YOUR_DATABASE>.ANALYTICS.CSV_LOAD_V2/

-- Then load each table:
COPY INTO DIM_SUPPLIER FROM @CSV_LOAD_V2/dim_supplier.csv FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' SKIP_HEADER = 1 NULL_IF = (''));
COPY INTO DIM_STORE FROM @CSV_LOAD_V2/dim_store.csv FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' SKIP_HEADER = 1 NULL_IF = (''));
COPY INTO DIM_EMPLOYEE FROM @CSV_LOAD_V2/dim_employee.csv FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' SKIP_HEADER = 1 NULL_IF = (''));
COPY INTO DIM_PRODUCT FROM @CSV_LOAD_V2/dim_product.csv FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' SKIP_HEADER = 1 NULL_IF = (''));
COPY INTO FACT_CUSTOMER FROM @CSV_LOAD_V2/fact_customer.csv FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' SKIP_HEADER = 1 NULL_IF = (''));
COPY INTO FACT_ORDER FROM @CSV_LOAD_V2/fact_order.csv FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' SKIP_HEADER = 1 NULL_IF = (''));
COPY INTO FACT_ORDER_LINE FROM @CSV_LOAD_V2/fact_order_line.csv FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' SKIP_HEADER = 1 NULL_IF = (''));
COPY INTO FACT_RETURN FROM @CSV_LOAD_V2/fact_return.csv FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' SKIP_HEADER = 1 NULL_IF = (''));
COPY INTO FACT_PROMOTION FROM @CSV_LOAD_V2/fact_promotion.csv FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' SKIP_HEADER = 1 NULL_IF = (''));
COPY INTO FACT_INVENTORY FROM @CSV_LOAD_V2/fact_inventory.csv FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' SKIP_HEADER = 1 NULL_IF = (''));
COPY INTO FACT_REVIEW FROM @CSV_LOAD_V2/fact_review.csv FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' SKIP_HEADER = 1 NULL_IF = (''));
COPY INTO FACT_LOYALTY_TXN FROM @CSV_LOAD_V2/fact_loyalty_txn.csv FILE_FORMAT = (TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' SKIP_HEADER = 1 NULL_IF = (''));

-- ============================================================
-- VERIFY ROW COUNTS
-- ============================================================
SELECT 'DIM_SUPPLIER' AS tbl, COUNT(*) AS cnt FROM DIM_SUPPLIER
UNION ALL SELECT 'DIM_STORE', COUNT(*) FROM DIM_STORE
UNION ALL SELECT 'DIM_EMPLOYEE', COUNT(*) FROM DIM_EMPLOYEE
UNION ALL SELECT 'DIM_PRODUCT', COUNT(*) FROM DIM_PRODUCT
UNION ALL SELECT 'FACT_CUSTOMER', COUNT(*) FROM FACT_CUSTOMER
UNION ALL SELECT 'FACT_ORDER', COUNT(*) FROM FACT_ORDER
UNION ALL SELECT 'FACT_ORDER_LINE', COUNT(*) FROM FACT_ORDER_LINE
UNION ALL SELECT 'FACT_RETURN', COUNT(*) FROM FACT_RETURN
UNION ALL SELECT 'FACT_PROMOTION', COUNT(*) FROM FACT_PROMOTION
UNION ALL SELECT 'FACT_INVENTORY', COUNT(*) FROM FACT_INVENTORY
UNION ALL SELECT 'FACT_REVIEW', COUNT(*) FROM FACT_REVIEW
UNION ALL SELECT 'FACT_LOYALTY_TXN', COUNT(*) FROM FACT_LOYALTY_TXN
ORDER BY tbl;

-- ============================================================
-- GRANTS
-- ============================================================
GRANT USAGE ON DATABASE <YOUR_DATABASE> TO ROLE PUBLIC;
GRANT USAGE ON SCHEMA <YOUR_DATABASE>.ANALYTICS TO ROLE PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA <YOUR_DATABASE>.ANALYTICS TO ROLE PUBLIC;
