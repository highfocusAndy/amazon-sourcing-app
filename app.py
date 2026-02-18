# app.py
# High Focus Sourcing Tool (Streamlit) — SP-API (LWA + AWS SigV4)
# IMPORTANT: Do NOT hardcode secrets in this file. Use Streamlit Secrets.
#
# Streamlit → App → Settings → Secrets (paste like this):
# CLIENT_ID="..."
# CLIENT_SECRET="..."
# REFRESH_TOKEN="..."
# AWS_ACCESS_KEY_ID="..."
# AWS_SECRET_ACCESS_KEY="..."
# AWS_ROLE_ARN="arn:aws:iam::123456789012:role/YourSPAPIRole"
# AWS_REGION="us-east-1"
# SP_API_ENDPOINT="https://sellingpartnerapi-na.amazon.com"
# MARKETPLACE_ID="ATVPDKIKX0DER"

import json
import time
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

tab1, tab2 = st.tabs(["Single ASIN", "Excel Upload"])

# ----------------------------
# Secrets / Config
# ----------------------------
def _get_secret(name: str, default: str = "") -> str:
    try:
        return str(st.secrets.get(name, default)).strip()
    except Exception:
        return default

CLIENT_ID = _get_secret("CLIENT_ID")
CLIENT_SECRET = _get_secret("CLIENT_SECRET")
REFRESH_TOKEN = _get_secret("REFRESH_TOKEN")

AWS_ACCESS_KEY_ID = _get_secret("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = _get_secret("AWS_SECRET_ACCESS_KEY")
AWS_ROLE_ARN = _get_secret("AWS_ROLE_ARN")
AWS_REGION = _get_secret("AWS_REGION", "us-east-1")

SP_API_ENDPOINT = _get_secret("SP_API_ENDPOINT", "https://sellingpartnerapi-na.amazon.com").rstrip("/")
MARKETPLACE_ID = _get_secret("MARKETPLACE_ID", "ATVPDKIKX0DER")

if not MARKETPLACE_ID:
    MARKETPLACE_ID = "ATVPDKIKX0DER"


def _missing_secrets() -> list[str]:
    missing = []
    for k in ["CLIENT_ID", "CLIENT_SECRET", "REFRESH_TOKEN", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_ROLE_ARN"]:
        if not _get_secret(k):
            missing.append(k)
    return missing


# ----------------------------
# LWA (Login With Amazon)
# ----------------------------
@st.cache_data(ttl=50, show_spinner=False)
def get_lwa_access_token() -> str:
    url = "https://api.amazon.com/auth/o2/token"
    data = {
        "grant_type": "refresh_token",
        "refresh_token": REFRESH_TOKEN,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }
    r = requests.post(url, data=data, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"LWA token error: {r.status_code} {r.text}")
    return r.json()["access_token"]


# ----------------------------
# AWS AssumeRole for SP-API
# ----------------------------
@st.cache_data(ttl=45 * 60, show_spinner=False)
def assume_role_temp_creds() -> dict:
    """
    Uses your AWS access key/secret to assume the SP-API IAM role.
    """
    sts = boto3.client(
        "sts",
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    )
    # Unique session name
    session_name = f"spapi-{int(time.time())}"
    resp = sts.assume_role(RoleArn=AWS_ROLE_ARN, RoleSessionName=session_name, DurationSeconds=3600)
    c = resp["Credentials"]
    return {
        "AccessKeyId": c["AccessKeyId"],
        "SecretAccessKey": c["SecretAccessKey"],
        "SessionToken": c["SessionToken"],
        "Expiration": str(c["Expiration"]),
    }


def spapi_request(method: str, path: str, params: dict | None = None, body: dict | None = None) -> dict:
    """
    Signed SP-API request using SigV4 + LWA token.
    """
    access_token = get_lwa_access_token()
    temp = assume_role_temp_creds()

    creds = Credentials(temp["AccessKeyId"], temp["SecretAccessKey"], temp["SessionToken"])
    service = "execute-api"

    url = f"{SP_API_ENDPOINT}{path}"
    headers = {
        "x-amz-access-token": access_token,
        "content-type": "application/json",
        "accept": "application/json",
    }

    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    aws_req = AWSRequest(method=method.upper(), url=url, data=data, params=params or {}, headers=headers)
    SigV4Auth(creds, service, AWS_REGION).add_auth(aws_req)

    signed_headers = dict(aws_req.headers)
    r = requests.request(
        method=method.upper(),
        url=url,
        params=params or {},
        data=data,
        headers=signed_headers,
        timeout=45,
    )

    # SP-API often returns useful JSON even on non-200
    try:
        j = r.json()
    except Exception:
        raise RuntimeError(f"SP-API non-JSON response: {r.status_code} {r.text}")

    if r.status_code >= 400:
        raise RuntimeError(f"SP-API error: {r.status_code} {json.dumps(j)[:1200]}")
    return j


# ----------------------------
# SP-API Helpers (Price + Fees)
# ----------------------------
def get_current_price(asin: str) -> float | None:
    """
    Tries to get a reasonable 'Amazon price' from Offers (Pricing API).
    Returns lowest landed price found (new condition), otherwise None.
    """
    asin = asin.strip().upper()
    if not asin:
        return None

    path = f"/products/pricing/v0/items/{asin}/offers"
    params = {
        "MarketplaceId": MARKETPLACE_ID,
        "ItemCondition": "New",
    }
    j = spapi_request("GET", path, params=params)

    offers = (j.get("payload") or {}).get("Offers") or []
    prices = []
    for o in offers:
        lp = (o.get("ListingPrice") or {}).get("Amount")
        sp = (o.get("Shipping") or {}).get("Amount")
        if lp is not None:
            landed = float(lp) + float(sp or 0.0)
            prices.append(landed)

    if not prices:
        return None

    return round(min(prices), 2)


def estimate_fees(asin: str, price: float, is_fba: bool) -> float | None:
    """
    Uses Product Fees API to estimate total fees.
    NOTE: For best accuracy, pick correct fulfillment (FBA vs FBM).
    """
    asin = asin.strip().upper()
    if not asin or price is None:
        return None

    path = f"/products/fees/v0/listings/{asin}/feesEstimate"

    body = {
        "FeesEstimateRequest": {
            "MarketplaceId": MARKETPLACE_ID,
            "IsAmazonFulfilled": bool(is_fba),
            "PriceToEstimateFees": {
                "ListingPrice": {"CurrencyCode": "USD", "Amount": float(price)},
                # Shipping left empty (Amazon will estimate); you can add if you want.
            },
            "Identifier": f"hf-{asin}-{int(time.time())}",
        }
    }

    j = spapi_request("POST", path, body=body)

    payload = j.get("payload") or {}
    # Some responses put result in "FeesEstimateResult"
    result = payload.get("FeesEstimateResult") or payload.get("FeesEstimate") or payload
    # Dig for total fees
    total = None
    if isinstance(result, dict):
        fe = result.get("FeesEstimate") or {}
        tf = fe.get("TotalFeesEstimate") or {}
        amt = tf.get("Amount")
        if amt is not None:
            total = float(amt)

    if total is None:
        # fallback: try sum of fee details
        details = ((result.get("FeesEstimate") or {}).get("FeeDetailList")) if isinstance(result, dict) else None
        if details:
            s = 0.0
            for d in details:
                a = (d.get("FinalFee") or {}).get("Amount")
                if a is not None:
                    s += float(a)
            total = s if s > 0 else None

    return round(total, 2) if total is not None else None


def compute_profit(your_cost: float, amazon_price: float, est_fees: float) -> float:
    return round(float(amazon_price) - float(est_fees) - float(your_cost), 2)


# ----------------------------
# Single ASIN TAB
# ----------------------------
with tab1:
    asin = st.text_input("Enter ASIN")
    cost = st.number_input("Your supplier cost ($)", min_value=0.0, step=0.01, value=0.00)

    fulfillment = st.selectbox("Fulfillment", ["FBA", "FBM"], index=0)
    is_fba = fulfillment == "FBA"

    if st.button("Analyze Product"):
        missing = _missing_secrets()
        if missing:
            st.error("Missing Streamlit secrets: " + ", ".join(missing))
        else:
            try:
                st.info("Connecting to Amazon...")
                price = get_current_price(asin)
                if price is None:
                    st.error("Could not find price for this ASIN (try again or verify ASIN/marketplace).")
                else:
                    fees = estimate_fees(asin, price, is_fba=is_fba)
                    if fees is None:
                        st.error("Could not estimate fees for this ASIN.")
                    else:
                        profit = compute_profit(cost, price, fees)

                        st.success("Analysis complete ✅")
                        st.write(f"ASIN: **{asin.strip().upper()}**")
                        st.write(f"Amazon price: **{price}**")
                        st.write(f"Estimated fees: **{fees}**")
                        st.write(f"Your cost: **{round(cost, 2)}**")
                        st.write(f"Net profit: **{profit}**")

            except Exception as e:
                st.error(str(e))


# ----------------------------
# Excel Upload TAB
# ----------------------------
with tab2:
    st.write("Upload an Excel file with columns: **ASIN**, **Cost** (optional: **Fulfillment** as FBA/FBM).")
    up = st.file_uploader("Upload .xlsx", type=["xlsx"])

    if up is not None:
        try:
            df = pd.read_excel(up)
        except Exception as e:
            st.error(f"Excel read error: {e}")
            df = None

        if df is not None:
            # Normalize columns
            cols = {c.lower().strip(): c for c in df.columns}
            asin_col = cols.get("asin")
            cost_col = cols.get("cost") or cols.get("your_cost") or cols.get("supplier_cost")
            full_col = cols.get("fulfillment")

            if asin_col is None:
                st.error("Your Excel must have a column named ASIN.")
            else:
                if cost_col is None:
                    df["Cost"] = 0.0
                    cost_col = "Cost"

                results = []
                missing = _missing_secrets()
                if missing:
                    st.error("Missing Streamlit secrets: " + ", ".join(missing))
                else:
                    run = st.button("Analyze Excel")
                    if run:
                        prog = st.progress(0)
                        total = len(df)

                        for i, row in df.iterrows():
                            asin_v = str(row[asin_col]).strip().upper()
                            try:
                                cost_v = float(row[cost_col]) if pd.notna(row[cost_col]) else 0.0
                            except Exception:
                                cost_v = 0.0

                            ful_v = "FBA"
                            if full_col and pd.notna(row[full_col]):
                                ful_v = str(row[full_col]).strip().upper()
                                if ful_v not in ["FBA", "FBM"]:
                                    ful_v = "FBA"

                            is_fba_v = ful_v == "FBA"

                            try:
                                price_v = get_current_price(asin_v)
                                fees_v = estimate_fees(asin_v, price_v, is_fba=is_fba_v) if price_v is not None else None
                                profit_v = compute_profit(cost_v, price_v, fees_v) if (price_v is not None and fees_v is not None) else None
                            except Exception as e:
                                price_v, fees_v, profit_v = None, None, None

                            results.append(
                                {
                                    "ASIN": asin_v,
                                    "Fulfillment": ful_v,
                                    "Cost": round(cost_v, 2),
                                    "AmazonPrice": price_v,
                                    "EstimatedFees": fees_v,
                                    "NetProfit": profit_v,
                                }
                            )

                            prog.progress(min(1.0, (i + 1) / max(1, total)))

                        out = pd.DataFrame(results)
                        st.success("Done ✅")
                        st.dataframe(out, use_container_width=True)

                        # Download
                        csv = out.to_csv(index=False).encode("utf-8")
                        st.download_button("Download CSV", data=csv, file_name="high_focus_sourcing_results.csv", mime="text/csv")
```0
