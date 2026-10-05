import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { Dialog } from "./Dialog.js";

export function UploadDialog({
  onClose,
  onUpload,
}: {
  onClose(): void;
  onUpload(file: File, progress: (percent: number) => void): Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!file) {
      setError("Choose an IFC file first.");
      return;
    }
    if (!/\.ifc$/i.test(file.name)) {
      setError("Choose a file with the .ifc extension.");
      return;
    }
    setError("");
    setProgress(0);
    try {
      await onUpload(file, setProgress);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Upload failed. Try again.",
      );
      setProgress(null);
    }
  };
  return (
    <Dialog title="Add IFC model" onClose={onClose} busy={progress !== null}>
      <p>
        Save a model to your local library. Asset types are indexed in this
        browser after upload.
      </p>
      <label className="upload-zone">
        <UploadCloud size={32} />
        <strong>Choose an IFC file</strong>
        <span>Original files remain unchanged</span>
        <input
          aria-label="IFC file"
          type="file"
          accept=".ifc"
          disabled={progress !== null}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError("");
          }}
        />
      </label>
      {file && (
        <p className="upload-file">
          {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MiB
        </p>
      )}
      {progress !== null && (
        <div role="status">
          <progress value={progress} max={100} />
          <p>{progress === 100 ? "Saving model…" : `Uploading ${progress}%`}</p>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button onClick={onClose} disabled={progress !== null}>
          Cancel
        </button>
        <button
          className="primary"
          onClick={() => void submit()}
          disabled={progress !== null}
        >
          Upload model
        </button>
      </div>
    </Dialog>
  );
}
