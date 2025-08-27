/**
 * server.js
 * Backend for Boletín Comunitario (Node + Express + SQLite + Multer + JWT)
 *
 * Run:
 *   npm install
 *   node server.js
 *
 * Server on: http://localhost:3000
 */
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || "cambiame_por_una_clave_segura";

app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

// serve public (frontend)
app.use(express.static(path.join(__dirname, "public")));

// ensure uploads folder exists and serve it
const UPLOADS = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS);
app.use("/uploads", express.static(UPLOADS));

// multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// sqlite db
const DBFILE = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(DBFILE);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT,
    category TEXT,
    image TEXT,
    userId INTEGER,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    userId INTEGER,
    postId INTEGER,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// auth middleware (expects Authorization: Bearer <token>)
function authMiddleware(req, res, next) {
  const header = req.headers["authorization"];
  if (!header) return res.status(401).json({ error: "No autorizado" });
  const token = header.split(" ")[1];
  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token inválido" });
    req.user = user;
    next();
  });
}

// Register
app.post("/api/register", async (req, res) => {
  try{
    const { username, email, password } = req.body;
    if(!username || !email || !password) return res.status(400).json({ error: "Faltan campos" });
    if(password.length < 6) return res.status(400).json({ error: "Contraseña muy corta (6+)" });
    const hash = await bcrypt.hash(password, 10);
    const stmt = db.prepare("INSERT INTO users (username,email,password) VALUES (?,?,?)");
    stmt.run(username, email, hash, function(err){
      if(err){
        return res.status(400).json({ error: "Usuario o email ya existe" });
      }
      res.json({ id: this.lastID, username, email });
    });
  }catch(err){
    console.error(err);
    res.status(500).json({ error: "Error servidor" });
  }
});

// Login
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if(!email || !password) return res.status(400).json({ error: "Faltan credenciales" });
  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if(err) return res.status(500).json({ error: "DB error" });
    if(!user) return res.status(400).json({ error: "Credenciales inválidas" });
    const ok = await bcrypt.compare(password, user.password);
    if(!ok) return res.status(400).json({ error: "Credenciales inválidas" });
    const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, username: user.username } });
  });
});

// Create post (with optional image)
app.post("/api/posts", authMiddleware, upload.single("image"), (req, res) => {
  const { title, content, category } = req.body;
  if(!category) return res.status(400).json({ error: "Debe elegir categoría" });
  const image = req.file ? "/uploads/" + path.basename(req.file.path) : null;
  const stmt = db.prepare("INSERT INTO posts (title,content,category,image,userId) VALUES (?,?,?,?,?)");
  stmt.run(title, content, category, image, req.user.id, function(err){
    if(err) return res.status(500).json({ error: "Error creando publicación" });
    db.get("SELECT posts.*, users.username FROM posts JOIN users ON users.id = posts.userId WHERE posts.id = ?", [this.lastID], (err, row) => {
      if(err) return res.status(500).json({ error: "Error leyendo publicación" });
      row.comments = [];
      res.status(201).json(row);
    });
  });
});

// List posts (all)
app.get("/api/posts", (req, res) => {
  db.all("SELECT posts.*, users.username FROM posts JOIN users ON users.id = posts.userId ORDER BY createdAt DESC", [], (err, rows) => {
    if(err) return res.status(500).json({ error: "Error listado" });
    // attach comments for each
    const ids = rows.map(r => r.id);
    if(ids.length === 0) return res.json([]);
    const placeholders = ids.map(()=>'?').join(',');
    db.all(`SELECT comments.*, users.username FROM comments JOIN users ON users.id = comments.userId WHERE postId IN (${placeholders}) ORDER BY createdAt ASC`, ids, (err, cmts) => {
      if(err) return res.status(500).json({ error: "Error comentarios" });
      const grouped = {};
      cmts.forEach(c => { grouped[c.postId] = grouped[c.postId] || []; grouped[c.postId].push(c); });
      rows.forEach(r => r.comments = grouped[r.id] || []);
      res.json(rows);
    });
  });
});

// Delete post (only author)
app.delete("/api/posts/:id", authMiddleware, (req, res) => {
  const postId = Number(req.params.id);
  db.get("SELECT * FROM posts WHERE id = ?", [postId], (err, post) => {
    if(err) return res.status(500).json({ error: "Error DB" });
    if(!post) return res.status(404).json({ error: "No existe" });
    if(post.userId !== req.user.id) return res.status(403).json({ error: "No autorizado" });
    // delete image file if exists
    if(post.image){
      const filePath = path.join(__dirname, post.image);
      fs.unlink(filePath, (err)=>{});
    }
    db.run("DELETE FROM posts WHERE id = ?", [postId], function(err){
      if(err) return res.status(500).json({ error: "Error borrando" });
      res.json({ success: true });
    });
  });
});

// Add comment
app.post("/api/posts/:id/comments", authMiddleware, (req, res) => {
  const postId = Number(req.params.id);
  const { content } = req.body;
  if(!content) return res.status(400).json({ error: "Comentario vacío" });
  db.get("SELECT id FROM posts WHERE id = ?", [postId], (err, post) => {
    if(err) return res.status(500).json({ error: "Error DB" });
    if(!post) return res.status(404).json({ error: "Post no encontrado" });
    const stmt = db.prepare("INSERT INTO comments (content,userId,postId) VALUES (?,?,?)");
    stmt.run(content, req.user.id, postId, function(err){
      if(err) return res.status(500).json({ error: "Error creando comentario" });
      db.get("SELECT comments.*, users.username FROM comments JOIN users ON users.id = comments.userId WHERE comments.id = ?", [this.lastID], (err, row) => {
        res.status(201).json(row);
      });
    });
  });
});

// List comments for a post
app.get("/api/posts/:id/comments", (req, res) => {
  const postId = Number(req.params.id);
  db.all("SELECT comments.*, users.username FROM comments JOIN users ON users.id = comments.userId WHERE postId = ? ORDER BY createdAt ASC", [postId], (err, rows) => {
    if(err) return res.status(500).json({ error: "Error DB" });
    res.json(rows);
  });
});

app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));