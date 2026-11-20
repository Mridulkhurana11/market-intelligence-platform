# Obsidian Atlas — Market Intelligence & Competitive Analysis Platform

An independent Business Analyst portfolio project that transforms a public marketplace dataset into a reproducible market-intelligence workflow and a deployed React dashboard.

**Python · Pandas · Scikit-learn · Seller Benchmarking · HHI · K-Means · React · Vite · Recharts · React Leaflet · Vercel**

The frontend is a premium dark geospatial console branded **Obsidian Atlas**: a compact navigation rail, an editorial panel layout, a real interactive Leaflet map and purpose-built chart types for seven analytical pages.


## Business question

**Within the observed Olist marketplace sample, which product categories show the strongest demand and relative opportunity signals, and how concentrated is seller competition within those categories?**

The analysis investigates delivered merchandise value and order trends, category demand and seller density, seller ranking and relative platform-sample share, seller concentration, comparable year-to-date category change, buyer reviews, delivery performance, payment mix, and exploratory seller cohorts.

**Scope guardrail:** Olist is one Brazilian marketplace operator. Seller/category shares here are shares within the observed delivered Olist records, not national Brazilian e-commerce market shares. The opportunity score is a prioritisation aid, not TAM, a market forecast, or a causal conclusion.

## Dataset

**Brazilian E-Commerce Public Dataset by Olist**

- Official download: https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce
- Coverage: approximately 100,000 marketplace orders from 2016–2018.
- Tables include orders, order items, customers, products, sellers, payments, reviews, postcode geolocation and category-name translation.
- Dataset licence shown on Kaggle: **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)**.

### Required files

Download the Kaggle ZIP, extract it, and place these nine CSVs directly inside `data/olist/`:

```text
data/olist/
├── olist_orders_dataset.csv
├── olist_order_items_dataset.csv
├── olist_customers_dataset.csv
├── olist_products_dataset.csv
├── olist_sellers_dataset.csv
├── olist_order_reviews_dataset.csv
├── olist_order_payments_dataset.csv
├── product_category_name_translation.csv
└── olist_geolocation_dataset.csv
```

The geolocation table contains approximately one million records mapping Brazilian five-digit postcode prefixes to multiple latitude/longitude observations. It is required for the geospatial analysis. The pipeline collapses multiple coordinate rows to one median centroid per postcode prefix before joining to customers and sellers, preventing a one-to-many join from multiplying order or GMV values.

### Licence note

Attribute Olist and the Kaggle dataset, preserve the same licence for adaptations of the dataset, and do not use the dataset in a commercial product or paid client engagement without separate permission. See `DATA_LICENSE.md`.

## Repository structure

```text
market-intelligence-platform/
├── data/olist/                       # Place 9 source CSVs here
├── notebooks/01_market_intelligence_analysis.ipynb
├── src/pipeline.py                   # Loading, cleaning, joins, metrics, geo, ML
├── tests/test_pipeline.py             # Tests using a tiny synthetic fixture
├── outputs/                           # Local detailed CSV analysis outputs
├── frontend/
│   ├── public/data/market_intelligence.json  # Generated Vite/Vercel payload
│   ├── src/App.jsx                           # Shell, rail navigation, hash routing
│   ├── src/components/AtlasMap.jsx           # React Leaflet dark basemap + layers
│   ├── src/components/Primitives.jsx         # Shared panels, KPIs, tables, states
│   ├── src/pages/                            # Seven analytical pages
│   ├── src/lib/                              # Formatters + chart design tokens
│   ├── src/styles.css                        # Obsidian Atlas CSS token system
│   ├── .env.example                          # Optional CARTO basemap key
│   ├── package.json
│   └── vite.config.js
├── run_analysis.py
├── requirements.txt
├── ANALYSIS_METHODOLOGY.md
├── DATA_LICENSE.md
└── README.md
```

## Run locally

### 1. Download and place the dataset

Download the ZIP from https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce (a free Kaggle login may be required), extract it, and place the nine required CSV files in `data/olist/`.

### 2. Set up Python

Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Run the analysis pipeline

From the repository root:

```bash
python run_analysis.py
```

The pipeline validates the required tables, constructs a delivered-order item fact table, computes seller/category/experience metrics, fits exploratory K-Means seller cohorts, and writes:

```text
frontend/public/data/market_intelligence.json
outputs/category_benchmark.csv
outputs/seller_benchmark.csv
outputs/seller_cohorts.csv
outputs/monthly_market_trend.csv
outputs/delivered_item_fact.csv
outputs/geospatial_state_balance.csv
outputs/geospatial_distance_pairs.csv
outputs/geospatial_city_points.csv
```

The generated JSON is required by the deployed dashboard and should be committed to Git. Row-level CSV extracts in `outputs/` are local analysis artefacts and are excluded by `.gitignore`.

### 4. Explore the Jupyter notebook

```bash
python -m pip install jupyterlab
jupyter lab
```

Open `notebooks/market_intelligence_analysis.ipynb` and run cells from top to bottom. The notebook calls the same functions as `run_analysis.py` so the analysis and dashboard use one code path.

### 5. Run the React dashboard

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, typically `http://localhost:5173`. Each dashboard page has a hash route (for example `#/geospatial`) so views can be linked directly.

### 6. Configure the optional dark basemap key

The interactive map uses **react-leaflet 4** with **leaflet 1.9.x** and a genuinely dark raster basemap.

```bash
cd frontend
copy .env.example .env.local   # Windows PowerShell
# cp .env.example .env.local   # macOS/Linux
```

Create a free key at [CARTO basemaps](https://carto.com/basemaps/apikey/) and set:

```text
VITE_CARTO_API_KEY=your_key_here
```

- With a key: CARTO **Dark Matter** tiles are loaded, with visible © OpenStreetMap and © CARTO attribution.
- Without a key: the map falls back to OpenStreetMap tiles with a map-only dark visual treatment and © OpenStreetMap attribution. The map still works; no blank canvas is shown.
- Never commit `.env.local`. Vite embeds the value at dev/build time; add the same variable in the Vercel project if you want Dark Matter in production.

Map coordinates come only from `map_points` and `state_balance` in the generated JSON. Markers are city-level postcode-centroid aggregates; corridors link state centroids schematically. Distances are straight-line Haversine estimates, not routes or delivery tracking.

Append `?corridors=1` before the hash to open a map view with the top-corridor layer already enabled, for example `http://localhost:5173/?corridors=1#/geospatial`.

### Dashboard pages

| Page | Primary visualisation |
|---|---|
| Market overview | Large map, opportunity lollipop ranking, concentration meters, category treemap |
| Market trends | Monthly line, category-composition stacked area, YoY bars, year × month heatmap |
| Category intelligence | Treemap, demand/seller bubble plot, growth-vs-concentration matrix, ranked bars |
| Seller benchmarking | Pareto curve, cohort radar, GMV-vs-reach scatter, searchable leaderboard |
| Geospatial intelligence | Full dark map with buyer/seller layers and corridor toggle, diverging state bars, distance histogram, flow table |
| Buyer experience | Review and delivery histograms, delivery/review relationship, payment bars, retention gauge |
| Data & methodology | Source inventory, cleaning audit, coverage meters, definitions, ML method, limitations |

## Deploy to Vercel

Python is used locally to generate the dashboard JSON; Vercel only builds and serves the React app.

1. Run `python run_analysis.py` first.
2. Confirm `frontend/public/data/market_intelligence.json` has `"status": "ready"` and populated metrics.
3. Commit and push the generated JSON file to GitHub.
4. Import the repository into Vercel.
5. Set **Framework Preset: Vite**.
6. Set **Root Directory: `frontend`**.
7. Build Command: `npm run build` (or leave the Vite default).
8. Output Directory: `dist`.
9. Install Command: `npm install` (or leave the default).
10. Optionally add `VITE_CARTO_API_KEY` as a project environment variable for the Dark Matter basemap.
11. Deploy.

There is intentionally no Python `requirements.txt` in `frontend/`. Setting the Vercel root directory to `frontend` ensures Vercel installs the React/Vite dependencies, not the root Python environment.

After a new local analysis run, commit the refreshed `frontend/public/data/market_intelligence.json` and Vercel will rebuild the dashboard.

## Analytical approach and definitions

- **Delivered item GMV:** sum of item `price` for line items whose order status is `delivered`. Freight is excluded and reported separately.
- **Category/seller share:** share of delivered item GMV within this Olist dataset only.
- **Seller concentration (HHI):** sum of squared seller GMV shares multiplied by 10,000. It is a sample-level concentration signal, not a formal definition of a national industry market.
- **Comparable YTD change:** current calendar year from January 1 through the latest observed purchase date compared with the same date window in the prior year.
- **Category opportunity score:** demand scale percentile (35%), comparable YTD growth percentile (30%), seller-fragmentation percentile (20%), and review-gap percentile (15%). It is relative and descriptive; it is not TAM or a prediction.
- **Seller cohorts:** K-Means on log-transformed and standardised seller GMV, orders, product breadth, category breadth, average item price, buyer count and state coverage. Clusters are exploratory and not ground-truth labels.
- **Geospatial enrichment:** the source geolocation table is deduplicated and aggregated to one median latitude/longitude centroid per five-digit postcode prefix, then joined many-to-one to customer and seller records.
- **Geographic footprint:** city/state demand and seller-presence markers are positioned using postcode centroids. City coordinates are representative median centroids, not exact addresses.
- **Seller-presence gap:** state-level buyer share minus active-seller share. A positive value means a state represents a larger share of identified buyers than active sellers in the sample; it is a descriptive coverage signal, not proof of unmet demand.
- **Seller-to-buyer distance:** Haversine great-circle distance between seller and buyer postcode centroids, calculated once per order-seller pair. It is a straight-line geographic proxy, not a road route, courier route or delivery-time estimate.
- **Reviews:** deduplicated to order grain. Ratings are not attributed to individual sellers when an order may contain multiple sellers.
- **Payments:** aggregated at order/payment-method grain before the analysis to avoid multiplying order-item value in joins.
- **Derived dashboard views:** `monthly_category` groups the eight largest categories by delivered GMV and rolls the remainder into `Other categories` per month; `delivery_distribution` and `delivery_review` bucket delivered orders by purchase-to-delivery duration. All three are recalculated from the same delivered records — no additional source table, estimate or invented record is introduced.

## Limitations

- The data represents a single marketplace operator and anonymised seller IDs, not every competitor or retailer in Brazil.
- The dataset covers 2016–2018 and is historical, not a current market snapshot. Postcode centroids approximate locations and may not represent the exact customer or seller address.
- The dataset does not contain all cost components, advertising spend, inventory levels, precise delivery routes, actual road-network distance, or external total-market denominators. The project therefore does not claim seller profitability, market-wide share, TAM/SAM/SOM, or causal drivers.
- Category opportunity scoring depends on the explicitly stated weights and observed variables; users should test alternative weights before making real decisions.
- Seller cluster labels are exploratory groups, not verified business archetypes.

## Tests

From the repository root:

```bash
pytest -q
```

Tests use a tiny synthetic fixture to validate join grain, cancellation exclusion, GMV arithmetic, geolocation handling, derived view aggregation and output scope. The public dashboard itself is generated from the downloaded Olist source tables.

## Browser verification and screenshots

After `npm install` and `npm run build`, start the production preview and run the dependency-free Chrome smoke test from the repository root:

```bash
cd frontend && npm run preview -- --port 4173
# in a second terminal, from the repository root:
node scripts/browser-smoke.mjs
```

The script drives headless Chrome through the Chrome DevTools Protocol (no Playwright/Puppeteer dependency). It checks all seven routes, exercises the trends metric switch, category/seller search and all three map layer toggles, checks mobile layout for horizontal overflow, and writes:

- `artifacts/smoke-report.json`
- `artifacts/screenshots/overview.png`
- `artifacts/screenshots/trends.png`
- `artifacts/screenshots/categories.png`
- `artifacts/screenshots/sellers.png`
- `artifacts/screenshots/geospatial.png`
- `artifacts/screenshots/experience.png`
- `artifacts/screenshots/quality.png`
- `artifacts/screenshots/geospatial-map-all-layers.png`
- `artifacts/screenshots/mobile-overview.png`
- `artifacts/screenshots/mobile-geospatial.png`

Set `CHROME_PATH` if Chrome is installed somewhere other than the default Windows path, and `BASE_URL` if the preview uses a different port.

## Attribution

Olist. *Brazilian E-Commerce Public Dataset by Olist*. Kaggle. https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce. Licence: CC BY-NC-SA 4.0.
