import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";

interface KeypadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  disabled?: boolean;
}

const KEY_SX = {
  aspectRatio: "1.35 / 1",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 26,
  fontWeight: 700,
  color: "text.primary",
  background: "linear-gradient(160deg, #241a44, #17102c)",
  border: "1px solid rgba(168,85,247,0.25)",
  borderRadius: "16px",
  transition: "transform 0.08s ease, background 0.15s ease",
  "&:active": {
    transform: "scale(0.93)",
    background: "linear-gradient(160deg, #35245e, #1e1638)",
  },
} as const;

/** 3×4のタップ式テンキー（mockups/participant-mock.html .keypad 相当） */
export function Keypad({ onDigit, onBackspace, onClear, disabled = false }: KeypadProps) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "14px",
        maxWidth: 300,
        mx: "auto",
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
        <ButtonBase key={digit} onClick={() => onDigit(digit)} sx={KEY_SX} aria-label={`数字 ${digit}`}>
          {digit}
        </ButtonBase>
      ))}
      <ButtonBase onClick={onBackspace} sx={{ ...KEY_SX, color: "#ffe08a", fontSize: 18 }} aria-label="1文字削除">
        ⌫
      </ButtonBase>
      <ButtonBase onClick={() => onDigit("0")} sx={KEY_SX} aria-label="数字 0">
        0
      </ButtonBase>
      <ButtonBase onClick={onClear} sx={{ ...KEY_SX, color: "#ffe08a", fontSize: 18 }} aria-label="クリア">
        C
      </ButtonBase>
    </Box>
  );
}
