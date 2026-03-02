import { useState, useEffect, useCallback, useRef } from 'react'
import { Link2, ShoppingCart, Landmark, TrendingUp, ShieldCheck, ShieldAlert, Copy, CheckCircle2, Zap, ExternalLink, LineChart, Sparkles, Shirt, Smartphone, Droplets, Plane, User, Users, LogOut, Key, History, AlertCircle, Crown, Shield, Hexagon, Wallet, CreditCard, Settings, ChevronRight, FileText, Check, X, Camera, Eye, Award, FileCheck, RotateCw, Clock, Send, Instagram, MessageCircle, Headphones } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import AdminPanel from './AdminPanel'
import './index.css'

const API_BASE = '/api';


// --- NEW LUXURY LOGO ---
const GrowLogo = ({ size = 32 }) => (
  <div className="grow-logo-wrapper" style={{ width: size + 16, height: size + 16 }}>
    <div className="grow-logo-ring"></div>
    <div className="grow-logo-core">
      <TrendingUp size={size} strokeWidth={2} />
      <div style={{ position: 'absolute', top: -5, right: -5 }}>
        <Sparkles size={size / 2} color="var(--gold)" />
      </div>
    </div>
  </div>
);

// --- LUXURY AUTH MODAL ---
const AuthModal = ({ isOpen, type, onClose, onAuthSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = type === 'login' ? '/login' : '/register';
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Check details again.');

      localStorage.setItem('nexlink_token', data.token);
      onAuthSuccess(data.user);
      onClose();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="modal-overlay"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="lux-auth-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }} className="gold-gradient">{type === 'login' ? 'Login' : 'Create Account'}</h2>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="input-group">
            <input
              className="lux-input" type="text" value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="USERNAME" required
            />
          </div>
          <div className="input-group">
            <input
              className="lux-input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="PASSWORD" required
            />
          </div>

          {error && <div style={{ color: 'var(--ruby)', fontSize: '0.8rem', textAlign: 'center' }}>{error}</div>}

          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '1rem', fontSize: '0.7rem', color: 'var(--ruby)', textAlign: 'center', letterSpacing: '0.05em' }}>
            <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} />
            WARNING: DO NOT give your password to anyone else. We will never ask for it.
          </div>

          <button type="submit" className="lux-btn-gold" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'PROCESSING...' : type === 'login' ? 'LOGIN' : 'CREATE ACCOUNT'}
          </button>

          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', letterSpacing: '0.2em', cursor: 'pointer' }}>
            CANCEL
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
};

// --- ADMIN PANEL IS NOW IN AdminPanel.jsx ---

// --- USER DASHBOARD ---
const UserDashboard = ({ user, onUpdateSettings, onRefresh, onBack, onAdmin, platforms }) => {
  const [upi, setUpi] = useState(user.paymentSettings?.upi || '');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [payouts, setPayouts] = useState([]);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    setUpi(user.paymentSettings?.upi || '');

    // MASTER SYNC PROTOCOL: Refresh all sectors
    const deepSync = () => {
      fetchHistory();
      fetchPayouts();
      onRefresh(); // Refresh user object (Pending Payout etc)
    };

    deepSync(); // Initial sync on mount

    // AUTO-HEARTBEAT: Refresh every 30 seconds for live updates from bot
    const heartbeat = setInterval(deepSync, 30000);
    return () => clearInterval(heartbeat);
  }, [user._id]);

  const fetchHistory = async () => {
    const token = localStorage.getItem('nexlink_token');
    try {
      const res = await fetch(`${API_BASE}/claims`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setHistory(await res.json());
    } catch (err) { console.error("History sync offline"); }
    setLoadingHistory(false);
  };

  const fetchPayouts = async () => {
    const token = localStorage.getItem('nexlink_token');
    try {
      const res = await fetch(`${API_BASE}/payouts`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setPayouts(await res.json());
    } catch (err) { console.error("Payout sync offline"); }
  };

  // Claim Form State
  const [platform, setPlatform] = useState(platforms[0]?.name || 'Flipkart');
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [proofImage, setProofImage] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState(null); // { type: 'success' | 'warn', message: string }

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 500 * 1024 * 1024) {
        setNotification({ type: 'warn', message: "STORAGE LIMIT REACHED: This file is too heavy (over 500MB). Our high-security vault only accepts files up to 500MB to ensure fast processing. Please use a smaller photo or a compressed PDF." });
        return;
      }
      setFileName(file.name);
      setFileType(file.type);
      const reader = new FileReader();
      reader.onloadend = () => setProofImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setProofImage(null);
    setFileName('');
    setFileType('');
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    if (!upi || !upi.trim()) {
      setNotification({ type: 'warn', message: 'Enter a valid UPI ID (e.g. name@bank) to link your account.' });
      return;
    }
    setSaving(true);
    const result = await onUpdateSettings({ upi });
    setSaving(false);
    if (result.success) {
      setNotification({ type: 'success', message: 'UPI LINKED SUCCESSFULLY — Your payment ID has been securely transmitted to the Admin. All future payouts will be sent to this UPI address.' });
    } else {
      setNotification({ type: 'warn', message: result.error || 'Failed to update UPI. Please check your connection and try again.' });
    }
    fetchHistory();
  };

  const submitClaim = async (e) => {
    e.preventDefault();
    if (!proofImage) return alert('Please upload a photo of your receipt.');
    setSubmitting(true);
    const token = localStorage.getItem('nexlink_token');
    try {
      const response = await fetch(`${API_BASE}/verify/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ platform, orderId, amount, date, proofImage })
      });

      const data = await response.json().catch(() => ({ error: 'Server communication error. Please try a smaller photo or check connection.' }));
      setSubmitting(false);

      if (response.ok) {
        setNotification({ type: 'success', message: "PROTOCOL SUCCESS: Your claim has been securely transmitted to the Admin Command Center. Your payout verification window of 7-90 days starts now. You can track your pending payout status in the history below." });
        setOrderId(''); setAmount(''); setDate(''); setProofImage(null); setFileName(''); setFileType('');

        // DEEP SYNC PROTOCOL: Refresh everything (Profile, Claims, Payouts)
        fetchHistory();
        fetchPayouts();
        onRefresh();
      } else {
        setNotification({ type: 'warn', message: data.error || 'Submission failed. Please try again.' });
      }
    } catch (err) {
      setSubmitting(false);
      setNotification({ type: 'warn', message: 'System Error: Could not reach the server. Make sure your internet is active.' });
    }
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="dash-container">
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="modal-overlay"
            style={{ zIndex: 20000 }}
          >
            <div className="lux-auth-card" style={{ maxWidth: '500px', textAlign: 'center', border: notification.type === 'success' ? '1px solid var(--emerald)' : '1px solid var(--ruby)', background: '#05070a' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                {notification.type === 'success' ? (
                  <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '50%' }}>
                    <FileCheck size={48} color="var(--emerald)" />
                  </div>
                ) : (
                  <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%' }}>
                    <AlertCircle size={48} color="var(--ruby)" />
                  </div>
                )}
              </div>
              <h2 className={notification.type === 'success' ? 'gold-gradient' : ''} style={{ color: notification.type === 'success' ? 'inherit' : 'var(--ruby)', marginBottom: '1rem' }}>
                {notification.type === 'success' ? 'CLAIM SECURED' : 'PROTOCOL ALERT'}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '2rem' }}>
                {notification.message}
              </p>
              <button
                onClick={() => setNotification(null)}
                className={notification.type === 'success' ? 'lux-btn-gold' : 'lux-btn-ghost'}
                style={{ width: '100%', padding: '1rem', borderColor: notification.type === 'success' ? 'inherit' : 'var(--ruby)', color: notification.type === 'success' ? 'inherit' : 'var(--ruby)' }}
              >
                DISMISS NOTIFICATION
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="lux-flex-stack" style={{ marginBottom: '4rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h2 style={{ fontSize: '3rem' }} className="gold-gradient">Welcome, {user.username}</h2>
            <div style={{ background: 'rgba(234, 179, 8, 0.1)', padding: '0.4rem 1rem', borderRadius: '100px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--gold-muted)' }}>
              <Award size={14} color="var(--gold)" />
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--gold)' }}>TRUST: {user.trustScore || 0}</span>
            </div>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>Check your money and change your settings here.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {user.username === 'you know whats cool' && <button onClick={onAdmin} className="lux-btn-gold">ADMIN PANEL</button>}
          <button onClick={onBack} className="lux-btn-ghost">BACK TO VAULT</button>
        </div>
      </div>

      {user.meta?.announcement && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: 'linear-gradient(90deg, rgba(234, 179, 8, 0.1), rgba(234, 179, 8, 0.2))',
            border: '1px solid var(--gold-muted)',
            borderRadius: '15px',
            padding: '1.2rem 2rem',
            marginBottom: '2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}
        >
          <Sparkles size={24} color="var(--gold)" className="flicker" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--gold)', letterSpacing: '0.2em', marginBottom: '4px' }}>OFFICIAL BROADCAST</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>{user.meta.announcement}</div>
          </div>
        </motion.div>
      )}

      <div style={{ background: 'rgba(234, 179, 8, 0.05)', border: '1px solid var(--gold-muted)', borderRadius: '15px', padding: '1.5rem 2.5rem', marginBottom: '3rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <Clock size={32} color="var(--gold)" className="pulse" />
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--gold)', letterSpacing: '0.1em', marginBottom: '4px' }}>PAYOUT PROCESSING PROTOCOL</div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff', lineHeight: '1.4' }}>
            To ensure maximum profit for you, brand verification takes a standard <span style={{ color: 'var(--gold)', fontSize: '1rem' }}><b>WINDOW OF 7 TO 90 DAYS.</b></span> We work hard to process your money as fast as possible!
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="balance-card">
          <TrendingUp size={32} color="var(--gold)" style={{ marginBottom: '1.5rem' }} />
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Lifetime Profit</div>
          <div style={{ fontSize: '3.5rem', fontWeight: 800 }} className="gold-gradient">₹{(user.totalEarnings || 0).toFixed(2)}</div>
          <p style={{ fontSize: '0.9rem', marginTop: '1rem', color: 'var(--emerald)' }}>Successful Earned Legacy</p>
        </div>
        <div className="balance-card">
          <Zap size={32} color="#fbbf24" style={{ marginBottom: '1.5rem' }} />
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Pending Withdrawal</div>
          <div style={{ fontSize: '3.5rem', fontWeight: 800 }}>₹{(user.pendingPayout || 0).toFixed(2)}</div>
          <div style={{ marginTop: '1.5rem', padding: '0.8rem', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid var(--gold-muted)', borderRadius: '0.5rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--gold)', fontWeight: 900, marginBottom: '0.2rem' }}>MINIMUM WITHDRAWAL: ₹500</p>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Protocol: You will be paid instantly once your balance reaches the ₹500 threshold.</p>
          </div>
        </div>

        <button
          onClick={() => {
            onRefresh(); // Updates user object (balances etc)
            fetchHistory(); // Updates claim history
            fetchPayouts(); // Updates payout history
          }}
          className="lux-btn-ghost pulse"
          style={{ gridColumn: '1 / -1', padding: '1rem', marginTop: '1rem', fontSize: '0.6rem', letterSpacing: '0.2em' }}
        >
          FORCE DATA SYNC PROTOCOL
        </button>
      </div>

      <div className="lux-grid-2">
        <div className="settings-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '3rem' }}>
            <ShieldCheck size={28} color="var(--gold)" />
            <h3 style={{ fontSize: '2rem' }}>Claim Your Profit</h3>
          </div>

          {user.username !== 'you know whats cool' && !user?.paymentSettings?.upi && (
            <div style={{ padding: '1.2rem', background: 'rgba(234, 179, 8, 0.05)', border: '1px solid var(--gold-muted)', borderRadius: '1rem', marginBottom: '2.5rem', display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
              <div style={{ padding: '0.6rem', background: 'rgba(234, 179, 8, 0.1)', borderRadius: '10px' }}>
                <ShieldAlert size={24} color="var(--gold)" />
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--gold)', letterSpacing: '0.05em' }}>UPI PROTOCOL PENDING</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.7, color: '#fff' }}>Add your <span style={{ color: 'var(--gold)', fontWeight: 800 }}>UPI ID</span> in the Settings panel below to receive your profit distributions safely.</div>
              </div>
            </div>
          )}

          <div style={{ background: 'rgba(234, 179, 8, 0.05)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--gold-muted)', marginBottom: '2.5rem' }}>
            <p style={{ color: 'var(--gold)', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.5rem' }}>MANDATORY INSTRUCTIONS:</p>
            <ul style={{ color: 'var(--text-muted)', fontSize: '0.75rem', paddingLeft: '1.2rem', lineHeight: '1.6' }}>
              <li>Upload human-readable <b>Receipt Photo</b>.</li>
              <li>Enter the <b>Full Order ID</b> exactly as shown in your email.</li>
              <li><b>Verification:</b> Payout window is <b>7 to 90 Days</b>.</li>
              <li>Include <b>total price paid</b> for all items.</li>
            </ul>
          </div>
          <form onSubmit={submitClaim} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="lux-grid-2" style={{ gap: '1.5rem' }}>
              <div className="input-group">
                <label>PURCHASE PLATFORM</label>
                <select className="lux-input" value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ background: '#111827' }}>
                  {platforms.map(p => (
                    <option key={p.id} value={p.name} disabled={p.comingSoon}>{p.name}{p.comingSoon ? ' (COMING SOON)' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>OFFICIAL ORDER ID</label>
                <input className="lux-input" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Enter Order ID" required />
              </div>
            </div>
            <div className="lux-grid-2" style={{ gap: '1.5rem' }}>
              <div className="input-group">
                <label>TOTAL ORDER AMOUNT (₹)</label>
                <input className="lux-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
              </div>
              <div className="input-group">
                <label>DATE OF PURCHASE</label>
                <input className="lux-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
            </div>

            <div className="input-group">
              <label>UPLOAD PROOF (Receipt Photo or PDF)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="file" accept="image/*,application/pdf" onChange={handleImageChange}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                />
                <div className="lux-input" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: proofImage ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.03)' }}>
                  <Camera size={20} color={proofImage ? 'var(--emerald)' : 'var(--gold)'} />
                  <span style={{ color: proofImage ? 'var(--emerald)' : 'var(--text-muted)' }}>
                    {proofImage ? `READY: ${fileName.substring(0, 20)}${fileName.length > 20 ? '...' : ''}` : 'CLICK TO UPLOAD RECEIPT (PHOTO/PDF)'}
                  </span>
                </div>
              </div>
              {proofImage && (
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {fileType.includes('pdf') ? (
                    <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', border: '1px solid var(--ruby)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileText size={24} color="var(--ruby)" />
                      <span style={{ fontSize: '0.8rem' }}>PDF DOCUMENT</span>
                    </div>
                  ) : (
                    <img src={proofImage} style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--emerald)' }} alt="Preview" />
                  )}
                  <button type="button" onClick={removePhoto} className="lux-btn-ghost" style={{ color: 'var(--ruby)', padding: '0.5rem', borderColor: 'var(--ruby)' }}>
                    <X size={16} /> REMOVE
                  </button>
                </div>
              )}
            </div>

            <button type="submit" className="lux-btn-gold" disabled={submitting}>
              {submitting ? 'SENDING...' : 'SEND ORDER TO ADMIN'}
            </button>
          </form>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="settings-panel" style={{ padding: '3rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <Settings size={28} color="var(--gold)" />
              <h3 style={{ fontSize: '1.5rem' }}>Payout Account</h3>
            </div>

            <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
              <div style={{ padding: '2rem', background: 'rgba(234, 179, 8, 0.02)', borderRadius: '1.5rem', border: '1px dashed var(--gold-muted)' }}>
                <Zap size={32} color="var(--gold)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>WE SUPPORT ALL MAJOR UPI APPS IN THE VAULT</p>
              </div>
            </div>

            <form onSubmit={saveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div className="input-group">
                <label>YOUR UPI ID</label>
                <input className="lux-input" style={{ padding: '0.8rem' }} value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="username@upi" required />
                <p style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: '8px' }}>Withdrawals will be sent directly to this ID.</p>
              </div>
              <button type="submit" className="lux-btn-ghost" style={{ padding: '0.8rem' }}>{saving ? 'SAVING...' : 'UPDATE UPI ID'}</button>
            </form>
          </div>

          <div className="sub-card-coming">
            <Crown size={32} color="var(--glass-border)" style={{ marginBottom: '1.5rem' }} />
            <h4 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Subscription Plans</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Unlock extra tools and more earnings soon.</p>
            <div style={{ marginTop: '1.5rem', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.2em', color: 'var(--gold)' }}>FUTURE UPDATE</div>
          </div>
        </div>
      </div>

      <div className="lux-grid-2" style={{ marginTop: '4rem' }}>
        <div className="settings-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '3rem' }}>
            <History size={28} color="var(--gold)" />
            <h3 style={{ fontSize: '2rem' }}>Order History</h3>
          </div>

          {loadingHistory ? <p>Loading orders...</p> : (
            <div className="table-responsive">
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    <th style={{ padding: '1rem' }}>Info</th>
                    <th style={{ padding: '1rem' }}>Order</th>
                    <th style={{ padding: '1rem' }}>Profit</th>
                    <th style={{ padding: '1rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().slice(0, 10).map(c => (
                    <tr key={c._id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800 }}>{c.platform}</div>
                        <div style={{ fontSize: '0.55rem', opacity: 0.4 }}>{new Date(c.submittedAt).toLocaleDateString()}</div>
                      </td>
                      <td style={{ padding: '1rem' }}><code style={{ fontSize: '0.65rem' }}>{c.orderId}</code></td>
                      <td style={{ padding: '1rem', fontSize: '0.75rem' }}>₹{c.amount}</td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{
                            padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.5rem', fontWeight: 950, width: 'fit-content',
                            background: c.status === 'pending' ? 'rgba(234, 179, 8, 0.1)' : c.status === 'approved' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: c.status === 'pending' ? 'var(--gold)' : c.status === 'approved' ? 'var(--emerald)' : 'var(--ruby)',
                            border: '1px solid currentColor'
                          }}>
                            {c.status.toUpperCase()}
                          </span>
                          {c.status === 'rejected' && c.rejectReason && (
                            <div style={{ fontSize: '0.55rem', color: 'var(--ruby)', opacity: 0.8, maxWidth: '150px' }}>
                              Reason: {c.rejectReason}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {history.length === 0 && <p style={{ textAlign: 'center', padding: '2rem', fontSize: '0.8rem', opacity: 0.3 }}>No history found.</p>}
            </div>
          )}
        </div>

        <div className="settings-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <Landmark size={28} color="var(--gold)" />
            <h3 style={{ fontSize: '2rem' }}>Withdrawal History</h3>
          </div>
          <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(234, 179, 8, 0.05)', borderRadius: '10px', borderLeft: '3px solid var(--gold)' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 800 }}>MINIMUM PAYOUT THRESHOLD: ₹500</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Withdrawals are autostarted and processed instantly once your cumulative pending balance reaches ₹500.</p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  <th style={{ padding: '1rem' }}>Date</th>
                  <th style={{ padding: '1rem' }}>Amount</th>
                  <th style={{ padding: '1rem' }}>Protocol Status</th>
                </tr>
              </thead>
              <tbody>
                {[...payouts].reverse().map(p => (
                  <tr key={p._id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 800 }}>{new Date(p.requestedAt).toLocaleDateString()}</div>
                      <div style={{ fontSize: '0.55rem', opacity: 0.4 }}>Protocol Triggered</div>
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--gold)' }}>₹{p.amount.toFixed(2)}</td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{
                          padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.55rem', fontWeight: 950, width: 'fit-content',
                          background: p.status === 'pending' ? 'rgba(234, 179, 8, 0.1)' : p.status === 'paid' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: p.status === 'pending' ? 'var(--gold)' : p.status === 'paid' ? 'var(--emerald)' : 'var(--ruby)',
                          border: '1px solid currentColor'
                        }}>
                          {p.status === 'paid' ? 'APPROVED PAID' : p.status.toUpperCase()}
                        </span>
                        {p.status === 'paid' && <span style={{ fontSize: '0.5rem', color: 'var(--emerald)' }}>{p.adminNote || 'APPROVED'} ON {new Date(p.processedAt).toLocaleString()}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payouts.length === 0 && <p style={{ textAlign: 'center', padding: '2rem', fontSize: '0.8rem', opacity: 0.3 }}>No payouts requested yet.</p>}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// --- COMMISSION POLICY SECTION ---
const CommissionPolicy = ({ onSelectBrand }) => {
  const standardRates = [
    { id: 'mamaearth', name: "Mamaearth", rate: "6%", type: "Beauty" },
    { id: 'mcaffeine', name: "mCaffeine", rate: "5%", type: "Beauty" },
    { id: 'dotkey', name: "Dot & Key", rate: "5%", type: "Beauty" },
    { id: 'ajio', name: "Ajio", rate: "4%", type: "Fashion" },
    { id: 'derma', name: "Derma Co", rate: "4% - 5%", type: "Skin Care" },
    { id: 'flipkart', name: "Flipkart", rate: "3.5%", type: "E-Commerce" },
    { id: 'myntra', name: "Myntra", rate: "3.5%", type: "Fashion" },
    { id: 'croma', name: "Croma", rate: "1.5%", type: "Electronics" },
    { id: 'reliance', name: "Reliance", rate: "1%", type: "Retail" },
    { id: 'havells', name: "Havells", rate: "1%", type: "Electricals" },
    { id: 'buykaro', name: "Buy Karo", rate: "4%", type: "E-Commerce" }
  ];

  const specialRates = [
    { id: 'goibibo', brand: "Goibibo", reward: "Flat ₹50", detail: "Earned on Hotel & Flight bookings above ₹1,000." },
    { id: 'stocks', brand: "Angel One", reward: "₹70 / Account", detail: "Successful Demat opening followed by any stock investment." },
    { id: 'shopsy', brand: "Shopsy (Standard)", reward: "3% - 4%", detail: "Commission capped at ₹200 per individual order." },
    { id: 'shopsy', brand: "Shopsy (FK Items)", reward: "3% - 4%", detail: "Commission capped at ₹20 per individual order." }
  ];

  return (
    <section id="policy" style={{ padding: '10rem 2rem', position: 'relative' }}>
      <div style={{ textAlign: 'center', marginBottom: '6rem' }}>
        <h2 style={{ fontSize: '4rem', marginBottom: '1.5rem' }} className="gold-gradient">Official Commission Rates</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '800px', margin: '0 auto' }}>
          We believe in transparency. Here is the exact breakdown of what you earn for every successful purchase made through your elite links.
        </p>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
        {standardRates.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            className="commission-card"
            onClick={() => onSelectBrand(item.id)}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ fontSize: '0.65rem', color: 'var(--gold)', letterSpacing: '0.2em', fontWeight: 800, marginBottom: '0.5rem' }}>{item.type}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem' }}>{item.name}</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900 }} className="gold-gradient">{item.rate}</div>
          </motion.div>
        ))}
      </div>

      <div style={{ maxWidth: '1200px', margin: '4rem auto 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        {specialRates.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            className="special-reward-card"
            onClick={() => onSelectBrand(item.id)}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: '1.4rem', color: 'var(--gold)', marginBottom: '0.5rem' }}>{item.brand}</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{item.detail}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{item.reward}</div>
              <div style={{ fontSize: '0.6rem', opacity: 0.4 }}>FIXED REWARD</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* --- EXCLUSIONS & CATEGORY POLICIES --- */}
      <div style={{ maxWidth: '1000px', margin: '6rem auto 0', padding: '3rem', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.01)', borderRadius: '2rem' }}>
        <h3 style={{ fontSize: '1.5rem', marginBottom: '2rem', textAlign: 'center', color: 'var(--gold)' }}>Category Specific Policies</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '3rem' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.8rem', marginBottom: '0.5rem' }}>FASHION ITEMS</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Standard earnings range from <b>2% to 4%</b> based on brand and specific item category.</p>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.8rem', marginBottom: '0.5rem' }}>DIGITAL & ELECTRONICS</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Digital items carry a minimal <b>0.5%</b> commission. Mobiles and high-end electronics follow brand-specific exclusions.</p>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.8rem', marginBottom: '0.5rem' }}>APPLE PRODUCTS</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Due to brand policy, Apple products currently offer <b>Zero Commission</b> but qualify for trust score points.</p>
          </div>
        </div>
      </div>

      {/* --- BUY KARO CATEGORY RATES --- */}
      <div style={{ maxWidth: '1000px', margin: '4rem auto 0', padding: '3rem', border: '1px solid rgba(16, 185, 129, 0.15)', background: 'rgba(16, 185, 129, 0.02)', borderRadius: '2rem' }}>
        <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', textAlign: 'center', color: 'var(--emerald)' }}>Buy Karo — Category-Wise Commission</h3>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '2.5rem' }}>Earn category-specific commissions on every qualifying purchase made through Buy Karo.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.2rem' }}>
          {[
            { category: "Beauty & Personal Care", rate: "Up to 4%" },
            { category: "Fashion & Accessories", rate: "Up to 4.5%" },
            { category: "Home & Kitchen", rate: "Up to 3%" },
            { category: "Health & Wellness", rate: "Up to 4%" },
            { category: "Electronics", rate: "Up to 0.5%" }
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.2rem 1.5rem', background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.1)', borderRadius: '1rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>{item.category}</span>
              <span style={{ color: 'var(--emerald)', fontWeight: 900, fontSize: '1.1rem' }}>{item.rate}</span>
            </div>
          ))}
        </div>
      </div>

      {/* --- ZERO COMMISSION EXCLUSIONS --- */}
      <div id="zero-commission" style={{ maxWidth: '1000px', margin: '4rem auto 0', padding: '3rem', border: '1px solid rgba(239, 68, 68, 0.15)', background: 'rgba(239, 68, 68, 0.02)', borderRadius: '2rem' }}>
        <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', textAlign: 'center', color: 'var(--ruby)' }}>Zero Commission Exclusions</h3>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '2.5rem' }}>The following product categories carry <b style={{ color: 'var(--ruby)' }}>0% commission</b>. No profit will be earned on purchases from these categories.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.2rem' }}>
          {[
            "Flipkart Gift Cards",
            "All Mobile Phones",
            "Flipkart Minutes & All Other Unlisted Categories",
            "Gemstones, Gold & Silver Coins",
            "Apple Audio Devices",
            "Grocery Xtra Saver"
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.5rem', background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.08)', borderRadius: '1rem' }}>
              <span style={{ color: 'var(--ruby)', fontWeight: 900, fontSize: '1.2rem', minWidth: '40px' }}>0%</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// --- SOCIAL MEDIA BUTTONS ---

const SocialLinks = ({ socials }) => {
  if (!socials) return null;

  const socialConfig = [
    { id: 'telegram', name: 'Telegram', icon: <Send size={20} />, color: '#0088cc', link: socials.telegram },
    { id: 'instagram', name: 'Instagram', icon: <Instagram size={20} />, color: '#e4405f', link: socials.instagram },
    { id: 'whatsapp', name: 'WhatsApp', icon: <MessageCircle size={20} />, color: '#25d366', link: socials.whatsapp }
  ];

  return (
    <div className="social-links-container">
      {socialConfig.map((s) => (
        s.link && (
          <motion.a
            key={s.id}
            href={s.link}
            target="_blank"
            rel="noreferrer"
            className="social-btn"
            whileHover={{ y: -5, scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{ '--social-color': s.color }}
          >
            <div className="social-icon-wrapper">
              {s.icon}
            </div>
            <span className="social-name">{s.name}</span>
          </motion.a>
        )
      ))}
    </div>
  );
};

function App() {
  const [activeTab, setActiveTab] = useState('flipkart');
  const [links, setLinks] = useState({});
  const [socials, setSocials] = useState({});
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(null);
  const [view, setView] = useState('home'); // 'home', 'dash', 'admin'
  const [showSupport, setShowSupport] = useState(false);

  const platforms = [
    { id: 'flipkart', name: 'Flipkart', icon: <ShoppingCart size={18} /> },
    { id: 'myntra', name: 'Myntra', icon: <Shirt size={18} /> },
    { id: 'ajio', name: 'Ajio', icon: <Shirt size={18} /> },
    { id: 'reliance', name: 'Reliance', icon: <Smartphone size={18} /> },
    { id: 'croma', name: 'Croma', icon: <Smartphone size={18} /> },
    { id: 'goibibo', name: 'Goibibo', icon: <Plane size={18} /> },
    { id: 'derma', name: 'Derma Co', icon: <Droplets size={18} /> },
    { id: 'dotkey', name: 'Dot & Key', icon: <Droplets size={18} /> },
    { id: 'mcaffeine', name: 'mCaffeine', icon: <Droplets size={18} /> },
    { id: 'mamaearth', name: 'Mama Earth', icon: <Droplets size={18} /> },
    { id: 'stocks', name: 'Angel One', icon: <LineChart size={18} /> },
    { id: 'havells', name: 'Havells', icon: <Zap size={18} /> },
    { id: 'shopsy', name: 'Shopsy', icon: <ShoppingCart size={18} /> },
    { id: 'buykaro', name: 'Buy Karo', icon: <ShoppingCart size={18} /> }
  ];

  // Fetch fresh user data from server
  const checkAuthStatus = useCallback(async () => {
    const token = localStorage.getItem('nexlink_token');
    if (!token) return;
    try {
      const timestamp = Date.now();
      const response = await fetch(`${API_BASE}/me?t=${timestamp}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 503) {
        setView('maintenance');
        return;
      }
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        if (userData.meta?.maintenance_mode && !userData.isAdmin) setView('maintenance');
        // Auto-pivot to Dashboard if we just found an active session on the home screen
        if (view === 'home') setView('dash');
      } else {
        // Token invalid/expired — clear it
        localStorage.removeItem('nexlink_token');
        setUser(null);
      }
    } catch (err) {
      console.error("Identity sync unreachable", err);
    }
  }, [view]); // FIXED: Added view as dependency to prevent closure of old view state

  // Initial load
  useEffect(() => {
    fetch('/links.json')
      .then(res => res.json())
      .then(data => {
        setLinks(data.platforms || {});
        setSocials(data.socials || {});
        setLoading(false);
      });
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Auto-refresh user data when switching to dashboard (ensures Trust Score + balance are fresh)
  useEffect(() => {
    if ((view === 'dash' || view === 'admin') && user) {
      checkAuthStatus();
    }
  }, [view, user, checkAuthStatus]); // Added user to dependencies for consistency

  // Save UPI settings — returns true/false for notification in UserDashboard
  const updateSettings = async (settings) => {
    const token = localStorage.getItem('nexlink_token');
    if (!token) return { success: false, error: 'Authorization lost. Please log in again.' };
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(settings)
      });
      const data = await res.json().catch(() => ({}));
      // ALWAYS refresh user data after saving settings
      await checkAuthStatus();
      if (res.ok) return { success: true };
      return { success: false, error: data.error || 'Identity Sync Failed' };
    } catch (err) {
      console.error('Settings update failed', err);
      return { success: false, error: 'Connection lost to the secure vault.' };
    }
  };

  const copyToClipboard = async () => {
    const activePlatform = platforms.find(p => p.id === activeTab);
    if (activePlatform?.comingSoon) return;
    const link = links[activeTab] || '';
    if (!link) return;

    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    if (user) {
      const token = localStorage.getItem('nexlink_token');
      await fetch(`${API_BASE}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'copy', platform: activeTab, link })
      });
      checkAuthStatus();
    }
  };

  const handleSelectBrand = (id) => {
    setActiveTab(id);
    document.getElementById('generator')?.scrollIntoView({ behavior: 'smooth' });
    setCopied(false);
  };

  return (
    <div className="app-wrapper">
      <div className="lux-bg-glow"></div>
      <div className="lux-orb orb-animate-1"></div>
      <div className="lux-orb orb-animate-2"></div>
      <div className="lux-orb orb-animate-3"></div>
      <div className="lux-orb orb-animate-4"></div>
      <div className="lux-orb orb-animate-5"></div>

      {/* Background Branding Decor */}
      <div className="bg-text-decor" style={{ top: '10%', left: '5%' }}>GROW</div>
      <div className="bg-text-decor" style={{ bottom: '10%', right: '5%', transform: 'rotate(180deg)' }}>ELITE</div>
      <div className="bg-text-decor" style={{ top: '40%', right: '10%', fontSize: '10vw' }}>TOGETHER</div>

      <div className="luxury-stars"></div>


      {/* --- REFINED NAVIGATION --- */}
      <nav className="lux-nav">
        <motion.div onClick={() => setView('home')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lux-logo">
          <GrowLogo size={32} />
          <span style={{ fontSize: '1.8rem' }}>GROW<span className="gold-gradient" style={{ fontWeight: 900 }}>TOGETHER</span></span>
        </motion.div>

        <div className="lux-flex-stack" style={{ gap: '2rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <a href="#policy" className="lux-btn-ghost" style={{ padding: '0.6rem 1.5rem', fontSize: '0.6rem', textDecoration: 'none', border: '1.5px solid var(--gold)', color: 'var(--gold)' }}>POLICIES</a>
              <a href="#zero-commission" className="lux-btn-ghost" style={{ padding: '0.6rem 1.5rem', fontSize: '0.6rem', textDecoration: 'none', border: '1.5px solid var(--ruby)', color: 'var(--ruby)' }}>ZERO COMMISSION</a>
            </div>
            <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 600 }}>read policies before starting</span>
          </div>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div onClick={() => setView(view === 'dash' || view === 'admin' ? 'home' : 'dash')} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', color: 'var(--gold)', cursor: 'pointer', padding: '0.5rem 1rem', background: 'rgba(234, 179, 8, 0.05)', borderRadius: '100px', border: '1px solid var(--gold-muted)' }}>
                {view !== 'home' ? <Link2 size={16} /> : <User size={16} />}
                <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.2em' }}>{view !== 'home' ? 'THE VAULT' : 'DASHBOARD'}</span>
              </div>
              <button onClick={() => { localStorage.removeItem('nexlink_token'); setUser(null); setView('home'); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => setShowAuth('login')} className="lux-btn-ghost">LOGIN</button>
              <button onClick={() => setShowAuth('register')} className="lux-btn-gold">CREATE ACCOUNT</button>
            </>
          )}
        </div>
      </nav>

      <AnimatePresence mode="wait">
        {view === 'home' ? (
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <section style={{ padding: '8rem 0 12rem', textAlign: 'center' }}>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }}>
                <div style={{ color: 'var(--gold)', letterSpacing: '0.4em', fontSize: '0.65rem', marginBottom: '2rem', fontWeight: 800 }}>ESTABLISHED 2026 // PREMIUM LINKS</div>
                <h1 style={{ fontSize: 'clamp(3.5rem, 8vw, 7rem)', lineHeight: 0.95, marginBottom: '2rem' }}>
                  Shop. Earn. <br />
                  <span className="gold-gradient">Repeat.</span>
                </h1>
                <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)', maxWidth: '700px', margin: '0 auto 6rem', fontWeight: 300 }}>
                  The best shopping links to help you earn money easily. Direct. Safe. Fast.
                </p>
              </motion.div>

              <SocialLinks socials={socials} />

              <div className="social-highlight-banner">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  className="highlight-attraction"
                >
                  <p className="highlight-text">
                    join our <span>telegram</span> and <span>WhatsApp</span> channel to earn more and for best <span>high discount deals</span>
                  </p>
                </motion.div>
              </div>

              {/* --- LUXURY GENERATOR CARD --- */}
              <motion.div
                id="generator"
                className="lux-card"
                style={{ maxWidth: '1200px', margin: '0 auto' }}
                initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                  {platforms.map((p) => (
                    <button
                      key={p.id}
                      className={`lux-tab-btn ${activeTab === p.id ? 'active' : ''}`}
                      onClick={() => { setActiveTab(p.id); setCopied(false); }}
                      style={{ opacity: p.comingSoon ? 0.3 : 1 }}
                    >
                      <div style={{ marginBottom: '0.8rem' }}>{p.icon}</div>
                      <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{p.name}</div>
                    </button>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, filter: 'blur(10px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }}
                    transition={{ duration: 0.6 }}
                    style={{ padding: 'clamp(1.5rem, 5vw, 6rem)' }}
                  >
                    <div className="lux-flex-stack" style={{ marginBottom: '4rem', textAlign: 'left', alignItems: 'flex-start' }}>
                      <div>
                        <h2 style={{ fontSize: '3.5rem', marginBottom: '0.5rem', color: '#fff' }} className="gold-gradient">{activeTab}</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', letterSpacing: '0.1em' }}>{platforms.find(p => p.id === activeTab)?.comingSoon ? "COMING SOON" : "LINK IS READY"}</p>
                      </div>
                      <div style={{ color: 'var(--gold)', opacity: 0.3 }}>
                        <ShieldCheck size={64} />
                      </div>
                    </div>

                    <div className="lux-vault-display">
                      <span style={{ color: 'var(--gold)', fontWeight: 800 }}>YOUR LINK:</span>
                      <code className="lux-code">{platforms.find(p => p.id === activeTab)?.comingSoon ? "LOCKED" : (links[activeTab] || "PLEASE WAIT...")}</code>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        {!platforms.find(p => p.id === activeTab)?.comingSoon && (
                          <>
                            <button onClick={copyToClipboard} className="lux-btn-gold">
                              {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                              <span>{copied ? 'SECURED' : 'COPY LINK'}</span>
                            </button>
                            <a href={links[activeTab]} target="_blank" rel="noreferrer" className="lux-btn-ghost" style={{ padding: '1rem' }}>
                              <ExternalLink size={16} />
                            </a>
                          </>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                      <div style={{ color: 'var(--emerald)', fontSize: '0.75rem', fontWeight: 800, background: 'rgba(16, 185, 129, 0.1)', padding: '0.8rem 1.5rem', borderRadius: '100px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Zap size={14} />
                        ONLY USE THIS LINK TO GET PAID
                      </div>
                      {!user && !platforms.find(p => p.id === activeTab)?.comingSoon && (
                        <div style={{ color: 'var(--gold)', fontSize: '0.7rem', letterSpacing: '0.2rem', opacity: 0.6 }}>
                          LOGIN TO SAVE YOUR WORK
                        </div>
                      )}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            </section>

            {/* --- SECURITY NOTICE --- */}
            <section style={{ maxWidth: '1200px', margin: '4rem auto 10rem', padding: '0 2rem' }}>
              <motion.div
                initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
                style={{ padding: '3rem', border: '1px solid var(--ruby)', borderRadius: '2rem', background: 'rgba(239, 68, 68, 0.02)', textAlign: 'center' }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', color: 'var(--ruby)' }}>
                  <ShieldCheck size={48} />
                </div>
                <h3 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#fff' }}>Official Operating Rules</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '800px', margin: '0 auto', lineHeight: '2' }}>
                  <span style={{ color: 'var(--ruby)', fontWeight: 800 }}>PASSWORD SECURITY:</span> DO NOT tell anyone your password. We will never ask for it.<br />
                  <span style={{ color: 'var(--gold)', fontWeight: 900, fontSize: '1.4rem' }}>PAYOUT PROCESSING: 7 TO 90 DAYS.</span><br />
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>VERIFICATION:</span> All brand orders must be verified by the platform before payment release.<br />
                  <span style={{ color: 'var(--ruby)', fontWeight: 700 }}>REFUND POLICY:</span> Returned products = ZERO PROFIT.
                </p>
              </motion.div>
            </section>

            {/* --- EASY STEPS EXPLANATION --- */}
            <section style={{ padding: '5rem 2rem 10rem', textAlign: 'center' }}>
              <h2 style={{ fontSize: '3.5rem', marginBottom: '6rem' }} className="gold-gradient">4 Easy Steps to Get Money</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
                {[
                  { step: "1", title: "Copy Link", desc: "Choose your store (like Ajio) and copy your special link.", icon: <Copy size={30} /> },
                  { step: "2", title: "Buy or Share", desc: "Buy for yourself or make someone else buy using your link.", icon: <ShoppingCart size={30} /> },
                  { step: "3", title: "Show Admin", desc: "Go to your Dashboard and send us your Order ID.", icon: <FileText size={30} /> },
                  { step: "4", title: "Get Cash", desc: "Admin checks your order and sends money to your account!", icon: <Wallet size={30} /> }
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                    style={{ background: 'var(--card-obsidian)', padding: '3rem', borderRadius: '2.5rem', border: '1px solid var(--glass-border)', position: 'relative' }}
                  >
                    <div style={{
                      position: 'absolute', top: '-25px', left: '30px',
                      background: 'var(--gold)', color: '#000',
                      width: '56px', height: '56px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 900, fontSize: '1.5rem',
                      boxShadow: '0 0 20px rgba(234, 179, 8, 0.5)',
                      border: '4px solid #05070a'
                    }}>
                      {item.step}
                    </div>
                    <div style={{ color: 'var(--gold)', marginBottom: '1.5rem' }}>{item.icon}</div>
                    <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>{item.title}</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </section>

            {/* --- WHY US (PROFIT ECOSYSTEM) --- */}
            <section style={{ paddingBottom: '15rem', textAlign: 'center' }}>
              <h2 style={{ fontSize: '3rem', marginBottom: '8rem', opacity: 0.6 }}>Important Rules to Remember</h2>
              <div className="lux-info-grid">
                {[
                  { title: "Earn from Shopping", desc: "You get a percentage of the price back ONLY if you buy using the links given here.", icon: <ShoppingCart size={40} color="var(--gold)" /> },
                  { title: "Trading Rules", desc: "Get paid after you download the app, finish setup, and buy your first stock using our link.", icon: <LineChart size={40} color="var(--gold)" /> },
                  { title: "Your Own Area", desc: "Everything is private. Use our specific links so the system knows to pay you.", icon: <Shield size={40} color="var(--gold)" /> },
                  { title: "Earn by Sharing", desc: "Make others shop using these specific links. If they use any other link, you won't get paid.", icon: <Sparkles size={40} color="var(--gold)" /> },
                  { title: "Standard Payouts", desc: "Once you earn your money, it takes between 7 to 90 days for verification and payout arrival.", icon: <Landmark size={40} color="var(--gold)" /> },
                  { title: "No Refund Pay", desc: "If you or a friend refunds a product, you will not get any profit/percentage of money for that purchase.", icon: <AlertCircle size={40} color="var(--ruby)" /> }
                ].map((item, i) => (
                  <motion.div key={i} className="lux-info-card" style={{ textAlign: 'left' }}>
                    <div style={{ marginBottom: '2.5rem' }}>{item.icon}</div>
                    <h3 style={{ fontSize: '1.8rem', marginBottom: '1.5rem' }}>{item.title}</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.8 }}>{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </section>

            <CommissionPolicy onSelectBrand={handleSelectBrand} />
          </motion.div>
        ) : view === 'dash' ? (
          <UserDashboard user={user} onUpdateSettings={updateSettings} onRefresh={checkAuthStatus} onBack={() => setView('home')} onAdmin={() => setView('admin')} platforms={platforms} />
        ) : view === 'maintenance' ? (
          <motion.div key="maintenance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ height: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <div style={{ padding: '3rem', border: '1px solid var(--gold)', borderRadius: '2rem', background: 'rgba(234, 180, 8, 0.05)', maxWidth: '600px' }}>
              <ShieldAlert size={64} color="var(--gold)" style={{ marginBottom: '2rem' }} />
              <h2 style={{ fontSize: '2.5rem', marginBottom: '1.5rem' }} className="gold-gradient">VAULT MAINTENANCE</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: '1.8' }}>
                The Protocol is currently undergoing critical upgrades to ensure your data and earnings remain 100% secure.
                Our engineers are working fast to bring everything back online.
                <br /><br />
                <b>Check our Telegram for live updates.</b>
              </p>
              <button
                onClick={() => { localStorage.removeItem('nexlink_token'); setUser(null); setView('home'); }}
                className="lux-btn-ghost"
                style={{ marginTop: '3rem', width: '100%' }}
              >
                LOGOUT
              </button>
            </div>
          </motion.div>
        ) : view === 'admin' && user?.isAdmin ? (
          <AdminPanel onBack={() => setView('dash')} />
        ) : (
          null // Fallback for invalid states
        )}
      </AnimatePresence>

      <AuthModal
        isOpen={!!showAuth} type={showAuth}
        onClose={() => setShowAuth(null)}
        onAuthSuccess={(u) => { setUser(u); checkAuthStatus(); }}
      />

      {/* --- DUAL CHANNEL SUPPORT SYSTEM --- */}
      <AnimatePresence>
        {showSupport && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="support-menu"
          >
            <h4>Select Support Channel</h4>

            <a href="https://t.me/growtogether_support" target="_blank" rel="noreferrer" className="support-option" onClick={() => setShowSupport(false)}>
              <div className="icon-box"><Send size={18} /></div>
              <div className="support-opt-info">
                <span className="support-opt-title">Telegram Support</span>
                <span className="support-opt-sub">Fast live chat response</span>
              </div>
            </a>

            <a href="mailto:growtogether@atomicmail.io" className="support-option" onClick={() => setShowSupport(false)}>
              <div className="icon-box"><MessageCircle size={18} /></div>
              <div className="support-opt-info">
                <span className="support-opt-title">Email Support</span>
                <span className="support-opt-sub">Official protocol inquiry</span>
              </div>
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setShowSupport(!showSupport)}
        className="floating-support-btn"
        style={{ background: showSupport ? 'var(--gold)' : '', color: showSupport ? '#000' : '' }}
      >
        {showSupport ? <X size={20} /> : <Headphones size={20} />}
        <span>{showSupport ? 'Close' : 'Contact Support'}</span>
      </button>

      <footer style={{ textAlign: 'center', paddingBottom: '8rem', opacity: 0.3 }}>
        <p style={{ fontSize: '0.7rem', letterSpacing: '0.5em', fontWeight: 800 }}>GROW TOGETHER COMMAND // v8.1</p>
      </footer>
    </div>
  );
}

export default App;
