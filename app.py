import streamlit as st

st.set_page_config(page_title="High Focus Sourcing Tool", layout="centered")

st.title("High Focus Sourcing Tool")

asin = st.text_input("Enter ASIN")
cost = st.number_input("Your supplier cost ($)", min_value=0.0, step=0.01)

if st.button("Analyze Product"):

    if asin == "":
        st.error("Enter an ASIN first.")
    else:
        st.success("App working correctly ✅")
        st.write("ASIN:", asin)
        st.write("Cost:", cost)
