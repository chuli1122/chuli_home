import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronDown,
  Plus,
  Trash2,
  Pencil,
  Eye,
  EyeOff,
  RefreshCw,
  Loader2,
  Save,
  Copy,
} from "lucide-react";
import Modal from "../components/Modal";
import ConfirmModal from "../components/ConfirmModal";
import { apiFetch } from "../utils/api";

// ── Helpers ──

function domainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ── Number Field (no slider) ──

function NumberField({ label, hint, value, onChange, min, max, step }) {
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
    n = parseFloat(n.toFixed(4));
    setInputVal(String(n));
    onChange(n);
  };

  return (
    <div className="flex items-center justify-between">
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
        className="w-20 rounded-lg bg-[#F5F5F5] px-3 py-2 text-center text-sm font-bold outline-none"
      />
    </div>
  );
}

// ── Anthropic preset models ──

const ANTHROPIC_MODELS = [
  "claude-opus-4-6",
  "claude-opus-4-5-20250129",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5-20250514",
  "claude-haiku-4-5-20251001",
];

// ── Model Selector Dropdown ──

function ModelSelector({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => options.length > 0 && setOpen(!open)}
        className="flex w-full items-center justify-between rounded-xl bg-[#F5F5F5] px-4 py-3 text-left text-[14px] outline-none"
      >
        <span className={value ? "text-black" : "text-gray-400"}>
          {value || "请先拉取模型列表"}
        </span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && options.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[200px] overflow-y-auto rounded-xl bg-white shadow-lg border border-gray-100">
          {options.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { onChange(m); setOpen(false); }}
              className={`flex w-full px-4 py-2.5 text-left text-[14px] transition-colors ${
                m === value ? "bg-[#F5F5F5] font-medium text-black" : "text-gray-700 active:bg-[#F5F5F5]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Anthropic Model Combo (manual input + preset dropdown) ──

function AnthropicModelInput({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        placeholder="输入或选择模型名称"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 pr-10 text-[14px] text-black outline-none placeholder:text-gray-400"
      />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
      >
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[200px] overflow-y-auto rounded-xl bg-white shadow-lg border border-gray-100">
          {ANTHROPIC_MODELS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { onChange(m); setOpen(false); }}
              className={`flex w-full px-4 py-2.5 text-left text-[14px] transition-colors ${
                m === value ? "bg-[#F5F5F5] font-medium text-black" : "text-gray-700 active:bg-[#F5F5F5]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

export default function ApiSettings() {
  const navigate = useNavigate();

  // Data
  const [providers, setProviders] = useState([]);
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [authType, setAuthType] = useState("api_key");
  const [showKey, setShowKey] = useState(false);
  const [modelName, setModelName] = useState("");
  const [modelOptions, setModelOptions] = useState([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [temperature, setTemperature] = useState(1.0);
  const [tempEnabled, setTempEnabled] = useState(false);
  const [topP, setTopP] = useState(1.0);
  const [topPEnabled, setTopPEnabled] = useState(false);
  const [maxTokens, setMaxTokens] = useState(4096);

  // Editing
  const [editingPreset, setEditingPreset] = useState(null);

  // UI
  const [toast, setToast] = useState({ show: false, message: "", success: false });
  const [testingConnection, setTestingConnection] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [saveAsNew, setSaveAsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { preset, x, y }
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);

  // Refs to always read latest form values in async callbacks
  const formRef = useRef({});
  formRef.current = { baseUrl, apiKey, authType, modelName, temperature, tempEnabled, topP, topPEnabled, maxTokens, editingPreset, providers };

  const showToast = useCallback((message, success = false) => {
    setToast({ show: true, message, success });
    setTimeout(() => setToast({ show: false, message: "", success: false }), 2000);
  }, []);

  // ── Load data ──

  const fetchAll = useCallback(async () => {
    try {
      console.log("[ApiSettings] Fetching providers and presets...");
      const [provRes, presRes] = await Promise.all([
        apiFetch("/api/providers"),
        apiFetch("/api/presets"),
      ]);
      console.log("[ApiSettings] Loaded providers:", provRes.providers);
      console.log("[ApiSettings] Loaded presets:", presRes.presets);
      setProviders(provRes.providers);
      setPresets(presRes.presets);
      return { providers: provRes.providers, presets: presRes.presets };
    } catch (e) {
      console.error("[ApiSettings] fetchAll failed:", e);
      showToast("加载失败: " + e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Load preset into form ──

  const loadPreset = (preset) => {
    setEditingPreset(preset);
    setModelName(preset.model_name);
    setTempEnabled(preset.temperature != null);
    setTemperature(preset.temperature ?? 1.0);
    setTopPEnabled(preset.top_p != null);
    setTopP(preset.top_p ?? 1.0);
    setMaxTokens(preset.max_tokens);

    const provider = providers.find((p) => p.id === preset.api_provider_id);
    if (provider) {
      setBaseUrl(provider.base_url);
      setApiKey(provider.api_key);
      setAuthType(provider.auth_type || "api_key");
    }
  };

  const resetForm = () => {
    setEditingPreset(null);
    setBaseUrl("");
    setApiKey("");
    setAuthType("api_key");
    setModelName("");
    setTemperature(1.0);
    setTempEnabled(false);
    setTopP(1.0);
    setTopPEnabled(false);
    setMaxTokens(4096);
    setModelOptions([]);
  };

  // ── Fetch models from provider ──

  const handleFetchModels = async () => {
    if (!baseUrl.trim() || !apiKey.trim()) {
      showToast("请先填写 API 地址和 Key");
      return;
    }
    setFetchingModels(true);
    try {
      const token = apiKey.trim();
      const url = baseUrl.trim().replace(/\/+$/, "");
      const res = await fetch(`${url}/models`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models = (data.data || []).map((m) => m.id).sort();
      setModelOptions(models);
      showToast(models.length > 0 ? `获取到 ${models.length} 个模型` : "未找到模型");
    } catch (e) {
      showToast("拉取失败: " + e.message);
    } finally {
      setFetchingModels(false);
    }
  };

  // ── Test connection ──

  const handleTestConnection = async () => {
    if (!baseUrl.trim() || !apiKey.trim() || !modelName.trim()) {
      showToast("请先填写 API 地址、Key 和模型名称");
      return;
    }
    setTestingConnection(true);
    try {
      const url = baseUrl.trim().replace(/\/+$/, "");
      const reqHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`,
      };
      if (authType === "oauth_token") {
        reqHeaders["anthropic-beta"] = "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14";
        reqHeaders["anthropic-dangerous-direct-browser-access"] = "true";
        reqHeaders["x-app"] = "cli";
      }
      const res = await fetch(`${url}/chat/completions`, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({
          model: modelName.trim(),
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || err.message || `HTTP ${res.status}`);
      }
      showToast("连接成功", true);
    } catch (e) {
      showToast("连接失败: " + e.message);
    } finally {
      setTestingConnection(false);
    }
  };

  // ── Save logic ──

  const resolveProvider = async (currentProviders) => {
    const url = formRef.current.baseUrl.trim();
    const key = formRef.current.apiKey.trim();
    const at = formRef.current.authType;
    const existing = currentProviders.find((p) => p.base_url === url);
    if (existing) {
      if (existing.api_key !== key || existing.auth_type !== at) {
        await apiFetch(`/api/providers/${existing.id}`, { method: "PUT", body: { api_key: key, auth_type: at } });
      }
      return existing.id;
    }
    const res = await apiFetch("/api/providers", {
      method: "POST",
      body: { name: domainFromUrl(url), base_url: url, api_key: key, auth_type: at },
    });
    return res.id;
  };

  const doSave = async (name, asNew) => {
    const f = formRef.current;
    console.log("[ApiSettings] doSave called:", { name, asNew, baseUrl: f.baseUrl, apiKey: f.apiKey?.slice(0,8)+"...", modelName: f.modelName });
    if (!f.baseUrl.trim() || !f.apiKey.trim() || !f.modelName.trim()) {
      showToast("请填写完整信息");
      return;
    }
    setSaving(true);
    try {
      const providerId = await resolveProvider(f.providers);
      console.log("[ApiSettings] Resolved provider ID:", providerId);
      const body = {
        name,
        model_name: f.modelName.trim(),
        temperature: f.tempEnabled ? f.temperature : null,
        top_p: f.topPEnabled ? f.topP : null,
        max_tokens: Number(f.maxTokens) || 4096,
        api_provider_id: providerId,
      };
      console.log("[ApiSettings] Saving preset body:", body);

      if (f.editingPreset && !asNew) {
        await apiFetch(`/api/presets/${f.editingPreset.id}`, { method: "PUT", body });
        showToast("预设已更新");
      } else {
        await apiFetch("/api/presets", { method: "POST", body });
        showToast("预设已保存");
      }
      await fetchAll();
    } catch (e) {
      console.error("[ApiSettings] doSave failed:", e);
      showToast("保存失败: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const openNameModal = (asNew) => {
    setSaveAsNew(asNew);
    setPresetName("");
    setNameModalOpen(true);
  };

  const handleNameConfirm = () => {
    const name = presetName.trim();
    if (!name) return;
    setNameModalOpen(false);
    doSave(name, saveAsNew);
  };

  const handleSaveEdit = () => {
    if (editingPreset) {
      doSave(editingPreset.name, false);
    }
  };

  // ── Delete ──

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/presets/${deleteTarget.id}`, { method: "DELETE" });
      showToast("已删除");
      if (editingPreset?.id === deleteTarget.id) resetForm();
      fetchAll();
    } catch (e) {
      showToast("删除失败: " + e.message);
    }
    setDeleteTarget(null);
  };

  // ── Long press ──

  const handlePointerDown = (e, preset) => {
    longPressTriggered.current = false;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setContextMenu({ preset, x: clientX, y: clientY });
    }, 500);
  };

  const handlePointerUp = () => {
    clearTimeout(longPressTimer.current);
  };

  const handlePointerMove = () => {
    clearTimeout(longPressTimer.current);
  };

  // ── Rename ──

  const openRename = (preset) => {
    setContextMenu(null);
    setRenameTarget(preset);
    setRenameValue(preset.name);
  };

  const confirmRename = async () => {
    const name = renameValue.trim();
    if (!name || !renameTarget) return;
    try {
      await apiFetch(`/api/presets/${renameTarget.id}`, { method: "PUT", body: { name } });
      showToast("已重命名");
      fetchAll();
    } catch (e) {
      showToast("重命名失败: " + e.message);
    }
    setRenameTarget(null);
  };

  // ── Render ──

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
        <h1 className="text-lg font-bold">API 设置</h1>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-24 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* ── Card 1: Connection ── */}
            <div className="rounded-[24px] bg-white p-5 shadow-sm space-y-4">
              <span className="text-[14px] font-medium text-black">API 地址</span>
              <input
                type="text"
                placeholder="https://api.openai.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                disabled={authType === "oauth_token"}
                className={`w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-[14px] text-black outline-none placeholder:text-gray-400 ${authType === "oauth_token" ? "opacity-40 cursor-not-allowed" : ""}`}
              />
              <span className="text-[14px] font-medium text-black">API Key</span>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  placeholder={authType === "oauth_token" ? "sk-ant-oat01-..." : "sk-..."}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 pr-12 text-[14px] text-black outline-none placeholder:text-gray-400"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 active:scale-95"
                >
                  {showKey ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-black">认证方式</span>
                <div className="flex rounded-xl bg-[#F5F5F5] p-0.5">
                  <button
                    type="button"
                    onClick={() => setAuthType("api_key")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      authType === "api_key" ? "bg-white text-black shadow-sm" : "text-gray-400"
                    }`}
                  >
                    标准 API Key
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthType("oauth_token");
                      setBaseUrl("https://api.anthropic.com/v1");
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      authType === "oauth_token" ? "bg-white text-black shadow-sm" : "text-gray-400"
                    }`}
                  >
                    Setup Token
                  </button>
                </div>
              </div>
            </div>

            {/* ── Card 2: Model Selection ── */}
            <div className="rounded-[24px] bg-white p-5 shadow-sm space-y-4">
              <span className="text-[14px] font-medium text-black">模型名称</span>
              {authType === "oauth_token" ? (
                <AnthropicModelInput value={modelName} onChange={setModelName} />
              ) : (
                <ModelSelector value={modelName} onChange={setModelName} options={modelOptions} />
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#F5F5F5] py-3 text-[14px] font-medium text-gray-600 transition active:scale-[0.98] disabled:opacity-50"
                >
                  {testingConnection ? <Loader2 size={16} className="animate-spin" /> : <span className="text-[13px]">⚡</span>}
                  测试连接
                </button>
                <button
                  onClick={handleFetchModels}
                  disabled={fetchingModels || authType === "oauth_token"}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#F5F5F5] py-3 text-[14px] font-medium text-gray-600 transition active:scale-[0.98] disabled:opacity-50"
                >
                  {fetchingModels ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  拉取模型列表
                </button>
              </div>
            </div>

            {/* ── Card 3: Parameters ── */}
            <div className="rounded-[24px] bg-white p-5 shadow-sm space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[14px] font-medium text-black">温度 (0-2)</span>
                    <p className="text-[11px] text-gray-400 mt-0.5">越低越稳定精准，越高越有创造性和随机性</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTempEnabled(!tempEnabled)}
                    className={`relative h-7 w-12 rounded-full transition-colors ${tempEnabled ? "bg-black" : "bg-gray-200"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${tempEnabled ? "translate-x-5" : ""}`} />
                  </button>
                </div>
                {tempEnabled && (
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[13px] text-gray-500">值</span>
                    <input
                      type="number"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                      onBlur={() => {
                        let v = Math.max(0, Math.min(2, temperature));
                        v = Math.round(v / 0.1) * 0.1;
                        setTemperature(parseFloat(v.toFixed(1)));
                      }}
                      step={0.1}
                      min={0}
                      max={2}
                      className="w-20 rounded-lg bg-[#F5F5F5] px-3 py-2 text-center text-sm font-bold outline-none"
                    />
                  </div>
                )}
              </div>
              <div className="h-[1px] bg-gray-100" />
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-black">Top P (0-1)</span>
                  <button
                    type="button"
                    onClick={() => setTopPEnabled(!topPEnabled)}
                    className={`relative h-7 w-12 rounded-full transition-colors ${topPEnabled ? "bg-black" : "bg-gray-200"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${topPEnabled ? "translate-x-5" : ""}`} />
                  </button>
                </div>
                {topPEnabled && (
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[13px] text-gray-500">值</span>
                    <input
                      type="number"
                      value={topP}
                      onChange={(e) => setTopP(parseFloat(e.target.value) || 0)}
                      onBlur={() => {
                        let v = Math.max(0, Math.min(1, topP));
                        v = Math.round(v / 0.05) * 0.05;
                        setTopP(parseFloat(v.toFixed(2)));
                      }}
                      step={0.05}
                      min={0}
                      max={1}
                      className="w-20 rounded-lg bg-[#F5F5F5] px-3 py-2 text-center text-sm font-bold outline-none"
                    />
                  </div>
                )}
              </div>
              <div className="h-[1px] bg-gray-100" />
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-black">Max Tokens</span>
                <input
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
                  className="w-20 rounded-lg bg-[#F5F5F5] px-3 py-2 text-center text-sm font-bold outline-none"
                />
              </div>
            </div>

            {/* ── Card 4: Save Buttons ── */}
            <div className="space-y-3">
              {editingPreset ? (
                <div className="flex gap-3">
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 rounded-full bg-black py-3.5 text-[15px] font-bold text-white shadow-lg shadow-black/20 transition active:scale-95 disabled:opacity-50"
                  >
                    <Save size={16} />
                    {saving ? "保存中..." : "保存修改"}
                  </button>
                  <button
                    onClick={() => openNameModal(true)}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 rounded-full bg-[#F5F5F5] py-3.5 text-[15px] font-bold text-gray-700 transition active:scale-95 disabled:opacity-50"
                  >
                    <Copy size={16} />
                    另存为
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => openNameModal(true)}
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-black py-3.5 text-[15px] font-bold text-white shadow-lg shadow-black/20 transition active:scale-95 disabled:opacity-50"
                >
                  <Plus size={16} />
                  保存为预设
                </button>
              )}
              {editingPreset && (
                <button
                  onClick={resetForm}
                  className="w-full text-center text-[13px] text-gray-400 py-1 active:text-gray-600"
                >
                  取消编辑，清空表单
                </button>
              )}
            </div>

            {/* ── Card 5: Preset List ── */}
            <div>
              <h2 className="mb-3 text-[15px] font-bold text-gray-800">已保存的预设</h2>
              {presets.length === 0 ? (
                <div className="rounded-[24px] bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
                  暂无预设
                </div>
              ) : (
                <div className="space-y-3">
                  {presets.map((p) => {
                    const isActive = editingPreset?.id === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => { if (!longPressTriggered.current) loadPreset(p); }}
                        onTouchStart={(e) => handlePointerDown(e, p)}
                        onTouchEnd={handlePointerUp}
                        onTouchMove={handlePointerMove}
                        onMouseDown={(e) => handlePointerDown(e, p)}
                        onMouseUp={handlePointerUp}
                        onMouseLeave={handlePointerUp}
                        onContextMenu={(e) => e.preventDefault()}
                        className={`relative cursor-pointer select-none rounded-[24px] bg-white p-5 shadow-sm transition-all active:scale-[0.98] ${
                          isActive ? "ring-2 ring-black" : ""
                        }`}
                      >
                        <div className="text-[15px] font-bold truncate">{p.name}</div>
                        <div className="mt-1 text-xs text-gray-400 truncate">{p.model_name}</div>
                        <div className="mt-1.5 text-[11px] text-gray-400 font-mono">
                          T: {p.temperature ?? "默认"} | Top-P: {p.top_p ?? "默认"} | Max: {p.max_tokens}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Name Modal */}
      <Modal
        isOpen={nameModalOpen}
        onClose={() => setNameModalOpen(false)}
        title="预设名称"
        onConfirm={handleNameConfirm}
        confirmText="保存"
        isConfirmDisabled={!presetName.trim() || saving}
      >
        <input
          type="text"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          placeholder="如：日常聊天、写作模式"
          className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-[15px] text-black outline-none placeholder:text-gray-400"
        />
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="删除提醒"
        message={deleteTarget ? `确定要删除"${deleteTarget.name}"吗？` : ""}
        confirmText="删除"
      />

      {/* Context Menu */}
      {contextMenu && (
        <div className="fixed inset-0 z-[150]" onClick={() => setContextMenu(null)}>
          <div
            className="absolute w-44 rounded-2xl bg-white shadow-2xl shadow-black/15 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 192),
              top: Math.min(contextMenu.y, window.innerHeight - 120),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => openRename(contextMenu.preset)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-[14px] text-black active:bg-[#F5F5F5] transition-colors"
            >
              <Pencil size={16} className="text-gray-400" />
              修改名称
            </button>
            <div className="mx-4 h-[0.5px] bg-gray-100" />
            <button
              onClick={() => { setDeleteTarget(contextMenu.preset); setContextMenu(null); }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-[14px] text-red-500 active:bg-red-50 transition-colors"
            >
              <Trash2 size={16} />
              删除
            </button>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      <Modal
        isOpen={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        title="修改名称"
        onConfirm={confirmRename}
        confirmText="保存"
        isConfirmDisabled={!renameValue.trim()}
      >
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder="输入新名称"
          autoFocus
          className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-[15px] text-black outline-none placeholder:text-gray-400"
        />
      </Modal>

      {/* Toast */}
      {toast.show && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] animate-in fade-in zoom-in duration-200">
          <div className={`backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-lg font-medium text-sm ${toast.success ? "bg-green-500/90" : "bg-black/80"}`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
