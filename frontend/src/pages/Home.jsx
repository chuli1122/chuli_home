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
  Sun,
  Moon,
  MoreHorizontal,
  Dices,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import VinylWidget from "../components/VinylWidget";
import CountdownWidget from "../components/CountdownWidget";
import LayeredBackground from "../components/LayeredBackground";
import { saveImage, loadImageUrl, isExternalUrl } from "../utils/db";

// --- Icons ---

const MuyuIcon = ({ size = 24, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 1365 1024" 
    fill="none" 
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="woodGradientIcon" x1="20%" y1="10%" x2="80%" y2="90%">
        <stop offset="0%" stopColor="#E8E8E8" />
        <stop offset="45%" stopColor="#CECCCC" />
        <stop offset="100%" stopColor="#A0A0A0" />
      </linearGradient>
    </defs>
    <path d="M1.450653 780.39695c-10.175905 64.255398 36.031662 101.161718 59.626108 112.361614 23.594445 11.178562 63.274073 0 78.825927 0 116.542907 11.178562 366.759228 131.220103 678.606972 131.220103 0 0 504.635269 7.445264 543.31224-360.487287 9.19458-95.529771 4.885288-277.458732-71.039334-286.162651-63.956734-8.426588-102.121709 4.074628-183.315615 20.565141-53.908828 10.922564-189.011561 29.973052-212.926004 44.970245-260.989553 118.718887-403.324219 204.371417-442.299853 217.128631-29.439724 0-54.975485-7.359931-62.100752-69.972677 0-25.706426 98.089747-87.039184 140.137353-96.959091C682.660267 452.869354 796.365867 435.333519 809.720409 435.333519c19.263819 0 441.489194-101.588381 454.438406-111.188291 12.949212-9.59991 26.62375-18.986489 26.623751-52.543508 0-15.359856-33.813016-49.663534-72.319322-91.455142-45.674238-49.556869-99.94573-107.092329-140.606682-120.788201C1002.934597 20.958737 856.077308-10.912964 727.779844 3.572233 446.929143 35.273269 271.677453 342.662388 256.424263 363.995521c-64.852725 90.708483-116.542907 205.587406-143.678653 256.296264C86.548522 669.272659 11.71189 735.149375 1.450653 780.39695z" fill="url(#woodGradientIcon)" />
  </svg>
);

const DiceIcon = ({ size = 24, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 1024 1024" 
    version="1.1" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
  >
    <path d="M478.62 54.044a66.748 66.748 0 0 1 66.76 0l346.532 200.068a66.768 66.768 0 0 1 33.38 57.816v400.144a66.768 66.768 0 0 1-33.38 57.816l-346.532 200.068a66.748 66.748 0 0 1-66.76 0l-346.532-200.068a66.768 66.768 0 0 1-33.38-57.816V311.928a66.768 66.768 0 0 1 33.38-57.816l346.532-200.068z" fill="#E5E5E5"></path>
    <path d="M105.96 281.664a66.892 66.892 0 0 1 15.248-19.72c71.064-39.328 289.524-167.32 365.292-211.784a66.76 66.76 0 0 1 58.88 3.884l346.532 200.068a66.736 66.736 0 0 1 24.524 24.592l-361.84 201.228a89.512 89.512 0 0 1-84.58 1.308C374.644 431.916 149.232 314.24 105.96 281.664z" fill="#F5F5F5"></path>
    <path d="M512.696 978.896l-0.3-413.728a105.452 105.452 0 0 1 54.268-92.272l349.768-194.2a66.696 66.696 0 0 1 8.86 33.232v400.144a66.768 66.768 0 0 1-33.38 57.816l-346.532 200.068a66.68 66.68 0 0 1-32.684 8.94z" fill="#D4D4D4"></path>
    <path d="M99.412 302.24a66.7 66.7 0 0 1 7.468-22.316l405.472 223.124v475.852a66.748 66.748 0 0 1-29.288-6.592l-356.652-206.092a66.796 66.796 0 0 1-27-44.456V302.24z" fill="#EAEAEA"></path>
    <path d="M462 262.772a50 40 0 1 0 100 0 50 40 0 1 0-100 0Z" fill="#2A2A2A"></path>
    <path d="M462.38 267.712c0.852-21.484 22.916-38.712 49.972-38.712 25.504 0 46.576 15.312 49.624 35.06-0.852 21.48-22.92 38.712-49.976 38.712-25.504 0-46.576-15.312-49.62-35.06z" fill="#404040"></path>
    <path d="M811.864 422.772c16.608-9.68 51.076-17.956 50.944 11.616-0.128 29.132-27.744 57.096-51.46 70.592-16.38 9.32-51.184 17.664-50.944-11.62 0.236-28.948 28.06-56.952 51.46-70.588z" fill="#2A2A2A"></path>
    <path d="M760.74 498.304c0.976-28.512 28.36-55.912 51.444-69.34 15.72-9.144 47.06-16.912 50.596 6.86-1.008 28.608-28.104 55.88-51.432 69.156-15.38 8.752-47.008 16.64-50.608-6.676z" fill="#404040"></path>
    <path d="M728.848 601.424c16.632-9.324 51.28-17.212 51.064 12.12-0.212 28.864-28.176 56.164-51.816 69.1-16.396 8.968-51.388 16.916-51.064-12.12 0.32-28.68 28.492-56.024 51.816-69.1z" fill="#2A2A2A"></path>
    <path d="M677.352 675.424c1.06-28.244 28.788-55.004 51.8-67.88 15.628-8.744 47.116-16.188 50.736 7.192-0.96 28.42-28.48 55.152-51.792 67.908-15.4 8.42-47.196 15.944-50.744-7.22z" fill="#404040"></path>
    <path d="M645.068 776.892c16.648-8.968 51.488-16.472 51.184 12.62-0.296 28.604-28.62 55.236-52.172 67.612-16.404 8.616-51.596 16.172-51.184-12.62 0.404-28.416 28.936-55.092 52.172-67.612z" fill="#2A2A2A"></path>
    <path d="M593.204 849.36c1.14-27.98 29.224-54.088 52.152-66.416 15.644-8.416 47.304-15.496 50.868 7.732-1.04 28.164-28.912 54.24-52.144 66.448-15.408 8.092-47.384 15.252-50.876-7.764z" fill="#404040"></path>
    <path d="M197.416 437.416c25.388 12.56 44.636 43.28 44.188 71.7-0.412 26.248-22.208 38.532-45.312 26.76-25.056-12.764-44.388-43.452-44.188-71.7 0.188-26.328 22.296-38.148 45.312-26.76z" fill="#2A2A2A"></path>
    <path d="M241.192 514.552c-3.14 22.452-23.456 32.248-44.9 21.324-23.176-11.808-41.456-38.948-43.908-65.312 2.9-22.5 23.528-31.944 44.9-21.332 23.46 11.648 41.66 38.82 43.908 65.32z" fill="#404040"></path>
    <path d="M195.256 626.456c25.1 13.132 43.812 44.176 43.368 72.548-0.408 26.016-21.696 38.188-44.492 25.912-24.768-13.332-43.572-44.336-43.368-72.544 0.184-26.1 21.776-37.8 44.492-25.916z" fill="#2A2A2A"></path>
    <path d="M238.216 704.412c-3.08 22.236-22.932 31.892-44.084 20.504-22.9-12.328-40.7-39.764-43.096-66.128 2.9-22.284 23-31.584 44.084-20.516 23.188 12.176 40.908 39.644 43.096 66.14z" fill="#404040"></path>
    <path d="M382.664 529.076c25.632 12.684 44.248 44.06 43.308 72.608-0.86 26.256-22.596 39.692-46.192 27.672-25.292-12.888-44.004-44.224-43.304-72.608 0.648-26.344 22.672-39.308 46.188-27.672z" fill="#2A2A2A"></path>
    <path d="M425.456 607.228c-3.532 22.536-23.804 33.268-45.676 22.128-23.372-11.908-41.128-39.576-43.136-66.108 3.36-22.588 23.872-32.964 45.676-22.136 23.668 11.752 41.332 39.452 43.136 66.116z" fill="#404040"></path>
    <path d="M377.128 721.608c25.34 13.256 43.428 44.952 42.488 73.456-0.852 26.012-22.092 39.356-45.372 26.824-24.996-13.46-43.184-45.112-42.488-73.456 0.644-26.104 22.164-38.964 45.372-26.824z" fill="#2A2A2A"></path>
    <path d="M419.108 800.576c-3.472 22.32-23.288 32.924-44.864 21.312-23.092-12.432-40.372-40.392-42.324-66.924 3.3-22.372 23.348-32.616 44.864-21.32 23.384 12.276 40.572 40.272 42.324 66.932z" fill="#404040"></path>
  </svg>
);

const CloudIcon = ({ size = 24, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="10 15 100 80"
    fill="none" 
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient 
        id="cloudGradientIcon" 
        x1="0" y1="20" x2="0" y2="85" 
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%" stopColor="#60A5FA" />
        <stop offset="100%" stopColor="#BFDBFE" />
      </linearGradient>
    </defs>
    <g fill="url(#cloudGradientIcon)">
      <circle cx="40" cy="60" r="25" />
      <circle cx="60" cy="50" r="30" />
      <circle cx="80" cy="60" r="25" />
      <rect x="40" y="60" width="40" height="25" />
    </g>
  </svg>
);

const PixelHeartIcon = ({ size = 100, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 1024 1024" 
    version="1.1" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
  >
    <path d="M945.230769 433.230769h78.769231v78.769231h-78.769231zM866.461538 512h78.769231v78.769231h-78.769231zM787.692308 590.769231h78.76923v78.769231h-78.76923zM708.923077 669.538462h78.769231v78.76923h-78.769231zM630.153846 748.307692h78.769231v78.769231h-78.769231zM551.384615 827.076923h78.769231v78.769231h-78.769231zM472.615385 905.846154h78.76923v78.769231h-78.76923zM393.846154 827.076923h78.769231v78.769231h-78.769231zM315.076923 748.307692h78.769231v78.769231h-78.769231zM236.307692 669.538462h78.769231v78.76923h-78.769231zM157.538462 590.769231h78.76923v78.769231H157.538462zM78.769231 512h78.769231v78.769231H78.769231zM0 433.230769h78.769231v78.769231H0zM945.230769 354.461538h78.769231v78.769231h-78.769231zM945.230769 275.692308h78.769231v78.76923h-78.769231zM945.230769 196.923077h78.769231v78.769231h-78.769231z" fill="#4A4A4A"></path>
    <path d="M866.461538 433.230769h78.769231v78.769231h-78.769231zM866.461538 354.461538h78.769231v78.769231h-78.769231zM866.461538 275.692308h78.769231v78.76923h-78.769231zM866.461538 196.923077h78.769231v78.769231h-78.769231z" fill="#D45D79"></path>
    <path d="M866.461538 118.153846h78.769231v78.769231h-78.769231z" fill="#4A4A4A"></path>
    <path d="M787.692308 512h78.76923v78.769231h-78.76923z" fill="#D45D79"></path>
    <path d="M787.692308 433.230769h78.76923v78.769231h-78.76923zM787.692308 354.461538h78.76923v78.769231h-78.76923zM787.692308 275.692308h78.76923v78.76923h-78.76923zM787.692308 196.923077h78.76923v78.769231h-78.76923z" fill="#FF8FA3"></path>
    <path d="M787.692308 118.153846h78.76923v78.769231h-78.76923z" fill="#D45D79"></path>
    <path d="M787.692308 39.384615h78.76923v78.769231h-78.76923z" fill="#4A4A4A"></path>
    <path d="M708.923077 590.769231h78.769231v78.769231h-78.769231z" fill="#D45D79"></path>
    <path d="M708.923077 512h78.769231v78.769231h-78.769231zM708.923077 433.230769h78.769231v78.769231h-78.769231zM708.923077 354.461538h78.769231v78.769231h-78.769231zM708.923077 275.692308h78.769231v78.76923h-78.769231zM708.923077 196.923077h78.769231v78.769231h-78.769231zM708.923077 118.153846h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M708.923077 39.384615h78.769231v78.769231h-78.769231z" fill="#4A4A4A"></path>
    <path d="M630.153846 669.538462h78.769231v78.76923h-78.769231z" fill="#D45D79"></path>
    <path d="M630.153846 590.769231h78.769231v78.769231h-78.769231zM630.153846 512h78.769231v78.769231h-78.769231zM630.153846 433.230769h78.769231v78.769231h-78.769231zM630.153846 354.461538h78.769231v78.769231h-78.769231zM630.153846 275.692308h78.769231v78.76923h-78.769231zM630.153846 196.923077h78.769231v78.769231h-78.769231zM630.153846 118.153846h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M630.153846 39.384615h78.769231v78.769231h-78.769231z" fill="#4A4A4A"></path>
    <path d="M551.384615 748.307692h78.769231v78.769231h-78.769231z" fill="#D45D79"></path>
    <path d="M551.384615 669.538462h78.769231v78.76923h-78.769231zM551.384615 590.769231h78.769231v78.769231h-78.769231zM551.384615 512h78.769231v78.769231h-78.769231zM551.384615 433.230769h78.769231v78.769231h-78.769231zM551.384615 354.461538h78.769231v78.769231h-78.769231zM551.384615 275.692308h78.769231v78.76923h-78.769231zM551.384615 196.923077h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M551.384615 118.153846h78.769231v78.769231h-78.769231z" fill="#4A4A4A"></path>
    <path d="M472.615385 827.076923h78.76923v78.769231h-78.76923z" fill="#FF8FA3"></path>
    <path d="M472.615385 748.307692h78.76923v78.769231h-78.76923z" fill="#FF8FA3"></path>
    <path d="M472.615385 669.538462h78.76923v78.76923h-78.76923z" fill="#FF8FA3"></path>
    <path d="M472.615385 590.769231h78.76923v78.769231h-78.76923z" fill="#FF8FA3"></path>
    <path d="M472.615385 512h78.76923v78.769231h-78.76923z" fill="#FF8FA3"></path>
    <path d="M472.615385 433.230769h78.76923v78.769231h-78.76923z" fill="#FF8FA3"></path>
    <path d="M472.615385 354.461538h78.76923v78.769231h-78.76923z" fill="#FF8FA3"></path>
    <path d="M472.615385 275.692308h78.76923v78.76923h-78.76923z" fill="#FF8FA3"></path>
    <path d="M472.615385 196.923077h78.76923v78.769231h-78.76923z" fill="#4A4A4A"></path>
    <path d="M393.846154 748.307692h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M393.846154 669.538462h78.769231v78.76923h-78.769231z" fill="#FF8FA3"></path>
    <path d="M393.846154 590.769231h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M393.846154 512h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M393.846154 433.230769h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M393.846154 354.461538h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M393.846154 275.692308h78.769231v78.76923h-78.769231z" fill="#FF8FA3"></path>
    <path d="M393.846154 196.923077h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M393.846154 118.153846h78.769231v78.769231h-78.769231z" fill="#4A4A4A"></path>
    <path d="M315.076923 669.538462h78.769231v78.76923h-78.769231z" fill="#FF8FA3"></path>
    <path d="M315.076923 590.769231h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M315.076923 512h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M315.076923 433.230769h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M315.076923 354.461538h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M315.076923 275.692308h78.769231v78.76923h-78.769231z" fill="#FF8FA3"></path>
    <path d="M315.076923 196.923077h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M315.076923 39.384615h78.769231v78.769231h-78.769231z" fill="#4A4A4A"></path>
    <path d="M236.307692 590.769231h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M236.307692 512h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M236.307692 433.230769h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M236.307692 354.461538h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M236.307692 275.692308h78.769231v78.76923h-78.769231z" fill="#FF8FA3"></path>
    <path d="M236.307692 196.923077h78.769231v78.769231h-78.769231z" fill="#FFF0F5"></path>
    <path d="M236.307692 118.153846h78.769231v78.769231h-78.769231z" fill="#FF8FA3"></path>
    <path d="M236.307692 39.384615h78.769231v78.769231h-78.769231z" fill="#4A4A4A"></path>
    <path d="M157.538462 512h78.76923v78.769231H157.538462z" fill="#FF8FA3"></path>
    <path d="M157.538462 433.230769h78.76923v78.769231H157.538462z" fill="#FF8FA3"></path>
    <path d="M157.538462 354.461538h78.76923v78.769231H157.538462z" fill="#FF8FA3"></path>
    <path d="M157.538462 275.692308h78.76923v78.76923H157.538462z" fill="#FFF0F5"></path>
    <path d="M157.538462 118.153846h78.76923v78.769231H157.538462z" fill="#FF8FA3"></path>
    <path d="M157.538462 39.384615h78.76923v78.769231H157.538462z" fill="#4A4A4A"></path>
    <path d="M78.769231 433.230769h78.769231v78.769231H78.769231zM78.769231 354.461538h78.769231v78.769231H78.769231zM78.769231 275.692308h78.769231v78.76923H78.769231zM78.769231 196.923077h78.769231v78.769231H78.769231z" fill="#FF8FA3"></path>
    <path d="M78.769231 118.153846h78.769231v78.769231H78.769231zM0 354.461538h78.769231v78.769231H0zM0 275.692308h78.769231v78.76923H0zM0 196.923077h78.769231v78.769231H0z" fill="#4A4A4A"></path>
  </svg>
);

// --- Widgets ---

const DiceWidget = () => {
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isRolling, setIsRolling] = useState(false);

  const handleClick = (e) => {
    e.stopPropagation();
    if (isRolling) return;

    setIsRolling(true);

    // Random result 1-6
    const result = Math.floor(Math.random() * 6) + 1;
    
    // Increase base spin for more "rolling" feel (3 full rotations)
    const baseSpin = 1080; 
    
    let targetX = 0;
    let targetY = 0;

    // Add randomness to spin direction
    const randomSpinX = baseSpin + Math.floor(Math.random() * 4) * 360;
    const randomSpinY = baseSpin + Math.floor(Math.random() * 4) * 360;

    // Target mapping (Standard Dice)
    switch(result) {
      case 1: targetX = 0; targetY = 0; break;
      case 6: targetX = 180; targetY = 0; break;
      case 2: targetX = 90; targetY = 0; break;
      case 5: targetX = -90; targetY = 0; break;
      case 3: targetX = 0; targetY = -90; break;
      case 4: targetX = 0; targetY = 90; break;
    }

    setRotation({ 
      x: targetX + randomSpinX, 
      y: targetY + randomSpinY 
    });

    setTimeout(() => {
      setIsRolling(false);
    }, 2000); // Match transition duration
  };

  // Helper to render dots
  const renderDots = (count) => {
    // Common dot style - Dark grey/black for all dots
    const dotStyle = "w-2.5 h-2.5 rounded-full bg-[#2A2A2A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]";

    if (count === 1) {
      return (
        <div className="flex h-full w-full items-center justify-center">
          {/* Larger black dot for 1 */}
          <div className="h-4 w-4 rounded-full bg-[#2A2A2A] shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]" /> 
        </div>
      );
    }

    return (
      <div className="grid h-full w-full grid-cols-3 grid-rows-3 p-2.5">
        {[...Array(9)].map((_, i) => {
          let show = false;
          if (count === 2) show = (i === 2 || i === 6);
          if (count === 3) show = (i === 2 || i === 4 || i === 6);
          if (count === 4) show = (i === 0 || i === 2 || i === 6 || i === 8);
          if (count === 5) show = (i === 0 || i === 2 || i === 4 || i === 6 || i === 8);
          if (count === 6) show = (i === 0 || i === 2 || i === 3 || i === 5 || i === 6 || i === 8);

          return (
            <div key={i} className="flex items-center justify-center">
              {show && <div className={dotStyle} />}
            </div>
          );
        })}
      </div>
    );
  };

  const Face = ({ val, transform }) => (
    <div 
      className="absolute flex h-16 w-16 items-center justify-center rounded-md border border-[#E5E5E5]"
      style={{ 
        transform: transform,
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        // Radial gradient for 3D sphere-like lighting feel
        background: 'radial-gradient(circle at center, #FFFFFF 0%, #E5E5E5 150%)',
        // Layered shadows for depth
        boxShadow: 'inset 0 0 8px rgba(0,0,0,0.05), inset 0 0 2px rgba(0,0,0,0.1)'
      }}
    >
      {renderDots(val)}
    </div>
  );

  return (
    <div 
      className="relative flex h-full w-full items-center justify-center cursor-pointer perspective-[1000px]"
      onClick={handleClick}
    >
      {/* Static Drop Shadow */}
      <div className="absolute h-14 w-14 rounded-xl bg-black/20 blur-md translate-y-2" />

      <div 
        className="relative h-16 w-16 preserve-3d z-10"
        style={{ 
          transformStyle: 'preserve-3d',
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
          // Custom bezier for realistic roll: starts fast, slows down, slight overshoot/settle
          transition: 'transform 2s cubic-bezier(0.15, 0.25, 0.25, 1.15)'
        }}
      >
        {/* 1: Front */}
        <Face val={1} transform="translateZ(31.9px)" />
        {/* 6: Back */}
        <Face val={6} transform="rotateY(180deg) translateZ(31.9px)" />
        {/* 2: Bottom */}
        <Face val={2} transform="rotateX(-90deg) translateZ(31.9px)" />
        {/* 5: Top */}
        <Face val={5} transform="rotateX(90deg) translateZ(31.9px)" />
        {/* 3: Right */}
        <Face val={3} transform="rotateY(90deg) translateZ(31.9px)" />
        {/* 4: Left */}
        <Face val={4} transform="rotateY(-90deg) translateZ(31.9px)" />
      </div>
    </div>
  );
};

const MuyuWidget = () => {
  const [merits, setMerits] = useState([]);
  const [scale, setScale] = useState(1);

  const handleClick = (e) => {
    e.stopPropagation();
    
    // Animation effect
    setScale(0.9);
    setTimeout(() => setScale(1), 100);

    // Add merit
    const id = Date.now();
    setMerits(prev => [...prev, { id }]);

    // Remove merit after animation
    setTimeout(() => {
      setMerits(prev => prev.filter(m => m.id !== id));
    }, 800);
  };

  return (
    <div 
      className="relative flex h-full w-full items-center justify-center cursor-pointer"
      onClick={handleClick}
    >
      {/* Floating Merits */}
      {merits.map(merit => (
        <div
          key={merit.id}
          className="absolute top-0 z-20 animate-float-up whitespace-nowrap text-sm font-bold text-[#606060]"
          style={{ pointerEvents: 'none' }}
        >
          功德 +1
        </div>
      ))}

      {/* Wooden Fish SVG */}
      <div 
        className="transition-transform duration-100"
        style={{ transform: `scale(${scale})` }}
      >
        <svg width="100" height="100" viewBox="0 0 1365 1024" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl">
          <defs>
            <linearGradient id="woodGradient" x1="20%" y1="10%" x2="80%" y2="90%">
              <stop offset="0%" stopColor="#E8E8E8" />
              <stop offset="45%" stopColor="#CECCCC" />
              <stop offset="100%" stopColor="#A0A0A0" />
            </linearGradient>
          </defs>
          <path d="M1.450653 780.39695c-10.175905 64.255398 36.031662 101.161718 59.626108 112.361614 23.594445 11.178562 63.274073 0 78.825927 0 116.542907 11.178562 366.759228 131.220103 678.606972 131.220103 0 0 504.635269 7.445264 543.31224-360.487287 9.19458-95.529771 4.885288-277.458732-71.039334-286.162651-63.956734-8.426588-102.121709 4.074628-183.315615 20.565141-53.908828 10.922564-189.011561 29.973052-212.926004 44.970245-260.989553 118.718887-403.324219 204.371417-442.299853 217.128631-29.439724 0-54.975485-7.359931-62.100752-69.972677 0-25.706426 98.089747-87.039184 140.137353-96.959091C682.660267 452.869354 796.365867 435.333519 809.720409 435.333519c19.263819 0 441.489194-101.588381 454.438406-111.188291 12.949212-9.59991 26.62375-18.986489 26.623751-52.543508 0-15.359856-33.813016-49.663534-72.319322-91.455142-45.674238-49.556869-99.94573-107.092329-140.606682-120.788201C1002.934597 20.958737 856.077308-10.912964 727.779844 3.572233 446.929143 35.273269 271.677453 342.662388 256.424263 363.995521c-64.852725 90.708483-116.542907 205.587406-143.678653 256.296264C86.548522 669.272659 11.71189 735.149375 1.450653 780.39695z" fill="url(#woodGradient)" />
        </svg>
      </div>
    </div>
  );
};

const HeartWidget = () => {
  const [hearts, setHearts] = useState([]);
  const [scale, setScale] = useState(1);

  const handleClick = (e) => {
    e.stopPropagation();
    
    // Animation effect
    setScale(0.9);
    setTimeout(() => setScale(1), 100);

    // Add dropping hearts
    const id = Date.now();
    const newHearts = Array.from({ length: 2 }).map((_, i) => {
      // Random direction: -1 (left) or 1 (right)
      const dirX = Math.random() > 0.5 ? 1 : -1;
      // Random horizontal distance: 20px to 50px
      const dist = 20 + Math.random() * 30;
      
      return {
        id: `${id}-${i}`,
        style: {
          '--tx-start': `${dirX * (dist * 0.3)}px`,
          '--ty-start': '-25px',
          '--r-start': `${dirX * 15}deg`,
          '--tx-end': `${dirX * dist}px`,
          '--ty-end': '60px',
          '--r-end': `${dirX * 45}deg`,
        }
      };
    });

    setHearts(prev => [...prev, ...newHearts]);

    // Remove hearts after animation
    setTimeout(() => {
      setHearts(prev => prev.filter(h => !h.id.startsWith(id)));
    }, 800);
  };

  return (
    <div 
      className="relative flex h-full w-full items-center justify-center cursor-pointer"
      onClick={handleClick}
    >
      {/* Dropping Hearts */}
      {hearts.map(heart => (
        <div
          key={heart.id}
          className="absolute top-1/2 left-1/2 z-20 animate-drop-custom"
          style={{ 
            ...heart.style,
            pointerEvents: 'none',
            marginLeft: '-12px', // Center the 24px icon
            marginTop: '-12px'
          }}
        >
          <PixelHeartIcon size={24} />
        </div>
      ))}

      {/* Main Pixel Heart */}
      <div 
        className="transition-transform duration-100"
        style={{ transform: `scale(${scale})` }}
      >
        <PixelHeartIcon size={80} className="drop-shadow-xl" />
      </div>
    </div>
  );
};

import Modal from "../components/Modal";

const EditModal = ({ isOpen, onClose, onSave, title, initialValue, placeholder, multiline = false, maxLength }) => {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
    }
  }, [isOpen, initialValue]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      onConfirm={() => {
        onSave(value);
        onClose();
      }}
      isConfirmDisabled={!value?.trim()}
    >
      <div className="relative">
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            className={`w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-[15px] text-black outline-none focus:ring-0 min-h-[48px] resize-none placeholder:text-gray-400 ${maxLength ? 'pb-8' : ''}`}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            className={`w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-left text-[15px] text-black outline-none focus:ring-0 placeholder:text-gray-400 ${maxLength ? 'pb-8' : ''}`}
          />
        )}
        {maxLength && (
          <div className="absolute bottom-2 right-4 text-xs text-gray-400 font-medium">
            ({value.length}/{maxLength})
          </div>
        )}
      </div>
    </Modal>
  );
};

const SmallWidget = ({ icon: Icon, label, style, iconId, customIcons }) => {
  const customUrl = customIcons?.[iconId];
  
  return (
    <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 transition active:scale-95">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-[18px] shadow-lg shadow-black/5">
        <div className="absolute inset-0 rounded-[18px] overflow-hidden">
          <LayeredBackground style={style} rounded="rounded-[18px]" />
        </div>
        {customUrl ? (
          <img 
            src={customUrl} 
            alt={label} 
            className="relative z-10 h-full w-full object-cover rounded-[18px]" 
            style={{ opacity: (style.opacity ?? 100) / 100 }}
          />
        ) : (
          <Icon size={28} className="relative z-10 text-black" />
        )}
      </div>
      <span className="text-[11px] font-medium text-text" style={{ fontSize: `calc(11px * var(--app-font-size-scale, 1))` }}>{label}</span>
    </div>
  );
};

const CloudWidget = () => {
  const [isRaining, setIsRaining] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  
  // Initialize from localStorage or default to 'cloud'
  const [currentWidget, setCurrentWidget] = useState(() => {
    try {
      return localStorage.getItem('cloud_widget_preference') || 'cloud';
    } catch (e) {
      return 'cloud';
    }
  });

  // Save to localStorage whenever currentWidget changes
  useEffect(() => {
    try {
      localStorage.setItem('cloud_widget_preference', currentWidget);
    } catch (e) {
      console.error('Failed to save widget preference:', e);
    }
  }, [currentWidget]);
  
  const handleCloudClick = (e) => {
    e.stopPropagation();
    if (isRaining) return;
    setIsRaining(true);
    setTimeout(() => setIsRaining(false), 2000);
  };

  const menuItems = [
    { id: 'fish', icon: MuyuIcon, label: '木鱼' },
    { id: 'heart', icon: PixelHeartIcon, label: '爱心' },
    { id: 'dice', icon: DiceIcon, label: '骰子' },
    { id: 'cloud', icon: CloudIcon, label: '云朵' },
  ].filter(item => item.id !== currentWidget);

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Fixed container to ensure button position stays constant */}
      <div className="relative z-10 flex h-[120px] w-[120px] items-center justify-center">
        {/* Main Widget Content */}
        <div 
          onClick={handleCloudClick}
          className="cursor-pointer transition-transform active:scale-95 -translate-x-4 translate-y-2"
        >
          {currentWidget === 'cloud' && (
            isRaining ? (
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
              <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl transition-transform hover:scale-105">
                <circle cx="80" cy="40" r="18" fill="#fcd34d" className="animate-pulse"/>
                <g fill="white">
                  <circle cx="40" cy="60" r="25" />
                  <circle cx="60" cy="50" r="30" />
                  <circle cx="80" cy="60" r="25" />
                  <rect x="40" y="60" width="40" height="25" />
                </g>
              </svg>
            )
          )}
          {/* Placeholders for other widgets */}
          {currentWidget === 'heart' && <HeartWidget />}
          {currentWidget === 'dice' && <DiceWidget />}
          {currentWidget === 'fish' && <MuyuWidget />}
        </div>

        {/* Menu Overlay */}
        {showMenu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-0 z-40">
              {menuItems.map((item, index) => {
                // Distribute items above the button (50 deg to 130 deg)
                // Shifted left by 30px and down by 25px
                const startAngle = 50;
                const endAngle = 130;
                const totalAngle = endAngle - startAngle;
                // Make radius smaller for edge items to pull them towards center visually
                const isEdge = index === 0 || index === menuItems.length - 1;
                const radius = isEdge ? 65 : 75; 
                const xOffset = -38; 
                const yOffset = 27; // Shift down
                
                const step = menuItems.length > 1 ? totalAngle / (menuItems.length - 1) : 0;
                const angle = startAngle + (index * step); 
                
                const rad = angle * (Math.PI / 180);
                
                // x goes left (-), y goes up (-)
                const x = -radius * Math.cos(rad) + xOffset;
                const y = -radius * Math.sin(rad) + yOffset;
                
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentWidget(item.id);
                      setShowMenu(false);
                    }}
                    className="absolute flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-lg backdrop-blur-md transition-transform hover:scale-110 active:scale-95"
                    style={{ 
                      transform: `translate(${x}px, ${y}px)`,
                      opacity: 1,
                    }}
                  >
                    <item.icon size={20} className="text-black" />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Bubble Button */}
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="absolute right-0 top-0 flex items-center justify-center transition-all hover:scale-110 active:scale-95 z-50 -translate-y-1"
        >
          <div className="relative flex items-center justify-center">
            {/* Bubble Shape with Glassmorphism-like style */}
            <MessageCircle 
              size={36} 
              fill={showMenu ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)"}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={1.5}
              className="drop-shadow-lg transition-colors"
            />
            {/* Dots Content */}
            <MoreHorizontal 
              size={18} 
              className="absolute text-black/70" 
            />
          </div>
        </button>
      </div>
    </div>
  );
};

const ProfileCard = ({ style }) => {
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [avatarKey, setAvatarKey] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const fileInputRef = useRef(null);

  const [editState, setEditState] = useState({ type: null, isOpen: false });

  // Load profile from localStorage on mount
  useEffect(() => {
    try {
      const savedProfile = JSON.parse(localStorage.getItem("user-profile"));
      if (savedProfile) {
        if (savedProfile.nickname) setNickname(savedProfile.nickname);
        if (savedProfile.bio) setBio(savedProfile.bio);
        if (savedProfile.avatar) {
          setAvatarKey(savedProfile.avatar);
          if (isExternalUrl(savedProfile.avatar)) {
            setAvatarUrl(savedProfile.avatar);
          } else {
            loadImageUrl(savedProfile.avatar).then(url => {
              if (url) setAvatarUrl(url);
            });
          }
        }
      }
    } catch (e) {
      console.error("Failed to load user profile", e);
    }
  }, []);

  // Helper to save profile
  const saveProfile = (updates) => {
    const currentProfile = {
      nickname: updates.nickname !== undefined ? updates.nickname : nickname,
      bio: updates.bio !== undefined ? updates.bio : bio,
      avatar: updates.avatar !== undefined ? updates.avatar : avatarKey,
    };
    localStorage.setItem("user-profile", JSON.stringify(currentProfile));
    window.dispatchEvent(new Event("storage"));
  };

  const handleSave = (newValue) => {
    const trimmed = newValue.trim();
    if (editState.type === 'nickname') {
      setNickname(trimmed);
      saveProfile({ nickname: trimmed });
    }
    if (editState.type === 'bio') {
      setBio(trimmed);
      saveProfile({ bio: trimmed });
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const imageKey = "avatar";
      await saveImage(imageKey, file);
      const blobUrl = URL.createObjectURL(file);
      setAvatarKey(imageKey);
      setAvatarUrl(blobUrl);
      saveProfile({ avatar: imageKey });
    }
  };

  return (
    <>
      <div className="relative w-full overflow-hidden rounded-[32px] px-6 pb-6 pt-5 text-center shadow-lg shadow-black/5 transition-all duration-300">
        <LayeredBackground style={style} rounded="rounded-[32px]" />

        {/* Content Layer */}
        <div className="relative z-10">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="image/*"
          />

          <button
            type="button"
            onClick={handleAvatarClick}
            className="relative mx-auto flex h-[88px] w-[88px] items-center justify-center rounded-full bg-gray-50 text-black shadow-sm border-4 border-white transition active:scale-95 overflow-hidden"
            aria-label="Edit avatar"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <User2 size={32} className="text-gray-400" />
            )}
          </button>
          
          <h1 
            onClick={() => setEditState({ type: 'nickname', isOpen: true })}
            className="mt-3 text-[22px] font-bold text-text cursor-pointer active:opacity-70 transition-opacity truncate px-4"
          >
            <span className="text-[18px] mr-0.5">@</span>{nickname || "User"}
          </h1>

          <p 
            onClick={() => setEditState({ type: 'bio', isOpen: true })}
            className="mt-1 translate-y-1 text-sm italic text-black/80 cursor-pointer active:opacity-70 transition-opacity line-clamp-2 px-2 font-medium"
          >
            {bio ? `“${bio}”` : "点击编辑个性签名..."}
          </p>
        </div>
      </div>

      <EditModal 
        isOpen={editState.isOpen}
        onClose={() => setEditState({ ...editState, isOpen: false })}
        onSave={handleSave}
        title={editState.type === 'nickname' ? "修改昵称" : "修改个性签名"}
        initialValue={editState.type === 'nickname' ? nickname : bio}
        placeholder={editState.type === 'nickname' ? "你的昵称" : "点击编辑个性签名..."}
      />
    </>
  );
};

const DailyQuoteWidget = () => {
  const [quote, setQuote] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    try {
      const savedQuote = localStorage.getItem("daily-quote");
      if (savedQuote) {
        setQuote(savedQuote);
      }
    } catch (e) {
      console.error("Failed to load daily quote", e);
    }
  }, []);

  const handleSave = (val) => {
    const newQuote = val.trim();
    setQuote(newQuote);
    localStorage.setItem("daily-quote", newQuote);
  };

  return (
    <>
      <div 
        className="relative flex flex-1 flex-col justify-center rounded-[20px] px-4 py-2 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
        onClick={() => setIsModalOpen(true)}
      >
        <p className={`relative z-10 text-sm font-medium text-text/80 italic leading-relaxed line-clamp-3 break-words whitespace-pre-wrap -mt-2 ${quote ? 'underline decoration-dashed decoration-black/20 underline-offset-4' : ''}`}>
          {quote || "点击编辑文字..."}
        </p>
      </div>

      <EditModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        title="编辑文字"
        initialValue={quote}
        placeholder="点击编辑文字..."
        multiline={true}
      />
    </>
  );
};

export default function Home() {
  const [activePage, setActivePage] = useState(0);
  const [wallpaper, setWallpaper] = useState(null);
  const totalPages = 2;
  
  const containerRef = useRef(null);
  
  // Component Styles State - Lazy initialization to prevent flicker
  const [styles, setStyles] = useState(() => {
    try {
      const savedStyles = JSON.parse(localStorage.getItem("component-styles"));
      if (savedStyles) {
        let hasChanges = false;
        
        // Ensure icon style exists (migration)
        if (!savedStyles.icon) {
          savedStyles.icon = savedStyles.widget ? { ...savedStyles.widget } : { opacity: 40, material: 'glass', color: '#ffffff', backgroundImage: null };
          hasChanges = true;
        }
        
        // Apply auto-fixes synchronously during initialization
        const fixOpacity = (key, defaultOp) => {
          if (savedStyles[key]?.opacity === 80 && !savedStyles[key]?.backgroundImage) {
            savedStyles[key].opacity = defaultOp;
            hasChanges = true;
          }
        };

        fixOpacity('widget', 40);
        fixOpacity('icon', 40);
        fixOpacity('dock', 30);
        fixOpacity('profile', 40);

        if (hasChanges) {
          localStorage.setItem("component-styles", JSON.stringify(savedStyles));
        }
        
        return savedStyles;
      }
    } catch (e) {
      console.error("Failed to load initial component styles", e);
    }
    
    return {
      profile: { opacity: 40, material: 'glass', color: '#ffffff', backgroundImage: null },
      widget: { opacity: 40, material: 'glass', color: '#ffffff', backgroundImage: null },
      icon: { opacity: 40, material: 'glass', color: '#ffffff', backgroundImage: null },
      dock: { opacity: 30, material: 'glass', color: '#ffffff', backgroundImage: null },
    };
  });

  const [customIcons, setCustomIcons] = useState({});

  useEffect(() => {
    const loadSettings = async () => {
      // Load Wallpaper
      try {
        const savedWallpaper = JSON.parse(localStorage.getItem("active-wallpaper"));
        if (savedWallpaper && savedWallpaper.scope === 'home') {
          if (savedWallpaper.imageKey) {
            const url = await loadImageUrl(savedWallpaper.imageKey);
            setWallpaper(url);
          } else if (savedWallpaper.url) {
            setWallpaper(savedWallpaper.url);
          } else {
            setWallpaper(null);
          }
        } else {
          setWallpaper(null);
        }
      } catch (e) {
        console.error("Failed to load wallpaper", e);
      }

      // Load Component Styles (resolve backgroundImages from IndexedDB)
      try {
        const savedStyles = JSON.parse(localStorage.getItem("component-styles"));
        if (savedStyles) {
          const resolved = { ...savedStyles };
          for (const key of ['profile', 'widget', 'icon', 'dock']) {
            if (resolved[key]?.backgroundImage && !isExternalUrl(resolved[key].backgroundImage)) {
              const url = await loadImageUrl(resolved[key].backgroundImage);
              if (url) resolved[key] = { ...resolved[key], backgroundImage: url };
            }
          }
          setStyles(resolved);
        }
      } catch (e) {
        console.error("Failed to load component styles", e);
      }

      // Load Custom Icons (resolve IndexedDB keys)
      try {
        const savedIcons = JSON.parse(localStorage.getItem("custom-icons") || "{}");
        const resolved = {};
        for (const [id, value] of Object.entries(savedIcons)) {
          if (isExternalUrl(value)) {
            resolved[id] = value;
          } else if (value) {
            const blobUrl = await loadImageUrl(value);
            if (blobUrl) resolved[id] = blobUrl;
          }
        }
        setCustomIcons(resolved);
      } catch (e) {
        console.error("Failed to load custom icons", e);
      }
    };

    loadSettings();

    window.addEventListener('storage', loadSettings);
    window.addEventListener('component-style-updated', loadSettings);
    window.addEventListener('custom-icons-updated', loadSettings);

    const handleVisibilityChange = () => {
      if (!document.hidden) loadSettings();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('storage', loadSettings);
      window.removeEventListener('component-style-updated', loadSettings);
      window.removeEventListener('custom-icons-updated', loadSettings);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleScroll = (e) => {
    const scrollLeft = e.target.scrollLeft;
    const width = e.target.offsetWidth;
    const page = Math.round(scrollLeft / width);
    setActivePage(page);
  };

  return (
    <div className="flex h-full flex-col relative w-full overflow-hidden">
      {/* Home Specific Wallpaper */}
      {wallpaper && (
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${wallpaper})` }}
        />
      )}

      {/* Swipeable Area */}
      <div
        ref={containerRef}
        className="swipe-container no-scrollbar relative z-10 flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
        style={{ overscrollBehaviorX: 'contain' }}
        onScroll={handleScroll}
      >
        {/* Page 1 */}
        <section className="no-scrollbar flex h-full w-full flex-shrink-0 snap-center flex-col px-5 pt-4">
          <ProfileCard style={styles.profile} />
          
          {/* Spacer below ProfileCard */}
          <div className="h-7" />
          
          <div className="flex flex-col gap-7">
            {/* Top Section: Left Big, Right Column */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left Big Widget */}
              <div className="aspect-square w-full">
                <CountdownWidget style={styles.widget} />
              </div>

              {/* Right Column */}
              <div className="relative h-full">
                <div className="absolute inset-0 flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4 shrink-0">
                    <SmallWidget icon={Heart} label="情侣空间" style={styles.icon} iconId="widget_love" customIcons={customIcons} />
                    <SmallWidget icon={Globe} label="世界书" style={styles.icon} iconId="widget_world" customIcons={customIcons} />
                  </div>
                  
                  {/* Editable Text Area - Fills remaining height */}
                  <DailyQuoteWidget />
                </div>
              </div>
            </div>

            {/* Bottom Section: Left Small Widgets, Right Big */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid grid-cols-2 gap-4 content-start">
                <SmallWidget icon={Book} label="日记" style={styles.icon} iconId="widget_diary" customIcons={customIcons} />
                <SmallWidget icon={Clapperboard} label="小剧场" style={styles.icon} iconId="widget_theater" customIcons={customIcons} />
                <SmallWidget icon={Plus} label="待定1" style={styles.icon} iconId="widget_tbd1" customIcons={customIcons} />
                <SmallWidget icon={Plus} label="待定2" style={styles.icon} iconId="widget_tbd2" customIcons={customIcons} />
              </div>
              
              <div className="aspect-square w-full">
                <CloudWidget />
              </div>
            </div>
          </div>
          
          {/* Spacer for Dock */}
          <div className="h-28 w-full shrink-0" />
        </section>

        {/* Page 2 */}
        <section className="no-scrollbar flex h-full w-full flex-shrink-0 snap-center flex-col px-5 pt-2">
          <div className="h-6" />
          
          <div className="grid grid-cols-2 gap-4">
            <div className="relative col-span-2 aspect-[2/1] rounded-[24px] shadow-sm overflow-hidden">
              <LayeredBackground style={styles.widget} />
              <div className="relative z-10 flex h-full items-center justify-center text-muted">
                <VinylWidget />
              </div>
            </div>
            
            <div className="relative aspect-square rounded-[24px] shadow-sm overflow-hidden">
              <LayeredBackground style={styles.widget} />
            </div>
            <div className="relative aspect-square rounded-[24px] shadow-sm overflow-hidden">
              <LayeredBackground style={styles.widget} />
            </div>
            <div className="relative aspect-square rounded-[24px] shadow-sm overflow-hidden">
              <LayeredBackground style={styles.widget} />
            </div>
            <div className="relative aspect-square rounded-[24px] shadow-sm overflow-hidden">
              <LayeredBackground style={styles.widget} />
            </div>
          </div>
          
          {/* Spacer for Dock */}
          <div className="h-28 w-full shrink-0" />
        </section>
      </div>

      {/* Pagination Dots */}
      <div className="fixed bottom-40 left-0 right-0 z-50 flex justify-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full transition-colors ${activePage === 0 ? "bg-white" : "bg-black/10"}`} />
        <span className={`h-1.5 w-1.5 rounded-full transition-colors ${activePage === 1 ? "bg-white" : "bg-black/10"}`} />
      </div>
    </div>
  );
}
