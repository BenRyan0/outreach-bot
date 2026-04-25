const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");
require("dotenv").config();
const { getAccessToken } = require("./auth");

async function sendAndTrack(to, subject, htmlBody, fromName = null) {
  const token = await getAccessToken();
  const client = Client.init({
    authProvider: (done) => done(null, token),
  });

  const message = {
    subject,
    body: { contentType: "HTML", content: htmlBody },
    toRecipients: [{ emailAddress: { address: to } }],
  };

  if (fromName) {
    message.from = { emailAddress: { name: fromName, address: process.env.SENDER_EMAIL } };
  }

  // Create draft first to capture conversation/message IDs before sending
  const draft = await client
    .api(`/users/${process.env.SENDER_EMAIL}/messages`)
    .post(message);

  // Send the draft
  await client
    .api(`/users/${process.env.SENDER_EMAIL}/messages/${draft.id}/send`)
    .post({});

  return {
    conversationId:    draft.conversationId,
    internetMessageId: draft.internetMessageId,
  };
}

module.exports = { sendAndTrack };
