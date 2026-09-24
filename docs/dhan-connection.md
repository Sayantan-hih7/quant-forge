# Dhan data connection

In **Connections & Data**, use **Connect Dhan** to log in, or **Paste token or login code** to finish a login manually. The paste form accepts a full JWT access token from Dhan Web, a `tokenId`, or the full redirect URL containing that code. It extracts URLs locally and never fetches the pasted host. API keys and secrets belong only in backend configuration.

Dhan's [authentication flow](https://dhanhq.co/docs/v2/authentication/) returns a temporary login code, which must be exchanged through `consumeApp-consent` before calling the data API. If your app registration still redirects to an earlier project, copy the final browser address and paste it in this form. For automatic completion, set the registered redirect to the running frontend's `/connections/dhan/callback` route. The provider checks code expiry and application ownership; a local ten-minute UI timer does not invalidate a usable login result.

The backend verifies the resulting access token using the read-only profile endpoint, checks the configured client ID and expiry, then stores it encrypted. Both Dhan's `DD/MM/YYYY HH:mm` profile dates and ISO consent dates are parsed explicitly in IST (unless an explicit offset is present). Rejected credentials do not replace a working session. API responses contain connection status, expiry and subscription status, never the token. Provider errors are sanitized before reaching the UI.

Connecting authorizes data access only. It does not import the full stock universe's history or execute broker orders. Historical candles and company metrics can be downloaded using the existing import controls after the connection is verified.

To avoid reconnecting every day, use **Set up automatic renewal** with an Access Token generated in Dhan Web. The running backend renews it 30 minutes before expiry. OAuth login codes/redirect tokens cannot use this renewal endpoint, and a token that expires while the backend is off needs a fresh connection. See [automatic renewal](dhan-auto-renewal.md).
