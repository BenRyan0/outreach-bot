const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");
require("dotenv").config();
const { getAccessToken } = require("./auth");

// Convert plain-text body to clean HTML — no <pre> tags (spam signal).
// Line breaks become <br>, paragraphs get proper spacing.
function toHtml(plainText) {
  const escaped = plainText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Make URLs clickable after escaping so the href is clean
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#1a73e8;text-decoration:none">$1</a>'
  );

  const paragraphs = linked
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0;line-height:1.6">${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  return (
    `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px;margin:0 auto;padding:20px">` +
    paragraphs +
    `</body></html>`
  );
}

async function sendAndTrack(to, subject, plainBody, fromName = null) {
  const token = await getAccessToken();
  const client = Client.init({
    authProvider: (done) => done(null, token),
  });

  const message = {
    subject,
    body: { contentType: "HTML", content: toHtml(plainBody) },
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
