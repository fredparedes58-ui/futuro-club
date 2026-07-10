/**
 * VideoUpload component — Tests
 * Valida UI de upload: drag & drop, file validation, progress, size limit,
 * y el contrato onDone(videoId) — upload() resuelve el videoId real (#26).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock("@/hooks/useVideoUpload", () => ({
  useVideoUpload: vi.fn(),
}));

// t() devuelve la clave (+ valores interpolados) — mismo patrón que el resto
// de tests del repo; las aserciones no dependen del copy en español.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key} ${Object.values(opts).join(" ")}` : key,
    i18n: { language: "es", changeLanguage: vi.fn() },
  }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { variants, initial, animate, exit, whileHover, whileTap, layout, transition, ...rest } = props;
      void variants; void initial; void animate; void exit; void whileHover; void whileTap; void layout; void transition;
      return <div {...rest}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import VideoUpload from "@/components/VideoUpload";
import { useVideoUpload, type UploadState } from "@/hooks/useVideoUpload";

const mockUseVideoUpload = vi.mocked(useVideoUpload);

const makeState = (overrides: Partial<UploadState> = {}): UploadState => ({
  phase: "idle",
  progress: 0,
  encodeProgress: 0,
  videoId: null,
  error: null,
  video: null,
  analysis: null,
  phase2Pending: false,
  uploadSpeed: 0,
  etaSeconds: 0,
  ...overrides,
});

type HookReturn = ReturnType<typeof useVideoUpload>;

const makeHook = (
  state: UploadState = makeState(),
  overrides: Partial<HookReturn> = {}
): HookReturn => ({
  state,
  upload: vi.fn(async () => null),
  cancel: vi.fn(),
  reset: vi.fn(),
  ...overrides,
});

describe("VideoUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("alert", vi.fn());
    mockUseVideoUpload.mockReturnValue(makeHook());
  });

  afterEach(() => {
    // Restaura el `alert` stubeado; si no, fuga a otros tests del fichero.
    vi.unstubAllGlobals();
  });

  it("renders upload area in idle state", () => {
    render(<VideoUpload />);
    expect(screen.getByText("videoUpload.dragOrClick")).toBeDefined();
    // formatsHint interpola el tamaño máximo (2048 MB)
    expect(screen.getByText(/videoUpload\.formatsHint 2048/)).toBeDefined();
  });

  it("rejects files larger than MAX_SIZE_MB (2048)", () => {
    const upload = vi.fn(async () => null);
    mockUseVideoUpload.mockReturnValue(makeHook(makeState(), { upload }));

    render(<VideoUpload />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    // querySelector devuelve null (no undefined) si falta → toBeDefined() nunca
    // fallaría; toBeInstanceOf sí exige que el input exista de verdad.
    expect(input).toBeInstanceOf(HTMLInputElement);

    // Create a file that exceeds 2048MB
    const bigFile = new File(["x"], "huge.mp4", { type: "video/mp4" });
    Object.defineProperty(bigFile, "size", { value: 2049 * 1024 * 1024 });

    fireEvent.change(input, { target: { files: [bigFile] } });

    // Should NOT call upload for oversized files — alert instead
    expect(upload).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("2048"));
  });

  it("shows uploading progress", () => {
    mockUseVideoUpload.mockReturnValue(
      makeHook(makeState({ phase: "uploading", progress: 45, videoId: "v1" }))
    );

    render(<VideoUpload />);
    expect(screen.getByText("videoUpload.phaseUploading")).toBeDefined();
    expect(screen.getByText("45%")).toBeDefined();
  });

  it("shows processing state", () => {
    mockUseVideoUpload.mockReturnValue(
      makeHook(makeState({ phase: "processing", progress: 100, encodeProgress: 65, videoId: "v1" }))
    );

    render(<VideoUpload />);
    expect(screen.getByText("videoUpload.phaseProcessing")).toBeDefined();
    expect(screen.getByText("65%")).toBeDefined();
  });

  it("shows analyzing state", () => {
    mockUseVideoUpload.mockReturnValue(
      makeHook(makeState({ phase: "analyzing", progress: 100, encodeProgress: 100, videoId: "v1" }))
    );

    render(<VideoUpload />);
    expect(screen.getByText("videoUpload.phaseAnalyzing")).toBeDefined();
    expect(screen.getByText("videoUpload.tacticalAnalysisTitle")).toBeDefined();
  });

  it("shows done state", () => {
    mockUseVideoUpload.mockReturnValue(
      makeHook(makeState({ phase: "done", progress: 100, encodeProgress: 100, videoId: "v1" }))
    );

    render(<VideoUpload />);
    expect(screen.getByText("videoUpload.uploadedAnalyzed")).toBeDefined();
    expect(screen.getByText(/v1/)).toBeDefined();
  });

  it("shows error state", () => {
    mockUseVideoUpload.mockReturnValue(
      makeHook(makeState({ phase: "error", error: "Upload failed: network error" }))
    );

    render(<VideoUpload />);
    expect(screen.getByText("videoUpload.uploadErrorTitle")).toBeDefined();
    expect(screen.getByText("Upload failed: network error")).toBeDefined();
  });

  it("calls onDone with the videoId resolved by upload()", async () => {
    const onDone = vi.fn();
    const upload = vi.fn(async () => "vid-42");
    mockUseVideoUpload.mockReturnValue(makeHook(makeState(), { upload }));

    render(<VideoUpload onDone={onDone} />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(upload).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ title: "clip.mp4", onDuplicate: expect.any(Function) })
    );
    // onDone recibe el videoId devuelto por upload(), no state.videoId (#26)
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("vid-42"));
  });

  it("does not call onDone when upload resolves null (failed upload)", async () => {
    const onDone = vi.fn();
    const upload = vi.fn(async () => null);
    mockUseVideoUpload.mockReturnValue(makeHook(makeState(), { upload }));

    render(<VideoUpload onDone={onDone} />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(upload).toHaveBeenCalled());
    // Purga micro + macrotareas para que un onDone diferido (setTimeout o un
    // hop async extra) tampoco se cuele → la aserción negativa no es vacua.
    await new Promise((r) => setTimeout(r, 0));
    expect(onDone).not.toHaveBeenCalled();
  });
});
