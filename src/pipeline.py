"""Reproducible Olist marketplace intelligence pipeline.

The analysis is intentionally scoped to the observed Olist marketplace sample.
It does not estimate the entire Brazilian e-commerce market or claim national
market share. Seller/category shares are within the delivered Olist orders in
this dataset.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "olist"
OUTPUT_DIR = ROOT / "outputs"
DASHBOARD_FILE = ROOT / "frontend" / "public" / "data" / "market_intelligence.json"

FILES = {
    "orders": "olist_orders_dataset.csv",
    "items": "olist_order_items_dataset.csv",
    "customers": "olist_customers_dataset.csv",
    "products": "olist_products_dataset.csv",
    "sellers": "olist_sellers_dataset.csv",
    "reviews": "olist_order_reviews_dataset.csv",
    "payments": "olist_order_payments_dataset.csv",
    "translation": "product_category_name_translation.csv",
    "geolocation": "olist_geolocation_dataset.csv",
}


def locate_file(filename: str) -> Path:
    candidates = [DATA_DIR / filename, ROOT / "data" / filename]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    matches = list((ROOT / "data").rglob(filename)) if (ROOT / "data").exists() else []
    if matches:
        return matches[0]
    raise FileNotFoundError(
        f"Missing {filename}. Download the Olist dataset from "
        "https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce and "
        f"place the extracted CSV in {DATA_DIR}"
    )


def _read_csv(filename: str, **kwargs: Any) -> pd.DataFrame:
    path = locate_file(filename)
    return pd.read_csv(path, low_memory=False, **kwargs)


def load_sources() -> dict[str, pd.DataFrame]:
    """Load the nine Olist source CSVs, including the postcode geolocation table."""
    return {
        "orders": _read_csv(FILES["orders"], dtype={"order_id": "string", "customer_id": "string"}),
        "items": _read_csv(FILES["items"], dtype={"order_id": "string", "product_id": "string", "seller_id": "string"}),
        "customers": _read_csv(FILES["customers"], dtype={"customer_id": "string", "customer_unique_id": "string", "customer_zip_code_prefix": "string"}),
        "products": _read_csv(FILES["products"], dtype={"product_id": "string"}),
        "sellers": _read_csv(FILES["sellers"], dtype={"seller_id": "string", "seller_zip_code_prefix": "string"}),
        "reviews": _read_csv(FILES["reviews"], dtype={"order_id": "string"}),
        "payments": _read_csv(FILES["payments"], dtype={"order_id": "string"}),
        "translation": _read_csv(FILES["translation"]),
        "geolocation": _read_csv(FILES["geolocation"], dtype={"geolocation_zip_code_prefix": "string"}),
    }


def _normalise_sources(raw: dict[str, pd.DataFrame]) -> tuple[dict[str, pd.DataFrame], dict[str, Any]]:
    src = {k: v.copy() for k, v in raw.items()}
    row_counts = {k: int(len(v)) for k, v in src.items()}

    for col in ["order_purchase_timestamp", "order_approved_at", "order_delivered_carrier_date",
                "order_delivered_customer_date", "order_estimated_delivery_date"]:
        if col in src["orders"]:
            src["orders"][col] = pd.to_datetime(src["orders"][col], errors="coerce")

    src["orders"]["order_status"] = src["orders"]["order_status"].astype("string").str.strip().str.lower()
    src["items"]["price"] = pd.to_numeric(src["items"]["price"], errors="coerce")
    src["items"]["freight_value"] = pd.to_numeric(src["items"]["freight_value"], errors="coerce")
    src["reviews"]["review_score"] = pd.to_numeric(src["reviews"]["review_score"], errors="coerce")
    src["payments"]["payment_value"] = pd.to_numeric(src["payments"]["payment_value"], errors="coerce")

    # The public source contains duplicate review rows for some orders. Use the
    # mean score per order so item joins do not multiply transaction value.
    review_order = (src["reviews"].dropna(subset=["order_id", "review_score"])
                    .groupby("order_id", as_index=False)
                    .agg(review_score=("review_score", "mean"), review_count=("review_score", "size")))

    # Payments are aggregated to order grain before they are used in analysis.
    payment_order = (src["payments"].dropna(subset=["order_id"])
                     .groupby("order_id", as_index=False)
                     .agg(payment_total=("payment_value", "sum")))
    payment_mix = (src["payments"].dropna(subset=["payment_type", "payment_value"])
                   .groupby("payment_type", as_index=False)
                   .agg(payment_value=("payment_value", "sum"), payment_records=("payment_value", "size"))
                   .sort_values("payment_value", ascending=False))

    src["review_order"] = review_order
    src["payment_order"] = payment_order
    src["payment_mix"] = payment_mix
    src["source_row_counts"] = row_counts
    return src, {"source_rows": row_counts}



def _normalise_zip_prefix(values: pd.Series) -> pd.Series:
    """Normalise Brazilian postcode prefixes to five-character strings."""
    cleaned = values.astype("string").str.replace(r"\D", "", regex=True)
    cleaned = cleaned.str.zfill(5)
    return cleaned.where(cleaned.str.len().eq(5))


def prepare_geolocation_lookup(geolocation: pd.DataFrame | None) -> tuple[pd.DataFrame, dict[str, int]]:
    """Deduplicate/aggregate the many-coordinate-per-postcode geolocation table.

    The source has multiple points for a postcode prefix. Median latitude and
    longitude create one representative postcode centroid, preventing a
    one-to-many join from multiplying orders or item GMV.
    """
    columns = ["zip_code_prefix", "geo_lat", "geo_lng"]
    if geolocation is None or geolocation.empty:
        return pd.DataFrame(columns=columns), {
            "source_rows": 0, "exact_duplicates_removed": 0,
            "valid_coordinate_rows": 0, "mapped_zip_prefixes": 0,
        }

    geo = geolocation.copy()
    expected = {"geolocation_zip_code_prefix", "geolocation_lat", "geolocation_lng"}
    if not expected.issubset(geo.columns):
        raise ValueError(f"Geolocation table must contain: {sorted(expected)}")

    source_rows = len(geo)
    duplicate_rows = int(geo.duplicated().sum())
    geo = geo.drop_duplicates().copy()
    geo["zip_code_prefix"] = _normalise_zip_prefix(geo["geolocation_zip_code_prefix"])
    geo["geo_lat"] = pd.to_numeric(geo["geolocation_lat"], errors="coerce")
    geo["geo_lng"] = pd.to_numeric(geo["geolocation_lng"], errors="coerce")
    valid = (
        geo["zip_code_prefix"].notna()
        & geo["geo_lat"].between(-90, 90)
        & geo["geo_lng"].between(-180, 180)
    )
    geo = geo.loc[valid].copy()
    lookup = (geo.groupby("zip_code_prefix", as_index=False)
              .agg(geo_lat=("geo_lat", "median"), geo_lng=("geo_lng", "median")))
    return lookup, {
        "source_rows": int(source_rows),
        "exact_duplicates_removed": duplicate_rows,
        "valid_coordinate_rows": int(len(geo)),
        "mapped_zip_prefixes": int(len(lookup)),
    }


def haversine_km(lat1, lon1, lat2, lon2):
    """Vectorised great-circle distance in km between coordinate pairs."""
    lat1 = np.radians(np.asarray(lat1, dtype=float))
    lon1 = np.radians(np.asarray(lon1, dtype=float))
    lat2 = np.radians(np.asarray(lat2, dtype=float))
    lon2 = np.radians(np.asarray(lon2, dtype=float))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 6371.0088 * (2 * np.arcsin(np.sqrt(np.clip(a, 0, 1))))


def build_geospatial_analytics(fact: pd.DataFrame, geo_audit: dict[str, int] | None = None) -> dict[str, Any]:
    """Build spatial coverage, buyer/seller footprint and postcode distance metrics.

    City points use median postcode-centroid coordinates. Buyer/seller shares
    and distance figures are scoped to the observed delivered Olist sample.
    Straight-line distances are geographic proxies, not road or courier routes.
    """
    required = {"customer_geo_lat", "customer_geo_lng", "seller_geo_lat", "seller_geo_lng"}
    if fact.empty or not required.issubset(fact.columns):
        return {"summary": {"mapped_customer_order_share": 0.0, "mapped_seller_item_share": 0.0,
                            "mapped_order_seller_pairs": 0, "median_pair_distance_km": None,
                            "average_pair_distance_km": None, "p90_pair_distance_km": None,
                            "mapped_zip_prefixes": int((geo_audit or {}).get("mapped_zip_prefixes", 0))},
                "map_points": [], "state_balance": [], "distance_pairs": [], "distance_buckets": []}

    order_base = fact.drop_duplicates("order_id").copy()
    customer_city_perf = (fact.groupby(["customer_state", "customer_city"], as_index=False)
                          .agg(gmv=("item_gmv", "sum"), orders=("order_id", "nunique"),
                               buyers=("customer_unique_id", "nunique")))
    customer_city_geo = (order_base.groupby(["customer_state", "customer_city"], as_index=False)
                         .agg(lat=("customer_geo_lat", "median"), lon=("customer_geo_lng", "median")))
    customer_city = customer_city_perf.merge(customer_city_geo, on=["customer_state", "customer_city"], how="left")
    customer_city = customer_city.dropna(subset=["lat", "lon"]).sort_values("orders", ascending=False)
    customer_city["role"] = "Buyer demand"
    customer_city["city_label"] = customer_city["customer_city"].astype(str).str.title()
    customer_city["state"] = customer_city["customer_state"]
    customer_city["intensity"] = customer_city["orders"]
    customer_city["entities"] = customer_city["buyers"]

    seller_city_perf = (fact.groupby(["seller_state", "seller_city"], as_index=False)
                        .agg(gmv=("item_gmv", "sum"), orders=("order_id", "nunique"),
                             sellers=("seller_id", "nunique")))
    seller_base = fact.drop_duplicates("seller_id")
    seller_city_geo = (seller_base.groupby(["seller_state", "seller_city"], as_index=False)
                       .agg(lat=("seller_geo_lat", "median"), lon=("seller_geo_lng", "median")))
    seller_city = seller_city_perf.merge(seller_city_geo, on=["seller_state", "seller_city"], how="left")
    seller_city = seller_city.dropna(subset=["lat", "lon"]).sort_values("sellers", ascending=False)
    seller_city["role"] = "Seller supply"
    seller_city["city_label"] = seller_city["seller_city"].astype(str).str.title()
    seller_city["state"] = seller_city["seller_state"]
    seller_city["intensity"] = seller_city["sellers"]
    seller_city["entities"] = seller_city["sellers"]

    # Keep the payload lightweight while preserving the busiest mapped centres.
    buyer_points = customer_city.head(180)[["role", "city_label", "state", "lat", "lon", "gmv", "orders", "entities", "intensity"]]
    seller_points = seller_city.head(180)[["role", "city_label", "state", "lat", "lon", "gmv", "orders", "entities", "intensity"]]
    map_points = pd.concat([buyer_points, seller_points], ignore_index=True)

    demand_state = (fact.groupby("customer_state", as_index=False)
                    .agg(demand_gmv=("item_gmv", "sum"), orders=("order_id", "nunique"),
                         buyers=("customer_unique_id", "nunique")))
    demand_geo = (order_base.groupby("customer_state", as_index=False)
                  .agg(demand_lat=("customer_geo_lat", "median"), demand_lon=("customer_geo_lng", "median")))
    demand_state = demand_state.merge(demand_geo, on="customer_state", how="left")

    seller_state = (seller_base.groupby("seller_state", as_index=False)
                    .agg(active_sellers=("seller_id", "nunique")))
    seller_gmv = (fact.groupby("seller_state", as_index=False)
                  .agg(seller_origin_gmv=("item_gmv", "sum")))
    seller_geo = (seller_base.groupby("seller_state", as_index=False)
                  .agg(seller_lat=("seller_geo_lat", "median"), seller_lon=("seller_geo_lng", "median")))
    supply_state = seller_state.merge(seller_gmv, on="seller_state", how="left").merge(seller_geo, on="seller_state", how="left")
    state_balance = demand_state.merge(supply_state, left_on="customer_state", right_on="seller_state", how="outer")
    state_balance["state"] = state_balance["customer_state"].fillna(state_balance["seller_state"])
    state_balance = state_balance.drop(columns=["customer_state", "seller_state"])
    for col in ["buyers", "active_sellers", "orders", "demand_gmv", "seller_origin_gmv"]:
        state_balance[col] = state_balance[col].fillna(0)
    total_buyers = max(float(state_balance["buyers"].sum()), 1.0)
    total_sellers = max(float(state_balance["active_sellers"].sum()), 1.0)
    state_balance["buyer_share"] = state_balance["buyers"] / total_buyers
    state_balance["seller_presence_share"] = state_balance["active_sellers"] / total_sellers
    state_balance["seller_presence_gap_pp"] = (state_balance["buyer_share"] - state_balance["seller_presence_share"]) * 100
    state_balance = state_balance.sort_values("buyers", ascending=False)

    # One record per order-seller pair avoids duplicating a single seller-order
    # relationship when several item lines come from the same seller.
    pair_cols = ["customer_geo_lat", "customer_geo_lng", "seller_geo_lat", "seller_geo_lng",
                 "customer_state", "seller_state"]
    pairs = (fact.groupby(["order_id", "seller_id"], as_index=False)
             .agg(item_gmv=("item_gmv", "sum"), **{c: (c, "first") for c in pair_cols}))
    mapped_pairs = pairs.dropna(subset=pair_cols[:4]).copy()
    if len(mapped_pairs):
        mapped_pairs["straight_line_distance_km"] = haversine_km(
            mapped_pairs["customer_geo_lat"], mapped_pairs["customer_geo_lng"],
            mapped_pairs["seller_geo_lat"], mapped_pairs["seller_geo_lng"])
    else:
        mapped_pairs["straight_line_distance_km"] = pd.Series(dtype=float)
    distance_summary = {
        "mapped_order_seller_pairs": int(len(mapped_pairs)),
        "median_pair_distance_km": float(mapped_pairs["straight_line_distance_km"].median()) if len(mapped_pairs) else None,
        "average_pair_distance_km": float(mapped_pairs["straight_line_distance_km"].mean()) if len(mapped_pairs) else None,
        "p90_pair_distance_km": float(mapped_pairs["straight_line_distance_km"].quantile(.90)) if len(mapped_pairs) else None,
    }
    pair_state = (mapped_pairs.groupby(["seller_state", "customer_state"], as_index=False)
                  .agg(order_seller_pairs=("order_id", "size"), item_gmv=("item_gmv", "sum"),
                       median_distance_km=("straight_line_distance_km", "median"))
                  .sort_values("item_gmv", ascending=False).head(15)) if len(mapped_pairs) else pd.DataFrame(
                      columns=["seller_state", "customer_state", "order_seller_pairs", "item_gmv", "median_distance_km"])
    bins = [0, 100, 250, 500, 1000, 2000, 10000]
    labels = ["0–100", "100–250", "250–500", "500–1,000", "1,000–2,000", "2,000+"]
    if len(mapped_pairs):
        mapped_pairs["distance_band_km"] = pd.cut(mapped_pairs["straight_line_distance_km"], bins=bins, labels=labels, include_lowest=True)
        distance_buckets = (mapped_pairs.groupby("distance_band_km", observed=False, as_index=False)
                            .agg(order_seller_pairs=("order_id", "size")))
    else:
        distance_buckets = pd.DataFrame({"distance_band_km": labels, "order_seller_pairs": [0] * len(labels)})

    summary = {
        **distance_summary,
        "mapped_customer_order_share": float(order_base["customer_geo_lat"].notna().mean()) if len(order_base) else 0.0,
        "mapped_seller_item_share": float(fact["seller_geo_lat"].notna().mean()) if len(fact) else 0.0,
        "mapped_zip_prefixes": int((geo_audit or {}).get("mapped_zip_prefixes", 0)),
        "geo_source_rows": int((geo_audit or {}).get("source_rows", 0)),
        "geo_exact_duplicates_removed": int((geo_audit or {}).get("exact_duplicates_removed", 0)),
        "buyer_city_points": int(len(customer_city)),
        "seller_city_points": int(len(seller_city)),
    }
    return {
        "summary": summary,
        "map_points": json.loads(map_points.replace({np.nan: None, np.inf: None, -np.inf: None}).to_json(orient="records")),
        "state_balance": json.loads(state_balance.replace({np.nan: None, np.inf: None, -np.inf: None}).to_json(orient="records")),
        "distance_pairs": json.loads(pair_state.replace({np.nan: None, np.inf: None, -np.inf: None}).to_json(orient="records")),
        "distance_buckets": json.loads(distance_buckets.replace({np.nan: None, np.inf: None, -np.inf: None}).to_json(orient="records")),
    }

def build_item_fact(raw: dict[str, pd.DataFrame]) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    """Create a delivered-order item fact table without join fan-out."""
    src, audit = _normalise_sources(raw)
    orders = src["orders"].copy()
    items = src["items"].copy()

    duplicate_item_mask = items.duplicated(subset=["order_id", "order_item_id"], keep="first")
    duplicate_item_rows = int(duplicate_item_mask.sum())
    items = items.loc[~duplicate_item_mask].copy()

    bad_price = items["price"].isna() | (items["price"] <= 0)
    invalid_price_rows = int(bad_price.sum())
    items = items.loc[~bad_price].copy()
    items["freight_value"] = items["freight_value"].fillna(0).clip(lower=0)

    delivered_orders = orders.loc[orders["order_status"].eq("delivered")].copy()
    delivered_orders = delivered_orders.dropna(subset=["order_purchase_timestamp"])
    delivered_order_ids = set(delivered_orders["order_id"].dropna().astype(str))

    # Order-grain dimensions are unique before joining to item grain.
    geo_lookup, geo_audit = prepare_geolocation_lookup(src.get("geolocation"))
    customer_cols = [c for c in ["customer_id", "customer_unique_id", "customer_city", "customer_state", "customer_zip_code_prefix"] if c in src["customers"].columns]
    customers = src["customers"][customer_cols].drop_duplicates("customer_id")
    if "customer_zip_code_prefix" in customers.columns:
        customers["zip_code_prefix"] = _normalise_zip_prefix(customers["customer_zip_code_prefix"])
        customers = customers.merge(geo_lookup, on="zip_code_prefix", how="left", validate="many_to_one")
    else:
        customers["geo_lat"] = np.nan
        customers["geo_lng"] = np.nan
    customers = customers.rename(columns={"geo_lat": "customer_geo_lat", "geo_lng": "customer_geo_lng"})
    product_cols = [c for c in ["product_id", "product_category_name"] if c in src["products"].columns]
    products = src["products"][product_cols].drop_duplicates("product_id")
    seller_cols = [c for c in ["seller_id", "seller_city", "seller_state", "seller_zip_code_prefix"] if c in src["sellers"].columns]
    sellers = src["sellers"][seller_cols].drop_duplicates("seller_id")
    if "seller_zip_code_prefix" in sellers.columns:
        sellers["zip_code_prefix"] = _normalise_zip_prefix(sellers["seller_zip_code_prefix"])
        sellers = sellers.merge(geo_lookup, on="zip_code_prefix", how="left", validate="many_to_one")
    else:
        sellers["geo_lat"] = np.nan
        sellers["geo_lng"] = np.nan
    sellers = sellers.rename(columns={"geo_lat": "seller_geo_lat", "geo_lng": "seller_geo_lng"})
    translation = src["translation"][["product_category_name", "product_category_name_english"]].drop_duplicates("product_category_name")

    fact = items.merge(delivered_orders[["order_id", "customer_id", "order_purchase_timestamp", "order_delivered_customer_date", "order_estimated_delivery_date"]], on="order_id", how="inner", validate="many_to_one")
    fact = fact.merge(customers, on="customer_id", how="left", validate="many_to_one")
    fact = fact.merge(products, on="product_id", how="left", validate="many_to_one")
    fact = fact.merge(translation, on="product_category_name", how="left", validate="many_to_one")
    fact = fact.merge(sellers, on="seller_id", how="left", validate="many_to_one")
    fact = fact.merge(src["review_order"], on="order_id", how="left", validate="many_to_one")
    fact = fact.merge(src["payment_order"], on="order_id", how="left", validate="many_to_one")

    fact["category"] = fact["product_category_name_english"].fillna(fact["product_category_name"]).fillna("Unknown / unclassified")
    fact["category"] = fact["category"].astype(str).str.replace("_", " ", regex=False).str.title()
    fact["customer_state"] = fact["customer_state"].fillna("Unknown")
    fact["seller_state"] = fact["seller_state"].fillna("Unknown")
    fact["customer_city"] = fact["customer_city"].fillna("Unknown")
    fact["item_gmv"] = fact["price"].astype(float)
    fact["freight_value"] = fact["freight_value"].astype(float)
    fact["purchase_date"] = fact["order_purchase_timestamp"].dt.date.astype(str)
    fact["purchase_month"] = fact["order_purchase_timestamp"].dt.to_period("M").astype(str)
    fact["purchase_quarter"] = fact["order_purchase_timestamp"].dt.to_period("Q").astype(str)
    fact["delivery_days"] = (pd.to_datetime(fact["order_delivered_customer_date"], errors="coerce") - fact["order_purchase_timestamp"]).dt.total_seconds() / 86400
    fact["on_time_delivery"] = (pd.to_datetime(fact["order_delivered_customer_date"], errors="coerce") <= pd.to_datetime(fact["order_estimated_delivery_date"], errors="coerce"))

    # Order status is deliberately analysed separately from fulfilled GMV.
    orders_all = orders.copy()
    orders_all["purchase_year"] = orders_all["order_purchase_timestamp"].dt.year
    payment_join = src["payments"].merge(delivered_orders[["order_id"]].drop_duplicates(), on="order_id", how="inner")
    payment_methods_delivered = (payment_join.groupby("payment_type", as_index=False)
                                 .agg(payment_value=("payment_value", "sum"), payment_records=("payment_value", "size"))
                                 .sort_values("payment_value", ascending=False))

    missing_by_source = {
        name: {str(col): int(frame[col].isna().sum()) for col in frame.columns if int(frame[col].isna().sum()) > 0}
        for name, frame in raw.items()
    }
    audit.update({
        "duplicate_item_rows_removed": duplicate_item_rows,
        "missing_by_source": missing_by_source,
        "geolocation_audit": geo_audit,
        "geo_lookup": geo_lookup,
        "payment_methods_delivered": payment_methods_delivered,

        "invalid_price_rows_removed": invalid_price_rows,
        "delivered_orders": int(len(delivered_orders)),
        "delivered_order_ids_with_items": int(fact["order_id"].nunique()),
        "delivered_item_rows": int(len(fact)),
        "delivered_orders_without_items": int(max(0, len(delivered_order_ids) - fact["order_id"].nunique())),
        "unmatched_products": int(fact["product_category_name"].isna().sum()),
        "unmatched_sellers": int(fact["seller_city"].isna().sum()) if "seller_city" in fact else 0,
        "unmatched_customers": int(fact["customer_unique_id"].isna().sum()) if "customer_unique_id" in fact else 0,
        "missing_review_order_lines": int(fact["review_score"].isna().sum()),
    })
    return fact, orders_all, audit


def _pct_rank(series: pd.Series, invert: bool = False) -> pd.Series:
    s = pd.to_numeric(series, errors="coerce")
    if invert:
        s = -s
    ranked = s.rank(pct=True, method="average") * 100
    return ranked.fillna(50.0)


def _yoy_windows(latest_date: pd.Timestamp) -> tuple[pd.Timestamp, pd.Timestamp, pd.Timestamp, pd.Timestamp]:
    current_start = pd.Timestamp(year=latest_date.year, month=1, day=1)
    current_end = latest_date.normalize()
    prior_start = pd.Timestamp(year=latest_date.year - 1, month=1, day=1)
    try:
        prior_end = current_end.replace(year=current_end.year - 1)
    except ValueError:  # Feb 29 -> Feb 28
        prior_end = current_end.replace(year=current_end.year - 1, day=28)
    return current_start, current_end, prior_start, prior_end


def build_analytics(fact: pd.DataFrame, orders_all: pd.DataFrame, audit: dict[str, Any]) -> dict[str, Any]:
    if fact.empty:
        raise ValueError("No delivered order items remained after preparation. Check the source CSVs.")

    latest_date = pd.to_datetime(fact["order_purchase_timestamp"]).max().normalize()
    first_date = pd.to_datetime(fact["order_purchase_timestamp"]).min().normalize()
    delivered_order = fact.drop_duplicates("order_id")
    gross_gmv = float(fact["item_gmv"].sum())
    order_count = int(fact["order_id"].nunique())
    buyers = int(fact["customer_unique_id"].dropna().nunique())

    monthly = (fact.groupby("purchase_month", as_index=False)
               .agg(gmv=("item_gmv", "sum"), orders=("order_id", "nunique"), items=("order_item_id", "count"), sellers=("seller_id", "nunique")))
    quarterly = (fact.groupby("purchase_quarter", as_index=False)
                 .agg(gmv=("item_gmv", "sum"), orders=("order_id", "nunique"), items=("order_item_id", "count")))

    cat = (fact.groupby("category", as_index=False)
           .agg(gmv=("item_gmv", "sum"), orders=("order_id", "nunique"), sellers=("seller_id", "nunique"),
                products=("product_id", "nunique"), items=("order_item_id", "count"),
                average_item_price=("price", "mean"), freight_per_item=("freight_value", "mean")))
    order_category = fact.dropna(subset=["review_score"])[["order_id", "category", "review_score"]].drop_duplicates(["order_id", "category"])
    cat_reviews = order_category.groupby("category", as_index=False).agg(average_review=("review_score", "mean"), reviewed_orders=("order_id", "nunique"))
    cat = cat.merge(cat_reviews, on="category", how="left")

    # Comparable year-to-date window: Jan 1 through the latest observed date,
    # compared with the same calendar window in the prior year.
    c_start, c_end, p_start, p_end = _yoy_windows(latest_date)
    date_series = pd.to_datetime(fact["order_purchase_timestamp"])
    current = fact.loc[date_series.between(c_start, c_end)].groupby("category")["item_gmv"].sum()
    prior = fact.loc[date_series.between(p_start, p_end)].groupby("category")["item_gmv"].sum()
    yoy = pd.DataFrame({"current_ytd_gmv": current, "prior_ytd_gmv": prior}).reset_index()
    yoy["yoy_growth"] = np.where(yoy["prior_ytd_gmv"] > 0, yoy["current_ytd_gmv"] / yoy["prior_ytd_gmv"] - 1, np.nan)
    cat = cat.merge(yoy[["category", "current_ytd_gmv", "prior_ytd_gmv", "yoy_growth"]], on="category", how="left")

    # Seller concentration per category. HHI ranges from near 0 to 10,000.
    cat_seller = fact.groupby(["category", "seller_id"], as_index=False)["item_gmv"].sum()
    cat_seller["seller_share"] = cat_seller["item_gmv"] / cat_seller.groupby("category")["item_gmv"].transform("sum")
    concentration = (cat_seller.groupby("category")
                     .agg(hhi=("seller_share", lambda x: float((x.pow(2).sum()) * 10000)),
                          top_seller_share=("seller_share", "max"))
                     .reset_index())
    cat = cat.merge(concentration, on="category", how="left")
    cat["gmv_share"] = cat["gmv"] / max(gross_gmv, 1)
    cat["demand_percentile"] = _pct_rank(np.log1p(cat["gmv"]))
    cat["growth_percentile"] = _pct_rank(cat["yoy_growth"])
    cat["fragmentation_percentile"] = _pct_rank(cat["hhi"], invert=True)
    cat["service_gap_percentile"] = _pct_rank(5 - cat["average_review"])
    cat["opportunity_score"] = (cat["demand_percentile"] * 0.35 + cat["growth_percentile"] * 0.30 +
                                 cat["fragmentation_percentile"] * 0.20 + cat["service_gap_percentile"] * 0.15).round(1)
    cat = cat.sort_values("gmv", ascending=False)

    # Monthly category composition for the dashboard's stacked demand view.
    # Only the leading categories remain separate; the tail is grouped so the
    # payload stays small without inventing or dropping any delivered GMV.
    top_category_names = cat.nlargest(8, "gmv")["category"].tolist() if len(cat) else []
    monthly_category = (fact.groupby(["purchase_month", "category"], as_index=False)
                        .agg(gmv=("item_gmv", "sum"), orders=("order_id", "nunique")))
    if len(monthly_category):
        monthly_category["category"] = np.where(
            monthly_category["category"].isin(top_category_names),
            monthly_category["category"], "Other categories")
        monthly_category = (monthly_category.groupby(["purchase_month", "category"], as_index=False)
                            .agg(gmv=("gmv", "sum"), orders=("orders", "sum"))
                            .sort_values(["purchase_month", "gmv"], ascending=[True, False]))

    seller = (fact.groupby("seller_id", as_index=False)
              .agg(gmv=("item_gmv", "sum"), orders=("order_id", "nunique"),
                   products=("product_id", "nunique"), categories=("category", "nunique"),
                   average_item_price=("price", "mean"), buyers=("customer_unique_id", "nunique"),
                   customer_states=("customer_state", "nunique"), items=("order_item_id", "count")))
    seller["gmv_share"] = seller["gmv"] / max(gross_gmv, 1)
    seller = seller.sort_values("gmv", ascending=False).reset_index(drop=True)
    seller["rank"] = np.arange(1, len(seller) + 1)

    # K-Means seller archetype exploration using seller-level operating signals.
    features = ["gmv", "orders", "products", "categories", "average_item_price", "buyers", "customer_states"]
    seller_model = seller[features].fillna(0).clip(lower=0)
    n_clusters = min(4, len(seller_model))
    if n_clusters >= 2:
        transformed = np.log1p(seller_model)
        scaled = StandardScaler().fit_transform(transformed)
        model = KMeans(n_clusters=n_clusters, random_state=42, n_init=20)
        seller["cluster_raw"] = model.fit_predict(scaled)
        cluster_order = (seller.groupby("cluster_raw")["gmv"].mean().sort_values(ascending=False).index.tolist())
        cluster_names = {old: f"Seller cohort {i + 1}" for i, old in enumerate(cluster_order)}
        seller["seller_cohort"] = seller["cluster_raw"].map(cluster_names)
    else:
        seller["seller_cohort"] = "Seller cohort 1"

    cohort = (seller.groupby("seller_cohort", as_index=False)
              .agg(sellers=("seller_id", "nunique"), total_gmv=("gmv", "sum"), average_gmv=("gmv", "mean"),
                   average_orders=("orders", "mean"), average_categories=("categories", "mean"),
                   average_buyers=("buyers", "mean")))
    cohort = cohort.sort_values("total_gmv", ascending=False)

    # Review scores are deduplicated to one mean score per order before counting.
    reviews_order = fact.dropna(subset=["review_score"])[["order_id", "review_score"]].drop_duplicates("order_id")
    review_dist = (reviews_order.groupby("review_score", as_index=False).agg(orders=("order_id", "nunique"))
                   .sort_values("review_score"))

    # State benchmark is customer-state GMV within the Olist sample only.
    states = (fact.groupby("customer_state", as_index=False)
              .agg(gmv=("item_gmv", "sum"), orders=("order_id", "nunique"), buyers=("customer_unique_id", "nunique"))
              .sort_values("gmv", ascending=False))

    # Order-level delivery and payment data are not expanded to item grain.
    delivered_order_dates = orders_all.loc[orders_all["order_status"].eq("delivered")].copy()
    delivered_order_dates["delivery_days"] = (pd.to_datetime(delivered_order_dates["order_delivered_customer_date"], errors="coerce") -
                                                pd.to_datetime(delivered_order_dates["order_purchase_timestamp"], errors="coerce")).dt.total_seconds() / 86400
    delivered_order_dates["on_time"] = pd.to_datetime(delivered_order_dates["order_delivered_customer_date"], errors="coerce") <= pd.to_datetime(delivered_order_dates["order_estimated_delivery_date"], errors="coerce")
    delivered_order_dates["purchase_month"] = pd.to_datetime(delivered_order_dates["order_purchase_timestamp"], errors="coerce").dt.to_period("M").astype(str)
    delivery = (delivered_order_dates.groupby("purchase_month", as_index=False)
                .agg(avg_delivery_days=("delivery_days", "mean"), on_time_rate=("on_time", "mean"), delivered_orders=("order_id", "nunique")))

    # Delivery-time distribution and its relationship with order-level reviews.
    # Both are derived from the same delivered-order grain as the headline KPIs.
    delivery_bins = [0, 3, 5, 7, 10, 15, 20, 30, np.inf]
    delivery_labels = ["0–3", "3–5", "5–7", "7–10", "10–15", "15–20", "20–30", "30+"]
    valid_delivery = delivered_order_dates.dropna(subset=["delivery_days"]).copy()
    valid_delivery = valid_delivery.loc[valid_delivery["delivery_days"] >= 0]
    valid_delivery["delivery_band_days"] = pd.cut(
        valid_delivery["delivery_days"], bins=delivery_bins,
        labels=delivery_labels, right=False)
    delivery_distribution = (valid_delivery.dropna(subset=["delivery_band_days"])
                             .groupby("delivery_band_days", observed=False, as_index=False)
                             .agg(delivered_orders=("order_id", "nunique")))
    reviewed_delivery = valid_delivery.merge(reviews_order, on="order_id", how="inner")
    if len(reviewed_delivery):
        delivery_review = (reviewed_delivery.dropna(subset=["delivery_band_days"])
                           .groupby("delivery_band_days", observed=False, as_index=False)
                           .agg(avg_review=("review_score", "mean"),
                                reviewed_orders=("order_id", "nunique")))
    else:
        delivery_review = pd.DataFrame(columns=["delivery_band_days", "avg_review", "reviewed_orders"])
    delivery_distribution["delivery_band_days"] = delivery_distribution["delivery_band_days"].astype(str)
    delivery_review["delivery_band_days"] = delivery_review["delivery_band_days"].astype(str)

    # Payment mix is aggregated by payment method and limited to delivered orders.
    payment_methods = audit.pop("payment_methods_delivered")

    statuses = (orders_all.groupby("order_status", as_index=False).agg(orders=("order_id", "nunique"))
                .sort_values("orders", ascending=False))

    # Overall market concentration across active sellers in the observed sample.
    seller_shares = seller["gmv_share"]
    hhi_total = float((seller_shares.pow(2).sum()) * 10000)
    top5_share = float(seller_shares.head(5).sum())
    top10_share = float(seller_shares.head(10).sum())

    identified_buyers = fact.dropna(subset=["customer_unique_id"])[["customer_unique_id", "order_id"]].drop_duplicates()
    buyer_orders = identified_buyers.groupby("customer_unique_id")["order_id"].nunique()
    repeat_buyer_rate = float((buyer_orders >= 2).mean()) if len(buyer_orders) else 0.0

    kpis = {
        "delivered_gmv": gross_gmv,
        "delivered_orders": order_count,
        "active_sellers": int(fact["seller_id"].nunique()),
        "active_categories": int(fact["category"].nunique()),
        "identified_buyers": buyers,
        "average_order_value": gross_gmv / max(order_count, 1),
        "average_review": float(reviews_order["review_score"].mean()) if len(reviews_order) else None,
        "average_delivery_days": float(delivered_order_dates["delivery_days"].mean()),
        "on_time_delivery_rate": float(delivered_order_dates["on_time"].mean()),
        "repeat_buyer_rate": repeat_buyer_rate,
        "top5_seller_share": top5_share,
        "top10_seller_share": top10_share,
        "seller_hhi": hhi_total,
        "item_count": int(len(fact)),
        "freight_value": float(fact["freight_value"].sum()),
    }

    # Geospatial analysis uses postcode-prefix centroids. Distances are straight-line
    # proxies between buyer and seller postcodes, not road/courier route distances.
    geo_lookup = audit.pop("geo_lookup", pd.DataFrame())
    geospatial = build_geospatial_analytics(fact, audit.get("geolocation_audit", {}))
    audit["geolocation_audit"] = audit.get("geolocation_audit", {})

    # Rule-based findings are calculated from the observed sample, not generated claims.
    insights: list[dict[str, str]] = []
    if len(cat):
        lead = cat.iloc[0]
        insights.append({"title": "Largest observed category", "body": f"{lead['category']} contributes {lead['gmv'] / gross_gmv:.1%} of delivered item GMV in this Olist sample.", "type": "demand"})
    if len(seller):
        top = seller.iloc[0]
        insights.append({"title": "Seller concentration", "body": f"The top five sellers account for {top5_share:.1%} of delivered item GMV; the leading seller contributes {top['gmv_share']:.1%}.", "type": "competition"})
    growing = cat.dropna(subset=["yoy_growth"]).sort_values("yoy_growth", ascending=False)
    if len(growing):
        g = growing.iloc[0]
        insights.append({"title": "Fastest comparable category growth", "body": f"{g['category']} shows {g['yoy_growth']:.1%} year-over-year change in the comparable year-to-date window. Interpret as sample-period change, not a market forecast.", "type": "growth"})
    if kpis["average_review"] is not None:
        insights.append({"title": "Customer experience signal", "body": f"The average order-level review score is {kpis['average_review']:.2f} / 5 across reviewed delivered orders.", "type": "experience"})
    if geospatial["summary"].get("median_pair_distance_km") is not None:
        insights.append({"title": "Geographic fulfilment footprint", "body": f"The median straight-line distance proxy between mapped seller and buyer postcode centroids is {geospatial['summary']['median_pair_distance_km']:,.0f} km across {geospatial['summary']['mapped_order_seller_pairs']:,} order-seller pairs. This is not a road-route distance.", "type": "geospatial"})
    if len(cat):
        opportunity = cat.sort_values("opportunity_score", ascending=False).iloc[0]
        insights.append({"title": "Category to investigate", "body": f"{opportunity['category']} ranks highest on the relative opportunity score ({opportunity['opportunity_score']:.1f}/100). This is a prioritisation index, not TAM or a prediction.", "type": "opportunity"})

    def records(frame: pd.DataFrame, columns: list[str] | None = None, limit: int | None = None) -> list[dict[str, Any]]:
        out = frame[columns].copy() if columns else frame.copy()
        if limit:
            out = out.head(limit)
        out = out.replace({np.nan: None, np.inf: None, -np.inf: None})
        return json.loads(out.to_json(orient="records", date_format="iso"))

    payment_total = float(payment_methods["payment_value"].sum()) if len(payment_methods) else 0.0
    payment_methods["share"] = payment_methods["payment_value"] / max(payment_total, 1)
    categories_cols = ["category", "gmv", "gmv_share", "orders", "sellers", "products", "items", "average_item_price", "average_review", "reviewed_orders", "current_ytd_gmv", "prior_ytd_gmv", "yoy_growth", "hhi", "top_seller_share", "opportunity_score"]
    seller_cols = ["rank", "seller_id", "gmv", "gmv_share", "orders", "products", "categories", "average_item_price", "buyers", "customer_states", "seller_cohort"]

    payload = {
        "status": "ready",
        "metadata": {
            "dataset": "Brazilian E-Commerce Public Dataset by Olist",
            "source": "https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce",
            "license": "CC BY-NC-SA 4.0 — non-commercial use; adaptations shared alike",
            "period_start": str(first_date.date()),
            "period_end": str(latest_date.date()),
            "currency": "BRL",
            "generated_at": pd.Timestamp.utcnow().isoformat(),
            "scope_note": "All seller/category shares and opportunity scores describe only the delivered orders observed in this Olist dataset. They are not national Brazilian e-commerce market shares or TAM estimates.",
            "comparison_window": {"current": f"{c_start.date()} to {c_end.date()}", "prior": f"{p_start.date()} to {p_end.date()}"},
        },
        "kpis": kpis,
        "monthly": records(monthly),
        "monthly_category": records(monthly_category),
        "quarterly": records(quarterly),
        "categories": records(cat.sort_values("gmv", ascending=False), categories_cols),
        "opportunities": records(cat.sort_values("opportunity_score", ascending=False), categories_cols),
        "top_sellers": records(seller, seller_cols, 20),
        "sellers": records(seller, seller_cols),
        "seller_cohorts": records(cohort),
        "states": records(states.head(15)),
        "geospatial": geospatial,
        "review_distribution": records(review_dist),
        "payment_methods": records(payment_methods),
        "order_statuses": records(statuses),
        "delivery": records(delivery),
        "delivery_distribution": records(delivery_distribution),
        "delivery_review": records(delivery_review),
        "concentration": {"hhi": hhi_total, "top5_share": top5_share, "top10_share": top10_share,
                           "top_seller_share": float(seller_shares.iloc[0]) if len(seller_shares) else 0},
        "data_quality": audit,
        "insights": insights,
    }
    return payload


def run_pipeline(data_dir: Path | None = None) -> dict[str, Any]:
    """Run the complete analysis and write dashboard JSON + local CSV artefacts."""
    global DATA_DIR
    if data_dir is not None:
        DATA_DIR = Path(data_dir)
    print("Loading Olist source tables...")
    raw = load_sources()
    print("Preparing delivered-order item fact table...")
    fact, orders, audit = build_item_fact(raw)
    print(f"Prepared {len(fact):,} delivered item rows across {fact['order_id'].nunique():,} orders.")
    print("Calculating market, seller, category, customer-experience and geospatial metrics...")
    payload = build_analytics(fact, orders, audit)

    DASHBOARD_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    DASHBOARD_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")

    pd.DataFrame(payload["categories"]).to_csv(OUTPUT_DIR / "category_benchmark.csv", index=False)
    pd.DataFrame(payload["sellers"]).to_csv(OUTPUT_DIR / "seller_benchmark.csv", index=False)
    pd.DataFrame(payload["seller_cohorts"]).to_csv(OUTPUT_DIR / "seller_cohorts.csv", index=False)
    pd.DataFrame(payload["monthly"]).to_csv(OUTPUT_DIR / "monthly_market_trend.csv", index=False)
    fact.to_csv(OUTPUT_DIR / "delivered_item_fact.csv", index=False)
    pd.DataFrame(payload.get("geospatial", {}).get("state_balance", [])).to_csv(OUTPUT_DIR / "geospatial_state_balance.csv", index=False)
    pd.DataFrame(payload.get("geospatial", {}).get("distance_pairs", [])).to_csv(OUTPUT_DIR / "geospatial_distance_pairs.csv", index=False)
    pd.DataFrame(payload.get("geospatial", {}).get("map_points", [])).to_csv(OUTPUT_DIR / "geospatial_city_points.csv", index=False)

    print(f"Dashboard data generated: {DASHBOARD_FILE.relative_to(ROOT)}")
    print(f"Observed delivered GMV: R$ {payload['kpis']['delivered_gmv']:,.2f}")
    print(f"Active sellers: {payload['kpis']['active_sellers']:,} | categories: {payload['kpis']['active_categories']:,}")
    print(f"Mapped geospatial order-seller pairs: {payload['geospatial']['summary']['mapped_order_seller_pairs']:,}")
    return payload


if __name__ == "__main__":
    run_pipeline()
