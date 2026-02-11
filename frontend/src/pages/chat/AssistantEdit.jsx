import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Maximize2, FileText, History, Check } from "lucide-react";
import { apiFetch } from "../../utils/api";
import { saveImage, loadImageUrl, deleteImage } from "../../utils/db";
import Modal from "../../components/Modal";

export default function AssistantEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("basic");
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
  const [humanBlockVersion, setHumanBlockVersion] = useState(0);
  const [personaBlockVersion, setPersonaBlockVersion] = useState(0);

  // Original data for change detection
  const [originalData, setOriginalData] = useState({});

  // History modal
  const [historyBlockType, setHistoryBlockType] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [historySelected, setHistorySelected] = useState("current");
  const [historyDetail, setHistoryDetail] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const assistant = await apiFetch(`/api/assistants/${id}`);
        setName(assistant.name || "");
        setSystemPrompt(assistant.system_prompt || "");
        setChatPresetId(assistant.model_preset_id || null);
        setSummaryPresetId(assistant.summary_model_preset_id || null);
        setSummaryFallbackId(assistant.summary_fallback_preset_id || null);
        setAvatarKey(assistant.avatar_url || null);
        if (assistant.avatar_url) {
          const url = await loadImageUrl(assistant.avatar_url);
          if (url) setAvatarUrl(url);
        }

        let presetsArr = [];
        try {
          const presetsData = await apiFetch("/api/presets");
          presetsArr = presetsData.presets || [];
          setPresets(presetsArr);
        } catch {}

        let hBlock = "", pBlock = "", hId = null, pId = null, hVer = 0, pVer = 0;
        try {
          const blocksData = await apiFetch(`/api/core-blocks?assistant_id=${id}`);
          const blocks = blocksData.blocks || [];
          const human = blocks.find((b) => b.block_type === "human");
          const persona = blocks.find((b) => b.block_type === "persona");
          if (human) { hBlock = human.content || ""; hId = human.id; hVer = human.version; }
          if (persona) { pBlock = persona.content || ""; pId = persona.id; pVer = persona.version; }
        } catch {}

        setHumanBlock(hBlock);
        setHumanBlockId(hId);
        setHumanBlockVersion(hVer);
        setPersonaBlock(pBlock);
        setPersonaBlockId(pId);
        setPersonaBlockVersion(pVer);

        setOriginalData({
          name: assistant.name || "",
          system_prompt: assistant.system_prompt || "",
          chat_preset_id: assistant.model_preset_id || null,
          summary_preset_id: assistant.summary_model_preset_id || null,
          summary_fallback_id: assistant.summary_fallback_preset_id || null,
          human_block: hBlock,
          persona_block: pBlock,
        });
      } catch (e) {
        console.error("Failed to load assistant data", e);
      }
      setLoading(false);
    };
    loadData();
  }, [id]);

  const hasChanges =
    name !== originalData.name ||
    systemPrompt !== originalData.system_prompt ||
    chatPresetId !== originalData.chat_preset_id ||
    summaryPresetId !== originalData.summary_preset_id ||
    summaryFallbackId !== originalData.summary_fallback_id ||
    humanBlock !== originalData.human_block ||
    personaBlock !== originalData.persona_block;

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const key = `assistant-avatar-${id}`;
      await deleteImage(key);
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
    reader.onload = (ev) => setSystemPrompt(ev.target.result);
    reader.readAsText(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = { name };
      if (avatarKey) body.avatar_url = avatarKey;
      body.system_prompt = systemPrompt;
      if (chatPresetId) body.model_preset_id = chatPresetId;
      if (summaryPresetId) body.summary_model_preset_id = summaryPresetId;
      if (summaryFallbackId) body.summary_fallback_preset_id = summaryFallbackId;
      await apiFetch(`/api/assistants/${id}`, { method: "PUT", body });

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

      setOriginalData({
        name,
        system_prompt: systemPrompt,
        chat_preset_id: chatPresetId,
        summary_preset_id: summaryPresetId,
        summary_fallback_id: summaryFallbackId,
        human_block: humanBlock,
        persona_block: personaBlock,
      });
    } catch (e) {
      console.error("Failed to save", e);
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setName(originalData.name || "");
    setSystemPrompt(originalData.system_prompt || "");
    setChatPresetId(originalData.chat_preset_id);
    setSummaryPresetId(originalData.summary_preset_id);
    setSummaryFallbackId(originalData.summary_fallback_id);
    setHumanBlock(originalData.human_block || "");
    setPersonaBlock(originalData.persona_block || "");
  };

  // History
  const openHistory = async (type) => {
    const blockId = type === "human" ? humanBlockId : personaBlockId;
    if (!blockId) return;
    setHistoryBlockType(type);
    setHistorySelected("current");
    setHistoryDetail(null);
    try {
      const data = await apiFetch(`/api/core-blocks/${blockId}/history`);
      setHistoryItems(data.history || []);
    } catch {
      setHistoryItems([]);
    }
  };

  const applyHistory = () => {
    if (historySelected === "current") {
      setHistoryBlockType(null);
      return;
    }
    const item = historyItems.find((h) => h.id === historySelected);
    if (item) {
      if (historyBlockType === "human") setHumanBlock(item.content);
      else setPersonaBlock(item.content);
    }
    setHistoryBlockType(null);
  };

  const formatDate = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const currentHistoryContent =
    historyBlockType === "human" ? humanBlock : personaBlock;

  const PresetRow = ({ value, onChange, label }) => (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs" style={{ color: "var(--chat-text-muted)" }}>{label}</label>
        {value && (
          <button
            onClick={() => onChange(null)}
            className="text-[10px] active:opacity-60"
            style={{ color: "var(--chat-text-muted)" }}
          >
            重置
          </button>
        )}
      </div>
      <select
        value={value || ""}
        onChange={(e) =>
          onChange(e.target.value ? Number(e.target.value) : null)
        }
        className="mt-1 w-full rounded-xl px-4 py-2.5 text-base outline-none"
        style={{ background: "var(--chat-input-bg)", color: "var(--chat-text)" }}
      >
        <option value="">未选择</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}{p.temperature != null ? ` (t=${p.temperature})` : ""}{p.top_p != null ? ` (p=${p.top_p})` : ""}
          </option>
        ))}
      </select>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: "var(--chat-bg)" }}>
        <div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: "var(--chat-accent)", borderTopColor: "var(--chat-accent-dark)" }} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--chat-bg)" }}>
      {/* Header */}
      <div className="flex items-center px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2">
        <button
          onClick={() => navigate("/chat/contacts", { replace: true })}
          className="mr-3 rounded-full p-1.5 active:opacity-60"
        >
          <ArrowLeft size={22} style={{ color: "var(--chat-text)" }} />
        </button>
        <h1 className="text-lg font-semibold truncate" style={{ color: "var(--chat-text)" }}>
          {name || "编辑助手"}
        </h1>
      </div>

      {/* Pill tab selector */}
      <div className="mx-5 mt-1 flex rounded-full p-1" style={{ background: "var(--chat-input-bg)" }}>
        <button
          onClick={() => setTab("basic")}
          className="flex-1 rounded-full py-1.5 text-sm transition"
          style={{
            background: tab === "basic" ? "var(--chat-card-bg)" : "transparent",
            fontWeight: tab === "basic" ? 500 : 400,
            color: tab === "basic" ? "var(--chat-text)" : "var(--chat-text-muted)",
          }}
        >
          基础设置
        </button>
        <button
          onClick={() => setTab("about")}
          className="flex-1 rounded-full py-1.5 text-sm transition"
          style={{
            background: tab === "about" ? "var(--chat-card-bg)" : "transparent",
            fontWeight: tab === "about" ? 500 : 400,
            color: tab === "about" ? "var(--chat-text)" : "var(--chat-text-muted)",
          }}
        >
          关于我们
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-24">
        {tab === "basic" && (
          <>
            {/* Avatar + Name card */}
            <div className="mt-4 rounded-[20px] p-5" style={{ background: "var(--chat-card-bg)" }}>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full overflow-hidden active:opacity-80 transition"
                  style={{ background: "var(--chat-input-bg)" }}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="avatar"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl" style={{ color: "var(--chat-text-muted)" }}>
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
                <div className="flex-1">
                  <label className="text-xs mb-1 block" style={{ color: "var(--chat-text-muted)" }}>
                    名称
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="助手名称"
                    className="w-full rounded-xl px-4 py-2.5 text-base outline-none"
                    style={{ background: "var(--chat-input-bg)", color: "var(--chat-text)" }}
                  />
                </div>
              </div>
            </div>

            {/* System Prompt card */}
            <div className="mt-4 rounded-[20px] p-5" style={{ background: "var(--chat-card-bg)" }}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs" style={{ color: "var(--chat-text-muted)" }}>系统提示词</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPromptModal(true)}
                    className="rounded-full p-1.5 active:opacity-60"
                  >
                    <Maximize2 size={14} style={{ color: "var(--chat-text-muted)" }} />
                  </button>
                  <button
                    onClick={() => promptFileRef.current?.click()}
                    className="flex items-center gap-1 rounded-full px-3 py-1 active:opacity-70"
                    style={{ border: "1px solid var(--chat-accent)" }}
                  >
                    <FileText size={13} style={{ color: "var(--chat-text-muted)" }} />
                    <span className="text-[11px]" style={{ color: "var(--chat-text-muted)" }}>
                      从文件导入
                    </span>
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
                placeholder="输入系统提示词..."
                className="w-full rounded-xl px-4 py-3 text-base outline-none resize-none"
                style={{ background: "var(--chat-input-bg)", color: "var(--chat-text)" }}
                rows={8}
              />
            </div>

            {/* Model Presets card */}
            <div className="mt-4 rounded-[20px] p-5" style={{ background: "var(--chat-card-bg)" }}>
              <PresetRow
                value={chatPresetId}
                onChange={setChatPresetId}
                label="聊天模型"
              />
              <div className="my-3 h-px" style={{ background: "var(--chat-accent)", opacity: 0.2 }} />
              <PresetRow
                value={summaryPresetId}
                onChange={setSummaryPresetId}
                label="摘要模型"
              />
              <div className="my-3 h-px" style={{ background: "var(--chat-accent)", opacity: 0.2 }} />
              <PresetRow
                value={summaryFallbackId}
                onChange={setSummaryFallbackId}
                label="摘要备选模型"
              />
            </div>
          </>
        )}

        {tab === "about" && (
          <>
            {/* Human block card */}
            <div className="mt-4 rounded-[20px] p-5" style={{ background: "var(--chat-card-bg)" }}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs" style={{ color: "var(--chat-text-muted)" }}>
                  关于我（AI 视角）
                </label>
                {humanBlockId && (
                  <button
                    onClick={() => openHistory("human")}
                    className="flex items-center gap-1 rounded-full px-3 py-1 active:opacity-70"
                    style={{ border: "1px solid var(--chat-accent)" }}
                  >
                    <History size={13} style={{ color: "var(--chat-text-muted)" }} />
                    <span className="text-[11px]" style={{ color: "var(--chat-text-muted)" }}>历史版本</span>
                  </button>
                )}
              </div>
              <textarea
                value={humanBlock}
                onChange={(e) => setHumanBlock(e.target.value)}
                placeholder="描述你自己，让 AI 了解你..."
                className="w-full rounded-xl px-4 py-3 text-base outline-none resize-none"
                style={{ background: "var(--chat-input-bg)", color: "var(--chat-text)" }}
                rows={6}
              />
            </div>

            {/* Persona block card */}
            <div className="mt-4 rounded-[20px] p-5" style={{ background: "var(--chat-card-bg)" }}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs" style={{ color: "var(--chat-text-muted)" }}>关于我们的默契</label>
                {personaBlockId && (
                  <button
                    onClick={() => openHistory("persona")}
                    className="flex items-center gap-1 rounded-full px-3 py-1 active:opacity-70"
                    style={{ border: "1px solid var(--chat-accent)" }}
                  >
                    <History size={13} style={{ color: "var(--chat-text-muted)" }} />
                    <span className="text-[11px]" style={{ color: "var(--chat-text-muted)" }}>历史版本</span>
                  </button>
                )}
              </div>
              <textarea
                value={personaBlock}
                onChange={(e) => setPersonaBlock(e.target.value)}
                placeholder="描述你们之间的默契..."
                className="w-full rounded-xl px-4 py-3 text-base outline-none resize-none"
                style={{ background: "var(--chat-input-bg)", color: "var(--chat-text)" }}
                rows={6}
              />
            </div>
          </>
        )}

        {/* Buttons */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={handleCancel}
            disabled={!hasChanges}
            className="flex-1 rounded-[18px] py-3 text-sm font-medium active:scale-[0.98] transition disabled:opacity-40"
            style={{ background: "var(--chat-card-bg)", color: "var(--chat-text)" }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex-1 rounded-[18px] py-3 text-sm font-medium text-white active:scale-[0.98] transition disabled:opacity-40"
            style={{ background: "var(--chat-accent-dark)" }}
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {/* Fullscreen prompt editor */}
      <Modal
        isOpen={showPromptModal}
        onClose={() => setShowPromptModal(false)}
        title="系统提示词"
        fullScreen
        showButtons={false}
      >
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-base outline-none resize-none"
          style={{ background: "var(--chat-input-bg)", color: "var(--chat-text)", minHeight: "calc(100vh - 160px)" }}
          placeholder="输入系统提示词..."
        />
      </Modal>

      {/* History modal */}
      <Modal
        isOpen={historyBlockType !== null}
        onClose={() => {
          if (historyDetail) {
            setHistoryDetail(null);
          } else {
            setHistoryBlockType(null);
          }
        }}
        title={
          historyDetail ? `版本 ${historyDetail.version}` : "历史版本"
        }
        onConfirm={historyDetail ? undefined : applyHistory}
        confirmText="确定"
        showButtons={!historyDetail}
      >
        {historyDetail ? (
          <div className="max-h-[50vh] overflow-y-auto rounded-xl p-4" style={{ background: "var(--chat-input-bg)" }}>
            <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--chat-text)" }}>
              {historyDetail.content}
            </p>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto -mx-2">
            {/* Current version */}
            <div className="flex items-center gap-3 rounded-xl px-3 py-3">
              <button
                onClick={() => setHistorySelected("current")}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition"
                style={{
                  borderColor: historySelected === "current" ? "var(--chat-accent-dark)" : "var(--chat-accent)",
                  background: historySelected === "current" ? "var(--chat-accent-dark)" : "transparent",
                }}
              >
                {historySelected === "current" && (
                  <Check size={12} className="text-white" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: "var(--chat-text)" }}>当前版本</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: "#2a9d5c", background: "#e0f5e8" }}>
                    当前
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs" style={{ color: "var(--chat-text-muted)" }}>
                  {currentHistoryContent}
                </p>
              </div>
            </div>

            {historyItems.length === 0 && (
              <p className="py-4 text-center text-xs" style={{ color: "var(--chat-text-muted)" }}>
                暂无历史版本
              </p>
            )}

            {historyItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl px-3 py-3"
              >
                <button
                  onClick={() => setHistorySelected(item.id)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition"
                  style={{
                    borderColor: historySelected === item.id ? "var(--chat-accent-dark)" : "var(--chat-accent)",
                    background: historySelected === item.id ? "var(--chat-accent-dark)" : "transparent",
                  }}
                >
                  {historySelected === item.id && (
                    <Check size={12} className="text-white" />
                  )}
                </button>
                <div
                  className="flex-1 min-w-0 active:opacity-60"
                  onClick={() => setHistoryDetail(item)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: "var(--chat-text)" }}>
                      版本 {item.version}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--chat-text-muted)" }}>
                      {formatDate(item.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs" style={{ color: "var(--chat-text-muted)" }}>
                    {item.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
