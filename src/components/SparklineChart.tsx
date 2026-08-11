"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: Array<{ x: number; y: number }>;
  positive?: boolean;
  color?: string;
  width?: number | string;
  height?: number;
}

export function SparklineChart({ data, positive = true, color, width = "100%", height = 32 }: SparklineProps) {
  const resolvedColor = color ?? (positive ? "#00C807" : "#FF6B8A");

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="y"
            stroke={resolvedColor}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
