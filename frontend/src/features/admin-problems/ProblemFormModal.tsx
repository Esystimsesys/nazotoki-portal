import { useEffect } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import AddIcon from "@mui/icons-material/Add";
import CasinoOutlinedIcon from "@mui/icons-material/CasinoOutlined";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import type { Problem, ProblemInput } from "../../api/types";
import { ApiErrorAlert } from "../../shared/components/ApiErrorAlert";
import { generateUnusedCode } from "../../shared/randomCode";

interface FormPattern {
  code: string;
  judgement: "correct" | "incorrect";
  prize: string;
  note: string;
}

interface FormValues {
  label: string;
  enabled: boolean;
  patterns: FormPattern[];
}

const EMPTY_PATTERN: FormPattern = { code: "", judgement: "correct", prize: "0", note: "" };

function toFormValues(problem: Problem | null): FormValues {
  if (!problem) {
    return { label: "", enabled: false, patterns: [{ ...EMPTY_PATTERN }] };
  }
  return {
    label: problem.label,
    enabled: problem.enabled,
    patterns: problem.patterns.map((p) => ({
      code: p.code,
      judgement: p.isCorrect ? "correct" : "incorrect",
      prize: String(p.prize),
      note: p.note ?? "",
    })),
  };
}

function toProblemInput(values: FormValues): ProblemInput {
  return {
    label: values.label.trim(),
    enabled: values.enabled,
    patterns: values.patterns
      .filter((p) => p.code.trim() !== "")
      .map((p) => ({
        code: p.code.trim().padStart(4, "0"),
        isCorrect: p.judgement === "correct",
        prize: Number(p.prize) || 0,
        note: p.note.trim() || undefined,
      })),
  };
}

interface ProblemFormModalProps {
  open: boolean;
  /** nullなら新規作成、指定ありなら編集（全置換PUT） */
  problem: Problem | null;
  /** 他の問題で既に使われているコード。ランダム生成時にこれらを避けて重複(409)を防ぐ */
  usedCodes: string[];
  submitting: boolean;
  error: unknown;
  onSubmit: (input: ProblemInput) => void;
  onClose: () => void;
}

/** 新規問題／既存問題の編集モーダル。回答パターンは配列全体をPUTで置換する契約のため、ここでまとめて編集する */
export function ProblemFormModal({
  open,
  problem,
  usedCodes,
  submitting,
  error,
  onSubmit,
  onClose,
}: ProblemFormModalProps) {
  const { control, register, handleSubmit, reset, setValue } = useForm<FormValues>({
    defaultValues: toFormValues(problem),
  });
  const { fields, append, remove } = useFieldArray({ control, name: "patterns" });
  const theme = useTheme();

  // フォーム内で入力中のコードも重複回避の対象にするため監視する
  const watchedPatterns = useWatch({ control, name: "patterns" });

  /** 指定行のコード欄に、未使用のランダムな4桁を入れる */
  const fillRandomCode = (index: number) => {
    const inForm = (watchedPatterns ?? [])
      .map((p, i) => (i === index ? "" : (p?.code ?? "").trim()))
      .filter(Boolean);
    const next = generateUnusedCode([...usedCodes, ...inForm]);
    if (next) setValue(`patterns.${index}.code` as const, next, { shouldDirty: true });
  };

  useEffect(() => {
    if (open) reset(toFormValues(problem));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, problem]);

  const submit = (values: FormValues) => onSubmit(toProblemInput(values));

  // スマートフォンでは全画面表示にする。回答パターンは入力欄が多く、
  // 通常のダイアログ幅だと横に潰れて入力内容が読めなくなるため。
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 800 }}>
        {problem ? "問題を編集" : "新規問題を追加"}
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Box component="form" onSubmit={handleSubmit(submit)}>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          <TextField
            label="問題番号 / タイトル"
            placeholder='例: 問題4「星読みの間」'
            fullWidth
            // 編集時は reset() でプログラム的に値が入りMUIが検知できないため、
            // ラベルは常に枠線上に固定して入力値との重なりを防ぐ
            slotProps={{ inputLabel: { shrink: true } }}
            {...register("label", { required: true })}
          />

          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />
                <Typography variant="body2" color="text.secondary">
                  {field.value ? "有効にして保存する" : "無効のまま保存する"}
                </Typography>
              </Stack>
            )}
          />

          <Divider />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              回答パターン（正解1件は必須、不正解パターンは任意で追加）
            </Typography>
            {/*
              回答パターン1件ぶんの入力行。
              スマートフォン(xs)では5つの入力欄を横に並べると各欄が潰れて入力内容が
              読めなくなるため、グリッドで折り返してカード状に積む。
              タブレット以上(sm)では従来どおり1行に収める。
            */}
            <Stack spacing={1.5}>
              {fields.map((field, index) => (
                <Box
                  key={field.id}
                  sx={{
                    display: "grid",
                    gap: 1,
                    alignItems: "start",
                    // コード欄はランダム採番ボタンを内包するぶん他より広くとる
                    gridTemplateColumns: { xs: "1fr 1fr", sm: "140px 110px 110px minmax(0, 1fr) auto" },
                    gridTemplateAreas: {
                      xs: `"code judge" "prize prize" "note note" "del del"`,
                      sm: `"code judge prize note del"`,
                    },
                    p: { xs: 1.5, sm: 0 },
                    border: { xs: "1px solid rgba(168,85,247,0.25)", sm: "none" },
                    borderRadius: { xs: "12px", sm: 0 },
                    background: { xs: "rgba(255,255,255,0.02)", sm: "transparent" },
                  }}
                >
                  <TextField
                    label="4桁コード"
                    size="small"
                    slotProps={{
                      htmlInput: { maxLength: 4, inputMode: "numeric" },
                      // ラベルは常に枠線上に固定する。react-hook-formのregister/setValueで
                      // 値を入れるとMUIが「値あり」を検知できずラベルが枠内に残り、
                      // 入力した数字と重なってしまうため（ランダム採番ボタンで顕著）。
                      inputLabel: { shrink: true },
                      // 未使用のコードをワンタップで割り当てられるようにする
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <Tooltip title="未使用のコードをランダムに割り当てる">
                              <IconButton
                                aria-label="コードをランダム生成"
                                edge="end"
                                size="small"
                                onClick={() => fillRandomCode(index)}
                              >
                                <CasinoOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </InputAdornment>
                        ),
                      },
                    }}
                    sx={{ gridArea: "code", width: "100%" }}
                    {...register(`patterns.${index}.code` as const, { required: true })}
                  />
                  <Controller
                    control={control}
                    name={`patterns.${index}.judgement` as const}
                    render={({ field: judgeField }) => (
                      <TextField
                        select
                        label="判定"
                        size="small"
                        sx={{ gridArea: "judge", width: "100%" }}
                        {...judgeField}
                      >
                        <MenuItem value="correct">正解</MenuItem>
                        <MenuItem value="incorrect">不正解</MenuItem>
                      </TextField>
                    )}
                  />
                  <TextField
                    label="賞金(±円)"
                    size="small"
                    type="number"
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ gridArea: "prize", width: "100%" }}
                    {...register(`patterns.${index}.prize` as const)}
                  />
                  <TextField
                    label="メモ(任意)"
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ gridArea: "note", width: "100%" }}
                    {...register(`patterns.${index}.note` as const)}
                  />
                  {/* スマホではアイコンだけだと押しづらく意味も伝わりにくいので文言つきボタンにする */}
                  <Box
                    sx={{
                      gridArea: "del",
                      display: "flex",
                      justifyContent: { xs: "flex-end", sm: "center" },
                    }}
                  >
                    <Button
                      onClick={() => remove(index)}
                      disabled={fields.length <= 1}
                      color="error"
                      size="small"
                      startIcon={<DeleteOutlineIcon fontSize="small" />}
                      sx={{
                        minWidth: 0,
                        mt: { xs: 0, sm: 0.5 },
                        px: { xs: 1.5, sm: 1 },
                        "& .MuiButton-startIcon": { mr: { xs: 0.5, sm: 0 } },
                      }}
                    >
                      <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                        削除
                      </Box>
                    </Button>
                  </Box>
                </Box>
              ))}
            </Stack>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => append({ ...EMPTY_PATTERN })}
              sx={{ mt: 1.5 }}
              color="inherit"
            >
              パターンを追加
            </Button>
          </Box>

          <Box
            sx={{
              display: "flex",
              gap: 1,
              p: "10px 12px",
              background: "rgba(244,197,66,0.08)",
              border: "1px solid rgba(244,197,66,0.25)",
              borderRadius: "10px",
              fontSize: 11.5,
              color: "#ffe08a",
              lineHeight: 1.6,
            }}
          >
            💡 賞金はマイナス値も設定できます（不正解トラップなど）。有効な他の問題と同じ4桁コードは登録できません（回答がどの問題のものか一意に判定できなくなるため）。
          </Box>

          {error !== null && <ApiErrorAlert error={error} />}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} color="inherit" disabled={submitting}>
            キャンセル
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? "保存中…" : "登録する"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
