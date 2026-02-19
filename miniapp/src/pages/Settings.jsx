import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Server, Mic2, MessageSquare, Sliders, Database } from "lucide-react";
import { apiFetch } from "../utils/api";

const S = {
  bg: "var(--bg)",
  accent: "var(--accent)",
  accentDark: "var(--accent-dark)",
  text: "var(--text)",
  textMuted: "var(--text-muted)",
};

function Toggle({ on, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="relative flex h-7 w-12 shrink-0 items-center rounded-full transition-all"
      style={{
        boxShadow: "var(--inset-shadow)",
        background: on ? "var(--accent)" : S.bg,
      }}
    >
      <span
        className="absolute h-5 w-5 rounded-full"
        style={{
          left: on ? "calc(100% - 22px)" : "2px",
          background: "white",
          boxShadow: "2px 2px 5px rgba(174,176,182,0.5)",
          transition: "left 0.2s ease",
        }}
      />
    </button>
  );
}

function RowLink({ icon, label, hint, onClick }) {
  return (
    <button
      className="flex w-full items-center gap-4 px-4 py-4"
      onClick={onClick}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ boxShadow: "var(--icon-inset)", background: S.bg }}
      >
        {icon}
      </div>
      <div className="flex-1 text-left">
        <div className="text-[15px] font-semibold" style={{ color: S.text }}>{label}</div>
        {hint && <div className="text-[11px]" style={{ color: S.textMuted }}>{hint}</div>}
      </div>
      <ChevronRight size={16} style={{ color: S.textMuted }} />
    </button>
  );
}

function Divider() {
  return <div className="mx-4 h-px" style={{ background: "rgba(136,136,160,0.15)" }} />;
}

function NumberInput({ value, onChange, min, max }) {
  const [val, setVal] = useState(String(value));

  useEffect(() => setVal(String(value)), [value]);

  const commit = () => {
    let n = parseInt(val);
    if (isNaN(n)) n = min;
    n = Math.max(min, Math.min(max, n));
    setVal(String(n));
    onChange(n);
  };

  return (
    <input
      type="number"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className="w-20 rounded-[10px] py-2 text-center text-[14px] font-bold outline-none"
      style={{ boxShadow: "var(--inset-shadow)", background: S.bg, color: S.text }}
      min={min}
      max={max}
    />
  );
}

export default function Settings() {
  const navigate = useNavigate();

  // localStorage settings
  const [autoMessage, setAutoMessage] = useState(() =>
    JSON.parse(localStorage.getItem("app-settings") || "{}")?.autoMessage || false
  );
  const [intervalMin, setIntervalMin] = useState(() =>
    JSON.parse(localStorage.getItem("app-settings") || "{}")?.autoMessageIntervalMin || 30
  );
  const [intervalMax, setIntervalMax] = useState(() =>
    JSON.parse(localStorage.getItem("app-settings") || "{}")?.autoMessageIntervalMax || 60
  );
  const [bufferMs, setBufferMs] = useState(() =>
    parseInt(localStorage.getItem("streaming_buffer_ms") || "500")
  );

  // API settings
  const [retainBudget, setRetainBudget] = useState(8000);
  const [triggerThreshold, setTriggerThreshold] = useState(16000);
  const [budgetLoaded, setBudgetLoaded] = useState(false);
  const [budgetSaving, setBudgetSaving] = useState(false);

  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  useEffect(() => {
    apiFetch("/api/settings/context-budget")
      .then((d) => {
        setRetainBudget(d.retain_budget);
        setTriggerThreshold(d.trigger_threshold);
        setBudgetLoaded(true);
      })
      .catch(() => setBudgetLoaded(true));
  }, []);

  // Save local settings on change
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("app-settings") || "{}");
    localStorage.setItem("app-settings", JSON.stringify({
      ...saved,
      autoMessage,
      autoMessageIntervalMin: intervalMin,
      autoMessageIntervalMax: intervalMax,
    }));
  }, [autoMessage, intervalMin, intervalMax]);

  useEffect(() => {
    localStorage.setItem("streaming_buffer_ms", String(bufferMs));
  }, [bufferMs]);

  const saveBudget = async () => {
    setBudgetSaving(true);
    try {
      await apiFetch("/api/settings/context-budget", {
        method: "PUT",
        body: { retain_budget: retainBudget, trigger_threshold: triggerThreshold },
      });
      showToast("上下文预算已保存");
    } catch {
      showToast("保存失败");
    } finally {
      setBudgetSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col" style={{ background: S.bg }}>
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-5 pb-4"
        style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
      >
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
          onClick={() => navigate("/")}
        >
          <ChevronLeft size={22} style={{ color: S.text }} />
        </button>
        <h1 className="text-[17px] font-bold" style={{ color: S.text }}>设置</h1>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-10 space-y-4">

        {/* Navigation links */}
        <div
          className="rounded-[20px] overflow-hidden"
          style={{ background: S.bg, boxShadow: "var(--card-shadow)" }}
        >
          <RowLink
            icon={<Server size={18} style={{ color: S.text }} />}
            label="API 设置"
            hint="模型 · 预设"
            onClick={() => navigate("/settings/api")}
          />
          <Divider />
          <RowLink
            icon={<Mic2 size={18} style={{ color: S.textMuted }} />}
            label="克隆音色设置"
            hint="开发中"
            onClick={() => showToast("功能开发中")}
          />
        </div>

        {/* Auto message toggle */}
        <div
          className="rounded-[20px] overflow-hidden"
          style={{ background: S.bg, boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center gap-4 px-4 py-4">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ boxShadow: "var(--icon-inset)", background: S.bg }}
            >
              <MessageSquare size={18} style={{ color: S.text }} />
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-semibold" style={{ color: S.text }}>主动发消息</div>
              <div className="text-[11px]" style={{ color: S.textMuted }}>定时触发 AI 发送消息</div>
            </div>
            <Toggle on={autoMessage} onToggle={() => setAutoMessage(!autoMessage)} />
          </div>
          {autoMessage && (
            <div className="px-4 pb-4">
              <div
                className="flex items-center justify-between rounded-[12px] px-4 py-3"
                style={{ boxShadow: "var(--inset-shadow)", background: S.bg }}
              >
                <span className="text-[12px] font-medium" style={{ color: S.textMuted }}>
                  间隔 (分钟)
                </span>
                <div className="flex items-center gap-2">
                  <NumberInput value={intervalMin} onChange={setIntervalMin} min={1} max={999} />
                  <span style={{ color: S.textMuted }}>~</span>
                  <NumberInput value={intervalMax} onChange={setIntervalMax} min={1} max={999} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Buffer time */}
        <div
          className="rounded-[20px] p-4"
          style={{ background: S.bg, boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center gap-4">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ boxShadow: "var(--icon-inset)", background: S.bg }}
            >
              <Sliders size={18} style={{ color: S.text }} />
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-semibold" style={{ color: S.text }}>流式缓冲时间</div>
              <div className="text-[11px]" style={{ color: S.textMuted }}>流式输出渲染间隔 (ms)</div>
            </div>
            <NumberInput value={bufferMs} onChange={setBufferMs} min={0} max={2000} />
          </div>
        </div>

        {/* Context budget */}
        <div
          className="rounded-[20px] p-4"
          style={{ background: S.bg, boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ boxShadow: "var(--icon-inset)", background: S.bg }}
            >
              <Database size={18} style={{ color: S.text }} />
            </div>
            <div>
              <div className="text-[15px] font-semibold" style={{ color: S.text }}>上下文预算</div>
              <div className="text-[11px]" style={{ color: S.textMuted }}>控制对话历史长度</div>
            </div>
          </div>
          {budgetLoaded ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[13px] font-medium" style={{ color: S.text }}>保留预算 (tokens)</div>
                  <div className="text-[10px]" style={{ color: S.textMuted }}>摘要后保留的最大 token 数</div>
                </div>
                <NumberInput value={retainBudget} onChange={setRetainBudget} min={1000} max={100000} />
              </div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[13px] font-medium" style={{ color: S.text }}>触发阈值 (tokens)</div>
                  <div className="text-[10px]" style={{ color: S.textMuted }}>超过此值时触发摘要</div>
                </div>
                <NumberInput value={triggerThreshold} onChange={setTriggerThreshold} min={1000} max={200000} />
              </div>
              <button
                className="w-full rounded-[14px] py-3 text-[14px] font-bold text-white"
                style={{
                  background: budgetSaving
                    ? "rgba(201,98,138,0.5)"
                    : "linear-gradient(135deg, var(--accent), var(--accent-dark))",
                  boxShadow: "3px 3px 8px rgba(201,98,138,0.3)",
                }}
                onClick={saveBudget}
                disabled={budgetSaving}
              >
                {budgetSaving ? "保存中..." : "保存预算"}
              </button>
            </>
          ) : (
            <div className="flex justify-center py-4">
              <div
                className="h-6 w-6 animate-spin rounded-full border-2"
                style={{ borderColor: S.accent, borderTopColor: "transparent" }}
              />
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-1/2 z-[200] flex justify-center">
          <div className="rounded-2xl px-6 py-3 text-[14px] font-medium text-white" style={{ background: "rgba(0,0,0,0.75)" }}>
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
