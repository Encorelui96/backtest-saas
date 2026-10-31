import { ImageResponse } from "next/og";

export const alt = "Backtest Lab : teste ta stratégie de trading avant d'y mettre ton argent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// A fixed rising series: the same picture at every build.
const CANDLES = [40, 46, 43, 52, 49, 58, 55, 63, 60, 71, 67, 76, 73, 84, 80, 91, 88, 99, 95, 108];

/** The card shown when the site's address is pasted in Discord, X, LinkedIn or a messaging app. */
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b0e14", color: "#e6ebf3", padding: 64 }}>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 700 }}>
          Backtest<span style={{ color: "#3b82f6" }}>Lab</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>Teste ta stratégie de trading</div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.1, color: "#3b82f6" }}>avant d&apos;y mettre ton argent</div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 30, color: "#8a97ab" }}>Crypto, forex, or et Nasdaq · tes règles en français · robustesse et prop firm</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 130 }}>
          {CANDLES.map((h, i) => {
            const up = i === 0 || h >= CANDLES[i - 1];
            return <div key={i} style={{ display: "flex", width: 34, height: h, borderRadius: 4, background: up ? "#22c55e" : "#ef4444" }} />;
          })}
        </div>
      </div>
    ),
    size,
  );
}
