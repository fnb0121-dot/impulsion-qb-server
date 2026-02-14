const cors = require('cors');
app.use(cors()); // allow all origins
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const qs = require('querystring');

const app = express();
const PORT = process.env.PORT || 10000;

// Store tokens in memory
let accessToken = process.env.ACCESS_TOKEN || null;
let refreshToken = process.env.REFRESH_TOKEN || null;
let realmId = process.env.REALM_ID || null;

/* ===============================
   CONNECT TO QUICKBOOKS
================================ */
app.get('/connect', (req, res) => {
  const authUrl = `https://appcenter.intuit.com/connect/oauth2?` +
    qs.stringify({
      client_id: process.env.CLIENT_ID,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: process.env.REDIRECT_URI,
      state: 'random_state'
    });

  console.log("Redirecting to QuickBooks:", authUrl);
  res.redirect(authUrl);
});

/* ===============================
   CALLBACK FROM QUICKBOOKS
================================ */
app.get('/callback', async (req, res) => {
  try {
    const authCode = req.query.code;
    realmId = req.query.realmId;

    const tokenResponse = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      qs.stringify({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: process.env.REDIRECT_URI
      }),
      {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(
            `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
          ).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    accessToken = tokenResponse.data.access_token;
    refreshToken = tokenResponse.data.refresh_token;

    console.log("ACCESS TOKEN:", accessToken);
    console.log("REFRESH TOKEN:", refreshToken);
    console.log("REALM ID:", realmId);

    res.send('QuickBooks connected successfully. You can now use /company or /profitloss');
  } catch (error) {
    console.error("Callback Error:", error.response?.data || error.message);
    res.status(500).send('OAuth Error');
  }
});

/* ===============================
   COMPANY INFO
================================ */
app.get('/company', async (req, res) => {
  try {
    const response = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("Company Error:", error.response?.data || error.message);
    res.status(500).send('Error fetching company info');
  }
});

/* ===============================
   PROFIT & LOSS REPORT
================================ */
app.get('/profitloss', async (req, res) => {
  try {
    // Explicit start and end dates
    const startDate = '2026-01-01';
    const endDate = '2026-12-31';

    const response = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&minorversion=65`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("Profit & Loss FULL ERROR:", error.response?.data || error.message);
    res.status(500).send('Error fetching Profit & Loss report');
  }
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
