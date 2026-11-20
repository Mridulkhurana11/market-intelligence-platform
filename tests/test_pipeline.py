import pandas as pd

from src.pipeline import build_item_fact, build_analytics


def fixture_sources():
    orders = pd.DataFrame([
        ["o1", "c1", "delivered", "2017-01-05", "2017-01-06", "2017-01-08", "2017-01-10"],
        ["o2", "c2", "delivered", "2017-02-05", "2017-02-06", "2017-02-08", "2017-02-12"],
        ["o3", "c3", "delivered", "2018-01-05", "2018-01-06", "2018-01-08", "2018-01-10"],
        ["o4", "c4", "delivered", "2018-02-05", "2018-02-06", "2018-02-08", "2018-02-12"],
        ["o5", "c5", "canceled", "2018-02-10", None, None, "2018-02-18"],
    ], columns=["order_id", "customer_id", "order_status", "order_purchase_timestamp", "order_approved_at", "order_delivered_customer_date", "order_estimated_delivery_date"])
    items = pd.DataFrame([
        ["o1", 1, "p1", "s1", "2017-01-06", 100.0, 10.0],
        ["o2", 1, "p1", "s1", "2017-02-06", 120.0, 12.0],
        ["o3", 1, "p2", "s2", "2018-01-06", 150.0, 15.0],
        ["o4", 1, "p2", "s2", "2018-02-06", 160.0, 16.0],
        ["o5", 1, "p1", "s1", "2018-02-11", 999.0, 9.0],
    ], columns=["order_id", "order_item_id", "product_id", "seller_id", "shipping_limit_date", "price", "freight_value"])
    customers = pd.DataFrame([
        ["c1", "u1", "alpha", "SP", "01001"], ["c2", "u2", "beta", "RJ", "20000"],
        ["c3", "u1", "alpha", "SP", "01001"], ["c4", "u3", "gamma", "MG", "30100"],
        ["c5", "u4", "delta", "SP", "01001"],
    ], columns=["customer_id", "customer_unique_id", "customer_city", "customer_state", "customer_zip_code_prefix"])
    products = pd.DataFrame([["p1", "cat_a"], ["p2", "cat_b"]], columns=["product_id", "product_category_name"])
    sellers = pd.DataFrame([["s1", "seller a", "SP", "01001"], ["s2", "seller b", "RJ", "20000"]], columns=["seller_id", "seller_city", "seller_state", "seller_zip_code_prefix"])
    reviews = pd.DataFrame([["r1", "o1", 5], ["r2", "o2", 4], ["r3", "o3", 4], ["r4", "o4", 3]], columns=["review_id", "order_id", "review_score"])
    payments = pd.DataFrame([["o1", "credit_card", 110], ["o2", "boleto", 132], ["o3", "credit_card", 165], ["o4", "voucher", 176], ["o5", "credit_card", 1008]], columns=["order_id", "payment_type", "payment_value"])
    translation = pd.DataFrame([["cat_a", "category_a"], ["cat_b", "category_b"]], columns=["product_category_name", "product_category_name_english"])
    geolocation = pd.DataFrame([
        ["01001", -23.55, -46.63, "sao paulo", "SP"],
        ["01001", -23.57, -46.65, "sao paulo", "SP"],
        ["20000", -22.90, -43.20, "rio de janeiro", "RJ"],
        ["30100", -19.92, -43.94, "belo horizonte", "MG"],
        ["01001", -23.55, -46.63, "sao paulo", "SP"],  # exact duplicate for QA coverage
    ], columns=["geolocation_zip_code_prefix", "geolocation_lat", "geolocation_lng", "geolocation_city", "geolocation_state"])
    return {"orders": orders, "items": items, "customers": customers, "products": products,
            "sellers": sellers, "reviews": reviews, "payments": payments, "translation": translation,
            "geolocation": geolocation}


def test_canceled_orders_excluded_from_delivered_item_fact():
    fact, orders, audit = build_item_fact(fixture_sources())
    assert fact["order_id"].nunique() == 4
    assert "o5" not in set(fact["order_id"])
    assert audit["delivered_orders"] == 4


def test_order_value_not_multiplied_by_review_or_payment_joins():
    fact, orders, audit = build_item_fact(fixture_sources())
    assert round(fact["item_gmv"].sum(), 2) == 530.0
    assert fact["order_id"].nunique() == 4


def test_analytics_has_scoped_market_share_and_opportunity_score():
    fact, orders, audit = build_item_fact(fixture_sources())
    payload = build_analytics(fact, orders, audit)
    assert payload["status"] == "ready"
    assert payload["kpis"]["delivered_gmv"] == 530.0
    assert 0 <= payload["categories"][0]["opportunity_score"] <= 100
    assert "only the delivered orders observed" in payload["metadata"]["scope_note"]
    assert len(payload["seller_cohorts"]) >= 1
    assert payload["geospatial"]["summary"]["mapped_order_seller_pairs"] == 4
    assert payload["geospatial"]["summary"]["mapped_zip_prefixes"] == 3
    assert len(payload["geospatial"]["map_points"]) > 0


def test_derived_views_are_aggregated_from_delivered_records():
    fact, orders, audit = build_item_fact(fixture_sources())
    payload = build_analytics(fact, orders, audit)
    assert len(payload["monthly_category"]) > 0
    monthly_gmv = sum(row["gmv"] for row in payload["monthly_category"])
    assert round(monthly_gmv, 2) == 530.0
    assert all(row["category"] for row in payload["monthly_category"])
    assert sum(row["delivered_orders"] for row in payload["delivery_distribution"]) == 4
    assert sum(row["reviewed_orders"] for row in payload["delivery_review"]) == 4
    assert all(row["avg_review"] is None or 1 <= row["avg_review"] <= 5
               for row in payload["delivery_review"])


def test_payload_is_json_serialisable_for_vite_frontend():
    import json
    fact, orders, audit = build_item_fact(fixture_sources())
    payload = build_analytics(fact, orders, audit)
    encoded = json.dumps(payload, allow_nan=False)
    decoded = json.loads(encoded)
    assert decoded["status"] == "ready"
    assert isinstance(decoded["categories"], list)
    assert isinstance(decoded["seller_cohorts"], list)


def test_haversine_distance_is_geographically_reasonable():
    from src.pipeline import haversine_km
    distance = float(haversine_km([-23.55], [-46.63], [-22.90], [-43.20])[0])
    assert 350 < distance < 400


def test_geolocation_lookup_collapses_multiple_rows_per_postcode():
    from src.pipeline import prepare_geolocation_lookup
    raw = fixture_sources()["geolocation"]
    lookup, audit = prepare_geolocation_lookup(raw)
    assert lookup["zip_code_prefix"].is_unique
    assert len(lookup) == 3
    assert audit["exact_duplicates_removed"] == 1
