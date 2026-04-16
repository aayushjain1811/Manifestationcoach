const mongoose = require("mongoose");

const CelebritySchema = new mongoose.Schema({
  name: { type: String, required: true },
  cat: { type: String, default: "bollywood" },   // bollywood | tv | music | business | sport | other
  desc: { type: String, default: "" },
  year: { type: String, default: "" },
  tag: { type: String, default: "" },             // custom tag label (optional override)
  img: { type: String, default: "" },
  imgPublicId: { type: String, default: "" },     // Cloudinary public_id for deletion
}, { timestamps: true });

module.exports = mongoose.model("Celebrity", CelebritySchema);