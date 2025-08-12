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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [elementCode, setElementCode] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  function generateSvg(list: Shape[]) {
    const elements = list
      .map((s) => {
        if (s.type === "rect") {
          const x = Math.min(s.x, s.x + s.width);
          const y = Math.min(s.y, s.y + s.height);
          const width = Math.abs(s.width);
          const height = Math.abs(s.height);
          return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${s.fill}" stroke="${s.stroke}" />`;
        } else {
          const r = Math.abs(s.r);
          return `<circle cx="${s.cx}" cy="${s.cy}" r="${r}" fill="${s.fill}" stroke="${s.stroke}" />`;
        }
      })
      .join("\n  ");
    return `<svg xmlns="http://www.w3.org/2000/svg">\n  ${elements}\n</svg>`;
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "image/svg+xml");
      const loaded: Shape[] = [];
      let id = idRef.current;
      doc.querySelectorAll("rect").forEach((el) => {
        loaded.push({
          id: id++,
          type: "rect",
          x: parseFloat(el.getAttribute("x") || "0"),
          y: parseFloat(el.getAttribute("y") || "0"),
          width: parseFloat(el.getAttribute("width") || "0"),
          height: parseFloat(el.getAttribute("height") || "0"),
          fill: el.getAttribute("fill") || "transparent",
          stroke: el.getAttribute("stroke") || "black",
        });
      });
      doc.querySelectorAll("circle").forEach((el) => {
        loaded.push({
          id: id++,
          type: "circle",
          cx: parseFloat(el.getAttribute("cx") || "0"),
          cy: parseFloat(el.getAttribute("cy") || "0"),
          r: parseFloat(el.getAttribute("r") || "0"),
          fill: el.getAttribute("fill") || "transparent",
          stroke: el.getAttribute("stroke") || "black",
        });
      });
      idRef.current = id;
      setShapes(loaded);
    };
    reader.readAsText(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === "image/svg+xml") {
      handleFile(file);
    }
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
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
    <div
      className="fixed inset-0 flex"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="w-64 p-4 bg-white/90 dark:bg-gray-800/90 text-gray-800 dark:text-gray-100 flex flex-col gap-2 z-10">
        <h1 className="text-lg font-semibold">SVG Editor</h1>
        <label className="flex flex-col text-sm gap-1">
          <span>Shape</span>
          <select
            className="border rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600"
            value={shapeType}
            onChange={(e) => setShapeType(e.target.value as "rect" | "circle")}
          >
            <option value="rect">Rectangle</option>
            <option value="circle">Circle</option>
          </select>
        </label>
        <label className="flex flex-col text-sm gap-1">
          <span>Color</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-full p-0 border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
          />
        </label>
        <button
          className="w-full px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700"
          onClick={undo}
          disabled={history.length === 0}
        >
          Undo
        </button>
        <button
          className="w-full px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700"
          onClick={redo}
          disabled={future.length === 0}
        >
          Redo
        </button>
        <button
          className="w-full px-3 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          onClick={clear}
        >
          Clear
        </button>
        <button
          className="w-full px-3 py-1 rounded bg-green-500 text-white hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700"
          onClick={download}
        >
          Download
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400 pt-2">Drag on the canvas to draw.</p>
      </div>

      <div className="flex-1 relative">
        <svg
          ref={svgRef}
          className="block w-full h-full bg-white dark:bg-gray-900"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
        >
          <defs>
            <pattern id="small-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
            </pattern>
            <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
              <rect width="100" height="100" fill="url(#small-grid)" />
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#d1d5db" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
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
                onClick={() => {
                  setSelectedId(shape.id);
                  setElementCode(generateSvg([shape]).split("\n")[1].trim());
                }}
              />
            ) : (
              <circle
                key={shape.id}
                cx={shape.cx}
                cy={shape.cy}
                r={Math.abs(shape.r)}
                fill={shape.fill}
                stroke={shape.stroke}
                onClick={() => {
                  setSelectedId(shape.id);
                  setElementCode(generateSvg([shape]).split("\n")[1].trim());
                }}
              />
            )
          ))}
        </svg>

        {shapes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400 pointer-events-none">
            <div className="text-center">
              <p className="mb-2">Drag & drop an SVG file here or</p>
              <button
                className="px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 pointer-events-auto"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        {selectedId !== null && (
          <div className="absolute top-4 right-4 z-10 p-4 bg-white/90 dark:bg-gray-800/90 rounded shadow flex flex-col gap-2 text-gray-800 dark:text-gray-100">
            <textarea
              className="w-64 h-32 font-mono text-sm p-2 border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
              value={elementCode}
              onChange={(e) => {
                const code = `<svg xmlns=\"http://www.w3.org/2000/svg\">${e.target.value}</svg>`;
                const parser = new DOMParser();
                const doc = parser.parseFromString(code, "image/svg+xml");
                const el = doc.firstElementChild?.firstElementChild as SVGElement | null;
                if (!el) return;
                setElementCode(e.target.value);
                setShapes((prev) =>
                  prev.map((s) => {
                    if (s.id !== selectedId) return s;
                    if (el.tagName === "rect") {
                      return {
                        id: s.id,
                        type: "rect",
                        x: parseFloat(el.getAttribute("x") || "0"),
                        y: parseFloat(el.getAttribute("y") || "0"),
                        width: parseFloat(el.getAttribute("width") || "0"),
                        height: parseFloat(el.getAttribute("height") || "0"),
                        fill: el.getAttribute("fill") || "transparent",
                        stroke: el.getAttribute("stroke") || "black",
                      };
                    } else {
                      return {
                        id: s.id,
                        type: "circle",
                        cx: parseFloat(el.getAttribute("cx") || "0"),
                        cy: parseFloat(el.getAttribute("cy") || "0"),
                        r: parseFloat(el.getAttribute("r") || "0"),
                        fill: el.getAttribute("fill") || "transparent",
                        stroke: el.getAttribute("stroke") || "black",
                      };
                    }
                  })
                );
              }}
            />
            <button
              className="px-2 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
              onClick={() => setSelectedId(null)}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

