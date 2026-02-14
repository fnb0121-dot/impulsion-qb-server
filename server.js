require('dotenv').config();
const express = require('express');
const axios = require('axios');
const qs = require('querystring');

const app = express();
const PORT = process.env.PORT || 10000;

// ========== CONNECT TO QUICKBOOKS ==========
app.get('/connect', (req, res) => {
  const authUrl =
    `https://appcenter.intuit.com/connect/oauth2?` +
    `client_id=${process.env.CLIENT_ID}` +
    `&redirect_uri=${process.env.REDIRECT_URI}` +
    `&response_type=code` +
    `&scope=com.intuit.quickbooks.accounting` +
    `&state=abc123`;

  res.redirect(authUrl);
});

// ========== CALLBACK ==========
app.get('/callback', async (req, res) => {
  const { code, realmId } = req.query;

  try {
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      qs.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.REDIRECT_URI,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(
              process.env.CLIENT_ID + ':' + process.env.CLIENT_SECRET
            ).toString('base64'),
        },
      }
    );

    process.env.ACCESS_TOKEN = response.data.access_token;
    process.env.REFRESH_TOKEN = response.data.refresh_token;
    process.env.REALM_ID = realmId;

    res.send('Connected successfully. You can now use /company or /profitloss');
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send('Error during callback');
  }
});

// ========== REFRESH TOKEN ==========
async function refreshAccessToken() {
  const response = await axios.post(
    'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: process.env.REFRESH_TOKEN,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(
            process.env.CLIENT_ID + ':' + process.env.CLIENT_SECRET
          ).toString('base64'),
      },
    }
  );

  process.env.ACCESS_TOKEN = response.data.access_token;
  process.env.REFRESH_TOKEN = response.data.refresh_token;

  return response.data.access_token;
}

// ========== COMPANY INFO ==========
app.get('/company', async (req, res) => {
  try {
    let token = process.env.ACCESS_TOKEN;

    try {
      const response = await axios.get(
        `https://quickbooks.api.intuit.com/v3/company/${process.env.REALM_ID}/companyinfo/${process.env.REALM_ID}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      res.json(response.data);
    } catch (error) {
      if (error.response?.status === 401) {
        token = await refreshAccessToken();

        const retry = await axios.get(
          `https://quickbooks.api.intuit.com/v3/company/${process.env.REALM_ID}/companyinfo/${process.env.REALM_ID}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          }
        );

        res.json(retry.data);
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send('Error fetching company info');
  }
});

// ========== PROFIT & LOSS ==========
app.get('/profitloss', async (req, res) => {
  try {
    let token = process.env.ACCESS_TOKEN;

    try {
      const response = await axios.get(
        `https://quickbooks.api.intuit.com/v3/company/${process.env.REALM_ID}/reports/ProfitAndLoss?minorversion=65&date_macro=ThisFiscalYear`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      res.json(response.data);
    } catch (error) {
      if (error.response?.status === 401) {
        token = await refreshAccessToken();

        const retry = await axios.get(
          `https://quickbooks.api.intuit.com/v3/company/${process.env.REALM_ID}/reports/ProfitAndLoss?minorversion=65&date_macro=ThisFiscalYear`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          }
        );

        res.json(retry.data);
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send('Error fetching Profit & Loss report');
  }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
