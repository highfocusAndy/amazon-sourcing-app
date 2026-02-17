import streamlit as st
import pandas as pd
import re

st.set_page_config(page_title="Amazon Sourcing App", layout="wide")

st.title("Amazon Sourcing App")

tab1, tab2 = st.tabs(["Single ASIN", "Excel Upload"])

def clean_upc(x):
    if pd.isna(x):
        return None
    s = re.sub(r"\D", "", str(x))
    return s if s else None

# -------- Single ASIN TAB --------
with tab1:
    st.subheader("Single ASIN Checker")

    asin = st.text_input("Enter ASIN")
    cost = st.number_input("Your cost ($)", min_value=0.0, value=0.0)

    if asin:
        st.success(f"ASIN entered: {asin}")
        st.write(f"Cost: ${cost}")
        st.info("Next step: connect Amazon SP-API to get price, fees, and profit.")

# -------- Excel Upload TAB --------
with tab2:
    st.subheader("Upload Supplier Excel")

    file = st.file_uploader("Upload Excel file", type=["xlsx"])

    if file:
        df = pd.read_excel(file)

        # Clean UPC if exists
        if "UPC" in df.columns:
            df["UPC"] = df["UPC"].apply(clean_upc)

        st.write("Preview of data:")
        st.dataframe(df.head(50))

        st.success("Excel loaded successfully.")
