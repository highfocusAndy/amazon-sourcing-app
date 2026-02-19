import json
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
# UI
# =========================
APP_TITLE = "High Focus Sourcing Tool"
st.set_page_config(page_title=APP_TITLE, layout="wide")
st.title(APP_TITLE)


# =========================
# Secrets
# =========================
def sget(key: str) -> str:
    v = st.secrets.get(key)
    if v is None or str(v).strip() == "":
        st.error(f"Missing Streamlit Secret: {key}")
        st.stop()
    return str(v).strip()


CLIENT_ID = sget("CLIENT_ID")
CLIENT_SECRET = sget("CLIENT_SECRET")
REFRESH_TOKEN = sget("REFRESH_TOKEN")

AWS_ACCESS_KEY_ID = sget("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = sget("AWS_SECRET_ACCESS_KEY")
AWS_ROLE_ARN = sget("AWS_ROLE_ARN")
AWS_REGION = sget("AWS_REGION")

MARKETPLACE_ID = sget("MARKETPLACE_ID")
SP_API_HOST = sget("SP_API_HOST")


# =========================
# Auth helpers
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
        raise RuntimeError(f"LWA token error {r.status_code}: {r.text}")
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
    path: str,
    params: Optional[Dict[str, Any]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    max_retries: int = 4,
) -> Tuple[int, Dict[str, Any]]:
    """
    Signed SP-API call with retries.
    Returns (status_code, json_or_error_dict).
    """
    token = get_lwa_access_token(CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN)
    temp = assume_role_temp_creds(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ROLE_ARN, AWS_REGION)

    base_url = f"https://{SP_API_HOST}{path}"

    # Build URL with query string manually (stable)
    if params:
        q = "&".join([f"{k}={requests.utils.quote(str(v), safe='')}" for k, v in params.items() if v is not None])
        url = f"{base_url}?{q}"
    else:
        url = base_url

    body_str = json.dumps(json_body) if json_body is not None else None

    last_err = None
    for attempt in range(max_retries):
        try:
            headers = {
                "host": SP_API_HOST,
                "x-amz-access-token": token,
                "content-type": "application/json",
                "accept": "application/json",
                "user-agent": "highfocus-sourcing/1.0",
            }

            aws_req = AWSRequest(method=method.upper(), url=url, data=body_str, headers=headers)
            creds = Credentials(temp["AccessKeyId"], temp["SecretAccessKey"], temp["SessionToken"])
            SigV4Auth(creds, "execute-api", AWS_REGION).add_auth(aws_req)

            signed_headers = dict(aws_req.headers.items())
            r = requests.request(method.upper(), url, headers=signed_headers, data=body_str, timeout=45)

            if r.status_code in (429, 500, 503):
                time.sleep(1.2 * (attempt + 1))
                last_err = f"{r.status_code}: {r.text}"
                continue

            if r.text.strip() == "":
                return r.status_code, {}

            try:
                return r.status_code, r.json()
            except Exception:
                return r.status_code, {"raw": r.text}

        except Exception as e:
            last_err = str(e)
            time.sleep(1.2 * (attempt + 1))

    return 599, {"error": last_err or "unknown error"}


# =========================
# Column detection (universal)
# =========================
def norm_cols(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    return df


def digits_only(s: str) -> str:
    return "".join(ch for ch in s if ch.isdigit())


def clean_cell(x: Any) -> str:
    if x is None:
        return ""
    s = str(x).strip()
    if s.lower() == "nan":
        return ""
    # remove .0 from excel numeric-looking
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    return s.strip()


def detect_cost_col(df: pd.DataFrame) -> Optional[str]:
    keys = ["cost", "unit cost", "your cost", "wholesale", "net", "price", "cogs"]
    for c in df.columns:
        cl = c.lower()
        if any(k in cl for k in keys):
            return c
    return None


def detect_casepack_col(df: pd.DataFrame) -> Optional[str]:
    keys = ["case pack", "casepack", "pack", "case qty", "caseqty", "case quantity"]
    for c in df.columns:
        cl = c.lower()
        if any(k in cl for k in keys):
            return c
    return None


def detect_identifier_col(df: pd.DataFrame) -> Optional[str]:
    # 1) Name-based
    name_keys = ["asin", "upc", "ean", "gtin", "isbn", "barcode", "item code", "product code", "sku"]
    for c in df.columns:
        cl = c.lower()
        if any(k in cl for k in name_keys):
            return c

    # 2) Value-based heuristic
    best = None
    best_score = 0.0
    for c in df.columns:
        s = df[c].astype(str).str.strip()
        s = s[s.notna() & (s != "")]
        if len(s) == 0:
            continue
        sample = s.head(200)

        asin_like = sample.str.upper().str.match(r"^[A-Z0-9]{10}$").mean()

        d = sample.str.replace(r"\D", "", regex=True)
        digit_like = ((d.str.len() >= 11) & (d.str.len() <= 14)).mean()

        score = max(asin_like, digit_like)
        if score > best_score:
            best_score = score
            best = c

    return best


def recommend_ungate_units(case_pack: Optional[int]) -> int:
    base = 10
    if case_pack and case_pack > 0:
