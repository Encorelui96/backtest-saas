import { ImageResponse } from "next/og";
import { num, pct } from "@/lib/client/format";
import { sharedSummary } from "@/lib/server/shares";

export const alt = "Résultat d'un backtest réalisé avec Backtest Lab";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLORS = { bg: "#0b0e14", panel: "#121722", line: "#263042", fg: "#e6ebf3", muted: "#8a97ab", accent: "#3b82f6", up: "#22c55e", down: "#ef4444" };

/** The card shown when a shared report link is pasted in Discord, X or a messaging app. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const s = await sharedSummary((await params).id);
  const ret = s?.summary.totalReturnPercent ?? 0;
  const stats = s
    ? [
        { label: "Trades", value: String(s.summary.trades) },
        { label: "Baisse max", value: pct(-s.summary.maxDrawdownPercent) },
        { label: "Gagnants", value: pct(s.summary.winRate, 0, false) },
        { label: "Profit factor", value: num(s.summary.profitFactor) },
      ]
    : [];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: COLORS.bg, color: COLORS.fg, padding: 64, fontSize: 32 }}>
        <div style={{ display: "flex", fontSize: 36, fontWeight: 700 }}>
          Backtest<span style={{ color: COLORS.accent }}>Lab</span>
        </div>
        {s ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 48, fontWeight: 700 }}>{s.name}</div>
            <div style={{ display: "flex", marginTop: 8, color: COLORS.muted }}>
              {s.symbol} · {s.interval} · du {s.startDate} au {s.endDate}
            </div>
            <div style={{ display: "flex", marginTop: 24, fontSize: 120, fontWeight: 700, color: ret > 0 ? COLORS.up : COLORS.down }}>{pct(ret)}</div>
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>Rapport introuvable</div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 20 }}>
            {stats.map((x) => (
              <div key={x.label} style={{ display: "flex", flexDirection: "column", background: COLORS.panel, border: `2px solid ${COLORS.line}`, borderRadius: 16, padding: "14px 22px" }}>
                <div style={{ display: "flex", fontSize: 22, color: COLORS.muted }}>{x.label}</div>
                <div style={{ display: "flex", fontSize: 36, fontWeight: 700 }}>{x.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: COLORS.muted }}>Données passées, aucun gain promis</div>
        </div>
      </div>
    ),
    size,
  );
}
