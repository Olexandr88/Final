/**
 * TypeScript definitions for Clipboard and Share functionality
 */

// Clipboard Manager Types

export interface ClipboardHistoryEntry {
  type: 'text' | 'html' | 'image';
  data: string;
  timestamp: string;
}

export interface ClipboardCapabilities {
  copyText: boolean;
  copyHTML: boolean;
  copyImage: boolean;
  pasteText: boolean;
  pasteHTML: boolean;
  history: boolean;
  isElectron: boolean;
}

export interface CopyOptions {
  silent?: boolean;
}

export declare class ClipboardManager {
  history: ClipboardHistoryEntry[];
  isElectron: boolean;
  electronAPI: any | null;

  constructor();

  /**
   * Copy text to clipboard
   */
  copy(text: string, options?: CopyOptions): Promise<boolean>;

  /**
   * Copy HTML content to clipboard
   */
  copyHTML(html: string, plainText?: string | null): Promise<boolean>;

  /**
   * Copy image to clipboard
   */
  copyImage(imageData: Blob | string): Promise<boolean>;

  /**
   * Paste text from clipboard
   */
  paste(): Promise<string>;

  /**
   * Paste HTML content from clipboard
   */
  pasteHTML(): Promise<string>;

  /**
   * Get clipboard history
   */
  getHistory(limit?: number): ClipboardHistoryEntry[];

  /**
   * Clear clipboard
   */
  clear(): Promise<boolean>;

  /**
   * Clear clipboard history
   */
  clearHistory(): void;

  /**
   * Check if clipboard API is available
   */
  isAvailable(): boolean;

  /**
   * Get clipboard capabilities
   */
  getCapabilities(): ClipboardCapabilities;
}

export const clipboardManager: ClipboardManager;
export default clipboardManager;

// Share Manager Types

export interface ShareData {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
}

export interface ShareResult {
  success: boolean;
  method?: 'web-share-api' | 'clipboard';
  error?: string;
  message?: string;
}

export interface ShareCapabilities {
  webShareAPI: boolean;
  canShareText: boolean;
  canShareURL: boolean;
  canShareFiles: boolean;
  fallbackMethod: string;
}

export interface ReportData {
  title: string;
  sections: Record<string, any>;
  format?: 'text' | 'html' | 'json';
}

export interface TrainingRecommendation {
  title: string;
  level: string;
  duration_minutes: number;
  url: string;
}

export interface CodeAnalysis {
  summary?: string;
  metrics?: Record<string, any>;
  issues?: string[];
  recommendations?: string[];
}

export interface SessionData {
  id: string;
  title?: string;
  startTime: string;
  duration?: string;
  messages?: any[];
  activities?: string[];
  outcomes?: string[];
}

export declare class ShareManager {
  isSupported: boolean;

  constructor();

  /**
   * Check if content can be shared
   */
  canShare(data?: ShareData): boolean;

  /**
   * Share content using Web Share API or fallback
   */
  share(data: ShareData): Promise<ShareResult>;

  /**
   * Share plain text
   */
  shareText(text: string, title?: string | null): Promise<ShareResult>;

  /**
   * Share URL
   */
  shareURL(url: string, title?: string | null, text?: string | null): Promise<ShareResult>;

  /**
   * Share file(s)
   */
  shareFile(files: File | File[], title?: string | null, text?: string | null): Promise<ShareResult>;

  /**
   * Export formatted report
   */
  exportReport(reportData: ReportData): Promise<ShareResult>;

  /**
   * Share training recommendations
   */
  shareTrainingRecommendations(
    recommendations: TrainingRecommendation[],
    format?: 'text' | 'html' | 'json'
  ): Promise<ShareResult>;

  /**
   * Share code analysis results
   */
  shareCodeAnalysis(analysis: CodeAnalysis, format?: 'text' | 'html' | 'json'): Promise<ShareResult>;

  /**
   * Share session summary
   */
  shareSessionSummary(session: SessionData, format?: 'text' | 'html' | 'json'): Promise<ShareResult>;

  /**
   * Get share capabilities
   */
  getCapabilities(): ShareCapabilities;
}

export const shareManager: ShareManager;
export default shareManager;

// Electron Clipboard Types (for main process)

export interface ElectronClipboardWatchData {
  text: string;
  html: string;
  formats: string[];
  timestamp: string;
}

export interface ElectronClipboardStats {
  hasText: boolean;
  hasHTML: boolean;
  hasImage: boolean;
  hasRTF: boolean;
  formats: string[];
  textLength: number;
  isWatching: boolean;
}

export declare class ElectronClipboard {
  watchInterval: NodeJS.Timeout | null;
  watchCallbacks: Array<(data: ElectronClipboardWatchData) => void>;
  lastClipboardContent: string;

  /**
   * Write text to clipboard
   */
  writeText(text: string): void;

  /**
   * Read text from clipboard
   */
  readText(): string;

  /**
   * Write HTML to clipboard
   */
  writeHTML(html: string): void;

  /**
   * Read HTML from clipboard
   */
  readHTML(): string;

  /**
   * Write image to clipboard
   */
  writeImage(imageData: string): void;

  /**
   * Read image from clipboard
   */
  readImage(): string | null;

  /**
   * Write RTF content to clipboard
   */
  writeRTF(rtf: string): void;

  /**
   * Read RTF from clipboard
   */
  readRTF(): string;

  /**
   * Write bookmark to clipboard (macOS only)
   */
  writeBookmark(title: string, url: string): void;

  /**
   * Read bookmark from clipboard (macOS only)
   */
  readBookmark(): { title: string; url: string };

  /**
   * Clear clipboard
   */
  clear(): void;

  /**
   * Get available clipboard formats
   */
  availableFormats(): string[];

  /**
   * Check if clipboard has specific format
   */
  has(format: string): boolean;

  /**
   * Read clipboard data in specific format
   */
  read(format: string): Buffer;

  /**
   * Write clipboard data in specific format
   */
  write(format: string, data: Buffer): void;

  /**
   * Write multiple formats to clipboard simultaneously
   */
  writeMultiFormat(data: Record<string, any>): void;

  /**
   * Start watching clipboard for changes
   */
  startWatching(callback: (data: ElectronClipboardWatchData) => void, interval?: number): void;

  /**
   * Stop watching clipboard
   */
  stopWatching(): void;

  /**
   * Get clipboard statistics
   */
  getStats(): ElectronClipboardStats;
}

// Electron IPC Handlers

export interface IPCResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export function registerClipboardHandlers(mainWindow: any): void;
export function cleanupClipboardHandlers(): void;

// Window API Extensions (for renderer process)

declare global {
  interface Window {
    electronAPI?: {
      clipboard?: {
        writeText: (text: string) => Promise<IPCResult>;
        readText: () => Promise<IPCResult<string>>;
        writeHTML: (html: string) => Promise<IPCResult>;
        readHTML: () => Promise<IPCResult<string>>;
        writeImage: (imageData: string) => Promise<IPCResult>;
        readImage: () => Promise<IPCResult<string>>;
        writeRTF: (rtf: string) => Promise<IPCResult>;
        readRTF: () => Promise<IPCResult<string>>;
        writeBookmark: (title: string, url: string) => Promise<IPCResult>;
        readBookmark: () => Promise<IPCResult<{ title: string; url: string }>>;
        clear: () => Promise<IPCResult>;
        availableFormats: () => Promise<IPCResult<string[]>>;
        has: (format: string) => Promise<IPCResult<boolean>>;
        getStats: () => Promise<IPCResult<ElectronClipboardStats>>;
        writeMultiFormat: (data: Record<string, any>) => Promise<IPCResult>;
        startWatching: (interval?: number) => Promise<IPCResult>;
        stopWatching: () => Promise<IPCResult>;
        onClipboardChange: (callback: (data: ElectronClipboardWatchData) => void) => () => void;
      };
    };
  }
}
