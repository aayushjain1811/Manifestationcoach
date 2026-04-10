const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// ✅ Serve frontend (IMPORTANT for your structure)
app.use(express.static(path.join(__dirname, "../docs")));

/* ===========================
   ✅ MongoDB Connection
=========================== */
mongoose.connect("mongodb+srv://akshita:manifest%402026@cluster0.8zp0ync.mongodb.net/adg_db")
.then(()=>console.log("✅ MongoDB Connected"))
.catch(err=>console.log("❌ Mongo Error:", err));

/* ===========================
   ✅ Models (IMPORT FROM FILES)
=========================== */
const Testimonial = require("./models/Testimonial");
const Ebook = require("./models/Ebook");
const Achievement = require("./models/Achievement");
const Journal = require("./models/Journal");

/* ===========================
   ✅ Cloudinary Config
=========================== */
cloudinary.config({
  cloud_name: "drqk3j5cj",
  api_key: "199557378192441",
  api_secret: "onK7OzmxAF3Jns6pWIDrpUL_7rg"
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
  const { public_id, resource_type } = req.body;

  await cloudinary.uploader.destroy(public_id, {
    resource_type: resource_type || "image"
  });

  res.json({ success: true });
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

app.delete("/delete-journal/:id", async (req, res) => {
  await Journal.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});

/* ===========================
   ✅ START SERVER
=========================== */
app.listen(5000, () => {
  console.log("🚀 Server running on port 5000");
});