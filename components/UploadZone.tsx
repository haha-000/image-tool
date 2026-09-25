"use client";

/** 通用拖拽 / 点击上传区 */

import { useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";

interface UploadZoneProps {
  accept?: string;
  maxSizeMB?: number;
  onFile: (file: File) => void;
  hint?: string;
}

export default function UploadZone({
  accept = "image/jpeg,image/png,image/webp",
  maxSizeMB = 20,
  onFile,
  hint,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件（JPG / PNG / WebP）");
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`图片不能超过 ${maxSizeMB}MB`);
      return;
    }
    setError(null);
    onFile(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 transition-colors ${
          dragging
            ? "border-accent bg-accent-soft"
            : "border-line-strong bg-surface hover:border-accent hover:bg-accent-soft/40"
        }`}
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-surface-2">
          <Upload className="size-5 text-ink-2" />
        </span>
        <span className="text-sm font-medium">点击或拖拽图片到这里</span>
        <span className="text-xs text-ink-3">
          {hint || `支持 JPG / PNG / WebP，最大 ${maxSizeMB}MB`}
        </span>
      </button>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = ""; // 允许重复选择同一文件
        }}
      />
    </div>
  );
}
