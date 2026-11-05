# Staff en la organización de Limitless (SCRUM-552) — precheck y guía del día 5

Qué hace y en qué orden se aplica, en producción, la migración `20261101120000_staff_en_org_de_limitless.sql`
dentro de la ventana de SCRUM-532 (día 5). Depende de `20261019120000_organizations_experience.sql` (SCRUM-523).

## Qué cambia

- El staff de Limitless (emails en `super_admin_users`) pasa a ser **founder de la organización de Limitless**,
  la única con `organizations.experience = 'limitless'`. Un índice único parcial
  (`organizations_una_sola_limitless`) impide marcar una segunda.
- La migración asocia a esa organización los perfiles del staff que **no tienen organización**, y no mueve a
  nadie que ya esté en otra organización (`supabase/ci/tests/98_staff_en_org_de_limitless.sql`, casos 6 y 7).
  No cambia `role`, `is_active` ni `must_change_password` (en los dos sentidos: un staff a mitad del alta lo
  conserva en `true`, el resto en `false`) y no asigna `custom_role_id` (98, caso 6; el caso 7 compara las
  cuatro columnas antes y después de la segunda corrida). Un perfil sin organización no puede tener
  `custom_role_id` (lo impide `validar_rol_de_la_org`), así que el 98 no siembra uno; que la asociación no
  pise un `custom_role_id` existente queda **por código**: el `update` sólo escribe `organization_id`.
- Una invitación de equipo a la organización de Limitless deja entrar al staff como founder; a cualquier otra
  organización sigue dando `cuenta_de_staff` (98, caso 8).
- El panel interno lo sigue dando **sólo** la lista: un miembro (o founder) de la organización de Limitless que
  no está en `super_admin_users` no tiene el panel (`app/super-admin/__tests__/guard-de-staff-por-accion.test.ts`).
- El staff entra por `/login`; `/superadmin/login` redirige ahí.

La migración es idempotente (98, caso 7: la segunda corrida devuelve 0 y deja los perfiles iguales) y
fail-closed (98, casos 3 y 5: aborta sin cambios). Corre en una sola transacción: si aborta, no queda nada
aplicado, ni el índice ni las funciones.

## Precheck (sólo lectura)

Todas son consultas `select`: se pueden correr cuantas veces haga falta en el SQL Editor de producción.

```sql
-- P0a. ANTES de aplicar 20261019120000 (no existe experience). Candidatas por nombre: confirmar el id a mano.
select o.id, o.name, o.account_type, o.status, o.skip_onboarding,
       st.gate_completed_at, o.created_at,
       (select count(*) from public.profiles p where p.organization_id = o.id) as perfiles
from public.organizations o
left join public.onboarding_state st on st.organization_id = o.id
where o.name ilike '%limitless%'
order by o.created_at;

-- P0b. DESPUÉS de 523 y del marcado: tiene que devolver exactamente 1 fila.
--      account_type = 'holding' => PARAR y escalar (R8).
--      gate_completed_at null y skip_onboarding false => el staff caería en el gate (R9): ver paso 3b.
select o.id, o.name, o.account_type, o.status, o.experience, o.skip_onboarding, st.gate_completed_at
from public.organizations o
left join public.onboarding_state st on st.organization_id = o.id
where o.experience = 'limitless';

-- P1. La lista de staff, cuenta por cuenta. Corre antes y después de 523
--     (la experiencia se lee con to_jsonb para no fallar si la columna todavía no existe).
select s.email, s.name, s.role as rol_en_lista, s.created_at as en_lista_desde,
       u.id as user_id, u.email as email_auth, u.email_confirmed_at, u.last_sign_in_at, u.banned_until,
       (u.id is not null and s.email = lower(btrim(u.email))) as coincide_como_la_app,
       p.organization_id, o.name as org, to_jsonb(o) ->> 'experience' as experience, p.role, p.is_active
from public.super_admin_users s
left join auth.users u      on lower(btrim(u.email)) = lower(btrim(s.email))
left join public.profiles p on p.id = u.id
left join public.organizations o on o.id = p.organization_id
order by s.email;

-- P2. Totales y vista previa exacta de lo que haría la migración (después del marcado; antes y después de 552).
with lim as (select id from public.organizations where experience = 'limitless'),
staff as (
  select s.email, u.id as user_id, p.id as profile_id, p.organization_id
  from public.super_admin_users s
  left join auth.users u      on s.email = lower(btrim(u.email))
  left join public.profiles p on p.id = u.id
)
select (select count(*) from lim)                                            as orgs_limitless,   -- tiene que ser 1
       count(*)                                                              as en_lista,
       count(user_id)                                                        as con_cuenta_auth,
       count(profile_id)                                                     as con_perfil,
       count(profile_id) filter (where organization_id is null)              as perfil_sin_org_a_migrar,
       count(profile_id) filter (where organization_id in (select id from lim)) as ya_en_limitless,
       count(profile_id) filter (where organization_id is not null
                                   and organization_id not in (select id from lim)) as en_otra_org_revisar
from staff;

-- P3. Miembros actuales de la org de Limitless y si están en la lista
--     (los que tienen en_lista_staff = false NO tienen panel ni Administración, AC-1).
--     La org va por id (el de P0a), así corre antes de 523 y antes del marcado.
select p.id, p.email, p.full_name, p.role, p.custom_role_id, p.is_active,
       exists (select 1 from public.super_admin_users s
               join auth.users u on s.email = lower(btrim(u.email))
               where u.id = p.id) as en_lista_staff
from public.profiles p
where p.organization_id = '<id de P0a>'
order by en_lista_staff desc, p.email;

-- P4. Filas de la lista con mayúsculas/espacios: nunca dieron acceso y la migración NO las asocia.
select email from public.super_admin_users where email <> lower(btrim(email));

-- P5. Verificación posterior a 552: repetir P2. Esperado: perfil_sin_org_a_migrar = 0,
--     ya_en_limitless = lo que P2 daba como perfil_sin_org_a_migrar + ya_en_limitless antes,
--     en_otra_org_revisar sin cambios (AC-11, resolver a mano).
```

En este documento el id de la organización de Limitless es siempre `'<id de P0a>'`: nunca se escribe el uuid
real acá.

## Pasos del día 5

1. **Antes de la ventana (sólo lectura): P0a, P1, P3 y P4.**
   - Confirmar con Martín el id de la organización de Limitless entre las filas de P0a.
     **Esperado:** una candidata clara. Si ninguna fila es la de Limitless, o hay dudas, no seguir.
   - Si esa organización tiene `account_type = 'holding'`, **parar y escalar** (R8): esta HU no contempla que la
     org de Limitless sea un holding.
   - En P1, revisar `coincide_como_la_app`: una fila en `false` con `user_id` presente es un email de la lista mal
     cargado (P4 lo confirma); no se asocia ni da panel. Corregir la fila de la lista (procedimiento de
     [alta-super-admin.md](alta-super-admin.md)) o dejarla documentada.
   - Decidir qué pasa con quien aparezca en otra organización (`org` con valor y distinto de la de Limitless) y
     con una persona del staff que tenga **otra** cuenta en la organización de Limitless (aparece en P3 con
     `en_lista_staff = false`): la migración no los mueve ni les da panel.
2. **Aplicar `20261019120000_organizations_experience.sql`** (SCRUM-523).
3. **Marcar la organización** según la guía de SCRUM-523 (escritura de 523, citada acá para el orden):

   ```sql
   update public.organizations set experience = 'limitless' where id = '<id de P0a>' returning id, name, experience;
   ```

   **Esperado:** 1 fila. Si el índice ya existiera (552 aplicada antes) y hubiera otra org marcada, falla con
   `unique_violation`: no hay que marcar dos.

   **3b.** Si P0b muestra `gate_completed_at` vacío y `skip_onboarding = false`, el responsable de la ventana
   decide con Martín: completar el gate de onboarding de la organización o usar la salida de emergencia que ya
   existe (`skip_onboarding = true`). Sin esto, el staff, ahora founder con organización, es redirigido a
   `/onboarding` en **cualquier ruta no pública, incluido `/super-admin/*`** (`lib/supabase/middleware.ts` y
   `lib/onboarding/gate-routing.ts`: `/super-admin` no es una ruta pública).
4. **P0b y P2.** **Esperado:** P0b, exactamente 1 fila (la de `'<id de P0a>'`); P2, `orgs_limitless = 1`.
   `perfil_sin_org_a_migrar` es la cantidad de perfiles que va a asociar la migración.
5. **Aplicar `20261101120000_staff_en_org_de_limitless.sql`.** Si aborta, leer el mensaje (ver "Si la
   migración aborta"), corregir y reintentar: no deja cambios a medias.
6. **P5** (repetir P2). **Esperado:** `perfil_sin_org_a_migrar = 0`, `ya_en_limitless` igual a la suma de
   `perfil_sin_org_a_migrar + ya_en_limitless` del paso 4, `en_otra_org_revisar` sin cambios. Si alguien se
   agregó a la lista tarde o quedó pendiente, se re-ejecuta la asociación (sólo el rol de migraciones; ningún
   rol de la API tiene EXECUTE):

   ```sql
   select public.asociar_staff_a_la_org_de_limitless();
   ```

   Devuelve cuántos perfiles asoció; una segunda corrida devuelve 0.
7. **Desplegar el código.** El orden respecto del paso 5 es indistinto (el guard no exige organización): con el
   código antes, el panel sigue funcionando y un staff nuevo nace sin organización hasta el paso 5; con la
   migración antes, el código viejo sigue mandando al staff a `/super-admin/organizations`.
8. **Verificación manual** ([verificacion-manual.md](verificacion-manual.md), Plataforma, bloque 13): el staff
   entra por `/login`; `/superadmin/login` redirige a `/login`; un miembro de la organización de Limitless que no
   está en la lista no ve el panel.

## Si la migración aborta

La migración corre en una transacción: un aborto no deja nada aplicado. Los tres mensajes posibles:

- **`SCRUM-552 necesita 20261019120000_organizations_experience (SCRUM-523) aplicada antes`**
  No existe la columna `organizations.experience` o su CHECK no acepta `'limitless'`. Aplicar primero la
  migración de SCRUM-523 (paso 2) y volver a empezar desde el paso 3.
- **`Hay N organizaciones con experience = limitless; tiene que haber una sola`**
  Hay más de una organización marcada. Ver cuáles con
  `select id, name from public.organizations where experience = 'limitless';`, dejar marcada sólo
  `'<id de P0a>'` (la otra vuelve a su experiencia, según la guía de SCRUM-523), repetir P0b y reintentar.
- **`Hay N perfiles de staff sin organización y ninguna organización con experience = limitless. Marcala antes (docs/operacion/staff-en-org-de-limitless.md)`**
  Falta el paso 3: hay staff para asociar y ninguna organización marcada. Marcar la organización, repetir P0b y
  P2, y reintentar.

## Baja de alguien del staff

Desde esta migración, sacar el email de la lista ya no alcanza: la persona sigue siendo founder de la
organización de Limitless. Ver [alta-super-admin.md](alta-super-admin.md), "Dar de baja a un super admin".
