const mongoose = require('mongoose');

// Provided URI for reference (MUST be encoded if used directly)
// URI: mongodb+srv://abhaybalyan:abhay%40%230987%40%26@cluster0.hx9rwor.mongodb.net/?appName=Cluster0
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://abhaybalyan:abhay%40%230987%40%26@cluster0.hx9rwor.mongodb.net/?appName=Cluster0';

let isConnected = false;

/**
 * Singleton Pattern for MongoDB Connection
 */
const connectDB = async () => {
    if (isConnected) {
        return mongoose.connection;
    }

    try {
        const db = await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        isConnected = db.connections[0].readyState === 1;
        console.log('✅ Connected to MongoDB Cluster');
        return db;
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        // Important: Don't let the process hang if we are on a serverless platform
        throw new Error('Database connection failed.');
    }
};

/**
 * Dynamic Schemas
 */

// 1. User Schema (Dynamic & Flexible)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    trustScore: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    pendingPayout: { type: Number, default: 0 },
    paymentSettings: {
        upi: { type: String, default: '' },
        bankName: { type: String, default: '' },
        accountNumber: { type: String, default: '' }
    },
    // Flexible data field for JSON/Metadata extension
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    history: {
        clicks: Array,
        actions: Array
    }
}, { strict: false }); // Allow dynamic fields outside the schema if needed

// 2. Claim Schema
const claimSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    username: String,
    platform: String,
    orderId: { type: String, unique: true, index: true },
    amount: Number,
    profitAmount: { type: Number, default: 0 },
    purchaseDate: Date,
    proofImage: String, // String (Base64) or URL
    status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] },
    submittedAt: { type: Date, default: Date.now },
    processedAt: Date,
    rejectReason: String
});

// 3. Payout Schema
const payoutSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    username: String,
    amount: Number,
    upi: String,
    status: { type: String, default: 'pending', enum: ['pending', 'paid', 'rejected'] },
    requestedAt: { type: Date, default: Date.now },
    processedAt: Date,
    adminNote: String
});

// 4. File Metadata Schema (Logic #3)
const fileSchema = new mongoose.Schema({
    name: String,
    size: Number,
    type: String,
    url: String, // Reference URL
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
    metadata: mongoose.Schema.Types.Mixed
});

// 5. Activity Schema
const activitySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: String,
    platform: String,
    link: String,
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Claim = mongoose.models.Claim || mongoose.model('Claim', claimSchema);
const Payout = mongoose.models.Payout || mongoose.model('Payout', payoutSchema);
const FileMetadata = mongoose.models.FileMetadata || mongoose.model('FileMetadata', fileSchema);
const Activity = mongoose.models.Activity || mongoose.model('Activity', activitySchema);

module.exports = {
    connectDB,
    User,
    Claim,
    Payout,
    FileMetadata,
    Activity
};
