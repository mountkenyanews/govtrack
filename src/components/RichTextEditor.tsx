/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from "react";
import { 
  Bold, 
  Italic, 
  Underline, 
  List, 
  ListOrdered, 
  Eraser, 
  FileText,
  Sparkles,
  CheckCircle2
} from "lucide-react";
import { cleanWordHtml } from "../utils/richText";

interface RichTextEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = "Write or paste formatted content directly...",
  className = ""
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [pastedNotice, setPastedNotice] = useState<boolean>(false);

  // Synchronize internal state with external value changes safely (ignoring redundant loops that break cursors)
  useEffect(() => {
    if (editorRef.current) {
      const currentHTML = editorRef.current.innerHTML;
      if (currentHTML !== value) {
        // If external value is explicitly set to empty or modified
        editorRef.current.innerHTML = value || "";
      }
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      let currentHTML = editorRef.current.innerHTML;
      
      // If it only contains empty elements, treat as empty
      if (currentHTML === "<br>" || currentHTML === "<div><br></div>" || currentHTML.trim() === "") {
        currentHTML = "";
      }
      
      onChange(currentHTML);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // Intercept standard paste events to handle MS Word formatting natively
    const htmlData = e.clipboardData.getData("text/html");
    const plainText = e.clipboardData.getData("text/plain");

    if (htmlData) {
      e.preventDefault();
      
      // Clean up MS Word styling, namespaces, and unnecessary margins while keeping structural boldness, bulleting, and lists
      const cleanedHtml = cleanWordHtml(htmlData);
      
      // Paste HTML cleanly at caret position
      document.execCommand("insertHTML", false, cleanedHtml);
      handleInput();

      // Show temporary positive feedback to let user know styling was successfully audited
      setPastedNotice(true);
      setTimeout(() => setPastedNotice(false), 4000);
    } else if (plainText) {
      // Fallback for raw clipboard texts
      e.preventDefault();
      // Translate lines into paragraph line breaks naturally
      const formattedPlain = plainText
        .split(/\r?\n/)
        .map(line => line.trim() === "" ? "<br>" : `<div>${line}</div>`)
        .join("");
        
      document.execCommand("insertHTML", false, formattedPlain);
      handleInput();
    }
  };

  // Safe toolbar actions using execCommand
  const execToolbarAction = (command: string, value: string = "") => {
    // Keep focus inside editor
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleInput();
  };

  const clearFormatting = () => {
    editorRef.current?.focus();
    document.execCommand("removeFormat", false);
    
    // Also perform full regex clean-up of parsed divs inside selected body
    if (editorRef.current) {
      const plainText = editorRef.current.innerText;
      editorRef.current.innerHTML = plainText.split("\n").map(l => `<div>${l}</div>`).join("");
    }
    handleInput();
  };

  return (
    <div className={`border border-slate-300 rounded-xl overflow-hidden bg-white shadow-2xs hover:border-slate-400 focus-within:ring-2 focus-within:ring-[#0A1628]/20 focus-within:border-[#0A1628] transition ${className}`}>
      
      {/* TOOLBAR PANEL */}
      <div className="bg-slate-50 border-b border-slate-200 p-2 flex flex-wrap items-center justify-between gap-1.5 selection:bg-transparent">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => execToolbarAction("bold")}
            className="p-1.5 rounded text-[#0A1628] hover:bg-slate-200 transition"
            title="Bold Selection (Ctrl+B)"
          >
            <Bold className="w-4 h-4" />
          </button>
          
          <button
            type="button"
            onClick={() => execToolbarAction("italic")}
            className="p-1.5 rounded text-[#0A1628] hover:bg-slate-200 transition"
            title="Italic Selection (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => execToolbarAction("underline")}
            className="p-1.5 rounded text-[#0A1628] hover:bg-slate-200 transition"
            title="Underline Selection (Ctrl+U)"
          >
            <Underline className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-slate-250 mx-1"></div>

          <button
            type="button"
            onClick={() => execToolbarAction("insertUnorderedList")}
            className="p-1.5 rounded text-[#0A1628] hover:bg-slate-200 transition"
            title="Bulleted List"
          >
            <List className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => execToolbarAction("insertOrderedList")}
            className="p-1.5 rounded text-[#0A1628] hover:bg-slate-200 transition"
            title="Numbered List"
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={clearFormatting}
            className="p-1.5 rounded text-red-600 hover:bg-red-50 transition"
            title="Clear Raw Formatting"
          >
            <Eraser className="w-4 h-4" />
          </button>
        </div>

        {/* FEEDBACK STATUS */}
        <div className="flex items-center gap-1.5">
          {pastedNotice ? (
            <span className="flex items-center gap-1 text-[10px] text-emerald-750 font-mono font-bold bg-emerald-50 border border-emerald-150 rounded px-2 py-0.5 animate-fadeIn">
              <CheckCircle2 className="w-3" />
              MS Word formatting synchronized!
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-[#0A1628] font-mono font-bold bg-amber-50 border border-amber-100/60 rounded px-2 py-0.5 cursor-default hover:bg-amber-100/30 transition">
              <Sparkles className="w-3 text-[#F5A623] animate-pulse" />
              Direct MS Word paste enabled
            </span>
          )}
        </div>
      </div>

      {/* CONTENT EDITABLE CONTAINER */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          data-placeholder={placeholder}
          onInput={handleInput}
          onPaste={handlePaste}
          className="w-full min-h-[170px] max-h-[400px] p-4 text-xs select-text font-normal leading-relaxed overflow-y-auto text-slate-800 focus:outline-none focus:ring-0 news-insights-textarea scrollbar-thin outline-none"
          id="insights-rich-editor"
        />
        
        {/* CSS PLACEHOLDER SIMULATION */}
        {!value && (
          <div className="absolute top-4 left-4 text-slate-400 text-xs font-mono font-normal pointer-events-none select-none italic">
            {placeholder}
          </div>
        )}
      </div>

      {/* PRO-TIP STATUS PANEL */}
      <div className="bg-slate-50 p-2 border-t border-slate-150 text-[10px] text-slate-400 font-mono flex items-center gap-1 justify-end">
        <FileText className="w-3 h-3 text-slate-400" />
        <span>Pasting from Word will parse alignment, headers, tags and double paragraph breaks seamlessly.</span>
      </div>
    </div>
  );
};
