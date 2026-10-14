import { ImageResponse } from "next/og";
import { TAGLINE } from "@/lib/content";

export const alt = `Karaoki: ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #0B0B14 0%, #2a1650 55%, #5b1d4c 100%)",
          color: "#F8FAFC",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 28,
              background: "linear-gradient(135deg, #8B5CF6, #EC4899)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: 28, height: 52, borderRadius: 14, background: "#fff" }} />
          </div>
          <div style={{ fontSize: 84, fontWeight: 700 }}>Karaoki</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 48, color: "#E9D5FF" }}>{TAGLINE}</div>
        <div style={{ marginTop: 24, fontSize: 30, color: "#A1A1B5" }}>
          AI vocal remover and personal karaoke studio
        </div>
      </div>
    ),
    size,
  );
}
