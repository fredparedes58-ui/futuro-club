"""
VITAS · Modal · Test de secrets
Verifica que los 3 secrets (Bunny, Anthropic, Voyage) están accesibles
desde dentro de una función Modal.

Uso:
    modal run modal/test_secrets.py::test_secrets

NO imprime los valores reales · solo confirma que existen y su longitud.
"""

import modal

app = modal.App("vitas-test-secrets")

image = modal.Image.debian_slim(python_version="3.11")


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("vitas-bunny"),
        modal.Secret.from_name("vitas-anthropic"),
        modal.Secret.from_name("vitas-voyage"),
    ],
    timeout=60,
)
def check_secrets() -> dict:
    """Verifica que los secrets están disponibles · sin filtrar valores."""
    import os

    secrets_check = {}

    # Bunny
    bunny_key = os.getenv("BUNNY_STREAM_API_KEY", "")
    bunny_lib = os.getenv("BUNNY_STREAM_LIBRARY_ID", "")
    secrets_check["bunny_api_key"] = {
        "present": bool(bunny_key),
        "length": len(bunny_key),
        "starts_with": bunny_key[:8] + "..." if bunny_key else None,
    }
    secrets_check["bunny_library_id"] = {
        "present": bool(bunny_lib),
        "value": bunny_lib if bunny_lib.isdigit() else "INVALID",
    }

    # Anthropic
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    secrets_check["anthropic_api_key"] = {
        "present": bool(anthropic_key),
        "length": len(anthropic_key),
        "starts_with": anthropic_key[:10] + "..." if anthropic_key else None,
        "looks_valid": anthropic_key.startswith("sk-ant-"),
    }

    # Voyage
    voyage_key = os.getenv("VOYAGE_API_KEY", "")
    secrets_check["voyage_api_key"] = {
        "present": bool(voyage_key),
        "length": len(voyage_key),
        "starts_with": voyage_key[:5] + "..." if voyage_key else None,
        "looks_valid": voyage_key.startswith("pa-"),
    }

    return secrets_check


@app.local_entrypoint()
def test_secrets():
    print("[VITAS] Verificando secrets en Modal...\n")
    result = check_secrets.remote()

    print("=== SECRETS ===")
    for name, info in result.items():
        status = "✓" if info.get("present") else "✗"
        print(f"\n  {status} {name}")
        for key, value in info.items():
            print(f"      {key}: {value}")

    all_present = all(info.get("present") for info in result.values())
    if all_present:
        print("\n✅ Los 3 secrets están accesibles desde Modal.")
    else:
        print("\n❌ Falta algún secret. Verifica con: modal secret list --env=main")
