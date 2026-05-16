# Terms of service

v1.0.0

[Effective Date: TBD on publication]

These Terms of Service ("Terms") constitute a legally binding agreement between you ("User", "you", or "your") and Laxcorp Software Design - FZCO, a free zone company established in the International Free Zone Authority (IFZA), Dubai, United Arab Emirates, operating under the brand "Laxcorp Research" ("Company", "we", "us", or "our") governing your use of the Raven desktop application and related services (collectively, the "Service").

### 1. Acceptance of Terms

By downloading, installing, or using the Service, you agree to be bound by these Terms and our Privacy Policy. If you do not agree, you must not use the Service.

If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.

### 2. Description of Service

Raven is a desktop application that provides real-time audio transcription and AI-powered assistance during meetings and conversations. The Service is available as:

- **Free Tier:** An open-source, self-hosted version requiring user-provided API keys. No account required.
- **Pro Tier:** A paid subscription with managed infrastructure, cloud synchronization, and additional features.

Like virtually every commercial SaaS product, Raven sends anonymous crash reports and anonymous product-analytics events back to us so we can keep the product reliable and improve it over time. The data is structurally anonymous: a randomly-generated device-scoped identifier (NOT your email, account ID, or any other persistent identifier we could correlate to you), with the IP explicitly nulled, and never including any transcript, AI prompt, AI response, file content, email address, or other user content. By using the Service you acknowledge this telemetry is part of how Raven is operated. The Privacy Policy Sections 2.2 / 4.1 describe the full field list and our GDPR Article 6(1)(f) legitimate-interest legal basis. If you have specific privacy concerns about telemetry, contact us at privacy@laxcorpresearch.com and we will work with you on a per-request basis. The open-source build of the codebase published under MIT (the OSS components in Section 10) inherits no Sentry or PostHog credentials, so self-built copies of the open-source portion send no telemetry.

### 3. Eligibility

You must be at least 16 years old to use the Service. By using the Service, you represent and warrant that you meet this requirement.

### 4. User Accounts (Pro Tier)

#### 4.1 Registration

To access Pro features, you must create an account by providing accurate and complete information. You agree to keep your account information current.

#### 4.2 Security

You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must notify us immediately of any unauthorized access.

#### 4.3 Account Termination

You may delete your account at any time through the application settings (Settings → Profile → Delete account). Deletion cascades immediately and irreversibly to every record we hold tied to your user ID, including subscription, sessions + transcripts + AI responses, modes + context files + embeddings, daily usage records, and refresh tokens. Active Pro subscriptions must be cancelled (via the Dodo customer portal) before deletion. We reserve the right to suspend or terminate accounts that violate these Terms.

### 5. Subscriptions and Billing (Pro Tier)

#### 5.1 Pricing and Payment

Pro subscriptions are billed on a recurring basis (monthly or annually) through our payment processor, Dodo Payments. Prices are displayed before purchase and may be updated with 30 days' notice. Card numbers, CVV, and bank-account details are handled directly between you and Dodo Payments; we never see or store them.

#### 5.2 Free Trial

If we offer a free trial, you will not be charged until the trial period ends. You may cancel before the trial expires to avoid charges.

#### 5.3 Cancellation

You may cancel your subscription at any time via Settings → Billing → Manage Subscription, which opens the Dodo customer portal. Cancellation takes effect at the end of the current billing period. You will retain access to Pro features until that date.

#### 5.4 Refunds

Refunds are handled on a case-by-case basis. Contact us at hello@laxcorpresearch.com for refund requests.

#### 5.5 Usage Limits

The Free Tier has the following limits enforced server-side:

- 5 AI responses per day, reset at 00:00 UTC.
- 120 seconds maximum per recording session. The session count itself is not capped at a user-facing number.

The Pro Tier removes these limits. We reserve the right to modify limits with reasonable notice.

### 6. User Content

#### 6.1 Ownership

You retain all rights to your User Content, including transcripts, AI conversation history, and session data. We do not claim ownership of any content you create using the Service.

#### 6.2 License to Us

By using the Pro Tier, you grant us a limited, non-exclusive license to store, process, and transmit your User Content solely for the purpose of providing the Service (e.g., cloud synchronization, AI processing). This license terminates when you delete your content or account. We do not train models on your User Content. We do not sell your User Content. We do not share your User Content with third parties except the processors listed in our Privacy Policy, each of whom is bound by a data-processing agreement.

#### 6.3 Responsibility

You are solely responsible for your User Content and for ensuring that your use of the Service complies with applicable laws, including but not limited to laws governing the recording of conversations.

### 7. Recording and Consent

**You acknowledge and agree that:**

(a) The Service captures and processes audio from your device's microphone and system audio output.

(b) Many jurisdictions require the consent of one or more parties to a conversation before it may be recorded or transcribed. Laws vary significantly by jurisdiction (including but not limited to one-party consent, two-party / all-party consent, and notification requirements).

(c) **You are solely responsible for determining and complying with all applicable laws** regarding the recording, transcription, and processing of conversations in your jurisdiction and the jurisdiction of all other participants.

(d) We do not provide legal advice and make no representation that the Service is lawful to use in any particular context.

(e) You will indemnify and hold us harmless from any claims arising from your failure to obtain required consents.

### 8. Acceptable Use

You agree not to:

- Use the Service in violation of any applicable law or regulation.
- Record or transcribe conversations without legally required consent.
- Attempt to reverse-engineer, decompile, or disassemble any proprietary component of the Service.
- Use the Service to harass, stalk, threaten, or otherwise harm any person.
- Interfere with or disrupt the integrity or performance of the Service.
- Use the Service to generate, store, or transmit content that is unlawful, defamatory, or infringes on intellectual property rights.
- Share your Pro account credentials with others or allow unauthorized access.
- Attempt to extract our system prompts, jailbreak the AI models, or otherwise interfere with the integrity of the AI suggestion pipeline. We may rate-limit or suspend accounts that repeatedly trigger our output-leakage detection.

### 9. Third-Party Services

The Service integrates with third-party APIs and services. Your use of these services is subject to their respective terms and policies. We are not responsible for the availability, accuracy, or practices of third-party services. The full list of sub-processors is in Privacy Policy Section 4.1; the principal ones are:

- **Deepgram** - speech-to-text transcription (`nova-3` model for any language other than English / Spanish / French / German / Portuguese / Italian, and for auto-detect / multilingual mode).
- **AssemblyAI** - speech-to-text transcription via Recall (`Universal-3 Pro` model for English / Spanish / French / German / Portuguese / Italian sessions); also post-meeting insights via the AssemblyAI LLM Gateway endpoint (`https://llm-gateway.assemblyai.com`).
- **Anthropic Claude** - in-session AI suggestions.
- **OpenAI** - alternative AI provider when configured.
- **Recall AI** - premium audio capture infrastructure (Pro Tier; region pinned to `ap-northeast-1`).
- **Dodo Payments** - subscription billing and payment processing (Pro Tier).
- **Google** - sign-in with Google (Pro Tier; `openid email profile` scopes only).
- **Sentry** - anonymous crash reporting (both tiers).
- **PostHog** - anonymous product analytics (both tiers).
- **Amazon Web Services** - cloud infrastructure (Pro Tier; region `us-east-1`).

On the Free Tier, you interact with the transcription and AI providers directly using your own API keys. We have no control over and accept no liability for those interactions.

### 10. Open-Source Components

Portions of the Service are released under the MIT License and available at our public repository (`https://github.com/Laxcorp-Research/project-raven`). The MIT License applies to the source code. These Terms apply to your use of the compiled application and any cloud services we provide. In the event of a conflict between the MIT License and these Terms regarding cloud services, these Terms shall prevail.

The closed-source premium features ("Pro mode") are not covered by the MIT License. Using Pro mode requires being signed in to a Raven account on a build distributed by us. The Free Tier described in Section 2 also requires being signed in for cloud-backed features but is subject to the limits in Section 5.5; the Pro Tier removes those limits.

### 11. Intellectual Property

The Raven name, logo, brand assets, and any proprietary components of the Service are owned by Laxcorp Software Design - FZCO and protected by intellectual property laws. Nothing in these Terms grants you any right to use our trademarks without prior written consent.

### 12. Disclaimer of Warranties

THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY. WE DISCLAIM ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

WITHOUT LIMITING THE FOREGOING, WE DO NOT WARRANT THAT:

(a) The Service will be uninterrupted, timely, secure, or error-free.

(b) Transcriptions will be accurate or complete.

(c) AI-generated content will be correct, appropriate, or reliable. AI outputs are generated by third-party models and may contain errors, omissions, or fabricated information. You should independently verify any AI-generated content before relying on it.

(d) The Service will be compatible with all hardware, software, or network configurations.

### 13. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL LAXCORP SOFTWARE DESIGN - FZCO, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE, WHETHER BASED ON WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE), OR ANY OTHER LEGAL THEORY, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

OUR TOTAL AGGREGATE LIABILITY ARISING OUT OF OR IN CONNECTION WITH THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU HAVE PAID TO US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS ($100). The U.S. Dollar reference matches the currency in which Pro subscriptions are billed by our payment provider; it does not imply any U.S. jurisdiction.

### 14. Indemnification

You agree to indemnify, defend, and hold harmless Laxcorp Software Design - FZCO and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable attorneys' fees) arising out of or in connection with:

(a) Your use of the Service.

(b) Your violation of these Terms.

(c) Your violation of any applicable law, including laws governing the recording of conversations.

(d) Your User Content.

### 15. Modifications to the Service

We reserve the right to modify, suspend, or discontinue any part of the Service at any time, with or without notice. We will make reasonable efforts to provide advance notice of material changes. We shall not be liable to you or any third party for any modification, suspension, or discontinuation.

### 16. Modifications to Terms

We may revise these Terms from time to time. If we make material changes, we will notify you by email (for Pro users) or by posting a notice in the application at least 30 days before the changes take effect. Your continued use of the Service after the effective date constitutes acceptance of the revised Terms.

### 17. Termination

#### 17.1 By You

You may stop using the Service at any time by uninstalling the application. Pro users may cancel their subscription and delete their account through the application settings.

#### 17.2 By Us

We may suspend or terminate your access to the Service immediately if you breach these Terms. Upon termination, your right to use the Service ceases. Sections that by their nature should survive termination (including Sections 6, 7, 12, 13, 14, and 19) shall survive.

### 18. Severability

If any provision of these Terms is held to be unenforceable, the remaining provisions shall remain in full force and effect.

### 19. Governing Law and Dispute Resolution

These Terms shall be governed by and construed in accordance with the federal laws of the United Arab Emirates as applied in the Emirate of Dubai, without regard to conflict-of-law principles.

Any dispute arising under these Terms shall first be attempted to be resolved through good-faith negotiation. If unresolved within 30 days, the parties submit to the exclusive jurisdiction of the courts of the Emirate of Dubai, United Arab Emirates. The language of any proceedings shall be English.

Nothing in this section shall prevent either party from seeking injunctive or equitable relief in a court of competent jurisdiction.

### 20. Entire Agreement

These Terms, together with the Privacy Policy, constitute the entire agreement between you and Laxcorp Software Design - FZCO regarding the Service and supersede all prior agreements, written or oral.

### 21. Contact

If you have questions about these Terms:

**Laxcorp Software Design - FZCO**

Registered office: [IFZA office address - fill in before publishing]

Email: hello@laxcorpresearch.com
