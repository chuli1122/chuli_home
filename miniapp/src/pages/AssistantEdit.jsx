import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft, Plus, X, Check, Save, Camera,
  Maximize2, Minimize2, FileText, GripVertical,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { apiFetch } from "../utils/api";
import { saveAvatar, getAvatar } from "../utils/db";

const S = {
  bg: "var(--bg)",
  accent: "var(--accent)",
  accentDark: "var(--accent-dark)",
  text: "var(--text)",
  textMuted: "var(--text-muted)",
};

// ── Small helpers ──

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

function NmTextareaWithExpand({ label, value, onChange, placeholder, rows, onExpand }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: S.textMuted }}>
          {label}
        </label>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{ boxShadow: "var(--card-shadow-sm)", background: S.bg }}
          onClick={onExpand}
        >
          <Maximize2 size={13} style={{ color: S.accentDark }} />
        </button>
      </div>
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ color: S.textMuted, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
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

// ── Fullscreen Editor ──
function FullscreenEditor({ value, onChange, onClose, title, placeholder }) {
  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: S.bg }}>
      <div
        className="flex shrink-0 items-center justify-between px-5 py-4"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <span className="text-[15px] font-bold" style={{ color: S.text }}>{title || "编辑"}</span>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
          onClick={onClose}
        >
          <Minimize2 size={18} style={{ color: S.accentDark }} />
        </button>
      </div>
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-5 pb-10 text-[14px] resize-none outline-none"
        style={{ background: S.bg, color: S.text }}
        placeholder={placeholder || ""}
      />
    </div>
  );
}

// ── World Book Mount Tab (drag-and-drop) ──

function activationLabel(a) {
  if (a === "always") return "常驻";
  if (a === "keyword") return "关键词";
  return "情绪";
}

function normalizeItems(raw) {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map((item, i) =>
    typeof item === "object" && item !== null
      ? item
      : { id: item, position: "after", sort_order: i }
  );
}

function SortableBookItem({ item, book, position, sectionList, onRemove, onChangePosition }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(item.id),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  if (!book) return null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-[14px] px-3 py-2.5"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none p-1"
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        <GripVertical size={14} style={{ color: S.textMuted }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="truncate text-[13px] font-semibold" style={{ color: S.text }}>
          {book.name}
        </div>
        <div className="text-[10px]" style={{ color: S.textMuted }}>
          {activationLabel(book.activation)}
          {book.folder ? ` · ${book.folder}` : ""}
        </div>
      </div>

      <button
        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ background: "rgba(136,136,160,0.1)", color: S.textMuted }}
        onClick={() => onChangePosition(item.id, position === "before" ? "after" : "before")}
      >
        {position === "before" ? "→后" : "→前"}
      </button>

      <button onClick={() => onRemove(item.id)}>
        <X size={14} style={{ color: S.textMuted }} />
      </button>
    </div>
  );
}

function AddWorldBooksModal({ allBooks, mountedIds, onClose, onConfirm }) {
  const [selected, setSelected] = useState(new Set(mountedIds));

  const groups = {};
  allBooks.forEach((book) => {
    const f = book.folder || "未分组";
    if (!groups[f]) groups[f] = [];
    groups[f].push(book);
  });

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleFolder = (books) => {
    const allSel = books.every((b) => selected.has(b.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSel) books.forEach((b) => next.delete(b.id));
      else books.forEach((b) => next.add(b.id));
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div
        className="flex w-full flex-col rounded-t-[24px]"
        style={{ background: S.bg, maxHeight: "82vh" }}
      >
        <div className="flex shrink-0 items-center justify-between p-5 pb-3">
          <h3 className="text-[16px] font-bold" style={{ color: S.text }}>
            选择要挂载的世界书
          </h3>
          <button onClick={onClose}>
            <X size={20} style={{ color: S.textMuted }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          {Object.entries(groups).map(([folderName, books]) => {
            const allSel = books.every((b) => selected.has(b.id));
            return (
              <div key={folderName} className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: S.textMuted }}>
                    {folderName}
                  </span>
                  <button
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{
                      background: allSel ? "rgba(201,98,138,0.15)" : "rgba(136,136,160,0.1)",
                      color: allSel ? S.accentDark : S.textMuted,
                    }}
                    onClick={() => toggleFolder(books)}
                  >
                    {allSel ? "全部取消" : "全选"}
                  </button>
                </div>
                <div className="space-y-2">
                  {books.map((book) => {
                    const isSel = selected.has(book.id);
                    return (
                      <button
                        key={book.id}
                        className="flex w-full items-center gap-3 rounded-[14px] p-3"
                        style={{
                          background: S.bg,
                          boxShadow: isSel ? "var(--inset-shadow)" : "var(--card-shadow-sm)",
                        }}
                        onClick={() => toggle(book.id)}
                      >
                        <div
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                          style={{
                            background: isSel ? S.accentDark : S.bg,
                            boxShadow: isSel ? "none" : "var(--icon-inset)",
                          }}
                        >
                          {isSel && <Check size={12} color="white" />}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="truncate text-[13px] font-medium" style={{ color: isSel ? S.accentDark : S.text }}>
                            {book.name}
                          </div>
                        </div>
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[10px]"
                          style={{ background: "rgba(136,136,160,0.1)", color: S.textMuted }}
                        >
                          {activationLabel(book.activation)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 p-5">
          <button
            className="w-full rounded-[14px] py-3.5 text-[15px] font-bold text-white"
            style={{
              background: "linear-gradient(135deg, var(--accent), var(--accent-dark))",
              boxShadow: "4px 4px 10px rgba(201,98,138,0.35)",
            }}
            onClick={() => onConfirm([...selected])}
          >
            确认（已选 {selected.size}）
          </button>
        </div>
      </div>
    </div>
  );
}

function WorldBookMountTab({ ruleSetIds, onChange, allBooks }) {
  const [showAdd, setShowAdd] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const items = normalizeItems(ruleSetIds);
  const beforeItems = items.filter((i) => i.position === "before").sort((a, b) => a.sort_order - b.sort_order);
  const afterItems = items.filter((i) => i.position === "after").sort((a, b) => a.sort_order - b.sort_order);

  const getBook = (id) => allBooks.find((b) => b.id === id || b.id === Number(id));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragStart = ({ active }) => setActiveId(active.id);

  const handleDragOver = ({ active, over }) => {
    if (!over) return;
    const activeItem = items.find((i) => String(i.id) === String(active.id));
    const overItem = items.find((i) => String(i.id) === String(over.id));
    if (!activeItem || !overItem) return;
    if (activeItem.position !== overItem.position) {
      const newItems = items.map((i) =>
        String(i.id) === String(activeItem.id) ? { ...i, position: overItem.position } : i
      );
      onChange(newItems);
    }
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const activeItem = items.find((i) => String(i.id) === String(active.id));
    const overItem = items.find((i) => String(i.id) === String(over.id));
    if (!activeItem || !overItem || activeItem.position !== overItem.position) return;
    const section = activeItem.position === "before" ? [...beforeItems] : [...afterItems];
    const fromIdx = section.findIndex((i) => String(i.id) === String(active.id));
    const toIdx = section.findIndex((i) => String(i.id) === String(over.id));
    const reordered = arrayMove(section, fromIdx, toIdx).map((item, idx) => ({ ...item, sort_order: idx }));
    const other = items.filter((i) => i.position !== activeItem.position);
    onChange([...other, ...reordered]);
  };

  const removeItem = (id) => onChange(items.filter((i) => i.id !== id));

  const changePosition = (id, newPos) => {
    const targetSection = newPos === "before" ? beforeItems : afterItems;
    const newSortOrder = targetSection.length;
    onChange(items.map((i) => i.id === id ? { ...i, position: newPos, sort_order: newSortOrder } : i));
  };

  const handleAddConfirm = (selectedIds) => {
    const currentIds = items.map((i) => i.id);
    const toAdd = selectedIds.filter((id) => !currentIds.includes(id));
    const newItems = toAdd.map((id, i) => ({
      id,
      position: "after",
      sort_order: afterItems.length + i,
    }));
    const toRemove = new Set(currentIds.filter((id) => !selectedIds.includes(id)));
    const kept = items.filter((i) => !toRemove.has(i.id));
    onChange([...kept, ...newItems]);
  };

  const renderSection = (sectionItems, position) => {
    if (sectionItems.length === 0) {
      return (
        <div className="py-3 text-center text-[12px]" style={{ color: S.textMuted }}>
          暂无挂载
        </div>
      );
    }
    return (
      <SortableContext
        items={sectionItems.map((i) => String(i.id))}
        strategy={verticalListSortingStrategy}
      >
        <div
          className="rounded-[14px] px-2 pt-1"
          style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
        >
          {sectionItems.map((item, idx) => (
            <div key={item.id}>
              {idx > 0 && (
                <div className="mx-2" style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />
              )}
              <SortableBookItem
                item={item}
                book={getBook(item.id)}
                position={position}
                sectionList={sectionItems}
                onRemove={removeItem}
                onChangePosition={changePosition}
              />
            </div>
          ))}
        </div>
      </SortableContext>
    );
  };

  const activeItem = activeId ? items.find((i) => String(i.id) === String(activeId)) : null;
  const activeBook = activeItem ? getBook(activeItem.id) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* Before section */}
      <div className="mb-1">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: S.textMuted }}>
          System Prompt 前
        </div>
        {renderSection(beforeItems, "before")}
      </div>

      {/* System Prompt divider */}
      <div className="my-4 flex items-center gap-2">
        <div className="h-px flex-1" style={{ background: "rgba(136,136,160,0.25)" }} />
        <span
          className="rounded-full px-3 py-1 text-[11px] font-bold"
          style={{ background: "rgba(232,160,191,0.15)", color: S.accentDark }}
        >
          System Prompt
        </span>
        <div className="h-px flex-1" style={{ background: "rgba(136,136,160,0.25)" }} />
      </div>

      {/* After section */}
      <div className="mb-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: S.textMuted }}>
          System Prompt 后
        </div>
        {renderSection(afterItems, "after")}
      </div>

      {/* Add button */}
      <button
        className="flex w-full items-center justify-center gap-2 rounded-[14px] py-3 text-[14px] font-semibold"
        style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.accentDark }}
        onClick={() => setShowAdd(true)}
      >
        <Plus size={16} /> 添加
      </button>

      {/* Drag overlay */}
      <DragOverlay>
        {activeBook && (
          <div
            className="flex items-center gap-2 rounded-[14px] px-3 py-2.5"
            style={{ background: S.bg, boxShadow: "var(--card-shadow)", opacity: 0.9 }}
          >
            <GripVertical size={14} style={{ color: S.textMuted }} />
            <div className="flex-1 min-w-0">
              <div className="truncate text-[13px] font-semibold" style={{ color: S.accentDark }}>
                {activeBook.name}
              </div>
            </div>
          </div>
        )}
      </DragOverlay>

      {showAdd && (
        <AddWorldBooksModal
          allBooks={allBooks}
          mountedIds={items.map((i) => i.id)}
          onClose={() => setShowAdd(false)}
          onConfirm={(selectedIds) => {
            handleAddConfirm(selectedIds);
            setShowAdd(false);
          }}
        />
      )}
    </DndContext>
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
  const [loading, setLoading] = useState(!isNew);
  const [toast, setToast] = useState(null);
  const [sysPromptFullscreen, setSysPromptFullscreen] = useState(false);
  const [humanFullscreen, setHumanFullscreen] = useState(false);
  const [personaFullscreen, setPersonaFullscreen] = useState(false);

  const fileInputRef = useRef(null);
  const sysPromptFileRef = useRef(null);

  const handleSysPromptFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setSystemPrompt(ev.target.result || "");
    reader.readAsText(file);
    e.target.value = "";
  };

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
          getAvatar(`assistant-avatar-${id}`).then((b64) => { if (b64) setAvatarUrl(b64); }).catch(function() {});
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
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };
    loadAll();
  }, [id, isNew]);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result;
      const key = `assistant-avatar-${id || "new"}`;
      try {
        await saveAvatar(key, base64);
        setAvatarUrl(base64);
      } catch (_e) {
        showToast("头像保存失败");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!name.trim()) { showToast("请输入名称"); return; }
    setSaving(true);
    try {
      const updateBody = {
        name: name.trim(),
        avatar_url: avatarUrl ? `assistant-avatar-${id || "new"}` : null,
        system_prompt: systemPrompt,
        model_preset_id: chatPresetId,
        summary_model_preset_id: summaryPresetId,
        summary_fallback_preset_id: summaryFallbackId,
        rule_set_ids: normalizeItems(ruleSetIds),
      };

      let assistantId = id;
      if (isNew) {
        const created = await apiFetch("/api/assistants", { method: "POST", body: { name: name.trim() } });
        assistantId = created.id;
        // Rename temp avatar key to real id
        if (avatarUrl) {
          await saveAvatar(`assistant-avatar-${assistantId}`, avatarUrl);
          updateBody.avatar_url = `assistant-avatar-${assistantId}`;
        }
        await apiFetch(`/api/assistants/${assistantId}`, { method: "PUT", body: updateBody });
      } else {
        await apiFetch(`/api/assistants/${id}`, { method: "PUT", body: updateBody });
      }

      const blockSaves = [];
      if (humanBlockId) {
        blockSaves.push(apiFetch(`/api/core-blocks/${humanBlockId}`, { method: "PUT", body: { content: humanBlock } }));
      }
      if (personaBlockId) {
        blockSaves.push(apiFetch(`/api/core-blocks/${personaBlockId}`, { method: "PUT", body: { content: personaBlock } }));
      }
      await Promise.all(blockSaves);

      showToast("已保存");
    } catch (e) {
      showToast("保存失败: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { key: "basic", label: "基础设置" },
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
          onClick={() => navigate("/assistants", { replace: true })}
        >
          <ChevronLeft size={22} style={{ color: S.text }} />
        </button>
        <h1 className="text-[17px] font-bold" style={{ color: S.text }}>
          {isNew ? "新建助手" : "助手配置"}
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
      <div className="flex-1 overflow-y-auto px-5 pb-10 pt-px">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: S.accent, borderTopColor: "transparent" }} />
          </div>
        ) : (
        <>
        {tab === "basic" && (
          <>
            {/* Avatar + Name */}
            <div
              className="mb-4 flex items-center gap-4 rounded-[20px] p-4"
              style={{ background: S.bg, boxShadow: "var(--card-shadow)" }}
            >
              <button
                className="relative shrink-0"
                style={{ width: 68, height: 68 }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div
                  className="flex h-full w-full items-center justify-center overflow-hidden rounded-full"
                  style={{
                    background: "linear-gradient(135deg, #f0c4d8, var(--accent))",
                    padding: 3,
                  }}
                >
                  <div
                    className="flex h-full w-full items-center justify-center overflow-hidden rounded-full"
                    style={{ background: S.bg }}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover rounded-full" />
                    ) : (
                      <span className="text-[24px]" style={{ color: S.accentDark }}>
                        {name?.[0] || "?"}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full"
                  style={{ background: S.accentDark }}
                >
                  <Camera size={9} color="white" />
                </div>
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
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: S.textMuted }}>
                  系统提示词
                </label>
                <div className="flex items-center gap-2">
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded-full"
                    style={{ boxShadow: "var(--card-shadow-sm)", background: S.bg }}
                    onClick={() => sysPromptFileRef.current?.click()}
                    title="从文件导入"
                  >
                    <FileText size={13} style={{ color: S.textMuted }} />
                  </button>
                  <input
                    ref={sysPromptFileRef}
                    type="file"
                    accept=".txt,.md,.text"
                    className="hidden"
                    onChange={handleSysPromptFile}
                  />
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded-full"
                    style={{ boxShadow: "var(--card-shadow-sm)", background: S.bg }}
                    onClick={() => setSysPromptFullscreen(true)}
                    title="全屏编辑"
                  >
                    <Maximize2 size={13} style={{ color: S.accentDark }} />
                  </button>
                </div>
              </div>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="输入系统提示词..."
                rows={8}
                className="w-full rounded-[14px] px-4 py-3 text-[14px] resize-none outline-none"
                style={{ boxShadow: "var(--inset-shadow)", background: S.bg, color: S.text }}
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
              <NmTextareaWithExpand
                label="关于我（AI 视角）"
                value={humanBlock}
                onChange={setHumanBlock}
                placeholder="描述你自己，让 AI 了解你..."
                rows={7}
                onExpand={() => setHumanFullscreen(true)}
              />
            </div>
            <div
              className="rounded-[20px] p-4"
              style={{ background: S.bg, boxShadow: "var(--card-shadow)" }}
            >
              <NmTextareaWithExpand
                label="关于他"
                value={personaBlock}
                onChange={setPersonaBlock}
                placeholder="AI 在相处中形成的自我认知..."
                rows={7}
                onExpand={() => setPersonaFullscreen(true)}
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
        </>
        )}
      </div>

      {/* Fullscreen editors */}
      {sysPromptFullscreen && (
        <FullscreenEditor
          value={systemPrompt}
          onChange={setSystemPrompt}
          onClose={() => setSysPromptFullscreen(false)}
          title="系统提示词"
          placeholder="输入系统提示词..."
        />
      )}
      {humanFullscreen && (
        <FullscreenEditor
          value={humanBlock}
          onChange={setHumanBlock}
          onClose={() => setHumanFullscreen(false)}
          title="关于我（AI 视角）"
          placeholder="描述你自己，让 AI 了解你..."
        />
      )}
      {personaFullscreen && (
        <FullscreenEditor
          value={personaBlock}
          onChange={setPersonaBlock}
          onClose={() => setPersonaFullscreen(false)}
          title="关于他"
          placeholder="AI 在相处中形成的自我认知..."
        />
      )}

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
