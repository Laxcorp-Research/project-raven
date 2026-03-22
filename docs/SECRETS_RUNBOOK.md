# Secrets Rotation Runbook

How to rotate every secret used by the Raven backend. All secrets are stored in **AWS Secrets Manager** under `raven/<environment>/app` (where environment is `staging` or `production`).

---

## General Process

1. Update the value in AWS Secrets Manager (Console → Secrets Manager → `raven/<env>/app` → "Retrieve secret value" → "Edit").
2. If the secret is also a Terraform variable, export the new value as `TF_VAR_<name>` and run `terraform apply` in the relevant `infra/environments/<env>/` directory.
3. Force a new ECS deployment so tasks pick up the new secret: `aws ecs update-service --cluster raven-<env> --service raven-<env>-backend --force-new-deployment`.
4. Verify via the `/health` endpoint and application logs.

---

## JWT_SECRET

| Property | Value |
|----------|-------|
| Secrets Manager key | `JWT_SECRET` |
| Terraform variable | `TF_VAR_jwt_secret` |
| ECS restart required | **Yes** |
| Terraform apply required | **Yes** (updates Secrets Manager via Terraform) |
| Impact on active sessions | **All existing access tokens and refresh tokens become invalid.** Users must re-authenticate. |

**Steps:**
1. Generate a new secret: `openssl rand -base64 48`
2. Update in Secrets Manager and `TF_VAR_jwt_secret`.
3. Run `terraform apply`.
4. Force ECS redeployment.
5. Existing users will see "Session expired" and must sign in again.

---

## DODO_WEBHOOK_SECRET

| Property | Value |
|----------|-------|
| Secrets Manager key | `DODO_WEBHOOK_SECRET` |
| Terraform variable | `TF_VAR_dodo_webhook_secret` |
| ECS restart required | **Yes** |
| Terraform apply required | **Yes** |
| Impact on active sessions | **None** — only affects incoming webhook verification. |

**Steps:**
1. Generate a new webhook secret in the Dodo Payments dashboard (Developers → Webhooks → Signing secrets).
2. Update in Secrets Manager and `TF_VAR_dodo_webhook_secret`.
3. Run `terraform apply`.
4. Force ECS redeployment.
5. Verify by triggering a test webhook from Dodo.

---

## DODO_API_KEY

| Property | Value |
|----------|-------|
| Secrets Manager key | `DODO_API_KEY` |
| Terraform variable | `TF_VAR_dodo_api_key` |
| ECS restart required | **Yes** |
| Terraform apply required | **Yes** |
| Impact on active sessions | **Billing operations will fail** until the new key is deployed. Checkout, portal, and subscription queries affected. |

**Steps:**
1. Generate a new API key in Dodo Payments dashboard (Developers → API Keys).
2. Revoke the old key after the new one is deployed.
3. Update in Secrets Manager and `TF_VAR_dodo_api_key`.
4. Run `terraform apply`, then force ECS redeployment.

---

## DEEPGRAM_API_KEY

| Property | Value |
|----------|-------|
| Secrets Manager key | `DEEPGRAM_API_KEY` |
| Terraform variable | `TF_VAR_deepgram_api_key` |
| ECS restart required | **Yes** |
| Terraform apply required | **Yes** |
| Impact on active sessions | **Active free-tier transcription sessions will disconnect** when the old key is invalidated. Pro users using AssemblyAI are unaffected. |

**Steps:**
1. Create a new API key in the Deepgram Console (Settings → API Keys).
2. Update in Secrets Manager and `TF_VAR_deepgram_api_key`.
3. Run `terraform apply`, then force ECS redeployment.
4. Revoke the old key in Deepgram Console after confirming the new one works.

---

## ANTHROPIC_API_KEY

| Property | Value |
|----------|-------|
| Secrets Manager key | `ANTHROPIC_API_KEY` |
| Terraform variable | `TF_VAR_anthropic_api_key` |
| ECS restart required | **Yes** |
| Terraform apply required | **Yes** |
| Impact on active sessions | **In-flight AI requests via `/api/proxy/ai` will fail** until redeployment completes. No data loss — clients retry. |

**Steps:**
1. Create a new API key in the Anthropic Console.
2. Update in Secrets Manager and `TF_VAR_anthropic_api_key`.
3. Run `terraform apply`, then force ECS redeployment.
4. Disable the old key in Anthropic Console.

---

## OPENAI_API_KEY

| Property | Value |
|----------|-------|
| Secrets Manager key | `OPENAI_API_KEY` |
| Terraform variable | `TF_VAR_openai_api_key` |
| ECS restart required | **Yes** |
| Terraform apply required | **Yes** |
| Impact on active sessions | **In-flight AI requests using OpenAI models will fail** until redeployment. Same as Anthropic — clients retry. |

**Steps:**
1. Create a new API key in the OpenAI Dashboard (API keys).
2. Update in Secrets Manager and `TF_VAR_openai_api_key`.
3. Run `terraform apply`, then force ECS redeployment.
4. Revoke the old key in OpenAI Dashboard.

---

## ASSEMBLYAI_API_KEY

| Property | Value |
|----------|-------|
| Secrets Manager key | `ASSEMBLYAI_API_KEY` |
| Terraform variable | `TF_VAR_assemblyai_api_key` |
| ECS restart required | **Yes** |
| Terraform apply required | **Yes** |
| Impact on active sessions | **Active AssemblyAI transcription sessions will disconnect** (temporary tokens become invalid). Sessions fall back to Deepgram. Post-meeting LeMUR analysis will fail until redeployed. |

**Steps:**
1. Create a new API key in AssemblyAI Dashboard (Account → API Keys).
2. Update in Secrets Manager and `TF_VAR_assemblyai_api_key`.
3. Run `terraform apply`, then force ECS redeployment.
4. Revoke the old key in AssemblyAI Dashboard.

---

## GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET

| Property | Value |
|----------|-------|
| Secrets Manager keys | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Terraform variables | `TF_VAR_google_client_id`, `TF_VAR_google_client_secret` |
| ECS restart required | **Yes** |
| Terraform apply required | **Yes** |
| Impact on active sessions | **Google OAuth login will break** until redeployment. Existing JWT sessions remain valid. |

**Steps:**
1. In Google Cloud Console → APIs & Services → Credentials, create new OAuth 2.0 credentials.
2. Add all redirect URIs: `https://api.useraven.ai/auth/google/callback`, `https://api-staging.useraven.ai/auth/google/callback`.
3. Update both values in Secrets Manager and Terraform variables.
4. Run `terraform apply`, then force ECS redeployment.
5. Delete the old OAuth client in Google Cloud Console.

**Warning:** Rotating the Client ID (not just the secret) means updating the Electron app's built-in `GOOGLE_CLIENT_ID` reference. This requires an app update release.

---

## RECALL_API_KEY

| Property | Value |
|----------|-------|
| Secrets Manager key | `RECALL_API_KEY` |
| Terraform variable | `TF_VAR_recall_api_key` |
| ECS restart required | **Yes** |
| Terraform apply required | **Yes** |
| Impact on active sessions | **Upload token requests will fail** — new Recall recordings cannot start. In-progress recordings are unaffected (tokens already issued). Falls back to native capture. |

**Steps:**
1. Generate a new API key in the Recall AI Dashboard.
2. Update in Secrets Manager and `TF_VAR_recall_api_key`.
3. Run `terraform apply`, then force ECS redeployment.
4. Revoke the old key in Recall Dashboard.

---

## Quick Reference

| Secret | SM Key | TF Var | ECS Restart | TF Apply | Session Impact |
|--------|--------|--------|:-----------:|:--------:|---------------|
| JWT_SECRET | `JWT_SECRET` | `TF_VAR_jwt_secret` | Yes | Yes | All tokens invalidated |
| DODO_WEBHOOK_SECRET | `DODO_WEBHOOK_SECRET` | `TF_VAR_dodo_webhook_secret` | Yes | Yes | None |
| DODO_API_KEY | `DODO_API_KEY` | `TF_VAR_dodo_api_key` | Yes | Yes | Billing offline temporarily |
| DEEPGRAM_API_KEY | `DEEPGRAM_API_KEY` | `TF_VAR_deepgram_api_key` | Yes | Yes | Free transcription drops |
| ANTHROPIC_API_KEY | `ANTHROPIC_API_KEY` | `TF_VAR_anthropic_api_key` | Yes | Yes | AI requests fail briefly |
| OPENAI_API_KEY | `OPENAI_API_KEY` | `TF_VAR_openai_api_key` | Yes | Yes | AI requests fail briefly |
| ASSEMBLYAI_API_KEY | `ASSEMBLYAI_API_KEY` | `TF_VAR_assemblyai_api_key` | Yes | Yes | Pro transcription falls back |
| GOOGLE_CLIENT_ID | `GOOGLE_CLIENT_ID` | `TF_VAR_google_client_id` | Yes | Yes | OAuth login breaks |
| GOOGLE_CLIENT_SECRET | `GOOGLE_CLIENT_SECRET` | `TF_VAR_google_client_secret` | Yes | Yes | OAuth login breaks |
| RECALL_API_KEY | `RECALL_API_KEY` | `TF_VAR_recall_api_key` | Yes | Yes | New recordings can't start |

---

## Emergency: All Secrets Compromised

If you need to rotate everything at once:

```bash
cd infra/environments/<env>

# Export ALL new values
export TF_VAR_jwt_secret="$(openssl rand -base64 48)"
export TF_VAR_dodo_webhook_secret="<new from Dodo dashboard>"
export TF_VAR_dodo_api_key="<new from Dodo dashboard>"
export TF_VAR_deepgram_api_key="<new from Deepgram>"
export TF_VAR_anthropic_api_key="<new from Anthropic>"
export TF_VAR_openai_api_key="<new from OpenAI>"
export TF_VAR_assemblyai_api_key="<new from AssemblyAI>"
export TF_VAR_google_client_id="<new from GCP>"
export TF_VAR_google_client_secret="<new from GCP>"
export TF_VAR_recall_api_key="<new from Recall>"

terraform apply
aws ecs update-service --cluster raven-<env> --service raven-<env>-backend --force-new-deployment
```

Then revoke all old keys in their respective dashboards.
