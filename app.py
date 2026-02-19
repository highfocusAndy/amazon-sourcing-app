import json import time from typing import Dict, Any, Optional, List

import pandas as pd import requests import streamlit as st import boto3 from botocore.awsrequest import AWSRequest from botocore.auth import SigV4Auth from botocore.credentials import Credentials

--------------------------------------------------

UI CONFIG

--------------------------------------------------

st.set_page_config(page_title="High Focus Sourcing Tool", layout="centered") st.title("High Focus Sourcing Tool")

--------------------------------------------------

SECRETS HELPER

--------------------------------------------------

def sget(key: str) -> Optional[str]: val = st.secrets.get(key) if val is None or str(val).strip() == "": st.error(f"Missing secret: {key}") st.stop() return str(val)

CLIENT_ID = sget("CLIENT_ID") CLIENT_SECRET = sget("CLIENT_SECRET") REFRESH_TOKEN = sget("REFRESH_TOKEN") AWS_ACCESS_KEY_ID = sget("AWS_ACCESS_KEY_ID") AWS_SECRET_ACCESS_KEY = sget("AWS_SECRET_ACCESS_KEY") AWS_ROLE_ARN = sget("AWS_ROLE_ARN") AWS_REGION = sget("AWS_REGION") MARKETPLACE_ID = sget("MARKETPLACE_ID") SP_API_HOST = sget("SP_API_HOST")

--------------------------------------------------

AUTH HELPERS

--------------------------------------------------

def get_lwa_token() -> str: url = "https://api.amazon.com/auth/o2/token" payload = { "grant_type": "refresh_token", "refresh_token": REFRESH_TOKEN, "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET, }

r = requests.post(url, data=payload, timeout=30)
r.raise_for_status()
return r.json()["access_token"]

def assume_role() -> Credentials: sts = boto3.client( "sts", aws_access_key_id=AWS_ACCESS_KEY_ID, aws_secret_access_key=AWS_SECRET_ACCESS_KEY, region_name=AWS_REGION, )

resp = sts.assume_role(RoleArn=AWS_ROLE_ARN, RoleSessionName="hf-session")
c = resp["Credentials"]

return Credentials(c["AccessKeyId"], c["SecretAccessKey"], c["SessionToken"])

--------------------------------------------------

AMAZON REQUEST

--------------------------------------------------

def sp_api_get(path: str, params: Dict[str, Any]) -> Dict[str, Any]: token = get_lwa_token() creds = assume_role()

url = f"https://{SP_API_HOST}{path}"

req = AWSRequest(method="GET", url=url, params=params, headers={"x-amz-access-token": token})

SigV4Auth(creds, "execute-api", AWS_REGION).add_auth(req)

session = requests.Session()
prepped = req.prepare()

resp = session.send(prepped, timeout=30)

if resp.status_code != 200:
    return {"error": resp.text}

return resp.json()

--------------------------------------------------

PRODUCT LOOKUP

--------------------------------------------------

def find_asin_from_upc(upc: str) -> Optional[str]: data = sp_api_get( "/catalog/2022-04-01/items", {"identifiers": upc, "identifiersType": "UPC",
