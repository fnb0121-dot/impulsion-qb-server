// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const querystring = require('querystring');
const app = express();

dotenv.config();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ---- Load tokens from .env ----
let accessToken = process.env.ACCESS_TOKEN || '';
let refreshToken = process.env.REFRESH_TOKEN || '';
const REALM_ID = process.env.REALM_ID;

// ---- Helper: save tokens to .env ----
function saveTokensToEnv(newAccessToken, newRefreshToken) {
  let envContent = fs.readFileSync('.env', 'utf-8');

  if (envContent.includes('ACCESS_TOKEN=')) {
    envContent = envContent.replace(/ACCESS_TOKEN=.*/g, `ACCESS_TOKEN=${newAccessToken}`);
  } else {
    envContent += `\nACCESS_TOKEN=${newAccessToken}`;
  }

  if (envContent.includes('REFRESH_TOKEN=')) {
    envContent = envContent.replace(/REFRESH_TOKEN=.*/g, `REFRESH_TOKEN=${newRefreshToken}`);
  } else {
    envContent += `\nREFRESH_TOKEN=${newRefreshToken}`;
  }

  fs.writeFileSync('.env', envContent);
}

// ---- OAuth connect route ----
app.get('/connect', (req, res) => {
  const state = Math.random().toString(36).substring(2);
  const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${process.env.CLIENT_ID}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&state=${state}`;
  console.log("Authorization URL being sent to QuickBooks:", authUrl);
  res.redirect(authUrl);
});

// ---- OAuth callback route ----
app.get('/callback', async (req, res) => {
  const { code } = req.query;
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

    saveTokensToEnv(accessToken, refreshToken);

    console.log("QuickBooks connected successfully!");
    console.log("Access Token:", accessToken);
    console.log("Refresh Token:", refreshToken);

    res.send("Connected successfully. You can now use /company or /profitloss");
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Error exchanging code for tokens");
  }
});

// ---- Helper: refresh access token if needed ----
async function getAccessToken() {
  if (!accessToken) throw new Error("No access token available. Connect first via /connect");

  try {
    // Refresh token with QuickBooks
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
    refreshToken = response.data.refresh_token;

    saveTokensToEnv(accessToken, refreshToken);
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

    const response = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${REALM_ID}/companyinfo/${REALM_ID}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
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

    const response = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${REALM_ID}/reports/ProfitAndLoss?minorversion=65&date_macro=ThisFiscalYear`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
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
