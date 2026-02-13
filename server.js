// server.js
const express = require('express');
const axios = require('axios');
const qs = require('qs');
require('dotenv').config();

const app = express();

// Pull credentials from environment variables
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

// -----------------------
// Step 1: Connect route
// -----------------------
app.get('/connect', (req, res) => {
  const state = Math.random().toString(36).substring(2); // generates a random state
  const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  
  console.log("Authorization URL being sent to QuickBooks:", authUrl); // <--- debug line
  res.redirect(authUrl);
});

// -----------------------
// Step 2: Callback route
// -----------------------
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  const realmId = req.query.realmId;
  const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

  if (!code) {
    return res.status(400).send('No authorization code returned from QuickBooks');
  }

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

    const { access_token, refresh_token, expires_in } = response.data;

    // Log tokens (for debug; in production, store securely)
    console.log('Access Token:', access_token);
    console.log('Refresh Token:', refresh_token);
    console.log('Token expires in (seconds):', expires_in);
    console.log('Connected QuickBooks company ID (realmId):', realmId);

    res.send('QuickBooks connected successfully! Check your terminal logs for tokens.');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error connecting to QuickBooks. Check server logs.');
  }
});

// -----------------------
// Step 3: Start server
// -----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

