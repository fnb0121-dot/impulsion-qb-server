// ----------------------
// server.js
// ----------------------

const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

// ----------------------
// Global token storage
// ----------------------
let currentAccessToken = process.env.ACCESS_TOKEN;

// ----------------------
// /connect - start OAuth flow
// ----------------------
app.get('/connect', (req, res) => {
  const state = Math.random().toString(36).substring(2); // random state
  const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${process.env.CLIENT_ID}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&state=${state}`;

  console.log("Authorization URL being sent to QuickBooks:", authUrl);
  res.redirect(authUrl);
});

// ----------------------
// /callback - receive authorization code
// ----------------------
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) return res.status(400).send('Authorization code missing');

  const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
  const auth = Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64');

  try {
    const response = await axios.post(
      tokenUrl,
      `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    currentAccessToken = response.data.access_token;
    process.env.REFRESH_TOKEN = response.data.refresh_token; // save latest refresh token
    process.env.ACCESS_TOKEN = currentAccessToken;

    console.log('Connected QuickBooks successfully!');
    console.log('Access Token:', currentAccessToken);
    console.log('Refresh Token:', process.env.REFRESH_TOKEN);

    res.send('QuickBooks connected successfully! You can now use /profitloss and /company routes.');
  } catch (error) {
    console.error('Error exchanging code for tokens:', error.response?.data || error.message);
    res.status(500).send('Failed to connect to QuickBooks');
  }
});

// ----------------------
// Refresh access token
// ----------------------
const refreshAccessToken = async () => {
  const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
  const auth = Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64');

  try {
    const response = await axios.post(
      tokenUrl,
      `grant_type=refresh_token&refresh_token=${process.env.REFRESH_TOKEN}`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    currentAccessToken = response.data.access_token;
    process.env.REFRESH_TOKEN = response.data.refresh_token; // update refresh token
    console.log('Access token refreshed successfully');
    return currentAccessToken;
  } catch (error) {
    console.error('Error refreshing access token:', error.response?.data || error.message);
    throw error;
  }
};

// ----------------------
// /profitloss route
// ----------------------
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

// ----------------------
// /company route
// ----------------------
app.get('/company', async (req, res) => {
  try {
    const token = await refreshAccessToken();
    const realmId = process.env.REALM_ID;

    const response = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching company info:', error.response?.data || error.message);
    res.status(500).send('Error fetching company info');
  }
});

// ----------------------
// Start server
// ----------------------
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Available at your primary URL ${process.env.REDIRECT_URI.replace('/callback', '')}`);
});
