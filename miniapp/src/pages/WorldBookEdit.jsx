import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Save, X, Plus } from "lucide-react";
import { apiFetch } from "../utils/api";

const S = {
  bg: "var(--bg)",
  accent: "var(--accent)",
  accentDark: "var(--accent-dark)",
  text: "var(--text)",
  textMuted: "var(--text-muted)",
};

function NmInput({ label, value, onChange, placeholder, multiline, rows }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: S.textMuted }}>
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows || 5}
          className="w-full rounded-[14px] px-4 py-3 text-[14px] resize-none outline-none nm-input"
          style={{ boxShadow: "var(--inset-shadow)" }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-[14px] px-4 py-3 text-[14px] outline-none nm-input"
          style={{ boxShadow: "var(--inset-shadow)" }}
        />
      )}
    </div>
  );
}

function ActivationSelector({ value, onChange }) {
  const options = [
    { value: "always", label: "常驻" },
    { value: "keyword", label: "关键词" },
    { value: "never", label: "禁用" },
  ];

  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: S.textMuted }}>
        触发方式
      </label>
      <div
        className="flex rounded-[14px] p-1"
        style={{ boxShadow: "var(--inset-shadow)", background: S.bg }}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            className="flex-1 rounded-[10px] py-2 text-[13px] font-semibold transition-all"
            style={{
              background: value === opt.value ? S.bg : "transparent",
              boxShadow: value === opt.value ? "var(--card-shadow-sm)" : "none",
              color: value === opt.value ? S.accentDark : S.textMuted,
            }}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function KeywordTags({ keywords, onChange }) {
  const [input, setInput] = useState("");

  const addKeyword = () => {
    const kw = input.trim();
    if (!kw || keywords.includes(kw)) { setInput(""); return; }
    onChange([...keywords, kw]);
    setInput("");
  };

  const removeKeyword = (kw) => {
    onChange(keywords.filter((k) => k !== kw));
  };

  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: S.textMuted }}>
        关键词
      </label>
      <div
        className="flex flex-wrap gap-2 rounded-[14px] p-3"
        style={{ boxShadow: "var(--inset-shadow)", background: S.bg, minHeight: 48 }}
      >
        {keywords.map((kw) => (
          <span
            key={kw}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium"
            style={{ background: "rgba(232,160,191,0.2)", color: S.accentDark }}
          >
            {kw}
            <button onClick={() => removeKeyword(kw)}>
              <X size={10} />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addKeyword(); } }}
            placeholder="添加关键词..."
            className="w-24 bg-transparent text-[12px] outline-none"
            style={{ color: S.text }}
          />
          {input.trim() && (
            <button
              className="flex h-5 w-5 items-center justify-center rounded-full"
              style={{ background: S.accentDark }}
              onClick={addKeyword}
            >
              <Plus size={10} color="white" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-[10px]" style={{ color: S.textMuted }}>
        按 Enter 或逗号确认
      </p>
    </div>
  );
}

export default function WorldBookEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id;

  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [activation, setActivation] = useState("always");
  const [keywords, setKeywords] = useState([]);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  useEffect(() => {
    if (!isNew) {
      apiFetch("/api/world-books")
        .then((d) => {
          const book = d.world_books?.find((b) => String(b.id) === String(id));
          if (book) {
            setName(book.name);
            setFolder(book.folder || "");
            setActivation(book.activation);
            setKeywords(book.keywords || []);
            setContent(book.content);
          }
        })
        .catch(() => showToast("加载失败"));
    }
  }, [id, isNew]);

  const handleSave = async () => {
    if (!name.trim()) { showToast("请输入名称"); return; }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        folder: folder.trim() || null,
        activation,
        keywords: activation === "keyword" ? keywords : [],
        content,
      };
      if (isNew) {
        await apiFetch("/api/world-books", { method: "POST", body });
        showToast("已创建");
      } else {
        await apiFetch(`/api/world-books/${id}`, { method: "PUT", body });
        showToast("已保存");
      }
      setTimeout(() => navigate("/world-books"), 500);
    } catch (e) {
      showToast("保存失败: " + e.message);
    } finally {
      setSaving(false);
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
          onClick={() => navigate("/world-books")}
        >
          <ChevronLeft size={22} style={{ color: S.text }} />
        </button>
        <h1 className="text-[17px] font-bold" style={{ color: S.text }}>
          {isNew ? "新建世界书" : "编辑世界书"}
        </h1>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{
            background: S.bg,
            boxShadow: saving ? "var(--inset-shadow)" : "var(--card-shadow-sm)",
          }}
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={18} style={{ color: S.accentDark }} />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-5 pb-10">
        <div
          className="rounded-[20px] p-5 mb-4"
          style={{ background: S.bg, boxShadow: "var(--card-shadow)" }}
        >
          <NmInput label="名称" value={name} onChange={setName} placeholder="世界书名称" />
          <NmInput label="文件夹" value={folder} onChange={setFolder} placeholder="可选，如：人物设定" />
          <ActivationSelector value={activation} onChange={setActivation} />
          {activation === "keyword" && (
            <KeywordTags keywords={keywords} onChange={setKeywords} />
          )}
        </div>

        <div
          className="rounded-[20px] p-5"
          style={{ background: S.bg, boxShadow: "var(--card-shadow)" }}
        >
          <NmInput
            label="内容"
            value={content}
            onChange={setContent}
            placeholder="在这里填写世界书内容..."
            multiline
            rows={10}
          />
        </div>

        <button
          className="mt-5 w-full rounded-[18px] py-3.5 text-[15px] font-bold text-white"
          style={{
            background: saving ? "rgba(201,98,138,0.5)" : "linear-gradient(135deg, var(--accent), var(--accent-dark))",
            boxShadow: "4px 4px 10px rgba(201,98,138,0.35), -2px -2px 6px #ffffff",
          }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>

      {/* Toast */}
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
