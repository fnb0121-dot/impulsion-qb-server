// server.js
const express = require('express');
const axios = require('axios');
const qs = require('qs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI; // Must match QuickBooks Production app

// Simple in-memory token storage (replace with DB for production)
let tokens = {};

// Generate a random state for CSRF protection
const generateState = () => Math.random().toString(36).substring(2, 15);

// 1️⃣ Route to start OAuth
app.get('/connect', (req, res) => {
  const state = generateState();
  tokens.state = state; // store state temporarily

  const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  
  res.redirect(authUrl);
});

// 2️⃣ Callback route for QuickBooks to send authorization code
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state || state !== tokens.state) {
    return res.status(400).send('Invalid or missing authorization code/state');
  }

  try {
    const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    const response = await axios.post(
      tokenUrl,
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      }),
      {
        auth: { username: clientId, password: clientSecret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    tokens.accessToken = response.data.access_token;
    tokens.refreshToken = response.data.refresh_token;
    tokens.expiresIn = Date.now() + response.data.expires_in * 1000;

    console.log('Access Token:', tokens.accessToken);
    console.log('Refresh Token:', tokens.refreshToken);

    res.send('QuickBooks connected successfully! Tokens stored.');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error connecting to QuickBooks. Check logs.');
  }
});

// 3️⃣ Optional endpoint to refresh access token
app.get('/refresh', async (req, res) => {
  if (!tokens.refreshToken) return res.status(400).send('No refresh token available');

  try {
    const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    const response = await axios.post(
      tokenUrl,
      qs.stringify({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken
      }),
      {
        auth: { username: clientId, password: clientSecret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    tokens.accessToken = response.data.access_token;
    tokens.refreshToken = response.data.refresh_token;
    tokens.expiresIn = Date.now() + response.data.expires_in * 1000;

    console.log('Access Token refreshed:', tokens.accessToken);
    res.send('Access token refreshed successfully.');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error refreshing access token');
  }
});

// 4️⃣ Optional homepage with link to connect
app.get('/', (req, res) => {
  res.send('<h2>Impulsion Financial Dashboard</h2><a href="/connect">Connect QuickBooks</a>');
});

// Start server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
