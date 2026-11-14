"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Download, Eye, EyeOff, Printer } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/**
 * Backup tools for the recovery phrase shown ONCE at account creation.
 *
 * Everything happens in this browser: nothing here is sent to VEIL AI or
 * saved by it. Copy/Download/Print only hand the words to the user (their
 * clipboard, a file on their device, their printer).
 */
export function RecoveryBackup({ accountId, network, words, privateKey, publicKey }: { accountId: string; network: string; words: string[]; privateKey: string; publicKey: string }) {
  const [showKey, setShowKey] = useState(false);
  const phrase = words.join(" ");

  function text() {
    return [
      `NEAR account: ${accountId} (${network})`,
      `Created: ${new Date().toUTCString()}`,
      "",
      "RECOVERY PHRASE (12 words, in order)",
      ...words.map((w, i) => `${String(i + 1).padStart(2, " ")}. ${w}`),
      "",
      "PRIVATE KEY (for wallets that import by key)",
      privateKey,
      "",
      `Public key: ${publicKey}`,
      "",
      "Anyone with these words or this key controls the account and its funds.",
      "Keep this offline and private. VEIL AI does not have a copy and will never ask for it.",
    ].join("\n");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(phrase);
      toast.success("Copied. Paste it somewhere safe and offline, then copy something else to clear it.");
    } catch {
      toast.error("Could not copy. Write the words down instead.");
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text()], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${accountId}-recovery.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Saved to your device. Move it somewhere safe, like a USB stick, and don't upload it anywhere.");
  }

  function print() {
    const w = window.open("", "_blank", "width=640,height=820");
    if (!w) return toast.error("Allow pop-ups to print, or write the words down instead.");
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    w.document.write(`<!doctype html><title>${esc(accountId)} recovery</title><body style="font-family:ui-sans-serif,system-ui,sans-serif;padding:32px;color:#133628">
      <h2 style="margin:0">${esc(accountId)}</h2><p style="color:#4a5d55;margin:4px 0 20px">NEAR ${esc(network)} · recovery phrase</p>
      <ol style="columns:3;font-family:ui-monospace,monospace;font-size:16px;line-height:2">${words.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
      <p style="margin-top:20px;font-size:12px">Private key (for wallets that import by key):<br><code style="word-break:break-all">${esc(privateKey)}</code></p>
      <p style="margin-top:20px;font-size:12px;color:#b3261e"><b>Anyone with these words or this key controls the account.</b> Keep this paper safe. VEIL AI has no copy.</p>
      </body>`);
    w.document.close();
    w.focus();
    w.print();
    setTimeout(() => w.close(), 500);
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-3 gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          <Copy className="h-3.5 w-3.5" /> Copy
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={download}>
          <Download className="h-3.5 w-3.5" /> Download
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={print}>
          <Printer className="h-3.5 w-3.5" /> Print
        </Button>
      </div>
      <div className="mt-3 rounded-xl border border-border bg-bg-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-text">Private key</span>
          <button type="button" onClick={() => setShowKey((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-accent-strong hover:underline">
            {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {showKey ? "Hide" : "Show"}
          </button>
        </div>
        <p className="mt-1 text-[0.72rem] text-muted">Same access as the 12 words, for wallets that import by key. Included in Download and Print.</p>
        {showKey && <code className="mt-2 block break-all rounded-lg bg-white px-2.5 py-2 font-mono text-[0.72rem] text-text ring-1 ring-border">{privateKey}</code>}
      </div>
    </div>
  );
}
