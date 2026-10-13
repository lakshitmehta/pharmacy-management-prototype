"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const groups = [
  { label: "Counter", items: [["Dashboard", "/dashboard"], ["Billing / POS", "/billing"], ["Medicine Inventory", "/inventory"], ["Sales", "/sales"], ["Returns & Exchange", "/returns"]] },
  { label: "Stock & purchase", items: [["Suppliers", "/suppliers"], ["Expiry Ledger", "/expiry"], ["Purchase Orders", "/purchase-orders"], ["Credit / Debit Notes", "/supplier-notes"], ["Purchase Reports", "/purchase-reports"]] },
  { label: "Banking & payments", items: [["Accounts Payable", "/payables"], ["Payments", "/payments"], ["Bank & Cash Book", "/bank-book"], ["Voucher Entry", "/voucher-entry"]] },
  { label: "Reports", items: [["Reports Hub", "/reports"]] },
  { label: "Customers", items: [["Customers Registry", "/customers"], ["Customer Udhaar / Khata", "/khata"]] },
  { label: "Admin", items: [["System Settings", "/settings"], ["Data & Backup", "/backup"]] },
] as const;

export function AppShell({ children, user, store, unreadNotifications }: { children: React.ReactNode; user: { displayName: string; username: string }; store: { name: string; code: string }; unreadNotifications: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className={dark ? "app-root dark" : "app-root"}>
      <aside className={open ? "sidebar mobile-open" : "sidebar"}>
        <div className="sidebar-brand">
          <div className="brand-mark small">PB</div>
          <div><strong>PillBills</strong><span>{store.code}</span></div>
        </div>
        <nav aria-label="Primary navigation">
          {groups.map((group) => <div className="nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map(([label, href]) => <Link className={pathname === href ? "nav-link active" : "nav-link"} href={href} key={href} onClick={() => setOpen(false)}>{label}</Link>)}
          </div>)}
        </nav>
        <button className="logout-button" onClick={logout}>Log out</button>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle navigation">Menu</button>
          <div className="topbar-title"><span className="status-dot" /> <span>{store.name}</span></div>
          <div className="topbar-actions">
            <button className="utility-button" onClick={() => setDark(!dark)}>{dark ? "Light" : "Dark"}</button>
            <span className="notification-pill">{unreadNotifications} unread</span>
            <div className="profile"><strong>{user.displayName}</strong><span>@{user.username}</span></div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
