const mongoose = require("mongoose");

const ebookSchema = new mongoose.Schema({
  title: { type: String, required: true },
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
  pdfPublicId: String,
  pdfOriginalName: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Ebook", ebookSchema);