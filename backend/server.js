require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const nodemailer = require('nodemailer');
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const app = express();

const allowedOrigins = [
  "https://www.universecrets.com",
  "https://aayushjain1811.github.io",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5500"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS blocked"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.options(/.*/, cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setTimeout(120000);
  next();
});

app.use(express.static(path.join(__dirname, "../docs")));

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS
  }
});

// Helper function to clean notes (remove emojis and special chars)
function cleanNotes(text) {
  if (!text) return '';
  // Remove emojis and special characters, keep only alphanumeric, spaces, and basic punctuation
  return text.replace(/[^\x00-\x7F]/g, '').replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().slice(0, 40);
}

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ Mongo Error:", err));

// Models
const Testimonial = require("./models/Testimonial");
const Ebook = require("./models/Ebook");
const Achievement = require("./models/Achievement");
const Journal = require("./models/Journal");
const Celebrity = require("./models/Celebrity");

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer Setup
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.post("/upload-image", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
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

// Add this to your server.js file - update the upload-pdf endpoint

// Update your /upload-pdf endpoint
// Replace your entire /upload-pdf endpoint with this:

app.post("/upload-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF uploaded" });
    }
    
    const originalName = req.body.originalName || req.file.originalname;
    
    // Ensure .pdf extension
    let fileName = originalName;
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      fileName = fileName + '.pdf';
    }
    
    const fileSize = req.file.size;
    console.log(`📄 Uploading PDF: ${fileName}, Size: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
    
    // Check file size (max 50MB)
    if (fileSize > 50 * 1024 * 1024) {
      return res.status(400).json({ error: "File size exceeds 50MB limit" });
    }
    
    // Clean filename for Cloudinary
    const cleanName = fileName
      .replace(/\.pdf$/i, '')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    
    const timestamp = Date.now();
    const publicId = `admin_uploads/pdfs/${cleanName}_${timestamp}`;
    
    // Convert buffer to base64
    const base64File = req.file.buffer.toString('base64');
    const dataUri = `data:application/pdf;base64,${base64File}`;
    
    let result;
    
    // Use different method based on file size
    if (fileSize > 10 * 1024 * 1024) {
      console.log(`🔄 Using chunked upload for large file...`);
      result = await cloudinary.uploader.upload_large(dataUri, {
        resource_type: "auto",
        folder: "admin_uploads/pdfs",
        public_id: publicId,
        chunk_size: 6000000,
        timeout: 180000,
        type: "upload",
        overwrite: true,
        invalidate: true
      });
    } else {
      console.log(`📤 Uploading small file...`);
      result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: "auto",
            folder: "admin_uploads/pdfs",
            public_id: publicId,
            type: "upload",
            overwrite: true,
            invalidate: true
          },
          (error, uploadResult) => {
            if (error) {
              console.error("Cloudinary upload error:", error);
              reject(error);
            } else {
              resolve(uploadResult);
            }
          }
        );
        uploadStream.end(req.file.buffer);
      });
    }
    
    if (!result || !result.secure_url) {
      throw new Error("Upload failed - no URL returned");
    }
    
    console.log(`✅ PDF uploaded successfully: ${result.secure_url}`);
    console.log(`📁 Public ID: ${result.public_id}`);
    
    res.json({
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
      original_name: fileName,
      size: fileSize
    });
    
  } catch (err) {
    console.error("❌ PDF UPLOAD ERROR:", err);
    res.status(500).json({ 
      error: err.message || "Upload failed",
      details: err.toString()
    });
  }
});

// Add this endpoint to verify PDF exists
app.get("/verify-pdf/:public_id", async (req, res) => {
  try {
    const { public_id } = req.params;
    const result = await cloudinary.api.resource(public_id, { resource_type: "auto" });
    res.json({
      exists: true,
      url: result.secure_url,
      public_id: result.public_id,
      bytes: result.bytes,
      format: result.format,
      resource_type: result.resource_type
    });
  } catch (err) {
    res.status(404).json({ 
      exists: false, 
      error: err.message 
    });
  }
});

// Add endpoint to list all PDFs
app.get("/list-pdfs", async (req, res) => {
  try {
    const result = await cloudinary.api.resources({
      type: "upload",
      prefix: "admin_uploads/pdfs",
      max_results: 100,
      resource_type: "auto"
    });
    res.json(result.resources);
  } catch (err) {
    console.error("List PDFs error:", err);
    res.status(500).json({ error: err.message });
  }
});

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
    console.error("GET IMAGES ERROR:", err);
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

app.post("/delete-file", async (req, res) => {
  try {
    const { public_id, resource_type } = req.body;
    await cloudinary.uploader.destroy(public_id, { resource_type: resource_type || "image" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CAL.COM
app.get("/cal/bookings", async (req, res) => {
  const key = process.env.CAL_API_KEY;
  const username = process.env.CAL_USERNAME;
  if (!key || !username) return res.status(500).json({ error: "Missing CAL_API_KEY or CAL_USERNAME in .env" });
  try {
    const r = await fetch(`https://api.cal.com/v2/bookings?username=${username}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: "Cal API error", details: data });
    res.json(data);
  } catch (e) {
    console.error("❌ Cal fetch error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/cal/cancel/:bookingId", async (req, res) => {
  const key = process.env.CAL_API_KEY;
  if (!key) return res.status(500).json({ error: "CAL_API_KEY not set" });
  try {
    const r = await fetch(`https://api.cal.com/v2/bookings/${req.params.bookingId}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: req.body.reason || "Cancelled by admin" })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: "Cancel failed", details: data });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// RAZORPAY
const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// PROGRAM ORDER ENDPOINT (Fixed for UTF-8)
app.post("/razorpay/create-program-order", async (req, res) => {
  try {
    let { amount, currency = "INR", programName, programType } = req.body;
    
    console.log("Received program order request:", { amount, currency, programName });
    
    // Clean the program name (remove emojis and special chars)
    const cleanProgramName = cleanNotes(programName) || "21-Day Program";
    const cleanProgramType = cleanNotes(programType) || "Program";
    
    // Convert amount to smallest unit (multiply by 100)
    const amountInSmallestUnit = Math.round(amount * 100);
    
    const orderOptions = {
      amount: amountInSmallestUnit,
      currency: currency,
      receipt: `program_${Date.now()}`,
      notes: {
        programName: cleanProgramName,
        programType: cleanProgramType
      }
    };
    
    console.log("Creating Razorpay order with:", orderOptions);
    
    const order = await razorpay.orders.create(orderOptions);
    
    console.log("Order created successfully:", order.id);
    
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    });
  } catch (error) {
    console.error("Razorpay program order error:", error);
    res.status(500).json({ 
      error: error.error?.description || error.message 
    });
  }
});

// SESSION ORDER ENDPOINT (Fixed for UTF-8)
app.post("/razorpay/create-session-order", async (req, res) => {
  try {
    let { amount, currency = "INR", category, tier, tierName } = req.body;
    
    // Clean the notes (remove emojis and special chars)
    const cleanCategory = cleanNotes(category);
    const cleanTier = cleanNotes(tier);
    const cleanTierName = cleanNotes(tierName);
    
    const amountInSmallestUnit = Math.round(amount * 100);
    
    // Validate amount doesn't exceed limits (Razorpay max is 100,000,000 INR)
    if (amountInSmallestUnit > 1000000000) {
      return res.status(400).json({ error: "Amount exceeds maximum allowed" });
    }
    
    const order = await razorpay.orders.create({
      amount: amountInSmallestUnit,
      currency: currency,
      receipt: `session_${Date.now()}`,
      notes: { 
        category: cleanCategory || 'Session',
        tier: cleanTier || '',
        tierName: cleanTierName || ''
      }
    });
    
    console.log("Session order created:", order.id);
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency });
  } catch (error) {
    console.error("Session order error:", error);
    res.status(500).json({ error: error.error?.description || error.message });
  }
});

// EBOOK ORDER ENDPOINT (Fixed for UTF-8)
app.post("/razorpay/create-order", async (req, res) => {
  try {
    let { amount, currency = "INR", ebookId, ebookTitle } = req.body;
    
    const cleanEbookTitle = cleanNotes(ebookTitle) || "eBook";
    const amountInSmallestUnit = Math.round(amount * 100);
    
    const order = await razorpay.orders.create({
      amount: amountInSmallestUnit,
      currency: currency,
      receipt: `ebook_${Date.now()}`,
      notes: { 
        ebookId: String(ebookId || ''),
        ebookTitle: cleanEbookTitle
      }
    });
    
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency });
  } catch (error) {
    console.error("Ebook order error:", error);
    res.status(500).json({ error: error.error?.description || error.message });
  }
});

// VERIFY PROGRAM PAYMENT
app.post("/razorpay/verify-program", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, calUrl, customerEmail, customerName, programName, amount } = req.body;
    
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");
    
    if (expectedSignature === razorpay_signature) {
      if (customerEmail) {
        await transporter.sendMail({
          from: `"Akshita Dayma Goel" <${process.env.GMAIL_USER}>`,
          to: customerEmail,
          subject: "Your 21-Day Program Booking Confirmed ✨",
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:2rem;background:#070a1a;color:#eceaf6;">
              <h2 style="color:#c9a84c;">You're in, ${customerName || 'Beautiful Soul'}! 💫</h2>
              <p>Your payment for <strong>${programName || '21-Day Program'}</strong> is confirmed.</p>
              <div style="background:rgba(201,168,76,.08);padding:1.2rem;margin:1.5rem 0;">
                <p><strong>Amount Paid:</strong> ${amount || '₹70,000'}</p>
                <p><strong>Payment ID:</strong> ${razorpay_payment_id}</p>
              </div>
              <div style="text-align:center;margin:2rem 0;">
                <a href="${calUrl}" style="background:#c9a84c;color:#070a1a;padding:1rem 2rem;text-decoration:none;">📅 Book Your Session</a>
              </div>
              <p>With love & light ✨<br><strong>Akshita Dayma Goel</strong></p>
            </div>
          `
        });
      }
      res.json({ success: true, paymentId: razorpay_payment_id, calUrl });
    } else {
      res.status(400).json({ success: false, error: "Invalid signature" });
    }
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ error: error.message });
  }
});

// VERIFY SESSION PAYMENT
app.post("/razorpay/verify-session", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, calUrl, customerEmail, customerName, programName, amount } = req.body;
    
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");
    
    if (expectedSignature === razorpay_signature) {
      if (customerEmail) {
        await transporter.sendMail({
          from: `"Akshita Dayma Goel" <${process.env.GMAIL_USER}>`,
          to: customerEmail,
          subject: "Your Session Booking Confirmed ✨",
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:2rem;background:#070a1a;color:#eceaf6;">
            <h2 style="color:#c9a84c;">Session Confirmed, ${customerName || 'Beautiful Soul'}! 💫</h2>
            <p>Your payment for <strong>${programName || 'Session'}</strong> is confirmed.</p>
            <div style="background:rgba(201,168,76,.08);padding:1.2rem;margin:1.5rem 0;">
              <p><strong>Amount Paid:</strong> ${amount || 'Confirmed'}</p>
              <p><strong>Payment ID:</strong> ${razorpay_payment_id}</p>
            </div>
            <div style="text-align:center;margin:2rem 0;">
              <a href="${calUrl}" style="background:#c9a84c;color:#070a1a;padding:1rem 2rem;text-decoration:none;">📅 Book Your Session</a>
            </div>
            <p>With love & light ✨<br><strong>Akshita Dayma Goel</strong></p>
          </div>`
        });
      }
      res.json({ success: true, paymentId: razorpay_payment_id, calUrl });
    } else {
      res.status(400).json({ success: false, error: "Invalid signature" });
    }
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ error: error.message });
  }
});

// VERIFY EBOOK PAYMENT
app.post("/razorpay/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");
    
    if (expectedSignature === razorpay_signature) {
      const { customerEmail, customerName, ebookTitle, pdfUrl } = req.body;
      if (customerEmail) {
        await transporter.sendMail({
          from: `"Akshita Dayma Goel" <${process.env.GMAIL_USER}>`,
          to: customerEmail,
          subject: "Your eBook Download Link ✨",
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:2rem;background:#070a1a;color:#eceaf6;">
            <h2 style="color:#c9a84c;">Thank you, ${customerName || 'Beautiful Soul'}! 💫</h2>
            <p>Your purchase of <strong>${ebookTitle || 'eBook'}</strong> is confirmed.</p>
            <div style="background:rgba(201,168,76,.08);padding:1.2rem;margin:1.5rem 0;">
              <p><strong>Payment ID:</strong> ${razorpay_payment_id}</p>
              ${pdfUrl ? `<p><strong>Download Link:</strong> <a href="${pdfUrl}" style="color:#c9a84c;">Click here</a></p>` : ''}
            </div>
            <p>With love & light ✨<br><strong>Akshita Dayma Goel</strong></p>
          </div>`
        });
      }
      res.json({ success: true, paymentId: razorpay_payment_id });
    } else {
      res.status(400).json({ success: false, error: "Invalid signature" });
    }
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ error: error.message });
  }
});

// TESTIMONIAL APIs
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

// CELEBRITY APIs
app.get("/celebrities", async (req, res) => {
  try {
    const data = await Celebrity.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/add-celebrity", async (req, res) => {
  try {
    const data = await Celebrity.create(req.body);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/update-celebrity/:id", async (req, res) => {
  try {
    const data = await Celebrity.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/delete-celebrity/:id", async (req, res) => {
  try {
    await Celebrity.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// EBOOK APIs
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

// ACHIEVEMENTS APIs
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

// JOURNAL APIs
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

// CONTACT FORM API
app.post("/contact", async (req, res) => {
  try {
    const { firstName, lastName, email, message } = req.body;
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    if (!fullName || !email || !message) return res.status(400).json({ error: "All fields required" });
    await transporter.sendMail({
      from: `"Website Contact" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: `New Contact Form Submission`,
      html: `<div><h2>New Contact Message</h2><p><strong>Name:</strong> ${fullName}</p><p><strong>Email:</strong> ${email}</p><p><strong>Message:</strong></p><p>${message}</p></div>`
    });
    res.json({ success: true });
  } catch (err) {
    console.error("CONTACT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Razorpay key loaded: ${process.env.RAZORPAY_KEY_ID ? "Yes" : "No"}`);
});