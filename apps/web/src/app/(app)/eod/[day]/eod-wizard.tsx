"use client";

import { GRADES, PLAY_OUTCOMES, PLAY_OUTCOME_LABELS, type EodMarket, type EodPlay, type Grade } from "@tj/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { Button, Field, cx, inputStyles } from "@/components/ui";
import { deleteEodChart, saveEodDay, saveEodMarket, uploadEodChart } from "../actions";

export type Section = EodMarket & { images: { id: string; url: string }[] };

export interface DayTrade {
  id: string;
  label: string;
  pnl: string;
  tone: "gain" | "loss" | "flat";
}

interface Props {
  day: string;
  /** Markets from Settings, in their order. */
  available: string[];
  initial: { markets: string[]; grade: Grade | null; summary: string | null; lesson: string | null; sections: Record<string, Section> };
  /** Playbook setups first, then other setup names already used. */
  setups: string[];
  dayTrades: DayTrade[];
  saved: boolean;
}

const emptySection = (): Section => ({
  went: null, did: null, shouldHave: null, chartUrl: null, noTrade: false, noSetup: false, setupsSeen: [], plays: [], images: [],
});
const emptyPlay = (setup: string | null): EodPlay => ({ presentedAt: null, setup, side: "buy", outcome: "taken", detail: null, chartUrl: null });
const NO_CLEAN_SETUP = "No clean setup";

/**
 * Downscales a screenshot to 1600px wide and re-encodes it as JPEG, so uploads
 * stay small. JPEG has no transparency, so the background is painted white first.
 */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read the image"))), "image/jpeg", 0.8),
  );
}

export function EodWizard({ day, available, initial, setups, dayTrades, saved }: Props) {
  const router = useRouter();
  const [markets, setMarkets] = useState(initial.markets.length ? initial.markets : available);
  const [sections, setSections] = useState(initial.sections);
  const [grade, setGrade] = useState<Grade | null>(initial.grade);
  const [summary, setSummary] = useState(initial.summary ?? "");
  const [lesson, setLesson] = useState(initial.lesson ?? "");
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Saved markets that are no longer in Settings stay listed, so their notes are not hidden.
  const choices = [...available, ...Object.keys(initial.sections).filter((m) => !available.includes(m))];
  const steps = ["markets", ...markets, "grade"];
  const current = steps[Math.min(step, steps.length - 1)]!;
  const isMarket = current !== "markets" && current !== "grade";
  const section = sections[current] ?? emptySection();

  const patch = (p: Partial<Section>) => setSections((s) => ({ ...s, [current]: { ...(s[current] ?? emptySection()), ...p } }));

  const toggleMarket = (m: string, on: boolean) =>
    setMarkets((list) => choices.filter((c) => (c === m ? on : list.includes(c))));

  const go = (n: number) => {
    setMessage(null);
    setStep(n);
  };

  /** Saves the current market, then moves on. Stays put if the save fails. */
  const next = () =>
    startTransition(async () => {
      if (isMarket) {
        // The schema drops `images`: screenshots are saved as they are added.
        const result = await saveEodMarket(day, markets, current, section);
        if (!result?.ok) return setMessage({ ok: false, text: result?.message ?? "Could not save." });
      }
      go(step + 1);
    });

  const finish = () =>
    startTransition(async () => {
      const result = await saveEodDay(day, { markets, grade, summary, lesson });
      if (!result?.ok) return setMessage({ ok: false, text: result?.message ?? "Could not save the day." });
      router.push(`/eod?month=${day.slice(0, 7)}#${day}`);
    });

  const upload = async (file: File) => {
    const market = current;
    setMessage({ ok: true, text: "Uploading screenshot…" });
    try {
      const form = new FormData();
      form.set("file", new File([await compress(file)], "chart.jpg", { type: "image/jpeg" }));
      const result = await uploadEodChart(day, markets, market, form);
      if (!result.ok) return setMessage({ ok: false, text: result.message });
      setSections((s) => {
        const sec = s[market] ?? emptySection();
        return { ...s, [market]: { ...sec, images: [...sec.images, result.image] } };
      });
      setMessage({ ok: true, text: "Screenshot added." });
    } catch {
      setMessage({ ok: false, text: "Could not read that image." });
    }
  };

  // Paste a screenshot anywhere on a market step.
  const pasteImage = useEffectEvent((e: ClipboardEvent) => {
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      void upload(file);
    }
  });
  useEffect(() => {
    if (!isMarket) return;
    const onPaste = (e: ClipboardEvent) => pasteImage(e);
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [isMarket]);

  const last = step === steps.length - 1;

  return (
    <div className="space-y-4">
      <nav aria-label="Steps" className="flex flex-wrap gap-1.5">
        {steps.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => go(i)}
            aria-current={i === step ? "step" : undefined}
            className={cx(
              "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              i === step ? "border-accent bg-accent text-accent-ink" : i < step ? "border-line bg-surface-2 text-ink" : "border-line text-ink-2 hover:bg-surface-2",
            )}
          >
            {s === "markets" ? "Markets" : s === "grade" ? "Day grade" : s}
          </button>
        ))}
      </nav>

      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        {current === "markets" && (
          <div className="space-y-5">
            <Field label="Date" hint={saved ? "You already have a review for this day. Saving updates it." : undefined} className="max-w-56">
              <input type="date" value={day} onChange={(e) => e.target.value && router.push(`/eod/${e.target.value}`)} className={inputStyles} />
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink-2">Which markets are you reviewing?</legend>
              <div className="flex flex-wrap gap-2">
                {choices.map((m) => (
                  <label key={m} className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm has-checked:bg-surface-2">
                    <input type="checkbox" checked={markets.includes(m)} onChange={(e) => toggleMarket(m, e.target.checked)} className="accent-[var(--accent)]" />
                    {m}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">
                You go through each ticked market in order, then grade the day. Change the list in <Link href="/settings" className="underline">Settings</Link>.
              </p>
            </fieldset>
            {dayTrades.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-ink-2">In your journal that day</h3>
                <ul className="tabular space-y-0.5 text-sm">
                  {dayTrades.map((t) => (
                    <li key={t.id}>
                      <Link href={`/trades/${t.id}`} className="hover:underline">{t.label}</Link>{" "}
                      <span className={t.tone === "gain" ? "text-gain-ink" : t.tone === "loss" ? "text-loss-ink" : "text-ink-2"}>{t.pnl}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {isMarket && <MarketStep market={current} section={section} setups={setups} patch={patch} onUpload={upload} />}

        {current === "grade" && (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink-2">Overall grade for the day</legend>
              <div className="flex gap-2">
                {GRADES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={grade === g}
                    onClick={() => setGrade(g)}
                    className={cx(
                      "h-11 w-11 rounded-lg border text-lg font-semibold transition-colors",
                      grade === g ? "border-accent bg-accent text-accent-ink" : "border-line hover:bg-surface-2",
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </fieldset>
            <Field label="How did the day go overall?">
              <textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} className={inputStyles} />
            </Field>
            <Field label="Main thing to carry into tomorrow">
              <textarea rows={3} value={lesson} onChange={(e) => setLesson(e.target.value)} className={inputStyles} />
            </Field>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button type="button" variant="secondary" disabled={step === 0 || pending} onClick={() => go(step - 1)}>Back</Button>
          <Button type="button" disabled={pending || (current === "markets" && !markets.length)} onClick={last ? finish : next}>
            {pending ? "Saving…" : last ? "Save day" : current === "markets" ? "Start" : "Save and next"}
          </Button>
          {message && (
            <p role="status" className={cx("text-sm", message.ok ? "text-ink-2" : "text-loss-ink")}>{message.text}</p>
          )}
        </div>
      </section>
    </div>
  );
}

interface MarketProps {
  market: string;
  section: Section;
  setups: string[];
  patch: (p: Partial<Section>) => void;
  onUpload: (file: File) => Promise<void>;
}

function MarketStep({ market, section, setups, patch, onUpload }: MarketProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [newSetup, setNewSetup] = useState("");
  const names = [...new Set([...setups, ...section.setupsSeen.map((s) => s.setup), ...extra])];
  const seen = (setup: string, side: "buy" | "sell") => section.setupsSeen.some((s) => s.setup === setup && s.side === side);
  const toggleSeen = (setup: string, side: "buy" | "sell", on: boolean) =>
    patch({
      setupsSeen: on
        ? [...section.setupsSeen, { setup, side }]
        : section.setupsSeen.filter((s) => !(s.setup === setup && s.side === side)),
    });
  const plays = section.plays.length || section.noTrade ? section.plays : [emptyPlay(setups[0] ?? null)];
  const patchPlay = (i: number, p: Partial<EodPlay>) => patch({ plays: plays.map((x, j) => (j === i ? { ...x, ...p } : x)) });

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">{market}</h2>
      <Field label="How the session went">
        <textarea rows={3} placeholder="Flow, regime, what price did" value={section.went ?? ""} onChange={(e) => patch({ went: e.target.value })} className={inputStyles} />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink-2">Setups that were there</legend>
        {names.length > 0 ? (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="pr-4 text-left font-medium">Setup</th>
                  <th className="px-3 font-medium">Long</th>
                  <th className="px-3 font-medium">Short</th>
                </tr>
              </thead>
              <tbody>
                {names.map((name) => (
                  <tr key={name} className="border-t border-line">
                    <td className="py-1.5 pr-4">{name}</td>
                    {(["buy", "sell"] as const).map((side) => (
                      <td key={side} className="px-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${name} ${side === "buy" ? "long" : "short"}`}
                          checked={seen(name, side)}
                          onChange={(e) => toggleSeen(name, side, e.target.checked)}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-2">
            Add your setups to the <Link href="/playbook" className="underline">Playbook</Link> to tick them here, or add one below.
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={section.noSetup} onChange={(e) => patch({ noSetup: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
            {NO_CLEAN_SETUP}
          </label>
          <span className="flex items-center gap-1.5">
            <input
              value={newSetup}
              onChange={(e) => setNewSetup(e.target.value)}
              placeholder="Another setup"
              aria-label="Another setup"
              maxLength={80}
              className={`${inputStyles} w-44 py-1.5`}
            />
            <Button
              type="button"
              variant="secondary"
              className="py-1.5"
              onClick={() => {
                if (newSetup.trim()) setExtra((x) => [...x, newSetup.trim()]);
                setNewSetup("");
              }}
            >
              Add
            </Button>
          </span>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold text-ink-2">Trade of the session</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={section.noTrade} onChange={(e) => patch({ noTrade: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
          No trade presented this session
        </label>
        {!section.noTrade && (
          <>
            {plays.map((p, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-line p-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="Time it presented">
                    <input type="time" value={p.presentedAt ?? ""} onChange={(e) => patchPlay(i, { presentedAt: e.target.value })} className={inputStyles} />
                  </Field>
                  <Field label="Setup">
                    <input list="eod-setups" value={p.setup ?? ""} onChange={(e) => patchPlay(i, { setup: e.target.value })} maxLength={80} className={inputStyles} />
                  </Field>
                  <Field label="Direction">
                    <select value={p.side} onChange={(e) => patchPlay(i, { side: e.target.value as EodPlay["side"] })} className={inputStyles}>
                      <option value="buy">Long</option>
                      <option value="sell">Short</option>
                    </select>
                  </Field>
                  <Field label="Outcome">
                    <select value={p.outcome} onChange={(e) => patchPlay(i, { outcome: e.target.value as EodPlay["outcome"] })} className={inputStyles}>
                      {PLAY_OUTCOMES.map((o) => <option key={o} value={o}>{PLAY_OUTCOME_LABELS[o]}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="The trade" hint="Entry, stop, target, result">
                  <textarea rows={2} value={p.detail ?? ""} onChange={(e) => patchPlay(i, { detail: e.target.value })} className={inputStyles} />
                </Field>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="TradingView link" className="min-w-0 flex-1">
                    <input type="url" placeholder="https://www.tradingview.com/x/…" value={p.chartUrl ?? ""} onChange={(e) => patchPlay(i, { chartUrl: e.target.value })} className={inputStyles} />
                  </Field>
                  {plays.length > 1 && (
                    <Button type="button" variant="ghost" onClick={() => patch({ plays: plays.filter((_, j) => j !== i) })}>Remove</Button>
                  )}
                </div>
              </div>
            ))}
            <datalist id="eod-setups">{names.map((s) => <option key={s} value={s} />)}</datalist>
            <Button type="button" variant="secondary" onClick={() => patch({ plays: [...plays, emptyPlay(setups[0] ?? null)] })}>Add another play</Button>
          </>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What I did">
          <textarea rows={3} value={section.did ?? ""} onChange={(e) => patch({ did: e.target.value })} className={inputStyles} />
        </Field>
        <Field label="What I should have done">
          <textarea rows={3} value={section.shouldHave ?? ""} onChange={(e) => patch({ shouldHave: e.target.value })} className={inputStyles} />
        </Field>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink-2">Charts</h3>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-lg border border-dashed border-line px-4 py-6 text-sm text-ink-2 hover:bg-surface-2"
        >
          Paste a screenshot anywhere on this step (Ctrl+V), or click to choose a file. Add as many as you need.
        </button>
        <input
          ref={fileRef}
          type="file"
          aria-label={`Add a ${market} chart screenshot`}
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onUpload(file);
            e.target.value = "";
          }}
        />
        {section.images.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {section.images.map((img, i) => (
              <figure key={img.id} className="space-y-1">
                <a href={img.url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                  <img src={img.url} alt={`${market} chart ${i + 1}`} className="w-full rounded-lg border border-line" />
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteEodChart(img.id);
                    patch({ images: section.images.filter((x) => x.id !== img.id) });
                  }}
                  className="text-xs text-muted hover:text-loss-ink"
                >
                  Remove
                </button>
              </figure>
            ))}
          </div>
        )}
        <Field label="TradingView link for the session">
          <input type="url" placeholder="https://www.tradingview.com/x/…" value={section.chartUrl ?? ""} onChange={(e) => patch({ chartUrl: e.target.value })} className={inputStyles} />
        </Field>
      </div>
    </div>
  );
}
