import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiFetch } from "../../utils/api";
import Modal from "../../components/Modal";

export default function MessageList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sessions, setSessions] = useState([]);
  const [previews, setPreviews] = useState({});
  const [loading, setLoading] = useState(true);

  const [assistants, setAssistants] = useState([]);
  const [selectMode, setSelectMode] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const load = async () => {
    try {
      const data = await apiFetch("/api/sessions");
      const list = (data.sessions || []).sort(
        (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
      );
      setSessions(list);
      const previewMap = {};
      await Promise.all(
        list.map(async (s) => {
          try {
            const msgData = await apiFetch(`/api/sessions/${s.id}/messages?limit=1`);
            const msgs = msgData.messages || [];
            if (msgs.length > 0) previewMap[s.id] = msgs[0];
          } catch {}
        })
      );
      setPreviews(previewMap);
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const action = location.state?.action;
    if (action === "chat" || action === "group") {
      openSelect(action);
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  const openSelect = async (mode) => {
    try {
      const data = await apiFetch("/api/assistants");
      setAssistants(data.assistants || []);
    } catch {}
    setSelectMode(mode);
    setSelectedIds([]);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const createSession = async () => {
    try {
      let body;
      if (selectMode === "chat") {
        if (selectedIds.length !== 1) return;
        body = { assistant_id: selectedIds[0], type: "chat" };
      } else {
        if (selectedIds.length < 2) return;
        body = { assistant_ids: selectedIds, type: "group" };
      }
      const data = await apiFetch("/api/sessions", { method: "POST", body });
      setSelectMode(null);
      navigate(`/chat/session/${data.id}`, { replace: true });
    } catch (e) {
      console.error("Failed to create session", e);
    }
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  };

  const getReadTime = (sessionId) => {
    try {
      const map = JSON.parse(localStorage.getItem("session-read-times") || "{}");
      return map[sessionId] || 0;
    } catch { return 0; }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: "var(--chat-accent)", borderTopColor: "var(--chat-accent-dark)" }} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-5 pb-24">
        {sessions.length === 0 && (
          <div className="mt-16 text-center">
            <p className="text-sm" style={{ color: "var(--chat-text-muted)" }}>
              暂无会话，点击右上角 + 开始聊天
            </p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {sessions.map((s) => {
            const preview = previews[s.id];
            const readTime = getReadTime(s.id);
            const hasUnread = s.updated_at && new Date(s.updated_at).getTime() > readTime;
            return (
              <button
                key={s.id}
                onClick={() => navigate(`/chat/session/${s.id}`, { replace: true })}
                className="flex w-full items-center gap-4 rounded-[20px] p-4 text-left active:scale-[0.98] transition-all"
                style={{ background: "var(--chat-card-bg)" }}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-medium"
                  style={{ background: "var(--chat-input-bg)", color: "var(--chat-accent-dark)" }}
                >
                  {(s.title || "?")[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-medium truncate" style={{ color: "var(--chat-text)" }}>
                      {s.title || `会话 ${s.id}`}
                    </span>
                    <span className="text-[10px] shrink-0 ml-2" style={{ color: "var(--chat-text-muted)" }}>
                      {formatTime(s.updated_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs" style={{ color: "var(--chat-text-muted)" }}>
                    {preview ? preview.content : ""}
                  </p>
                </div>
                {hasUnread && (
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "var(--chat-accent-dark)" }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Modal
        isOpen={selectMode !== null}
        onClose={() => setSelectMode(null)}
        title={selectMode === "chat" ? "选择助手" : "选择助手（多选）"}
        onConfirm={createSession}
        confirmText="确定"
        isConfirmDisabled={
          selectMode === "chat" ? selectedIds.length !== 1 : selectedIds.length < 2
        }
      >
        <div className="max-h-64 overflow-y-auto">
          {assistants.map((a) => {
            const selected = selectedIds.includes(a.id);
            return (
              <button
                key={a.id}
                onClick={() => {
                  if (selectMode === "chat") setSelectedIds([a.id]);
                  else toggleSelect(a.id);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition"
                style={{
                  background: selected ? "var(--chat-input-bg)" : "transparent",
                }}
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium"
                  style={{ background: "var(--chat-bg)", color: "var(--chat-accent-dark)" }}
                >
                  {a.name[0]}
                </div>
                <span className="text-sm" style={{ color: "var(--chat-text)" }}>{a.name}</span>
                {selected && (
                  <span className="ml-auto text-xs" style={{ color: "var(--chat-accent-dark)" }}>已选</span>
                )}
              </button>
            );
          })}
          {assistants.length === 0 && (
            <p className="py-6 text-center text-sm" style={{ color: "var(--chat-text-muted)" }}>
              暂无助手，请先在通讯录创建
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
