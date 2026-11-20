# Start here

## A. Get the source dataset

1. Open https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce.
2. Sign in to Kaggle (a free account may be required).
3. Download the dataset ZIP and extract it.
4. Copy all nine CSVs listed in `README.md` into `data/olist/`, including `olist_geolocation_dataset.csv`.
5. Do not put the downloaded ZIP itself in the folder. Geolocation is required for postcode mapping and seller-to-buyer distance analysis.

## B. Run Python analysis

Windows: double-click `run_analysis_windows.bat`.

Or run manually from the project root:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run_analysis.py
```

Check that `frontend/public/data/market_intelligence.json` has `"status": "ready"`.

## C. Explore the notebook

```powershell
python -m pip install jupyterlab
jupyter lab
```

Open `notebooks/01_market_intelligence_analysis.ipynb` and execute cells in order. It includes market analysis plus geospatial postcode mapping, state footprint comparison and Haversine distance proxies.

## D. Run the Vite dashboard

Windows: double-click `run_dashboard_windows.bat`.

Or:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL Vite prints (normally http://localhost:5173).

## E. Deploy to Vercel

1. Run the Python pipeline first and verify the generated JSON.
2. Commit `frontend/public/data/market_intelligence.json` to GitHub.
3. Import the repository into Vercel.
4. Framework Preset: **Vite**.
5. Root Directory: **frontend**.
6. Build Command: `npm run build` (default is fine).
7. Output Directory: `dist`.
8. Install Command: `npm install` (default is fine).
9. Deploy.

The Python code does not run on Vercel. It runs locally to create the static dashboard data file. Vercel builds the React/Vite frontend and serves that file.

## F. Refresh the project later

When you change the source CSVs or analysis logic:

1. Re-run `python run_analysis.py` from the repository root.
2. Review the changed output and methodology.
3. Commit the refreshed `frontend/public/data/market_intelligence.json`.
4. Push to GitHub; Vercel will rebuild.
