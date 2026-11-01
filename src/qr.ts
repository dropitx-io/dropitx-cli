import QRCode from "qrcode";

/**
 * QR code drawn with half-block characters for a terminal. With color, the code
 * is painted black-on-white with ANSI escapes so it scans on dark themes;
 * without color (pipes, NO_COLOR) it is plain text.
 */
export function qrTerminal(url: string, { color = true }: { color?: boolean } = {}): Promise<string> {
  return color
    ? QRCode.toString(url, { type: "terminal", small: true, errorCorrectionLevel: "L" })
    : QRCode.toString(url, { type: "utf8", errorCorrectionLevel: "L", margin: 2 });
}

/** Writes a QR code image; the format follows the file extension (PNG by default). */
export function saveQrImage(url: string, outputPath: string): Promise<void> {
  return QRCode.toFile(outputPath, url, { errorCorrectionLevel: "M", margin: 4, scale: 10 });
}
