import { BookOpen, Layers3, ShieldCheck } from "lucide-react";

/** Abstract classroom illustration. No statistics or analysis results are represented. */
export function WorkspaceArtwork() {
  return (
    <div className="workspace-artwork" aria-hidden="true">
      <div className="workspace-artwork-orbit" />
      <div className="workspace-artwork-plane plane-back"><Layers3 /></div>
      <div className="workspace-artwork-plane plane-middle"><BookOpen /></div>
      <div className="workspace-artwork-plane plane-front"><ShieldCheck /></div>
      <span className="workspace-artwork-point point-one" />
      <span className="workspace-artwork-point point-two" />
    </div>
  );
}
