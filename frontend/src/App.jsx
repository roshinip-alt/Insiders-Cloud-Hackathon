import { useState, useEffect, useCallback } from "react";
import "./App.css";

// ── Constants ──────────────────────────────────────────────────────────────
const API = "http://localhost:5000/api";

const CAT_META = {
  "Food & Dining": { emoji: "🍽️", short: "Food" },
  Shopping:        { emoji: "🛍️", short: "Shopping" },
  Travel:          { emoji: "✈️",  short: "Travel" },
  Entertainment:   { emoji: "🎬", short: "Entertain" },
  Utilities:       { emoji: "💡", short: "Utilities" },
  Healthcare:      { emoji: "🏥", short: "Health" },
  Education:       { emoji: "📚", short: "Education" },
  Others:          { emoji: "📦", short: "Others" },
};

const fmt = (n) =>
  "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── API helpers ────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

// ── Sub-components ─────────────────────────────────────────────────────────
function Toast({ msg, type, visible }) {
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28,
      background: "var(--surface2)",
      border: `1px solid ${type === "error" ? "rgba(224,85,85,.45)" : "rgba(201,168,76,.35)"}`,
      borderRadius: 10, padding: "13px 20px", fontSize: 13,
      zIndex: 200, transition: "all .3s",
      transform: visible ? "translateY(0)" : "translateY(80px)",
      opacity: visible ? 1 : 0, pointerEvents: "none",
      color: "var(--text)",
    }}>{msg}</div>
  );
}

function PinInput({ id, value, onChange }) {
  return (
    <input
      id={id} type="password" maxLength={4} value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="••••"
      style={{
        width: "100%", background: "var(--surface2)",
        border: "1px solid rgba(255,255,255,.08)", borderRadius: 8,
        padding: "11px 14px", color: "var(--text)",
        fontFamily: "var(--font-body)", fontSize: 18,
        letterSpacing: 8, outline: "none",
      }}
    />
  );
}

function StatCard({ label, value, valueColor, sub, subColor }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid rgba(255,255,255,.06)",
      borderRadius: 12, padding: "20px 22px", position: "relative", overflow: "hidden",
    }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 26, color: valueColor || "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, marginTop: 6, color: subColor || "var(--text-dim)" }}>{sub}</div>}
    </div>
  );
}

function TxnRow({ t, compact }) {
  const meta = CAT_META[t.category] || CAT_META.Others;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,.04)",
    }}>
      <div style={{
        width: compact ? 32 : 36, height: compact ? 32 : 36, borderRadius: 10,
        background: "rgba(201,168,76,.1)", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: compact ? 14 : 16, flexShrink: 0,
      }}>{meta.emoji}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: compact ? 13 : 14, fontWeight: 500, color: "var(--text)" }}>
          {t.merchant}
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 20,
            background: "rgba(201,168,76,.12)", color: "var(--gold)", marginLeft: 6,
          }}>{t.txn_type}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
          {t.category}{!compact && ` · ${t.date} ${t.time}`}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: compact ? 13 : 14, fontWeight: 500, color: "var(--danger)" }}>
          -{fmt(t.amount)}
        </div>
        {!compact && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{t.location}</div>}
      </div>
    </div>
  );
}

function BarBreakdown({ data, maxVal }) {
  return data.map(([label, val, emoji]) => (
    <div key={label} style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
      <span style={{ fontSize: 13, minWidth: 110, color: "var(--text)" }}>{emoji} {label}</span>
      <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,.06)", borderRadius: 2, margin: "0 14px" }}>
        <div style={{ height: 4, background: "var(--gold)", borderRadius: 2, width: `${(val / maxVal * 100).toFixed(0)}%` }} />
      </div>
      <span style={{ fontSize: 13, color: "var(--gold)", minWidth: 90, textAlign: "right" }}>{fmt(val)}</span>
    </div>
  ));
}

// ── Page components ────────────────────────────────────────────────────────
function Dashboard({ balance, txns, setPage }) {
  const totalSpent = txns.reduce((a, t) => a + t.amount, 0);
  const last = txns[txns.length - 1];
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500, color: "var(--text)" }}>
          Good morning, Ravi
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>Here's your financial overview</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 28 }}>
        <StatCard label="Current Balance" value={fmt(balance)} valueColor="var(--gold)" sub="Available funds" subColor="var(--success)" />
        <StatCard label="This Session" value={txns.length}
          sub={txns.length ? fmt(totalSpent) + " spent" : "No transactions yet"}
          subColor={txns.length ? "var(--danger)" : "var(--text-dim)"} />
        <StatCard label="Last Transaction"
          value={last ? fmt(last.amount) : "—"}
          sub={last ? `${last.merchant} · ${last.category}` : "No activity"} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "22px 24px" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 18 }}>Recent Activity</div>
          {txns.length === 0
            ? <p style={{ fontSize: 13, color: "var(--text-dim)" }}>No transactions yet this session.</p>
            : [...txns].reverse().slice(0, 4).map((t, i) => <TxnRow key={i} t={t} compact />)}
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "22px 24px" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 18 }}>Quick Actions</div>
          {[
            ["+ Make a Payment", "transaction"],
            ["↑ Deposit Funds", "deposit"],
            ["⊞ View History", "history"],
            ["↗ Analytics", "stats"],
          ].map(([label, page]) => (
            <button key={page} onClick={() => setPage(page)} style={{
              width: "100%", textAlign: "left", padding: "13px 16px", marginBottom: 8,
              borderRadius: 8, background: "transparent",
              border: "1px solid rgba(201,168,76,.3)", color: "var(--gold)",
              fontFamily: "var(--font-body)", fontSize: 14, cursor: "pointer",
              transition: "background .2s",
            }}
            onMouseEnter={e => e.target.style.background = "rgba(201,168,76,.07)"}
            onMouseLeave={e => e.target.style.background = "transparent"}
            >{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BalancePage({ showToast }) {
  const [pin, setPin] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const reveal = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/balance", { method: "POST", body: JSON.stringify({ pin }) });
      setResult(data.balance);
      setPin("");
      showToast("Balance revealed successfully");
    } catch (e) { showToast(e.message, "error"); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500 }}>Account Balance</h1>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>View your current funds</p>
      </div>
      <div style={{
        background: "linear-gradient(135deg,#1a2340 0%,#1a2a1a 100%)",
        border: "1px solid rgba(201,168,76,.2)", borderRadius: 16,
        padding: 28, marginBottom: 24, maxWidth: 440,
      }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 2, color: "rgba(201,168,76,.6)", marginBottom: 8 }}>Available Balance</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 42, color: "var(--gold)" }}>
          {result !== null ? fmt(result) : "— — —"}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 10 }}>Ravi Kumar · Personal Account</div>
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "22px 24px", maxWidth: 340 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 18 }}>Verify Identity</div>
        <label style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, display: "block" }}>Enter PIN</label>
        <PinInput value={pin} onChange={setPin} />
        <button onClick={reveal} disabled={loading || pin.length < 4} style={{
          marginTop: 16, padding: "11px 22px", borderRadius: 8,
          background: pin.length < 4 ? "rgba(201,168,76,.4)" : "var(--gold)",
          color: "#0D1117", border: "none", fontFamily: "var(--font-body)",
          fontSize: 14, fontWeight: 500, cursor: pin.length < 4 ? "default" : "pointer",
        }}>
          {loading ? "Verifying…" : "Reveal Balance"}
        </button>
      </div>
    </div>
  );
}

function DepositPage({ onDeposit, showToast }) {
  const [pin, setPin] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const doDeposit = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/deposit", { method: "POST", body: JSON.stringify({ pin, amount: parseFloat(amount) }) });
      onDeposit(data.balance);
      showToast(`${fmt(parseFloat(amount))} deposited successfully!`);
      setAmount(""); setPin("");
    } catch (e) { showToast(e.message, "error"); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500 }}>Deposit Funds</h1>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>Add money to your account</p>
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "22px 24px", maxWidth: 440 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 18 }}>Deposit Details</div>
        {[
          ["Amount (₹)", "number", amount, setAmount, "Enter amount", 14],
          ["PIN", "password", pin, setPin, "••••", 18],
        ].map(([label, type, val, setter, ph, fs]) => (
          <div key={label} style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, display: "block" }}>{label}</label>
            <input type={type} value={val} onChange={e => setter(e.target.value)} placeholder={ph}
              maxLength={type === "password" ? 4 : undefined}
              style={{ width: "100%", background: "var(--surface2)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "11px 14px", color: "var(--text)", fontFamily: "var(--font-body)", fontSize: fs, letterSpacing: type === "password" ? 6 : "normal", outline: "none" }} />
          </div>
        ))}
        <button onClick={doDeposit} disabled={loading || !amount || pin.length < 4} style={{
          padding: "11px 22px", borderRadius: 8, background: "var(--gold)",
          color: "#0D1117", border: "none", fontFamily: "var(--font-body)",
          fontSize: 14, fontWeight: 500, cursor: "pointer",
        }}>{loading ? "Processing…" : "Confirm Deposit"}</button>
      </div>
    </div>
  );
}

function TransactionPage({ onTransaction, showToast }) {
  const [pin, setPin] = useState("");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("Food & Dining");
  const [txnType, setTxnType] = useState("Card");
  const [loading, setLoading] = useState(false);

  const doTxn = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/transaction", {
        method: "POST",
        body: JSON.stringify({ pin, amount: parseFloat(amount), merchant, category, txn_type: txnType }),
      });
      onTransaction(data.transaction, data.balance);
      showToast(`Payment of ${fmt(parseFloat(amount))} sent to ${merchant}!`);
      setAmount(""); setMerchant(""); setPin("");
    } catch (e) { showToast(e.message, "error"); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500 }}>New Transaction</h1>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>Make a payment or transfer</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "22px 24px" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 18 }}>Payment Details</div>
          {[
            ["Amount (₹)", "number", amount, setAmount, "0.00", 14],
            ["Merchant / Recipient", "text", merchant, setMerchant, "e.g. Swiggy, Amazon", 14],
          ].map(([label, type, val, setter, ph, fs]) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, display: "block" }}>{label}</label>
              <input type={type} value={val} onChange={e => setter(e.target.value)} placeholder={ph}
                style={{ width: "100%", background: "var(--surface2)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "11px 14px", color: "var(--text)", fontFamily: "var(--font-body)", fontSize: fs, outline: "none" }} />
            </div>
          ))}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, display: "block" }}>Payment Type</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["Card", "UPI"].map(t => (
                <div key={t} onClick={() => setTxnType(t)} style={{
                  flex: 1, padding: 10, borderRadius: 8, textAlign: "center",
                  cursor: "pointer", fontSize: 13, transition: "all .2s",
                  background: txnType === t ? "rgba(201,168,76,.12)" : "var(--surface2)",
                  border: `1px solid ${txnType === t ? "rgba(201,168,76,.35)" : "rgba(255,255,255,.06)"}`,
                  color: txnType === t ? "var(--gold)" : "var(--text-muted)",
                }}>{t === "Card" ? "💳 Card" : "📱 UPI"}</div>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, display: "block" }}>PIN</label>
            <PinInput value={pin} onChange={setPin} />
          </div>
          <button onClick={doTxn} disabled={loading || !amount || !merchant || pin.length < 4} style={{
            width: "100%", padding: "11px 22px", borderRadius: 8, background: "var(--gold)",
            color: "#0D1117", border: "none", fontFamily: "var(--font-body)",
            fontSize: 14, fontWeight: 500, cursor: "pointer",
          }}>{loading ? "Processing…" : "Confirm Payment"}</button>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "22px 24px" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 18 }}>Category</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
            {Object.entries(CAT_META).map(([cat, { emoji, short }]) => (
              <div key={cat} onClick={() => setCategory(cat)} style={{
                background: category === cat ? "rgba(201,168,76,.12)" : "var(--surface2)",
                border: `1px solid ${category === cat ? "rgba(201,168,76,.35)" : "rgba(255,255,255,.06)"}`,
                borderRadius: 10, padding: "12px 8px", textAlign: "center",
                cursor: "pointer", fontSize: 12,
                color: category === cat ? "var(--gold)" : "var(--text-muted)",
                transition: "all .2s",
              }}>
                <span style={{ fontSize: 20, display: "block", marginBottom: 6 }}>{emoji}</span>
                {short}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryPage({ txns }) {
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500 }}>Transaction History</h1>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>All transactions this session</p>
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "22px 24px" }}>
        {txns.length === 0
          ? <p style={{ fontSize: 13, color: "var(--text-dim)" }}>No transactions yet. Make your first transaction!</p>
          : [...txns].reverse().map((t, i) => <TxnRow key={i} t={t} />)}
      </div>
    </div>
  );
}

function StatsPage({ txns, showToast }) {
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!txns.length) { showToast("No transactions to save", "error"); return; }
    setSaving(true);
    try {
      const data = await apiFetch("/save", { method: "POST", body: JSON.stringify({ transactions: txns }) });
      showToast(`Saved! ${data.total} total transactions recorded.`);
    } catch (e) { showToast(e.message, "error"); }
    finally { setSaving(false); }
  };

  if (!txns.length) return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500 }}>Analytics</h1>
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Make transactions to see analytics.</p>
    </div>
  );

  const total = txns.reduce((a, t) => a + t.amount, 0);
  const avg = total / txns.length;
  const catTotals = {};
  const merchTotals = {};
  txns.forEach(t => {
    catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
    const k = t.merchant.toLowerCase();
    if (!merchTotals[k]) merchTotals[k] = { name: t.merchant, total: 0 };
    merchTotals[k].total += t.amount;
  });
  const catData = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(...catData.map(d => d[1]));
  const merchData = Object.values(merchTotals).sort((a, b) => b.total - a.total).slice(0, 6);
  const maxMerch = Math.max(...merchData.map(m => m.total));
  const topCat = catData[0]?.[0] || "—";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500 }}>Analytics</h1>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>Spending insights this session</p>
        </div>
        <button onClick={save} disabled={saving} style={{
          padding: "10px 20px", borderRadius: 8, background: "var(--gold)", color: "#0D1117",
          border: "none", fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 500, cursor: "pointer",
        }}>{saving ? "Saving…" : "💾 Save to Excel"}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        {[
          ["Total Transactions", txns.length],
          ["Avg per Transaction", fmt(avg)],
          ["Total Spent", fmt(total)],
          ["Top Category", topCat],
        ].map(([label, val]) => (
          <div key={label} style={{ background: "var(--surface2)", borderRadius: 10, padding: 16 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--gold)", marginBottom: 4 }}>{val}</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "22px 24px" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 18 }}>Spend by Category</div>
          <BarBreakdown data={catData.map(([cat, val]) => [cat, val, CAT_META[cat]?.emoji || "📦"])} maxVal={maxCat} />
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "22px 24px" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 18 }}>Top Merchants</div>
          <BarBreakdown data={merchData.map(m => [m.name, m.total, "🏪"])} maxVal={maxMerch} />
        </div>
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [balance, setBalance] = useState(50000);
  const [txns, setTxns] = useState([]);
  const [toast, setToastState] = useState({ msg: "", type: "success", visible: false });

  const showToast = useCallback((msg, type = "success") => {
    setToastState({ msg, type, visible: true });
    setTimeout(() => setToastState(p => ({ ...p, visible: false })), 2800);
  }, []);

  const onDeposit  = (bal) => setBalance(bal);
  const onTransaction = (txn, bal) => { setTxns(p => [...p, txn]); setBalance(bal); };

  const NAV = [
    { id: "dashboard",   label: "Dashboard",       icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg> },
    { id: "balance",     label: "Balance",          icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v7M6 6.5c0-.5.9-1.5 2-1.5s2 .7 2 1.5-2 1.5-2 1.5-2 1-2 2 .9 1.5 2 1.5 2-1 2-1.5"/></svg> },
    { id: "deposit",     label: "Deposit",          icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v12M3 7l5-5 5 5"/><path d="M2 14h12"/></svg> },
    { id: "transaction", label: "New Transaction",  icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 8h12M10 5l3 3-3 3"/></svg> },
    { id: "history",     label: "History",          icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 3V2M11 3V2M2 7h12"/></svg> },
    { id: "stats",       label: "Analytics",        icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 14l3-4 3 2 3-5 3 3"/></svg> },
  ];

  const PAGES = {
    dashboard:   <Dashboard balance={balance} txns={txns} setPage={setPage} />,
    balance:     <BalancePage showToast={showToast} />,
    deposit:     <DepositPage onDeposit={onDeposit} showToast={showToast} />,
    transaction: <TransactionPage onTransaction={onTransaction} showToast={showToast} />,
    history:     <HistoryPage txns={txns} />,
    stats:       <StatsPage txns={txns} showToast={showToast} />,
  };

  return (
    <>
      <div className="app-shell">
        {/* Sidebar */}
        <div style={{ width: 240, background: "var(--surface)", borderRight: "1px solid rgba(201,168,76,.12)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "28px 24px 20px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--gold)", letterSpacing: ".5px" }}>PyBank</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "2px", textTransform: "uppercase", marginTop: 2 }}>Personal Banking</div>
          </div>
          <nav style={{ padding: "20px 0", flex: 1 }}>
            {NAV.map(({ id, label, icon }) => (
              <div key={id} onClick={() => setPage(id)} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 24px", cursor: "pointer", fontSize: 13.5,
                color: page === id ? "var(--gold)" : "var(--text-muted)",
                borderLeft: `2px solid ${page === id ? "var(--gold)" : "transparent"}`,
                background: page === id ? "rgba(201,168,76,.07)" : "transparent",
                transition: "all .2s",
              }}>
                <span style={{ opacity: page === id ? 1 : 0.7 }}>{icon}</span>
                {label}
              </div>
            ))}
          </nav>
          <div style={{ padding: "20px 24px", borderTop: "1px solid rgba(255,255,255,.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,var(--gold-dim),var(--gold))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 500, color: "#0D1117" }}>RK</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Ravi Kumar</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Personal Account</div>
              </div>
            </div>
          </div>
        </div>
        {/* Main */}
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 36px" }}>
          {PAGES[page]}
        </div>
      </div>
      <Toast {...toast} />
    </>
  );
}