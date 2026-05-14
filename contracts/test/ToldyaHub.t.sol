// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ToldyaHub} from "../src/ToldyaHub.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {IOracle} from "../src/interfaces/IOracle.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {Initializable} from "@openzeppelin-contracts-upgradeable/proxy/utils/Initializable.sol";

contract ToldyaHubTest is Test {
    ToldyaHub hub;
    MockToken token;

    MockOracle mockOracle;
    address treasury = makeAddr("treasury");
    address rob = makeAddr("rob");
    address tom = makeAddr("tom");
    address sam = makeAddr("sam");

    uint256 constant START = 1_000_000;
    uint256 constant DEADLINE_OFFSET = 1 days;

    function setUp() public {
        token = new MockToken();
        mockOracle = new MockOracle();
        hub = _deployHub(token, address(mockOracle), treasury, address(this));

        vm.warp(START);

        address[3] memory users = [rob, tom, sam];
        for (uint256 i = 0; i < users.length; i++) {
            token.mint(users[i], 1_000 ether);
            vm.prank(users[i]);
            token.approve(address(hub), type(uint256).max);
        }
    }

    function _deployHub(
        MockToken token_,
        address oracle_,
        address treasury_,
        address owner_
    ) internal returns (ToldyaHub) {
        address proxy = Upgrades.deployUUPSProxy(
            "ToldyaHub.sol",
            abi.encodeCall(
                ToldyaHub.initialize,
                (IERC20(address(token_)), oracle_, treasury_, owner_)
            )
        );
        return ToldyaHub(proxy);
    }

    function _create(address creator, ToldyaHub.Side side, uint256 amount) internal returns (uint256) {
        return _create(creator, side, amount, true);
    }

    function _create(address creator, ToldyaHub.Side side, uint256 amount, bool oracleEnabled)
        internal
        returns (uint256)
    {
        return _create(creator, side, amount, oracleEnabled, ToldyaHub.WagerMode.Pool, 0, new address[](0));
    }

    function _create(
        address creator,
        ToldyaHub.Side side,
        uint256 amount,
        bool oracleEnabled,
        ToldyaHub.WagerMode mode,
        uint8 minStakers,
        address[] memory allowed
    ) internal returns (uint256) {
        vm.prank(creator);
        return hub.createMarket(
            "bafybeigdyrTESTcid",
            uint64(block.timestamp + DEADLINE_OFFSET),
            side,
            amount,
            oracleEnabled,
            mode,
            minStakers,
            allowed
        );
    }

    function _resolveYes(uint256 marketId) internal {
        ToldyaHub.Market memory m = hub.getMarket(marketId);
        mockOracle.setOutcome(m.oracleRequestId, IOracle.Outcome.YES, IOracle.Status.Settled);
        hub.resolveMarket(marketId);
    }

    function _resolveNo(uint256 marketId) internal {
        ToldyaHub.Market memory m = hub.getMarket(marketId);
        mockOracle.setOutcome(m.oracleRequestId, IOracle.Outcome.NO, IOracle.Status.Settled);
        hub.resolveMarket(marketId);
    }

    function _triggered(address creator) internal returns (uint256 marketId, uint256 reqId) {
        marketId = _create(creator, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(marketId, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(marketId);
        reqId = hub.getMarket(marketId).oracleRequestId;
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
            "bafybeigdyrTESTcid", uint64(block.timestamp), ToldyaHub.Side.Yes, 10 ether, true,
            ToldyaHub.WagerMode.Pool, 0, new address[](0)
        );
    }

    function test_createMarket_revertsOnEmptyQueryCid() public {
        vm.expectRevert(ToldyaHub.EmptyQueryCid.selector);
        vm.prank(rob);
        hub.createMarket(
            "", uint64(block.timestamp + 1 days), ToldyaHub.Side.Yes, 10 ether, true,
            ToldyaHub.WagerMode.Pool, 0, new address[](0)
        );
    }

    function test_createMarket_revertsBelowMinStake() public {
        vm.expectRevert(ToldyaHub.StakeTooSmall.selector);
        vm.prank(rob);
        hub.createMarket(
            "bafybeigdyrTESTcid", uint64(block.timestamp + 1 days), ToldyaHub.Side.Yes, 1, true,
            ToldyaHub.WagerMode.Pool, 0, new address[](0)
        );
    }

    function test_createMarket_storesQueryCid() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        ToldyaHub.Market memory m = hub.getMarket(id);
        assertEq(m.queryCid, "bafybeigdyrTESTcid");
    }

    function test_createMarket_emitsQueryCid() public {
        vm.prank(rob);
        vm.expectEmit(true, true, false, true, address(hub));
        emit ToldyaHub.MarketCreated(
            0,
            rob,
            ToldyaHub.Side.No,
            uint64(block.timestamp + DEADLINE_OFFSET),
            99 ether,
            "bafybeigdyrTESTcid"
        );
        hub.createMarket(
            "bafybeigdyrTESTcid",
            uint64(block.timestamp + DEADLINE_OFFSET),
            ToldyaHub.Side.No,
            100 ether,
            true,
            ToldyaHub.WagerMode.Pool,
            0,
            new address[](0)
        );
    }

    function test_createMarket_emptyQueryCidWithOracleDisabled_alsoReverts() public {
        vm.expectRevert(ToldyaHub.EmptyQueryCid.selector);
        vm.prank(rob);
        hub.createMarket(
            "", uint64(block.timestamp + 1 days), ToldyaHub.Side.Yes, 10 ether, false,
            ToldyaHub.WagerMode.Pool, 0, new address[](0)
        );
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

    function test_triggerResolution_emitsRequestWhenBothSidesStaked() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);

        hub.triggerResolution(id);
        ToldyaHub.Market memory m = hub.getMarket(id);
        assertEq(uint256(m.status), uint256(ToldyaHub.Status.ResolutionRequested));
    }

    function test_triggerResolution_callsOracleCreateRequest() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);

        uint256 before = mockOracle.createRequestCallCount();
        hub.triggerResolution(id);
        assertEq(mockOracle.createRequestCallCount(), before + 1);
        assertEq(mockOracle.capturedQueryCids(before), "bafybeigdyrTESTcid");
    }

    function test_triggerResolution_storesOracleRequestId() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);

        uint256 expectedReqId = mockOracle.nextId();
        hub.triggerResolution(id);
        assertEq(hub.getMarket(id).oracleRequestId, expectedReqId);
    }

    function test_triggerResolution_emptyPoolShortCircuit_skipsVetoCall() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        // No counter-stake. Empty YES pool triggers void short-circuit.
        vm.warp(block.timestamp + DEADLINE_OFFSET);

        uint256 before = mockOracle.createRequestCallCount();
        hub.triggerResolution(id);
        assertEq(mockOracle.createRequestCallCount(), before, "void path must not call oracle");
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.Voided));
    }

    function test_triggerResolution_minStakersShortCircuit_skipsVetoCall() public {
        address[] memory allowed = new address[](0);
        vm.prank(rob);
        uint256 id = hub.createMarket(
            "bafybeigdyrTESTcid",
            uint64(block.timestamp + DEADLINE_OFFSET),
            ToldyaHub.Side.No,
            100 ether,
            true,
            ToldyaHub.WagerMode.Pool,
            5,  // minStakers = 5, only 2 will stake
            allowed
        );
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);

        uint256 before = mockOracle.createRequestCallCount();
        hub.triggerResolution(id);
        assertEq(mockOracle.createRequestCallCount(), before, "minStakers void must not call oracle");
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.Voided));
    }

    function test_triggerResolution_idempotent() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);

        hub.triggerResolution(id);
        vm.expectRevert(ToldyaHub.AlreadyRequested.selector);
        hub.triggerResolution(id);
    }

    function test_resolveMarket_yesWins_setsStatus() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);

        _resolveYes(id);

        ToldyaHub.Market memory m = hub.getMarket(id);
        assertEq(uint256(m.status), uint256(ToldyaHub.Status.ResolvedYes));
    }

    function test_resolveMarket_revertsIfVetoOpen() public {
        (uint256 id,) = _triggered(rob);
        // mockOracle returns (Unset, Open) by default for unstubbed ids
        vm.expectRevert(ToldyaHub.OraclePending.selector);
        hub.resolveMarket(id);
    }

    function test_resolveMarket_revertsIfVetoAnswered() public {
        (uint256 id, uint256 reqId) = _triggered(rob);
        mockOracle.setOutcome(reqId, IOracle.Outcome.Unset, IOracle.Status.Answered);
        vm.expectRevert(ToldyaHub.OraclePending.selector);
        hub.resolveMarket(id);
    }

    function test_resolveMarket_resolvesYes() public {
        (uint256 id, uint256 reqId) = _triggered(rob);
        mockOracle.setOutcome(reqId, IOracle.Outcome.YES, IOracle.Status.Settled);
        hub.resolveMarket(id);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolvedYes));
    }

    function test_resolveMarket_resolvesNo() public {
        (uint256 id, uint256 reqId) = _triggered(rob);
        mockOracle.setOutcome(reqId, IOracle.Outcome.NO, IOracle.Status.Settled);
        hub.resolveMarket(id);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolvedNo));
    }

    function test_resolveMarket_abstainRevertsAndParks() public {
        (uint256 id, uint256 reqId) = _triggered(rob);
        mockOracle.setOutcome(reqId, IOracle.Outcome.ABSTAIN, IOracle.Status.Settled);
        vm.expectRevert(ToldyaHub.OracleAbstained.selector);
        hub.resolveMarket(id);
        // market stays in ResolutionRequested for voidStalemate to clean up
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolutionRequested));
    }

    function test_resolveMarket_unsetSettledReverts() public {
        (uint256 id, uint256 reqId) = _triggered(rob);
        mockOracle.setOutcome(reqId, IOracle.Outcome.Unset, IOracle.Status.Settled);
        vm.expectRevert(ToldyaHub.InvalidOracleOutcome.selector);
        hub.resolveMarket(id);
    }

    function test_resolveMarket_permissionless() public {
        (uint256 id, uint256 reqId) = _triggered(rob);
        mockOracle.setOutcome(reqId, IOracle.Outcome.YES, IOracle.Status.Settled);
        // A random address (not creator, staker, owner, or oracle) can call.
        address randomCaller = makeAddr("nobody");
        vm.prank(randomCaller);
        hub.resolveMarket(id);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolvedYes));
    }

    function test_resolveMarket_revertsNotResolvedOnOpenMarket() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        // No triggerResolution. Stub Veto request 0 as YES Settled — Hub must
        // not read it because m.status is still Open.
        mockOracle.setOutcome(0, IOracle.Outcome.YES, IOracle.Status.Settled);

        vm.expectRevert(ToldyaHub.NotResolved.selector);
        hub.resolveMarket(id);
    }

    function test_resolveMarket_revertsNotResolvedOnAlreadyResolved() public {
        (uint256 id, uint256 reqId) = _triggered(rob);
        mockOracle.setOutcome(reqId, IOracle.Outcome.YES, IOracle.Status.Settled);
        hub.resolveMarket(id);

        vm.expectRevert(ToldyaHub.NotResolved.selector);
        hub.resolveMarket(id);
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
        _resolveYes(id);

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
        _resolveYes(id);

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
        _resolveYes(id); // YES wins, Rob loses

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
        _resolveYes(id);

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
        _resolveYes(id);

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
        _resolveYes(id);
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
        _resolveYes(id);

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

    function test_setOracle_takesEffectOnNextCreateRequest() public {
        MockOracle newMock = new MockOracle();
        hub.setOracle(address(newMock));

        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);

        uint256 originalCalls = mockOracle.createRequestCallCount();
        hub.triggerResolution(id);

        // The original mock must not have been called.
        assertEq(mockOracle.createRequestCallCount(), originalCalls);
        // The new mock receives the call.
        assertEq(newMock.createRequestCallCount(), 1);
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
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether, false /* oracleEnabled */);
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

    function test_voidStalemate_voidsAbstainedMarketAfterTimeout() public {
        (uint256 id, uint256 reqId) = _triggered(rob);
        mockOracle.setOutcome(reqId, IOracle.Outcome.ABSTAIN, IOracle.Status.Settled);
        vm.expectRevert(ToldyaHub.OracleAbstained.selector);
        hub.resolveMarket(id);

        // Fast-forward past deadline + RESOLUTION_TIMEOUT (14 days)
        vm.warp(block.timestamp + 14 days);
        hub.voidStalemate(id);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.Voided));
    }

    function test_voidStalemate_voidsOracleSilentMarketAfterTimeout() public {
        (uint256 id,) = _triggered(rob);
        // mockOracle never gets setOutcome — Veto stays "silent" (Open).
        // Hub stays in ResolutionRequested.
        vm.warp(block.timestamp + 14 days);
        hub.voidStalemate(id);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.Voided));
    }

    // -----------------------------------------------------------------
    // H5 — pause / unpause
    // -----------------------------------------------------------------

    function test_pause_blocksCreateAndStake() public {
        hub.pause();
        vm.prank(rob);
        vm.expectRevert();
        hub.createMarket(
            "bafybeigdyrTESTcid", uint64(block.timestamp + 1 days), ToldyaHub.Side.Yes, 10 ether, true,
            ToldyaHub.WagerMode.Pool, 0, new address[](0)
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

    // -----------------------------------------------------------------
    // Pair mode
    // -----------------------------------------------------------------

    function _createPair(address creator, ToldyaHub.Side side, uint256 amount) internal returns (uint256) {
        return _create(creator, side, amount, false, ToldyaHub.WagerMode.Pair, 0, new address[](0));
    }

    function test_pair_matchesEqualAmount() public {
        uint256 id = _createPair(rob, ToldyaHub.Side.No, 100 ether);
        // After creation, only NO side has rob's net stake (99 ether).
        assertEq(hub.getMarket(id).noPool, 99 ether);
        assertEq(hub.getMarket(id).matched, false);

        // Tom matches with exactly 100 ether on YES (same gross → same net).
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 100 ether);
        assertEq(hub.getMarket(id).yesPool, 99 ether);
        assertEq(hub.getMarket(id).matched, true);
    }

    function test_pair_rejectsUnequalAmount() public {
        uint256 id = _createPair(rob, ToldyaHub.Side.No, 100 ether);
        vm.expectRevert(ToldyaHub.PairAmountMustMatch.selector);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
    }

    function test_pair_rejectsSameSide() public {
        uint256 id = _createPair(rob, ToldyaHub.Side.No, 100 ether);
        // Tom can't pile onto NO — pair only takes the opposite side.
        vm.expectRevert(ToldyaHub.PairMustOpposeCreator.selector);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.No, 100 ether);
    }

    function test_pair_locksAfterMatch() public {
        uint256 id = _createPair(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 100 ether);

        // A third staker can't join, even on a side that already has volume.
        vm.expectRevert(ToldyaHub.AlreadyMatched.selector);
        vm.prank(sam);
        hub.stake(id, ToldyaHub.Side.Yes, 100 ether);
    }

    function test_pair_voidsIfUnmatchedByDeadline() public {
        uint256 id = _createPair(rob, ToldyaHub.Side.No, 100 ether);
        vm.warp(block.timestamp + DEADLINE_OFFSET);
        // One-side-only voids in triggerResolution.
        hub.triggerResolution(id);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.Voided));

        uint256 before = token.balanceOf(rob);
        vm.prank(rob);
        hub.claim(id);
        assertEq(token.balanceOf(rob) - before, 99 ether);
    }

    function test_pair_winnerTakesAll() public {
        uint256 id = _createPair(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 100 ether);

        // Both vote YES → resolve. Tom wins all 198 ether.
        vm.prank(rob);
        hub.voteResolution(id, true);
        vm.prank(tom);
        hub.voteResolution(id, true);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolvedYes));

        uint256 before = token.balanceOf(tom);
        vm.prank(tom);
        hub.claim(id);
        assertEq(token.balanceOf(tom) - before, 198 ether);
    }

    // -----------------------------------------------------------------
    // FriendsOnly access
    // -----------------------------------------------------------------

    function test_friendsOnly_blocksStrangers() public {
        address[] memory allowed = new address[](1);
        allowed[0] = tom;
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether, true, ToldyaHub.WagerMode.Pool, 0, allowed);

        // Sam isn't on the list — rejected.
        vm.expectRevert(ToldyaHub.NotAllowed.selector);
        vm.prank(sam);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
    }

    function test_friendsOnly_allowsAllowlisted() public {
        address[] memory allowed = new address[](1);
        allowed[0] = tom;
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether, true, ToldyaHub.WagerMode.Pool, 0, allowed);

        // Tom is on the list — passes.
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        assertEq(hub.getMarket(id).yesPool, 49.5 ether);
    }

    function test_friendsOnly_creatorImplicitlyAllowed() public {
        address[] memory allowed = new address[](1);
        allowed[0] = tom;
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether, true, ToldyaHub.WagerMode.Pool, 0, allowed);

        // Rob (creator) isn't in the list explicitly but can still stake more.
        vm.prank(rob);
        hub.stake(id, ToldyaHub.Side.No, 10 ether);
        assertEq(hub.getMarket(id).noPool, 99 ether + 9.9 ether);
    }

    function test_publicMarket_allowsAnyone() public {
        // Empty allowlist = public.
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether);
        vm.prank(sam);
        hub.stake(id, ToldyaHub.Side.Yes, 10 ether);
        assertEq(hub.getMarket(id).yesPool, 9.9 ether);
    }

    // -----------------------------------------------------------------
    // minStakers quorum
    // -----------------------------------------------------------------

    function test_minStakers_voidsIfNotReached() public {
        // Require at least 3 stakers. Only 2 stake.
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether, true, ToldyaHub.WagerMode.Pool, 3, new address[](0));
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        // Both sides populated, but only 2 unique stakers.

        vm.warp(block.timestamp + DEADLINE_OFFSET);
        hub.triggerResolution(id);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.Voided));

        // Both get their net stakes back.
        uint256 robBefore = token.balanceOf(rob);
        vm.prank(rob);
        hub.claim(id);
        assertEq(token.balanceOf(rob) - robBefore, 99 ether);
    }

    function test_minStakers_proceedsIfReached() public {
        uint256 id = _create(rob, ToldyaHub.Side.No, 100 ether, true, ToldyaHub.WagerMode.Pool, 3, new address[](0));
        vm.prank(tom);
        hub.stake(id, ToldyaHub.Side.Yes, 50 ether);
        vm.prank(sam);
        hub.stake(id, ToldyaHub.Side.Yes, 30 ether);

        vm.warp(block.timestamp + DEADLINE_OFFSET);
        // 3 stakers (rob, tom, sam) → quorum hit → goes to oracle as normal.
        hub.triggerResolution(id);
        assertEq(uint256(hub.getMarket(id).status), uint256(ToldyaHub.Status.ResolutionRequested));
    }

    // -----------------------------------------------------------------------
    // UUPS upgradeability
    // -----------------------------------------------------------------------

    function test_initialize_revertsIfCalledTwice() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        hub.initialize(token, address(mockOracle), treasury, address(this));
    }
}
