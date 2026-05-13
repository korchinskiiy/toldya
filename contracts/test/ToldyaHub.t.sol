// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ToldyaHub} from "../src/ToldyaHub.sol";
import {IOracle} from "../src/interfaces/IOracle.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockOracle} from "./mocks/MockOracle.sol";

contract ToldyaHubTest is Test {
    ToldyaHub hub;
    MockToken token;
    MockOracle oracle;

    address treasury = makeAddr("treasury");
    address rob = makeAddr("rob");
    address tom = makeAddr("tom");
    address sam = makeAddr("sam");

    uint256 constant START = 1_000_000;
    uint256 constant DEADLINE_OFFSET = 1 days;
    string constant ORACLE_QUERY_CID = "bafy-toldya-question";

    function setUp() public {
        token = new MockToken();
        oracle = new MockOracle();
        hub = new ToldyaHub(token, address(oracle), treasury);

        vm.warp(START);

        address[3] memory users = [rob, tom, sam];
        for (uint256 i = 0; i < users.length; i++) {
            token.mint(users[i], 1_000 ether);
            vm.prank(users[i]);
            token.approve(address(hub), type(uint256).max);
        }
    }

    function _create(address creator, ToldyaHub.Side side, uint256 amount) internal returns (uint256) {
        return _create(creator, side, amount, true);
    }

    function _create(address creator, ToldyaHub.Side side, uint256 amount, bool oracleEnabled)
        internal
        returns (uint256)
    {
        vm.prank(creator);
        return hub.createMarket(
            "Will Tom finish a beer in 30s?",
            "Tom drinks a 0.5L beer; timer starts at first sip; YES if empty within 30s.",
            uint64(block.timestamp + DEADLINE_OFFSET),
            side,
            amount,
            oracleEnabled,
            oracleEnabled ? ORACLE_QUERY_CID : ""
        );
    }

    function _resolveFromOracle(uint256 marketId, IOracle.Outcome outcome) internal {
        uint256 requestId = hub.oracleRequestId(marketId);
        oracle.setResult(requestId, outcome, IOracle.Status.Settled);
        hub.resolveMarket(marketId);
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
        hub.createMarket(
            "q", "c", uint64(block.timestamp), ToldyaHub.Side.Yes, 10 ether, true, ORACLE_QUERY_CID
        );
    }

    function test_createMarket_revertsOnEmptyQuestion() public {
        vm.expectRevert(ToldyaHub.EmptyQuestion.selector);
        vm.prank(rob);
        hub.createMarket(
            "", "c", uint64(block.timestamp + 1 days), ToldyaHub.Side.Yes, 10 ether, true, ORACLE_QUERY_CID
        );
    }

    function test_createMarket_revertsBelowMinStake() public {
        vm.expectRevert(ToldyaHub.StakeTooSmall.selector);
        vm.prank(rob);
        hub.createMarket(
            "q", "c", uint64(block.timestamp + 1 days), ToldyaHub.Side.Yes, 1, true, ORACLE_QUERY_CID
        );
    }

    function test_createMarket_requiresOracleCidWhenEnabled() public {
        vm.expectRevert(ToldyaHub.MissingOracleQuery.selector);
        vm.prank(rob);
        hub.createMarket("q", "c", uint64(block.timestamp + 1 days), ToldyaHub.Side.Yes, 10 ether, true, "");
    }

    function test_createMarket_allowsEmptyOracleCidWhenDisabled() public {
        vm.prank(rob);
        uint256 id = hub.createMarket(
            "q", "c", uint64(block.timestamp + 1 days), ToldyaHub.Side.Yes, 10 ether, false, ""
        );

        assertEq(hub.oracleQueryCid(id), "");
    }

    function test_triggerResolution_revertsIfOracleDisabled() public {
        // Market created with oracleEnabled = false
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether, false);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        vm.expectRevert(ToldyaHub.OracleDisabled.selector);
        hub.triggerResolution(id);
    }

    function test_triggerResolution_voidsEmptySideEvenIfOracleDisabled() public {
        // Empty-side void should still work even when oracle is disabled —
        // it doesn't actually need the oracle.
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether, false);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.Voided));
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

    function test_triggerResolution_createsVetoRequest() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);

        vm.expectEmit(true, false, false, true);
        emit ToldyaHub.ResolutionRequested(
            id,
            "Will Tom finish a beer in 30s?",
            "Tom drinks a 0.5L beer; timer starts at first sip; YES if empty within 30s."
        );
        vm.expectEmit(true, true, false, true);
        emit ToldyaHub.OracleRequestCreated(id, 0, ORACLE_QUERY_CID);
        hub.triggerResolution(id);

        ToldyaHub.Market memory m = hub.getMarket(id);
        assertEq(uint256(m.status), uint256(ToldyaHub.Status.ResolutionRequested));
        assertTrue(hub.oracleRequestCreated(id));
        assertEq(hub.oracleRequestId(id), 0);
        assertEq(oracle.queryCidOf(0), ORACLE_QUERY_CID);
    }

    function test_triggerResolution_cannotRunTwice() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);

        vm.expectRevert(ToldyaHub.AlreadyRequested.selector);
        hub.triggerResolution(id);
    }

    function test_resolveMarket_revertsWhileOraclePending() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);

        vm.expectRevert(ToldyaHub.OraclePending.selector);
        hub.resolveMarket(id);
    }

    function test_resolveMarket_yesFromVeto() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);

        _resolveFromOracle(id, IOracle.Outcome.YES);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolvedYes));
    }

    function test_resolveMarket_noFromVeto() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);

        _resolveFromOracle(id, IOracle.Outcome.NO);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolvedNo));
    }

    function test_resolveMarket_usesTriggeredOracleAfterRotation() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);

        MockOracle originalOracle = oracle;
        MockOracle secondOracle = new MockOracle();
        hub.setOracle(address(secondOracle));

        uint256 requestId = hub.oracleRequestId(id);
        originalOracle.setResult(requestId, IOracle.Outcome.YES, IOracle.Status.Settled);
        secondOracle.setResult(0, IOracle.Outcome.NO, IOracle.Status.Settled);

        hub.resolveMarket(id);

        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolvedYes));
        assertEq(address(hub.oracleRequestOracle(id)), address(originalOracle));
    }

    function test_resolveMarket_abstainLeavesResolutionRequested() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);

        uint256 requestId = hub.oracleRequestId(id);
        oracle.setResult(requestId, IOracle.Outcome.ABSTAIN, IOracle.Status.Settled);
        vm.expectRevert(ToldyaHub.OracleAbstained.selector);
        hub.resolveMarket(id);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolutionRequested));
    }

    function test_voidStalemate_afterVetoAbstain() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);

        uint256 requestId = hub.oracleRequestId(id);
        oracle.setResult(requestId, IOracle.Outcome.ABSTAIN, IOracle.Status.Settled);
        vm.expectRevert(ToldyaHub.OracleAbstained.selector);
        hub.resolveMarket(id);

        vm.warp(block.timestamp + 14 days + 1);
        hub.voidStalemate(id);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.Voided));
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
        _resolveFromOracle(id, IOracle.Outcome.YES);

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
        _resolveFromOracle(id, IOracle.Outcome.YES);

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
        _resolveFromOracle(id, IOracle.Outcome.YES); // YES wins, Rob loses

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
        _resolveFromOracle(id, IOracle.Outcome.YES);

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
        _resolveFromOracle(id, IOracle.Outcome.YES);

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
    // Mutual resolution (vote)
    // -----------------------------------------------------------------

    function test_voteResolution_worksBeforeDeadline() public {
        // Early settlement: stakers can vote any time, deadline is irrelevant
        // as long as they all agree.
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);

        // No warp — well before deadline.
        vm.prank(rob);
        hub.voteResolution(id, true);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.Open));

        vm.prank(tom);
        hub.voteResolution(id, true);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolvedYes));
    }

    function test_voteResolution_revertsIfNotStaker() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        vm.expectRevert(ToldyaHub.NotAStaker.selector);
        vm.prank(sam); // sam never staked
        hub.voteResolution(id, true);
    }

    function test_voteResolution_unanimousResolvesYes() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);

        vm.prank(rob);
        hub.voteResolution(id, true);
        // After one vote, status still Open
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.Open));

        vm.prank(tom);
        hub.voteResolution(id, true);
        // Both agreed YES — resolved
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolvedYes));
    }

    function test_voteResolution_disagreementStaysOpen() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);

        vm.prank(rob);
        hub.voteResolution(id, true);
        vm.prank(tom);
        hub.voteResolution(id, false);

        // Disagreement → stays Open, oracle path remains
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.Open));
    }

    function test_voteResolution_voteOverrideWorks() public {
        // A staker can change their vote until consensus is reached
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);

        vm.prank(rob);
        hub.voteResolution(id, true);
        vm.prank(tom);
        hub.voteResolution(id, false);
        // Disagreement so far. Tom changes to YES.
        vm.prank(tom);
        hub.voteResolution(id, true);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolvedYes));
    }

    function test_voteResolution_oraclePathStillWorksAfterDisagreement() public {
        // If parties disagree, anyone can fall back to oracle.
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);

        vm.prank(rob);
        hub.voteResolution(id, true);
        vm.prank(tom);
        hub.voteResolution(id, false);

        hub.triggerResolution(id);
        _resolveFromOracle(id, IOracle.Outcome.YES);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolvedYes));
    }

    function test_getStakers_returnsUniqueAddresses() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.startPrank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 25 ether); // second stake, same address
        vm.stopPrank();
        vm.prank(sam);
        hub.stake(id, ToldyaHub.Side.Yes, 25 ether);

        address[] memory s = hub.getStakers(id);
        assertEq(s.length, 3, "rob + tom + sam");
    }

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
        _resolveFromOracle(id, IOracle.Outcome.YES);

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
        assertEq(address(hub.oracle()), address(0xBEEF));
    }

    // -----------------------------------------------------------------
    // H1 — O(1) vote counters
    // -----------------------------------------------------------------

    function test_voteCounters_trackYesAndNo() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);

        vm.prank(rob);
        hub.voteResolution(id, true);
        assertEq(hub.yesVotes(id), 1);
        assertEq(hub.noVotes(id), 0);

        vm.prank(tom);
        hub.voteResolution(id, false);
        assertEq(hub.yesVotes(id), 1);
        assertEq(hub.noVotes(id), 1);

        // Tom flips to YES → counters update, market resolves YES.
        vm.prank(tom);
        hub.voteResolution(id, true);
        assertEq(hub.yesVotes(id), 2);
        assertEq(hub.noVotes(id), 0);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolvedYes));
    }

    function test_voteCounters_repeatedSameVote_noOp() public {
        // Voting the same direction twice should not double-count. Two stakers
        // so the market doesn't resolve from a single staker's first vote.
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);

        vm.prank(rob);
        hub.voteResolution(id, true);
        assertEq(hub.yesVotes(id), 1);

        vm.prank(rob);
        hub.voteResolution(id, true);
        assertEq(hub.yesVotes(id), 1, "repeated vote should not double count");
    }

    function test_voteCounters_scaleToManyStakers() public {
        // Regression for the unbounded loop DoS: with 50 stakers the vote call
        // used to iterate every staker. Now it should stay O(1).
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);

        address[] memory crowd = new address[](50);
        for (uint256 i = 0; i < crowd.length; i++) {
            crowd[i] = makeAddr(string.concat("crowd-", vm.toString(i)));
            token.mint(crowd[i], 10 ether);
            vm.prank(crowd[i]);
            token.approve(address(hub), type(uint256).max);
            vm.prank(crowd[i]);
            hub.stake(id, ToldyaHub.Side.Yes, 1 ether);
        }

        // All 51 stakers vote YES — should resolve.
        vm.prank(rob);
        hub.voteResolution(id, true);
        for (uint256 i = 0; i < crowd.length; i++) {
            vm.prank(crowd[i]);
            hub.voteResolution(id, true);
        }
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolvedYes));
        assertEq(hub.yesVotes(id), 51);
    }

    // -----------------------------------------------------------------
    // H2+H4 — voidStalemate timeout
    // -----------------------------------------------------------------

    function test_voidStalemate_resolvesAfterTimeout() public {
        // Stakers disagree, oracle disabled, deadline passes — without the
        // escape hatch this market would lock funds forever.
        uint256 id = _create(
            rob,
            ToldyaHub.Side.No,
            100 ether,
            false /* oracleEnabled */
        );
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);

        vm.prank(rob);
        hub.voteResolution(id, true);
        vm.prank(tom);
        hub.voteResolution(id, false);
        // Stuck — disagreement, no oracle path.

        vm.warp(block.timestamp + DEADLINE_OFFSET + 14 days + 1);
        // Anyone can call.
        vm.prank(sam);
        hub.voidStalemate(id);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.Voided));

        // Both stakers can recover their net stakes.
        uint256 robBefore = token.balanceOf(rob);
        vm.prank(rob);
        hub.claim(id);
        assertEq(token.balanceOf(rob) - robBefore, 99 ether);

        uint256 tomBefore = token.balanceOf(tom);
        vm.prank(tom);
        hub.claim(id);
        assertEq(token.balanceOf(tom) - tomBefore, 49.5 ether);
    }

    function test_voidStalemate_unsticksUnresponsiveOracle() public {
        // Oracle was triggered but never resolved — same escape hatch applies.
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);

        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolutionRequested));

        // Oracle vanishes for 14 days.
        vm.warp(block.timestamp + 14 days + 1);
        hub.voidStalemate(id);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.Voided));
    }

    function test_voidStalemate_revertsBeforeTimeout() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        vm.expectRevert(ToldyaHub.StalemateNotReached.selector);
        hub.voidStalemate(id);
    }

    function test_voidStalemate_revertsOnResolvedMarket() public {
        // Already-resolved markets can't be retroactively voided.
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(rob);
        hub.voteResolution(id, true);
        // Market is now ResolvedYes.
        vm.warp(block.timestamp + DEADLINE_OFFSET + 14 days + 1);
        vm.expectRevert(ToldyaHub.MarketNotStuck.selector);
        hub.voidStalemate(id);
    }

    // -----------------------------------------------------------------
    // H5 — pause / unpause
    // -----------------------------------------------------------------

    function test_pause_blocksCreateAndStake() public {
        hub.pause();
        vm.prank(rob);
        vm.expectRevert();
        hub.createMarket(
            "q", "c", uint64(block.timestamp + 1 days), ToldyaHub.Side.Yes, 10 ether, true, ORACLE_QUERY_CID
        );
    }

    function test_pause_blocksAdditionalStakes() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        hub.pause();
        vm.prank(tom);
        vm.expectRevert();
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
    }

    function test_pause_allowsClaimsAndVoting() public {
        // Critically: pause must never trap funds. Resolution + claim work even
        // while the contract is paused.
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);

        hub.pause();

        vm.prank(rob);
        hub.voteResolution(id, true);
        vm.prank(tom);
        hub.voteResolution(id, true);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolvedYes));

        uint256 tomBefore = token.balanceOf(tom);
        vm.prank(tom);
        hub.claim(id);
        assertGt(token.balanceOf(tom), tomBefore, "claim must work while paused");
    }

    function test_pause_onlyOwner() public {
        vm.prank(rob);
        vm.expectRevert();
        hub.pause();
    }

    function test_unpause_restoresStaking() public {
        hub.pause();
        hub.unpause();
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.Open));
    }
}
