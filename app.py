import streamlit as st
import pandas as pd
import math

st.set_page_config(page_title="High Focus Sourcing Tool", layout="wide")
st.title("High Focus Sourcing Tool")

st.subheader("Upload Wholesaler Excel File")

uploaded = st.file_uploader("Upload Excel (.xlsx)", type=["xlsx"])

if not uploaded:
    st.info("Upload a wholesaler Excel file to begin.")
    st.stop()

df = pd.read_excel(uploaded)

st.success("File loaded successfully")
st.dataframe(df.head(10), use_container_width=True)


def recommend_ungate_units(case_pack):
    base_units = 10
    if case_pack and case_pack > 0:
        cp = int(case_pack)
        cases_needed = math.ceil(base_units / cp)
        return cases_needed * cp
    return base_units


st.subheader("Test Ungate Logic")

case_input = st.number_input("Case pack example", value=12)

st.write("Recommended units:", recommend_ungate_units(case_input))
