const mongoose = require("mongoose");

const journalSchema = new mongoose.Schema({
  title: String,
  cat: String,
  date: String,
  mood: String,
  excerpt: String,
  content: String,
  tags: [String],
  img: String,
  imgPublicId: String,
  source: String,
  platform: String,
  link: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Journal", journalSchema);