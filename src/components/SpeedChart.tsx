import { useEffect, useState } from "react";

const SAMPLE_COUNT = 60;
const SAMPLE_INTERVAL_MS = 1000;
const CHART_WIDTH = 320;
const CHART_HEIGHT = 72;

interface SpeedSample {
  download: number;
  upload: number;
}

interface SpeedChartProps {
  downloadSpeed: number;
  uploadSpeed: number;
  enabled: boolean;
}

function linePath(samples: SpeedSample[], key: keyof SpeedSample, max: number): string {
  return samples
    .map((sample, index) => {
      const x = (index / (SAMPLE_COUNT - 1)) * CHART_WIDTH;
      const y = CHART_HEIGHT - 2 - (sample[key] / max) * (CHART_HEIGHT - 4);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function SpeedChart({ downloadSpeed, uploadSpeed, enabled }: SpeedChartProps) {
  const [samples, setSamples] = useState<SpeedSample[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const sample = () => {
      setSamples((current) => [
        ...current,
        { download: downloadSpeed, upload: uploadSpeed },
      ].slice(-SAMPLE_COUNT));
    };
    sample();
    const interval = window.setInterval(sample, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [downloadSpeed, enabled, uploadSpeed]);

  const peak = Math.max(
    1,
    ...samples.flatMap((sample) => [sample.download, sample.upload]),
  );
  const scale = peak * 1.15;

  return (
    <div className={`speed-chart ${enabled ? "" : "disabled"}`}>
      <div className="speed-chart-legend" aria-hidden="true">
        <span className="speed-chart-label download">↓ Загрузка</span>
        <span className="speed-chart-label upload">↑ Отдача</span>
      </div>
      <svg
        aria-label={
          enabled
            ? "График скорости: зелёная линия — скачивание, синяя линия — отдача"
            : "График скоростей доступен в приложении"
        }
        className="speed-chart-plot"
        height={CHART_HEIGHT}
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      >
        <path className="speed-chart-grid" d={`M0 ${CHART_HEIGHT / 2}H${CHART_WIDTH}`} />
        {enabled && (
          <>
            <path
              className="speed-chart-line download"
              d={linePath(samples, "download", scale)}
            />
            <path
              className="speed-chart-line upload"
              d={linePath(samples, "upload", scale)}
            />
          </>
        )}
      </svg>
    </div>
  );
}
