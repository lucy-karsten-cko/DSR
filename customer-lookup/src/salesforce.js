/**
 * Salesforce REST API client.
 *
 * Auth: OAuth2 username-password flow (simplest for a server app).
 * Required env vars:
 *   SF_LOGIN_URL        e.g. https://login.salesforce.com
 *   SF_CLIENT_ID        Connected App consumer key
 *   SF_CLIENT_SECRET    Connected App consumer secret
 *   SF_USERNAME         API user email
 *   SF_PASSWORD         API user password + security token concatenated
 */

const axios = require("axios");

let _token = null;
let _instanceUrl = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiry) return { token: _token, instanceUrl: _instanceUrl };

  const params = new URLSearchParams({
    grant_type: "password",
    client_id: process.env.SF_CLIENT_ID,
    client_secret: process.env.SF_CLIENT_SECRET,
    username: process.env.SF_USERNAME,
    password: process.env.SF_PASSWORD,
  });

  const res = await axios.post(
    `${process.env.SF_LOGIN_URL}/services/oauth2/token`,
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  _token = res.data.access_token;
  _instanceUrl = res.data.instance_url;
  _tokenExpiry = Date.now() + 55 * 60 * 1000; // refresh 5 min before 1h expiry
  return { token: _token, instanceUrl: _instanceUrl };
}

function sfGet(instanceUrl, token, soql) {
  return axios.get(`${instanceUrl}/services/data/v59.0/query`, {
    params: { q: soql },
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Returns customer status for a given search term.
 * Searches Accounts by name, and Contacts by name (returning their Account).
 *
 * @param {string} query - Company name or person name
 * @returns {Array<{accountName, type, status, accountManager, accountManagerEmail, sfLink}>}
 */
async function lookupCustomer(query) {
  const { token, instanceUrl } = await getAccessToken();
  const escaped = query.replace(/'/g, "\\'");

  // Search accounts by name
  const accountSOQL = `
    SELECT Id, Name, Type, Account_Status__c,
           Owner.Name, Owner.Email
    FROM Account
    WHERE Name LIKE '%${escaped}%'
      AND Type IN ('Customer', 'Former Customer', 'Strategic Partner/Customer')
    ORDER BY LastModifiedDate DESC
    LIMIT 10
  `;

  // Search contacts by name and pull their account
  const contactSOQL = `
    SELECT Id, Name, Title,
           Account.Id, Account.Name, Account.Type, Account.Account_Status__c,
           Account.Owner.Name, Account.Owner.Email
    FROM Contact
    WHERE Name LIKE '%${escaped}%'
      AND Account.Type IN ('Customer', 'Former Customer', 'Strategic Partner/Customer')
    ORDER BY LastModifiedDate DESC
    LIMIT 10
  `;

  const [accountRes, contactRes] = await Promise.all([
    sfGet(instanceUrl, token, accountSOQL).catch(() => ({ data: { records: [] } })),
    sfGet(instanceUrl, token, contactSOQL).catch(() => ({ data: { records: [] } })),
  ]);

  const results = new Map(); // keyed by account ID to dedupe

  for (const rec of accountRes.data.records) {
    results.set(rec.Id, {
      accountName: rec.Name,
      type: rec.Type,
      status: rec.Account_Status__c || rec.Type,
      accountManager: rec.Owner?.Name || "Unknown",
      accountManagerEmail: rec.Owner?.Email || null,
      sfLink: `${instanceUrl}/${rec.Id}`,
      matchedOn: "company",
      contactName: null,
      contactTitle: null,
    });
  }

  for (const rec of contactRes.data.records) {
    const acctId = rec.Account?.Id;
    if (!acctId || results.has(acctId)) continue; // skip if already found via account search
    results.set(acctId, {
      accountName: rec.Account.Name,
      type: rec.Account.Type,
      status: rec.Account.Account_Status__c || rec.Account.Type,
      accountManager: rec.Account.Owner?.Name || "Unknown",
      accountManagerEmail: rec.Account.Owner?.Email || null,
      sfLink: `${instanceUrl}/${acctId}`,
      matchedOn: "contact",
      contactName: rec.Name,
      contactTitle: rec.Title || null,
    });
  }

  return Array.from(results.values()).slice(0, 5);
}

module.exports = { lookupCustomer };
