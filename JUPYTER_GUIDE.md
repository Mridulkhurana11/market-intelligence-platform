# Jupyter Notebook Guide

The guided notebook is:

`notebooks/01_market_intelligence_analysis.ipynb`

It uses the same Python functions as `run_analysis.py` and includes:

- Source-table profiling and missing-value inspection
- Postcode geolocation cleanup and centroid aggregation
- Delivered-order item fact construction with join-grain checks
- Category and seller benchmarking
- Seller HHI and relative category opportunity scoring
- K-Means seller cohort exploration
- Buyer/seller geographic footprint map
- State-level buyer-share versus seller-presence comparison
- Haversine straight-line seller-to-buyer distance analysis
- Generation of the JSON payload consumed by the Vite dashboard

## Run it

From the repository root, after placing the nine CSV files in `data/olist/`:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
jupyter lab
```

Open the notebook and run cells from top to bottom. The notebook detects whether Jupyter was launched from the repository root or the `notebooks/` directory.

The Plotly geographic map is exploratory. Coordinates represent median postcode-prefix centroids, not exact addresses. Haversine distances are straight-line proxies, not road/courier routes.
