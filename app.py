import streamlit as st
import requests
import datetime
import hashlib
import hmac
import json

# ================= PAGE =================
st.set_page_config(page_title="High Focus Sourcing Tool", layout="centered")
st.title("High Focus Sourcing Tool")

asin = st.text_input("Enter ASIN")
cost = st.number_input("Your supplier cost ($)", min_value=0.0, step=0.01)

# ================= AMAZON SECRETS =================
CLIENT_ID = st.secrets["CLIENT_ID"]
CLIENT_SECRET = st.secrets["CLIENT_SECRET"]
REFRESH_TOKEN = st.secrets["REFRESH_TOKEN"]

AWS_ACCESS_KEY = st.secrets["AWS_ACCESS_KEY_ID"]
AWS_SECRET_KEY = st.secrets["AWS_SECRET_ACCESS_KEY"]
AWS_ROLE_ARN = st.secrets["AWS_ROLE_ARN"]

AWS_REGION = "us-east-1"
SERVICE = "execute-api"
HOST = "sellingpartnerapi-na.amazon.com"
ENDPOINT = "https://sellingpartnerapi-na.amazon.com"

MARKETPLACE_ID = "ATVPDKIKX0DER"  # USA

# ================= GET ACCESS TOKEN =================
def get_access_token():
    url = "https://api.amazon.com/auth/o2/token"

    data = {
        "grant_type": "refresh_token",
        "refresh_token": REFRESH_TOKEN,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }

    r = requests.post(url, data=data)
    return r.json()["access_token"]


# ================= SIGN REQUEST =================
def sign(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def get_signature_key(key, date_stamp, region_name, service_name):
    k_date = sign(("AWS4" + key).encode("utf-8"), date_stamp)
    k_region = sign(k_date, region_name)
    k_service = sign(k_region, service_name)
    k_signing = sign(k_service, "aws4_request")
    return k_signing


# ================= GET AMAZON PRICE =================
def get_product_price(asin):
    access_token = get_access_token()

    method = "GET"
    canonical_uri = f"/products/pricing/v0/items/{asin}/offers"
    canonical_querystring = f"MarketplaceId={MARKETPLACE_ID}&ItemCondition=New"

    t = datetime.datetime.utcnow()
    amz_date = t.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = t.strftime("%Y%m%d")

    canonical_headers = (
        f"host:{HOST}\n"
        f"x-amz-access-token:{access_token}\n"
        f"x-amz-date:{amz_date}\n"
    )

    signed_headers = "host;x-amz-access-token;x-amz-date"
    payload_hash = hashlib.sha256(("").encode("utf-8")).hexdigest()

    canonical_request = (
        method
        + "\n"
        + canonical_uri
        + "\n"
        + canonical_querystring
        + "\n"
        + canonical_headers
        + "\n"
        + signed_headers
        + "\n"
        + payload_hash
    )

    algorithm = "AWS4-HMAC-SHA256"
    credential_scope = f"{date_stamp}/{AWS_REGION}/{SERVICE}/aws4_request"

    string_to_sign = (
        algorithm
        + "\n"
        + amz_date
        + "\n"
        + credential_scope
        + "\n"
        + hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
    )

    signing_key = get_signature_key(AWS_SECRET_KEY, date_stamp, AWS_REGION, SERVICE)

    signature = hmac.new(
        signing_key, string_to_sign.encode("utf-8"), hashlib.sha256
    ).hexdigest()

    authorization_header = (
        f"{algorithm} Credential={AWS_ACCESS_KEY}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )

    headers = {
        "x-amz-access-token": access_token,
        "x-amz-date": amz_date,
        "Authorization": authorization_header,
    }

    url = ENDPOINT + canonical_uri + "?" + canonical_querystring
    r = requests.get(url, headers=headers)

    data = r.json()

    try:
        price = data["payload"]["Offers"][0]["ListingPrice"]["Amount"]
        return price
    except:
        return None


# ================= BUTTON =================
if st.button("Analyze Product"):

    if asin == "":
        st.error("Enter an ASIN first.")
    else:
        with st.spinner("Connecting to Amazon..."):
            price = get_product_price(asin)

        if price is None:
            st.error("Could not fetch Amazon price.")
        else:
            fees = price * 0.15  # simple estimate
            profit = price - fees - cost

            st.success("Analysis complete")

            st.write(f"**ASIN:** {asin}")
            st.write(f"**Amazon price:** ${price:.2f}")
            st.write(f"**Estimated fees:** ${fees:.2f}")
            st.write(f"**Your cost:** ${cost:.2f}")
            st.write(f"**Net profit:** ${profit:.2f}")
