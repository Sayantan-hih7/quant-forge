# Dhan automatic renewal

In **Connections & Data → Dhan → Set up automatic renewal**, paste an **Access Token generated in Dhan Web**, leave automatic renewal on and select **Verify and connect**.

Dhan Web: **My Profile → Access DhanHQ APIs → Generate Access Token**. A tokenId or URL copied after **Connect Dhan** is an OAuth login result and is not eligible. Existing saved tokens are not silently assumed to be renewable.

The API process checks once a minute, including on startup. It renews eligible tokens 30 minutes before their actual expiry, independently of history imports and qualification scans. Dhan replaces the old token with a new 24-hour token. Each data request reads the saved token; no restart or environment-file update is needed.

The backend and internet connection must remain available. An expired token cannot be renewed; after missing expiry, paste a fresh Dhan Web token. This feature does not use or store a Dhan PIN or TOTP secret. Disabling renewal leaves the current token connected until expiry; Disconnect removes it and disables renewal.

Renewal status, next attempt, last successful renewal and actionable errors appear in the connection card. Transient failures retry; authentication failures require reconnection. A newly returned token is encrypted and persisted before profile verification, so a profile outage can retry verification without losing that token. A shared Redis lease serializes token rotation, manual replacement and disconnect; database comparisons protect against stale writes.

Run the API continuously on the deployment host. No separate cron process is required. Multiple API instances use the same lease. As with any external token rotation, a process/database failure between Dhan issuing a token and the application persisting it can require a fresh login.

Provider reference: https://dhanhq.co/docs/v2/authentication/#renew-token

Verification: `RUN_DB_TESTS=1` with `node --test backend/dist-test/test/dhan-renewal.test.js` after compiling `backend/tsconfig.test.json`. Tests use an isolated temporary MongoDB database and mocked Dhan responses; they do not renew the actual account token.
