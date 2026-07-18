# AKO — referencia de alarmas y parámetros

Familias cubiertas:
- **AKO-D14xxx "Darwin"** (termostatos/controladores básicos de 0 a 4 relés, la gama más extendida en muebles y cámaras pequeñas/medianas).
- **AKO-16524A / 16525A / 16525AN** (controlador avanzado de cámara frigorífica con modo SELFDRIVE — gestión autónoma de desescarches y ventiladores).

Fuentes: manuales técnicos oficiales AKO Electromecánica ("Termómetros y controladores de temperatura" D144H001 y "Controlador avanzado de temperatura para cámara frigorífica" 1652H4A01).

## Serie D14xxx (Darwin) — mensajes en pantalla

| Mensaje | Causa | Activa relé de alarma |
|---|---|---|
| L5 / 0 (intermitente) | Petición de código de acceso (password) | No |
| E1 / E2 / E3 | Sonda 1, 2 o 3 averiada (circuito abierto, cruzado, o fuera de rango) | No directamente |
| dEF | Desescarche en curso | No |
| AH (intermitente + temp.) | Alarma de temperatura máxima (umbral A1) | Sí |
| AL (intermitente + temp.) | Alarma de temperatura mínima (umbral A2) | Sí |
| AE (intermitente + temp.) | Alarma externa activada (entrada digital) | Sí |
| AES (intermitente + temp.) | Alarma externa severa (desactiva todas las cargas) | Sí |
| Adt (intermitente + temp.) | Desescarche finalizado por tiempo máximo (no por temperatura) | No |
| PAb (intermitente + temp.) | Puerta abierta más tiempo del permitido (parámetro A12) | No |
| Pd (intermitente + temp.) | Error recogida de gas — fallo en el paro (presostato de baja no activó) | No |
| LP (intermitente + temp.) | Error recogida de gas — fallo en el arranque (presostato de baja no se desactivó) | No |
| Ar (intermitente + temp.) | Batería de reloj descargada o reloj desprogramado (solo equipos con RTC) | No |

## Serie D14xxx — parámetros clave

| Código | Descripción |
|---|---|
| SP | Punto de consigna (Set Point) |
| C1 | Diferencial del termostato (histéresis) |
| C6 | Comportamiento del compresor si falla la sonda 1 (0=parado, 1=marcha, 2=media 24h, 3=ciclos C7/C8) |
| d0 | Frecuencia de desescarche (horas entre inicios) |
| d1 | Duración máxima del desescarche (0 = desescarche desactivado) |
| d4 | Temperatura de fin de desescarche (por sonda) |
| d7 | Tipo de desescarche: 0=resistencias, 1=inversión de ciclo |
| A0 | Config. alarmas de temperatura: 0=relativo al SP, 1=absoluto |
| A1 / A2 | Umbrales de alarma de temperatura máxima/mínima |
| A9 | Polaridad relé de alarma |
| P0 | Modo: 0=frío (directo), 1=calor (inverso) — solo termostatos |
| P6 | Función del relé auxiliar: 1=desescarche, 2=alarma, 3=luz, 4=recogida de gas (pump-down), 5=desescarche master |
| P10 / P11 | Función de las entradas digitales (puerta, alarma externa, desescarche esclavo, presostato de baja, etc.) |

## Serie AKO-16524A/16525A/16525AN — mensajes de alarma

| Mensaje | Causa | Activa relé + sonora |
|---|---|---|
| Pd | Recogida de gas: fallo en el paro (tiempo máximo C20 superado) | No (solo pantalla) |
| LP | Recogida de gas: fallo en el arranque (tiempo máximo C19 superado) | No (solo pantalla) |
| E1 / E2 / E3 | Sonda 1/2/3 averiada. E2/E3 también indican sonda de evaporador húmeda | Sí |
| AdO | Alarma de puerta abierta (más tiempo del definido en A12) | Sí |
| AH | Alarma de temperatura máxima (umbral A1) | Sí |
| AL | Alarma de temperatura mínima (umbral A2) | Sí |
| AE | Alarma externa activada | Sí |
| AES | Alarma externa severa (desactiva todas las cargas) | Sí |
| Adt | Desescarche finalizado por tiempo máximo (no por temperatura) | No (alerta) |
| HCP | Alarma HACCP: temperatura > h1 durante más de h2 | Sí |
| HCP/PF | Alarma HACCP tras fallo de suministro eléctrico | Sí |
| CAL | Calibración del modo SELFDRIVE en curso (evitar abrir puerta) | No |

### Mensajes de alerta específicos del modo SELFDRIVE (tecla ▼)

| Código | Significado |
|---|---|
| E10/E20 | Error de fin de desescarche en evaporador 1/2 durante calibración (no finalizó por temperatura) |
| E11/E21 | Diferencia insuficiente entre sonda de cámara y sonda de evaporador durante calibración |
| E12/E22 | Calibración fallida por falta de estabilidad (aperturas de puerta, oscilaciones de presión) |
| E13/E23 | Igual que E11/E21 pero durante funcionamiento normal (SELFDRIVE activo) |
| E14/E24 | Falta de estabilidad detectada durante funcionamiento normal |
| E15/E25 | Falta de estabilidad persistente → SELFDRIVE desactivado automáticamente |
| E16 | Cambio de configuración de 1 a 2 evaporadores (o viceversa) |
| E17 | Excesivas aperturas de puerta durante calibración — no se pudo calibrar |
| E18 | Excesivas aperturas de puerta — no se puede regular en modo SELFDRIVE |

## Serie AKO-16524A — parámetros clave

| Código | Descripción |
|---|---|
| SP | Punto de consigna |
| CE | Modo SELFDRIVE: 0=desactivado, 1=activado |
| C1 | Diferencial de la sonda 1 (histéresis) |
| C6 | Comportamiento del compresor con fallo en sonda 1 (mismas opciones que D14xxx) |
| d0 / d1 | Frecuencia y duración máxima de desescarche (modo estándar) |
| d4 | Temperatura final de desescarche |
| d30 | Estrategia de desescarche en modo SELFDRIVE (0=conservadora, más alto=agresiva; depende del paso de aleta y tipo de desescarche) |
| d31 | Tiempo máximo sin desescarches (modo SELFDRIVE) |
| d32 | Tiempo máximo fuera de rango de consigna antes de desescarche de emergencia |
| a1 / a2 | Umbrales de alarma de temperatura máxima/mínima |
| h1 / h2 | Umbral y tiempo para alarma HACCP |
| I10 / I20 | Función de las entradas digitales 1/2 (puerta, alarma externa, presostato de baja, cambio de SP, stand-by remoto, etc.) |

## Notas de diagnóstico

- En la serie D14xxx y en la 165xx, distinguir siempre alarmas de umbral (AH/AL, con histéresis y posible retardo) de errores de sonda (E1/E2/E3, hardware) — un E1/E2/E3 exige revisar cableado/conexión de sonda antes que sospechar de la regulación.
- En la serie avanzada 16524A/16525A, los códigos E1x/E2x son propios del modo SELFDRIVE (calibración o funcionamiento autónomo) y casi siempre apuntan a una instalación incorrecta de sondas (ver ubicación recomendada: sonda de evaporador cerca de la entrada de refrigerante, sonda ambiente lejos del flujo directo de aire frío) o a aperturas de puerta excesivas — no a una avería del compresor.
- "Pd"/"LP" en ambas series indican fallo en la maniobra de recogida de gas (pump-down): un presostato de baja que no conmuta en el tiempo esperado. Comprobar presostato y línea de aspiración antes de tocar parámetros de tiempo (C19/C20 o P14/P15).
- El modo SELFDRIVE (165xx) puede desactivarse solo tras fallos persistentes (E15/E25); el equipo pasa a regular en modo estándar — comprobar que los parámetros estándar (d0, d1, d4, F0-F4) están razonablemente configurados como respaldo.
