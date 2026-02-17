import re
import pandas as pd
import streamlit as st

st.set_page_config(page_title="Amazon Sourcing App", layout="wide")
st.title("Amazon Sourcing App")

tab1, tab2 = st.tabs(["Single ASIN", "Excel Upload (Universal)"])

# ---------- Helpers ----------
def clean_upc(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    s = re.sub(r"\D", "", str(value))
    return s.strip()

def clean_asin(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    s = str(value).strip().upper()
    # ASIN is usually 10 chars (letters+numbers). We'll just keep alphanumerics.
    s = re.sub(r"[^A-Z0-9]", "", s)
    return s

def to_number(value):
    try:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None
        s = str(value)
        s = s.replace("$", "").replace(",", "").strip()
        return float(s)
    except Exception:
        return None

def normalize_columns(cols):
    # for matching: lower, remove spaces/symbols
    return {c: re.sub(r"[^a-z0-9]", "", str(c).lower()) for c in cols}

# ---------- Tab 1: Single ASIN ----------
with tab1:
    st.subheader("Single ASIN Checker (MVP)")
    asin = st.text_input("Enter ASIN", placeholder="B0XXXXXXXXX")
    cost = st.number_input("Your cost ($)", min_value=0.0, value=0.0, step=0.1)

    if asin:
        asin_clean = clean_asin(asin)
        if len(asin_clean) < 8:
            st.error("That doesn't look like an ASIN. ASIN is usually 10 characters.")
        else:
            st.success(f"ASIN: {asin_clean}")
            st.write(f"Cost: ${cost:,.2f}")
            st.info("Next step: connect Amazon SP-API to pull price + fees + eligibility and decide BUY/UNGATE/SKIP.")

# ---------- Tab 2: Universal Excel Upload ----------
with tab2:
    st.subheader("Upload any supplier Excel (.xlsx)")
    st.caption("Universal mode: you choose which columns mean UPC/ASIN/Cost/Pack/Title. Works for any supplier file.")

    uploaded = st.file_uploader("Upload Excel file", type=["xlsx"])

    if uploaded:
        # Load: try sheet 0 by default
        df = pd.read_excel(uploaded, sheet_name=0)
        df = df.dropna(how="all")
        df.columns = [str(c).strip() for c in df.columns]

        st.write("Raw preview")
        st.dataframe(df.head(25), use_container_width=True)

        st.divider()
        st.subheader("Map your columns")

        cols = ["(none)"] + list(df.columns)
        col_norm = normalize_columns(df.columns)

        # Smart guesses
        def guess_col(keys):
            for original, normed in col_norm.items():
                for k in keys:
                    if k in normed:
                        return original
            return "(none)"

        guess_upc  = guess_col(["upc", "barcode", "ean", "gtin"])
        guess_asin = guess_col(["asin"])
        guess_cost = guess_col(["cost", "unitcost", "price", "wholesale"])
        guess_pack = guess_col(["casepack", "pack", "qty", "quantity"])
        guess_title = guess_col(["title", "description", "product", "name", "item"])

        c1, c2, c3 = st.columns(3)
        with c1:
            upc_col = st.selectbox("UPC / Barcode column", cols, index=cols.index(guess_upc) if guess_upc in cols else 0)
            asin_col = st.selectbox("ASIN column (optional)", cols, index=cols.index(guess_asin) if guess_asin in cols else 0)
        with c2:
            cost_col = st.selectbox("Unit cost column", cols, index=cols.index(guess_cost) if guess_cost in cols else 0)
            pack_col = st.selectbox("Case pack / Qty column (optional)", cols, index=cols.index(guess_pack) if guess_pack in cols else 0)
        with c3:
            title_col = st.selectbox("Title / Description column (optional)", cols, index=cols.index(guess_title) if guess_title in cols else 0)

        st.divider()
        st.subheader("Output settings")
        default_roi = st.number_input("Minimum ROI % (for later decision rules)", min_value=0.0, value=30.0, step=5.0)
        default_profit = st.number_input("Minimum Profit $ (for later decision rules)", min_value=0.0, value=3.0, step=1.0)

        if st.button("Build cleaned table", type="primary"):
            out = pd.DataFrame()

            if title_col != "(none)":
                out["title"] = df[title_col].astype(str).str.strip()
            else:
                out["title"] = ""

            if upc_col != "(none)":
                out["upc"] = df[upc_col].apply(clean_upc)
            else:
                out["upc"] = ""

            if asin_col != "(none)":
                out["asin"] = df[asin_col].apply(clean_asin)
            else:
                out["asin"] = ""

            if cost_col != "(none)":
                out["unit_cost"] = df[cost_col].apply(to_number)
            else:
                out["unit_cost"] = None

            if pack_col != "(none)":
                out["case_pack"] = df[pack_col].apply(to_number)
            else:
                out["case_pack"] = None

            # Compute case cost if possible
            out["case_cost"] = None
            if "unit_cost" in out.columns:
                out["case_cost"] = out.apply(
                    lambda r: (r["unit_cost"] * r["case_pack"]) if (r.get("unit_cost") is not None and r.get("case_pack") not in [None, 0]) else None,
                    axis=1
                )

            # Basic cleanup
            out = out.dropna(how="all")
            out["upc"] = out["upc"].fillna("")
            out["asin"] = out["asin"].fillna("")
            out["title"] = out["title"].fillna("")

            # Remove rows with no identifier
            out = out[(out["upc"] != "") | (out["asin"] != "") | (out["title"] != "")].copy()

            st.success("Cleaned table created")
            st.dataframe(out.head(100), use_container_width=True)

            # Download
            out_file = "cleaned_universal_catalog.xlsx"
            out.to_excel(out_file, index=False)

            with open(out_file, "rb") as f:
                st.download_button(
                    "Download cleaned Excel",
                    data=f,
                    file_name=out_file,
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                )

            st.info(f"Saved your thresholds for later: ROI >= {default_roi:.0f}% and Profit >= ${default_profit:.0f}. Next step: Amazon SP-API to compute price/fees/eligibility.")
