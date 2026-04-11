import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import VideoUpload from "@/components/VideoUpload";

// Mock the hook
const mockState = {
  phase: "idle" as const,
  progress: 0,
  encodeProgress: 0,
  videoId: null as string | null,
  error: null as string | null,
  video: null,
  analysis: null as any,
  phase2Pending: false,
  uploadSpeed: 0,
  etaSeconds: 0,
};

const mockUpload = vi.fn();
const mockCancel = vi.fn();
const mockReset = vi.fn();

vi.mock("@/hooks/useVideoUpload", () => ({
  useVideoUpload: () => ({
    state: mockState,
    upload: mockUpload,
    cancel: mockCancel,
    reset: mockReset,
  }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, onClick, onDragOver, onDragLeave, onDrop, ...rest }: any) => (
      <div className={className} onClick={onClick} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("lucide-react", () => ({
  Upload: () => <span data-testid="upload-icon" />,
  Video: () => <span data-testid="video-icon" />,
  X: () => <span data-testid="x-icon" />,
  CheckCircle2: () => <span data-testid="check-icon" />,
  AlertCircle: () => <span data-testid="alert-icon" />,
  Loader2: () => <span data-testid="loader-icon" />,
  Zap: () => <span data-testid="zap-icon" />,
  Film: () => <span data-testid="film-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
}));

describe("VideoUpload — idle state", () => {
  beforeEach(() => {
    mockState.phase = "idle";
    mockState.error = null;
    mockState.phase2Pending = false;
    mockState.videoId = null;
    mockState.analysis = null;
  });

  it("renders dropzone in idle state", () => {
    render(<VideoUpload />);
    expect(screen.getByText(/Arrastra un video/i)).toBeTruthy();
  });

  it("renders title input in idle state", () => {
    render(<VideoUpload />);
    expect(screen.getByPlaceholderText(/Título del video/i)).toBeTruthy();
  });

  it("shows powered by badge", () => {
    render(<VideoUpload />);
    expect(screen.getByText(/Bunny Stream/i)).toBeTruthy();
  });

  it("rejects oversized files", () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<VideoUpload />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bigFile = new File(["x".repeat(100)], "big.mp4", { type: "video/mp4" });
    Object.defineProperty(bigFile, "size", { value: 2049 * 1024 * 1024 }); // Over 2048 MB

    fireEvent.change(input, { target: { files: [bigFile] } });
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("2048"));
    alertSpy.mockRestore();
  });
});

describe("VideoUpload — error state", () => {
  beforeEach(() => {
    mockState.phase = "error";
    mockState.error = "Network timeout";
    mockState.phase2Pending = false;
    mockState.videoId = null;
    mockState.analysis = null;
  });

  it("shows error message", () => {
    render(<VideoUpload />);
    expect(screen.getByText("Network timeout")).toBeTruthy();
  });

  it("shows retry button", () => {
    render(<VideoUpload />);
    expect(screen.getByText(/Reintentar/i)).toBeTruthy();
  });

  it("calls reset on retry click", () => {
    render(<VideoUpload />);
    fireEvent.click(screen.getByText(/Reintentar/i));
    expect(mockReset).toHaveBeenCalled();
  });
});

describe("VideoUpload — done state", () => {
  beforeEach(() => {
    mockState.phase = "done";
    mockState.videoId = "test-video-123";
    mockState.error = null;
    mockState.phase2Pending = false;
    mockState.analysis = {
      formationHint: "4-3-3",
      notes: "Good pressing",
      keyMovements: ["Sprint", "Pass"],
    };
  });

  it("shows success message", () => {
    render(<VideoUpload />);
    expect(screen.getByText(/Video subido y analizado/i)).toBeTruthy();
  });

  it("shows video ID", () => {
    render(<VideoUpload />);
    expect(screen.getByText(/test-video-123/)).toBeTruthy();
  });

  it("shows analysis results", () => {
    render(<VideoUpload />);
    expect(screen.getByText("4-3-3")).toBeTruthy();
    expect(screen.getByText("Good pressing")).toBeTruthy();
  });

  it("shows upload another button", () => {
    render(<VideoUpload />);
    expect(screen.getByText(/Subir otro video/i)).toBeTruthy();
  });
});

describe("VideoUpload — phase2Pending state", () => {
  beforeEach(() => {
    mockState.phase = "error";
    mockState.phase2Pending = true;
    mockState.error = null;
    mockState.videoId = null;
    mockState.analysis = null;
  });

  it("shows phase 2 message instead of error", () => {
    render(<VideoUpload />);
    expect(screen.getByText(/Módulo disponible en Fase 2/i)).toBeTruthy();
  });
});
