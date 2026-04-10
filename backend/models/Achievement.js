const mongoose = require("mongoose");

const achievementSchema = new mongoose.Schema({
  title: String,
  type: String,
  org: String,
  date: String,
  desc: String,
  img: String,
  imgPublicId: String,
  link: String
});

module.exports = mongoose.model("Achievement", achievementSchema);