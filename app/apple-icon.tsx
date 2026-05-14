import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          borderRadius: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 1,
              letterSpacing: "-4px",
              fontFamily: "sans-serif",
            }}
          >
            HF
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#2dd4bf",
              letterSpacing: "5px",
              fontFamily: "sans-serif",
              textTransform: "uppercase",
              marginLeft: "5px",
            }}
          >
            HIGH FOCUS
          </div>
        </div>
      </div>
    ),
    { width: 180, height: 180 }
  );
}
