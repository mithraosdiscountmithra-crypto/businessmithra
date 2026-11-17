// One small helper for every AiSensy API campaign (order alerts, campaigns, birthday wishes).
export const aisensyReady = (campaignEnv) => Boolean(process.env.AISENSY_API_KEY && process.env[campaignEnv]);

export async function sendTemplate({ campaignEnv, campaign, phone, userName, params = [], media }) {
  const name = campaign || process.env[campaignEnv];
  if (!process.env.AISENSY_API_KEY || !name || !/^[6-9]\d{9}$/.test(String(phone || ''))) return false;
  try {
    const r = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: process.env.AISENSY_API_KEY, campaignName: name, destination: `91${phone}`,
        userName: String(userName || 'Customer').slice(0, 60), templateParams: params.map((p) => String(p ?? '').slice(0, 900)),
        ...(media ? { media } : {}),
      }),
    });
    if (!r.ok) console.error('AiSensy send failed', name, r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) {
    console.error('AiSensy send error', e.message);
    return false;
  }
}
