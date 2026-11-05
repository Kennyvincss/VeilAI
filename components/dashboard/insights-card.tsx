"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import type { VerificationResult, VerificationState } from "@/types";
import { streamAnalyst } from "@/hooks/use-analyst-stream";
import { Markdown } from "@/components/analyst/markdown";
import { Badge, Button, buttonClass, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { VerificationBadge } from "@/components/ui/status";

const BRIEFING =
  "Give me a concise briefing of my portfolio: the 3 most important observations (facts) and 2 precautions to consider. Keep it under 150 words.";

/** On-demand AI insights (not generated automatically, to avoid unnecessary inference). */
export function InsightsCard() {
  const [text, setText] = useState("");
  const [state, setState] = useState<VerificationState | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [inference, setInference] = useState<"near-ai" | "demo-template" | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function run() {
    abort.current?.abort();
    abort.current = new AbortController();
    setRunning(true);
    setText("");
    setError(null);
    setVerification(null);
    try {
      await streamAnalyst(
        { message: BRIEFING, saveHistory: false },
        (e) => {
          if (e.type === "status") setState(e.state);
          else if (e.type === "meta") setInference(e.inference);
          else if (e.type === "delta") setText((t) => t + e.text);
          else if (e.type === "verification") {
            setVerification(e.result);
            setState(e.result.state);
          } else if (e.type === "error") setError(e.message);
        },
        abort.current.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError("Could not reach the analyst.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={<Sparkles className="h-4 w-4" />}
        title="AI insights"
        subtitle={inference === "demo-template" ? "Demo template — not NEAR AI" : "Confidential briefing via NEAR AI Cloud"}
        action={state ? <VerificationBadge state={state} /> : undefined}
      />
      <div className="flex-1">
        {error ? (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
            {error}
          </p>
        ) : text ? (
          <div className="max-h-72 overflow-y-auto pr-1 text-sm">
            <Markdown>{text}</Markdown>
          </div>
        ) : running ? (
          <div className="space-y-2">
            <div className="skeleton h-3 w-11/12" />
            <div className="skeleton h-3 w-9/12" />
            <div className="skeleton h-3 w-10/12" />
          </div>
        ) : (
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title="Generate a private briefing"
            description="Runs one confidential inference on NEAR AI Cloud and verifies the response. Nothing is saved."
          />
        )}
      </div>
      {verification && <p className="mt-3 text-[0.7rem] leading-relaxed text-subtle">{verification.summary}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={run} loading={running}>
          <Sparkles className="h-3.5 w-3.5" /> {text ? "Regenerate" : "Generate briefing"}
        </Button>
        <Link href="/dashboard/analyst" className={buttonClass("ghost", "sm")}>
          Open analyst <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {inference === "demo-template" && <Badge tone="warning">Demo response</Badge>}
      </div>
    </Card>
  );
}
