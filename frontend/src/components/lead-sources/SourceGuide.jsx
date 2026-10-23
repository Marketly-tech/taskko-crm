import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { buildGuide, guideToText } from "@/lib/leadSourceGuides";
import { Copy, Printer, Mail } from "lucide-react";
import { toast } from "sonner";

const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const printGuide = (s, g) => {
  const w = window.open("", "_blank");
  if (!w) { toast.error("Allow pop-ups to print the guide"); return; }
  const body = g.sections.map((sec) => `<h3>${esc(sec.title)}</h3>${sec.code ? `<pre>${esc(sec.code)}</pre>` : `<ul>${sec.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`}`).join("");
  w.document.write(`<html><head><title>${esc(s.name)} · Propzel integration guide</title><style>body{font-family:Arial,sans-serif;color:#1F3D2B;max-width:760px;margin:32px auto;line-height:1.5}pre{background:#F4F2EC;padding:12px;white-space:pre-wrap;word-break:break-all;font-size:12px}h3{margin-top:24px}small{color:#5C6661}</style></head><body><small>PROPZEL CRM · LEAD INTEGRATION GUIDE</small><h1>${esc(s.name)}</h1><p><b>For:</b> ${esc(g.audience)}</p><p>${esc(g.intro)}</p>${body}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
};

export const SourceGuide = ({ source, onClose }) => {
  if (!source) return null;
  const g = buildGuide(source);
  const text = guideToText(source, g);
  const copy = async () => { await navigator.clipboard.writeText(text); toast.success("Guide copied — paste it in email or WhatsApp"); };
  const mail = `mailto:?subject=${encodeURIComponent(`${source.name} → Propzel CRM lead integration`)}&body=${encodeURIComponent(text)}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto" data-testid="ls-guide-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-forest">{source.name} · integration guide</DialogTitle>
          <DialogDescription>Share this with: <b>{g.audience}</b></DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <button data-testid="ls-guide-copy" onClick={copy} className="h-9 px-3 rounded-sm bg-forest text-white text-sm inline-flex items-center gap-2 hover:bg-forest-soft transition-colors duration-150"><Copy className="h-4 w-4" /> Copy guide</button>
          <a data-testid="ls-guide-email" href={mail} className="h-9 px-3 rounded-sm border border-[#E6E4DD] text-forest text-sm inline-flex items-center gap-2 hover:border-forest transition-colors duration-150"><Mail className="h-4 w-4" /> Email</a>
          <button data-testid="ls-guide-print" onClick={() => printGuide(source, g)} className="h-9 px-3 rounded-sm border border-[#E6E4DD] text-forest text-sm inline-flex items-center gap-2 hover:border-forest transition-colors duration-150"><Printer className="h-4 w-4" /> Print / Save PDF</button>
        </div>
        <p className="text-sm text-forest/80">{g.intro}</p>
        <div className="space-y-4">
          {g.sections.map((sec) => (
            <div key={sec.title}>
              <div className="label-caps mb-1.5">{sec.title}</div>
              {sec.code ? (
                <pre className="bg-bone-alt/60 border border-[#E6E4DD] rounded-sm p-3 text-[11px] text-forest whitespace-pre-wrap break-all">{sec.code}</pre>
              ) : (
                <ul className="text-sm text-forest/80 space-y-1 list-disc pl-5">{sec.lines.map((l) => <li key={l}>{l}</li>)}</ul>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
