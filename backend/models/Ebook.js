const mongoose = require("mongoose");

const ebookSchema = new mongoose.Schema({
  title: String,
  tag: String,
  price: String,
  priceInr: String,
  orig: String,
  origInr: String,
  desc: String,
  features: [String],
  badge: String,
  img: String,
  imgPublicId: String,
  pdfUrl: String,
  pdfPublicId: String
});

module.exports = mongoose.model("Ebook", ebookSchema);