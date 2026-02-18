import json
import time
from typing import Dict, Any, Optional, Tuple, List

import pandas as pd
import requests
import streamlit as st
import boto3
from botocore.awsrequest import AWSRequest
from botocore.auth import SigV4Auth
from botocore.credentials import Credentials


# ----------------------------
# UI
# ----------------------------
st.set_page_config(page_title="High Focus Sourcing Tool", layout="centered")
st.title("High Focus Sourcing Tool")

# ----------------------------
# Helpers
# ----------------------------
def sget(key: str, required: bool = True) -> Optional[str]:
    """Read Streamlit secrets safely."""
    val = st.secrets.get(key)
    if required and (val is None or str(val).strip() == ""):
        st.error(f"Missing secret: {key}")
        st.stop()
    return str(val).strip() if val is not None else None


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
        raise RuntimeError(f"LWA token error {r.status_code}: {r.text}")
    return r.json()["access_token"]


def assume_role_credentials(access_key_id: str, secret_access_key: str, role_arn: str, region: str) -> Credentials:
    sts = boto3.client(
        "sts",
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name=region,
    )
    resp = sts.assume_role(RoleArn=role_arn, RoleSessionName="spapi-session")
    c = resp["Credentials"]
    return Credentials(c["AccessKeyId"], c["SecretAccessKey"], c["SessionToken"])


def sigv4_signed_get(
    region: str,
    host: str,
    path: str,
    query: Dict[str, Any],
    headers: Dict[str, str],
    creds: Credentials,
) -> Tuple[int, str]:
    base = f"https://{host}"
    qs = "&".join([f"{k}={requests.utils.quote(str(v))}" for k, v in query.items() if v is not None])
    url = f"{base}{path}"
    if qs:
        url += f"?{qs}"

    aws_req = AWSRequest(method="GET", url=url, headers=headers)
    SigV4Auth(creds, "execute-api", region).add_auth(aws_req)

    signed_headers = dict(aws_req.headers)
    r = requests.get(url, headers=signed_headers, timeout=30)
    return r.status_code, r.text


def fetch_catalog_item_and_offers(
    asin: str,
    marketplace_id: str,
    lwa_access_token: str,
    creds: Credentials,
    region: str,
    host: str,
) -> Dict[str, Any]:
    # Catalog: to get rank (salesRanks) + title/brand
    catalog_path = f"/catalog/2022-04-01/items/{asin}"
    catalog_query = {
        "marketplaceIds": marketplace_id,
        "includedData": "attributes,salesRanks,identifiers,summaries"
    }
    headers = {
        "host": host,
        "x-amz-access-token": lwa_access_token,
        "user-agent": "highfocus-sourcing-tool/1.0",
        "accept": "application/json",
    }
    sc, body = sigv4_signed_get(region, host, catalog_path, catalog_query, headers, creds)
    catalog_json = None
    if sc == 200:
        catalog_json = json.loads(body)
    else:
        catalog_json = {"_error": {"status": sc, "body": body}}

    # Offers: price + number of offers (sellers)
    offers_path = f"/products/pricing/v0/items/{asin}/offers"
    offers_query = {"MarketplaceId": marketplace_id, "ItemCondition": "New"}
    sc2, body2 = sigv4_signed_get(region, host, offers_path, offers_query, headers, creds)
    offers_json = None
    if sc2 == 200:
        offers_json = json.loads(body2)
    else:
        offers_json = {"_error": {"status": sc2, "body": body2}}

    return {"catalog": catalog_json, "offers": offers_json}


def parse_price_and_sellers(offers_json: Dict[str, Any]) -> Tuple[Optional[float], Optional[int], bool]:
    """
    Returns: (price, sellers_count, amazon_on_listing)
    Note: 'amazon_on_listing' is best-effort from offer sellerId/IsFulfilledByAmazon etc. (SP-API doesn't always expose seller identity clearly).
    """
    if "_error" in offers_json:
        return None, None, False

    payload = offers_json.get("payload") or {}
    offers = payload.get("Offers") or []
    if not offers:
        return None, 0, False

    # Best price
    prices = []
    amazon_on = False
    for o in offers:
        listing = o.get("ListingPrice") or {}
        amount = listing.get("Amount")
        if isinstance(amount, (int, float)):
            prices.append(float(amount))

        # Best-effort: some payloads include IsAmazonFulfilled / IsBuyBoxWinner flags only
        # We treat BuyBox by Amazon as not reliably detectable; we keep a conservative flag.
        # We'll improve later with additional endpoints / heuristics.
        if o.get("IsFulfilledByAmazon") is True:
            pass

    best_price = min(prices) if prices else None
    return best_price, len(offers), amazon_on


def parse_rank(catalog_json: Dict[str, Any]) -> Optional[int]:
    if "_error" in catalog_json:
        return None

    # Try salesRanks
    ranks = []
    ranks_block = catalog_json.get("salesRanks") or {}
    # Some structures: {"salesRanks": [{"ranks":[{"rank":123, ...}]}]}
    if isinstance(ranks_block, list):
        for entry in ranks_block:
            for r in (entry.get("ranks") or []):
                rk = r.get("rank")
                if isinstance(rk, int):
                    ranks.append(rk)

    if not ranks:
        # sometimes nested in "salesRanks" dict
        if isinstance(ranks_block, dict):
            for _, v in ranks_block.items():
                if isinstance(v, list):
                    for entry in v:
                        for r in (entry.get("ranks") or []):
                            rk = r.get("rank")
                            if isinstance(rk, int):
                                ranks.append(rk)

    return min(ranks) if ranks else None


def compute_profit(price: Optional[float], cost: float) -> Dict[str, Optional[float]]:
    if price is None:
        return {"profit": None, "roi": None, "margin": None}
    profit = price - cost
    roi = (profit / cost) * 100 if cost > 0 else None
    margin = (profit / price) * 100 if price > 0 else None
    return {"profit": profit, "roi": roi, "margin": margin}


def is_valid_asin(asin: str) -> bool:
    a = asin.strip()
    # ASIN typically 10 chars alnum
    return len(a) == 10 and a.isalnum()


# ----------------------------
# Load Secrets ONCE
# ----------------------------
CLIENT_ID = sget("CLIENT_ID")
CLIENT_SECRET = sget("CLIENT_SECRET")
REFRESH_TOKEN = sget("REFRESH_TOKEN")

AWS_ACCESS_KEY_ID = sget("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = sget("AWS_SECRET_ACCESS_KEY")
AWS_ROLE_ARN = sget("AWS_ROLE_ARN")
AWS_REGION = sget("AWS_REGION")

MARKETPLACE_ID = sget("MARKETPLACE_ID")
SP_API_HOST = sget("SP_API_HOST")

# Cache tokens/creds in session so you don't redo work
if "lwa_token" not in st.session_state:
    st.session_state["lwa_token"] = None
if "aws_creds" not in st.session_state:
    st.session_state["aws_creds"] = None


def ensure_connection() -> Tuple[str, Credentials]:
    # LWA token
    if not st.session_state["lwa_token"]:
        st.session_state["lwa_token"] = get_lwa_access_token(CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN)

    # STS creds
    if not st.session_state["aws_creds"]:
        st.session_state["aws_creds"] = assume_role_credentials(
            AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ROLE_ARN, AWS_REGION
        )

    return st.session_state["lwa_token"], st.session_state["aws_creds"]


# ----------------------------
# Single ASIN tool (kept)
# ----------------------------
st.subheader("Single ASIN Check")
asin_input = st.text_input("Enter ASIN", value="B004GIIZCW").strip().upper()
cost_input = st.number_input("Your supplier cost ($)", min_value=0.0, value=0.0, step=0.1)

if st.button("Analyze Product", type="primary"):
    try:
        if not is_valid_asin(asin_input):
            st.error("Invalid ASIN format. ASIN must be 10 characters (letters/numbers).")
            st.stop()

        lwa, creds = ensure_connection()
        data = fetch_catalog_item_and_offers(asin_input, MARKETPLACE_ID, lwa, creds, AWS_REGION, SP_API_HOST)

        price, sellers, amazon_on = parse_price_and_sellers(data["offers"])
        rank = parse_rank(data["catalog"])
        metrics = compute_profit(price, float(cost_input))

        st.success("Connected to Amazon successfully")
        st.write(f"Amazon price: **${price:.2f}**" if price is not None else "Amazon price: **N/A**")
        st.write(f"Rank (best): **{rank}**" if rank is not None else "Rank: **N/A**")
        st.write(f"# Sellers (offers): **{sellers}**" if sellers is not None else "Sellers: **N/A**")

        st.write(f"Your cost: **${cost_input:.2f}**")
        if metrics["profit"] is not None:
            st.write(f"Profit: **${metrics['profit']:.2f}**")
            st.write(f"ROI: **{metrics['roi']:.1f}%**" if metrics["roi"] is not None else "ROI: N/A")
            st.write(f"Margin: **{metrics['margin']:.1f}%**" if metrics["margin"] is not None else "Margin: N/A")
        else:
            st.warning("No price returned for this ASIN. It may be invalid for your marketplace or has no offers.")
            # Show raw API error if present
            if "_error" in data["offers"]:
                st.code(data["offers"]["_error"]["body"])
    except Exception as e:
        st.error("Amazon connection failed")
        st.code(str(e))


st.divider()

# ----------------------------
# Excel Upload Sourcing (Phase 2 start)
# ----------------------------
st.subheader("Wholesale Excel Upload (Batch Sourcing)")

uploaded = st.file_uploader("Upload wholesaler file (.xlsx or .csv)", type=["xlsx", "csv"])

st.caption("File should include at least: ASIN + Cost. Column names can be anything; you will choose them below.")

if uploaded is not None:
    # Read file
    try:
        if uploaded.name.lower().endswith(".csv"):
            df = pd.read_csv(uploaded)
        else:
            df = pd.read_excel(uploaded)

        st.write("Preview:")
        st.dataframe(df.head(20), use_container_width=True)

        cols = list(df.columns)
        asin_col = st.selectbox("Which column is ASIN?", options=cols)
        cost_col = st.selectbox("Which column is your Cost?", options=cols)

        min_roi = st.number_input("Minimum ROI % to keep (BUY/UNGATE lists)", value=25.0, step=1.0)
        ungate_units_default = st.number_input("Default units to buy for ungating (editable later)", value=10, step=1)

        run = st.button("Run Batch Sourcing")

        if run:
            # Connect once
            try:
                lwa, creds = ensure_connection()
            except Exception as e:
                st.error("Connection failed. Check your Streamlit secrets ONLY if you see invalid_client or refresh token errors.")
                st.code(str(e))
                st.stop()

            df_work = df.copy()
            df_work["ASIN_CLEAN"] = df_work[asin_col].astype(str).str.strip().str.upper()
            df_work["COST_CLEAN"] = pd.to_numeric(df_work[cost_col], errors="coerce")

            results: List[Dict[str, Any]] = []
            progress = st.progress(0)
            total = len(df_work)

            for i, row in df_work.iterrows():
                asin = row["ASIN_CLEAN"]
                cost = row["COST_CLEAN"]

                out: Dict[str, Any] = {
                    "asin": asin,
                    "cost": float(cost) if pd.notna(cost) else None,
                    "price": None,
                    "profit": None,
                    "roi": None,
                    "margin": None,
                    "rank": None,
                    "sellers": None,
                    "amazon_on_listing": False,
                    "status": None,
                    "notes": None,
                    "ungate_units": None,
                }

                # Basic validation
                if not is_valid_asin(asin):
                    out["status"] = "ELIMINATED"
                    out["notes"] = "Invalid ASIN format"
                    results.append(out)
                    progress.progress(min(1.0, (i + 1) / total))
                    continue

                if out["cost"] is None or out["cost"] < 0:
                    out["status"] = "ELIMINATED"
                    out["notes"] = "Missing/invalid cost"
                    results.append(out)
                    progress.progress(min(1.0, (i + 1) / total))
                    continue

                # Fetch Amazon data
                try:
                    data = fetch_catalog_item_and_offers(asin, MARKETPLACE_ID, lwa, creds, AWS_REGION, SP_API_HOST)

                    price, sellers, amazon_on = parse_price_and_sellers(data["offers"])
                    rank = parse_rank(data["catalog"])
                    metrics = compute_profit(price, out["cost"])

                    out["price"] = price
                    out["sellers"] = sellers
                    out["amazon_on_listing"] = amazon_on
                    out["rank"] = rank
                    out.update(metrics)

                    # If no price -> eliminate
                    if price is None:
                        out["status"] = "ELIMINATED"
                        out["notes"] = "No price/offers (or invalid for marketplace)"
                    else:
                        # Profit filters
                        if (out["roi"] is None) or (out["roi"] < float(min_roi)):
                            out["status"] = "ELIMINATED"
                            out["notes"] = f"ROI below {min_roi}%"
                        else:
                            # For now we cannot reliably check restricted/gated without Seller Central eligibility endpoint.
                            # So we classify as BUY candidate now, and in next step we add gating/restriction check.
                            out["status"] = "BUY"
                            out["notes"] = "Meets ROI filter"

                    # Polite throttling
                    time.sleep(0.25)

                except Exception as e:
                    out["status"] = "ELIMINATED"
                    out["notes"] = f"API error: {str(e)[:120]}"

                results.append(out)
                progress.progress(min(1.0, (i + 1) / total))

            res_df = pd.DataFrame(results)

            # Split lists
            buy_df = res_df[res_df["status"] == "BUY"].copy()
            ungate_df = res_df[res_df["status"] == "UNGATE"].copy()
            eliminated_df = res_df[res_df["status"] == "ELIMINATED"].copy()

            st.success("Batch sourcing complete")

            st.subheader("✅ BUY LIST")
            st.dataframe(buy_df, use_container_width=True)

            st.subheader("🟡 UNGATE LIST")
            st.info("Ungate detection will be added next (eligibility endpoint). For now this stays empty.")
            st.dataframe(ungate_df, use_container_width=True)

            st.subheader("❌ ELIMINATED")
            st.dataframe(eliminated_df, use_container_width=True)

            # Download final CSVs
            st.download_button("Download BUY LIST (CSV)", buy_df.to_csv(index=False).encode("utf-8"), file_name="buy_list.csv")
            st.download_button("Download ELIMINATED (CSV)", eliminated_df.to_csv(index=False).encode("utf-8"), file_name="eliminated.csv")

    except Exception as e:
        st.error("Could not read the file. Make sure it's a real Excel (.xlsx) or CSV.")
        st.code(str(e))
