const express = require('express');
const axios = require('axios');
const qs = require('qs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

// 1️⃣ Route to start QuickBooks OAuth
app.get('/connect', (req, res) => {
  const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${redirectUri}&state=12345`;
  res.redirect(authUrl);
});

// 2️⃣ Callback route for QuickBooks to send authorization code
app.get('/callback', async (req, res) => {
  const code = req.query.code;
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

    const { access_token, refresh_token } = response.data;

    console.log('Access Token:', access_token);
    console.log('Refresh Token:', refresh_token);

    res.send('QuickBooks connected successfully! Check your terminal logs.');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.send('Error connecting to QuickBooks');
  }
});

// 3️⃣ Optional: simple homepage with "Connect QuickBooks" link
app.get('/', (req, res) => {
  res.send('<h2>Impulsion Financial Dashboard</h2><a href="/connect">Connect QuickBooks</a>');
});

// Start server
app.listen(PORT, () => console.log(`Server running at http://localhost:${


