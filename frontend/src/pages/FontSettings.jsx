import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Plus, Type as TypeIcon, Trash2, Check, ExternalLink, Link as LinkIcon, Upload, RotateCcw, Palette } from "lucide-react";
import Modal from "../components/Modal";
import { saveFont, getAllFonts, deleteFont } from "../utils/db";

// System/Web Safe Fonts
const SYSTEM_FONTS = [
  { id: 'system-ui', name: '系统默认', value: 'system-ui, -apple-system, sans-serif' },
  { id: 'serif', name: '宋体 / Serif', value: 'serif' },
  { id: 'mono', name: '等宽 / Mono', value: 'monospace' },
  { id: 'cursive', name: '手写 / Cursive', value: 'cursive' },
];

export default function FontSettings() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [settings, setSettings] = useState({
    activeFontId: 'system-ui', // id of active font
    fontSizeScale: 100, // percentage, 100 = 16px (1rem)
  });

  const [customFonts, setCustomFonts] = useState([]);
  const [modalOpen, setModalOpen] = useState(false); // 'url' | 'upload' | null
  const [urlInput, setUrlInput] = useState("");
  const [fontNameInput, setFontNameInput] = useState("");
  const [toast, setToast] = useState({ show: false, message: '' });

  // Load initial settings and fonts
  useEffect(() => {
    loadSettings();
    loadFonts();
  }, []);

  const loadSettings = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("font-settings"));
      if (saved) {
        setSettings(saved);
      }
    } catch (e) {
      console.error("Failed to load font settings", e);
    }
  };

  const loadFonts = async () => {
    try {
      const fonts = await getAllFonts();
      setCustomFonts(fonts);
      
      // Inject font faces for custom fonts
      fonts.forEach(font => {
        injectFontFace(font);
      });
    } catch (e) {
      console.error("Failed to load custom fonts", e);
    }
  };

  const showToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ ...toast, show: false }), 2000);
  };

  const injectFontFace = (font) => {
    const styleId = `font-face-${font.id}`;
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    
    let src = '';
    if (font.type === 'url') {
      src = `url('${font.source}')`;
    } else if (font.type === 'file') {
      // Create Blob URL
      const blob = new Blob([font.source], { type: font.mimeType });
      const url = URL.createObjectURL(blob);
      src = `url('${url}')`;
    }

    style.textContent = `
      @font-face {
        font-family: '${font.name}';
        src: ${src};
        font-display: swap;
      }
    `;
    document.head.appendChild(style);
  };

  const handleSaveSettings = () => {
    localStorage.setItem("font-settings", JSON.stringify(settings));
    window.dispatchEvent(new Event("font-settings-updated"));
    showToast("应用成功");
  };

  const handleReset = () => {
    const defaultSettings = {
      activeFontId: 'system-ui',
      fontSizeScale: 100,
    };
    setSettings(defaultSettings);
    localStorage.setItem("font-settings", JSON.stringify(defaultSettings));
    window.dispatchEvent(new Event("font-settings-updated"));
    showToast("已重置");
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim() || !fontNameInput.trim()) return;
    
    const newFont = {
      id: `custom-${Date.now()}`,
      name: fontNameInput.trim(),
      type: 'url',
      source: urlInput.trim(),
      addedAt: Date.now(),
    };

    try {
      await saveFont(newFont);
      injectFontFace(newFont);
      setCustomFonts(prev => [...prev, newFont]);
      setModalOpen(false);
      setUrlInput("");
      setFontNameInput("");
      showToast("字体添加成功");
    } catch (e) {
      console.error("Failed to save font", e);
      showToast("添加失败");
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Simple validation
    const validExts = ['.ttf', '.otf', '.woff', '.woff2'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExts.includes(ext)) {
      showToast("不支持的文件格式");
      return;
    }

    // Limit size (e.g., 10MB for IndexedDB is usually fine, but good to check)
    if (file.size > 20 * 1024 * 1024) {
      showToast("文件过大 (>20MB)");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const buffer = event.target.result;
      const name = file.name.replace(ext, '');
      
      const newFont = {
        id: `custom-${Date.now()}`,
        name: name,
        type: 'file',
        source: buffer, // ArrayBuffer
        mimeType: file.type,
        addedAt: Date.now(),
      };

      try {
        await saveFont(newFont);
        injectFontFace(newFont);
        setCustomFonts(prev => [...prev, newFont]);
        showToast("字体上传成功");
      } catch (err) {
        console.error(err);
        showToast("保存失败");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = null; // Reset input
  };

  const handleDeleteFont = async (id, e) => {
    e.stopPropagation();
    try {
      await deleteFont(id);
      setCustomFonts(prev => prev.filter(f => f.id !== id));
      
      // If deleted font was active, revert to system
      if (settings.activeFontId === id) {
        setSettings(prev => ({ ...prev, activeFontId: 'system-ui' }));
      }

      // Remove style tag
      const styleTag = document.getElementById(`font-face-${id}`);
      if (styleTag) styleTag.remove();
      
      showToast("已删除");
    } catch (err) {
      console.error(err);
      showToast("删除失败");
    }
  };

  // Resolve current active font name for preview
  const getActiveFontFamily = () => {
    const sys = SYSTEM_FONTS.find(f => f.id === settings.activeFontId);
    if (sys) return sys.value;
    const custom = customFonts.find(f => f.id === settings.activeFontId);
    if (custom) return custom.name;
    return 'system-ui';
  };

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
        <h1 className="text-lg font-bold">字体设置</h1>
        <button 
          onClick={handleReset}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm active:scale-95 transition text-gray-500"
        >
          <RotateCcw size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-24">
        
        {/* Preview Card */}
        <div className="mb-8 rounded-[24px] bg-white p-6 shadow-sm transition-all duration-300">
          <p className="mb-2 text-xs font-medium text-gray-400">预览</p>
          <div 
            className="flex flex-col gap-2 min-h-[100px] justify-center transition-all duration-300"
            style={{ 
              fontFamily: getActiveFontFamily(),
              fontSize: `${16 * (settings.fontSizeScale / 100)}px`,
              lineHeight: 1.5
            }}
          >
            <p className="text-2xl font-bold">12:30</p>
            <p>即使是微小的星光，也能照亮整片夜空。</p>
            <p className="opacity-80 text-[0.9em]">The quick brown fox jumps over the lazy dog.</p>
          </div>
        </div>

        {/* Font Selection */}
        <div className="mb-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">选择字体</h2>
            <div className="flex gap-2">
              <button 
                onClick={() => setModalOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-gray-600 active:scale-95 transition"
              >
                <LinkIcon size={16} />
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white active:scale-95 transition shadow-lg shadow-black/20"
              >
                <Upload size={16} />
              </button>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".ttf,.otf,.woff,.woff2"
                className="hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* System Fonts */}
            {SYSTEM_FONTS.map(font => (
              <button
                key={font.id}
                onClick={() => setSettings(s => ({ ...s, activeFontId: font.id }))}
                className={`flex w-full items-center justify-between rounded-xl p-4 transition-all ${
                  settings.activeFontId === font.id 
                    ? "bg-black text-white shadow-md scale-[1.02]" 
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span style={{ fontFamily: font.value }} className="text-base">{font.name}</span>
                {settings.activeFontId === font.id && <Check size={18} />}
              </button>
            ))}

            {/* Custom Fonts */}
            {customFonts.map(font => (
              <button
                key={font.id}
                onClick={() => setSettings(s => ({ ...s, activeFontId: font.id }))}
                className={`group relative flex w-full items-center justify-between rounded-xl p-4 transition-all ${
                  settings.activeFontId === font.id 
                    ? "bg-black text-white shadow-md scale-[1.02]" 
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <div className="flex flex-col items-start overflow-hidden">
                  <span style={{ fontFamily: font.name }} className="text-base truncate max-w-[200px]">{font.name}</span>
                  <span className={`text-xs ${settings.activeFontId === font.id ? 'text-white/60' : 'text-gray-400'}`}>
                    {font.type === 'file' ? '本地文件' : '网络链接'}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  {settings.activeFontId === font.id && <Check size={18} />}
                  <div 
                    onClick={(e) => handleDeleteFont(font.id, e)}
                    className={`p-2 rounded-full transition-colors ${
                      settings.activeFontId === font.id 
                        ? 'text-white/40 hover:text-red-400 hover:bg-white/10' 
                        : 'text-gray-300 hover:text-red-500 hover:bg-gray-100'
                    }`}
                  >
                    <Trash2 size={16} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Size Slider */}
        <div className="mb-8 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">字体大小</h2>
            <span className="text-xs font-bold bg-white px-2 py-1 rounded-md shadow-sm">{settings.fontSizeScale}%</span>
          </div>
          <div className="relative h-12 flex items-center bg-white rounded-xl px-4 shadow-sm">
            <TypeIcon size={16} className="text-gray-400 mr-4" />
            <input
              type="range"
              min="75"
              max="150"
              step="5"
              value={settings.fontSizeScale}
              onChange={(e) => setSettings(s => ({ ...s, fontSizeScale: parseInt(e.target.value) }))}
              className="flex-1 h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-black"
            />
            <TypeIcon size={24} className="text-black ml-4" />
          </div>
        </div>


        {/* Action Button */}
        <button
          onClick={handleSaveSettings}
          className="w-full rounded-full bg-black py-4 text-[15px] font-bold text-white shadow-xl shadow-black/20 transition active:scale-95"
        >
          保存并应用
        </button>
      </div>

      {/* URL Input Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="添加网络字体"
        onConfirm={handleAddUrl}
        isConfirmDisabled={!urlInput.trim() || !fontNameInput.trim()}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500">字体名称</label>
            <input
              type="text"
              value={fontNameInput}
              onChange={(e) => setFontNameInput(e.target.value)}
              placeholder="例如：MiSans"
              className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-[15px] text-black outline-none focus:ring-0 placeholder:text-gray-400"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500">字体链接 (URL)</label>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/font.woff2"
              className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-[15px] text-black outline-none focus:ring-0 placeholder:text-gray-400"
            />
          </div>
        </div>
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
