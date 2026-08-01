import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import Card from "../ui/Card";

const RISK_HIGH  = "#e11d48";
const RISK_MED   = "#f59e0b";
const TICK_STYLE = { fontSize: 11, fill: "#94a3b8", fontFamily: "Inter, system-ui, sans-serif" };

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const pct = Math.round(payload[0].value * 100);
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-md">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-sm font-semibold" style={{ color: pct > 60 ? RISK_HIGH : RISK_MED }}>
        {pct}% risk
      </p>
    </div>
  );
};

export default function RiskTrendChart({ data = [], title = "Risk Trend" }) {
  if (!data.length) return null;

  return (
    <Card title={title} padding="lg">
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={RISK_HIGH} stopOpacity={0.15} />
              <stop offset="100%" stopColor={RISK_HIGH} stopOpacity={0}    />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="#e2e8f0"
            strokeDasharray="4 2"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={TICK_STYLE}
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={v => `${Math.round(v * 100)}%`}
            axisLine={false}
            tickLine={false}
            tick={TICK_STYLE}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="prob"
            stroke={RISK_HIGH}
            strokeWidth={2}
            fill="url(#riskGrad)"
            dot={false}
            activeDot={{ r: 4, fill: RISK_HIGH, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
