# Python environment

Recommended: Python 3.11 or 3.12. The project uses pandas, NumPy, scikit-learn and Plotly in the notebook. Vercel does not install these packages because the Vercel Root Directory is `frontend`; the React app only reads the generated static JSON file.


## Geospatial implementation

The core pipeline uses Pandas and NumPy for postcode-prefix centroid aggregation and the Haversine great-circle calculation. GeoPandas is not required for the current scope because the project does not perform polygon overlays, road-network routing, or point-in-polygon analysis. The notebook uses Plotly's geographic chart for the buyer/seller footprint visualisation.
