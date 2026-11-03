"use client";

import { ImageUp, Link2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { uploadImage } from "@/actions/images";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { IMAGE_MAX_BYTES, IMAGE_PATH } from "@/lib/images";

const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Shrinks a photo in the browser so the longest side is at most `maxSide`,
 * as WebP (JPEG where WebP encoding is missing), under IMAGE_MAX_BYTES.
 */
async function shrink(file: File, maxSide: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    let blob = await canvasBlob(canvas, "image/webp", quality);
    if (blob?.type !== "image/webp") blob = await canvasBlob(canvas, "image/jpeg", quality);
    if (blob && blob.size <= IMAGE_MAX_BYTES) return blob;
  }
  throw new Error("too_big");
}

interface ImageUploadProps {
  label: string;
  hint: string;
  value: string | null;
  onChange: (url: string | null) => void;
  /** Longest side, in pixels, after shrinking. */
  maxSide: number;
  error?: string;
  className?: string;
}

/** Sends a photo from the device; a pasted image link still works as a fallback. */
export function ImageUpload({ label, hint, value, onChange, maxSide, error, className }: ImageUploadProps) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showLink, setShowLink] = useState(Boolean(value && !IMAGE_PATH.test(value)));

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      let blob: Blob;
      try {
        blob = await shrink(file, maxSide);
      } catch {
        toast.error("Não foi possível ler esta imagem. Use uma foto JPG, PNG ou WebP.");
        return;
      }
      const form = new FormData();
      form.append("file", blob);
      const result = await uploadImage(form).catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onChange(result.data.url);
      setShowLink(false);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-file`}>
          {label}
          <span className="ml-1 font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <input ref={fileRef} id={`${id}-file`} type="file" accept="image/*" className="sr-only" onChange={pick} tabIndex={-1} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
            {!uploading && <ImageUp className="size-4" />}
            {uploading ? "Enviando…" : value ? "Trocar foto" : "Enviar foto"}
          </Button>
          {!showLink && (
            <Button type="button" variant="ghost" onClick={() => setShowLink(true)}>
              <Link2 className="size-4" />
              Colar link
            </Button>
          )}
        </div>
        {showLink && (
          <Input
            type="url"
            inputMode="url"
            aria-label={`${label}: link da imagem`}
            aria-invalid={error ? true : undefined}
            value={value && !IMAGE_PATH.test(value) ? value : ""}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder="https://…"
          />
        )}
        {error ? <p className="text-xs font-medium text-danger">{error}</p> : <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
