const { ConfidentialClientApplication } = require("@azure/msal-node");
require("dotenv").config();

const cca = new ConfidentialClientApplication({
  auth: {
    clientId:     process.env.CLIENT_ID,
    authority:    `https://login.microsoftonline.com/${process.env.TENANT_ID}`,
    clientSecret: process.env.CLIENT_SECRET,
  },
});

async function getAccessToken() {
  const result = await cca.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  return result.accessToken;
}

module.exports = { getAccessToken };
