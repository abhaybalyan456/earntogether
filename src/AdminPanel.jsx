import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Users, RotateCw, X, Check, Eye, Award, Zap, AlertCircle, Shield, Wallet, CreditCard, Trash2, Search, BarChart3, Send, Key, FileText, Clock, ChevronDown, ChevronUp } from 'lucide-react';

const API_BASE = '/api';

const AdminPanel = ({ onBack }) => {
    const [claims, setClaims] = useState([]);
    const [users, setUsers] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [procClaim, setProcClaim] = useState(null);
    const [profit, setProfit] = useState('');
    const [viewProof, setViewProof] = useState(null);
    const [adminTab, setAdminTab] = useState('stats');
    const [editingUser, setEditingUser] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [actionModal, setActionModal] = useState(null);
    const [actionInput, setActionInput] = useState('');
    const [notification, setNotification] = useState(null);
    const [expandedUser, setExpandedUser] = useState(null);
    const [userClaims, setUserClaims] = useState([]);
    const [userPayouts, setUserPayouts] = useState([]);

    const token = localStorage.getItem('nexlink_token');
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    useEffect(() => { fetchData(); }, [adminTab]);

    const showNotif = (msg, type = 'success') => {
        setNotification({ message: msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const fetchData = async () => {
        setLoading(true);
        const t = Date.now();
        try {
            const [uRes, cRes, sRes] = await Promise.all([
                fetch(`${API_BASE}/admin/users?t=${t}`, { headers }),
                fetch(`${API_BASE}/admin/claims?t=${t}`, { headers }),
                fetch(`${API_BASE}/admin/stats?t=${t}`, { headers })
            ]);
            if (uRes.ok) setUsers(await uRes.json());
            if (cRes.ok) setClaims(await cRes.json());
            if (sRes.ok) setStats(await sRes.json());
        } catch (err) { console.error("Admin sync failed", err); }
        setLoading(false);
    };

    const manageUser = async (user) => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/users?t=${Date.now()}`, { headers });
            if (res.ok) {
                const fresh = await res.json();
                setUsers(fresh);
                setEditingUser(fresh.find(u => u.id === user.id) || user);
            } else setEditingUser(user);
        } catch { setEditingUser(user); }
        setLoading(false);
    };

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        const res = await fetch(`${API_BASE}/admin/user/update`, {
            method: 'POST', headers,
            body: JSON.stringify({ userId: editingUser.id, updates: editingUser })
        });
        if (res.ok) { setEditingUser(null); fetchData(); showNotif('User updated successfully'); }
        else { const d = await res.json(); showNotif(d.error || 'Update failed', 'error'); }
    };

    const handleDeleteUser = async (userId) => {
        if (!window.confirm('CRITICAL: Permanently delete this user and ALL data?')) return;
        const res = await fetch(`${API_BASE}/admin/user/delete`, { method: 'POST', headers, body: JSON.stringify({ userId }) });
        const d = await res.json();
        if (res.ok) { showNotif(d.message); setEditingUser(null); fetchData(); }
        else showNotif(d.error, 'error');
    };

    const approveClaim = async (claimId) => {
        if (!profit) return showNotif('Enter profit amount first', 'error');
        const res = await fetch(`${API_BASE}/admin/approve`, {
            method: 'POST', headers, body: JSON.stringify({ claimId, profitAmount: profit })
        });
        if (res.ok) { setProfit(''); setProcClaim(null); fetchData(); showNotif('Claim approved! Profit transferred.'); }
        else { const d = await res.json(); showNotif(d.error || 'Failed', 'error'); }
    };

    const rejectClaim = async (claimId) => {
        const reason = prompt('Reason for rejection?');
        if (!reason) return;
        const res = await fetch(`${API_BASE}/admin/reject`, {
            method: 'POST', headers, body: JSON.stringify({ claimId, reason })
        });
        if (res.ok) { fetchData(); showNotif('Claim rejected'); }
        else { const d = await res.json(); showNotif(d.error || 'Failed', 'error'); }
    };

    const deleteClaim = async (claimId) => {
        if (!window.confirm('Delete this claim permanently?')) return;
        const res = await fetch(`${API_BASE}/admin/claim/delete`, { method: 'POST', headers, body: JSON.stringify({ claimId }) });
        if (res.ok) { fetchData(); showNotif('Claim deleted'); }
    };

    const purgeAllClaims = async () => {
        if (!window.confirm('NUCLEAR: Delete ALL claims in the system?')) return;
        const res = await fetch(`${API_BASE}/admin/claims/purge-all`, { method: 'POST', headers });
        if (res.ok) { const d = await res.json(); fetchData(); showNotif(d.message); }
    };

    const executeAction = async () => {
        if (!actionModal) return;
        const { action, userId, username } = actionModal;
        let res;
        switch (action) {
            case 'send-withdraw':
                if (!actionInput || isNaN(actionInput)) return showNotif('Enter valid amount', 'error');
                res = await fetch(`${API_BASE}/admin/user/send-withdraw`, { method: 'POST', headers, body: JSON.stringify({ userId, amount: actionInput }) });
                break;
            case 'purge-claims':
                res = await fetch(`${API_BASE}/admin/user/purge-claims`, { method: 'POST', headers, body: JSON.stringify({ userId }) });
                break;
            case 'purge-history':
                res = await fetch(`${API_BASE}/admin/user/purge-history`, { method: 'POST', headers, body: JSON.stringify({ userId }) });
                break;
            case 'purge-profit':
                res = await fetch(`${API_BASE}/admin/user/purge-profit`, { method: 'POST', headers, body: JSON.stringify({ userId }) });
                break;
            case 'purge-pending':
                res = await fetch(`${API_BASE}/admin/user/purge-pending`, { method: 'POST', headers, body: JSON.stringify({ userId }) });
                break;
            case 'reset-password':
                if (!actionInput || actionInput.length < 3) return showNotif('Password must be at least 3 characters', 'error');
                res = await fetch(`${API_BASE}/admin/user/reset-password`, { method: 'POST', headers, body: JSON.stringify({ userId, newPassword: actionInput }) });
                break;
            default: return;
        }
        if (res?.ok) { const d = await res.json(); showNotif(d.message); setActionModal(null); setActionInput(''); fetchData(); }
        else { const d = await res?.json(); showNotif(d?.error || 'Failed', 'error'); }
    };

    const loadUserDetail = async (userId) => {
        if (expandedUser === userId) { setExpandedUser(null); return; }
        setExpandedUser(userId);
        try {
            const [cRes, pRes] = await Promise.all([
                fetch(`${API_BASE}/admin/user/${userId}/claims`, { headers }),
                fetch(`${API_BASE}/admin/user/${userId}/payouts`, { headers })
            ]);
            if (cRes.ok) setUserClaims(await cRes.json());
            if (pRes.ok) setUserPayouts(await pRes.json());
        } catch { }
    };

    const filteredUsers = users.filter(u => u.username?.toLowerCase().includes(searchQuery.toLowerCase()));
    const pendingClaimsCount = claims.filter(c => c.status === 'pending').length;

    const actionLabels = {
        'send-withdraw': { title: 'Send Withdrawal', placeholder: 'Amount (₹)', icon: <Send size={16} /> },
        'purge-claims': { title: 'Purge All Claims', confirm: true, icon: <Trash2 size={16} /> },
        'purge-history': { title: 'Purge Withdrawal History', confirm: true, icon: <Trash2 size={16} /> },
        'purge-profit': { title: 'Reset Lifetime Profit', confirm: true, icon: <Trash2 size={16} /> },
        'purge-pending': { title: 'Reset Pending Payout', confirm: true, icon: <Trash2 size={16} /> },
        'reset-password': { title: 'Reset Password', placeholder: 'New Password', icon: <Key size={16} /> }
    };

    // === STATS TAB ===
    const renderStats = () => {
        if (!stats) return <p>Loading stats...</p>;
        const cards = [
            { label: 'TOTAL USERS', value: stats.totalUsers, color: 'var(--gold)' },
            { label: 'PENDING WITHDRAWAL', value: `₹${stats.totalPending}`, color: 'var(--gold)' },
            { label: 'USERS TO PAY', value: stats.usersToPay, color: 'var(--ruby)' },
            { label: 'PENDING CLAIMS', value: stats.pendingClaims, color: 'var(--ruby)' },
            { label: 'APPROVED CLAIMS', value: stats.approvedClaims, color: 'var(--emerald)' },
            { label: 'REJECTED CLAIMS', value: stats.rejectedClaims, color: 'var(--ruby)' },
            { label: 'TOTAL PROFIT RELEASED', value: `₹${stats.totalProfit}`, color: 'var(--emerald)' },
            { label: 'TOTAL PAID OUT', value: `₹${stats.totalPaid}`, color: 'var(--emerald)' },
            { label: 'TOTAL ACTIVITIES', value: stats.totalActivities, color: 'var(--gold)' },
            { label: 'TOTAL CLAIMS', value: stats.totalClaims, color: 'var(--gold)' },
        ];
        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
                {cards.map((c, i) => (
                    <div key={i} className="admin-stat-card">
                        <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>{c.label}</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: c.color }}>{c.value}</div>
                    </div>
                ))}
            </div>
        );
    };

    // === USERS TAB ===
    const renderUsers = () => (
        <div>
            <div style={{ marginBottom: '1.5rem' }}>
                <input className="admin-search-input" placeholder="Search users..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {filteredUsers.map(u => (
                    <div key={u.id} className="admin-user-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: 0 }}>
                                <div style={{ padding: '0.4rem', background: 'rgba(255,255,255,0.03)', borderRadius: '50%', flexShrink: 0 }}><User size={16} color="var(--gold)" /></div>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 800, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.username}</div>
                                    <div style={{ fontSize: '0.55rem', opacity: 0.4 }}>Joined: {new Date(u.createdAt).toLocaleDateString()}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <div style={{ textAlign: 'center', padding: '0.3rem 0.8rem', background: 'rgba(234,179,8,0.05)', borderRadius: '0.5rem' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--gold)' }}>₹{(u.pendingPayout || 0).toFixed(2)}</div>
                                    <div style={{ fontSize: '0.45rem', opacity: 0.5 }}>PENDING</div>
                                </div>
                                <div style={{ textAlign: 'center', padding: '0.3rem 0.8rem', background: 'rgba(16,185,129,0.05)', borderRadius: '0.5rem' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--emerald)' }}>₹{(u.totalEarnings || 0).toFixed(2)}</div>
                                    <div style={{ fontSize: '0.45rem', opacity: 0.5 }}>LIFETIME</div>
                                </div>
                                <div style={{ textAlign: 'center', padding: '0.3rem 0.8rem', background: 'rgba(234,179,8,0.05)', borderRadius: '0.5rem' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 800 }}>{u.trustScore || 0}</div>
                                    <div style={{ fontSize: '0.45rem', opacity: 0.5 }}>KARMA</div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                            <button className="admin-action-btn" onClick={() => manageUser(u)}>✏️ Edit</button>
                            <button className="admin-action-btn success" onClick={() => setActionModal({ action: 'send-withdraw', userId: u.id, username: u.username })}>💸 Send Pay</button>
                            <button className="admin-action-btn" onClick={() => setActionModal({ action: 'reset-password', userId: u.id, username: u.username })}>🔑 Password</button>
                            <button className="admin-action-btn danger" onClick={() => setActionModal({ action: 'purge-claims', userId: u.id, username: u.username })}>🗑 Claims</button>
                            <button className="admin-action-btn danger" onClick={() => setActionModal({ action: 'purge-history', userId: u.id, username: u.username })}>📜 History</button>
                            <button className="admin-action-btn danger" onClick={() => setActionModal({ action: 'purge-profit', userId: u.id, username: u.username })}>💹 Profit</button>
                            <button className="admin-action-btn danger" onClick={() => setActionModal({ action: 'purge-pending', userId: u.id, username: u.username })}>💸 Pending</button>
                            <button className="admin-action-btn danger" onClick={() => handleDeleteUser(u.id)}>☢️ Delete</button>
                            <button className="admin-action-btn" onClick={() => loadUserDetail(u.id)}>
                                {expandedUser === u.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Detail
                            </button>
                        </div>

                        {expandedUser === u.id && (
                            <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '1rem', fontSize: '0.75rem' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.5rem' }}>
                                    <span>UPI: <code style={{ color: 'var(--emerald)' }}>{u.paymentSettings?.upi || 'NONE'}</code></span>
                                    <span>Clicks: {u.activityCount || 0}</span>
                                    <span>Claims: {u.claimCount || 0}</span>
                                    <span>Verified: {u.verifiedCount || 0}</span>
                                    <span>Score: {u.activityScore || 0}</span>
                                </div>
                                {userClaims.length > 0 && (
                                    <div style={{ marginTop: '0.5rem' }}>
                                        <strong style={{ color: 'var(--gold)', fontSize: '0.6rem' }}>RECENT CLAIMS:</strong>
                                        {userClaims.slice(-3).reverse().map(c => (
                                            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--glass-border)', flexWrap: 'wrap', gap: '0.3rem' }}>
                                                <span>{c.platform} - {c.orderId}</span>
                                                <span style={{ color: c.status === 'approved' ? 'var(--emerald)' : c.status === 'rejected' ? 'var(--ruby)' : 'var(--gold)' }}>{c.status}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                {filteredUsers.length === 0 && <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.4 }}>No users found</p>}
            </div>
        </div>
    );

    // === CLAIMS TAB ===
    const renderClaims = () => (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>{claims.length} total claims</div>
                <button className="admin-action-btn danger" onClick={purgeAllClaims}>☢️ Purge All Claims</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {claims.map(c => (
                    <div key={c.id} className="admin-user-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.8rem' }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 800 }}>{c.username}</span>
                                    <span style={{
                                        fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '100px', fontWeight: 800,
                                        background: c.status === 'pending' ? 'rgba(234,179,8,0.1)' : c.status === 'approved' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                        color: c.status === 'pending' ? 'var(--gold)' : c.status === 'approved' ? 'var(--emerald)' : 'var(--ruby)'
                                    }}>{c.status.toUpperCase()}</span>
                                    <span style={{ fontSize: '0.55rem', opacity: 0.4 }}>Karma: {c.trustScore || 0}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                                    <span style={{ color: 'var(--gold)', fontWeight: 800 }}>{c.platform}</span>
                                    <span>ID: <code>{c.orderId}</code></span>
                                    <span>₹{c.amount}</span>
                                    <span style={{ opacity: 0.5 }}>{c.purchaseDate || 'N/A'}</span>
                                </div>
                                {c.userUpi && <div style={{ fontSize: '0.65rem', marginTop: '0.3rem', color: 'var(--emerald)' }}>UPI: {c.userUpi}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {c.proofImage && <button className="admin-action-btn" onClick={() => setViewProof(c.proofImage)}><Eye size={12} /> View</button>}
                                {c.status === 'pending' && (
                                    procClaim === c.id ? (
                                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                                            <input className="lux-input" style={{ width: '80px', padding: '0.4rem', fontSize: '0.75rem' }} placeholder="₹" type="number" value={profit} onChange={e => setProfit(e.target.value)} />
                                            <button className="admin-action-btn success" onClick={() => approveClaim(c.id)}><Check size={12} /></button>
                                            <button className="admin-action-btn" onClick={() => setProcClaim(null)}><X size={12} /></button>
                                        </div>
                                    ) : (
                                        <>
                                            <button className="admin-action-btn success" onClick={() => setProcClaim(c.id)}>✅ Approve</button>
                                            <button className="admin-action-btn danger" onClick={() => rejectClaim(c.id)}>❌ Reject</button>
                                        </>
                                    )
                                )}
                                <button className="admin-action-btn danger" onClick={() => deleteClaim(c.id)}>🗑</button>
                            </div>
                        </div>
                    </div>
                ))}
                {claims.length === 0 && <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.4 }}>No claims found</p>}
            </div>
        </div>
    );

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="dash-container">
            {/* Notification Toast */}
            <AnimatePresence>
                {notification && (
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        style={{
                            position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 99999, padding: '1rem 2rem', borderRadius: '1rem',
                            background: notification.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                            border: `1px solid ${notification.type === 'success' ? 'var(--emerald)' : 'var(--ruby)'}`,
                            color: notification.type === 'success' ? 'var(--emerald)' : 'var(--ruby)', fontSize: '0.85rem', fontWeight: 700, maxWidth: '90vw', textAlign: 'center',
                            backdropFilter: 'blur(20px)'
                        }}>
                        {notification.message}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                        <h2 style={{ fontSize: 'clamp(1.5rem, 5vw, 3rem)' }} className="gold-gradient">Admin Command Center</h2>
                        <div style={{ fontSize: '0.5rem', opacity: 0.4, marginTop: '4px', letterSpacing: '0.1em' }}>SYNC: {new Date().toLocaleTimeString()}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button onClick={fetchData} className="admin-action-btn success"><RotateCw size={14} /> Sync</button>
                        <button onClick={onBack} className="admin-action-btn">← Close</button>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {[
                        { id: 'stats', label: 'Stats', icon: <BarChart3 size={14} /> },
                        { id: 'users', label: `Users (${users.length})`, icon: <Users size={14} /> },
                        { id: 'claims', label: `Claims (${pendingClaimsCount})`, icon: <FileText size={14} /> },
                    ].map(tab => (
                        <button key={tab.id} onClick={() => setAdminTab(tab.id)}
                            className={adminTab === tab.id ? 'lux-btn-gold' : 'lux-btn-ghost'}
                            style={{ padding: '0.6rem 1.2rem', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="settings-panel">
                {loading ? <p style={{ textAlign: 'center', padding: '2rem' }}>Syncing...</p> :
                    adminTab === 'stats' ? renderStats() :
                        adminTab === 'users' ? renderUsers() :
                            renderClaims()
                }
            </div>

            {/* Proof Viewer */}
            <AnimatePresence>
                {viewProof && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setViewProof(null)}>
                        <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
                            <img src={viewProof} style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '1rem', border: '2px solid var(--gold)' }} alt="Proof" />
                            <button onClick={() => setViewProof(null)} style={{ position: 'absolute', top: -40, right: 0, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', padding: '10px', borderRadius: '50%' }}><X size={24} /></button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Edit User Modal */}
            <AnimatePresence>
                {editingUser && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setEditingUser(null)} style={{ zIndex: 10001 }}>
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="lux-auth-card" style={{ maxWidth: '500px', width: '95%' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h2 className="gold-gradient" style={{ fontSize: '1.5rem' }}>Edit User</h2>
                                <button onClick={() => setEditingUser(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
                            </div>
                            <form onSubmit={handleUpdateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div className="input-group">
                                    <label>USERNAME</label>
                                    <input className="lux-input" value={editingUser.username} onChange={e => setEditingUser({ ...editingUser, username: e.target.value })} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                    <div className="input-group">
                                        <label>TRUST SCORE</label>
                                        <input className="lux-input" type="number" value={editingUser.trustScore || 0} onChange={e => setEditingUser({ ...editingUser, trustScore: parseInt(e.target.value) })} />
                                    </div>
                                    <div className="input-group">
                                        <label>PENDING (₹)</label>
                                        <input className="lux-input" type="number" step="0.01" value={editingUser.pendingPayout || 0} onChange={e => setEditingUser({ ...editingUser, pendingPayout: parseFloat(e.target.value) })} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                    <div className="input-group">
                                        <label>LIFETIME (₹)</label>
                                        <input className="lux-input" type="number" step="0.01" value={editingUser.totalEarnings || 0} onChange={e => setEditingUser({ ...editingUser, totalEarnings: parseFloat(e.target.value) })} />
                                    </div>
                                    <div className="input-group">
                                        <label>UPI ID</label>
                                        <input className="lux-input" value={editingUser.paymentSettings?.upi || ''} onChange={e => setEditingUser({ ...editingUser, paymentSettings: { ...editingUser.paymentSettings, upi: e.target.value } })} />
                                    </div>
                                </div>
                                <button type="submit" className="lux-btn-gold" style={{ width: '100%', padding: '1rem' }}>SAVE</button>
                                <button type="button" onClick={() => handleDeleteUser(editingUser.id)} className="lux-btn-ghost" style={{ width: '100%', borderColor: 'var(--ruby)', color: 'var(--ruby)' }}>DELETE ACCOUNT</button>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Action Modal (Send Withdraw, Purge, Password Reset) */}
            <AnimatePresence>
                {actionModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => { setActionModal(null); setActionInput(''); }} style={{ zIndex: 10002 }}>
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="lux-auth-card" style={{ maxWidth: '400px', width: '95%' }} onClick={e => e.stopPropagation()}>
                            <h3 className="gold-gradient" style={{ marginBottom: '1rem', fontSize: '1.3rem' }}>{actionLabels[actionModal.action]?.title}</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>User: <strong style={{ color: '#fff' }}>{actionModal.username}</strong></p>
                            {actionLabels[actionModal.action]?.placeholder ? (
                                <input className="lux-input" placeholder={actionLabels[actionModal.action].placeholder} value={actionInput} onChange={e => setActionInput(e.target.value)}
                                    type={actionModal.action === 'send-withdraw' ? 'number' : 'text'} style={{ marginBottom: '1rem' }} />
                            ) : (
                                <p style={{ color: 'var(--ruby)', fontSize: '0.8rem', marginBottom: '1rem', padding: '1rem', background: 'rgba(239,68,68,0.05)', borderRadius: '0.8rem', border: '1px solid rgba(239,68,68,0.2)' }}>
                                    This action cannot be undone. Are you sure?
                                </p>
                            )}
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button onClick={executeAction} className="lux-btn-gold" style={{ flex: 1, padding: '0.8rem' }}>CONFIRM</button>
                                <button onClick={() => { setActionModal(null); setActionInput(''); }} className="lux-btn-ghost" style={{ flex: 1, padding: '0.8rem' }}>CANCEL</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default AdminPanel;
