# Estado funcional FriGest

Última actualización: 2026-07-04 (commit `7fc4f36`)

## Implementado y en producción

### Stock por vehículo (2026-07-04)
- Entidades `Vehicle` y `VehicleStock`; página `/my-vehicle` ("Mi Vehículo") en el menú de todos los roles.
- Técnico ve el material de su furgoneta (preseleccionada si tiene una asignada), añade material
  del almacén (descuenta del stock general) y devuelve al almacén.
- Admin/oficina/encargado crean y editan vehículos (nombre, matrícula, técnico habitual).
- En los partes: selector "Origen del material" por línea, **Almacén/Taller por defecto**; si se
  elige furgoneta se descuenta de ella y el stock general no se toca. No aplica a mano de obra,
  desplazamiento ni gas (va por botellas).
- Historial completo en Movimientos de Stock: tipos `traspaso_a_vehiculo`, `traspaso_a_almacen`,
  `salida_parte_vehiculo`, siempre con autor, fecha y furgoneta; buscable por nombre de furgoneta.
- Sin bloqueo por stock insuficiente: aviso y descuadre en negativo visible en la furgoneta.

### Regla de precios por rol (2026-07-04)
- `tecnico`/`ayudante`/`user` no ven NINGUNA valoración: ni material, ni gas, ni horas,
  ni desplazamiento, ni totales.
- `superadmin`/`admin`/`oficina`/`encargado` ven todos los precios.
- Fix aplicado: oficina/encargado ahora también ven precios por línea en Nuevo Parte.
- Flags a reutilizar en UIs nuevas: `canSeeBillingTotals`, `canSeePrices`, `canEditPrices`, `isFieldStaff`.

### Fichas de máquinas por cliente (2026-07-04)
- Entidad `Machine`: nombre, tipo (cámara/vitrina/compresor/clima/otro), marca, modelo, nº serie,
  gas y carga, fechas de instalación/garantía, ubicación, estado activa/retirada.
- Sección "Máquinas" en la ficha de cliente: añadir/editar/eliminar para **todos los roles**.
  Al eliminar se sugiere marcar "Retirada" para conservar el historial.
- Nueva avería y nuevo parte: desplegable de máquina filtrado por centro de trabajo; el parte
  hereda la máquina de la avería. Historial de averías y partes por máquina.

### Presupuestos (2026-07-04)
- Entidad `Budget` + página `/budgets` para admin/superadmin/encargado/oficina.
- Ciclo: borrador → enviado → aceptado/rechazado/caducado → parte generado.
- "Generar parte" desde presupuesto aceptado (admin/oficina): parte con líneas precargadas.
- **Parte adjunto a presupuesto** (flujo técnico): checkbox arriba del formulario de nuevo parte;
  al activarlo se elige un presupuesto aceptado (lista sin importes), se ocultan Mano de Obra y
  Desplazamiento, pero se mantienen Materiales y Gas para control de stock y trazabilidad F-Gas.
- Al guardar, el presupuesto pasa a "parte generado" con enlace bidireccional
  (`budget_id`/`budget_number` en `Intervention`, `intervention_id`/`intervention_number` en `Budget`).

### Anterior (commit `6237d24`, 2026-07-03)
- Página Facturación (listado de facturas).
- Cadena de compras enlazada (pedido → recepción → stock).
- Renombres de menú y enlaces a páginas huérfanas.
- Fix Configuración en escritorio para rol oficina.

## Pendiente (por prioridad orientativa)

1. **Proveedores dentro de Compras** — reorganización de menú: mover "Proveedores" bajo la
   sección de compras (cambio pequeño en `Layout.jsx`).
2. **Avisos automáticos de revisiones periódicas** — mantenimientos programados por cliente/máquina
   con alertas al vencimiento.
3. **Exportación de fichajes** — export CSV/Excel del historial de fichajes.

## Pendiente de infraestructura/negocio (no código de features)

- SMTP producción, Stripe (facturación SaaS), VeriFactu en producción (certificado), revisión legal RGPD.
- Ver `docs/release-readiness.md` y `docs/production-env-template.md`.
