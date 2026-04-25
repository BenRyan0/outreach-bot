// run with: node scripts/testSend.js
require("dotenv").config();
const { sendAndTrack } = require("../graph/sendAndTrack");

const TO      = "gova.funding.7@gmail.com";
const SUBJECT = "Test Email";
const BODY    = "<p>This is a test email sent via Microsoft Graph API.</p>";

(async () => {
  console.log(`Sending test email to ${TO}...`);
  const { conversationId, internetMessageId } = await sendAndTrack(TO, SUBJECT, BODY);
  console.log("Done.");
  console.log("conversationId   :", conversationId);
  console.log("internetMessageId:", internetMessageId);
})();
