
import { useRef, useState } from "react";
import { useAnalysis, FileInfo } from "@/context/AnalysisContext";
import { Button } from "@/components/ui/button";
import { UploadProgress } from "./UploadProgress";
import { useToast } from "@/hooks/use-toast";
import { File, FilePlus, Trash2, Upload } from "lucide-react";
const uuidv4 = () => crypto.randomUUID();

export function FileUpload() {
  const { files, addFiles, removeFile, uploadStatus, setUploadStatus } = useAnalysis();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      // Reset the input value so the same file can be uploaded again if needed
      e.target.value = "";
    }
  };

  const handleFiles = (fileList: FileList) => {
    const newFiles: FileInfo[] = [];
    
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      newFiles.push({
        id: uuidv4(),
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      });
    }
    
    addFiles(newFiles);
    toast({
      title: "Files added",
      description: `Added ${newFiles.length} files`,
    });
  };

  const handleDelete = (id: string) => {
    removeFile(id);
    toast({
      title: "File removed",
      description: "File has been removed from the list",
    });
  };

  const handleUpload = () => {
    if (files.length === 0) {
      toast({
        title: "No files",
        description: "Please add files before uploading",
        variant: "destructive",
      });
      return;
    }

    // Simulate an upload process
    setUploadStatus({ status: "uploading", progress: 0 });
    
    const interval = setInterval(() => {
      // Get the current progress value
      const currentProgress = uploadStatus.progress;
      const newProgress = currentProgress + 10;
      
      if (newProgress >= 100) {
        clearInterval(interval);
        setUploadStatus({ status: "success", progress: 100, message: "Upload complete!" });
      } else {
        setUploadStatus({ status: "uploading", progress: newProgress });
      }
    }, 500);
  };

  return (
    <div className="space-y-6">
      <div
        className={`drop-area ${isDragging ? "active" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="flex flex-col items-center justify-center gap-4">
          <Upload className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <p className="text-lg font-medium">Drag and drop files here</p>
            <p className="text-sm text-muted-foreground">or click to browse</p>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            className="hidden"
            accept=".java,.js,.ts,.py,.c,.cpp,.cs,.go,.rb,.php,.swift,.kt,.jsx,.tsx"
          />
        </div>
      </div>

      {uploadStatus.status !== "idle" && <UploadProgress />}

      {files.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Selected Files</h3>
          <div className="rounded-md border">
            <div className="divide-y">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="file-item flex items-center justify-between p-3"
                >
                  <div className="flex items-center gap-3">
                    <File className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(file.id)}
                    className="h-8 w-8 rounded-full"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            <Button onClick={() => fileInputRef.current?.click()} variant="outline">
              <FilePlus className="mr-2 h-4 w-4" />
              Add More Files
            </Button>
            <Button onClick={handleUpload} disabled={uploadStatus.status === "uploading"}>
              <Upload className="mr-2 h-4 w-4" />
              Upload & Analyze
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
