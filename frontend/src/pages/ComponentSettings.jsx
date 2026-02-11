import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, User2, Calendar, MessageCircle, BookText, Palette, Settings, MoreHorizontal, Check, Trash2, Image as ImageIcon, Plus, RotateCcw, Heart, Link, ExternalLink, Globe, Book, Clapperboard } from "lucide-react";
import Modal from "../components/Modal";
import ConfirmModal from "../components/ConfirmModal";
import { saveImage, deleteImage, loadImageUrl, isExternalUrl } from "../utils/db";

// Helper Components
const PresetItem = ({ preset, onSelect, onDelete }) => {
  return (
    <div className="flex w-full items-center gap-2">
      <button
        onClick={() => onSelect(preset)}
        className="flex flex-1 items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 active:scale-95 transition"
      >
        <span>{preset.name}</span>
        <span className="text-xs text-gray-400">{new Date(preset.id).toLocaleDateString()}</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          onDelete(preset.id);
        }}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors duration-200"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};

// Mock Components for Preview
const PreviewIcon = ({ style, customIcons }) => {
  const widgets = [
    { label: "情侣空间", icon: Heart, id: 'widget_love' },
    { label: "世界书", icon: Globe, id: 'widget_world' },
    { label: "日记", icon: Book, id: 'widget_diary' },
    { label: "小剧场", icon: Clapperboard, id: 'widget_theater' },
    { label: "待定1", icon: Plus, id: 'widget_tbd1' },
    { label: "待定2", icon: Plus, id: 'widget_tbd2' },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 p-4">
      {widgets.map((item) => {
        const customUrl = customIcons?.[item.id];
        return (
          <div key={item.label} className="flex flex-col items-center justify-center gap-2 transition-all duration-300">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-[20px] shadow-lg shadow-black/5">
              <div className="absolute inset-0 rounded-[20px] overflow-hidden">
                <div 
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ 
                    backgroundColor: style.backgroundImage ? 'transparent' : style.color,
                    backgroundImage: style.backgroundImage ? `url(${style.backgroundImage})` : 'none',
                    opacity: style.opacity / 100,
                    backdropFilter: style.material === 'glass' ? 'blur(20px)' : style.material === 'frost' ? 'blur(10px)' : 'none',
                  }}
                />
                <div 
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundColor: style.material === 'glass' ? 'rgba(255,255,255,0.1)' : style.material === 'frost' ? 'rgba(255,255,255,0.3)' : 'transparent',
                  }}
                />
                {(style.material === 'glass' || style.material === 'frost') && (
                  <div className="absolute inset-0 pointer-events-none rounded-[20px] border border-white/20" />
                )}
              </div>
              
              {customUrl ? (
                <img 
                  src={customUrl} 
                  alt={item.label} 
                  className="relative z-10 h-full w-full object-cover rounded-[20px]" 
                  style={{ opacity: (style.opacity ?? 100) / 100 }}
                />
              ) : (
                <item.icon size={28} className="relative z-10 text-black" />
              )}
            </div>
            <span className="text-[11px] font-medium text-black/70">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
};

const PreviewProfileCard = ({ style, profile }) => (
  <div className={`relative w-full overflow-hidden rounded-[32px] text-center transition-all duration-300 ${(style.material === 'glass' || style.material === 'frost') ? 'border border-white/20' : ''}`}>
    {/* Background Layer */}
    <div 
      className="absolute inset-0 bg-cover bg-center shadow-lg shadow-black/5 rounded-[32px]"
      style={{ 
        backgroundColor: style.backgroundImage ? 'transparent' : style.color,
        backgroundImage: style.backgroundImage ? `url(${style.backgroundImage})` : 'none',
        opacity: style.opacity / 100,
        backdropFilter: style.material === 'glass' ? 'blur(20px)' : style.material === 'frost' ? 'blur(10px)' : 'none',
      }}
    />
    
    {/* Material Overlay */}
    <div 
      className="absolute inset-0 pointer-events-none rounded-[32px]"
      style={{
        backgroundColor: style.material === 'glass' ? 'rgba(255,255,255,0.1)' : style.material === 'frost' ? 'rgba(255,255,255,0.3)' : 'transparent',
      }}
    />

    {/* Border Layer */}
    {(style.material === 'glass' || style.material === 'frost') && (
      <div className="absolute inset-0 pointer-events-none rounded-[32px] border border-white/20" />
    )}
    
    {/* Content Layer */}
    <div className="relative z-10 px-6 pb-6 pt-5">
      <div className="mx-auto flex h-[88px] w-[88px] items-center justify-center rounded-full bg-gray-50 text-black shadow-sm border-4 border-white overflow-hidden">
        {profile?.avatar ? (
          <img src={profile.avatar} alt="Avatar" className="h-full w-full object-cover" />
        ) : (
          <User2 size={32} className="text-gray-400" />
        )}
      </div>
      <div className="mt-3 h-6 w-32 mx-auto bg-black/10 rounded-full" />
      <div className="mt-2 h-4 w-48 mx-auto bg-black/5 rounded-full" />
    </div>
  </div>
);

const PreviewWidget = ({ style, type = 'countdown', countdownData }) => {
  // Calculate days remaining (same logic as CountdownWidget)
  const getDaysLeft = (dateString, repeatType = 'none') => {
    if (!dateString) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let target = new Date(dateString);
    target.setHours(0, 0, 0, 0);

    if (repeatType === 'monthly') {
      target.setFullYear(today.getFullYear());
      target.setMonth(today.getMonth());
      if (target < today) {
        target.setMonth(target.getMonth() + 1);
      }
    } else if (repeatType === 'yearly') {
      target.setFullYear(today.getFullYear());
      if (target < today) {
        target.setFullYear(target.getFullYear() + 1);
      }
    }
    
    const diff = target.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const mainEvent = countdownData?.main;
  const smallEvents = countdownData?.small || [];
  const mainDays = mainEvent ? getDaysLeft(mainEvent.date, mainEvent.repeatType) : 0;
  const isMainPast = mainDays < 0;

  return (
    <div className="relative flex aspect-square w-full flex-col items-center justify-center rounded-[24px] transition-all duration-300 overflow-hidden">
      {/* Background Layer */}
      <div 
        className="absolute inset-0 bg-cover bg-center shadow-xl shadow-black/5 rounded-[24px]"
        style={{ 
          backgroundColor: style.backgroundImage ? 'transparent' : style.color,
          backgroundImage: style.backgroundImage ? `url(${style.backgroundImage})` : 'none',
          opacity: style.opacity / 100,
          backdropFilter: style.material === 'glass' ? 'blur(20px)' : style.material === 'frost' ? 'blur(10px)' : 'none',
        }}
      />

      {/* Material Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none rounded-[24px]"
        style={{
          backgroundColor: style.material === 'glass' ? 'rgba(255,255,255,0.1)' : style.material === 'frost' ? 'rgba(255,255,255,0.3)' : 'transparent',
        }}
      />

      {/* Border Layer */}
      {(style.material === 'glass' || style.material === 'frost') && (
        <div className="absolute inset-0 pointer-events-none rounded-[24px] border border-white/30" />
      )}

      {/* Content Layer */}
      <div className="relative z-10 w-full h-full">
        {type === 'countdown' ? (
          <div className="flex flex-col w-full h-full">
            {/* Big Event (Top) */}
            <div className="relative flex flex-1 flex-col items-center justify-center p-4">
              <span className="text-xs font-medium text-black mb-1">{mainEvent?.title || '暂无事件'}</span>
              <div className="flex items-baseline gap-1">
                {!isMainPast && <span className="text-xs font-medium text-black mr-0.5">还有</span>}
                <span className="text-4xl font-bold text-black">{mainEvent ? Math.abs(mainDays) : '--'}</span>
                <span className="text-xs font-medium text-black">{isMainPast ? '天前' : '天'}</span>
              </div>
              <span className="text-[10px] text-black mt-1">{mainEvent?.date || '--'}</span>
            </div>

            {/* Small Events (Bottom) */}
            <div className="flex h-[35%] w-full border-t border-dashed border-black/10">
              {smallEvents.map((event, index) => {
                const days = getDaysLeft(event.date, event.repeatType);
                const isPast = days < 0;
                return (
                  <div key={event.id || index} className={`flex flex-1 flex-col items-center justify-center px-1 py-0.5 ${index === 0 && smallEvents.length > 1 ? 'border-r border-dashed border-black/10' : ''}`}>
                    <span className="truncate font-medium text-black" style={{ fontSize: '8px', lineHeight: '1.2' }}>{event.title}</span>
                    <div className="flex items-end gap-0.5">
                      {!isPast && <span className="text-black whitespace-nowrap" style={{ fontSize: '7px', lineHeight: '1.2' }}>还有</span>}
                      <span className="font-bold text-black" style={{ fontSize: '14px', lineHeight: '1' }}>{Math.abs(days)}</span>
                      <span className="text-black whitespace-nowrap" style={{ fontSize: '7px', lineHeight: '1.2' }}>{isPast ? '天前' : '天'}</span>
                    </div>
                  </div>
                );
              })}
              {smallEvents.length === 0 && (
                <>
                  <div className="flex flex-1 flex-col items-center justify-center px-1 py-0.5 border-r border-dashed border-black/10">
                    <span className="truncate font-medium text-black" style={{ fontSize: '8px', lineHeight: '1.2' }}>暂无</span>
                    <div className="flex items-end gap-0.5">
                      <span className="font-bold text-black" style={{ fontSize: '14px', lineHeight: '1' }}>--</span>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col items-center justify-center px-1 py-0.5">
                    <span className="truncate font-medium text-black" style={{ fontSize: '8px', lineHeight: '1.2' }}>暂无</span>
                    <div className="flex items-end gap-0.5">
                      <span className="font-bold text-black" style={{ fontSize: '14px', lineHeight: '1' }}>--</span>
                    </div>
                  </div>
                </>
              )}
              {smallEvents.length === 1 && <div className="flex-1" />}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full text-gray-400">
            <div className="h-14 w-14 rounded-[18px] bg-black/5 mb-2" />
            <span className="text-xs font-medium">待定</span>
          </div>
        )}
      </div>
    </div>
  );
};

const PreviewDock = ({ style, customIcons }) => {
  const dockItems = [
    { icon: MessageCircle, id: 'dock_chat' },
    { icon: BookText, id: 'dock_memory' },
    { icon: Palette, id: 'dock_theme' },
    { icon: Settings, id: 'dock_settings' },
  ];

  return (
    <div className="relative w-full rounded-[36px] transition-all duration-300 overflow-hidden">
      {/* Background Layer */}
      <div 
        className="absolute inset-0 bg-cover bg-center shadow-2xl shadow-black/10 rounded-[36px]"
        style={{ 
          backgroundColor: style.backgroundImage ? 'transparent' : style.color,
          backgroundImage: style.backgroundImage ? `url(${style.backgroundImage})` : 'none',
          opacity: style.opacity / 100,
          backdropFilter: style.material === 'glass' ? 'blur(20px)' : style.material === 'frost' ? 'blur(10px)' : 'none',
        }}
      />

      {/* Material Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none rounded-[36px]"
        style={{
          backgroundColor: style.material === 'glass' ? 'rgba(255,255,255,0.1)' : style.material === 'frost' ? 'rgba(255,255,255,0.3)' : 'transparent',
        }}
      />

      {/* Border Layer */}
      {(style.material === 'glass' || style.material === 'frost') && (
        <div className="absolute inset-0 pointer-events-none rounded-[36px] border border-white/20" />
      )}

      {/* Content Layer */}
      <div className="relative z-10 flex w-full items-center justify-between px-8 py-4">
        {dockItems.map((item, i) => {
          const customUrl = customIcons?.[item.id];
          return (
            <div key={i} className="relative h-14 w-14 rounded-[18px] shadow-lg shadow-black/10 overflow-hidden">
              {/* Icon Background - Separate Opacity */}
              <div 
                className="absolute inset-0 bg-white/60 backdrop-blur-md transition-opacity duration-300"
                style={{ opacity: (style.iconOpacity !== undefined ? style.iconOpacity : 100) / 100 }}
              />
              {/* Icon Content */}
              <div className="absolute inset-0 flex items-center justify-center">
                {customUrl ? (
                  <img 
                    src={customUrl} 
                    alt="icon" 
                    className="h-full w-full object-cover transition-opacity duration-300"
                    style={{ opacity: (style.iconOpacity !== undefined ? style.iconOpacity : 100) / 100 }}
                  />
                ) : (
                  <item.icon size={28} className="text-black relative z-10" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TabButton = ({ active, label, onClick }) => (
  <button
    onClick={onClick}
    className={`flex-1 py-3 text-[15px] font-medium transition-colors relative ${
      active ? "text-black" : "text-gray-400"
    }`}
  >
    {label}
    {active && (
      <div className="absolute bottom-0 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-black" />
    )}
  </button>
);

const MaterialOption = ({ active, label, onClick }) => (
  <button
    onClick={onClick}
    className={`flex-1 rounded-xl py-2.5 text-xs font-medium transition-all ${
      active
        ? "bg-black text-white shadow-md"
        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
    }`}
  >
    {label}
  </button>
);

const PresetModal = ({ isOpen, onClose, onSave, onSelect, onDelete, presets }) => {
  const [mode, setMode] = useState('select'); // 'select' | 'save'
  const [presetName, setPresetName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }

  useEffect(() => {
    if (isOpen) {
      setMode('select');
      setPresetName('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-8" onClick={onClose}>
        <div 
          className="w-full max-w-[320px] rounded-[24px] bg-white p-6 shadow-2xl animate-in fade-in zoom-in duration-200"
          onClick={e => e.stopPropagation()}
        >
          <h3 className="mb-6 text-center text-[17px] font-bold text-black">预设管理</h3>
          
          <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
            <button 
              onClick={() => setMode('select')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${mode === 'select' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
            >
              选择预设
            </button>
            <button 
              onClick={() => setMode('save')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${mode === 'save' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
            >
              存为预设
            </button>
          </div>

          {mode === 'select' ? (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {presets.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-4">暂无预设</p>
              ) : (
                presets.map((preset) => (
                  <PresetItem
                    key={preset.id}
                    preset={preset}
                    onSelect={() => {
                      onSelect(preset);
                      onClose();
                    }}
                    onDelete={(id) => setDeleteTarget({ id, name: preset.name })}
                  />
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="输入预设名称..."
                className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-[15px] text-black outline-none focus:ring-2 focus:ring-black/5 placeholder:text-gray-400"
              />
              <button
                onClick={() => {
                  if (presetName.trim()) {
                    onSave(presetName.trim());
                    // Don't close modal here
                    setPresetName(''); 
                  }
                }}
                disabled={!presetName.trim()}
                className="w-full rounded-full bg-black py-3 text-[15px] font-bold text-white shadow-lg shadow-black/20 transition active:scale-95 disabled:opacity-50 disabled:active:scale-100"
              >
                保存
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            onDelete(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        title="删除提醒"
        message={deleteTarget ? `确定要删除“${deleteTarget.name}”吗？` : ""}
        confirmText="删除"
        type="danger"
      />
    </>
  );
};

export default function ComponentSettings() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState("profile"); // 'profile' | 'widget' | 'icon' | 'dock'
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [presets, setPresets] = useState([]);
  const [activeWidgetPage, setActiveWidgetPage] = useState(0);
  const [userProfile, setUserProfile] = useState({ avatar: null });
  const [countdownData, setCountdownData] = useState({ main: null, small: [] });
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [customIcons, setCustomIcons] = useState({});
  const [resolvedBgImages, setResolvedBgImages] = useState({});
  const [resolvedAvatar, setResolvedAvatar] = useState(null);
  const [resolvedIcons, setResolvedIcons] = useState({});

  // Helper to get display-ready style (resolved blob URLs for preview)
  const getDisplayStyle = (tab) => ({
    ...settings[tab],
    backgroundImage: resolvedBgImages[tab] || settings[tab]?.backgroundImage || null,
  });

  // Default Settings
  const defaultSettings = {
    profile: { opacity: 40, material: 'glass', color: '#ffffff', backgroundImage: null },
    widget: { opacity: 40, material: 'glass', color: '#ffffff', backgroundImage: null },
    icon: { opacity: 40, material: 'glass', color: '#ffffff', backgroundImage: null },
    dock: { opacity: 30, material: 'glass', color: '#ffffff', backgroundImage: null, iconOpacity: 100 },
  };
  
  const [settings, setSettings] = useState(defaultSettings);

  useEffect(() => {
    const init = async () => {
      // Load component styles
      try {
        const savedSettings = JSON.parse(localStorage.getItem("component-styles"));
        if (savedSettings) {
          setSettings(prev => ({
            profile: { ...prev.profile, ...savedSettings.profile },
            widget: { ...prev.widget, ...savedSettings.widget },
            icon: { ...prev.icon, ...savedSettings.icon },
            dock: { ...prev.dock, ...savedSettings.dock },
          }));

          // Resolve background images from IndexedDB
          const resolved = {};
          for (const key of ['profile', 'widget', 'icon', 'dock']) {
            const bg = savedSettings[key]?.backgroundImage;
            if (bg && isExternalUrl(bg)) {
              resolved[key] = bg;
            } else if (bg) {
              const url = await loadImageUrl(bg);
              if (url) resolved[key] = url;
            }
          }
          setResolvedBgImages(resolved);
        }
      } catch (e) {
        console.error("Failed to load settings", e);
      }

      const savedPresets = JSON.parse(localStorage.getItem("component-presets") || "[]");
      setPresets(savedPresets);

      // Load user profile + resolve avatar
      try {
        const savedProfile = JSON.parse(localStorage.getItem("user-profile"));
        if (savedProfile) {
          setUserProfile(savedProfile);
          if (savedProfile.avatar && !isExternalUrl(savedProfile.avatar)) {
            const url = await loadImageUrl(savedProfile.avatar);
            if (url) setResolvedAvatar(url);
          } else if (savedProfile.avatar) {
            setResolvedAvatar(savedProfile.avatar);
          }
        }
      } catch (e) {
        console.error("Failed to load user profile", e);
      }

      try {
        const savedEvents = JSON.parse(localStorage.getItem("countdown-events") || "[]");
        if (savedEvents.length > 0) {
          setCountdownData({
            main: savedEvents[0],
            small: savedEvents.slice(1, 3)
          });
        }
      } catch (e) {
        console.error("Failed to load countdown events", e);
      }

      // Load custom icons + resolve from IndexedDB
      try {
        const savedIcons = JSON.parse(localStorage.getItem("custom-icons") || "{}");
        setCustomIcons(savedIcons);
        const resolved = {};
        for (const [id, value] of Object.entries(savedIcons)) {
          if (isExternalUrl(value)) {
            resolved[id] = value;
          } else if (value) {
            const url = await loadImageUrl(value);
            if (url) resolved[id] = url;
          }
        }
        setResolvedIcons(resolved);
      } catch (e) {
        console.error("Failed to load custom icons", e);
      }
    };

    init();

    const handleIconsUpdate = async () => {
      try {
        const savedIcons = JSON.parse(localStorage.getItem("custom-icons") || "{}");
        setCustomIcons(savedIcons);
        const resolved = {};
        for (const [id, value] of Object.entries(savedIcons)) {
          if (isExternalUrl(value)) {
            resolved[id] = value;
          } else if (value) {
            const url = await loadImageUrl(value);
            if (url) resolved[id] = url;
          }
        }
        setResolvedIcons(resolved);
      } catch (e) {
        console.error("Failed to load custom icons", e);
      }
    };

    window.addEventListener('custom-icons-updated', handleIconsUpdate);
    return () => {
      window.removeEventListener('custom-icons-updated', handleIconsUpdate);
    };
  }, []);

  const updateSetting = (key, value) => {
    const newSettings = {
      ...settings,
      [activeTab]: { ...settings[activeTab], [key]: value }
    };
    setSettings(newSettings);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const imageKey = `component_bg_${activeTab}`;

      // Delete previous blob if it was in IndexedDB
      const prevBg = settings[activeTab]?.backgroundImage;
      if (prevBg && !isExternalUrl(prevBg)) {
        await deleteImage(prevBg);
      }

      await saveImage(imageKey, file);
      const blobUrl = URL.createObjectURL(file);
      setResolvedBgImages(prev => ({ ...prev, [activeTab]: blobUrl }));
      updateSetting('backgroundImage', imageKey);
      e.target.value = null;
    }
  };

  const handleUrlSubmit = (url) => {
    if (url) {
      // Delete previous blob if it was in IndexedDB
      const prevBg = settings[activeTab]?.backgroundImage;
      if (prevBg && !isExternalUrl(prevBg)) {
        deleteImage(prevBg);
      }
      setResolvedBgImages(prev => ({ ...prev, [activeTab]: url }));
      updateSetting('backgroundImage', url);
    }
    setUrlModalOpen(false);
    setImageUrl("");
  };

  const clearImage = async () => {
    const prevBg = settings[activeTab]?.backgroundImage;
    if (prevBg && !isExternalUrl(prevBg)) {
      await deleteImage(prevBg);
    }
    setResolvedBgImages(prev => {
      const updated = { ...prev };
      delete updated[activeTab];
      return updated;
    });
    updateSetting('backgroundImage', null);
  };

  const handleReset = () => {
    const newSettings = {
      ...settings,
      [activeTab]: { ...defaultSettings[activeTab] }
    };
    setSettings(newSettings);
  };

  const [toast, setToast] = useState({ show: false, message: '' });

  const showToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ ...toast, show: false }), 2000);
  };

  const handleSaveAndApply = () => {
    localStorage.setItem("component-styles", JSON.stringify(settings));
    window.dispatchEvent(new Event("component-style-updated"));
    showToast("保存成功");
  };

  const handleSavePreset = (name) => {
    const newPreset = {
      id: Date.now(),
      name,
      settings: { ...settings }
    };
    const updatedPresets = [newPreset, ...presets];
    setPresets(updatedPresets);
    localStorage.setItem("component-presets", JSON.stringify(updatedPresets));
    showToast("保存成功");
  };

  const handleDeletePreset = (id) => {
    const updatedPresets = presets.filter(p => p.id !== id);
    setPresets(updatedPresets);
    localStorage.setItem("component-presets", JSON.stringify(updatedPresets));
  };

  const handleSelectPreset = (preset) => {
    setSettings(preset.settings);
  };

  const handleWidgetScroll = (e) => {
    const scrollLeft = e.target.scrollLeft;
    const width = e.target.offsetWidth;
    const page = Math.round(scrollLeft / width);
    setActiveWidgetPage(page);
  };

  const currentStyle = getDisplayStyle(activeTab);

  return (
    <div className="flex h-full flex-col bg-[#F5F5F7] text-black">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pb-4 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <button 
          onClick={() => navigate("/theme", { replace: true })}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm active:scale-95 transition"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-bold">组件设置</h1>
        <button 
          onClick={() => setIsPresetModalOpen(true)}
          className="flex h-10 px-4 items-center justify-center rounded-full bg-white shadow-sm text-[13px] font-medium active:scale-95 transition"
        >
          预设
        </button>
      </div>

      {/* Preview Area */}
      <div className="flex-1 flex items-center justify-center p-8 min-h-0">
        <div className="relative aspect-[9/19.5] h-full max-h-[500px] w-full overflow-hidden rounded-[32px] border-[6px] border-black bg-gray-200 shadow-2xl flex flex-col">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-100 to-pink-100 bg-cover bg-center" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1000&auto=format&fit=crop)' }} />
          
          <div className="relative z-10 flex h-full flex-col p-4">
            {activeTab === 'profile' && (
              <div className="mt-4 transition-all duration-300 animate-in fade-in slide-in-from-top-4">
                <PreviewProfileCard style={getDisplayStyle('profile')} profile={{ ...userProfile, avatar: resolvedAvatar }} />
              </div>
            )}
            
            {activeTab === 'widget' && (
              <div className="flex-1 flex flex-col items-center justify-center w-full overflow-hidden">
                <div 
                  className="flex w-full overflow-x-auto snap-x snap-mandatory no-scrollbar items-center h-64"
                  onScroll={handleWidgetScroll}
                >
                  <div className="snap-center shrink-0 w-full flex justify-center">
                    <div className="w-40 h-40">
                      <PreviewWidget style={getDisplayStyle('widget')} type="countdown" countdownData={countdownData} />
                    </div>
                  </div>
                  <div className="snap-center shrink-0 w-full flex justify-center">
                    <div className="w-40 h-40">
                      <PreviewWidget style={getDisplayStyle('widget')} type="placeholder" />
                    </div>
                  </div>
                  <div className="snap-center shrink-0 w-full flex justify-center">
                    <div className="w-40 h-40">
                      <PreviewWidget style={getDisplayStyle('widget')} type="placeholder" />
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-center gap-2 mt-6">
                  {[0, 1, 2].map((i) => (
                    <div 
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full transition-colors ${
                        activeWidgetPage === i ? "bg-black/50" : "bg-black/10"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'icon' && (
              <div className="flex-1 flex items-center justify-center animate-in fade-in zoom-in duration-300 w-full">
                <PreviewIcon style={getDisplayStyle('icon')} customIcons={resolvedIcons} />
              </div>
            )}

            {activeTab === 'dock' && (
              <div className="mt-auto mb-4 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4">
                <PreviewDock style={getDisplayStyle('dock')} customIcons={resolvedIcons} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls Area */}
      <div className="bg-white rounded-t-[32px] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pb-[calc(2rem+env(safe-area-inset-bottom))] flex flex-col max-h-[50%]">
        
        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6 shrink-0">
          <TabButton active={activeTab === 'profile'} label="资料卡" onClick={() => setActiveTab('profile')} />
          <TabButton active={activeTab === 'widget'} label="小组件" onClick={() => setActiveTab('widget')} />
          <TabButton active={activeTab === 'icon'} label="图标" onClick={() => setActiveTab('icon')} />
          <TabButton active={activeTab === 'dock'} label="Dock栏" onClick={() => setActiveTab('dock')} />
        </div>

        {/* Settings - Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-6">
          
            {/* Background/Container Opacity Slider */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <label className="text-xs font-medium text-gray-500">{activeTab === 'dock' ? 'Dock栏透明度' : '透明度'}</label>
                <span className="text-xs font-bold">{currentStyle.opacity}%</span>
              </div>
              <div className="relative h-2 w-full rounded-full bg-gray-100">
                <div 
                  className="absolute left-0 top-0 h-full bg-black rounded-full" 
                  style={{ width: `${currentStyle.opacity}%` }}
                />
                <div 
                  className="absolute top-1/2 -translate-y-1/2 h-4 w-4 bg-white border-2 border-black rounded-full shadow-sm pointer-events-none"
                  style={{ left: `${currentStyle.opacity}%`, transform: `translate(-50%, -50%)` }} 
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={currentStyle.opacity}
                  onChange={(e) => updateSetting('opacity', parseInt(e.target.value))}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </div>
            </div>

            {/* Dock Icon Opacity - Only for Dock tab */}
            {activeTab === 'dock' && (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-xs font-medium text-gray-500">图标透明度</label>
                  <span className="text-xs font-bold">{currentStyle.iconOpacity ?? 100}%</span>
                </div>
                <div className="relative h-2 w-full rounded-full bg-gray-100">
                  <div 
                    className="absolute left-0 top-0 h-full bg-black rounded-full" 
                    style={{ width: `${currentStyle.iconOpacity ?? 100}%` }}
                  />
                  <div 
                    className="absolute top-1/2 -translate-y-1/2 h-4 w-4 bg-white border-2 border-black rounded-full shadow-sm pointer-events-none"
                    style={{ left: `${currentStyle.iconOpacity ?? 100}%`, transform: `translate(-50%, -50%)` }} 
                  />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={currentStyle.iconOpacity ?? 100}
                    onChange={(e) => updateSetting('iconOpacity', parseInt(e.target.value))}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </div>
              </div>
            )}

            {/* Material Selector */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-gray-500">材质</label>
              <div className="flex gap-2">
                <MaterialOption 
                  active={currentStyle.material === 'glass'} 
                  label="毛玻璃" 
                  onClick={() => updateSetting('material', 'glass')} 
                />
                <MaterialOption 
                  active={currentStyle.material === 'frost'} 
                  label="磨砂" 
                  onClick={() => updateSetting('material', 'frost')} 
                />
                <MaterialOption 
                  active={currentStyle.material === 'solid'} 
                  label="纯色" 
                  onClick={() => updateSetting('material', 'solid')} 
                />
              </div>
            </div>

            {/* Custom Image / Icon Link */}
            {activeTab === 'icon' ? (
              <div className="space-y-3">
                <label className="text-xs font-medium text-gray-500">图标内容</label>
                <button
                  onClick={() => navigate("/theme/icons", { replace: true })}
                  className="relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 text-gray-500 transition active:scale-95 hover:bg-gray-100"
                >
                  <ExternalLink size={16} />
                  <span className="text-xs font-medium">去设置图标样式</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="text-xs font-medium text-gray-500">自定义图片</label>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 text-gray-400 transition active:scale-95 hover:bg-gray-100"
                  >
                    {currentStyle.backgroundImage ? (
                      <img 
                        src={currentStyle.backgroundImage} 
                        alt="Background" 
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon size={20} />
                    )}
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      accept="image/*"
                      className="hidden"
                    />
                  </button>

                  <button 
                    onClick={() => setUrlModalOpen(true)}
                    className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 text-gray-400 transition active:scale-95 hover:bg-gray-100"
                  >
                    <Link size={20} />
                  </button>
                  
                  {currentStyle.backgroundImage ? (
                    <div className="flex flex-1 items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                      <span className="text-xs text-gray-500 truncate max-w-[120px]">已选择图片</span>
                      <button 
                        onClick={clearImage}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-red-100 hover:text-red-500 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-400">
                      上传或粘贴图片链接
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleReset}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition active:scale-95"
              >
                <RotateCcw size={20} />
              </button>
              <button
                onClick={handleSaveAndApply}
                className="flex-1 rounded-full bg-black py-3.5 text-[15px] font-bold text-white shadow-lg shadow-black/20 transition active:scale-95"
              >
                保存并应用
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Preset Modal */}
      <PresetModal 
        isOpen={isPresetModalOpen}
        onClose={() => setIsPresetModalOpen(false)}
        onSave={handleSavePreset}
        onSelect={handleSelectPreset}
        onDelete={handleDeletePreset}
        presets={presets}
      />

      {/* URL Input Modal */}
      <Modal
        isOpen={urlModalOpen}
        onClose={() => setUrlModalOpen(false)}
        title="输入图片链接"
        onConfirm={() => handleUrlSubmit(imageUrl)}
        isConfirmDisabled={!imageUrl.trim()}
      >
        <input
          type="text"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://example.com/image.png"
          className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-[15px] text-black outline-none focus:ring-0 placeholder:text-gray-400"
        />
      </Modal>

      {/* Toast */}
      {toast.show && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] animate-in fade-in zoom-in duration-200">
          <div className="bg-black/80 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-lg font-medium text-sm">
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
