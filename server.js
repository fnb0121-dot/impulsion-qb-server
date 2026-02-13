const express = require('express');
const axios = require('axios');
const qs = require('qs');
require('dotenv').config();

const app = express();

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

// Store tokens and realmId in memory
let accessToken = null;
let refreshToken = null;
let realmId = null;
let accessTokenExpiresAt = null;

// Generate a random state string
function generateState() {
  return Math.random().toString(36).substring(2);
}

// Middleware to refresh access token if expired
async function ensureAccessToken(req, res, next) {
  if (!accessToken || !refreshToken) {
    return res.status(400).json({ error: "Not connected to QuickBooks yet. Go to /connect first." });
  }

  const now = Date.now();
  if (accessTokenExpiresAt && now < accessTokenExpiresAt - 60000) {
    // Access token still valid
    return next();
  }

  // Refresh access token
  try {
    const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    const response = await axios.post(
      tokenUrl,
      qs.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      {
        auth: { username: clientId, password: clientSecret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    accessToken = response.data.access_token;
    refreshToken = response.data.refresh_token; // Intuit can return a new refresh token
    accessTokenExpiresAt = Date.now() + response.data.expires_in * 1000;

    console.log("Access token refreshed");
    next();
  } catch (err) {
    console.error("Error refreshing token:", err.response?.data || err.message);
    return res.status(500).json({ error: "Failed to refresh access token" });
  }
}

// Route to start OAuth flow
app.get('/connect', (req, res) => {
  const state = generateState();
  const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  console.log("Authorization URL being sent to QuickBooks:", authUrl);
  res.redirect(authUrl);
});

// Callback route for OAuth
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  realmId = req.query.realmId;

  if (!code || !realmId) {
    return res.status(400).send("Missing code or realmId in callback.");
  }

  try {
    const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    const response = await axios.post(
      tokenUrl,
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      }),
      {
        auth: { username: clientId, password: clientSecret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    accessToken = response.data.access_token;
    refreshToken = response.data.refresh_token;
    accessTokenExpiresAt = Date.now() + response.data.expires_in * 1000;

    console.log("Access Token:", accessToken);
    console.log("Refresh Token:", refreshToken);
    console.log("Connected QuickBooks company ID (realmId):", realmId);
    console.log("Token expires in (seconds):", response.data.expires_in);

    res.send('QuickBooks connected successfully! Check your terminal logs for tokens.');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error connecting to QuickBooks');
  }
});

// Company route with token refresh
app.get('/company', ensureAccessToken, async (req, res) => {
  try {
    const response = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("Company API error:", error.response?.data || error.message);
    res.status(500).send("Company fetch failed.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
app.get('/profitloss', async (req, res) => {
  try {
    const realmId = process.env.REALM_ID; // your connected company ID
    const token = process.env.ACCESS_TOKEN; // or fetch latest from stored tokens

    const response = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/reports/ProfitAndLoss?minorversion=65&date_macro=ThisFiscalYear`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send('Error fetching Profit & Loss report');
  }
});
// -----------------------------
// QuickBooks Profit & Loss Route with Automatic Token Refresh
// -----------------------------

const refreshAccessToken = async () => {
  const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
  const auth = Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64');

  try {
    const response = await axios.post(
      tokenUrl,
      'grant_type=refresh_token&refresh_token=' + process.env.REFRESH_TOKEN,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // Update environment variables with new tokens
    process.env.ACCESS_TOKEN = response.data.access_token;
    process.env.REFRESH_TOKEN = response.data.refresh_token; 

    console.log('Access token refreshed successfully');
    return response.data.access_token;
  } catch (error) {
    console.error('Error refreshing access token:', error.response?.data || error.message);
    throw error;
  }
};

app.get('/profitloss', async (req, res) => {
  try {
    // Always get the latest access token
    const token = await refreshAccessToken();

    const realmId = process.env.REALM_ID;
    const response = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/reports/ProfitAndLoss?minorversion=65&date_macro=ThisFiscalYear`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching Profit & Loss report:', error.response?.data || error.message);
    res.status(500).send('Error fetching Profit & Loss report');
  }
});
const axios = require('axios');

// ----------------------
// QuickBooks /connect route
// ----------------------
app.get('/connect', (req, res) => {
  const state = Math.random().toString(36).substring(2); // random state
  const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${process.env.CLIENT_ID}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&state=${state}`;

  console.log("Authorization URL being sent to QuickBooks:", authUrl);
  res.redirect(authUrl);
});

// ----------------------
// QuickBooks /profitloss route with auto token refresh
// ----------------------
let currentAccessToken = process.env.ACCESS_TOKEN;

const refreshAccessToken = async () => {
  const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
  const auth = Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64');

  try {
    const response = await axios.post(
      tokenUrl,
      'grant_type=refresh_token&refresh_token=' + process.env.REFRESH_TOKEN,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    currentAccessToken = response.data.access_token;
    process.env.REFRESH_TOKEN = response.data.refresh_token; // update latest refresh token
    console.log('Access token refreshed successfully');
    return currentAccessToken;
  } catch (error) {
    console.error('Error refreshing access token:', error.response?.data || error.message);
    throw error;
  }
};

app.get('/profitloss', async (req, res) => {
  try {
    const token = await refreshAccessToken();
    const realmId = process.env.REALM_ID;

    const response = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/reports/ProfitAndLoss?minorversion=65&date_macro=ThisFiscalYear`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching Profit & Loss report:', error.response?.data || error.message);
    res.status(500).send('Error fetching Profit & Loss report');
  }
});

