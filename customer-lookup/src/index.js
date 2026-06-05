const express = require("express");
const { lookupCustomer } = require("./salesforce");
const { verifySlackSignature, buildSlackResponse } = require("./slack");

const app = express();
const PORT = process.env.PORT || 8080;

// Parse URL-encoded bodies (Slack slash commands send this format)
// We also capture the raw body for signature verification
app.use(
  express.urlencoded({
    extended: true,
    verify: (req, _res, buf) => { req.rawBody = buf.toString(); },
  })
);
app.use(express.json());

// Health check — used by Cloud Run
app.get("/health", (_req, res) => res.json({ ok: true }));

// Slack slash command: /customer-check [name or company]
app.post("/slack/customer-check", async (req, res) => {
  if (!verifySlackSignature(req)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const query = (req.body.text || "").trim();

  if (!query) {
    return res.json({
      response_type: "ephemeral",
      text: "Usage: `/customer-check [company name or person name]`\n\nExample: `/customer-check Acme Corp` or `/customer-check John Smith`",
    });
  }

  // Slack requires a response within 3 seconds.
  // Send an immediate acknowledgement, then post the real result to response_url.
  const responseUrl = req.body.response_url;
  res.json({
    response_type: "ephemeral",
    text: `:mag: Looking up *${query}* in Salesforce…`,
  });

  // Do the actual lookup asynchronously
  try {
    const results = await lookupCustomer(query);
    const payload = buildSlackResponse(query, results);

    const axios = require("axios");
    await axios.post(responseUrl, payload);
  } catch (err) {
    console.error("Lookup error:", err?.response?.data || err.message);
    const axios = require("axios");
    await axios.post(responseUrl, {
      response_type: "ephemeral",
      text: `:warning: Something went wrong querying Salesforce. Please try again or check directly in SFDC.\n\`${err.message}\``,
    }).catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`Customer lookup service running on port ${PORT}`);
});
