// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

enum Tier {
    FLAGGED,
    NEW,
    VERIFIED
}

interface ITrustReader {
    function tierOf(address account) external view returns (Tier);
}
