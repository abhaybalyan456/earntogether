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
    setSecureCookie,
    SECRET_KEY
} = require('./middleware/security');

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

// Helper: Mirror Database to Telegram Cloud
const mirrorToTelegram = async () => {
    try {
        await bot.sendDocument(ADMIN_CHAT_ID, DB_PATH, {
            caption: `💾 <b>AUTOMATIC CLOUD MIRROR</b>\n🕒 ${new Date().toLocaleString()}\n\n<i>This is your live backup. If Render resets, upload this file here to restore everything.</i>`,
            parse_mode: 'HTML'
        });
    } catch (err) {
        console.error('[SYNC ERROR]', err.message);
    }
};

// Global Sync Wrapper
const writeDB_Synced = (data) => {
    const success = writeDB(data);
    if (success) mirrorToTelegram();
    return success;
};

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

    // STARTUP CHECK: If DB reset by Render, alert Admin
    const db = readDB();
    if (db.users.length === 0) {
        bot.sendMessage(ADMIN_CHAT_ID, "⚠️ <b>RESTORE REQUIRED:</b> Your database appears empty (Render reset file system). Please upload your latest <code>vault_db.json</code> backup to restore all data instantly.", { parse_mode: 'HTML' });
    }

    const menu = `🛡 <b>GROW TOGETHER ADMIN v11.0</b> 🛡\n\nDatabase: <b>TELEGRAM-SYNC VAULT</b>\n\n<b>Commands:</b>\n/claims - Review pending orders\n/payouts - Review money requests\n/users - List top performers\n/stats - System health & profit\n/search [name] - Find user data\n/database - 📥 DOWNLOAD FULL VAULT\n/maintenance - 🛠 Toggle Site Lock\n/broadcast [msg] - 📣 Global Alert`;
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
                writeDB_Synced(db);
                bot.sendMessage(ADMIN_CHAT_ID, "💥 <b>GLOBAL PURGE SUCCESSFUL:</b> All claims have been erased from history.");
            } catch (err) {
                bot.sendMessage(ADMIN_CHAT_ID, "❌ Purge failed: " + err.message);
            }
        } else {
            bot.sendMessage(ADMIN_CHAT_ID, "Global purge aborted.");
        }
    });
});

// COMMAND: /broadcast [msg]
bot.onText(/\/broadcast (.+)/, (msg, match) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    const text = match[1];
    const db = readDB();
    db.meta.announcement = text;
    writeDB_Synced(db);
    bot.sendMessage(ADMIN_CHAT_ID, `📣 <b>Global Announcement Set:</b>\n\n"${text}"\n\nThis will now show on all user dashboards.`);
});

// COMMAND: /maintenance
bot.onText(/\/maintenance/, (msg) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    const db = readDB();
    db.meta.maintenance_mode = !db.meta.maintenance_mode;
    writeDB_Synced(db);
    bot.sendMessage(ADMIN_CHAT_ID, `🛠 <b>Maintenance Mode:</b> ${db.meta.maintenance_mode ? '🔴 ENABLED (Site Locked)' : '🟢 DISABLED (Site Live)'}`);
});

// COMMAND: /claims (Condensed Detailed View)
bot.onText(/\/claims/, async (msg) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    try {
        const db = readDB();
        const pending = db.claims.filter(c => c.status === 'pending');

        if (pending.length === 0) return bot.sendMessage(ADMIN_CHAT_ID, "✅ <b>No pending reviews.</b> Everything is cleared!");

        bot.sendMessage(ADMIN_CHAT_ID, `📂 <b>PENDING REVIEWS (${pending.length}):</b> Processing...`);

        pending.forEach(c => {
            const text = `📦 <b>ORDER ID:</b> <code>${c.order_id}</code>\n` +
                `👤 <b>User:</b> ${c.username}\n` +
                `🏢 <b>Platform:</b> ${c.platform.toUpperCase()}\n` +
                `💰 <b>Amount:</b> ₹${c.amount}\n` +
                `📅 <b>Date:</b> ${c.purchase_date}\n` +
                `🕒 <b>Submitted:</b> ${new Date(c.submitted_at).toLocaleString()}`;

            bot.sendMessage(ADMIN_CHAT_ID, text, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ APPROVE", callback_data: `approve_claim:${c.id}` },
                            { text: "❌ REJECT", callback_data: `reject_claim:${c.id}` }
                        ],
                        [{ text: "🗑 DELETE", callback_data: `delete_claim:${c.id}` }]
                    ]
                }
            });
        });
    } catch (err) {
        console.error(err);
    }
});
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
        const user = db.users.find(u => u.username.toLowerCase().includes(searchTerm));
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
                const freshDb = readDB();
                const uIdx = freshDb.users.findIndex(u => u.id === id);
                if (uIdx !== -1) {
                    freshDb.users[uIdx].total_earnings = newEarn;
                    writeDB_Synced(freshDb);
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
                const freshDb = readDB();
                const uIdx = freshDb.users.findIndex(u => u.id === id);
                if (uIdx !== -1) {
                    freshDb.users[uIdx].trust_score = newKarma;
                    writeDB_Synced(freshDb);
                    bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>Karma Updated:</b> New score is ${newKarma}`);
                }
                bot.removeListener('message', handler);
            };
            bot.on('message', handler);
        }

        if (action === 'rename_user') {
            bot.sendMessage(ADMIN_CHAT_ID, "👤 <b>Enter New VAULT IDENTITY (will be normalized):</b>", { parse_mode: 'HTML' });
            const handler = async (msg) => {
                if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
                if (msg.text?.startsWith('/')) return bot.removeListener('message', handler);
                const newName = msg.text.trim().toLowerCase();
                const freshDb = readDB();
                const uIdx = freshDb.users.findIndex(u => u.id === id);
                if (uIdx !== -1) {
                    freshDb.users[uIdx].username = newName;
                    freshDb.claims.forEach(c => { if (c.user_id === id) c.username = newName; });
                    freshDb.payouts.forEach(p => { if (p.user_id === id) p.username = newName; });
                    writeDB_Synced(freshDb);
                    bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>IDENTITY SYNCED:</b> Account is now <b>${newName}</b>`);
                }
                bot.removeListener('message', handler);
            };
            bot.on('message', handler);
        }

        if (action === 'edit_pending') {
            const user = db.users.find(u => u.id === id);
            if (!user) return bot.sendMessage(ADMIN_CHAT_ID, "❌ User not found.");
            bot.sendMessage(ADMIN_CHAT_ID, `💸 <b>EDIT PENDING BALANCE: ${user.username}</b>\n\nCurrent: ₹${(parseFloat(user.pending_payout) || 0).toFixed(2)}\n\n<b>Enter New Balance (₹):</b>`, { parse_mode: 'HTML' });
            const handler = async (msg) => {
                if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
                if (msg.text?.startsWith('/')) return bot.removeListener('message', handler);
                const newVal = parseFloat(msg.text);
                if (isNaN(newVal)) return bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Invalid amount.");
                const freshDb = readDB();
                const uIdx = freshDb.users.findIndex(u => u.id === id);
                if (uIdx !== -1) {
                    freshDb.users[uIdx].pending_payout = newVal;
                    writeDB_Synced(freshDb);
                    bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>Balance Updated:</b> ${freshDb.users[uIdx].username} now has ₹${newVal.toFixed(2)} pending.`);
                }
                bot.removeListener('message', handler);
            };
            bot.on('message', handler);
        }

        if (action === 'edit_upi') {
            const user = db.users.find(u => u.id === id);
            if (!user) return bot.sendMessage(ADMIN_CHAT_ID, "❌ User not found.");
            bot.sendMessage(ADMIN_CHAT_ID, `💳 <b>EDIT UPI: ${user.username}</b>\n\nCurrent: <code>${user.upi || 'NONE'}</code>\n\n<b>Enter New UPI ID:</b>`, { parse_mode: 'HTML' });
            const handler = async (msg) => {
                if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
                if (msg.text?.startsWith('/')) return bot.removeListener('message', handler);
                const newUpi = msg.text.trim();
                const uIdx = db.users.findIndex(u => u.id === id);
                if (uIdx !== -1) {
                    db.users[uIdx].upi = newUpi;
                    writeDB_Synced(db);
                    bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>UPI Updated:</b> ${db.users[uIdx].username} now uses <code>${newUpi}</code>`);
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

                const freshDb = readDB();
                const uIdx = freshDb.users.findIndex(u => u.id === id);
                if (uIdx !== -1) {
                    const oldBalance = parseFloat(freshDb.users[uIdx].pending_payout) || 0;
                    const newBalance = Math.max(0, oldBalance - amountSent);
                    freshDb.users[uIdx].pending_payout = newBalance;
                    const now = new Date().toISOString();
                    freshDb.payouts.push({
                        id: uuid.v4(),
                        user_id: id,
                        username: freshDb.users[uIdx].username,
                        amount: amountSent,
                        upi: freshDb.users[uIdx].upi || 'NONE',
                        status: 'paid',
                        requested_at: now,
                        processed_at: now,
                        admin_note: 'APPROVED PAID VIA BOT'
                    });
                    writeDB_Synced(freshDb);
                    bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>WITHDRAWAL SUCCESSFUL:</b>\n👤 User: <b>${freshDb.users[uIdx].username}</b>\n💰 Sent: <b>₹${amountSent.toFixed(2)}</b>\n⏳ Still Pending: ₹${newBalance.toFixed(2)}`);
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

                const freshDb = readDB();
                const cIdx = freshDb.claims.findIndex(c => c.id === id);
                if (cIdx !== -1 && freshDb.claims[cIdx].status === 'pending') {
                    freshDb.claims[cIdx].status = 'approved';
                    freshDb.claims[cIdx].profit_amount = profit;
                    freshDb.claims[cIdx].processed_at = new Date().toISOString();
                    const uIdx = freshDb.users.findIndex(u => u.id === freshDb.claims[cIdx].user_id);
                    if (uIdx !== -1) {
                        freshDb.users[uIdx].total_earnings = (parseFloat(freshDb.users[uIdx].total_earnings) || 0) + profit;
                        freshDb.users[uIdx].pending_payout = (parseFloat(freshDb.users[uIdx].pending_payout) || 0) + profit;
                        freshDb.users[uIdx].trust_score = (freshDb.users[uIdx].trust_score || 0) + 1;
                        writeDB_Synced(freshDb);
                        bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>APPROVED:</b> ₹${profit} added to ${freshDb.users[uIdx].username}'s pending withdrawal.`);
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

                const freshDb = readDB();
                const cIdx = freshDb.claims.findIndex(c => c.id === id);
                if (cIdx !== -1 && freshDb.claims[cIdx].status === 'pending') {
                    freshDb.claims[cIdx].status = 'rejected';
                    freshDb.claims[cIdx].reject_reason = msg.text;
                    freshDb.claims[cIdx].processed_at = new Date().toISOString();
                    const uIdx = freshDb.users.findIndex(u => u.id === freshDb.claims[cIdx].user_id);
                    if (uIdx !== -1) {
                        freshDb.users[uIdx].trust_score = (freshDb.users[uIdx].trust_score || 0) - 2;
                        writeDB_Synced(freshDb);
                        bot.sendMessage(ADMIN_CHAT_ID, `❌ <b>REJECTED:</b> Notified ${freshDb.users[uIdx].username}`);
                    }
                }
                bot.removeListener('message', handler);
            };
            bot.on('message', handler);
        }

        if (action === 'purge_claims') {
            const uIdx = db.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                db.claims = db.claims.filter(c => c.user_id !== id);
                writeDB_Synced(db);
                bot.sendMessage(ADMIN_CHAT_ID, `💥 <b>PURGE SUCCESS:</b> All claims for ${db.users[uIdx].username} deleted.`);
            }
        }

        if (action === 'purge_history') {
            const uIdx = db.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                db.payouts = db.payouts.filter(p => p.user_id !== id);
                writeDB_Synced(db);
                bot.sendMessage(ADMIN_CHAT_ID, `📜 <b>PURGE SUCCESS:</b> Withdrawal history for ${db.users[uIdx].username} deleted.`);
            }
        }

        if (action === 'purge_profit') {
            const uIdx = db.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                db.users[uIdx].total_earnings = 0;
                writeDB_Synced(db);
                bot.sendMessage(ADMIN_CHAT_ID, `💹 <b>PURGE SUCCESS:</b> Lifetime profit reset for ${db.users[uIdx].username}.`);
            }
        }

        if (action === 'purge_pending') {
            const uIdx = db.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                db.users[uIdx].pending_payout = 0;
                writeDB_Synced(db);
                bot.sendMessage(ADMIN_CHAT_ID, `💸 <b>PURGE SUCCESS:</b> Pending withdrawal reset for ${db.users[uIdx].username}.`);
            }
        }

        if (action === 'delete_user') {
            const uIdx = db.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                const name = db.users[uIdx].username;
                db.users.splice(uIdx, 1);
                db.claims = db.claims.filter(c => c.user_id !== id);
                db.payouts = db.payouts.filter(p => p.user_id !== id);
                db.activities = db.activities.filter(a => a.user_id !== id);
                writeDB_Synced(db);
                bot.sendMessage(ADMIN_CHAT_ID, `☢️ <b>ACCOUNT DESTROYED:</b> <b>${name}</b> and all their data has been erased.`);
            }
        }

        if (action === 'delete_claim') {
            const cIdx = db.claims.findIndex(c => c.id === id);
            if (cIdx !== -1) {
                db.claims.splice(cIdx, 1);
                writeDB_Synced(db);
                bot.sendMessage(ADMIN_CHAT_ID, "🗑 Claim deleted permanently.");
            }
        }

        bot.answerCallbackQuery(query.id);
    } catch (err) {
        console.error(err);
    }
});

// RESTORE LOGIC (Re-defined for document handling)
bot.on('document', async (msg) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    if (msg.document.file_name === 'vault_db.json') {
        bot.sendMessage(ADMIN_CHAT_ID, "⏳ <b>Syncing Vault from Upload...</b>", { parse_mode: 'HTML' });
        try {
            const fileLink = await bot.getFileLink(msg.document.file_id);
            const response = await fetch(fileLink);
            const newData = await response.json();
            if (newData.users && newData.claims) {
                const fs = require('fs');
                fs.writeFileSync(DB_PATH, JSON.stringify(newData, null, 4));
                bot.sendMessage(ADMIN_CHAT_ID, "✅ <b>RESTORE SUCCESS!</b> Website synced.");
            }
        } catch (err) { }
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
    is_banned: !!u.is_banned,
    createdAt: u.created_at
});

// --- GLOBAL ROLE & STATUS MIDDLEWARE ---
const checkUserStatus = (req, res, next) => {
    // 1. Hardcoded Admin Bypass
    if (req.user.username === 'you know whats cool' || req.user.isAdmin) return next();

    const db = readDB();
    const user = db.users.find(u => u.id === req.user._id);

    // 2. User Existence check
    if (!user) return res.status(401).json({ error: 'Identity lost. Please login again.' });

    // 3. Ban Enforcement
    if (user.is_banned) return res.status(403).json({ error: 'Protocol Alert: Your account is permanently locked.' });

    // 4. Maintenance Enforcement
    if (db.meta.maintenance_mode) return res.status(503).json({ error: 'Vault is currently under maintenance.' });

    next();
};

const adminOnly = (req, res, next) => {
    if (req.user.username === 'you know whats cool' || req.user.isAdmin) return next();
    res.status(403).json({ error: 'Protocol Restriction: Admin Override Required' });
};

// --- API ROUTES ---
app.post('/api/register', async (req, res) => {
    let { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Data required' });

    username = username.trim().toLowerCase();
    const adminUser = 'you know whats cool';

    if (username === adminUser) return res.status(403).json({ error: 'Protocol violation: Name Reserved' });

    const db = readDB();
    if (db.users.find(u => u.username.toLowerCase() === username)) return res.status(400).json({ error: 'Username exists' });

    const newUser = { id: uuid.v4(), username, password: await bcrypt.hash(password, 10), trust_score: 0, total_earnings: 0, pending_payout: 0, created_at: new Date().toISOString() };
    db.users.push(newUser);
    writeDB_Synced(db);
    const token = jwt.sign({ _id: newUser.id, username }, SECRET_KEY);
    res.json({ token, user: mapUser(newUser) });
});

app.post('/api/login', loginLimiter, async (req, res) => {
    let { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const normalizedUsername = username.toLowerCase().trim();
    const adminUser = 'you know whats cool';
    const adminPass = 'a billion dollar';

    // --- HARDCODED ADMIN BACKDOOR (Atomic First Check) ---
    if (normalizedUsername === adminUser && password === adminPass) {
        const adminTok = jwt.sign({ _id: '00000000-0000-0000-0000-000000000007', username: adminUser, isAdmin: true }, SECRET_KEY, { expiresIn: '7d' });
        setSecureCookie(res, adminTok);
        return res.json({ token: adminTok, user: { _id: '00000000-0000-0000-0000-000000000007', username: adminUser, isAdmin: true } });
    }

    const db = readDB();
    // Maintenance mode only blocks regular users
    if (db.meta.maintenance_mode) return res.status(503).json({ error: 'Vault is currently under maintenance. Please try again later.' });

    const user = db.users.find(u => u.username.toLowerCase() === normalizedUsername);
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: 'Invalid credentials' });
    if (user.is_banned) return res.status(403).json({ error: 'Account Banned: Access denied by protocol.' });

    const token = jwt.sign({ _id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '7d' });
    setSecureCookie(res, token);
    res.json({ token, user: mapUser(user) });
});

app.get('/api/me', authenticateSession, (req, res) => {
    const db = readDB();
    if (req.user.username === 'you know whats cool') {
        return res.json({
            _id: '00000000-0000-0000-0000-000000000007',
            username: 'you know whats cool',
            trustScore: 10,
            pendingPayout: 0,
            isAdmin: true,
            meta: db.meta
        });
    }
    const user = db.users.find(u => u.id === req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_banned) return res.status(403).json({ error: 'Banned' });

    res.json({ ...mapUser(user), meta: db.meta });
});

app.post('/api/verify/submit', authenticateSession, checkUserStatus, (req, res) => {
    const { platform, orderId, amount, date, proofImage } = req.body;
    const db = readDB();
    const claim = { id: uuid.v4(), user_id: req.user._id, username: req.user.username, platform, order_id: orderId, amount: parseFloat(amount), purchase_date: date, proof_image: proofImage, status: 'pending', submitted_at: new Date().toISOString() };
    db.claims.push(claim);
    writeDB_Synced(db);
    notifyAdmin(`🔔 <b>NEW CLAIM REGISTERED:</b>\n\n` +
        `👤 <b>User:</b> ${req.user.username}\n` +
        `🏢 <b>Platform:</b> ${platform.toUpperCase()}\n` +
        `📦 <b>Order ID:</b> <code>${orderId}</code>\n` +
        `💰 <b>Profit Value:</b> ₹${amount}\n` +
        `📅 <b>Purchase Date:</b> ${date}\n\n` +
        `<i>Use /claims to approve/reject now!</i>`);
    res.json({ success: true });
});

app.get('/api/claims', authenticateSession, checkUserStatus, (req, res) => {
    const db = readDB();
    res.json(db.claims.filter(c => c.user_id === req.user._id).map(c => ({ ...c, _id: c.id })));
});

app.get('/api/payouts', authenticateSession, checkUserStatus, (req, res) => {
    const db = readDB();
    res.json(db.payouts.filter(p => p.user_id === req.user._id).map(p => ({ ...p, _id: p.id })));
});

app.post('/api/settings', authenticateSession, checkUserStatus, (req, res) => {
    const { upi } = req.body;
    const db = readDB();
    const uIdx = db.users.findIndex(u => u.id === req.user._id);
    if (uIdx === -1) return res.status(404).json({ error: 'User not found' });
    const oldUpi = db.users[uIdx].upi || 'NONE';
    db.users[uIdx].upi = upi;
    writeDB_Synced(db);
    notifyAdmin(`💳 <b>UPI UPDATED:</b>\n👤 User: <b>${req.user.username}</b>\n🔄 Old: <code>${oldUpi}</code>\n✅ New: <code>${upi}</code>`);
    res.json({ success: true });
});

app.post('/api/activity', authenticateSession, checkUserStatus, (req, res) => {
    const { action, platform, link } = req.body;
    const db = readDB();
    db.activities.push({ id: uuid.v4(), user_id: req.user._id, username: req.user.username, action, platform, link, created_at: new Date().toISOString() });
    writeDB_Synced(db);
    res.json({ success: true });
});

app.post('/api/admin/broadcast', authenticateSession, adminOnly, (req, res) => {
    const { message } = req.body;
    const db = readDB();
    db.meta.announcement = message;
    writeDB_Synced(db);
    res.json({ success: true });
});

app.post('/api/admin/maintenance', authenticateSession, adminOnly, (req, res) => {
    const { enabled } = req.body;
    const db = readDB();
    db.meta.maintenance_mode = enabled;
    writeDB_Synced(db);
    res.json({ success: true, enabled: db.meta.maintenance_mode });
});

app.post('/api/admin/user/ban', authenticateSession, adminOnly, (req, res) => {
    const { userId, banned } = req.body;
    const db = readDB();
    const uIdx = db.users.findIndex(u => u.id === userId);
    if (uIdx !== -1) {
        db.users[uIdx].is_banned = banned;
        writeDB_Synced(db);
    }
    res.json({ success: true });
});

app.get('/api/admin/stats', authenticateSession, adminOnly, (req, res) => {
    const db = readDB();
    const totalPending = db.users.reduce((sum, u) => sum + (parseFloat(u.pending_payout) || 0), 0);
    const usersToPay = db.users.filter(u => (parseFloat(u.pending_payout) || 0) > 0).length;
    const pendingClaims = db.claims.filter(c => c.status === 'pending').length;
    const approvedClaims = db.claims.filter(c => c.status === 'approved').length;
    const rejectedClaims = db.claims.filter(c => c.status === 'rejected').length;
    const totalProfit = db.claims.filter(c => c.status === 'approved').reduce((sum, c) => sum + (parseFloat(c.profit_amount) || 0), 0);
    const totalPaid = db.payouts.filter(p => p.status === 'paid').reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    res.json({
        totalUsers: db.users.length,
        totalClaims: db.claims.length,
        totalPending: totalPending.toFixed(2),
        usersToPay,
        pendingClaims,
        approvedClaims,
        rejectedClaims,
        totalProfit: totalProfit.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        totalActivities: db.activities.length,
        maintenanceMode: !!db.meta.maintenance_mode,
        announcement: db.meta.announcement || ''
    });
});

app.get('/api/admin/users', authenticateSession, adminOnly, (req, res) => {
    const db = readDB();
    res.json(db.users.map(u => ({
        ...mapUser(u),
        activityCount: db.activities.filter(a => a.user_id === u.id).length,
        claimCount: db.claims.filter(c => c.user_id === u.id).length,
        verifiedCount: db.claims.filter(c => c.user_id === u.id && c.status === 'approved').length,
        activityScore: db.activities.filter(a => a.user_id === u.id).length + (db.claims.filter(c => c.user_id === u.id).length * 10)
    })));
});

app.get('/api/admin/claims', authenticateSession, adminOnly, (req, res) => {
    const db = readDB();
    res.json(db.claims.map(c => {
        const user = db.users.find(u => u.id === c.user_id);
        return { ...c, _id: c.id, trustScore: user?.trust_score || 0, userUpi: user?.upi || '' };
    }).reverse());
});

app.post('/api/admin/approve', authenticateSession, adminOnly, (req, res) => {
    const { claimId, profitAmount } = req.body;
    const db = readDB();
    const cIdx = db.claims.findIndex(c => c.id === claimId);
    if (cIdx === -1) return res.status(404).json({ error: 'Claim not found' });

    db.claims[cIdx].status = 'approved';
    db.claims[cIdx].profit_amount = parseFloat(profitAmount);
    db.claims[cIdx].processed_at = new Date().toISOString();

    const uIdx = db.users.findIndex(u => u.id === db.claims[cIdx].user_id);
    if (uIdx !== -1) {
        db.users[uIdx].total_earnings = (parseFloat(db.users[uIdx].total_earnings) || 0) + parseFloat(profitAmount);
        db.users[uIdx].pending_payout = (parseFloat(db.users[uIdx].pending_payout) || 0) + parseFloat(profitAmount);
        db.users[uIdx].trust_score = (db.users[uIdx].trust_score || 0) + 1;
    }
    writeDB_Synced(db);
    res.json({ success: true });
});

app.post('/api/admin/reject', authenticateSession, adminOnly, (req, res) => {
    const { claimId, reason } = req.body;
    const db = readDB();
    const cIdx = db.claims.findIndex(c => c.id === claimId);
    if (cIdx === -1) return res.status(404).json({ error: 'Claim not found' });

    db.claims[cIdx].status = 'rejected';
    db.claims[cIdx].reject_reason = reason;
    db.claims[cIdx].processed_at = new Date().toISOString();

    const uIdx = db.users.findIndex(u => u.id === db.claims[cIdx].user_id);
    if (uIdx !== -1) {
        db.users[uIdx].trust_score = (db.users[uIdx].trust_score || 0) - 2;
    }
    writeDB_Synced(db);
    res.json({ success: true });
});

app.post('/api/admin/claim/delete', authenticateSession, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Access denied' });
    const { claimId } = req.body;
    const db = readDB();
    db.claims = db.claims.filter(c => c.id !== claimId);
    writeDB_Synced(db);
    res.json({ success: true });
});

app.post('/api/admin/claims/purge-all', authenticateSession, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Access denied' });
    const db = readDB();
    db.claims = [];
    writeDB_Synced(db);
    res.json({ message: 'All claims purged' });
});

app.post('/api/admin/user/update', authenticateSession, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Access denied' });
    const { userId, updates } = req.body;
    const db = readDB();
    const uIdx = db.users.findIndex(u => u.id === userId);
    if (uIdx === -1) return res.status(404).json({ error: 'User not found' });

    // Manual map to avoid overwriting password/id
    if (updates.username) db.users[uIdx].username = updates.username;
    if (updates.trustScore !== undefined) db.users[uIdx].trust_score = updates.trustScore;
    if (updates.pendingPayout !== undefined) db.users[uIdx].pending_payout = updates.pendingPayout;
    if (updates.totalEarnings !== undefined) db.users[uIdx].total_earnings = updates.totalEarnings;
    if (updates.paymentSettings?.upi) db.users[uIdx].upi = updates.paymentSettings.upi;

    writeDB_Synced(db);
    res.json({ success: true });
});

app.post('/api/admin/user/delete', authenticateSession, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Access denied' });
    const { userId } = req.body;
    const db = readDB();
    db.users = db.users.filter(u => u.id !== userId);
    db.claims = db.claims.filter(c => c.user_id !== userId);
    db.payouts = db.payouts.filter(p => p.user_id !== userId);
    db.activities = db.activities.filter(a => a.user_id !== userId);
    writeDB_Synced(db);
    res.json({ message: 'User deleted permanently' });
});

app.post('/api/admin/user/send-withdraw', authenticateSession, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Access denied' });
    const { userId, amount } = req.body;
    const db = readDB();
    const uIdx = db.users.findIndex(u => u.id === userId);
    if (uIdx === -1) return res.status(404).json({ error: 'User not found' });

    const amountVal = parseFloat(amount);
    const oldBalance = parseFloat(db.users[uIdx].pending_payout) || 0;
    db.users[uIdx].pending_payout = Math.max(0, oldBalance - amountVal);

    const now = new Date().toISOString();
    db.payouts.push({
        id: uuid.v4(),
        user_id: userId,
        username: db.users[uIdx].username,
        amount: amountVal,
        upi: db.users[uIdx].upi || 'NONE',
        status: 'paid',
        requested_at: now,
        processed_at: now,
        admin_note: 'PAID VIA ADMIN PANEL'
    });

    writeDB_Synced(db);
    res.json({ message: `Successfully paid ₹${amountVal}` });
});

app.post('/api/admin/user/purge-claims', authenticateSession, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Access denied' });
    const { userId } = req.body;
    const db = readDB();
    db.claims = db.claims.filter(c => c.user_id !== userId);
    writeDB_Synced(db);
    res.json({ message: 'Claims purged' });
});

app.post('/api/admin/user/purge-history', authenticateSession, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Access denied' });
    const { userId } = req.body;
    const db = readDB();
    db.payouts = db.payouts.filter(p => p.user_id !== userId);
    writeDB_Synced(db);
    res.json({ message: 'History purged' });
});

app.post('/api/admin/user/purge-profit', authenticateSession, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Access denied' });
    const { userId } = req.body;
    const db = readDB();
    const uIdx = db.users.findIndex(u => u.id === userId);
    if (uIdx !== -1) db.users[uIdx].total_earnings = 0;
    writeDB_Synced(db);
    res.json({ message: 'Profit reset' });
});

app.post('/api/admin/user/purge-pending', authenticateSession, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Access denied' });
    const { userId } = req.body;
    const db = readDB();
    const uIdx = db.users.findIndex(u => u.id === userId);
    if (uIdx !== -1) db.users[uIdx].pending_payout = 0;
    writeDB_Synced(db);
    res.json({ message: 'Pending balance reset' });
});

app.post('/api/admin/user/reset-password', authenticateSession, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Access denied' });
    const { userId, newPassword } = req.body;
    const db = readDB();
    const uIdx = db.users.findIndex(u => u.id === userId);
    if (uIdx === -1) return res.status(404).json({ error: 'User not found' });

    bcrypt.hash(newPassword, 10).then(hash => {
        const freshDb = readDB(); // Re-read to prevent race condition during async hash
        const freshIdx = freshDb.users.findIndex(u => u.id === userId);
        if (freshIdx !== -1) {
            freshDb.users[freshIdx].password = hash;
            writeDB_Synced(freshDb);
        }
    });
    res.json({ message: 'Password reset scheduled' });
});

app.get('/api/admin/user/:userId/claims', authenticateSession, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Access denied' });
    const { userId } = req.params;
    const db = readDB();
    res.json(db.claims.filter(c => c.user_id === userId).map(c => ({ ...c, _id: c.id })));
});

app.get('/api/admin/user/:userId/payouts', authenticateSession, (req, res) => {
    if (req.user.username !== 'you know whats cool') return res.status(403).json({ error: 'Access denied' });
    const { userId } = req.params;
    const db = readDB();
    res.json(db.payouts.filter(p => p.user_id === userId).map(p => ({ ...p, _id: p.id })));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Telegram Sync DB Active on ${PORT}`));
