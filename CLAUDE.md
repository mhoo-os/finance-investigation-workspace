# Finance Investigation Workspace

This repository owns the synthetic Finance Investigation Workspace and its protected MHO-231 Cloudflare staging environment. Keep every fixture synthetic: never add provider credentials, OAuth, real Plaid/Clover/client data, production deployment steps, or production resource identifiers.

The evidence contract is append-safe: raw fixture bytes are preserved in the R2-compatible binding, SHA-256 receipts are stored in D1, and normalized rows always retain an exact artifact key and row pointer. Do not change the fixtures without updating their focused tests.

Run `npm test`, `npm run coverage`, `npm run check`, and `npm run deploy:check` before opening a pull request. `npm start` seeds and serves the local in-memory synthetic workspace. Only an explicitly authorized `--env staging` operation may change Cloudflare resources; never deploy the root configuration.
