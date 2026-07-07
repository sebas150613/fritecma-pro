import { useEffect, useRef, useState } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { ImagePlus, Loader2, PlayCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

// Los adjuntos se guardan en el disco del VPS vía /api/files/private.
// Cuando la app tenga clientes hay que migrarlos a Hetzner Object Storage
// (ver docs/object-storage-media.md).
const MAX_VIDEO_MB = 25;
const IMAGE_MAX_DIMENSION = 1600;
const IMAGE_JPEG_QUALITY = 0.72;

async function compressImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", IMAGE_JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function GasMediaSection({ media, onChange }) {
  const inputRef = useRef(null);
  const [uploadingCount, setUploadingCount] = useState(0);

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    for (const file of files) {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");

      if (!isImage && !isVideo) {
        toast.error(`"${file.name}" no es una imagen ni un vídeo.`);
        continue;
      }
      if (isVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) {
        toast.error(`El vídeo "${file.name}" supera el límite de ${MAX_VIDEO_MB} MB. Graba un clip más corto.`);
        continue;
      }

      setUploadingCount((c) => c + 1);
      try {
        const toUpload = isImage ? await compressImage(file) : file;
        const uploaded = await appApi.files.uploadPrivate({ file: toUpload });
        onChange((prev) => [
          ...prev,
          {
            file_uri: uploaded.file_uri,
            original_name: file.name,
            mime_type: uploaded.mime_type || toUpload.type,
            size: uploaded.size ?? toUpload.size,
            kind: isImage ? "image" : "video",
            _previewUrl: URL.createObjectURL(toUpload),
          },
        ]);
      } catch (error) {
        console.error("[GasMediaSection] Error subiendo adjunto:", error);
        toast.error(`No se pudo subir "${file.name}". Comprueba la conexión e inténtalo de nuevo.`);
      } finally {
        setUploadingCount((c) => c - 1);
      }
    }
  };

  const removeItem = (index) => {
    const item = media[index];
    if (item?._previewUrl) URL.revokeObjectURL(item._previewUrl);
    onChange((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
      <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
        Fotos y Vídeos del Parte
      </h2>
      <p className="text-xs text-muted-foreground">
        Añade evidencias visuales: matrícula de un mural para pedir el recambio, pesaje de
        la botella de gas, la fuga localizada, el estado de una pieza rota... Lo que la
        oficina necesite ver para entender la incidencia.
      </p>

      {media.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {media.map((item, index) => (
            <div
              key={item.file_uri}
              className="relative rounded-xl border border-border overflow-hidden bg-muted/50 aspect-square"
            >
              {item.kind === "image" && item._previewUrl ? (
                <img
                  src={item._previewUrl}
                  alt={item.original_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center gap-1 p-2">
                  <PlayCircle className="h-8 w-8 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground text-center break-all line-clamp-2">
                    {item.original_name}
                  </span>
                </div>
              )}
              <button
                type="button"
                aria-label={`Eliminar ${item.original_name}`}
                onClick={() => removeItem(index)}
                className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-1.5 hover:bg-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={uploadingCount > 0}
        className="rounded-xl"
      >
        {uploadingCount > 0 ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Subiendo…
          </>
        ) : (
          <>
            <ImagePlus className="h-4 w-4 mr-2" /> Añadir fotos / vídeos
          </>
        )}
      </Button>
    </div>
  );
}

export function GasMediaGallery({ media }) {
  const [urls, setUrls] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        (media || []).map(async (item) => {
          try {
            const { signed_url } = await appApi.files.createSignedUrl({
              file_uri: item.file_uri,
            });
            return [item.file_uri, signed_url];
          } catch {
            return [item.file_uri, null];
          }
        })
      );
      if (!cancelled) setUrls(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [media]);

  if (!media?.length) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {media.map((item) => {
        const url = urls[item.file_uri];
        if (!url) {
          return (
            <div
              key={item.file_uri}
              className="rounded-xl border border-border bg-muted/50 aspect-square flex items-center justify-center"
            >
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          );
        }
        if (item.kind === "video") {
          return (
            <video
              key={item.file_uri}
              src={url}
              controls
              preload="metadata"
              className="rounded-xl border border-border w-full aspect-square object-cover bg-black"
            />
          );
        }
        return (
          <a key={item.file_uri} href={url} target="_blank" rel="noreferrer">
            <img
              src={url}
              alt={item.original_name}
              className="rounded-xl border border-border w-full aspect-square object-cover"
            />
          </a>
        );
      })}
    </div>
  );
}
