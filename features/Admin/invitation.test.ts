// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  guard: vi.fn(),
  send: vi.fn(),
  notify: vi.fn(),
  revalidate: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  createUser: vi.fn(),
  profileWrite: vi.fn(),
  profileResult: vi.fn(),
}));
vi.mock("@/core/access/admin", () => ({
  requireAdmin: mock.guard,
  requireManageableUser: vi.fn(),
}));
vi.mock("@/lib/webhooks/processor", () => ({ sendEnrollmentEmail: mock.send }));
vi.mock("@/features/Enrollment/notifications", () => ({
  notifyEnrollment: mock.notify,
}));
vi.mock("@/shared/lib/generate-password", () => ({
  generateTempPassword: () => "Fictitious-temporary-password-123!",
}));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { inviteStudentManually } from "./actions";
const userId = "11111111-1111-4111-8111-111111111111";
const levelId = "22222222-2222-4222-8222-222222222222";
const enrollmentId = "33333333-3333-4333-8333-333333333333";
const input = {
  email: "invite@example.test",
  name: "Fictitious learner",
  accessLevelId: levelId,
  expiresAt: null,
  cohortId: null,
  sendWelcomeEmail: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.send.mockResolvedValue({ success: true });
  mock.profileResult.mockResolvedValue({ data: { id: userId }, error: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("External requests are forbidden");
    }),
  );
  mock.createUser.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
  mock.rpc.mockImplementation(async (name: string) =>
    name === "get_user_id_by_email"
      ? { data: null, error: null }
      : { data: { enrollment_id: enrollmentId, created: true }, error: null },
  );
  mock.from.mockImplementation((table: string) => {
    let inserting = false;
    const chain = {
      select: () => chain,
      eq: () => chain,
      update: (value: unknown) => {
        if (table === "profiles") mock.profileWrite(value);
        return chain;
      },
      insert: () => {
        inserting = true;
        return chain;
      },
      single: async () => ({
        data: { id: table === "profiles" ? userId : enrollmentId },
        error: null,
      }),
      maybeSingle: async () =>
        table === "profiles"
          ? mock.profileResult()
          : { data: inserting ? { id: enrollmentId } : null, error: null },
      then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
    };
    return chain;
  });
  mock.guard.mockResolvedValue({
    adminClient: {
      from: mock.from,
      rpc: mock.rpc,
      auth: { admin: { createUser: mock.createUser } },
    },
  });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it("requires a password change before delivering a new temporary password", async () => {
  expect(await inviteStudentManually(input)).toMatchObject({
    success: true,
    invited: true,
  });
  expect(mock.profileWrite).toHaveBeenCalledWith({
    display_name: input.name,
    must_change_password: true,
  });
  expect(mock.profileWrite.mock.invocationCallOrder[0]).toBeLessThan(
    mock.send.mock.invocationCallOrder[0],
  );
});

it("denies a missing administrator before any account lookup or creation", async () => {
  mock.guard.mockRejectedValue(new Error("Forbidden"));
  await expect(inviteStudentManually(input)).rejects.toThrow("Forbidden");
  expect(mock.rpc).not.toHaveBeenCalled();
  expect(mock.createUser).not.toHaveBeenCalled();
  expect(mock.send).not.toHaveBeenCalled();
});
it("fails closed on user lookup error instead of treating it as a new account", async () => {
  mock.rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "lookup unavailable" },
  });
  expect(await inviteStudentManually(input)).toEqual({
    error: "invitationFailed",
  });
  expect(mock.createUser).not.toHaveBeenCalled();
  expect(mock.from).not.toHaveBeenCalled();
  expect(mock.send).not.toHaveBeenCalled();
});
it("does not grant enrollment or send credentials after account creation failure", async () => {
  mock.createUser.mockResolvedValue({
    data: null,
    error: { message: "account creation failed" },
  });
  expect(await inviteStudentManually(input)).toEqual({
    error: "invitationFailed",
  });
  expect(mock.rpc).toHaveBeenCalledTimes(1);
  expect(mock.send).not.toHaveBeenCalled();
});
it.each([
  { data: null, error: null },
  { data: null, error: { message: "profile unavailable" } },
])(
  "does not deliver a temporary password until its profile flag is confirmed (%j)",
  async (response) => {
    mock.profileResult.mockResolvedValue(response);
    expect(await inviteStudentManually(input)).toHaveProperty("error");
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.send).not.toHaveBeenCalled();
    expect(mock.notify).not.toHaveBeenCalled();
  },
);
it("keeps existing credentials unchanged when manually granting an existing account", async () => {
  mock.rpc.mockResolvedValueOnce({ data: userId, error: null });
  expect(await inviteStudentManually(input)).toEqual({
    success: true,
    userId,
    userExisted: true,
    invited: false,
  });
  expect(mock.createUser).not.toHaveBeenCalled();
  expect(mock.profileWrite).not.toHaveBeenCalled();
  expect(mock.send).not.toHaveBeenCalled();
  expect(mock.notify).toHaveBeenCalledExactlyOnceWith({
    userId,
    accessLevelId: levelId,
  });
});
it("does not repeat an existing enrollment notification", async () => {
  mock.rpc
    .mockResolvedValueOnce({ data: userId, error: null })
    .mockResolvedValueOnce({
      data: { enrollment_id: enrollmentId, created: false },
      error: null,
    });
  expect(await inviteStudentManually(input)).toHaveProperty("success", true);
  expect(mock.notify).not.toHaveBeenCalled();
});
it("creates no temporary password or forced flag when welcome email is disabled", async () => {
  expect(
    await inviteStudentManually({ ...input, sendWelcomeEmail: false }),
  ).toMatchObject({ success: true, invited: false });
  expect(mock.createUser).toHaveBeenCalledWith({
    email: input.email,
    email_confirm: true,
    user_metadata: { display_name: input.name, full_name: input.name },
  });
  expect(mock.profileWrite).toHaveBeenCalledExactlyOnceWith({
    display_name: input.name,
  });
  expect(mock.send).not.toHaveBeenCalled();
  expect(mock.notify).not.toHaveBeenCalled();
});
it.each([null, "44444444-4444-4444-8444-444444444444"])(
  "uses one atomic grant, preserving other courses for cohort=%s",
  async (cohortId) => {
    await inviteStudentManually({ ...input, cohortId });
    expect(mock.rpc).toHaveBeenLastCalledWith("apply_manual_enrollment", {
      p_user_id: userId,
      p_access_level_id: levelId,
      p_source: "manual_admin_add",
      p_source_transaction_id: null,
      p_expires_at: null,
      p_cohort_mode: cohortId ? "merge" : "preserve",
      p_cohorts: cohortId ? [{ cohort_id: cohortId, course_id: null }] : [],
    });
    expect(mock.from).toHaveBeenCalledExactlyOnceWith("profiles");
  },
);
it("does not send an invitation or attempt split writes after a grant failure", async () => {
  mock.rpc
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({
      data: null,
      error: { message: "invalid cohort relationship" },
    });
  expect(await inviteStudentManually(input)).toEqual({
    error: "invitationFailed",
  });
  expect(mock.from).toHaveBeenCalledExactlyOnceWith("profiles");
  expect(mock.send).not.toHaveBeenCalled();
  expect(mock.notify).not.toHaveBeenCalled();
  expect(mock.revalidate).not.toHaveBeenCalled();
});
it("requires a confirmed enrollment result before announcing success", async () => {
  mock.rpc
    .mockResolvedValueOnce({ data: userId, error: null })
    .mockResolvedValueOnce({ data: {}, error: null });
  expect(await inviteStudentManually(input)).toHaveProperty("error");
  expect(mock.notify).not.toHaveBeenCalled();
  expect(mock.send).not.toHaveBeenCalled();
});

it("reports an unsent invitation when the transport declines after a successful grant", async () => {
  mock.send.mockResolvedValue({
    success: false,
    error: "Email transport is not configured",
  });
  expect(await inviteStudentManually(input)).toEqual({
    success: true,
    userId,
    userExisted: false,
    invited: false,
  });
  expect(
    mock.rpc.mock.calls.filter(([name]) => name === "apply_manual_enrollment"),
  ).toHaveLength(1);
  expect(mock.notify).toHaveBeenCalledOnce();
});
