import json
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple, List

import pandas as pd
import requests
import streamlit as st

import boto3
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest

# =========================
# UI CONFIG
# =========================
st.set_page_config(page_title="High Focus Sourcing Tool", layout="wide")

st.title("High Focus Sourcing Tool")
st.caption("Analyze single ASIN + upload wholesaler Excel/CSV to auto-filter profitable products.")

# =========================
# SAFE SECRET READ (NO CRASH)
# =========================
def sget(key: str, default=None):
    try:
        return st.secrets.get(key, default)
    except Exception:
        return default

CLIENT_ID = sget("CLIENT_ID")
CLIENT_SECRET = sget("CLIENT_SECRET")
REFRESH_TOKEN = sget("REFRESH_TOKEN")

AWS_ACCESS_KEY_ID = sget("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = sget("AWS_SECRET_ACCESS_KEY")
AWS_ROLE_ARN = sget("AWS_ROLE_ARN")  # optional (if you use AssumeRole)
AWS_REGION = sget("AWS_REGION", "us-east-1")

MARKETPLACE_ID = sget("MARKETPLACE_ID", "ATVPDKIKX0DER")  # US default
SP_API_HOST = sget("SP_API_HOST", "sellingpartnerapi-na.amazon.com")

# If secrets missing, show message but do not crash:
missing = []
for k in ["CLIENT_ID", "CLIENT_SECRET", "REFRESH_TOKEN", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "MARKETPLACE_ID", "SP_API_HOST"]:
    if not sget(k):
        missing.append(k)

if missing:
    st.warning(
        "Secrets are missing. Add them in Streamlit → Manage app → Settings → Secrets.\n\n"
        f"Missing: {', '.join(missing)}\n\n"
        "The app will still load, but Amazon calls will fail until secrets are complete."
    )

# =========================
# AMAZON / SP-API HELPERS
# =========================
@dataclass
class SPConfig:
    client_id: str
    client_secret: str
    refresh_token: str
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_role_arn: Optional[str]
    aws_region: str
    marketplace_id: str
    host: str

def get_config() -> Optional[SPConfig]:
    if not (CLIENT_ID and CLIENT_SECRET and REFRESH_TOKEN and AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY and AWS_REGION and MARKETPLACE_ID and SP_API_HOST):
        return None
    return SPConfig(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        refresh_token=REFRESH_TOKEN,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        aws_role_arn=AWS_ROLE_ARN,
        aws_region=AWS_REGION,
        marketplace_id=MARKETPLACE_ID,
        host=SP_API_HOST
    )

@st.cache_data(ttl=3300)
def lwa_access_token(client_id: str, client_secret: str, refresh_token: str) -> str:
    url = "https://api.amazon.com/auth/o2/token"
    payload = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
    }
    r = requests.post(url, data=payload, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]

def aws_session_creds(cfg: SPConfig) -> Dict[str, str]:
    """
    Use either:
    - direct access key/secret
    - OR assume role if AWS_ROLE_ARN provided
    """
    base = boto3.Session(
        aws_access_key_id=cfg.aws_access_key_id,
        aws_secret_access_key=cfg.aws_secret_access_key,
        region_name=cfg.aws_region,
    )

    if cfg.aws_role_arn:
        sts = base.client("sts")
        resp = sts.assume_role(RoleArn=cfg.aws_role_arn, RoleSessionName="hf-spapi-session")
        c = resp["Credentials"]
        return {
            "access_key": c["AccessKeyId"],
            "secret_key": c["SecretAccessKey"],
            "token": c["SessionToken"],
        }

    # no role
    return {
        "access_key": cfg.aws_access_key_id,
        "secret_key": cfg.aws_secret_access_key,
        "token": "",
    }

def sign_and_call(cfg: SPConfig, method: str, path: str, query: Dict[str, Any] = None, body: Any = None) -> Tuple[int, Any]:
    """
    Signed SP-API call using SigV4 (service execute-api)
    """
    query = query or {}
    token = lwa_access_token(cfg.client_id, cfg.client_secret, cfg.refresh_token)
    creds = aws_session_creds(cfg)

    url = f"https://{cfg.host}{path}"

    headers = {
        "host": cfg.host,
        "x-amz-access-token": token,
        "user-agent": "highfocus-sourcing-tool/1.0",
        "accept": "application/json",
    }

    data = None
    if body is not None:
        headers["content-type"] = "application/json"
        data = json.dumps(body)

    aws_req = AWSRequest(method=method.upper(), url=url, data=data, params=query, headers=headers)
    SigV4Auth(
        credentials=boto3.session.Session().get_credentials()
        if False else  # never used
        None,
        service_name="execute-api",
        region_name=cfg.aws_region,
    )

    # Manual credentials signing:
    from botocore.credentials import Credentials
    sig_creds = Credentials(creds["access_key"], creds["secret_key"], creds["token"] or None)
    SigV4Auth(sig_creds, "execute-api", cfg.aws_region).add_auth(aws_req)

    signed_headers = dict(aws_req.headers)

    r = requests.request(method=method.upper(), url=url, params=query, data=data, headers=signed_headers, timeout=35)

    try:
        js = r.json()
    except Exception:
        js = r.text

    return r.status_code, js

# -------------------------
# SP-API endpoints we use
# -------------------------
def get_competitive_price(cfg: SPConfig, asin: str) -> Dict[str, Any]:
    # Product Pricing API (competitive price)
    path = "/products/pricing/v0/competitivePrice"
    q = {"MarketplaceId": cfg.marketplace_id, "Asins": asin}
    code, js = sign_and_call(cfg, "GET", path, q)
    return {"status": code, "data": js}

def get_offers(cfg: SPConfig, asin: str) -> Dict[str, Any]:
    # Product Pricing API (offers)
    path = f"/products/pricing/v0/items/{asin}/offers"
    q = {"MarketplaceId": cfg.marketplace_id, "ItemCondition": "New"}
    code, js = sign_and_call(cfg, "GET", path, q)
    return {"status": code, "data": js}

def get_restrictions(cfg: SPConfig, asin: str) -> Dict[str, Any]:
    # Listings Restrictions API
    # sellerId is required in some configs, but often works without if token is tied to seller.
    path = "/listings/2021-08-01/restrictions"
    q = {
        "asin": asin,
        "marketplaceIds": cfg.marketplace_id
    }
    code, js = sign_and_call(cfg, "GET", path, q)
    return {"status": code, "data": js}

def fees_estimate(cfg: SPConfig, asin: str, price: float) -> Dict[str, Any]:
    # Product Fees API
    path = "/products/fees/v0/feesEstimate"
    body = {
        "FeesEstimateRequest": {
            "MarketplaceId": cfg.marketplace_id,
            "IdType": "ASIN",
            "IdValue": asin,
            "PriceToEstimateFees": {
                "ListingPrice": {"CurrencyCode": "USD", "Amount": float(price)},
                "Shipping": {"CurrencyCode": "USD", "Amount": 0.0},
            },
            "Identifier": f"hf-{asin}-{int(time.time())}"
        }
    }
    code, js = sign_and_call(cfg, "POST", path, body=body)
    return {"status": code, "data": js}

# =========================
# PARSERS
# =========================
def extract_price_from_competitive(payload: Any) -> Optional[float]:
    try:
        # payload format: {"payload":[{"CompetitivePrices":[...]}]}
        items = payload.get("payload", [])
        if not items:
            return None
        cp = items[0].get("CompetitivePrices", [])
        if not cp:
            return None
        # pick first price
        price = cp[0].get("Price", {}).get("ListingPrice", {}).get("Amount")
        if price is None:
            return None
        return float(price)
    except Exception:
        return None

def extract_offer_count(payload: Any) -> Optional[int]:
    try:
        p = payload.get("payload", {})
        offers = p.get("Offers", [])
        return len(offers)
    except Exception:
        return None

def parse_fees_total(payload: Any) -> Optional[float]:
    try:
        # payload: FeesEstimateResult -> FeesEstimate -> TotalFeesEstimate -> Amount
        r = payload.get("payload", {}).get("FeesEstimateResult", {}).get("FeesEstimate", {})
        total = r.get("TotalFeesEstimate", {}).get("Amount")
        if total is None:
            return None
        return float(total)
    except Exception:
        return None

def parse_restriction_status(payload: Any) -> Tuple[str, str]:
    """
    Returns (status, note)
    status:
      - ELIGIBLE
      - REQUIRES_APPROVAL
      - RESTRICTED
      - UNKNOWN
    """
    try:
        restrictions = payload.get("restrictions", []) or payload.get("payload", {}).get("restrictions", [])
        # Some responses wrap differently. If nothing found, return unknown
        if not restrictions:
            # Sometimes API returns an errors structure
            if "errors" in payload:
                return ("UNKNOWN", payload["errors"][0].get("message", "Restrictions API error"))
            return ("UNKNOWN", "No restriction data")

        # If any restriction says "NOT_ELIGIBLE" treat as RESTRICTED
        # If any says "APPROVAL_REQUIRED" treat as REQUIRES_APPROVAL
        # else eligible
        status = "ELIGIBLE"
        notes = []

        for r in restrictions:
            reason = r.get("reasonCode") or r.get("reason")
            if reason:
                notes.append(str(reason))
            if reason in ["NOT_ELIGIBLE", "RESTRICTED", "NOT_AUTHORIZED"]:
                status = "RESTRICTED"
            if reason in ["APPROVAL_REQUIRED", "APPROVAL_NEEDED", "GATED"]:
                if status != "RESTRICTED":
                    status = "REQUIRES_APPROVAL"

        note = ", ".join(notes)[:200] if notes else "OK"
        return (status, note)
    except Exception as e:
        return ("UNKNOWN", str(e))

# =========================
# BUSINESS METRICS
# =========================
def calc_profit(price: Optional[float], supplier_cost: float, fees: Optional[float]) -> Tuple[Optional[float], Optional[float]]:
    if price is None or fees is None:
        return (None, None)
    profit = price - supplier_cost - fees
    roi = (profit / supplier_cost * 100.0) if supplier_cost > 0 else None
    return (profit, roi)

# =========================
# SINGLE ASIN UI
# =========================
cfg = get_config()

st.subheader("1) Single Product (ASIN)")
colA, colB, colC = st.columns([2, 1, 1])
asin_input = colA.text_input("Enter ASIN", value="", placeholder="B00....")
supplier_cost_single = colB.number_input("Your supplier cost ($)", min_value=0.0, value=0.0, step=0.25)
min_profit_single = colC.number_input("Min profit filter ($)", min_value=0.0, value=3.0, step=0.5)

if st.button("Analyze Product", type="primary"):
    if not cfg:
        st.error("Secrets incomplete. Add them in Streamlit Secrets first.")
    elif not asin_input.strip():
        st.error("Enter an ASIN.")
    else:
        asin = asin_input.strip()

        with st.spinner("Calling Amazon SP-API..."):
            price_resp = get_competitive_price(cfg, asin)
            offers_resp = get_offers(cfg, asin)
            restr_resp = get_restrictions(cfg, asin)

        if price_resp["status"] >= 400 and isinstance(price_resp["data"], dict) and "errors" in price_resp["data"]:
            st.error(f"Price call failed: {price_resp['data']['errors'][0].get('message')}")
        else:
            price = extract_price_from_competitive(price_resp["data"]) if isinstance(price_resp["data"], dict) else None
            offer_count = extract_offer_count(offers_resp["data"]) if isinstance(offers_resp["data"], dict) else None
            restr_status, restr_note = parse_restriction_status(restr_resp["data"]) if isinstance(restr_resp["data"], dict) else ("UNKNOWN", "Bad restrictions response")

            fees_val = None
            if price is not None:
                fees_resp = fees_estimate(cfg, asin, price)
                if isinstance(fees_resp["data"], dict):
                    fees_val = parse_fees_total(fees_resp["data"])

            profit, roi = calc_profit(price, supplier_cost_single, fees_val)

            if restr_status == "RESTRICTED":
                st.error(f"RESTRICTED: {restr_note}")
            elif restr_status == "REQUIRES_APPROVAL":
                st.warning(f"NEEDS APPROVAL (Ungate): {restr_note}")
            else:
                st.success("Connected to Amazon successfully")

            st.write(f"**Amazon price:** {('$' + format(price, '.2f')) if price is not None else 'N/A'}")
            st.write(f"**Offer count (new):** {offer_count if offer_count is not None else 'N/A'}")
            st.write(f"**Estimated Amazon fees:** {('$' + format(fees_val, '.2f')) if fees_val is not None else 'N/A'}")
            st.write(f"**Your cost:** ${supplier_cost_single:.2f}")

            if profit is not None:
                st.write(f"**Profit:** ${profit:.2f}")
                if roi is not None:
                    st.write(f"**ROI:** {roi:.1f}%")

                if profit >= min_profit_single and restr_status != "RESTRICTED":
                    st.success("✅ This is a BUY candidate (profit filter passed).")
                elif restr_status == "REQUIRES_APPROVAL":
                    st.info("✅ Profitable but needs approval (UNGATE candidate).")
                else:
                    st.warning("Not passing your profit filter.")

# =========================
# BULK EXCEL UPLOAD UI
# =========================
st.divider()
st.subheader("2) Upload Wholesaler Excel/CSV (Bulk Sourcing)")

left, right = st.columns([2, 1])

with left:
    upload = st.file_uploader("Upload Excel (.xlsx) or CSV", type=["xlsx", "csv"])
with right:
    st.markdown("### Filters")
    min_profit = st.number_input("Min profit ($)", min_value=0.0, value=3.0, step=0.5)
    min_roi = st.number_input("Min ROI (%)", min_value=0.0, value=30.0, step=5.0)
    max_rows = st.number_input("Max rows to process (testing)", min_value=1, value=50, step=10)

st.caption("Your file should contain at least: ASIN or UPC/EAN/GTIN + cost. Common columns:
