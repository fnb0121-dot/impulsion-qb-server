const express = require('express');
const axios = require('axios');
const qs = require('qs');
require('dotenv').config();

const app = express();

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

// Store tokens and realmId in memory (you can later move to DB for persistence)
let accessToken = null;
let refreshToken = null;
let realmId = null;

// Route to start OAuth flow
app.get('/connect', (req, res) => {
  const state = Math.random().toString(36).substring(2); // random state
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

  const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

  try {
    const response = await axios.post(
      tokenUrl,
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      }),
      {
        auth: {
          username: clientId,
          password: clientSecret
        },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    accessToken = response.data.access_token;
    refreshToken = response.data.refresh_token;

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

// Safe /company route
app.get('/company', async (req, res) => {
  if (!accessToken || !realmId) {
    return res.status(400).json({ error: "App not connected to QuickBooks yet. Go to /connect first." });
  }

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
