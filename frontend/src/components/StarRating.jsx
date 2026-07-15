import React from "react";
import { Star } from "lucide-react";

export default function StarRating({ value = 0, onChange, size = 16, testIdBase }) {
  const [hover, setHover] = React.useState(0);
  const cur = hover || value;
  return (
    <div className="inline-flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          key={n}
          data-testid={testIdBase ? `${testIdBase}-${n}` : undefined}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange?.(n === value ? 0 : n)}
          className="p-0.5 transition-transform duration-100 hover:scale-110"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            className="transition-colors duration-100"
            style={{ width: size, height: size }}
            fill={n <= cur ? "#D4A373" : "none"}
            stroke={n <= cur ? "#D4A373" : "#8A9A92"}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}
