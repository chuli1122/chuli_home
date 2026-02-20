import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Trash2, Plus, X, Lock } from "lucide-react";
import { apiFetch } from "../utils/api";

const S = {
  bg: "var(--bg)",
  accent: "var(--accent)",
  accentDark: "var(--accent-dark)",
  text: "var(--text)",
  textMuted: "var(--text-muted)",
};

const TABS = [
  { key: "theirs", label: "他的日记" },
  { key: "mine", label: "我的日记" },
];

const ACTION_WIDTH = 72;
const SNAP_THRESHOLD = 36;

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const time = `${h}:${m}`;
  if (now - d < 86400000 && d.toDateString() === now.toDateString()) return time;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

/* ── Confirm ── */
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.25)" }} onClick={onCancel}>
      <div className="mx-8 w-full max-w-[280px] rounded-[18px] p-5" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }} onClick={(e) => e.stopPropagation()}>
        <p className="mb-4 text-center text-[13px]" style={{ color: S.text }}>{message}</p>
        <div className="flex gap-3">
          <button className="flex-1 rounded-[12px] py-2 text-[12px] font-medium" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.textMuted }} onClick={onCancel}>取消</button>
          <button className="flex-1 rounded-[12px] py-2 text-[12px] font-medium" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }} onClick={onConfirm}>确认</button>
        </div>
      </div>
    </div>
  );
}

/* ── SwipeRow ── */
function SwipeRow({ children, onDelete }) {
  const rowRef = useRef(null);
  const actRef = useRef(null);
  const s = useRef({ sx: 0, sy: 0, base: 0, cur: 0, drag: false, locked: false, horiz: false });
  const snap = useCallback((x, anim) => {
    const el = rowRef.current, act = actRef.current;
    if (!el) return;
    const t = anim ? "all .25s ease" : "none";
    el.style.transition = t; el.style.transform = `translateX(${x}px)`;
    if (act) { act.style.transition = t; act.style.opacity = `${Math.min(1, Math.abs(x) / ACTION_WIDTH)}`; }
    s.current.cur = x;
  }, []);
  const close = useCallback(() => snap(0, true), [snap]);
  return (
    <div className="relative overflow-hidden rounded-[14px]">
      <div ref={actRef} className="absolute right-0 top-0 bottom-0 flex items-center pr-2" style={{ opacity: 0 }}>
        <button onClick={() => { close(); onDelete(); }} className="flex h-[calc(100%-8px)] w-[56px] flex-col items-center justify-center gap-0.5 rounded-xl" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <Trash2 size={14} color="#ef4444" />
          <span className="text-[9px] font-medium" style={{ color: "#ef4444" }}>删除</span>
        </button>
      </div>
      <div ref={rowRef} className="relative z-10" style={{ transform: "translateX(0)", willChange: "transform" }}
        onTouchStart={(e) => { const t = e.touches[0]; const st = s.current; st.sx = t.clientX; st.sy = t.clientY; st.base = st.cur; st.drag = true; st.locked = false; st.horiz = false; if (rowRef.current) rowRef.current.style.transition = "none"; if (actRef.current) actRef.current.style.transition = "none"; }}
        onTouchMove={(e) => { const st = s.current; if (!st.drag) return; const t = e.touches[0]; const dx = t.clientX - st.sx, dy = t.clientY - st.sy; if (!st.locked) { if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return; st.locked = true; st.horiz = Math.abs(dx) > Math.abs(dy); } if (!st.horiz) { st.drag = false; return; } e.preventDefault(); const nx = Math.max(-ACTION_WIDTH, Math.min(0, st.base + dx)); if (rowRef.current) rowRef.current.style.transform = `translateX(${nx}px)`; if (actRef.current) actRef.current.style.opacity = `${Math.min(1, Math.abs(nx) / ACTION_WIDTH)}`; st.cur = nx; }}
        onTouchEnd={() => { s.current.drag = false; snap(s.current.cur < -SNAP_THRESHOLD ? -ACTION_WIDTH : 0, true); }}
      >{children}</div>
    </div>
  );
}

/* ── Countdown ── */
function Countdown({ unlockAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const diff = new Date(unlockAt).getTime() - now;
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const sec = Math.floor((diff % 60000) / 1000);
  let text = "";
  if (d > 0) text += `${d}天`;
  if (h > 0 || d > 0) text += `${h}小时`;
  text += `${m}分${sec}秒`;
  return (
    <div className="flex items-center gap-1.5 text-[12px]" style={{ color: S.accentDark }}>
      <Lock size={12} />
      <span>{text}</span>
    </div>
  );
}

/* ── Assistant picker popup ── */
function AssistantPicker({ assistants, currentId, onSelect, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.2)" }} onClick={onClose}>
      <div className="w-full max-w-[400px] rounded-t-[20px] pb-6" style={{ background: S.bg, boxShadow: "0 -4px 20px rgba(0,0,0,0.1)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-[14px] font-bold" style={{ color: S.text }}>选择助手</span>
          <button onClick={onClose}><X size={18} style={{ color: S.textMuted }} /></button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-5">
          {assistants.map((a) => (
            <button key={a.id} className="mb-2 flex w-full items-center gap-3 rounded-[14px] p-3 text-left"
              style={{ background: S.bg, boxShadow: a.id === currentId ? "var(--inset-shadow)" : "var(--card-shadow-sm)" }}
              onClick={() => { onSelect(a.id); onClose(); }}>
              <div className="shrink-0 rounded-full" style={{ width: 36, height: 36, border: a.id === currentId ? "2px solid #e8a0bf" : "2px solid transparent", padding: 2 }}>
                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full" style={{ background: S.bg }}>
                  {a.avatar_url ? <img src={a.avatar_url} alt="" className="h-full w-full object-cover rounded-full" /> : <span style={{ fontSize: 16 }}>🤖</span>}
                </div>
              </div>
              <span className="text-[13px] font-medium truncate" style={{ color: S.text }}>{a.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Diary detail page (notebook style) ── */
function DiaryDetail({ diary, onBack, onMarkRead }) {
  useEffect(() => {
    if (diary && !diary.is_read && diary.author === "assistant") {
      const unlocked = !diary.unlock_at || new Date(diary.unlock_at) <= new Date();
      if (unlocked) onMarkRead(diary.id);
    }
  }, [diary]);

  return (
    <div className="flex h-full flex-col" style={{ background: S.bg }}>
      <div className="flex shrink-0 items-center justify-between px-5 pb-3" style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}>
        <button className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }} onClick={onBack}>
          <ChevronLeft size={22} style={{ color: S.text }} />
        </button>
        <h1 className="text-[15px] font-bold truncate max-w-[60%]" style={{ color: S.text }}>{diary.title || "日记"}</h1>
        <div className="w-10" />
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        <div className="rounded-[18px] p-5" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}>
          <div className="mb-3 text-[10px]" style={{ color: S.textMuted }}>{fmtTime(diary.created_at)}</div>
          <div className="diary-lines text-[13px] leading-[28px]" style={{ color: S.text }}>
            {diary.content.split("\n").map((line, i) => (
              <div key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.06)", minHeight: 28 }}>{line || "\u00A0"}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── New diary form ── */
function NewDiaryForm({ assistantId, onSave, onCancel }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [timed, setTimed] = useState(false);
  const [unlockDate, setUnlockDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!content.trim() || saving) return;
    setSaving(true);
    try {
      const body = {
        assistant_id: assistantId,
        author: "user",
        title: title.trim(),
        content: content.trim(),
      };
      if (timed && unlockDate) body.unlock_at = new Date(unlockDate).toISOString();
      await onSave(body);
    } finally { setSaving(false); }
  };

  return (
    <div className="flex h-full flex-col" style={{ background: S.bg }}>
      <div className="flex shrink-0 items-center justify-between px-5 pb-3" style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}>
        <button className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }} onClick={onCancel}>
          <ChevronLeft size={22} style={{ color: S.text }} />
        </button>
        <h1 className="text-[15px] font-bold" style={{ color: S.text }}>写日记</h1>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: S.bg, boxShadow: content.trim() ? "var(--card-shadow-sm)" : "var(--inset-shadow)" }}
          onClick={handleSave} disabled={!content.trim() || saving}
        >
          <span className="text-[12px] font-bold" style={{ color: content.trim() ? S.accentDark : S.textMuted }}>存</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        <input
          className="mb-3 w-full rounded-[12px] px-3 py-2.5 text-[13px] font-medium outline-none"
          style={{ background: S.bg, boxShadow: "var(--inset-shadow)", color: S.text }}
          placeholder="标题（可选）"
          value={title} onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="mb-3 w-full rounded-[14px] p-3 text-[13px] leading-[28px] resize-none outline-none"
          style={{ background: S.bg, boxShadow: "var(--inset-shadow)", color: S.text, minHeight: 200, backgroundImage: "repeating-linear-gradient(transparent, transparent 27px, rgba(0,0,0,0.05) 27px, rgba(0,0,0,0.05) 28px)", backgroundPositionY: 9 }}
          placeholder="写点什么..."
          value={content} onChange={(e) => setContent(e.target.value)}
          autoFocus
        />
        <div className="flex items-center justify-between rounded-[12px] px-3 py-2.5" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}>
          <span className="text-[12px] font-medium" style={{ color: S.text }}>定时解锁</span>
          <button
            className="relative h-6 w-11 rounded-full transition-colors"
            style={{ background: timed ? S.accent : "rgba(0,0,0,0.1)" }}
            onClick={() => setTimed(!timed)}
          >
            <div className="absolute top-0.5 h-5 w-5 rounded-full transition-transform" style={{ background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transform: timed ? "translateX(22px)" : "translateX(2px)" }} />
          </button>
        </div>
        {timed && (
          <input
            type="datetime-local"
            className="mt-2 w-full rounded-[12px] px-3 py-2.5 text-[12px] outline-none"
            style={{ background: S.bg, boxShadow: "var(--inset-shadow)", color: S.text }}
            value={unlockDate} onChange={(e) => setUnlockDate(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function DiaryPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("theirs");
  const [assistants, setAssistants] = useState([]);
  const [assistantId, setAssistantId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [diaries, setDiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);
  const [detail, setDetail] = useState(null);      // diary object
  const [newForm, setNewForm] = useState(false);

  // Load assistants
  useEffect(() => {
    apiFetch("/api/assistants").then((d) => {
      const list = d.assistants || [];
      setAssistants(list);
      if (list.length > 0 && !assistantId) setAssistantId(list[0].id);
    }).catch(() => {});
  }, []);

  const currentAssistant = assistants.find((a) => a.id === assistantId);

  // Load diaries
  useEffect(() => {
    if (assistantId != null) loadDiaries();
  }, [assistantId, tab]);

  const loadDiaries = async () => {
    setLoading(true);
    try {
      const author = tab === "theirs" ? "assistant" : "user";
      const d = await apiFetch(`/api/diary?assistant_id=${assistantId}&author=${author}&limit=100`);
      setDiaries(d.diary || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const deleteDiary = (id) => {
    setConfirm({
      message: "确定要删除这篇日记吗？",
      action: async () => {
        await apiFetch(`/api/diary/${id}`, { method: "DELETE" });
        setDiaries((p) => p.filter((d) => d.id !== id));
      },
    });
  };

  const markRead = async (id) => {
    try {
      await apiFetch(`/api/diary/${id}/read`, { method: "POST" });
      setDiaries((p) => p.map((d) => d.id === id ? { ...d, is_read: true } : d));
    } catch (e) { console.error(e); }
  };

  const handleCreate = async (body) => {
    await apiFetch("/api/diary", { method: "POST", body: JSON.stringify(body) });
    setNewForm(false);
    loadDiaries();
  };

  const openDiary = (diary) => {
    const locked = diary.unlock_at && new Date(diary.unlock_at) > new Date();
    if (locked) return; // locked diaries can't be opened
    setDetail(diary);
  };

  // ── Sub-views ──
  if (detail) {
    return (
      <DiaryDetail
        diary={detail}
        onBack={() => { setDetail(null); loadDiaries(); }}
        onMarkRead={markRead}
      />
    );
  }
  if (newForm) {
    return <NewDiaryForm assistantId={assistantId} onSave={handleCreate} onCancel={() => setNewForm(false)} />;
  }

  return (
    <div className="flex h-full flex-col" style={{ background: S.bg }}>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-5 pb-3" style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}>
        <button className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }} onClick={() => navigate("/", { replace: true })}>
          <ChevronLeft size={22} style={{ color: S.text }} />
        </button>
        <h1 className="text-[17px] font-bold" style={{ color: S.text }}>日记</h1>
        {/* Assistant avatar button */}
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ border: "2px solid #e8a0bf", padding: 2 }}
          onClick={() => setPickerOpen(true)}
        >
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full" style={{ background: S.bg }}>
            {currentAssistant?.avatar_url
              ? <img src={currentAssistant.avatar_url} alt="" className="h-full w-full object-cover rounded-full" />
              : <span style={{ fontSize: 16 }}>🤖</span>
            }
          </div>
        </button>
      </div>

      {/* Tabs */}
      <div className="shrink-0 px-5 pb-3">
        <div className="flex rounded-[14px] p-1" style={{ background: S.bg, boxShadow: "var(--inset-shadow)" }}>
          {TABS.map((t) => (
            <button key={t.key} className="flex-1 rounded-[12px] py-2 text-[12px] font-medium transition-all"
              style={tab === t.key ? { background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.accentDark } : { color: S.textMuted }}
              onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-24">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: S.accent, borderTopColor: "transparent" }} />
          </div>
        ) : diaries.length === 0 ? (
          <p className="py-16 text-center text-[14px]" style={{ color: S.textMuted }}>
            {tab === "theirs" ? "还没有收到日记" : "还没有写过日记"}
          </p>
        ) : (
          diaries.map((diary) => {
            const locked = diary.unlock_at && new Date(diary.unlock_at) > new Date();
            return (
              <SwipeRow key={diary.id} onDelete={() => deleteDiary(diary.id)}>
                <div
                  className="mb-2 rounded-[14px] p-3 cursor-pointer"
                  style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
                  onClick={() => openDiary(diary)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Unread dot */}
                      {!diary.is_read && diary.author === "assistant" && !locked && (
                        <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: "#ef4444" }} />
                      )}
                      <span className="text-[13px] font-medium truncate" style={{ color: S.text }}>
                        {diary.title || "无题"}
                      </span>
                    </div>
                    <span className="text-[10px] shrink-0 ml-2" style={{ color: S.textMuted }}>{fmtTime(diary.created_at)}</span>
                  </div>
                  {locked ? (
                    <Countdown unlockAt={diary.unlock_at} />
                  ) : (
                    <p className="text-[12px] leading-relaxed break-words" style={{ color: S.textMuted, maxHeight: 40, overflow: "hidden" }}>
                      {diary.content.length > 60 ? diary.content.slice(0, 60) + "..." : diary.content}
                    </p>
                  )}
                </div>
              </SwipeRow>
            );
          })
        )}
      </div>

      {/* New diary FAB (only on "mine" tab) */}
      {tab === "mine" && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center" style={{ zIndex: 30 }}>
          <button
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "linear-gradient(135deg, #f0c4d8, var(--accent))", boxShadow: "0 4px 14px rgba(232,160,191,0.4)" }}
            onClick={() => setNewForm(true)}
          >
            <Plus size={22} color="white" />
          </button>
        </div>
      )}

      {/* Modals */}
      {pickerOpen && (
        <AssistantPicker assistants={assistants} currentId={assistantId} onSelect={setAssistantId} onClose={() => setPickerOpen(false)} />
      )}
      {confirm && (
        <ConfirmDialog message={confirm.message}
          onConfirm={async () => { try { await confirm.action(); } catch (e) { console.error(e); } setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
