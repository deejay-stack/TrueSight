import { Component, lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, Expand, FileText, Minimize2, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "../ui/Button";
import { CodeEditor } from "../code/CodeEditor";
import { originalBlob, previewKind, previewLanguage, readPreviewBytes, type PreviewSource } from "../../utils/filePreview";
import { formatFileSize } from "../../utils/documentPreview";
import { PreviewStatus } from "./PreviewStatus";
import { ImageViewer } from "./ImageViewer";

const PdfViewer = lazy(() => import("./PdfViewer"));
const DocxViewer = lazy(() => import("./DocxViewer"));

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <PreviewStatus message="Preview could not be generated. You may still download the original submission." /> : this.props.children; }
}

function PreviewContent({ source, zoom, darkMode }: { source: PreviewSource; zoom: number; darkMode: boolean }) {
  const kind = previewKind(source);
  if (kind === "unsupported") return <PreviewStatus message="Preview is not available for this file type. The original submission remains available for download." />;
  if (kind === "pdf" || kind === "docx") {
    if (!source.dataUrl) return <PreviewStatus message="The original file is unavailable. The submission record and review remain accessible." />;
    return <Suspense fallback={<PreviewStatus loading message="Loading document renderer…" />}>
      {kind === "pdf" ? <PdfViewer dataUrl={source.dataUrl} zoom={zoom} /> : <DocxViewer dataUrl={source.dataUrl} zoom={zoom} />}
    </Suspense>;
  }
  if (kind === "image") {
    if (!source.dataUrl) return <PreviewStatus message="The original image is unavailable. Your review remains accessible." />;
    return <ImageViewer dataUrl={source.dataUrl} name={source.fileName} zoom={zoom} />;
  }
  const text = source.textContent ?? (source.dataUrl ? new TextDecoder().decode(readPreviewBytes(source.dataUrl)) : "");
  if (!text) return <PreviewStatus message="No text content is available for this submission." />;
  return kind === "code" ? <div className="document-code" style={{ zoom }}><CodeEditor value={text} language={previewLanguage(source)} readOnly minHeight={400} darkMode={darkMode} ariaLabel="Submitted source code (read only)" /></div> :
    <article className="document-text-paper" style={{ fontSize: `${zoom * 16}px` }} aria-label="Submitted text">{text}</article>;
}

function DownloadButton({ source }: { source: PreviewSource }) {
  const url = useRef<string | null>(null);
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current); }, []);
  const download = () => {
    try {
      const blob = originalBlob(source);
      if (!blob) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url.current; link.download = source.fileName; link.click();
    } catch { /* A damaged record cannot supply bytes; the preview error remains visible. */ }
  };
  if (!source.dataUrl && source.textContent == null) return null;
  return <Button size="sm" variant="outline" onClick={download} aria-label="Download original file"><Download className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Download original</span></Button>;
}

export function DocumentPreview({ source, darkMode = false, className = "", allowFullscreen = true }: {
  source: PreviewSource; darkMode?: boolean; className?: string; allowFullscreen?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const host = useRef<HTMLElement>(null);
  const [portalTheme, setPortalTheme] = useState<CSSProperties>({});
  const openFullscreen = (open: boolean) => {
    if (open && host.current) {
      const style = getComputedStyle(host.current);
      const names = ["--app-bg", "--app-bg-soft", "--app-surface", "--app-surface-strong", "--app-border", "--app-text", "--app-muted", "--app-accent", "--app-accent-2", "--app-on-accent", "--app-ring", "--app-shadow"];
      setPortalTheme(Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)])) as CSSProperties);
    }
    setExpanded(open);
  };
  const kind = previewKind(source);
  const zoomable = kind !== "unsupported";
  const controls = <div className="document-zoom-controls">
    <Button size="icon" variant="ghost" aria-label="Zoom out" disabled={!zoomable || zoom <= .5} onClick={() => setZoom((value) => Math.max(.5, value - .25))}><ZoomOut className="h-4 w-4" /></Button>
    <output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
    <Button size="icon" variant="ghost" aria-label="Zoom in" disabled={!zoomable || zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + .25))}><ZoomIn className="h-4 w-4" /></Button>
    <Button size="sm" variant="ghost" aria-label="Fit width or reset zoom" onClick={() => setZoom(1)}><RotateCcw className="mr-2 h-3.5 w-3.5" />Fit</Button>
  </div>;
  const body = <PreviewBoundary key={`${source.fileName}:${source.dataUrl?.length}:${source.textContent?.length}`}><PreviewContent source={source} zoom={zoom} darkMode={darkMode} /></PreviewBoundary>;
  return <Dialog.Root open={expanded} onOpenChange={openFullscreen}>
    <section ref={host} className={`document-preview ${className}`} aria-label="Document preview">
      <div className="document-preview-toolbar">
        <div className="document-preview-filename"><FileText className="h-4 w-4 shrink-0 text-[var(--app-accent)]" /><div><p title={source.fileName}>{source.fileName}</p><span>{kind.toUpperCase()} {source.fileSize ? `· ${formatFileSize(source.fileSize)}` : ""}</span></div></div>
        <div className="document-preview-actions"><DownloadButton source={source} />{allowFullscreen && <Dialog.Trigger asChild><Button size="sm" variant="outline" aria-label="Full screen document preview"><Expand className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Full screen</span></Button></Dialog.Trigger>}</div>
      </div>
      {!expanded && <>{controls}<div className="document-preview-viewport" tabIndex={0} aria-label="Scrollable document content">{body}</div></>}
      {expanded && <p className="p-5 text-sm theme-muted">Document open in full screen. Close it to return to this review.</p>}
    </section>
    <Dialog.Portal>
      <Dialog.Overlay className="document-fullscreen-overlay" />
      <Dialog.Content className="document-fullscreen" style={portalTheme} onEscapeKeyDown={(event) => event.stopPropagation()}>
        <div className="document-preview-toolbar"><div className="min-w-0"><Dialog.Title className="truncate font-semibold">{source.fileName}</Dialog.Title><Dialog.Description className="text-xs theme-muted">{kind.toUpperCase()} · Original submission preview</Dialog.Description></div><div className="document-preview-actions"><DownloadButton source={source} /><Dialog.Close asChild><Button size="sm" variant="outline"><Minimize2 className="mr-2 h-4 w-4" />Close<X className="ml-2 h-4 w-4" /></Button></Dialog.Close></div></div>
        {controls}<div className="document-preview-viewport" tabIndex={0} aria-label="Scrollable full-screen document content">{body}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
