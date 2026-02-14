// server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors()); // allow cross-origin requests from GHL
app.use(express.json());

// Environment variables
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;
const realmId = process.env.REALM_ID;
let accessToken = process.env.ACCESS_TOKEN; // update after OAuth
let refreshToken = process.env.REFRESH_TOKEN;

// --------------------
// OAuth2 Connect Route
// --------------------
app.get('/connect', (req, res) => {
  const state = Math.random().toString(36).substring(2);
  const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  console.log("Authorization URL being sent to QuickBooks:", authUrl);
  res.redirect(authUrl);
});

// --------------------
// OAuth2 Callback Route
// --------------------
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing authorization code");

  try {
    const tokenResponse = await axios({
      method: 'post',
      url: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      auth: {
        username: clientId,
        password: clientSecret,
      },
      data: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    accessToken = tokenResponse.data.access_token;
    refreshToken = tokenResponse.data.refresh_token;

    console.log("Connected successfully. You can now use /company or /profitloss");
    console.log("ACCESS TOKEN:", accessToken);
    console.log("REFRESH TOKEN:", refreshToken);
    console.log("Connected QuickBooks company ID (realmId):", realmId);

    res.send("QuickBooks connected successfully! Check your terminal logs for tokens.");
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Error exchanging authorization code for tokens");
  }
});

// --------------------
// Company Info Route
// --------------------
app.get('/company', async (req, res) => {
  try {
    const response = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Error fetching company info");
  }
});

// --------------------
// Profit & Loss Route
// --------------------
app.get('/profitloss', async (req, res) => {
  try {
    const response = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/reports/ProfitAndLoss?minorversion=65&date_macro=ThisFiscalYear`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Error fetching Profit & Loss report");
  }
});

// --------------------
// Start Server
// --------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
