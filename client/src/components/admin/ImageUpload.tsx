import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";

interface ImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  max?: number;
  label?: string;
}

export default function ImageUpload({
  images,
  onChange,
  max = 20,
  label = "Images",
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = trpc.upload.uploadImage.useMutation();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = max - images.length;
    const toUpload = files.slice(0, remaining);

    setUploading(true);
    const newUrls: string[] = [];

    for (const file of toUpload) {
      try {
        const base64 = await fileToBase64(file);
        const result = await uploadMutation.mutateAsync({
          fileName: file.name.replace(/[^a-zA-Z0-9.-]/g, "_"),
          base64Data: base64,
          contentType: file.type || "image/jpeg",
        });
        newUrls.push(result.url);
      } catch (err) {
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    if (newUrls.length > 0) {
      onChange([...images, ...newUrls]);
      toast.success(`${newUrls.length} image${newUrls.length > 1 ? "s" : ""} uploaded`);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const updated = [...images];
    const [item] = updated.splice(from, 1);
    updated.splice(to, 0, item);
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-xs text-muted-foreground">
          {images.length}/{max}
        </span>
      </div>

      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {images.map((url, i) => (
            <div
              key={`${url}-${i}`}
              className="relative group aspect-square rounded-lg overflow-hidden border border-border/50 bg-muted"
            >
              <img
                src={url}
                alt={`Image ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => moveImage(i, i - 1)}
                    className="h-6 w-6 rounded bg-white/90 text-[#1A1A18] flex items-center justify-center text-xs hover:bg-white"
                  >
                    ←
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="h-6 w-6 rounded bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                {i < images.length - 1 && (
                  <button
                    type="button"
                    onClick={() => moveImage(i, i + 1)}
                    className="h-6 w-6 rounded bg-white/90 text-[#1A1A18] flex items-center justify-center text-xs hover:bg-white"
                  >
                    →
                  </button>
                )}
              </div>
              {i === 0 && (
                <span className="absolute top-1 left-1 text-[9px] font-semibold bg-[#8B7355] text-white px-1.5 py-0.5 rounded">
                  COVER
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {images.length < max && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4 mr-2" />
            )}
            {uploading ? "Uploading..." : "Add images"}
          </Button>
        </div>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
