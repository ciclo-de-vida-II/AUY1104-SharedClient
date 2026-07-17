# API de ejemplo — AUY1104 (Express + Docker + K3s + Canary)

API académica en **Node.js/Express**, desplegada en un clúster **K3s** (equivalente
funcional de Amazon EKS: misma API estándar de Kubernetes) mediante un pipeline de
**GitHub Actions** con estrategia de despliegue **Canary** y **rollback automático**.

> **Nota sobre infraestructura:** siguiendo la autorización de la escuela para esta
> EFT, se usa **K3s** en vez de Amazon EKS y **Docker Hub** en vez de Amazon ECR.
> K3s implementa la misma API estándar de Kubernetes, por lo que las plantillas,
> la estrategia Canary y el rollback automático se resuelven de forma idéntica.

## Arquitectura

```
                        ┌─────────────────────────┐
   Internet / NodePort  │        Service           │  selector: app=demo-api
   ───────────────────► │        (demo-api)        │  (SIN filtrar por track)
                        └────────────┬─────────────┘
                                     │ reparte tráfico según cantidad de réplicas
                    ┌────────────────┴───────────────┐
                    ▼                                 ▼
        ┌───────────────────────┐         ┌───────────────────────┐
        │ Deployment stable      │         │ Deployment canary      │
        │ track=stable            │         │ track=canary            │
        │ N réplicas (ej. 4)      │         │ 0-1 réplicas             │
        │ imagen: vX.Y.Z (actual) │         │ imagen: vX.Y.(Z+1) (nueva)│
        └───────────────────────┘         └───────────────────────┘
```

Un único `Service` (NodePort 30090) selecciona por la etiqueta `app`, sin distinguir
`track`. Por eso el porcentaje de tráfico que recibe cada versión queda determinado
por la **proporción de réplicas** entre `stable` y `canary` (ej. 4 stable / 1 canary
≈ 20% de exposición al canary).

## Estrategia de despliegue: Canary

Se eligió **Canary** (frente a Blue/Green) porque prioriza **limitar el daño** sobre
la velocidad absoluta de reversión: solo una fracción controlada de las requests
llega a la versión nueva mientras se valida su salud.

Flujo del pipeline (`canary-deploy.yaml`, en `AUY1104-SharedWorkflows`):

1. **Tests + build**: corre los tests reales (Jest/Supertest) y, si pasan, construye
   y publica la imagen versionada en Docker Hub (`APP_VERSION` queda embebido en la
   imagen y expuesto en `GET /health`).
2. **Deploy canary**: aplica el `Service` y el `Deployment` canary (1 réplica) con la
   imagen nueva. El `Deployment` estable **no se toca** en este paso.
3. **Validación de salud** (paso explícito, independiente del `rollout status`):
   ejecuta varios requests directos contra el pod canary (`kubectl exec` + `wget`),
   midiendo código HTTP y latencia. Si algún request falla o supera el umbral de
   latencia, la validación se marca como fallida.
4. **Promote** (si la validación fue exitosa): actualiza la imagen del `Deployment`
   estable a la nueva versión, lo escala a su tamaño objetivo, y apaga el canary
   (`--replicas=0`).
5. **Rollback automático** (si la validación falló): apaga el canary
   (`--replicas=0`) de inmediato. La versión estable nunca fue modificada, así que
   sigue sirviendo el 100% del tráfico sin interrupción.

### ¿Cómo se activa la remediación automática?

Se activa **solo** cuando el job `health-validation` termina en fallo (`exit 1`).
GitHub Actions ejecuta entonces el job `rollback` (`if: needs.health-validation
== failure()`), que escala el `Deployment` canary a 0 réplicas. No requiere
intervención manual: es la condición `if:` de los jobs la que decide entre
`promote` y `rollback`.

## Plantillas reutilizables e inyección de variables dinámicas

Este proyecto no repite la lógica de build/deploy en cada repo: la consume desde
`AUY1104-SharedWorkflows` como **workflow reutilizable** (`canary-deploy.yaml`,
fijado a `@v1.0.0`). El repo cliente (`AUY1104-SharedClient`) solo declara **qué**
desplegar, no **cómo**:

```yaml
uses: ciclo-de-vida-II/AUY1104-SharedWorkflows/.github/workflows/canary-deploy.yaml@v1.0.0
with:
  app-name: demo-api
  image-name: demo-api
  image-tag: ${{ github.ref_name }}   # variable dinámica: el tag que disparó el push
  k3s-server-public-ip: ${{ vars.K3S_SERVER_PUBLIC_IP }}
  canary-replicas: 1
  stable-replicas: 4
```

Esas variables (`app-name`, `image-tag`, IP del servidor, cantidad de réplicas) se
inyectan al clúster en tiempo de ejecución: el pipeline las usa con `sed` para
renderizar los manifiestos genéricos de `k8s/` (que traen placeholders como
`__APP_NAME__`, `__CANARY_TAG__`) antes de aplicarlos con `kubectl apply`. Así el
mismo workflow reutilizable sirve para cualquier microservicio, no solo para
`demo-api` — basta con cambiar los valores del bloque `with:`.

La plantilla de **validación de código** (`validate-code.yaml`) sigue el mismo
principio: corre en cada push a `feature/*`/`fix/*` (vía `verify-feature.yaml`)
y valida tests + build de Docker **antes** de que el código llegue a `main`.

## Mapeo con la Evaluación Final Transversal

| Ítem EFT | Dónde está resuelto |
|---|---|
| Ítem 1 — Plantillas reutilizables + variables dinámicas | `canary-deploy.yaml` (SharedWorkflows) + sección de arriba |
| Ítem 2 — Estrategia de despliegue avanzada + validación de salud | Jobs `deploy-canary` y `health-validation` de `canary-deploy.yaml` |
| Ítem 3 — Remediación automática | Jobs `promote`/`rollback`, ver "¿Cómo se activa la remediación automática?" arriba |

## Bootstrap (primera vez en un clúster nuevo)

El pipeline **no crea** el `Deployment` estable inicial (para no pisar su tag con
cada corrida). Antes del primer despliegue, aplicar manualmente una vez:

```bash
sed -e "s|__APP_NAME__|demo-api|g" \
    -e "s|__IMAGE__|<tu_usuario_dockerhub>/demo-api|g" \
    -e "s|__STABLE_TAG__|v0.1.0|g" \
    -e "s|__STABLE_REPLICAS__|4|g" \
    k8s/deployment.yaml | sudo k3s kubectl apply -f -
```

De ahí en adelante, cada tag `vX.Y.Z` que se pushee dispara el pipeline y promueve
(o revierte) automáticamente.

## Disparar un despliegue

```bash
git tag v1.1.0
git push origin v1.1.0
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/health` | Estado del servicio + versión (`APP_VERSION`) |
| `GET` | `/api/saludo` | Saludo en JSON; query opcional `nombre` |
| `POST` | `/api/echo` | Devuelve en JSON el cuerpo enviado |
| `GET`/`POST` | `/api/suma` | Suma `a` + `b` (query o body) |

## Comandos útiles para la demo en vivo

```bash
# Ver stable y canary corriendo en simultáneo
sudo k3s kubectl get pods -l app=demo-api -o wide

# Confirmar qué versión respondió (útil para "ver" el canary en acción)
curl -s http://<IP_PUBLICA>:30090/health

# Rollback manual de emergencia (si hiciera falta fuera del pipeline)
sudo k3s kubectl scale deployment/demo-api-canary --replicas=0
```

## Requisitos

- Node.js 20+ (ejecución local)
- Docker (ejecución en contenedor)
- Clúster K3s accesible por SSH desde el runner de GitHub Actions

## Ejecución local

```bash
npm install
npm test
npm start
```

Por defecto escucha en el puerto **3000**: `http://localhost:3000`.