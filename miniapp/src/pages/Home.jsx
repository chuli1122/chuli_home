import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Brain, Bot, Settings, BookMarked, Theater, Heart, Cpu, Camera } from "lucide-react";
import { apiFetch } from "../utils/api";

const S = {
  bg: "var(--bg)",
  accent: "var(--accent)",
  accentDark: "var(--accent-dark)",
  text: "var(--text)",
  textMuted: "var(--text-muted)",
};

function GridCard({ icon, label, hint, accent, disabled, onClick }) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      className="flex flex-col items-center justify-center gap-3 rounded-[20px] p-4 transition-all select-none"
      style={{
        background: S.bg,
        boxShadow: pressed
          ? "inset 4px 4px 10px rgba(174,176,182,0.6), inset -4px -4px 10px #ffffff"
          : "6px 6px 14px rgba(174,176,182,0.5), -6px -6px 14px #ffffff",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onTouchStart={() => !disabled && setPressed(true)}
      onTouchEnd={() => { setPressed(false); if (!disabled) onClick?.(); }}
      onMouseDown={() => !disabled && setPressed(true)}
      onMouseUp={() => { setPressed(false); if (!disabled) onClick?.(); }}
      onMouseLeave={() => setPressed(false)}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{
          boxShadow: "inset 2px 2px 5px rgba(174,176,182,0.5), inset -2px -2px 5px #ffffff",
          background: S.bg,
        }}
      >
        {icon}
      </div>
      <div className="text-center">
        <div className="text-[13px] font-semibold" style={{ color: accent ? S.accentDark : S.text }}>
          {label}
        </div>
        {hint && (
          <div className="mt-0.5 text-[10px]" style={{ color: S.textMuted }}>
            {hint}
          </div>
        )}
      </div>
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <div
      className="mb-3 text-[11px] font-bold uppercase tracking-widest"
      style={{ color: S.textMuted }}
    >
      {children}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    apiFetch("/api/user/profile")
      .then((d) => setProfile(d))
      .catch(() => {});
  }, []);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("whisper_token");
      const res = await fetch("https://chat.chuli.win/api/upload-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const updated = await apiFetch("/api/user/profile", {
        method: "PUT",
        body: { ...(profile || {}), avatar_url: data.url },
      });
      setProfile(updated);
    } catch {
      // silently ignore
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const avatarUrl = profile?.avatar_url;
  const nickname = profile?.nickname || "阿怀";

  return (
    <div
      className="page-scroll flex flex-col"
      style={{ background: S.bg, minHeight: "100%" }}
    >
      <div className="flex flex-col px-6 pb-10 pt-[max(2rem,env(safe-area-inset-top))]">
        {/* Title */}
        <h1
          className="mb-6 text-center text-[28px] font-bold tracking-[0.3em]"
          style={{
            color: S.text,
            textShadow: "2px 2px 4px rgba(174,176,182,0.5), -1px -1px 3px #ffffff",
            letterSpacing: "0.35em",
          }}
        >
          WHISPER
        </h1>

        {/* Profile card */}
        <div
          className="mb-8 flex items-center gap-4 rounded-[24px] p-5"
          style={{
            background: S.bg,
            boxShadow: "var(--card-shadow)",
          }}
        >
          <button
            className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full"
            style={{ boxShadow: "var(--card-shadow-sm)", background: S.bg }}
            onClick={() => fileRef.current?.click()}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              <Heart size={28} style={{ color: S.accent }} />
            )}
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full" style={{ background: "rgba(232,160,191,0.6)" }}>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              </div>
            )}
            {!uploading && (
              <div className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: S.accentDark }}>
                <Camera size={10} color="white" />
              </div>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          <div className="flex-1 min-w-0">
            <div className="text-[17px] font-bold truncate" style={{ color: S.text }}>
              {nickname}
            </div>
            <div className="mt-0.5 text-[12px]" style={{ color: S.textMuted }}>
              你好，今天也是美好的一天 ✨
            </div>
          </div>
        </div>

        {/* 管理 Section */}
        <SectionLabel>管理</SectionLabel>
        <div className="mb-8 grid grid-cols-2 gap-4">
          <GridCard
            icon={<BookOpen size={22} style={{ color: S.accentDark }} />}
            label="世界书"
            hint="知识库管理"
            accent
            onClick={() => navigate("/world-books")}
          />
          <GridCard
            icon={<Brain size={22} style={{ color: S.textMuted }} />}
            label="记忆管理"
            hint="开发中"
            disabled
          />
          <GridCard
            icon={<Bot size={22} style={{ color: S.text }} />}
            label="助手配置"
            hint="人设 · 模型"
            onClick={() => navigate("/assistants")}
          />
          <GridCard
            icon={<Settings size={22} style={{ color: S.text }} />}
            label="设置"
            hint="API · 参数"
            onClick={() => navigate("/settings")}
          />
        </div>

        {/* 空间 Section */}
        <SectionLabel>空间</SectionLabel>
        <div className="mb-8 grid grid-cols-2 gap-4">
          <GridCard
            icon={<BookMarked size={22} style={{ color: S.textMuted }} />}
            label="日记"
            hint="开发中"
            disabled
          />
          <GridCard
            icon={<Theater size={22} style={{ color: S.textMuted }} />}
            label="小剧场"
            hint="开发中"
            disabled
          />
          <GridCard
            icon={<Cpu size={22} style={{ color: S.text }} />}
            label="COT 日志"
            hint="思考过程"
            onClick={() => navigate("/cot")}
          />
        </div>

        {/* Heart widget */}
        <div className="flex justify-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{
              background: S.bg,
              boxShadow: "var(--card-shadow-sm)",
            }}
          >
            <Heart size={24} fill={S.accent} style={{ color: S.accent }} />
          </div>
        </div>
      </div>
    </div>
  );
}
