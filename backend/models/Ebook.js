const mongoose = require("mongoose");

const EbookSchema = new mongoose.Schema({
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
  pdfPublicId: String,
  pdfOriginalName: String, // Add this field
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Ebook", ebookSchema);