# Alta de un super admin

Procedimiento para darle acceso al panel interno (`/super-admin`) a alguien del staff de Limitless.
Origen: `[AUTH-ALTA-EMAIL-AJENO]`, parte b (SCRUM-494, de SCRUM-15).

## La regla

**Primero la cuenta, después la lista.** La cuenta de la persona tiene que existir, creada por nosotros, antes
de agregar su email a `super_admin_users`. Y la persona no entra a la app hasta que su email está en la lista.

## Por qué el orden importa

Hoy la app decide quién es super admin **sólo por el email** (`isStaffEmail` en
`apps/web/lib/auth/require-staff.ts`, SCRUM-552; `require-super-admin.ts` quedó como alias): cualquier cuenta
con un email de la lista entra al panel interno, sin importar quién la creó. Estar en la organización de
Limitless no da el panel: lo da sólo la lista (`app/super-admin/__tests__/guard-de-staff-por-accion.test.ts`,
escenarios "miembro común" y "founder de Limitless fuera de la lista"). De ahí salen dos problemas, uno por cada orden equivocado:

1. **Email en la lista antes de que exista la cuenta.** Cualquier founder puede invitar ese email a su
   organización desde Equipo. La invitación crea la cuenta ya confirmada y le muestra al founder la contraseña
   temporal. Con eso entra como esa persona y la app lo manda al panel interno: todas las organizaciones,
   bajas, add-ons y claves de IA de clientes.
2. **La persona entra antes de estar en la lista.** En el primer login, la app no la ve como super admin y le
   crea una organización propia con ella como founder (`ensureUserBootstrap` en `apps/web/lib/auth/bootstrap.ts`).
   Agregarla después a la lista no borra esa organización ni ese perfil.

El arreglo de fondo (identificar al super admin por su cuenta y no por el email) es la parte a de
`[AUTH-ALTA-EMAIL-AJENO]`. Mientras no esté, este procedimiento es la protección.

## Qué hay que tener antes

- Acceso al proyecto de Supabase de producción (`OTC`): Authentication y SQL Editor.
- El email de la persona, escrito exacto. Las consultas lo pasan a minúsculas.
- Un gestor de contraseñas para generar la contraseña inicial y pasársela a la persona.

**Nunca** pegar la contraseña en un doc, un ticket, un chat ni un commit.

## Pasos

En todas las consultas, reemplazar `nombre@ejemplo.com` por el email de la persona.

### 1. Comprobar que el email no tiene cuenta

En el SQL Editor:

```sql
select u.id, u.email, u.created_at, u.email_confirmed_at, u.invited_at, u.last_sign_in_at,
       p.organization_id, p.role
from auth.users u
left join public.profiles p on p.id = u.id
where lower(u.email) = lower(trim('nombre@ejemplo.com'));
```

**Resultado esperado:** 0 filas.

**Si sale una fila, no sigas.** Alguien ya creó una cuenta con ese email y no sabemos quién la controla: puede
ser una invitación de un founder o un registro desde el login. Avisa en el canal del equipo antes de hacer nada
más. Esto pasa también si la persona ya tiene una cuenta propia (de prueba o de otra org): en ese caso no se
puede usar ese email para el super admin hasta que se haga la parte a de `[AUTH-ALTA-EMAIL-AJENO]`
(reconocer al super admin por su cuenta y no por el email). Mientras tanto, usa otro email de la persona.

Antes de seguir, confirma también que el email no está ya en la lista:

```sql
select email, name, created_at from public.super_admin_users
where email = lower(trim('nombre@ejemplo.com'));
```

**Resultado esperado:** 0 filas. Si sale una, el email está en la lista sin cuenta, que es justo el caso
peligroso del punto 1 de "Por qué el orden importa": avisa en el canal del equipo.

### 2. Crear la cuenta

Hazlo apenas termines el paso 1, sin dejar pasar tiempo entre los dos.

En Supabase: **Authentication → Users → Add user → Create new user**.

- **Email:** el de la persona.
- **Password:** una generada con el gestor, de 20 caracteres o más.
- **Auto Confirm User:** marcado.

Al crearla, anota el **UID** que muestra Supabase para la cuenta nueva: en el paso 3 se compara con él.

**Si Supabase responde que el email ya está registrado** ("already registered" o "email exists"), no sigas:
alguien creó la cuenta entre el paso 1 y este. Avisa en el canal del equipo.

No uses **Send invitation**: ese link abre una sesión en la app, y si la persona entra antes del paso 4, la app
le crea una organización propia (punto 2 de "Por qué el orden importa").

### 3. Verificar la cuenta creada

Vuelve a correr la primera consulta del paso 1.

**Resultado esperado:** 1 fila, con todo esto:

- `id` igual al UID que anotaste en el paso 2;
- `created_at` de hace unos minutos;
- `email_confirmed_at` con fecha;
- `invited_at` y `last_sign_in_at` vacíos;
- `organization_id` y `role` vacíos (todavía no tiene perfil).

**Si cualquiera de esos puntos no se cumple, no sigas** y avisa en el canal del equipo: la cuenta que encontró
la consulta no es la que acabas de crear, o alguien ya entró con ella. Por ejemplo, una cuenta registrada desde
el login queda sin confirmar y con la contraseña de quien la registró: si su email entrara a la lista, esa
persona tendría el panel interno apenas el dueño del email confirme.

### 4. Agregar el email a la lista

```sql
begin;
insert into public.super_admin_users (email, name)
values (lower(trim('nombre@ejemplo.com')), 'Nombre Apellido');
commit;
```

El email va en minúsculas y sin espacios: la app limpia y pasa a minúsculas el email de la sesión antes de
buscarlo en la lista, así que una fila con mayúsculas o espacios nunca coincide.

Verifica que la lista y la cuenta coinciden:

```sql
select s.email, s.name, u.id as user_id, u.email_confirmed_at
from public.super_admin_users s
join auth.users u on lower(u.email) = s.email
where s.email = lower(trim('nombre@ejemplo.com'));
```

**Resultado esperado:** 1 fila, con `user_id` igual al UID del paso 2 y `email_confirmed_at` con fecha. Si da
0 filas, revisa que el email de la fila insertada no tenga mayúsculas ni espacios
(`select email from public.super_admin_users;`).

### 5. Primer ingreso de la persona

1. Pásale la contraseña por el gestor de contraseñas o en persona.
2. La persona entra por **`/login`**, el mismo login de todos (en producción,
   `https://otc-plaform.vercel.app/login`). `/superadmin/login` redirige ahí (SCRUM-552). La app le crea el
   perfil como **founder de la organización de Limitless** (la única con `experience = 'limitless'`) y la lleva
   a `/super-admin/organizations` (`lib/auth/__tests__/bootstrap-staff-en-limitless.test.ts` y
   `app/auth/__tests__/login-del-staff.test.ts`). Si todavía no hay ninguna organización marcada como Limitless,
   el perfil nace sin organización, como antes.
   Si la organización de Limitless no completó el onboarding (y no tiene `skip_onboarding`), el founder recién
   llegado cae en `/onboarding` en cualquier ruta, incluido el panel: ver el paso 3b de
   [staff-en-org-de-limitless.md](staff-en-org-de-limitless.md).
3. Cambia la contraseña en **`/auth/update-password`**. Al guardar, la app la manda al Panel de clientes, que no es
   para super admins (puede mostrar un error): tiene que volver a `/super-admin/organizations`.

### 6. Verificar el perfil

```sql
select p.id, p.organization_id, p.role, p.must_change_password
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower(trim('nombre@ejemplo.com'));
```

**Resultado esperado:** 1 fila con `organization_id` igual al id de la organización de Limitless, `role` en
`founder` y `must_change_password` en `false`. Si todavía no se marcó la organización de Limitless,
`organization_id` vacío (se asocia después con `select public.asociar_staff_a_la_org_de_limitless();`, ver
[staff-en-org-de-limitless.md](staff-en-org-de-limitless.md)).

Para saber si el `organization_id` es el de Limitless:

```sql
select id, name from public.organizations where experience = 'limitless';
```

Si `organization_id` es **otra** organización, la app le creó una organización propia a esa cuenta antes de que
estuviera en la lista. Primero haz la baja (sección siguiente) para que no conserve el acceso al panel interno, y
después avisa en el canal del equipo. No borres la organización a mano, porque puede tener datos y roles
colgando.

### Invitaciones a alguien del staff

Una cuenta del staff sólo se suma por invitación de equipo a la **organización de Limitless**, y si la invitación
le crea el perfil entra como **founder** (no como member). A cualquier otra organización la invitación se rechaza
("Esta cuenta es del equipo de Limitless y sólo se puede sumar a la organización de Limitless…") y queda
pendiente; sin organización marcada como Limitless también se rechaza. Una invitación nunca le cambia el rol a
un perfil que ya existe. Testigo: `supabase/ci/tests/98_staff_en_org_de_limitless.sql`, caso 8.

## Dar de baja a un super admin

Desde SCRUM-552 el staff es founder de la organización de Limitless, así que **sacar el email de la lista ya no
alcanza**: le quita el panel interno en el próximo request, pero la persona sigue siendo founder de la
organización de Limitless y conserva sus datos (Clientes, Ventas, Administración). La baja tiene dos partes, las
dos obligatorias: sacar el email de la lista y **desactivar su perfil** (`profiles.is_active = false`). Con el
perfil desactivado el guard del panel también la rechaza (`lib/auth/__tests__/require-staff.test.ts`, "un staff
con el perfil desactivado no entra"). Si la persona deja el equipo, borra también la cuenta (al final de esta
sección).

### El camino: la función `dar_de_baja_staff`

Desde que se aplica `20261115120000_baja_de_staff.sql` en la ventana de SCRUM-532
(después de `20261101120000_staff_en_org_de_limitless.sql`, paso 5b de
[staff-en-org-de-limitless.md](staff-en-org-de-limitless.md)), la baja es una sola llamada que hace las dos partes
juntas: si algo falla, no se cambia nada. Si la función todavía no existe, sigue los pasos de "Si la función
todavía no existe (antes de la ventana)", al final de esta sección.

**Antes de la llamada**, mira el perfil de la persona y su organización (solo lectura):

```sql
select p.id, p.organization_id, o.name as organizacion, o.experience, p.role, p.is_active
from public.profiles p
join auth.users u on u.id = p.id
left join public.organizations o on o.id = p.organization_id
where lower(btrim(u.email)) = lower(btrim('nombre@ejemplo.com'));
```

Para saber si esa organización es la de Limitless:

```sql
select id, name from public.organizations where experience = 'limitless';
```

La función desactiva el perfil cuyo usuario de Auth tiene ese email, **sin mirar la organización**: si la persona
además es founder de **otra** organización (el caso de la sección anterior), queda inactiva también ahí. Si eso no
es lo que quieres, no sigas y avisa en el canal del equipo.

**La llamada.** Córrela en el **SQL Editor** de Supabase, que usa el rol de migraciones (ningún rol de la API
puede ejecutarla):

```sql
select public.dar_de_baja_staff('nombre@ejemplo.com');
```

**Resultado esperado:** una fila con uno de estos tres valores:

- `perfil_desactivado`: el email salió de la lista y el perfil cuyo email de Auth es ese quedó desactivado.
- `sin_perfil`: el email salió de la lista y ningún perfil tiene hoy ese email de Auth. No quiere decir que la
  persona "nunca entró": puede haber cambiado su email desde la app. En la organización de Limitless no quedó
  ningún perfil activo fuera de la lista.
- `sin_perfil_revisar`: el email salió de la lista y ningún perfil tiene hoy ese email de Auth (otra vez: puede
  haber cambiado su email desde la app), pero en la organización de Limitless queda al menos un perfil activo
  cuyo email de Auth no está en la lista. Puede ser la misma persona con otro email, o un miembro legítimo que no
  es del staff. La función no desactiva a ninguno. **No des la baja por terminada**: sigue con la segunda
  consulta de verificación (abajo) y desactiva a mano el perfil que corresponda.

**Si la llamada aborta**, no se cambió nada. Según el mensaje:

- `Ese email no está en la lista de staff (super_admin_users) como lo compara la app…`: busca cómo está guardado
  con `select email from public.super_admin_users;`. Si la fila está mal cargada (con mayúsculas o espacios),
  bórrala por su valor exacto con el `delete` de "Si la función todavía no existe" (el de
  `'valor tal cual sale en la consulta'`). Esa fila nunca dio acceso, pero el perfil sigue activo: desactívalo
  como en el paso 2 de esa misma sección.
- `Ese email es dueño de un holding (holdings.owner_email)…`: pasa el holding a otro super admin (el email nuevo
  tiene que estar ya en `super_admin_users`) y repite la llamada:

  ```sql
  update public.holdings set owner_email = lower(trim('otro.super.admin@ejemplo.com'))
  where owner_email = lower(trim('nombre@ejemplo.com'));
  ```

- `Hay N perfiles cuyo email de Auth coincide con ese email…`: más de un usuario de Auth tiene ese email (con
  mayúsculas o espacios distintos). Revísalos a mano con la consulta de "Antes de la llamada" y decide cuál
  desactivar antes de repetir.

### Verificación después de la baja

Dos consultas de solo lectura. La primera:

```sql
select
  (select count(*) from public.super_admin_users where email = lower(btrim('nombre@ejemplo.com'))) as sigue_en_lista,
  (select count(*) from public.profiles p
     join auth.users u on u.id = p.id
     where p.is_active and lower(btrim(u.email)) = lower(btrim('nombre@ejemplo.com'))) as perfiles_activos;
```

**Resultado esperado:** `0` y `0`.

La segunda lista los perfiles activos de la organización de Limitless cuyo email de Auth no está en la lista de
staff:

```sql
select p.id, u.email as email_de_auth, p.email, p.role
from public.profiles p
join public.organizations o on o.id = p.organization_id and o.experience = 'limitless'
join auth.users u on u.id = p.id
where p.is_active
  and not exists (
    select 1 from public.super_admin_users s
    where s.email = lower(btrim(u.email))
  );
```

**Resultado esperado:** solo miembros conocidos que no son del staff, y no la persona dada de baja. `p.email` se
muestra solo como pista: lo edita el usuario y no sirve para decidir. Si aparece la persona dada de baja (por
ejemplo, con otro email de Auth), desactívala a mano por su `id`:

```sql
update public.profiles set is_active = false where id = '<id>' returning id;
```

### Si la función todavía no existe (antes de la ventana)

Mientras `20261115120000_baja_de_staff.sql` no esté aplicada, la baja son dos pasos manuales, los dos
obligatorios.

**1. Sacar el email de la lista.** Le quita el acceso al panel interno en el próximo request:

```sql
delete from public.super_admin_users
where email = lower(trim('nombre@ejemplo.com'))
returning email;
```

Es un solo statement, así que se aplica entero o no se aplica. **Resultado esperado:** 1 fila con el email.

Si no devuelve ninguna fila, el email no coincide con ninguna de la lista. Busca cómo está guardado con
`select email from public.super_admin_users;` y borra esa fila por su valor exacto, tal cual sale, sin
`lower` ni `trim`:

```sql
delete from public.super_admin_users
where email = 'valor tal cual sale en la consulta'
returning email;
```

Una fila con mayúsculas o espacios nunca dio acceso (la app compara contra el email limpio y en minúsculas),
pero conviene borrarla para que la lista refleje la realidad.

Si el borrado falla porque `holdings.owner_email` lo referencia (`holdings_owner_email_fkey`), el email es
dueño de un holding. La app no tiene pantalla para cambiarlo: pasa el holding a otro super admin en la misma
transacción, antes de borrar.

```sql
begin;
update public.holdings set owner_email = lower(trim('otro.super.admin@ejemplo.com'))
where owner_email = lower(trim('nombre@ejemplo.com'));
delete from public.super_admin_users where email = lower(trim('nombre@ejemplo.com'));
commit;
```

El email nuevo tiene que estar ya en `super_admin_users`; si no, el `update` falla y no se borra nada.

Como el SQL Editor sólo muestra el resultado del último statement, verifica después:

```sql
select
  (select count(*) from public.super_admin_users where email = lower(trim('nombre@ejemplo.com'))) as sigue_en_lista,
  (select count(*) from public.holdings where owner_email = lower(trim('nombre@ejemplo.com'))) as holdings_a_su_nombre;
```

**Resultado esperado:** `0` y `0`.

**2. Desactivar el perfil.** Se identifica por el email de Auth, no por `profiles.email` (lo edita el usuario):

```sql
update public.profiles p
set is_active = false
from auth.users u
where u.id = p.id
  and lower(btrim(u.email)) = lower(btrim('nombre@ejemplo.com'))
returning p.id;
```

**Resultado esperado:** 1 fila. Si no devuelve ninguna, ningún perfil tiene hoy ese email de Auth (la persona
puede haber cambiado su email desde la app). Si devuelve más de una, revisa los perfiles antes de seguir.

Termina con las dos consultas de "Verificación después de la baja", igual que con la función.

La cuenta de Supabase queda. Si la persona deja el equipo, bórrala también desde **Authentication → Users**.
