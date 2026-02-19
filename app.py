import json
import requests
import streamlit as st
import boto3
from botocore.awsrequest import AWSRequest
from botocore.auth import SigV4Auth
from botocore.credentials import Credentials

st.set_page_config(page_title="High Focus Sourcing Tool", layout="centered")
st.title("High Focus Sourcing Tool")


def get_secret(key: str):
    if key not in st.secrets:
        st.error(f"Missing secret: {key}")
        st.stop()
    return st.secrets[key]


CLIENT_ID = get_secret("CLIENT_ID")
CLIENT_SECRET = get_secret("CLIENT_SECRET")
REFRESH_TOKEN = get_secret("REFRESH_TOKEN")

AWS_ACCESS_KEY_ID = get_secret("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = get_secret("AWS_SECRET_ACCESS_KEY")
AWS_ROLE_ARN = get_secret("AWS_ROLE_ARN")
AWS_REGION = get_secret("AWS_REGION")

MARKETPLACE_ID = get_secret("MARKETPLACE_ID")
SP_API_HOST = get_secret("SP_API_HOST")


def get_lwa_access_token():
    url = "https://api.amazon.com/auth/o2/token"
    data = {
        "grant_type": "refresh_token",
        "refresh_token": REFRESH_TOKEN,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }
    r = requests.post(url, data=data)
    return r.json()["access_token"]


def assume_role():
    sts = boto3.client(
        "sts",
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION,
    )

    role = sts.assume_role(RoleArn=AWS_ROLE_ARN, RoleSessionName="spapi-session")

    creds = role["Credentials"]

    return Credentials(
        access_key=creds["AccessKeyId"],
        secret_key=creds["SecretAccessKey"],
        token=creds["SessionToken"],
    )


def get_price(asin: str):
    token = get_lwa_access_token()
    creds = assume_role()

    url = f"https://{SP_API_HOST}/products/pricing/v0/items/{asin}/offers"
    params = {"MarketplaceId": MARKETPLACE_ID}

    request = AWSRequest(method="GET", url=url, params=params)
    request.headers["x-amz-access-token"] = token
    request.headers["host"] = SP_API_HOST

    SigV4Auth(creds, "execute-api", AWS_REGION).add_auth(request)

    session = requests.Session()
    response = session.send(request.prepare())

    data = response.json()

    try:
        return float(
            data["payload"]["Offers"][0]["ListingPrice"]["Amount"]
        )
    except:
        return None


asin = st.text_input("Enter ASIN")
cost = st.number_input("Your supplier cost ($)", min_value=0.0, step=0.01)

if st.button("Analyze Product"):
    if not asin:
        st.error("Enter an ASIN")
        st.stop()

    price = get_price(asin)

    if price is None:
        st.error("Could not fetch price")
    else:
        profit = price - cost

        st.success("Connected to Amazon successfully")
        st.write(f"Amazon price: ${price:.2f}")
        st.write(f"Your cost: ${cost:.2f}")
        st.write(f"Profit: ${profit:.2f}")
