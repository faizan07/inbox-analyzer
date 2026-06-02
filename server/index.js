require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth.routes');
const dataRoutes = require('./routes/data.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Routes ─────────────────────────────────────────────────────────
app.use('/', authRoutes);
app.use('/api', dataRoutes);

// ── Production Static Serving ──────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ── Global Error Handler ───────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Server Error]', err.message);

  if (err.code === 'CREDENTIALS_MISSING') {
    return res.status(503).json({
      error: 'CREDENTIALS_MISSING',
      message: err.message,
    });
  }

  if (err.code === 'AUTH_REQUIRED') {
    return res.status(401).json({
      error: 'AUTH_REQUIRED',
      message: 'Authentication required. Please log in.',
    });
  }

  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Something went wrong. Please try again.',
  });
});

// ── Start ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
