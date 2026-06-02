require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth.routes');
const dataRoutes = require('./routes/data.routes');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// ── Security Headers ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Disabled because we serve inline styles/svgs from Vite build
  crossOriginEmbedderPolicy: false,
}));

// ── Compression ───────────────────────────────────────────────────
app.use(compression());

// ── CORS ──────────────────────────────────────────────────────────
const allowedOrigin = process.env.CORS_ORIGIN
  || process.env.APP_URL
  || (isProduction ? undefined : '*');

app.use(cors(
  isProduction && allowedOrigin
    ? { origin: allowedOrigin, credentials: true }
    : undefined
));

// ── HTTP Logging ───────────────────────────────────────────────────
app.use(morgan(isProduction ? 'combined' : 'dev'));

// ── Body Parsing ──────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Rate Limiting (API only) ──────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 15) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
  // Skip rate limiting in dev for easier testing
  skip: () => !isProduction,
});
app.use('/api', apiLimiter);

// ── Routes ─────────────────────────────────────────────────────────
app.use('/', authRoutes);
app.use('/api', dataRoutes);

// ── Production Static Serving ──────────────────────────────────────
if (isProduction) {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ── Global Error Handler ───────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (isProduction) {
    console.error('[Server Error]', err.message);
  } else {
    console.error('[Server Error]', err);
  }

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
    message: isProduction
      ? 'Something went wrong. Please try again.'
      : err.message,
  });
});

// ── Start ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} (${isProduction ? 'production' : 'development'} mode)`);
});
