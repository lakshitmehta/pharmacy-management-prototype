import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [medicineCount, supplierCount, customerCount, todaySales] = await Promise.all([
    prisma.medicine.count({ where: { storeId: session.storeId } }),
    prisma.supplier.count({ where: { storeId: session.storeId, active: true } }),
    prisma.customer.count({ where: { storeId: session.storeId } }),
    prisma.salesInvoice.findMany({
      where: {
        storeId: session.storeId,
        status: "POSTED",
        createdAt: { gte: todayStart },
      },
      select: { total: true },
    }),
  ]);

  const todayRevenue = todaySales.reduce((sum, inv) => sum + Number(inv.total), 0);

  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Today at a glance</p>
          <h1>Dashboard</h1>
          <p>Current performance across billing and inventory activity.</p>
        </div>
        <button className="secondary-button">Refresh</button>
      </div>
      <div className="metric-grid">
        <article>
          <span>Today&apos;s Sales</span>
          <strong>₹{todayRevenue.toFixed(2)}</strong>
          <small>{todaySales.length} bills generated today</small>
        </article>
        <article>
          <span>Medicines</span>
          <strong>{medicineCount}</strong>
          <small>Catalog records</small>
        </article>
        <article>
          <span>Active suppliers</span>
          <strong>{supplierCount}</strong>
          <small>Purchasing partners</small>
        </article>
        <article>
          <span>Customers</span>
          <strong>{customerCount}</strong>
          <small>Registered profiles</small>
        </article>
      </div>
      <div className="dashboard-band">
        <div>
          <p className="panel-kicker">Store context</p>
          <h2>{session.store.name}</h2>
          <p>All upcoming workflows are scoped to this store and will write only to its own database records.</p>
        </div>
        <span className="live-badge">Session active</span>
      </div>
    </section>
  );
}
