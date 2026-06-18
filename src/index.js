require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const nodemailer = require("nodemailer");
const { chromium } = require("playwright");

const DEFAULT_URL =
  "https://goldin.co/item/2023-24-panini-instant-black-19-victor-wembanyama-rookie-card-1-1-panihrjbw";
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const QUIET_HOURS_TIME_ZONE = "America/New_York";
const QUIET_HOURS_START = 1;
const QUIET_HOURS_END = 7;

function getConfig() {
  const checkIntervalMs = Number(
    process.env.CHECK_INTERVAL_MS || DEFAULT_INTERVAL_MS,
  );

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.EMAIL_TO) {
    throw new Error(
      "Missing email config. Set SMTP_USER, SMTP_PASS, and EMAIL_TO in .env.",
    );
  }

  return {
    goldinUrl: process.env.GOLDIN_URL || DEFAULT_URL,
    checkIntervalMs,
    statePath: process.env.STATE_PATH || path.join(process.cwd(), "state.json"),
    smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
    smtpPort: Number(process.env.SMTP_PORT || 465),
    smtpSecure: String(process.env.SMTP_SECURE || "true") === "true",
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    emailFrom: process.env.EMAIL_FROM || process.env.SMTP_USER,
    emailTo: process.env.EMAIL_TO,
    runOnce: String(process.env.RUN_ONCE || "false") === "true",
  };
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getCurrentHourInTimeZone(timeZone) {
  const formattedHour = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone,
  }).format(new Date());

  return Number(formattedHour);
}

function isWithinQuietHours() {
  const currentHour = getCurrentHourInTimeZone(QUIET_HOURS_TIME_ZONE);
  return currentHour >= QUIET_HOURS_START && currentHour < QUIET_HOURS_END;
}

function extractBidFromText(text) {
  const directMatch = text.match(/Current Bid:\s*\$([\d,]+(?:\.\d{2})?)/i);
  if (directMatch) {
    return Number(directMatch[1].replace(/,/g, ""));
  }

  const bidLabelIndex = text.search(/Current Bid:/i);
  if (bidLabelIndex >= 0) {
    const nearbyText = text.slice(bidLabelIndex, bidLabelIndex + 200);
    const nearbyMatch = nearbyText.match(/\$([\d,]+(?:\.\d{2})?)/);
    if (nearbyMatch) {
      return Number(nearbyMatch[1].replace(/,/g, ""));
    }
  }

  return null;
}

async function extractBidFromStructuredData(page) {
  const jsonLdScripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();

  for (const scriptText of jsonLdScripts) {
    try {
      const parsed = JSON.parse(scriptText);
      const offers = parsed && parsed.offers;
      if (offers && typeof offers.lowPrice === "number") {
        return offers.lowPrice;
      }
    } catch {
      // Ignore malformed JSON-LD and continue.
    }
  }

  return null;
}

async function fetchCurrentBid(browser, url) {
  const page = await browser.newPage();

  try {
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 120000,
    });

    const bodyText = await page.locator("body").innerText();
    const directBid = extractBidFromText(bodyText);

    if (directBid !== null) {
      return directBid;
    }

    const fallbackBid = await extractBidFromStructuredData(page);
    if (fallbackBid !== null) {
      return fallbackBid;
    }

    throw new Error("Could not find current bid on the page.");
  } finally {
    await page.close();
  }
}

async function loadState(statePath) {
  try {
    const content = await fs.readFile(statePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function saveState(statePath, state) {
  await fs.writeFile(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function sendBidChangeEmail(config, previousBid, currentBid) {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });

  const subject = `Goldin bid changed: ${formatCurrency(previousBid)} -> ${formatCurrency(currentBid)}`;
  const text = [
    "The Goldin bid changed.",
    "",
    `Previous bid: ${formatCurrency(previousBid)}`,
    `Current bid: ${formatCurrency(currentBid)}`,
    `Time: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}`,
    `URL: ${config.goldinUrl}`,
  ].join("\n");

  await transporter.sendMail({
    from: config.emailFrom,
    to: config.emailTo,
    subject,
    text,
  });
}

async function runCheck(browser, config) {
  if (isWithinQuietHours()) {
    console.log(`[skip] Quiet hours active in ${QUIET_HOURS_TIME_ZONE}; skipping check.`);
    return;
  }

  const currentBid = await fetchCurrentBid(browser, config.goldinUrl);
  const state = await loadState(config.statePath);
  const previousBid = typeof state.lastBid === "number" ? state.lastBid : null;

  if (previousBid === null) {
    await saveState(config.statePath, {
      lastBid: currentBid,
      lastCheckedAt: new Date().toISOString(),
    });
    console.log(`[init] Stored initial bid ${formatCurrency(currentBid)}`);
    return;
  }

  if (previousBid !== currentBid) {
    await sendBidChangeEmail(config, previousBid, currentBid);
    console.log(
      `[change] Bid changed from ${formatCurrency(previousBid)} to ${formatCurrency(currentBid)}`,
    );
  } else {
    console.log(`[same] Bid unchanged at ${formatCurrency(currentBid)}`);
  }

  await saveState(config.statePath, {
    lastBid: currentBid,
    lastCheckedAt: new Date().toISOString(),
  });
}

async function main() {
  const config = getConfig();
  const browser = await chromium.launch({ headless: true });

  console.log(`Watching ${config.goldinUrl}`);
  console.log(`Checking every ${config.checkIntervalMs}ms`);

  const runOnce = async () => {
    try {
      await runCheck(browser, config);
    } catch (error) {
      console.error(`[error] ${error.message}`);
    }
  };

  await runOnce();

  if (config.runOnce) {
    await browser.close();
    return;
  }

  const timer = setInterval(runOnce, config.checkIntervalMs);

  const shutdown = async () => {
    clearInterval(timer);
    await browser.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
