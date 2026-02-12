/**
 * BubbleFrame — CSS border-image nine-slice chat bubble.
 *
 * Uses pixel-art bubble PNGs from /assets/bubbles/ as border-image source.
 * Each theme (retro / macaron / silverpink) has 5 variants with different shapes.
 * All source images have a speech tail at the bottom-left corner.
 *
 * Slice values determined by pixel analysis of all 15 bubble PNGs:
 *   Top: 53px, Right: 68px, Bottom: 98px, Left: 53px
 * These capture all corner stepping and the tail in every variant.
 *
 * Props:
 *   theme    – 'retro' | 'macaron' | 'silverpink'  (default: 'silverpink')
 *   variant  – 1-5                                  (default: 1)
 *   side     – 'left' | 'right'                     (default: 'left')
 *             'right' mirrors the bubble so the tail faces bottom-right.
 *   children – content inside the bubble
 *   className – additional CSS class names
 *   style    – additional inline styles
 */

// Universal slice values (pixels) determined by pixel-level analysis.
// All 15 bubble PNGs share the same pixel-art grid, so one set works for all.
const SLICE = "53 68 98 53";

// Rendered border size (layout space for the nine-slice border).
// Corners get scaled from source pixels to these values.
const BORDER = "14px 16px 24px 14px";

export default function BubbleFrame({
  theme = "silverpink",
  variant = 1,
  side = "left",
  children,
  className = "",
  style,
}) {
  const v = variant >= 1 && variant <= 5 ? variant : 1;
  const src = `/assets/bubbles/bubble-${theme}${v}.png`;
  const isRight = side === "right";

  return (
    <div
      className={`bubble-frame ${className}`}
      style={{
        borderStyle: "solid",
        borderWidth: BORDER,
        borderColor: "transparent",
        borderImageSource: `url(${src})`,
        borderImageSlice: `${SLICE} fill`,
        borderImageWidth: BORDER,
        borderImageRepeat: "stretch",
        imageRendering: "pixelated",
        padding: "2px 6px",
        background: "transparent",
        transform: isRight ? "scaleX(-1)" : undefined,
        ...style,
      }}
    >
      <div style={isRight ? { transform: "scaleX(-1)" } : undefined}>
        {children}
      </div>
    </div>
  );
}
