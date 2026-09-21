# RetailIQ Asia v2 — Databricks Genie Agent Setup

## Prerequisites
- All 12 CSV files uploaded to `/Volumes/<YOUR_CATALOG>/retailiq/retailiq/csv_files/`
- All .txt document directories uploaded to `/Volumes/<YOUR_CATALOG>/retailiq/retailiq/doc_files/`
- Tables loaded via `dbx_01_load_data` notebook

## Step 1: Create Genie Space

1. Go to **Genie** in Databricks workspace
2. Click **New** → **Genie Space**
3. Name: `RetailIQ Asia`
4. Select catalog: `<YOUR_CATALOG>`, schema: `retailiq`
5. Add all 13 tables (12 structured + doc_document)

### General Instructions
```
You are RetailIQ, an analytics agent for a multi-country Asia-Pacific retail operation
spanning Japan (JP), South Korea (KR), India (IN), Australia (AU), and Singapore (SG).

DATA RULES:
1. When calculating revenue or sales metrics, always filter fact_order.order_status = 'COMPLETED'.
   Never include CANCELLED, PENDING, or REFUNDED orders.
2. Loyalty members are customers with fact_customer.signup_dt IS NOT NULL.
   Per-member metrics use members as denominator, not all customers.
3. For COGS, use dim_product.cost_price × quantity. For inventory, use fact_inventory.cost_value.
4. Return rate = count of returns / count of order lines.
   Join: fact_return.line_id → fact_order_line.line_id → dim_product.product_id.
5. Supplier return analysis: fact_return → fact_order_line → dim_product → dim_supplier.
6. Avoid cartesian products: pre-aggregate each metric by dimension key before joining.
7. Valid loyalty tiers: BRONZE, SILVER, GOLD, PLATINUM. Tier='NONE' means non-member.
8. Dormant member = signup_dt IS NOT NULL, never had REDEEM in fact_loyalty_txn AND never
   written a review in fact_review.
9. Store profitability = Revenue (completed line_total) - COGS (qty × cost_price) - Refunds.
10. For document/benchmark questions, search the doc_document table using SQL LIKE or CONTAINS.
```

### Metric Views
Create these SQL views in the Genie space for pre-computed metrics:

| View Name | SQL |
|-----------|-----|
| `v_order_completion_rate` | `SELECT s.country_cd, COUNT(*) AS total_orders, SUM(CASE WHEN o.order_status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed, ROUND(100.0 * SUM(CASE WHEN o.order_status = 'COMPLETED' THEN 1 ELSE 0 END) / COUNT(*), 1) AS completion_rate FROM fact_order o JOIN dim_store s ON o.store_id = s.store_id GROUP BY s.country_cd` |
| `v_return_rate_by_category` | `SELECT p.category, COUNT(ol.line_id) AS total_lines, COUNT(r.return_id) AS returns, ROUND(100.0 * COUNT(r.return_id) / COUNT(ol.line_id), 1) AS return_rate FROM fact_order_line ol JOIN dim_product p ON ol.product_id = p.product_id LEFT JOIN fact_return r ON ol.line_id = r.line_id GROUP BY p.category` |
| `v_revenue_per_loyalty_member` | `SELECT c.country_cd, SUM(ol.line_total) AS total_revenue, COUNT(DISTINCT c.customer_id) AS member_count, ROUND(SUM(ol.line_total) / COUNT(DISTINCT c.customer_id), 0) AS rev_per_member FROM fact_customer c JOIN fact_order o ON c.customer_id = o.customer_id JOIN fact_order_line ol ON o.order_id = ol.order_id JOIN dim_store s ON o.store_id = s.store_id WHERE o.order_status = 'COMPLETED' AND c.signup_dt IS NOT NULL GROUP BY c.country_cd` |
| `v_loyalty_redemption_by_tier` | `SELECT c.loyalty_tier, COUNT(DISTINCT c.customer_id) AS members, COUNT(DISTINCT CASE WHEN l.txn_type = 'REDEEM' THEN c.customer_id END) AS redeemers, ROUND(100.0 * COUNT(DISTINCT CASE WHEN l.txn_type = 'REDEEM' THEN c.customer_id END) / COUNT(DISTINCT c.customer_id), 1) AS redemption_rate FROM fact_customer c LEFT JOIN fact_loyalty_txn l ON c.customer_id = l.customer_id WHERE c.signup_dt IS NOT NULL AND c.loyalty_tier != 'NONE' GROUP BY c.loyalty_tier` |
| `v_supplier_return_rate` | `SELECT s.supplier_id, s.supplier_name, s.quality_score, COUNT(r.return_id) AS returns, SUM(ol.quantity) AS units_sold, ROUND(100.0 * COUNT(r.return_id) / SUM(ol.quantity), 2) AS return_rate FROM dim_supplier s JOIN dim_product p ON s.supplier_id = p.supplier_id JOIN fact_order_line ol ON p.product_id = ol.product_id LEFT JOIN fact_return r ON ol.line_id = r.line_id GROUP BY s.supplier_id, s.supplier_name, s.quality_score` |
| `v_store_profitability` | `SELECT s.store_id, s.country_cd, SUM(ol.line_total) AS revenue, SUM(ol.quantity * p.cost_price) AS cogs, COALESCE(SUM(r.refund_amount), 0) AS refunds, SUM(ol.line_total) - SUM(ol.quantity * p.cost_price) - COALESCE(SUM(r.refund_amount), 0) AS profit FROM dim_store s JOIN fact_order o ON s.store_id = o.store_id JOIN fact_order_line ol ON o.order_id = ol.order_id JOIN dim_product p ON ol.product_id = p.product_id LEFT JOIN fact_return r ON ol.line_id = r.line_id WHERE o.order_status = 'COMPLETED' GROUP BY s.store_id, s.country_cd` |
| `v_inventory_turnover` | `SELECT p.category, SUM(ol.quantity * p.cost_price) AS cogs, AVG(i.cost_value) AS avg_inventory, ROUND(SUM(ol.quantity * p.cost_price) / AVG(i.cost_value), 1) AS turnover FROM fact_order_line ol JOIN dim_product p ON ol.product_id = p.product_id JOIN fact_order o ON ol.order_id = o.order_id LEFT JOIN fact_inventory i ON p.product_id = i.product_id WHERE o.order_status = 'COMPLETED' GROUP BY p.category` |
| `v_promo_spend_per_return` | `WITH promo_cat AS (SELECT p2.category, SUM(pr.actual_spend_usd) AS spend FROM fact_promotion pr JOIN dim_product p2 ON pr.product_id = p2.product_id WHERE pr.product_id IS NOT NULL GROUP BY p2.category), ret_cat AS (SELECT p2.category, COUNT(*) AS returns FROM fact_return r JOIN fact_order_line ol ON r.line_id = ol.line_id JOIN dim_product p2 ON ol.product_id = p2.product_id GROUP BY p2.category) SELECT pc.category, pc.spend, rc.returns, ROUND(pc.spend / rc.returns, 2) AS spend_per_return FROM promo_cat pc JOIN ret_cat rc ON pc.category = rc.category` |
| `v_dormant_members` | `WITH redeemers AS (SELECT DISTINCT customer_id FROM fact_loyalty_txn WHERE txn_type = 'REDEEM'), reviewers AS (SELECT DISTINCT customer_id FROM fact_review), members AS (SELECT customer_id, country_cd FROM fact_customer WHERE signup_dt IS NOT NULL) SELECT m.country_cd, COUNT(*) AS total_members, SUM(CASE WHEN r.customer_id IS NULL AND rv.customer_id IS NULL THEN 1 ELSE 0 END) AS dormant, ROUND(100.0 * SUM(CASE WHEN r.customer_id IS NULL AND rv.customer_id IS NULL THEN 1 ELSE 0 END) / COUNT(*), 1) AS dormant_pct FROM members m LEFT JOIN redeemers r ON m.customer_id = r.customer_id LEFT JOIN reviewers rv ON m.customer_id = rv.customer_id GROUP BY m.country_cd` |
| `v_supplier_review_ratings` | `SELECT s.supplier_id, s.supplier_name, s.quality_score, AVG(r.rating) AS avg_rating, COUNT(r.review_id) AS review_count FROM dim_supplier s JOIN dim_product p ON s.supplier_id = p.supplier_id JOIN fact_review r ON p.product_id = r.product_id GROUP BY s.supplier_id, s.supplier_name, s.quality_score` |
| `v_category_revenue` | `SELECT p.category, SUM(ol.line_total) AS revenue FROM fact_order_line ol JOIN dim_product p ON ol.product_id = p.product_id JOIN fact_order o ON ol.order_id = o.order_id WHERE o.order_status = 'COMPLETED' GROUP BY p.category ORDER BY revenue DESC` |
| `v_loyalty_txn_by_country` | `SELECT c.country_cd, l.txn_type, COUNT(*) AS txn_count FROM fact_loyalty_txn l JOIN fact_customer c ON l.customer_id = c.customer_id GROUP BY c.country_cd, l.txn_type` |
| `v_exec_summary` | `SELECT 'total_revenue' AS metric, CAST(SUM(ol.line_total) AS STRING) AS value FROM fact_order_line ol JOIN fact_order o ON ol.order_id = o.order_id WHERE o.order_status = 'COMPLETED' UNION ALL SELECT 'return_rate', CAST(ROUND(100.0 * (SELECT COUNT(*) FROM fact_return) / (SELECT COUNT(*) FROM fact_order_line), 1) AS STRING) UNION ALL SELECT 'total_customers', CAST(COUNT(*) AS STRING) FROM fact_customer UNION ALL SELECT 'loyalty_pct', CAST(ROUND(100.0 * SUM(CASE WHEN signup_dt IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) AS STRING) FROM fact_customer` |

## Step 2: Create Supervisor Agent (Optional)

If using a supervisor agent pattern:

### Description
```
RetailIQ Supervisor orchestrates retail analytics queries across structured data
(12 tables, 15M+ rows) and unstructured documents (65K research papers and audit reports)
for APAC retail operations in JP, KR, IN, AU, and SG.
```

### Instructions
```
Route all questions to the RetailIQ Genie space. For questions that mention
"search", "research", "benchmarks", "audit reports", or "industry", also query
the doc_document table for relevant unstructured content. Always combine structured
query results with document findings when both are relevant.
```

## Step 3: Teardown Commands (if needed)

```sql
USE CATALOG `<YOUR_CATALOG>`;
USE SCHEMA retailiq;

DROP TABLE IF EXISTS dim_supplier;
DROP TABLE IF EXISTS dim_store;
DROP TABLE IF EXISTS dim_employee;
DROP TABLE IF EXISTS dim_product;
DROP TABLE IF EXISTS fact_customer;
DROP TABLE IF EXISTS fact_order;
DROP TABLE IF EXISTS fact_order_line;
DROP TABLE IF EXISTS fact_return;
DROP TABLE IF EXISTS fact_promotion;
DROP TABLE IF EXISTS fact_inventory;
DROP TABLE IF EXISTS fact_review;
DROP TABLE IF EXISTS fact_loyalty_txn;
DROP TABLE IF EXISTS doc_document;
```
