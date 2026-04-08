const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Cloudinary config
cloudinary.config({
cloud_name: "drqk3j5cj",
  api_key: "199557378192441",
  api_secret: "onK7OzmxAF3Jns6pWIDrpUL_7rg"
});

// ✅ Multer
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ Upload Image (organized folder)
app.post("/upload-image", upload.single("file"), async (req, res) => {
  try {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        folder: "admin_uploads/images"
      },
      (error, result) => {
        if (error) return res.status(500).json({ error });
        res.json({
          url: result.secure_url,
          public_id: result.public_id
        });
      }
    );
    stream.end(req.file.buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Upload PDF (organized folder)
app.post("/upload-pdf", upload.single("file"), async (req, res) => {
  try {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: "admin_uploads/pdfs"
      },
      (error, result) => {
        if (error) return res.status(500).json({ error });
        res.json({
          url: result.secure_url,
          public_id: result.public_id
        });
      }
    );
    stream.end(req.file.buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET all images (to show in dashboard)
app.get("/get-images", async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression("folder:admin_uploads/images")
      .sort_by("created_at", "desc")
      .max_results(50)
      .execute();

    res.json(result.resources);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET all PDFs
app.get("/get-pdfs", async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression("folder:admin_uploads/pdfs")
      .sort_by("created_at", "desc")
      .max_results(50)
      .execute();

    res.json(result.resources);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ DELETE file from Cloudinary
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

// ✅ Start server
app.listen(5000, () => {
  console.log("Server running on port 5000");
});