// When a vendor's own domain opens the app, the server adds <meta name="bm-shop" content="slug">.
export const hostShop = () => document.querySelector('meta[name="bm-shop"]')?.getAttribute('content') || null;
