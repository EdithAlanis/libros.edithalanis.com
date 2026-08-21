# Portal Editorial Edith Alanis — versión 2 segura

Incluye la interfaz pública y la base para accesos reales con Supabase.

Reglas: lector $100 por 30 días, hasta 3 obras fijas; autor $500/mes sin límite editorial de páginas; 20% de cada lector repartido entre obras elegidas y liquidación bimestral; 5 administradores gratuitos; lectura sin retroceso; PDF final $500.

## Activación
1. Crear proyecto en Supabase.
2. Ejecutar `supabase_schema.sql` en SQL Editor.
3. Copiar Project URL y anon key.
4. Colocarlas en `config.js`.
5. Subir `index.html`, `app.js` y `config.js` a GitHub.
6. Crear usuarios en Supabase Authentication y después sus perfiles en `profiles`, guardando NIP con `crypt()`.

Nunca subas a GitHub la `service_role key`.
