alter table public.perfiles enable row level security;

drop policy if exists "usuario lee su perfil" on public.perfiles;

create policy "usuario lee su perfil"
on public.perfiles
for select
to authenticated
using (id = auth.uid());

grant execute
on function public.verificar_nip(text)
to authenticated;
