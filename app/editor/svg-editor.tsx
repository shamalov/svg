import { useRef, useState } from "react";

type Shape = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
};

export function SvgEditor() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [drawing, setDrawing] = useState<Shape | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const idRef = useRef(0);

  function getRelativePoint(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    const { x, y } = getRelativePoint(e);
    const newShape: Shape = {
      id: idRef.current++,
      x,
      y,
      width: 0,
      height: 0,
      fill: "rgba(59,130,246,0.3)",
    };
    setDrawing(newShape);
    setShapes((prev) => [...prev, newShape]);
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!drawing) return;
    const { x, y } = getRelativePoint(e);
    const updated: Shape = {
      ...drawing,
      width: x - drawing.x,
      height: y - drawing.y,
    };
    setDrawing(updated);
    setShapes((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function onMouseUp() {
    setDrawing(null);
  }

  function clear() {
    setShapes([]);
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
      <div className="space-x-2">
        <button className="border px-2 py-1 rounded" onClick={clear}>
          Clear
        </button>
        <button className="border px-2 py-1 rounded" onClick={download}>
          Download
        </button>
      </div>
      <svg
        ref={svgRef}
        className="border w-full h-[500px] bg-white"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
      >
        {shapes.map((shape) => (
          <rect
            key={shape.id}
            x={Math.min(shape.x, shape.x + shape.width)}
            y={Math.min(shape.y, shape.y + shape.height)}
            width={Math.abs(shape.width)}
            height={Math.abs(shape.height)}
            fill={shape.fill}
            stroke="rgb(59 130 246)"
          />
        ))}
      </svg>
    </div>
  );
}

