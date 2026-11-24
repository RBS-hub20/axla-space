// Shared "real, scannable QR to axla.space" generator — both promo video
// components (AxlaShowreelStudio, TaxLayaPromoVideo) call this instead of
// each hardcoding their own qrcode.toDataURL call, so the target URL and
// styling can't drift between the two ad variants.
export async function generateAxlaQrDataUrl(size: number): Promise<string> {
  const QRCode = await import("qrcode");
  return QRCode.toDataURL("https://axla.space", {
    width: size,
    margin: 1,
    color: { dark: "#0B0F1A", light: "#ffffff" },
  });
}
