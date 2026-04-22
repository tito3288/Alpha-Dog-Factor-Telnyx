require("dotenv").config();
const express = require("express");
const twilio = require("twilio");

const app = express();
app.set("trust proxy", true);
app.use(express.urlencoded({ extended: false }));

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

if (!SLACK_WEBHOOK_URL || !TWILIO_AUTH_TOKEN) {
  console.error("Missing SLACK_WEBHOOK_URL or TWILIO_AUTH_TOKEN env var");
  process.exit(1);
}

app.post("/sms", async (req, res) => {
  const signature = req.header("X-Twilio-Signature");
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const isValid = twilio.validateRequest(
    TWILIO_AUTH_TOKEN,
    signature,
    url,
    req.body
  );

  if (!isValid) {
    console.warn("Rejected request with invalid Twilio signature", { url });
    return res.status(403).send("Forbidden");
  }

  const { From, Body } = req.body;

  try {
    const slackRes = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🔐 *2FA Code Received*\nFrom: ${From}\nMessage: *${Body}*`
      })
    });
    if (!slackRes.ok) {
      console.error("Slack webhook returned non-OK", slackRes.status, await slackRes.text());
    }
  } catch (err) {
    console.error("Failed to post to Slack", err);
  }

  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");
});

app.get("/health", (req, res) => res.send("ok"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SMS relay running on port ${PORT}`));
