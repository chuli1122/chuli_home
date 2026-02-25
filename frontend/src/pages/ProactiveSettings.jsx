import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { apiFetch } from "../utils/api";

// ── Toggle ──

function Toggle({ value, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      className={`relative h-7 w-12 rounded-full transition-colors duration-200 ease-in-out ${
        disabled ? "opacity-40 cursor-not-allowed" : ""
      } ${value ? "bg-black" : "bg-gray-200"}`}
    >
      <span
        className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white transition-transform duration-200 ease-in-out ${
          value ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── NumberField ──

function NumberField({ label, hint, value, onChange, min, max, step = 1, disabled }) {
  const [inputVal, setInputVal] = useState(String(value));

  useEffect(() => {
    setInputVal(String(value));
  }, [value]);

  const commit = () => {
    let n = parseFloat(inputVal);
    if (isNaN(n)) n = min;
    if (n > max) n = max;
    if (n < min) n = min;
    n = Math.round(n / step) * step;
    n = parseFloat(n.toFixed(step < 1 ? 1 : 0));
    setInputVal(String(n));
    onChange(n);
  };

  return (
    <div className={`flex items-center justify-between ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <div>
        <span className="text-[14px] font-medium text-black">{label}</span>
        {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
      </div>
      <input
        type="number"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        className="w-20 rounded-lg bg-[#F5F5F5] px-3 py-2 text-center text-sm font-bold outline-none disabled:cursor-not-allowed"
      />
    </div>
  );
}

// ── Main Page ──

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
  const [toast, setToast] = useState({ show: false, message: "" });
  const saveTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 2000);
  }, []);

  // Load settings on mount
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

  // Auto-save with debounce
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
    <div className="flex h-full flex-col bg-[#F5F5F7] text-black">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pb-4 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <button
          onClick={() => navigate("/settings", { replace: true })}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm active:scale-95 transition"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-lg font-bold">主动发消息</h1>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-24 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
          </div>
        ) : (
          <>
            {/* Card: Main toggle + intervals */}
            <div className="rounded-[24px] bg-white p-5 shadow-sm space-y-5">
              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium">总开关</span>
                <Toggle
                  value={settings.enabled}
                  onChange={(v) => saveField({ enabled: v })}
                />
              </div>

              <div className="h-[1px] bg-gray-100" />

              {/* Interval */}
              <NumberField
                label="轮询间隔 (分钟)"
                hint="每隔多久检查一次"
                value={settings.interval}
                onChange={(v) => saveField({ interval: v })}
                min={10}
                max={60}
                disabled={disabled}
              />

              {/* Min gap */}
              <NumberField
                label="触发间隔 (分钟)"
                hint="距离上次消息多久开始考虑"
                value={settings.min_gap}
                onChange={(v) => saveField({ min_gap: v })}
                min={15}
                max={120}
                disabled={disabled}
              />
            </div>

            {/* Card: Retry settings */}
            <div className="rounded-[24px] bg-white p-5 shadow-sm space-y-5">
              {/* Retry toggle */}
              <div className={`flex items-center justify-between ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
                <div>
                  <span className="text-[15px] font-medium">追发</span>
                  <p className="text-[11px] text-gray-400 mt-0.5">关闭 = 不追发，只发一次</p>
                </div>
                <Toggle
                  value={settings.retry_enabled}
                  onChange={(v) => saveField({ retry_enabled: v })}
                  disabled={disabled}
                />
              </div>

              <div className="h-[1px] bg-gray-100" />

              {/* Retry gap */}
              <NumberField
                label="追发间隔 (小时)"
                value={settings.retry_gap}
                onChange={(v) => saveField({ retry_gap: v })}
                min={0.5}
                max={4.0}
                step={0.1}
                disabled={disabled || !settings.retry_enabled}
              />

              {/* Max retries */}
              <NumberField
                label="最大追发次数"
                value={settings.max_retries}
                onChange={(v) => saveField({ max_retries: v })}
                min={1}
                max={15}
                disabled={disabled || !settings.retry_enabled}
              />
            </div>

            {/* Card: Voice settings */}
            <div className="rounded-[24px] bg-white p-5 shadow-sm space-y-5">
              {/* Voice toggle */}
              <div className={`flex items-center justify-between ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
                <span className="text-[15px] font-medium">语音消息</span>
                <Toggle
                  value={settings.voice_enabled}
                  onChange={(v) => saveField({ voice_enabled: v })}
                  disabled={disabled}
                />
              </div>

              <div className="h-[1px] bg-gray-100" />

              {/* Voice chance */}
              <NumberField
                label="语音概率 (%)"
                value={settings.voice_chance}
                onChange={(v) => saveField({ voice_chance: v })}
                min={0}
                max={100}
                disabled={disabled || !settings.voice_enabled}
              />
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast.show && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] animate-in fade-in zoom-in duration-200">
          <div className="bg-black/80 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-lg font-medium text-sm">
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
