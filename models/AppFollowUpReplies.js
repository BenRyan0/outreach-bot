const mongoose = require("mongoose");

const AppFollowUpRepliesSchema = new mongoose.Schema(
  {
    messageId:      { type: String, required: true, unique: true },
    conversationId: { type: String, index: true },
    job_id:         { type: String, index: true, default: null },
    subject:        String,
    from:           String,
    bodyPreview:    String,
    bodyContent:    String,
    receivedAt:     Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "AppFollowUpReplies",
  AppFollowUpRepliesSchema,
  "app-follow-up-replies"
);
