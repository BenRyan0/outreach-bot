const mongoose = require("mongoose");

const approvedApplicationOutreachSchema = new mongoose.Schema(
  {
    job_id:              { type: String, required: true, unique: true },
    messaged:            { type: Boolean, default: false },
    messaged_at:         { type: Date,    default: null  },
    attempts:            { type: Number,  default: 0     },
    last_error:          { type: String,  default: null  },
    reset_at:            { type: Date,    default: null  },
    conversation_id:     { type: String,  default: null  },
    internet_message_id: { type: String,  default: null  },
    reply_received:      { type: Boolean, default: false },
    reply_received_at:   { type: Date,    default: null  },
    reply_count:         { type: Number,  default: 0     },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "ApprovedApplicationOutreach",
  approvedApplicationOutreachSchema,
  "approved-application-outreach"
);
