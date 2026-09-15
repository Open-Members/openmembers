Features, prerequisites, and configuration limits. Course chat remains disabled by default. Configuration and local tests do not establish production operation; validate each feature in the environment where it will be used.

## Course chat and corpus

Chat is optional and disabled by default. Explicit activation requires all of the following:

| Requirement | Current contract |
| --- | --- |
| Operational opt-in | `COURSE_CHAT_ENABLED=true` (exact value after trimming spaces) |
| Installation Auth and database | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Server-side vector queries | `DATABASE_POOL_URL` preferred, or `DATABASE_URL`; `pg` initializes on demand, with up to 5 connections, a 5-second connection wait, and a 15-second query timeout |
| Own AI credential | `AI_GATEWAY_API_KEY`, used only on the server |
| Prepared material | `lesson_chunks` linked to installation lessons, with nonempty text and a non-null `embedding vector(1536)` |
| Student permission | Valid session, active profile, course access, and lessons visible to that session; the permitted lesson list also restricts privileged SQL |

Without opt-in or with partial configuration, the player does not mount the button and all six handlers return **503 `not_configured` before opening clients**: send, resume, archive, list, detail, and delete conversations. Removing the flag disables these application operations without deleting stored conversations. The administrator remains responsible for database retention and deletion. The flag does not change existing SQL/RLS privileges or revoke REST access to records already owned by the user.

With complete configuration, POST checks the session, course access, usage limit, and conversation ownership. Search first resolves permitted lessons through the session, then checks for usable chunks in that same set. **Without accessible corpus, it makes no external embedding, answer, or title calls.** The API returns **409 `context_unavailable`**, shown as a drawer notice, without creating a conversation or saving the question. If the corpus disappears between queries, search may also return empty and prevent answer generation.

The ingestion pipeline **is not distributed**: there is no command for transcription, chunking, or embedding generation. Before enabling chat, prepare a reviewed ingestion process with authorized material and check answer quality. Tables do not populate the corpus automatically.

Concrete code limits:

- Up to 30 generation requests per user per UTC hour, counted in PostgreSQL. Authenticated requests reaching the counter may consume quota even if context is later unavailable or a failure occurs. Conversation listing: 60/minute per user, in memory per process.
- Questions up to 2,000 characters; received history up to 16 messages of 8,000 characters each, with up to 8 forwarded to the model. Questions and history pass a credential-pattern detector, which does not replace a complete data policy.
- Retrieval of up to 5 chunks. Fixed transport endpoint `https://ai-gateway.vercel.sh/v1`; model IDs configured in code: `openai/text-embedding-3-small`, `anthropic/claude-sonnet-4-6` for answers, and `anthropic/claude-haiku-4-5` for titles. Confirm model availability in the provider account before enabling the feature. Returned vectors must contain 1,536 finite numeric values.
- Answers are limited to 1,000 tokens and titles to 30 tokens. NDJSON streaming sends citations, deltas, and completion. A partial answer may persist after streaming failure; public errors do not contain the raw provider response.
- Chunks, questions, and up to eight history messages are sent to the provider when enabled with an available corpus. Keys do not enter UI props. Ownership is checked before persisting assistant messages with the administrative client.

Validate in your installation: own corpus in pgvector, valid/expired/suspended enrollment, drip, cross-user access, answers/citations, concurrent usage budgets, streaming failure/resume, retention, and provider limits. Tests with controlled dependencies do not establish the quality or operation of the external service.

## Available features

The features below depend on content and administrative configuration. A screen or table does not certify every installation flow. Check permissions and relevant cases for your content before making it available to students.

| Feature | How it works | Limits and checks |
| --- | --- | --- |
| Ebooks and watermarking | Library and reader; PDFs use the authorized route and receive the authenticated identity's name, email, and date. | Check invalid/encrypted PDFs, names outside the Latin alphabet, and reader compatibility. A watermark is not DRM and does not prevent copying. See [storage](../integrations/storage.md). |
| Quizzes | Questions per lesson, server-side grading, attempt limits, and lesson completion. The client does not query correct choices. | Validate concurrent attempts, results, and progress with the installation database and form. |
| Certificates | Disabled until enabled for **both** the installation and course. Eligibility requires completion of published lessons; issuance and PDFs use installation data. | Check repeated/concurrent issuance, fonts/images, and access. There is no accreditation or public verification page. |
| Collections and instructors | Administration of collections, ordering, course associations, and instructors; mutations require an administrator. | Check publication, catalog, and permissions after configuring content. |
| Search | Published courses are public; lesson results require a session and lesson access, a published hierarchy, and drip release. | Limits of 80 characters and eight results per group. See [search visibility](search.md). |
| Cohorts and live lessons | Cohorts connect enrollments; scheduling uses configured times, time zone, and links. Calendar and banner query accessible courses and the session. | Check daylight saving time, expiry, multiple courses, and link visibility. No videoconferencing service is provisioned. |
| Support, announcements, and internal notifications | User tickets, separate internal notes, announcement audiences, and per-user notifications. External notices use the [email transport](../integrations/email-jobs.md). | Check audiences, suspended profiles, expired access, and sending failures. Internal notifications do not imply push. |
| Reports, activity, and scoring | Progress, streaks, activity, administrative queries, and CSV. Export requires an active administrator. | Check intervals, permissions, and user-controlled text in CSV. Metrics are not a financial audit. |
| Administrative import | CSV preview, package/cohort/date validation, and per-row handling; reuses [manual invitations](enrollment.md). | Check duplicates, reruns, partial errors, and the email option using test files. There is no automatic migration from another platform. |
| AI chat | Experimental, optional, and disabled by default; requires the corpus and configuration described above. | Validate the database, provider, answer quality, and operational policy before enabling it. |
| Knowledge pipeline | Schema/chunks and retrieval consumer are available; ingestion is not distributed. | Preparing ingestion, updates, and removal of authorized material is the installation's responsibility. |

See the [integration matrix](../integrations/README.md) for video, OAuth, telemetry, and other providers. New push subscriptions are disabled; the configurable manifest does not include an offline experience.
