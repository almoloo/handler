// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Tier, ITrustReader} from "./interfaces/ITrustReader.sol";
import {IPriceConverter} from "./interfaces/IPriceConverter.sol";

/// @notice One HandlerWallet holds a single owner's funds and the policies for every agent
/// (session key) they've hired. Agents execute through this wallet, never with a raw key.
contract HandlerWallet is Ownable2Step, ReentrancyGuard {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct AgentPolicy {
        uint128 dailyCapUsd; // 8-decimal USD
        uint128 perTxCapUsd; // 8-decimal USD
        uint128 cosignAboveUsd; // 8-decimal USD
        uint64 epochStart; // rolling 24h window anchor
        uint128 spentThisEpoch; // 8-decimal USD
        Tier minCounterpartyTier;
        bool allowSwaps;
        bool allowUnknownContracts;
        bool frozen;
    }

    struct Call {
        address target;
        bytes data;
        uint256 value;
    }

    struct PendingApproval {
        address sessionKey;
        address target;
        bytes data;
        uint256 value;
        uint128 usdValue;
        bool resolved;
    }

    enum CallKind {
        TRANSFER,
        SWAP
    }

    enum BlockReason {
        FROZEN,
        UNKNOWN_CONTRACT,
        SWAPS_NOT_ALLOWED,
        COUNTERPARTY_BELOW_TIER,
        EXCEEDS_PER_TX_CAP,
        EXCEEDS_DAILY_ALLOWANCE
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    ITrustReader public trustReader;
    IPriceConverter public priceConverter;

    mapping(address sessionKey => AgentPolicy policy) public policies;
    mapping(address sessionKey => bool hired) public isHired;
    mapping(address router => bool known) public knownRouters;
    mapping(bytes32 id => PendingApproval approval) public pendingApprovals;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event AgentHired(address indexed sessionKey, AgentPolicy policy);
    event PolicyUpdated(address indexed sessionKey, AgentPolicy policy);
    event AgentFrozen(address indexed sessionKey, bool frozen);
    event Executed(address indexed sessionKey, address indexed target, uint128 usdValue, CallKind kind);
    event ExecutionBlocked(address indexed sessionKey, BlockReason reason, uint128 usdValue);
    event Proposed(bytes32 indexed id, address indexed sessionKey, address target, uint256 value, uint128 usdValue);
    event Approved(bytes32 indexed id);
    event Denied(bytes32 indexed id);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error AgentNotHired();
    error TargetIsSessionKey();
    error InvalidTarget();
    error AgentIsFrozen();
    error UnknownContractBlocked();
    error SwapsNotAllowed();
    error CounterpartyBelowTier(address counterparty, Tier tier, Tier required);
    error ExceedsPerTxCap(uint128 usdValue, uint128 cap);
    error ExceedsDailyAllowance(uint128 usdValue, uint128 remaining);
    error RequiresCosign(bytes32 id);
    error ApprovalNotFound();
    error ApprovalAlreadyResolved();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(address owner_, ITrustReader trustReader_, IPriceConverter priceConverter_) Ownable(owner_) {
        trustReader = trustReader_;
        priceConverter = priceConverter_;
    }

    /// @notice Lets the owner fund the wallet with native ETH.
    receive() external payable {}

    modifier onlySession() {
        if (!isHired[msg.sender]) revert AgentNotHired();
        _;
    }

    // ---------------------------------------------------------------------
    // Agent management (onlyOwner)
    // ---------------------------------------------------------------------

    function hireAgent(address sessionKey, AgentPolicy calldata policy) external onlyOwner {
        AgentPolicy memory p = policy;
        p.epochStart = uint64(block.timestamp);
        p.spentThisEpoch = 0;
        p.frozen = false;

        isHired[sessionKey] = true;
        policies[sessionKey] = p;
        emit AgentHired(sessionKey, p);
    }

    function updatePolicy(address sessionKey, AgentPolicy calldata policy) external onlyOwner {
        if (!isHired[sessionKey]) revert AgentNotHired();

        AgentPolicy memory existing = policies[sessionKey];
        AgentPolicy memory p = policy;
        // A policy update changes limits/permissions, not epoch accounting or freeze state.
        p.epochStart = existing.epochStart;
        p.spentThisEpoch = existing.spentThisEpoch;
        p.frozen = existing.frozen;

        policies[sessionKey] = p;
        emit PolicyUpdated(sessionKey, p);
    }

    function freezeAgent(address sessionKey) external onlyOwner {
        if (!isHired[sessionKey]) revert AgentNotHired();
        policies[sessionKey].frozen = true;
        emit AgentFrozen(sessionKey, true);
    }

    function unfreezeAgent(address sessionKey) external onlyOwner {
        if (!isHired[sessionKey]) revert AgentNotHired();
        policies[sessionKey].frozen = false;
        emit AgentFrozen(sessionKey, false);
    }

    function setKnownRouter(address router, bool known) external onlyOwner {
        knownRouters[router] = known;
    }

    // ---------------------------------------------------------------------
    // Execution (onlySession)
    // ---------------------------------------------------------------------

    /// @dev Result of running the check pipeline (contracts-roadmap §2.1 steps 1-6) without
    /// mutating storage, so both `execute()` and `tryExecute()` can share one implementation
    /// of the check order and only differ in how they react to the outcome.
    struct EvalResult {
        bool ok;
        bool requiresCosign;
        BlockReason reason; // meaningless when ok is true
        CallKind kind;
        uint128 usdValue;
        uint128 perTxCapUsd;
        uint128 dailyCapUsd;
        uint64 rolledEpochStart;
        uint128 rolledSpent; // spend already counted in the (possibly rolled) epoch, before this tx
        uint128 remaining; // dailyCapUsd - rolledSpent, floored at 0
        Tier counterpartyTier;
        Tier requiredTier;
    }

    /// @dev The lazy 24h epoch roll, shared by `_evaluate()` and `approve()` so the rule lives
    /// in exactly one place.
    function _rollEpoch(AgentPolicy memory policy)
        internal
        view
        returns (uint64 rolledEpochStart, uint128 rolledSpent)
    {
        rolledEpochStart = policy.epochStart;
        rolledSpent = policy.spentThisEpoch;
        if (block.timestamp > uint256(policy.epochStart) + 1 days) {
            rolledEpochStart = uint64(block.timestamp);
            rolledSpent = 0;
        }
    }

    function _evaluate(address sessionKey, Call calldata call) internal view returns (EvalResult memory r) {
        AgentPolicy memory policy = policies[sessionKey];
        r.perTxCapUsd = policy.perTxCapUsd;
        r.dailyCapUsd = policy.dailyCapUsd;
        r.requiredTier = policy.minCounterpartyTier;

        // 1. Frozen.
        if (policy.frozen) {
            r.reason = BlockReason.FROZEN;
            return r;
        }

        // 2. Target classification: plain transfer, known router (swap), or unknown contract.
        if (call.data.length == 0) {
            r.kind = CallKind.TRANSFER;
        } else if (knownRouters[call.target]) {
            r.kind = CallKind.SWAP;
            if (!policy.allowSwaps) {
                r.reason = BlockReason.SWAPS_NOT_ALLOWED;
                return r;
            }
        } else {
            r.kind = CallKind.TRANSFER;
            if (!policy.allowUnknownContracts) {
                r.reason = BlockReason.UNKNOWN_CONTRACT;
                return r;
            }
        }

        // 3. Counterparty trust tier.
        r.counterpartyTier = trustReader.tierOf(call.target);
        if (uint8(r.counterpartyTier) < uint8(policy.minCounterpartyTier)) {
            r.reason = BlockReason.COUNTERPARTY_BELOW_TIER;
            return r;
        }

        // 4. USD valuation vs. per-tx cap.
        // Simplification: values native ETH only (`call.value`). ERC-20/swap valuation
        // (decoding the transfer/swap calldata) is deferred to the real 1inch integration.
        r.usdValue = priceConverter.usdValue(address(0), call.value);
        if (r.usdValue > policy.perTxCapUsd) {
            r.reason = BlockReason.EXCEEDS_PER_TX_CAP;
            return r;
        }

        // 5. Lazy epoch roll vs. daily allowance.
        (r.rolledEpochStart, r.rolledSpent) = _rollEpoch(policy);
        r.remaining = r.rolledSpent >= policy.dailyCapUsd ? 0 : policy.dailyCapUsd - r.rolledSpent;
        if (r.usdValue > r.remaining) {
            r.reason = BlockReason.EXCEEDS_DAILY_ALLOWANCE;
            return r;
        }

        // 6. Cosign threshold.
        if (r.usdValue > policy.cosignAboveUsd) {
            r.requiresCosign = true;
            return r;
        }

        r.ok = true;
    }

    /// @dev Effects-before-interaction: commits the epoch roll + spend, emits `Executed`,
    /// then performs the external call. Reverts (bubbling the inner revert reason) on failure.
    function _commitAndCall(address sessionKey, Call calldata call, EvalResult memory r) internal {
        policies[sessionKey].epochStart = r.rolledEpochStart;
        policies[sessionKey].spentThisEpoch = r.rolledSpent + r.usdValue;

        emit Executed(sessionKey, call.target, r.usdValue, r.kind);

        (bool success, bytes memory returndata) = call.target.call{value: call.value}(call.data);
        if (!success) {
            assembly {
                revert(add(returndata, 32), mload(returndata))
            }
        }
    }

    /// @dev Reverts with the custom error matching `reason`. Shared by `execute()` (any
    /// blocked check fails the tx) and `propose()` (a genuine policy block, as opposed to
    /// merely requiring cosign, also fails the tx — you can't queue a payment that already
    /// violates policy).
    function _revertForBlockReason(BlockReason reason, EvalResult memory r, address target) internal pure {
        if (reason == BlockReason.FROZEN) revert AgentIsFrozen();
        if (reason == BlockReason.UNKNOWN_CONTRACT) revert UnknownContractBlocked();
        if (reason == BlockReason.SWAPS_NOT_ALLOWED) revert SwapsNotAllowed();
        if (reason == BlockReason.COUNTERPARTY_BELOW_TIER) {
            revert CounterpartyBelowTier(target, r.counterpartyTier, r.requiredTier);
        }
        if (reason == BlockReason.EXCEEDS_PER_TX_CAP) revert ExceedsPerTxCap(r.usdValue, r.perTxCapUsd);
        revert ExceedsDailyAllowance(r.usdValue, r.remaining);
    }

    function execute(Call calldata call) external nonReentrant onlySession {
        if (call.target == msg.sender) revert TargetIsSessionKey();
        if (call.target == address(0)) revert InvalidTarget();

        EvalResult memory r = _evaluate(msg.sender, call);
        if (!r.ok) {
            // No pending-approval id exists yet at this point — `execute()` only tells the
            // caller cosign is required; the real id is minted by actually calling `propose()`.
            if (r.requiresCosign) revert RequiresCosign(bytes32(0));
            _revertForBlockReason(r.reason, r, call.target);
        }

        _commitAndCall(msg.sender, call, r);
    }

    /// @dev Same check pipeline as `execute()`, but never reverts on a policy failure: a
    /// blocked attempt emits `ExecutionBlocked` and returns false so it's indexable as a
    /// real, successful transaction. An over-cosign-threshold call auto-routes to the
    /// pending-approval queue instead of blocking.
    function tryExecute(Call calldata call) external nonReentrant onlySession returns (bool success) {
        if (call.target == msg.sender) revert TargetIsSessionKey();
        if (call.target == address(0)) revert InvalidTarget();

        EvalResult memory r = _evaluate(msg.sender, call);

        if (r.requiresCosign) {
            _propose(msg.sender, call, r.usdValue);
            return false;
        }

        if (!r.ok) {
            emit ExecutionBlocked(msg.sender, r.reason, r.usdValue);
            return false;
        }

        _commitAndCall(msg.sender, call, r);
        return true;
    }

    // ---------------------------------------------------------------------
    // Cosign queue
    // ---------------------------------------------------------------------

    uint256 private _proposalNonce;

    function _propose(address sessionKey, Call calldata call, uint128 usdValue) internal returns (bytes32 id) {
        id = keccak256(abi.encode(sessionKey, call.target, call.data, call.value, usdValue, _proposalNonce++));
        pendingApprovals[id] = PendingApproval({
            sessionKey: sessionKey,
            target: call.target,
            data: call.data,
            value: call.value,
            usdValue: usdValue,
            resolved: false
        });
        emit Proposed(id, sessionKey, call.target, call.value, usdValue);
    }

    /// @notice Explicitly queue a call for owner approval. Valid whenever the call would pass
    /// every check except (optionally) the cosign threshold — a call already blocked for a
    /// real policy reason cannot be queued around that reason.
    function propose(Call calldata call) external onlySession returns (bytes32 id) {
        if (call.target == msg.sender) revert TargetIsSessionKey();
        if (call.target == address(0)) revert InvalidTarget();

        EvalResult memory r = _evaluate(msg.sender, call);
        if (!r.ok && !r.requiresCosign) {
            _revertForBlockReason(r.reason, r, call.target);
        }

        id = _propose(msg.sender, call, r.usdValue);
    }

    function approve(bytes32 id) external nonReentrant onlyOwner {
        PendingApproval memory approval = pendingApprovals[id];
        if (approval.sessionKey == address(0)) revert ApprovalNotFound();
        if (approval.resolved) revert ApprovalAlreadyResolved();

        AgentPolicy memory policy = policies[approval.sessionKey];
        (uint64 rolledEpochStart, uint128 rolledSpent) = _rollEpoch(policy);
        uint128 newSpent = rolledSpent + approval.usdValue;
        uint128 remaining = rolledSpent >= policy.dailyCapUsd ? 0 : policy.dailyCapUsd - rolledSpent;
        // Re-checked at approval time (not just at propose time) so the invariant
        // spentThisEpoch <= dailyCapUsd holds regardless of how much time, or how many other
        // transactions, passed while this approval was pending.
        if (newSpent > policy.dailyCapUsd) {
            revert ExceedsDailyAllowance(approval.usdValue, remaining);
        }

        // Effects before interaction.
        pendingApprovals[id].resolved = true;
        policies[approval.sessionKey].epochStart = rolledEpochStart;
        policies[approval.sessionKey].spentThisEpoch = newSpent;

        emit Approved(id);
        emit Executed(approval.sessionKey, approval.target, approval.usdValue, CallKind.TRANSFER);

        (bool success, bytes memory returndata) = approval.target.call{value: approval.value}(approval.data);
        if (!success) {
            assembly {
                revert(add(returndata, 32), mload(returndata))
            }
        }
    }

    function deny(bytes32 id) external onlyOwner {
        PendingApproval memory approval = pendingApprovals[id];
        if (approval.sessionKey == address(0)) revert ApprovalNotFound();
        if (approval.resolved) revert ApprovalAlreadyResolved();

        pendingApprovals[id].resolved = true;
        emit Denied(id);
    }
}
