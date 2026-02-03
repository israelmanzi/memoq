import { useState, useCallback, useRef } from 'react';
import { projectsApi, UploadDocumentResult, UploadProgress } from '../api/projects';

export type FileUploadStatus = 'pending' | 'uploading' | 'processing' | 'done' | 'error';

export interface FileUploadItem {
  id: string;
  file: File;
  status: FileUploadStatus;
  progress: number;
  error?: string;
  result?: UploadDocumentResult;
}

export interface UploadSummary {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    filename: string;
    success: boolean;
    error?: string;
    documentId?: string;
  }>;
}

export interface UseMultiUploadOptions {
  projectId: string;
  maxFiles?: number;
  onComplete?: (summary: UploadSummary) => void;
}

export interface UseMultiUploadReturn {
  /** List of files in the upload queue */
  files: FileUploadItem[];
  /** Add files to the queue (validates and limits) */
  addFiles: (files: FileList | File[]) => { added: number; rejected: string[] };
  /** Remove a file from the queue (only if pending) */
  removeFile: (id: string) => void;
  /** Clear all files from the queue */
  clearFiles: () => void;
  /** Start uploading all pending files */
  startUpload: () => void;
  /** Cancel ongoing uploads */
  cancelUpload: () => void;
  /** Whether upload is in progress */
  isUploading: boolean;
  /** Overall progress (0-100) */
  overallProgress: number;
  /** Current stage description */
  currentStage: string;
  /** Upload summary (available after completion) */
  summary: UploadSummary | null;
  /** Validation error message */
  validationError: string | null;
}

const SUPPORTED_EXTENSIONS = ['txt', 'xliff', 'xlf', 'sdlxliff', 'docx', 'pdf'];
const MAX_FILES_DEFAULT = 5;

let fileIdCounter = 0;
const generateFileId = () => `file-${++fileIdCounter}-${Date.now()}`;

export function useMultiUpload(options: UseMultiUploadOptions): UseMultiUploadReturn {
  const { projectId, maxFiles = MAX_FILES_DEFAULT, onComplete } = options;

  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isCancelledRef = useRef(false);

  // Calculate overall progress
  const overallProgress = files.length === 0 ? 0 : Math.round(
    files.reduce((sum, f) => {
      if (f.status === 'done') return sum + 100;
      if (f.status === 'error') return sum + 100; // Count as complete (failed)
      return sum + f.progress;
    }, 0) / files.length
  );

  // Current stage description
  const currentStage = (() => {
    const uploading = files.find(f => f.status === 'uploading');
    if (uploading) return `Uploading ${uploading.file.name}...`;

    const processing = files.find(f => f.status === 'processing');
    if (processing) return `Processing ${processing.file.name}...`;

    const pending = files.filter(f => f.status === 'pending').length;
    if (pending > 0 && isUploading) return `Waiting... (${pending} remaining)`;

    if (summary) return 'Upload complete';
    return '';
  })();

  // Validate file extension
  const isValidFile = (file: File): boolean => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    return !!ext && SUPPORTED_EXTENSIONS.includes(ext);
  };

  // Add files to queue
  const addFiles = useCallback((fileList: FileList | File[]): { added: number; rejected: string[] } => {
    const newFiles = Array.from(fileList);
    const rejected: string[] = [];
    const toAdd: FileUploadItem[] = [];

    setValidationError(null);
    setSummary(null);

    for (const file of newFiles) {
      // Check max files limit
      if (files.length + toAdd.length >= maxFiles) {
        rejected.push(`${file.name} (max ${maxFiles} files)`);
        continue;
      }

      // Check if file is valid
      if (!isValidFile(file)) {
        rejected.push(`${file.name} (unsupported type)`);
        continue;
      }

      // Check for duplicates
      if (files.some(f => f.file.name === file.name && f.file.size === file.size)) {
        rejected.push(`${file.name} (duplicate)`);
        continue;
      }

      toAdd.push({
        id: generateFileId(),
        file,
        status: 'pending',
        progress: 0,
      });
    }

    if (toAdd.length > 0) {
      setFiles(prev => [...prev, ...toAdd]);
    }

    if (rejected.length > 0) {
      setValidationError(`Rejected: ${rejected.join(', ')}`);
    }

    return { added: toAdd.length, rejected };
  }, [files, maxFiles]);

  // Remove file from queue
  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id || f.status !== 'pending'));
    setValidationError(null);
  }, []);

  // Clear all files
  const clearFiles = useCallback(() => {
    if (!isUploading) {
      setFiles([]);
      setSummary(null);
      setValidationError(null);
    }
  }, [isUploading]);

  // Update a specific file's state
  const updateFile = (id: string, updates: Partial<FileUploadItem>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  // Upload a single file
  const uploadSingleFile = async (item: FileUploadItem): Promise<{ success: boolean; error?: string; result?: UploadDocumentResult }> => {
    if (isCancelledRef.current) {
      return { success: false, error: 'Cancelled' };
    }

    updateFile(item.id, { status: 'uploading', progress: 0 });

    try {
      const result = await projectsApi.uploadDocumentWithProgress(
        projectId,
        item.file,
        (progress: UploadProgress) => {
          updateFile(item.id, {
            status: progress.stage,
            progress: progress.stage === 'uploading' ? progress.percent : 100,
          });
        },
        abortControllerRef.current?.signal
      );

      updateFile(item.id, { status: 'done', progress: 100, result });
      return { success: true, result };
    } catch (err: any) {
      const errorMessage = err.data?.error || err.message || 'Upload failed';
      updateFile(item.id, { status: 'error', error: errorMessage });
      return { success: false, error: errorMessage };
    }
  };

  // Start uploading all pending files
  const startUpload = useCallback(async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);
    setSummary(null);
    isCancelledRef.current = false;
    abortControllerRef.current = new AbortController();

    const results: UploadSummary['results'] = [];

    // Process files sequentially
    for (const item of pendingFiles) {
      if (isCancelledRef.current) break;

      const { success, error, result } = await uploadSingleFile(item);
      results.push({
        filename: item.file.name,
        success,
        error,
        documentId: result?.id,
      });
    }

    const uploadSummary: UploadSummary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };

    setSummary(uploadSummary);
    setIsUploading(false);
    abortControllerRef.current = null;

    onComplete?.(uploadSummary);
  }, [files, projectId, onComplete]);

  // Cancel ongoing uploads
  const cancelUpload = useCallback(() => {
    isCancelledRef.current = true;
    abortControllerRef.current?.abort();

    // Mark remaining pending files as cancelled
    setFiles(prev => prev.map(f =>
      f.status === 'pending' || f.status === 'uploading'
        ? { ...f, status: 'error' as const, error: 'Cancelled' }
        : f
    ));

    setIsUploading(false);
  }, []);

  return {
    files,
    addFiles,
    removeFile,
    clearFiles,
    startUpload,
    cancelUpload,
    isUploading,
    overallProgress,
    currentStage,
    summary,
    validationError,
  };
}
