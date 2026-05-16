# Privacy policy

v1.0.0

[Effective Date: TBD on publication]

This Privacy Policy describes how Laxcorp Software Design - FZCO, a free zone company established in the International Free Zone Authority (IFZA), Dubai, United Arab Emirates, operating under the brand "Laxcorp Research" ("Company", "we", "us", or "our") collects, uses, shares, and protects information in connection with the Raven desktop application and related services (collectively, the "Service").

By using the Service, you agree to the collection and use of information in accordance with this policy. If you do not agree, do not use the Service.

### 1. Definitions

- **"Personal Data"** means any information that identifies or can be used to identify an individual.
- **"Usage Data"** means data collected automatically from use of the Service, including the anonymous telemetry described in Section 2.2.
- **"User Content"** means transcripts, AI responses, session data, and other content generated through your use of the Service.
- **"Free Tier"** means the open-source, self-hosted version of Raven.
- **"Pro Tier"** means the paid subscription version of Raven with cloud services.

### 2. Information We Collect

#### 2.1 Information You Provide

| Category | Examples | Applies To |
|---|---|---|
| Account Information | Email address, name, profile picture | Pro Tier |
| API Credentials | Third-party API keys you configure (Deepgram, Anthropic, OpenAI) | Free Tier |
| User Content | Transcripts, AI conversation history, session notes, custom modes, RAG context files (text + embeddings only - the original file binary is not transmitted to our servers) | Both |
| Payment Information | Billing details processed by our payment provider | Pro Tier |
| Communications | Emails or messages you send to us | Both |

#### 2.2 Information Collected Automatically

| Category | Examples | Applies To |
|---|---|---|
| Usage Records | Number of sessions, AI requests, transcription duration | Pro Tier |
| Device Information | Operating system, app version | Pro Tier |
| Authentication Data | Session tokens (the token on your device is encrypted via macOS Keychain or Windows DPAPI; only a SHA-256 hash of the refresh token is stored on our backend, so we can revoke sessions) | Pro Tier |
| Anonymous Crash Reports | Stack traces with PII stripped client-side (email, IP, hostname, username are removed before transmission); OS version; app version. Forwarded to Sentry. The Electron renderer process forwards uncaught React errors to the main process via the `sentry:capture-renderer-error` IPC channel; the same PII strip applies. | Both |
| Anonymous Product Analytics | A randomly-generated device-scoped identifier of the form `anon-<timestamp>-<random>` (NOT your email, NOT your account ID, not cross-referenced with any of those server-side); event names (`app_launched`, `session_started`, `session_ended` with a duration BUCKET like "5-15m" rather than the exact duration, `ai_request` with the action type, `transcription_provider`, `error_boundary_caught`); per-event metadata (app version, platform, CPU arch, Electron version). The user's IP is explicitly nulled (`$ip: null`) on every event before transmission. Forwarded to PostHog. | Both |

#### 2.3 Information We Do Not Collect

- **Audio recordings:** Raven processes audio in real time for transcription. Raw audio is not written to disk and is not stored by us.
- **Video or screen content:** Raven does not capture video, screen recordings, or visual content of any kind.
- **Transcript or AI content via crash reports or product analytics:** Sentry and PostHog never receive transcript text, AI prompts, AI responses, file content, mode names, or names of meeting participants.
- **IP addresses via product analytics:** every PostHog event sets `$ip: null` so PostHog does not record the IP from the connecting socket.
- **Cleartext passwords:** passwords are hashed with bcrypt cost factor 12 the moment a request body reaches the backend; the cleartext is never written to disk or to logs.

### 3. How We Use Your Information

We use the information we collect for the following purposes:

| Purpose | Legal Basis (GDPR) |
|---|---|
| To provide and operate the Service | Performance of contract |
| To process payments and manage subscriptions | Performance of contract |
| To sync User Content across your devices (Pro) | Performance of contract |
| To enforce usage limits and prevent abuse | Legitimate interest |
| To communicate with you about the Service | Legitimate interest |
| To monitor product reliability and improve the app via anonymous crash reports + anonymous product analytics (Section 2.2) | Legitimate interest (Article 6(1)(f)). The data is structurally anonymous and the processing purpose is product improvement. |
| To comply with legal obligations | Legal obligation |

We do not use your data for advertising, profiling, or automated decision-making.

### 4. How We Share Your Information

We do not sell your Personal Data. We share information only in the following circumstances:

#### 4.1 Sub-Processors and Service Providers

We use the following third-party services to operate Raven. Each processes data only as necessary to provide their respective services:

| Provider | Service | Data Processed |
|---|---|---|
| Deepgram | Speech-to-text transcription. Used as the streaming transcription provider for any language other than English / Spanish / French / German / Portuguese / Italian, and for auto-detect / multilingual mode (`nova-3` model). | Audio streams (real-time, not stored by us) |
| AssemblyAI | Speech-to-text transcription via Recall AI. Used as the streaming transcription provider for sessions in English / Spanish / French / German / Portuguese / Italian (`assembly_ai_v3_streaming` Universal-3 Pro speech model). Also used for post-meeting insights (summary, action items, topics, sentiment, key phrases) via AssemblyAI's LLM Gateway endpoint at `https://llm-gateway.assemblyai.com`. | Audio (via Recall) and transcript text |
| Anthropic | AI language model for in-session suggestions | Conversation text, contextual prompts |
| OpenAI | Alternative AI language model when configured | Conversation text, contextual prompts |
| Recall AI | Premium audio capture infrastructure (Pro). Region pinned to `ap-northeast-1`. | Audio streams, meeting metadata |
| Google | OAuth authentication (Pro). The `openid email profile` scopes only - we do not request access to your Gmail, Drive, Calendar, or contacts. | Email, name, profile picture URL |
| Dodo Payments | Payment processing (Pro) | Billing and subscription data; card / bank-account information is held by Dodo directly and is never received by us |
| Sentry | Anonymous crash reporting (both tiers) | Stack traces (PII stripped client-side via the `beforeSend` hook), OS version, app version, route + HTTP method + statusCode for backend events, server-generated user UUID for backend events (NOT your email or name) |
| PostHog | Anonymous product analytics (both tiers, US region: `https://us.i.posthog.com`) | Random device-scoped distinctId, event names, per-event structural metadata (app version, platform, arch). User IP is explicitly nulled. |
| Amazon Web Services | Cloud infrastructure (Pro) | Encrypted data in transit and at rest (`us-east-1`) |

On the Free Tier, audio and AI data are sent directly from your device to Deepgram and Anthropic / OpenAI using your own API keys. We have no access to that data. Anonymous crash reports + anonymous product analytics still flow to Sentry and PostHog as described in Section 2.2.

#### 4.2 Legal Requirements

We may disclose information if required by law, subpoena, court order, or government request, or if we believe in good faith that disclosure is necessary to protect our rights, your safety, or the safety of others.

#### 4.3 Business Transfers

In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will notify you before your data becomes subject to a different privacy policy.

### 5. Data Storage and Security

#### 5.1 Free Tier

User Content is stored locally on your device:

- **Database:** SQLite, stored in your system's application data directory.
- **Configuration:** Encrypted using your operating system's secure credential storage (macOS Keychain / Windows DPAPI). If your OS keychain is briefly unavailable when storing fresh credentials (for example, if it is locked), the application falls back to plaintext storage in your user-level app data directory and surfaces a Sentry warning, so that you do not get silently logged out.
- **No User Content is sent to our servers** on the Free Tier (audio + AI data go directly between your device and the third-party API providers whose keys you configured).
- **Anonymous crash reports + anonymous product analytics** as described in Sections 2.2 and 4.1 are sent to Sentry and PostHog regardless of tier.

#### 5.2 Pro Tier

- **Infrastructure:** Hosted on Amazon Web Services (AWS) in the United States (`us-east-1`).
- **Encryption:** All data is encrypted in transit (TLS 1.2+) and at rest (AES-256).
- **Access controls:** Role-based access with principle of least privilege.
- **Network security:** AWS WAF with managed rule sets for common web exploits.
- **Webhook integrity:** Payment-provider webhook payloads are HMAC-verified (Standard Webhooks) before any database write, and a tenant guard rejects any webhook that cannot be positively identified as a Raven event.
- **Monitoring:** Continuous logging and alerting via AWS CloudWatch and Sentry.

#### 5.3 Incident Response

In the event of a data breach that affects your Personal Data, we will notify you and any applicable regulatory authority within 72 hours of becoming aware of the breach, as required by applicable law.

### 6. Data Retention

| Data Type | Retention Period |
|---|---|
| Account information | Until you delete your account |
| User Content (Pro) | Until you delete individual sessions or your account |
| User Content (Free) | Stored locally; retained until you delete it |
| Usage records | 12 months from creation |
| Payment records | As required by tax and financial regulations |
| Authentication tokens | Until logout or expiration |
| Audio processed by Recall AI | Automatically deleted after 7 days by Recall AI |
| Sentry crash reports | 90 days (Sentry's default retention) |
| PostHog analytics events | Per the PostHog Cloud plan we hold |
| Backend application logs (CloudWatch) | 30 days (staging) / 90 days (production) |

When you delete your account, we delete or anonymize all associated Personal Data from our systems within 30 days, except where retention is required by law.

### 7. Your Rights

Depending on your jurisdiction, you may have the following rights:

#### 7.1 All Users

- **Access:** Request a copy of the data we hold about you. The Pro app exposes this directly via Settings → Profile → Download my data, which exports every record we hold tied to your user ID as a single JSON file.
- **Deletion:** Delete your account and all associated data via Settings → Profile → Delete account. Deletion cascades immediately to your subscription, sessions + transcripts + AI responses, modes + context files + embeddings, daily usage records, and all refresh tokens.
- **Portability:** Same as Access; the export is structured JSON suitable for import into other tools.
- **Correction:** Update your account information at any time.
- **Withdrawal of consent:** Stop using Pro features and revert to the Free Tier at any time.

#### 7.2 European Economic Area (GDPR)

If you are located in the EEA, you additionally have the right to:

- Restrict or object to processing of your Personal Data, including the anonymous-telemetry processing described in Section 2.2 / 3 (legitimate-interest basis).
- Lodge a complaint with your local data protection authority.
- Request erasure under the right to be forgotten.

To exercise these rights, contact us at **privacy@laxcorpresearch.com**.

#### 7.3 California Residents (CCPA)

If you are a California resident, you have the right to:

- Know what Personal Data we collect and how it is used.
- Request deletion of your Personal Data.
- Opt out of the sale of your Personal Data (we do not sell Personal Data).
- Non-discrimination for exercising your privacy rights.

### 8. International Data Transfers

We are based in the United Arab Emirates and our cloud infrastructure for the Pro Tier is hosted by Amazon Web Services in the United States (`us-east-1` region). When you use the Pro Tier, your data is therefore processed in the UAE (where the data controller is established) and in the United States (where the AWS sub-processor physically stores it). The third-party processors listed in Section 4.1 may also operate from additional jurisdictions.

We rely on Standard Contractual Clauses, AWS's published cross-border transfer commitments, and other legally approved transfer mechanisms to ensure adequate protection of personal data crossing borders, including transfers between the UAE, the United States, the European Economic Area, and the user's home jurisdiction.

### 9. Children's Privacy

The Service is not directed to individuals under the age of 16. We do not knowingly collect Personal Data from children. If we become aware that we have collected data from a child under 16, we will delete it promptly. If you believe a child has provided us with Personal Data, please contact us.

### 10. Third-Party Links and Services

The Service may integrate with third-party services that have their own privacy policies. We are not responsible for the privacy practices of these services. We encourage you to review their policies independently.

### 11. Changes to This Policy

We may update this Privacy Policy from time to time. If we make material changes, we will notify you by email (for Pro users) or by posting a notice within the application at least 30 days before the changes take effect. Your continued use of the Service after the effective date constitutes acceptance.

### 12. Contact Us

If you have questions about this Privacy Policy or wish to exercise your rights:

**Laxcorp Software Design - FZCO**

Registered office: [IFZA office address - fill in before publishing]

Email: privacy@laxcorpresearch.com

General inquiries: hello@laxcorpresearch.com
