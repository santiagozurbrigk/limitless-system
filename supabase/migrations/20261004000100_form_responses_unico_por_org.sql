-- Respuestas de formularios: únicas por organización, no globales (SCRUM-57).
--
-- ⭐ `external_response_id` era único en toda la tabla y los upserts de Typeform y
-- Google Forms usaban `onConflict: "external_response_id"`: si dos organizaciones
-- sincronizaban el mismo formulario, el upsert reescribía `organization_id` y la
-- respuesta (con nombre y mail del lead) se mudaba de una org a la otra. Ahora la
-- clave es (organization_id, external_response_id) y los upserts usan esa.
-- form_responses tenía 0 filas al aplicar: no hay datos que reconciliar.

alter table public.form_responses drop constraint if exists form_responses_external_response_id_key;
drop index if exists public.form_responses_external_response_id_key;
create unique index if not exists form_responses_org_external_response_id_key
  on public.form_responses (organization_id, external_response_id);
