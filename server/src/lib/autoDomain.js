// One-click vendor domain setup: Hostinger DNS records + Render custom domain + verification.
// Needs on Render: RENDER_API_KEY, HOSTINGER_API_TOKEN (RENDER_SERVICE_ID / RENDER_EXTERNAL_HOSTNAME are set by Render).
const RENDER_IP = '216.24.57.1'; // Render load balancer for root domains

export const autoDomainConfig = () => ({
  render: Boolean(process.env.RENDER_API_KEY && process.env.RENDER_SERVICE_ID),
  hostinger: Boolean(process.env.HOSTINGER_API_TOKEN),
  target: process.env.RENDER_EXTERNAL_HOSTNAME || null,
});

async function call(url, { method = 'GET', token, body } = {}) {
  const r = await fetch(url, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

const msg = (res) => (typeof res.data === 'string' ? res.data : res.data?.message || res.data?.error || JSON.stringify(res.data || {})).slice(0, 200);

// Points root → Render IP and www → service hostname on Hostinger DNS.
export async function setHostingerDns(root) {
  const token = process.env.HOSTINGER_API_TOKEN;
  const target = process.env.RENDER_EXTERNAL_HOSTNAME;
  if (!token) throw new Error('HOSTINGER_API_TOKEN not set on Render');
  if (!target) throw new Error('RENDER_EXTERNAL_HOSTNAME missing');
  const base = `https://developers.hostinger.com/api/dns/v1/zones/${encodeURIComponent(root)}`;
  // Remove old records that would clash (parking page, IPv6).
  await call(base, {
    method: 'DELETE', token,
    body: { filters: [{ name: '@', type: 'A' }, { name: '@', type: 'AAAA' }, { name: 'www', type: 'CNAME' }, { name: 'www', type: 'A' }, { name: 'www', type: 'AAAA' }] },
  });
  const res = await call(base, {
    method: 'PUT', token,
    body: {
      overwrite: false,
      zone: [
        { name: '@', type: 'A', ttl: 300, records: [{ content: RENDER_IP }] },
        { name: 'www', type: 'CNAME', ttl: 300, records: [{ content: target }] },
      ],
    },
  });
  if (!res.ok) throw new Error(`Hostinger DNS: ${res.status} ${msg(res)}`);
}

const renderBase = () => `https://api.render.com/v1/services/${process.env.RENDER_SERVICE_ID}/custom-domains`;

export async function addRenderDomain(host) {
  const token = process.env.RENDER_API_KEY;
  if (!token || !process.env.RENDER_SERVICE_ID) throw new Error('RENDER_API_KEY not set on Render');
  const res = await call(renderBase(), { method: 'POST', token, body: { name: host } });
  if (!res.ok && res.status !== 409) throw new Error(`Render: ${res.status} ${msg(res)}`);
}

export async function verifyRenderDomain(host) {
  const token = process.env.RENDER_API_KEY;
  await call(`${renderBase()}/${encodeURIComponent(host)}/verify`, { method: 'POST', token });
  const res = await call(`${renderBase()}/${encodeURIComponent(host)}`, { token });
  if (!res.ok) throw new Error(`Render: ${res.status} ${msg(res)}`);
  return { verified: res.data?.verificationStatus === 'verified', status: res.data?.verificationStatus || 'unknown' };
}

export async function removeRenderDomain(host) {
  const token = process.env.RENDER_API_KEY;
  if (!token || !process.env.RENDER_SERVICE_ID) return;
  await call(`${renderBase()}/${encodeURIComponent(host)}`, { method: 'DELETE', token });
}
