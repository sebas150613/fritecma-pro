# Intarcon — referencia de alarmas y parámetros

Familias cubiertas: **XW60LH** (regulación electrónica Dixell/Emerson rebrandeada por Intarcon, cámaras de media/baja temperatura, formato mural) y **XM670K** (regulación Dixell/Emerson para equipos de refrigeración con hasta 2 etapas de compresor, montaje en carril DIN 8 módulos, con red local LAN entre varias unidades).

Fuentes: manuales técnicos oficiales Intarcon ("Regulación Electrónica XW60LH" e "Manual de regulación XM670K v.5.6").

> Nota: ambos controladores están basados en plataforma Dixell (hardware Emerson/Dixell con marca Intarcon), por lo que comparten nomenclatura de parámetros con otros equipos Dixell del mercado.

## XW60LH — señales de alarma

| Código | Causa | Acción del equipo |
|---|---|---|
| P1 | Fallo sonda de cámara | Funcionamiento en modo seguro según parámetros Con/COF |
| P2 | Fallo sonda de evaporador | El desescarche termina por tiempo (parámetro MDF) |
| P3 | Fallo sonda 3 | Señal de alarma |
| P4 | Fallo sonda 4 | Señal de alarma |
| HA | Alta temperatura de cámara | Señal de alarma |
| LA | Baja temperatura de cámara | Señal de alarma |
| HA2 | Alta temperatura de condensador | Estado del compresor según parámetro AC2 |
| LA2 | Baja temperatura de condensación | Estado del compresor según parámetro bLL |
| dA | Alarma de interruptor de puerta | Señal de alarma |
| EA | Alarma externa | Señal de alarma |
| CA | Alarma de interruptor de presión (i1F=bAL/PAL) | Paro del equipo |

## XW60LH — parámetros clave

| Código | Descripción |
|---|---|
| Hy | Diferencial de arranque del compresor respecto a consigna |
| LS / US | Límites inferior/superior de la temperatura de consigna |
| tdF | Tipo de desescarche instalado (rE=resistencia, rT=resistencia por temperatura, in=gas caliente) |
| IdF | Intervalo entre desescarches consecutivos |
| MdF | Duración máxima del desescarche |
| dtE | Temperatura de fin de desescarche |
| Fdt | Tiempo de goteo tras desescarche |
| AC | Tiempo de anti-cortociclo del compresor |
| ALU / ALL | Diferencial para alarma de alta/baja temperatura de cámara |
| Con / COF | Tiempo de funcionamiento/paro forzado del compresor ante fallo de sondas |
| odc | Acción sobre compresor/ventiladores al abrir la puerta (no/Fan/CPr/F_C) |
| i1F | Tipo de entrada digital 1 (PAL=presostatos) |
| i2F | Tipo de entrada digital 2 (alarma genérica/severa, puerta, etc.) |

## XM670K — señales de alarma

| Mensaje | Causa | Acción del equipo | Rearme |
|---|---|---|---|
| Pon / PoF | Teclado activo/bloqueado | Salidas inalteradas | — |
| rst | Reinicio de alarma (se pulsó una tecla con alarma activa) | Reinicio del relé de alarma | — |
| rtc | Reloj interno no configurado | Salidas inalteradas | — |
| rtf | Reloj interno averiado | Salidas inalteradas | — |
| EE | EEPROM averiada | Salidas bloqueadas | — |
| nod | Dispositivo de la red LAN desconectado o polaridad incorrecta | Salidas inalteradas | — |
| AS1–AS8 | Alarma activa en el dispositivo nº 1–8 de la red LAN | Según tipo de alarma | — |
| LA2 | Baja temperatura de condensación (parámetro A2L) | Bloqueo de salidas si bLL habilitado | Automático (temp. > A2L+H2L) |
| HA2 | Alta temperatura de condensación (parámetro A2U) | Ventiladores 100% + compresores bloqueados si CnL/A2C | Automático (temp. < A2U-H2H) |
| HP | Activaciones del presostato de alta > nPS en periodo d1d | Salidas bloqueadas | Manual |
| LP | Activaciones del presostato de baja > nPS en d2d, o abierto más de d2d | Salidas bloqueadas | Manual |
| PCo | Línea de seguridad abierta (entrada digital virtual) | Salidas bloqueadas | Automático |
| PCb | Activaciones de PCo > nPS | Salidas bloqueadas | Manual |
| LPA | Alarma de presostato de baja durante pump-down (no activó tras temporizar LPr) | Solenoide abierta + ventilador evaporador activo | Automático al rearmar presostato |
| AMP | Presostato de baja no cayó en tiempo Mpt durante pump-down por presión | — | Automático en nueva demanda de frío |
| dPA | Activación del presostato de baja durante desescarche por gas caliente | Para el compresor y abre la solenoide | Automático al rearmar presostato |
| dA | Alarma de puerta abierta | Compresor/ventiladores según rrd y odc | Automático |
| CPA | La temperatura/presión de condensación no aumenta Cdt grados en CdF segundos | Salidas inalteradas | Automático al parar el compresor |
| HA | Alarma de alta temperatura de cámara | Salidas inalteradas | Automático (según ALU-AHy o Set+ALU-AHy) |
| LA | Alarma de baja temperatura de cámara | Salidas inalteradas | Automático (según ALL+AHy) |
| P1–P6 | Fallo de sonda 1 a 6 | Salidas inalteradas | — |

## XM670K — parámetros clave

| Código | Descripción |
|---|---|
| Hy | Diferencial respecto a la consigna |
| CCt / CCS | Duración y consigna del ciclo de enfriamiento rápido |
| Con / COF | Tiempo de funcionamiento/paro del compresor ante fallo de sondas |
| tdF | Tipo de desescarche instalado |
| IdF / MdF | Intervalo entre desescarches / duración máxima |
| dtE | Temperatura de fin de desescarche |
| Fdt | Tiempo de goteo tras desescarche |
| FnC | Modo de operación de ventiladores (con compresor / continuo, con/sin desescarche) |
| ALP / ALU / ALL | Sonda de referencia y umbrales de alarma de alta/baja temperatura |
| AP2 / AL2 / Au2 | Sonda de referencia y umbrales de alarma de condensación |
| oA3 | Configuración del 3er relé (alarma, luz, auxiliar, segundo compresor, etc.) |
| i1F / i2F | Configuración de entradas digitales (presostatos, alarma genérica/severa) |
| nPS | Número mínimo de errores de presostato antes de disparar alarma |
| Adr | Dirección del equipo en red LAN/ModBus (debe ser distinta por equipo) |

### Funciones de autodiagnóstico inteligente (XM670K)

| Aviso | Causa | Significado |
|---|---|---|
| dFA | La sonda de desescarche no detecta +5K en 5 min tras iniciar desescarche | Posible fallo de resistencias de desescarche |
| dFL | 5 desescarches consecutivos finalizados por tiempo (no por temperatura) | Posible bloqueo de hielo en el evaporador |
| FnA | Sonda de cámara 15K por encima de sonda de desescarche durante ≥30 min | Posible fallo de ventiladores del evaporador |

Estos avisos no detienen el equipo, pero señalan una anomalía que debería revisar un instalador antes de que derive en un fallo grave.

## Notas de diagnóstico

- XW60LH y XM670K comparten la lógica Dixell: alarmas de sonda (P1-P6) casi siempre son cableado/conexión; alarmas de alta/baja temperatura de cámara (HA/LA) son de umbral, hay que buscar la causa (puerta, carga térmica, fallo de refrigeración).
- En XM670K, las alarmas HP/LP (presostatos) requieren apagar y encender el equipo para rearmar tras bloqueo — no reinician solas.
- Las alarmas AS1-AS8 en XM670K solo aparecen si el equipo forma parte de una red LAN de hasta 8 controladores; para ver el código real de la alarma hay que entrar al menú SECCIÓN y seleccionar el dispositivo remoto correspondiente (SE+Nº).
- Los avisos de autodiagnóstico inteligente (dFA/dFL/FnA) del XM670K son exclusivos de esta familia y muy útiles para detectar degradación antes de un fallo — no existen en el XW60LH.
