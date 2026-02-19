import streamlit as st
import pandas as pd

st.set_page_config(page_title="High Focus Sourcing Tool", layout="wide")

st.title("High Focus Sourcing Tool")

st.markdown("### Upload Wholesaler Excel File")

uploaded_file = st.file_uploader("Upload Excel (.xlsx)", type=["xlsx"])

if uploaded_file:
    df = pd.read_excel(uploaded_file)

    st.success("File loaded successfully")

    st.markdown("### Preview")
    st.dataframe(df.head())

    st.markdown("### Next step")
    st.info("Amazon analysis engine will be connected next.")
else:
    st.warning("Upload a wholesaler Excel file to begin.")
