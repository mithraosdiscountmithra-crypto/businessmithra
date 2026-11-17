// Stock: every change is a StockMove (+ in / − out). Items with trackStock = false are ignored.
import { num } from './money.js';

const round3 = (n) => Math.round(n * 1000) / 1000;

// Changes the stock number on the item (or on its size/variant) without writing a move.
async function bump(tx, item, variantId, qty) {
  const variants = Array.isArray(item.variants) ? item.variants : [];
  if (variantId && variants.some((v) => v.id === variantId)) {
    const next = variants.map((v) => (v.id === variantId ? { ...v, stock: round3(num(v.stock) + qty) } : v));
    const total = round3(next.reduce((a, v) => a + num(v.stock), 0));
    await tx.item.update({ where: { id: item.id }, data: { variants: next, stock: total } });
  } else {
    await tx.item.update({ where: { id: item.id }, data: { stock: { increment: qty } } });
  }
}

export async function moveStock(tx, { businessId, itemId, variantId = null, qty, reason, refType = null, refId = null, note = null, userId = null }) {
  if (!itemId || !qty) return;
  const item = await tx.item.findFirst({ where: { id: itemId, businessId } });
  if (!item || !item.trackStock) return;
  await bump(tx, item, variantId, qty);
  await tx.stockMove.create({ data: { businessId, itemId, variantId, qty, reason, refType, refId, note, createdById: userId } });
}

// Undo everything a document (invoice, order, bill…) did to stock.
export async function reverseRef(tx, refType, refId) {
  const moves = await tx.stockMove.findMany({ where: { refType, refId } });
  for (const m of moves) {
    const item = await tx.item.findUnique({ where: { id: m.itemId } });
    if (item) await bump(tx, item, m.variantId, -num(m.qty));
  }
  if (moves.length) await tx.stockMove.deleteMany({ where: { refType, refId } });
}

// Re-applies a document's lines: sign −1 = goods out (sale), +1 = goods in (purchase / return).
export async function applyLines(tx, { businessId, refType, refId, lines, sign, reason, userId = null }) {
  await reverseRef(tx, refType, refId);
  for (const l of lines) {
    if (l.itemId) await moveStock(tx, { businessId, itemId: l.itemId, variantId: l.variantId || null, qty: sign * num(l.qty), reason, refType, refId, userId });
  }
}

// Stock currently available for an item / size (null when not tracked).
export function available(item, variantId) {
  if (!item.trackStock) return null;
  const v = variantId && Array.isArray(item.variants) ? item.variants.find((x) => x.id === variantId) : null;
  return v ? num(v.stock) : num(item.stock);
}
