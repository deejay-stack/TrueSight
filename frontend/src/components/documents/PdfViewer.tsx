import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { readPreviewBytes } from "../../utils/filePreview";
import { Button } from "../ui/Button";
import { PreviewStatus } from "./PreviewStatus";

GlobalWorkerOptions.workerSrc = workerUrl;

function PdfPage({ pdf, number, width, zoom, onVisible }: { pdf: PDFDocumentProxy; number: number; width: number; zoom: number; onVisible: (number: number) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) onVisible(number);
    }, { rootMargin: "100px", threshold: .1 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [number, onVisible]);
  useEffect(() => {
    if (!canvas.current || width <= 0) return;
    if (!visible) { canvas.current.width = 0; canvas.current.height = 0; return; }
    let active = true;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    void (async () => {
      try {
        const page = await pdf.getPage(number);
        if (!active || !canvas.current) return;
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(width - 32, 1000) / base.width * zoom;
        const viewport = page.getViewport({ scale });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const target = canvas.current;
        target.width = Math.floor(viewport.width * ratio);
        target.height = Math.floor(viewport.height * ratio);
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        task = page.render({ canvas: target, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
        await task.promise;
      } catch (reason) {
        if (active && !(reason instanceof Error && reason.name === "RenderingCancelledException")) setError(true);
      }
    })();
    return () => { active = false; task?.cancel(); };
  }, [pdf, number, width, zoom, visible]);
  return <div ref={element} data-pdf-page={number} className="pdf-preview-page" style={{ minHeight: Math.max(180, Math.min(width - 32, 1000) * 1.3 * zoom) }} aria-label={`Page ${number}`}>
    {error ? <PreviewStatus message={`Page ${number} could not be rendered. Download the original to inspect it.`} /> : <canvas ref={canvas} role="img" aria-label={`Document page ${number}`} />}
    <span className="pdf-page-label">Page {number}</span>
  </div>;
}

export default function PdfViewer({ dataUrl, zoom }: { dataUrl: string; zoom: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<{ source: string; pdf?: PDFDocumentProxy; error?: boolean } | null>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(1);
  useEffect(() => {
    let active = true;
    let task: ReturnType<typeof getDocument>;
    try {
      task = getDocument({ data: readPreviewBytes(dataUrl), enableXfa: false });
    } catch {
      // Let the rejected task take the same recoverable error path below.
      void Promise.resolve().then(() => { if (active) setLoaded({ source: dataUrl, error: true }); });
      return () => { active = false; };
    }
    // Password-protected PDFs get a recoverable download fallback instead of a stuck loader.
    task.onPassword = () => { if (active) setLoaded({ source: dataUrl, error: true }); void task.destroy(); };
    void task.promise.then((pdf) => { if (active) { setLoaded({ source: dataUrl, pdf }); setPage(1); } }).catch(() => { if (active) setLoaded({ source: dataUrl, error: true }); });
    return () => { active = false; void task.destroy(); };
  }, [dataUrl]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const pdf = loaded?.source === dataUrl ? loaded.pdf : undefined;
  const goToPage = (number: number) => {
    const target = container.current?.querySelector<HTMLElement>(`[data-pdf-page="${number}"]`);
    target?.scrollIntoView({ block: "start", behavior: "auto" });
    setPage(number);
  };
  return <div ref={container} className="pdf-preview" aria-label="PDF document">
    {!loaded || loaded.source !== dataUrl ? <PreviewStatus loading message="Loading PDF pages…" /> : loaded.error ? <PreviewStatus message="Preview could not be generated. This PDF may be damaged or password protected. You may still download the original submission." /> : pdf && <>
      <div className="pdf-page-controls">
        <Button size="icon" variant="ghost" aria-label="Previous page" disabled={page <= 1} onClick={() => goToPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span aria-live="polite">Page {Math.min(page, pdf.numPages)} of {pdf.numPages}</span>
        <Button size="icon" variant="ghost" aria-label="Next page" disabled={page >= pdf.numPages} onClick={() => goToPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      {Array.from({ length: pdf.numPages }, (_, index) => <PdfPage key={index} pdf={pdf} number={index + 1} width={width} zoom={zoom} onVisible={setPage} />)}
    </>}
  </div>;
}
