# Finance Investigation Workspace

This repository owns only the MHO-229 synthetic prototype. Keep the scope local and synthetic: never add provider credentials, OAuth, real Plaid/Clover/client data, deployment steps, or production resource identifiers.

The evidence contract is append-safe: raw fixture bytes are preserved in the R2-compatible binding, SHA-256 receipts are stored in D1, and normalized rows always retain an exact artifact key and row pointer. Do not change the fixtures without updating their focused tests.

Run `npm test`, `npm run coverage`, and `npm run check` before opening a pull request. `npm start` seeds and serves the local in-memory synthetic workspace; it does not deploy it.
