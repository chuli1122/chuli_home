import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Maximize2, Upload } from "lucide-react";
import { apiFetch } from "../../utils/api";
import { saveImage, loadImageUrl } from "../../utils/db";
import Modal from "../../components/Modal";

export default function AssistantEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("basic"); // 'basic' | 'about'
  const [saving, setSaving] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const fileInputRef = useRef(null);
  const promptFileRef = useRef(null);

  // Basic settings
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarKey, setAvatarKey] = useState(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [chatPresetId, setChatPresetId] = useState(null);
  const [summaryPresetId, setSummaryPresetId] = useState(null);
  const [summaryFallbackId, setSummaryFallbackId] = useState(null);
  const [presets, setPresets] = useState([]);

  // About us
  const [humanBlock, setHumanBlock] = useState("");
  const [personaBlock, setPersonaBlock] = useState("");
  const [humanBlockId, setHumanBlockId] = useState(null);
  const [personaBlockId, setPersonaBlockId] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load assistant
        const data = await apiFetch("/api/assistants");
        const assistant = (data.assistants || []).find(
          (a) => a.id === Number(id)
        );
        if (assistant) {
          setName(assistant.name || "");
          setAvatarKey(assistant.avatar_url || null);
          if (assistant.avatar_url) {
            const url = await loadImageUrl(assistant.avatar_url);
            if (url) setAvatarUrl(url);
          }
        }

        // Load full assistant details via a dedicated fetch
        try {
          // The GET list doesn't have all fields, try to get system_prompt etc
          // We'll load from the assistants list for now and supplement with core-blocks
          // For system_prompt, model_preset_id etc we need the full object
          // Let's try GET /api/assistants which returns basic info, and supplement
        } catch {}

        // Load presets
        try {
          const presetsData = await apiFetch("/api/presets");
          setPresets(presetsData.presets || []);
        } catch {}

        // Load core blocks
        try {
          const blocksData = await apiFetch(
            `/api/core-blocks?assistant_id=${id}`
          );
          const blocks = blocksData.blocks || [];
          const human = blocks.find((b) => b.block_type === "human");
          const persona = blocks.find((b) => b.block_type === "persona");
          if (human) {
            setHumanBlock(human.content || "");
            setHumanBlockId(human.id);
          }
          if (persona) {
            setPersonaBlock(persona.content || "");
            setPersonaBlockId(persona.id);
          }
        } catch {}
      } catch (e) {
        console.error("Failed to load assistant data", e);
      }
    };
    loadData();
  }, [id]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const key = `assistant-avatar-${id}-${Date.now()}`;
      await saveImage(key, file);
      const url = await loadImageUrl(key);
      setAvatarUrl(url);
      setAvatarKey(key);
    } catch (e) {
      console.error("Failed to save avatar", e);
    }
  };

  const handlePromptFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSystemPrompt(ev.target.result);
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save assistant basic info
      const body = { name };
      if (avatarKey) body.avatar_url = avatarKey;
      if (systemPrompt !== undefined) body.system_prompt = systemPrompt;
      if (chatPresetId) body.model_preset_id = chatPresetId;
      if (summaryPresetId) body.summary_model_preset_id = summaryPresetId;
      if (summaryFallbackId)
        body.summary_fallback_preset_id = summaryFallbackId;
      await apiFetch(`/api/assistants/${id}`, {
        method: "PUT",
        body,
      });

      // Save core blocks
      if (humanBlockId) {
        await apiFetch(`/api/core-blocks/${humanBlockId}`, {
          method: "PUT",
          body: { content: humanBlock },
        });
      }
      if (personaBlockId) {
        await apiFetch(`/api/core-blocks/${personaBlockId}`, {
          method: "PUT",
          body: { content: personaBlock },
        });
      }
    } catch (e) {
      console.error("Failed to save", e);
    }
    setSaving(false);
  };

  const PresetSelect = ({ value, onChange, label }) => (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-400">{label}</label>
        {value && (
          <button
            onClick={() => onChange(null)}
            className="text-[10px] text-gray-400 active:text-gray-600"
          >
            重置
          </button>
        )}
      </div>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none bg-white"
      >
        <option value="">未选择</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-[var(--app-bg)]">
      {/* Header */}
      <div className="flex items-center px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2">
        <button
          onClick={() => navigate(-1)}
          className="mr-3 rounded-full p-1.5 active:bg-black/5"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-semibold truncate">{name || "编辑助手"}</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200/60 px-4">
        <button
          onClick={() => setTab("basic")}
          className={`px-4 py-2 text-sm border-b-2 ${
            tab === "basic"
              ? "border-black font-medium"
              : "border-transparent text-gray-400"
          }`}
        >
          基础设置
        </button>
        <button
          onClick={() => setTab("about")}
          className={`px-4 py-2 text-sm border-b-2 ${
            tab === "about"
              ? "border-black font-medium"
              : "border-transparent text-gray-400"
          }`}
        >
          关于我们
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-32">
        {tab === "basic" && (
          <>
            {/* Avatar + Name */}
            <div className="flex items-center gap-4 py-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gray-100 overflow-hidden active:opacity-80"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xl text-gray-400">
                    {name ? name[0] : "?"}
                  </span>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </button>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="助手名称"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
            </div>

            {/* System Prompt */}
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400">System Prompt</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPromptModal(true)}
                    className="rounded p-1 active:bg-gray-100"
                  >
                    <Maximize2 size={14} className="text-gray-400" />
                  </button>
                  <button
                    onClick={() => promptFileRef.current?.click()}
                    className="rounded p-1 active:bg-gray-100"
                  >
                    <Upload size={14} className="text-gray-400" />
                  </button>
                  <input
                    ref={promptFileRef}
                    type="file"
                    accept=".txt,.md"
                    className="hidden"
                    onChange={handlePromptFile}
                  />
                </div>
              </div>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="输入 System Prompt..."
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none"
                style={{ height: 200 }}
              />
            </div>

            {/* Presets */}
            <PresetSelect
              value={chatPresetId}
              onChange={setChatPresetId}
              label="聊天模型"
            />
            <PresetSelect
              value={summaryPresetId}
              onChange={setSummaryPresetId}
              label="摘要模型"
            />
            <PresetSelect
              value={summaryFallbackId}
              onChange={setSummaryFallbackId}
              label="摘要备选模型"
            />
          </>
        )}

        {tab === "about" && (
          <>
            <div className="mt-4">
              <label className="text-xs text-gray-400">
                关于我（AI 视角）
              </label>
              <textarea
                value={humanBlock}
                onChange={(e) => setHumanBlock(e.target.value)}
                placeholder="描述你自己，让 AI 了解你..."
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none"
                rows={6}
              />
            </div>
            <div className="mt-4">
              <label className="text-xs text-gray-400">关于我们的默契</label>
              <textarea
                value={personaBlock}
                onChange={(e) => setPersonaBlock(e.target.value)}
                placeholder="描述你们之间的默契..."
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none"
                rows={6}
              />
            </div>
          </>
        )}
      </div>

      {/* Bottom buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-gray-100 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-[420px] gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm active:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-black py-2.5 text-sm text-white active:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {/* Fullscreen prompt editor */}
      <Modal
        isOpen={showPromptModal}
        onClose={() => setShowPromptModal(false)}
        title="System Prompt"
        showButtons={false}
      >
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none"
          style={{ height: "60vh" }}
        />
      </Modal>
    </div>
  );
}
