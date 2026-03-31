# Agente: DeployAgent
**Fase:** Todas
**Área:** Build, deploy y verificación en Vercel

## Propósito
Gestionar el proceso completo de build, commit y deploy a producción.
Verifica que cada deploy sea exitoso y los agentes Claude estén activos.

## Contrato

### INPUT
```
- Descripción de los cambios realizados (para el commit message)
- Archivos modificados (opcional — si no se especifica, usa git status)
```

### PROCESO
1. Verificar build local: `npm run build`
2. Si hay errores → invocar DebugAgent antes de continuar
3. Hacer commit con mensaje descriptivo en inglés
4. Push a GitHub: `git push origin main`
5. Deploy a Vercel: `npx vercel --prod --yes`
6. Verificar que el deploy terminó con status READY
7. Verificar que los agentes Claude responden en producción

### Comandos en orden
```bash
npm run build
git add [archivos específicos]
git commit -m "mensaje descriptivo"
git push origin main
npx vercel --prod --yes
```

### OUTPUT
```
- Build exitoso confirmado
- Commit creado con mensaje descriptivo
- Deploy en Vercel con status READY
- URL de producción confirmada: https://futuro-club.vercel.app
```

## Restricciones
- En PowerShell NO usar && — comandos por separado
- SIEMPRE verificar el build antes del commit
- NUNCA hacer push si el build falla
- El commit message siempre en inglés con Co-Authored-By Claude
- Agregar archivos específicos en git add (no usar git add -A)
