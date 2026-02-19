import streamlit as st
import pandas as pd

st.set_page_config(page_title="High Focus Sourcing Tool", layout="wide")

st.title("High Focus Sourcing Tool")

st.markdown("### Upload Wholesaler Excel File")

uploaded_file = st.file_uploader("Upload Excel (.xlsx)", type=["xlsx"])

if uploaded_file:
    df = pd.read_excel(uploaded_file)

    st.success("File loaded successfully")

    st.markdown("### Preview of uploaded data")
    st.dataframe(df.head())

    # --- Detect ASIN column automatically ---
    asin_column = None
    for col in df.columns:
        if "asin" in col.lower():
            asin_column = col
            break

    if asin_column:
        st.markdown("### ASINs detected")
        asins = df[asin_column].dropna().astype(str).unique()

        st.write(f"Found **{len(asins)} ASINs**")
        st.dataframe(pd.DataFrame(asins, columns=["ASIN"]))

        st.info("Next step: connect Amazon price, rank, and profit analysis.")
    else:
        st.error("No ASIN column found in this file. Make sure the column name contains 'ASIN'.")
else:
    st.warning("Upload a wholesaler Excel file to begin.")
