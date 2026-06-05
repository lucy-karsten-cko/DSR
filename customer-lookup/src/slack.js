const crypto = require("crypto");

/**
 * Verifies the Slack request signature to ensure the request came from Slack.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
function verifySlackSignature(req) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return true; // skip in local dev if not set

  const timestamp = req.headers["x-slack-request-timestamp"];
  const slackSig = req.headers["x-slack-signature"];

  if (!timestamp || !slackSig) return false;

  // Reject requests older than 5 minutes (replay attack prevention)
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const rawBody = req.rawBody || "";
  const baseString = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac("sha256", signingSecret).update(baseString).digest("hex");
  const expected = `v0=${hmac}`;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(slackSig));
}

const STATUS_EMOJI = {
  "Customer": ":large_green_circle:",
  "Former Customer": ":large_yellow_circle:",
  "Strategic Partner/Customer": ":large_green_circle:",
};

function statusEmoji(type) {
  return STATUS_EMOJI[type] || ":white_circle:";
}

/**
 * Builds a Slack Block Kit response for customer lookup results.
 */
function buildSlackResponse(query, results) {
  if (results.length === 0) {
    return {
      response_type: "ephemeral",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:mag: *No customer records found for "${query}"*\n\nThis company doesn't appear as a current or former Checkout.com customer in Salesforce.`,
          },
        },
      ],
    };
  }

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Customer lookup: "${query}"`,
        emoji: true,
      },
    },
    { type: "divider" },
  ];

  for (const r of results) {
    const emoji = statusEmoji(r.type);
    const matchLine =
      r.matchedOn === "contact"
        ? `\n>_Matched on contact: ${r.contactName}${r.contactTitle ? ` (${r.contactTitle})` : ""}_`
        : "";

    const amLine = r.accountManagerEmail
      ? `<mailto:${r.accountManagerEmail}|${r.accountManager}>`
      : r.accountManager;

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `${emoji} *<${r.sfLink}|${r.accountName}>*\n` +
          `*Status:* ${r.status}   |   *Account Manager:* ${amLine}` +
          matchLine,
      },
    });
    blocks.push({ type: "divider" });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `:salesforce: Data from Salesforce · ${new Date().toUTCString()}`,
      },
    ],
  });

  return { response_type: "ephemeral", blocks };
}

module.exports = { verifySlackSignature, buildSlackResponse };
