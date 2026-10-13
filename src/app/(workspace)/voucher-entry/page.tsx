import { VoucherWorkspace } from "@/components/voucher-workspace";

export const metadata = {
  title: "Voucher Entry | PillBills",
  description: "Post double-entry journal vouchers, payments, receipts, and contra entries with balance validation.",
};

export default function VoucherEntryPage() {
  return <VoucherWorkspace />;
}

