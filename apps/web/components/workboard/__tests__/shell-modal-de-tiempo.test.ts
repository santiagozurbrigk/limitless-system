/**
 * SCRUM-503 (revisión 3, MENOR-3): el shell le pasa al modal de tiempo los
 * minutos que ya quedaron registrados en la confirmación abierta. Sin eso, el
 * modal no avisa ni bloquea los minutos aunque el provider los tenga.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
  propsDelModal: null as null | Record<string, unknown>,
  minutosRegistrados: null as number | null,
  nada: () => null,
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/workboard/actions", () => ({}));
vi.mock("@/app/workboard/task-link-actions", () => ({}));
vi.mock("@/providers/toast-provider", () => ({ useToast: () => ({ push: () => {} }) }));
vi.mock("@/providers/workboard-provider", () => ({
  useWorkboard: () => ({
    areaFilter: "all",
    setAreaFilter: () => {},
    view: "board",
    setView: () => {},
    members: [{ id: "m1", name: "Ana" }],
    launches: [],
    launchFilterId: "all",
    setLaunchFilterId: () => {},
    createTask: async () => null,
    isSaving: false,
    upsertTaskInState: () => {},
    pendingCompleteTask: { id: "t1", title: "Llamar", estimatedMinutes: 60 },
    pendingTimeLoggedMinutes: sim.minutosRegistrados,
    confirmCompleteWithTime: async () => true,
    skipTimeAndComplete: async () => true,
    cancelComplete: () => {},
  }),
}));
vi.mock("../log-time-modal", () => ({
  LogTimeModal: (props: Record<string, unknown>) => {
    sim.propsDelModal = props;
    return null;
  },
}));
vi.mock("../workboard-calendar", () => ({ WorkboardCalendar: sim.nada }));
vi.mock("../workboard-kanban", () => ({ WorkboardKanban: sim.nada }));
vi.mock("../workboard-task-detail-dialog", () => ({ WorkboardTaskDetailDialog: sim.nada }));
vi.mock("../workboard-time-report", () => ({ WorkboardTimeReport: sim.nada }));
vi.mock("../workboard-sprint-header", () => ({ WorkboardSprintHeader: sim.nada }));
vi.mock("../workboard-task-resources", () => ({
  WorkboardTaskResources: sim.nada,
  applyDraftTaskResources: async () => null,
}));
vi.mock("@/components/marketing/filter-pills", () => ({ FilterPills: sim.nada }));
import { WorkboardShell } from "../workboard-shell";

describe("WorkboardShell → LogTimeModal", () => {
  it("⭐ le pasa al modal los minutos ya registrados de la confirmación abierta", () => {
    sim.minutosRegistrados = 30;
    renderToStaticMarkup(createElement(WorkboardShell));
    expect(sim.propsDelModal).toMatchObject({ open: true, taskId: "t1", minutosYaRegistrados: 30 });
  });

  it("sin tiempo registrado le pasa null", () => {
    sim.minutosRegistrados = null;
    renderToStaticMarkup(createElement(WorkboardShell));
    expect(sim.propsDelModal).toMatchObject({ minutosYaRegistrados: null });
  });
});
