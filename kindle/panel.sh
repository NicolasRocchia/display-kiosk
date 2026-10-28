#!/bin/sh
# Panel e-ink para Kindle PW4 (jailbreak + KOReader).
# Baja un PNG de PANEL_URL cada FULL_EVERY minutos y lo pinta completo;
# entre medio pinta la hora cada minuto en una caja reservada (refresco parcial).

DIR=/mnt/us/panel
. $DIR/panel.conf          # define PANEL_URL (y opcionalmente FULL_EVERY, TZ)

FBINK=/mnt/us/koreader/fbink
IMG=$DIR/panel.png
TMP=$DIR/panel.tmp
HDR=$DIR/headers.txt
FONT=$DIR/font.ttf
LOG=$DIR/panel.log
FULL_EVERY=${FULL_EVERY:-10}
export TZ=${TZ:-"<-03>3"}   # Argentina, sin horario de verano

# Caja del reloj (coordenadas del PNG apaisado 1448x1072)
CLK_TOP=40; CLK_BOTTOM=862; CLK_LEFT=920; CLK_RIGHT=40; CLK_SIZE=30
# Batería: esquina inferior derecha de esa misma caja (la caja termina en y=210)
BAT_TOP=172; BAT_LEFT=1280

log() { echo "$(date '+%F %T') $*" >> $LOG; }

# --- 1. SSH persistente (dropbear de KOReader, sin contraseña, puerto 2222) ---
if ! netstat -tln 2>/dev/null | grep -q ':2222 '; then
    iptables -A INPUT -p tcp --dport 2222 -j ACCEPT 2>/dev/null
    (cd /mnt/us/koreader && ./dropbear -E -R -p 2222 -n -P /tmp/dropbear_panel.pid)
    log "dropbear iniciado"
fi

# --- 2. Esperar red (al boot la conecta la interfaz de Amazon), hasta 2 min ---
# Se hace ping al gateway que informe la tabla de rutas (o a 1.1.1.1 si aún no hay ruta).
gateway() { route -n 2>/dev/null | awk '$1 == "0.0.0.0" { print $2; exit }'; }
n=0
while ! ping -c 1 -W 2 "${GW:-$(gateway)}" >/dev/null 2>&1 && [ $n -lt 60 ]; do
    GW=$(gateway); [ -z "$GW" ] && GW=1.1.1.1
    sleep 2; n=$((n + 1))
done
log "red lista tras $((n * 2)) s"

# --- 3. Sin interfaz de Amazon, sin sueño, pantalla apaisada ---
lipc-set-prop com.lab126.powerd preventScreenSaver 1 2>/dev/null
stop lab126_gui 2>/dev/null
echo 0 > /sys/class/graphics/fb0/rotate
$FBINK -q -c -f

# --- 4. Loop ---
set_clock_from_header() {
    # "Date: Tue, 27 Oct 2026 16:00:00 GMT" -> reloj del sistema en UTC
    D=$(grep -i '^Date:' $HDR | cut -d' ' -f2- | tr -d '\r' | sed 's/ GMT$//')
    [ -n "$D" ] && date -u -D '%a, %d %b %Y %H:%M:%S' -s "$D" >/dev/null 2>&1
}

paint_clock() {
    $FBINK -q -m -t regular=$FONT,size=$CLK_SIZE,top=$CLK_TOP,bottom=$CLK_BOTTOM,left=$CLK_LEFT,right=$CLK_RIGHT,padding=BOTH "$(date +%H:%M)"
    paint_battery
}

# Batería del Kindle, en chico, en la esquina inferior derecha de la caja del reloj.
# Se pinta después del reloj porque el reloj limpia toda la caja (padding=BOTH).
paint_battery() {
    LEVEL=$(lipc-get-prop com.lab126.powerd battLevel 2>/dev/null)
    [ -z "$LEVEL" ] && return
    CHG=$(lipc-get-prop com.lab126.powerd isCharging 2>/dev/null)
    if [ "$CHG" = "1" ]; then TXT="${LEVEL}% +"; else TXT="${LEVEL}%"; fi
    $FBINK -q -t regular=$FONT,size=7,top=$BAT_TOP,left=$BAT_LEFT,right=$CLK_RIGHT,padding=HORIZONTAL "$TXT"
}

fetch_and_paint() {
    if curl -sf --max-time 40 -D $HDR -o $TMP "$PANEL_URL"; then
        mv $TMP $IMG
        set_clock_from_header
        eips -c; eips -g $IMG
        log "panel ok"
    else
        log "fallo al bajar el panel"
        # deja el panel anterior y marca el problema en la esquina
        $FBINK -q -t regular=$FONT,size=8,top=1040,left=20 "sin datos desde $(date +%H:%M)"
    fi
}

i=0
while true; do
    [ $((i % FULL_EVERY)) -eq 0 ] && fetch_and_paint
    paint_clock
    i=$((i + 1))
    sleep $((60 - $(date +%S | sed 's/^0//')))
done
