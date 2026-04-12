require("dotenv").config();
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
   ✅ Cloudinary Fetch
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
   ✅ Delete File
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
   🔥 CAL.COM (FINAL FIX v2)
=========================== */
app.get("/cal/bookings", async (req, res) => {
  const key = process.env.CAL_API_KEY;
  const username = process.env.CAL_USERNAME; // IMPORTANT

  if (!key || !username) {
    return res.status(500).json({
      error: "Missing CAL_API_KEY or CAL_USERNAME in .env"
    });
  }

  try {
    console.log("🔥 Fetching bookings...");

    const r = await fetch(
      `https://api.cal.com/v2/bookings?username=${username}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        }
      }
    );

    const data = await r.json();

    console.log("🔥 CAL RESPONSE:", data);

    if (!r.ok) {
      return res.status(r.status).json({
        error: "Cal API error",
        details: data
      });
    }

    res.json(data);

  } catch (e) {
    console.error("❌ Fetch error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/cal/cancel/:bookingId", async (req, res) => {
  const key = process.env.CAL_API_KEY;

  if (!key) {
    return res.status(500).json({ error: "CAL_API_KEY not set" });
  }

  try {
    const r = await fetch(
      `https://api.cal.com/v2/bookings/${req.params.bookingId}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reason: req.body.reason || "Cancelled by admin"
        })
      }
    );

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({
        error: "Cancel failed",
        details: data
      });
    }

    res.json(data);

  } catch (e) {
    console.error("❌ Cancel error:", e);
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
  res.json(data);
});

app.delete("/delete-ebook/:id", async (req, res) => {
  await Ebook.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

/* ===========================
   ✅ ACHIEVEMENTS APIs
=========================== */
app.get("/achievements", async (req, res) => {
  const data = await Achievement.find();
  res.json(data);
});

app.post("/add-achievement", async (req, res) => {
  const data = await Achievement.create(req.body);
  res.json(data);
});

app.put("/update-achievement/:id", async (req, res) => {
  const data = await Achievement.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(data);
});

app.delete("/delete-achievement/:id", async (req, res) => {
  await Achievement.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

/* ===========================
   ✅ JOURNAL APIs
=========================== */
app.get("/journal", async (req, res) => {
  const data = await Journal.find();
  res.json(data);
});

app.post("/add-journal", async (req, res) => {
  const data = await Journal.create(req.body);
  res.json(data);
});

app.put("/update-journal/:id", async (req, res) => {
  const data = await Journal.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(data);
});

app.delete("/delete-journal/:id", async (req, res) => {
  await Journal.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

/* ===========================
   ✅ START SERVER
=========================== */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});