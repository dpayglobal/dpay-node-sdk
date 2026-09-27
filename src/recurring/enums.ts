/**
 * Model of a recurring payment:
 * - `O` (open): no frequency or limits, the merchant charges any amount within its active ranges (max 2000 PLN);
 * - `A` (automatic): fixed amount, frequency, total limit, start and expiry date - all required;
 * - `M` (manual): every charge is confirmed by the customer in the banking app; frequency and limits optional.
 */
export const RecurringModel = { A: 'A', M: 'M', O: 'O' } as const

export type RecurringModel = (typeof RecurringModel)[keyof typeof RecurringModel]

/** Payment method of a recurring payment. Today only BLIK. */
export const RecurringMethod = { BLIK: 'blik' } as const

export type RecurringMethod = (typeof RecurringMethod)[keyof typeof RecurringMethod]

/** Status of a recurring payment (its alias). `INACTIVE` waits for the customer's confirmation. */
export const RecurringAliasStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  UNREGISTERED: 'UNREGISTERED',
  EXPIRED: 'EXPIRED',
  DECLINED: 'DECLINED',
} as const

export type RecurringAliasStatus = (typeof RecurringAliasStatus)[keyof typeof RecurringAliasStatus]

/**
 * Outcome of retrying a declined charge: `pending` - the retry went to the bank, the result comes like for a
 * charge; `failed` - the bank declined it at once.
 */
export const RecurringRetryStatus = { PENDING: 'pending', FAILED: 'failed', SUCCESS: 'success' } as const

export type RecurringRetryStatus = (typeof RecurringRetryStatus)[keyof typeof RecurringRetryStatus]
