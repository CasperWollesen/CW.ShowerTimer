import { useState } from 'react';
import { Copy, Share2 } from 'lucide-react';
import { QrCode } from './QrCode';

export const shareUrl = 'https://casperwollesen.github.io/CW.ShowerTimer/';
export function Share() {
  const [status, setStatus] = useState('');
  return <details className="share-section">
    <summary><Share2 size={18} /><span>Share Shower Timer</span></summary>
    <div className="share-content">
      <p className="hint">Scan to open the app on another phone. Your settings and history stay here.</p>
      <QrCode text={shareUrl} label="QR code to open Shower Timer" />
      <a className="share-url" href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a>
      <div className="test-actions">
        <button className="secondary" type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(shareUrl); setStatus('Link copied.'); }
          catch { setStatus('Could not copy. Select the link above to copy it.'); }
        }}><Copy size={15} />Copy link</button>
        {typeof navigator.share === 'function' && <button className="secondary" type="button" onClick={async () => {
          try { await navigator.share({ title: 'Shower Timer', url: shareUrl }); setStatus('Shared.'); }
          catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) setStatus('Could not share. Try Copy link instead.'); }
        }}><Share2 size={15} />Share</button>}
      </div>{status && <p className="hint" role="status">{status}</p>}
    </div>
  </details>;
}
