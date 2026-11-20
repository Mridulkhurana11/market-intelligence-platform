# Analysis methodology

## 1. Analytical unit

The core analytical fact is one row per `order_id` × `order_item_id` from a delivered order. Source tables at order grain are deduplicated/aggregated before joining to item grain so that payment and review records do not multiply item prices.

## 2. Preparation

1. Load the nine required source CSV files, including the postcode geolocation table.
2. Parse purchase/delivery timestamps and coerce numeric price, freight, review-score and payment-value fields.
3. Remove duplicate item keys (`order_id`, `order_item_id`), retaining the first record.
4. Exclude item lines with missing/non-positive item price.
5. Use delivered orders for the principal fulfilled-sales analysis; other order statuses remain visible in the order-status audit.
6. Deduplicate customer, product, seller and category translation dimensions before joining.
7. Aggregate review scores to one mean score per order and payment values to one total per order before joining.
8. Keep unknown categories/locations as explicit `Unknown` values rather than silently dropping otherwise valid item lines.
9. Remove exact duplicate geolocation rows, validate WGS84 coordinate ranges, then aggregate multiple coordinate observations to one median centroid per five-digit postcode prefix.
10. Join postcode centroids many-to-one to customer and seller records using five-digit postcode prefixes. This avoids a coordinate-table join multiplying item rows.

## 3. Measures

- **Delivered item GMV:** sum of item `price` for delivered order-item rows. `freight_value` is not included.
- **Orders:** distinct delivered `order_id` values.
- **Active sellers:** distinct `seller_id` values with at least one delivered item.
- **Category mix:** category GMV divided by total delivered item GMV.
- **Seller share:** seller GMV divided by total delivered item GMV.
- **Category seller HHI:** sum of squared seller GMV shares within category × 10,000.
- **Comparable YTD change:** latest observed year Jan 1 through latest observed purchase date compared with the equivalent previous-year window.
- **Average order review:** mean of order-level review averages for delivered orders with review records.
- **On-time rate:** share of delivered orders with a delivery timestamp less than or equal to the estimated delivery timestamp.
- **Repeat buyer rate:** share of identified `customer_unique_id` values with at least two distinct delivered orders.

## 4. Relative category opportunity index

The relative index is calculated from percentile ranks:

| Signal | Weight | Interpretation |
|---|---:|---|
| Log delivered GMV | 35% | Observed category demand scale |
| Comparable YTD GMV change | 30% | Recent change against equivalent previous-year window |
| Inverse seller HHI | 20% | Higher score for a less concentrated category seller base |
| Review gap (`5 - average review`) | 15% | Higher score where reviewed orders show more room for service improvement |

Missing percentile signals receive a neutral score of 50 to avoid silently eliminating categories. This score is a comparative investigation queue. It is not an external market opportunity estimate, a TAM/SAM/SOM model, a sales forecast, or an investment recommendation.

## 5. Seller clustering

K-Means is used for exploratory seller cohort discovery. Features are log1p-transformed and standardised: delivered GMV, delivered orders, distinct products, category breadth, average item price, unique buyer count and customer-state coverage. The run uses four clusters when enough sellers exist, `random_state=42`, and `n_init=20`. Clusters are ordered by mean GMV for consistent display. They are not ground-truth seller types.

## 6. Important attribution decisions

- Reviews are order-level. They are not attributed to individual sellers when an order can contain products from more than one seller.
- A single buyer can have more than one customer ID; repeat buyer analysis uses `customer_unique_id`.
- Olist seller IDs are anonymised.
- Market share and concentration only describe the records represented in this single marketplace dataset.
- Dataset values are historical (2016–2018). No current-market conclusions should be inferred.

## 7. Geospatial analysis

### Postcode centroid preparation

The Olist geolocation table may contain many coordinate observations for the same five-digit postcode prefix. Exact duplicate rows are removed first. Latitude and longitude are coerced to numeric and checked against valid WGS84 ranges. The table is then grouped by postcode prefix and the median latitude and longitude are used as one representative centroid. This reduces the geolocation table to a unique lookup key before it is joined to customer and seller dimensions.

### Buyer and seller footprint

Customer demand points are aggregated by customer city/state; seller supply points are aggregated by seller city/state. The dashboard plots the median postcode-centroid coordinates for these cities. Marker size indicates the corresponding activity measure (orders for buyer demand and sellers for seller supply). Coordinates are approximate representatives, not exact addresses.

### Regional seller-presence gap

For each state, the analysis compares the share of identified buyers with the share of active sellers. The gap is buyer share minus seller share, expressed in percentage points. A positive value indicates that buyer representation exceeds seller representation within this dataset. It is not a validated estimate of unmet demand, service availability or a market entry case.

### Seller-to-buyer geographic separation

For each unique order-seller pair, the Haversine formula calculates the great-circle distance between the buyer and seller postcode centroids. The analysis reports mapped-pair coverage, median/mean/90th percentile distance, distance bands and largest seller-state to customer-state corridors. These are straight-line geographic proxies—not road distances, shipping routes, or promised delivery times.

The project does not use a road network, route engine, or external geocoder.

## 8. Derived dashboard views

Three additional aggregates are computed by `build_analytics` so the React dashboard can answer specific questions without inventing records:

- **`monthly_category`**: delivered item GMV and distinct orders by purchase month and category. The eight categories with the highest total delivered GMV remain separate; every other category is grouped as `Other categories` within each month. The grouped values still sum to the total delivered GMV.
- **`delivery_distribution`**: delivered orders bucketed by purchase-to-delivery duration (0–3, 3–5, 5–7, 7–10, 10–15, 15–20, 20–30 and 30+ days). Orders without a valid non-negative delivery timestamp are excluded from this view only.
- **`delivery_review`**: the same delivery-duration bands joined to the deduplicated order-level review score, reporting mean review and reviewed order count per band. It is an observed association, not a causal effect of delivery time on satisfaction.

These views are deterministic transformations of the delivered-order data used for the headline KPIs. They do not alter GMV definitions, seller concentration, opportunity-score weights, K-Means clustering, postcode-centroid preparation or Haversine distance calculations.
