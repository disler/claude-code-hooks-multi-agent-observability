import type { ChartDataPoint, ChartConfig } from '../types';

export interface ChartDimensions {
  width: number;
  height: number;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

/**
 * Canvas2D renderer for the live pulse chart. Public API (createChartRenderer +
 * clear/drawBackground/drawAxes/drawTimeLabels/drawBars/drawPulseEffect/resize)
 * is preserved; internals were redesigned for the "Precision Instrument" look:
 * a real labelled value axis, hairline gridlines, a flat area for total events,
 * and a thin second line for tool calls — no emoji chips, glow, or gradients.
 */
export class ChartRenderer {
  private ctx: CanvasRenderingContext2D;
  private dimensions: ChartDimensions;
  private config: ChartConfig;
  private animationId: number | null = null;
  private niceMax = 1;

  constructor(
    canvas: HTMLCanvasElement,
    dimensions: ChartDimensions,
    config: ChartConfig
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    this.ctx = ctx;
    this.dimensions = dimensions;
    this.config = config;
    this.setupCanvas(canvas);
  }

  private setupCanvas(canvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = this.dimensions.width * dpr;
    canvas.height = this.dimensions.height * dpr;
    canvas.style.width = `${this.dimensions.width}px`;
    canvas.style.height = `${this.dimensions.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private getChartArea() {
    const { width, height, padding } = this.dimensions;
    return {
      x: padding.left,
      y: padding.top,
      width: width - padding.left - padding.right,
      height: height - padding.top - padding.bottom
    };
  }

  // Round a raw max up to a friendly axis ceiling (1,2,5,10,20,50,...).
  private niceCeil(value: number): number {
    if (value <= 1) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(value)));
    const n = value / pow;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * pow;
  }

  private cssVar(name: string, fallback: string): string {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch {
      return fallback;
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.dimensions.width, this.dimensions.height);
  }

  // Kept for API compatibility; the redesign uses a flat plot, so this is a no-op.
  drawBackground() { /* flat surface — no gradient fill */ }

  // Hairline gridlines + labelled value axis (0 / mid / max). Accepts the data
  // max so it can scale; defaults to the last-known nice max for API compat.
  drawAxes(maxValue?: number) {
    const area = this.getChartArea();
    if (typeof maxValue === 'number') this.niceMax = this.niceCeil(Math.max(maxValue, 1));

    const ticks = [0, this.niceMax / 2, this.niceMax];
    this.ctx.lineWidth = 1;
    this.ctx.font = '10px ui-monospace, "IBM Plex Mono", monospace';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    ticks.forEach((t) => {
      const y = area.y + area.height - (t / this.niceMax) * area.height;
      this.ctx.strokeStyle = this.config.colors.axis;
      this.ctx.globalAlpha = t === 0 ? 0.9 : 0.5;
      this.ctx.beginPath();
      this.ctx.moveTo(area.x, y);
      this.ctx.lineTo(area.x + area.width, y);
      this.ctx.stroke();
      this.ctx.globalAlpha = 1;

      this.ctx.fillStyle = this.config.colors.text;
      this.ctx.fillText(String(Math.round(t)), area.x - 6, y);
    });
  }

  drawTimeLabels(timeRange: string) {
    const area = this.getChartArea();
    this.ctx.fillStyle = this.config.colors.text;
    this.ctx.font = '10px ui-monospace, "IBM Plex Mono", monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';

    const labels = this.getTimeLabels(timeRange);
    if (labels.length < 2) return;
    const spacing = area.width / (labels.length - 1);

    labels.forEach((label, index) => {
      const x = area.x + index * spacing;
      const anchor = index === 0 ? 'left' : index === labels.length - 1 ? 'right' : 'center';
      this.ctx.textAlign = anchor as CanvasTextAlign;
      this.ctx.fillText(label, x, area.y + area.height + 6);
    });
  }

  private getTimeLabels(timeRange: string): string[] {
    switch (timeRange) {
      case '1m':
        return ['-60s', '-45s', '-30s', '-15s', 'now'];
      case '3m':
        return ['-3m', '-2m', '-1m', 'now'];
      case '5m':
        return ['-5m', '-4m', '-3m', '-2m', '-1m', 'now'];
      case '10m':
        return ['-10m', '-8m', '-6m', '-4m', '-2m', 'now'];
      default:
        return [];
    }
  }

  /**
   * Draws the total-events area + line and a thin tool-calls overlay line.
   * Signature preserved (formatLabel/getSessionColor are accepted but unused —
   * the redesign drops per-bar emoji labels and per-session bar coloring in
   * favour of two clean series).
   */
  drawBars(
    dataPoints: ChartDataPoint[],
    maxValue: number,
    progress: number = 1,
    _formatLabel?: (eventTypes: Record<string, number>, toolEvents?: Record<string, number>) => string,
    _getSessionColor?: (sessionId: string) => string
  ) {
    const area = this.getChartArea();
    this.niceMax = this.niceCeil(Math.max(maxValue, 1));
    if (dataPoints.length < 2) return;

    const primary = this.config.colors.primary;
    const toolColor = this.cssVar('--theme-accent-success', '#3ec27a');

    const xAt = (i: number) => area.x + (i / (dataPoints.length - 1)) * area.width;
    const yAt = (v: number) => area.y + area.height - (Math.min(v, this.niceMax) / this.niceMax) * area.height * progress;

    // ── area under the total-events series ──
    this.ctx.beginPath();
    this.ctx.moveTo(area.x, area.y + area.height);
    dataPoints.forEach((p, i) => this.ctx.lineTo(xAt(i), yAt(p.count)));
    this.ctx.lineTo(area.x + area.width, area.y + area.height);
    this.ctx.closePath();
    const grad = this.ctx.createLinearGradient(0, area.y, 0, area.y + area.height);
    grad.addColorStop(0, this.adjustColorOpacity(primary, 0.22));
    grad.addColorStop(1, this.adjustColorOpacity(primary, 0));
    this.ctx.fillStyle = grad;
    this.ctx.fill();

    // ── total-events line ──
    this.ctx.lineJoin = 'round';
    this.ctx.lineWidth = 1.6;
    this.ctx.strokeStyle = primary;
    this.ctx.beginPath();
    dataPoints.forEach((p, i) => (i === 0 ? this.ctx.moveTo(xAt(i), yAt(p.count)) : this.ctx.lineTo(xAt(i), yAt(p.count))));
    this.ctx.stroke();

    // ── tool-calls overlay line (PreToolUse per bucket) ──
    this.ctx.lineWidth = 1.3;
    this.ctx.strokeStyle = this.adjustColorOpacity(toolColor, 0.9);
    this.ctx.beginPath();
    dataPoints.forEach((p, i) => {
      const v = p.eventTypes?.['PreToolUse'] || 0;
      i === 0 ? this.ctx.moveTo(xAt(i), yAt(v)) : this.ctx.lineTo(xAt(i), yAt(v));
    });
    this.ctx.stroke();
  }

  private adjustColorOpacity(color: string, opacity: number): string {
    if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
      let r: number, g: number, b: number;
      if (color.length === 7) {
        r = parseInt(color.slice(1, 3), 16);
        g = parseInt(color.slice(3, 5), 16);
        b = parseInt(color.slice(5, 7), 16);
      } else {
        r = parseInt(color[1] + color[1], 16);
        g = parseInt(color[2] + color[2], 16);
        b = parseInt(color[3] + color[3], 16);
      }
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return color;
  }

  // Subtle "new event" marker at the right edge (no radial glow halo).
  drawPulseEffect(x: number, y: number, radius: number, opacity: number) {
    this.ctx.save();
    this.ctx.strokeStyle = this.adjustColorOpacity(this.config.colors.primary, Math.max(opacity, 0));
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();
    this.ctx.arc(x, y, Math.max(radius, 0.1), 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  animate(renderCallback: (progress: number) => void) {
    const startTime = performance.now();

    const frame = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / this.config.animationDuration, 1);

      renderCallback(this.easeOut(progress));

      if (progress < 1) {
        this.animationId = requestAnimationFrame(frame);
      } else {
        this.animationId = null;
      }
    };

    this.animationId = requestAnimationFrame(frame);
  }

  private easeOut(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  resize(dimensions: ChartDimensions) {
    this.dimensions = dimensions;
    this.setupCanvas(this.ctx.canvas as HTMLCanvasElement);
  }
}

export function createChartRenderer(
  canvas: HTMLCanvasElement,
  dimensions: ChartDimensions,
  config: ChartConfig
): ChartRenderer {
  return new ChartRenderer(canvas, dimensions, config);
}
