import { describe, expect, it } from "vitest";
import {
  formatThermalTextReceipt,
  generateEscPosCommands,
  ReceiptData,
} from "@/domain/thermal-printer";

describe("Thermal Printer ESC/POS domain", () => {
  const sampleReceipt: ReceiptData = {
    storeName: "City Medicos",
    storeAddress: "123 Main Market, New Delhi",
    storePhone: "9876543210",
    gstin: "07AAAAA0000A1Z5",
    drugLicense: "DL-20B-12345",
    invoiceNumber: "INV-2026-0042",
    createdAt: "2026-10-11T12:00:00.000Z",
    customerName: "Ramesh Kumar",
    customerPhone: "9811122233",
    doctorName: "Dr. A. K. Gupta",
    items: [
      {
        name: "Paracetamol 500mg",
        batchNumber: "B101",
        quantity: 2,
        rate: 25.5,
        total: 51.0,
      },
      {
        name: "Azithromycin 500mg",
        batchNumber: "AZ89",
        quantity: 1,
        rate: 120.0,
        total: 120.0,
      },
    ],
    subtotal: 171.0,
    discount: 10.0,
    tax: 8.55,
    total: 169.55,
    paymentMethod: "UPI",
    footerNotice: "Thank you for shopping with us!",
    terms: "Exchange allowed within 7 days.",
  };

  it("formats 58mm receipt text respecting 32-column bounds", () => {
    const text = formatThermalTextReceipt(sampleReceipt, { width: "58mm" });
    const lines = text.split("\n");

    expect(lines.length).toBeGreaterThan(10);
    // Check that header and totals are present
    expect(text).toContain("CITY MEDICOS");
    expect(text).toContain("INV-2026-0042");
    expect(text).toContain("NET TOTAL:");
    expect(text).toContain("169.55");
    expect(text).toContain("UPI");

    // Check each line does not overflow 32 columns
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(32);
    }
  });

  it("formats 80mm receipt text respecting 42-column bounds", () => {
    const text = formatThermalTextReceipt(sampleReceipt, { width: "80mm", columns: 42 });
    const lines = text.split("\n");

    expect(text).toContain("CITY MEDICOS");
    expect(text).toContain("Dr. A. K. Gupta");
    expect(text).toContain("Ramesh Kumar");
    expect(text).toContain("Paracetamol 500mg");

    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(42);
    }
  });

  it("generates binary ESC/POS command stream with init, alignment, and cut bytes", () => {
    const bytes = generateEscPosCommands(sampleReceipt, { width: "80mm", cutPaper: true });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(50);

    // Initial sequence: ESC @ (0x1b, 0x40)
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);

    // End sequence includes paper cut GS V 66 0 (0x1d, 0x56, 0x42, 0x00)
    const len = bytes.length;
    expect(bytes[len - 4]).toBe(0x1d);
    expect(bytes[len - 3]).toBe(0x56);
    expect(bytes[len - 2]).toBe(0x42);
    expect(bytes[len - 1]).toBe(0x00);
  });

  it("supports cutPaper: false without cut bytes", () => {
    const bytes = generateEscPosCommands(sampleReceipt, { cutPaper: false });
    const len = bytes.length;
    // Should end with line feeds (0x0a)
    expect(bytes[len - 1]).toBe(0x0a);
  });
});

