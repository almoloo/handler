// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {HandlerWallet} from "./HandlerWallet.sol";
import {ITrustReader} from "./interfaces/ITrustReader.sol";
import {IPriceConverter} from "./interfaces/IPriceConverter.sol";

/// @notice Deploys one HandlerWallet per owner via CREATE2, so the frontend can precompute a
/// wallet's address before the owner ever signs a deploy tx. Every wallet the factory creates
/// shares this factory's TrustReader/PriceConverter. Deliberately permissionless: `createWallet`
/// can be called by anyone for any `owner`, since the resulting wallet is fully controlled by
/// `owner` via Ownable2Step regardless of who paid gas to deploy it.
contract HandlerWalletFactory {
    ITrustReader public immutable trustReader;
    IPriceConverter public immutable priceConverter;

    mapping(address owner => address wallet) public walletOf;

    error WalletAlreadyExists(address owner, address wallet);

    event WalletCreated(address indexed owner, address indexed wallet);

    constructor(ITrustReader trustReader_, IPriceConverter priceConverter_) {
        trustReader = trustReader_;
        priceConverter = priceConverter_;
    }

    function createWallet(address owner) external returns (address wallet) {
        address existing = walletOf[owner];
        if (existing != address(0)) revert WalletAlreadyExists(owner, existing);

        bytes32 salt = _salt(owner);
        bytes memory creationCode = _creationCode(owner);

        // Effects before the external CREATE2 call: predict the address and record/emit it
        // first, so a revert inside deploy (or, in principle, any future constructor call it
        // makes) can't observe a half-updated walletOf. If deploy reverts, this whole tx —
        // including this state write — unwinds with it.
        wallet = Create2.computeAddress(salt, keccak256(creationCode));
        walletOf[owner] = wallet;
        emit WalletCreated(owner, wallet);

        Create2.deploy(0, salt, creationCode);
    }

    function computeWalletAddress(address owner) external view returns (address) {
        return Create2.computeAddress(_salt(owner), keccak256(_creationCode(owner)));
    }

    function _salt(address owner) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner));
    }

    function _creationCode(address owner) private view returns (bytes memory) {
        return abi.encodePacked(type(HandlerWallet).creationCode, abi.encode(owner, trustReader, priceConverter));
    }
}
