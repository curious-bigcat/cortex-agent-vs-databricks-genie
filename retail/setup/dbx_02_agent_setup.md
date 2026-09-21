# RetailIQ Asia v2 — Databricks Genie Agent Setup

## Prerequisites
- All 12 CSV files uploaded to `/Volumes/<YOUR_CATALOG>/retailiq/retailiq/csv_files/`
- All .txt document directories uploaded to `/Volumes/<YOUR_CATALOG>/retailiq/retailiq/doc_files/`
- Tables loaded via `dbx_01_load_data` notebook
- **Table & column comments**: Already applied via Genie auto-generation

---

## Step 1: Create Genie Space

1. Go to **Genie** in Databricks workspace
2. Click **New** → **Genie Space**
3. Name: `RetailIQ Asia`
4. Select catalog: `<YOUR_CATALOG>`, schema: `retailiq`
5. Add all 13 tables (12 structured + doc_document)

### General Instructions

Paste the following into the Genie Space's General Instructions:

```
You are RetailIQ, an analytics agent for a multi-country Asia-Pacific retail operation
spanning Japan (JP), South Korea (KR), India (IN), Australia (AU), and Singapore (SG).

TABLE RELATIONSHIPS (join paths):
- dim_employee.store_id → dim_store.store_id
- fact_inventory.product_id → dim_product.product_id
- fact_inventory.store_id → dim_store.store_id
- fact_loyalty_txn.customer_id → fact_customer.customer_id
- fact_loyalty_txn.order_id → fact_order.order_id
- fact_order.store_id → dim_store.store_id
- fact_order.customer_id → fact_customer.customer_id
- fact_order_line.product_id → dim_product.product_id
- fact_order_line.order_id → fact_order.order_id
- fact_promotion.product_id → dim_product.product_id
- fact_promotion.store_id → dim_store.store_id
- fact_return.line_id → fact_order_line.line_id
- fact_review.product_id → dim_product.product_id
- fact_review.customer_id → fact_customer.customer_id
- dim_product.supplier_id → dim_supplier.supplier_id

DATA RULES:
1. Revenue: Always filter fact_order.order_status = 'COMPLETED'. Never include CANCELLED,
   PENDING, or REFUNDED orders in revenue calculations.
2. Line-level revenue: Use SUM(fact_order_line.line_total) for accurate revenue.
   fact_order.total_amount is an order-level header amount — different from line totals.
3. Loyalty members: Customers with fact_customer.signup_dt IS NOT NULL.
   Per-member metrics use members as denominator, not all customers.
   MEMBER_COUNT = COUNT(DISTINCT CASE WHEN signup_dt IS NOT NULL THEN customer_id END).
4. COGS: Use dim_product.cost_price × quantity. For inventory cost, use fact_inventory.cost_value.
5. Return rate: COUNT(returns) / COUNT(order_lines).
   Join path: fact_return.line_id → fact_order_line.line_id → dim_product.product_id.
6. Supplier analysis: fact_return → fact_order_line → dim_product → dim_supplier.
7. Avoid cartesian products: Pre-aggregate each metric by dimension key before joining
   multiple fact tables.
8. Valid loyalty tiers: BRONZE, SILVER, GOLD, PLATINUM. Tier='NONE' means non-member.
9. Dormant member: signup_dt IS NOT NULL, never had REDEEM in fact_loyalty_txn AND never
   written a review in fact_review.
10. Store profitability: Revenue (completed SUM(line_total)) - COGS (qty × cost_price) - Refunds.
11. Completed order metrics: Use CASE WHEN order_status = 'COMPLETED' THEN 1 ELSE 0 END
    for counting completed orders; similar for CANCELLED, PENDING.
12. For document/benchmark questions, search the doc_document table using SQL LIKE or CONTAINS.

STRUCTURAL DATA GAPS (real — do NOT hallucinate values for these):
- Food & Beverage products have ZERO reviews in fact_review — report this as a gap.
- Singapore (SG) has ZERO inventory records in fact_inventory — report this as a gap.
- Singapore (SG) and India (IN) have ZERO BONUS loyalty transactions — report this as a gap.
- India (IN) and South Korea (KR) have ZERO BOGO promotions — report this as a gap.
- India (IN) has 100% NULL return_reason values in fact_return — report this as a gap.
When a segment has zero data, say so explicitly. Do not fabricate or estimate values.
```

### Metric View Updates

The following 5 tables need their metric views updated to match the Snowflake semantic view. Replace the existing metric view YAML for each table in the Genie Space. **No changes needed** for: `dim_employee`, `dim_product`, `dim_store`, `dim_supplier`, `fact_order_line`, `fact_loyalty_txn`, `fact_return`.

#### fact_customer — add `member_count`, `member_pct`, `is_member`

```yaml
version: 1.1

source: |-
  SELECT customer_id, customer_name, country_cd, city, gender, age_band,
         loyalty_tier, signup_dt, is_active
  FROM `<YOUR_CATALOG>`.retailiq.fact_customer

comment: Customer demographics and loyalty segmentation metrics

dimensions:
  - name: country_cd
    expr: country_cd
    comment: Customer country code
    display_name: Country

  - name: gender
    expr: gender
    comment: Customer gender
    display_name: Gender

  - name: age_band
    expr: age_band
    comment: Customer age group
    display_name: Age Band

  - name: loyalty_tier
    expr: loyalty_tier
    comment: "Customer loyalty program tier: NONE, BRONZE, SILVER, GOLD, PLATINUM. NONE means non-member."
    display_name: Loyalty Tier

  - name: is_active
    expr: is_active
    comment: Whether the customer is currently active
    display_name: Active Status

  - name: is_member
    expr: "CASE WHEN signup_dt IS NOT NULL THEN 1 ELSE 0 END"
    comment: "1 if customer has a signup date (loyalty member), 0 otherwise. Use to count or filter loyalty members."
    display_name: Is Member

measures:
  - name: customer_count
    expr: COUNT(1)
    comment: Total number of customers
    display_name: Customer Count

  - name: member_count
    expr: "COUNT(DISTINCT CASE WHEN signup_dt IS NOT NULL THEN customer_id END)"
    comment: "Count of distinct customers with a non-null signup date (loyalty members). Use as denominator for per-member metrics."
    display_name: Member Count

  - name: member_pct
    expr: "ROUND(100.0 * COUNT(DISTINCT CASE WHEN signup_dt IS NOT NULL THEN customer_id END) / COUNT(1), 1)"
    comment: Percentage of customers who are loyalty members
    display_name: Member %
    format:
      type: number
      decimal_places:
        type: exact
        places: 1

  - name: distinct_city_count
    expr: COUNT(DISTINCT city)
    comment: Number of distinct cities with customers
    display_name: Distinct Cities
```

#### fact_order — add completed/cancelled/pending metrics

```yaml
version: 1.1

source: |-
  SELECT order_id, customer_id, store_id, order_dt, order_status,
         payment_method, total_amount, discount_amount
  FROM `<YOUR_CATALOG>`.retailiq.fact_order

comment: "Order revenue, discount, and volume analysis. IMPORTANT: For revenue calculations, always filter order_status = 'COMPLETED'."

dimensions:
  - name: order_status
    expr: order_status
    comment: "Current status of the order: COMPLETED, CANCELLED, PENDING. Use COMPLETED for revenue."
    display_name: Order Status

  - name: payment_method
    expr: payment_method
    comment: Payment method used
    display_name: Payment Method

  - name: order_month
    expr: "DATE_TRUNC('MONTH', order_dt)"
    comment: Month the order was placed
    display_name: Order Month

  - name: store_id
    expr: store_id
    comment: Store where the order was placed
    display_name: Store ID

  - name: customer_id
    expr: customer_id
    comment: Customer who placed the order
    display_name: Customer ID

  - name: is_completed
    expr: "CASE WHEN order_status = 'COMPLETED' THEN 1 ELSE 0 END"
    comment: "1 if order is completed, 0 otherwise."
    display_name: Is Completed

  - name: is_cancelled
    expr: "CASE WHEN order_status = 'CANCELLED' THEN 1 ELSE 0 END"
    comment: "1 if order is cancelled, 0 otherwise."
    display_name: Is Cancelled

  - name: is_pending
    expr: "CASE WHEN order_status = 'PENDING' THEN 1 ELSE 0 END"
    comment: "1 if order is pending, 0 otherwise."
    display_name: Is Pending

measures:
  - name: total_revenue
    expr: SUM(total_amount)
    comment: "Sum of all order amounts across ALL statuses. WARNING: for actual revenue, use completed_revenue instead."
    display_name: Total Revenue (All Statuses)
    format:
      type: currency
      currency_code: USD
      decimal_places:
        type: exact
        places: 2

  - name: completed_revenue
    expr: "SUM(CASE WHEN order_status = 'COMPLETED' THEN total_amount ELSE 0 END)"
    comment: "Sum of order amounts for COMPLETED orders only. This is the correct revenue metric."
    display_name: Completed Revenue
    format:
      type: currency
      currency_code: USD
      decimal_places:
        type: exact
        places: 2

  - name: non_completed_amount
    expr: "SUM(CASE WHEN order_status IN ('CANCELLED', 'PENDING') THEN total_amount ELSE 0 END)"
    comment: "Sum of order amounts for CANCELLED or PENDING orders — revenue at risk or lost."
    display_name: Non-Completed Order Amount
    format:
      type: currency
      currency_code: USD
      decimal_places:
        type: exact
        places: 2

  - name: total_discount
    expr: SUM(discount_amount)
    comment: Sum of all discount amounts
    display_name: Total Discount
    format:
      type: currency
      currency_code: USD
      decimal_places:
        type: exact
        places: 2

  - name: order_count
    expr: COUNT(1)
    comment: Total number of orders
    display_name: Order Count

  - name: completed_order_count
    expr: "SUM(CASE WHEN order_status = 'COMPLETED' THEN 1 ELSE 0 END)"
    comment: Number of completed orders
    display_name: Completed Orders

  - name: cancelled_order_count
    expr: "SUM(CASE WHEN order_status = 'CANCELLED' THEN 1 ELSE 0 END)"
    comment: Number of cancelled orders
    display_name: Cancelled Orders

  - name: pending_order_count
    expr: "SUM(CASE WHEN order_status = 'PENDING' THEN 1 ELSE 0 END)"
    comment: Number of pending orders
    display_name: Pending Orders

  - name: completion_rate
    expr: "ROUND(100.0 * SUM(CASE WHEN order_status = 'COMPLETED' THEN 1 ELSE 0 END) / COUNT(1), 1)"
    comment: Percentage of orders that are completed
    display_name: Completion Rate %
    format:
      type: number
      decimal_places:
        type: exact
        places: 1

  - name: avg_order_value
    expr: AVG(total_amount)
    comment: Average order amount
    display_name: Avg Order Value
    format:
      type: currency
      currency_code: USD
      decimal_places:
        type: exact
        places: 2
```

#### fact_inventory — add `distinct_product_count`, `distinct_store_count`

```yaml
version: 1.1

source: |-
  SELECT inventory_id, product_id, store_id, snapshot_dt, stock_qty,
         reorder_point, days_on_hand, cost_value
  FROM `<YOUR_CATALOG>`.retailiq.fact_inventory

comment: "Inventory stock levels, cost valuation, and replenishment metrics. NOTE: Singapore (SG) has ZERO inventory records."

dimensions:
  - name: product_id
    expr: product_id
    comment: Product identifier
    display_name: Product ID

  - name: store_id
    expr: store_id
    comment: Store identifier
    display_name: Store ID

  - name: snapshot_month
    expr: "DATE_TRUNC('MONTH', snapshot_dt)"
    comment: Month of the inventory snapshot
    display_name: Snapshot Month

measures:
  - name: total_stock_qty
    expr: SUM(stock_qty)
    comment: Total units in stock
    display_name: Total Stock Qty

  - name: total_cost_value
    expr: SUM(cost_value)
    comment: Total inventory cost valuation
    display_name: Total Cost Value
    format:
      type: currency
      currency_code: USD
      decimal_places:
        type: exact
        places: 2

  - name: avg_days_on_hand
    expr: AVG(days_on_hand)
    comment: Average number of days inventory is held
    display_name: Avg Days on Hand
    format:
      type: number
      decimal_places:
        type: exact
        places: 1

  - name: snapshot_count
    expr: COUNT(1)
    comment: Number of inventory snapshots
    display_name: Snapshot Count

  - name: distinct_product_count
    expr: COUNT(DISTINCT product_id)
    comment: Number of unique products in inventory
    display_name: Distinct Products

  - name: distinct_store_count
    expr: COUNT(DISTINCT store_id)
    comment: Number of unique stores with inventory records
    display_name: Distinct Stores
```

#### fact_promotion — add `distinct_store_count`

```yaml
version: 1.1

source: |-
  SELECT promo_id, promo_name, product_id, store_id, promo_type,
         discount_pct, start_dt, end_dt, budget_usd, actual_spend_usd
  FROM `<YOUR_CATALOG>`.retailiq.fact_promotion

comment: "Promotion budget, spend, and effectiveness analysis. NOTE: BOGO promotions do not exist for India (IN) and South Korea (KR)."

dimensions:
  - name: promo_type
    expr: promo_type
    comment: "Type of promotion: DISCOUNT, BOGO, BUNDLE, CLEARANCE, SEASONAL"
    display_name: Promotion Type

  - name: store_id
    expr: store_id
    comment: Store targeted by the promotion
    display_name: Store ID

  - name: product_id
    expr: product_id
    comment: Product targeted by the promotion
    display_name: Product ID

  - name: start_month
    expr: "DATE_TRUNC('MONTH', start_dt)"
    comment: Month the promotion started
    display_name: Start Month

measures:
  - name: total_budget
    expr: SUM(budget_usd)
    comment: Total promotional budget
    display_name: Total Budget
    format:
      type: currency
      currency_code: USD
      decimal_places:
        type: exact
        places: 2

  - name: total_actual_spend
    expr: SUM(actual_spend_usd)
    comment: Total actual promotional spend
    display_name: Total Actual Spend
    format:
      type: currency
      currency_code: USD
      decimal_places:
        type: exact
        places: 2

  - name: avg_discount_pct
    expr: AVG(discount_pct)
    comment: Average discount percentage
    display_name: Avg Discount %
    format:
      type: number
      decimal_places:
        type: exact
        places: 1

  - name: promotion_count
    expr: COUNT(1)
    comment: Total number of promotions
    display_name: Promotion Count

  - name: distinct_store_count
    expr: COUNT(DISTINCT store_id)
    comment: Number of distinct stores with promotions
    display_name: Distinct Stores with Promos
```

#### fact_review — add `distinct_reviewer_count`

```yaml
version: 1.1

source: |-
  SELECT review_id, customer_id, product_id, rating, review_text,
         review_date, is_verified
  FROM `<YOUR_CATALOG>`.retailiq.fact_review

comment: "Customer review ratings and sentiment analysis. NOTE: Food & Beverage category has ZERO product reviews."

dimensions:
  - name: product_id
    expr: product_id
    comment: Product being reviewed
    display_name: Product ID

  - name: is_verified
    expr: is_verified
    comment: Whether the review is from a verified purchase
    display_name: Verified Purchase

  - name: review_month
    expr: "DATE_TRUNC('MONTH', review_date)"
    comment: Month the review was submitted
    display_name: Review Month

  - name: customer_id
    expr: customer_id
    comment: Customer who wrote the review
    display_name: Customer ID

measures:
  - name: avg_rating
    expr: AVG(rating)
    comment: Average product rating
    display_name: Avg Rating
    format:
      type: number
      decimal_places:
        type: exact
        places: 2

  - name: review_count
    expr: COUNT(1)
    comment: Total number of reviews
    display_name: Review Count

  - name: distinct_product_count
    expr: COUNT(DISTINCT product_id)
    comment: Number of unique products reviewed
    display_name: Distinct Products Reviewed

  - name: distinct_reviewer_count
    expr: COUNT(DISTINCT customer_id)
    comment: Number of unique customers who submitted reviews
    display_name: Distinct Reviewers
```



---

## Step 2: Create Knowledge Assistant

1. Go to **Playground** → **Knowledge Assistants**
2. Name: `retaildocs`
3. Upload the batched `.txt` files from `docs_batched/` directory (products, supplier_audits, industry_research)
4. Instructions:
```
Search the uploaded retail documents for product descriptions, supplier audit reports,
and industry research. When asked about products, suppliers, benchmarks, or industry
trends, search these documents and return relevant findings.
```

---

## Step 3: Create Supervisor Agent

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
the retaildocs Knowledge Assistant for relevant unstructured content. Always combine
structured query results with document findings when both are relevant.
```

### Sub-agents
- **Genie**: `Retail Operations Analytics` (the Genie Space)
- **Knowledge Assistant**: `retaildocs`

---

## Step 4: Apply Structural Gaps

Run these on the Databricks tables to match the Snowflake data:

```sql
USE CATALOG `<YOUR_CATALOG>`;
USE SCHEMA retailiq;

DELETE FROM fact_loyalty_txn WHERE txn_type = 'BONUS'
  AND customer_id IN (SELECT customer_id FROM fact_customer WHERE country_cd IN ('SG', 'IN'));

DELETE FROM fact_review WHERE product_id IN
  (SELECT product_id FROM dim_product WHERE category = 'Food & Beverage');

DELETE FROM fact_inventory WHERE store_id IN
  (SELECT store_id FROM dim_store WHERE country_cd = 'SG');

DELETE FROM fact_promotion WHERE promo_type = 'BOGO'
  AND store_id IN (SELECT store_id FROM dim_store WHERE country_cd IN ('IN', 'KR'));

UPDATE fact_return SET return_reason = NULL WHERE line_id IN
  (SELECT ol.line_id FROM fact_order_line ol
   JOIN fact_order o ON ol.order_id = o.order_id
   JOIN dim_store s ON o.store_id = s.store_id
   WHERE s.country_cd = 'IN');
```

---

## Step 5: Teardown Commands (if needed)

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
