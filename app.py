import json
import streamlit as st
import requests
import boto3
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials

# ================== UI ==================
st.set_page_config(page_title="High Focus Sourcing Tool", layout="centered")
st.title("High Focus Sourcing Tool")

asin = st.text_input("Enter ASIN")
cost = st.number_input("Your supplier cost ($)", min_value=0.0, step=0.01)

# ================== SECRETS (FROM STREAMLIT) ==================
CLIENT_ID = st.secrets["CLIENT_ID"]
CLIENT_SECRET = st.secrets["CLIENT_SECRET"]
REFRESH_TOKEN = st.secrets["REFRESH_TOKEN"]

AWS_ACCESS_KEY_ID = st.secrets["AWS_ACCESS_KEY_ID"]
AWS_SECRET_ACCESS_KEY = st.secrets["AWS_SECRET_ACCESS_KEY"]
AWS_ROLE_ARN = st.secrets["AWS_ROLE_ARN"]

AWS_REGION = st.secrets.get("AWS_REGION", "us-east-1")
MARKETPLACE_ID = st.secrets.get("MARKETPLACE_ID", "ATVPDKIKX0DER")
SP_API_HOST = st.secrets.get("SP_API_HOST", "sellingpartnerapi-na.amazon.com")

# ================== LWA ACCESS TOKEN ==================
def get_lwa_access_token() -> str:
    url = "https://api.amazon.com/auth/o2/token"
    data = {
        "grant_type": "refresh_token",
        "refresh_token": REFRESH_TOKEN,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }
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
