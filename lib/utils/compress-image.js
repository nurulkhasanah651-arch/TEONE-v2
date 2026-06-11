// Kompresi gambar di sisi klien sebelum upload → hemat storage & upload lebih cepat.
// Resize ke maxDim, kualitas JPEG. File non-gambar (PDF, dll) dilewati apa adanya.
export async function compressImage(file, { maxDim = 1600, quality = 0.72, skipUnderKB = 120 } = {}) {
  try {
    if (!file || typeof file === 'string') return file;
    const type = file.type || '';
    if (!type.startsWith('image/')) return file;            // PDF/dok lain → biarkan
    if (type === 'image/gif') return file;                   // jangan rusak animasi
    if (file.size <= skipUnderKB * 1024) return file;        // sudah kecil, skip

    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = dataUrl;
    });

    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      if (width >= height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
      else { width = Math.round(width * (maxDim / height)); height = maxDim; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); // hindari background transparan jadi hitam
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;        // kalau tidak lebih kecil, pakai asli

    const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file; // gagal kompres → fallback ke file asli
  }
}
