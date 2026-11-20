import { CustomFieldsPage } from "@/components/clients/custom-fields";
import { getCustomFieldsPageDataAction } from "@/app/clients/custom-field-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function CustomFieldsRoute() {
  const sinAcceso = await exigirModuloDeLaPagina("clients");
  if (sinAcceso) return sinAcceso;

  const resultado = await getCustomFieldsPageDataAction();
  // La lectura devuelve su error como valor (SCRUM-517): la pantalla muestra
  // el motivo en vez de "Todavía no hay columnas".
  if (!resultado.success) {
    return (
      <EmptyState title="No se pudieron cargar las columnas" description={resultado.error} />
    );
  }
  const { fields, canManage } = resultado.data;
  return <CustomFieldsPage initialFields={fields} canManage={canManage} />;
}
