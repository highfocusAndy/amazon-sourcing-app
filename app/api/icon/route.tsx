import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 200,
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 1,
              letterSpacing: "-12px",
              fontFamily: "sans-serif",
            }}
          >
            HF
          </div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 700,
              color: "#2dd4bf",
              letterSpacing: "14px",
              fontFamily: "sans-serif",
              textTransform: "uppercase",
              marginLeft: "14px",
            }}
          >
            HIGH FOCUS
          </div>
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
