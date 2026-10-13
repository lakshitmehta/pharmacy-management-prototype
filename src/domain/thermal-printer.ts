/**
 * src/domain/thermal-printer.ts
 * Practical ESC/POS and Thermal Receipt formatting for 58mm (32 cols) and 80mm (42/48 cols) printers.
 */

export type ThermalPaperWidth = "58mm" | "80mm";

export interface ReceiptItem {
  name: string;
  batchNumber?: string;
  quantity: number;
  rate: number;
  discount?: number;
  total: number;
}

export interface ReceiptData {
  storeName: string;
  storeAddress?: string | null;
  storePhone?: string | null;
  gstin?: string | null;
  drugLicense?: string | null;
  invoiceNumber: string;
  createdAt: string | Date;
  customerName?: string | null;
  customerPhone?: string | null;
  doctorName?: string | null;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  footerNotice?: string | null;
  terms?: string | null;
}

export interface EscPosOptions {
  width: ThermalPaperWidth;
  columns?: number; // Defaults: 32 for 58mm, 42 for 80mm
  cutPaper?: boolean;
}

/**
 * Pads a string to a given width with spaces.
 */
function padEnd(str: string, length: number): string {
  if (str.length >= length) return str.slice(0, length);
  return str + " ".repeat(length - str.length);
}

function padStart(str: string, length: number): string {
  if (str.length >= length) return str.slice(0, length);
  return " ".repeat(length - str.length) + str;
}

function wrapText(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const words = text.split(" ");
  const result: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length <= width) {
      current = (current + " " + word).trim();
    } else {
      if (current) result.push(current);
      current = word.length > width ? word.slice(0, width) : word;
    }
  }
  if (current) result.push(current);
  return result;
}

function centerText(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  const right = width - text.length - left;
  return " ".repeat(left) + text + " ".repeat(right);
}

function formatRow(left: string, right: string, width: number): string {
  const maxRightLen = Math.min(right.length, Math.floor(width / 2));
  const maxLeftLen = width - maxRightLen - 1;
  const truncatedLeft = left.length > maxLeftLen ? left.slice(0, maxLeftLen) : left;
  const padding = width - truncatedLeft.length - right.length;
  return truncatedLeft + " ".repeat(Math.max(1, padding)) + right;
}

/**
 * Returns formatted monospace text for thermal printer or browser preview.
 */
export function formatThermalTextReceipt(data: ReceiptData, options?: Partial<EscPosOptions>): string {
  const widthMode = options?.width || "80mm";
  const cols = options?.columns || (widthMode === "58mm" ? 32 : 42);

  const divider = "-".repeat(cols);
  const doubleDivider = "=".repeat(cols);

  const lines: string[] = [];

  // Header
  wrapText(data.storeName.toUpperCase(), cols).forEach((l) => lines.push(centerText(l, cols)));
  if (data.storeAddress) {
    wrapText(data.storeAddress, cols).forEach((l) => lines.push(centerText(l, cols)));
  }
  if (data.storePhone) lines.push(centerText(`Ph: ${data.storePhone}`, cols));
  if (data.gstin) lines.push(centerText(`GSTIN: ${data.gstin}`, cols));
  if (data.drugLicense) lines.push(centerText(`DL: ${data.drugLicense}`, cols));

  lines.push(divider);

  // Meta info
  const dateStr = typeof data.createdAt === "string" ? data.createdAt.slice(0, 16).replace("T", " ") : new Date(data.createdAt).toISOString().slice(0, 16).replace("T", " ");

  if (cols < 38) {
    lines.push(`Bill No: ${data.invoiceNumber}`);
    lines.push(`Date:    ${dateStr}`);
  } else {
    lines.push(formatRow(`Bill: ${data.invoiceNumber}`, dateStr, cols));
  }

  if (data.customerName) {
    const custPhone = data.customerPhone ? ` (${data.customerPhone})` : "";
    const fullCust = `${data.customerName}${custPhone}`;
    if (cols < 38 || fullCust.length > cols - 10) {
      lines.push(`Customer: ${data.customerName}`);
      if (data.customerPhone) lines.push(`Phone:    ${data.customerPhone}`);
    } else {
      lines.push(formatRow("Customer:", fullCust, cols));
    }
  }
  if (data.doctorName) {
    if (cols < 38) {
      lines.push(`Doctor:   ${data.doctorName}`);
    } else {
      lines.push(formatRow("Doctor:", data.doctorName, cols));
    }
  }

  lines.push(divider);

  // Items Table Header
  if (cols >= 40) {
    // 80mm table: Item (Batch) [20] | Qty [4] | Rate [8] | Total [8]
    const hItem = padEnd("Item/Batch", cols - 24);
    const hQty = padStart("Qty", 5);
    const hRate = padStart("Rate", 9);
    const hTot = padStart("Total", 10);
    lines.push(`${hItem}${hQty}${hRate}${hTot}`);
  } else {
    // 58mm table: Item [14] | Qty [4] | Rate [6] | Tot [8]
    const hItem = padEnd("Item", cols - 18);
    const hQty = padStart("Qty", 4);
    const hRate = padStart("Rate", 6);
    const hTot = padStart("Tot", 8);
    lines.push(`${hItem}${hQty}${hRate}${hTot}`);
  }

  lines.push(divider);

  // Item Rows
  data.items.forEach((item) => {
    const itemName = item.batchNumber ? `${item.name} (${item.batchNumber})` : item.name;
    const qtyStr = String(item.quantity);
    const rateStr = item.rate.toFixed(2);
    const totStr = item.total.toFixed(2);

    if (cols >= 40) {
      const colItem = padEnd(itemName.slice(0, cols - 25), cols - 24);
      const colQty = padStart(qtyStr, 5);
      const colRate = padStart(rateStr, 9);
      const colTot = padStart(totStr, 10);
      lines.push(`${colItem}${colQty}${colRate}${colTot}`);
    } else {
      const colItem = padEnd(itemName.slice(0, cols - 19), cols - 18);
      const colQty = padStart(qtyStr, 4);
      const colRate = padStart(rateStr, 6);
      const colTot = padStart(totStr, 8);
      lines.push(`${colItem}${colQty}${colRate}${colTot}`);
    }
  });

  lines.push(divider);

  // Totals Section
  lines.push(formatRow("Subtotal:", `Rs ${data.subtotal.toFixed(2)}`, cols));
  if (data.discount > 0) {
    lines.push(formatRow("Discount:", `-Rs ${data.discount.toFixed(2)}`, cols));
  }
  lines.push(formatRow("GST / Tax:", `Rs ${data.tax.toFixed(2)}`, cols));
  lines.push(doubleDivider);
  lines.push(formatRow("NET TOTAL:", `Rs ${data.total.toFixed(2)}`, cols));
  lines.push(doubleDivider);
  lines.push(formatRow("Paid Via:", data.paymentMethod, cols));

  // Footer Section
  lines.push(divider);
  if (data.footerNotice) {
    wrapText(data.footerNotice, cols).forEach((l) => lines.push(centerText(l, cols)));
  } else {
    lines.push(centerText("Thank you! Get well soon.", cols));
  }
  if (data.terms) {
    wrapText(data.terms, cols).forEach((l) => lines.push(centerText(l, cols)));
  } else {
    lines.push(centerText("Returns accepted within 7 days with bill.", cols));
  }

  return lines.join("\n");
}

/**
 * Encodes ESC/POS byte sequence for thermal printers.
 */
export function generateEscPosCommands(data: ReceiptData, options?: Partial<EscPosOptions>): Uint8Array {
  const widthMode = options?.width || "80mm";
  const cutPaper = options?.cutPaper ?? true;
  const cols = options?.columns || (widthMode === "58mm" ? 32 : 42);

  const bytes: number[] = [];

  const pushText = (txt: string) => {
    for (let i = 0; i < txt.length; i++) {
      bytes.push(txt.charCodeAt(i) & 0xff);
    }
  };

  const pushLine = (txt: string = "") => {
    pushText(txt);
    bytes.push(0x0a); // LF
  };

  // 1. Initialize Printer (ESC @)
  bytes.push(0x1b, 0x40);

  // 2. Center Align (ESC a 1)
  bytes.push(0x1b, 0x61, 0x01);

  // Double Height & Width for Store Name (GS ! 0x11) + Bold (ESC E 1)
  bytes.push(0x1d, 0x21, 0x11);
  bytes.push(0x1b, 0x45, 0x01);
  wrapText(data.storeName.toUpperCase(), Math.floor(cols / 2)).forEach((l) => pushLine(l));

  // Reset Size to Normal (GS ! 0x00)
  bytes.push(0x1d, 0x21, 0x00);
  bytes.push(0x1b, 0x45, 0x00);

  if (data.storeAddress) wrapText(data.storeAddress, cols).forEach((l) => pushLine(l));
  if (data.storePhone) pushLine(`Ph: ${data.storePhone}`);
  if (data.gstin) pushLine(`GSTIN: ${data.gstin}`);
  if (data.drugLicense) pushLine(`DL: ${data.drugLicense}`);

  // Divider
  pushLine("-".repeat(cols));

  // 3. Left Align (ESC a 0) for Invoice Details
  bytes.push(0x1b, 0x61, 0x00);

  const dateStr = typeof data.createdAt === "string" ? data.createdAt.slice(0, 16).replace("T", " ") : new Date(data.createdAt).toISOString().slice(0, 16).replace("T", " ");

  if (cols < 38) {
    pushLine(`Bill No: ${data.invoiceNumber}`);
    pushLine(`Date:    ${dateStr}`);
  } else {
    pushLine(formatRow(`Bill: ${data.invoiceNumber}`, dateStr, cols));
  }

  if (data.customerName) {
    const custPhone = data.customerPhone ? ` (${data.customerPhone})` : "";
    const fullCust = `${data.customerName}${custPhone}`;
    if (cols < 38 || fullCust.length > cols - 10) {
      pushLine(`Customer: ${data.customerName}`);
      if (data.customerPhone) pushLine(`Phone:    ${data.customerPhone}`);
    } else {
      pushLine(formatRow("Customer:", fullCust, cols));
    }
  }
  if (data.doctorName) {
    if (cols < 38) {
      pushLine(`Doctor:   ${data.doctorName}`);
    } else {
      pushLine(formatRow("Doctor:", data.doctorName, cols));
    }
  }

  pushLine("-".repeat(cols));

  // Table Header
  bytes.push(0x1b, 0x45, 0x01); // Bold on
  if (cols >= 40) {
    const hItem = padEnd("Item/Batch", cols - 24);
    const hQty = padStart("Qty", 5);
    const hRate = padStart("Rate", 9);
    const hTot = padStart("Total", 10);
    pushLine(`${hItem}${hQty}${hRate}${hTot}`);
  } else {
    const hItem = padEnd("Item", cols - 18);
    const hQty = padStart("Qty", 4);
    const hRate = padStart("Rate", 6);
    const hTot = padStart("Tot", 8);
    pushLine(`${hItem}${hQty}${hRate}${hTot}`);
  }
  bytes.push(0x1b, 0x45, 0x00); // Bold off
  pushLine("-".repeat(cols));

  // Items
  data.items.forEach((item) => {
    const itemName = item.batchNumber ? `${item.name} (${item.batchNumber})` : item.name;
    const qtyStr = String(item.quantity);
    const rateStr = item.rate.toFixed(2);
    const totStr = item.total.toFixed(2);

    if (cols >= 40) {
      const colItem = padEnd(itemName.slice(0, cols - 25), cols - 24);
      const colQty = padStart(qtyStr, 5);
      const colRate = padStart(rateStr, 9);
      const colTot = padStart(totStr, 10);
      pushLine(`${colItem}${colQty}${colRate}${colTot}`);
    } else {
      const colItem = padEnd(itemName.slice(0, cols - 19), cols - 18);
      const colQty = padStart(qtyStr, 4);
      const colRate = padStart(rateStr, 6);
      const colTot = padStart(totStr, 8);
      pushLine(`${colItem}${colQty}${colRate}${colTot}`);
    }
  });

  pushLine("-".repeat(cols));

  // Totals
  pushLine(formatRow("Subtotal:", `Rs ${data.subtotal.toFixed(2)}`, cols));
  if (data.discount > 0) {
    pushLine(formatRow("Discount:", `-Rs ${data.discount.toFixed(2)}`, cols));
  }
  pushLine(formatRow("GST / Tax:", `Rs ${data.tax.toFixed(2)}`, cols));
  pushLine("=".repeat(cols));

  // Emphasized Grand Total
  bytes.push(0x1b, 0x45, 0x01); // Bold on
  bytes.push(0x1d, 0x21, 0x01); // Double height
  pushLine(formatRow("NET TOTAL:", `Rs ${data.total.toFixed(2)}`, cols));
  bytes.push(0x1d, 0x21, 0x00); // Normal height
  bytes.push(0x1b, 0x45, 0x00); // Bold off

  pushLine("=".repeat(cols));
  pushLine(formatRow("Paid Via:", data.paymentMethod, cols));
  pushLine("-".repeat(cols));

  // Footer (Centered)
  bytes.push(0x1b, 0x61, 0x01); // Center
  if (data.footerNotice) {
    wrapText(data.footerNotice, cols).forEach((l) => pushLine(l));
  } else {
    pushLine("Thank you! Get well soon.");
  }
  if (data.terms) {
    wrapText(data.terms, cols).forEach((l) => pushLine(l));
  } else {
    pushLine("Returns accepted within 7 days with bill.");
  }

  // Feed 4 lines
  bytes.push(0x0a, 0x0a, 0x0a, 0x0a);

  // Cut Paper (GS V 66 0 = Partial cut)
  if (cutPaper) {
    bytes.push(0x1d, 0x56, 0x42, 0x00);
  }

  return new Uint8Array(bytes);
}

