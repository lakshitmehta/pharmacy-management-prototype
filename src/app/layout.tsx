import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PillBills Independent Pharmacy POS",
  description: "Batch-aware pharmacy operations and accounting workspace.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
