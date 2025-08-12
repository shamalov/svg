import type { Route } from "./+types/home";
import { SvgEditor } from "../editor/svg-editor";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "SVG Editor" },
    { name: "description", content: "Draw and export SVG graphics" },
  ];
}

export default function Home() {
  return <SvgEditor />;
}

