# Panel e-ink en un Kindle

El mismo dashboard, en un Kindle viejo colgado de la pared o parado en el escritorio: el
Worker genera `/api/panel.png` (1448×1072, gris de 8 bits, apaisado) y el Kindle lo baja y
lo pinta cada `FULL_EVERY` minutos. La hora la pinta el propio Kindle cada minuto con un
refresco parcial, en la caja superior derecha que el PNG deja vacía, y el nivel de batería
al lado. No hace falta que ninguna PC esté prendida.

Está armado y probado en un **Kindle Paperwhite 10ª generación** (PW4, 1072×1448, 300 ppi).
Otros modelos tienen otra resolución: habría que ajustar `PANEL_W`/`PANEL_H` en
`worker/panel/layout.ts` y la caja del reloj (`CLK_*` en `panel.sh`).

## Lo que necesita el Kindle

1. **Jailbreak.** Depende del firmware; la referencia es
   [kindlemodding.org](https://kindlemodding.org/jailbreaking/). Con 5.16.4 a 5.18.3 sirve
   Sanctuary, que corre entero en el navegador del dispositivo. Antes de conectarlo a
   Wi-Fi, llená el almacenamiento con archivos de relleno para que no pueda bajar una
   actualización que cierre el jailbreak; el propio jailbreak bloquea las OTA después.
2. **KOReader**, vía KPM (`;kpm update` y `;kpm install koreader` en la búsqueda del
   Kindle). No se usa para leer: aporta `dropbear` (SSH) y `fbink` (texto en pantalla). El
   PNG se pinta con `eips`, que ya viene en el Kindle.
3. **SSH una primera vez** desde KOReader (menú > Network > SSH server, "login without
   password") para copiar los archivos. Después el script levanta su propio SSH al boot.

## Instalación

Desde una PC en la misma red (`IP` es la del Kindle, puerto 2222, contraseña vacía):

```bash
ssh -p 2222 root@IP "mkdir -p /mnt/us/panel"
scp -P 2222 panel.sh panel.upstart root@IP:/mnt/us/panel/
scp -P 2222 ../worker/panel/fonts/Roboto-Bold.subset.ttf root@IP:/mnt/us/panel/font.ttf
# panel.conf: copiar panel.conf.example, poner la URL del Worker, subirlo igual
ssh -p 2222 root@IP "mntroot rw; cp /mnt/us/panel/panel.upstart /etc/upstart/panel.conf; mntroot ro; initctl start panel"
```

Los archivos van con fin de línea LF (`.gitattributes` lo fuerza); un `panel.sh` con CRLF
no arranca en el Kindle.

## Qué hace panel.sh

1. Levanta SSH en el puerto 2222 (dropbear de KOReader, sin contraseña: solo para la LAN).
2. Espera a que haya red (al boot la conecta la interfaz de Amazon), hasta 2 minutos.
3. Frena la interfaz de Amazon (`stop lab126_gui`), evita que el Kindle se duerma y gira el
   framebuffer a horizontal (`rotate` = 0: puerto USB a la derecha; 2 = a la izquierda).
   Con la interfaz frenada, una pantalla táctil rota con "toques fantasma" deja de molestar.
4. Loop: PNG completo cada `FULL_EVERY` min con `curl` + `eips`, hora del sistema ajustada
   con el header `Date` de la respuesta, y reloj y batería por minuto con `fbink`.

## Operación

- Entrar: `ssh -p 2222 root@IP`. Log: `/mnt/us/panel/panel.log`. Reiniciar el panel:
  `initctl restart panel`.
- Alimentarlo desde un cargador, no desde una PC: cuando la PC monta el Kindle como disco,
  `/mnt/us` desaparece del lado del Kindle y el script pierde sus archivos. El job de
  arranque espera hasta 10 minutos a que el almacenamiento vuelva, por si bootea enchufado.
- El Kindle nunca duerme (para el reloj por minuto), así que a batería dura uno o dos
  días. Es un panel para tener enchufado.
- Luz frontal: `lipc-set-prop com.lab126.powerd flIntensity N` (0 a 24).
- Volver a la interfaz de Amazon: `initctl stop panel; start lab126_gui`. Para desinstalar
  el arranque automático: `mntroot rw; rm /etc/upstart/panel.conf; mntroot ro`.
