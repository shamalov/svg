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
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);
  const selectedShape = shapes.find((s) => s.id === selectedId);

  function snapshot(list: Shape[]) {
    return list.map((s) => ({ ...s }));
  }

  function getRelativePoint(e: React.MouseEvent<SVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
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
        fill: color,
        stroke: color,
      };
    } else {
      newShape = {
        id: idRef.current++,
        type: "circle",
        cx: x,
        cy: y,
        r: 0,
        fill: color,
        stroke: color,
      };
    }
    setDrawing(newShape);
    setShapes((prev) => [...prev, newShape]);
  }

  function onShapeMouseDown(e: React.MouseEvent<SVGElement>, shape: Shape) {
    e.stopPropagation();
    const { x, y } = getRelativePoint(e);
    setSelectedId(shape.id);
    setHistory((prev) => [...prev, snapshot(shapes)]);
    setFuture([]);
    if (shape.type === "rect") {
      dragOffset.current = { x: x - shape.x, y: y - shape.y };
    } else {
      dragOffset.current = { x: x - shape.cx, y: y - shape.cy };
    }
    setDraggingId(shape.id);
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (draggingId !== null) {
      const { x, y } = getRelativePoint(e);
      setShapes((prev) =>
        prev.map((s) => {
          if (s.id !== draggingId) return s;
          const offset = dragOffset.current!;
          if (s.type === "rect") {
            return { ...s, x: x - offset.x, y: y - offset.y };
          } else {
            return { ...s, cx: x - offset.x, cy: y - offset.y };
          }
        })
      );
      return;
    }
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
    if (drawing) {
      if (drawing.type === "rect") {
        const x = Math.min(drawing.x, drawing.x + drawing.width);
        const y = Math.min(drawing.y, drawing.y + drawing.height);
        const width = Math.abs(drawing.width);
        const height = Math.abs(drawing.height);
        setShapes((prev) =>
          prev.map((s) =>
            s.id === drawing.id ? { ...drawing, x, y, width, height } : s
          )
        );
      } else {
        const r = Math.abs(drawing.r);
        setShapes((prev) =>
          prev.map((s) => (s.id === drawing.id ? { ...drawing, r } : s))
        );
      }
    }
    setDrawing(null);
    setDraggingId(null);
    dragOffset.current = null;
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
      className="fixed inset-0 flex flex-col"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="p-4 bg-white/90 dark:bg-gray-800/90 text-gray-800 dark:text-gray-100 flex items-center gap-2 flex-wrap z-10">
        <h1 className="text-lg font-semibold">SVG Editor</h1>
        <label className="flex items-center text-sm gap-1">
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
        <label className="flex items-center text-sm gap-1">
          <span>Color</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-8 p-0 border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
          />
        </label>
        <button
          className="px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700"
          onClick={undo}
          disabled={history.length === 0}
        >
          Undo
        </button>
        <button
          className="px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700"
          onClick={redo}
          disabled={future.length === 0}
        >
          Redo
        </button>
        <button
          className="px-3 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          onClick={clear}
        >
          Clear
        </button>
        <button
          className="px-3 py-1 rounded bg-green-500 text-white hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700"
          onClick={download}
        >
          Download
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400 ml-auto">Drag on the canvas to draw.</p>
      </div>

      <div className="flex flex-1">
        <div className="w-64 p-4 bg-white/90 dark:bg-gray-800/90 text-gray-800 dark:text-gray-100 overflow-y-auto">
          <h2 className="text-md font-semibold mb-2">Layers</h2>
          <ul className="text-sm">
            <li>
              <span className="font-medium">Svg</span>
              <ul className="pl-4">
                {shapes.map((shape) => (
                  <li
                    key={shape.id}
                    className={`cursor-pointer ${
                      shape.id === selectedId ? "text-blue-600 font-semibold" : ""
                    }`}
                    onClick={() => setSelectedId(shape.id)}
                  >
                    {shape.type === "rect"
                      ? "Rect"
                      : shape.type === "circle"
                      ? "Circle"
                      : shape.type.charAt(0).toUpperCase() + shape.type.slice(1)}
                  </li>
                ))}
              </ul>
            </li>
          </ul>
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
                  fillOpacity={0.3}
                  className="cursor-move"
                  onMouseDown={(e) => onShapeMouseDown(e, shape)}
                />
              ) : (
                <circle
                  key={shape.id}
                  cx={shape.cx}
                  cy={shape.cy}
                  r={Math.abs(shape.r)}
                  fill={shape.fill}
                  stroke={shape.stroke}
                  fillOpacity={0.3}
                  className="cursor-move"
                  onMouseDown={(e) => onShapeMouseDown(e, shape)}
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
        </div>

        {selectedShape && (
          <div className="w-64 p-4 bg-white/90 dark:bg-gray-800/90 text-gray-800 dark:text-gray-100 flex flex-col gap-2 z-10">
            <h2 className="text-md font-semibold">Shape Tools</h2>
            <label className="flex flex-col text-sm gap-1">
              <span>Fill</span>
              <input
                type="color"
                value={selectedShape.fill.startsWith("#") ? selectedShape.fill : "#000000"}
                onChange={(e) => {
                  const value = e.target.value;
                  setHistory((prev) => [...prev, snapshot(shapes)]);
                  setFuture([]);
                  setShapes((prev) =>
                    prev.map((s) =>
                      s.id === selectedShape.id ? { ...s, fill: value } : s
                    )
                  );
                }}
                className="h-8 w-full p-0 border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
              />
            </label>
            <label className="flex flex-col text-sm gap-1">
              <span>Stroke</span>
              <input
                type="color"
                value={selectedShape.stroke.startsWith("#") ? selectedShape.stroke : "#000000"}
                onChange={(e) => {
                  const value = e.target.value;
                  setHistory((prev) => [...prev, snapshot(shapes)]);
                  setFuture([]);
                  setShapes((prev) =>
                    prev.map((s) =>
                      s.id === selectedShape.id ? { ...s, stroke: value } : s
                    )
                  );
                }}
                className="h-8 w-full p-0 border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
              />
            </label>
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

