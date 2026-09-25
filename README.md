# Feedback Analyzer — shared review version

The redesigned application and its Node backend are included here.
See [Deployment instructions](DEPLOYMENT.md) for the password-protected hosting
configuration. GitHub Pages alone cannot run the API. Keep all keys server-side.

Quick local start: `cd server`, `npm ci`, create `.env` from `.env.example`,
set your API key, and run `npm start`. Open http://localhost:3000.
Use `Journey Mapping Demo 40.csv` or `Emerging Insights Sample.csv` for review.
Run `npm test` from `server` for the mocked-provider test suite.

---

# Current flow: Semantic Trends and optional Journey Mapping

This section supersedes the historical Emerging Insights and automatic Journey Mapping behavior documented below. The six-field analysis contract and dashboard calculations are unchanged.

## Architecture and files

- `semantic-trends.js` (new): shared semantic enrichment schemas, runtime validation, valid-record filtering, deterministic trend aggregation, candidate rules, ranking, selection, and adapter into Journey Mapping V2.
- `server/index.js`: serves the shared module; adds `/trends` and `/journeys` batch enrichment endpoints. Existing `/analyze` remains unchanged.
- `browser.js`: requests trends after CSV analysis, displays Top Trends and evidence, provides Top 3/Top 5/manual controls, and generates maps only on request. Enrichment failure preserves the dashboard and individual results; retry does not reanalyze individual records. Old insight and journey helpers remain for compatibility and regression coverage.
- `journey-mapping.js`: accepts a selected controlled journey and semantic stage classifier while preserving V2 stage construction, metrics, channels, emotions, recommendations, provenance and empty-stage behavior.
- `index.html`: loads the shared module and adds a dedicated Journey Mapping control section.
- `server/test/semantic-trends.test.js`, `server/test/enrichment-api.test.js` (new), and `server/test/ui.test.js`: semantic aggregation, primary demo fixture, endpoint validation, optional generation and failure/retry coverage.
- `README.md`: current-flow documentation and testing instructions.

## Semantic architecture and API calls

After the existing per-comment analysis completes, one bounded `/trends` provider request receives only record identifier, optional feedback ID, original feedback, category, and pain point. It returns semantic names, concise descriptions and record memberships, including singleton groups. It does not produce metrics or journey assignments. Structured Outputs are strict; runtime validation rejects missing, repeated, invented or omitted record IDs and unexpected response fields.

The application resolves memberships back to original successful records. Each trend retains IDs, represented categories, sentiment/effort/priority counts, supporting evidence, dominant pain points, and recommended actions. Descriptions come from the model; recommended focus is the most frequent supporting recommendation, with lexical tie-breaking. All counts, shares and percentages are calculated in code. The denominator for share is all successfully analyzed, eligible records, including singleton experiences. Negative percentage uses the trend's supporting count. Percentages are rounded only for display; opportunity rules use the exact fraction.

There is no enrichment call for fewer than two eligible comments, and no automatic journey call. Each user generation request makes one bounded `/journeys` provider call for the selected trends together. It semantically selects from the seven controlled journeys and assigns supporting records to controlled stages. Unknown journeys and uncertain stages return null. Stage membership must match the chosen journey and all selected evidence IDs must be accounted for exactly once. A null journey produces “Journey not identified” and no map.

Both endpoints use the configured existing model and `store: false`. Batches are limited to 1,000 records and 180,000 serialized characters; output is limited to 24,000 tokens. Oversized batches are rejected explicitly, never silently sampled. Manual retry introduces another batch call. No database, authentication, duplicate detection or Action Loop was added.

## Product defaults: recurrence, opportunity and ranking

`semantic-trends.js` exports configurable defaults:

- Recurring trend: at least **2** eligible supporting records.
- Candidate: at least **3** records and at least one of **50% negative**, **2 High Effort**, or **2 High Priority**. Positive-only trends are never automatic candidates, even if their analyses contain high effort or priority.
- Rank: **supporting count + negative count + high-effort count + high-priority count**, with configurable weights currently all 1. Ties use supporting volume and then earliest CSV record. UI shows the contributing business signals and explains the formula, without displaying an arbitrary score.
- Top 3/5 selects up to that many ranked candidates. Manual selection permits any recurring trend, including positive-only trends.

These are adjustable product defaults, not universal business rules. Failed, pending, invalid, blank and explicitly excluded evidence cannot enter trends. Existing CSV parsing, blank-row handling, individual-analysis validation and dashboard failure behavior are preserved.

## V2 reuse and generation flow

The visible flow is Analysis Summary → Top Trends → Journey Mapping controls → Generated Journey Maps (only after a request) → Individual Feedback. No maps are generated merely because analysis completed.

Each selected trend receives a separate V2 map, even when multiple trends share a journey. Only that trend's supporting evidence enters the map. V2 retains its controlled goals and Member Actions, original feedback and IDs, explicit channel and emotion handling, deterministic stage metrics, proposed recommendations, unassigned ownership placeholders, accessible table and expandable stage detail. Unsupported stages retain “No feedback evidence observed.” Uncertain evidence stays available as unmapped, with classification reasons; it is not forced into stages.

## Verification and limitations

Run the full suite from `server` with `npm test`. Tests use mocked provider responses, including the primary `Journey Mapping Demo 40.csv` fixture. They verify aggregation and semantic-response wiring; they do not establish live-model clustering accuracy. No live provider evaluation was run for this change. Labels, grouping granularity and semantic classification may vary between live runs. Structured validation protects the contract and traceability but cannot prove semantic correctness. Enrichment can fail or exceed batch/output limits; individual analyses remain available and explicit retries are supported. Recommended focus reuses a supporting analysis rather than a new synthesis call. State is in memory and is cleared on a new analysis or reload.

## Exact demo test steps

1. Configure `server/.env` with `OPENAI_API_KEY` (and optionally the existing `OPENAI_MODEL`). From the project folder run `cd server`, then `npm start`. Open [the local app](http://localhost:3000) and refresh to load the new scripts.
2. Choose **Journey Mapping Demo 40.csv** under **Analyze Multiple Comments**, then click **Analyze CSV**. Wait for individual analysis and semantic enrichment to finish.
3. Verify Analysis Summary and Individual Feedback remain available. If all calls succeed, the summary shows 40 analyzed comments. Inspect Top Trends: semantically similar feedback should group even when wording differs. Expand **View supporting feedback** to compare original text, CSV record IDs, feedback IDs and all six analysis fields.
4. Confirm that no Generated Journey Maps appear after CSV completion. Most deliberately repeated issues in this fixture have only **two** supporting comments; these are recurring trends but do **not** meet the default **three**-comment candidate threshold. Top 3/5 may therefore be disabled. Do not lower thresholds or merge distinct issues to make the buttons activate.
5. Click **Select Trends**, choose one or more recurring trends (for example identity verification or loan application complexity), and click **Generate Journey Maps**. Verify maps appear only now, retain controlled journey names, and contain only selected-trend evidence. Unsupported stages must say **No feedback evidence observed**; uncertain records must remain unmapped.
6. For candidate controls, optionally make a separate copy of the fixture and add a distinct third feedback record describing one existing recurring issue. Analyze that copy; if its sentiment/effort/priority meets the defaults, use **Generate Top 3 Journey Maps** or **Generate Top 5 Journey Maps**. Only qualifying candidates should be selected, with fewer maps when fewer candidates qualify.
7. Start a new CSV or single analysis and confirm old trends, controls and maps clear. If enrichment fails, verify dashboard/individual results remain and **Retry Top Trends** reruns only enrichment.

---

The material below documents previous versions and original setup details; current flow and API-call behavior are defined above.

# Member Experience Intelligence

A local, plain HTML/JavaScript feedback analyzer with an Express backend. The existing UI and original `app.js` CLI prototype are preserved. Single comments and CSV comments both use `POST /analyze`; there is no browser keyword fallback.

## Start locally

Install Node.js 22.13+ (Node 24 recommended), then run:

```sh
cd "/Users/David/Documents/Feedback Analyzer/server"
npm ci
```

Create `server/.env` from `server/.env.example` only if `.env` does not already exist. Set:

```dotenv
OPENAI_API_KEY=your_actual_key
OPENAI_MODEL=gpt-5.6-luna
PORT=3000
```

Keep your existing key if already configured. The key stays on the server; `.env` is ignored by Git. The default model is the original backend's model; use a model your API project can access that supports Responses structured outputs if necessary. No model substitution happens automatically.

From the `server` folder:

```sh
npm start
```

Open http://localhost:3000 in a browser. Do not open `index.html` directly. The server binds only to local IPv4 loopback; http://127.0.0.1:3000 also works. Stop it with Ctrl+C. If port 3000 is occupied, change `PORT` and use the matching URL. Configuration is read from `server/.env` regardless of the working directory.

## Verify in the browser

1. Open http://localhost:3000/health and confirm a JSON success response. This is a liveness check, not an API-key or model-access check.
2. Open http://localhost:3000. Paste a synthetic comment such as “I tried signing in three times before it worked.” Click **Analyze Feedback**. Confirm Category, Sentiment, Effort, Priority, Pain Point, and Recommended Action appear.
3. Choose `Test Feedback.csv` from the project folder and click **Analyze CSV**. Confirm progress, individual results in source order, and the dashboard. Negative + Positive + Neutral must equal Comments Analyzed. Failed comments are excluded from those counts.
4. For parser verification, create a temporary CSV with the content below. It should analyze two comments and skip one blank feedback record. Additional columns must not appear in the submitted comments.

```csv
id,feedback,source
1,"Friendly staff, quick service",branch
2,"The app said ""try again""
twice before working",mobile
3, ,mobile
```

5. To check failure handling, stop the server while leaving the page open, then submit a comment. Expect a visible connection error, no classification, and re-enabled controls. Restart the server before continuing.

A live analysis sends the comment to OpenAI and incurs API usage. Automated tests use synthetic data and a stubbed provider, never your API key.

## CSV behavior and limits

- Papa Parse is installed and served locally, with no CDN dependency.
- A comma-delimited UTF-8 CSV must contain exactly one `feedback` header (case-insensitive; surrounding whitespace and a BOM are accepted), in any column position.
- Quoted commas, escaped quotes, CRLF and multiline fields are supported. Malformed quotes and inconsistent column counts reject the entire file before analysis.
- Fully empty records are ignored; records with blank feedback are skipped and counted. “CSV record” identifies a logical parsed record including the header, not a physical line in multiline CSVs; completely empty records do not receive numbers.
- Files are limited to 5 MB and 1,000 nonempty comments. Feedback is limited to 10,000 characters per comment; longer CSV comments fail individually.
- At most three requests run concurrently per page. A comment failure does not discard successful comments or stop the queue. There are no automatic retries. Failed records are identified in the results; put only those records in a new CSV to retry without reprocessing successes.
- Progress counts completed requests (successful or failed). Dashboard totals include validated successes only. Controls are disabled while a run is active.

## API contract

`POST /analyze` accepts JSON `{ "feedback": "Customer comment" }`.

Success: `{ "status": "success", "analysis": { ... } }`, with exactly these analysis fields:

| Field | Value |
| --- | --- |
| category | Exactly one category from the controlled taxonomy below |
| sentiment | Positive, Neutral, or Negative |
| effort | Low, Medium, or High |
| priority | Low, Medium, or High |
| painPoint | Nonempty string |
| recommendedAction | Nonempty string |

The controlled categories are Digital Banking, Mobile App, Website, Account Access, Transfers & Payments, Cards, Fees & Charges, Deposits & Accounts, Account Opening, Lending, Branch, Contact Center, Service Experience, Fraud & Security, and Other. Specific issues belong in `painPoint`; positive feedback retains its category and may state that no pain point was identified.

Effort measures the member's work: Low means easy/quick completion with little or no extra work; Medium means noticeable friction, confusion, delay, or inconvenience without substantial repeated effort or multiple recovery actions; High means substantial friction, including repeated attempts/failures, multiple contacts/channels, rework, lockout, inability to complete an important task, significant troubleshooting, excessive/confusing steps, or restarting. A blocked task with repeated attempts should generally be High. Priority is assessed separately from effort.

The server requests a strict JSON schema and validates the output again. Errors use `{ "status": "error", "message": "..." }`: 400 invalid input/JSON, 413 oversized request, 429 provider rate limit, 502 invalid/refused/incomplete/provider output, 503 missing configuration, or 504 provider timeout. Provider requests time out after 60 seconds with automatic retries disabled; the browser stops waiting after 65 seconds.

Neither customer feedback nor model output is logged or echoed by the API. Dynamic text uses DOM text nodes. The frontend asset allowlist does not expose keys, samples, or server source. Responses are requested with `store: false`; this is not a guarantee about all provider retention policies. The original CLI remains unchanged, including its original keyword behavior.

## Tests

```sh
cd "/Users/David/Documents/Feedback Analyzer/server"
npm test
```

Tests cover the exact contract, request validation, malformed/incomplete output, provider errors, browser requests and timeouts, CSV quoting/headers/sample files, concurrency and ordering, partial failures and counts, safe DOM rendering, overlapping-run prevention, frontend serving, and private-file isolation. Local server tests need permission to bind a loopback port.

Remaining limits: model quality and account/model access need live verification; concurrency is per page, not a global rate limiter. Large batches can cost money and take time; closing/reloading the page loses progress, with in-flight provider requests potentially completing. There is no persistence, authentication, deployment configuration, or database. This app is intended for local use.

## Emerging Insights V1.1

After all CSV requests finish, Emerging Insights appears between the existing dashboard and individual results. Partial batches use successful analyses only. A fully failed batch or one without qualifying recurring themes shows an empty-state message. Starting another CSV or single-comment analysis clears old insights.

Grouping is deterministic: category plus a controlled theme key. Within **Account Access**, reviewed phrase rules recognize login/authentication errors, unsuccessful login attempts, and inability to sign in as **Login Access Failure**. Password-reset emails described as missing, not arriving, undelivered, or not received map to **Password Reset Failure**. Customer/member wording and attempt counts do not affect these recognized themes. No extra AI calls or analysis-contract fields are added.

The rules keep reset-email failures separate from login failures. References to verification codes, MFA, account lockouts, usernames, negated/resolved failures, and mixed login/reset failures conservatively retain exact matching. Reset links and reset forms are not treated as email-delivery failures. Outside these recognized Account Access patterns, matching falls back to exact pain-point text normalized with Unicode NFKC, lowercase, and punctuation/whitespace collapsed to spaces. Categories are always part of the key, so records from different categories never merge.

Groups require at least two distinct CSV records. Invalid analyses, failed/pending records, common no-issue placeholders, and positive-only groups are excluded. V1.1 does not surface positive patterns.

Counts come only from validated supporting records. Negative percentage is rounded to the nearest whole percent, using all supporting records in that theme as the denominator; high effort and high priority are separate exact counts. Duplicate CSV record identities cannot inflate support, while separate CSV records containing identical feedback each count once. Cards sort by support descending, breaking ties by the earliest CSV record.

Titles use category plus the controlled theme label when recognized; otherwise they use the first non-positive supporting pain point (shortened for the title only). The full pain point remains in the summary. Recommended focus is the most frequent exact recommendation among non-positive supporting records, breaking ties by CSV order. These are excerpts of existing analyses, not an additional synthesis or verified root-cause claim. Every insight retains its supporting record numbers, original feedback, and all six analysis fields. Native expandable details support mouse and keyboard use. No additional AI requests, database, or changes to the analysis endpoint are involved.

### Test Emerging Insights in the browser

1. Start the existing server with `npm start` from the `server` folder, then open http://localhost:3000 (or your configured port). Refresh if the page was already open.
2. Under **Analyze Multiple Comments**, click the file chooser and select `Emerging Insights Sample.csv` from this project folder.
3. Click **Analyze CSV**. During processing, verify dashboard progress and individual results continue updating; Emerging Insights should not appear until processing completes.
4. After completion, look below the dashboard and above individual results for **Emerging Insights**. The sample has two repeated login complaints (CSV records 2–3), two missing password-reset-email complaints (records 4–5), and two positive service comments (records 6–7).
5. When the complaint pairs are categorized as Account Access and match the documented phrases, expect two separate cards: **Login Access Failure** and **Password Reset Failure**, each with two supporting comments. Customer/member substitutions and the example paraphrases now group together. Each fully negative pair shows **100% Negative**. Compare **High Effort** and **High Priority** counts to the actual analyses. Positive-only groups should not appear. All six individual results should remain visible.
6. Click **View supporting feedback** (or focus it with Tab and press Enter). Verify the original feedback, CSV record numbers, and all six analysis fields. Login and password-reset issues must not be combined simply because they share Account Access.
7. Analyze a single comment afterward and confirm that old batch insights disappear.

Live model classifications and wording can still vary. These rules cover the two observed Account Access themes, not general semantic similarity or every possible paraphrase. Unknown wording and other categories retain exact matching; conservative guards may split valid paraphrases. The rules infer no root cause, and the representative summary/action remain excerpts from supporting analyses rather than a synthesis of every variation. Broader phrase coverage should be added as small reviewed rules with separation tests. No browser session against a live provider is required by the automated suite: tests fix outputs to verify exact grouping, counts, traceability, exclusions, expansion, and existing dashboard behavior.

## Journey Mapping V1

**Journey Maps** appears after Emerging Insights and before individual feedback when CSV analysis completes. It is cleared when a new single-comment or CSV run starts. Only journeys with at least one confidently mapped, validated record appear, with all of that journey's stages in the requested order. An expandable **Unmapped** bucket retains all other validated feedback. Failed analyses remain in individual results and contribute to neither journey nor Unmapped counts.

### Architecture and evidence

`journey-mapping.js` owns the seven-journey taxonomy, controlled mapping rules, validation/deduplication, stage metrics, and supporting records. `browser.js` supplies the existing normalized themes and Emerging Insights associations, then renders the returned `journeys → stages → supportingRecords` structure plus `unmapped`. The mapper does not change or synthesize analysis results. It performs no network requests and adds no analysis fields, storage, embeddings, or overall journey score. The backend change only allows serving this new frontend asset.

Each valid CSV record is counted at most once and assigned to at most one stage. One comment is sufficient for journey evidence; the existing Emerging Insights minimum of two and positive-only exclusion remain unchanged. Evidence identifies whether a record belongs to an actual recurring Emerging Insight or only has a theme/pain-point label. Expanded stages retain original CSV record numbers, feedback, all six analysis fields, and the rule that assigned the stage. Display order follows taxonomy order; evidence is sorted by CSV record number.

Negative percentage is the number of Negative supporting records divided by all supporting records at that stage, rounded to the nearest whole percent. High Effort and High Priority are independent counts. Both **Attention Needed** (at least one High Priority) and **High Friction** (at least one High Effort) may display together. Other populated stages show **Feedback Observed**. Empty stages show **No Feedback Observed**, with no percentage or health score. Absence of evidence is never a claim of success or satisfaction.

### Controlled mapping rules

Existing Account Access normalization is reused without changing Emerging Insights:

| Category + normalized theme | Journey → stage |
| --- | --- |
| Account Access + Login Access Failure | Digital Account Access → Authenticate |
| Account Access + Password Reset Failure | Digital Account Access → Recover Access |

The existing conservative guards for MFA, usernames, lockouts, mixed login/reset descriptions, and negated/resolved failures remain in effect. The following additional vocabulary matches the **entire pain point** after Unicode normalization, lowercase conversion, and punctuation/whitespace normalization. Each phrase also requires the specified category. It does not perform substring or semantic matching:

| Category | Exact pain-point vocabulary | Journey → stage |
| --- | --- | --- |
| Account Access | Login access failure; Successful login; Easy login | Digital Account Access → Authenticate |
| Account Access | Password reset failure; Successful password reset | Digital Account Access → Recover Access |
| Account Opening | Identity verification failure; Account opening identity verification failure | Account Opening → Verify Identity |
| Account Opening | Initial account funding failure | Account Opening → Fund Account |
| Transfers & Payments | Missing payment confirmation; Missing transfer confirmation | Transfers & Payments → Receive Confirmation |
| Cards | Card activation failure; Quick card activation; Card activation completed successfully | Cards → Receive or Activate Card |
| Cards | Card authorization declined; Debit card declined despite sufficient available funds | Cards → Authorization |
| Lending | Loan document upload failure | Lending → Submit Documentation |
| Lending | Delayed loan decision | Lending → Decision |
| Branch | Long branch wait time; Long branch wait times | Branch Service → Wait |
| Contact Center | Long call hold time; Long call hold times | Contact Center → Connect or Wait |

Unknown or mixed wording remains Unmapped. Category alone never identifies a stage. This intentionally limited vocabulary is a starting point for reviewed additions; it is not general natural-language journey understanding. All requested stages exist in the taxonomy, but many do not yet have mapping rules. Positive feedback is eligible when its analyzed theme/pain point identifies a stage, such as Account Access + Successful login. Generic positive results with “No pain point identified” remain Unmapped unless the original feedback explicitly identifies a supported branch employee interaction. A narrow Branch-only rule recognizes direct statements such as “The branch staff were friendly and helpful” or “The branch teller was rude” in the pain point or original feedback. It accepts staff, employees, tellers, employee, or teller, with friendly/helpful/polite/courteous/rude/unhelpful/unfriendly/dismissive descriptions (including “not” and descriptions joined by “and”). This maps only to Meet Employee, regardless of sentiment; it does not establish completion of any other stage. These rules describe where evidence occurred, not a reconstructed sequence of one customer's actions.

### Exact browser verification steps

1. From the project `server` folder, run `npm start` with the existing API configuration. Open [the local app](http://localhost:3000) (or your configured port) and refresh to load the new scripts.
2. In **Analyze Multiple Comments**, choose `Emerging Insights Sample.csv` from the project folder and click **Analyze CSV**. This uses the existing analysis calls; Journey Mapping adds none.
3. During processing, confirm dashboard and individual results update while Journey Maps remains empty. After completion, locate **Journey Maps** immediately below Emerging Insights and above individual feedback.
4. When CSV records 2–3 analyze as Account Access login failures and 4–5 as Account Access missing reset emails, expect **Digital Account Access**, with **Authenticate: 2 supporting comments** and **Recover Access: 2 supporting comments**. If all four are Negative, each populated stage displays **100% Negative**. Compare effort/priority counts and statuses with the actual individual analyses; do not assume the provider always returns High.
5. Confirm the ordered stages are Attempt Access, Authenticate, Recover Access, Enter Account, Complete Intended Task. Unpopulated stages must say **No Feedback Observed**, without a success label or percentage. Read the absence-of-evidence explanation above the maps.
6. Expand **View supporting feedback** under Authenticate and Recover Access, using a click or Tab then Enter. Check theme/insight, original text, record numbers (2–3 and 4–5 respectively), category, sentiment, effort, priority, pain point, recommended action, and mapping explanation.
7. Confirm the sample’s branch-staff comments (records 6–7) appear under **Branch Service → Meet Employee** when categorized as Branch, even if their pain point says “No pain point identified.” Other Branch Service stages show No Feedback Observed. Unmatched feedback remains available under **Unmapped**; all records remain in the dashboard and individual results.
8. To try other wording, upload a CSV with a `feedback` column, for example “I activated my card quickly and easily.” A Positive Cards result with pain point “Quick card activation” maps to Cards → Receive or Activate Card. A generic “No pain point identified” result correctly stays Unmapped. Actual model wording is variable; exact positive mapping is guaranteed by automated fixtures, not by this live input.
9. Start another CSV run and confirm old maps clear immediately. After it finishes, analyze a single comment and confirm the batch journey section clears again.

Automated verification: `npm test` from `server` passes **48 tests**, including the existing dashboard, Emerging Insights, backend, parser, and queue tests. New tests cover controlled mapping and exclusions, every exact rule, metrics, both status labels, positive-only stage evidence, deduplication, traceability, invalid/failed/pending exclusions, empty stages and datasets, Unmapped visibility, safe expansion, section order, clearing, and no additional analysis calls. HTTP integration tests require local loopback permission. No live provider classification quality is asserted by those tests.

## Journey Mapping V2 — Current State

V2 adds a horizontally scrollable semantic table with stages as columns and ten experience dimensions as rows. The original ordered stage view remains in **Stage detail and mapping evidence**. Existing V1 taxonomy, category/theme rules, validation, deduplication by CSV record, statuses, Unmapped evidence, Dashboard, Data Quality/failed-record behavior, and Emerging Insights remain intact. The provider still returns exactly the original six fields; V2 makes no additional provider requests.

### Architecture and provenance

`journey-mapping.js` owns controlled definitions and the deterministic projection. Every returned journey has name, goal, nullable persona, `view: 'current-state'`, provenance, and ordered stages. Stages retain V1 metrics and supporting records and add member action, explicit touchpoint mentions, grouped pain points, emotion evidence, full effort/priority counts, current-state summary, proposed solutions, nullable owner, and assignment placeholders. The browser renders this data without calculating journey rules.

`provenance` separates controlled definitions, observed feedback/validated analyses, derived metrics, deterministic summaries, proposed recommendations, and future user-entered values. Emotion entries include source, exact wording and CSV record. Solutions include supporting record numbers, frequency, proposal provenance and a nullable `userText` for future refinement. Assignment owner/department/status/dueDate are null placeholders only; no assignment workflow or due-date UI is implemented. Future-state content can be added beside the explicitly identified current-state view without replacing evidence.

| Row | Population and source |
| --- | --- |
| Member Action | Controlled intended activity; shown even without evidence and labeled as a definition. |
| Touchpoint / Channel | Controlled vocabulary found explicitly in original supporting feedback. Labeled as mentions, not inferred stage attribution. Unknown = Not identified. Hypothetical, quoted and some negated sentences abstain. |
| Pain Point | Non-positive validated pain points grouped by existing Emerging Insight when available, otherwise V1 theme; counts and original wording retained. No-issue placeholders excluded. |
| Member Emotion | Narrow first-person feeling statements, such as “I am frustrated.” Explicit detection includes the exact wording and record. Other language = Emotion not identified / unavailable. No inference from generic sentiment. |
| Supporting Evidence | Distinct validated CSV records, rounded negative percentage, High effort and priority counts; expandable original feedback, six analysis fields, optional feedback_id, theme, Emerging Insight and mapping rule. |
| Member Effort | Deterministic High/Medium/Low counts; High Friction when any High effort exists. |
| Priority | Deterministic High/Medium/Low counts; Attention Needed when any High priority exists. |
| Current-State Insight | Dominant pain theme and supporting wording; ties use first CSV record. Without qualifying pain points, reports observed count without inferring success. |
| Proposed Future-State Solution | Existing recommendedAction text grouped by exact wording and sorted by frequency, then first CSV record. Every proposal includes its evidence references; no generated solution text. |
| Owner / Assignment | Unassigned for stages with recommendations; otherwise no evidence-based opportunity to assign. |

Empty stages show **No feedback evidence observed**, and proposal cells show **No evidence-based recommendation**. Neither zero counts nor missing evidence imply low effort, satisfaction or journey health. Persona defaults to **Persona not defined**. No overall score is calculated.

### Validation and limitations

The complete suite has 54 tests, including all 48 pre-existing tests and six V2 tests. Coverage includes ordering, goals/actions, independent login/reset mappings, empty states, conservative emotions/channels, metrics, recommendation provenance, original-record/feedback_id traceability, unchanged request inputs, semantic table rows, safe text rendering, expansion and horizontal scrolling. HTTP tests require permission to listen on localhost. Provider responses are mocked during automated tests; live model wording can vary.

V1's intentionally narrow rules still leave uncertain feedback Unmapped. Emotion detection is deliberately limited to explicit standalone first-person sentences; it does not infer feelings from sentiment or classify nuanced language. Channels are explicit mentions within a mapped comment, not a claim that every mentioned channel belongs to that specific stage. This release has no saved edits, persona editor, owner editor, or separate future-state map. Future editable fields should include persona, custom solution wording and owner/department/status/due date, preserving the original evidence and proposed wording alongside edits.

### Browser test with Emerging Insights Sample.csv

1. Start the configured app: run `npm start` in the project's `server` folder. Open http://localhost:3000 (or the configured port), then refresh to load the updated scripts.
2. Under **Analyze Multiple Comments**, choose **Emerging Insights Sample.csv** from the project folder and click **Analyze CSV**.
3. Wait for all six records to finish. Check the Dashboard, failed/skipped record reporting and Emerging Insights still appear.
4. Scroll to **Journey Maps**. The Digital Account Access map should show its controlled goal, Persona not defined, and the CURRENT-STATE JOURNEY MAP table.
5. When validated analyses match the controlled login/reset themes, Authenticate contains CSV records 2–3 and Recover Access contains records 4–5. Other digital stages show no evidence. Exact sentiment, effort, priority and wording depend on the validated provider response; do not assume the conceptual example's counts for those fields.
6. Check all ten rows, horizontal scrolling, friction/priority labels, and proposal wording against supporting analyses. Expand **View supporting feedback** in Supporting Evidence to inspect originals, the six fields, Emerging Insight and mapping rules. This sample uses `id`, not `feedback_id`, so no feedback_id is invented.
7. Check positive branch feedback (records 6–7) under Branch Service → Meet Employee when its validated category is Branch. Positive-only feedback should not produce a pain-point theme. Uncertain mappings remain in **Unmapped**.
8. Start another upload or single-comment analysis and confirm the previous journey maps clear. No additional analysis calls are made by the journey view.
