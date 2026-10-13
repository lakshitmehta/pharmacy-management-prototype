import { CustomerWorkspace } from "@/components/customer-workspace";

export const metadata = {
  title: "Customers Registry | PillBills",
  description: "Manage pharmacy customer profiles, contact info, prescription history, and ledger accounts.",
};

export default function CustomersPage() {
  return <CustomerWorkspace />;
}

