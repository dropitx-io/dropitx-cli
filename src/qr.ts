import QRCode from "qrcode";

/** QR code drawn with half-block characters, for printing in a terminal. */
export function qrTerminal(url: string): Promise<string> {
  return QRCode.toString(url, { type: "terminal", small: true, errorCorrectionLevel: "L" });
}

/** Writes a QR code image; the format follows the file extension (PNG by default). */
export function saveQrImage(url: string, outputPath: string): Promise<void> {
  return QRCode.toFile(outputPath, url, { errorCorrectionLevel: "M", margin: 4, scale: 10 });
}
