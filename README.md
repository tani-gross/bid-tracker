# Goldin Bid Watcher

Checks a Goldin item page on an interval and emails you when the current bid changes.

## Setup

1. Enable 2-Step Verification on your Gmail account.
2. Create a Google App Password for Mail.
3. Copy `.env.example` to `.env`.
4. Fill in `SMTP_USER`, `SMTP_PASS`, and `EMAIL_TO`.

## Config

- `GOLDIN_URL`: Goldin page to watch
- `CHECK_INTERVAL_MS`: How often to check, in milliseconds
- `RUN_ONCE`: Set to `true` to run a single check and exit
- `STATE_PATH`: Where to persist the last seen bid
- `SMTP_USER`: Your Gmail address
- `SMTP_PASS`: Your Gmail app password
- `EMAIL_FROM`: Sender address; usually the same as `SMTP_USER`
- `EMAIL_TO`: Recipient address

## Run

```bash
npm start
```

On the first run, the app stores the current bid in `state.json` and does not send an email. After that, it emails only when the bid changes from the last stored value.
