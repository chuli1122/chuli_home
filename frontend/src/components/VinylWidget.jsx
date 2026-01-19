import { Disc3, Play, Pause } from "lucide-react";
import { useState } from "react";

export default function VinylWidget() {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[24px] bg-white p-4 shadow-sm">
      <div className="relative flex flex-1 items-center justify-center">
        <div
          className={`relative flex h-24 w-24 items-center justify-center rounded-full bg-black shadow-md transition-transform duration-[3s] ${
            isPlaying ? "animate-spin-slow" : ""
          }`}
        >
          <div className="h-8 w-8 rounded-full bg-red-500/20" />
          <div className="absolute h-2 w-2 rounded-full bg-white" />
          <Disc3 className="absolute text-white/20" size={80} />
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-gray-900">City Pop</span>
          <span className="text-[10px] text-gray-500">Playing now</span>
        </div>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white transition-transform active:scale-95"
        >
          {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
        </button>
      </div>
    </div>
  );
}
