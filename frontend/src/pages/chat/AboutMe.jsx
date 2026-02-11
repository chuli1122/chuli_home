import { useEffect, useState, useRef } from "react";
import { apiFetch } from "../../utils/api";
import { saveImage, loadImageUrl, deleteImage } from "../../utils/db";

const AVATAR_KEY = "user-avatar";

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
        // Load avatar from fixed IndexedDB key
        const url = await loadImageUrl(AVATAR_KEY);
        if (url) setAvatarUrl(url);
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
      // Delete old avatar then save new one with the same fixed key
      await deleteImage(AVATAR_KEY);
      await saveImage(AVATAR_KEY, file);
      const url = await loadImageUrl(AVATAR_KEY);
      setAvatarUrl(url);
      // Save the fixed key to backend
      await apiFetch("/api/user/profile", {
        method: "PUT",
        body: { avatar_url: AVATAR_KEY },
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
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-24">
      {/* Profile card: avatar left + nickname right */}
      <div className="mt-2 rounded-[24px] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#F5F5F7] overflow-hidden active:opacity-80 transition"
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
            <label className="text-xs text-gray-400 mb-1 block">昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="输入昵称"
              className="w-full rounded-xl bg-[#F5F5F7] px-4 py-2.5 text-base outline-none"
            />
          </div>
        </div>
      </div>

      {/* Basic Info card */}
      <div className="mt-4 rounded-[24px] bg-white p-5 shadow-sm">
        <label className="text-xs text-gray-400 mb-2 block">基本信息</label>
        <textarea
          value={basicInfo}
          onChange={(e) => setBasicInfo(e.target.value)}
          placeholder="输入基本信息..."
          className="w-full rounded-xl bg-[#F5F5F7] px-4 py-3 text-base outline-none resize-none"
          rows={8}
        />
      </div>

      {/* Buttons */}
      {hasChanges && (
        <div className="mt-4 flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 rounded-[20px] bg-white py-3 text-sm font-medium shadow-sm active:scale-[0.98] transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-[20px] bg-black py-3 text-sm font-medium text-white shadow-sm active:scale-[0.98] transition disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      )}
    </div>
  );
}
