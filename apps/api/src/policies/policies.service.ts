import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AgentKind,
  ApprovalStatus,
  TrustTier,
} from '../generated/prisma/enums.js';
import { policySentences, type PolicyForSentences } from './policy-sentences.js';

/** USD-8 fixed-point fields as decimal strings, matching every other API
 * boundary in this codebase (no global BigInt.toJSON patch — see
 * trust.service.ts, agents.service.ts). */
export type PayrollAgent = {
  policyId: string;
  sessionKey: string;
  agentId: string;
  name: string;
  avatar: string | null;
  trustTier: TrustTier;
  trustSummary: string;
  dailyCapUsd: string;
  perTxCapUsd: string;
  cosignAboveUsd: string;
  spentTodayUsd: string;
  frozen: boolean;
  allowSwaps: boolean;
  allowUnknownContracts: boolean;
  policySentences: string[];
  hiredAt: string;
  /** Open (still `PENDING`) co-sign requests for this policy — drives the
   * payroll row's "needs your approval" status. Derived from
   * `PendingApproval.status`, never from the `PENDING` ActivityEvent, which
   * stays in the feed forever after the approval resolves. */
  pendingApprovalCount: number;
};

export type CatalogAgent = {
  agentId: string;
  address: string;
  name: string;
  description: string | null;
  avatar: string | null;
  trustTier: TrustTier;
  trustSummary: string;
};

/** `pendingApprovalCount` is payroll-row-only: the agent file renders its own
 * approval state from `recentActivity`, so it isn't part of this shape. */
export type AgentFilePolicy = Omit<
  PayrollAgent,
  | 'name'
  | 'avatar'
  | 'agentId'
  | 'trustTier'
  | 'trustSummary'
  | 'pendingApprovalCount'
>;

export type AgentFile = {
  agentId: string;
  address: string;
  name: string;
  description: string | null;
  avatar: string | null;
  trustTier: TrustTier;
  trustSummary: string;
  policy: AgentFilePolicy | null;
  recentActivity: Array<{
    id: string;
    type: string;
    summary: string;
    amountUsd: string | null;
    txHash: string | null;
    createdAt: string;
  }>;
};

/** The slice of a `Policy` row {@link PoliciesService.toAgentFilePolicy} needs. */
type PolicyFields = PolicyForSentences & {
  id: string;
  sessionKey: string;
  frozen: boolean;
  epochStart: bigint;
  spentThisEpochUsd: bigint;
  hiredAt: Date;
};

const RECENT_ACTIVITY_LIMIT = 20;

/** Read-only mirror of on-chain policy state (backend-roadmap.md §2 module
 * map). Depends on Prisma only — never `ChainModule` — per
 * coding-standards.md's module dependency rule. */
@Injectable()
export class PoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The contract rolls `epochStart` lazily: once `now` is past the 24h
   * window, `spentThisEpochUsd` is stale and must read as 0 until the next
   * on-chain execute() advances the epoch. See the schema comment on
   * `Policy.spentThisEpochUsd`. */
  spentTodayUsd(
    policy: { epochStart: bigint; spentThisEpochUsd: bigint },
    now: Date = new Date(),
  ): bigint {
    const nowSeconds = BigInt(Math.floor(now.getTime() / 1000));
    if (nowSeconds > policy.epochStart + 86_400n) {
      return 0n;
    }
    return policy.spentThisEpochUsd;
  }

  /** Shared shape between `GET /agents` (payroll row) and `GET /agents/:id`
   * (agent file's `policy` field) — everything a `Policy` row contributes,
   * with the agent-derived fields (`name`, `avatar`, `trustTier`, ...) left
   * to each caller. */
  private toAgentFilePolicy(policy: PolicyFields): AgentFilePolicy {
    return {
      policyId: policy.id,
      sessionKey: policy.sessionKey,
      dailyCapUsd: policy.dailyCapUsd.toString(),
      perTxCapUsd: policy.perTxCapUsd.toString(),
      cosignAboveUsd: policy.cosignAboveUsd.toString(),
      spentTodayUsd: this.spentTodayUsd(policy).toString(),
      frozen: policy.frozen,
      allowSwaps: policy.allowSwaps,
      allowUnknownContracts: policy.allowUnknownContracts,
      policySentences: policySentences(policy),
      hiredAt: policy.hiredAt.toISOString(),
    };
  }

  /** Payroll list for the session's wallet (`GET /agents`). */
  async listForWallet(walletAddress: string): Promise<PayrollAgent[]> {
    const policies = await this.prisma.policy.findMany({
      where: { walletAddress },
      include: { agent: true },
      orderBy: { hiredAt: 'asc' },
    });

    // One grouped query for the whole list rather than a count per row.
    const openApprovals = await this.prisma.pendingApproval.groupBy({
      by: ['policyId'],
      where: { walletAddress, status: ApprovalStatus.PENDING },
      _count: { _all: true },
    });
    const openByPolicy = new Map(
      openApprovals.map((group) => [group.policyId, group._count._all]),
    );

    return policies.map((policy) => ({
      ...this.toAgentFilePolicy(policy),
      agentId: policy.agentId,
      name: policy.agent.name,
      avatar: policy.agent.avatar,
      trustTier: policy.agent.trustTier,
      trustSummary: policy.agent.trustSummary,
      pendingApprovalCount: openByPolicy.get(policy.id) ?? 0,
    }));
  }

  /** Hireable catalog agents with their cached trust tier (`GET /agents/catalog`,
   * hire picker step 1). Not wallet-scoped — the catalog is global. */
  async catalog(): Promise<CatalogAgent[]> {
    const agents = await this.prisma.agent.findMany({
      where: { kind: AgentKind.HIRED },
      orderBy: { createdAt: 'asc' },
    });

    return agents.map((agent) => ({
      agentId: agent.id,
      address: agent.address,
      name: agent.name,
      description: agent.description,
      avatar: agent.avatar,
      trustTier: agent.trustTier,
      trustSummary: agent.trustSummary,
    }));
  }

  /** Agent file (`GET /agents/:id`): the agent plus, if this wallet has hired
   * it, its policy sentences and recent activity. `policy: null` (not a 404)
   * means this wallet hasn't hired the agent — browsing an unhired catalog
   * agent's file is a normal path, not an error. */
  async agentFile(
    walletAddress: string | null,
    agentId: string,
  ): Promise<AgentFile> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const policy = walletAddress
      ? await this.prisma.policy.findFirst({
          where: { walletAddress, agentId },
        })
      : null;

    const recentActivity = policy
      ? await this.prisma.activityEvent.findMany({
          where: { walletAddress: policy.walletAddress, agentId },
          orderBy: { seq: 'desc' },
          take: RECENT_ACTIVITY_LIMIT,
        })
      : [];

    return {
      agentId: agent.id,
      address: agent.address,
      name: agent.name,
      description: agent.description,
      avatar: agent.avatar,
      trustTier: agent.trustTier,
      trustSummary: agent.trustSummary,
      policy: policy ? this.toAgentFilePolicy(policy) : null,
      recentActivity: recentActivity.map((event) => ({
        id: event.id,
        type: event.type,
        summary: event.summary,
        amountUsd: event.amountUsd === null ? null : event.amountUsd.toString(),
        txHash: event.txHash,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }
}
