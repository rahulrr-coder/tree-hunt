"use client";
import { useEffect, useState } from "react";
import { useUser } from "@/components/UserProvider";
import { api } from "@/lib/api";
import { KIND_FILTERS, type KindFilter } from "@/lib/categories";

type Row = { nickname: string; totalFinds: number; uniquePlants: number; currentStreak: number };

export default function Board() {
  const { user } = useUser();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");

  useEffect(() => {
    let stale = false;
    api<{ rows: Row[] }>(`/api/leaderboard?kind=${kind}`).then(
      (d) => !stale && (setRows(d.rows), setError("")),
      (e: Error) => !stale && setError(e.message),
    );
    return () => {
      stale = true;
    };
  }, [kind]);

  return (
    <div className="px-4 pb-10 pt-5">
      <h1 className="font-serif text-2xl font-semibold">Leaderboard</h1>
      <p className="text-sm text-muted">Ranked by different plants found, then total finds.</p>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Plant categories">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={kind === f.id}
            onClick={() => setKind(f.id)}
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold ${
              kind === f.id ? "border-leaf bg-leaf text-white" : "border-line bg-card text-ink"
            }`}
          >
            {f.id !== "all" && <span className="size-2.5 rounded-full" style={{ background: f.color }} aria-hidden />}
            {f.label}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mt-4 rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3 text-clay">{error}</p>}
      {rows?.length === 0 && (
        <p className="mt-8 text-center text-lg text-muted">
          {kind === "all" ? "No finds yet. Be the first." : "Nobody has found one in this category yet. Be the first."}
        </p>
      )}

      {rows && rows.length > 0 && (
        <table className="mt-4 w-full overflow-hidden rounded-2xl border border-line bg-card text-left">
          <thead className="bg-paper text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-2 pl-3 pr-1">#</th>
              <th className="py-2">Player</th>
              <th className="py-2 text-right">Finds</th>
              <th className="py-2 text-right">Plants</th>
              <th className="py-2 pl-2 pr-3 text-right">Streak</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const me = user?.nickname.toLowerCase() === r.nickname.toLowerCase();
              return (
                <tr key={r.nickname} className={`border-t border-line ${me ? "bg-leaf/10 font-semibold" : ""}`}>
                  <td className="py-3 pl-3 pr-1 font-serif">{i + 1}</td>
                  <td className="max-w-[9rem] truncate py-3">{r.nickname}{me && " (you)"}</td>
                  <td className="py-3 text-right tabular-nums">{r.totalFinds}</td>
                  <td className="py-3 text-right tabular-nums">{r.uniquePlants}</td>
                  <td className="py-3 pl-2 pr-3 text-right tabular-nums">
                    {r.currentStreak}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
