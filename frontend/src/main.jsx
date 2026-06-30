import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  Copy,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCcw,
  ShieldCheck,
  UserPlus,
  Wallet,
} from "lucide-react";
import { api, getErrorMessage } from "./api";
import "./styles.css";

const emptyAuth = {
  name: "",
  email: "",
  password: "",
};

const initialUser = (() => {
  try {
    return JSON.parse(localStorage.getItem("ledger_user")) || null;
  } catch {
    return null;
  }
})();

function App() {
  const [user, setUser] = useState(initialUser);
  const [googleClientId, setGoogleClientId] = useState(import.meta.env.VITE_GOOGLE_CLIENT_ID || "");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(emptyAuth);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [balances, setBalances] = useState({});
  const [transfer, setTransfer] = useState({
    fromAccount: "",
    toAccount: "",
    amount: "",
  });
  const [status, setStatus] = useState({ type: "idle", text: "" });
  const [loading, setLoading] = useState(false);

  const totalBalance = useMemo(() => {
    return Object.values(balances).reduce((sum, value) => sum + Number(value || 0), 0);
  }, [balances]);

  useEffect(() => {
    if (user) {
      loadAccounts();
    }
  }, [user]);

  useEffect(() => {
    if (googleClientId) {
      return;
    }

    api.get("/auth/google/client-id")
      .then((response) => setGoogleClientId(response.data.clientId || ""))
      .catch(() => setGoogleClientId(""));
  }, [googleClientId]);

  useEffect(() => {
    if (user || !googleClientId) {
      return;
    }

    const scriptId = "google-identity-script";
    const renderButton = () => {
      if (!window.google?.accounts?.id) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential,
      });
      window.google.accounts.id.renderButton(document.getElementById("google-login-button"), {
        theme: "outline",
        size: "large",
        width: 320,
      });
    };

    if (document.getElementById(scriptId)) {
      renderButton();
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderButton;
    document.head.appendChild(script);
  }, [user, googleClientId]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const payload =
        authMode === "register"
          ? authForm
          : { email: authForm.email, password: authForm.password };
      const response = await api.post(`/auth/${authMode}`, payload);
      localStorage.setItem("ledger_token", response.data.token);
      localStorage.setItem("ledger_user", JSON.stringify(response.data.user));
      setUser(response.data.user);
      setAuthForm(emptyAuth);
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleGoogleCredential(response) {
    setAuthError("");
    setAuthLoading(true);

    try {
      const result = await api.post("/auth/google", {
        credential: response.credential,
      });
      localStorage.setItem("ledger_token", result.data.token);
      localStorage.setItem("ledger_user", JSON.stringify(result.data.user));
      setUser(result.data.user);
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadAccounts() {
    setLoading(true);
    setStatus({ type: "idle", text: "" });

    try {
      const response = await api.get("/accounts");
      const nextAccounts = response.data.accounts || [];
      setAccounts(nextAccounts);

      if (!transfer.fromAccount && nextAccounts[0]?._id) {
        setTransfer((current) => ({ ...current, fromAccount: nextAccounts[0]._id }));
      }

      await Promise.all(nextAccounts.map((account) => loadBalance(account._id)));
    } catch (error) {
      setStatus({ type: "error", text: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  async function loadBalance(accountId) {
    const response = await api.get(`/accounts/balance/${accountId}`);
    setBalances((current) => ({
      ...current,
      [accountId]: response.data.balance,
    }));
  }

  async function createAccount() {
    setLoading(true);
    setStatus({ type: "idle", text: "" });

    try {
      await api.post("/accounts");
      setStatus({ type: "success", text: "Account created successfully." });
      await loadAccounts();
    } catch (error) {
      setStatus({ type: "error", text: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  async function submitTransfer(event) {
    event.preventDefault();
    setLoading(true);
    setStatus({ type: "idle", text: "" });

    try {
      await api.post("/transactions", {
        fromAccount: transfer.fromAccount,
        toAccount: transfer.toAccount.trim(),
        amount: Number(transfer.amount),
        idempotencyKey: crypto.randomUUID(),
      });
      setStatus({ type: "success", text: "Transaction completed successfully." });
      setTransfer((current) => ({ ...current, toAccount: "", amount: "" }));
      await loadAccounts();
    } catch (error) {
      setStatus({ type: "error", text: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } finally {
      localStorage.removeItem("ledger_token");
      localStorage.removeItem("ledger_user");
      setUser(null);
      setAccounts([]);
      setBalances({});
    }
  }

  function copyAccountId(accountId) {
    navigator.clipboard.writeText(accountId);
    setStatus({ type: "success", text: "Account id copied." });
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-visual">
          <div className="brand-mark">
            <Wallet size={28} />
          </div>
          <h1>Ledger Desk</h1>
          <p>Manage accounts, check balances, and move funds from one focused dashboard.</p>
          <div className="trust-row">
            <span><ShieldCheck size={16} /> Token auth</span>
            <span><Banknote size={16} /> Ledger balance</span>
          </div>
        </section>

        <section className="auth-panel" aria-label="Authentication form">
          <div className="mode-switch">
            <button
              className={authMode === "login" ? "active" : ""}
              onClick={() => setAuthMode("login")}
              type="button"
            >
              Login
            </button>
            <button
              className={authMode === "register" ? "active" : ""}
              onClick={() => setAuthMode("register")}
              type="button"
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="form-stack">
            {authMode === "register" && (
              <label>
                Name
                <input
                  value={authForm.name}
                  onChange={(event) =>
                    setAuthForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm((current) => ({ ...current, email: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm((current) => ({ ...current, password: event.target.value }))
                }
                minLength={6}
                required
              />
            </label>
            {authError && <p className="form-error">{authError}</p>}
            <button className="primary-button" disabled={authLoading} type="submit">
              {authMode === "register" ? <UserPlus size={18} /> : <ShieldCheck size={18} />}
              {authLoading ? "Please wait" : authMode === "register" ? "Create account" : "Login"}
            </button>
            <div className="divider"><span>or</span></div>
            {googleClientId ? (
              <div id="google-login-button" className="google-button-slot" />
            ) : (
              <p className="form-hint">Google login is not configured on the backend.</p>
            )}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Wallet size={24} />
          <span>Ledger Desk</span>
        </div>
        <nav>
          <a href="#dashboard"><LayoutDashboard size={18} /> Dashboard</a>
          <a href="#accounts"><CreditCard size={18} /> Accounts</a>
          <a href="#transfer"><ArrowRightLeft size={18} /> Transfer</a>
        </nav>
        <button className="ghost-button" type="button" onClick={logout}>
          <LogOut size={18} /> Logout
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Signed in</p>
            <h1>{user.name}</h1>
          </div>
          <button className="icon-button" type="button" onClick={loadAccounts} title="Refresh">
            <RefreshCcw size={18} />
          </button>
        </header>

        {status.text && (
          <div className={`status ${status.type}`}>
            {status.type === "success" && <CheckCircle2 size={18} />}
            {status.text}
          </div>
        )}

        <section id="dashboard" className="summary-grid">
          <div className="metric">
            <span>Total balance</span>
            <strong>₹{totalBalance.toLocaleString("en-IN")}</strong>
          </div>
          <div className="metric">
            <span>Accounts</span>
            <strong>{accounts.length}</strong>
          </div>
          <div className="metric">
            <span>API</span>
            <strong>{loading ? "Syncing" : "Ready"}</strong>
          </div>
        </section>

        <section className="content-grid">
          <div id="accounts" className="panel accounts-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Accounts</p>
                <h2>Your ledger accounts</h2>
              </div>
              <button className="secondary-button" type="button" onClick={createAccount} disabled={loading}>
                <Plus size={18} /> New
              </button>
            </div>

            <div className="account-list">
              {accounts.length === 0 ? (
                <div className="empty-state">
                  <CreditCard size={28} />
                  <p>No account yet. Create one to start.</p>
                </div>
              ) : (
                accounts.map((account) => (
                  <article className="account-row" key={account._id}>
                    <div>
                      <span>{account.currency || "INR"} account</span>
                      <strong>₹{Number(balances[account._id] || 0).toLocaleString("en-IN")}</strong>
                      <code>{account._id}</code>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => copyAccountId(account._id)}
                      title="Copy account id"
                    >
                      <Copy size={17} />
                    </button>
                  </article>
                ))
              )}
            </div>
          </div>

          <div id="transfer" className="panel transfer-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Transfer</p>
                <h2>Move funds</h2>
              </div>
              <ArrowRightLeft size={22} />
            </div>

            <form className="form-stack" onSubmit={submitTransfer}>
              <label>
                From account
                <select
                  value={transfer.fromAccount}
                  onChange={(event) =>
                    setTransfer((current) => ({ ...current, fromAccount: event.target.value }))
                  }
                  required
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.currency || "INR"} - {account._id.slice(-6)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                To account id
                <input
                  value={transfer.toAccount}
                  onChange={(event) =>
                    setTransfer((current) => ({ ...current, toAccount: event.target.value }))
                  }
                  placeholder="Paste receiver account id"
                  required
                />
              </label>
              <label>
                Amount
                <input
                  type="number"
                  min="1"
                  value={transfer.amount}
                  onChange={(event) =>
                    setTransfer((current) => ({ ...current, amount: event.target.value }))
                  }
                  required
                />
              </label>
              <button className="primary-button" type="submit" disabled={loading || !accounts.length}>
                <ArrowRightLeft size={18} /> Send money
              </button>
            </form>
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
