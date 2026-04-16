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

// Helper function to clean notes
function cleanNotes(text) {
  if (!text) return '';
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
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Multer Setup
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ========== PDF UPLOAD ENDPOINT (WITH .pdf EXTENSION FIXED) ==========
app.post("/upload-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF uploaded" });
    }
    
    const originalName = req.body.originalName || req.file.originalname;
    
    // Validate file type
    if (req.file.mimetype !== 'application/pdf' && !originalName.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: "File must be a PDF" });
    }
    
    const fileSize = req.file.size;
    console.log(`📄 Uploading PDF: ${originalName}, Size: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
    
    // Check file size (max 50MB)
    if (fileSize > 50 * 1024 * 1024) {
      return res.status(400).json({ error: "File size exceeds 50MB limit" });
    }
    
    // Clean filename for Cloudinary - KEEP the .pdf extension
    const baseName = originalName
      .replace(/\.pdf$/i, '')  // Remove .pdf temporarily
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    
    const timestamp = Date.now();
    // FIXED: Add .pdf extension to the public ID
    const publicIdWithExt = `admin_uploads/pdfs/${baseName}_${timestamp}.pdf`;
    const publicIdWithoutExt = `admin_uploads/pdfs/${baseName}_${timestamp}`;
    
    // Upload to Cloudinary with public access
// REPLACE WITH:
const result = await new Promise((resolve, reject) => {
  const uploadStream = cloudinary.uploader.upload_stream(
    {
      resource_type: "raw",
      folder: "admin_uploads/pdfs",
      public_id: `${baseName}_${timestamp}.pdf`,
      access_mode: "public",
      type: "upload",
      overwrite: true,
      use_filename: false,
      unique_filename: false,
      invalidate: true,           // ← ADD: clears CDN cache
      tags: ["ebook_pdf", "public_access"],  // ← ADD: for tracking
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
    
    if (!result || !result.secure_url) {
      throw new Error("Upload failed - no URL returned");
    }
    
// REPLACE WITH:
let pdfUrl = result.secure_url;

// CRITICAL: Cloudinary raw files MUST use /raw/upload/ in the URL path
// Without this, the CDN serves 401 even for public assets
if (pdfUrl.includes('/upload/') && !pdfUrl.includes('/raw/upload/')) {
  pdfUrl = pdfUrl.replace('/upload/', '/raw/upload/');
}

// Ensure URL ends with .pdf
if (!pdfUrl.endsWith('.pdf')) {
  pdfUrl = pdfUrl + '.pdf';
}
    
    // Also ensure public_id has .pdf extension
    let publicId = result.public_id;
    if (!publicId.endsWith('.pdf')) {
      publicId = publicId + '.pdf';
    }
    
    console.log(`✅ PDF uploaded successfully: ${pdfUrl}`);
    console.log(`📁 Public ID: ${publicId}`);
    console.log(`📄 Original Name: ${originalName}`);
    
    res.json({
      success: true,
      url: pdfUrl,
      public_id: publicId,
      original_name: originalName,
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

// ========== UPLOAD IMAGE ==========
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

// ========== LIST PDFS ==========
app.get("/list-pdfs", async (req, res) => {
  try {
    const result = await cloudinary.api.resources({
      type: "upload",
      prefix: "ebooks/",
      max_results: 100,
      resource_type: "raw"
    });
    res.json(result.resources || []);
  } catch (err) {
    console.error("List PDFs error:", err);
    res.json([]);
  }
});

// ========== GET IMAGES ==========
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

// ========== DELETE FILE ==========
app.post("/delete-file", async (req, res) => {
  try {
    const { public_id, resource_type } = req.body;
    await cloudinary.uploader.destroy(public_id, { resource_type: resource_type || "image" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== CAL.COM ==========
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

// ========== RAZORPAY ==========
const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create Program Order
app.post("/razorpay/create-program-order", async (req, res) => {
  try {
    let { amount, currency = "INR", programName, programType } = req.body;
    const cleanProgramName = cleanNotes(programName) || "21-Day Program";
    const cleanProgramType = cleanNotes(programType) || "Program";
    const amountInSmallestUnit = Math.round(amount * 100);
    
    const order = await razorpay.orders.create({
      amount: amountInSmallestUnit,
      currency: currency,
      receipt: `program_${Date.now()}`,
      notes: {
        programName: cleanProgramName,
        programType: cleanProgramType
      }
    });
    
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    });
  } catch (error) {
    console.error("Razorpay program order error:", error);
    res.status(500).json({ error: error.error?.description || error.message });
  }
});

// Create Session Order
app.post("/razorpay/create-session-order", async (req, res) => {
  try {
    let { amount, currency = "INR", category, tier, tierName } = req.body;
    const cleanCategory = cleanNotes(category);
    const cleanTier = cleanNotes(tier);
    const cleanTierName = cleanNotes(tierName);
    const amountInSmallestUnit = Math.round(amount * 100);
    
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
    
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency });
  } catch (error) {
    console.error("Session order error:", error);
    res.status(500).json({ error: error.error?.description || error.message });
  }
});

// Create eBook Order
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

// ========== VERIFY EBOOK PAYMENT (FIXED WITH PDF DOWNLOAD) ==========
app.post("/razorpay/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");
    
// REPLACE WITH:
if (expectedSignature === razorpay_signature) {
  const { customerEmail, customerName, ebookTitle, ebookId } = req.body;
  
  // Fetch PDF URL directly from DB — never trust what frontend sends
  let pdfUrl = '';
  try {
    const ebookDoc = await Ebook.findById(ebookId);
    if (ebookDoc?.pdfUrl) {
      pdfUrl = ebookDoc.pdfUrl;
      // Ensure correct Cloudinary raw URL format
      if (pdfUrl.includes('/upload/') && !pdfUrl.includes('/raw/upload/')) {
        pdfUrl = pdfUrl.replace('/upload/', '/raw/upload/');
      }
    }
  } catch (e) {
    console.warn('Could not fetch ebook PDF URL:', e.message);
  }
      
      console.log(`✅ Payment verified for: ${customerEmail}, eBook: ${ebookTitle}`);
      console.log(`📄 PDF URL: ${pdfUrl}`);
      
      if (customerEmail) {
        // Send email with download link
        const emailHtml = `
          <div style="font-family:'DM Sans',sans-serif;max-width:600px;margin:0 auto;padding:2rem;background:#070a1a;color:#eceaf6;border:1px solid rgba(201,168,76,.2);border-radius:8px;">
            <div style="text-align:center;margin-bottom:2rem;">
              <h1 style="color:#c9a84c;font-family:'Cormorant Garamond',serif;">Thank You, ${customerName || 'Beautiful Soul'}! 💫</h1>
              <p style="color:#8e88ab;">Your purchase is confirmed</p>
            </div>
            
            <div style="background:rgba(201,168,76,.08);padding:1.5rem;border-radius:8px;margin:1.5rem 0;">
              <h3 style="color:#c9a84c;margin-bottom:1rem;">${ebookTitle}</h3>
              <p><strong>Payment ID:</strong> ${razorpay_payment_id}</p>
              <p><strong>Status:</strong> ✅ Completed</p>
            </div>
            
            <div style="text-align:center;margin:2rem 0;">
              <a href="${pdfUrl}" 
                 style="background:#c9a84c;color:#070a1a;padding:1rem 2rem;text-decoration:none;border-radius:4px;display:inline-block;font-weight:600;">
                📥 Download Your eBook Now
              </a>
              <p style="font-size:0.75rem;color:#8e88ab;margin-top:1rem;">
                If button doesn't work, copy this URL:<br>
                <a href="${pdfUrl}" style="color:#c9a84c;word-break:break-all;">${pdfUrl}</a>
              </p>
            </div>
            
            <div style="border-top:1px solid rgba(201,168,76,.2);margin-top:2rem;padding-top:1rem;text-align:center;">
              <p>With love & light ✨<br><strong>Akshita Dayma Goel</strong></p>
            </div>
          </div>
        `;
        
        await transporter.sendMail({
          from: `"Akshita Dayma Goel" <${process.env.GMAIL_USER}>`,
          to: customerEmail,
          subject: `Your eBook Download Link: ${ebookTitle} ✨`,
          html: emailHtml
        });
        
        console.log(`✅ Email sent to: ${customerEmail}`);
      }
      
      res.json({ 
        success: true, 
        paymentId: razorpay_payment_id,
        message: "Payment verified and email sent"
      });
    } else {
      console.error("❌ Invalid signature for payment");
      res.status(400).json({ success: false, error: "Invalid signature" });
    }
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Verify Program Payment
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
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:2rem;background:#070a1a;color:#eceaf6;">
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
// ADD THIS NEW ENDPOINT anywhere after your ebook routes:
app.post("/fix-pdf-urls", async (req, res) => {
  try {
    const ebooks = await Ebook.find({ pdfUrl: { $exists: true, $ne: '' } });
    let fixed = 0;
    for (const ebook of ebooks) {
      let url = ebook.pdfUrl;
      let changed = false;
      
      // Fix: ensure /raw/upload/ format
      if (url.includes('/upload/') && !url.includes('/raw/upload/')) {
        url = url.replace('/upload/', '/raw/upload/');
        changed = true;
      }
      // Fix: ensure .pdf extension
      if (!url.endsWith('.pdf') && !url.includes('?')) {
        url = url + '.pdf';
        changed = true;
      }
      
      if (changed) {
        await Ebook.findByIdAndUpdate(ebook._id, { pdfUrl: url });
        fixed++;
        console.log(`Fixed: ${ebook.title} → ${url}`);
      }
    }
    res.json({ success: true, fixed, total: ebooks.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Verify Session Payment
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

// ========== TESTIMONIAL APIs ==========
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

// ========== CELEBRITY APIs ==========
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

// ========== EBOOK APIs ==========
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

// ========== ACHIEVEMENTS APIs ==========
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

// ========== JOURNAL APIs ==========
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

// ========== CONTACT FORM API ==========
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

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Razorpay key loaded: ${process.env.RAZORPAY_KEY_ID ? "Yes" : "No"}`);
});