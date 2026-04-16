const mongoose = require("mongoose");

const CelebritySchema = new mongoose.Schema({
  name: { type: String, required: true },
  cat: { type: String, default: "bollywood" },
  desc: { type: String, default: "" },
  year: { type: String, default: "" },
  tag: { type: String, default: "" },
  img: { type: String, default: "" },
  imgPublicId: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Celebrity", CelebritySchema);