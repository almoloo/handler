//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// AggregatorV3Interface
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const aggregatorV3InterfaceAbi = [
  {
    type: 'function',
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'description',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '_roundId', internalType: 'uint80', type: 'uint80' }],
    name: 'getRoundData',
    outputs: [
      { name: 'roundId', internalType: 'uint80', type: 'uint80' },
      { name: 'answer', internalType: 'int256', type: 'int256' },
      { name: 'startedAt', internalType: 'uint256', type: 'uint256' },
      { name: 'updatedAt', internalType: 'uint256', type: 'uint256' },
      { name: 'answeredInRound', internalType: 'uint80', type: 'uint80' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'latestRoundData',
    outputs: [
      { name: 'roundId', internalType: 'uint80', type: 'uint80' },
      { name: 'answer', internalType: 'int256', type: 'int256' },
      { name: 'startedAt', internalType: 'uint256', type: 'uint256' },
      { name: 'updatedAt', internalType: 'uint256', type: 'uint256' },
      { name: 'answeredInRound', internalType: 'uint80', type: 'uint80' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'version',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// HandlerWallet
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const handlerWalletAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'owner_', internalType: 'address', type: 'address' },
      {
        name: 'trustReader_',
        internalType: 'contract ITrustReader',
        type: 'address',
      },
      {
        name: 'priceConverter_',
        internalType: 'contract IPriceConverter',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
  },
  { type: 'receive', stateMutability: 'payable' },
  {
    type: 'function',
    inputs: [],
    name: 'acceptOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'id', internalType: 'bytes32', type: 'bytes32' }],
    name: 'approve',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'id', internalType: 'bytes32', type: 'bytes32' }],
    name: 'deny',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'call',
        internalType: 'struct HandlerWallet.Call',
        type: 'tuple',
        components: [
          { name: 'target', internalType: 'address', type: 'address' },
          { name: 'data', internalType: 'bytes', type: 'bytes' },
          { name: 'value', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    name: 'execute',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'sessionKey', internalType: 'address', type: 'address' }],
    name: 'freezeAgent',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'sessionKey', internalType: 'address', type: 'address' },
      {
        name: 'policy',
        internalType: 'struct HandlerWallet.AgentPolicy',
        type: 'tuple',
        components: [
          { name: 'dailyCapUsd', internalType: 'uint128', type: 'uint128' },
          { name: 'perTxCapUsd', internalType: 'uint128', type: 'uint128' },
          { name: 'cosignAboveUsd', internalType: 'uint128', type: 'uint128' },
          { name: 'epochStart', internalType: 'uint64', type: 'uint64' },
          { name: 'spentThisEpoch', internalType: 'uint128', type: 'uint128' },
          {
            name: 'minCounterpartyTier',
            internalType: 'enum Tier',
            type: 'uint8',
          },
          { name: 'allowSwaps', internalType: 'bool', type: 'bool' },
          { name: 'allowUnknownContracts', internalType: 'bool', type: 'bool' },
          { name: 'frozen', internalType: 'bool', type: 'bool' },
        ],
      },
    ],
    name: 'hireAgent',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'sessionKey', internalType: 'address', type: 'address' }],
    name: 'isHired',
    outputs: [{ name: 'hired', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'router', internalType: 'address', type: 'address' }],
    name: 'knownRouters',
    outputs: [{ name: 'known', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'id', internalType: 'bytes32', type: 'bytes32' }],
    name: 'pendingApprovals',
    outputs: [
      { name: 'sessionKey', internalType: 'address', type: 'address' },
      { name: 'target', internalType: 'address', type: 'address' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
      { name: 'usdValue', internalType: 'uint128', type: 'uint128' },
      { name: 'resolved', internalType: 'bool', type: 'bool' },
      {
        name: 'kind',
        internalType: 'enum HandlerWallet.CallKind',
        type: 'uint8',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pendingOwner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'sessionKey', internalType: 'address', type: 'address' }],
    name: 'policies',
    outputs: [
      { name: 'dailyCapUsd', internalType: 'uint128', type: 'uint128' },
      { name: 'perTxCapUsd', internalType: 'uint128', type: 'uint128' },
      { name: 'cosignAboveUsd', internalType: 'uint128', type: 'uint128' },
      { name: 'epochStart', internalType: 'uint64', type: 'uint64' },
      { name: 'spentThisEpoch', internalType: 'uint128', type: 'uint128' },
      { name: 'minCounterpartyTier', internalType: 'enum Tier', type: 'uint8' },
      { name: 'allowSwaps', internalType: 'bool', type: 'bool' },
      { name: 'allowUnknownContracts', internalType: 'bool', type: 'bool' },
      { name: 'frozen', internalType: 'bool', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'priceConverter',
    outputs: [
      { name: '', internalType: 'contract IPriceConverter', type: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'call',
        internalType: 'struct HandlerWallet.Call',
        type: 'tuple',
        components: [
          { name: 'target', internalType: 'address', type: 'address' },
          { name: 'data', internalType: 'bytes', type: 'bytes' },
          { name: 'value', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    name: 'propose',
    outputs: [{ name: 'id', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'router', internalType: 'address', type: 'address' },
      { name: 'known', internalType: 'bool', type: 'bool' },
    ],
    name: 'setKnownRouter',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'trustReader',
    outputs: [
      { name: '', internalType: 'contract ITrustReader', type: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'call',
        internalType: 'struct HandlerWallet.Call',
        type: 'tuple',
        components: [
          { name: 'target', internalType: 'address', type: 'address' },
          { name: 'data', internalType: 'bytes', type: 'bytes' },
          { name: 'value', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    name: 'tryExecute',
    outputs: [{ name: 'success', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'sessionKey', internalType: 'address', type: 'address' }],
    name: 'unfreezeAgent',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'sessionKey', internalType: 'address', type: 'address' },
      {
        name: 'policy',
        internalType: 'struct HandlerWallet.AgentPolicy',
        type: 'tuple',
        components: [
          { name: 'dailyCapUsd', internalType: 'uint128', type: 'uint128' },
          { name: 'perTxCapUsd', internalType: 'uint128', type: 'uint128' },
          { name: 'cosignAboveUsd', internalType: 'uint128', type: 'uint128' },
          { name: 'epochStart', internalType: 'uint64', type: 'uint64' },
          { name: 'spentThisEpoch', internalType: 'uint128', type: 'uint128' },
          {
            name: 'minCounterpartyTier',
            internalType: 'enum Tier',
            type: 'uint8',
          },
          { name: 'allowSwaps', internalType: 'bool', type: 'bool' },
          { name: 'allowUnknownContracts', internalType: 'bool', type: 'bool' },
          { name: 'frozen', internalType: 'bool', type: 'bool' },
        ],
      },
    ],
    name: 'updatePolicy',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sessionKey',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'frozen', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'AgentFrozen',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sessionKey',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'policy',
        internalType: 'struct HandlerWallet.AgentPolicy',
        type: 'tuple',
        components: [
          { name: 'dailyCapUsd', internalType: 'uint128', type: 'uint128' },
          { name: 'perTxCapUsd', internalType: 'uint128', type: 'uint128' },
          { name: 'cosignAboveUsd', internalType: 'uint128', type: 'uint128' },
          { name: 'epochStart', internalType: 'uint64', type: 'uint64' },
          { name: 'spentThisEpoch', internalType: 'uint128', type: 'uint128' },
          {
            name: 'minCounterpartyTier',
            internalType: 'enum Tier',
            type: 'uint8',
          },
          { name: 'allowSwaps', internalType: 'bool', type: 'bool' },
          { name: 'allowUnknownContracts', internalType: 'bool', type: 'bool' },
          { name: 'frozen', internalType: 'bool', type: 'bool' },
        ],
        indexed: false,
      },
    ],
    name: 'AgentHired',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'id', internalType: 'bytes32', type: 'bytes32', indexed: true },
    ],
    name: 'Approved',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'id', internalType: 'bytes32', type: 'bytes32', indexed: true },
    ],
    name: 'Denied',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sessionKey',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'target',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'usdValue',
        internalType: 'uint128',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'kind',
        internalType: 'enum HandlerWallet.CallKind',
        type: 'uint8',
        indexed: false,
      },
    ],
    name: 'Executed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sessionKey',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'reason',
        internalType: 'enum HandlerWallet.BlockReason',
        type: 'uint8',
        indexed: false,
      },
      {
        name: 'usdValue',
        internalType: 'uint128',
        type: 'uint128',
        indexed: false,
      },
    ],
    name: 'ExecutionBlocked',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferStarted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sessionKey',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'policy',
        internalType: 'struct HandlerWallet.AgentPolicy',
        type: 'tuple',
        components: [
          { name: 'dailyCapUsd', internalType: 'uint128', type: 'uint128' },
          { name: 'perTxCapUsd', internalType: 'uint128', type: 'uint128' },
          { name: 'cosignAboveUsd', internalType: 'uint128', type: 'uint128' },
          { name: 'epochStart', internalType: 'uint64', type: 'uint64' },
          { name: 'spentThisEpoch', internalType: 'uint128', type: 'uint128' },
          {
            name: 'minCounterpartyTier',
            internalType: 'enum Tier',
            type: 'uint8',
          },
          { name: 'allowSwaps', internalType: 'bool', type: 'bool' },
          { name: 'allowUnknownContracts', internalType: 'bool', type: 'bool' },
          { name: 'frozen', internalType: 'bool', type: 'bool' },
        ],
        indexed: false,
      },
    ],
    name: 'PolicyUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'id', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'sessionKey',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'target',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'usdValue',
        internalType: 'uint128',
        type: 'uint128',
        indexed: false,
      },
    ],
    name: 'Proposed',
  },
  { type: 'error', inputs: [], name: 'AgentIsFrozen' },
  { type: 'error', inputs: [], name: 'AgentNotHired' },
  { type: 'error', inputs: [], name: 'ApprovalAlreadyResolved' },
  { type: 'error', inputs: [], name: 'ApprovalNotFound' },
  {
    type: 'error',
    inputs: [
      { name: 'counterparty', internalType: 'address', type: 'address' },
      { name: 'tier', internalType: 'enum Tier', type: 'uint8' },
      { name: 'required', internalType: 'enum Tier', type: 'uint8' },
    ],
    name: 'CounterpartyBelowTier',
  },
  {
    type: 'error',
    inputs: [
      { name: 'usdValue', internalType: 'uint128', type: 'uint128' },
      { name: 'remaining', internalType: 'uint128', type: 'uint128' },
    ],
    name: 'ExceedsDailyAllowance',
  },
  {
    type: 'error',
    inputs: [
      { name: 'usdValue', internalType: 'uint128', type: 'uint128' },
      { name: 'cap', internalType: 'uint128', type: 'uint128' },
    ],
    name: 'ExceedsPerTxCap',
  },
  { type: 'error', inputs: [], name: 'InvalidTarget' },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [{ name: 'id', internalType: 'bytes32', type: 'bytes32' }],
    name: 'RequiresCosign',
  },
  { type: 'error', inputs: [], name: 'SwapsNotAllowed' },
  { type: 'error', inputs: [], name: 'TargetIsSessionKey' },
  { type: 'error', inputs: [], name: 'UnknownContractBlocked' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IIdentityRegistry
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iIdentityRegistryAbi = [
  {
    type: 'function',
    inputs: [{ name: 'agentId', internalType: 'uint256', type: 'uint256' }],
    name: 'getAgentWallet',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IMulticall3
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iMulticall3Abi = [
  {
    type: 'function',
    inputs: [
      {
        name: 'calls',
        internalType: 'struct IMulticall3.Call[]',
        type: 'tuple[]',
        components: [
          { name: 'target', internalType: 'address', type: 'address' },
          { name: 'callData', internalType: 'bytes', type: 'bytes' },
        ],
      },
    ],
    name: 'aggregate',
    outputs: [
      { name: 'blockNumber', internalType: 'uint256', type: 'uint256' },
      { name: 'returnData', internalType: 'bytes[]', type: 'bytes[]' },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'calls',
        internalType: 'struct IMulticall3.Call3[]',
        type: 'tuple[]',
        components: [
          { name: 'target', internalType: 'address', type: 'address' },
          { name: 'allowFailure', internalType: 'bool', type: 'bool' },
          { name: 'callData', internalType: 'bytes', type: 'bytes' },
        ],
      },
    ],
    name: 'aggregate3',
    outputs: [
      {
        name: 'returnData',
        internalType: 'struct IMulticall3.Result[]',
        type: 'tuple[]',
        components: [
          { name: 'success', internalType: 'bool', type: 'bool' },
          { name: 'returnData', internalType: 'bytes', type: 'bytes' },
        ],
      },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'calls',
        internalType: 'struct IMulticall3.Call3Value[]',
        type: 'tuple[]',
        components: [
          { name: 'target', internalType: 'address', type: 'address' },
          { name: 'allowFailure', internalType: 'bool', type: 'bool' },
          { name: 'value', internalType: 'uint256', type: 'uint256' },
          { name: 'callData', internalType: 'bytes', type: 'bytes' },
        ],
      },
    ],
    name: 'aggregate3Value',
    outputs: [
      {
        name: 'returnData',
        internalType: 'struct IMulticall3.Result[]',
        type: 'tuple[]',
        components: [
          { name: 'success', internalType: 'bool', type: 'bool' },
          { name: 'returnData', internalType: 'bytes', type: 'bytes' },
        ],
      },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'calls',
        internalType: 'struct IMulticall3.Call[]',
        type: 'tuple[]',
        components: [
          { name: 'target', internalType: 'address', type: 'address' },
          { name: 'callData', internalType: 'bytes', type: 'bytes' },
        ],
      },
    ],
    name: 'blockAndAggregate',
    outputs: [
      { name: 'blockNumber', internalType: 'uint256', type: 'uint256' },
      { name: 'blockHash', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'returnData',
        internalType: 'struct IMulticall3.Result[]',
        type: 'tuple[]',
        components: [
          { name: 'success', internalType: 'bool', type: 'bool' },
          { name: 'returnData', internalType: 'bytes', type: 'bytes' },
        ],
      },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getBasefee',
    outputs: [{ name: 'basefee', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'blockNumber', internalType: 'uint256', type: 'uint256' }],
    name: 'getBlockHash',
    outputs: [{ name: 'blockHash', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getBlockNumber',
    outputs: [
      { name: 'blockNumber', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getChainId',
    outputs: [{ name: 'chainid', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getCurrentBlockCoinbase',
    outputs: [{ name: 'coinbase', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getCurrentBlockDifficulty',
    outputs: [{ name: 'difficulty', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getCurrentBlockGasLimit',
    outputs: [{ name: 'gaslimit', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getCurrentBlockTimestamp',
    outputs: [{ name: 'timestamp', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'addr', internalType: 'address', type: 'address' }],
    name: 'getEthBalance',
    outputs: [{ name: 'balance', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getLastBlockHash',
    outputs: [{ name: 'blockHash', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'requireSuccess', internalType: 'bool', type: 'bool' },
      {
        name: 'calls',
        internalType: 'struct IMulticall3.Call[]',
        type: 'tuple[]',
        components: [
          { name: 'target', internalType: 'address', type: 'address' },
          { name: 'callData', internalType: 'bytes', type: 'bytes' },
        ],
      },
    ],
    name: 'tryAggregate',
    outputs: [
      {
        name: 'returnData',
        internalType: 'struct IMulticall3.Result[]',
        type: 'tuple[]',
        components: [
          { name: 'success', internalType: 'bool', type: 'bool' },
          { name: 'returnData', internalType: 'bytes', type: 'bytes' },
        ],
      },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'requireSuccess', internalType: 'bool', type: 'bool' },
      {
        name: 'calls',
        internalType: 'struct IMulticall3.Call[]',
        type: 'tuple[]',
        components: [
          { name: 'target', internalType: 'address', type: 'address' },
          { name: 'callData', internalType: 'bytes', type: 'bytes' },
        ],
      },
    ],
    name: 'tryBlockAndAggregate',
    outputs: [
      { name: 'blockNumber', internalType: 'uint256', type: 'uint256' },
      { name: 'blockHash', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'returnData',
        internalType: 'struct IMulticall3.Result[]',
        type: 'tuple[]',
        components: [
          { name: 'success', internalType: 'bool', type: 'bool' },
          { name: 'returnData', internalType: 'bytes', type: 'bytes' },
        ],
      },
    ],
    stateMutability: 'payable',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IPriceConverter
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iPriceConverterAbi = [
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'usdValue',
    outputs: [{ name: 'usd8', internalType: 'uint128', type: 'uint128' }],
    stateMutability: 'view',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IReputationRegistry
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iReputationRegistryAbi = [
  {
    type: 'function',
    inputs: [
      { name: 'agentId', internalType: 'uint256', type: 'uint256' },
      { name: 'clientAddresses', internalType: 'address[]', type: 'address[]' },
      { name: 'tag1', internalType: 'string', type: 'string' },
      { name: 'tag2', internalType: 'string', type: 'string' },
      { name: 'includeRevoked', internalType: 'bool', type: 'bool' },
    ],
    name: 'readAllFeedback',
    outputs: [
      { name: 'clients', internalType: 'address[]', type: 'address[]' },
      { name: 'feedbackIndexes', internalType: 'uint64[]', type: 'uint64[]' },
      { name: 'values', internalType: 'int128[]', type: 'int128[]' },
      { name: 'valueDecimals', internalType: 'uint8[]', type: 'uint8[]' },
      { name: 'tag1s', internalType: 'string[]', type: 'string[]' },
      { name: 'tag2s', internalType: 'string[]', type: 'string[]' },
      { name: 'revokedStatuses', internalType: 'bool[]', type: 'bool[]' },
    ],
    stateMutability: 'view',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ITrustReader
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iTrustReaderAbi = [
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'tierOf',
    outputs: [{ name: '', internalType: 'enum Tier', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MockTrustReader
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const mockTrustReaderAbi = [
  {
    type: 'function',
    inputs: [
      { name: 'account', internalType: 'address', type: 'address' },
      { name: 'tier', internalType: 'enum Tier', type: 'uint8' },
    ],
    name: 'setTier',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'tierOf',
    outputs: [{ name: '', internalType: 'enum Tier', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MockV3Aggregator
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const mockV3AggregatorAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'decimals_', internalType: 'uint8', type: 'uint8' },
      { name: 'initialAnswer', internalType: 'int256', type: 'int256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'description',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [{ name: '_roundId', internalType: 'uint80', type: 'uint80' }],
    name: 'getRoundData',
    outputs: [
      { name: 'roundId', internalType: 'uint80', type: 'uint80' },
      { name: 'answer', internalType: 'int256', type: 'int256' },
      { name: 'startedAt', internalType: 'uint256', type: 'uint256' },
      { name: 'updatedAt', internalType: 'uint256', type: 'uint256' },
      { name: 'answeredInRound', internalType: 'uint80', type: 'uint80' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'latestRoundData',
    outputs: [
      { name: 'roundId', internalType: 'uint80', type: 'uint80' },
      { name: 'answer', internalType: 'int256', type: 'int256' },
      { name: 'startedAt', internalType: 'uint256', type: 'uint256' },
      { name: 'updatedAt', internalType: 'uint256', type: 'uint256' },
      { name: 'answeredInRound', internalType: 'uint80', type: 'uint80' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'answer', internalType: 'int256', type: 'int256' }],
    name: 'setAnswer',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'updatedAt', internalType: 'uint256', type: 'uint256' }],
    name: 'setUpdatedAt',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'version',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'pure',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Ownable
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const ownableAbi = [
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Ownable2Step
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const ownable2StepAbi = [
  {
    type: 'function',
    inputs: [],
    name: 'acceptOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pendingOwner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferStarted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PriceConverter
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const priceConverterAbi = [
  {
    type: 'constructor',
    inputs: [{ name: 'owner_', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      {
        name: 'feed',
        internalType: 'contract AggregatorV3Interface',
        type: 'address',
      },
      { name: 'tokenDecimals', internalType: 'uint8', type: 'uint8' },
      { name: 'maxStaleness', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'setFeed',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'usdValue',
    outputs: [{ name: 'usd8', internalType: 'uint128', type: 'uint128' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'feed',
        internalType: 'contract AggregatorV3Interface',
        type: 'address',
        indexed: true,
      },
      {
        name: 'tokenDecimals',
        internalType: 'uint8',
        type: 'uint8',
        indexed: false,
      },
      {
        name: 'maxStaleness',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'FeedSet',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'FeedNotSet',
  },
  {
    type: 'error',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'answer', internalType: 'int256', type: 'int256' },
    ],
    name: 'InvalidPrice',
  },
  {
    type: 'error',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'updatedAt', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InvalidRoundTimestamp',
  },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
  {
    type: 'error',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'updatedAt', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'StalePrice',
  },
  {
    type: 'error',
    inputs: [{ name: 'usd8', internalType: 'uint256', type: 'uint256' }],
    name: 'UsdValueOverflow',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ReentrancyGuard
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const reentrancyGuardAbi = [
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// TrustReader
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const trustReaderAbi = [
  {
    type: 'constructor',
    inputs: [
      {
        name: 'identityRegistry_',
        internalType: 'contract IIdentityRegistry',
        type: 'address',
      },
      {
        name: 'reputationRegistry_',
        internalType: 'contract IReputationRegistry',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'VERIFIED_MIN_FEEDBACK_COUNT',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'VERIFIED_MIN_SCORE_WAD',
    outputs: [{ name: '', internalType: 'int256', type: 'int256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'identityRegistry',
    outputs: [
      { name: '', internalType: 'contract IIdentityRegistry', type: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'reputationRegistry',
    outputs: [
      {
        name: '',
        internalType: 'contract IReputationRegistry',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'agentId', internalType: 'uint256', type: 'uint256' }],
    name: 'syncAgent',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'tierOf',
    outputs: [{ name: '', internalType: 'enum Tier', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'wallet',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'agentId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
    ],
    name: 'AgentSynced',
  },
] as const
