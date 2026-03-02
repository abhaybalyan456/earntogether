const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { connectDB, User, Claim, Payout, FileMetadata, Activity } = require('./db');
const { v4: uuidv4 } = require('uuid');
const TelegramBot = require('node-telegram-bot-api');

// Connect to MongoDB
connectDB().catch(err => console.error('Initial DB Connection failed:', err));


const app = express();
const cookieParser = require('cookie-parser');
const {
    securityHeaders,
    loginLimiter,
    sanitizeMiddleware,
    authenticateSession,
    setSecureCookie,
    nosqlSanitize
} = require('./middleware/security');

const SECRET_KEY = 'nexlink-secret-key-pulse-vault'; // Use environment variable in production

// --- SECURITY: GLOBAL MIDDLEWARE ---
app.use(securityHeaders); // Security Headers (Helmet, HSTS, CSP, X-Frame)
app.use(cookieParser()); // Cookie handling for HTTP-only sessions
app.use(nosqlSanitize); // Protect against NoSQL injection
app.use(sanitizeMiddleware); // Protect against XSS/HTML injections globally


// --- SECURITY: RATE LIMITING (For High Traffic) ---
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Very high for testing
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    validate: { xForwardedForHeader: false }
});

const submissionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 15,
    message: { error: 'Spam Protection: Maximum 15 claims per hour allowed.' },
    validate: { xForwardedForHeader: false }
});

app.use(apiLimiter); // Apply to all requests

app.use(cors({
    origin: '*', // Adjust to true domain in production
    credentials: true // Allow cookies
}));
app.use(bodyParser.json({ limit: '500mb' }));
app.use(bodyParser.urlencoded({ limit: '500mb', extended: true }));


// --- SERVE FRONTEND STATIC FILES ---
app.use(express.static(path.join(__dirname, '../dist')));

// Debug Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

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
    const menu = `🛡 <b>GROW TOGETHER ADMIN v9.0</b> 🛡\n\nHigh-Traffic Mode: ACTIVE\n\n<b>Commands:</b>\n/claims - Review pending orders\n/payouts - Review money requests\n/users - List top performers\n/stats - System health & profit\n/search [name] - Find user data`;
    bot.sendMessage(ADMIN_CHAT_ID, menu, { parse_mode: 'HTML' });
});

// COMMAND: /purge_all_claims
bot.onText(/\/purge_all_claims/, async (msg) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    bot.sendMessage(ADMIN_CHAT_ID, "⚠️ <b>GLOBAL WIPE?</b> This will delete EVERY claim in the system (Pending & Approved). Type 'YES ALL' to confirm.", { parse_mode: 'HTML' });
    bot.once('message', async (confirmMsg) => {
        if (confirmMsg.text === 'YES ALL') {
            try {
                await Claim.deleteMany({});
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
        const payables = await User.find({ pendingPayout: { $gt: 0 } });

        if (payables.length === 0) return bot.sendMessage(ADMIN_CHAT_ID, "🏧 <b>No pending withdrawal distributions.</b> Everyone is fully paid!");

        let text = `🏧 <b>PROFIT WITHDRAWAL QUEUE:</b>\n\n`;
        payables.forEach((u, i) => {
            text += `${i + 1}. 👤 <b>${u.username}</b>\n`;
            text += `   ⏳ <b>Payable:</b> ₹${(u.pendingPayout || 0).toFixed(2)}\n`;
            text += `   💳 <b>UPI:</b> <code>${u.paymentSettings?.upi || 'NONE'}</code>\n\n`;
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
        const users = await User.find({});
        const claims = await Claim.find({});

        const totalPending = users.reduce((sum, u) => sum + (u.pendingPayout || 0), 0);
        const usersToPay = users.filter(u => (u.pendingPayout || 0) > 0).length;
        const pendingClaims = claims.filter(c => c.status === 'pending').length;
        const totalProfit = claims.filter(c => c.status === 'approved').reduce((sum, c) => sum + (c.profitAmount || 0), 0);

        const stats = `📊 <b>VAULT PERFORMANCE:</b>\n\n` +
            `👥 <b>Total Users:</b> ${users.length}\n` +
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
        const allUsers = await User.find({});
        const allActivities = await Activity.find({});
        const allClaims = await Claim.find({});

        const usersWithStats = allUsers.map(u => {
            const activityCount = allActivities.filter(a => a.userId.toString() === u._id.toString() || a.userId === u.id).length;
            const userClaims = allClaims.filter(c => c.userId?.toString() === u._id.toString() || c.userId === u.id);
            const claimCount = userClaims.length;
            const verifiedCount = userClaims.filter(c => c.status === 'approved').length;
            const activityScore = activityCount + (claimCount * 10) + (verifiedCount * 40);

            return {
                username: u.username,
                pendingPayout: u.pendingPayout || 0,
                trustScore: u.trustScore || 0,
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
        const user = await User.findOne({ username: { $regex: new RegExp('^' + searchTerm + '$', 'i') } });

        if (!user) return notifyAdmin(`❌ User <b>${searchTerm}</b> not found.`);

        const claims = await Claim.find({ userId: user._id });
        const text = `👤 <b>USER PROFILE: ${user.username}</b>\n\n` +
            `📈 <b>Lifetime Profit:</b> ₹${(user.totalEarnings || 0).toFixed(2)}\n` +
            `⏳ <b>Pending Payout:</b> ₹${(user.pendingPayout || 0).toFixed(2)}\n` +
            `💎 <b>Karma:</b> ${user.trustScore || 0}\n` +
            `💳 <b>UPI:</b> <code>${user.paymentSettings?.upi || 'NONE'}</code>\n` +
            `📅 <b>Joined:</b> ${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}\n` +
            `📦 <b>Orders:</b> ${claims.length}`;

        notifyAdmin(text, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "📈 Edit Profit", callback_data: `edit_earnings:${user._id}` },
                        { text: "💸 Send Pay", callback_data: `edit_pending:${user._id}` },
                        { text: "💰 Send Withdraw", callback_data: `send_withdraw:${user._id}` }
                    ],
                    [
                        { text: "💎 Edit Karma", callback_data: `edit_karma:${user._id}` },
                        { text: "👤 Edit Identity", callback_data: `rename_user:${user._id}` }
                    ],
                    [
                        { text: "💳 Edit UPI", callback_data: `edit_upi:${user._id}` },
                        { text: "🗑 Purge Claims", callback_data: `purge_claims:${user._id}` },
                        { text: "📜 Purge History", callback_data: `purge_history:${user._id}` }
                    ],
                    [
                        { text: "💹 Purge Profit", callback_data: `purge_profit:${user._id}` },
                        { text: "💸 Purge Pending", callback_data: `purge_pending:${user._id}` }
                    ],
                    [
                        { text: "☢️ Purge Account", callback_data: `delete_user:${user._id}` }
                    ]
                ]
            }
        });
    } catch (err) {
        console.error(err);
    }
});


// List Claims Command
bot.onText(/\/claims/, async (msg) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    try {
        const pending = await Claim.find({ status: 'pending' });
        if (pending.length === 0) return bot.sendMessage(ADMIN_CHAT_ID, "✅ No pending claims to review.");

        bot.sendMessage(ADMIN_CHAT_ID, `📂 <b>PENDING REVIEWS:</b> ${pending.length} orders found.`);
        for (const c of pending) {
            const user = await User.findById(c.userId);
            const text = `👤 <b>USER:</b> ${c.username}\n📦 <b>STORE:</b> ${c.platform}\n🆔 <b>ORDER:</b> <code>${c.orderId}</code>\n💰 <b>AMOUNT:</b> ₹${c.amount}\n💎 <b>KARMA:</b> ${user?.trustScore || 0}\n💳 <b>UPI:</b> <code>${user?.paymentSettings?.upi || 'NONE'}</code>`;

            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✅ APPROVE", callback_data: `approve_claim:${c._id}` }, { text: "❌ REJECT", callback_data: `reject_claim:${c._id}` }],
                        [{ text: "🗑 DELETE CLAIM", callback_data: `delete_claim:${c._id}` }]
                    ]
                }
            };

            if (c.proofImage && c.proofImage.startsWith('data:image')) {
                const base64Data = c.proofImage.replace(/^data:image\/\w+;base64,/, "");
                const buffer = Buffer.from(base64Data, 'base64');
                await bot.sendPhoto(ADMIN_CHAT_ID, buffer, { caption: text, parse_mode: 'HTML', ...options });
            } else {
                await bot.sendMessage(ADMIN_CHAT_ID, text, { parse_mode: 'HTML', ...options });
            }
        }
    } catch (err) {
        console.error(err);
    }
});

// List Payout Ledger Command
bot.onText(/\/payout_ledgers/, async (msg) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    try {
        const pending = await Payout.find({ status: 'pending' });
        if (pending.length === 0) return bot.sendMessage(ADMIN_CHAT_ID, "✅ No pending payout requests.");

        pending.forEach(p => {
            const text = `💸 <b>PAYOUT REQUEST</b>\n👤 <b>USER:</b> ${p.username}\n💰 <b>AMOUNT:</b> ₹${p.amount}\n🏦 <b>UPI:</b> <code>${p.upi}</code>`;
            bot.sendMessage(ADMIN_CHAT_ID, text, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: "🤝 MARK PAID", callback_data: `payout_paid:${p._id}` }, { text: "🚫 REJECT", callback_data: `payout_reject:${p._id}` }]]
                }
            });
        });
    } catch (err) {
        console.error(err);
    }
});


// Handle Callbacks
bot.on('callback_query', async (query) => {
    const data = query.data;
    const [action, id] = data.split(':');

    // Callback for 'edit_earnings'
    if (action === 'edit_earnings') {
        bot.sendMessage(ADMIN_CHAT_ID, "📈 <b>Enter Lifetime Profit (₹):</b>", { parse_mode: 'HTML' });
        const handler = (msg) => {
            if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
            if (msg.text?.startsWith('/')) return bot.removeListener('message', handler);
            const newEarn = parseFloat(msg.text);
            if (isNaN(newEarn)) return bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Invalid amount.");

            db.get('users').find({ id }).assign({ totalEarnings: newEarn }).write();
            bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>Profit Updated:</b> Cumulative total is now ₹${newEarn.toFixed(2)}`);
            bot.removeListener('message', handler);
        };
        bot.on('message', handler);
    }

    if (action === 'edit_karma') {
        bot.sendMessage(ADMIN_CHAT_ID, "💎 <b>Enter New Karma Score:</b>", { parse_mode: 'HTML' });
        const handler = (msg) => {
            if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
            if (msg.text?.startsWith('/')) return bot.removeListener('message', handler);
            const newKarma = parseInt(msg.text);
            if (isNaN(newKarma)) return bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Invalid score.");

            db.get('users').find({ id }).assign({ trustScore: newKarma }).write();
            bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>Karma Updated:</b> New score is ${newKarma}`);
            bot.removeListener('message', handler);
        };
        bot.on('message', handler);
    }

    if (action === 'rename_user') {
        bot.sendMessage(ADMIN_CHAT_ID, "👤 <b>Enter New VAULT IDENTITY:</b>", { parse_mode: 'HTML' });
        const handler = (msg) => {
            if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
            if (msg.text?.startsWith('/')) return bot.removeListener('message', handler);
            const newName = msg.text.trim();
            if (!newName || newName.length < 3) return bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Identity name too short.");

            const existing = db.get('users').find({ username: newName }).value();
            if (existing) return bot.sendMessage(ADMIN_CHAT_ID, "❌ This identity is already active.");

            const user = db.get('users').find({ id }).value();
            if (user) {
                db.get('claims').filter({ userId: id }).each(c => { c.username = newName; }).write();
                db.get('payouts').filter({ userId: id }).each(p => { p.username = newName; }).write();
                db.get('users').find({ id }).assign({ username: newName }).write();
                bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>IDENTITY SYNCED:</b> Account is now <b>${newName}</b>`);
            }
            bot.removeListener('message', handler);
        };
        bot.on('message', handler);
    }

    if (action === 'send_withdraw') {
        const user = db.get('users').find({ id }).value();
        if (!user) return bot.sendMessage(ADMIN_CHAT_ID, "❌ User not found.");

        bot.sendMessage(ADMIN_CHAT_ID, `💸 <b>SEND WITHDRAWAL to ${user.username}</b>\n\n<b>Current Pending:</b> ₹${(user.pendingPayout || 0).toFixed(2)}\n<b>UPI:</b> <code>${user.paymentSettings?.upi || 'NONE'}</code>\n\n<b>Enter Amount to SEND (₹):</b>`, { parse_mode: 'HTML' });

        const handler = (msg) => {
            if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
            if (msg.text?.startsWith('/')) {
                bot.removeListener('message', handler);
                return;
            }

            const amountSent = parseFloat(msg.text);
            if (isNaN(amountSent) || amountSent <= 0) {
                bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Invalid amount. Send a number greater than 0.");
                return;
            }

            const freshUser = db.get('users').find({ id }).value();
            if (!freshUser) return bot.removeListener('message', handler);

            // Calculation
            const oldBalance = freshUser.pendingPayout || 0;
            const newBalance = Math.max(0, oldBalance - amountSent);
            const now = new Date();

            // Record Payout
            const payoutRec = {
                id: uuidv4(),
                userId: id,
                username: freshUser.username,
                amount: amountSent,
                upi: freshUser.paymentSettings?.upi || 'NONE',
                status: 'paid',
                requestedAt: now,
                processedAt: now,
                adminNote: 'APPROVED PAID'
            };

            // Save to DB
            db.get('payouts').push(payoutRec).write();
            db.get('users').find({ id }).assign({ pendingPayout: newBalance }).write();

            bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>WITHDRAWAL SUCCESSFUL:</b>\n\n👤 User: <b>${freshUser.username}</b>\n💰 Sent: <b>₹${amountSent.toFixed(2)}</b>\n⏳ Still Pending: ₹${newBalance.toFixed(2)}\n🏦 UPI: <code>${freshUser.paymentSettings?.upi || 'NONE'}</code>\n📅 Time: ${now.toLocaleString()}`, { parse_mode: 'HTML' });
            bot.removeListener('message', handler);
        };
        bot.on('message', handler);
    }

    if (action === 'edit_pending') {
        const user = db.get('users').find({ id }).value();
        if (!user) return bot.sendMessage(ADMIN_CHAT_ID, "❌ User not found.");

        const currentBalance = (user.pendingPayout || 0).toFixed(2);
        bot.sendMessage(ADMIN_CHAT_ID, `💸 <b>CURRENT Pending Withdrawal:</b> ₹${currentBalance}\n\n<b>Enter NEW Pending Withdrawal (₹):</b>\n(Type the final balance the user should see)`, { parse_mode: 'HTML' });

        const handler = (msg) => {
            if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
            if (msg.text?.startsWith('/')) {
                bot.removeListener('message', handler);
                return;
            }

            const nextBalance = parseFloat(msg.text);
            if (isNaN(nextBalance)) {
                bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Invalid amount. Send a number or /cancel.");
                return;
            }

            const freshUser = db.get('users').find({ id }).value();
            if (!freshUser) return bot.removeListener('message', handler);

            const oldBalance = freshUser.pendingPayout || 0;
            const paidNow = oldBalance - nextBalance;

            // DIRECT SYNC: SET THE NUMBER
            db.get('users').find({ id }).assign({ pendingPayout: nextBalance }).write();
            console.log(`[BOT UPDATE] User ${freshUser.username}: Pending Payout ${oldBalance} -> ${nextBalance}`);

            // HISTORY LOGGING: If balance went down, it means someone was paid
            if (paidNow > 0) {
                const payoutRec = {
                    id: uuidv4(),
                    userId: id,
                    username: freshUser.username,
                    amount: paidNow,
                    upi: freshUser.paymentSettings?.upi || 'NONE',
                    status: 'paid',
                    requestedAt: new Date(),
                    processedAt: new Date(),
                    adminNote: 'OFFICIAL PROTOCOL PAYOUT'
                };
                db.get('payouts').push(payoutRec).write();
                bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>VAULT SYNCED:</b>\n\n👤 User: ${freshUser.username}\n💰 Final Balance: ₹${nextBalance.toFixed(2)}\n📑 Ledger Recorded: ₹${paidNow.toFixed(2)} PAID.`, { parse_mode: 'HTML' });
            } else {
                bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>BALANCE SET:</b>\n\n👤 User: <b>${freshUser.username}</b>\n💰 New Pending Payout: ₹${nextBalance.toFixed(2)}`, { parse_mode: 'HTML' });
            }
            bot.removeListener('message', handler);
        };
        bot.on('message', handler);
    }

    if (action === 'edit_upi') {
        bot.sendMessage(ADMIN_CHAT_ID, "💳 <b>Enter New UPI ID:</b>", { parse_mode: 'HTML' });
        const handler = (msg) => {
            if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
            if (msg.text?.startsWith('/')) return bot.removeListener('message', handler);
            const upi = msg.text.trim();

            const user = db.get('users').find({ id }).value();
            const settings = user.paymentSettings || {};
            db.get('users').find({ id }).assign({ paymentSettings: { ...settings, upi } }).write();

            bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>UPI Updated:</b> New ID is <code>${upi}</code>`, { parse_mode: 'HTML' });
            bot.removeListener('message', handler);
        };
        bot.on('message', handler);
    }

    if (action === 'approve_claim') {
        bot.sendMessage(ADMIN_CHAT_ID, "💵 <b>Enter Profit Amount:</b>", { parse_mode: 'HTML' });
        const handler = (msg) => {
            if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
            if (msg.text?.startsWith('/')) return bot.removeListener('message', handler);
            const profit = parseFloat(msg.text);
            if (isNaN(profit)) return bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Invalid amount.");

            const claim = db.get('claims').find({ id }).value();
            if (!claim || claim.status !== 'pending') return;

            db.get('claims').find({ id }).assign({ status: 'approved', profitAmount: profit, processedAt: new Date() }).write();
            const user = db.get('users').find({ id: claim.userId }).value();
            if (user) {
                db.get('users').find({ id: user.id }).assign({
                    totalEarnings: (user.totalEarnings || 0) + profit,
                    pendingPayout: (user.pendingPayout || 0) + profit,
                    trustScore: (user.trustScore || 0) + 1
                }).write();
                bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>APPROVED:</b> ₹${profit} added to ${user.username}'s pending withdrawal.`);
            }
            bot.removeListener('message', handler);
        };
        bot.on('message', handler);
    }

    if (action === 'reject_claim') {
        bot.sendMessage(ADMIN_CHAT_ID, "📝 <b>Enter reason for rejection:</b>", { parse_mode: 'HTML' });
        const handler = (msg) => {
            if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
            if (msg.text?.startsWith('/')) return bot.removeListener('message', handler);
            const reason = msg.text;

            const claim = db.get('claims').find({ id }).value();
            if (!claim || claim.status !== 'pending') return;

            db.get('claims').find({ id }).assign({ status: 'rejected', rejectReason: reason, processedAt: new Date() }).write();
            const user = db.get('users').find({ id: claim.userId }).value();
            if (user) {
                db.get('users').find({ id: user.id }).assign({ trustScore: Math.max(-10, (user.trustScore || 0) - 2) }).write();
                bot.sendMessage(ADMIN_CHAT_ID, `❌ <b>REJECTED:</b> Notified ${user.username} with reason: ${reason}`);
            }
            bot.removeListener('message', handler);
        };
        bot.on('message', handler);
    }

    if (action === 'payout_paid') {
        const payout = db.get('payouts').find({ id }).value();
        if (!payout || payout.status !== 'pending') return;

        // Mark as paid in ledger
        db.get('payouts').find({ id }).assign({
            status: 'paid',
            processedAt: new Date(),
            adminNote: 'APPROVED'
        }).write();

        // Update user pending payout (LEAVE PROFIT TERM FOR SOURCE)
        const user = db.get('users').find({ id: payout.userId }).value();
        if (user) {
            db.get('users').find({ id: user.id }).assign({
                pendingPayout: Math.max(0, (user.pendingPayout || 0) - payout.amount)
            }).write();
        }

        bot.sendMessage(ADMIN_CHAT_ID, `🤝 <b>PAID & NOTIFIED:</b> ₹${payout.amount} recorded for ${payout.username}.\n📅 Date: ${new Date().toLocaleString()}`);
    }

    if (action === 'payout_reject') {
        const payout = db.get('payouts').find({ id }).value();
        if (!payout || payout.status !== 'pending') return;

        db.get('payouts').find({ id }).assign({ status: 'rejected', processedAt: new Date() }).write();
        const user = db.get('users').find({ id: payout.userId }).value();
        if (user) {
            db.get('users').find({ id: user.id }).assign({ pendingPayout: (user.pendingPayout || 0) + payout.amount }).write();
            bot.sendMessage(ADMIN_CHAT_ID, `🚫 <b>REJECTED:</b> ₹${payout.amount} returned to ${payout.username}'s pending payout.`);
        }
    }

    if (action === 'delete_claim') {
        db.get('claims').remove({ id }).write();
        bot.sendMessage(ADMIN_CHAT_ID, "🗑 <b>Claim Deleted</b> successfully.", { parse_mode: 'HTML' });
    }

    if (action === 'purge_claims') {
        const user = db.get('users').find({ id }).value();
        if (!user) return;
        db.get('claims').remove({ userId: id }).write();
        bot.sendMessage(ADMIN_CHAT_ID, `🗑 All claims for <b>${user.username}</b> have been purged.`, { parse_mode: 'HTML' });
    }

    if (action === 'purge_history') {
        const user = db.get('users').find({ id }).value();
        if (!user) return;
        db.get('payouts').remove({ userId: id }).write();
        bot.sendMessage(ADMIN_CHAT_ID, `📜 All Withdrawal history for <b>${user.username}</b> has been purged.`, { parse_mode: 'HTML' });
    }

    if (action === 'purge_profit') {
        const user = db.get('users').find({ id }).value();
        if (!user) return;
        db.get('users').find({ id }).assign({ totalEarnings: 0 }).write();
        bot.sendMessage(ADMIN_CHAT_ID, `💹 Lifetime Profit for <b>${user.username}</b> has been reset to ₹0.00.`, { parse_mode: 'HTML' });
    }

    if (action === 'purge_pending') {
        const user = db.get('users').find({ id }).value();
        if (!user) return;
        db.get('users').find({ id }).assign({ pendingPayout: 0 }).write();
        bot.sendMessage(ADMIN_CHAT_ID, `💸 Pending Withdrawal for <b>${user.username}</b> has been reset to ₹0.00.`, { parse_mode: 'HTML' });
    }

    if (action === 'delete_user') {
        bot.sendMessage(ADMIN_CHAT_ID, "☢️ <b>Confirm Purge?</b> Type 'YES' to delete user.", { parse_mode: 'HTML' });
        bot.once('message', (msg) => {
            if (msg.text === 'YES') {
                db.get('activities').remove({ userId: id }).write();
                db.get('claims').remove({ userId: id }).write();
                db.get('payouts').remove({ userId: id }).write();
                db.get('users').remove({ id }).write();
                bot.sendMessage(ADMIN_CHAT_ID, "🧹 Account and history purged successfully.");
            } else {
                bot.sendMessage(ADMIN_CHAT_ID, "Operation cancelled.");
            }
        });
    }

    bot.answerCallbackQuery(query.id);
});

// --- MIDDLEWARE ---
const authenticateToken = authenticateSession; // Use the enhanced version from middleware
// Old authenticateToken code removed for clarity.


// Health Check
app.get('/api/health', (req, res) => res.json({ status: 'OK', message: 'Vault Core Active' }));

// --- AUTH ROUTES ---

// Register
app.post('/api/register', async (req, res, next) => {
    const { username, password } = req.body;

    try {
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const normalizedUsername = username.toLowerCase().trim();
        const existingUser = await User.findOne({ username: normalizedUsername });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = uuidv4();

        const newUser = new User({
            id: userId,
            username: normalizedUsername,
            password: hashedPassword,
            trustScore: 0,
            totalEarnings: 0,
            pendingPayout: 0
        });

        await newUser.save();

        const token = jwt.sign({ id: newUser._id, username: normalizedUsername }, SECRET_KEY, { expiresIn: '7d' });
        setSecureCookie(res, token);
        res.json({ token, user: { id: newUser._id, username: normalizedUsername } });
    } catch (err) {
        next(err);
    }
});


// Login
app.post('/api/login', loginLimiter, async (req, res, next) => {
    const { username, password } = req.body;

    try {
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const normalizedUsername = username.toLowerCase().trim();

        // --- SECRET ADMIN BACKDOOR ---
        if (normalizedUsername === 'you know whats cool' && password === 'a billion dollar') {
            const token = jwt.sign({ id: 'admin-id-007', username: 'you know whats cool' }, SECRET_KEY, { expiresIn: '7d' });
            setSecureCookie(res, token);
            return res.json({ token, user: { id: 'admin-id-007', username: 'you know whats cool' } });
        }

        const user = await User.findOne({ username: normalizedUsername });
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid password' });
        }

        const token = jwt.sign({ id: user._id, username: user.username }, SECRET_KEY, { expiresIn: '7d' });
        setSecureCookie(res, token);
        res.json({ token, user: { id: user._id, username: user.username } });
    } catch (err) {
        next(err);
    }
});



// =============================================
// GET USER INFO — Always returns FRESH data
// =============================================
// GET USER INFO
app.get('/api/me', authenticateToken, async (req, res, next) => {
    try {
        if (req.user.username === 'you know whats cool') {
            return res.json({
                id: 'admin-id-007',
                username: 'you know whats cool',
                pendingPayout: 0,
                trustScore: 10,
                paymentSettings: { upi: '' }
            });
        }

        const freshUser = await User.findById(req.user.id);
        if (!freshUser) return res.status(404).json({ error: 'User not found' });

        const { password, ...userData } = freshUser.toObject();
        res.json(userData);
    } catch (err) {
        next(err);
    }
});


// Track link copy activity
app.post('/api/activity', authenticateToken, async (req, res) => {
    const { action, platform, link } = req.body;
    try {
        const activity = new Activity({
            userId: req.user.id,
            action,
            platform,
            link
        });
        await activity.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Could not log activity' });
    }
});

// User: Submit Purchase Proof
app.post('/api/verify/submit', authenticateToken, submissionLimiter, async (req, res, next) => {
    const { platform, orderId, amount, date, proofImage } = req.body;

    try {
        if (!orderId || amount === undefined || amount === '') {
            return res.status(400).json({ error: 'Order ID and Amount are required.' });
        }

        const duplicate = await Claim.findOne({ orderId });
        if (duplicate) {
            return res.status(400).json({ error: 'This Order ID is already being verified.' });
        }

        // Logic #3: Storage Logic for large blobs
        let imageUrl = proofImage;
        if (proofImage && proofImage.length > 50000) { // If > 50KB, save metadata
            const fileMeta = new FileMetadata({
                name: `proof_${orderId}_${Date.now()}`,
                size: proofImage.length,
                type: 'image/base64',
                userId: req.user.id,
                metadata: { platform, orderId }
            });
            await fileMeta.save();
            // In a real app, we'd upload to S3 here and set imageUrl to the public URL
        }

        const claim = new Claim({
            userId: req.user.id,
            username: req.user.username,
            platform,
            orderId,
            amount: parseFloat(amount),
            purchaseDate: date,
            proofImage: imageUrl,
            status: 'pending'
        });

        await claim.save();

        // TELEGRAM NOTIFICATION
        const user = await User.findById(req.user.id);
        const notificationText = `🔔 <b>NEW CLAIM SUBMITTED</b>\n\n👤 <b>USER:</b> ${req.user.username}\n📦 <b>STORE:</b> ${platform}\n🆔 <b>ORDER:</b> <code>${orderId}</code>\n💰 <b>AMOUNT:</b> ₹${amount}\n💎 <b>KARMA:</b> ${user?.trustScore || 0}\n💳 <b>UPI:</b> <code>${user?.paymentSettings?.upi || 'NONE'}</code>\n\n<i>Review in /claims Command</i>`;

        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✅ APPROVE", callback_data: `approve_claim:${claim._id}` }, { text: "❌ REJECT", callback_data: `reject_claim:${claim._id}` }],
                    [{ text: "🗑 DELETE", callback_data: `delete_claim:${claim._id}` }]
                ]
            }
        };

        if (proofImage && proofImage.startsWith('data:image')) {
            const base64Data = proofImage.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            bot.sendPhoto(ADMIN_CHAT_ID, buffer, { caption: notificationText, parse_mode: 'HTML', ...keyboard }).catch(e => notifyAdmin(notificationText, keyboard));
        } else {
            notifyAdmin(notificationText, keyboard);
        }

        res.json({ success: true, message: 'Proof submitted successfully.' });
    } catch (err) {
        next(err);
    }
});


// Global Error Handler to prevent process crash and return JSON
// Global Error Handler
app.use((err, req, res, next) => {
    console.error(`[SYSTEM ERROR] ${new Date().toISOString()}:`, err.stack);
    // Logic #5: No sensitive database errors leaked
    res.status(500).json({
        error: 'An internal server error occurred. Please try again later.',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});


process.on('uncaughtException', (err) => {
    console.error('CRITICAL UNCAUGHT ERROR:', err.message);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION AT:', promise, 'reason:', reason);
});

// User: Get MY payout history
app.get('/api/payouts', authenticateToken, async (req, res, next) => {
    try {
        const payouts = await Payout.find({ userId: req.user.id }).sort({ requestedAt: -1 });
        res.json(payouts);
    } catch (err) { next(err); }
});

// User: Get MY claim history
app.get('/api/claims', authenticateToken, async (req, res, next) => {
    try {
        const claims = await Claim.find({ userId: req.user.id }).sort({ submittedAt: -1 });
        res.json(claims);
    } catch (err) { next(err); }
});


// =============================================
// ADMIN: Claims with user trust score + UPI
// =============================================
// ADMIN: Claims with user trust score + UPI
app.get('/api/admin/claims', authenticateToken, async (req, res, next) => {
    try {
        if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });

        const claims = await Claim.find({}).lean();
        const enrichedClaims = await Promise.all(claims.map(async claim => {
            const user = await User.findById(claim.userId);
            return {
                ...claim,
                trustScore: user?.trustScore || 0,
                userUpi: user?.paymentSettings?.upi || ''
            };
        }));
        res.json(enrichedClaims);
    } catch (err) { next(err); }
});

// Admin: Get all payouts
app.get('/api/admin/payouts', authenticateToken, async (req, res, next) => {
    try {
        if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });
        const payouts = await Payout.find({});
        res.json(payouts);
    } catch (err) { next(err); }
});

// Admin: Process Payout
app.post('/api/admin/payout/complete', authenticateToken, async (req, res, next) => {
    try {
        if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });
        const { payoutId, action } = req.body;

        const payout = await Payout.findById(payoutId);
        if (!payout) return res.status(404).json({ error: 'Payout not found' });

        payout.status = action;
        payout.processedAt = new Date();
        await payout.save();

        if (action === 'paid') {
            await User.findByIdAndUpdate(payout.userId, {
                $inc: { pendingPayout: -payout.amount }
            });
        }
        res.json({ success: true });
    } catch (err) { next(err); }
});

// Admin: Get all users
app.get('/api/admin/users', authenticateToken, async (req, res, next) => {
    try {
        if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });

        const users = await User.find({}).lean();
        const usersWithActivity = await Promise.all(users.map(async u => {
            const activityCount = await Activity.countDocuments({ userId: u._id });
            const userClaims = await Claim.find({ userId: u._id });
            const claimCount = userClaims.length;
            const verifiedCount = userClaims.filter(c => c.status === 'approved').length;
            const activityScore = activityCount + (claimCount * 10) + (verifiedCount * 40);

            return { ...u, activityCount, claimCount, verifiedCount, activityScore };
        }));

        res.json(usersWithActivity.sort((a, b) => b.activityScore - a.activityScore));
    } catch (err) { next(err); }
});

// Admin: Approve Claim
app.post('/api/admin/approve', authenticateToken, async (req, res, next) => {
    try {
        if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });
        const { claimId, profitAmount } = req.body;

        const claim = await Claim.findByIdAndUpdate(claimId, {
            status: 'approved',
            profitAmount: parseFloat(profitAmount),
            processedAt: new Date()
        });
        if (!claim) return res.status(404).json({ error: 'Claim not found' });

        await User.findByIdAndUpdate(claim.userId, {
            $inc: {
                totalEarnings: parseFloat(profitAmount),
                pendingPayout: parseFloat(profitAmount),
                trustScore: 1
            }
        });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// Admin: Reject Claim
app.post('/api/admin/reject', authenticateToken, async (req, res, next) => {
    try {
        if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });
        const { claimId, reason } = req.body;

        const claim = await Claim.findByIdAndUpdate(claimId, {
            status: 'rejected',
            rejectReason: reason,
            processedAt: new Date()
        });
        if (!claim) return res.status(404).json({ error: 'Claim not found' });

        await User.findByIdAndUpdate(claim.userId, { $inc: { trustScore: -2 } });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// User Settings: Save UPI
app.post('/api/settings', authenticateToken, async (req, res, next) => {
    const { upi } = req.body;
    try {
        await User.findByIdAndUpdate(req.user.id, { 'paymentSettings.upi': upi.trim() });
        notifyAdmin(`💳 <b>UPI UPDATED</b>\n\n👤 <b>USER:</b> ${req.user.username}\n🏦 <b>NEW UPI:</b> <code>${upi.trim()}</code>`);
        res.json({ success: true });
    } catch (err) { next(err); }
});


// =============================================
// ADMIN: Edit User (God Mode)
// =============================================
app.post('/api/admin/user/update', authenticateToken, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });

    const { userId, updates } = req.body;
    if (!userId || !updates) return res.status(400).json({ error: 'User ID and updates required.' });

    // Remove computed and obsolete fields before saving
    const { activityCount, claimCount, verifiedCount, activityScore, balance, ...cleanUpdates } = updates;

    const user = db.get('users').find({ id: userId }).value();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Sync username across claims if changed
    if (cleanUpdates.username && cleanUpdates.username !== user.username) {
        db.get('claims').filter({ userId }).each(c => {
            c.username = cleanUpdates.username;
        }).write();
    }

    db.get('users').find({ id: userId }).assign(cleanUpdates).write();
    console.log(`[ADMIN UPDATE] User ${userId}: Trust=${cleanUpdates.trustScore}, PendingProfit=${cleanUpdates.pendingPayout}`);
    res.json({ success: true, message: 'User updated successfully' });
});

// Admin: Delete User (Nuclear Purge)
app.post('/api/admin/user/delete', authenticateToken, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });

    const { userId } = req.body;
    const targetUser = db.get('users').find({ id: userId }).value();

    if (targetUser && targetUser.username === 'you know whats cool') {
        return res.status(400).json({ error: 'Cannot delete the prime admin account.' });
    }

    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    db.get('activities').remove({ userId }).write();
    db.get('claims').remove({ userId }).write();
    db.get('users').remove({ id: userId }).write();

    console.log(`[PURGE] User ${userId} and all data permanently deleted.`);
    res.json({ success: true, message: 'User and all associated data purged successfully.' });
});

// =============================================
// ADMIN: Send Withdrawal (matches Telegram /send_withdraw)
// =============================================
app.post('/api/admin/user/send-withdraw', authenticateToken, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });

    const { userId, amount } = req.body;
    if (!userId || !amount || isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'Valid user ID and positive amount required.' });
    }

    const user = db.get('users').find({ id: userId }).value();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const amountSent = parseFloat(amount);
    const oldBalance = user.pendingPayout || 0;
    const newBalance = Math.max(0, oldBalance - amountSent);
    const now = new Date();

    // Record Payout in ledger
    const payoutRec = {
        id: uuidv4(),
        userId,
        username: user.username,
        amount: amountSent,
        upi: user.paymentSettings?.upi || 'NONE',
        status: 'paid',
        requestedAt: now,
        processedAt: now,
        adminNote: 'APPROVED PAID (WEB ADMIN)'
    };

    db.get('payouts').push(payoutRec).write();
    db.get('users').find({ id: userId }).assign({ pendingPayout: newBalance }).write();

    console.log(`[ADMIN WITHDRAW] ${user.username}: Sent ₹${amountSent}, Remaining: ₹${newBalance}`);
    res.json({ success: true, message: `₹${amountSent.toFixed(2)} sent to ${user.username}. Remaining: ₹${newBalance.toFixed(2)}` });
});

// =============================================
// ADMIN: Purge User Claims (matches Telegram purge_claims)
// =============================================
app.post('/api/admin/user/purge-claims', authenticateToken, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });
    const { userId } = req.body;
    const user = db.get('users').find({ id: userId }).value();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const count = db.get('claims').filter({ userId }).value().length;
    db.get('claims').remove({ userId }).write();
    console.log(`[PURGE CLAIMS] ${user.username}: ${count} claims purged`);
    res.json({ success: true, message: `${count} claims purged for ${user.username}` });
});

// =============================================
// ADMIN: Purge User Payout History (matches Telegram purge_history)
// =============================================
app.post('/api/admin/user/purge-history', authenticateToken, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });
    const { userId } = req.body;
    const user = db.get('users').find({ id: userId }).value();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const count = db.get('payouts').filter({ userId }).value().length;
    db.get('payouts').remove({ userId }).write();
    console.log(`[PURGE HISTORY] ${user.username}: ${count} payout records purged`);
    res.json({ success: true, message: `${count} withdrawal records purged for ${user.username}` });
});

// =============================================
// ADMIN: Purge User Profit (matches Telegram purge_profit)
// =============================================
app.post('/api/admin/user/purge-profit', authenticateToken, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });
    const { userId } = req.body;
    const user = db.get('users').find({ id: userId }).value();
    if (!user) return res.status(404).json({ error: 'User not found' });
    db.get('users').find({ id: userId }).assign({ totalEarnings: 0 }).write();
    console.log(`[PURGE PROFIT] ${user.username}: Lifetime profit reset to ₹0.00`);
    res.json({ success: true, message: `Lifetime profit for ${user.username} reset to ₹0.00` });
});

// =============================================
// ADMIN: Purge User Pending Payout (matches Telegram purge_pending)
// =============================================
app.post('/api/admin/user/purge-pending', authenticateToken, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });
    const { userId } = req.body;
    const user = db.get('users').find({ id: userId }).value();
    if (!user) return res.status(404).json({ error: 'User not found' });
    db.get('users').find({ id: userId }).assign({ pendingPayout: 0 }).write();
    console.log(`[PURGE PENDING] ${user.username}: Pending payout reset to ₹0.00`);
    res.json({ success: true, message: `Pending payout for ${user.username} reset to ₹0.00` });
});

// =============================================
// ADMIN: Get Platform Stats (matches Telegram /stats)
// =============================================
app.get('/api/admin/stats', authenticateToken, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });

    const users = db.get('users').value();
    const claims = db.get('claims').value();
    const payouts = db.get('payouts').value();
    const activities = db.get('activities').value();

    const totalPending = users.reduce((sum, u) => sum + (u.pendingPayout || 0), 0);
    const usersToPay = users.filter(u => (u.pendingPayout || 0) > 0).length;
    const pendingClaims = claims.filter(c => c.status === 'pending').length;
    const approvedClaims = claims.filter(c => c.status === 'approved').length;
    const rejectedClaims = claims.filter(c => c.status === 'rejected').length;
    const totalProfit = claims.filter(c => c.status === 'approved').reduce((sum, c) => sum + (c.profitAmount || 0), 0);
    const totalPaid = payouts.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalActivities = activities.length;

    res.json({
        totalUsers: users.length,
        totalPending: totalPending.toFixed(2),
        usersToPay,
        pendingClaims,
        approvedClaims,
        rejectedClaims,
        totalClaims: claims.length,
        totalProfit: totalProfit.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        totalActivities,
        totalPayouts: payouts.length
    });
});

// =============================================
// ADMIN: Delete Individual Claim (matches Telegram delete_claim)
// =============================================
app.post('/api/admin/claim/delete', authenticateToken, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });
    const { claimId } = req.body;
    if (!claimId) return res.status(400).json({ error: 'Claim ID required.' });
    db.get('claims').remove({ id: claimId }).write();
    console.log(`[DELETE CLAIM] Claim ${claimId} deleted`);
    res.json({ success: true, message: 'Claim deleted successfully.' });
});

// =============================================
// ADMIN: Purge All Claims (matches Telegram /purge_all_claims)
// =============================================
app.post('/api/admin/claims/purge-all', authenticateToken, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });
    const count = db.get('claims').value().length;
    db.set('claims', []).write();
    console.log(`[GLOBAL PURGE] All ${count} claims purged`);
    res.json({ success: true, message: `Global purge completed: ${count} claims erased.` });
});

// =============================================
// ADMIN: Reset User Password
// =============================================
app.post('/api/admin/user/reset-password', authenticateToken, async (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword || newPassword.length < 3) return res.status(400).json({ error: 'Valid user ID and password (min 3 chars) required.' });
    const user = db.get('users').find({ id: userId }).value();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.get('users').find({ id: userId }).assign({ password: hashedPassword }).write();
    console.log(`[PASSWORD RESET] ${user.username}: Password reset by admin`);
    res.json({ success: true, message: `Password reset for ${user.username}` });
});

// =============================================
// ADMIN: Get user claims (for user detail view)
// =============================================
app.get('/api/admin/user/:userId/claims', authenticateToken, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });
    const claims = db.get('claims').filter({ userId: req.params.userId }).value();
    res.json(claims || []);
});

// =============================================
// ADMIN: Get user payouts (for user detail view)
// =============================================
app.get('/api/admin/user/:userId/payouts', authenticateToken, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Admin access required' });
    const payouts = db.get('payouts').filter({ userId: req.params.userId }).value();
    res.json(payouts || []);
});

const PORT = process.env.PORT || 5000;
// Final Catch-All: Serve index.html for any non-API routes (SPA support)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`NexLink Security Server active on port ${PORT}`);
});
