import json
import requests
import streamlit as st
import boto3
from botocore.awsrequest import AWSRequest
from botocore.auth import SigV4Auth
from botocore.credentials import Credentials


st.set_page_config(page_title="High Focus Sourcing Tool", layout="centered")
st.title("High Focus Sourcing Tool")


CLIENT_ID = st.secrets["CLIENT_ID"]
CLIENT_SECRET = st.secrets["CLIENT_SECRET"]
REFRESH_TOKEN = st.secrets["REFRESH_TOKEN"]

AWS_ROLE_ARN = st.secrets["AWS_ROLE_ARN"]
AWS_REGION = st.secrets["AWS_REGION"]

MARKETPLACE_ID = st.secrets["MARKETPLACE_ID"]
SP_API_HOST = st.secrets["SP_API_HOST"]

SERVICE = "execute-api"


def get_lwa_access_token():
    url = "https://api.amazon.com/auth/o2/token"

    data = {
        "grant_type": "refresh_token",
        "refresh_token": REFRESH_TOKEN,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }

    r = requests.post(url, data=data, timeout=30)
    payload = r.json()

    if r.status_code != 200:
        raise Exception(f"LWA error: {payload}")

    return payload["access_token"]


def assume_role_credentials():
    sts = boto3.client("sts", region_name=AWS_REGION)

    resp = sts.assume_role(
        RoleArn=AWS_ROLE_ARN,
        RoleSessionName="spapi-session",
        DurationSeconds=3600,
    )

    c = resp["Credentials"]

    return Credentials(
        access_key=c["AccessKeyId"],
        secret_key=c["SecretAccessKey"],
        token=c["SessionToken"],
    )


def signed_request(path, query, lwa_token):
    creds = assume_role_credentials()

    base = f"https://{SP_API_HOST}"
    qs = "&".join([f"{k}={requests.utils.quote(str(v))}" for k, v in query.items()])
    url = f"{base}{path}?{qs}"

    headers = {
        "host": SP_API_HOST,
        "x-amz-access-token": lwa_token,
        "user-agent": "highfocus-tool",
        "accept": "application/json",
    }

    req = AWSRequest(method="GET", url=url, headers=headers)
    SigV4Auth(creds, SERVICE, AWS_REGION).add_auth(req)

    signed_headers = dict(req.headers)

    return requests.get(url, headers=signed_headers, timeout=30)


def get_price(asin):
    lwa = get_lwa_access_token()

    path = f"/products/pricing/v0/items/{asin}/offers"
    query = {
        "MarketplaceId": MARKETPLACE_ID,
        "ItemCondition": "New",
    }

    r = signed_request(path, query, lwa)

    if r.status_code != 200:
        raise Exception(r.text)

    data = r.json()

    offers = data.get("payload", {}).get("Offers", [])

    if not offers:
        return None

    price = offers[0]["ListingPrice"]["Amount"]
    return float(price)


asin = st.text_input("Enter ASIN")
cost = st.number_input("Your supplier cost ($)", min_value=0.0, step=0.01)


if st.button("Analyze Product"):

    try:
        price = get_price(asin)

        if price is None:
            st.warning("No offers found for this ASIN.")
        else:
            profit = price - cost

            st.success("Connected to Amazon successfully")
            st.write(f"Amazon price: **${price:.2f}**")
            st.write(f"Your cost: **${cost:.2f}**")
            st.write(f"Profit: **${profit:.2f}**")

    except Exception as e:
        st.error("Amazon connection failed")
        st.code(str(e))
