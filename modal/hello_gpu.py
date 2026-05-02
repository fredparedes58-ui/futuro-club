"""
VITAS · Modal · Hello GPU dummy function
Test inicial para verificar que el setup Modal + GPU T4 funciona.

Deploy:
    modal deploy modal/hello_gpu.py

Test:
    modal run modal/hello_gpu.py::test_gpu

Web endpoint (si despliegas):
    POST a la URL que Modal te dará (ver output del deploy)
"""

import modal

app = modal.App("vitas-hello-gpu")

# Imagen mínima con torch (para verificar GPU funciona)
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch==2.2.0")
)


@app.function(image=image, gpu="T4", timeout=60)
def gpu_check() -> dict:
    """
    Verifica que la GPU T4 está disponible y funcional.
    """
    import torch
    import time

    t0 = time.time()

    # Importante: castear TODO a tipos Python nativos para que Modal pueda
    # deserializar el resultado en clientes que no tienen torch instalado.
    info = {
        "cuda_available": bool(torch.cuda.is_available()),
        "device_count": int(torch.cuda.device_count()),
        "device_name": str(torch.cuda.get_device_name(0)) if torch.cuda.is_available() else None,
        "cuda_version": str(torch.version.cuda) if torch.version.cuda else None,
        "torch_version": str(torch.__version__),
    }

    if torch.cuda.is_available():
        # Test de tensor en GPU
        x = torch.randn(1000, 1000).cuda()
        y = torch.randn(1000, 1000).cuda()
        z = float((x @ y).sum().item())
        info["matrix_test_passed"] = True
        info["matrix_sum_sample"] = round(z, 2)

    info["latency_ms"] = int((time.time() - t0) * 1000)
    info["status"] = "ready" if info["cuda_available"] else "no_gpu"

    return info


@app.local_entrypoint()
def test_gpu():
    """
    Ejecutado con: modal run modal/hello_gpu.py::test_gpu
    """
    print("[VITAS] Solicitando GPU T4 a Modal...")
    result = gpu_check.remote()
    print("\n=== RESULTADO ===")
    for key, value in result.items():
        print(f"  {key}: {value}")

    if result["status"] == "ready":
        print("\n✅ GPU operativa. Setup Modal completo.")
    else:
        print("\n❌ GPU no disponible. Revisar configuración.")
