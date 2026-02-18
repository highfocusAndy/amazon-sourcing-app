import streamlit as st

st.set_page_config(page_title="High Focus Sourcing Tool", layout="centered")

st.title("High Focus Sourcing Tool")

asin = st.text_input("Enter ASIN")
cost = st.number_input("Your supplier cost ($)", min_value=0.0, step=0.01)

if st.button("Analyze Product"):

    if asin == "":
        st.error("Enter an ASIN first.")
    else:
        st.success("Amazon connection test successful ✅")

        st.write("ASIN entered:", asin)
        st.write("Your cost:", cost)

        # NEXT STEP:
        # Here we will call Amazon SP-API
        st.info("Next step = connect to Amazon API and calculate profit.")
