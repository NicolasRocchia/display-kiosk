# Panel e-ink en un Kindle

El mismo dashboard, en un Kindle viejo parado en el escritorio o colgado de la pared. El
Worker genera `/api/panel.png` (1448×1072, gris de 8 bits, apaisado) y el Kindle lo baja y
lo pinta cada `FULL_EVERY` minutos. La hora la pinta el propio Kindle cada minuto con un
refresco parcial (sin parpadeo), en la caja vacía de arriba a la derecha, y el nivel de
batería al lado. Ninguna PC tiene que estar prendida.

Sirve incluso con la **pantalla táctil rota**: el script frena la interfaz de Amazon, así
que los "toques fantasma" no tienen a quién tocar. Lo único táctil es el jailbreak.

Está armado y probado en un **Kindle Paperwhite 10ª generación** (PW4, 1072×1448, 300 ppi,
firmware 5.18.1). Otros modelos tienen otra resolución: habría que ajustar `PANEL_W` /
`PANEL_H` en `worker/panel/layout.ts` y la caja del reloj (`CLK_*` en `panel.sh`).

Qué vas a necesitar: el Kindle con batería, un cable USB, una PC en la misma red Wi-Fi
(los comandos de abajo son de PowerShell en Windows; en Linux o Mac son los mismos sin la
letra de unidad) y el Worker ya deployado.

## 1. Averiguar el modelo y el firmware

En el Kindle: **Configuración > Todas las opciones > Opciones del dispositivo > Información
del dispositivo**. Anotá el tipo de dispositivo y la versión del firmware. Hacelo con el
Wi-Fi apagado (modo avión): hasta que el jailbreak bloquee las actualizaciones, cada
conexión es una oportunidad de que Amazon te suba un firmware que ya no se pueda abrir.

Qué jailbreak corresponde depende del firmware; la referencia siempre actualizada es
[kindlemodding.org/jailbreaking](https://kindlemodding.org/jailbreaking/). Esta guía sigue
el camino de **Sanctuary**, que sirve para **5.16.4 a 5.18.3** y corre entero en el navegador
del Kindle, sin conectarlo a ninguna computadora. Si tu firmware es anterior, allá hay otros
métodos (WinterBreak hasta 5.18.0); si es 5.19 o superior, al momento de escribir esto no hay
jailbreak.

## 2. Llenar el almacenamiento (antes de prender el Wi-Fi)

El truco para que el Kindle no pueda bajar una actualización mientras hacés el jailbreak:
dejarlo sin espacio.

1. Conectá el Kindle a la PC por USB. Aparece como una unidad (por ejemplo `F:`).
2. Mirá cuánto espacio libre tiene (clic derecho > Propiedades).
3. En una terminal como administrador, creá archivos de relleno hasta dejar **menos de
   100 MB libres**. La unidad es FAT32, así que ningún archivo puede pasar de 4 GB; con
   5,97 GB libres, por ejemplo:

   ```
   fsutil file createnew F:\relleno1.bin 4000000000
   fsutil file createnew F:\relleno2.bin 1895000000
   ```

4. Expulsá el Kindle de forma segura y verificá en el propio dispositivo que quedaron
   menos de 100 MB libres.

## 3. Jailbreak con Sanctuary

1. Salí de modo avión y conectá el Kindle al Wi-Fi.
2. Abrí el navegador del Kindle (menú de tres puntos > Navegador web) y escribí exactamente
   `http://sanctuary.skyvincent.com`, con `http` y no `https`.
3. La página escanea puertos buscando el depurador del navegador. **Puede tardar 15
   minutos o más**; no cierres el navegador ni dejes que la pantalla se apague (si se
   duerme, despertalo con el botón). El contador llega hasta 65535 como mucho.
4. Cuando aparece un **ID** (una tira hexadecimal), escribilo exacto en la casilla de abajo
   y tocá **Connect**. El error clásico es escribir la letra O donde va un cero: si dice
   "Couldn't connect, check your id", revisá eso.
5. Aparecen varios popups de descarga; OK a cada uno hasta que diga "Downloads done!".
   Cerrá el navegador.
6. Menú de tres puntos > **Configuración > Ayuda > Primeros pasos** (Settings > Help > Get
   Started). Se ve texto corriendo y probablemente un popup de "Application Error"; OK.
7. El Kindle se reinicia. Si en la biblioteca aparece un documento llamado **JAILBROKEN**,
   listo. Sanctuary además deja bloqueadas las actualizaciones automáticas.

Limpieza: conectalo por USB, borrá los archivos de relleno y, si hay algún archivo
`update*.bin` en la raíz, borralo también (es una actualización que intentó bajar).

Si el escaneo se traba en un número y no aparece el ID en unos minutos, recargá la página y
dejalo escanear de nuevo; a veces hace falta más de un intento.

## 4. Instalar KOReader

No se usa para leer: aporta `dropbear` (un servidor SSH) y `fbink` (texto en pantalla), que
el script del panel necesita. Se instala con KPM, el gestor de paquetes del jailbreak, desde
la **búsqueda** de la pantalla de inicio (la lupa):

1. Escribí `;kpm update` (con el punto y coma adelante) y Enter. Aparece texto arriba y
   vuelve al inicio.
2. Escribí `;kpm install koreader` y Enter. Al rato aparece el ícono de KOReader en la
   biblioteca (puede tardar en mostrarse).

## 5. Activar el SSH para copiar los archivos

1. Abrí KOReader. Tocá la parte superior de la pantalla para el menú, el ícono de
   **engranaje**, y entrá en **Network > SSH server**.
2. Marcá **Login without password** y **Start SSH server with KOReader**, y tocá
   **SSH server** para encenderlo. Un cartel muestra la IP del Kindle y el puerto 2222.
3. Desde la PC:

   ```
   ssh -p 2222 root@IP-DEL-KINDLE
   ```

   `yes` a la huella del host, Enter vacío como contraseña. Tendrías que ver
   `[root@kindle root]#`. Salí con `exit`.

Es un acceso sin contraseña: está pensado para tu red local, no lo expongas a internet.

## 6. Copiar el panel

Desde la carpeta `kindle/` de este repo, con la URL de tu Worker en `panel.conf`
(copiá `panel.conf.example` a `panel.conf` y editá la primera línea; guardalo con fin de
línea **LF**, no CRLF: un `panel.sh` o `panel.conf` con retornos de carro de Windows no
arranca en el Kindle):

```
ssh -p 2222 root@IP-DEL-KINDLE "mkdir -p /mnt/us/panel"
scp -P 2222 panel.sh panel.conf panel.upstart root@IP-DEL-KINDLE:/mnt/us/panel/
scp -P 2222 ..\worker\panel\fonts\Roboto-Bold.subset.ttf root@IP-DEL-KINDLE:/mnt/us/panel/font.ttf
```

Verificá que no hayan llegado retornos de carro:

```
ssh -p 2222 root@IP-DEL-KINDLE "grep -c $'\r' /mnt/us/panel/panel.sh /mnt/us/panel/panel.conf"
```

Tiene que dar `0` en los dos. Si no, en el Kindle: `sed -i 's/\r$//' /mnt/us/panel/panel.sh`
(y lo mismo con `panel.conf`).

## 7. Probar a mano

El script frena la interfaz de Amazon, y con ella puede cerrarse KOReader y su SSH. Para no
quedarte afuera, levantá primero un SSH de respaldo en otro puerto, entrá por ahí y lanzá el
panel desde esa sesión:

```
ssh -p 2222 root@IP-DEL-KINDLE "iptables -I INPUT -p tcp --dport 2223 -j ACCEPT; cd /mnt/us/koreader && ./dropbear -E -R -p 2223 -n -P /tmp/dropbear_resp.pid"
ssh -p 2223 root@IP-DEL-KINDLE
```

Y adentro:

```
cd /mnt/us/panel
setsid sh ./panel.sh > run.log 2>&1 &
sleep 30; cat panel.log; tail -5 run.log
```

En medio minuto la pantalla tendría que mostrar el panel apaisado con la hora y la batería
arriba a la derecha, y `panel.log` decir `panel ok`. Si dice `fallo al bajar el panel`,
probá la URL desde el propio Kindle: `curl -sI TU-URL | head -1` (tiene que dar 200).

Orientación: con `rotate` = 0 (el valor del script) el puerto USB queda a la derecha. Si
querés el cable a la izquierda, cambiá el `0` por `2` en la línea
`echo 0 > /sys/class/graphics/fb0/rotate` de `panel.sh`.

## 8. Arranque automático

El job de upstart hace que el panel vuelva solo después de un reinicio. El sistema de
archivos raíz es de solo lectura; se abre un momento para copiarlo:

```
ssh -p 2223 root@IP-DEL-KINDLE "mntroot rw; cp /mnt/us/panel/panel.upstart /etc/upstart/panel.conf; mntroot ro; cat /etc/upstart/panel.conf"
```

Prueba final: desenchufá el Kindle de la PC (o pasalo a un cargador) y reiniciá con
`ssh -p 2223 root@IP-DEL-KINDLE reboot`. Logo, un rato la interfaz de Amazon mientras conecta
el Wi-Fi, y el panel. Desde entonces el SSH del puerto 2222 lo levanta el propio script, sin
KOReader.

## Qué hace panel.sh

1. Levanta SSH en el puerto 2222 (dropbear de KOReader, sin contraseña).
2. Espera a que haya red (al boot la conecta la interfaz de Amazon), hasta 2 minutos,
   haciendo ping al gateway de la tabla de rutas.
3. Frena la interfaz de Amazon (`stop lab126_gui`), evita que el Kindle se duerma y gira el
   framebuffer a horizontal.
4. Loop: PNG completo cada `FULL_EVERY` minutos con `curl` + `eips`, hora del sistema
   ajustada con el header `Date` de la respuesta, y reloj y batería por minuto con `fbink`.

La caja del reloj (`CLK_*` en `panel.sh`) tiene que coincidir con `CLOCK_BOX` en
`worker/panel/layout.ts`.

## Operación y problemas conocidos

- Entrar: `ssh -p 2222 root@IP-DEL-KINDLE`. Log: `/mnt/us/panel/panel.log`. Repintar ya o
  recargar el script: `initctl restart panel`.
- **Alimentalo desde un cargador, no desde una PC.** Cuando la PC monta el Kindle como
  disco, `/mnt/us` desaparece del lado del Kindle y el script pierde sus archivos. Si bootea
  enchufado a una PC, el job espera hasta 10 minutos a que el almacenamiento vuelva, pero
  mientras tanto no hay panel.
- El Kindle nunca duerme (para el reloj por minuto), así que a batería dura uno o dos
  días: es un panel para tener enchufado. Estar siempre al 100% desgasta la batería de
  litio a largo plazo; un enchufe inteligente con horarios lo evita.
- Luz frontal: `lipc-set-prop com.lab126.powerd flIntensity N` (0 a 24). Un script de
  toggle para la PC es una línea: `ssh -p 2222 root@IP "sh /mnt/us/panel/luz.sh"`.
- Fantasmas (restos tenues del panel anterior): es normal en e-ink; cada repintado completo
  los limpia en buena parte.
- Si cambia la IP del Kindle, el router te la dice; el script no depende de ella.
- Volver a la interfaz de Amazon: `initctl stop panel; start lab126_gui`. Para quitar el
  arranque automático: `mntroot rw; rm /etc/upstart/panel.conf; mntroot ro`.
