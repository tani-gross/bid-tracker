# Goldin Bid Watcher

Checks a Goldin item page on an interval and emails you when the current bid changes.

## Setup

1. Create a Resend account and API key.
3. Copy `.env.example` to `.env`.
4. Fill in `RESEND_API_KEY`, `EMAIL_FROM`, and `EMAIL_TO`.

## Recommended Email Setup

Use Resend over HTTPS on Railway. This avoids outbound SMTP restrictions on ports like `465`.

For testing, Resend provides `onboarding@resend.dev` as a sender. For production, verify your own domain and use that address in `EMAIL_FROM`.

## SMTP Fallback

SMTP is still supported as a fallback if `RESEND_API_KEY` is not set.

1. Enable 2-Step Verification on your Gmail account.
2. Create a Google App Password for Mail.
3. Set `SMTP_USER`, `SMTP_PASS`, and `EMAIL_TO`.

## Config

- `GOLDIN_URL`: Goldin page to watch
- `CHECK_INTERVAL_MS`: How often to check, in milliseconds
- `RUN_ONCE`: Set to `true` to run a single check and exit
- `STATE_PATH`: Where to persist the last seen bid
- `RESEND_API_KEY`: Resend API key for HTTPS email delivery
- `EMAIL_FROM`: Sender address
- `EMAIL_TO`: Recipient address
- `SMTP_USER`: Your Gmail address
- `SMTP_PASS`: Your Gmail app password
- `SMTP_HOST`: SMTP host, default `smtp.gmail.com`
- `SMTP_PORT`: SMTP port, default `465`
- `SMTP_SECURE`: Whether to use SMTPS, default `true`

## Run

```bash
npm start
```

On the first run, the app stores the current bid in `state.json` and does not send an email. After that, it emails only when the bid changes from the last stored value.

## Railway

Railway's default Node environment may not include the Linux libraries Playwright needs. If that happens, deploy with the included `Dockerfile` so the app runs in the official Playwright image with Chromium dependencies preinstalled.

For Railway deploys, prefer `RESEND_API_KEY` over SMTP. Railway documents that SMTP is only available on Pro and above; HTTPS email APIs avoid that restriction.
