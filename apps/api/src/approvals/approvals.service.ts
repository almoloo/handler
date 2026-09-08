import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ApprovalStatus, TrustTier } from '../generated/prisma/enums.js';

export interface ApprovalAgentRef {
  id: string;
  name: string;
  avatar: string | null;
  trustTier: TrustTier;
  trustSummary: string;
}

/**
 * `GET /approvals/:id`'s response shape — the approval sheet's data.
 * Mirrors `apps/web/lib/api.ts`'s `ApprovalDetail`; no shared type package
 * between the two apps yet, so this is hand-kept in sync (same discipline
 * as every other API boundary type in this codebase).
 */
export interface ApprovalDetail {
  id: string;
  status: ApprovalStatus;
  amountUsd: string;
  target: string;
  summary: string;
  decoded: Record<string, unknown>;
  proposedAt: string;
  expiresAt: string | null;
  agent: ApprovalAgentRef;
  counterparty: ApprovalAgentRef | null;
}

function toAgentRef(agent: {
  id: string;
  name: string;
  avatar: string | null;
  trustTier: TrustTier;
  trustSummary: string;
} | null): ApprovalAgentRef | null {
  if (!agent) return null;
  return {
    id: agent.id,
    name: agent.name,
    avatar: agent.avatar,
    trustTier: agent.trustTier,
    trustSummary: agent.trustSummary,
  };
}

@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolves the session's `HandlerWallet` address, or `null` if this owner
   * hasn't hired anyone yet. Deliberately duplicates
   * `AgentsService.walletAddressForOwner`'s query rather than importing
   * `AgentsModule` — that would drag in `ChainModule` transitively, which
   * would break `approvals`'s read/serve-only classification (same pattern
   * `activity.service.ts` documents for the same reason). */
  async walletAddressForOwner(ownerAddress: string): Promise<string | null> {
    const wallet = await this.prisma.wallet.findFirst({
      where: { owner: ownerAddress },
    });
    return wallet?.address ?? null;
  }

  /**
   * One `PendingApproval` for the approval sheet. Throws the identical
   * `NotFoundException` whether the id doesn't exist at all or belongs to a
   * wallet the caller doesn't own — distinguishing the two would leak
   * whether a given approval id exists to someone who doesn't own it.
   */
  async findForWallet(
    walletAddress: string | null,
    id: string,
  ): Promise<ApprovalDetail> {
    const approval = walletAddress
      ? await this.prisma.pendingApproval.findUnique({
          where: { id },
          include: { agent: true, counterparty: true },
        })
      : null;

    if (!approval || approval.walletAddress !== walletAddress) {
      throw new NotFoundException('Approval not found');
    }

    return {
      id: approval.id,
      status: approval.status,
      amountUsd: approval.amountUsd.toString(),
      target: approval.target,
      summary: approval.summary,
      decoded: (approval.decoded ?? {}) as Record<string, unknown>,
      proposedAt: approval.proposedAt.toISOString(),
      expiresAt: approval.expiresAt?.toISOString() ?? null,
      agent: toAgentRef(approval.agent)!,
      counterparty: toAgentRef(approval.counterparty),
    };
  }
}
