import { useRef, useState } from "react";

type RectShape = {
  id: number;
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
};

type CircleShape = {
  id: number;
  type: "circle";
  cx: number;
  cy: number;
  r: number;
  fill: string;
  stroke: string;
};

type Shape = RectShape | CircleShape;

export function SvgEditor() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [drawing, setDrawing] = useState<Shape | null>(null);
  const [shapeType, setShapeType] = useState<"rect" | "circle">("rect");
  const [color, setColor] = useState("#3b82f6");
  const [history, setHistory] = useState<Shape[][]>([]);
  const [future, setFuture] = useState<Shape[][]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const idRef = useRef(0);

  function hexToRgba(hex: string, alpha: number) {
    const trimmed = hex.replace("#", "");
    const bigint = parseInt(trimmed, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function snapshot(list: Shape[]) {
    return list.map((s) => ({ ...s }));
  }

  function getRelativePoint(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    const { x, y } = getRelativePoint(e);
    setHistory((prev) => [...prev, snapshot(shapes)]);
    setFuture([]);
    let newShape: Shape;
    if (shapeType === "rect") {
      newShape = {
        id: idRef.current++,
        type: "rect",
        x,
        y,
        width: 0,
        height: 0,
        fill: hexToRgba(color, 0.3),
        stroke: color,
      };
    } else {
      newShape = {
        id: idRef.current++,
        type: "circle",
        cx: x,
        cy: y,
        r: 0,
        fill: hexToRgba(color, 0.3),
        stroke: color,
      };
    }
    setDrawing(newShape);
    setShapes((prev) => [...prev, newShape]);
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!drawing) return;
    const { x, y } = getRelativePoint(e);
    let updated: Shape;
    if (drawing.type === "rect") {
      updated = {
        ...drawing,
        width: x - drawing.x,
        height: y - drawing.y,
      };
    } else {
      const r = Math.sqrt((x - drawing.cx) ** 2 + (y - drawing.cy) ** 2);
      updated = {
        ...drawing,
        r,
      };
    }
    setDrawing(updated);
    setShapes((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function onMouseUp() {
    setDrawing(null);
  }

  function clear() {
    if (shapes.length) {
      setHistory((prev) => [...prev, snapshot(shapes)]);
      setFuture([]);
    }
    setShapes([]);
  }

  function undo() {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const previous = prev[prev.length - 1];
      setFuture((f) => [snapshot(shapes), ...f]);
      setShapes(previous);
      return prev.slice(0, -1);
    });
  }

  function redo() {
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[0];
      setHistory((h) => [...h, snapshot(shapes)]);
      setShapes(next);
      return prev.slice(1);
    });
  }

  function download() {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "drawing.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 space-y-2">
      <div className="flex flex-wrap items-center space-x-2">
        <label className="flex items-center space-x-1">
          <span>Shape:</span>
          <select
            className="border rounded px-1 py-0.5"
            value={shapeType}
            onChange={(e) => setShapeType(e.target.value as "rect" | "circle")}
          >
            <option value="rect">Rectangle</option>
            <option value="circle">Circle</option>
          </select>
        </label>
        <label className="flex items-center space-x-1">
          <span>Color:</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <button
          className="border px-2 py-1 rounded"
          onClick={undo}
          disabled={history.length === 0}
        >
          Undo
        </button>
        <button
          className="border px-2 py-1 rounded"
          onClick={redo}
          disabled={future.length === 0}
        >
          Redo
        </button>
        <button className="border px-2 py-1 rounded" onClick={clear}>
          Clear
        </button>
        <button className="border px-2 py-1 rounded" onClick={download}>
          Download
        </button>
      </div>
      <p className="text-sm text-gray-600">Drag on the canvas to draw.</p>
      <svg
        ref={svgRef}
        className="border w-full h-[500px] bg-white"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
      >
        {shapes.map((shape) => (
          shape.type === "rect" ? (
            <rect
              key={shape.id}
              x={Math.min(shape.x, shape.x + shape.width)}
              y={Math.min(shape.y, shape.y + shape.height)}
              width={Math.abs(shape.width)}
              height={Math.abs(shape.height)}
              fill={shape.fill}
              stroke={shape.stroke}
            />
          ) : (
            <circle
              key={shape.id}
              cx={shape.cx}
              cy={shape.cy}
              r={Math.abs(shape.r)}
              fill={shape.fill}
              stroke={shape.stroke}
            />
          )
        ))}
      </svg>
    </div>
  );
}

