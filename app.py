import streamlit as st
import requests

st.title("High Focus Sourcing Tool")

asin = st.text_input("Enter ASIN")
cost = st.number_input("Your supplier cost ($)", min_value=0.0)

if st.button("Analyze Product"):

    client_id = st.secrets["CLIENT_ID"]
    client_secret = st.secrets["CLIENT_SECRET"]
    refresh_token = st.secrets["REFRESH_TOKEN"]

    # ---------- GET ACCESS TOKEN ----------
    token_response = requests.post(
        "https://api.amazon.com/auth/o2/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
        },
    )

    access_token = token_response.json().get("access_token")

    if not access_token:
        st.error("Amazon connection failed")
        st.stop()

    st.success("Amazon connected successfully")

    # TEMP display (real price next step)
    st.write("ASIN:", asin)
    st.write("Cost:", cost)
