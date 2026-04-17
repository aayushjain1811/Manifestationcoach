require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const nodemailer = require('nodemailer');
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const crypto = require("crypto");

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

// ========== Download Token Model for Secure Temporary Links ==========
const DownloadTokenSchema = new mongoose.Schema({
  token: { 
    type: String, 
    required: true, 
    unique: true  // ← This creates the unique index
  },
  ebookId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Ebook', 
    required: true 
  },
  customerEmail: { 
    type: String, 
    required: true 
  },
  customerName: { 
    type: String, 
    default: '' 
  },
  paymentId: { 
    type: String, 
    required: true 
  },
  expiresAt: { 
    type: Date, 
    required: true 
  },
  used: { 
    type: Boolean, 
    default: false 
  },
  downloadCount: { 
    type: Number, 
    default: 0 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Only TTL index for auto-deletion (no duplicate unique index)
DownloadTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const DownloadToken = mongoose.model('DownloadToken', DownloadTokenSchema);

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

// ========== SECURE DOWNLOAD ENDPOINT ==========
app.get("/download/:token", async (req, res) => {
  try {
    const { token } = req.params;
    
    // Find and validate token
    const tokenDoc = await DownloadToken.findOne({ 
      token: token,
      expiresAt: { $gt: new Date() },
      used: false
    });
    
    if (!tokenDoc) {
      // Check if expired or used for better error message
      const existingToken = await DownloadToken.findOne({ token: token });
      if (existingToken && existingToken.expiresAt <= new Date()) {
        return res.status(410).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Link Expired</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #070a1a; color: #eceaf6;">
            <h1 style="color: #c9a84c;">🔗 Link Expired</h1>
            <p>This download link has expired (valid for 24 hours only).</p>
            <p>Please contact support to get a new link.</p>
            <a href="/" style="color: #c9a84c;">← Back to Home</a>
          </body>
          </html>
        `);
      }
      if (existingToken && existingToken.used) {
        return res.status(410).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Link Already Used</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #070a1a; color: #eceaf6;">
            <h1 style="color: #c9a84c;">⚠️ Link Already Used</h1>
            <p>This download link has already been used.</p>
            <p>Links are valid for one download only to protect your purchase.</p>
            <a href="/" style="color: #c9a84c;">← Back to Home</a>
          </body>
          </html>
        `);
      }
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Invalid Link</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #070a1a; color: #eceaf6;">
          <h1 style="color: #c9a84c;">❌ Invalid Download Link</h1>
          <p>The download link is invalid or has been tampered with.</p>
          <a href="/" style="color: #c9a84c;">← Back to Home</a>
        </body>
        </html>
      `);
    }
    
    // Get ebook details
    const ebook = await Ebook.findById(tokenDoc.ebookId);
    if (!ebook || !ebook.pdfUrl) {
      console.error(`❌ Ebook not found or has no PDF: ${tokenDoc.ebookId}`);
      return res.status(404).send('Ebook file not found. Please contact support.');
    }
    
    console.log(`📥 Secure download requested: ${tokenDoc.customerEmail} - ${ebook.title}`);
    
    // Mark token as used immediately (one-time use)
    tokenDoc.used = true;
    tokenDoc.downloadCount = 1;
    await tokenDoc.save();
    
    // Fetch PDF from Cloudinary and stream to user
    try {
      const pdfResponse = await fetch(ebook.pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch PDF: ${pdfResponse.status}`);
      }
      
      // Set headers for download
      const safeFilename = ebook.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.pdf';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Stream the PDF
      pdfResponse.body.pipe(res);
      
      console.log(`✅ Secure download completed for: ${tokenDoc.customerEmail}`);
      
    } catch (streamError) {
      console.error('❌ Error streaming PDF:', streamError);
      // If streaming fails, try to redirect to a signed Cloudinary URL as fallback
      const signedUrl = cloudinary.url(ebook.pdfPublicId, {
        resource_type: 'raw',
        secure: true,
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 300 // 5 minutes
      });
      res.redirect(signedUrl);
    }
    
  } catch (error) {
    console.error('❌ Download error:', error);
    res.status(500).send('Internal server error. Please contact support.');
  }
});

// ========== PDF UPLOAD ENDPOINT ==========
app.post("/upload-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF uploaded" });
    }
    
    const originalName = req.body.originalName || req.file.originalname;
    
    if (req.file.mimetype !== 'application/pdf' && !originalName.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: "File must be a PDF" });
    }
    
    const fileSize = req.file.size;
    console.log(`📄 Uploading PDF: ${originalName}, Size: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
    
    if (fileSize > 50 * 1024 * 1024) {
      return res.status(400).json({ error: "File size exceeds 50MB limit" });
    }
    
    const baseName = originalName
      .replace(/\.pdf$/i, '')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    
    const timestamp = Date.now();
    
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
    
    if (!result || !result.secure_url) {
      throw new Error("Upload failed - no URL returned");
    }
    
    let pdfUrl = result.secure_url;
    
    if (pdfUrl.includes('/upload/') && !pdfUrl.includes('/raw/upload/')) {
      pdfUrl = pdfUrl.replace('/upload/', '/raw/upload/');
    }
    
    if (!pdfUrl.endsWith('.pdf')) {
      pdfUrl = pdfUrl + '.pdf';
    }
    
    let publicId = result.public_id;
    if (!publicId.endsWith('.pdf')) {
      publicId = publicId + '.pdf';
    }
    
    console.log(`✅ PDF uploaded successfully: ${pdfUrl}`);
    
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
      prefix: "admin_uploads/pdfs",
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

// ========== UPDATED: VERIFY EBOOK PAYMENT WITH SECURE TOKEN ==========
app.post("/razorpay/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");
    
    if (expectedSignature === razorpay_signature) {
      const { customerEmail, customerName, ebookTitle, ebookId } = req.body;
      
      // Fetch ebook details from database
      let pdfUrl = '';
      let pdfPublicId = '';
      let ebookDoc = null;
      
      try {
        ebookDoc = await Ebook.findById(ebookId);
        if (ebookDoc && ebookDoc.pdfUrl) {
          pdfUrl = ebookDoc.pdfUrl;
          pdfPublicId = ebookDoc.pdfPublicId;
          console.log(`📄 Retrieved PDF URL from DB: ${pdfUrl}`);
        } else {
          console.warn(`⚠️ No PDF found for ebook ID: ${ebookId}`);
        }
      } catch (e) {
        console.warn('Could not fetch ebook PDF URL:', e.message);
      }
      
      console.log(`✅ Payment verified for: ${customerEmail}, eBook: ${ebookTitle}`);
      
      let downloadLink = '';
      let tempDownloadUrl = '';
      
      if (customerEmail && pdfUrl && ebookDoc) {
        // Generate secure download token
        const token = crypto.randomBytes(48).toString('hex');
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiry
        
        const tokenDoc = await DownloadToken.create({
          token: token,
          ebookId: ebookDoc._id,
          customerEmail: customerEmail,
          customerName: customerName || '',
          paymentId: razorpay_payment_id,
          expiresAt: expiresAt,
          used: false
        });
        
        // Create secure download link
        const baseUrl = process.env.BASE_URL || `https://${req.get('host')}`;
        downloadLink = `${baseUrl}/download/${token}`;
        tempDownloadUrl = downloadLink;
        
        console.log(`🔐 Secure token created: ${token}`);
        console.log(`🔗 Download link: ${downloadLink}`);
        console.log(`⏰ Expires: ${expiresAt.toISOString()}`);
        
        // Send email with secure temporary link
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
              <p><strong>Link valid until:</strong> ${expiresAt.toLocaleString()}</p>
            </div>
            
            <div style="text-align:center;margin:2rem 0;">
              <a href="${downloadLink}" 
                 style="background:#c9a84c;color:#070a1a;padding:1rem 2rem;text-decoration:none;border-radius:4px;display:inline-block;font-weight:600;">
                📥 Download Your eBook Now
              </a>
              <p style="font-size:0.75rem;color:#8e88ab;margin-top:1rem;">
                🔒 <strong>Secure one-time link</strong> · Valid for 24 hours only<br>
                This link can be used only once. After downloading, it will expire immediately.
              </p>
              <p style="font-size:0.7rem;color:#8e88ab;margin-top:0.5rem;">
                If the button doesn't work, copy this URL:<br>
                <span style="word-break:break-all;color:#c9a84c;">${downloadLink}</span>
              </p>
            </div>
            
            <div style="border-top:1px solid rgba(201,168,76,.2);margin-top:2rem;padding-top:1rem;text-align:center;">
              <p style="font-size:0.7rem;">⚠️ For security, this link expires in 24 hours and works only once.</p>
              <p>With love & light ✨<br><strong>Akshita Dayma Goel</strong></p>
            </div>
          </div>
        `;
        
        await transporter.sendMail({
          from: `"Akshita Dayma Goel" <${process.env.GMAIL_USER}>`,
          to: customerEmail,
          subject: `🔐 Your Secure Download Link: ${ebookTitle} ✨`,
          html: emailHtml
        });
        
        console.log(`✅ Secure link email sent to: ${customerEmail}`);
      } else {
        console.error(`❌ Missing required data for token generation. Email: ${customerEmail}, PDF: ${!!pdfUrl}`);
      }
      
      res.json({ 
        success: true, 
        paymentId: razorpay_payment_id,
        tempDownloadUrl: tempDownloadUrl,
        message: "Payment verified. Secure download link sent to email."
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

// ========== ADMIN: VIEW DOWNLOAD TOKENS ==========
app.get("/admin/download-tokens", async (req, res) => {
  try {
    // In production, add admin authentication here
    const tokens = await DownloadToken.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('ebookId', 'title');
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== CLEANUP EXPIRED TOKENS (Manual endpoint) ==========
app.post("/admin/cleanup-tokens", async (req, res) => {
  try {
    const result = await DownloadToken.deleteMany({ 
      expiresAt: { $lt: new Date() } 
    });
    res.json({ 
      success: true, 
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== FIX PDF URLS ENDPOINT ==========
app.post("/fix-pdf-urls", async (req, res) => {
  try {
    const ebooks = await Ebook.find({ pdfUrl: { $exists: true, $ne: '' } });
    let fixed = 0;
    for (const ebook of ebooks) {
      let url = ebook.pdfUrl;
      let changed = false;
      
      if (url.includes('/upload/') && !url.includes('/raw/upload/')) {
        url = url.replace('/upload/', '/raw/upload/');
        changed = true;
      }
      
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
  console.log(`✅ Secure download endpoint: /download/:token`);
  console.log(`✅ Token expiry: 24 hours, one-time use`);
});