import json
import math
import time
from typing import Any, Dict, Optional, Tuple, List

import pandas as pd
import requests
import streamlit as st

import boto3
from botocore.awsrequest import AWSRequest
from botocore.auth import SigV4Auth
from botocore.credentials import Credentials


# =========================
# Streamlit UI Config
# =========================
st.set_page_config(page_title="High Focus Sourcing Tool", layout="wide")
st.title("High Focus Sourcing Tool")


# =========================
# Secrets Helpers
# =========================
def sget(key: str, required: bool = True, default: Optional[str] = None) -> Optional[str]:
    val = st.secrets.get(key, default)
    if required and (val is None or str(val).strip() == ""):
        st.error(f"Missing secret: {key}")
        st.stop()
    return None if val is None else str(val).strip()


# Required secrets (already in your Streamlit Secrets)
CLIENT_ID = sget("CLIENT_ID")
CLIENT_SECRET = sget("CLIENT_SECRET")
REFRESH_TOKEN = sget("REFRESH_TOKEN")
AWS_ACCESS_KEY_ID = sget("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = sget("AWS_SECRET_ACCESS_KEY")
AWS_ROLE_ARN = sget("AWS_ROLE_ARN")
AWS_REGION = sget("AWS_REGION", default="us-east-1")
MARKETPLACE_ID = sget("MARKETPLACE_ID")
SP_API_HOST = sget("SP_API_HOST", default="sellingpartnerapi-na.amazon.com")

# Optional (only if you ever add it later; app works without it)
SELLER_ID = sget("SELLER_ID", required=False, default=None)


# =========================
# LWA + AWS SigV4
# =========================
@st.cache_data(ttl=3300)
def get_lwa_access_token(client_id: str, client_secret: str, refresh_token: str) -> str:
    url = "https://api.amazon.com/auth/o2/token"
    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
    }
    r = requests.post(url, data=data, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"LWA token error ({r.status_code}): {r.text}")
    return r.json()["access_token"]


@st.cache_data(ttl=3300)
def assume_role_temp_creds(access_key: str, secret_key: str, role_arn: str, region: str) -> Dict[str, str]:
    sts = boto3.client(
        "sts",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
    )
    resp = sts.assume_role(RoleArn=role_arn, RoleSessionName="hf-spapi-session")
    c = resp["Credentials"]
    return {
        "AccessKeyId": c["AccessKeyId"],
        "SecretAccessKey": c["SecretAccessKey"],
        "SessionToken": c["SessionToken"],
    }


def spapi_request(
    method: str,
    host: str,
    region: str,
    lwa_token: str,
    temp_creds: Dict[str, str],
    path: str,
    params: Optional[Dict[str, Any]] = None,
    body: Optional[Dict[str, Any]] = None,
) -> Tuple[int, Dict[str, Any]]:
    url = f"https://{host}{path}"
    headers = {"x-amz-access-token": lwa_token, "content-type": "application/json"}

    data = None
    if body is not None:
        data = json.dumps(body)

    req = AWSRequest(method=method, url=url, data=data, params=params, headers=headers)
    creds = Credentials(
        temp_creds["AccessKeyId"],
        temp_creds["SecretAccessKey"],
        temp_creds["SessionToken"],
    )
    SigV4Auth(creds, "execute-api", region).add_auth(req)

    s = requests.Session()
    prepared = req.prepare()
    r = s.send(prepared, timeout=45)

    try:
        payload = r.json() if r.text else {}
    except Exception:
        payload = {"raw": r.text}

    return r.status_code, payload


@st.cache_resource
def spapi_auth_bundle() -> Dict[str, Any]:
    lwa = get_lwa_access_token(CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN)
    temp = assume_role_temp_creds(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ROLE_ARN, AWS_REGION)
    return {"lwa": lwa, "temp": temp}


def safe_get(d: Dict[str, Any], path: List[str], default=None):
    cur = d
    for k in path:
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur[k]
    return cur


# =========================
# SP-API Calls
# =========================
def catalog_item_by_asin(asin: str) -> Dict[str, Any]:
    auth = spapi_auth_bundle()
    status, payload = spapi_request(
        "GET",
        SP_API_HOST,
        AWS_REGION,
        auth["lwa"],
        auth["temp"],
        f"/catalog/2022-04-01/items/{asin}",
        params={
            "marketplaceIds": MARKETPLACE_ID,
            "includedData": "summaries,attributes,salesRanks",
        },
    )
    if status >= 400:
        raise RuntimeError(f"Catalog item error ({status}): {payload}")
    return payload


def catalog_search_by_identifier(identifier: str, id_type: str) -> Dict[str, Any]:
    auth = spapi_auth_bundle()
    status, payload = spapi_request(
        "GET",
        SP_API_HOST,
        AWS_REGION,
        auth["lwa"],
        auth["temp"],
        "/catalog/2022-04-01/items",
        params={
            "marketplaceIds": MARKETPLACE_ID,
            "identifiers": identifier,
            "identifiersType": id_type,
            "includedData": "summaries,salesRanks",
        },
    )
    if status >= 400:
        raise RuntimeError(f"Catalog search error ({status}): {payload}")
    return payload


def pricing_offers_by_asin(asin: str) -> Dict[str, Any]:
    # Item Offers (gives offers + prices). We will compute a "best price" from returned offers.
    auth = spapi_auth_bundle()
    status, payload = spapi_request(
        "GET",
        SP_API_HOST,
        AWS_REGION,
        auth["lwa"],
        auth["temp"],
        f"/products/pricing/v0/items/{asin}/offers",
        params={"MarketplaceId": MARKETPLACE_ID, "ItemCondition": "New"},
    )
    if status >= 400:
        raise RuntimeError(f"Pricing offers error ({status}): {payload}")
    return payload


def fees_estimate(asin: str, listing_price: float) -> Dict[str, Any]:
    auth = spapi_auth_bundle()
    body = {
        "FeesEstimateRequest": {
            "MarketplaceId": MARKETPLACE_ID,
            "IsAmazonFulfilled": True,
            "PriceToEstimateFees": {
                "ListingPrice": {"CurrencyCode": "USD", "Amount": float(listing_price)},
                "Shipping": {"CurrencyCode": "USD", "Amount": 0.0},
            },
            "Identifier": f"fee-{asin}-{int(time.time())}",
        }
    }
    status, payload = spapi_request(
        "POST",
        SP_API_HOST,
        AWS_REGION,
        auth["lwa"],
        auth["temp"],
        f"/products/fees/v0/listings/{asin}/feesEstimate",
        body=body,
    )
    if status >= 400:
        raise RuntimeError(f"Fees error ({status}): {payload}")
    return payload


def listings_restrictions(asin: str) -> Optional[Dict[str, Any]]:
    # Only works if SELLER_ID exists.
    if not SELLER_ID:
        return None
    auth = spapi_auth_bundle()
    status, payload = spapi_request(
        "GET",
        SP_API_HOST,
        AWS_REGION,
        auth["lwa"],
        auth["temp"],
        "/listings/2021-08-01/restrictions",
        params={
            "asin": asin,
            "sellerId": SELLER_ID,
            "marketplaceIds": MARKETPLACE_ID,
            "conditionType": "new",
        },
    )
    if status >= 400:
        # Don’t hard-fail the app; just return None
        return None
    return payload


# =========================
# Parsing + Heuristics
# =========================
def normalize_identifier(x: Any) -> str:
    if x is None:
        return ""
    s = str(x).strip()
    # remove common excel artifacts
    s = s.replace("\u00a0", " ").strip()
    return s


def is_asin(s: str) -> bool:
    s = s.strip().upper()
    return len(s) == 10 and s.isalnum() and any(c.isalpha() for c in s)


def is_upc(s: str) -> bool:
    d = "".join(ch for ch in s if ch.isdigit())
    return len(d) == 12


def is_ean(s: str) -> bool:
    d = "".join(ch for ch in s if ch.isdigit())
    return len(d) == 13


def detect_column(df: pd.DataFrame, kind: str) -> Optional[str]:
    # kind: "id" (asin/upc/ean), "cost", "case_pack", "desc"
    cols = list(df.columns)

    # Name-based
    name_map = {
        "cost": ["cost", "price", "unit cost", "your cost", "wholesale", "cost per unit"],
        "case_pack": ["case", "pack", "case pack", "pack size", "qty", "case qty"],
        "desc": ["desc", "description", "product", "item", "name", "title"],
        "id": ["asin", "upc", "ean", "gtin", "barcode", "item upc", "unit upc"],
    }
    keys = name_map.get(kind, [])
    for c in cols:
        cl = str(c).strip().lower()
        if any(k in cl for k in keys):
            return c

    # Value-based
    if kind == "id":
        best = None
        best_score = 0.0
        for c in cols:
            s = df[c].astype(str).str.strip()
            s = s[s.notna() & (s != "")]
            if len(s) == 0:
                continue
            sample = s.head(200)

            asin_like = sample.str.upper().apply(is_asin).mean()
            upc_like = sample.apply(is_upc).mean()
            ean_like = sample.apply(is_ean).mean()

            score = max(asin_like, upc_like, ean_like)
            if score > best_score:
                best_score = score
                best = c
        return best

    if kind == "cost":
        best = None
        best_score = 0.0
        for c in cols:
            series = pd.to_numeric(df[c], errors="coerce")
            non_null = series.notna().mean()
            positive = (series.dropna() > 0).mean() if series.notna().any() else 0
            score = non_null * 0.7 + positive * 0.3
            if score > best_score:
                best_score = score
                best = c
        return best

    if kind == "case_pack":
        # usually integer-ish
        best = None
        best_score = 0.0
        for c in cols:
            series = pd.to_numeric(df[c], errors="coerce")
            if not series.notna().any():
                continue
            s = series.dropna()
            int_like = (s.apply(lambda v: float(v).is_integer()).mean()) if len(s) else 0
            typical = ((s >= 1) & (s <= 500)).mean() if len(s) else 0
            score = int_like * 0.6 + typical * 0.4
            if score > best_score:
                best_score = score
                best = c
        return best

    if kind == "desc":
        # column with longer strings
        best = None
        best_score = 0.0
        for c in cols:
            s = df[c].astype(str)
            avg_len = s.head(200).str.len().mean()
            score = avg_len
            if score > best_score:
                best_score = score
                best = c
        return best

    return None


def recommend_ungate_units(case_pack: Optional[float]) -> int:
    base_units = 10
    if case_pack is not None:
        try:
            cp = float(case_pack)
            if cp > 0:
                cases = math.ceil(base_units / cp)
                return int(cases * cp)
        except Exception:
            pass
    return base_units


def extract_title_brand_rank(catalog_payload: Dict[str, Any]) -> Tuple[str, str, Optional[int]]:
    title = ""
    brand = ""
    rank_val = None

    summaries = catalog_payload.get("summaries", [])
    if isinstance(summaries, list) and summaries:
        title = summaries[0].get("itemName", "") or ""
        brand = summaries[0].get("brand", "") or ""

    # salesRanks sometimes nested
    sr = catalog_payload.get("salesRanks", {})
    # Try common layout
    # {"salesRanks":[{"marketplaceId":"...","classificationRanks":[{"rank":123,...}], ...}]}
    if isinstance(sr, dict) and "salesRanks" in sr and isinstance(sr["salesRanks"], list) and sr["salesRanks"]:
        for entry in sr["salesRanks"]:
            if entry.get("marketplaceId") == MARKETPLACE_ID:
                cr = entry.get("classificationRanks", [])
                if isinstance(cr, list) and cr:
                    r = cr[0].get("rank", None)
                    if isinstance(r, int):
                        rank_val = r
                    elif isinstance(r, float):
                        rank_val = int(r)
                    break

    return title, brand, rank_val


def extract_best_price_and_sellers(offers_payload: Dict[str, Any]) -> Tuple[Optional[float], int]:
    # Look into payload["payload"]["Offers"] typically
    p = offers_payload.get("payload", {})
    offers = p.get("Offers", [])
    if not isinstance(offers, list) or not offers:
        return None, 0

    sellers = 0
    prices: List[float] = []
    seen_sellers = set()

    for off in offers:
        seller = off.get("SellerId")
        if seller and seller not in seen_sellers:
            seen_sellers.add(seller)
        lp = safe_get(off, ["ListingPrice", "Amount"], None)
        sp = safe_get(off, ["Shipping", "Amount"], 0.0)
        if lp is not None:
            try:
                prices.append(float(lp) + float(sp or 0.0))
            except Exception:
                pass

    sellers = len(seen_sellers)
    if not prices:
        return None, sellers
    return float(min(prices)), sellers


def extract_total_fees(fees_payload: Dict[str, Any]) -> Optional[float]:
    p = fees_payload.get("payload", {})
    est = p.get("FeesEstimateResult", {}).get("FeesEstimate", {})
    total = est.get("TotalFeesEstimate", {}).get("Amount", None)
    if total is None:
        return None
    try:
        return float(total)
    except Exception:
        return None


def restriction_status(asin: str) -> Tuple[str, str]:
    """
    Returns (status, details)
    status: "OK" | "GATED" | "RESTRICTED" | "UNKNOWN"
    """
    payload = listings_restrictions(asin)
    if payload is None:
        return ("UNKNOWN", "Restriction check unavailable (SELLER_ID not set).")

    p = payload.get("payload", {})
    restrictions = p.get("restrictions", [])
    if not restrictions:
        return ("OK", "No restrictions returned.")

    # If any restriction has "reasonCode" and prevents listing, treat as GATED/RESTRICTED
    # We’ll classify as RESTRICTED if it looks like not eligible at all.
    for r in restrictions:
        reason = r.get("reasonCode", "") or ""
        message = r.get("message", "") or ""
        if "NOT_ELIGIBLE" in reason.upper() or "RESTRICTED" in reason.upper():
            return ("RESTRICTED", f"{reason}: {message}".strip(": "))
        # Some are approvals required (gated)
        if "APPROVAL_REQUIRED" in reason.upper() or "REQUIRES_APPROVAL" in reason.upper():
            return ("GATED", f"{reason}: {message}".strip(": "))

    # Default if restrictions exist but not clear
    return ("GATED", "Restrictions exist (approval may be required).")


# =========================
# Core Analyzer
# =========================
def analyze_product(identifier: str, supplier_cost: float, case_pack: Optional[float] = None) -> Dict[str, Any]:
    identifier = normalize_identifier(identifier)
    if identifier == "":
        raise ValueError("Empty identifier.")

    asin = None
    id_type_used = None

    # Determine identifier type
    if is_asin(identifier):
        asin = identifier.upper()
        id_type_used = "ASIN"
        catalog = catalog_item_by_asin(asin)
    else:
        digits = "".join(ch for ch in identifier if ch.isdigit())
        if is_upc(digits):
            id_type_used = "UPC"
            res = catalog_search_by_identifier(digits, "UPC")
        elif is_ean(digits):
            id_type_used = "EAN"
            res = catalog_search_by_identifier(digits, "EAN")
        else:
            # last try: treat as ASIN
            if len(identifier.strip()) == 10:
                asin = identifier.strip().upper()
                id_type_used = "ASIN?"
                catalog = catalog_item_by_asin(asin)
            else:
                raise ValueError("Identifier not recognized as ASIN/UPC/EAN.")

        if asin is None:
            items = res.get("items", [])
            if not items:
                raise ValueError(f"No Amazon match found for {id_type_used}={identifier}")
            asin = items[0].get("asin", None)
            if not asin:
                raise ValueError("Amazon match found but ASIN missing.")
            catalog = catalog_item_by_asin(asin)

    title, brand, rank_val = extract_title_brand_rank(catalog)

    offers = pricing_offers_by_asin(asin)
    amazon_price, sellers = extract_best_price_and_sellers(offers)

    fees_total = None
    profit = None
    roi = None

    if amazon_price is not None and amazon_price > 0:
        fees_payload = fees_estimate(asin, amazon_price)
        fees_total = extract_total_fees(fees_payload)
        if fees_total is not None:
            profit = float(amazon_price) - float(fees_total) - float(supplier_cost)
            roi = (profit / float(supplier_cost)) if supplier_cost > 0 else None

    r_status, r_details = restriction_status(asin)

    ungate_units = recommend_ungate_units(case_pack)

    return {
        "input_identifier": identifier,
        "identifier_type": id_type_used,
        "asin": asin,
        "title": title,
        "brand": brand,
        "rank": rank_val,
        "amazon_price": amazon_price,
        "sellers": sellers,
        "supplier_cost": float(supplier_cost),
        "fees_estimate": fees_total,
        "profit": profit,
        "roi": roi,
        "restriction_status": r_status,
        "restriction_details": r_details,
        "case_pack": case_pack,
        "recommended_units_to_ungate": ungate_units,
    }


# =========================
# UI Layout (Single + Excel on same main page)
# =========================
left, right = st.columns(2, gap="large")

with left:
    st.subheader("Single Product (ASIN / UPC / EAN)")
    single_id = st.text_input("Paste ASIN or UPC/EAN", value="", placeholder="B00XXXXXXX or 012345678905")
    single_cost = st.number_input("Your supplier cost ($)", min_value=0.0, value=0.0, step=0.01)
    single_case = st.number_input("Case pack (optional)", min_value=0.0, value=0.0, step=1.0)
    single_case_val = single_case if single_case > 0 else None

    if st.button("Analyze Single", use_container_width=True):
        try:
            with st.spinner("Analyzing..."):
                out = analyze_product(single_id, single_cost, single_case_val)

            st.success("Done")
            st.json(out)

            # Human-readable highlights
            st.markdown("### Summary")
            st.write(f"**ASIN:** {out['asin']}")
            st.write(f"**Title:** {out['title']}")
            st.write(f"**Brand:** {out['brand']}")
            st.write(f"**Rank:** {out['rank']}")
            st.write(f"**Amazon price:** {out['amazon_price']}")
            st.write(f"**# Sellers (from offers):** {out['sellers']}")
            st.write(f"**Fees estimate:** {out['fees_estimate']}")
            st.write(f"**Profit:** {out['profit']}")
            st.write(f"**ROI:** {out['roi']}")
            st.write(f"**Restriction:** {out['restriction_status']} — {out['restriction_details']}")
            if out["restriction_status"] == "GATED":
                st.info(f"Recommended units to buy to attempt approval: **{out['recommended_units_to_ungate']}**")
            elif out["restriction_status"] == "RESTRICTED":
                st.error("Restricted → eliminate from buy list.")

        except Exception as e:
            st.error(str(e))


with right:
    st.subheader("Upload Wholesaler Excel File")
    uploaded = st.file_uploader("Upload Excel (.xlsx)", type=["xlsx"])

    profit_min = st.number_input("Minimum Profit ($) for BUY LIST", value=3.0, step=0.5)
    max_rows = st.number_input("Max rows to process (speed control)", min_value=1, value=100, step=25)

    if uploaded is not None:
        try:
            df = pd.read_excel(uploaded)
            st.success("File loaded successfully")

            # Show preview
            st.markdown("### Preview of uploaded data")
            st.dataframe(df.head(15), use_container_width=True)

            # Detect columns
            id_col = detect_column(df, "id")
            cost_col = detect_column(df, "cost")
            case_col = detect_column(df, "case_pack")
            desc_col = detect_column(df, "desc")

            st.markdown("### Detected columns")
            st.write(f"**Identifier column (ASIN/UPC/EAN):** {id_col}")
            st.write(f"**Cost column:** {cost_col}")
            st.write(f"**Case pack column:** {case_col}")
            st.write(f"**Description column:** {desc_col}")

            # If identifier not found, allow fallback to any column the user wants (without forcing questions)
            if id_col is None:
                st.warning("Could not confidently detect an ASIN/UPC/EAN column. The app will still try ALL columns row-by-row.")
            if cost_col is None:
                st.error("Could not detect a cost column. This file must contain unit cost to compute profit.")
                st.stop()

            if st.button("Run Bulk Sourcing", use_container_width=True):
                work = df.copy()

                # Limit rows
                work = work.head(int(max_rows)).reset_index(drop=True)

                results = []
                eliminated = []
                ungate = []
                buy = []

                progress = st.progress(0)
                status_box = st.empty()

                for i, row in work.iterrows():
                    progress.progress((i + 1) / len(work))
                    status_box.write(f"Processing row {i+1}/{len(work)}...")

                    # cost
                    cost_val = row.get(cost_col, None)
                    try:
                        supplier_cost = float(cost_val)
                    except Exception:
                        eliminated.append({"row": i, "reason": "Missing/invalid cost", "raw": dict(row)})
                        continue

                    # identifier
                    identifier = ""
                    if id_col is not None:
                        identifier = normalize_identifier(row.get(id_col, ""))
                    else:
                        # Try every column until something looks like ASIN/UPC/EAN
                        for c in work.columns:
                            v = normalize_identifier(row.get(c, ""))
                            if is_asin(v) or is_upc(v) or is_ean(v):
                                identifier = v
                                break

                    if identifier == "":
                        eliminated.append({"row": i, "reason": "No ASIN/UPC/EAN found", "raw": dict(row)})
                        continue

                    # case pack
                    cp = None
                    if case_col is not None:
                        try:
                            v = row.get(case_col, None)
                            cp = float(v) if v is not None and str(v).strip() != "" else None
                        except Exception:
                            cp = None

                    try:
                        out = analyze_product(identifier, supplier_cost, cp)
                        base = {
                            "row": i,
                            "input_identifier": out["input_identifier"],
                            "identifier_type": out["identifier_type"],
                            "asin": out["asin"],
                            "title": out["title"],
                            "brand": out["brand"],
                            "rank": out["rank"],
                            "amazon_price": out["amazon_price"],
                            "sellers": out["sellers"],
                            "supplier_cost": out["supplier_cost"],
                            "fees_estimate": out["fees_estimate"],
                            "profit": out["profit"],
                            "roi": out["roi"],
                            "restriction_status": out["restriction_status"],
                            "restriction_details": out["restriction_details"],
                            "case_pack": out["case_pack"],
                            "recommended_units_to_ungate": out["recommended_units_to_ungate"],
                        }

                        results.append(base)

                        # Eliminate restricted
                        if out["restriction_status"] == "RESTRICTED":
                            eliminated.append({**base, "reason": "RESTRICTED"})
                            continue

                        # Ungate list
                        if out["restriction_status"] == "GATED":
                            ungate.append(base)
                            continue

                        # Buy list: must have profit computed + profit >= threshold + not gated/restricted
                        if base["profit"] is not None and float(base["profit"]) >= float(profit_min):
                            buy.append(base)
                        else:
                            eliminated.append({**base, "reason": "Not profitable or missing price/fees"})

                    except Exception as e:
                        eliminated.append({"row": i, "reason": str(e), "raw": dict(row)})
                        continue

                progress.empty()
                status_box.empty()

                st.markdown("## Results")

                buy_df = pd.DataFrame(buy)
                ungate_df = pd.DataFrame(ungate)
                elim_df = pd.DataFrame(eliminated)

                st.subheader("✅ BUY LIST (Only products to buy now)")
                st.dataframe(buy_df.sort_values(by="profit", ascending=False) if not buy_df.empty else buy_df, use_container_width=True)
                st.download_button(
                    "Download BUY LIST CSV",
                    data=buy_df.to_csv(index=False).encode("utf-8"),
                    file_name="buy_list.csv",
                    mime="text/csv",
                    use_container_width=True,
                )

                st.subheader("🟨 UNGATE LIST (Profitable but gated → tells you quantity to buy)")
                st.dataframe(ungate_df.sort_values(by="profit", ascending=False) if not ungate_df.empty else ungate_df, use_container_width=True)
                st.download_button(
                    "Download UNGATE LIST CSV",
                    data=ungate_df.to_csv(index=False).encode("utf-8"),
                    file_name="ungate_list.csv",
                    mime="text/csv",
                    use_container_width=True,
                )

                st.subheader("🟥 ELIMINATED (Restricted / Not profitable / No match / Errors)")
                st.dataframe(elim_df, use_container_width=True)
                st.download_button(
                    "Download ELIMINATED CSV",
                    data=elim_df.to_csv(index=False).encode("utf-8"),
                    file_name="eliminated.csv",
                    mime="text/csv",
                    use_container_width=True,
                )

                if not SELLER_ID:
                    st.info(
                        "Note: Restriction checking is LIMITED because SELLER_ID is not set in Secrets. "
                        "If you add SELLER_ID later, the app can automatically eliminate RESTRICTED items more accurately."
                    )

        except Exception as e:
            st.error(str(e))
