# Dorucenie transactional email

The application records messages atomically with account creation and publisher, app, update, payment and withdrawal status changes. It does not send retroactive messages for pre-existing accounts or mark any email as delivered. `accepted` means only provider acceptance.

## Production setup
1. Add and verify `dorucenie.com` in Resend, publishing the SPF/DKIM records Resend supplies at the authoritative DNS provider.
2. Add server-only `RESEND_API_KEY` (sending permission) and `EMAIL_FROM=Dorucenie <notifications@dorucenie.com>` in Vercel Production and redeploy. Never put the key in a VITE variable or in source control.
3. Execute `scripts/schedule-email.sql` after the email endpoint is deployed. The private `job:secret` and pg_cron/pg_net setup from `schedule-verification.sql` must already exist. If CRON_SECRET is configured, it must equal the secret used by the scheduler.
4. Register your own test account or trigger a legitimate account event, then check the admin email panel and Resend delivery logs. No fake payment is necessary.

Without configuration, messages remain queued and no sending request is made. The scheduled authenticated worker processes up to 8 messages per minute. Messages expire after 7 days; reset links after 30 minutes. Existing messages are not replayed during deployment.

The outbox lives in private `eldevo.records`, kind `email`. It is never included in user or publisher market responses. Admin sees a status summary and the last 20 recipient/subject/status rows, not reset tokens or message bodies. Templates HTML-escape all variables and link only to dorucenie.com.

Workers claim each message under the shared database transaction lock with a 60-second lease, then call the provider outside the transaction. Retries use an unchanged message ID as Resend Idempotency-Key. Network failures, 429 and 5xx retry with backoff, up to 5 attempts. Permanent provider errors require admin intervention. All sending attempts stop after 23 hours from the first attempt, within Resend's 24-hour idempotency window. After an ambiguous timeout outside that window, an operator must investigate provider logs rather than resend blindly.

For an existing custom EMAIL_WEBHOOK_URL / EMAIL_WEBHOOK_TOKEN deployment, the webhook must accept HTTPS JSON `{to,subject,text,html}` and implement the Idempotency-Key contract itself. Resend is preferred when both configurations are set.

Manual SQL changes bypass application events; use application admin actions to generate email. A deliberate account exception can enqueue a separately authorized notification, but must never forge automatic verification evidence.

Documentation: https://resend.com/docs/api-reference/emails/send-email and https://resend.com/docs/dashboard/emails/idempotency-keys
