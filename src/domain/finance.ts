export type SaleLineInput = {
  quantity: number;
  unitRate: number;
  discountPercent: number;
  taxPercent: number;
};

export function calculateSaleLine(input: SaleLineInput) {
  const gross = input.quantity * input.unitRate;
  const discount = gross * (input.discountPercent / 100);
  const taxable = gross - discount;
  const tax = taxable * (input.taxPercent / 100);
  return {
    gross: roundCurrency(gross),
    discount: roundCurrency(discount),
    taxable: roundCurrency(taxable),
    tax: roundCurrency(tax),
    total: roundCurrency(taxable + tax),
  };
}

export type OpenBalance = { id: string; amount: number; outstanding: number };

export function allocateFifo(amount: number, balances: OpenBalance[]) {
  if (amount < 0) throw new Error("Allocation amount cannot be negative");
  let remaining = amount;
  return balances
    .filter((balance) => balance.outstanding > 0)
    .map((balance) => {
      const allocated = Math.min(remaining, balance.outstanding);
      remaining = roundCurrency(remaining - allocated);
      return { invoiceId: balance.id, amount: roundCurrency(allocated) };
    })
    .filter((allocation) => allocation.amount > 0);
}

export function assertBalanced(lines: Array<{ debit: number; credit: number }>) {
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  if (roundCurrency(debit) !== roundCurrency(credit)) {
    throw new Error("Voucher debits and credits must balance");
  }
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
