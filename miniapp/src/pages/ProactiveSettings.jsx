import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { apiFetch } from "../utils/api";

const S = {
  bg: "var(--bg)",
  accent: "var(--accent)",
  accentDark: "var(--accent-dark)",
  text: "var(--text)",
  textMuted: "var(--text-muted)",
};

function Toggle({ on, onToggle, disabled }) {
  return (
    <button
      onClick={() => !disabled && onToggle()}
      className="relative flex h-7 w-12 shrink-0 items-center rounded-full"
      style={{
        boxShadow: "var(--inset-shadow)",
        background: on ? "var(--accent)" : S.bg,
        transition: "background 0.2s",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
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

function NumberField({ label, hint, value, onChange, min, max, step = 1, disabled }) {
  const [val, setVal] = useState(String(value));

  useEffect(() => setVal(String(value)), [value]);

  const commit = () => {
    let n = parseFloat(val);
    if (isNaN(n)) n = min;
    n = Math.max(min, Math.min(max, n));
    n = Math.round(n / step) * step;
    n = parseFloat(n.toFixed(step < 1 ? 1 : 0));
    setVal(String(n));
    onChange(n);
  };

  return (
    <div
      className="flex items-center justify-between"
      style={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : "auto" }}
    >
      <div>
        <div className="text-[14px] font-semibold" style={{ color: S.text }}>{label}</div>
        {hint && <div className="text-[11px]" style={{ color: S.textMuted }}>{hint}</div>}
      </div>
      <input
        type="number"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        className="w-20 rounded-[10px] py-2 text-center text-[13px] font-bold outline-none"
        style={{ boxShadow: "var(--inset-shadow)", background: S.bg, color: S.text }}
      />
    </div>
  );
}

function Card({ children }) {
  return (
    <div
      className="rounded-[20px] p-5 mb-4 space-y-4"
      style={{ background: S.bg, boxShadow: "var(--card-shadow)" }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-px" style={{ background: "rgba(136,136,160,0.15)" }} />;
}

export default function ProactiveSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    enabled: false,
    interval: 30,
    min_gap: 30,
    retry_enabled: true,
    retry_gap: 1.5,
    max_retries: 8,
    voice_enabled: false,
    voice_chance: 30,
  });
  const [toast, setToast] = useState(null);
  const saveTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch("/api/settings/proactive");
        setSettings(data);
      } catch (e) {
        showToast("加载失败: " + e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  const saveField = useCallback(
    (patch) => {
      setSettings((prev) => ({ ...prev, ...patch }));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await apiFetch("/api/settings/proactive", {
            method: "PUT",
            body: patch,
          });
        } catch (e) {
          showToast("保存失败: " + e.message);
        }
      }, 300);
    },
    [showToast]
  );

  const disabled = !settings.enabled;

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
          onClick={() => navigate("/settings", { replace: true })}
        >
          <ChevronLeft size={22} style={{ color: S.text }} />
        </button>
        <h1 className="text-[17px] font-bold" style={{ color: S.text }}>
          主动发消息
        </h1>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-10 pt-px">
        {loading ? (
          <div className="flex justify-center py-20">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2"
              style={{ borderColor: S.accent, borderTopColor: "transparent" }}
            />
          </div>
        ) : (
          <>
            {/* Main toggle + intervals */}
            <Card>
              <div className="flex items-center justify-between">
                <div className="text-[15px] font-semibold" style={{ color: S.text }}>
                  总开关
                </div>
                <Toggle on={settings.enabled} onToggle={() => saveField({ enabled: !settings.enabled })} />
              </div>

              <Divider />

              <NumberField
                label="轮询间隔 (分钟)"
                hint="每隔多久检查一次"
                value={settings.interval}
                onChange={(v) => saveField({ interval: v })}
                min={10}
                max={60}
                disabled={disabled}
              />

              <NumberField
                label="触发间隔 (分钟)"
                hint="距离上次消息多久开始考虑"
                value={settings.min_gap}
                onChange={(v) => saveField({ min_gap: v })}
                min={15}
                max={120}
                disabled={disabled}
              />
            </Card>

            {/* Retry settings */}
            <Card>
              <div
                className="flex items-center justify-between"
                style={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : "auto" }}
              >
                <div>
                  <div className="text-[15px] font-semibold" style={{ color: S.text }}>追发</div>
                  <div className="text-[11px]" style={{ color: S.textMuted }}>关闭 = 不追发，只发一次</div>
                </div>
                <Toggle
                  on={settings.retry_enabled}
                  onToggle={() => saveField({ retry_enabled: !settings.retry_enabled })}
                  disabled={disabled}
                />
              </div>

              <Divider />

              <NumberField
                label="追发间隔 (小时)"
                value={settings.retry_gap}
                onChange={(v) => saveField({ retry_gap: v })}
                min={0.5}
                max={4.0}
                step={0.1}
                disabled={disabled || !settings.retry_enabled}
              />

              <NumberField
                label="最大追发次数"
                value={settings.max_retries}
                onChange={(v) => saveField({ max_retries: v })}
                min={1}
                max={15}
                disabled={disabled || !settings.retry_enabled}
              />
            </Card>

            {/* Voice settings */}
            <Card>
              <div
                className="flex items-center justify-between"
                style={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : "auto" }}
              >
                <div className="text-[15px] font-semibold" style={{ color: S.text }}>语音消息</div>
                <Toggle
                  on={settings.voice_enabled}
                  onToggle={() => saveField({ voice_enabled: !settings.voice_enabled })}
                  disabled={disabled}
                />
              </div>

              <Divider />

              <NumberField
                label="语音概率 (%)"
                value={settings.voice_chance}
                onChange={(v) => saveField({ voice_chance: v })}
                min={0}
                max={100}
                disabled={disabled || !settings.voice_enabled}
              />
            </Card>
          </>
        )}
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-1/2 z-[200] flex justify-center">
          <div
            className="rounded-2xl px-6 py-3 text-[14px] font-medium text-white"
            style={{ background: "rgba(0,0,0,0.75)" }}
          >
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
