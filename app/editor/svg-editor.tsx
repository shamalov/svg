import { useEffect, useRef, useState } from "react";

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

type PathCommand = {
  code: string;
  values: number[];
};

type PathShape = {
  id: number;
  type: "path";
  commands: PathCommand[];
  d: string;
  fill: string;
  stroke: string;
};
type Shape = RectShape | CircleShape | PathShape;

function parsePath(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  const regex = /([a-zA-Z])([^a-zA-Z]*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(d)) !== null) {
    const code = match[1];
    const values = match[2]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    commands.push({ code, values });
  }
  return commands;
}

function commandsToString(commands: PathCommand[]): string {
  return commands.map((c) => `${c.code}${c.values.join(" ")}`).join(" ");
}

type PathPoint = {
  x: number;
  y: number;
  cmdIndex: number;
  valueIndex: number;
};

function getPathPoints(commands: PathCommand[]): PathPoint[] {
  const points: PathPoint[] = [];
  let cx = 0;
  let cy = 0;
  commands.forEach((cmd, ci) => {
    const code = cmd.code;
    const upper = code.toUpperCase();
    const isRel = code !== upper;
    const vals = cmd.values;
    switch (upper) {
      case "M":
      case "L":
      case "T":
        for (let i = 0; i < vals.length; i += 2) {
          let x = vals[i];
          let y = vals[i + 1];
          if (isRel) {
            x += cx;
            y += cy;
          }
          cx = x;
          cy = y;
          points.push({ x, y, cmdIndex: ci, valueIndex: i });
        }
        break;
      case "H":
        for (let i = 0; i < vals.length; i++) {
          let x = vals[i];
          if (isRel) x += cx;
          cx = x;
          points.push({ x, y: cy, cmdIndex: ci, valueIndex: i });
        }
        break;
      case "V":
        for (let i = 0; i < vals.length; i++) {
          let y = vals[i];
          if (isRel) y += cy;
          cy = y;
          points.push({ x: cx, y, cmdIndex: ci, valueIndex: i });
        }
        break;
      case "C":
      case "S":
      case "Q":
        for (let i = 0; i < vals.length; i += 2) {
          let x = vals[i];
          let y = vals[i + 1];
          if (isRel) {
            x += cx;
            y += cy;
          }
          if (i >= vals.length - 2) {
            cx = x;
            cy = y;
          }
          points.push({ x, y, cmdIndex: ci, valueIndex: i });
        }
        break;
      case "A":
        for (let i = 0; i < vals.length; i += 7) {
          let x = vals[i + 5];
          let y = vals[i + 6];
          if (isRel) {
            x += cx;
            y += cy;
          }
          cx = x;
          cy = y;
          points.push({ x, y, cmdIndex: ci, valueIndex: i + 5 });
        }
        break;
      case "Z":
        break;
    }
  });
  return points;
}

function movePathPoint(
  commands: PathCommand[],
  point: PathPoint,
  nx: number,
  ny: number
) {
  const cmd = commands[point.cmdIndex];
  const upper = cmd.code.toUpperCase();
  const isRel = cmd.code !== upper;
  if (isRel) {
    // convert to absolute for easier handling
    cmd.code = upper;
  }
  const vals = cmd.values;
  switch (upper) {
    case "M":
    case "L":
    case "T":
      vals[point.valueIndex] = nx;
      vals[point.valueIndex + 1] = ny;
      break;
    case "H":
      vals[point.valueIndex] = nx;
      break;
    case "V":
      vals[point.valueIndex] = ny;
      break;
    case "C":
    case "S":
    case "Q":
      vals[point.valueIndex] = nx;
      vals[point.valueIndex + 1] = ny;
      break;
    case "A":
      // only move end point
      const idx = point.valueIndex;
      vals[idx] = nx;
      vals[idx + 1] = ny;
      break;
  }
}

export function SvgEditor() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [drawing, setDrawing] = useState<Shape | null>(null);
  const [shapeType, setShapeType] = useState<"rect" | "circle">("rect");
  const [color, setColor] = useState("#3b82f6");
  const [history, setHistory] = useState<Shape[][]>([]);
  const [future, setFuture] = useState<Shape[][]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<PathPoint | null>(null);
  const [draggingPoint, setDraggingPoint] = useState<PathPoint | null>(null);
  const [pointMenu, setPointMenu] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);
  const selectedShape = shapes.find((s) => s.id === selectedId);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "e" && selectedPoint) {
        setPointMenu({ x: selectedPoint.x, y: selectedPoint.y });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPoint]);

  function snapshot(list: Shape[]) {
    return list.map((s) =>
      s.type === "path"
        ? {
            ...s,
            commands: s.commands.map((c) => ({ code: c.code, values: [...c.values] })),
          }
        : { ...s }
    );
  }

  function getRelativePoint(e: React.MouseEvent<SVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    return {
      x: rect ? e.clientX - rect.left : 0,
      y: rect ? e.clientY - rect.top : 0,
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
      doc.querySelectorAll("path").forEach((el) => {
        const d = el.getAttribute("d") || "";
        loaded.push({
          id: id++,
          type: "path",
          d,
          commands: parsePath(d),
          fill: el.getAttribute("fill") || "transparent",
          stroke: el.getAttribute("stroke") || "black",
        });
      });
      idRef.current = id;
      const svgElement = doc.querySelector("svg");
      const target = svgRef.current;
      if (svgElement && target) {
        const viewBox = svgElement.getAttribute("viewBox");
        if (viewBox) {
          target.setAttribute("viewBox", viewBox);
        } else {
          const widthAttr = svgElement.getAttribute("width");
          const heightAttr = svgElement.getAttribute("height");
          if (widthAttr && heightAttr) {
            const w = parseFloat(widthAttr);
            const h = parseFloat(heightAttr);
            if (!isNaN(w) && !isNaN(h)) {
              target.setAttribute("viewBox", `0 0 ${w} ${h}`);
            }
          }
        }
        target.setAttribute("preserveAspectRatio", "xMidYMid meet");
      }
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
    setPointMenu(null);
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
     setPointMenu(null);
    setSelectedId(shape.id);
    setHistory((prev) => [...prev, snapshot(shapes)]);
    setFuture([]);
    if (shape.type === "rect") {
      dragOffset.current = { x: x - shape.x, y: y - shape.y };
      setDraggingId(shape.id);
    } else if (shape.type === "circle") {
      dragOffset.current = { x: x - shape.cx, y: y - shape.cy };
      setDraggingId(shape.id);
    } else {
      setDraggingId(null);
    }
  }

  function onPointMouseDown(
    e: React.MouseEvent<SVGCircleElement>,
    shape: PathShape,
    point: PathPoint
  ) {
    e.stopPropagation();
    setPointMenu(null);
    const { x, y } = getRelativePoint(e);
    setSelectedId(shape.id);
    setSelectedPoint(point);
    setHistory((prev) => [...prev, snapshot(shapes)]);
    setFuture([]);
    dragOffset.current = { x: x - point.x, y: y - point.y };
    setDraggingPoint(point);
  }

  const commandOptions = ["M", "L", "V", "H", "C", "S", "Q", "T", "A", "Z"];

  function handleInsert(code: string) {
    if (!selectedPoint || selectedId === null) return;
    setShapes((prev) =>
      prev.map((s) => {
        if (s.id !== selectedId || s.type !== "path") return s;
        const cmds = s.commands.map((c) => ({ ...c, values: [...c.values] }));
        const newCmd: PathCommand = { code, values: [selectedPoint.x, selectedPoint.y] };
        cmds.splice(selectedPoint.cmdIndex + 1, 0, newCmd);
        return { ...s, commands: cmds, d: commandsToString(cmds) };
      })
    );
    setPointMenu(null);
  }

  function handleConvert(code: string) {
    if (!selectedPoint || selectedId === null) return;
    setShapes((prev) =>
      prev.map((s) => {
        if (s.id !== selectedId || s.type !== "path") return s;
        const cmds = s.commands.map((c) => ({ ...c, values: [...c.values] }));
        const cmd = cmds[selectedPoint.cmdIndex];
        cmd.code = code;
        const upper = code.toUpperCase();
        if (upper === "H") cmd.values = [selectedPoint.x];
        else if (upper === "V") cmd.values = [selectedPoint.y];
        else if (upper === "Z") cmd.values = [];
        else cmd.values = [selectedPoint.x, selectedPoint.y];
        return { ...s, commands: cmds, d: commandsToString(cmds) };
      })
    );
    setPointMenu(null);
  }

  function handleSetRelative() {
    if (!selectedPoint || selectedId === null) return;
    setShapes((prev) =>
      prev.map((s) => {
        if (s.id !== selectedId || s.type !== "path") return s;
        const cmds = s.commands.map((c) => ({ ...c, values: [...c.values] }));
        const cmd = cmds[selectedPoint.cmdIndex];
        cmd.code =
          cmd.code === cmd.code.toUpperCase()
            ? cmd.code.toLowerCase()
            : cmd.code.toUpperCase();
        return { ...s, commands: cmds, d: commandsToString(cmds) };
      })
    );
    setPointMenu(null);
  }

  function handleDeletePoint() {
    if (!selectedPoint || selectedId === null) return;
    setShapes((prev) =>
      prev.map((s) => {
        if (s.id !== selectedId || s.type !== "path") return s;
        const cmds = s.commands.map((c) => ({ ...c, values: [...c.values] }));
        cmds.splice(selectedPoint.cmdIndex, 1);
        return { ...s, commands: cmds, d: commandsToString(cmds) };
      })
    );
    setSelectedPoint(null);
    setPointMenu(null);
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (draggingPoint && dragOffset.current) {
      const { x, y } = getRelativePoint(e);
      const nx = x - dragOffset.current.x;
      const ny = y - dragOffset.current.y;
      setShapes((prev) =>
        prev.map((s) => {
          if (s.id !== selectedId || s.type !== "path") return s;
          const cmds = s.commands.map((c) => ({ ...c, values: [...c.values] }));
          movePathPoint(cmds, draggingPoint, nx, ny);
          return { ...s, commands: cmds, d: commandsToString(cmds) };
        })
      );
      const updated = { ...draggingPoint, x: nx, y: ny };
      setDraggingPoint(updated);
      setSelectedPoint(updated);
      return;
    }
    if (draggingId !== null && dragOffset.current) {
      const { x, y } = getRelativePoint(e);
      const offset = dragOffset.current;
      setShapes((prev) =>
        prev.map((s) => {
          if (s.id !== draggingId) return s;
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
    setDraggingPoint(null);
    dragOffset.current = null;
  }

  function clear() {
    if (shapes.length) {
      setHistory((prev) => [...prev, snapshot(shapes)]);
      setFuture([]);
    }
    setShapes([]);
    const svg = svgRef.current;
    if (svg) {
      svg.removeAttribute("viewBox");
      svg.removeAttribute("preserveAspectRatio");
    }
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
              ) : shape.type === "circle" ? (
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
              ) : (
                <g key={shape.id}>
                  <path
                    d={shape.d}
                    fill={shape.fill}
                    stroke={shape.stroke}
                    fillOpacity={0.3}
                    className="cursor-pointer"
                    onMouseDown={(e) => onShapeMouseDown(e, shape)}
                  />
                  {getPathPoints(shape.commands).map((pt, i) => (
                    <circle
                      key={i}
                      cx={pt.x}
                      cy={pt.y}
                      r={4}
                      fill="white"
                      stroke="black"
                      className="cursor-move"
                      onMouseDown={(e) => onPointMouseDown(e, shape, pt)}
                    />
                  ))}
                </g>
              )
            ))}
          </svg>

          {pointMenu && (
            <div
              className="absolute bg-white border rounded shadow p-2 text-xs"
              style={{ left: pointMenu.x, top: pointMenu.y }}
            >
              <div>Insert</div>
              <div className="flex flex-wrap gap-1 mb-1">
                {commandOptions.map((c) => (
                  <button
                    key={c}
                    className="px-1 border rounded hover:bg-gray-100"
                    onClick={() => handleInsert(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div>Convert To</div>
              <div className="flex flex-wrap gap-1 mb-1">
                {commandOptions.map((c) => (
                  <button
                    key={c}
                    className="px-1 border rounded hover:bg-gray-100"
                    onClick={() => handleConvert(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <button
                className="block w-full text-left hover:bg-gray-100 rounded px-1"
                onClick={handleSetRelative}
              >
                Set Relative
              </button>
              <button
                className="block w-full text-left hover:bg-gray-100 rounded px-1"
                onClick={handleDeletePoint}
              >
                Delete
              </button>
            </div>
          )}

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

