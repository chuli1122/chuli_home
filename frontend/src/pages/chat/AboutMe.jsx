import { useEffect, useState, useRef } from "react";
import { apiFetch } from "../../utils/api";
import { saveImage, loadImageUrl } from "../../utils/db";

export default function AboutMe() {
  const [nickname, setNickname] = useState("");
  const [basicInfo, setBasicInfo] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [originalData, setOriginalData] = useState({});
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

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
        // Load avatar from IndexedDB
        if (data.avatar_url) {
          const url = await loadImageUrl(data.avatar_url);
          if (url) setAvatarUrl(url);
        }
      } catch (e) {
        console.error("Failed to load profile", e);
      }
    };
    loadProfile();
  }, []);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const key = `user-avatar-${Date.now()}`;
      await saveImage(key, file);
      const url = await loadImageUrl(key);
      setAvatarUrl(url);
      // Save to backend
      await apiFetch("/api/user/profile", {
        method: "PUT",
        body: { avatar_url: key },
      });
    } catch (e) {
      console.error("Failed to save avatar", e);
    }
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

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 pb-24">
      {/* Avatar + Nickname */}
      <div className="flex items-center gap-4 py-4">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-100 overflow-hidden active:opacity-80"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-2xl text-gray-400">?</span>
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
          <label className="text-xs text-gray-400">昵称</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="输入昵称"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
        </div>
      </div>

      {/* Basic Info */}
      <div className="mt-2">
        <label className="text-xs text-gray-400">基本信息</label>
        <textarea
          value={basicInfo}
          onChange={(e) => setBasicInfo(e.target.value)}
          placeholder="输入基本信息..."
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none"
          rows={8}
        />
      </div>

      {/* Buttons */}
      {hasChanges && (
        <div className="mt-4 flex gap-3">
          <button
            onClick={handleCancel}
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
      )}
    </div>
  );
}
