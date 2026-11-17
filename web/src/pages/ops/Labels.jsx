import { useState } from 'react';
import { ErrorBox, OPS_NAV, PageHeader, SubNav, useApi } from '../../components/ui.jsx';
import { code128Svg } from '../../lib/barcode.js';
import { printHtml } from '../../lib/print.js';
import { inr } from '../../lib/format.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const mrpOf = (it) => (it.mrp ? Number(it.mrp) : Math.round(Number(it.price) * (1 + Number(it.taxRate) / 100) * 100) / 100);

export default function Labels() {
  const { data, error } = useApi('/items');
  const [copies, setCopies] = useState({});
  const [size, setSize] = useState('a4');
  const [q, setQ] = useState('');
  const items = (data?.items || []).filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
  const code = (it) => it.barcode || it.sku || it.id.slice(-10).toUpperCase();
  const print = () => {
    const chosen = (data?.items || []).flatMap((it) => Array.from({ length: Number(copies[it.id]) || 0 }, () => it));
    if (!chosen.length) return;
    const html = `<div class="grid">${chosen.map((it) => `<div class="l"><div class="n">${esc(it.name)}</div>${code128Svg(code(it), { height: 38, module: 1.4 })}<div class="p">MRP ₹${mrpOf(it).toFixed(2)}</div></div>`).join('')}</div>`;
    const css = size === 'a4'
      ? '@page{size:A4;margin:8mm}body{font-family:sans-serif}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm}.l{border:1px dashed #bbb;padding:2mm;text-align:center;break-inside:avoid}.l svg{width:100%;height:auto}.n{font-size:10px;font-weight:bold;white-space:nowrap;overflow:hidden}.p{font-size:11px;font-weight:bold}'
      : '@page{size:50mm 25mm;margin:0}body{margin:0;font-family:sans-serif}.l{width:50mm;height:25mm;padding:1mm 2mm;box-sizing:border-box;text-align:center;page-break-after:always;overflow:hidden}.l svg{width:100%;height:13mm}.n{font-size:8px;font-weight:bold;white-space:nowrap;overflow:hidden}.p{font-size:9px;font-weight:bold}';
    printHtml(html, css);
  };
  const total = Object.values(copies).reduce((a, n) => a + (Number(n) || 0), 0);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Operations" subtitle="Barcode labels print">
        <button type="button" className="btn-primary" disabled={!total} onClick={print}>🖨️ Print {total || ''} labels</button>
      </PageHeader>
      <SubNav items={OPS_NAV} />
      <ErrorBox>{error}</ErrorBox>
      <div className="flex flex-wrap gap-3 items-center">
        <input aria-label="Search" className="input h-10 max-w-xs" placeholder="Search item" value={q} onChange={(e) => setQ(e.target.value)} />
        <label htmlFor="lsz" className="text-sm font-semibold">Paper</label>
        <select id="lsz" className="input h-10 w-auto" value={size} onChange={(e) => setSize(e.target.value)}>
          <option value="a4">A4 sheet (normal printer)</option><option value="roll">50×25mm label printer</option>
        </select>
      </div>
      <p className="text-sm text-muted">Item ki barcode lekapothe SKU / auto code vadutundi. Item edit lo "Barcode" box lo company barcode kuda pettochu.</p>
      <div className="card divide-y divide-gray-100">
        {items.map((it) => (
          <label key={it.id} className="flex items-center gap-3 p-3 text-sm">
            <span className="flex-1"><b>{it.name}</b><span className="block text-xs text-muted">{code(it)} · {inr(mrpOf(it))}</span></span>
            <span className="text-xs text-muted">Copies</span>
            <input type="number" min="0" max="500" className="input h-9 w-20" value={copies[it.id] ?? ''} onChange={(e) => setCopies({ ...copies, [it.id]: e.target.value })} />
          </label>
        ))}
      </div>
    </div>
  );
}
