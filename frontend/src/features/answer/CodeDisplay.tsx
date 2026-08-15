import Box from "@mui/material/Box";

interface CodeDisplayProps {
  code: string;
  length?: number;
  shakeKey: number;
}

/** 4桁コードの入力状況を表示する箱（mockups/participant-mock.html .code-display / .code-box 相当） */
export function CodeDisplay({ code, length = 4, shakeKey }: CodeDisplayProps) {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", gap: "10px", mb: 2.75 }}>
      {Array.from({ length }).map((_, i) => {
        const filled = Boolean(code[i]);
        return (
          <Box
            // shakeKeyが変わるたびにDOMごと再生成してCSSアニメーションを再生させる
            key={`${i}-${shakeKey}`}
            className={shakeKey > 0 ? "nazotoki-shake" : undefined}
            sx={{
              width: 56,
              height: 68,
              borderRadius: "14px",
              background: "#0d0819",
              border: "2px solid",
              borderColor: filled ? "#a855f7" : "rgba(168,85,247,0.35)",
              boxShadow: filled ? "0 0 16px rgba(168,85,247,0.55)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 900,
              color: "#ffe08a",
              transition: "0.15s",
            }}
          >
            {code[i] ?? ""}
          </Box>
        );
      })}
    </Box>
  );
}
