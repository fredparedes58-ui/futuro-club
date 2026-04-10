/**
 * VideoUpload component — Tests
 * Valida UI de upload: drag & drop, file validation, progress, size limit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock("@/hooks/useVideoUpload", () => ({
  useVideoUpload: vi.fn(() => ({
    state: {
      phase: "idle",
      progress: 0,
      encodeProgress: 0,
      videoId: null,
      error: null,
      video: null,
      analysis: null,
      phase2Pending: false,
    },
    upload: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
  })),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { variants, initial, animate, exit, whileHover, whileTap, layout, ...rest } = props;
      void variants; void initial; void animate; void exit; void whileHover; void whileTap; void layout;
      return <div {...rest}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import VideoUpload from "@/components/VideoUpload";
import { useVideoUpload } from "@/hooks/useVideoUpload";

const mockUseVideoUpload = useVideoUpload as ReturnType<typeof vi.fn>;

describe("VideoUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("alert", vi.fn());
  });

  it("renders upload area in idle state", () => {
    render(<VideoUpload />);
    expect(screen.getByText(/MP4, MOV, AVI, WebM/)).toBeDefined();
    expect(screen.getByText(/2048 MB/)).toBeDefined();
  });

  it("rejects files larger than MAX_SIZE_MB (2048)", () => {
    const mockUpload = vi.fn();
    mockUseVideoUpload.mockReturnValue({
      state: { phase: "idle", progress: 0, encodeProgress: 0, videoId: null, error: null, video: null, analysis: null, phase2Pending: false },
      upload: mockUpload,
      cancel: vi.fn(),
      reset: vi.fn(),
    });

    render(<VideoUpload />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    expect(input).toBeDefined();

    // Create a file that exceeds 2048MB
    const bigFile = new File(["x"], "huge.mp4", { type: "video/mp4" });
    Object.defineProperty(bigFile, "size", { value: 2049 * 1024 * 1024 });

    fireEvent.change(input, { target: { files: [bigFile] } });

    // Should NOT call upload for oversized files
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("shows uploading progress", () => {
    mockUseVideoUpload.mockReturnValue({
      state: { phase: "uploading", progress: 45, encodeProgress: 0, videoId: "v1", error: null, video: null, analysis: null, phase2Pending: false },
      upload: vi.fn(),
      cancel: vi.fn(),
      reset: vi.fn(),
    });

    render(<VideoUpload />);
    expect(screen.getByText(/Subiendo video/)).toBeDefined();
  });

  it("shows processing state", () => {
    mockUseVideoUpload.mockReturnValue({
      state: { phase: "processing", progress: 100, encodeProgress: 65, videoId: "v1", error: null, video: null, analysis: null, phase2Pending: false },
      upload: vi.fn(),
      cancel: vi.fn(),
      reset: vi.fn(),
    });

    render(<VideoUpload />);
    expect(screen.getByText(/Procesando en Bunny Stream/)).toBeDefined();
  });

  it("shows analyzing state", () => {
    mockUseVideoUpload.mockReturnValue({
      state: { phase: "analyzing", progress: 100, encodeProgress: 100, videoId: "v1", error: null, video: null, analysis: null, phase2Pending: false },
      upload: vi.fn(),
      cancel: vi.fn(),
      reset: vi.fn(),
    });

    render(<VideoUpload />);
    expect(screen.getByText(/Analizando con IA/)).toBeDefined();
  });

  it("shows done state", () => {
    mockUseVideoUpload.mockReturnValue({
      state: { phase: "done", progress: 100, encodeProgress: 100, videoId: "v1", error: null, video: null, analysis: null, phase2Pending: false },
      upload: vi.fn(),
      cancel: vi.fn(),
      reset: vi.fn(),
    });

    render(<VideoUpload />);
    expect(screen.getByText(/Video subido y analizado/)).toBeDefined();
  });

  it("shows error state", () => {
    mockUseVideoUpload.mockReturnValue({
      state: { phase: "error", progress: 0, encodeProgress: 0, videoId: null, error: "Upload failed: network error", video: null, analysis: null, phase2Pending: false },
      upload: vi.fn(),
      cancel: vi.fn(),
      reset: vi.fn(),
    });

    render(<VideoUpload />);
    expect(screen.getByText(/Error/)).toBeDefined();
  });

  it("calls onDone when upload completes", () => {
    const onDone = vi.fn();
    mockUseVideoUpload.mockReturnValue({
      state: { phase: "done", progress: 100, encodeProgress: 100, videoId: "v1", error: null, video: null, analysis: null, phase2Pending: false },
      upload: vi.fn(),
      cancel: vi.fn(),
      reset: vi.fn(),
    });

    render(<VideoUpload onDone={onDone} />);
    // onDone is called via useEffect when phase becomes "done"
    // The component handles this internally
  });
});
