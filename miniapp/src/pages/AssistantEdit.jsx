import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronDown, Plus, X, Check, Globe } from "lucide-react";
import { apiFetch } from "../utils/api";

const S = {
  bg: "var(--bg)",
  accent: "var(--accent)",
  accentDark: "var(--accent-dark)",
  text: "var(--text)",
  textMuted: "var(--text-muted)",
};

// ── Small helpers ──

function NmTextarea({ label, value, onChange, placeholder, rows }) {
  return (
    <div className="mb-4">
      {label && (
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: S.textMuted }}>
          {label}
        </label>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows || 6}
        className="w-full rounded-[14px] px-4 py-3 text-[14px] resize-none outline-none"
        style={{ boxShadow: "var(--inset-shadow)", background: S.bg, color: S.text }}
      />
    </div>
  );
}

function NmInput({ label, value, onChange, placeholder }) {
  return (
    <div className="mb-4">
      {label && (
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: S.textMuted }}>
          {label}
        </label>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[14px] px-4 py-3 text-[14px] outline-none"
        style={{ boxShadow: "var(--inset-shadow)", background: S.bg, color: S.text }}
      />
    </div>
  );
}

function PresetSelect({ label, value, onChange, presets }) {
  const [open, setOpen] = useState(false);
  const selected = presets.find((p) => p.id === value);

  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: S.textMuted }}>
        {label}
      </label>
      <div className="relative">
        <button
          className="flex w-full items-center justify-between rounded-[14px] px-4 py-3 text-[14px] text-left"
          style={{ boxShadow: "var(--inset-shadow)", background: S.bg, color: S.text }}
          onClick={() => setOpen(!open)}
        >
          <span style={{ color: selected ? S.text : S.textMuted }}>
            {selected ? selected.name : "未选择"}
          </span>
          <ChevronDown size={16} style={{ color: S.textMuted, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </button>
        {open && (
          <div
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[200px] overflow-y-auto rounded-[14px]"
            style={{ background: S.bg, boxShadow: "var(--card-shadow)", zIndex: 40 }}
          >
            <button
              className="flex w-full items-center px-4 py-3 text-[14px]"
              style={{ color: S.textMuted }}
              onClick={() => { onChange(null); setOpen(false); }}
            >
              不使用
            </button>
            {presets.map((p) => (
              <button
                key={p.id}
                className="flex w-full items-center justify-between px-4 py-3 text-[14px]"
                style={{ color: S.text }}
                onClick={() => { onChange(p.id); setOpen(false); }}
              >
                <span>{p.name}</span>
                {p.id === value && <Check size={14} style={{ color: S.accentDark }} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── World Book Mount Tab ──

function WorldBookMountTab({ ruleSetIds, onChange, allBooks }) {
  const mounted = ruleSetIds || [];

  const toggle = (bookId) => {
    if (mounted.includes(bookId)) {
      onChange(mounted.filter((id) => id !== bookId));
    } else {
      onChange([...mounted, bookId]);
    }
  };

  return (
    <div>
      <p className="mb-4 text-[12px]" style={{ color: S.textMuted }}>
        勾选要挂载到此助手的世界书
      </p>
      {allBooks.length === 0 ? (
        <div className="py-8 text-center text-[13px]" style={{ color: S.textMuted }}>
          还没有世界书
        </div>
      ) : (
        <div className="space-y-3">
          {allBooks.map((book) => {
            const isOn = mounted.includes(book.id);
            return (
              <button
                key={book.id}
                className="flex w-full items-center gap-3 rounded-[16px] p-4"
                style={{
                  background: S.bg,
                  boxShadow: isOn ? "var(--inset-shadow)" : "var(--card-shadow-sm)",
                }}
                onClick={() => toggle(book.id)}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: isOn ? S.accentDark : S.bg,
                    boxShadow: isOn ? "none" : "var(--icon-inset)",
                  }}
                >
                  {isOn ? (
                    <Check size={14} color="white" />
                  ) : (
                    <Globe size={14} style={{ color: S.textMuted }} />
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="truncate text-[14px] font-semibold" style={{ color: isOn ? S.accentDark : S.text }}>
                    {book.name}
                  </div>
                  {book.folder && (
                    <div className="text-[11px]" style={{ color: S.textMuted }}>
                      {book.folder}
                    </div>
                  )}
                </div>
                <span
                  className="text-[10px] font-semibold rounded-full px-2 py-0.5"
                  style={{
                    background: isOn ? "rgba(201,98,138,0.15)" : "rgba(136,136,160,0.1)",
                    color: isOn ? S.accentDark : S.textMuted,
                  }}
                >
                  {book.activation === "always" ? "常驻" : book.activation === "keyword" ? "关键词" : "禁用"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ──

export default function AssistantEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id;

  const [tab, setTab] = useState("basic");
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [chatPresetId, setChatPresetId] = useState(null);
  const [summaryPresetId, setSummaryPresetId] = useState(null);
  const [summaryFallbackId, setSummaryFallbackId] = useState(null);
  const [humanBlock, setHumanBlock] = useState("");
  const [personaBlock, setPersonaBlock] = useState("");
  const [humanBlockId, setHumanBlockId] = useState(null);
  const [personaBlockId, setPersonaBlockId] = useState(null);
  const [ruleSetIds, setRuleSetIds] = useState([]);

  const [presets, setPresets] = useState([]);
  const [allBooks, setAllBooks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const fileInputRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    const loadAll = async () => {
      const [presetsData, booksData] = await Promise.all([
        apiFetch("/api/presets").catch(() => ({ presets: [] })),
        apiFetch("/api/world-books").catch(() => ({ world_books: [] })),
      ]);
      setPresets(presetsData.presets || []);
      setAllBooks(booksData.world_books || []);

      if (!isNew) {
        try {
          const [assistantData, blocksData] = await Promise.all([
            apiFetch(`/api/assistants/${id}`),
            apiFetch(`/api/core-blocks?assistant_id=${id}`).catch(() => ({ blocks: [] })),
          ]);
          setName(assistantData.name || "");
          setAvatarUrl(assistantData.avatar_url || "");
          setSystemPrompt(assistantData.system_prompt || "");
          setChatPresetId(assistantData.model_preset_id || null);
          setSummaryPresetId(assistantData.summary_model_preset_id || null);
          setSummaryFallbackId(assistantData.summary_fallback_preset_id || null);
          setRuleSetIds(assistantData.rule_set_ids || []);

          for (const block of (blocksData.blocks || [])) {
            if (block.block_type === "human") {
              setHumanBlock(block.content || "");
              setHumanBlockId(block.id);
            } else if (block.block_type === "persona") {
              setPersonaBlock(block.content || "");
              setPersonaBlockId(block.id);
            }
          }
        } catch (e) {
          showToast("加载失败: " + e.message);
        }
      }
    };
    loadAll();
  }, [id, isNew]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const token = localStorage.getItem("whisper_token");
      const res = await fetch("https://chat.chuli.win/api/upload-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error("上传失败");
      const data = await res.json();
      setAvatarUrl(data.url);
    } catch {
      showToast("头像上传失败");
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { showToast("请输入名称"); return; }
    setSaving(true);
    try {
      const updateBody = {
        name: name.trim(),
        avatar_url: avatarUrl || null,
        system_prompt: systemPrompt,
        model_preset_id: chatPresetId,
        summary_model_preset_id: summaryPresetId,
        summary_fallback_preset_id: summaryFallbackId,
        rule_set_ids: ruleSetIds,
      };

      let assistantId = id;
      if (isNew) {
        // POST only accepts name, then PUT to set all fields
        const created = await apiFetch("/api/assistants", { method: "POST", body: { name: name.trim() } });
        assistantId = created.id;
        await apiFetch(`/api/assistants/${assistantId}`, { method: "PUT", body: updateBody });
      } else {
        await apiFetch(`/api/assistants/${id}`, { method: "PUT", body: updateBody });
      }

      // Save core blocks
      const blockSaves = [];
      if (humanBlockId) {
        blockSaves.push(apiFetch(`/api/core-blocks/${humanBlockId}`, { method: "PUT", body: { content: humanBlock } }));
      }
      if (personaBlockId) {
        blockSaves.push(apiFetch(`/api/core-blocks/${personaBlockId}`, { method: "PUT", body: { content: personaBlock } }));
      }
      await Promise.all(blockSaves);

      showToast("已保存");
      setTimeout(() => navigate("/assistants"), 500);
    } catch (e) {
      showToast("保存失败: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { key: "basic", label: "基础" },
    { key: "about", label: "关于我们" },
    { key: "books", label: "世界书" },
  ];

  return (
    <div className="flex h-full flex-col" style={{ background: S.bg }}>
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-5 pb-3"
        style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
      >
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
          onClick={() => navigate("/assistants")}
        >
          <ChevronLeft size={22} style={{ color: S.text }} />
        </button>
        <h1 className="text-[17px] font-bold" style={{ color: S.text }}>
          {isNew ? "新建助手" : "助手配置"}
        </h1>
        <button
          className="rounded-full px-4 py-2 text-[13px] font-bold text-white"
          style={{
            background: saving ? "rgba(201,98,138,0.5)" : "linear-gradient(135deg, var(--accent), var(--accent-dark))",
            boxShadow: "3px 3px 8px rgba(201,98,138,0.3)",
          }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "保存中" : "保存"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 gap-1 px-5 pb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            className="flex-1 rounded-[12px] py-2.5 text-[13px] font-semibold transition-all"
            style={{
              background: tab === t.key ? S.bg : "transparent",
              boxShadow: tab === t.key ? "var(--card-shadow-sm)" : "none",
              color: tab === t.key ? S.accentDark : S.textMuted,
            }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-10">
        {tab === "basic" && (
          <>
            {/* Avatar + Name */}
            <div
              className="mb-4 flex items-center gap-4 rounded-[20px] p-4"
              style={{ background: S.bg, boxShadow: "var(--card-shadow)" }}
            >
              <button
                className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full"
                style={{ boxShadow: "var(--card-shadow-sm)", background: S.bg }}
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[24px]" style={{ color: S.accentDark }}>
                    {name?.[0] || "?"}
                  </span>
                )}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: S.textMuted }}>
                  名称
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="助手名称"
                  className="w-full rounded-[12px] px-4 py-2.5 text-[15px] font-bold outline-none"
                  style={{ boxShadow: "var(--inset-shadow)", background: S.bg, color: S.text }}
                />
              </div>
            </div>

            {/* System Prompt */}
            <div
              className="mb-4 rounded-[20px] p-4"
              style={{ background: S.bg, boxShadow: "var(--card-shadow)" }}
            >
              <NmTextarea
                label="系统提示词"
                value={systemPrompt}
                onChange={setSystemPrompt}
                placeholder="输入系统提示词..."
                rows={8}
              />
            </div>

            {/* Model Presets */}
            <div
              className="rounded-[20px] p-4"
              style={{ background: S.bg, boxShadow: "var(--card-shadow)" }}
            >
              <PresetSelect label="聊天模型" value={chatPresetId} onChange={setChatPresetId} presets={presets} />
              <PresetSelect label="摘要模型" value={summaryPresetId} onChange={setSummaryPresetId} presets={presets} />
              <PresetSelect label="摘要备选模型" value={summaryFallbackId} onChange={setSummaryFallbackId} presets={presets} />
            </div>
          </>
        )}

        {tab === "about" && (
          <>
            <div
              className="mb-4 rounded-[20px] p-4"
              style={{ background: S.bg, boxShadow: "var(--card-shadow)" }}
            >
              <NmTextarea
                label="关于我（AI 视角）"
                value={humanBlock}
                onChange={setHumanBlock}
                placeholder="描述你自己，让 AI 了解你..."
                rows={7}
              />
            </div>
            <div
              className="rounded-[20px] p-4"
              style={{ background: S.bg, boxShadow: "var(--card-shadow)" }}
            >
              <NmTextarea
                label="关于我们的默契"
                value={personaBlock}
                onChange={setPersonaBlock}
                placeholder="描述你们之间的默契..."
                rows={7}
              />
            </div>
          </>
        )}

        {tab === "books" && (
          <div
            className="rounded-[20px] p-4"
            style={{ background: S.bg, boxShadow: "var(--card-shadow)" }}
          >
            <WorldBookMountTab
              ruleSetIds={ruleSetIds}
              onChange={setRuleSetIds}
              allBooks={allBooks}
            />
          </div>
        )}
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
