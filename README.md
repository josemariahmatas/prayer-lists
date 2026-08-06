# Mis Listas de Oración 🙏

Una aplicación web interactiva y responsiva con estética limpia al estilo **Notion** para gestionar listas de oración personales y colectivas. Diseñada para ser ultra ligera y de carga rápida.

## Características

- 👥 **Listas de Personas**: Organizadas por 17 categorías iniciales con etiquetas de color pastel (estilo Notion).
- 📌 **Asuntos Pendientes**: Pestaña dedicada para intenciones, necesidades generales o causas comunes.
- 👁️/✏️ **Modos de Vista y Edición**: Cambia fácilmente entre el modo de lectura (donde puedes ver y tachar oraciones respondidas) y el modo de edición (para añadir/quitar personas, categorías o peticiones concretas).
- 👉 **Panel Lateral (Side-Peek)**: Al estilo de Notion, permite ver todos los detalles y las peticiones concretas de cada persona deslizando un panel desde la derecha.
- ⚡ **Tiempo Real**: Sincronización automática de datos en tiempo real mediante Firebase Firestore.
- 🌙 **Modo Oscuro**: Adaptación automática al tema preferido de tu dispositivo.

## Tecnologías Utilizadas

- **Vite** como empaquetador rápido.
- **JavaScript (ES6+) Vainilla** y **CSS3** para el mínimo peso y velocidad máxima.
- **Firebase Firestore** para la base de datos en la nube.

## Desarrollo Local

1. Instala las dependencias:
   ```bash
   npm install
   ```

2. Ejecuta el servidor de desarrollo:
   ```bash
   npm run dev
   ```

3. Compila para producción:
   ```bash
   npm run build
   ```
