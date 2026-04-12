require("dotenv").config(); // ✅ load env

const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Serve frontend
app.use(express.static(path.join(__dirname, "../docs")));

/* ===========================
   ✅ MongoDB Connection
=========================== */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ Mongo Error:", err));

/* ===========================
   ✅ Models
=========================== */
const Testimonial = require("./models/Testimonial");
const Ebook = require("./models/Ebook");
const Achievement = require("./models/Achievement");
const Journal = require("./models/Journal");

/* ===========================
   ✅ Cloudinary Config
=========================== */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/* ===========================
   ✅ Multer Setup
=========================== */
const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ===========================
   ✅ Upload Image
=========================== */
app.post("/upload-image", upload.single("file"), async (req, res) => {
  try {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "image", folder: "admin_uploads/images" },
      (error, result) => {
        if (error) return res.status(500).json({ error });
        res.json({ url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(req.file.buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===========================
   ✅ Upload PDF
=========================== */
app.post("/upload-pdf", upload.single("file"), async (req, res) => {
  try {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "raw", folder: "admin_uploads/pdfs" },
      (error, result) => {
        if (error) return res.status(500).json({ error });
        res.json({ url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(req.file.buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===========================
   ✅ GET Cloudinary Files
=========================== */
app.get("/get-images", async (req, res) => {
  const result = await cloudinary.search
    .expression("folder:admin_uploads/images")
    .sort_by("created_at", "desc")
    .max_results(50)
    .execute();
  res.json(result.resources);
});

app.get("/get-pdfs", async (req, res) => {
  const result = await cloudinary.search
    .expression("folder:admin_uploads/pdfs")
    .sort_by("created_at", "desc")
    .max_results(50)
    .execute();
  res.json(result.resources);
});

/* ===========================
   ✅ DELETE FILE
=========================== */
app.post("/delete-file", async (req, res) => {
  try {
    const { public_id, resource_type } = req.body;
    await cloudinary.uploader.destroy(public_id, {
      resource_type: resource_type || "image"
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
/* ===========================
   ✅ CAL.COM PROXY
=========================== */

// GET bookings (key stays on server, never exposed to browser)
app.get("/cal/bookings", async (req, res) => {
  const key = process.env.CAL_API_KEY;
  if (!key) return res.status(500).json({ error: "CAL_API_KEY not set in .env" });

  try {
    const r = await fetch(
      `https://api.cal.com/v1/bookings?apiKey=${encodeURIComponent(key)}&take=100`
    );
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.message || `Cal.com error ${r.status}` });
    }
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST cancel a booking
app.post("/cal/cancel/:bookingId", async (req, res) => {
  const key = process.env.CAL_API_KEY;
  if (!key) return res.status(500).json({ error: "CAL_API_KEY not set in .env" });

  try {
    const r = await fetch(
      `https://api.cal.com/v1/bookings/${req.params.bookingId}/cancel?apiKey=${encodeURIComponent(key)}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: req.body.reason || "Cancelled by admin" })
      }
    );
    const data = await r.json().catch(() => ({ ok: true }));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ===========================
   ✅ TESTIMONIAL APIs
=========================== */
app.post("/add-testimonial", async (req, res) => {
  const data = await Testimonial.create(req.body);
  res.json(data);
});

app.get("/testimonials", async (req, res) => {
  const data = await Testimonial.find().sort({ _id: -1 });
  res.json(data);
});

app.delete("/delete-testimonial/:id", async (req, res) => {
  await Testimonial.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

/* ===========================
   ✅ EBOOK APIs
=========================== */
app.post("/add-ebook", async (req, res) => {
  const data = await Ebook.create(req.body);
  res.json(data);
});

app.get("/ebooks", async (req, res) => {
  const data = await Ebook.find().sort({ _id: -1 });
  res.json(data);
});

app.put("/update-ebook/:id", async (req, res) => {
  const data = await Ebook.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

app.delete("/delete-ebook/:id", async (req, res) => {
  await Ebook.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

/* ===========================
   ✅ ACHIEVEMENT APIs
=========================== */
app.get("/achievements", async (req, res) => {
  const data = await Achievement.find();
  res.json(data);
});

app.post("/add-achievement", async (req, res) => {
  const newItem = new Achievement(req.body);
  await newItem.save();
  res.json({ message: "Saved" });
});

app.put("/update-achievement/:id", async (req, res) => {
  const data = await Achievement.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

app.delete("/delete-achievement/:id", async (req, res) => {
  await Achievement.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});

/* ===========================
   ✅ JOURNAL APIs
=========================== */
app.get("/journal", async (req, res) => {
  const data = await Journal.find();
  res.json(data);
});

app.post("/add-journal", async (req, res) => {
  const newItem = new Journal(req.body);
  await newItem.save();
  res.json({ message: "Saved" });
});

app.put("/update-journal/:id", async (req, res) => {
  const data = await Journal.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

app.delete("/delete-journal/:id", async (req, res) => {
  await Journal.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});

/* ===========================
   ✅ START SERVER
=========================== */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});