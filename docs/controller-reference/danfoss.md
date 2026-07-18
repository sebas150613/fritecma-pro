# Danfoss — referencia de alarmas y parámetros

Familias cubiertas: **EKC 202D / EKC 302D** (serie ADAP-KOOL®, montaje en carril DIN o panel, la más extendida en cámaras y muebles de supermercado) y **EKC 202C-MS** (versión compacta de panel, misma lógica, catálogo de parámetros ligeramente reducido).

Fuentes: manual técnico Danfoss EKC 202D/302D (inglés) y manual técnico Danfoss EKC 202C-MS (español), ambos oficiales del fabricante.

## Señales de alarma — EKC 202D / EKC 302D

| Código | Causa | Notas |
|---|---|---|
| A1 | Alarma de alta temperatura | High t. alarm |
| A2 | Alarma de baja temperatura | Low t. alarm |
| A4 | Alarma de puerta | Door Alarm |
| A5 | Información: ha expirado el tiempo de espera tras desescarche coordinado (parámetro o16) | Max Hold Time |
| A15 | Alarma por señal de la entrada digital DI1 | DI1 alarm |
| A16 | Alarma por señal de la entrada digital DI2 | DI2 alarm |
| A45 | Standby: refrigeración parada (por r12 o por entrada digital) | Standby mode |
| A59 | Limpieza de mueble en curso (señal desde DI1 o DI2) | Case cleaning |
| E1 | Fallo interno del controlador | EKC error |
| E6 | Fallo del reloj en tiempo real — comprobar batería / resetear reloj | — |
| E25 | Fallo de sonda S3 | S3 error |
| E26 | Fallo de sonda S4 | S4 error |
| E27 | Fallo de sonda S5 (sonda de desescarche) | S5 error |

Distinción importante: las alarmas **A** (con retardo configurable) son incidencias de funcionamiento diario; las **E** son defectos de instalación/hardware y se muestran de inmediato, teniendo prioridad de visualización sobre las A.

## Señales de alarma — EKC 202C-MS

| Código | Causa |
|---|---|
| A1 | Alarma por alta temperatura de aire |
| A2 | Alarma por baja temperatura de aire |
| A4 | Alarma de puerta |
| A5 | Expirada la espera tras desescarche coordinado |
| A15 | Alarma asociada a entrada digital DI |
| A45 | EKC parado (por r12 o por la DI) |
| A59 | Limpieza del mueble |
| A61 | Alarma de temperatura del condensador (si S5 se usa para vigilar condensador, parámetro o70=2) |
| E1 | Fallo del controlador |
| E6 | Fallo del reloj (comprobar pila / resetear reloj) |
| E27 | Error en la sonda S5 |
| E29 | Error en la sonda Saire (sonda de aire/termostato) |

## Parámetros clave (comunes a ambas familias, códigos idénticos)

| Código | Descripción |
|---|---|
| r01 | Diferencial del termostato |
| r02 / r03 | Límites máximo/mínimo de temperatura de consigna |
| r12 | Marcha/paro: -1=manual, 0=parado, 1=en marcha |
| r13 | Desplazamiento de consigna en operación nocturna |
| A03 | Retardo de alarma de temperatura (estándar) |
| A04 | Retardo de alarma de puerta |
| A12 | Retardo de alarma de temperatura tras desescarche (pulldown) |
| A13 / A14 | Límites de alarma alta/baja temperatura |
| c01 / c02 | Tiempo mínimo de compresor en marcha / entre arranques |
| d01 | Tipo de desescarche (EL=eléctrico, Gas=gas caliente, Brine=salmuera en 202D/302D) |
| d02 | Temperatura de fin de desescarche |
| d03 | Intervalo entre desescarches (0=desactivado) |
| d04 | Duración máxima del desescarche |
| d10 | Sonda usada para terminar el desescarche (0=por tiempo, 1=S5, 2=S3/S4/Saire) |
| o02 / o37 | Configuración de función de entradas digitales DI1/DI2 |
| o06 | Tipo de sonda (Pt1000, PTC, NTC — variantes según referencia) |

## Notas de diagnóstico

- Distinguir siempre alarma (A, umbral con retardo) de fallo (E, hardware/sensor, inmediato) — un display bloqueado en un código E normalmente exige comprobar cableado de sonda o reloj antes que ajustar parámetros de regulación.
- El código "-d-" en pantalla no es una alarma: indica desescarche en curso o post-desescarche (hasta 15 min); es comportamiento normal.
- "PS" en pantalla significa que el equipo pide código de acceso (o05/o64) para entrar en parámetros — no es un fallo.
- La alarma de puerta (A4) y las de alta/baja temperatura (A1/A2) comparten causa raíz habitual: puerta mal cerrada o burlete deteriorado — comprobar primero el elemento físico antes de sospechar del sensor o del compresor.
