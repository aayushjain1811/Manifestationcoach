const mongoose = require("mongoose");

const testimonialSchema = new mongoose.Schema({
  cat: String,
  label: String,
  img: String,
  public_id: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Testimonial", testimonialSchema);