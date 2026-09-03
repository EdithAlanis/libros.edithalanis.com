-- Ejecutar una sola vez en Supabase SQL Editor para guardar el nuevo título en la base de datos.
UPDATE libros
SET titulo = 'Relatos Cortos'
WHERE lower(trim(titulo)) = 'cuentos cortos';
