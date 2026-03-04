import { formatCurrency } from '../lib/utils';
import type { PageType } from '../types';

type LtvPageCategory = 'paid' | 'free' | 'mixed';

const TIER_THRESHOLDS: Record<LtvPageCategory, [number, number, number]> = {
  paid:  [10, 20, 40],
  free:  [1,  2,  4],
  mixed: [5,  10, 20],
};

function resolveCategory(pageType?: PageType | null): LtvPageCategory {
  if (pageType === 'Paid Page') return 'paid';
  if (pageType === 'Free Page') return 'free';
  return 'mixed';
}

interface LtvGaugeProps {
  value: number;
  maxValue: number;
  label?: string;
  sublabel?: string;
  size?: 'sm' | 'md' | 'lg';
  pageType?: PageType | null;
}

const RADIUS = 70;
const STROKE = 10;
const CIRCUMFERENCE = Math.PI * RADIUS;

function getColor(value: number, pageType?: PageType | null): string {
  if (value <= 0) return '#333333';
  const [low, ok, premium] = TIER_THRESHOLDS[resolveCategory(pageType)];
  if (value < low) return '#ef4444';
  if (value < ok) return '#f59e0b';
  if (value < premium) return '#22c55e';
  return '#1d9bf0';
}

function getTierLabel(value: number, pageType?: PageType | null): string {
  if (value <= 0) return 'No data';
  const [low, ok, premium] = TIER_THRESHOLDS[resolveCategory(pageType)];
  if (value < low) return 'Low';
  if (value < ok) return 'Below target';
  if (value < premium) return 'On target';
  return 'Premium';
}

export default function LtvGauge({ value, maxValue, label, sublabel, size = 'md', pageType }: LtvGaugeProps) {
  const fillPct = maxValue > 0 ? Math.min(value / maxValue, 1) : 0;
  const fillLength = fillPct * CIRCUMFERENCE;
  const color = getColor(value, pageType);
  const tier = getTierLabel(value, pageType);

  const dimensions = { sm: { w: 140, h: 90 }, md: { w: 180, h: 110 }, lg: { w: 240, h: 145 } };
  const fonts = { sm: { val: 18, tier: 9, label: 10 }, md: { val: 24, tier: 10, label: 11 }, lg: { val: 32, tier: 12, label: 13 } };
  const d = dimensions[size];
  const f = fonts[size];

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 200 115"
        width={d.w}
        height={d.h}
        className="overflow-visible"
      >
        {/* Background arc */}
        <circle
          cx="100" cy="100" r={RADIUS}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth={STROKE}
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE * 2}`}
          transform="rotate(180 100 100)"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        {fillPct > 0 && (
          <circle
            cx="100" cy="100" r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeDasharray={`${fillLength} ${CIRCUMFERENCE * 2}`}
            transform="rotate(180 100 100)"
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
            style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
          />
        )}
        {/* Value */}
        <text x="100" y="88" textAnchor="middle" fill="white" fontSize={f.val} fontWeight="700" fontFamily="system-ui, sans-serif">
          {value > 0 ? formatCurrency(value) : '—'}
        </text>
        {/* Tier label */}
        <text x="100" y="105" textAnchor="middle" fill={color} fontSize={f.tier} fontWeight="500" fontFamily="system-ui, sans-serif">
          {tier}
        </text>
      </svg>
      {label && (
        <span className={`text-white font-medium truncate max-w-full mt-1 ${size === 'lg' ? 'text-sm' : 'text-xs'}`}>
          {label}
        </span>
      )}
      {sublabel && (
        <span className="text-[10px] text-text-muted truncate max-w-full">{sublabel}</span>
      )}
    </div>
  );
}

export { getColor, getTierLabel };
