# display-kiosk — release público

Worker de Cloudflare que sirve un dashboard kiosk (reloj, clima, solar, monitor de
servicios) para reciclar un teléfono viejo como display de escritorio. **MIT**, pensado para
que un tercero lo clone y lo deploye en dos minutos.

**El README es documentación pública, escrita para alguien que no conoce el proyecto** — es
completo y exacto (setup, seguridad y privacidad, costos y límites, cómo agregar un widget).
No se duplica acá, y al editarlo hay que seguir escribiendo para ese lector.

## Este repo es el gemelo público de `Display`

`D:\Programacion\Display` es la **versión privada** del mismo producto: mismo Worker, mismos
widgets, pero con las coordenadas reales, la estación meteorológica que corresponde y
`MONITOR_URLS` apuntando a los sitios propios. Los cambios se portan a mano entre los dos.

## La regla de oro: acá no entra nada privado

Es el riesgo específico de este repo, y el más fácil de cometer portando un cambio desde
`Display` sin mirar la config que viene pegada. Hoy la separación está bien hecha y hay que
mantenerla así:

- **Coordenadas genéricas**: `-34.6037 / -58.3816` es el Obelisco, no una casa. En `Display`
  están las reales.
- **`MONITOR_URLS` solo con statuspages públicos** (Claude, GitHub). En `Display` está la
  lista de sitios propios — esa lista **no viene acá**, porque revela qué hay en producción.
- **Ningún dominio propio** en archivos versionados. Verificado el 2026-08-25: cero.
- La estación **UTN San Francisco sí está**, y está bien: es un adaptador opcional de una
  estación pública (`worker/sources/stations/`), documentado como feature. No es un dato
  privado.

Antes de commitear un cambio traído de `Display`, mirar `wrangler.jsonc` y cualquier `vars`.

## El modo demo es parte del producto

**Sin credenciales de Solax la app tiene que seguir funcionando**, con datos de ejemplo
(`worker/sources/demoSolar.ts`). Es la promesa del README —"deployalo y velo andando en dos
minutos"— y lo que hace que el repo sirva a alguien que no tiene un inversor. Un cambio en
`solax.ts` que asuma credenciales presentes rompe eso sin que ningún test lo note.

## Lo que este repo tiene y `Display` no

Nació de una revisión adversarial y quedó más endurecido que el privado. El cache ya se
portó a `Display` el 2026-08-25; **sigue sin portarse**:

- `src/components/WidgetBoundary.tsx` — error boundary por widget.
- `worker/sources/stations/` — las estaciones modularizadas.

## Antes de commitear

`npm run check` (que es `npm test && npm run build`) y `npm run lint`. El test del cache
corre con node nativo y type stripping, sin vitest: **Node ≥ 22**. Los tests están excluidos
del `tsconfig.worker.json` a propósito — corren en Node, no en el Worker.

## Red-team

`disensor` no se usa (decisión del 2026-08-25, aplica a todos los repos). El `.residuo/` con
el evento `d0bebbca` es el registro histórico del piloto: se deja, no se migra ni se
actualiza.
