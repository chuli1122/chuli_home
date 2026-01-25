import React from 'react';

const LayeredBackground = ({ style, rounded = "rounded-[24px]", borderOpacity = "border-white/20" }) => {
  if (!style) return null;
  
  return (
    <>
      {/* Background Layer - Controlled by Opacity */}
      <div 
        className={`absolute inset-0 pointer-events-none bg-cover bg-center shadow-sm transition-all duration-300 ${rounded}`}
        style={{ 
          backgroundColor: style.backgroundImage ? 'transparent' : style.color,
          backgroundImage: style.backgroundImage ? `url(${style.backgroundImage})` : 'none',
          opacity: style.opacity / 100,
          backdropFilter: style.material === 'glass' ? 'blur(20px)' : style.material === 'frost' ? 'blur(10px)' : 'none',
        }}
      />

      {/* Material Overlay - Constant Opacity based on material */}
      <div 
        className={`absolute inset-0 pointer-events-none ${rounded}`}
        style={{
          backgroundColor: style.material === 'glass' ? 'rgba(255,255,255,0.1)' : style.material === 'frost' ? 'rgba(255,255,255,0.3)' : 'transparent',
        }}
      />

      {/* Border Layer - Independent */}
      {(style.material === 'glass' || style.material === 'frost') && (
        <div className={`absolute inset-0 pointer-events-none border ${borderOpacity} ${rounded}`} />
      )}
    </>
  );
};

export default LayeredBackground;
