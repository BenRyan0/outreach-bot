const mongoose = require("mongoose");

const approvedApplicationSchema = new mongoose.Schema(
  {
    job_id:    { type: String, required: true, unique: true },
    email:     { type: String, required: true },
    first_name: String,
    last_name:  String,
    topic:     String,
    message:   String,
    join_url:  String,
    password:  String,
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "ApprovedApplication",
  approvedApplicationSchema,
  "approved-applications"
);
