import streamlit as st
import requests

st.set_page_config(page_title="High Focus Sourcing Tool", layout="centered")

st.title("High Focus Sourcing Tool")

asin = st.text_input("Enter ASIN")
cost = st.number_input("Your supplier cost ($)", min_value=0.0, step=0.01)

if st.button("Analyze Product"):

    if asin == "":
        st.error("Enter an ASIN first.")
    else:
        st.info("Connecting to Amazon...")

        # TEMP FAKE RESULT (next step will be real SP-API)
        sale_price = 25.00
        fees = 8.00
        profit = sale_price - fees - cost

        st.success("Analysis complete")

        st.write("ASIN:", asin)
        st.write("Amazon price:", sale_price)
        st.write("Estimated fees:", fees)
        st.write("Your cost:", cost)
        st.write("Net profit:", round(profit, 2))
