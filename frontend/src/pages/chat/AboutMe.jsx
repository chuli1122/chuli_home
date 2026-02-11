import { useEffect, useState, useRef } from "react";
import { FileText } from "lucide-react";
import { apiFetch } from "../../utils/api";
import { saveImage, loadImageUrl, deleteImage } from "../../utils/db";

const AVATAR_KEY = "user-avatar";

export default function AboutMe() {
  const [nickname, setNickname] = useState("");
  const [basicInfo, setBasicInfo] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [originalData, setOriginalData] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef(null);
  const infoFileRef = useRef(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await apiFetch("/api/user/profile");
        setNickname(data.nickname || "");
        setBasicInfo(data.basic_info || "");
        setOriginalData({
          nickname: data.nickname || "",
          basic_info: data.basic_info || "",
        });
        const url = await loadImageUrl(AVATAR_KEY);
        if (url) setAvatarUrl(url);
      } catch (e) {
        console.error("Failed to load profile", e);
      }
      setLoading(false);
    };
    loadProfile();
  }, []);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await deleteImage(AVATAR_KEY);
      await saveImage(AVATAR_KEY, file);
      const url = await loadImageUrl(AVATAR_KEY);
      setAvatarUrl(url);
      await apiFetch("/api/user/profile", {
        method: "PUT",
        body: { avatar_url: AVATAR_KEY },
      });
    } catch (e) {
      console.error("Failed to save avatar", e);
    }
  };

  const handleInfoFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setBasicInfo(ev.target.result);
    reader.readAsText(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/user/profile", {
        method: "PUT",
        body: { nickname, basic_info: basicInfo },
      });
      setOriginalData({ nickname, basic_info: basicInfo });
    } catch (e) {
      console.error("Failed to save profile", e);
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setNickname(originalData.nickname || "");
    setBasicInfo(originalData.basic_info || "");
  };

  const hasChanges =
    nickname !== originalData.nickname ||
    basicInfo !== originalData.basic_info;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: "var(--chat-accent)", borderTopColor: "var(--chat-accent-dark)" }} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 pb-24">
      {/* Profile card */}
      <div className="mt-2 rounded-[20px] p-5" style={{ background: "var(--chat-card-bg)" }}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full overflow-hidden active:opacity-80 transition"
            style={{ background: "var(--chat-input-bg)" }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl" style={{ color: "var(--chat-text-muted)" }}>?</span>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </button>
          <div className="flex-1">
            <label className="text-xs mb-1 block" style={{ color: "var(--chat-text-muted)" }}>昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="输入昵称"
              className="w-full rounded-xl px-4 py-2.5 text-base outline-none"
              style={{ background: "var(--chat-input-bg)", color: "var(--chat-text)" }}
            />
          </div>
        </div>
      </div>

      {/* Basic Info card */}
      <div className="mt-4 rounded-[20px] p-5" style={{ background: "var(--chat-card-bg)" }}>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs" style={{ color: "var(--chat-text-muted)" }}>基本信息</label>
          <button
            onClick={() => infoFileRef.current?.click()}
            className="flex items-center gap-1 rounded-full px-3 py-1 active:opacity-70"
            style={{ border: "1px solid var(--chat-accent)" }}
          >
            <FileText size={13} style={{ color: "var(--chat-text-muted)" }} />
            <span className="text-[11px]" style={{ color: "var(--chat-text-muted)" }}>从文件导入</span>
          </button>
          <input ref={infoFileRef} type="file" accept=".txt,.md" className="hidden" onChange={handleInfoFile} />
        </div>
        <textarea
          value={basicInfo}
          onChange={(e) => setBasicInfo(e.target.value)}
          placeholder="输入基本信息..."
          className="w-full rounded-xl px-4 py-3 text-base outline-none resize-none"
          style={{ background: "var(--chat-input-bg)", color: "var(--chat-text)" }}
          rows={8}
        />
      </div>

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
  );
}
