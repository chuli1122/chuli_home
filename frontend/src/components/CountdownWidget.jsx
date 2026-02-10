import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar } from "lucide-react";

const CountdownWidget = ({ style }) => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);

  // Default style if none provided
  const widgetStyle = style || {
    opacity: 30,
    material: 'glass',
    color: '#ffffff',
    backgroundImage: null
  };

  useEffect(() => {
    const loadEvents = () => {
      let savedEvents = JSON.parse(localStorage.getItem("countdown-events") || "[]");
      if (savedEvents.length === 0) {
        savedEvents = [
          { id: 1, title: "恋爱纪念日", date: "2025-05-20", isPinned: true, repeatType: "yearly" },
          { id: 2, title: "我的生日", date: "2025-11-11", isPinned: false, repeatType: "yearly" },
          { id: 3, title: "新年", date: "2026-01-01", isPinned: false, repeatType: "yearly" },
        ];
        localStorage.setItem("countdown-events", JSON.stringify(savedEvents));
      }
      setEvents(savedEvents);
    };

    loadEvents();
    // Listen for storage changes to update widget
    window.addEventListener("storage", loadEvents);
    // Custom event for local updates
    window.addEventListener("countdown-updated", loadEvents);
    
    return () => {
      window.removeEventListener("storage", loadEvents);
      window.removeEventListener("countdown-updated", loadEvents);
    };
  }, []);

  const getDaysLeft = (dateString, repeatType = 'none') => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let target = new Date(dateString);
    target.setHours(0, 0, 0, 0);

    if (repeatType === 'monthly') {
      // Set to current month
      target.setFullYear(today.getFullYear());
      target.setMonth(today.getMonth());
      
      // If day has passed in current month, move to next month
      if (target < today) {
        target.setMonth(target.getMonth() + 1);
      }
    } else if (repeatType === 'yearly') {
      // Set to current year
      target.setFullYear(today.getFullYear());
      
      // If date has passed in current year, move to next year
      if (target < today) {
        target.setFullYear(target.getFullYear() + 1);
      }
    }
    
    const diff = target.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const handleClick = () => {
    navigate("/countdown", { replace: true });
  };

  if (events.length === 0) {
    return (
      <div 
        onClick={handleClick}
        className="relative flex h-full w-full flex-col items-center justify-center rounded-[24px] overflow-hidden cursor-pointer active:scale-[0.98] transition"
      >
        {/* Background Layer */}
        <div 
          className="absolute inset-0 bg-cover bg-center shadow-xl shadow-black/5"
          style={{ 
            backgroundColor: widgetStyle.backgroundImage ? 'transparent' : widgetStyle.color,
            backgroundImage: widgetStyle.backgroundImage ? `url(${widgetStyle.backgroundImage})` : 'none',
            opacity: widgetStyle.opacity / 100,
            backdropFilter: widgetStyle.material === 'glass' ? 'blur(20px)' : widgetStyle.material === 'frost' ? 'blur(10px)' : 'none',
          }}
        />

        {/* Material Overlay */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: widgetStyle.material === 'glass' ? 'rgba(255,255,255,0.1)' : widgetStyle.material === 'frost' ? 'rgba(255,255,255,0.3)' : 'transparent',
          }}
        />

        {/* Border Layer */}
        {(widgetStyle.material === 'glass' || widgetStyle.material === 'frost') && (
          <div className="absolute inset-0 pointer-events-none rounded-[24px] border border-white/30" />
        )}

        {/* Content Layer */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full h-full">
          <div className="absolute -right-2 -top-2 h-20 w-20 rounded-full bg-gray-200/20 blur-xl" />
          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-white/50 text-gray-400 shadow-sm">
            <Calendar size={28} />
          </div>
          <span className="mt-2 text-xs font-medium text-gray-500 drop-shadow-sm">倒数日</span>
        </div>
      </div>
    );
  }

  // Determine big and small events based on pinned status
  let bigEvent, smallEvents;
  const pinnedIndex = events.findIndex(e => e.isPinned);
  
  if (pinnedIndex !== -1) {
    bigEvent = events[pinnedIndex];
    smallEvents = events.filter((_, i) => i !== pinnedIndex).slice(0, 2);
  } else {
    bigEvent = events[0];
    smallEvents = events.slice(1, 3);
  }

  const bigDays = getDaysLeft(bigEvent.date, bigEvent.repeatType);
  const isBigPast = bigDays < 0;

  return (
    <div 
      onClick={handleClick}
      className="relative flex h-full w-full flex-col rounded-[24px] overflow-hidden cursor-pointer active:scale-[0.98] transition"
    >
      {/* Background Layer */}
      <div 
        className="absolute inset-0 bg-cover bg-center shadow-xl shadow-black/5"
        style={{ 
          backgroundColor: widgetStyle.backgroundImage ? 'transparent' : widgetStyle.color,
          backgroundImage: widgetStyle.backgroundImage ? `url(${widgetStyle.backgroundImage})` : 'none',
          opacity: widgetStyle.opacity / 100,
          backdropFilter: widgetStyle.material === 'glass' ? 'blur(20px)' : widgetStyle.material === 'frost' ? 'blur(10px)' : 'none',
        }}
      />

      {/* Material Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: widgetStyle.material === 'glass' ? 'rgba(255,255,255,0.1)' : widgetStyle.material === 'frost' ? 'rgba(255,255,255,0.3)' : 'transparent',
        }}
      />

      {/* Border Layer */}
      {(widgetStyle.material === 'glass' || widgetStyle.material === 'frost') && (
        <div className="absolute inset-0 pointer-events-none rounded-[24px] border border-white/30" />
      )}

      {/* Content Layer */}
      <div className="relative z-10 flex flex-col w-full h-full">
        {/* Big Event (Top) */}
        <div className="relative flex flex-1 flex-col items-center justify-center p-4">
        <span className="font-medium text-black mb-1" style={{ fontSize: '12px', lineHeight: '1.2' }}>{bigEvent.title}</span>
        <div className="flex items-baseline gap-1">
          {!isBigPast && <span className="font-medium text-black mr-0.5" style={{ fontSize: '12px', lineHeight: '1.2' }}>还有</span>}
          <span className="font-bold text-black" style={{ fontSize: '36px', lineHeight: '1' }}>
            {Math.abs(bigDays)}
          </span>
          <span className="font-medium text-black" style={{ fontSize: '12px', lineHeight: '1.2' }}>
            {isBigPast ? '天前' : '天'}
          </span>
        </div>
        <span className="text-black mt-1" style={{ fontSize: '10px', lineHeight: '1.2' }}>{bigEvent.date}</span>
      </div>

        {/* Small Events (Bottom) */}
        {smallEvents.length > 0 && (
          <div className="flex h-[35%] w-full border-t border-dashed border-black/10">
            {smallEvents.map((event, index) => {
              const days = getDaysLeft(event.date, event.repeatType);
            const isPast = days < 0;
              return (
                <div 
                  key={event.id} 
                  className={`flex flex-1 flex-col items-center justify-center p-2 ${
                    index === 0 && smallEvents.length > 1 ? 'border-r border-dashed border-black/10' : ''
                  }`}
                >
                  <span className="truncate font-medium text-black" style={{ fontSize: '10px', lineHeight: '1.2' }}>{event.title}</span>
                <div className="flex items-end gap-0.5 mb-1">
                  {!isPast && <span className="text-black whitespace-nowrap" style={{ fontSize: '9px', lineHeight: '1.2' }}>还有</span>}
                  <span className="font-bold text-black leading-none" style={{ fontSize: '18px', lineHeight: '1' }}>
                    {Math.abs(days)}
                  </span>
                  <span className="text-black whitespace-nowrap" style={{ fontSize: '9px', lineHeight: '1.2' }}>
                    {isPast ? '天前' : '天'}
                  </span>
                </div>
                </div>
              );
            })}
            {/* Placeholder if only 1 small event */}
            {smallEvents.length === 1 && (
              <div className="flex-1" />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CountdownWidget;
