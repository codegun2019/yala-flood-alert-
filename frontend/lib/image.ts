/** ย่อรูป + แปลงเป็น JPEG ใหม่ผ่าน canvas — ตัดข้อมูล EXIF (รวมพิกัด GPS ในรูป) ออกทั้งหมด */
export async function shrinkToJpegBase64(file: File, maxBytes = 200_000): Promise<string> {
  const bmp = await createImageBitmap(file);
  let side = 960;
  let q = 0.72;
  for (let i = 0; i < 6; i++) {
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", q));
    if (blob.size <= maxBytes) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (let j = 0; j < buf.length; j += 0x8000) s += String.fromCharCode(...buf.subarray(j, j + 0x8000));
      return btoa(s);
    }
    side = Math.round(side * 0.8);
    q = Math.max(0.45, q - 0.07);
  }
  throw new Error("รูปใหญ่เกินไป");
}
