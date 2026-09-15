import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  notify: vi.fn(),
  revalidate: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/core/access/admin", () => ({ requireAdmin: mock.requireAdmin }));
vi.mock("@/features/Enrollment/notifications", () => ({
  notifyEnrollment: mock.notify,
}));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import {
  deactivateEnrollment,
  enrollUser,
  reactivateEnrollment,
} from "./actions";

type Response = { data?: unknown; error: { message: string } | null };
let replies: Response[];
let writes: Array<{ table: string; operation: string; value?: unknown }>;
let from: ReturnType<typeof vi.fn>;
const input = {
  userId: "11111111-1111-4111-8111-111111111111",
  accessLevelId: "22222222-2222-4222-8222-222222222222",
  source: "manual",
};
const enrollmentId = "33333333-3333-4333-8333-333333333333";
const courseId = "44444444-4444-4444-8444-444444444444";
const cohortId = "55555555-5555-4555-8555-555555555555";
beforeEach(() => {
  vi.resetAllMocks();
  replies = [];
  writes = [];
  from = vi.fn((table: string) => {
    const builder = {
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update(value: unknown) {
        writes.push({ table, operation: "update", value });
        return this;
      },
      maybeSingle: async () =>
        replies.shift() ?? { data: { id: enrollmentId }, error: null },
      then: (resolve: (value: Response) => unknown) =>
        resolve(replies.shift() ?? { error: null }),
    };
    return builder;
  });
  mock.rpc.mockResolvedValue({
    data: { enrollment_id: enrollmentId, created: true },
    error: null,
  });
  mock.requireAdmin.mockResolvedValue({ adminClient: { from, rpc: mock.rpc } });
});

describe("enrollment administration", () => {
  it.each([
    ["enroll", () => enrollUser(input)],
    ["deactivate", () => deactivateEnrollment(enrollmentId)],
    ["reactivate", () => reactivateEnrollment(enrollmentId)],
  ] as const)(
    "does not write when the guard denies %s",
    async (_name, action) => {
      mock.requireAdmin.mockRejectedValue(new Error("Forbidden"));
      await expect(action()).rejects.toThrow("Forbidden");
      expect(from).not.toHaveBeenCalled();
      expect(mock.rpc).not.toHaveBeenCalled();
      expect(mock.notify).not.toHaveBeenCalled();
    },
  );

  it.each([
    [false, deactivateEnrollment],
    [true, reactivateEnrollment],
  ] as const)(
    "uses the guarded administrative client to set active=%s",
    async (active, action) => {
      await expect(action(enrollmentId)).resolves.toEqual({ success: true });
      expect(writes).toEqual([
        {
          table: "enrollments",
          operation: "update",
          value: { is_active: active, updated_at: expect.any(String) },
        },
      ]);
      expect(mock.revalidate).toHaveBeenCalledWith("/admin/enrollments");
    },
  );

  it("grants a new enrollment through one transaction and then notifies", async () => {
    expect(await enrollUser(input)).toEqual({
      success: true,
      data: { id: enrollmentId, upserted: false },
    });
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith(
      "apply_manual_enrollment",
      {
        p_user_id: input.userId,
        p_access_level_id: input.accessLevelId,
        p_source: "manual",
        p_source_transaction_id: null,
        p_expires_at: null,
        p_cohort_mode: "preserve",
        p_cohorts: [],
      },
    );
    expect(from).not.toHaveBeenCalled();
    expect(mock.notify).toHaveBeenCalledExactlyOnceWith({
      userId: input.userId,
      accessLevelId: input.accessLevelId,
    });
    expect(mock.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mock.notify.mock.invocationCallOrder[0],
    );
  });

  it("does not notify an existing enrollment and keeps explicit expiry and transaction", async () => {
    mock.rpc.mockResolvedValue({
      data: { enrollment_id: enrollmentId, created: false },
      error: null,
    });
    expect(
      await enrollUser({
        ...input,
        expiresAt: "2027-01-01",
        sourceTransactionId: "manual-reference",
      }),
    ).toMatchObject({ data: { upserted: true } });
    expect(mock.rpc).toHaveBeenCalledWith(
      "apply_manual_enrollment",
      expect.objectContaining({
        p_expires_at: "2027-01-01",
        p_source_transaction_id: "manual-reference",
      }),
    );
    expect(mock.notify).not.toHaveBeenCalled();
  });

  it.each([{ assignments: [] }, { assignments: [{ courseId, cohortId }] }])(
    "replaces cohorts only when an explicit array is provided (%j)",
    async ({ assignments: cohortAssignments }) => {
      await enrollUser({ ...input, cohortAssignments });
      expect(mock.rpc).toHaveBeenCalledWith(
        "apply_manual_enrollment",
        expect.objectContaining({
          p_cohort_mode: "replace",
          p_cohorts: cohortAssignments.map((a) => ({
            course_id: a.courseId,
            cohort_id: a.cohortId,
          })),
        }),
      );
      expect(from).not.toHaveBeenCalled();
    },
  );

  it.each([
    "cohort insert rejected",
    "migration missing",
    "database unavailable",
  ])(
    "does not fall back to partial writes or notify when the transaction fails: %s",
    async (message) => {
      mock.rpc.mockResolvedValue({ data: null, error: { message } });
      expect(
        await enrollUser({
          ...input,
          cohortAssignments: [{ courseId, cohortId }],
        }),
      ).toEqual({ error: "enrollmentFailed" });
      expect(from).not.toHaveBeenCalled();
      expect(writes).toEqual([]);
      expect(mock.notify).not.toHaveBeenCalled();
      expect(mock.revalidate).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    {},
    { enrollment_id: "invalid", created: true },
    { enrollment_id: enrollmentId },
  ])("does not announce an unconfirmed RPC result %j", async (data) => {
    mock.rpc.mockResolvedValue({ data, error: null });
    expect(await enrollUser(input)).toHaveProperty("error");
    expect(mock.notify).not.toHaveBeenCalled();
  });

  it("rejects invalid input before any database mutation", async () => {
    expect(await enrollUser({ ...input, userId: "invalid" })).toHaveProperty(
      "error",
    );
    expect(
      await enrollUser({
        ...input,
        cohortAssignments: [{ courseId, cohortId: "invalid" }],
      }),
    ).toHaveProperty("error");
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("does not announce a status change when no enrollment row was affected", async () => {
    replies.push({ data: null, error: null });
    await expect(deactivateEnrollment(enrollmentId)).resolves.toEqual({
      error: "enrollmentFailed",
    });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
});
