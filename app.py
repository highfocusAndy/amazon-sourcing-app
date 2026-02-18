import json
import datetime
import requests
import streamlit as st

import boto3
from botocore.awsrequest import AWSRequest
from botocore.auth import SigV4Auth
from botocore.credentials import Credentials


# -----------------------------
# CONFIG / SECRETS
# -----------------------------
st.set_page_config(page_title="High Focus Sourcing Tool", layout="centered")
st.title("High Focus Sourcing Tool")

CLIENT_ID = st.secrets.get("CLIENT_ID", "")
CLIENT_SECRET = st.secrets.get("CLIENT_SECRET", "")
REFRESH_TOKEN = st.secrets.get("REFRESH_TOKEN", "")

AWS_ROLE_ARN = st.secrets.get("AWS_ROLE_ARN", "")
AWS_REGION = st.secrets.get("AWS_REGION", "us-east-1")

MARKETPLACE_ID = st.secrets.get("MARKETPLACE_ID", "ATVPDKIKX0DER")  # US
SP_API_HOST = st.secrets.get("SP_API_HOST", "sellingpartnerapi-na.amazon.com")  # NA endpoint

SERVICE = "execute-api"


# -----------------------------
# HELPERS
# -----------------------------
def _must_have(value: str, name: str):
    if not value or not str(value).strip():
        raise ValueError(f"Missing {name}. Add it in Streamlit Secrets.")


def get_lwa_access_token() -> str:
    _must_have(CLIENT_ID, "CLIENT_ID")
    _must_have(CLIENT_SECRET, "CLIENT_SECRET")
    _must_have(REFRESH_TOKEN, "REFRESH_TOKEN")

    url = "https://api.amazon.com/auth/o2/token"
    data = {
        "grant_type": "refresh_token",
        "refresh_token": REFRESH_TOKEN,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }

    r = requests.post(url, data=data, timeout=30)
    try:
        payload = r.json()
    except Exception:
        payload = {"raw": r.text}

    if r.status_code != 200:
        raise RuntimeError(f"LWA token error ({r.status_code}): {payload}")

    token = payload.get("access_token")
    if not token:
        raise RuntimeError(f"LWA response missing access_token: {payload}")

    return token


def assume_role_credentials() -> Credentials:
    _must_have(AWS_ROLE_ARN, "AWS_ROLE_ARN")

    sts = boto3.client("sts", region_name=AWS_REGION)
    resp = sts.assume_role(
        RoleArn=AWS_ROLE_ARN,
        RoleSessionName="highfocus-spapi-session",
        DurationSeconds=3600,
    )
    c = resp["Credentials"]
    return Credentials(
        access_key=c["AccessKeyId"],
        secret_key=c["SecretAccessKey"],
        token=c["SessionToken"],
    )


def signed_sp_api_get(path: str, query: dict, lwa_access_token: str) -> requests.Response:
    """
    Signs request with AWS SigV4 using assumed role credentials,
    and includes x-amz-access-token (LWA) required by SP-API.
    """
    creds = assume_role_credentials()

    base = f"https://{SP_API_HOST}"
    qs = "&".join([f"{k}={requests.utils.quote(str(v))}" for k, v in query.items()])
    url = f"{base}{path}?{qs}" if qs else f"{base}{path}"

    headers = {
        "host": SP_API_HOST,
        "user-agent": "highfocus-sourcing-tool/1.0",
        "accept": "application/json",
        "x-amz-access-token": lwa_access_token,
    }

    req = AWSRequest(method="GET", url=url, data=None, headers=headers)
    SigV4Auth(creds, SERVICE, AWS_REGION).add_auth(req)

    # Convert signed headers back to dict
    signed_headers = dict(req.headers.items())

    # Important: include session token header if present
    # (botocore usually adds it automatically, but keep safe)
    if creds.token and "X-Amz-Security-Token" not in signed_headers:
        signed_headers["X-Amz-Security-Token"] = creds.token

    return requests.get(url, headers=signed_headers, timeout=30)


def extract_price_from_offers(resp_json: dict):
    """
    Try to find a meaningful 'current' offer price from Product Pricing API.
    Priority:
      1) Buy Box winner offerListingPrice
      2) Lowest price in summary
      3) First offerListingPrice
    """
    payload = resp_json.get("payload") or {}
    summary = payload.get("Summary") or payload.get("summary") or {}
    offers = payload.get("Offers") or payload.get("offers") or []

    # 1) Buy Box winner
    for o in offers:
        if o.get("IsBuyBoxWinner") is True or o.get("isBuyBoxWinner") is True:
            lp = (o.get("ListingPrice") or o.get("listingPrice") or {})
            amount = lp.get("Amount") or lp.get("amount")
            currency = lp.get("CurrencyCode") or lp.get("currencyCode")
            if amount is not None:
                return float(amount), currency or "USD", "Buy Box"

    # 2) Lowest price summary
    lowest_prices = summary.get("LowestPrices") or summary.get("lowestPrices") or []
    for p in lowest_prices:
        lp = p.get("ListingPrice") or p.get("listingPrice") or {}
        amount = lp.get("Amount") or lp.get("amount")
        currency = lp.get("CurrencyCode") or lp.get("currencyCode")
        if amount is not None:
            return float(amount), currency or "USD", "Lowest"

    # 3) First offer
    if offers:
        o = offers[0]
        lp = (o.get("ListingPrice") or o.get("listingPrice") or {})
        amount = lp.get("Amount") or lp.get("amount")
        currency = lp.get("CurrencyCode") or lp.get("currencyCode")
        if amount is not None:
            return float(amount), currency or "USD", "Offer"

    return None, None, None


def get_amazon_price_for_asin(asin: str):
    """
    Uses Product Pricing API:
      GET /products/pricing/v0/items/{asin}/offers
    """
    lwa = get_lwa_access_token()
    path = f"/products/pricing/v0/items/{asin}/offers"
    query = {
        "MarketplaceId": MARKETPLACE_ID,
        "ItemCondition": "New",
    }

    r = signed_sp_api_get(path, query, lwa)

    # Try JSON
    try:
        j = r.json()
    except Exception:
        j = {"raw": r.text}

    if r.status_code != 200:
        # Show useful error (not secrets)
        raise RuntimeError(f"SP-API error ({r.status_code}): {json.dumps(j)[:1200]}")

    price, currency, source = extract_price_from_offers(j)
    return price, currency, source, j


# -----------------------------
# UI
# -----------------------------
asin = st.text_input("Enter ASIN", value="")
cost = st.number_input("Your supplier cost ($)", min_value=0.0, step=0.01)

if st.button("Analyze Product"):
    if not asin.strip():
        st.error("Please enter an ASIN.")
        st.stop()

    # Basic secret checks
    try:
        _must_have(CLIENT_ID, "CLIENT_ID")
        _must_have(CLIENT_SECRET, "CLIENT_SECRET")
        _must_have(REFRESH_TOKEN, "REFRESH_TOKEN")
        _must_have(AWS_ROLE_ARN, "AWS_ROLE_ARN")
    except Exception as e:
        st.error(str(e))
        st.stop()

    with st.spinner("Connecting to Amazon SP-API..."):
        try:
            price, currency, source, raw = get_amazon_price_for_asin(asin.strip())
            if price is None:
                st.warning("Connected, but no offer price was found for this ASIN (may have no offers / restricted).")
                st.json(raw)
                st.stop()

            # Simple estimate (you can later add Amazon fees endpoint)
            est_fees = 0.0
            net_profit = (price - est_fees) - cost

            st.success("Analysis complete")
            st.write(f"**ASIN:** {asin.strip()}")
            st.write(f"**Amazon price:** {price:.2f} {currency}  _(source: {source})_")
            st.write(f"**Estimated fees:** {est_fees:.2f} {currency}")
            st.write(f"**Your cost:** {cost:.2f} {currency}")
            st.write(f"**Net profit:** {net_profit:.2f} {currency}")

        except Exception as e:
            st.error("Could not fetch Amazon price.")
            st.code(str(e))    }
    r = requests.post(url, data=data, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]

# ================== ASSUME ROLE (AWS) ==================
def assume_role_credentials() -> Credentials:
    sts = boto3.client(
        "sts",
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION,
    )
    resp = sts.assume_role(RoleArn=AWS_ROLE_ARN, RoleSessionName="spapi-session")
    c = resp["Credentials"]
    return Credentials(
        access_key=c["AccessKeyId"],
        secret_key=c["SecretAccessKey"],
        token=c["SessionToken"],
    )

# ================== SIGNED SP-API REQUEST ==================
def sp_api_signed_get(path: str, query: dict, lwa_access_token: str) -> dict:
    # Build URL
    base = f"https://{SP_API_HOST}"
    qs = "&".join([f"{k}={requests.utils.quote(str(v))}" for k, v in query.items()])
    url = f"{base}{path}?{qs}"

    # Headers required by SP-API
    headers = {
        "host": SP_API_HOST,
        "x-amz-access-token": lwa_access_token,
        "user-agent": "highfocus-sourcing-tool/1.0",
        "accept": "application/json",
    }

    # Sign with SigV4 (service must be execute-api)
    creds = assume_role_credentials()
    aws_req = AWSRequest(method="GET", url=url, headers=headers)
    SigV4Auth(creds, "execute-api", AWS_REGION).add_auth(aws_req)

    signed_headers = dict(aws_req.headers)
    r = requests.get(url, headers=signed_headers, timeout=30)
    # Return full details to debug
    return {"status_code": r.status_code, "text": r.text}

# ================== PRICING CALL ==================
def get_amazon_price(asin_value: str) -> dict:
    lwa = get_lwa_access_token()

    # Product Pricing API (GetPricing) for ASIN
    path = "/products/pricing/v0/price"
    query = {
        "MarketplaceId": MARKETPLACE_ID,
        "Asins": asin_value
    }
    return sp_api_signed_get(path, query, lwa)

def extract_price(resp_text: str):
    try:
        data = json.loads(resp_text)
    except Exception:
        return None

    # Try common structures (varies by response)
    # If Amazon returns payload list:
    payload = data.get("payload")
    if isinstance(payload, list) and payload:
        item = payload[0]
        # Try CompetitivePricing -> CompetitivePrices -> Price -> ListingPrice -> Amount
        cp = item.get("Product", {}).get("CompetitivePricing", {})
        comps = cp.get("CompetitivePrices", [])
        if comps:
            price = comps[0].get("Price", {}).get("ListingPrice", {}).get("Amount")
            if price is not None:
                return float(price)

    return None

# ================== ACTION ==================
if st.button("Analyze Product"):
    if not asin:
        st.error("Enter an ASIN first.")
        st.stop()

    with st.spinner("Connecting to Amazon..."):
        try:
            resp = get_amazon_price(asin.strip())
            status = resp["status_code"]
            body_text = resp["text"]

            if status != 200:
                st.error(f"Could not fetch Amazon price (HTTP {status}).")
                st.code(body_text)
                st.stop()

            price = extract_price(body_text)

            if price is None:
                st.warning("Got a response but could not extract price. Showing raw response:")
                st.json(json.loads(body_text))
                st.stop()

            # simple fees placeholder (you can replace later with Fees API)
            est_fees = round(price * 0.30, 2)
            net_profit = round(price - est_fees - cost, 2)

            st.success("Analysis complete ✅")
            st.write("ASIN:", asin)
            st.write("Amazon price:", price)
            st.write("Estimated fees:", est_fees)
            st.write("Your cost:", cost)
            st.write("Net profit:", net_profit)

        except Exception as e:
            st.error("Could not fetch Amazon price.")
            st.code(str(e))
