# Estado funcional FriGest

Última actualización: 2026-07-04 (commit `fc1798b`)

## Implementado y en producción

### Presupuestos (2026-07-04)
- Entidad `Budget` + página `/budgets` para admin/superadmin/encargado/oficina.
- Ciclo: borrador → enviado → aceptado/rechazado/caducado → parte generado.
- "Generar parte" desde presupuesto aceptado (admin/oficina): parte con líneas precargadas.
- **Parte adjunto a presupuesto** (flujo técnico): checkbox arriba del formulario de nuevo parte;
  al activarlo se elige un presupuesto aceptado (lista sin importes), se ocultan Mano de Obra y
  Desplazamiento, pero se mantienen Materiales y Gas para control de stock y trazabilidad F-Gas.
- Al guardar, el presupuesto pasa a "parte generado" con enlace bidireccional
  (`budget_id`/`budget_number` en `Intervention`, `intervention_id`/`intervention_number` en `Budget`).
- Sin valoración económica para técnico/ayudante en partes: sin precios por línea ni
  subtotal/IVA/total en formulario y detalle. Técnico/ayudante tampoco ven la página de presupuestos.

### Anterior (commit `6237d24`, 2026-07-03)
- Página Facturación (listado de facturas).
- Cadena de compras enlazada (pedido → recepción → stock).
- Renombres de menú y enlaces a páginas huérfanas.
- Fix Configuración en escritorio para rol oficina.

## Pendiente (por prioridad orientativa)

1. **Proveedores dentro de Compras** — reorganización de menú: mover "Proveedores" bajo la
   sección de compras (cambio pequeño en `Layout.jsx`).
2. **Ficha de máquinas del cliente** — nueva entidad de equipos por cliente/centro de trabajo
   (marca, modelo, gas, carga, historial de intervenciones por máquina).
3. **Stock por furgoneta** — stock asignado por vehículo/técnico, con traspasos entre almacén
   central y furgonetas.
4. **Avisos automáticos de revisiones periódicas** — mantenimientos programados por cliente/máquina
   con alertas al vencimiento.
5. **Exportación de fichajes** — export CSV/Excel del historial de fichajes.

## Pendiente de infraestructura/negocio (no código de features)

- SMTP producción, Stripe (facturación SaaS), VeriFactu en producción (certificado), revisión legal RGPD.
- Ver `docs/release-readiness.md` y `docs/production-env-template.md`.
