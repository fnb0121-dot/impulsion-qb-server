// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const qs = require('qs');

const app = express();
app.use(cors());
app.use(express.json());

// --- Environment variables ---
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const REALM_ID = process.env.REALM_ID;

// Store tokens in memory
let ACCESS_TOKEN = process.env.ACCESS_TOKEN || '';
let REFRESH_TOKEN = process.env.REFRESH_TOKEN || '';

// --- OAuth Connect ---
app.get('/connect', (req, res) => {
  const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${CLIENT_ID}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=xyz123`;
  res.redirect(authUrl);
});

// --- OAuth Callback ---
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code returned');

  try {
    const tokenResponse = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
        }
      }
    );

    ACCESS_TOKEN = tokenResponse.data.access_token;
    REFRESH_TOKEN = tokenResponse.data.refresh_token;

    console.log('QuickBooks connected successfully!');
    console.log('Access Token:', ACCESS_TOKEN);
    console.log('Refresh Token:', REFRESH_TOKEN);

    res.send('Connected successfully. You can now use /company or /profitloss');
  } catch (err) {
    console.error('Error during /callback:', err.response?.data || err.message);
    res.status(500).send('Error connecting QuickBooks');
  }
});

// --- Refresh token helper ---
async function refreshAccessToken() {
  if (!REFRESH_TOKEN) throw new Error('No refresh token available');

  try {
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      qs.stringify({
        grant_type: 'refresh_token',
        refresh_token: REFRESH_TOKEN
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
        }
      }
    );

    ACCESS_TOKEN = response.data.access_token;
    REFRESH_TOKEN = response.data.refresh_token;

    console.log('Access token refreshed');
  } catch (err) {
    console.error('Error refreshing token:', err.response?.data || err.message);
    throw err;
  }
}

// --- QuickBooks API request helper ---
async function quickbooksGet(url) {
  if (!ACCESS_TOKEN) {
    throw new Error('No access token available. Connect first via /connect');
  }

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        Accept: 'application/json'
      }
    });
    return response.data;
  } catch (err) {
    // If token expired, refresh and retry
    if (err.response?.status === 401) {
      console.log('Access token expired, refreshing...');
      await refreshAccessToken();
      const retry = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          Accept: 'application/json'
        }
      });
      return retry.data;
    } else {
      console.error('QuickBooks API error:', err.response?.data || err.message);
      throw err;
    }
  }
}

// --- Get Company Info ---
app.get('/company', async (req, res) => {
  try {
    const data = await quickbooksGet(`https://quickbooks.api.intuit.com/v3/company/${REALM_ID}/companyinfo/${REALM_ID}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching company info', details: err.response?.data || err.message });
  }
});

// --- Get Profit & Loss Report (dynamic date range) ---
app.get('/profitloss', async (req, res) => {
  try {
    // Example: Year-to-date report
    const startDate = '2026-01-01'; // change to desired start
    const endDate = new Date().toISOString().slice(0, 10); // today YYYY-MM-DD

    const data = await quickbooksGet(
      `https://quickbooks.api.intuit.com/v3/company/${REALM_ID}/reports/ProfitAndLoss?minorversion=65&start_date=${startDate}&end_date=${endDate}`
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching Profit & Loss report', details: err.response?.data || err.message });
  }
});

// --- Start server ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
