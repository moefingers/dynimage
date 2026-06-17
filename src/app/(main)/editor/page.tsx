import type { Metadata } from "next";
import { Editor } from "./Editor";
import "./editor.css";

export const metadata: Metadata = {
  title: "Editor",
  description:
    "Tune a dynimage banner — pick a preset, tweak knobs, copy a live embed. No account needed for the public path.",
};

// The editor is a client app (meta-driven, debounced live preview); this
// server page is just the shell + metadata.
export default function EditorPage() {
  return <Editor />;
}
