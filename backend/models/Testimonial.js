const mongoose = require("mongoose");

const testimonialSchema = new mongoose.Schema({
  cat: String,
  label: String,
  img: String,
  public_id: String
});

module.exports = mongoose.model("Testimonial", testimonialSchema);