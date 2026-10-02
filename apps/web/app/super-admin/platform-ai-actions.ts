"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  assertClaudeKeyFormat,
  validateClaudeApiKey,
  validationErrorMessage,
} from "@/lib/ai/validate-claude-key";
import {
  getPlatformClaudeKeyStatus,
  removePlatformClaudeKey,
  savePlatformClaudeKey,
  type PlatformClaudeKeyStatus,
} from "@/lib/ai/platform-credential";
import { maskSecret } from "@/lib/security/encryption";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { paths } from "@/routes";

/**
 * La clave de Claude de la plataforma (trabajo de super-admin). Ver
 * `lib/ai/platform-credential.ts`. Todas las acciones exigen super-admin.
 */

export async function getPlatformClaudeKeyStatusAction(): Promise<PlatformClaudeKeyStatus> {
  await requireSuperAdmin();
  return getPlatformClaudeKeyStatus();
}

export async function savePlatformClaudeKeyAction(
  apiKey: string
): Promise<
  MutationResult<{ maskedKey: string; status: "valid" | "valid_no_credits" }>
> {
  return runMutation(async () => {
    const user = await requireSuperAdmin();
    const trimmed = String(apiKey ?? "").trim();
    assertClaudeKeyFormat(trimmed);

    const validation = await validateClaudeApiKey(trimmed);
    if (!validation.ok) {
      throw new Error(validationErrorMessage(validation.reason));
    }

    await savePlatformClaudeKey(trimmed, validation.status, user.id);
    revalidatePath(paths.superAdmin.infrastructure);
    return { maskedKey: maskSecret(trimmed), status: validation.status };
  });
}

export async function removePlatformClaudeKeyAction(): Promise<MutationResult> {
  return runMutation(async () => {
    const user = await requireSuperAdmin();
    await removePlatformClaudeKey(user.id);
    revalidatePath(paths.superAdmin.infrastructure);
    return undefined;
  });
}
