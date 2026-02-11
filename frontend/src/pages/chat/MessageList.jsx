import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { apiFetch } from "../../utils/api";
import Modal from "../../components/Modal";

export default function MessageList() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [previews, setPreviews] = useState({});
  const [showMenu, setShowMenu] = useState(false);
  const [assistants, setAssistants] = useState([]);
  const [menuMode, setMenuMode] = useState(null); // 'chat' | 'group'
  const [selectedIds, setSelectedIds] = useState([]);

  const load = async () => {
    try {
      const data = await apiFetch("/api/sessions");
      const list = (data.sessions || []).sort(
        (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
      );
      setSessions(list);
      // Load latest message for each session
      const previewMap = {};
      await Promise.all(
        list.map(async (s) => {
          try {
            const msgData = await apiFetch(
              `/api/sessions/${s.id}/messages?limit=1`
            );
            const msgs = msgData.messages || [];
            if (msgs.length > 0) previewMap[s.id] = msgs[0];
          } catch {}
        })
      );
      setPreviews(previewMap);
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNewMenu = async (mode) => {
    try {
      const data = await apiFetch("/api/assistants");
      setAssistants(data.assistants || []);
    } catch {}
    setMenuMode(mode);
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
      if (menuMode === "chat") {
        if (selectedIds.length !== 1) return;
        body = { assistant_id: selectedIds[0], type: "chat" };
      } else {
        if (selectedIds.length < 2) return;
        body = { assistant_ids: selectedIds, type: "group" };
      }
      const data = await apiFetch("/api/sessions", {
        method: "POST",
        body,
      });
      setMenuMode(null);
      setShowMenu(false);
      navigate(`/chat/session/${data.id}`);
    } catch (e) {
      console.error("Failed to create session", e);
    }
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  };

  const getReadTime = (sessionId) => {
    try {
      const map = JSON.parse(localStorage.getItem("session-read-times") || "{}");
      return map[sessionId] || 0;
    } catch {
      return 0;
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Action button */}
      <div className="flex justify-end px-4 pb-2">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="rounded-full p-1.5 active:bg-black/5"
        >
          <Plus size={22} />
        </button>
      </div>

      {/* Quick menu */}
      {showMenu && !menuMode && (
        <div className="mx-4 mb-3 rounded-xl bg-white shadow-lg overflow-hidden">
          <button
            onClick={() => openNewMenu("chat")}
            className="w-full px-4 py-3 text-left text-sm active:bg-gray-50 border-b border-gray-100"
          >
            开始聊天
          </button>
          <button
            onClick={() => openNewMenu("group")}
            className="w-full px-4 py-3 text-left text-sm active:bg-gray-50"
          >
            发起群聊
          </button>
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-4">
        {sessions.length === 0 && (
          <p className="mt-12 text-center text-sm text-gray-400">
            暂无会话，点击 + 开始聊天
          </p>
        )}
        {sessions.map((s) => {
          const preview = previews[s.id];
          const readTime = getReadTime(s.id);
          const hasUnread =
            s.updated_at && new Date(s.updated_at).getTime() > readTime;
          return (
            <button
              key={s.id}
              onClick={() => navigate(`/chat/session/${s.id}`)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-gray-50"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg">
                {(s.title || "?")[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">
                    {s.title || `会话 ${s.id}`}
                  </span>
                  <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                    {formatTime(s.updated_at)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-400">
                  {preview ? preview.content : ""}
                </p>
              </div>
              {hasUnread && (
                <div className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Assistant selection modal */}
      <Modal
        isOpen={menuMode !== null}
        onClose={() => {
          setMenuMode(null);
          setShowMenu(false);
        }}
        title={menuMode === "chat" ? "选择助手" : "选择助手（多选）"}
        onConfirm={createSession}
        confirmText="确定"
        isConfirmDisabled={
          menuMode === "chat"
            ? selectedIds.length !== 1
            : selectedIds.length < 2
        }
      >
        <div className="max-h-64 overflow-y-auto">
          {assistants.map((a) => {
            const selected = selectedIds.includes(a.id);
            return (
              <button
                key={a.id}
                onClick={() => {
                  if (menuMode === "chat") {
                    setSelectedIds([a.id]);
                  } else {
                    toggleSelect(a.id);
                  }
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${
                  selected ? "bg-gray-100" : "active:bg-gray-50"
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm">
                  {a.name[0]}
                </div>
                <span className="text-sm">{a.name}</span>
                {selected && (
                  <span className="ml-auto text-xs text-blue-500">已选</span>
                )}
              </button>
            );
          })}
          {assistants.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">
              暂无助手，请先在通讯录创建
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
