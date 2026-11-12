import { NavLink, Route, Routes } from "react-router-dom";
import AccountsPage from "./pages/AccountsPage";
import CustomersPage from "./pages/CustomersPage";
import DashboardPage from "./pages/DashboardPage";
import TestSuitePage from "./pages/TestSuitePage";
import TransactionsPage from "./pages/TransactionsPage";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/customers", label: "Customers" },
  { to: "/accounts", label: "Accounts" },
  { to: "/transactions", label: "Transactions" },
  { to: "/tests", label: "Test suite" },
];

function NotFoundPage() {
  return (
    <section className="card">
      <h2>Page not found</h2>
      <p className="muted">Use the navigation to reach the console pages.</p>
    </section>
  );
}

export default function App() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">B</span>
          <div className="brand-text">
            <strong>Banking API</strong>
            <span>Assessment console</span>
          </div>
        </div>

        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span>API · localhost:3000</span>
          <span>UI · localhost:5173</span>
        </div>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/tests" element={<TestSuitePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>

        <footer className="page-footer">
          React + Vite console for the Node.js / DynamoDB assessment API.
        </footer>
      </main>
    </div>
  );
}
