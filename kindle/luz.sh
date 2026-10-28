#!/bin/sh
# Alterna la luz frontal del Kindle: apagada <-> nivel LUZ (0..24 en el Paperwhite 10).
LUZ=8
L=$(lipc-get-prop com.lab126.powerd flIntensity)
if [ "$L" -gt 0 ]; then
    lipc-set-prop com.lab126.powerd flIntensity 0
    echo "luz apagada"
else
    lipc-set-prop com.lab126.powerd flIntensity $LUZ
    echo "luz encendida ($LUZ)"
fi
