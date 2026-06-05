# Customer Lookup — Setup Guide

Slack slash command: `/customer-check [company or person name]`
Looks up whether a company is a current or former Checkout.com customer in Salesforce.

---

## 1. Salesforce — Create a Connected App

1. In SFDC, go to **Setup → App Manager → New Connected App**
2. Enable **OAuth Settings**
3. Callback URL: `https://login.salesforce.com/services/oauth2/success` (not used but required)
4. OAuth Scopes: `api`, `refresh_token`
5. Save — note the **Consumer Key** and **Consumer Secret**
6. Create (or nominate) a dedicated API user with read access to Account and Contact objects
7. The password value is: `<password><security_token>` concatenated (no space)
   - Security token is reset via: Your Name → Settings → Reset My Security Token

> **Important:** the SOQL queries filter for Account.Type IN ('Customer', 'Former Customer', 'Strategic Partner/Customer').
> If your org uses different Type values, update `src/salesforce.js` lines ~30 and ~46.

---

## 2. Slack — Create the App

1. Go to https://api.slack.com/apps → **Create New App → From Scratch**
2. Name it `Customer Lookup`, pick your workspace
3. Go to **Slash Commands → Create New Command**
   - Command: `/customer-check`
   - Request URL: `https://YOUR_CLOUD_RUN_URL/slack/customer-check`
   - Short description: `Check if a company is a Checkout.com customer`
   - Usage hint: `[company name or person name]`
4. Go to **Basic Information** → copy the **Signing Secret**
5. **Install App to Workspace**

---

## 3. Deploy to Google Cloud Run

```bash
# One-time setup
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID

# Build and deploy
cd customer-lookup
gcloud run deploy cko-customer-lookup \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars "SF_LOGIN_URL=https://login.salesforce.com,SF_CLIENT_ID=XXX,SF_CLIENT_SECRET=XXX,SF_USERNAME=XXX,SF_PASSWORD=XXX,SLACK_SIGNING_SECRET=XXX"
```

Copy the deployed URL and paste it into the Slack slash command Request URL.

---

## 4. Local development

```bash
cd customer-lookup
cp .env.example .env
# fill in .env with your credentials

npm install
npm run dev
```

Use [ngrok](https://ngrok.com) to expose localhost to Slack for testing:
```bash
ngrok http 8080
# paste the https ngrok URL into Slack slash command Request URL temporarily
```

---

## What the result looks like in Slack

```
Customer lookup: "Klarna"
─────────────────────────────
🟢 Klarna Bank AB
Status: Customer  |  Account Manager: Jane Smith
─────────────────────────────
🟡 Klarna Inc (US)
Status: Former Customer  |  Account Manager: Bob Jones
─────────────────────────────
Data from Salesforce · Thu, 05 Jun 2026 10:00:00 GMT
```

Each result links directly to the SFDC account record. Account manager name is a clickable mailto link.

---

## Customising the SFDC query

The query lives in `src/salesforce.js` → `lookupCustomer()`.

Common adjustments:
- Change which `Type` values count as customers
- Add `Industry`, `AnnualRevenue`, or custom fields to the result
- Filter by a specific region or record type
