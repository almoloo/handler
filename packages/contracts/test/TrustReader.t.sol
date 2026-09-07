// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {TrustReader} from "../src/TrustReader.sol";
import {Tier} from "../src/interfaces/ITrustReader.sol";

contract TrustReaderTest is Test {
    TrustReader trustReader;

    address owner = makeAddr("owner");
    address agent = makeAddr("agent");

    function setUp() public {
        vm.prank(owner);
        trustReader = new TrustReader(owner);
    }

    function test_UnregisteredAddressDefaultsToFlagged() public view {
        assertEq(uint8(trustReader.tierOf(agent)), uint8(Tier.FLAGGED));
    }

    function test_SetOverride_UpdatesTierOf() public {
        vm.prank(owner);
        trustReader.setOverride(agent, Tier.VERIFIED);
        assertEq(uint8(trustReader.tierOf(agent)), uint8(Tier.VERIFIED));
    }

    function test_SetOverride_RevertsForNonOwner() public {
        vm.expectRevert();
        trustReader.setOverride(agent, Tier.VERIFIED);
    }
}
