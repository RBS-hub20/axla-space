"use client";

const COLORS = ["#00FF85", "#22C55E", "#FBBF24", "#38BDF8", "#F472B6"];
const PIECE_COUNT = 40;

/** Hand-rolled CSS confetti burst — no canvas-confetti dependency needed for one celebratory moment. Unmount after ~2.5s. */
export function ConfettiBurst() {
  const pieces = Array.from({ length: PIECE_COUNT }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.3;
    const duration = 1.8 + Math.random() * 1.2;
    const color = COLORS[i % COLORS.length];
    const rotate = Math.random() * 360;
    const size = 6 + Math.random() * 6;

    return (
      <span
        key={i}
        style={{
          position: "fixed",
          top: "-10px",
          left: `${left}%`,
          width: size,
          height: size * 0.4,
          backgroundColor: color,
          transform: `rotate(${rotate}deg)`,
          animation: `confetti-fall ${duration}s ease-in ${delay}s forwards`,
          zIndex: 60,
          pointerEvents: "none",
        }}
      />
    );
  });

  return (
    <>
      <style>{`
        @keyframes confetti-fall {
          to {
            top: 105vh;
            transform: rotate(720deg);
            opacity: 0.3;
          }
        }
      `}</style>
      {pieces}
    </>
  );
}
