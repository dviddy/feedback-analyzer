# Share the redesigned Feedback Analyzer

Source: https://github.com/dviddy/feedback-analyzer

## Why GitHub Pages is insufficient

The frontend is HTML and browser JavaScript. It calls same-origin POST endpoints
`/analyze`, `/trends`, and `/journeys`, and loads `/vendor/papaparse.min.js`.
The backend is a Node.js Express process that serves these assets and calls OpenAI.
GitHub Pages cannot run this process. Never place an API key in browser code,
Pages configuration, a committed `.env`, or a client-visible build variable.

## Deploy the complete app on Render

[Create the service from this repository](https://dashboard.render.com/select-repo?type=blueprint&repo=https://github.com/dviddy/feedback-analyzer)

1. Sign in to Render, connect GitHub, and create a Blueprint from this repository.
   The committed `render.yaml` defines a Node 24 web service. Leave Root Directory
   unset: the frontend and shared modules live above `server/`.
2. Enter `OPENAI_API_KEY` only in Render's secret environment settings. Set
   `OPENAI_MODEL` to a Responses structured-output model your API project can use
   (the app's existing default is `gpt-5.6-luna`; availability must be verified).
3. Render generates `REVIEW_PASSWORD`. Retrieve it privately in the service's
   environment settings. The username is `reviewer`. Do not commit or put either
   the password or API key into a URL. Review the selected hosting plan before creating it.
4. Deploy and open the HTTPS service URL Render assigns. Sign in using the
   browser's password prompt. Share the URL and reviewer password privately.
5. With synthetic feedback, check single analysis, CSV progress, Top Trends,
   optional Journey Maps, and Detailed Feedback. This live check uses paid API calls.

The health endpoint is public and only reports liveness; it does not verify the
key or model. All other routes require the reviewer password in production.
Startup fails when the production password is absent or shorter than 24 characters.
Cross-site browser POSTs are rejected. Local development remains on loopback;
production binds to `0.0.0.0` and honors the platform's `PORT`.

## Frontend and backend requirements

- Frontend: the root HTML/JS files plus locally served Papa Parse; no build step
  and no frontend secrets. The backend serves an explicit asset allowlist.
- Backend: Node 24, `npm ci --prefix server --omit=dev`, then
  `npm start --prefix server`. Secrets are supplied at runtime. TLS must be
  provided by the hosting platform because Basic authentication requires HTTPS.
- Use one origin for both. A separate Pages frontend would need URL changes,
  authenticated cross-origin API design, CORS, and a separately hosted backend;
  that split is not configured in this version.

## Review scope and remaining setup

This is a password-protected review deployment, not an anonymous public service.
Anyone with the shared password can incur API usage. Use a dedicated API project,
configure its usage controls, monitor costs, rotate the review password after the
review, and suspend the service when no longer needed. For broad public access,
add individual accounts, quotas, and durable rate limits first.

Uploaded feedback is sent to OpenAI for analysis; use synthetic data for review.
The app keeps results in browser memory and has no database. Reloading clears
results. Local feedback exports are excluded from Git; only two curated demo
fixtures are included. `server/.env` remains local and ignored.

No cloud service or live URL is created merely by pushing this repository.
A Render account, runtime secrets, deployment, and the live check above remain
necessary. See [Render Blueprint documentation](https://render.com/docs/blueprint-spec).
