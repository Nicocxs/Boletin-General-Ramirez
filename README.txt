
# Boletín Comunitario - Proyecto listo

Estructura:
- server.js (backend)
- package.json
- public/ (frontend)
- uploads/ (subidas)
- database.sqlite (se crea al iniciar)

Cómo usar:
1. Desde la carpeta del proyecto ejecuta:
   npm install
   node server.js
2. Abre en el navegador: http://localhost:3000
3. Regístrate, inicia sesión, publica (puedes adjuntar imagen), comenta y elimina tus publicaciones.

Notas:
- Cambia la variable de entorno JWT_SECRET para producción.
- Si modificas imágenes, se guardan en /uploads.
