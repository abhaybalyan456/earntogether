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

// --- STATE MANAGE: ANTI-RACE/MULTI-SIGNAL ADMIN SESSIONS ---
const adminActionState = new Map();

// Helper: Clear state immediately
const resetState = (chatId) => adminActionState.delete(chatId);

// --- GLOBAL MESSAGE LISTENER FOR STATE HANDLING ---
bot.on('message', async (msg) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    if (msg.text?.startsWith('/')) {
        resetState(msg.chat.id); // Cancel any active prompt on new command
        return;
    }

    const state = adminActionState.get(msg.chat.id);
    if (!state) return;

    const { action, id, username } = state;
    const input = msg.text?.trim();
    if (!input) return;

    try {
        const freshDb = readDB();

        if (action === 'edit_earnings') {
            const val = parseFloat(input);
            if (isNaN(val)) return bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Invalid amount (Numbers Only).");
            const uIdx = freshDb.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                freshDb.users[uIdx].total_earnings = val;
                writeDB_Synced(freshDb);
                bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>PROFIT UPDATED:</b> ${freshDb.users[uIdx].username} now has ₹${val.toFixed(2)} cumulative.`);
            }
        }

        if (action === 'edit_karma') {
            const val = parseInt(input);
            if (isNaN(val)) return bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Invalid score (Numbers Only).");
            const uIdx = freshDb.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                freshDb.users[uIdx].trust_score = val;
                writeDB_Synced(freshDb);
                bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>KARMA UPDATED:</b> Score for ${freshDb.users[uIdx].username} is now ${val}`);
            }
        }

        if (action === 'rename_user') {
            const newName = input.toLowerCase();
            const uIdx = freshDb.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                const oldName = freshDb.users[uIdx].username;
                freshDb.users[uIdx].username = newName;
                // Sync related records
                freshDb.claims.forEach(c => { if (c.user_id === id) c.username = newName; });
                freshDb.payouts.forEach(p => { if (p.user_id === id) p.username = newName; });
                writeDB_Synced(freshDb);
                bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>IDENTITY SYNCED:</b> [${oldName}] is now known as <b>${newName}</b>`);
            }
        }

        if (action === 'edit_pending') {
            const val = parseFloat(input);
            if (isNaN(val)) return bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Invalid amount.");
            const uIdx = freshDb.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                freshDb.users[uIdx].pending_payout = val;
                writeDB_Synced(freshDb);
                bot.sendMessage(ADMIN_CHAT_ID, `✅ <b>BALANCE FIXED:</b> ${freshDb.users[uIdx].username} has ₹${val.toFixed(2)} pending.`);
            }
        }

        if (action === 'edit_upi') {
            const uIdx = freshDb.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                freshDb.users[uIdx].upi = input;
                writeDB_Synced(freshDb);
                bot.sendMessage(ADMIN_CHAT_ID, `💳 <b>UPI SYNCED:</b> Account verified with ID [${input}]`);
            }
        }

        if (action === 'send_withdraw') {
            const amountSent = parseFloat(input);
            if (isNaN(amountSent) || amountSent <= 0) return bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Invalid amount.");
            const uIdx = freshDb.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                const oldBal = parseFloat(freshDb.users[uIdx].pending_payout) || 0;
                const newBal = Math.max(0, oldBal - amountSent);
                freshDb.users[uIdx].pending_payout = newBal;
                freshDb.payouts.push({
                    id: uuid.v4(), user_id: id, username: freshDb.users[uIdx].username,
                    amount: amountSent, upi: freshDb.users[uIdx].upi || 'NONE',
                    status: 'paid', requested_at: new Date().toISOString(),
                    processed_at: new Date().toISOString(), admin_note: 'BOT_AUTO_SETTLE'
                });
                writeDB_Synced(freshDb);
                bot.sendMessage(ADMIN_CHAT_ID, `🏧 <b>WITHDRAWAL SETTLED:</b>\n👤 <b>${freshDb.users[uIdx].username}</b>\n💰 Total Sent: ₹${amountSent.toFixed(2)}\n⏳ Remaining: ₹${newBal.toFixed(2)}`);
            }
        }

        if (action === 'approve_claim') {
            const profitVal = parseFloat(input);
            if (isNaN(profitVal)) return bot.sendMessage(ADMIN_CHAT_ID, "⚠️ Invalid amount.");
            const cIdx = freshDb.claims.findIndex(c => c.id === id);
            if (cIdx !== -1 && freshDb.claims[cIdx].status === 'pending') {
                freshDb.claims[cIdx].status = 'approved';
                freshDb.claims[cIdx].profit_amount = profitVal;
                freshDb.claims[cIdx].processed_at = new Date().toISOString();
                const uIdx = freshDb.users.findIndex(u => u.id === freshDb.claims[cIdx].user_id);
                if (uIdx !== -1) {
                    freshDb.users[uIdx].total_earnings = (parseFloat(freshDb.users[uIdx].total_earnings) || 0) + profitVal;
                    freshDb.users[uIdx].pending_payout = (parseFloat(freshDb.users[uIdx].pending_payout) || 0) + profitVal;
                    freshDb.users[uIdx].trust_score = (freshDb.users[uIdx].trust_score || 0) + 1;
                    writeDB_Synced(freshDb);
                    bot.sendMessage(ADMIN_CHAT_ID, `💎 <b>CLAIM APPROVED:</b> Added ₹${profitVal} to <b>${freshDb.users[uIdx].username}</b>'s vault.`);
                }
            }
        }

        if (action === 'reject_claim') {
            const cIdx = freshDb.claims.findIndex(c => c.id === id);
            if (cIdx !== -1 && freshDb.claims[cIdx].status === 'pending') {
                freshDb.claims[cIdx].status = 'rejected';
                freshDb.claims[cIdx].reject_reason = input;
                freshDb.claims[cIdx].processed_at = new Date().toISOString();
                const uIdx = freshDb.users.findIndex(u => u.id === freshDb.claims[cIdx].user_id);
                if (uIdx !== -1) {
                    freshDb.users[uIdx].trust_score = (freshDb.users[uIdx].trust_score || 0) - 2;
                    writeDB_Synced(freshDb);
                    bot.sendMessage(ADMIN_CHAT_ID, `❌ <b>CLAIM REJECTED:</b> Reason set as [${input}]`);
                }
            }
        }

        resetState(msg.chat.id); // Wipe state after successful handling
    } catch (err) {
        console.error('[STATE ERROR]', err);
    }
});

// Handle Callbacks
bot.on('callback_query', async (query) => {
    const data = query.data;
    const [action, id] = data.split(':');
    const chatId = query.message.chat.id;

    try {
        const db = readDB();

        if (action === 'edit_earnings') {
            adminActionState.set(chatId, { action, id });
            bot.sendMessage(chatId, "📈 <b>Enter Lifetime Profit (₹):</b>", { parse_mode: 'HTML' });
        }
        else if (action === 'edit_karma') {
            adminActionState.set(chatId, { action, id });
            bot.sendMessage(chatId, "💎 <b>Enter New Karma Score:</b>", { parse_mode: 'HTML' });
        }
        else if (action === 'rename_user') {
            adminActionState.set(chatId, { action, id });
            bot.sendMessage(chatId, "👤 <b>Enter New VAULT IDENTITY:</b>", { parse_mode: 'HTML' });
        }
        else if (action === 'edit_pending') {
            adminActionState.set(chatId, { action, id });
            bot.sendMessage(chatId, "💸 <b>Enter New Pending Balance (₹):</b>", { parse_mode: 'HTML' });
        }
        else if (action === 'edit_upi') {
            adminActionState.set(chatId, { action, id });
            bot.sendMessage(chatId, "💳 <b>Enter New UPI ID:</b>", { parse_mode: 'HTML' });
        }
        else if (action === 'send_withdraw') {
            adminActionState.set(chatId, { action, id });
            bot.sendMessage(chatId, "💸 <b>Enter Amount to SEND (₹):</b>", { parse_mode: 'HTML' });
        }
        else if (action === 'approve_claim') {
            adminActionState.set(chatId, { action, id });
            bot.sendMessage(chatId, "💵 <b>Enter Profit Amount for Approval (₹):</b>", { parse_mode: 'HTML' });
        }
        else if (action === 'reject_claim') {
            adminActionState.set(chatId, { action, id });
            bot.sendMessage(chatId, "📝 <b>Enter reason for rejection:</b>", { parse_mode: 'HTML' });
        }
        else if (action === 'purge_claims') {
            const uIdx = db.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                db.claims = db.claims.filter(c => c.user_id !== id);
                writeDB_Synced(db);
                bot.sendMessage(chatId, `💥 <b>PURGE SUCCESS:</b> All claims for ${db.users[uIdx].username} deleted.`);
            }
        }
        else if (action === 'purge_history') {
            const uIdx = db.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                db.payouts = db.payouts.filter(p => p.user_id !== id);
                writeDB_Synced(db);
                bot.sendMessage(chatId, `📜 <b>PURGE SUCCESS:</b> Withdrawal history for ${db.users[uIdx].username} deleted.`);
            }
        }
        else if (action === 'purge_profit') {
            const uIdx = db.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                db.users[uIdx].total_earnings = 0;
                writeDB_Synced(db);
                bot.sendMessage(chatId, `💹 <b>PURGE SUCCESS:</b> Lifetime profit reset for ${db.users[uIdx].username}.`);
            }
        }
        else if (action === 'purge_pending') {
            const uIdx = db.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                db.users[uIdx].pending_payout = 0;
                writeDB_Synced(db);
                bot.sendMessage(chatId, `💸 <b>PURGE SUCCESS:</b> Pending withdrawal reset for ${db.users[uIdx].username}.`);
            }
        }
        else if (action === 'delete_user') {
            const uIdx = db.users.findIndex(u => u.id === id);
            if (uIdx !== -1) {
                const name = db.users[uIdx].username;
                db.users.splice(uIdx, 1);
                db.claims = db.claims.filter(c => c.user_id !== id);
                db.payouts = db.payouts.filter(p => p.user_id !== id);
                db.activities = db.activities.filter(a => a.user_id !== id);
                writeDB_Synced(db);
                bot.sendMessage(chatId, `☢️ <b>ACCOUNT DESTROYED:</b> <b>${name}</b> and all their data has been erased.`);
            }
        }
        else if (action === 'delete_claim') {
            const cIdx = db.claims.findIndex(c => c.id === id);
            if (cIdx !== -1) {
                db.claims.splice(cIdx, 1);
                writeDB_Synced(db);
                bot.sendMessage(chatId, "🗑 Claim deleted permanently.");
            }
        }

        bot.answerCallbackQuery(query.id);
    } catch (err) {
        console.error(err);
    }
});

// RESTORE LOGIC (Improved)
bot.on('document', async (msg) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    if (msg.document.file_name === 'vault_db.json') {
        try {
            const fileLink = await bot.getFileLink(msg.document.file_id);
            const response = await fetch(fileLink);
            const newData = await response.json();
            if (newData.users && newData.claims) {
                const fs = require('fs');
                fs.writeFileSync(DB_PATH, JSON.stringify(newData, null, 4));
                bot.sendMessage(ADMIN_CHAT_ID, "✅ <b>RESTORE SUCCESS!</b> Database synced.");
            }
        } catch (err) {
            bot.sendMessage(ADMIN_CHAT_ID, "❌ Restore failed: " + err.message);
        }
    }
});

// --- DATA NORMALIZERS ---
const mapUser = (u) => ({
    _id: u.id,
    username: u.username,
    trustScore: u.trust_score,
    totalEarnings: parseFloat(u.total_earnings) || 0,
    pendingPayout: parseFloat(u.pending_payout) || 0,
    paymentSettings: { upi: u.upi || '' },
    isBanned: !!u.is_banned,
    createdAt: u.created_at
});

const mapClaim = (c) => ({
    _id: c.id,
    user_id: c.user_id,
    username: c.username,
    platform: c.platform,
    orderId: c.orderId || c.order_id,
    amount: parseFloat(c.amount) || 0,
    purchaseDate: c.purchaseDate || c.purchase_date,
    proofImage: c.proofImage || c.proof_image,
    status: c.status,
    submittedAt: c.submittedAt || c.submitted_at,
    profitAmount: parseFloat(c.profitAmount || c.profit_amount) || 0,
    processedAt: c.processedAt || c.processed_at,
    rejectReason: c.rejectReason || c.reject_reason
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
    const token = jwt.sign({ _id: newUser.id, username }, SECRET_KEY, { expiresIn: '7d' });
    setSecureCookie(res, token);
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
    const claim = {
        id: uuid.v4(),
        user_id: req.user._id,
        username: req.user.username,
        platform,
        orderId,
        amount: parseFloat(amount),
        purchaseDate: date,
        proofImage,
        status: 'pending',
        submittedAt: new Date().toISOString()
    };
    db.claims.push(claim);
    writeDB_Synced(db);
    const caption = `🔔 <b>NEW CLAIM REGISTERED:</b>\n\n` +
        `👤 <b>User:</b> ${req.user.username}\n` +
        `🏢 <b>Platform:</b> ${platform.toUpperCase()}\n` +
        `📦 <b>Order ID:</b> <code>${orderId}</code>\n` +
        `💰 <b>Profit Value:</b> ₹${amount}\n` +
        `📅 <b>Purchase Date:</b> ${date}\n\n` +
        `<i>Use /claims to approve/reject now!</i>`;

    if (proofImage) {
        try {
            const matches = proofImage.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const buffer = Buffer.from(matches[2], 'base64');
                const contentType = matches[1];
                if (contentType.includes('pdf')) {
                    bot.sendDocument(ADMIN_CHAT_ID, buffer, { caption, parse_mode: 'HTML' }, { filename: 'proof.pdf', contentType });
                } else {
                    bot.sendPhoto(ADMIN_CHAT_ID, buffer, { caption, parse_mode: 'HTML' }, { filename: 'proof.jpg', contentType });
                }
            } else {
                notifyAdmin(caption);
            }
        } catch (e) {
            notifyAdmin(caption);
        }
    } else {
        notifyAdmin(caption);
    }

    res.json({ success: true });
});

app.get('/api/claims', authenticateSession, checkUserStatus, (req, res) => {
    const db = readDB();
    res.json(db.claims.filter(c => c.user_id === req.user._id).map(mapClaim));
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
    const totalProfit = db.claims.filter(c => c.status === 'approved').reduce((sum, c) => sum + (parseFloat(c.profitAmount || c.profit_amount) || 0), 0);
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
        const mapped = mapClaim(c);
        return { ...mapped, trustScore: user?.trust_score || 0, userUpi: user?.upi || '' };
    }).reverse());
});

app.post('/api/admin/approve', authenticateSession, adminOnly, (req, res) => {
    const { claimId, profitAmount } = req.body;
    const db = readDB();
    const cIdx = db.claims.findIndex(c => c.id === claimId);
    if (cIdx === -1) return res.status(404).json({ error: 'Claim not found' });

    db.claims[cIdx].status = 'approved';
    db.claims[cIdx].profitAmount = parseFloat(profitAmount);
    db.claims[cIdx].processedAt = new Date().toISOString();

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
    db.claims[cIdx].rejectReason = reason;
    db.claims[cIdx].processedAt = new Date().toISOString();

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

// --- API 404 FALLBACK: MATCH ALL UNMATCHED /api ROUTE ---
app.all(/^\/api\/.*/, (req, res) => {
    res.status(404).json({ error: 'Endpoint not found. No protocol exists for this path.' });
});

// --- SPA ROUTING: SERVE INDEX.HTML FOR CLIENT-SIDE NAVIGATION ---
app.get(/^((?!\/api).)*$/, (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// --- GLOBAL JSON ERROR HANDLER ---
app.use((err, req, res, next) => {
    console.error('[PROTOCOL ERROR]', err.stack);
    res.status(req.status || 500).json({
        error: 'Vault Communication Failure',
        protocol: 'STEEL_VAULT_ERROR',
        status: req.status || 500
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Telegram Sync DB Active on ${PORT}`));
