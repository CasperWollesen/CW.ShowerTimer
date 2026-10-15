import { useMemo } from 'react';
import { qrMatrix } from './qr';

export interface QrCodeProps {
  text: string;
  label: string;
}

/** QR code as crisp SVG: one path of dark modules on white, with the 4-module quiet zone. */
export function QrCode({ text, label }: QrCodeProps) {
  const { size, path } = useMemo(() => {
    const m = qrMatrix(text);
    let d = '';
    m.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x + 4} ${y + 4}h1v1h-1z`;
      }),
    );
    return { size: m.length + 8, path: d };
  }, [text]);

  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      {/* Always dark on white: scanners expect it, whatever the app theme. */}
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
