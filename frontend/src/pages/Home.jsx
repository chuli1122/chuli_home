import {
  Book,
  BookText,
  Clapperboard,
  Globe,
  Heart,
  ImageIcon,
  MessageCircle,
  User2,
  MessageSquare,
  Plus,
  Sparkles,
  Flower2,
  Star,
  Cloud,
  CloudRain,
} from "lucide-react";
import { useState } from "react";
import VinylWidget from "../components/VinylWidget";

const SmallWidget = ({ icon: Icon, label }) => (
  <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 transition active:scale-95">
    <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-white/40 text-black shadow-lg shadow-black/5 backdrop-blur-xl border border-white/20">
      <Icon size={28} />
    </div>
    <span className="text-[13px] font-medium text-text">{label}</span>
  </div>
);

const BigWidget = ({ children, className = "", onClick }) => (
  <div 
    onClick={onClick}
    className={`flex flex-col items-center justify-center rounded-[24px] bg-white/30 shadow-xl shadow-black/5 backdrop-blur-2xl border border-white/30 ${className}`}
  >
    {children}
  </div>
);

const WeatherWidget = () => {
  const [isRaining, setIsRaining] = useState(false);
  
  const handleClick = () => {
    if (isRaining) return;
    setIsRaining(true);
    setTimeout(() => setIsRaining(false), 2000);
  };

  return (
    <div 
      onClick={handleClick}
      className="flex h-full w-full cursor-pointer items-center justify-center transition-transform active:scale-95"
    >
       {isRaining ? (
         // Raining Cloud SVG
         <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl">
           <g fill="#94a3b8">
             <circle cx="40" cy="60" r="25" />
             <circle cx="60" cy="50" r="30" />
             <circle cx="80" cy="60" r="25" />
             <rect x="40" y="60" width="40" height="25" />
           </g>
           <path d="M45 85L43 95" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" className="animate-rain" style={{ animationDelay: '0s' }} />
           <path d="M60 85L58 100" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" className="animate-rain" style={{ animationDelay: '0.2s' }} />
           <path d="M75 85L73 95" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" className="animate-rain" style={{ animationDelay: '0.4s' }} />
         </svg>
       ) : (
         // Sunny/Cloudy SVG
         <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl transition-transform hover:scale-105">
           {/* Sun behind cloud */}
           <circle cx="80" cy="40" r="18" fill="#fcd34d" className="animate-pulse"/>
           {/* Cloud */}
           <g fill="white">
             <circle cx="40" cy="60" r="25" />
             <circle cx="60" cy="50" r="30" />
             <circle cx="80" cy="60" r="25" />
             <rect x="40" y="60" width="40" height="25" />
           </g>
         </svg>
       )}
    </div>
  );
};

const ProfileCard = () => (
  <div className="relative overflow-hidden rounded-[32px] bg-white/40 px-6 py-6 text-center shadow-lg shadow-black/5 backdrop-blur-xl border border-white/20">
    {/* Decorative Elements */}
    <div className="absolute -left-4 -top-4 h-24 w-24 rounded-full bg-blue-100/30 blur-xl" />
    <div className="absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-pink-100/30 blur-xl" />
    <Sparkles className="absolute right-6 top-6 text-yellow-400/60" size={20} />
    <Cloud className="absolute left-6 top-8 text-blue-200/60" size={16} />
    
    <button
      type="button"
      className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-gray-50 text-black shadow-sm"
      aria-label="Edit avatar"
    >
      <User2 size={32} className="text-gray-400" />
    </button>
    <h1 className="mt-4 text-xl font-bold text-text">你的昵称</h1>
    <p className="mt-2 text-xs text-muted">点击编辑个性签名...</p>
    
    {/* Status Button */}
    <div className="mt-4 flex justify-center">
      <button className="flex h-8 w-8 items-center justify-center rounded-full bg-white/50 text-black/50 shadow-sm transition hover:bg-white hover:text-black">
        <Plus size={16} />
      </button>
    </div>
  </div>
);

export default function Home() {
  const [activePage, setActivePage] = useState(0);

  const handleScroll = (e) => {
    const scrollLeft = e.target.scrollLeft;
    const width = e.target.offsetWidth;
    const page = Math.round(scrollLeft / width);
    setActivePage(page);
  };

  return (
    <div className="-mx-5 flex h-full flex-col">
      {/* Swipeable Area */}
      <div
        className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto pb-32"
        onScroll={handleScroll}
      >
        {/* Page 1 */}
        <section className="flex h-full w-full flex-shrink-0 snap-center flex-col px-8 pt-2">
          <ProfileCard />
          
          {/* Spacer below ProfileCard */}
          <div className="h-8" />
          
          <div className="flex flex-col gap-8">
            {/* Top Section: Left Big, Right Column */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left Big Widget */}
              <div className="aspect-square w-full">
                <BigWidget className="h-full w-full relative overflow-hidden bg-blue-50/30">
                  <div className="absolute -right-2 -top-2 h-20 w-20 rounded-full bg-blue-200/20 blur-xl" />
                  <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-white/50 text-blue-400 shadow-sm">
                    <ImageIcon size={28} />
                  </div>
                  <span className="mt-2 text-xs font-medium text-blue-400/80 drop-shadow-sm">点击添加图片</span>
                </BigWidget>
              </div>

              {/* Right Column */}
              <div className="flex flex-col gap-4 h-full">
                <div className="grid grid-cols-2 gap-4">
                  <SmallWidget icon={Heart} label="情侣空间" />
                  <SmallWidget icon={Globe} label="世界书" />
                </div>
                
                {/* Editable Text Area - Fills remaining height */}
                <div className="relative flex flex-1 flex-col justify-center rounded-[20px] px-4 py-3 overflow-hidden">
                  {/* Decorations */}
                  <Star className="absolute right-2 top-2 text-yellow-400/40" size={12} />
                  
                  <p className="relative z-10 text-sm font-medium text-text/80 leading-relaxed">
                    今天也是充满希望的一天呢~ ✨
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Section: Left Small Widgets, Right Big */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid grid-cols-2 gap-4 content-start">
                <SmallWidget icon={Book} label="日记" />
                <SmallWidget icon={Clapperboard} label="小剧场" />
                <SmallWidget icon={Plus} label="待定" />
                <SmallWidget icon={Plus} label="待定" />
              </div>
              
              <div className="aspect-square w-full">
                <WeatherWidget />
              </div>
            </div>
          </div>
        </section>

        {/* Page 2 */}
        <section className="flex h-full w-full flex-shrink-0 snap-center flex-col gap-4 px-8 pt-2">
          <div className="h-6" />
          
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 aspect-[2/1] rounded-[24px] bg-white/60 p-6 shadow-sm backdrop-blur-md">
              <div className="flex h-full items-center justify-center text-muted">
                <VinylWidget />
              </div>
            </div>
            
            <div className="aspect-square rounded-[24px] bg-white/60 shadow-sm backdrop-blur-md" />
            <div className="aspect-square rounded-[24px] bg-white/60 shadow-sm backdrop-blur-md" />
            <div className="aspect-square rounded-[24px] bg-white/60 shadow-sm backdrop-blur-md" />
            <div className="aspect-square rounded-[24px] bg-white/60 shadow-sm backdrop-blur-md" />
          </div>
        </section>
      </div>

      {/* Pagination Dots */}
      <div className="fixed bottom-40 left-0 right-0 z-50 flex justify-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full transition-colors ${activePage === 0 ? "bg-black/60" : "bg-black/10"}`} />
        <span className={`h-1.5 w-1.5 rounded-full transition-colors ${activePage === 1 ? "bg-black/60" : "bg-black/10"}`} />
      </div>
    </div>
  );
}
