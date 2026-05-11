// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ToldyaHub
/// @notice Escrow-style P2P prediction markets. Anyone can open a YES/NO market
///         on any question. Stakers commit TAIKO into one of two pools; once the
///         deadline passes an AI oracle resolves the outcome and the winning pool
///         splits the entire pot pro-rata to net stake. If only one side has any
///         stake at resolution, the market is voided and stakers are refunded.
contract ToldyaHub is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum Side {
        Yes,
        No
    }

    enum Status {
        Open,
        ResolutionRequested,
        ResolvedYes,
        ResolvedNo,
        Voided
    }

    enum MediaType {
        Image,
        Video,
        Audio,
        Text
    }

    struct Market {
        address creator;
        uint64 deadline;
        Status status;
        bool oracleEnabled; // creator's choice at market creation
        string question;
        string criteria;
        uint256 yesPool; // sum of net (post-fee) YES stakes
        uint256 noPool; // sum of net (post-fee) NO stakes
    }

    /// @notice Fee charged on every stake, in basis points (100 = 1%).
    ///         Kept by the protocol regardless of outcome — covers oracle gas
    ///         and discourages spammy unmatched markets.
    uint256 public constant FEE_BPS = 100;
    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant MIN_STAKE = 1e15; // 0.001 token, prevents dust spam

    IERC20 public immutable stakeToken;
    address public oracle;
    address public treasury;

    uint256 public nextMarketId;
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => uint256)) public yesStake;
    mapping(uint256 => mapping(address => uint256)) public noStake;
    mapping(uint256 => mapping(address => bool)) public claimed;

    // Mutual-resolution state: track unique stakers per market and their votes.
    // 0 = no vote, 1 = YES, 2 = NO.
    mapping(uint256 => address[]) internal _stakers;
    mapping(uint256 => mapping(address => bool)) public hasStaked;
    mapping(uint256 => mapping(address => uint8)) public resolutionVote;

    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        Side creatorSide,
        uint64 deadline,
        uint256 netStake,
        string question,
        string criteria
    );
    event Staked(uint256 indexed marketId, address indexed staker, Side side, uint256 netStake);
    event ResolutionVoted(uint256 indexed marketId, address indexed party, bool yesWon);
    event ResolutionRequested(uint256 indexed marketId, string question, string criteria);
    event MarketResolved(uint256 indexed marketId, Status outcome);
    event Claimed(uint256 indexed marketId, address indexed staker, uint256 amount);
    event EvidenceSubmitted(
        uint256 indexed marketId,
        address indexed submitter,
        string cid,
        MediaType mediaType,
        string description
    );
    event OracleUpdated(address indexed oracle);
    event TreasuryUpdated(address indexed treasury);

    error InvalidDeadline();
    error MarketNotOpen();
    error DeadlineNotReached();
    error DeadlinePassed();
    error StakeTooSmall();
    error EmptyQuestion();
    error NotOracle();
    error NotResolved();
    error AlreadyClaimed();
    error NothingToClaim();
    error AlreadyRequested();
    error EvidenceLocked();
    error EmptyEvidence();
    error NotAStaker();
    error OracleDisabled();

    constructor(IERC20 _stakeToken, address _oracle, address _treasury) Ownable(msg.sender) {
        stakeToken = _stakeToken;
        oracle = _oracle;
        treasury = _treasury;
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
        emit OracleUpdated(_oracle);
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    // -------------------------------------------------------------------------
    // Market lifecycle
    // -------------------------------------------------------------------------

    /// @notice Open a new market. Creator commits the first stake on `side`.
    /// @param oracleEnabled If true, anyone can escalate to the AI oracle when
    ///        stakers can't agree. If false, the market can only be resolved by
    ///        unanimous staker vote.
    function createMarket(
        string calldata question,
        string calldata criteria,
        uint64 deadline,
        Side side,
        uint256 amount,
        bool oracleEnabled
    ) external nonReentrant returns (uint256 marketId) {
        if (bytes(question).length == 0) revert EmptyQuestion();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (amount < MIN_STAKE) revert StakeTooSmall();

        marketId = nextMarketId++;
        Market storage m = markets[marketId];
        m.creator = msg.sender;
        m.deadline = deadline;
        m.status = Status.Open;
        m.oracleEnabled = oracleEnabled;
        m.question = question;
        m.criteria = criteria;

        uint256 net = _pullAndFee(msg.sender, amount);
        if (side == Side.Yes) {
            m.yesPool = net;
            yesStake[marketId][msg.sender] = net;
        } else {
            m.noPool = net;
            noStake[marketId][msg.sender] = net;
        }
        _registerStaker(marketId, msg.sender);

        emit MarketCreated(marketId, msg.sender, side, deadline, net, question, criteria);
    }

    /// @notice Stake TAIKO on YES or NO for an open market.
    function stake(uint256 marketId, Side side, uint256 amount) external nonReentrant {
        Market storage m = markets[marketId];
        if (m.status != Status.Open) revert MarketNotOpen();
        if (block.timestamp >= m.deadline) revert DeadlinePassed();
        if (amount < MIN_STAKE) revert StakeTooSmall();

        uint256 net = _pullAndFee(msg.sender, amount);
        if (side == Side.Yes) {
            m.yesPool += net;
            yesStake[marketId][msg.sender] += net;
        } else {
            m.noPool += net;
            noStake[marketId][msg.sender] += net;
        }
        _registerStaker(marketId, msg.sender);

        emit Staked(marketId, msg.sender, side, net);
    }

    /// @notice Anyone can trigger oracle resolution after the deadline (if the
    ///         creator opted in to oracle fallback). Emits an event the off-chain
    ///         AI oracle agent listens for.
    function triggerResolution(uint256 marketId) external {
        Market storage m = markets[marketId];
        if (m.status != Status.Open) revert AlreadyRequested();
        if (block.timestamp < m.deadline) revert DeadlineNotReached();

        // If one side has zero stake, void immediately — no oracle needed.
        if (m.yesPool == 0 || m.noPool == 0) {
            m.status = Status.Voided;
            emit MarketResolved(marketId, Status.Voided);
            return;
        }

        if (!m.oracleEnabled) revert OracleDisabled();

        m.status = Status.ResolutionRequested;
        emit ResolutionRequested(marketId, m.question, m.criteria);
    }

    /// @notice Mutual resolution path: any staker can vote on the outcome at any
    ///         time — before or after the deadline. If every staker has voted and
    ///         they all agree, the market resolves immediately, no oracle needed.
    ///         The deadline only gates oracle escalation (triggerResolution), not
    ///         staker voting, so friend bets can settle the moment everyone knows
    ///         the answer.
    function voteResolution(uint256 marketId, bool yesWon) external {
        Market storage m = markets[marketId];
        if (m.status != Status.Open) revert MarketNotOpen();
        if (!hasStaked[marketId][msg.sender]) revert NotAStaker();

        resolutionVote[marketId][msg.sender] = yesWon ? 1 : 2;
        emit ResolutionVoted(marketId, msg.sender, yesWon);

        // Check if all stakers have voted unanimously.
        address[] storage s = _stakers[marketId];
        uint8 first = resolutionVote[marketId][s[0]];
        if (first == 0) return;
        for (uint256 i = 1; i < s.length; i++) {
            if (resolutionVote[marketId][s[i]] != first) return;
        }

        // Unanimous → resolve.
        m.status = first == 1 ? Status.ResolvedYes : Status.ResolvedNo;
        emit MarketResolved(marketId, m.status);
    }

    /// @notice Submit evidence (an IPFS-style CID pointing at an image/video/audio)
    ///         attached to a market. Anyone may submit while the market is open or
    ///         in the resolution-requested phase; the AI oracle filters relevance.
    ///         The CID and metadata are emitted as events; nothing is stored
    ///         on-chain to keep gas down.
    function submitEvidence(
        uint256 marketId,
        string calldata cid,
        MediaType mediaType,
        string calldata description
    ) external {
        Market storage m = markets[marketId];
        if (m.status != Status.Open && m.status != Status.ResolutionRequested) {
            revert EvidenceLocked();
        }
        if (bytes(cid).length == 0) revert EmptyEvidence();
        emit EvidenceSubmitted(marketId, msg.sender, cid, mediaType, description);
    }

    /// @notice Called by the oracle agent with the verdict.
    function resolveMarket(uint256 marketId, bool yesWon) external {
        if (msg.sender != oracle) revert NotOracle();
        Market storage m = markets[marketId];
        if (m.status != Status.ResolutionRequested) revert NotResolved();

        m.status = yesWon ? Status.ResolvedYes : Status.ResolvedNo;
        emit MarketResolved(marketId, m.status);
    }

    // -------------------------------------------------------------------------
    // Claims
    // -------------------------------------------------------------------------

    function claim(uint256 marketId) external nonReentrant {
        Market storage m = markets[marketId];
        if (claimed[marketId][msg.sender]) revert AlreadyClaimed();

        uint256 payout;
        if (m.status == Status.Voided) {
            // Refund net stake from whichever side(s) the user is on.
            payout = yesStake[marketId][msg.sender] + noStake[marketId][msg.sender];
        } else if (m.status == Status.ResolvedYes) {
            uint256 s = yesStake[marketId][msg.sender];
            if (s == 0) revert NothingToClaim();
            payout = (s * (m.yesPool + m.noPool)) / m.yesPool;
        } else if (m.status == Status.ResolvedNo) {
            uint256 s = noStake[marketId][msg.sender];
            if (s == 0) revert NothingToClaim();
            payout = (s * (m.yesPool + m.noPool)) / m.noPool;
        } else {
            revert NotResolved();
        }

        if (payout == 0) revert NothingToClaim();
        claimed[marketId][msg.sender] = true;
        stakeToken.safeTransfer(msg.sender, payout);
        emit Claimed(marketId, msg.sender, payout);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function previewClaim(uint256 marketId, address user) external view returns (uint256) {
        Market storage m = markets[marketId];
        if (claimed[marketId][user]) return 0;
        if (m.status == Status.Voided) {
            return yesStake[marketId][user] + noStake[marketId][user];
        }
        if (m.status == Status.ResolvedYes) {
            uint256 s = yesStake[marketId][user];
            if (s == 0 || m.yesPool == 0) return 0;
            return (s * (m.yesPool + m.noPool)) / m.yesPool;
        }
        if (m.status == Status.ResolvedNo) {
            uint256 s = noStake[marketId][user];
            if (s == 0 || m.noPool == 0) return 0;
            return (s * (m.yesPool + m.noPool)) / m.noPool;
        }
        return 0;
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    function getStakers(uint256 marketId) external view returns (address[] memory) {
        return _stakers[marketId];
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _registerStaker(uint256 marketId, address who) internal {
        if (!hasStaked[marketId][who]) {
            hasStaked[marketId][who] = true;
            _stakers[marketId].push(who);
        }
    }

    function _pullAndFee(address from, uint256 amount) internal returns (uint256 net) {
        uint256 fee = (amount * FEE_BPS) / BPS_DENOM;
        net = amount - fee;
        stakeToken.safeTransferFrom(from, address(this), amount);
        if (fee > 0) {
            stakeToken.safeTransfer(treasury, fee);
        }
    }
}
