const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { readDB, writeDB, DB_PATH } = require('./db');
const TelegramBot = require('node-telegram-bot-api');
const uuid = require('uuid');

const app = express();
const cookieParser = require('cookie-parser');
const {
    securityHeaders,
    loginLimiter,
    apiLimiter,
    submissionLimiter,
    sanitizeMiddleware,
    authenticateSession,
    setSecureCookie
} = require('./middleware/security');

const SECRET_KEY = 'nexlink-secret-key-pulse-vault'; // Use environment variable in production

// --- SECURITY: GLOBAL MIDDLEWARE ---
app.use(securityHeaders); // Security Headers (Helmet, HSTS, CSP, X-Frame)
app.use(cookieParser()); // Cookie handling for HTTP-only sessions
app.use(sanitizeMiddleware); // Protect against XSS/HTML injections globally

// --- RATE LIMITING APPLIED ---
app.use(apiLimiter); // Apply global rate limit

app.use(cors({
    origin: '*', // Adjust to true domain in production
    credentials: true // Allow cookies
}));
app.use(bodyParser.json({ limit: '500mb' }));
app.use(bodyParser.urlencoded({ limit: '500mb', extended: true }));

// --- SERVE FRONTEND STATIC FILES ---
app.use(express.static(path.join(__dirname, '../dist')));

// --- TELEGRAM BOT CONFIG ---
const BOT_TOKEN = '8557258761:AAEW86mB6roop4mX40ezfzCfn-5Z_nhfcOs';
const ADMIN_CHAT_ID = '1889181876';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// --- TELEGRAM BOT LOGIC ---

// Helper: Send formatted message to Admin
const notifyAdmin = async (message, options = {}) => {
    try {
        await bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'HTML', ...options });
    } catch (err) {
        console.error('[TELEGRAM ERROR]', err.message);
    }
};

// COMMAND: /start
bot.onText(/\/start/, (msg) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    const menu = `🛡 <b>GROW TOGETHER ADMIN v10.0</b> 🛡\n\nDatabase: <b>TELEGRAM-SYNC VAULT</b>\n\n<b>Commands:</b>\n/claims - Review pending orders\n/payouts - Review money requests\n/users - List top performers\n/stats - System health & profit\n/search [name] - Find user data\n/database - 📥 DOWNLOAD FULL VAULT`;
    bot.sendMessage(ADMIN_CHAT_ID, menu, { parse_mode: 'HTML' });
});

// COMMAND: /database (Telegram DB Sync)
bot.onText(/\/database/, async (msg) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    try {
        const db = readDB();
        const summary = `📁 <b>VAULT DATABASE EXPORT</b>\n\n👤 Users: ${db.users.length}\n📦 Claims: ${db.claims.length}\n💸 Payouts: ${db.payouts.length}\n📅 Last Updated: ${new Date(db.meta.last_updated).toLocaleString()}`;

        await bot.sendMessage(ADMIN_CHAT_ID, summary, { parse_mode: 'HTML' });
        await bot.sendDocument(ADMIN_CHAT_ID, DB_PATH, { caption: "🔐 Official Vault Database File" });
    } catch (err) {
        bot.sendMessage(ADMIN_CHAT_ID, "❌ DB Export Failed: " + err.message);
    }
});

// COMMAND: /purge_all_claims
bot.onText(/\/purge_all_claims/, async (msg) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    bot.sendMessage(ADMIN_CHAT_ID, "⚠️ <b>GLOBAL WIPE?</b> This will delete EVERY claim in the system (Pending & Approved). Type 'YES ALL' to confirm.", { parse_mode: 'HTML' });
    bot.once('message', async (confirmMsg) => {
        if (confirmMsg.text === 'YES ALL') {
            try {
                const db = readDB();
                db.claims = [];
                writeDB(db);
                bot.sendMessage(ADMIN_CHAT_ID, "💥 <b>GLOBAL PURGE SUCCESSFUL:</b> All claims have been erased from history.");
            } catch (err) {
                bot.sendMessage(ADMIN_CHAT_ID, "❌ Purge failed: " + err.message);
            }
        } else {
            bot.sendMessage(ADMIN_CHAT_ID, "Global purge aborted.");
        }
    });
});

// COMMAND: /payouts
bot.onText(/\/payouts/, async (msg) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    try {
        const db = readDB();
        const payables = db.users.filter(u => (parseFloat(u.pending_payout) || 0) > 0);

        if (payables.length === 0) return bot.sendMessage(ADMIN_CHAT_ID, "🏧 <b>No pending withdrawal distributions.</b> Everyone is fully paid!");

        let text = `🏧 <b>PROFIT WITHDRAWAL QUEUE:</b>\n\n`;
        payables.forEach((u, i) => {
            text += `${i + 1}. 👤 <b>${u.username}</b>\n`;
            text += `   ⏳ <b>Payable:</b> ₹${(parseFloat(u.pending_payout) || 0).toFixed(2)}\n`;
            text += `   💳 <b>UPI:</b> <code>${u.upi || 'NONE'}</code>\n\n`;
        });

        text += `<i>Use /search [username] to send payments.</i>`;
        bot.sendMessage(ADMIN_CHAT_ID, text, { parse_mode: 'HTML' });
    } catch (err) {
        console.error(err);
    }
});

// COMMAND: /stats
bot.onText(/\/stats/, async (msg) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    try {
        const db = readDB();
        const totalPending = db.users.reduce((sum, u) => sum + (parseFloat(u.pending_payout) || 0), 0);
        const usersToPay = db.users.filter(u => (parseFloat(u.pending_payout) || 0) > 0).length;
        const pendingClaims = db.claims.filter(c => c.status === 'pending').length;
        const totalProfit = db.claims.filter(c => c.status === 'approved').reduce((sum, c) => sum + (parseFloat(c.profit_amount) || 0), 0);

        const stats = `📊 <b>VAULT PERFORMANCE:</b>\n\n` +
            `👥 <b>Total Users:</b> ${db.users.length}\n` +
            `⏳ <b>Total Pending Withdrawal:</b> ₹${totalPending.toFixed(2)}\n` +
            `🏧 <b>Pending Distributions:</b> ${usersToPay} users\n` +
            `💎 <b>Lifetime Profit Released:</b> ₹${totalProfit.toFixed(2)}\n` +
            `📂 <b>Pending Reviews:</b> ${pendingClaims}`;
        notifyAdmin(stats);
    } catch (err) {
        console.error(err);
    }
});

// COMMAND: /users
bot.onText(/\/users/, async (msg) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    try {
        const db = readDB();
        const usersWithStats = db.users.map(u => {
            const activityCount = db.activities.filter(a => a.user_id === u.id).length;
            const userClaims = db.claims.filter(c => c.user_id === u.id);
            const claimCount = userClaims.length;
            const verifiedCount = userClaims.filter(c => c.status === 'approved').length;
            const activityScore = activityCount + (claimCount * 10) + (verifiedCount * 40);

            return {
                username: u.username,
                pendingPayout: parseFloat(u.pending_payout) || 0,
                trustScore: u.trust_score || 0,
                activityCount,
                claimCount,
                verifiedCount,
                activityScore
            };
        });

        const topUsers = usersWithStats.sort((a, b) => b.activityScore - a.activityScore).slice(0, 10);

        let text = `🏆 <b>POWER USERS (Top 10):</b>\n\n`;
        topUsers.forEach((u, i) => {
            text += `${i + 1}. <b>${u.username}</b>\n`;
            text += `   ⏳ Pend: ₹${u.pendingPayout.toFixed(2)} | 💎 Karma: ${u.trustScore}\n`;
            text += `   🔥 Score: ${u.activityScore} | 📊 Activity: ${u.activityCount}\n`;
            text += `   ✅ Verified: ${u.verifiedCount}/${u.claimCount}\n\n`;
        });

        if (topUsers.length === 0) text = "📭 No users found in database.";
        notifyAdmin(text);
    } catch (err) {
        console.error(err);
    }
});

// COMMAND: /search [username]
bot.onText(/\/search (.+)/, async (msg, match) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    const searchTerm = match[1].toLowerCase().trim();
    try {
        const db = readDB();
        const user = db.users.find(u => u.username.toLowerCase() === searchTerm);
        if (!user) return notifyAdmin(`❌ User <b>${searchTerm}</b> not found.`);

        const claims = db.claims.filter(c => c.user_id === user.id);
        const text = `👤 <b>USER PROFILE: ${user.username}</b>\n\n` +
            `📈 <b>Lifetime Profit:</b> ₹${(parseFloat(user.total_earnings) || 0).toFixed(2)}\n` +
            `⏳ <b>Pending Payout:</b> ₹${(parseFloat(user.pending_payout) || 0).toFixed(2)}\n` +
            `💎 <b>Karma:</b> ${user.trust_score || 0}\n` +
            `💳 <b>UPI:</b> <code>${user.upi || 'NONE'}</code>\n` +
            `📅 <b>Joined:</b> ${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}\n` +
            `📦 <b>Orders:</b> ${claims.length}`;

        notifyAdmin(text, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "📈 Edit Profit", callback_data: `edit_earnings:${user.id}` },
                        { text: "💸 Send Pay", callback_data: `edit_pending:${user.id}` },
                        { text: "💰 Send Withdraw", callback_data: `send_withdraw:${user.id}` }
                    ],
                    [
                        { text: "💎 Edit Karma", callback_data: `edit_karma:${user.id}` },
                        { text: "👤 Edit Identity", callback_data: `rename_user:${user.id}` }
                    ],
                    [
                        { text: "💳 Edit UPI", callback_data: `edit_upi:${user.id}` },
                        { text: "🗑 Purge Claims", callback_data: `purge_claims:${user.id}` },
                        { text: "📜 Purge History", callback_data: `purge_history:${user.id}` }
                    ],
                    [
                        { text: "💹 Purge Profit", callback_data: `purge_profit:${user.id}` },
                        { text: "💸 Purge Pending", callback_data: `purge_pending:${user.id}` }
                    ],
                    [
                        { text: "☢️ Purge Account", callback_data: `delete_user:${user.id}` }
                    ]
                ]
            }
        });
    } catch (err) {
        console.error(err);
    }
});

// Handle Callbacks
bot.on('callback_query', async (query) => {
    const data = query.data;
    const [action, id] = data.split(':');

    try {
        const db = readDB();
        if (action === 'edit_earnings') {
            bot.sendMessage(ADMIN_CHAT_ID, "📈 <b>Enter Lifetime Profit (₹):</b>", { parse_mode: 'HTML' });
            const handler = async (msg) => {
                if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
                if (msg.text?.startsWith('/')) return bot.removeListener('message', handler);
                const newEarn = parseFloat(msg.text);
                if (isNaN(newEarn)) return bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Invalid amount.");
                const uIdx = db.users.findIndex(u => u.id === id);
                if (uIdx !== -1) {
                    db.users[uIdx].total_earnings = newEarn;
                    writeDB(db);
                    bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>Profit Updated:</b> Cumulative total is now ₹${newEarn.toFixed(2)}`);
                }
                bot.removeListener('message', handler);
            };
            bot.on('message', handler);
        }

        if (action === 'edit_karma') {
            bot.sendMessage(ADMIN_CHAT_ID, "💎 <b>Enter New Karma Score:</b>", { parse_mode: 'HTML' });
            const handler = async (msg) => {
                if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
                if (msg.text?.startsWith('/')) return bot.removeListener('message', handler);
                const newKarma = parseInt(msg.text);
                if (isNaN(newKarma)) return bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Invalid score.");
                const uIdx = db.users.findIndex(u => u.id === id);
                if (uIdx !== -1) {
                    db.users[uIdx].trust_score = newKarma;
                    writeDB(db);
                    bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>Karma Updated:</b> New score is ${newKarma}`);
                }
                bot.removeListener('message', handler);
            };
            bot.on('message', handler);
        }

        if (action === 'rename_user') {
            bot.sendMessage(ADMIN_CHAT_ID, "👤 <b>Enter New VAULT IDENTITY:</b>", { parse_mode: 'HTML' });
            const handler = async (msg) => {
                if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
                if (msg.text?.startsWith('/')) return bot.removeListener('message', handler);
                const newName = msg.text.trim();
                const uIdx = db.users.findIndex(u => u.id === id);
                if (uIdx !== -1) {
                    db.users[uIdx].username = newName;
                    db.claims.forEach(c => { if (c.user_id === id) c.username = newName; });
                    db.payouts.forEach(p => { if (p.user_id === id) p.username = newName; });
                    writeDB(db);
                    bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>IDENTITY SYNCED:</b> Account is now <b>${newName}</b>`);
                }
                bot.removeListener('message', handler);
            };
            bot.on('message', handler);
        }

        if (action === 'send_withdraw') {
            const user = db.users.find(u => u.id === id);
            if (!user) return bot.sendMessage(ADMIN_CHAT_ID, "❌ User not found.");
            bot.sendMessage(ADMIN_CHAT_ID, `💸 <b>SEND WITHDRAWAL to ${user.username}</b>\n\n<b>Current Pending:</b> ₹${(parseFloat(user.pending_payout) || 0).toFixed(2)}\n<b>UPI:</b> <code>${user.upi || 'NONE'}</code>\n\n<b>Enter Amount to SEND (₹):</b>`, { parse_mode: 'HTML' });
            const handler = async (msg) => {
                if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
                if (msg.text?.startsWith('/')) return bot.removeListener('message', handler);
                const amountSent = parseFloat(msg.text);
                if (isNaN(amountSent) || amountSent <= 0) return bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Invalid amount.");
                const uIdx = db.users.findIndex(u => u.id === id);
                if (uIdx !== -1) {
                    const oldBalance = parseFloat(db.users[uIdx].pending_payout) || 0;
                    const newBalance = Math.max(0, oldBalance - amountSent);
                    db.users[uIdx].pending_payout = newBalance;
                    const now = new Date().toISOString();
                    db.payouts.push({
                        id: uuid.v4(),
                        user_id: id,
                        username: db.users[uIdx].username,
                        amount: amountSent,
                        upi: db.users[uIdx].upi || 'NONE',
                        status: 'paid',
                        requested_at: now,
                        processed_at: now,
                        admin_note: 'APPROVED PAID'
                    });
                    writeDB(db);
                    bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>WITHDRAWAL SUCCESSFUL:</b>\n👤 User: <b>${db.users[uIdx].username}</b>\n💰 Sent: <b>₹${amountSent.toFixed(2)}</b>\n⏳ Still Pending: ₹${newBalance.toFixed(2)}`);
                }
                bot.removeListener('message', handler);
            };
            bot.on('message', handler);
        }

        if (action === 'approve_claim') {
            bot.sendMessage(ADMIN_CHAT_ID, "💵 <b>Enter Profit Amount:</b>", { parse_mode: 'HTML' });
            const handler = async (msg) => {
                if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
                if (msg.text?.startsWith('/')) return bot.removeListener('message', handler);
                const profit = parseFloat(msg.text);
                if (isNaN(profit)) return bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Invalid amount.");
                const cIdx = db.claims.findIndex(c => c.id === id);
                if (cIdx !== -1 && db.claims[cIdx].status === 'pending') {
                    db.claims[cIdx].status = 'approved';
                    db.claims[cIdx].profit_amount = profit;
                    db.claims[cIdx].processed_at = new Date().toISOString();
                    const uIdx = db.users.findIndex(u => u.id === db.claims[cIdx].user_id);
                    if (uIdx !== -1) {
                        db.users[uIdx].total_earnings = (parseFloat(db.users[uIdx].total_earnings) || 0) + profit;
                        db.users[uIdx].pending_payout = (parseFloat(db.users[uIdx].pending_payout) || 0) + profit;
                        db.users[uIdx].trust_score = (db.users[uIdx].trust_score || 0) + 1;
                        writeDB(db);
                        bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>APPROVED:</b> ₹${profit} added to ${db.users[uIdx].username}'s pending withdrawal.`);
                    }
                }
                bot.removeListener('message', handler);
            };
            bot.on('message', handler);
        }

        if (action === 'reject_claim') {
            bot.sendMessage(ADMIN_CHAT_ID, "📝 <b>Enter reason for rejection:</b>", { parse_mode: 'HTML' });
            const handler = async (msg) => {
                if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
                if (msg.text?.startsWith('/')) return bot.removeListener('message', handler);
                const cIdx = db.claims.findIndex(c => c.id === id);
                if (cIdx !== -1 && db.claims[cIdx].status === 'pending') {
                    db.claims[cIdx].status = 'rejected';
                    db.claims[cIdx].reject_reason = msg.text;
                    db.claims[cIdx].processed_at = new Date().toISOString();
                    const uIdx = db.users.findIndex(u => u.id === db.claims[cIdx].user_id);
                    if (uIdx !== -1) {
                        db.users[uIdx].trust_score = (db.users[uIdx].trust_score || 0) - 2;
                        writeDB(db);
                        bot.sendMessage(ADMIN_CHAT_ID, `❌ <b>REJECTED:</b> Notified ${db.users[uIdx].username}`);
                    }
                }
                bot.removeListener('message', handler);
            };
            bot.on('message', handler);
        }

        bot.answerCallbackQuery(query.id);
    } catch (err) {
        console.error(err);
    }
});

// --- API MAPPER ---
const mapUser = (u) => ({
    _id: u.id,
    username: u.username,
    trustScore: u.trust_score,
    totalEarnings: parseFloat(u.total_earnings) || 0,
    pendingPayout: parseFloat(u.pending_payout) || 0,
    paymentSettings: { upi: u.upi || '' },
    createdAt: u.created_at
});

// --- API ROUTES ---
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.status(400).json({ error: 'Username exists' });
    const newUser = { id: uuid.v4(), username, password: await bcrypt.hash(password, 10), trust_score: 0, total_earnings: 0, pending_payout: 0, created_at: new Date().toISOString() };
    db.users.push(newUser);
    writeDB(db);
    const token = jwt.sign({ _id: newUser.id, username }, SECRET_KEY);
    res.json({ token, user: mapUser(newUser) });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (username === 'you know whats cool' && password === 'a billion dollar') {
        const token = jwt.sign({ _id: 'admin-id', username }, SECRET_KEY);
        return res.json({ token, user: { _id: 'admin-id', username } });
    }
    const db = readDB();
    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ _id: user.id, username: user.username }, SECRET_KEY);
    res.json({ token, user: mapUser(user) });
});

app.get('/api/me', authenticateSession, (req, res) => {
    if (req.user.username === 'you know whats cool') return res.json({ _id: 'admin-id', username: 'you know whats cool', trustScore: 10 });
    const db = readDB();
    const user = db.users.find(u => u.id === req.user._id);
    res.json(mapUser(user));
});

app.post('/api/verify/submit', authenticateSession, (req, res) => {
    const { platform, orderId, amount, date, proofImage } = req.body;
    const db = readDB();
    const claim = { id: uuid.v4(), user_id: req.user._id, username: req.user.username, platform, order_id: orderId, amount: parseFloat(amount), purchase_date: date, proof_image: proofImage, status: 'pending', submitted_at: new Date().toISOString() };
    db.claims.push(claim);
    writeDB(db);
    notifyAdmin(`🔔 New Claim: ${req.user.username} - ₹${amount}`);
    res.json({ success: true });
});

app.get('/api/claims', authenticateSession, (req, res) => {
    const db = readDB();
    res.json(db.claims.filter(c => c.user_id === req.user._id).map(c => ({ ...c, _id: c.id })));
});

app.get('/api/payouts', authenticateSession, (req, res) => {
    const db = readDB();
    res.json(db.payouts.filter(p => p.user_id === req.user._id).map(p => ({ ...p, _id: p.id })));
});

// Admin Panel APIs
app.get('/api/admin/stats', authenticateSession, (req, res) => {
    const db = readDB();
    res.json({ totalUsers: db.users.length, totalClaims: db.claims.length });
});

app.get('/api/admin/users', authenticateSession, (req, res) => {
    const db = readDB();
    res.json(db.users.map(mapUser));
});

app.get('/api/admin/claims', authenticateSession, (req, res) => {
    const db = readDB();
    res.json(db.claims.map(c => ({ ...c, _id: c.id })));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Telegram Sync DB Active on ${PORT}`));
