/**
 * Compresión de fotos en el navegador antes de subirlas: reduce fotos de
 * 4–8 MB del celular a ~300–600 KB (lado mayor 1920 px, JPEG 80%).
 * Menos datos móviles en campo y menos almacenamiento.
 */
export async function compressImage(file: File, maxSide = 1920, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Selecciona una imagen");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // formato que el navegador no decodifica: el servidor validará el tipo real
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  return blob && blob.size < file.size ? blob : file;
}
