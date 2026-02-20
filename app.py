import json
import time
import re
from typing import Any, Dict, Optional, Tuple, List

import pandas as pd
import requests
import streamlit as st

from botocore.awsrequest import AWSRequest
from botocore.auth import SigV4Auth
from botocore.credentials import Credentials
from botocore.session import get_session


# ----------------------------
# Streamlit UI config
# ----------------------------
st.set_page_config(page_title="High Focus Sourcing Tool", layout="wide")
st.title("High Focus Sourcing Tool")


# ----------------------------
# Secrets helpers
# ----------------------------
def sget(key: str, required: bool = True) -> Optional[str]:
    val = st.secrets.get(key, None)
    if required and (val is None or str(val).strip() == ""):
        st.error(f"Missing secret: {key}")
        st.stop()
    return None if val is None else str(val).strip()


CLIENT_ID = sget("CLIENT_ID")
CLIENT_SECRET = sget("CLIENT_SECRET")
REFRESH_TOKEN = sget("REFRESH_TOKEN")

AWS_ACCESS_KEY_ID = sget("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = sget("AWS_SECRET_ACCESS_KEY")
AWS_ROLE_ARN = sget("AWS_ROLE_ARN")
AWS_REGION = sget("AWS_REGION")
MARKETPLACE_ID = sget("MARKETPLACE_ID")
SP_API_HOST = sget("SP_API_HOST")  # e.g. sellingpartnerapi-na.amazon.com


# ----------------------------
# Auth: LWA + STS AssumeRole (NO boto3)
# ----------------------------
@st.cache_data(ttl=50 * 60, show_spinner=False)  # cache 50 minutes
def get_lwa_access_token() -> str:
    url = "https://api.amazon.com/auth/o2/token"
    payload = {
        "grant_type": "refresh_token",
        "refresh_token": REFRESH_TOKEN,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }
    r = requests.post(url, data=payload, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"LWA token error {r.status_code}: {r.text}")
    return r.json()["access_token"]


@st.cache_data(ttl=50 * 60, show_spinner=False)  # cache 50 minutes
def assume_role_credentials() -> Credentials:
    session = get_session()
    sts = session.create_client(
        "sts",
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    )
    resp = sts.assume_role(RoleArn=AWS_ROLE_ARN, RoleSessionName="spapi-streamlit")
    c = resp["Credentials"]
    return Credentials(
        access_key=c["AccessKeyId"],
        secret_key=c["SecretAccessKey"],
        token=c["SessionToken"],
    )


def sigv4_request(
    method: str,
    url: str,
    region: str,
    service: str,
    credentials: Credentials,
    headers: Dict[str, str],
    params: Optional[Dict[str, Any]] = None,
    data: Optional[str] = None,
) -> requests.Response:
    req = AWSRequest(method=method, url=url, data=data, params=params, headers=headers)
    SigV4Auth(credentials, service, region).add_auth(req)
    prepared = req.prepare()

    return requests.request(
        method=method,
        url=prepared.url,
        headers=dict(prepared.headers),
        data=prepared.body,
        timeout=45,
    )


def sp_api_get(path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    token = get_lwa_access_token()
    creds = assume_role_credentials()

    url = f"https://{SP_API_HOST}{path}"
    headers = {
        "host": SP_API_HOST,
        "x-amz-access-token": token,
        "content-type": "application/json",
    }

    resp = sigv4_request(
        method="GET",
        url=url,
        region=AWS_REGION,
        service="execute-api",
        credentials=creds,
        headers=headers,
        params=params,
        data=None,
    )

    try:
        j = resp.json()
    except Exception:
        raise RuntimeError(f"SP-API non-JSON response {resp.status_code}: {resp.text}")

    if resp.status_code >= 400:
        raise RuntimeError(f"SP-API error {resp.status_code}: {json.dumps(j, indent=2)}")

    return j


# ----------------------------
# Identifier detection
# ----------------------------
ASIN_RE = re.compile(r"^[A-Z0-9]{10}$", re.I)
DIGITS_RE = re.compile(r"^\d{11,14}$")  # UPC(12)/EAN(13)/GTIN-14 etc.


def normalize_identifier(x: Any) -> str:
    if x is None:
        return ""
    s = str(x).strip()
    s = s.replace("\u200b", "")
    return s


def identify_type(identifier: str) -> Tuple[str, str]:
    """
    returns (id_type, normalized)
    id_type in {"ASIN","UPC"}
    """
    s = normalize_identifier(identifier).upper()
    if ASIN_RE.match(s):
        return "ASIN", s
    d = re.sub(r"\D", "", s)
    if DIGITS_RE.match(d):
        return "UPC", d
    return "UNKNOWN", s


# ----------------------------
# SP-API data fetchers
# ----------------------------
def fetch_catalog_by_asin(asin: str) -> Dict[str, Any]:
    path = f"/catalog/2022-04-01/items/{asin}"
    params = {
        "marketplaceIds": MARKETPLACE_ID,
        "includedData": "attributes,identifiers,productTypes,salesRanks,images,summaries",
    }
    return sp_api_get(path, params=params)


def fetch_catalog_by_upc(upc: str) -> Optional[Dict[str, Any]]:
    # Search endpoint:
    # /catalog/2022-04-01/items?identifiersType=UPC&identifiers=...&marketplaceIds=...
    path = "/catalog/2022-04-01/items"
    params = {
        "marketplaceIds": MARKETPLACE_ID,
        "identifiersType": "UPC",
        "identifiers": upc,
        "includedData": "summaries,salesRanks",
    }
    j = sp_api_get(path, params=params)
    items = j.get("items") or []
    if not items:
        return None
    return items[0]


def fetch_offers(asin: str) -> Dict[str, Any]:
    # Pricing offers endpoint:
    # /products/pricing/v0/items/{asin}/offers?MarketplaceId=...&ItemCondition=New
    path = f"/products/pricing/v0/items/{asin}/offers"
    params = {"MarketplaceId": MARKETPLACE_ID, "ItemCondition": "New"}
    return sp_api_get(path, params=params)


def parse_catalog_basic(catalog_json: Dict[str, Any]) -> Dict[str, Any]:
    out = {"title": None, "brand": None, "sales_rank": None, "asin": None}

    # When searching by UPC, result shape differs a bit (item already contains asin)
    asin = catalog_json.get("asin") or catalog_json.get("identifiers", {}).get("marketplaceASIN", {}).get("asin")
    out["asin"] = asin

    summaries = catalog_json.get("summaries") or []
    if summaries:
        s0 = summaries[0]
        out["title"] = s0.get("itemName") or s0.get("itemNameByMarketplace") or s0.get("itemName")
        out["brand"] = s0.get("brandName")

    # salesRanks can be nested differently
    ranks = catalog_json.get("salesRanks") or []
    # try common pattern
    if ranks:
        # pick first rank
        try:
            r0 = ranks[0]
            # sometimes it’s: {"classificationRanks":[{"rank":123,"title":"..."}]}
            cr = r0.get("classificationRanks") or r0.get("displayGroupRanks") or []
            if cr:
                out["sales_rank"] = cr[0].get("rank")
        except Exception:
            pass

    return out


def parse_offers_basic(offers_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    returns: lowest_price, currency, offer_count, amazon_on_listing(bool)
    """
    payload = offers_json.get("payload") or {}
    summaries = payload.get("Summary") or {}
    offers = payload.get("Offers") or []

    offer_count = len(offers)
    lowest = None
    currency = None
    amazon_on = False

    for off in offers:
        # sellerId present
        sid = (off.get("SellerId") or "").strip()
        if sid == "ATVPDKIKX0DER":
            amazon_on = True

        lp = off.get("ListingPrice") or {}
        ap = off.get("Shipping") or {}
        try:
            listing = float(lp.get("Amount")) if lp.get("Amount") is not None else None
            ship = float(ap.get("Amount")) if ap.get("Amount") is not None else 0.0
            total = None if listing is None else listing + ship
            if total is not None:
                if lowest is None or total < lowest:
                    lowest = total
                    currency = lp.get("CurrencyCode") or currency
        except Exception:
            continue

    # fallback from summary if no offers parsed
    if lowest is None:
        try:
            low = summaries.get("LowestPrices") or []
            if low:
                lp = low[0].get("LandedPrice") or {}
                lowest = float(lp.get("Amount"))
                currency = lp.get("CurrencyCode")
        except Exception:
            pass

    return {
        "lowest_price": lowest,
        "currency": currency,
        "offer_count": offer_count,
        "amazon_on_listing": amazon_on,
    }


def analyze_identifier(identifier: str, supplier_cost: float) -> Dict[str, Any]:
    id_type, norm = identify_type(identifier)
    result: Dict[str, Any] = {
        "input_id": identifier,
        "id_type": id_type,
        "asin": None,
        "title": None,
        "brand": None,
        "sales_rank": None,
        "amazon_price": None,
        "currency": None,
        "offer_count": None,
        "amazon_on_listing": None,
        "supplier_cost": supplier_cost,
        "profit": None,
        "status": "OK",
        "error": None,
    }

    try:
        if id_type == "ASIN":
            cat = fetch_catalog_by_asin(norm)
            basic = parse_catalog_basic(cat)
            asin = basic.get("asin") or norm
            result.update(basic)
            result["asin"] = asin

        elif id_type == "UPC":
            cat_item = fetch_catalog_by_upc(norm)
            if not cat_item:
                result["status"] = "NOT_FOUND"
                return result
            basic = parse_catalog_basic(cat_item)
            asin = basic.get("asin")
            result.update(basic)
            result["asin"] = asin

        else:
            result["status"] = "INVALID_ID"
            return result

        if not result["asin"]:
            result["status"] = "NO_ASIN"
            return result

        off = fetch_offers(result["asin"])
        ob = parse_offers_basic(off)
        result.update(ob)

        if result["lowest_price"] is not None:
            result["amazon_price"] = result.pop("lowest_price")

        if result["amazon_price"] is not None:
            result["profit"] = round(float(result["amazon_price"]) - float(supplier_cost), 2)

        return result

    except Exception as e:
        result["status"] = "ERROR"
        result["error"] = str(e)
        return result


# ----------------------------
# Excel column detection (universal-ish)
# ----------------------------
def find_column(df: pd.DataFrame, keywords: List[str]) -> Optional[str]:
    cols = list(df.columns)
    for c in cols:
        cl = str(c).strip().lower()
        for k in keywords:
            if k in cl:
                return c
    return None


def guess_identifier_column(df: pd.DataFrame) -> Optional[str]:
    # 1) name-based
    col = find_column(df, ["asin", "upc", "ean", "gtin", "barcode", "item upc", "unit upc"])
    if col is not None:
        return col

    # 2) value-based: find first column that looks like ASIN or UPC often
    best = None
    best_score = 0.0
    for c in df.columns:
        s = df[c].astype(str).str.strip()
        s = s[s.notna() & (s != "")]
        if len(s) == 0:
            continue
        sample = s.head(200)

        asin_like = sample.str.upper().str.match(ASIN_RE).mean()
        digits = sample.str.replace(r"\D", "", regex=True)
        upc_like = digits.str.match(DIGITS_RE).mean()

        score = max(asin_like, upc_like)
        if score > best_score:
            best_score = score
            best = c

    # require at least some confidence
    if best_score < 0.10:
        return None
    return best


def guess_cost_column(df: pd.DataFrame) -> Optional[str]:
    col = find_column(df, ["cost", "unit cost", "cost per", "price", "wholesale", "your cost"])
    return col


# ----------------------------
# UI: Tabs for Single + Excel
# ----------------------------
tab1, tab2 = st.tabs(["Single ASIN / UPC", "Upload Excel (.xlsx)"])

with tab1:
    st.subheader("Single Product Analyzer")
    c1, c2 = st.columns([2, 1])
    with c1:
        identifier = st.text_input("Enter ASIN or UPC/EAN/GTIN", value="")
    with c2:
        supplier_cost = st.number_input("Your supplier cost ($)", min_value=0.0, value=0.0, step=0.01)

    if st.button("Analyze Single Product", type="primary"):
        if not identifier.strip():
            st.error("Enter an ASIN or UPC.")
        else:
            with st.spinner("Analyzing via Amazon SP-API..."):
                res = analyze_identifier(identifier.strip(), float(supplier_cost))

            if res["status"] == "OK":
                st.success("Done")
            elif res["status"] in ("INVALID_ID", "NOT_FOUND", "NO_ASIN"):
                st.warning(f"Result: {res['status']}")
            else:
                st.error("Error while analyzing")

            st.json(res)

with tab2:
    st.subheader("Upload Wholesaler Excel File (.xlsx)")
    uploaded = st.file_uploader("Upload Excel (.xlsx)", type=["xlsx"])

    roi_min = st.number_input("Minimum ROI (profit/cost)", min_value=0.0, value=0.30, step=0.05)
    max_rows = st.slider("Max rows to analyze (rate-limit safe)", min_value=5, max_value=200, value=30, step=5)

    if uploaded is not None:
        try:
            df = pd.read_excel(uploaded)
        except Exception as e:
            st.error(f"Could not read Excel: {e}")
            st.stop()

        st.caption("Preview of uploaded data")
        st.dataframe(df.head(20), use_container_width=True)

        id_col = guess_identifier_column(df)
        cost_col = guess_cost_column(df)

        if id_col is None:
            st.error("No identifier column found (ASIN/UPC/EAN/GTIN). Your file must contain at least one identifier column.")
            st.stop()

        if cost_col is None:
            st.warning("No cost column detected. Profit will use $0 unless you add a cost column in the file.")
            df["_supplier_cost"] = 0.0
            cost_col = "_supplier_cost"

        st.info(f"Using Identifier column: **{id_col}** | Cost column: **{cost_col}**")

        run = st.button("Analyze Excel File", type="primary")
        if run:
            work = df.copy()

            work[id_col] = work[id_col].apply(normalize_identifier)
            work[cost_col] = pd.to_numeric(work[cost_col], errors="coerce").fillna(0.0)

            work = work[work[id_col].astype(str).str.strip() != ""].head(int(max_rows))

            results: List[Dict[str, Any]] = []
            prog = st.progress(0)
            status = st.empty()

            for i, row in enumerate(work.itertuples(index=False), start=1):
                ident = str(getattr(row, str(id_col))).strip()
                cost = float(getattr(row, str(cost_col)))
                status.write(f"Analyzing {i}/{len(work)}: {ident}")
                r = analyze_identifier(ident, cost)
                results.append(r)
                prog.progress(int(i / len(work) * 100))
                time.sleep(0.2)  # gentle pacing

            out = pd.DataFrame(results)

            # compute ROI
            def safe_roi(p, c):
                try:
                    c = float(c)
                    p = float(p)
                    if c <= 0:
                        return None
                    return round(p / c, 3)
                except Exception:
                    return None

            out["roi"] = out.apply(lambda x: safe_roi(x.get("profit"), x.get("supplier_cost")), axis=1)

            st.subheader("All analyzed results")
            st.dataframe(out, use_container_width=True)

            # BUY LIST: profitable and ROI >= roi_min and found
            buy = out[
                (out["status"] == "OK")
                & (out["profit"].notna())
                & (out["profit"] > 0)
                & (out["roi"].notna())
                & (out["roi"] >= float(roi_min))
            ].copy()

            buy = buy.sort_values(by=["profit", "roi"], ascending=[False, False])

            st.subheader("Buy List (Profitable)")
            if len(buy) == 0:
                st.warning("No profitable items found with your ROI filter.")
            else:
                st.dataframe(buy, use_container_width=True)

            # download
            csv = buy.to_csv(index=False).encode("utf-8")
            st.download_button(
                "Download Buy List CSV",
                data=csv,
                file_name="buy_list.csv",
                mime="text/csv",
            )
