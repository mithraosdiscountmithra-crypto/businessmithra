// The shop's logo as a square app icon (home-screen icon). Cloudinary resizes it for us.
export function logoIcon(url, size) {
  if (!url || !/res\.cloudinary\.com\/.+\/upload\//.test(url)) return null;
  return url.replace('/upload/', `/upload/c_pad,b_white,w_${size},h_${size},f_png/`);
}
