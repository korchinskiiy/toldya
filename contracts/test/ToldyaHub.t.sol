// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ToldyaHub} from "../src/ToldyaHub.sol";
import {MockToken} from "../src/mocks/MockToken.sol";

contract ToldyaHubTest is Test {
    ToldyaHub hub;
    MockToken token;

    address oracle = makeAddr("oracle");
    address treasury = makeAddr("treasury");
    address rob = makeAddr("rob");
    address tom = makeAddr("tom");
    address sam = makeAddr("sam");

    uint256 constant START = 1_000_000;
    uint256 constant DEADLINE_OFFSET = 1 days;

    function setUp() public {
        token = new MockToken();
        hub = new ToldyaHub(token, oracle, treasury);

        vm.warp(START);

        address[3] memory users = [rob, tom, sam];
        for (uint256 i = 0; i < users.length; i++) {
            token.mint(users[i], 1_000 ether);
            vm.prank(users[i]);
            token.approve(address(hub), type(uint256).max);
        }
    }

    function _create(address creator, ToldyaHub.Side side, uint256 amount) internal returns (uint256) {
        vm.prank(creator);
        return hub.createMarket(
            "Will Tom finish a beer in 30s?",
            "Tom drinks a 0.5L beer; timer starts at first sip; YES if empty within 30s.",
            uint64(block.timestamp + DEADLINE_OFFSET),
            side,
            amount
        );
    }

    // -----------------------------------------------------------------
    // Creation
    // -----------------------------------------------------------------

    function test_createMarket_chargesFee() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        ToldyaHub.Market memory m = hub.getMarket(id);
        assertEq(m.creator, rob);
        assertEq(m.noPool, 99 ether, "net stake = 100 - 1% fee");
        assertEq(m.yesPool, 0);
        assertEq(token.balanceOf(treasury), 1 ether);
        assertEq(token.balanceOf(address(hub)), 99 ether);
    }

    function test_createMarket_revertsOnPastDeadline() public {
        vm.expectRevert(ToldyaHub.InvalidDeadline.selector);
        vm.prank(rob);
        hub.createMarket("q", "c", uint64(block.timestamp), ToldyaHub.Side.Yes, 10 ether);
    }

    function test_createMarket_revertsOnEmptyQuestion() public {
        vm.expectRevert(ToldyaHub.EmptyQuestion.selector);
        vm.prank(rob);
        hub.createMarket("", "c", uint64(block.timestamp + 1 days), ToldyaHub.Side.Yes, 10 ether);
    }

    function test_createMarket_revertsBelowMinStake() public {
        vm.expectRevert(ToldyaHub.StakeTooSmall.selector);
        vm.prank(rob);
        hub.createMarket("q", "c", uint64(block.timestamp + 1 days), ToldyaHub.Side.Yes, 1);
    }

    // -----------------------------------------------------------------
    // Staking
    // -----------------------------------------------------------------

    function test_stake_addsToPool() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);

        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);

        ToldyaHub.Market memory m = hub.getMarket(id);
        assertEq(m.yesPool, 49.5 ether);
        assertEq(m.noPool, 99 ether);
        assertEq(hub.yesStake(id, tom), 49.5 ether);
    }

    function test_stake_revertsAfterDeadline() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        vm.expectRevert(ToldyaHub.DeadlinePassed.selector);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 10 ether);
    }

    function test_stake_multipleTimesAccumulates() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.startPrank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 30 ether);
        hub.stake(id, ToldyaHub.Side.Yes, 20 ether);
        vm.stopPrank();
        assertEq(hub.yesStake(id, tom), 49.5 ether);
    }

    // -----------------------------------------------------------------
    // Resolution
    // -----------------------------------------------------------------

    function test_triggerResolution_revertsBeforeDeadline() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.expectRevert(ToldyaHub.DeadlineNotReached.selector);
        hub.triggerResolution(id);
    }

    function test_triggerResolution_voidsIfOneSideEmpty() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);
        ToldyaHub.Market memory m = hub.getMarket(id);
        assertEq(uint256(m.status), uint256(ToldyaHub.Status.Voided));
    }

    function test_triggerResolution_emitsRequestWhenBothSidesStaked() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);

        hub.triggerResolution(id);
        ToldyaHub.Market memory m = hub.getMarket(id);
        assertEq(uint256(m.status), uint256(ToldyaHub.Status.ResolutionRequested));
    }

    function test_resolveMarket_onlyOracle() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);

        vm.expectRevert(ToldyaHub.NotOracle.selector);
        hub.resolveMarket(id, true);
    }

    function test_resolveMarket_yesWins_setsStatus() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);

        vm.prank(oracle);
        hub.resolveMarket(id, true);
        ToldyaHub.Market memory m = hub.getMarket(id);
        assertEq(uint256(m.status), uint256(ToldyaHub.Status.ResolvedYes));
    }

    // -----------------------------------------------------------------
    // Claims
    // -----------------------------------------------------------------

    function test_claim_yesWinner_takesFullPot() public {
        // Rob NO 100, Tom YES 50. YES wins. Tom gets entire pot.
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);
        vm.prank(oracle);
        hub.resolveMarket(id, true);

        uint256 before = token.balanceOf(tom);
        vm.prank(tom);
        hub.claim(id);
        uint256 gained = token.balanceOf(tom) - before;

        // pot = 99 (no, net) + 49.5 (yes, net) = 148.5
        assertEq(gained, 148.5 ether);
    }

    function test_claim_proRataAmongWinners() public {
        // Rob NO 100. Tom YES 50, Sam YES 50. YES wins -> split equally.
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.prank(sam);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);
        vm.prank(oracle);
        hub.resolveMarket(id, true);

        // pot = 99 + 49.5 + 49.5 = 198. Each YES staker = 99.
        uint256 tBefore = token.balanceOf(tom);
        uint256 sBefore = token.balanceOf(sam);
        vm.prank(tom);
        hub.claim(id);
        vm.prank(sam);
        hub.claim(id);
        assertEq(token.balanceOf(tom) - tBefore, 99 ether);
        assertEq(token.balanceOf(sam) - sBefore, 99 ether);
    }

    function test_claim_loserGetsNothing() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);
        vm.prank(oracle);
        hub.resolveMarket(id, true); // YES wins, Rob loses

        vm.expectRevert(ToldyaHub.NothingToClaim.selector);
        vm.prank(rob);
        hub.claim(id);
    }

    function test_claim_doubleClaimReverts() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);
        vm.prank(oracle);
        hub.resolveMarket(id, true);

        vm.startPrank(tom);
        hub.claim(id);
        vm.expectRevert(ToldyaHub.AlreadyClaimed.selector);
        hub.claim(id);
        vm.stopPrank();
    }

    function test_claim_voidedMarketRefundsNetStake() public {
        // Rob creates NO market, no opposing stake -> voided, Rob refunded.
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);

        uint256 before = token.balanceOf(rob);
        vm.prank(rob);
        hub.claim(id);
        // Rob already paid 1 ether fee on creation, refund is net stake = 99
        assertEq(token.balanceOf(rob) - before, 99 ether);
        // Treasury keeps the fee
        assertEq(token.balanceOf(treasury), 1 ether);
    }

    function test_previewClaim_matchesActualPayout() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);
        vm.prank(oracle);
        hub.resolveMarket(id, true);

        uint256 preview = hub.previewClaim(id, tom);
        uint256 before = token.balanceOf(tom);
        vm.prank(tom);
        hub.claim(id);
        assertEq(token.balanceOf(tom) - before, preview);
    }

    // -----------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------

    // -----------------------------------------------------------------
    // Evidence
    // -----------------------------------------------------------------

    function test_submitEvidence_emitsEvent() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.expectEmit(true, true, false, true);
        emit ToldyaHub.EvidenceSubmitted(
            id, tom, "QmTomBeerVideo123", ToldyaHub.MediaType.Video, "Tom failed at 0:28"
        );
        vm.prank(tom);
        hub.submitEvidence(id, "QmTomBeerVideo123", ToldyaHub.MediaType.Video, "Tom failed at 0:28");
    }

    function test_submitEvidence_allowedDuringResolution() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);
        // Still allowed in ResolutionRequested phase — agents may need to see late evidence.
        vm.prank(sam);
        hub.submitEvidence(id, "QmEvidence", ToldyaHub.MediaType.Image, "");
    }

    function test_submitEvidence_revertsWhenSettled() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);
        vm.prank(oracle);
        hub.resolveMarket(id, true);

        vm.expectRevert(ToldyaHub.EvidenceLocked.selector);
        vm.prank(tom);
        hub.submitEvidence(id, "QmLate", ToldyaHub.MediaType.Image, "");
    }

    function test_submitEvidence_revertsOnEmptyCid() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.expectRevert(ToldyaHub.EmptyEvidence.selector);
        vm.prank(tom);
        hub.submitEvidence(id, "", ToldyaHub.MediaType.Image, "");
    }

    function test_setOracle_onlyOwner() public {
        vm.prank(rob);
        vm.expectRevert();
        hub.setOracle(address(0xBEEF));

        hub.setOracle(address(0xBEEF));
        assertEq(hub.oracle(), address(0xBEEF));
    }
}
