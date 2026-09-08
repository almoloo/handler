import { describe, expect, it, vi } from 'vitest';
import { ApprovalsService } from './approvals.service.js';
import { ApprovalStatus, TrustTier } from '../generated/prisma/enums.js';

function makeService(pendingApprovalFindUnique: unknown) {
  const prisma = {
    pendingApproval: { findUnique: pendingApprovalFindUnique },
  };
  return new ApprovalsService(prisma as never);
}

const BASE_ROW = {
  id: '0xapproval',
  walletAddress: '0xwallet',
  status: ApprovalStatus.PENDING,
  amountUsd: 120_00000000n,
  target: '0xtarget',
  summary: 'Riley wants to pay Atlas $120 for data labeling.',
  decoded: { route: 'direct' },
  proposedAt: new Date('2026-09-08T00:00:00.000Z'),
  expiresAt: null,
  agent: {
    id: 'agent-1',
    name: 'Riley',
    avatar: null,
    trustTier: TrustTier.VERIFIED,
    trustSummary: 'Verified — 214 attested jobs',
  },
  counterparty: null,
};

describe('ApprovalsService.findForWallet', () => {
  it('returns the mapped detail for a row owned by the caller wallet', async () => {
    const service = makeService(vi.fn().mockResolvedValue(BASE_ROW));
    const result = await service.findForWallet('0xwallet', '0xapproval');
    expect(result).toEqual({
      id: '0xapproval',
      status: ApprovalStatus.PENDING,
      amountUsd: '12000000000',
      target: '0xtarget',
      summary: 'Riley wants to pay Atlas $120 for data labeling.',
      decoded: { route: 'direct' },
      proposedAt: '2026-09-08T00:00:00.000Z',
      expiresAt: null,
      agent: {
        id: 'agent-1',
        name: 'Riley',
        avatar: null,
        trustTier: TrustTier.VERIFIED,
        trustSummary: 'Verified — 214 attested jobs',
      },
      counterparty: null,
    });
  });

  it('throws NotFoundException when the row belongs to a different wallet', async () => {
    const service = makeService(vi.fn().mockResolvedValue(BASE_ROW));
    await expect(
      service.findForWallet('0xsomeone-else', '0xapproval'),
    ).rejects.toThrow(/not found/i);
  });

  it('throws NotFoundException when no row matches the id', async () => {
    const service = makeService(vi.fn().mockResolvedValue(null));
    await expect(
      service.findForWallet('0xwallet', '0xmissing'),
    ).rejects.toThrow(/not found/i);
  });

  it('throws NotFoundException without querying when the caller has no wallet yet', async () => {
    const findUnique = vi.fn();
    const service = makeService(findUnique);
    await expect(service.findForWallet(null, '0xapproval')).rejects.toThrow(
      /not found/i,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });
});
