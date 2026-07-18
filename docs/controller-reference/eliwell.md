# Eliwell — referencia de alarmas y parámetros

Familia cubierta: **ID Plus 902/961/971/974** (termostatos/controladores de cámara de la gama ID Plus, la más extendida en instalación de media/baja temperatura con desescarche por resistencia, aire o gas caliente).

Fuente: manual técnico Eliwell ID Plus 902/961/971/974 (extraído de PDF oficial del fabricante).

> Nota de alcance: la gama Eliwell IC Plus (deshielo por aire forzado, cámaras de mayor tamaño) no se ha incluido — el manual oficial no fue accesible en esta ronda (403 al descargar). Si aparece un caso real con IC Plus, tratar como familia ID Plus con precaución y verificar códigos de alarma antes de dar por buena la equivalencia.

## Señales de alarma

| Código | Causa | Acción del equipo |
|---|---|---|
| P1 | Fallo sonda de cámara (termostática) | Funcionamiento en modo seguro según parámetros Con/COF |
| P2 | Fallo sonda de evaporador (desescarche) | El desescarche termina por tiempo (parámetro MDF) |
| P3 | Fallo sonda 3 (condensador/opcional) | Señal de alarma |
| HA | Alta temperatura de cámara | Señal de alarma |
| LA | Baja temperatura de cámara | Señal de alarma |
| HA2 | Alta temperatura de condensador | Estado del compresor según parámetro AC2 |
| LA2 | Baja temperatura de condensación | Estado del compresor según parámetro bLL |
| dA / dor | Alarma de puerta abierta | Señal de alarma; compresor/ventiladores según parámetro odc |
| EA | Alarma externa | Señal de alarma |
| CA / IA | Alarma de presostato (alta o baja presión) | Paro del equipo, rearme según configuración |
| EE | Error de memoria (EEPROM) | Salidas bloqueadas |

## Parámetros clave (para dar contexto al diagnóstico, no exhaustivo)

| Código | Descripción |
|---|---|
| Hy | Diferencial de arranque del compresor respecto a la consigna |
| SET | Temperatura de consigna |
| tdF | Tipo de desescarche instalado (rE=resistencia, rT=resistencia por temperatura, in=gas caliente) |
| IdF | Intervalo entre desescarches consecutivos |
| MdF | Duración máxima del desescarche |
| dtE | Temperatura de fin de desescarche |
| Fdt | Tiempo de goteo tras desescarche |
| AC | Tiempo de anti-cortociclo del compresor |
| ALU / ALL | Umbrales de alarma de alta/baja temperatura de cámara |
| Con / COF | Tiempos de funcionamiento/paro forzado del compresor ante fallo de sonda |
| odc | Acción sobre compresor/ventiladores al abrir la puerta |

## Notas de diagnóstico

- Un display parpadeante en la sonda de temperatura (o "P1"/"P2" fijo) casi siempre apunta a sonda desconectada, en cortocircuito, o fuera de rango — comprobar cableado antes de sospechar del propio controlador.
- "HA"/"LA" son alarmas de umbral, no de avería del compresor: hay que mirar la causa raíz (puerta abierta, carga térmica excesiva, fallo de refrigeración) antes de intervenir en el controlador.
- Las alarmas de condensador (HA2/LA2) están ligadas a parámetros AC2/bLL que determinan si el compresor se bloquea automáticamente — relevante para diagnosticar paradas "inexplicadas" del compresor.
