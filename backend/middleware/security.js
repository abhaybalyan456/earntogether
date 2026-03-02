const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const xss = require('xss-clean');
const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.SECRET_KEY || 'nexlink-secret-key-pulse-vault';

/**
 * 1. Rate Limiting: Brute-force protection for sensitive endpoints
 */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per IP
    message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

const submissionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 15,
    message: { error: 'Spam Protection: Maximum 15 claims per hour allowed.' },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * 2. Input Sanitization Middleware
 */
const sanitizeMiddleware = (req, res, next) => {
    // Global Body HTML Stripping (using regex as a simple, no-dep alternative or augmenting xss-clean)
    if (req.body) {
        const stripHtml = (obj) => {
            for (let key in obj) {
                if (typeof obj[key] === 'string') {
                    obj[key] = obj[key].replace(/<[^>]*>?/gm, ''); // Remove HTML tags
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    stripHtml(obj[key]);
                }
            }
        };
        stripHtml(req.body);
    }
    next();
};

/**
 * 3. Authentication & Session Middleware
 */
const authenticateSession = (req, res, next) => {
    // Check for cookie-based session or header-based token
    const token = req.cookies.auth_token || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

    if (!token) {
        // If it's a browser request (not API), could redirect to /login
        if (req.accepts('html') && !req.xhr) {
            return res.redirect('/login');
        }
        return res.status(401).json({ error: 'Authentication required. Please login.' });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded;
        next();
    } catch (err) {
        res.clearCookie('auth_token');
        if (req.accepts('html') && !req.xhr) {
            return res.redirect('/login');
        }
        return res.status(403).json({ error: 'Invalid or expired session' });
    }
};

/**
 * 4. Helper for Setting Secure Cookies
 */
const setSecureCookie = (res, token) => {
    res.cookie('auth_token', token, {
        httpOnly: true,     // Prevent XSS
        secure: process.env.NODE_ENV === 'production', // Only over HTTPS in production
        sameSite: 'strict', // Prevent CSRF
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days (matching JWT expiry)
    });
};

module.exports = {
    loginLimiter,
    apiLimiter,
    submissionLimiter,
    sanitizeMiddleware,
    authenticateSession,
    setSecureCookie,
    SECRET_KEY,
    securityHeaders: helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"], // Allow common CDNs if needed
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                imgSrc: ["'self'", "data:", "blob:"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                objectSrc: ["'none'"],
                upgradeInsecureRequests: [],
            },
        },
        xFrameOptions: { action: "deny" } // Prevent Clickjacking
    })
};
