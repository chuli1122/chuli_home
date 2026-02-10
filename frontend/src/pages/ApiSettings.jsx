import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronDown,
  Plus,
  Trash2,
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

// ── Slider Field ──

function SliderField({ label, hint, value, onChange, min, max, step }) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(String(value));

  useEffect(() => {
    if (!editing) setInputVal(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    let n = parseFloat(inputVal);
    if (isNaN(n)) n = min;
    n = Math.max(min, Math.min(max, n));
    n = Math.round(n / step) * step;
    n = parseFloat(n.toFixed(4));
    onChange(n);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[14px] font-medium text-black">{label}</span>
          {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
        </div>
        {editing ? (
          <input
            type="number"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            autoFocus
            step={step}
            min={min}
            max={max}
            className="w-16 rounded-lg bg-[#F5F5F5] px-2 py-1 text-center text-sm font-bold outline-none"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-sm font-bold text-black tabular-nums active:opacity-60"
          >
            {value}
          </button>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-2 w-full accent-black"
      />
    </div>
  );
}

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
  const [showKey, setShowKey] = useState(false);
  const [modelName, setModelName] = useState("");
  const [modelOptions, setModelOptions] = useState([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [temperature, setTemperature] = useState(1.0);
  const [topP, setTopP] = useState(1.0);
  const [maxTokens, setMaxTokens] = useState(4096);

  // Editing
  const [editingPreset, setEditingPreset] = useState(null);

  // UI
  const [toast, setToast] = useState({ show: false, message: "" });
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [saveAsNew, setSaveAsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  // Refs to always read latest form values in async callbacks
  const formRef = useRef({});
  formRef.current = { baseUrl, apiKey, modelName, temperature, topP, maxTokens, editingPreset, providers };

  const showToast = useCallback((message) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 2000);
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
    setTemperature(preset.temperature);
    setTopP(preset.top_p);
    setMaxTokens(preset.max_tokens);

    const provider = providers.find((p) => p.id === preset.api_provider_id);
    if (provider) {
      setBaseUrl(provider.base_url);
      setApiKey(provider.api_key);
    }
  };

  const resetForm = () => {
    setEditingPreset(null);
    setBaseUrl("");
    setApiKey("");
    setModelName("");
    setTemperature(1.0);
    setTopP(1.0);
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

  // ── Save logic ──

  const resolveProvider = async (currentProviders) => {
    const url = formRef.current.baseUrl.trim();
    const key = formRef.current.apiKey.trim();
    const existing = currentProviders.find((p) => p.base_url === url);
    if (existing) {
      if (existing.api_key !== key) {
        await apiFetch(`/api/providers/${existing.id}`, { method: "PUT", body: { api_key: key } });
      }
      return existing.id;
    }
    const res = await apiFetch("/api/providers", {
      method: "POST",
      body: { name: domainFromUrl(url), base_url: url, api_key: key },
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
        temperature: f.temperature,
        top_p: f.topP,
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
                className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-[14px] text-black outline-none placeholder:text-gray-400"
              />
              <span className="text-[14px] font-medium text-black">API Key</span>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  placeholder="sk-..."
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
            </div>

            {/* ── Card 2: Model Selection ── */}
            <div className="rounded-[24px] bg-white p-5 shadow-sm space-y-4">
              <span className="text-[14px] font-medium text-black">模型名称</span>
              <ModelSelector
                value={modelName}
                onChange={setModelName}
                options={modelOptions}
              />
              <button
                onClick={handleFetchModels}
                disabled={fetchingModels}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F5F5F5] py-3 text-[14px] font-medium text-gray-600 transition active:scale-[0.98] disabled:opacity-50"
              >
                {fetchingModels ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                拉取模型列表
              </button>
            </div>

            {/* ── Card 3: Parameters ── */}
            <div className="rounded-[24px] bg-white p-5 shadow-sm space-y-5">
              <SliderField
                label="温度"
                hint="越低越稳定精准，越高越有创造性和随机性"
                value={temperature}
                onChange={setTemperature}
                min={0}
                max={2}
                step={0.1}
              />
              <div className="h-[1px] bg-gray-100" />
              <SliderField
                label="Top P"
                value={topP}
                onChange={setTopP}
                min={0}
                max={1}
                step={0.05}
              />
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
                        onClick={() => loadPreset(p)}
                        className={`relative cursor-pointer rounded-[24px] bg-white p-5 shadow-sm transition-all active:scale-[0.98] ${
                          isActive ? "ring-2 ring-black" : ""
                        }`}
                      >
                        {/* Delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(p);
                          }}
                          className="absolute right-4 top-4 p-2 text-gray-300 active:text-red-500 transition-colors active:scale-90"
                        >
                          <Trash2 size={16} />
                        </button>

                        <div className="pr-10">
                          <div className="text-[15px] font-bold truncate">{p.name}</div>
                          <div className="mt-1 text-xs text-gray-400 truncate">{p.model_name}</div>
                          <div className="mt-1.5 text-[11px] text-gray-400 font-mono">
                            T: {p.temperature} | Top-P: {p.top_p} | Max: {p.max_tokens}
                          </div>
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
