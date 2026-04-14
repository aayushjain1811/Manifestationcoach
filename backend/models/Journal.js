const mongoose = require("mongoose");

const journalchema = new mongoose.Schema({
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
  link: String
});

module.exports = mongoose.model("Journal", journalchema);