import { useEffect, useRef, useState } from "react";
import { PreviewStatus } from "./PreviewStatus";

export function ImageViewer({ dataUrl, name, zoom }: { dataUrl: string; name: string; zoom: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [space, setSpace] = useState({ width: 600, height: 500 });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const viewport = host.current?.parentElement;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => setSpace({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  const safe = /^data:image\/(png|jpeg|webp|gif|bmp|avif);base64,/i.test(dataUrl);
  const scale = natural ? Math.min(Math.max(100, space.width - 40) / natural.width, Math.max(100, space.height - 40) / natural.height, 1) : 1;
  const width = natural ? natural.width * scale * zoom : undefined;
  const height = natural ? natural.height * scale * zoom : undefined;
  return <div ref={host} className="document-image-wrap" style={{ width: width ? Math.max(width + 40, space.width) : "100%", minHeight: height ? Math.max(height + 40, space.height) : "100%" }}>
    {!safe || failed ? <PreviewStatus message="Preview could not be generated. You may still download the original submission." /> : <>
      {!natural && <PreviewStatus loading message="Loading image…" />}
      <img src={dataUrl} alt={name} onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setFailed(true)}
        style={{ width, height, maxWidth: "none", visibility: natural ? "visible" : "hidden" }} />
    </>}
  </div>;
}
