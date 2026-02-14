// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
const querystring = require('querystring');

dotenv.config();

const app = express();
app.use(cors()); // Allow requests from any origin
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ---- In-memory token storage (for demo) ----
let accessToken = process.env.ACCESS_TOKEN;
let refreshToken = process.env.REFRESH_TOKEN;

// ---- OAuth connect route ----
app.get('/connect', (req, res) => {
  const state = Math.random().toString(36).substring(2);
  const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${process.env.CLIENT_ID}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&state=${state}`;
  console.log("Authorization URL being sent to QuickBooks:", authUrl);
  res.redirect(authUrl);
});

// ---- OAuth callback route ----
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send("No code returned from QuickBooks.");

  try {
    const tokenResponse = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      querystring.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI
      }),
      {
        auth: {
          username: process.env.CLIENT_ID,
          password: process.env.CLIENT_SECRET
        },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    accessToken = tokenResponse.data.access_token;
    refreshToken = tokenResponse.data.refresh_token;

    console.log("QuickBooks connected successfully!");
    console.log("Access Token:", accessToken);
    console.log("Refresh Token:", refreshToken);

    res.send("Connected successfully. You can now use /company or /profitloss");
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Error exchanging code for tokens");
  }
});

// ---- Helper: refresh access token ----
async function getAccessToken() {
  if (!accessToken) {
    throw new Error("No access token available. Connect first via /connect");
  }

  try {
    // You could check expiry here if stored, for simplicity we refresh every time
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      {
        auth: {
          username: process.env.CLIENT_ID,
          password: process.env.CLIENT_SECRET
        },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    accessToken = response.data.access_token;
    refreshToken = response.data.refresh_token; // update refresh token as well
    console.log("Access token refreshed");

    return accessToken;
  } catch (err) {
    console.error("Error refreshing access token:", err.response?.data || err.message);
    throw err;
  }
}

// ---- Company info route ----
app.get('/company', async (req, res) => {
  try {
    const token = await getAccessToken();
    const realmId = process.env.REALM_ID;

    const response = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Error fetching company info");
  }
});

// ---- Profit & Loss route ----
app.get('/profitloss', async (req, res) => {
  try {
    const token = await getAccessToken();
    const realmId = process.env.REALM_ID;

    const response = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/reports/ProfitAndLoss?minorversion=65&date_macro=ThisFiscalYear`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Error fetching Profit & Loss report");
  }
});

// ---- Start server ----
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
