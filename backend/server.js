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
app.use((req, res, next) => {
  res.setTimeout(120000); // 2 minutes
  next();
});

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
const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

app.post("/upload-image", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "image", folder: "admin_uploads/images" },
      (error, result) => {
        if (error) return res.status(500).json({ error });
        res.json({ url: result.secure_url, public_id: result.public_id });
      }
    );

    stream.end(req.file.buffer);
  } catch (err) {
    console.error("IMAGE UPLOAD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
app.post("/upload-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF uploaded" });
    }

    const result = await cloudinary.uploader.upload(
      `data:application/pdf;base64,${req.file.buffer.toString("base64")}`,
      {
        resource_type: "raw",
        folder: "admin_uploads/pdfs",
        timeout: 120000 // ⏱ increase timeout (60s)
      }
    );

    res.json({
      url: result.secure_url,
      public_id: result.public_id
    });

  } catch (err) {
    console.error("PDF UPLOAD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===========================
   ✅ Cloudinary Fetch
=========================== */
app.get("/get-images", async (req, res) => {
  try {
    const result = await cloudinary.api.resources({
      type: "upload",
      prefix: "admin_uploads/images",
      max_results: 50,
      resource_type: "image"
    });

    res.json(result.resources);
  } catch (err) {
    console.error("GET IMAGES ERROR:", err); // 👈 ADD THIS
    res.status(500).json({ error: err.message });
  }
});
app.get("/get-pdfs", async (req, res) => {
  try {
    const result = await cloudinary.api.resources({
      type: "upload",
      prefix: "admin_uploads/pdfs",
      max_results: 50,
      resource_type: "raw"
    });
    res.json(result.resources);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
   ✅ RAZORPAY
=========================== */
const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create session order
app.post("/razorpay/create-session-order", async (req, res) => {
  try {
    const { amount, currency = "INR", category, tier, tierName } = req.body;
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // convert to paise
      currency,
      receipt: `sess_${Date.now()}`.slice(0, 40),
      notes: { category, tier, tierName }
    });
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    });
  } catch (e) {
    console.error("❌ Razorpay order error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Verify session payment
app.post("/razorpay/verify-session", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      calUrl
    } = req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (expected === razorpay_signature) {
      console.log("✅ Payment verified:", razorpay_payment_id);
      res.json({
        success: true,
        paymentId: razorpay_payment_id,
        calUrl
      });
    } else {
      console.error("❌ Signature mismatch");
      res.status(400).json({ success: false, error: "Invalid signature" });
    }
  } catch (e) {
    console.error("❌ Verify error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Create ebook order
app.post("/razorpay/create-order", async (req, res) => {
  try {
    const { amount, currency = "INR", ebookId, ebookTitle } = req.body;

    const cleanText = (text) =>
      (text || "").replace(/[^\x00-\x7F]/g, ""); // remove bad characters

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency,
      receipt: `eb_${Date.now()}`.slice(0, 40),
      notes: {
        ebookTitle: cleanText(ebookTitle)   // ✅ FIXED
      }
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    });

  } catch (e) {
    console.error("❌ Razorpay ebook order error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Verify ebook payment
app.post("/razorpay/verify", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (expected === razorpay_signature) {
      res.json({ success: true, paymentId: razorpay_payment_id });
    } else {
      res.status(400).json({ success: false, error: "Invalid signature" });
    }
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
  const data = await Ebook.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
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
  const data = await Achievement.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
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
  const data = await Journal.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
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