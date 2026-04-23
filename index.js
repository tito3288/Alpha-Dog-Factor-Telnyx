require("dotenv").config();
const express = require("express");
const telnyx = require("telnyx");

const app = express();
app.set("trust proxy", true);

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const TELNYX_PUBLIC_KEY = process.env.TELNYX_PUBLIC_KEY;

if (!SLACK_WEBHOOK_URL || !TELNYX_PUBLIC_KEY) {
  console.error("Missing SLACK_WEBHOOK_URL or TELNYX_PUBLIC_KEY env var");
  process.exit(1);
}

const publicKeyBuf = Buffer.from(TELNYX_PUBLIC_KEY, "base64");

app.post("/sms", express.raw({ type: "application/json" }), async (req, res) => {
  const rawBody = req.body.toString("utf8");
  const signatureHeader = req.header("telnyx-signature-ed25519");
  const timestamp = req.header("telnyx-timestamp");

  if (!signatureHeader || !timestamp) {
    console.warn("Rejected request missing Telnyx signature headers");
    return res.status(403).send("Forbidden");
  }

  const signatureBuf = Buffer.from(signatureHeader, "base64");

  let event;
  try {
    event = telnyx.webhooks.constructEvent(rawBody, signatureBuf, timestamp, publicKeyBuf);
  } catch (err) {
    if (err instanceof telnyx.errors.TelnyxSignatureVerificationError) {
      console.warn("Rejected request with invalid Telnyx signature", { reason: err.message });
      return res.status(403).send("Forbidden");
    }
    throw err;
  }

  if (event.data?.event_type !== "message.received") {
    console.log("Ignoring non-inbound event", { type: event.data?.event_type });
    return res.status(200).send("OK");
  }

  const from = event.data.payload.from.phone_number;
  const body = event.data.payload.text;

  try {
    const slackRes = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🔐 *2FA Code Received*\nFrom: ${from}\nMessage: *${body}*`
      })
    });
    if (!slackRes.ok) {
      console.error("Slack webhook returned non-OK", slackRes.status, await slackRes.text());
    }
  } catch (err) {
    console.error("Failed to post to Slack", err);
  }

  res.status(200).send("OK");
});

app.get("/health", (req, res) => res.send("ok"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SMS relay running on port ${PORT}`));
