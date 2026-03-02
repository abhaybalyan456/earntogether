const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'vault_db.json');

// Initial Schema
const initialData = {
    users: [],
    claims: [],
    payouts: [],
    activities: [],
    meta: {
        last_updated: new Date().toISOString(),
        version: "2.0.0-TELEGRAM-DB"
    }
};

// Ensure DB exists
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 4));
}

const readDB = () => {
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("DB Read Error, recovering...", err);
        return initialData;
    }
};

const writeDB = (data) => {
    try {
        data.meta.last_updated = new Date().toISOString();
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 4));
        return true;
    } catch (err) {
        console.error("DB Write Error!", err);
        return false;
    }
};

module.exports = { readDB, writeDB, DB_PATH };
