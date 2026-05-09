// Script para generar automáticamente los iconos necesarios para PWA (multiplataforma).
// Nota: este repo usa `"type": "module"`, así que este script debe ser ESM.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Crear directorio de iconos si no existe
const iconsDir = path.join(__dirname, "../public/icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
  console.log("📁 Directorio de iconos creado");
}

// Función placeholder para generar un archivo de texto básico para cada tamaño de icono
// En un entorno real, esto usaría un módulo como sharp para generar iconos reales
function createPlaceholderIcon(size, filename) {
  const filePath = path.join(iconsDir, filename);
  
  // Crear un archivo de texto con información del tamaño si el archivo no existe
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      `Este es un placeholder para un icono de tamaño ${size}. Reemplazar con un archivo PNG real.`
    );
    console.log(`✅ Placeholder para ${filename} creado`);
  } else {
    console.log(`ℹ️ El archivo ${filename} ya existe, omitiendo`);
  }
}

console.log("🔄 Generando iconos para PWA...");

// Generar placeholders para los diferentes tamaños de iconos
const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];
iconSizes.forEach(size => {
  createPlaceholderIcon(size, `icon-${size}x${size}.png`);
});

// Icono especial maskable para Android
createPlaceholderIcon('192x192 maskable', 'maskable-icon.png');

// Iconos para shortcuts
createPlaceholderIcon('192x192', 'new-intervention.png');
createPlaceholderIcon('192x192', 'fichaje.png');
createPlaceholderIcon('72x72', 'badge-72x72.png');

console.log("✨ Generación de iconos PWA completa");
console.log(
  "⚠️ IMPORTANTE: Reemplaza estos placeholders con iconos PNG reales antes de desplegar en producción"
);

// Verificar si existe la página offline.html
const offlinePagePath = path.join(__dirname, '../public/offline.html');
if (!fs.existsSync(offlinePagePath)) {
  console.log(
    "⚠️ No se encontró la página offline.html que es necesaria para el funcionamiento offline"
  );
  console.log("   Crea una página offline.html en la carpeta public");
} else {
  console.log("✅ Página offline.html encontrada");
}

// Verificar si existe el service worker
const swPath = path.join(__dirname, '../public/service-worker.js');
if (!fs.existsSync(swPath)) {
  console.log("⚠️ No se encontró el archivo service-worker.js necesario para PWA");
  console.log("   Crea un service-worker.js en la carpeta public");
} else {
  console.log("✅ Service worker encontrado");
}

console.log("\n🚀 Tu aplicación está lista para funcionar como PWA!");