"use client";

import type { FinancialReport } from "@/types";

/**
 * Renders a FinancialReport to PDF entirely in the browser (jsPDF), so the
 * report contents never pass through any extra server or PDF service.
 */
export async function downloadReportPdf(report: FinancialReport): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 44;
  let y = M;
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y;
  const ensure = (h: number) => {
    if (y + h > doc.internal.pageSize.getHeight() - M) {
      doc.addPage();
      y = M;
    }
  };
  const text = (t: string, size = 10, color: [number, number, number] = [40, 44, 60], bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(sanitize(t), W - M * 2) as string[];
    for (const line of lines) {
      ensure(size + 4);
      doc.text(line, M, y);
      y += size + 4;
    }
  };

  // Header band
  doc.setFillColor(8, 9, 13);
  doc.rect(0, 0, W, 86, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("VEIL AI", M, 40);
  doc.setFontSize(11);
  doc.setTextColor(167, 139, 250);
  doc.text(sanitize(report.title), M, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(160, 165, 185);
  doc.text(`Generated ${new Date(report.generatedAt).toUTCString()}`, W - M, 40, { align: "right" });
  doc.text(`Subject: ${sanitize(report.subject)}`, W - M, 54, { align: "right" });
  y = 112;

  if (report.mode === "demo") {
    doc.setFillColor(254, 243, 199);
    doc.rect(M, y - 12, W - M * 2, 24, "F");
    text("DEMO REPORT — sample data, not real accounts or market prices.", 9, [146, 64, 14], true);
    y += 8;
  } else {
    text("Data mode: LIVE (public on-chain and market data providers)", 9, [21, 128, 61], true);
    y += 4;
  }

  for (const s of report.sections) {
    ensure(40);
    y += 8;
    text(s.heading, 12, [17, 19, 30], true);
    if (s.body) text(s.body, 9.5);
    if (s.table) {
      autoTable(doc, {
        startY: y + 2,
        head: [s.table.columns.map(sanitize)],
        body: s.table.rows.map((r) => r.map((c) => sanitize(String(c)))),
        margin: { left: M, right: M },
        styles: { fontSize: 8, cellPadding: 4, textColor: [40, 44, 60], overflow: "linebreak" },
        headStyles: { fillColor: [21, 24, 36], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [246, 245, 252] },
      });
      y = lastY() + 12;
    }
  }

  ensure(60);
  y += 8;
  text("Data sources", 12, [17, 19, 30], true);
  if (report.sources.length === 0) text("No external sources (sample data).", 9);
  for (const src of dedupe(report.sources)) {
    text(`• ${src.name} — ${src.purpose} — ${src.ok ? "OK" : `unavailable${src.error ? ` (${src.error})` : ""}`} — retrieved ${new Date(src.fetchedAt).toUTCString()} — ${src.url}`, 8.5);
  }

  y += 6;
  text("Methodology", 12, [17, 19, 30], true);
  for (const m of report.methodology) text(`• ${m}`, 8.5);

  y += 6;
  text("Disclaimer", 12, [17, 19, 30], true);
  text(report.disclaimer, 8.5, [90, 95, 115]);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(140, 145, 165);
    doc.text(`VEIL AI · Confidential financial intelligence · Page ${i} of ${pages}`, W / 2, doc.internal.pageSize.getHeight() - 20, { align: "center" });
  }

  const date = report.generatedAt.slice(0, 10);
  doc.save(`veil-ai-${report.type}-report-${date}${report.mode === "demo" ? "-DEMO" : ""}.pdf`);
}

/** jsPDF's built-in fonts are Latin-1 only; replace characters it cannot draw. */
function sanitize(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•]/g, "*")
    .replace(/[≥]/g, ">=")
    .replace(/[≤]/g, "<=")
    .replace(/[×]/g, "x")
    .replace(/[√]/g, "sqrt")
    .replace(/[‖]/g, "||")
    .replace(/[^\x00-\xFF]/g, "?");
}

function dedupe<T extends { name: string; purpose: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = `${s.name}|${s.purpose}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
