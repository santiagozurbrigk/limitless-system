"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from "@ai-coo/ui";

export function CreateStageModal({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `true` si la etapa se creó; si no, quien la llama ya avisó el motivo. */
  onSubmit: (input: { name: string; description?: string }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      // Con un error el modal queda abierto con lo escrito (SCRUM-506).
      if (!(await onSubmit({ name, description }))) return;
      setName("");
      setDescription("");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva etapa de negocio</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Nombre de la etapa (ej: Crecimiento 50k/mes)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            placeholder="Describe en qué consiste esta etapa..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button onClick={() => void handleSubmit()} disabled={saving || !name.trim()}>
            {saving ? "Creando…" : "Crear etapa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
