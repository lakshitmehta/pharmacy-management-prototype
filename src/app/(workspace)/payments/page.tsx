import { PaymentsWorkspace } from "@/components/payments-workspace";

export const metadata = {
  title: "Supplier Payments | PillBills",
  description: "Disburse payments to suppliers with automated FIFO purchase bill allocation and bank/cash ledger integration.",
};

export default function PaymentsPage() {
  return <PaymentsWorkspace />;
}

