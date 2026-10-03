# Alta de un super admin

Procedimiento para darle acceso al panel interno (`/super-admin`) a alguien del staff de Limitless.
Origen: `[AUTH-ALTA-EMAIL-AJENO]`, parte b (SCRUM-494, de SCRUM-15).

## La regla

**Primero la cuenta, después la lista.** La cuenta de la persona tiene que existir, creada por nosotros, antes
de agregar su email a `super_admin_users`. Y la persona no entra a la app hasta que su email está en la lista.

## Por qué el orden importa

Hoy la app decide quién es super admin **sólo por el email** (`isSuperAdminEmail` en
`apps/web/lib/auth/require-super-admin.ts`): cualquier cuenta con un email de la lista entra al panel interno,
sin importar quién la creó. De ahí salen dos problemas, uno por cada orden equivocado:

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
where lower(u.email) = lower('nombre@ejemplo.com');
```

**Resultado esperado:** 0 filas.

**Si sale una fila, no sigas.** Alguien ya creó una cuenta con ese email y no sabemos quién la controla: puede
ser una invitación de un founder. Avisar en el canal del equipo antes de hacer nada más.

Antes de seguir, también confirmar que el email no está ya en la lista:

```sql
select email, name, created_at from public.super_admin_users
where email = lower('nombre@ejemplo.com');
```

**Resultado esperado:** 0 filas. Si sale una, el email está en la lista sin cuenta, que es justo el caso
peligroso del punto 1 de "Por qué el orden importa": avisar en el canal del equipo.

### 2. Crear la cuenta

En Supabase: **Authentication → Users → Add user → Create new user**.

- **Email:** el de la persona.
- **Password:** una generada con el gestor, de 20 caracteres o más.
- **Auto Confirm User:** marcado.

No usar **Send invitation**: ese link abre una sesión en la app, y si la persona entra antes del paso 4, la app
le crea una organización propia (punto 2 de "Por qué el orden importa").

### 3. Verificar la cuenta creada

Volver a correr la primera consulta del paso 1.

**Resultado esperado:** 1 fila con `email_confirmed_at` con fecha, `invited_at` vacío, `last_sign_in_at` vacío y
`organization_id` y `role` vacíos (todavía no tiene perfil).

Si `last_sign_in_at` tiene fecha o ya hay perfil, alguien entró con esa cuenta antes de tiempo: no sigas y
avisa en el canal del equipo.

### 4. Agregar el email a la lista

```sql
begin;
insert into public.super_admin_users (email, name)
values (lower('nombre@ejemplo.com'), 'Nombre Apellido');
commit;
```

El email va en minúsculas: la app pasa a minúsculas el email de la sesión antes de buscarlo en la lista, así
que una fila con mayúsculas nunca coincide.

Verificar que la lista y la cuenta coinciden:

```sql
select s.email, s.name, u.id as user_id, u.email_confirmed_at
from public.super_admin_users s
join auth.users u on lower(u.email) = s.email
where s.email = lower('nombre@ejemplo.com');
```

**Resultado esperado:** 1 fila con `user_id` y `email_confirmed_at`.

### 5. Primer ingreso de la persona

1. Pasarle la contraseña por el gestor de contraseñas o en persona.
2. La persona entra por **`/superadmin/login`** (en producción, `https://otc-plaform.vercel.app/superadmin/login`).
   La app le crea un perfil sin organización y la lleva a `/super-admin/organizations`.
3. Cambia la contraseña en **`/auth/update-password`**. Al guardar, la app la manda al Panel de clientes, que no es
   para super admins (puede mostrar un error): tiene que volver a `/super-admin/organizations`.

### 6. Verificar el perfil

```sql
select p.id, p.organization_id, p.role, p.must_change_password
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('nombre@ejemplo.com');
```

**Resultado esperado:** 1 fila con `organization_id` vacío.

Si `organization_id` tiene un valor, la persona entró antes del paso 4 y la app le creó una organización: avisar
en el canal del equipo. No borrar nada a mano, porque la organización puede tener datos y roles colgando.

## Dar de baja a un super admin

Sacar el email de la lista le quita el acceso al panel interno en el próximo request:

```sql
begin;
delete from public.super_admin_users where email = lower('nombre@ejemplo.com');
commit;
```

Si falla porque `holdings.owner_email` lo referencia, el email es dueño de un holding: antes hay
que pasarle el holding a otro super admin. La cuenta de Supabase queda; si la persona deja el equipo, también
hay que borrarla desde **Authentication → Users**.
