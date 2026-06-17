// server.js — Local pLL Primordium Gene Expression Database
// Run:  npm install  &&  node server.js
// Then open http://localhost:3000

const express = require("express");
const multer  = require("multer");
const fs      = require("fs");
const path    = require("path");
const crypto  = require("crypto");

const PORT      = process.env.PORT || 3000;
const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, "data");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const DB_FILE   = path.join(DATA_DIR, "genes.json");

fs.mkdirSync(IMAGES_DIR, { recursive: true });

const seedGene = (name) => ({
  id: name,
  name,
  summary: "",
  normalImg: "",
  normalCaption: "Normal Expression Pattern",
  migrationImg: "",
  migrationCaption: "Migration Phenotype",
  domains: [],           // array of: "deposited" | "mature" | "developing" | "proto" | "leading"
  conditions: [],        // { id, label, system, img, note, tags[] }
});

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    saveDB([]);
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (e) {
    console.error("Could not parse genes.json, starting fresh:", e.message);
    return [];
  }
}

let writing = Promise.resolve();
function saveDB(genes) {
  writing = writing.then(() => {
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(genes, null, 2));
    fs.renameSync(tmp, DB_FILE);
  });
  return writing;
}

let DB = loadDB();
// Backfill any missing fields on existing records (no hardcoded gene list — genes.json is the source of truth)
{
  DB = DB.map(g => ({
    migrationImg: "",
    migrationCaption: "Migration Phenotype",
    domains: [],
    ...g,
    conditions: (g.conditions || []).map(c => ({ direction: "", ...c })),
  }));
  saveDB(DB);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename:    (req, file, cb) => {
    const ext  = (path.extname(file.originalname) || ".img").toLowerCase();
    const name = crypto.randomBytes(8).toString("hex") + ext;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

const app = express();
app.use(express.json({ limit: "1mb" }));

// ── Static: landing at root, gene detail page at /gene/:id, perturbation table at /table ──
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "landing.html"))
);
app.get("/gene/:id", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);
app.get("/table", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "table.html"))
);
// Fallback static for other assets in /public
app.use(express.static(path.join(__dirname, "public")));
app.use("/images", express.static(IMAGES_DIR));

// ── API ──

app.get("/api/genes", (req, res) => {
  const sorted = [...DB].sort((a, b) => a.name.localeCompare(b.name));
  res.json(sorted);
});

app.get("/api/genes/:id", (req, res) => {
  const g = DB.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: "not found" });
  res.json(g);
});

app.put("/api/genes/:id", async (req, res) => {
  const idx = DB.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  const prev = DB[idx];
  const { name, summary, normalImg, normalCaption, migrationImg, migrationCaption, domains, conditions } = req.body;
  DB[idx] = {
    ...prev,
    ...(name             !== undefined && { name }),
    ...(summary          !== undefined && { summary }),
    ...(normalImg        !== undefined && { normalImg }),
    ...(normalCaption    !== undefined && { normalCaption }),
    ...(migrationImg     !== undefined && { migrationImg }),
    ...(migrationCaption !== undefined && { migrationCaption }),
    ...(domains          !== undefined && { domains }),
    ...(conditions       !== undefined && { conditions }),
  };
  await saveDB(DB);
  res.json(DB[idx]);
});

app.post("/api/genes", async (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "name required" });
  const id = name.replace(/\s+/g, "_");
  if (DB.some(g => g.id === id)) return res.status(409).json({ error: "gene already exists" });
  const g = seedGene(name); g.id = id;
  DB.push(g);
  await saveDB(DB);
  res.json(g);
});

app.post("/api/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  res.json({ filename: req.file.filename, url: "/images/" + req.file.filename });
});

app.listen(PORT, () => {
  console.log(`\n  pLL Primordium Atlas running at  http://localhost:${PORT}`);
  console.log(`  Data dir:   ${DATA_DIR}`);
  console.log(`  Images dir: ${IMAGES_DIR}\n`);
});
